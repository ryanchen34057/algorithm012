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
	entry := today.Open
	var stopLoss, target float64

	if direction == model.GapUp {
		stopLoss = yesterday.Close
		risk := entry - stopLoss
		target = roundTo2(entry + 3*risk)
	} else {
		stopLoss = yesterday.Close
		risk := stopLoss - entry
		target = roundTo2(entry - 3*risk)
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
