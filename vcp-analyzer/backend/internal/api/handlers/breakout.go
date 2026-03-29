package handlers

import (
	"log"
	"net/http"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
	"vcp-analyzer/internal/service"
)

type BreakoutHandler struct {
	ds      *service.YahooFinance
	scanner *service.BreakoutScanner
}

func NewBreakoutHandler(ds *service.YahooFinance, scanner *service.BreakoutScanner) *BreakoutHandler {
	return &BreakoutHandler{ds: ds, scanner: scanner}
}

// GET /api/breakout/scan
func (h *BreakoutHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	defaults := service.DefaultBreakoutScanParams()

	params := service.BreakoutScanParams{
		MinPrice:      parseFloat(q.Get("minPrice"), defaults.MinPrice),
		MaxPrice:      parseFloat(q.Get("maxPrice"), defaults.MaxPrice),
		MinADV20Lots:  parseFloat(q.Get("minVolume"), defaults.MinADV20Lots),
		LookbackDays:  parseInt(q.Get("lookbackDays"), defaults.LookbackDays),
		NearHighPct:   parseFloat(q.Get("nearHighPct"), defaults.NearHighPct),
		PatternFilter: parsePatternFilter(q.Get("pattern")),
		VolumeFilter:  parseVolumeFilter(q.Get("volumeFilter")),
		VolumeFactor:  parseFloat(q.Get("volumeFactor"), defaults.VolumeFactor),
	}
	concurrency := parseInt(q.Get("concurrency"), 10)

	log.Printf("[breakout] fetching stock list (minPrice=%.0f)...", params.MinPrice)
	stocks := service.FetchAllStocks(0, params.MinPrice)
	log.Printf("[breakout] %d stocks to analyse", len(stocks))

	type result struct {
		analysis *model.BreakoutAnalysis
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
				log.Printf("[breakout] %s: %v", symbol, err)
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

	var matched []model.BreakoutAnalysis
	scannedCount := 0
	for res := range results {
		if res.fetched {
			scannedCount++
		}
		if res.analysis != nil {
			matched = append(matched, *res.analysis)
		}
	}

	log.Printf("[breakout] scanned %d stocks, found %d near breakout", scannedCount, len(matched))
	service.SortBreakoutByScore(matched)

	writeJSON(w, model.BreakoutScanResult{
		Stocks:    matched,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(matched),
		Scanned:   scannedCount,
	})
}

func parsePatternFilter(s string) model.PatternType {
	switch s {
	case "w_bottom":
		return model.PatternW
	case "v_bottom":
		return model.PatternV
	default:
		return model.PatternNone
	}
}

func parseVolumeFilter(s string) model.VolumeCondition {
	switch s {
	case "expand":
		return model.VolumeExpand
	case "shrink":
		return model.VolumeShrink
	default:
		return model.VolumeAny
	}
}
