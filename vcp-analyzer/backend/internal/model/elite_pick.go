package model

// PatternShape represents the consolidation pattern type
type PatternShape string

const (
	ShapeU   PatternShape = "u_shape"
	ShapeN   PatternShape = "n_shape"
	ShapeCup PatternShape = "cup"
	ShapeNone PatternShape = "none"
)

// MarketTrend represents the overall market condition
type MarketTrend string

const (
	TrendBull    MarketTrend = "bull"
	TrendBear    MarketTrend = "bear"
	TrendNeutral MarketTrend = "neutral"
)

// SellSignal represents an exit signal type
type SellSignal string

const (
	SellNone        SellSignal = ""
	SellBigBlackK   SellSignal = "big_black_k"   // 大量長黑K → 賣一半
	SellBelowMA10   SellSignal = "below_ma10"     // 跌破10日均線 → 全賣
	SellBothSignals SellSignal = "both"           // 兩者皆有
)

// ElitePickAnalysis represents one stock in the "精選突破" scan results
type ElitePickAnalysis struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	Market       string  `json:"market"`       // 上市 / 上櫃
	Industry     string  `json:"industry"`
	ConceptTag   string  `json:"conceptTag"`
	CurrentPrice float64 `json:"currentPrice"`

	// ── 篩選條件指標 ──
	// 1. 量縮
	Vol5D       float64 `json:"vol5d"`       // 近5日均量
	Vol20D      float64 `json:"vol20d"`      // 近20日均量
	VolShrink   float64 `json:"volShrink"`   // 量縮比例 (vol5d/vol20d)
	// 2. 快過高
	PrevHigh     float64 `json:"prevHigh"`     // 前高價位
	PrevHighDate string  `json:"prevHighDate"` // 前高日期
	DistPct      float64 `json:"distPct"`      // 距前高 %
	// 3. 波動收斂
	RangeHigh    float64 `json:"rangeHigh"`    // 近期整理區高點
	RangeLow     float64 `json:"rangeLow"`     // 近期整理區低點
	RangePct     float64 `json:"rangePct"`     // 整理區振幅 (%)
	// 4. 型態
	Pattern      PatternShape `json:"pattern"`
	PatternLabel string       `json:"patternLabel"`

	// ── 均線 ──
	MA10  float64 `json:"ma10"`
	MA20  float64 `json:"ma20"`
	MA60  float64 `json:"ma60"`
	MA120 float64 `json:"ma120"`
	MA200 float64 `json:"ma200"`

	// ── 出場訊號 (7-8) ──
	SellSignal    SellSignal `json:"sellSignal"`
	SellLabel     string     `json:"sellLabel"`

	// ── 交易計畫 (9-10) ──
	StopLoss     float64 `json:"stopLoss"`     // 停損價
	StopLabel    string  `json:"stopLabel"`     // 停損依據
	EntryPrice   float64 `json:"entryPrice"`
	Target       float64 `json:"target"`
	TargetLabel  string  `json:"targetLabel"`
	RewardRisk   float64 `json:"rewardRisk"`
	SuggestLots  int     `json:"suggestLots"`   // 建議張數 (依停損回推)

	ADV20       float64 `json:"adv20"`
	TodayVolume int64   `json:"todayVolume"`
	Score       float64 `json:"score"` // 0-100
}

// MarketStatus represents the overall market condition
type MarketStatus struct {
	IndexPrice float64     `json:"indexPrice"` // 加權指數收盤
	MA60       float64     `json:"ma60"`       // 60日均線
	MA120      float64     `json:"ma120"`      // 120日均線
	MA20       float64     `json:"ma20"`       // 20日均線
	Trend      MarketTrend `json:"trend"`      // bull/bear/neutral
	TrendLabel string      `json:"trendLabel"` // 中文描述
}

// ElitePickScanResult is the response for /api/elitepick/scan
type ElitePickScanResult struct {
	Stocks   []ElitePickAnalysis `json:"stocks"`
	Market   MarketStatus        `json:"market"` // 大盤狀態
	ScannedAt string             `json:"scannedAt"`
	Total     int                `json:"total"`
	Scanned   int                `json:"scanned"`
}
