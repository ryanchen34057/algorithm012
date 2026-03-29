package handlers

import (
	"log"
	"net/http"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
	"vcp-analyzer/internal/service"
)

type PeakAttackHandler struct {
	ds      *service.YahooFinance
	scanner *service.PeakAttackScanner
}

func NewPeakAttackHandler(ds *service.YahooFinance, scanner *service.PeakAttackScanner) *PeakAttackHandler {
	return &PeakAttackHandler{ds: ds, scanner: scanner}
}

// GET /api/peakattack/scan
func (h *PeakAttackHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	defaults := service.DefaultPeakAttackScanParams()

	params := service.PeakAttackScanParams{
		MinPrice:        parseFloat(q.Get("minPrice"), defaults.MinPrice),
		MaxPrice:        parseFloat(q.Get("maxPrice"), defaults.MaxPrice),
		MinADV20Lots:    parseFloat(q.Get("minVolume"), defaults.MinADV20Lots),
		MinTodayVolLots: parseFloat(q.Get("minTodayVol"), defaults.MinTodayVolLots),
		PeakRangeMax:    parseFloat(q.Get("peakRangeMax"), defaults.PeakRangeMax),
		MinAttackCount:  parseInt(q.Get("minAttackCount"), defaults.MinAttackCount),
		MinVolRatio:     parseFloat(q.Get("minVolRatio"), defaults.MinVolRatio),
		KDPeriod:        parseInt(q.Get("kdPeriod"), defaults.KDPeriod),
		KDSmooth1:       parseInt(q.Get("kdSmooth1"), defaults.KDSmooth1),
		KDSmooth2:       parseInt(q.Get("kdSmooth2"), defaults.KDSmooth2),
	}
	concurrency := parseInt(q.Get("concurrency"), 10)

	log.Printf("[peakattack] fetching stock list (minPrice=%.0f)...", params.MinPrice)
	stocks := service.FetchAllStocks(0, params.MinPrice)
	log.Printf("[peakattack] %d stocks to analyse", len(stocks))

	type result struct {
		analysis *model.PeakAttackAnalysis
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
				log.Printf("[peakattack] %s: %v", symbol, err)
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

	var matched []model.PeakAttackAnalysis
	scannedCount := 0
	for res := range results {
		if res.fetched {
			scannedCount++
		}
		if res.analysis != nil {
			matched = append(matched, *res.analysis)
		}
	}

	log.Printf("[peakattack] scanned %d stocks, found %d peak attack patterns", scannedCount, len(matched))
	service.SortPeakAttackByScore(matched)

	writeJSON(w, model.PeakAttackScanResult{
		Stocks:    matched,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(matched),
		Scanned:   scannedCount,
	})
}
