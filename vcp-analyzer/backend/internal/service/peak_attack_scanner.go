package service

import (
	"math"
	"sort"

	"vcp-analyzer/internal/model"
)

// PeakAttackScanParams holds configurable filters.
type PeakAttackScanParams struct {
	MinPrice       float64 // 最低股價，default 10
	MaxPrice       float64 // 最高股價，default 9999
	MinADV20Lots   float64 // 最低20日均量（張），default 500
	MinTodayVolLots float64 // 最低當日量（張），default 2000
	PeakRangeMax   float64 // 攻頂區間最大寬度 (%), default 5
	MinAttackCount int     // 最少攻頂次數, default 3
	MinVolRatio    float64 // 最低當日量/ADV20 倍數, default 1.0
	// KD parameters
	KDPeriod   int // RSV period, default 9
	KDSmooth1  int // K smoothing, default 3
	KDSmooth2  int // D smoothing, default 3
}

func DefaultPeakAttackScanParams() PeakAttackScanParams {
	return PeakAttackScanParams{
		MinPrice:        10,
		MaxPrice:        9999,
		MinADV20Lots:    500,
		MinTodayVolLots: 2000,
		PeakRangeMax:    5,
		MinAttackCount:  3,
		MinVolRatio:     1.0,
		KDPeriod:        9,
		KDSmooth1:       3,
		KDSmooth2:       3,
	}
}

type PeakAttackScanner struct{}

func NewPeakAttackScanner() *PeakAttackScanner { return &PeakAttackScanner{} }

func (s *PeakAttackScanner) Analyze(chart *model.StockChartData, params PeakAttackScanParams) *model.PeakAttackAnalysis {
	candles := chart.Candles
	n := len(candles)
	if n < 201 {
		return nil
	}

	today := candles[n-1]
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
	todayVolLots := float64(today.Volume) / 1000.0

	// ── Calculate KD stochastic ──
	kValues, dValues := calcKD(candles, params.KDPeriod, params.KDSmooth1, params.KDSmooth2)
	if len(kValues) < n || len(dValues) < n {
		return nil
	}

	// ── Track attack peaks ──
	// Simulate the XQ logic: when K>D, track highest high.
	// On KD death cross, store the peak.
	maxPeaks := 10
	attackPeaks := make([]float64, maxPeaks)
	var currentAttackHigh float64

	for i := 1; i < n; i++ {
		kAboveD := kValues[i] > dValues[i]
		prevKAboveD := kValues[i-1] > dValues[i-1]

		if kAboveD {
			// While K > D, track the highest high
			if candles[i].High > currentAttackHigh {
				currentAttackHigh = candles[i].High
			}
		}

		if prevKAboveD && !kAboveD {
			// KD death cross — store the attack peak and shift array
			if currentAttackHigh > 0 {
				for j := maxPeaks - 1; j >= 1; j-- {
					attackPeaks[j] = attackPeaks[j-1]
				}
				attackPeaks[0] = currentAttackHigh
			}
			currentAttackHigh = 0
		}
	}

	// If currently in a K>D cycle, the current attack high is the "live" one
	liveAttackHigh := currentAttackHigh
	if liveAttackHigh == 0 && kValues[n-1] > dValues[n-1] {
		liveAttackHigh = today.High
	}

	// ── Analyze recent attack peaks ──
	// Count valid peaks (> 0), use the last MinAttackCount peaks
	var validPeaks []float64
	for _, p := range attackPeaks {
		if p > 0 {
			validPeaks = append(validPeaks, p)
		}
		if len(validPeaks) >= params.MinAttackCount+1 {
			break
		}
	}

	if len(validPeaks) < params.MinAttackCount {
		return nil
	}

	// Use the most recent MinAttackCount peaks to find tight range
	checkPeaks := validPeaks[:params.MinAttackCount]
	peakHigh := checkPeaks[0]
	peakLow := checkPeaks[0]
	for _, p := range checkPeaks {
		if p > peakHigh {
			peakHigh = p
		}
		if p < peakLow {
			peakLow = p
		}
	}

	if peakLow <= 0 {
		return nil
	}

	peakRangePct := (peakHigh/peakLow - 1) * 100

	// ── Check breakout condition ──
	// The strategy triggers when:
	// 1. The tight range condition was previously true (peaks within threshold)
	// 2. Current high breaks above the peak zone
	// 3. Volume conditions met

	// Check if peaks WERE in tight range
	if peakRangePct > params.PeakRangeMax {
		return nil
	}

	// Price must be near or above the peak zone
	distPct := (peakHigh - price) / peakHigh * 100
	// Allow stocks that are within 3% below the peak zone or already above
	if distPct > 3 {
		return nil
	}

	// Volume filter
	if todayVolLots < params.MinTodayVolLots {
		return nil
	}
	volRatio := 0.0
	if adv20 > 0 {
		volRatio = todayVolLots / adv20
	}
	if volRatio < params.MinVolRatio {
		return nil
	}

	// ── MA values ──
	ma20 := 0.0
	ma50 := 0.0
	ma200 := 0.0
	if len(chart.MA20) >= n {
		ma20 = chart.MA20[n-1]
	}
	if len(chart.MA50) >= n {
		ma50 = chart.MA50[n-1]
	}
	if len(chart.MA200) >= n {
		ma200 = chart.MA200[n-1]
	}

	// ── Trade plan ──
	entryPrice := price
	// Stop loss: below the peak zone low or recent swing low
	stopLoss := peakLow * 0.97 // 3% below the bottom of the peak zone
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
	if recentLow < stopLoss && recentLow > 0 {
		stopLoss = recentLow
	}
	if stopLoss >= entryPrice {
		stopLoss = entryPrice * 0.95
	}

	risk := entryPrice - stopLoss
	if risk <= 0 {
		return nil
	}

	// Target: find next resistance above breakout
	target, targetLabel := findPeakAttackTarget(candles, entryPrice, peakHigh, risk)
	rr := 0.0
	if risk > 0 {
		rr = (target - entryPrice) / risk
	}

	// ── Score ──
	score := calcPeakAttackScore(peakRangePct, len(checkPeaks), volRatio, rr, distPct, liveAttackHigh > peakHigh)

	// Collect display peaks (up to 5)
	displayPeaks := checkPeaks
	if len(displayPeaks) > 5 {
		displayPeaks = displayPeaks[:5]
	}

	return &model.PeakAttackAnalysis{
		Symbol:        chart.Symbol,
		Name:          chart.Name,
		CurrentPrice:  roundTo2(price),
		K:             roundTo2(kValues[n-1]),
		D:             roundTo2(dValues[n-1]),
		AttackPeaks:   roundSlice(displayPeaks),
		PeakHigh:      roundTo2(peakHigh),
		PeakLow:       roundTo2(peakLow),
		PeakRangePct:  roundTo2(peakRangePct),
		AttackCount:   len(checkPeaks),
		BreakoutPrice: roundTo2(peakHigh),
		DistPct:       roundTo2(distPct),
		ADV20:         roundTo2(adv20),
		TodayVolume:   today.Volume,
		TodayVolLots:  roundTo2(todayVolLots),
		VolRatio:      roundTo2(volRatio),
		MA20:          roundTo2(ma20),
		MA50:          roundTo2(ma50),
		MA200:         roundTo2(ma200),
		EntryPrice:    roundTo2(entryPrice),
		StopLoss:      roundTo2(stopLoss),
		Target:        roundTo2(target),
		TargetLabel:   targetLabel,
		RewardRisk:    roundTo2(rr),
		Score:         score,
	}
}

// ── KD Stochastic Calculation ───────────────────────────────────────────────

func calcKD(candles []model.OHLCV, period, smooth1, smooth2 int) (kValues, dValues []float64) {
	n := len(candles)
	kValues = make([]float64, n)
	dValues = make([]float64, n)

	// Initialize
	for i := 0; i < n; i++ {
		kValues[i] = 50
		dValues[i] = 50
	}

	for i := period - 1; i < n; i++ {
		// Find highest high and lowest low in period
		hh := candles[i].High
		ll := candles[i].Low
		for j := i - period + 1; j < i; j++ {
			if candles[j].High > hh {
				hh = candles[j].High
			}
			if candles[j].Low < ll {
				ll = candles[j].Low
			}
		}

		// RSV
		rsv := 50.0
		if hh-ll > 0 {
			rsv = (candles[i].Close - ll) / (hh - ll) * 100
		}

		// K = prev_K * (smooth1-1)/smooth1 + RSV * 1/smooth1
		prevK := kValues[i-1]
		kValues[i] = prevK*float64(smooth1-1)/float64(smooth1) + rsv/float64(smooth1)

		// D = prev_D * (smooth2-1)/smooth2 + K * 1/smooth2
		prevD := dValues[i-1]
		dValues[i] = prevD*float64(smooth2-1)/float64(smooth2) + kValues[i]/float64(smooth2)
	}

	return kValues, dValues
}

// ── Target ──────────────────────────────────────────────────────────────────

func findPeakAttackTarget(candles []model.OHLCV, entry, peakHigh, risk float64) (float64, string) {
	n := len(candles)

	// Look for swing highs above peakHigh
	pivotN := 5
	type candidate struct {
		price float64
		label string
	}
	var candidates []candidate

	for i := pivotN; i < n-1-pivotN; i++ {
		isPivot := true
		for j := 1; j <= pivotN; j++ {
			if candles[i].High <= candles[i-j].High || candles[i].High <= candles[i+j].High {
				isPivot = false
				break
			}
		}
		if isPivot && candles[i].High > peakHigh*1.01 {
			candidates = append(candidates, candidate{candles[i].High, "前波更高壓力位"})
		}
	}

	// Pick nearest
	bestDist := math.MaxFloat64
	target := 0.0
	label := ""
	for _, c := range candidates {
		dist := c.price - entry
		if dist > 0 && dist < bestDist {
			bestDist = dist
			target = c.price
			label = c.label
		}
	}

	if target > 0 {
		return target, label
	}

	// Check all-time high
	allTimeHigh := 0.0
	for i := 0; i < n; i++ {
		if candles[i].High > allTimeHigh {
			allTimeHigh = candles[i].High
		}
	}
	if peakHigh >= allTimeHigh*0.97 {
		return roundTo2(entry + 3*risk), "接近歷史新高，建議移動停損"
	}

	return roundTo2(entry + 2*risk), "預設 2:1 風報比"
}

// ── Scoring ─────────────────────────────────────────────────────────────────

func calcPeakAttackScore(rangePct float64, attackCount int, volRatio, rr, distPct float64, currentlyBreaking bool) float64 {
	score := 0.0

	// 1. Tight range quality (25 pts) — tighter is better
	if rangePct <= 1 {
		score += 25
	} else if rangePct <= 2 {
		score += 22
	} else if rangePct <= 3 {
		score += 18
	} else if rangePct <= 5 {
		score += 12
	} else {
		score += 5
	}

	// 2. Attack count (20 pts) — more attacks = stronger resistance → bigger breakout
	if attackCount >= 5 {
		score += 20
	} else if attackCount >= 4 {
		score += 16
	} else if attackCount >= 3 {
		score += 12
	} else {
		score += 5
	}

	// 3. Volume surge (20 pts)
	if volRatio >= 3.0 {
		score += 20
	} else if volRatio >= 2.0 {
		score += 16
	} else if volRatio >= 1.5 {
		score += 12
	} else if volRatio >= 1.0 {
		score += 8
	} else {
		score += 4
	}

	// 4. Distance / breakout status (20 pts)
	if currentlyBreaking || distPct <= 0 {
		score += 20 // Already breaking out
	} else if distPct <= 1 {
		score += 16
	} else if distPct <= 2 {
		score += 12
	} else {
		score += 6
	}

	// 5. R:R ratio (15 pts)
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

func roundSlice(s []float64) []float64 {
	out := make([]float64, len(s))
	for i, v := range s {
		out[i] = roundTo2(v)
	}
	return out
}

// SortPeakAttackByScore sorts descending by score
func SortPeakAttackByScore(stocks []model.PeakAttackAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}
