package model

// MAPullbackAnalysis represents one stock in the "均線回踩" scan results
type MAPullbackAnalysis struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	Market       string  `json:"market"`
	Industry     string  `json:"industry"`
	ConceptTag   string  `json:"conceptTag"`
	CurrentPrice float64 `json:"currentPrice"`

	// ── 日線 ──
	DailyMA20      float64 `json:"dailyMa20"`
	DailyMA200     float64 `json:"dailyMa200"`
	DailyMA20Slope float64 `json:"dailyMa20Slope"` // MA20 斜率 (%)
	DailyDistMA20  float64 `json:"dailyDistMa20"`  // 距MA20 (%)，負=在下方

	// ── 週線 ──
	WeeklyMA20      float64 `json:"weeklyMa20"`
	WeeklyMA200     float64 `json:"weeklyMa200"`
	WeeklyMA20Slope float64 `json:"weeklyMa20Slope"`
	WeeklyDistMA20  float64 `json:"weeklyDistMa20"`
	WeeklyClose     float64 `json:"weeklyClose"`

	// ── 月線 ──
	MonthlyMA20      float64 `json:"monthlyMa20"`
	MonthlyMA200     float64 `json:"monthlyMa200"`
	MonthlyMA20Slope float64 `json:"monthlyMa20Slope"`
	MonthlyDistMA20  float64 `json:"monthlyDistMa20"`
	MonthlyClose     float64 `json:"monthlyClose"`

	// ── 條件達成 ──
	DailyOK   bool `json:"dailyOk"`   // 日線符合
	WeeklyOK  bool `json:"weeklyOk"`  // 週線符合
	MonthlyOK bool `json:"monthlyOk"` // 月線符合
	AllOK     bool `json:"allOk"`     // 三線全符合

	// ── 交易計畫 ──
	EntryPrice  float64 `json:"entryPrice"`
	StopLoss    float64 `json:"stopLoss"`
	StopLabel   string  `json:"stopLabel"`
	Target      float64 `json:"target"`
	TargetLabel string  `json:"targetLabel"`
	RewardRisk  float64 `json:"rewardRisk"`

	ADV20       float64 `json:"adv20"`
	TodayVolume int64   `json:"todayVolume"`
	Score       float64 `json:"score"`
}

// MAPullbackScanResult is the response for /api/mapullback/scan
type MAPullbackScanResult struct {
	Stocks    []MAPullbackAnalysis `json:"stocks"`
	ScannedAt string               `json:"scannedAt"`
	Total     int                  `json:"total"`
	Scanned   int                  `json:"scanned"`
}
