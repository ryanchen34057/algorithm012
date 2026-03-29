package service

import (
	"math"
	"sort"

	"vcp-analyzer/internal/model"
)

// BreakoutScanParams holds configurable filters for the breakout scanner.
type BreakoutScanParams struct {
	MinPrice       float64             // 最低股價，default 10
	MaxPrice       float64             // 最高股價，default 500
	MinADV20Lots   float64             // 最低20日均量（張），default 300
	LookbackDays   int                 // 找前高的回看天數，default 120
	NearHighPct    float64             // 距前高幾%以內算「接近」，default 5
	PatternFilter  model.PatternType   // 型態篩選：w_bottom / v_bottom / none(不限)
	VolumeFilter   model.VolumeCondition // 量能：expand / shrink / any
	VolumeFactor   float64             // 量能倍數閾值，default 1.2
}

func DefaultBreakoutScanParams() BreakoutScanParams {
	return BreakoutScanParams{
		MinPrice:      10,
		MaxPrice:      500,
		MinADV20Lots:  300,
		LookbackDays:  120,
		NearHighPct:   5,
		PatternFilter: model.PatternNone,    // 不限型態
		VolumeFilter:  model.VolumeAny,      // 不限量能
		VolumeFactor:  1.2,
	}
}

type BreakoutScanner struct{}

func NewBreakoutScanner() *BreakoutScanner { return &BreakoutScanner{} }

func (s *BreakoutScanner) Analyze(chart *model.StockChartData, params BreakoutScanParams) *model.BreakoutAnalysis {
	candles := chart.Candles
	if len(candles) < 201 {
		return nil
	}

	n := len(candles)
	today := candles[n-1]

	// ── Basic filters ──
	price := chart.LatestPrice
	if price == 0 {
		price = today.Close
	}
	if price < params.MinPrice || price > params.MaxPrice {
		return nil
	}

	adv20 := avgVolumeN(candles, 20) / 1000.0
	if adv20 < params.MinADV20Lots {
		return nil
	}

	// ── MA values ──
	if len(chart.MA20) < n || len(chart.MA50) < n || len(chart.MA150) < n || len(chart.MA200) < n {
		return nil
	}
	ma20 := chart.MA20[n-1]
	ma50 := chart.MA50[n-1]
	ma150 := chart.MA150[n-1]
	ma200 := chart.MA200[n-1]
	if ma20 == 0 || ma50 == 0 || ma200 == 0 {
		return nil
	}

	// ── Trend: price above MA20, MA20 > MA200 (basic uptrend) ──
	if price < ma20 || ma20 < ma200 {
		return nil
	}

	// MA alignment: MA20 > MA50 > MA150 > MA200
	maAligned := ma20 > ma50 && ma50 > ma150 && ma150 > ma200

	// ── Find previous high within lookback ──
	lookback := params.LookbackDays
	if lookback > n-1 {
		lookback = n - 1
	}
	startIdx := n - 1 - lookback
	if startIdx < 0 {
		startIdx = 0
	}

	prevHigh := 0.0
	prevHighIdx := startIdx
	// Exclude last 5 days (we want the "previous" high, not today)
	endIdx := n - 6
	if endIdx <= startIdx {
		endIdx = n - 2
	}
	for i := startIdx; i <= endIdx; i++ {
		if candles[i].High > prevHigh {
			prevHigh = candles[i].High
			prevHighIdx = i
		}
	}
	if prevHigh == 0 {
		return nil
	}

	// ── Distance to previous high ──
	distPct := (prevHigh - price) / prevHigh * 100
	if distPct < 0 {
		// Already above previous high → already broken out, skip
		return nil
	}
	if distPct > params.NearHighPct {
		// Too far from previous high
		return nil
	}

	// ── Pattern detection ──
	pattern, patternLabel, low1, low1Date, low2, low2Date, neckline, vLow, vLowDate, dropPct, bouncePct :=
		detectPattern(candles, startIdx, n-1, prevHighIdx)

	// Apply pattern filter
	if params.PatternFilter == model.PatternW && pattern != model.PatternW {
		return nil
	}
	if params.PatternFilter == model.PatternV && pattern != model.PatternV {
		return nil
	}

	// ── Volume condition ──
	recent5Vol := avgVolumeN(candles[n-5:], 5) / 1000.0
	volRatio := 0.0
	if adv20 > 0 {
		volRatio = recent5Vol / adv20
	}

	if params.VolumeFilter == model.VolumeExpand && volRatio < params.VolumeFactor {
		return nil
	}
	if params.VolumeFilter == model.VolumeShrink && volRatio > (1.0/params.VolumeFactor) {
		return nil
	}

	// ── Trade plan ──
	entryPrice := price // 以目前收盤價作為進場參考
	var stopLoss float64
	switch pattern {
	case model.PatternW:
		stopLoss = low2 // W底第二低點
		if low2 == 0 {
			stopLoss = low1
		}
	case model.PatternV:
		stopLoss = vLow // V底最低點
	default:
		// No pattern: use recent swing low or MA50
		recentLow := price
		lookStart := n - 20
		if lookStart < 0 {
			lookStart = 0
		}
		for i := lookStart; i < n; i++ {
			if candles[i].Low < recentLow {
				recentLow = candles[i].Low
			}
		}
		stopLoss = recentLow
	}
	// Safety: stop loss can't be >= entry
	if stopLoss >= entryPrice {
		stopLoss = entryPrice * 0.95
	}

	risk := entryPrice - stopLoss
	if risk <= 0 {
		return nil
	}

	// Target: use technical levels (next resistance above prevHigh)
	target, targetLabel := findBreakoutTarget(candles, entryPrice, prevHigh, risk, ma20, ma200)
	rr := 0.0
	if risk > 0 {
		rr = (target - entryPrice) / risk
	}

	// ── Score ──
	score := calcBreakoutScore(distPct, maAligned, pattern, volRatio, rr)

	return &model.BreakoutAnalysis{
		Symbol:         chart.Symbol,
		Name:           chart.Name,
		CurrentPrice:   roundTo2(price),
		PrevHigh:       roundTo2(prevHigh),
		PrevHighDate:   candles[prevHighIdx].Date,
		DistPct:        roundTo2(distPct),
		Pattern:        pattern,
		PatternLabel:   patternLabel,
		Low1:           roundTo2(low1),
		Low1Date:       low1Date,
		Low2:           roundTo2(low2),
		Low2Date:       low2Date,
		Neckline:       roundTo2(neckline),
		VLow:           roundTo2(vLow),
		VLowDate:       vLowDate,
		DropPct:        roundTo2(dropPct),
		BouncePct:      roundTo2(bouncePct),
		MA20:           roundTo2(ma20),
		MA50:           roundTo2(ma50),
		MA150:          roundTo2(ma150),
		MA200:          roundTo2(ma200),
		MAAligned:      maAligned,
		ADV20:          roundTo2(adv20),
		RecentVolRatio: roundTo2(volRatio),
		TodayVolume:    today.Volume,
		EntryPrice:     roundTo2(entryPrice),
		StopLoss:       roundTo2(stopLoss),
		Target:         roundTo2(target),
		TargetLabel:    targetLabel,
		RewardRisk:     roundTo2(rr),
		Score:          score,
	}
}

// ── Pattern Detection ───────────────────────────────────────────────────────

func detectPattern(
	candles []model.OHLCV, startIdx, todayIdx, prevHighIdx int,
) (
	pattern model.PatternType, label string,
	low1 float64, low1Date string,
	low2 float64, low2Date string,
	neckline float64,
	vLow float64, vLowDate string,
	dropPct, bouncePct float64,
) {
	pattern = model.PatternNone
	label = "無明顯底部型態"

	price := candles[todayIdx].Close

	// Try W-bottom detection first
	if wOK, l1, l1d, l2, l2d, neck := detectWBottom(candles, startIdx, todayIdx, prevHighIdx); wOK {
		pattern = model.PatternW
		label = "W底（雙底）"
		low1, low1Date = l1, l1d
		low2, low2Date = l2, l2d
		neckline = neck
		return
	}

	// Try V-bottom
	if vOK, vl, vld, dp, bp := detectVBottom(candles, startIdx, todayIdx, price); vOK {
		pattern = model.PatternV
		label = "V型反轉"
		vLow, vLowDate = vl, vld
		dropPct, bouncePct = dp, bp
		return
	}

	return
}

func detectWBottom(
	candles []model.OHLCV, startIdx, todayIdx, prevHighIdx int,
) (ok bool, low1 float64, low1Date string, low2 float64, low2Date string, neckline float64) {
	// Find two significant lows after prevHighIdx (or in the lookback range)
	// with a rally between them forming the neckline

	searchStart := startIdx
	searchEnd := todayIdx

	// Find all swing lows (5-bar pivots)
	pivotN := 5
	type swingLow struct {
		price float64
		idx   int
	}
	var lows []swingLow

	for i := searchStart + pivotN; i < searchEnd-pivotN; i++ {
		isPivot := true
		for j := 1; j <= pivotN; j++ {
			if i-j < 0 || i+j >= len(candles) {
				isPivot = false
				break
			}
			if candles[i].Low >= candles[i-j].Low || candles[i].Low >= candles[i+j].Low {
				isPivot = false
				break
			}
		}
		if isPivot {
			lows = append(lows, swingLow{candles[i].Low, i})
		}
	}

	if len(lows) < 2 {
		return false, 0, "", 0, "", 0
	}

	// Try pairs of lows: find the best W-bottom
	// Two lows within 3% of each other, with a peak between them
	for i := 0; i < len(lows)-1; i++ {
		for j := i + 1; j < len(lows); j++ {
			l1 := lows[i]
			l2 := lows[j]

			// Lows must be separated by at least 10 bars
			if l2.idx-l1.idx < 10 {
				continue
			}

			// Lows within 5% of each other
			diff := math.Abs(l1.price-l2.price) / l1.price * 100
			if diff > 5 {
				continue
			}

			// Second low should not break below first low significantly (< 3%)
			if l2.price < l1.price*(1-0.03) {
				continue
			}

			// Find the peak (neckline) between them
			peak := 0.0
			for k := l1.idx + 1; k < l2.idx; k++ {
				if candles[k].High > peak {
					peak = candles[k].High
				}
			}

			// Neckline must be meaningfully higher than both lows (at least 3%)
			if peak < l1.price*1.03 || peak < l2.price*1.03 {
				continue
			}

			// Current price should be near or above the neckline (within 5% below or above)
			currentPrice := candles[todayIdx].Close
			if currentPrice < peak*0.95 {
				continue
			}

			return true, l1.price, candles[l1.idx].Date, l2.price, candles[l2.idx].Date, peak
		}
	}

	return false, 0, "", 0, "", 0
}

func detectVBottom(
	candles []model.OHLCV, startIdx, todayIdx int, currentPrice float64,
) (ok bool, vLow float64, vLowDate string, dropPct, bouncePct float64) {
	// Look for a sharp drop (>10%) followed by a sharp recovery (>80% of drop)
	// within the lookback window

	n := todayIdx + 1

	// Find the lowest point in the lookback
	lowestIdx := startIdx
	lowestPrice := candles[startIdx].Low
	for i := startIdx + 1; i < n; i++ {
		if candles[i].Low < lowestPrice {
			lowestPrice = candles[i].Low
			lowestIdx = i
		}
	}

	// Find the high before the drop
	preDropHigh := 0.0
	for i := startIdx; i < lowestIdx; i++ {
		if candles[i].High > preDropHigh {
			preDropHigh = candles[i].High
		}
	}
	if preDropHigh == 0 {
		return false, 0, "", 0, 0
	}

	// Drop must be > 10%
	drop := (preDropHigh - lowestPrice) / preDropHigh * 100
	if drop < 10 {
		return false, 0, "", 0, 0
	}

	// Recovery from low to current price
	bounce := (currentPrice - lowestPrice) / (preDropHigh - lowestPrice) * 100
	if bounce < 80 {
		return false, 0, "", 0, 0
	}

	// The V must be relatively recent (low within last 60 bars)
	if todayIdx-lowestIdx > 60 {
		return false, 0, "", 0, 0
	}

	return true, lowestPrice, candles[lowestIdx].Date, roundTo2(drop), roundTo2(bounce)
}

// ── Target for breakout ─────────────────────────────────────────────────────

func findBreakoutTarget(
	candles []model.OHLCV, entry, prevHigh, risk, ma20, ma200 float64,
) (target float64, label string) {
	n := len(candles)

	// After breaking prevHigh, find the next resistance above prevHigh
	type candidate struct {
		price float64
		label string
	}
	var candidates []candidate

	// Swing highs above prevHigh (further resistance)
	pivotN := 5
	for i := pivotN; i < n-1-pivotN; i++ {
		isPivot := true
		for j := 1; j <= pivotN; j++ {
			if candles[i].High <= candles[i-j].High || candles[i].High <= candles[i+j].High {
				isPivot = false
				break
			}
		}
		if isPivot && candles[i].High > prevHigh*1.01 {
			candidates = append(candidates, candidate{candles[i].High, "前波更高壓力位"})
		}
	}

	// MA200 above prevHigh (less common in uptrend but possible)
	if ma200 > prevHigh*1.01 {
		candidates = append(candidates, candidate{ma200, "200日均線壓力"})
	}

	// Pick nearest above prevHigh with R:R >= 2
	bestDist := math.MaxFloat64
	found := false
	for _, c := range candidates {
		dist := c.price - entry
		if dist <= 0 {
			continue
		}
		if dist < bestDist {
			bestDist = dist
			target = c.price
			label = c.label
			found = true
		}
	}

	if found {
		return target, label
	}

	// Default: use prevHigh + measured move (height of pattern)
	// Conservative: target = prevHigh + (prevHigh - recent low) * 0.5
	// Or simply prevHigh * 1.05 (5% above breakout)
	target = roundTo2(prevHigh * 1.05)
	label = "前高上方 5%（預估）"

	// Check all-time high scenario
	allTimeHigh := 0.0
	for i := 0; i < n; i++ {
		if candles[i].High > allTimeHigh {
			allTimeHigh = candles[i].High
		}
	}
	if prevHigh >= allTimeHigh*0.97 {
		target = roundTo2(prevHigh * 1.10)
		label = "接近歷史新高，建議移動停損"
	}

	return target, label
}

// ── Scoring ─────────────────────────────────────────────────────────────────

func calcBreakoutScore(distPct float64, maAligned bool, pattern model.PatternType, volRatio, rr float64) float64 {
	score := 0.0

	// 1. Distance to previous high (25 pts) — closer is better
	if distPct <= 1 {
		score += 25
	} else if distPct <= 2 {
		score += 22
	} else if distPct <= 3 {
		score += 18
	} else if distPct <= 5 {
		score += 12
	} else {
		score += 5
	}

	// 2. MA alignment (20 pts)
	if maAligned {
		score += 20
	} else {
		score += 10 // at least MA20 > MA200 (required)
	}

	// 3. Pattern quality (25 pts)
	switch pattern {
	case model.PatternW:
		score += 25
	case model.PatternV:
		score += 20
	default:
		score += 8
	}

	// 4. Volume confirmation (15 pts)
	if volRatio >= 2.0 {
		score += 15
	} else if volRatio >= 1.5 {
		score += 12
	} else if volRatio >= 1.2 {
		score += 10
	} else if volRatio >= 0.8 {
		score += 6
	} else {
		score += 3
	}

	// 5. Reward/Risk (15 pts)
	if rr >= 4 {
		score += 15
	} else if rr >= 3 {
		score += 12
	} else if rr >= 2 {
		score += 10
	} else if rr >= 1 {
		score += 5
	} else {
		score += 2
	}

	return roundTo2(math.Min(score, 100))
}

// SortBreakoutByScore sorts descending by score
func SortBreakoutByScore(stocks []model.BreakoutAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}
