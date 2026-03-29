package model

// Contraction represents one VCP tightening phase
type Contraction struct {
	Index      int     `json:"index"`       // which contraction (1, 2, 3...)
	HighDate   string  `json:"highDate"`
	HighPrice  float64 `json:"highPrice"`
	LowDate    string  `json:"lowDate"`
	LowPrice   float64 `json:"lowPrice"`
	Depth      float64 `json:"depth"`       // % pullback
	AvgVolume  float64 `json:"avgVolume"`   // average volume during contraction
}

// VCPAnalysis is the full VCP result for one stock
type VCPAnalysis struct {
	Symbol       string        `json:"symbol"`
	Name         string        `json:"name"`
	Score        float64       `json:"score"`        // 0-100
	Contractions []Contraction `json:"contractions"`
	PivotPrice   float64       `json:"pivotPrice"`   // breakout level
	EntryPrice   float64       `json:"entryPrice"`   // pivot + 1% buffer
	StopLoss     float64       `json:"stopLoss"`     // 7-8% below entry
	Target       float64       `json:"target"`       // min R:R 3:1 expected reward
	CurrentPrice float64       `json:"currentPrice"`
	AvgVolume50  float64       `json:"avgVolume50"`
	Stage2       bool          `json:"stage2"`       // passes trend template
	PassesTrend  bool          `json:"passesTrend"`  // MA alignment OK
}

// ScanResult is the list of VCP stocks returned by /api/vcp/scan
type ScanResult struct {
	Stocks    []VCPAnalysis `json:"stocks"`
	ScannedAt string        `json:"scannedAt"`
	Total     int           `json:"total"`
}
