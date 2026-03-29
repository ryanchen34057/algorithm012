package model

// OHLCV represents one day of price data
type OHLCV struct {
	Date   string  `json:"date"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume int64   `json:"volume"`
}

// StockInfo holds basic stock metadata
type StockInfo struct {
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
}

// StockChartData is the full chart payload for a symbol
type StockChartData struct {
	Symbol  string    `json:"symbol"`
	Name    string    `json:"name"`
	Candles []OHLCV   `json:"candles"`
	MA20    []float64 `json:"ma20"`
	MA50    []float64 `json:"ma50"`
	MA150   []float64 `json:"ma150"`
	MA200   []float64 `json:"ma200"`
}
