package handlers

import (
	"log"
	"net/http"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
	"vcp-analyzer/internal/service"
)

type ElitePickHandler struct {
	ds      *service.YahooFinance
	scanner *service.ElitePickScanner
}

func NewElitePickHandler(ds *service.YahooFinance, scanner *service.ElitePickScanner) *ElitePickHandler {
	return &ElitePickHandler{ds: ds, scanner: scanner}
}

// GET /api/elitepick/scan
func (h *ElitePickHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	defaults := service.DefaultElitePickScanParams()

	params := service.ElitePickScanParams{
		MinPrice:        parseFloat(q.Get("minPrice"), defaults.MinPrice),
		MaxPrice:        parseFloat(q.Get("maxPrice"), defaults.MaxPrice),
		MinADV20Lots:    parseFloat(q.Get("minVolume"), defaults.MinADV20Lots),
		VolShrinkMax:    parseFloat(q.Get("volShrinkMax"), defaults.VolShrinkMax),
		NearHighPct:     parseFloat(q.Get("nearHighPct"), defaults.NearHighPct),
		RangeMaxPct:     parseFloat(q.Get("rangeMaxPct"), defaults.RangeMaxPct),
		LookbackDays:    parseInt(q.Get("lookbackDays"), defaults.LookbackDays),
		MaxLossPerTrade: parseFloat(q.Get("maxLoss"), defaults.MaxLossPerTrade),
		MinScore:        parseFloat(q.Get("minScore"), defaults.MinScore),
	}
	concurrency := parseInt(q.Get("concurrency"), 10)

	// Step 1: Check market trend
	log.Printf("[elitepick] checking market trend...")
	marketStatus := h.scanner.CheckMarket(h.ds)
	log.Printf("[elitepick] market trend: %s (%s)", marketStatus.Trend, marketStatus.TrendLabel)

	// Step 2: Fetch and scan stocks
	log.Printf("[elitepick] fetching stock list (minPrice=%.0f)...", params.MinPrice)
	stocks := service.FetchAllStocks(0, params.MinPrice)
	log.Printf("[elitepick] %d stocks to analyse", len(stocks))

	type result struct {
		analysis *model.ElitePickAnalysis
		fetched  bool
	}

	results := make(chan result, len(stocks))
	sem := make(chan struct{}, concurrency)

	var wg sync.WaitGroup
	for _, s := range stocks {
		wg.Add(1)
		go func(symbol, chineseName string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			chart, err := h.ds.FetchHistory(symbol)
			if err != nil {
				log.Printf("[elitepick] %s: %v", symbol, err)
				results <- result{}
				return
			}
			analysis := h.scanner.Analyze(chart, params)
			if analysis != nil && chineseName != "" {
				analysis.Name = chineseName
			}
			results <- result{analysis: analysis, fetched: true}
		}(s.Symbol, s.Name)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var matched []model.ElitePickAnalysis
	scannedCount := 0
	for res := range results {
		if res.fetched {
			scannedCount++
		}
		if res.analysis != nil {
			matched = append(matched, *res.analysis)
		}
	}

	log.Printf("[elitepick] scanned %d stocks, found %d elite picks", scannedCount, len(matched))
	service.SortElitePickByScore(matched)

	writeJSON(w, model.ElitePickScanResult{
		Stocks:    matched,
		Market:    marketStatus,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(matched),
		Scanned:   scannedCount,
	})
}
