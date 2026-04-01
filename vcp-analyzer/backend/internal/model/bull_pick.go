package model

// BullPickAnalysis represents one stock in the "強勢精選" scan results
type BullPickAnalysis struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	Market       string  `json:"market"`
	Industry     string  `json:"industry"`
	ConceptTag   string  `json:"conceptTag"`
	CurrentPrice float64 `json:"currentPrice"`

	// ── 1. 線型多頭 ──
	Pattern      PatternShape `json:"pattern"`
	PatternLabel string       `json:"patternLabel"`
	MAAligned    bool         `json:"maAligned"` // MA20>MA60>MA120 多頭排列

	// ── 2. 距歷史高點 ──
	AllTimeHigh     float64 `json:"allTimeHigh"`     // 歷史最高價
	AllTimeHighDate string  `json:"allTimeHighDate"` // 歷史最高日期
	DistHighPct     float64 `json:"distHighPct"`     // 距歷史高點 %

	// ── 3. 三大法人買賣超 ──
	ForeignNetBuy   float64 `json:"foreignNetBuy"`   // 外資買賣超（張）
	TrustNetBuy     float64 `json:"trustNetBuy"`     // 投信買賣超（張）
	DealerNetBuy    float64 `json:"dealerNetBuy"`    // 自營商買賣超（張）
	TotalNetBuy     float64 `json:"totalNetBuy"`     // 三大法人合計（張）
	NetBuyDays      int     `json:"netBuyDays"`      // 近N日主力連續買超天數

	// ── 4. 年營收 ──
	RevenueLatest   float64 `json:"revenueLatest"`   // 最近年度營收（億）
	RevenuePrev     float64 `json:"revenuePrev"`     // 前一年度營收（億）
	RevenueGrowth   float64 `json:"revenueGrowth"`   // 年營收成長率 (%)
	RevenuePeriod   string  `json:"revenuePeriod"`   // e.g. "2025 vs 2024"

	// ── 均線 ──
	MA20  float64 `json:"ma20"`
	MA60  float64 `json:"ma60"`
	MA120 float64 `json:"ma120"`
	MA200 float64 `json:"ma200"`

	// ── 交易計畫 ──
	EntryPrice  float64 `json:"entryPrice"`
	StopLoss    float64 `json:"stopLoss"`
	StopLabel   string  `json:"stopLabel"`
	Target      float64 `json:"target"`
	TargetLabel string  `json:"targetLabel"`
	RewardRisk  float64 `json:"rewardRisk"`

	ADV20       float64 `json:"adv20"`
	TodayVolume int64   `json:"todayVolume"`
	Score       float64 `json:"score"` // 0-100
}

// BullPickScanResult is the response for /api/bullpick/scan
type BullPickScanResult struct {
	Stocks    []BullPickAnalysis `json:"stocks"`
	Market    MarketStatus       `json:"market"`
	ScannedAt string             `json:"scannedAt"`
	Total     int                `json:"total"`
	Scanned   int                `json:"scanned"`
}
