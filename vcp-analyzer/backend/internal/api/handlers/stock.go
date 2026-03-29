package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"vcp-analyzer/internal/service"
)

type StockHandler struct {
	ds      *service.YahooFinance
	scanner *service.GapScanner
}

func NewStockHandler(ds *service.YahooFinance, scanner *service.GapScanner) *StockHandler {
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

	// Override with Chinese name if available
	if cn := service.GetChineseName(symbol); cn != "" {
		chart.Name = cn
	}

	writeJSON(w, chart)
}

// GET /api/stock/{symbol}/gap
// Returns gap analysis for a single stock
func (h *StockHandler) GetGap(w http.ResponseWriter, r *http.Request) {
	symbol := extractSymbol(r.URL.Path, "/api/stock/", "/gap")
	if symbol == "" {
		http.Error(w, "missing symbol", http.StatusBadRequest)
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

	if cn := service.GetChineseName(symbol); cn != "" {
		gap.Name = cn
	}

	writeJSON(w, gap)
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
