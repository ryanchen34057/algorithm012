package model

// PatternType describes the bottom pattern detected
type PatternType string

const (
	PatternW    PatternType = "w_bottom"    // 雙底 (W底)
	PatternV    PatternType = "v_bottom"    // V型反轉
	PatternNone PatternType = "none"        // 無明顯底部型態，純接近前高
)

// VolumeCondition describes volume behavior near the breakout
type VolumeCondition string

const (
	VolumeExpand   VolumeCondition = "expand"   // 量增
	VolumeShrink   VolumeCondition = "shrink"   // 量縮
	VolumeAny      VolumeCondition = "any"      // 不限
)

// BreakoutAnalysis is the scan result for one stock approaching a breakout
type BreakoutAnalysis struct {
	Symbol        string       `json:"symbol"`
	Name          string       `json:"name"`
	CurrentPrice  float64      `json:"currentPrice"`  // 最新收盤價
	PrevHigh      float64      `json:"prevHigh"`       // 前高價位
	PrevHighDate  string       `json:"prevHighDate"`   // 前高日期
	DistPct       float64      `json:"distPct"`        // 距離前高 (%)
	Pattern       PatternType  `json:"pattern"`        // 底部型態
	PatternLabel  string       `json:"patternLabel"`   // 型態說明
	// W底特有欄位
	Low1          float64      `json:"low1"`           // 第一低點
	Low1Date      string       `json:"low1Date"`
	Low2          float64      `json:"low2"`           // 第二低點
	Low2Date      string       `json:"low2Date"`
	Neckline      float64      `json:"neckline"`       // 頸線（W底中間高點）
	// V底特有欄位
	VLow          float64      `json:"vLow"`           // V底最低點
	VLowDate      string       `json:"vLowDate"`
	DropPct       float64      `json:"dropPct"`        // 下跌幅度 (%)
	BouncePct     float64      `json:"bouncePct"`      // 反彈幅度 (%)
	// 均線
	MA20          float64      `json:"ma20"`
	MA50          float64      `json:"ma50"`
	MA150         float64      `json:"ma150"`
	MA200         float64      `json:"ma200"`
	MAAligned     bool         `json:"maAligned"`      // 均線多頭排列
	// 量能
	ADV20         float64      `json:"adv20"`          // 20日均量（張）
	RecentVolRatio float64     `json:"recentVolRatio"` // 近5日均量 / ADV20
	TodayVolume   int64        `json:"todayVolume"`
	// 交易計畫
	EntryPrice    float64      `json:"entryPrice"`     // 建議進場點
	StopLoss      float64      `json:"stopLoss"`       // 停損點
	Target        float64      `json:"target"`          // 目標價
	TargetLabel   string       `json:"targetLabel"`
	RewardRisk    float64      `json:"rewardRisk"`     // 風報比
	Score         float64      `json:"score"`           // 品質分數 0-100
}

// BreakoutScanResult is the response for /api/breakout/scan
type BreakoutScanResult struct {
	Stocks    []BreakoutAnalysis `json:"stocks"`
	ScannedAt string             `json:"scannedAt"`
	Total     int                `json:"total"`
	Scanned   int                `json:"scanned"`
}
