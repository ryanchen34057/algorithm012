package handlers

import (
	"log"
	"net/http"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
	"vcp-analyzer/internal/service"
)

type MAPullbackHandler struct {
	ds      *service.YahooFinance
	scanner *service.MAPullbackScanner
}

func NewMAPullbackHandler(ds *service.YahooFinance, scanner *service.MAPullbackScanner) *MAPullbackHandler {
	return &MAPullbackHandler{ds: ds, scanner: scanner}
}

// GET /api/mapullback/scan
func (h *MAPullbackHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	defaults := service.DefaultMAPullbackScanParams()

	params := service.MAPullbackScanParams{
		MinPrice:     parseFloat(q.Get("minPrice"), defaults.MinPrice),
		MaxPrice:     parseFloat(q.Get("maxPrice"), defaults.MaxPrice),
		MinADV20Lots: parseFloat(q.Get("minVolume"), defaults.MinADV20Lots),
		PullbackPct:  parseFloat(q.Get("pullbackPct"), defaults.PullbackPct),
		SlopeDays:    parseInt(q.Get("slopeDays"), defaults.SlopeDays),
		MinScore:     parseFloat(q.Get("minScore"), defaults.MinScore),
	}
	concurrency := parseInt(q.Get("concurrency"), 10)

	log.Printf("[mapullback] fetching stock list (minPrice=%.0f)...", params.MinPrice)
	stocks := service.FetchAllStocks(0, params.MinPrice)
	log.Printf("[mapullback] %d stocks to analyse", len(stocks))

	type result struct {
		analysis *model.MAPullbackAnalysis
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
				log.Printf("[mapullback] %s: %v", symbol, err)
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

	var matched []model.MAPullbackAnalysis
	scannedCount := 0
	for res := range results {
		if res.fetched {
			scannedCount++
		}
		if res.analysis != nil {
			matched = append(matched, *res.analysis)
		}
	}

	log.Printf("[mapullback] scanned %d stocks, found %d MA pullback patterns", scannedCount, len(matched))
	service.SortMAPullbackByScore(matched)

	writeJSON(w, model.MAPullbackScanResult{
		Stocks:    matched,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(matched),
		Scanned:   scannedCount,
	})
}
