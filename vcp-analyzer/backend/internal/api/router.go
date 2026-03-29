package api

import (
	"net/http"

	"vcp-analyzer/internal/api/handlers"
	"vcp-analyzer/internal/service"
)

// corsMiddleware adds CORS headers to every response.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// NewRouter wires all HTTP routes and returns the root handler.
func NewRouter() http.Handler {
	ds := service.NewYahooFinance()
	scanner := service.NewGapScanner()

	stockH := handlers.NewStockHandler(ds, scanner)
	gapH := handlers.NewGapHandler(ds, scanner)

	mux := http.NewServeMux()

	// Gap scan (scans full market)
	mux.HandleFunc("/api/gap/scan", gapH.Scan)

	// Per-stock endpoints
	mux.HandleFunc("/api/stock/", func(w http.ResponseWriter, r *http.Request) {
		switch {
		case hasSuffix(r.URL.Path, "/chart"):
			stockH.GetChart(w, r)
		case hasSuffix(r.URL.Path, "/gap"):
			stockH.GetGap(w, r)
		case hasSuffix(r.URL.Path, "/position"):
			gapH.CalcPosition(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// Health check
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	return corsMiddleware(mux)
}

func hasSuffix(path, suffix string) bool {
	return len(path) >= len(suffix) && path[len(path)-len(suffix):] == suffix
}
