package model

// GapDirection indicates whether the gap is bullish or bearish
type GapDirection string

const (
	GapUp   GapDirection = "long"  // 做多
	GapDown GapDirection = "short" // 做空
)

// GapAnalysis is the full gap-scan result for one stock
type GapAnalysis struct {
	Symbol         string       `json:"symbol"`
	Name           string       `json:"name"`
	Direction      GapDirection `json:"direction"`      // "long" or "short"
	GapPercent     float64      `json:"gapPercent"`     // gap size in %
	TodayOpen      float64      `json:"todayOpen"`
	TodayClose     float64      `json:"todayClose"`
	YesterdayOpen  float64      `json:"yesterdayOpen"`
	YesterdayClose float64      `json:"yesterdayClose"`
	YesterdayHigh  float64      `json:"yesterdayHigh"`
	YesterdayLow   float64      `json:"yesterdayLow"`
	CurrentPrice   float64      `json:"currentPrice"`
	EntryPrice     float64     `json:"entryPrice"`
	StopLoss       float64     `json:"stopLoss"`
	Target         float64     `json:"target"`
	ADV20          float64     `json:"adv20"`          // 20-day avg daily volume (張)
	TodayVolume    int64       `json:"todayVolume"`    // today's volume (shares)
	MA20           float64     `json:"ma20"`
	MA200          float64     `json:"ma200"`
	Score          float64     `json:"score"`          // 0-100 quality score
}

// ScanResult is the list of gap stocks returned by /api/gap/scan
type ScanResult struct {
	Stocks    []GapAnalysis `json:"stocks"`
	ScannedAt string        `json:"scannedAt"`
	Total     int           `json:"total"`   // number of matched stocks
	Scanned   int           `json:"scanned"` // number of stocks analyzed
}
