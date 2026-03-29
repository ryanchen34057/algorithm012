package service

import (
	"math"
	"sort"

	"vcp-analyzer/internal/model"
)

// GapScanParams holds all configurable filter thresholds and strictness toggles.
type GapScanParams struct {
	// ── Numeric filters ──
	MinPrice        float64 // 最低股價 (TWD), default 10
	MaxPrice        float64 // 最高股價 (TWD), default 500
	MinADV20Lots    float64 // 最低 20 日均量 (張), default 500
	MinTodayVolLots float64 // 最低當日成交量 (張), default 300
	MinGapPct       float64 // 最低跳空幅度 (%), default 1.5
	MaxGapPct       float64 // 最高跳空幅度 (%), default 40

	// ── Strictness toggles ──
	// StrictGap: true = open must gap over yesterday's HIGH/LOW (original US version)
	//            false = open must gap over yesterday's CLOSE (recommended for Taiwan)
	StrictGap bool
	// RequireCandleColor: true = yesterday must be bearish(gap up)/bullish(gap down)
	//                     false = any yesterday candle color accepted
	RequireCandleColor bool
	// RequireBothMA: true = open must be above/below BOTH MA20 and MA200
	//               false = open must be above/below at least ONE of MA20 or MA200
	RequireBothMA bool
}

// DefaultGapScanParams returns recommended defaults for Taiwan stocks.
func DefaultGapScanParams() GapScanParams {
	return GapScanParams{
		MinPrice:           10,
		MaxPrice:           500,
		MinADV20Lots:       500,
		MinTodayVolLots:    300,
		MinGapPct:          1.5,
		MaxGapPct:          40,
		StrictGap:          false, // 台股建議用「跳過昨收」
		RequireCandleColor: true,  // 保留昨日 K 線顏色要求
		RequireBothMA:      false, // 任一 MA 即可（台股較寬鬆）
	}
}

// GapScanner detects shock-gap patterns in stock price data.
type GapScanner struct{}

func NewGapScanner() *GapScanner { return &GapScanner{} }

// Analyze runs the full gap detection pipeline on the provided chart data.
// Returns nil if the stock does not qualify.
func (s *GapScanner) Analyze(chart *model.StockChartData, params GapScanParams) *model.GapAnalysis {
	candles := chart.Candles
	if len(candles) < 201 {
		return nil
	}

	n := len(candles)
	today := candles[n-1]
	yesterday := candles[n-2]

	// ── Basic filters ────────────────────────────────────────────────────
	currentPrice := chart.LatestPrice
	if currentPrice == 0 {
		currentPrice = today.Close
	}
	if currentPrice < params.MinPrice || currentPrice > params.MaxPrice {
		return nil
	}

	// ADV20: average daily volume over the last 20 days, in 張
	adv20Shares := avgVolumeN(candles, 20)
	adv20Lots := adv20Shares / 1000.0
	if adv20Lots < params.MinADV20Lots {
		return nil
	}

	// Today's volume proxy for opening momentum (張)
	todayVolLots := float64(today.Volume) / 1000.0
	if todayVolLots < params.MinTodayVolLots {
		return nil
	}

	// ── MA values ────────────────────────────────────────────────────────
	ma20 := chart.MA20
	ma200 := chart.MA200
	if len(ma20) < n || len(ma200) < n {
		return nil
	}
	ma20Today := ma20[n-1]
	ma200Today := ma200[n-1]
	if ma20Today == 0 || ma200Today == 0 {
		return nil
	}

	// ── Gap conditions (A or B) ──────────────────────────────────────────
	gapPct := (today.Open - yesterday.Close) / yesterday.Close * 100
	var direction model.GapDirection

	// --- Gap Up (Long) ---
	var gapUpOK bool
	{
		// 1. Gap reference check
		var gapRefOK bool
		if params.StrictGap {
			gapRefOK = today.Open > yesterday.High // 跳過昨高（嚴格）
		} else {
			gapRefOK = today.Open > yesterday.Close // 跳過昨收（寬鬆）
		}
		// 2. Gap size
		gapSizeOK := gapPct > params.MinGapPct && gapPct < params.MaxGapPct
		// 3. Yesterday candle color
		candleOK := true
		if params.RequireCandleColor {
			candleOK = yesterday.Close < yesterday.Open // 昨日陰線
		}
		// 4. MA condition
		var maOK bool
		if params.RequireBothMA {
			maOK = today.Open > ma20Today && today.Open > ma200Today
		} else {
			maOK = today.Open > ma20Today || today.Open > ma200Today
		}
		gapUpOK = gapRefOK && gapSizeOK && candleOK && maOK
	}

	// --- Gap Down (Short) ---
	var gapDownOK bool
	{
		var gapRefOK bool
		if params.StrictGap {
			gapRefOK = today.Open < yesterday.Low // 跳空破昨低（嚴格）
		} else {
			gapRefOK = today.Open < yesterday.Close // 跳空破昨收（寬鬆）
		}
		gapSizeOK := gapPct < -params.MinGapPct && gapPct > -params.MaxGapPct
		candleOK := true
		if params.RequireCandleColor {
			candleOK = yesterday.Close > yesterday.Open // 昨日陽線
		}
		var maOK bool
		if params.RequireBothMA {
			maOK = today.Open < ma20Today && today.Open < ma200Today
		} else {
			maOK = today.Open < ma20Today || today.Open < ma200Today
		}
		gapDownOK = gapRefOK && gapSizeOK && candleOK && maOK
	}

	if gapUpOK {
		direction = model.GapUp
	} else if gapDownOK {
		direction = model.GapDown
	} else {
		return nil
	}

	// ── Entry / Stop / Target ────────────────────────────────────────────
	// 進場點用最新收盤價（掃描在收盤後執行，隔日開盤最接近昨收）
	entry := today.Close
	stopLoss := yesterday.Close

	var risk float64
	if direction == model.GapUp {
		risk = entry - stopLoss
	} else {
		risk = stopLoss - entry
	}
	if risk <= 0 {
		return nil // 收盤回到缺口內，訊號失效
	}

	// 用技術分析找目標價
	target, targetType, targetLabel := findTarget(candles, entry, stopLoss, risk, direction, ma20Today, ma200Today)
	rr := 0.0
	if risk > 0 {
		if direction == model.GapUp {
			rr = (target - entry) / risk
		} else {
			rr = (entry - target) / risk
		}
	}

	// 風報比 < 2:1 的交易不值得做（移動停損類型除外）
	if targetType != model.TargetTrailingStop && rr < 2.0 {
		return nil
	}

	// ── Score ────────────────────────────────────────────────────────────
	score := calcGapScore(gapPct, adv20Lots, todayVolLots, ma20Today, ma200Today, today, yesterday, direction)

	return &model.GapAnalysis{
		Symbol:         chart.Symbol,
		Name:           chart.Name,
		Direction:      direction,
		GapPercent:     roundTo2(gapPct),
		TodayOpen:      roundTo2(today.Open),
		TodayClose:     roundTo2(today.Close),
		YesterdayOpen:  roundTo2(yesterday.Open),
		YesterdayClose: roundTo2(yesterday.Close),
		YesterdayHigh:  roundTo2(yesterday.High),
		YesterdayLow:   roundTo2(yesterday.Low),
		CurrentPrice:   roundTo2(currentPrice),
		EntryPrice:     roundTo2(entry),
		StopLoss:       roundTo2(stopLoss),
		Target:         roundTo2(target),
		TargetType:     targetType,
		TargetLabel:    targetLabel,
		RewardRisk:     roundTo2(rr),
		ADV20:          roundTo2(adv20Lots),
		TodayVolume:    today.Volume,
		MA20:           roundTo2(ma20Today),
		MA200:          roundTo2(ma200Today),
		Score:          score,
	}
}

// ── Scoring ──────────────────────────────────────────────────────────────────
func calcGapScore(
	gapPct, adv20Lots, todayVolLots, ma20, ma200 float64,
	today, yesterday model.OHLCV,
	direction model.GapDirection,
) float64 {
	score := 0.0

	// 1. Gap size quality (30 pts)
	absGap := math.Abs(gapPct)
	if absGap >= 5 && absGap <= 15 {
		score += 30
	} else if absGap >= 3 && absGap < 5 {
		score += 20
	} else if absGap >= 1.5 && absGap < 3 {
		score += 15
	} else if absGap > 15 && absGap <= 25 {
		score += 20
	} else {
		score += 10
	}

	// 2. Volume surge (25 pts)
	volRatio := todayVolLots / adv20Lots
	if volRatio >= 3.0 {
		score += 25
	} else if volRatio >= 2.0 {
		score += 20
	} else if volRatio >= 1.5 {
		score += 15
	} else if volRatio >= 1.0 {
		score += 10
	} else {
		score += 5
	}

	// 3. MA alignment strength (20 pts)
	if direction == model.GapUp {
		aboveBoth := today.Open > ma20 && today.Open > ma200
		maAligned := ma20 > ma200
		if aboveBoth && maAligned {
			score += 20
		} else if aboveBoth {
			score += 15
		} else {
			score += 8
		}
	} else {
		belowBoth := today.Open < ma20 && today.Open < ma200
		maAligned := ma20 < ma200
		if belowBoth && maAligned {
			score += 20
		} else if belowBoth {
			score += 15
		} else {
			score += 8
		}
	}

	// 4. Yesterday candle body size (15 pts)
	bodyPct := math.Abs(yesterday.Close-yesterday.Open) / yesterday.Open * 100
	if bodyPct >= 2.0 {
		score += 15
	} else if bodyPct >= 1.0 {
		score += 10
	} else {
		score += 5
	}

	// 5. Liquidity bonus (10 pts)
	if adv20Lots >= 2000 {
		score += 10
	} else if adv20Lots >= 1000 {
		score += 7
	} else {
		score += 4
	}

	return roundTo2(math.Min(score, 100))
}

// ── Target Price Discovery ──────────────────────────────────────────────────

// findTarget determines the target price using technical analysis:
//  1. 前波高/低點（swing highs/lows）
//  2. K線密集區（consolidation zones）壓力/支撐
//  3. MA200 / MA20 壓力/支撐
//  4. 若處於歷史新高/低 → 建議移動停損
//  5. 最終驗證：風報比 >= 2:1（由呼叫端檢查）
func findTarget(
	candles []model.OHLCV, entry, stopLoss, risk float64,
	dir model.GapDirection, ma20, ma200 float64,
) (target float64, tt model.TargetType, label string) {
	n := len(candles)

	// Collect candidate targets: (price, type, label)
	type candidate struct {
		price float64
		tt    model.TargetType
		label string
	}
	var candidates []candidate

	// ── 1. Swing highs / lows (前波高低點) ──
	// Use 5-bar pivot: a swing high has high > 5 bars before & after
	pivotN := 5
	lookback := n - 1 // exclude today
	if lookback > 200 {
		lookback = 200
	}
	startIdx := n - 1 - lookback
	if startIdx < pivotN {
		startIdx = pivotN
	}

	if dir == model.GapUp {
		// Find swing highs above entry
		for i := startIdx; i < n-1-pivotN; i++ {
			isPivot := true
			for j := 1; j <= pivotN; j++ {
				if candles[i].High <= candles[i-j].High || candles[i].High <= candles[i+j].High {
					isPivot = false
					break
				}
			}
			if isPivot && candles[i].High > entry {
				candidates = append(candidates, candidate{
					price: candles[i].High,
					tt:    model.TargetSwingPoint,
					label: "前波高點壓力",
				})
			}
		}
	} else {
		// Find swing lows below entry
		for i := startIdx; i < n-1-pivotN; i++ {
			isPivot := true
			for j := 1; j <= pivotN; j++ {
				if candles[i].Low >= candles[i-j].Low || candles[i].Low >= candles[i+j].Low {
					isPivot = false
					break
				}
			}
			if isPivot && candles[i].Low < entry {
				candidates = append(candidates, candidate{
					price: candles[i].Low,
					tt:    model.TargetSwingPoint,
					label: "前波低點支撐",
				})
			}
		}
	}

	// ── 2. Consolidation zones (K線密集區) ──
	// Scan for zones where 10+ candles overlap in a tight range (< 5% of price)
	windowSize := 15
	minOverlap := 10
	for i := startIdx; i <= n-1-windowSize; i++ {
		lo, hi := candles[i].Low, candles[i].High
		for j := 1; j < windowSize; j++ {
			if candles[i+j].Low < lo {
				lo = candles[i+j].Low
			}
			if candles[i+j].High > hi {
				hi = candles[i+j].High
			}
		}
		rangePct := (hi - lo) / lo * 100
		if rangePct > 5 {
			continue
		}
		// Count how many candles overlap with the zone's midpoint
		mid := (hi + lo) / 2
		overlap := 0
		for j := 0; j < windowSize; j++ {
			if candles[i+j].Low <= mid && candles[i+j].High >= mid {
				overlap++
			}
		}
		if overlap < minOverlap {
			continue
		}
		if dir == model.GapUp && hi > entry {
			candidates = append(candidates, candidate{
				price: hi,
				tt:    model.TargetConsolidation,
				label: "盤整密集區壓力",
			})
		} else if dir == model.GapDown && lo < entry {
			candidates = append(candidates, candidate{
				price: lo,
				tt:    model.TargetConsolidation,
				label: "盤整密集區支撐",
			})
		}
	}

	// ── 3. MA200 / MA20 as target ──
	if dir == model.GapUp {
		if ma200 > entry {
			candidates = append(candidates, candidate{price: ma200, tt: model.TargetMA200, label: "200日均線壓力"})
		}
		// MA20: if price extended far above MA20, MA20 is not a target for long
		// MA20 target is mainly for exhaustion reversal (short), skip for long
	} else {
		if ma200 < entry {
			candidates = append(candidates, candidate{price: ma200, tt: model.TargetMA200, label: "200日均線支撐"})
		}
		// MA20 as target for short: if price crashed far below MA20, bounce target = MA20
		if ma20 < entry {
			candidates = append(candidates, candidate{price: ma20, tt: model.TargetMA20, label: "20日均線回歸"})
		}
	}

	// ── Pick the nearest valid target (R:R >= 2) ──
	bestDist := math.MaxFloat64
	found := false
	for _, c := range candidates {
		var dist, rr float64
		if dir == model.GapUp {
			dist = c.price - entry
			rr = dist / risk
		} else {
			dist = entry - c.price
			rr = dist / risk
		}
		if dist <= 0 || rr < 2.0 {
			continue
		}
		if dist < bestDist {
			bestDist = dist
			target = c.price
			tt = c.tt
			label = c.label
			found = true
		}
	}

	if found {
		return target, tt, label
	}

	// ── 4. Check if at all-time high/low → trailing stop ──
	if dir == model.GapUp {
		allTimeHigh := 0.0
		for i := 0; i < n-1; i++ {
			if candles[i].High > allTimeHigh {
				allTimeHigh = candles[i].High
			}
		}
		if entry >= allTimeHigh*0.97 {
			// Near all-time high territory, no overhead resistance
			return roundTo2(entry + 3*risk), model.TargetTrailingStop, "接近歷史新高，建議移動停損"
		}
	} else {
		allTimeLow := math.MaxFloat64
		for i := 0; i < n-1; i++ {
			if candles[i].Low < allTimeLow {
				allTimeLow = candles[i].Low
			}
		}
		if entry <= allTimeLow*1.03 {
			return roundTo2(entry - 3*risk), model.TargetTrailingStop, "接近歷史新低，建議移動停損"
		}
	}

	// ── Fallback: no valid target found, use conservative 2:1 ──
	if dir == model.GapUp {
		target = roundTo2(entry + 2*risk)
	} else {
		target = roundTo2(entry - 2*risk)
	}
	return target, model.TargetSwingPoint, "無明確壓力/支撐，預設 2:1 風報比"
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func avgVolumeN(candles []model.OHLCV, n int) float64 {
	total := len(candles)
	if total == 0 {
		return 0
	}
	start := total - n
	if start < 0 {
		start = 0
	}
	sum := 0.0
	count := 0
	for i := start; i < total; i++ {
		sum += float64(candles[i].Volume)
		count++
	}
	if count == 0 {
		return 0
	}
	return sum / float64(count)
}

func avg(s []float64) float64 {
	if len(s) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range s {
		sum += v
	}
	return sum / float64(len(s))
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// SortByScore sorts GapAnalysis results descending by score
func SortByScore(stocks []model.GapAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}

// ParseBoolParam parses a boolean query parameter with a default value.
func ParseBoolParam(s string, def bool) bool {
	switch s {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	default:
		return def
	}
}
