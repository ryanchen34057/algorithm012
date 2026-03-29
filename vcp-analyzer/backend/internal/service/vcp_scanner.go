package service

import (
	"math"
	"sort"

	"vcp-analyzer/internal/model"
)

// VCPScanner detects VCP patterns in stock price data.
type VCPScanner struct{}

func NewVCPScanner() *VCPScanner { return &VCPScanner{} }

// Analyze runs the full VCP detection pipeline on the provided chart data
// and returns a scored VCPAnalysis result.
func (s *VCPScanner) Analyze(chart *model.StockChartData) *model.VCPAnalysis {
	candles := chart.Candles
	if len(candles) < 60 {
		return nil // not enough data
	}

	closes := make([]float64, len(candles))
	highs := make([]float64, len(candles))
	lows := make([]float64, len(candles))
	volumes := make([]float64, len(candles))
	for i, c := range candles {
		closes[i] = c.Close
		highs[i] = c.High
		lows[i] = c.Low
		volumes[i] = float64(c.Volume)
	}

	n := len(candles)
	ma50 := chart.MA50
	ma150 := chart.MA150
	ma200 := chart.MA200

	// ── Step 1: Trend Template (Stage 2 filter) ───────────────────────────
	passesTrend := checkTrendTemplate(closes, ma50, ma150, ma200, n)

	// ── Step 2: Detect swing highs / lows, then contractions ─────────────
	contractions := detectContractions(highs, lows, closes, volumes, candles)

	if len(contractions) < 2 {
		return nil // need at least 2 contractions
	}

	// ── Step 3: Volume dry-up check ───────────────────────────────────────
	avgVol50 := avg(volumes[max(0, n-50):])
	lastContrVol := contractions[len(contractions)-1].AvgVolume
	volumeDryUp := lastContrVol < avgVol50*0.7 // last contraction volume < 70% of 50-day avg

	// ── Step 4: Entry / Stop / Target ────────────────────────────────────
	lastC := contractions[len(contractions)-1]
	pivot := lastC.HighPrice
	entry := roundTo2(pivot * 1.01)    // 1% above pivot
	stopLoss := roundTo2(entry * 0.92) // 8% below entry

	// Target: Minervini's minimum R:R = 3:1
	// target = entry + 3 × (entry - stopLoss)
	// This is not a fixed exit point — Minervini uses trailing stops
	// (10MA / 21MA) to let winners run. This target represents the
	// minimum expected reward needed to justify the trade.
	riskPerShare := entry - stopLoss
	target := roundTo2(entry + 3*riskPerShare)

	// ── Step 5: Score ─────────────────────────────────────────────────────
	score := calcScore(contractions, passesTrend, volumeDryUp)

	return &model.VCPAnalysis{
		Symbol:       chart.Symbol,
		Name:         chart.Name,
		Score:        score,
		Contractions: contractions,
		PivotPrice:   pivot,
		EntryPrice:   entry,
		StopLoss:     stopLoss,
		Target:       target,
		CurrentPrice: closes[n-1],
		AvgVolume50:  roundTo2(avgVol50),
		Stage2:       passesTrend,
		PassesTrend:  passesTrend,
	}
}

// ── Trend Template ────────────────────────────────────────────────────────────
// Checks Minervini's 8 criteria (simplified to 4 most critical):
// 1. Price > 50MA
// 2. 50MA > 150MA > 200MA
// 3. 200MA is trending up (last bar vs 20 bars ago)
// 4. Current price is within 25% of 52-week high
func checkTrendTemplate(closes, ma50, ma150, ma200 []float64, n int) bool {
	if n < 200 {
		return false
	}
	cur := closes[n-1]
	if ma50[n-1] == 0 || ma150[n-1] == 0 || ma200[n-1] == 0 {
		return false
	}
	// Criteria 1 & 2
	if cur < ma50[n-1] {
		return false
	}
	if ma50[n-1] < ma150[n-1] {
		return false
	}
	if ma150[n-1] < ma200[n-1] {
		return false
	}
	// Criteria 3: 200MA rising
	if ma200[n-1] < ma200[n-21] {
		return false
	}
	// Criteria 4: within 25% of 52-week high
	high52 := maxSlice(closes[max(0, n-252):])
	if cur < high52*0.75 {
		return false
	}
	return true
}

// ── Contraction Detection ─────────────────────────────────────────────────────
// Algorithm:
// 1. Find swing highs (local maxima with a window of ±5 bars)
// 2. Between consecutive swing highs, find the lowest low
// 3. Compute pullback depth = (swingHigh - interveningLow) / swingHigh
// 4. Keep contractions where depth is decreasing (each < previous)
func detectContractions(
	highs, lows, closes, volumes []float64,
	candles []model.OHLCV,
) []model.Contraction {

	n := len(highs)
	// Only look at the last 6 months (~126 trading days) for recent pattern
	start := max(0, n-126)

	// Find swing highs in the window
	swingHighs := []int{}
	window := 5
	for i := start + window; i < n-window; i++ {
		isHigh := true
		for j := i - window; j <= i+window; j++ {
			if j != i && highs[j] >= highs[i] {
				isHigh = false
				break
			}
		}
		if isHigh {
			swingHighs = append(swingHighs, i)
		}
	}

	if len(swingHighs) < 2 {
		return nil
	}

	// Add the last bar's high as potential final pivot
	swingHighs = append(swingHighs, n-1)

	// Build contractions between swing highs
	var contractions []model.Contraction
	for k := 0; k < len(swingHighs)-1; k++ {
		i := swingHighs[k]
		j := swingHighs[k+1]

		// Find the lowest low between these two swing highs
		lowIdx := i
		for x := i; x <= j; x++ {
			if lows[x] < lows[lowIdx] {
				lowIdx = x
			}
		}

		swingHigh := highs[i]
		swingLow := lows[lowIdx]
		depth := (swingHigh - swingLow) / swingHigh * 100

		// Filter: depth must be between 3% and 40%
		if depth < 3 || depth > 40 {
			continue
		}

		// Volume average during the contraction period
		volAvg := avg(volumes[i : j+1])

		contractions = append(contractions, model.Contraction{
			Index:     len(contractions) + 1,
			HighDate:  candles[i].Date,
			HighPrice: roundTo2(swingHigh),
			LowDate:   candles[lowIdx].Date,
			LowPrice:  roundTo2(swingLow),
			Depth:     roundTo2(depth),
			AvgVolume: roundTo2(volAvg),
		})
	}

	// Keep only sequences with strictly decreasing depth
	contractions = filterDecreasing(contractions)

	// Keep only the most recent 4 contractions
	if len(contractions) > 4 {
		contractions = contractions[len(contractions)-4:]
	}

	// Re-number
	for i := range contractions {
		contractions[i].Index = i + 1
	}

	return contractions
}

// filterDecreasing finds the longest tail of the slice where depths are
// strictly decreasing, then returns sequences with >= 2 such contractions.
func filterDecreasing(cs []model.Contraction) []model.Contraction {
	if len(cs) == 0 {
		return nil
	}
	// Walk backwards and find the longest decreasing tail
	end := len(cs)
	start := end - 1
	for start > 0 {
		if cs[start-1].Depth > cs[start].Depth {
			start--
		} else {
			break
		}
	}
	result := cs[start:end]
	if len(result) < 2 {
		return nil
	}
	return result
}

// ── Scoring ───────────────────────────────────────────────────────────────────
func calcScore(contractions []model.Contraction, passesTrend, volumeDryUp bool) float64 {
	score := 0.0

	// Trend template: 30 points
	if passesTrend {
		score += 30
	}

	// Number of contractions: up to 20 points (3+ ideal)
	numC := len(contractions)
	switch {
	case numC >= 3:
		score += 20
	case numC == 2:
		score += 10
	}

	// Depth contraction quality: up to 30 points
	// Ideal: each contraction ~50% of previous
	if numC >= 2 {
		qualitySum := 0.0
		for i := 1; i < numC; i++ {
			ratio := contractions[i].Depth / contractions[i-1].Depth
			// Perfect ratio is 0.4–0.6 (roughly half)
			quality := 1.0 - math.Abs(ratio-0.5)/0.5
			if quality < 0 {
				quality = 0
			}
			qualitySum += quality
		}
		avgQuality := qualitySum / float64(numC-1)
		score += avgQuality * 30
	}

	// Volume dry-up: 15 points
	if volumeDryUp {
		score += 15
	}

	// Last contraction depth tightness: up to 5 points
	// Tighter final contraction = better
	if numC > 0 {
		lastDepth := contractions[numC-1].Depth
		if lastDepth <= 5 {
			score += 5
		} else if lastDepth <= 8 {
			score += 3
		}
	}

	return roundTo2(math.Min(score, 100))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

func maxSlice(s []float64) float64 {
	if len(s) == 0 {
		return 0
	}
	m := s[0]
	for _, v := range s {
		if v > m {
			m = v
		}
	}
	return m
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// SortByScore sorts VCPAnalysis results descending by score
func SortByScore(stocks []model.VCPAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}
