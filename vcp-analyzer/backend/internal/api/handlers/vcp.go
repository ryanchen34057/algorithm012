package handlers

import (
	"encoding/json"
	"net/http"
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
// Scans all stocks in TWSEStockList concurrently and returns ranked VCP results.
// Query param: ?minScore=60  (default 50)
func (h *VCPHandler) Scan(w http.ResponseWriter, r *http.Request) {
	stocks := service.TWSEStockList()

	type result struct {
		vcp *model.VCPAnalysis
		err error
	}

	results := make(chan result, len(stocks))
	sem := make(chan struct{}, 5) // max 5 concurrent Yahoo Finance requests

	var wg sync.WaitGroup
	for _, s := range stocks {
		wg.Add(1)
		go func(symbol, name string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			chart, err := h.ds.FetchHistory(symbol)
			if err != nil {
				results <- result{err: err}
				return
			}
			vcp := h.scanner.Analyze(chart)
			if vcp != nil {
				results <- result{vcp: vcp}
			} else {
				results <- result{}
			}
		}(s.Symbol, s.Name)
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
// Returns position sizing recommendation
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

	position := service.CalcPosition(vcp, req.MaxLoss)
	writeJSON(w, position)
}

func extractSymbolFromPath(path string) string {
	// Path: /api/stock/{symbol}/position
	path = strings.TrimPrefix(path, "/api/stock/")
	path = strings.TrimSuffix(path, "/position")
	return path
}
