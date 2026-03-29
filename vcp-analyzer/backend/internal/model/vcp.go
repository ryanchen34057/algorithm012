package model

// GapDirection indicates whether the gap is bullish or bearish
type GapDirection string

const (
	GapUp   GapDirection = "long"  // 做多
	GapDown GapDirection = "short" // 做空
)

// TargetType describes how the target price was determined
type TargetType string

const (
	TargetSwingPoint    TargetType = "swing"         // 前波高/低點
	TargetMA200         TargetType = "ma200"         // 200日均線壓力/支撐
	TargetMA20          TargetType = "ma20"          // 20日均線回歸
	TargetConsolidation TargetType = "consolidation"  // K線密集區壓力/支撐
	TargetTrailingStop  TargetType = "trailing_stop"  // 歷史新高/低，建議移動停損
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
	EntryPrice     float64      `json:"entryPrice"`
	StopLoss       float64      `json:"stopLoss"`
	Target         float64      `json:"target"`
	TargetType     TargetType   `json:"targetType"`     // 目標價依據
	TargetLabel    string       `json:"targetLabel"`    // 人讀說明
	RewardRisk     float64      `json:"rewardRisk"`     // 風報比
	ADV20          float64      `json:"adv20"`          // 20-day avg daily volume (張)
	TodayVolume    int64        `json:"todayVolume"`    // today's volume (shares)
	MA20           float64      `json:"ma20"`
	MA200          float64      `json:"ma200"`
	Score          float64      `json:"score"`          // 0-100 quality score
}

// ScanResult is the list of gap stocks returned by /api/gap/scan
type ScanResult struct {
	Stocks    []GapAnalysis `json:"stocks"`
	ScannedAt string        `json:"scannedAt"`
	Total     int           `json:"total"`   // number of matched stocks
	Scanned   int           `json:"scanned"` // number of stocks analyzed
}
