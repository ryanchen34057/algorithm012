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

type VCPHandler struct {
	ds      *service.YahooFinance
	scanner *service.VCPScanner
}

func NewVCPHandler(ds *service.YahooFinance, scanner *service.VCPScanner) *VCPHandler {
	return &VCPHandler{ds: ds, scanner: scanner}
}

// GET /api/vcp/scan
//
// Query params:
//
//	minVolume  int     minimum daily trading volume in 張 (lots), default 1000
//	minPrice   float64 minimum stock price in TWD, default 10
//	concurrency int   max parallel Yahoo Finance requests, default 10
//
// Flow:
//  1. Fetch all TWSE + TPEx stocks via Open Data API
//  2. Pre-filter by volume & price (already done in FetchAllStocks)
//  3. Concurrently fetch Yahoo Finance history & run VCP scanner
//  4. Return ranked results
func (h *VCPHandler) Scan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	minVol := parseInt64(q.Get("minVolume"), 1000)   // 張/day
	minPrice := parseFloat(q.Get("minPrice"), 10.0)  // TWD
	concurrency := parseInt(q.Get("concurrency"), 10) // parallel requests

	log.Printf("[scan] fetching stock list (minVol=%d張 minPrice=%.0f)...", minVol, minPrice)
	stocks := service.FetchAllStocks(minVol, minPrice)
	log.Printf("[scan] %d stocks to analyse", len(stocks))

	type result struct {
		vcp *model.VCPAnalysis
	}

	results := make(chan result, len(stocks))
	sem := make(chan struct{}, concurrency)

	var wg sync.WaitGroup
	for _, s := range stocks {
		wg.Add(1)
		go func(symbol string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			chart, err := h.ds.FetchHistory(symbol)
			if err != nil {
				log.Printf("[scan] %s: %v", symbol, err)
				results <- result{}
				return
			}
			vcp := h.scanner.Analyze(chart)
			results <- result{vcp: vcp}
		}(s.Symbol)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var vcpStocks []model.VCPAnalysis
	for r := range results {
		if r.vcp != nil {
			vcpStocks = append(vcpStocks, *r.vcp)
		}
	}

	service.SortByScore(vcpStocks)

	writeJSON(w, model.ScanResult{
		Stocks:    vcpStocks,
		ScannedAt: time.Now().Format(time.RFC3339),
		Total:     len(vcpStocks),
	})
}

// POST /api/stock/{symbol}/position
// Body: { "maxLoss": 10000 }
func (h *VCPHandler) CalcPosition(w http.ResponseWriter, r *http.Request) {
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

	vcp := h.scanner.Analyze(chart)
	if vcp == nil {
		http.Error(w, "no VCP pattern detected", http.StatusNotFound)
		return
	}

	writeJSON(w, service.CalcPosition(vcp, req.MaxLoss))
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
