package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"vcp-analyzer/internal/service"
)

type StockHandler struct {
	ds      *service.YahooFinance
	scanner *service.VCPScanner
}

func NewStockHandler(ds *service.YahooFinance, scanner *service.VCPScanner) *StockHandler {
	return &StockHandler{ds: ds, scanner: scanner}
}

// GET /api/stock/{symbol}/chart
// Returns OHLCV + MA data for charting
func (h *StockHandler) GetChart(w http.ResponseWriter, r *http.Request) {
	symbol := extractSymbol(r.URL.Path, "/api/stock/", "/chart")
	if symbol == "" {
		http.Error(w, "missing symbol", http.StatusBadRequest)
		return
	}

	chart, err := h.ds.FetchHistory(symbol)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, chart)
}

// GET /api/stock/{symbol}/vcp
// Returns VCP analysis for a single stock
func (h *StockHandler) GetVCP(w http.ResponseWriter, r *http.Request) {
	symbol := extractSymbol(r.URL.Path, "/api/stock/", "/vcp")
	if symbol == "" {
		http.Error(w, "missing symbol", http.StatusBadRequest)
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

	writeJSON(w, vcp)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func extractSymbol(path, prefix, suffix string) string {
	path = strings.TrimPrefix(path, prefix)
	path = strings.TrimSuffix(path, suffix)
	return path
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
