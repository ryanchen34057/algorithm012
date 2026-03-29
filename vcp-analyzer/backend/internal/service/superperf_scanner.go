package service

import (
	"math"
	"sort"
	"strings"

	"vcp-analyzer/internal/model"
)

type SuperPerfScanParams struct {
	MinPrice     float64 // default 10
	MaxPrice     float64 // default 9999
	MinADV20Lots float64 // default 200
	GainPeriod   string  // "1d", "1w", "1m", "3m", "6m", "ytd" — sort by this gain, default "3m"
	MinGainPct   float64 // minimum gain % to include, default 0
	MarketFilter string  // "all", "listed", "otc", default "all"
}

func DefaultSuperPerfScanParams() SuperPerfScanParams {
	return SuperPerfScanParams{
		MinPrice:     10,
		MaxPrice:     9999,
		MinADV20Lots: 200,
		GainPeriod:   "3m",
		MinGainPct:   0,
		MarketFilter: "all",
	}
}

type SuperPerfScanner struct{}

func NewSuperPerfScanner() *SuperPerfScanner { return &SuperPerfScanner{} }

// AnalyzeAll processes all charts and returns ranked results + industry heatmap.
// Unlike other scanners, this one needs all results together for RS ranking.
func (s *SuperPerfScanner) AnalyzeAll(
	charts []*model.StockChartData,
	params SuperPerfScanParams,
) ([]model.SuperPerfAnalysis, []model.IndustryHeat) {
	// Phase 1: Calculate gains for all stocks
	type intermediate struct {
		chart  *model.StockChartData
		gain1d, gain1w, gain1m, gain3m, gain6m, gainYTD float64
		price  float64
		adv20  float64
	}
	var pool []intermediate

	for _, chart := range charts {
		n := len(chart.Candles)
		if n < 201 {
			continue
		}
		today := chart.Candles[n-1]
		price := chart.LatestPrice
		if price == 0 {
			price = today.Close
		}
		if price < params.MinPrice || price > params.MaxPrice {
			continue
		}
		adv20 := avgVolumeN(chart.Candles, 20) / 1000.0
		if adv20 < params.MinADV20Lots {
			continue
		}

		// Market filter
		market := "上市"
		if strings.HasSuffix(chart.Symbol, ".TWO") {
			market = "上櫃"
		}
		if params.MarketFilter == "listed" && market == "上櫃" {
			continue
		}
		if params.MarketFilter == "otc" && market == "上市" {
			continue
		}

		// Calculate gains
		gain1d := calcGain(chart.Candles, 1, price)
		gain1w := calcGain(chart.Candles, 5, price)
		gain1m := calcGain(chart.Candles, 20, price)
		gain3m := calcGain(chart.Candles, 60, price)
		gain6m := calcGain(chart.Candles, 120, price)
		gainYTD := calcGainYTD(chart.Candles, price)

		// Min gain filter
		sortGain := gain3m
		switch params.GainPeriod {
		case "1d":
			sortGain = gain1d
		case "1w":
			sortGain = gain1w
		case "1m":
			sortGain = gain1m
		case "6m":
			sortGain = gain6m
		case "ytd":
			sortGain = gainYTD
		}
		if sortGain < params.MinGainPct {
			continue
		}

		pool = append(pool, intermediate{
			chart: chart, gain1d: gain1d, gain1w: gain1w,
			gain1m: gain1m, gain3m: gain3m,
			gain6m: gain6m, gainYTD: gainYTD,
			price: price, adv20: adv20,
		})
	}

	if len(pool) == 0 {
		return nil, nil
	}

	// Phase 2: Sort by gain for RS ranking
	sortKey := params.GainPeriod
	sort.Slice(pool, func(i, j int) bool {
		switch sortKey {
		case "1d":
			return pool[i].gain1d > pool[j].gain1d
		case "1w":
			return pool[i].gain1w > pool[j].gain1w
		case "1m":
			return pool[i].gain1m > pool[j].gain1m
		case "6m":
			return pool[i].gain6m > pool[j].gain6m
		case "ytd":
			return pool[i].gainYTD > pool[j].gainYTD
		default:
			return pool[i].gain3m > pool[j].gain3m
		}
	})

	// Phase 3: Score each stock
	var results []model.SuperPerfAnalysis
	for rank, item := range pool {
		analysis := s.scoreStock(item.chart, item.price, item.adv20,
			item.gain1d, item.gain1w, item.gain1m, item.gain3m, item.gain6m, item.gainYTD,
			rank, len(pool))
		if analysis != nil {
			results = append(results, *analysis)
		}
	}

	// Phase 4: Build industry heatmap
	industryMap := map[string]*industryAgg{}
	for _, r := range results {
		agg, ok := industryMap[r.Industry]
		if !ok {
			agg = &industryAgg{industry: r.Industry}
			industryMap[r.Industry] = agg
		}
		agg.gains1m = append(agg.gains1m, r.Gain1M)
		agg.gains3m = append(agg.gains3m, r.Gain3M)
		agg.names = append(agg.names, r.Name)
	}

	var industries []model.IndustryHeat
	for _, agg := range industryMap {
		ih := model.IndustryHeat{
			Industry:   agg.industry,
			AvgGain1M:  roundTo2(avgFloat(agg.gains1m)),
			AvgGain3M:  roundTo2(avgFloat(agg.gains3m)),
			StockCount: len(agg.gains1m),
		}
		// Top 3 stocks by name
		topN := 3
		if len(agg.names) < topN {
			topN = len(agg.names)
		}
		ih.TopStocks = agg.names[:topN]
		industries = append(industries, ih)
	}
	sort.Slice(industries, func(i, j int) bool {
		return industries[i].AvgGain1M > industries[j].AvgGain1M
	})

	return results, industries
}

type industryAgg struct {
	industry string
	gains1m  []float64
	gains3m  []float64
	names    []string
}

func (s *SuperPerfScanner) scoreStock(
	chart *model.StockChartData, price, adv20,
	gain1d, gain1w, gain1m, gain3m, gain6m, gainYTD float64,
	rank, total int,
) *model.SuperPerfAnalysis {
	candles := chart.Candles
	n := len(candles)
	today := candles[n-1]

	market := "上市"
	if strings.HasSuffix(chart.Symbol, ".TWO") {
		market = "上櫃"
	}
	industry := GetIndustry(chart.Symbol, chart.Name)
	conceptTag := GetConceptTag(chart.Symbol)

	// MA values
	ma50, ma150, ma200 := 0.0, 0.0, 0.0
	if len(chart.MA50) >= n {
		ma50 = chart.MA50[n-1]
	}
	if len(chart.MA150) >= n {
		ma150 = chart.MA150[n-1]
	}
	if len(chart.MA200) >= n {
		ma200 = chart.MA200[n-1]
	}

	// 52-week high/low
	lookback := 252
	if lookback > n {
		lookback = n
	}
	high52w, low52w := 0.0, math.MaxFloat64
	for i := n - lookback; i < n; i++ {
		if candles[i].High > high52w {
			high52w = candles[i].High
		}
		if candles[i].Low < low52w {
			low52w = candles[i].Low
		}
	}

	// ── VCP Scoring ──

	// 1. Trend (20 pts): price > MA50 > MA200, uptrend
	trendScore := 0.0
	if ma50 > 0 && ma200 > 0 {
		if price > ma50 && ma50 > ma200 {
			trendScore = 14
			if ma150 > 0 && ma50 > ma150 && ma150 > ma200 {
				trendScore = 20 // Full alignment
			}
		} else if price > ma200 {
			trendScore = 8
		} else {
			trendScore = 2
		}
	}

	// 2. Volatility contraction (30 pts)
	// Divide last 60 bars into 3 segments of 20, compare ATR/range
	contractionScore := 0.0
	if n >= 60 {
		ranges := make([]float64, 3)
		for seg := 0; seg < 3; seg++ {
			start := n - 60 + seg*20
			end := start + 20
			hi, lo := candles[start].High, candles[start].Low
			for i := start + 1; i < end; i++ {
				if candles[i].High > hi {
					hi = candles[i].High
				}
				if candles[i].Low < lo {
					lo = candles[i].Low
				}
			}
			if lo > 0 {
				ranges[seg] = (hi - lo) / lo * 100
			}
		}
		// Ideal: each segment range is smaller (contracting)
		if ranges[0] > 0 && ranges[1] > 0 && ranges[2] > 0 {
			if ranges[2] < ranges[1] && ranges[1] < ranges[0] {
				contractionScore = 30 // Perfect contraction
			} else if ranges[2] < ranges[0] {
				ratio := ranges[2] / ranges[0]
				if ratio < 0.4 {
					contractionScore = 25
				} else if ratio < 0.6 {
					contractionScore = 20
				} else if ratio < 0.8 {
					contractionScore = 15
				} else {
					contractionScore = 8
				}
			} else {
				contractionScore = 3 // Expanding — not VCP
			}
		}
	}

	// 3. Volume dry-up (20 pts)
	volDryUpScore := 0.0
	if n >= 60 {
		earlyVol := avgVolumeN(candles[n-60:n-20], 20)
		recentVol := avgVolumeN(candles[n-20:], 20)
		if earlyVol > 0 {
			volRatio := recentVol / earlyVol
			if volRatio < 0.5 {
				volDryUpScore = 20
			} else if volRatio < 0.65 {
				volDryUpScore = 16
			} else if volRatio < 0.8 {
				volDryUpScore = 12
			} else if volRatio < 1.0 {
				volDryUpScore = 8
			} else {
				volDryUpScore = 3
			}
		}
	}

	// 4. Near pivot (15 pts): how close to consolidation high
	pivotScore := 0.0
	// Pivot = highest high in last 30 bars (consolidation ceiling)
	pivotPrice := 0.0
	for i := n - 30; i < n; i++ {
		if candles[i].High > pivotPrice {
			pivotPrice = candles[i].High
		}
	}
	if pivotPrice > 0 {
		distToPivot := (pivotPrice - price) / pivotPrice * 100
		if distToPivot <= 0 {
			pivotScore = 15 // At or above pivot
		} else if distToPivot < 2 {
			pivotScore = 12
		} else if distToPivot < 5 {
			pivotScore = 8
		} else if distToPivot < 10 {
			pivotScore = 4
		} else {
			pivotScore = 1
		}
	}

	// 5. RS ranking (15 pts): based on percentile rank
	rsScore := 0.0
	if total > 0 {
		percentile := 1.0 - float64(rank)/float64(total) // 1.0 = top, 0.0 = bottom
		if percentile >= 0.95 {
			rsScore = 15
		} else if percentile >= 0.90 {
			rsScore = 13
		} else if percentile >= 0.80 {
			rsScore = 11
		} else if percentile >= 0.70 {
			rsScore = 9
		} else if percentile >= 0.50 {
			rsScore = 6
		} else {
			rsScore = 3
		}
	}

	vcpScore := roundTo2(math.Min(trendScore+contractionScore+volDryUpScore+pivotScore+rsScore, 100))

	// ── Trade plan ──
	entryPrice := price
	// Stop loss: below the recent consolidation low (last 20 bars)
	stopLoss := price
	for i := n - 20; i < n; i++ {
		if candles[i].Low < stopLoss {
			stopLoss = candles[i].Low
		}
	}
	stopLoss = roundTo2(stopLoss * 0.99) // 1% below
	if stopLoss >= entryPrice {
		stopLoss = entryPrice * 0.95
	}

	risk := entryPrice - stopLoss
	target := roundTo2(entryPrice + 2*risk)
	targetLabel := "預設 2:1 風報比"

	// Check if near 52w high
	if high52w > 0 && price >= high52w*0.95 {
		target = roundTo2(entryPrice + 3*risk)
		targetLabel = "接近52週高，潛力大"
	}

	rr := 0.0
	if risk > 0 {
		rr = (target - entryPrice) / risk
	}

	return &model.SuperPerfAnalysis{
		Symbol:       chart.Symbol,
		Name:         chart.Name,
		Market:       market,
		Industry:     industry,
		ConceptTag:   conceptTag,
		CurrentPrice: roundTo2(price),
		Gain1D:       roundTo2(gain1d),
		Gain1W:       roundTo2(gain1w),
		Gain1M:       roundTo2(gain1m),
		Gain3M:       roundTo2(gain3m),
		Gain6M:       roundTo2(gain6m),
		GainYTD:      roundTo2(gainYTD),
		VCPScore:          vcpScore,
		TrendScore:        roundTo2(trendScore),
		ContractionScore:  roundTo2(contractionScore),
		VolDryUpScore:     roundTo2(volDryUpScore),
		PivotScore:        roundTo2(pivotScore),
		RSScore:           roundTo2(rsScore),
		MA50:         roundTo2(ma50),
		MA150:        roundTo2(ma150),
		MA200:        roundTo2(ma200),
		High52W:      roundTo2(high52w),
		Low52W:       roundTo2(low52w),
		ADV20:        roundTo2(adv20),
		PivotPrice:   roundTo2(pivotPrice),
		StopLoss:     stopLoss,
		EntryPrice:   roundTo2(entryPrice),
		Target:       target,
		TargetLabel:  targetLabel,
		RewardRisk:   roundTo2(rr),
		TodayVolume:  today.Volume,
	}
}

// ── Helpers ──

func calcGain(candles []model.OHLCV, barsAgo int, currentPrice float64) float64 {
	n := len(candles)
	idx := n - 1 - barsAgo
	if idx < 0 {
		idx = 0
	}
	refPrice := candles[idx].Close
	if refPrice <= 0 {
		return 0
	}
	return (currentPrice - refPrice) / refPrice * 100
}

func calcGainYTD(candles []model.OHLCV, currentPrice float64) float64 {
	// Find the first trading day of the current year
	n := len(candles)
	if n == 0 {
		return 0
	}
	currentYear := candles[n-1].Date[:4]
	for i := 0; i < n; i++ {
		if len(candles[i].Date) >= 4 && candles[i].Date[:4] == currentYear {
			refPrice := candles[i].Close
			if refPrice <= 0 {
				return 0
			}
			return (currentPrice - refPrice) / refPrice * 100
		}
	}
	return 0
}

func avgFloat(s []float64) float64 {
	if len(s) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range s {
		sum += v
	}
	return sum / float64(len(s))
}

// SortSuperPerfByGain sorts by the specified gain period descending
func SortSuperPerfByGain(stocks []model.SuperPerfAnalysis, period string) {
	sort.Slice(stocks, func(i, j int) bool {
		switch period {
		case "1d":
			return stocks[i].Gain1D > stocks[j].Gain1D
		case "1w":
			return stocks[i].Gain1W > stocks[j].Gain1W
		case "1m":
			return stocks[i].Gain1M > stocks[j].Gain1M
		case "6m":
			return stocks[i].Gain6M > stocks[j].Gain6M
		case "ytd":
			return stocks[i].GainYTD > stocks[j].GainYTD
		default:
			return stocks[i].Gain3M > stocks[j].Gain3M
		}
	})
}
