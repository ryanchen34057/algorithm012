package service

import (
	"math"
	"sort"

	"vcp-analyzer/internal/model"
)

// GapScanParams holds all configurable filter thresholds.
// Taiwan-adapted defaults (original US values → Taiwan equivalents):
//
//	Price:   $1–$100      → TWD 10–500
//	ADV20:   >2M shares   → >500 張 (500K shares)
//	Opening: >300K shares  → >300 張 (daily vol proxy, no intraday data)
//	Gap%:    3%–40%        → same (universal)
//	MA:      20, 200 SMA   → same (universal)
type GapScanParams struct {
	MinPrice        float64 // 最低股價 (TWD), default 10
	MaxPrice        float64 // 最高股價 (TWD), default 500
	MinADV20Lots    float64 // 最低 20 日均量 (張), default 500
	MinTodayVolLots float64 // 最低當日成交量 (張), default 300
	MinGapPct       float64 // 最低跳空幅度 (%), default 3
	MaxGapPct       float64 // 最高跳空幅度 (%), default 40
}

// DefaultGapScanParams returns recommended defaults for Taiwan stocks.
func DefaultGapScanParams() GapScanParams {
	return GapScanParams{
		MinPrice:        10,
		MaxPrice:        500,
		MinADV20Lots:    500,
		MinTodayVolLots: 300,
		MinGapPct:       3,
		MaxGapPct:       40,
	}
}

// GapScanner detects shock-gap patterns in stock price data.
type GapScanner struct{}

func NewGapScanner() *GapScanner { return &GapScanner{} }

// Analyze runs the full gap detection pipeline on the provided chart data.
// Returns nil if the stock does not qualify.
func (s *GapScanner) Analyze(chart *model.StockChartData, params GapScanParams) *model.GapAnalysis {
	candles := chart.Candles
	if len(candles) < 201 { // need at least 200+1 bars for MA200 + today
		return nil
	}

	n := len(candles)
	today := candles[n-1]
	yesterday := candles[n-2]

	// ── Basic filters ────────────────────────────────────────────────────
	// Use real-time price from Yahoo meta if available
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

	// Condition A: Shock Gap Up (Long)
	gapUpOK := yesterday.Close < yesterday.Open && // 昨日陰線
		today.Open > yesterday.High && // 跳空過昨高
		gapPct > params.MinGapPct && gapPct < params.MaxGapPct &&
		today.Open > ma20Today && today.Open > ma200Today // 開盤 > MA20 & MA200

	// Condition B: Shock Gap Down (Short)
	gapDownOK := yesterday.Close > yesterday.Open && // 昨日陽線
		today.Open < yesterday.Low && // 跳空破昨低
		gapPct < -params.MinGapPct && gapPct > -params.MaxGapPct &&
		today.Open < ma20Today && today.Open < ma200Today // 開盤 < MA20 & MA200

	if gapUpOK {
		direction = model.GapUp
	} else if gapDownOK {
		direction = model.GapDown
	} else {
		return nil
	}

	// ── Entry / Stop / Target ────────────────────────────────────────────
	entry := today.Open
	var stopLoss, target float64

	if direction == model.GapUp {
		// Stop at gap fill level (yesterday's close)
		stopLoss = yesterday.Close
		risk := entry - stopLoss
		target = roundTo2(entry + 3*risk) // R:R = 3:1
	} else {
		// Short: stop at yesterday's close (gap fill)
		stopLoss = yesterday.Close
		risk := stopLoss - entry
		target = roundTo2(entry - 3*risk) // R:R = 3:1
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
		ADV20:          roundTo2(adv20Lots),
		TodayVolume:    today.Volume,
		MA20:           roundTo2(ma20Today),
		MA200:          roundTo2(ma200Today),
		Score:          score,
	}
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// Max 100 points, based on gap quality signals.
func calcGapScore(
	gapPct, adv20Lots, todayVolLots, ma20, ma200 float64,
	today, yesterday model.OHLCV,
	direction model.GapDirection,
) float64 {
	score := 0.0

	// 1. Gap size quality (30 pts)
	// Sweet spot: 5%–15% gap → full points; taper outside
	absGap := math.Abs(gapPct)
	if absGap >= 5 && absGap <= 15 {
		score += 30
	} else if absGap >= 3 && absGap < 5 {
		score += 15
	} else if absGap > 15 && absGap <= 25 {
		score += 20
	} else {
		score += 10
	}

	// 2. Volume surge (25 pts)
	// Today's volume vs ADV20 — higher = more conviction
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
	// For gap up: price well above both MAs → stronger
	// For gap down: price well below both MAs → stronger
	if direction == model.GapUp {
		if today.Open > ma20 && today.Open > ma200 && ma20 > ma200 {
			score += 20 // MA20 > MA200 = uptrend alignment
		} else {
			score += 10
		}
	} else {
		if today.Open < ma20 && today.Open < ma200 && ma20 < ma200 {
			score += 20 // MA20 < MA200 = downtrend alignment
		} else {
			score += 10
		}
	}

	// 4. Yesterday candle body size (15 pts)
	// Larger body = more "shocking" reversal
	bodyPct := math.Abs(yesterday.Close-yesterday.Open) / yesterday.Open * 100
	if bodyPct >= 2.0 {
		score += 15
	} else if bodyPct >= 1.0 {
		score += 10
	} else {
		score += 5
	}

	// 5. Liquidity bonus (10 pts)
	// Higher ADV20 = more institutional interest
	if adv20Lots >= 2000 {
		score += 10
	} else if adv20Lots >= 1000 {
		score += 7
	} else {
		score += 4
	}

	return roundTo2(math.Min(score, 100))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// avgVolumeN returns the average daily volume (in shares) over the last N bars.
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
