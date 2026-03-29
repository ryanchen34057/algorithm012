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
	minVol := parseInt64(q.Get("minVolume"), 500)     // 張/day
	minPrice := parseFloat(q.Get("minPrice"), 10.0)    // TWD
	concurrency := parseInt(q.Get("concurrency"), 10)

	log.Printf("[scan] fetching stock list (minVol=%d張 minPrice=%.0f)...", minVol, minPrice)
	stocks := service.FetchAllStocks(minVol, minPrice)
	log.Printf("[scan] %d stocks to analyse", len(stocks))

	type result struct {
		gap *model.GapAnalysis
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
			gap := h.scanner.Analyze(chart)
			if gap != nil && chineseName != "" {
				gap.Name = chineseName
			}
			results <- result{gap: gap}
		}(s.Symbol, s.Name)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var gapStocks []model.GapAnalysis
	for r := range results {
		if r.gap != nil {
			gapStocks = append(gapStocks, *r.gap)
		}
	}

	service.SortByScore(gapStocks)

	writeJSON(w, model.ScanResult{
		Stocks:    gapStocks,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(gapStocks),
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

	gap := h.scanner.Analyze(chart)
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
