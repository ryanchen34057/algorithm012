package service

import (
	"math"
	"sort"
	"strings"

	"vcp-analyzer/internal/model"
)

type ElitePickScanParams struct {
	MinPrice       float64 // default 15
	MaxPrice       float64 // default 500
	MinADV20Lots   float64 // default 300
	VolShrinkMax   float64 // 量縮比例上限 (5日量/20日量)，default 0.8 = 5日量 < 80% of 20日量
	NearHighPct    float64 // 距前高最大 %，default 10
	RangeMaxPct    float64 // 波動收斂上限 %，default 10
	LookbackDays   int     // 前高回看天數，default 120
	MaxLossPerTrade float64 // 每筆最大虧損金額（萬），用於推算張數，default 5
}

func DefaultElitePickScanParams() ElitePickScanParams {
	return ElitePickScanParams{
		MinPrice:       15,
		MaxPrice:       500,
		MinADV20Lots:   300,
		VolShrinkMax:   0.8,
		NearHighPct:    10,
		RangeMaxPct:    10,
		LookbackDays:   120,
		MaxLossPerTrade: 5, // 5萬
	}
}

type ElitePickScanner struct{}

func NewElitePickScanner() *ElitePickScanner { return &ElitePickScanner{} }

func (s *ElitePickScanner) Analyze(chart *model.StockChartData, params ElitePickScanParams) *model.ElitePickAnalysis {
	candles := chart.Candles
	n := len(candles)
	if n < 130 { // need enough data for MA120 + pattern detection
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

	// ADV20
	adv20 := avgVolumeN(candles, 20) / 1000.0
	if adv20 < params.MinADV20Lots {
		return nil
	}

	// ── MA calculations ──
	closes := make([]float64, n)
	for i, c := range candles {
		closes[i] = c.Close
	}
	ma10 := simpleMA(closes, 10)
	ma20 := simpleMA(closes, 20)
	ma60 := simpleMA(closes, 60)
	ma120 := simpleMA(closes, 120)
	ma200 := 0.0
	if n >= 200 {
		ma200 = simpleMA(closes, 200)
	}

	// ── Condition 1: 5日量縮 ──
	vol5d := avgVolumeN(candles, 5)
	vol20d := avgVolumeN(candles, 20)
	volShrink := 1.0
	if vol20d > 0 {
		volShrink = vol5d / vol20d
	}
	if volShrink > params.VolShrinkMax {
		return nil // 量沒有縮
	}

	// ── Condition 2: 快過高 ──
	lookback := params.LookbackDays
	if lookback > n-10 {
		lookback = n - 10
	}
	// Find previous high (exclude last 5 days to avoid counting today)
	prevHigh := 0.0
	prevHighIdx := 0
	searchEnd := n - 5
	searchStart := n - lookback
	if searchStart < 0 {
		searchStart = 0
	}
	for i := searchStart; i < searchEnd; i++ {
		if candles[i].High > prevHigh {
			prevHigh = candles[i].High
			prevHighIdx = i
		}
	}
	if prevHigh <= 0 {
		return nil
	}
	distPct := (prevHigh - price) / prevHigh * 100
	if distPct > params.NearHighPct {
		return nil // 離前高太遠
	}

	// ── Condition 3: 波動收斂10%內 ──
	// Use last 20 bars as the consolidation range
	rangeHigh, rangeLow := candles[n-20].High, candles[n-20].Low
	for i := n - 20; i < n; i++ {
		if candles[i].High > rangeHigh {
			rangeHigh = candles[i].High
		}
		if candles[i].Low < rangeLow {
			rangeLow = candles[i].Low
		}
	}
	rangePct := 0.0
	if rangeHigh > 0 {
		rangePct = (rangeHigh - rangeLow) / rangeHigh * 100
	}
	if rangePct > params.RangeMaxPct {
		return nil // 波動太大，還沒收斂
	}

	// ── Condition 4: 型態偵測 (U/N/Cup) ──
	pattern, patternLabel := detectShape(candles, n)

	// ── Trend check: basic uptrend ──
	if ma20 <= 0 || ma60 <= 0 {
		return nil
	}
	if price < ma20 {
		return nil // 收盤價要在MA20之上
	}

	// ── Condition 7-8: 出場訊號 ──
	sellSignal, sellLabel := detectSellSignals(candles, n, price, ma10, vol20d)

	// ── Condition 9: 停損 ──
	stopLoss, stopLabel := calcEliteStopLoss(candles, n, price, ma20)

	// ── Target ──
	risk := price - stopLoss
	if risk <= 0 {
		return nil
	}
	target := roundTo2(price + 2*risk)
	targetLabel := "2:1 風報比"
	// If near 52w high, extend target
	high52w := 0.0
	lb := 252
	if lb > n {
		lb = n
	}
	for i := n - lb; i < n; i++ {
		if candles[i].High > high52w {
			high52w = candles[i].High
		}
	}
	if high52w > 0 && price >= high52w*0.95 {
		target = roundTo2(price + 3*risk)
		targetLabel = "接近52週高 3:1"
	}

	rr := 0.0
	if risk > 0 {
		rr = (target - price) / risk
	}

	// ── Condition 10: 停損回推張數 ──
	maxLoss := params.MaxLossPerTrade * 10000 // 萬 → 元
	riskPerShare := price - stopLoss
	suggestLots := 0
	if riskPerShare > 0 {
		shares := maxLoss / riskPerShare
		suggestLots = int(math.Floor(shares / 1000)) // 1張 = 1000股
		if suggestLots < 1 {
			suggestLots = 1
		}
	}

	// ── Scoring ──
	score := calcEliteScore(distPct, volShrink, rangePct, pattern, price, ma20, ma60, rr)

	market := "上市"
	if strings.HasSuffix(chart.Symbol, ".TWO") {
		market = "上櫃"
	}

	return &model.ElitePickAnalysis{
		Symbol:       chart.Symbol,
		Name:         chart.Name,
		Market:       market,
		Industry:     GetIndustry(chart.Symbol, chart.Name),
		ConceptTag:   GetConceptTag(chart.Symbol),
		CurrentPrice: roundTo2(price),
		Vol5D:        roundTo2(vol5d / 1000), // 轉張
		Vol20D:       roundTo2(vol20d / 1000),
		VolShrink:    roundTo2(volShrink),
		PrevHigh:     roundTo2(prevHigh),
		PrevHighDate: candles[prevHighIdx].Date,
		DistPct:      roundTo2(distPct),
		RangeHigh:    roundTo2(rangeHigh),
		RangeLow:     roundTo2(rangeLow),
		RangePct:     roundTo2(rangePct),
		Pattern:      pattern,
		PatternLabel: patternLabel,
		MA10:         roundTo2(ma10),
		MA20:         roundTo2(ma20),
		MA60:         roundTo2(ma60),
		MA120:        roundTo2(ma120),
		MA200:        roundTo2(ma200),
		SellSignal:   sellSignal,
		SellLabel:    sellLabel,
		StopLoss:     roundTo2(stopLoss),
		StopLabel:    stopLabel,
		EntryPrice:   roundTo2(price),
		Target:       target,
		TargetLabel:  targetLabel,
		RewardRisk:   roundTo2(rr),
		SuggestLots:  suggestLots,
		ADV20:        roundTo2(adv20),
		TodayVolume:  today.Volume,
		Score:        score,
	}
}

// ── Pattern Detection ──

func detectShape(candles []model.OHLCV, n int) (model.PatternShape, string) {
	// Look at last 60 bars for pattern
	lb := 60
	if lb > n-10 {
		lb = n - 10
	}
	start := n - lb

	// Find the lowest point in the lookback
	lowestIdx := start
	for i := start; i < n; i++ {
		if candles[i].Low < candles[lowestIdx].Low {
			lowestIdx = i
		}
	}

	lowPos := float64(lowestIdx-start) / float64(lb) // 0=start, 1=end
	lowDepth := 0.0
	// Calculate drop from the high before the low
	preLowHigh := 0.0
	for i := start; i < lowestIdx; i++ {
		if candles[i].High > preLowHigh {
			preLowHigh = candles[i].High
		}
	}
	if preLowHigh > 0 {
		lowDepth = (preLowHigh - candles[lowestIdx].Low) / preLowHigh * 100
	}

	// Price recovery: how much has it recovered from the low?
	postLowHigh := 0.0
	for i := lowestIdx; i < n; i++ {
		if candles[i].High > postLowHigh {
			postLowHigh = candles[i].High
		}
	}
	recovery := 0.0
	if preLowHigh > 0 && lowDepth > 0 {
		recovery = (postLowHigh - candles[lowestIdx].Low) / (preLowHigh - candles[lowestIdx].Low) * 100
	}

	// Check for second low (W-pattern)
	secondLow := findSecondLow(candles, start, n, lowestIdx)

	// ── Cup (杯型) ──
	// Rounded bottom: low is roughly in the middle (30-70%), good recovery
	if lowPos > 0.25 && lowPos < 0.65 && lowDepth > 8 && recovery > 70 {
		return model.ShapeCup, "杯型整理"
	}

	// ── U型 ──
	// Low in the middle with symmetric recovery, less deep than cup
	if lowPos > 0.2 && lowPos < 0.6 && lowDepth > 5 && recovery > 60 {
		return model.ShapeU, "U型整理"
	}

	// ── N型 ──
	// Has two lows forming a W/N shape: first drop, recovery, second drop, final push
	if secondLow && lowDepth > 5 {
		return model.ShapeN, "N型整理"
	}

	return model.ShapeNone, ""
}

func findSecondLow(candles []model.OHLCV, start, end, firstLowIdx int) bool {
	// Look for another swing low after the first low
	if firstLowIdx >= end-10 {
		return false
	}
	pivotN := 5
	for i := firstLowIdx + pivotN + 3; i < end-pivotN; i++ {
		isPivot := true
		for j := 1; j <= pivotN; j++ {
			if i-j < start || i+j >= end {
				isPivot = false
				break
			}
			if candles[i].Low >= candles[i-j].Low || candles[i].Low >= candles[i+j].Low {
				isPivot = false
				break
			}
		}
		if isPivot {
			// Found a second swing low
			diff := math.Abs(candles[i].Low-candles[firstLowIdx].Low) / candles[firstLowIdx].Low * 100
			if diff < 10 { // Within 10% of first low
				return true
			}
		}
	}
	return false
}

// ── Sell Signal Detection ──

func detectSellSignals(candles []model.OHLCV, n int, price, ma10, vol20d float64) (model.SellSignal, string) {
	today := candles[n-1]
	hasBigBlack := false
	belowMA10 := false

	// 7. 大量長黑K: body > 3% + volume > 2x avg
	bodyPct := 0.0
	if today.Open > 0 {
		bodyPct = (today.Open - today.Close) / today.Open * 100
	}
	if bodyPct > 3 && float64(today.Volume) > vol20d*2 {
		hasBigBlack = true
	}

	// 8. 跌破10日均線
	if ma10 > 0 && price < ma10 {
		belowMA10 = true
	}

	if hasBigBlack && belowMA10 {
		return model.SellBothSignals, "大量長黑K + 跌破10日均線"
	}
	if hasBigBlack {
		return model.SellBigBlackK, "大量長黑K，建議賣一半"
	}
	if belowMA10 {
		return model.SellBelowMA10, "跌破10日均線，可全賣"
	}
	return model.SellNone, ""
}

// ── Stop Loss Calculation ──

func calcEliteStopLoss(candles []model.OHLCV, n int, price, ma20 float64) (float64, string) {
	// Find support: recent swing low (last 20 bars)
	support := price
	for i := n - 20; i < n; i++ {
		if candles[i].Low < support {
			support = candles[i].Low
		}
	}
	support = roundTo2(support * 0.99) // 1% below support

	// MA20 as alternative stop
	ma20Stop := roundTo2(ma20 * 0.99)

	// Use whichever is closer (less risk) but still below price
	if support >= price {
		support = roundTo2(price * 0.95)
	}
	if ma20Stop >= price {
		ma20Stop = roundTo2(price * 0.95)
	}

	// Pick the higher one (tighter stop) that's still below price
	if support > ma20Stop && support < price {
		return support, "近期支撐"
	}
	if ma20Stop < price {
		return ma20Stop, "20日均線"
	}
	return roundTo2(price * 0.95), "預設5%停損"
}

// ── Scoring ──

func calcEliteScore(distPct, volShrink, rangePct float64, pattern model.PatternShape, price, ma20, ma60, rr float64) float64 {
	score := 0.0

	// Distance to high (0-25 pts): closer = better
	if distPct <= 0 {
		score += 25
	} else if distPct < 3 {
		score += 20
	} else if distPct < 5 {
		score += 15
	} else if distPct < 8 {
		score += 10
	} else {
		score += 5
	}

	// Volume shrink (0-20 pts): lower = better
	if volShrink < 0.4 {
		score += 20
	} else if volShrink < 0.6 {
		score += 16
	} else if volShrink < 0.7 {
		score += 12
	} else {
		score += 8
	}

	// Range contraction (0-20 pts): tighter = better
	if rangePct < 3 {
		score += 20
	} else if rangePct < 5 {
		score += 16
	} else if rangePct < 7 {
		score += 12
	} else {
		score += 8
	}

	// Pattern (0-20 pts)
	switch pattern {
	case model.ShapeCup:
		score += 20
	case model.ShapeU:
		score += 16
	case model.ShapeN:
		score += 14
	default:
		score += 5
	}

	// Trend alignment (0-15 pts)
	if price > ma20 && ma20 > ma60 {
		score += 15
	} else if price > ma20 {
		score += 10
	} else {
		score += 5
	}

	return math.Min(score, 100)
}

// ── Market Status ──

func (s *ElitePickScanner) CheckMarket(ds *YahooFinance) model.MarketStatus {
	// Fetch TAIEX (^TWII)
	chart, err := ds.FetchHistory("^TWII")
	if err != nil || len(chart.Candles) < 130 {
		return model.MarketStatus{
			Trend:      model.TrendNeutral,
			TrendLabel: "無法取得大盤資料",
		}
	}

	candles := chart.Candles
	n := len(candles)
	price := candles[n-1].Close

	closes := make([]float64, n)
	for i, c := range candles {
		closes[i] = c.Close
	}
	ma20 := simpleMA(closes, 20)
	ma60 := simpleMA(closes, 60)
	ma120 := simpleMA(closes, 120)

	trend := model.TrendNeutral
	label := "盤整"
	if price > ma60 && ma20 > ma60 {
		trend = model.TrendBull
		label = "多頭排列（適合做多）"
	} else if price < ma60 && ma20 < ma60 {
		trend = model.TrendBear
		label = "空頭排列（建議觀望或搶反彈限買一檔）"
	}

	return model.MarketStatus{
		IndexPrice: roundTo2(price),
		MA20:       roundTo2(ma20),
		MA60:       roundTo2(ma60),
		MA120:      roundTo2(ma120),
		Trend:      trend,
		TrendLabel: label,
	}
}

// simpleMA calculates simple moving average of the last N values
func simpleMA(data []float64, period int) float64 {
	n := len(data)
	if n < period {
		return 0
	}
	sum := 0.0
	for i := n - period; i < n; i++ {
		sum += data[i]
	}
	return sum / float64(period)
}

// SortElitePickByScore sorts by score descending
func SortElitePickByScore(stocks []model.ElitePickAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}
