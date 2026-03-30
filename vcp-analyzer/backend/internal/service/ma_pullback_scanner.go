package service

import (
	"math"
	"sort"
	"strings"
	"time"

	"vcp-analyzer/internal/model"
)

type MAPullbackScanParams struct {
	MinPrice     float64 // default 15
	MaxPrice     float64 // default 9999
	MinADV20Lots float64 // default 300
	PullbackPct  float64 // 日線距MA20多近才算「回踩」(%)，default 3
	SlopeDays    int     // 判斷MA斜率用幾根K線，default 5
	MinScore     float64 // 最低分數，default 50
}

func DefaultMAPullbackScanParams() MAPullbackScanParams {
	return MAPullbackScanParams{
		MinPrice:     15,
		MaxPrice:     9999,
		MinADV20Lots: 300,
		PullbackPct:  3,
		SlopeDays:    5,
		MinScore:     40,
	}
}

type MAPullbackScanner struct{}

func NewMAPullbackScanner() *MAPullbackScanner { return &MAPullbackScanner{} }

func (s *MAPullbackScanner) Analyze(chart *model.StockChartData, params MAPullbackScanParams) *model.MAPullbackAnalysis {
	candles := chart.Candles
	n := len(candles)
	if n < 200 { // need at least ~200 daily candles for daily MA200
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

	// ── Daily MAs ──
	dailyCloses := make([]float64, n)
	for i, c := range candles {
		dailyCloses[i] = c.Close
	}
	dMA20 := simpleMA(dailyCloses, 20)
	dMA200 := simpleMA(dailyCloses, 200)
	if dMA20 <= 0 || dMA200 <= 0 {
		return nil
	}
	dMA20Slope := maSlope(dailyCloses, 20, params.SlopeDays)
	dDistMA20 := (price - dMA20) / dMA20 * 100

	// ── Weekly candles (from daily) ──
	weeklyCandles := toDailyToWeekly(candles)
	if len(weeklyCandles) < 20 { // need at least 20 for weekly MA20
		return nil
	}
	weeklyCloses := extractCloses(weeklyCandles)
	wn := len(weeklyCloses)
	wMA20 := simpleMA(weeklyCloses, 20)
	wMA200 := 0.0
	if wn >= 200 {
		wMA200 = simpleMA(weeklyCloses, 200)
	}
	wMA20Slope := maSlope(weeklyCloses, 20, params.SlopeDays)
	wClose := weeklyCloses[wn-1]
	wDistMA20 := 0.0
	if wMA20 > 0 {
		wDistMA20 = (wClose - wMA20) / wMA20 * 100
	}

	// ── Monthly candles (from daily) ──
	monthlyCandles := toDailyToMonthly(candles)
	monthlyCloses := extractCloses(monthlyCandles)
	mn := len(monthlyCloses)
	mMA20 := 0.0
	mMA200 := 0.0
	mMA20Slope := 0.0
	mClose := 0.0
	mDistMA20 := 0.0
	hasMonthly := mn >= 12 // 至少 12 個月才看月線
	if hasMonthly {
		if mn >= 20 {
			mMA20 = simpleMA(monthlyCloses, 20)
		} else {
			// 不足 20 個月就用全部平均當近似
			mMA20 = simpleMA(monthlyCloses, mn)
		}
		if mn >= 200 {
			mMA200 = simpleMA(monthlyCloses, 200)
		}
		if mn >= 20 {
			mMA20Slope = maSlope(monthlyCloses, 20, min(params.SlopeDays, mn-20))
		}
		mClose = monthlyCloses[mn-1]
		if mMA20 > 0 {
			mDistMA20 = (mClose - mMA20) / mMA20 * 100
		}
	}

	// ── Check conditions per timeframe ──
	// 日線：MA20向上 + 價格在MA20附近或之上 + MA20>MA200
	dailyOK := dMA20Slope > 0 && price >= dMA20*0.97 && dMA20 > dMA200
	// 週線：MA20向上 + 週收在MA20附近或之上
	weeklyOK := wMA20 > 0 && wMA20Slope > 0 && wClose >= wMA20*0.97 && (wMA200 <= 0 || wMA20 > wMA200)
	// 月線：有資料就判斷，沒資料就不列入硬篩（用評分扣分）
	monthlyOK := false
	if hasMonthly && mMA20 > 0 {
		monthlyOK = mMA20Slope > 0 && mClose >= mMA20*0.97 && (mMA200 <= 0 || mMA20 > mMA200)
	}
	allOK := dailyOK && weeklyOK && (monthlyOK || !hasMonthly)

	// ── Scoring ──
	score := calcMAPullbackScore(
		dMA20Slope, wMA20Slope, mMA20Slope,
		dDistMA20, wDistMA20, mDistMA20,
		dailyOK, weeklyOK, monthlyOK,
		price, dMA20, dMA200,
		params.PullbackPct,
		hasMonthly,
	)

	if score < params.MinScore {
		return nil
	}

	// ── Trade plan ──
	// Stop loss: just below daily MA20 or recent low
	stopLoss := roundTo2(dMA20 * 0.98) // 2% below MA20
	stopLabel := "日線MA20下方2%"
	recentLow := price
	for i := n - 10; i < n; i++ {
		if candles[i].Low < recentLow {
			recentLow = candles[i].Low
		}
	}
	if recentLow < stopLoss && recentLow > 0 {
		stopLoss = roundTo2(recentLow * 0.99)
		stopLabel = "近期低點下方1%"
	}
	if stopLoss >= price {
		stopLoss = roundTo2(price * 0.95)
		stopLabel = "預設5%停損"
	}

	risk := price - stopLoss
	target := roundTo2(price + 2*risk)
	targetLabel := "2:1 風報比"
	rr := 0.0
	if risk > 0 {
		rr = roundTo2((target - price) / risk)
	}

	market := "上市"
	if strings.HasSuffix(chart.Symbol, ".TWO") {
		market = "上櫃"
	}

	return &model.MAPullbackAnalysis{
		Symbol:       chart.Symbol,
		Name:         chart.Name,
		Market:       market,
		Industry:     GetIndustry(chart.Symbol, chart.Name),
		ConceptTag:   GetConceptTag(chart.Symbol),
		CurrentPrice: roundTo2(price),

		DailyMA20:      roundTo2(dMA20),
		DailyMA200:     roundTo2(dMA200),
		DailyMA20Slope: roundTo2(dMA20Slope),
		DailyDistMA20:  roundTo2(dDistMA20),

		WeeklyMA20:      roundTo2(wMA20),
		WeeklyMA200:     roundTo2(wMA200),
		WeeklyMA20Slope: roundTo2(wMA20Slope),
		WeeklyDistMA20:  roundTo2(wDistMA20),
		WeeklyClose:     roundTo2(wClose),

		MonthlyMA20:      roundTo2(mMA20),
		MonthlyMA200:     roundTo2(mMA200),
		MonthlyMA20Slope: roundTo2(mMA20Slope),
		MonthlyDistMA20:  roundTo2(mDistMA20),
		MonthlyClose:     roundTo2(mClose),

		DailyOK:   dailyOK,
		WeeklyOK:  weeklyOK,
		MonthlyOK: monthlyOK,
		AllOK:     allOK,

		EntryPrice:  roundTo2(price),
		StopLoss:    stopLoss,
		StopLabel:   stopLabel,
		Target:      target,
		TargetLabel: targetLabel,
		RewardRisk:  rr,

		ADV20:       roundTo2(adv20),
		TodayVolume: today.Volume,
		Score:       score,
	}
}

// ── Scoring ──

func calcMAPullbackScore(
	dSlope, wSlope, mSlope float64,
	dDist, wDist, mDist float64,
	dOK, wOK, mOK bool,
	price, dMA20, dMA200 float64,
	pullbackPct float64,
	hasMonthly bool,
) float64 {
	score := 0.0

	// Timeframe alignment (0-30 pts)
	if dOK {
		score += 12
	}
	if wOK {
		score += 12
	}
	if mOK {
		score += 6
	} else if !hasMonthly {
		// 沒月線資料不扣分，給一半
		score += 3
	}

	// MA20 slopes — steeper uptrend = better (0-15 pts)
	// 日線和週線各 6 pts，月線 3 pts
	for idx, sl := range []float64{dSlope, wSlope, mSlope} {
		maxPt := 6.0
		if idx == 2 {
			maxPt = 3.0
			if !hasMonthly {
				score += 1.5 // 沒月線給一半
				continue
			}
		}
		if sl > 2 {
			score += maxPt
		} else if sl > 1 {
			score += maxPt * 0.8
		} else if sl > 0.3 {
			score += maxPt * 0.6
		} else if sl > 0 {
			score += maxPt * 0.4
		}
	}

	// Daily pullback proximity (0-25 pts): closer to MA20 = better opportunity
	absDist := math.Abs(dDist)
	if absDist <= 1 {
		score += 25 // 貼著MA20
	} else if absDist <= 2 {
		score += 22
	} else if absDist <= pullbackPct {
		score += 18
	} else if absDist <= 5 {
		score += 14
	} else if absDist <= 8 {
		score += 10
	} else {
		score += 5
	}

	// MA20 > MA200 spread (0-10 pts): wider = stronger trend
	if dMA200 > 0 && dMA20 > dMA200 {
		spread := (dMA20 - dMA200) / dMA200 * 100
		if spread > 20 {
			score += 10
		} else if spread > 10 {
			score += 8
		} else if spread > 5 {
			score += 6
		} else {
			score += 4
		}
	}

	// Trend consistency: price > MA20 on all TFs (0-10 pts)
	if dDist > 0 {
		score += 4
	}
	if wDist > 0 {
		score += 4
	}
	if hasMonthly && mDist > 0 {
		score += 2
	} else if !hasMonthly {
		score += 1
	}

	// Bonus: "just touching" MA20 on daily but above on weekly (ideal pullback)
	if dDist >= -1 && dDist <= pullbackPct && wDist > 3 {
		score += 5
	}

	return math.Min(score, 100)
}

// ── Timeframe Conversion ──

type simplifiedCandle struct {
	Close float64
}

func toDailyToWeekly(candles []model.OHLCV) []simplifiedCandle {
	if len(candles) == 0 {
		return nil
	}
	var weekly []simplifiedCandle
	var weekClose float64
	prevYear, prevWeek := 0, 0

	for _, c := range candles {
		y, w := isoWeek(c.Date)
		if prevYear != 0 && (y != prevYear || w != prevWeek) && weekClose > 0 {
			weekly = append(weekly, simplifiedCandle{Close: weekClose})
		}
		weekClose = c.Close
		prevYear, prevWeek = y, w
	}
	if weekClose > 0 {
		weekly = append(weekly, simplifiedCandle{Close: weekClose})
	}
	return weekly
}

func toDailyToMonthly(candles []model.OHLCV) []simplifiedCandle {
	if len(candles) == 0 {
		return nil
	}
	var monthly []simplifiedCandle
	var monthClose float64
	prevMonth := ""

	for _, c := range candles {
		month := ""
		if len(c.Date) >= 7 {
			month = c.Date[:7] // "2024-03"
		}
		if prevMonth != "" && month != prevMonth && monthClose > 0 {
			monthly = append(monthly, simplifiedCandle{Close: monthClose})
		}
		monthClose = c.Close
		prevMonth = month
	}
	if monthClose > 0 {
		monthly = append(monthly, simplifiedCandle{Close: monthClose})
	}
	return monthly
}

func extractCloses(candles []simplifiedCandle) []float64 {
	closes := make([]float64, len(candles))
	for i, c := range candles {
		closes[i] = c.Close
	}
	return closes
}

// isoWeekday returns ISO weekday: 1=Mon..7=Sun
func isoWeekday(date string) int {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 1
	}
	wd := int(t.Weekday()) // 0=Sun..6=Sat
	if wd == 0 {
		return 7
	}
	return wd
}

// isoWeek returns (year, week) for weekly candle grouping
func isoWeek(date string) (int, int) {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 0, 0
	}
	y, w := t.ISOWeek()
	return y, w
}

// maSlope calculates the slope of MA over recent N periods (as %)
func maSlope(closes []float64, maPeriod, slopeDays int) float64 {
	n := len(closes)
	if n < maPeriod+slopeDays {
		return 0
	}
	// MA now
	maNow := simpleMA(closes, maPeriod)
	// MA N days ago
	subset := closes[:n-slopeDays]
	maBack := simpleMA(subset, maPeriod)
	if maBack <= 0 {
		return 0
	}
	return (maNow - maBack) / maBack * 100
}

// SortMAPullbackByScore sorts by score descending
func SortMAPullbackByScore(stocks []model.MAPullbackAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}
