package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
	"vcp-analyzer/internal/service"
)

type GapHandler struct {
	ds      *service.YahooFinance
	scanner *service.GapScanner
}

func NewGapHandler(ds *service.YahooFinance, scanner *service.GapScanner) *GapHandler {
	return &GapHandler{ds: ds, scanner: scanner}
}

// GET /api/gap/scan
//
// Query params:
//
//	minVolume   int     minimum daily trading volume in 張 (lots), default 500
//	minPrice    float64 minimum stock price in TWD, default 10
//	concurrency int     max parallel Yahoo Finance requests, default 10
//
// Flow:
//  1. Fetch all TWSE + TPEx stocks via Open Data API
//  2. Pre-filter by volume & price
//  3. Concurrently fetch Yahoo Finance history & run gap scanner
//  4. Return ranked results
func (h *GapHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	defaults := service.DefaultGapScanParams()

	params := service.GapScanParams{
		MinPrice:           parseFloat(q.Get("minPrice"), defaults.MinPrice),
		MaxPrice:           parseFloat(q.Get("maxPrice"), defaults.MaxPrice),
		MinADV20Lots:       parseFloat(q.Get("minVolume"), defaults.MinADV20Lots),
		MinTodayVolLots:    parseFloat(q.Get("minTodayVolume"), defaults.MinTodayVolLots),
		MinGapPct:          parseFloat(q.Get("minGapPct"), defaults.MinGapPct),
		MaxGapPct:          parseFloat(q.Get("maxGapPct"), defaults.MaxGapPct),
		StrictGap:          service.ParseBoolParam(q.Get("strictGap"), defaults.StrictGap),
		RequireCandleColor: service.ParseBoolParam(q.Get("requireCandle"), defaults.RequireCandleColor),
		RequireBothMA:      service.ParseBoolParam(q.Get("requireBothMA"), defaults.RequireBothMA),
	}
	concurrency := parseInt(q.Get("concurrency"), 10)

	// Pre-filter uses a relaxed volume threshold: min(user's ADV20, 100) so
	// the stock list isn't wiped out on weekends when TWSE/TPEx return zero or
	// stale volume. The real ADV20 check happens inside the scanner with Yahoo data.
	preFilterVol := int64(params.MinADV20Lots)
	if preFilterVol > 100 {
		preFilterVol = 100
	}
	log.Printf("[scan] fetching stock list (preFilterVol=%d張 minPrice=%.0f)...", preFilterVol, params.MinPrice)
	stocks := service.FetchAllStocks(preFilterVol, params.MinPrice)
	log.Printf("[scan] %d stocks to analyse", len(stocks))

	type result struct {
		gap     *model.GapAnalysis
		fetched bool // true if Yahoo Finance data was successfully fetched
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
				log.Printf("[scan] %s: %v", symbol, err)
				results <- result{}
				return
			}
			gap := h.scanner.Analyze(chart, params)
			if gap != nil && chineseName != "" {
				gap.Name = chineseName
			}
			results <- result{gap: gap, fetched: true}
		}(s.Symbol, s.Name)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var gapStocks []model.GapAnalysis
	scannedCount := 0
	for r := range results {
		if r.fetched {
			scannedCount++
		}
		if r.gap != nil {
			gapStocks = append(gapStocks, *r.gap)
		}
	}

	log.Printf("[scan] scanned %d stocks, found %d gap patterns", scannedCount, len(gapStocks))
	service.SortByScore(gapStocks)

	writeJSON(w, model.ScanResult{
		Stocks:    gapStocks,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(gapStocks),
		Scanned:   scannedCount,
	})
}

// POST /api/stock/{symbol}/position
// Body: { "maxLoss": 10000 }
func (h *GapHandler) CalcPosition(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	symbol := extractSymbolFromPath(r.URL.Path)
	if symbol == "" {
		http.Error(w, "missing symbol", http.StatusBadRequest)
		return
	}

	var req model.PositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.MaxLoss <= 0 {
		http.Error(w, "maxLoss must be > 0", http.StatusBadRequest)
		return
	}

	chart, err := h.ds.FetchHistory(symbol)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	gap := h.scanner.Analyze(chart, service.DefaultGapScanParams())
	if gap == nil {
		http.Error(w, "no gap pattern detected", http.StatusNotFound)
		return
	}

	writeJSON(w, service.CalcPosition(gap, req.MaxLoss))
}

func extractSymbolFromPath(path string) string {
	path = strings.TrimPrefix(path, "/api/stock/")
	path = strings.TrimSuffix(path, "/position")
	return path
}

func parseInt64(s string, def int64) int64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return v
}

func parseFloat(s string, def float64) float64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return def
	}
	return v
}

func parseInt(s string, def int) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}
