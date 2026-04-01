package handlers

import (
	"log"
	"net/http"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
	"vcp-analyzer/internal/service"
)

type BullPickHandler struct {
	ds      *service.YahooFinance
	scanner *service.BullPickScanner
}

func NewBullPickHandler(ds *service.YahooFinance, scanner *service.BullPickScanner) *BullPickHandler {
	return &BullPickHandler{ds: ds, scanner: scanner}
}

// GET /api/bullpick/scan
func (h *BullPickHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	defaults := service.DefaultBullPickScanParams()

	params := service.BullPickScanParams{
		MinPrice:     parseFloat(q.Get("minPrice"), defaults.MinPrice),
		MaxPrice:     parseFloat(q.Get("maxPrice"), defaults.MaxPrice),
		MinADV20Lots: parseFloat(q.Get("minVolume"), defaults.MinADV20Lots),
		DistHighMax:  parseFloat(q.Get("distHighMax"), defaults.DistHighMax),
		MinScore:     parseFloat(q.Get("minScore"), defaults.MinScore),
	}
	concurrency := parseInt(q.Get("concurrency"), 10)

	// Step 1: Fetch external data (institutional + revenue) concurrently
	log.Printf("[bullpick] fetching institutional & revenue data...")
	client := &http.Client{Timeout: 15 * time.Second}
	h.scanner.FetchExternalData(client)
	log.Printf("[bullpick] institution=%d stocks, revenue=%d stocks",
		h.scanner.InstitutionCount(), h.scanner.RevenueCount())

	// Step 2: Check market trend (reuse elite pick scanner's market check)
	eliteScanner := service.NewElitePickScanner()
	marketStatus := eliteScanner.CheckMarket(h.ds)
	log.Printf("[bullpick] market trend: %s", marketStatus.TrendLabel)

	// Step 3: Fetch and scan stocks
	stocks := service.FetchAllStocks(0, params.MinPrice)
	log.Printf("[bullpick] %d stocks to analyse", len(stocks))

	type result struct {
		analysis *model.BullPickAnalysis
		fetched  bool
	}

	results := make(chan result, len(stocks))
	sem := make(chan struct{}, concurrency)

	var wg sync.WaitGroup
	for _, s := range stocks {
		wg.Add(1)
		go func(symbol, name string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			chart, err := h.ds.FetchHistory(symbol)
			if err != nil {
				results <- result{}
				return
			}
			analysis := h.scanner.Analyze(chart, params)
			if analysis != nil && name != "" {
				analysis.Name = name
			}
			results <- result{analysis: analysis, fetched: true}
		}(s.Symbol, s.Name)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var matched []model.BullPickAnalysis
	scannedCount := 0
	for res := range results {
		if res.fetched {
			scannedCount++
		}
		if res.analysis != nil {
			matched = append(matched, *res.analysis)
		}
	}

	log.Printf("[bullpick] scanned %d stocks, found %d bull picks", scannedCount, len(matched))
	service.SortBullPickByScore(matched)

	writeJSON(w, model.BullPickScanResult{
		Stocks:    matched,
		Market:    marketStatus,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(matched),
		Scanned:   scannedCount,
	})
}
