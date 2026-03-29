package handlers

import (
	"log"
	"net/http"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
	"vcp-analyzer/internal/service"
)

type SuperPerfHandler struct {
	ds      *service.YahooFinance
	scanner *service.SuperPerfScanner
}

func NewSuperPerfHandler(ds *service.YahooFinance, scanner *service.SuperPerfScanner) *SuperPerfHandler {
	return &SuperPerfHandler{ds: ds, scanner: scanner}
}

// GET /api/superperf/scan
func (h *SuperPerfHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	defaults := service.DefaultSuperPerfScanParams()

	params := service.SuperPerfScanParams{
		MinPrice:     parseFloat(q.Get("minPrice"), defaults.MinPrice),
		MaxPrice:     parseFloat(q.Get("maxPrice"), defaults.MaxPrice),
		MinADV20Lots: parseFloat(q.Get("minVolume"), defaults.MinADV20Lots),
		GainPeriod:   q.Get("gainPeriod"),
		MinGainPct:   parseFloat(q.Get("minGainPct"), defaults.MinGainPct),
		MarketFilter: q.Get("marketFilter"),
	}
	if params.GainPeriod == "" {
		params.GainPeriod = defaults.GainPeriod
	}
	if params.MarketFilter == "" {
		params.MarketFilter = defaults.MarketFilter
	}
	concurrency := parseInt(q.Get("concurrency"), 10)

	log.Printf("[superperf] fetching stock list (minPrice=%.0f)...", params.MinPrice)
	stocks := service.FetchAllStocks(0, params.MinPrice)
	log.Printf("[superperf] %d stocks to analyse", len(stocks))

	// Fetch all charts concurrently
	type chartResult struct {
		chart *model.StockChartData
	}
	chartsCh := make(chan chartResult, len(stocks))
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
				log.Printf("[superperf] %s: %v", symbol, err)
				chartsCh <- chartResult{}
				return
			}
			if chineseName != "" {
				chart.Name = chineseName
			}
			chartsCh <- chartResult{chart: chart}
		}(s.Symbol, s.Name)
	}

	go func() {
		wg.Wait()
		close(chartsCh)
	}()

	var charts []*model.StockChartData
	scannedCount := 0
	for res := range chartsCh {
		scannedCount++
		if res.chart != nil {
			charts = append(charts, res.chart)
		}
	}

	log.Printf("[superperf] fetched %d charts, running analysis...", len(charts))

	// Run the analysis on all charts together (needed for RS ranking)
	matched, industries := h.scanner.AnalyzeAll(charts, params)

	log.Printf("[superperf] scanned %d stocks, found %d super perf stocks, %d industries",
		scannedCount, len(matched), len(industries))

	writeJSON(w, model.SuperPerfScanResult{
		Stocks:     matched,
		Industries: industries,
		ScannedAt:  time.Now().Format(time.RFC3339),
		Total:      len(matched),
		Scanned:    scannedCount,
	})
}
