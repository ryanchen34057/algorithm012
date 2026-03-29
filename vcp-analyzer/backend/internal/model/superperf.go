package model

// SuperPerfAnalysis represents one stock in the "超級績效" scan results
type SuperPerfAnalysis struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	Market       string  `json:"market"`       // "上市" or "上櫃"
	Industry     string  `json:"industry"`      // 產業分類
	ConceptTag   string  `json:"conceptTag"`    // 概念股標籤 (e.g. "低軌衛星", "散熱")
	CurrentPrice float64 `json:"currentPrice"`

	// 漲幅
	Gain1D  float64 `json:"gain1d"`  // 最近收盤日漲幅 (%)
	Gain1W  float64 `json:"gain1w"`  // 近1週漲幅 (%)
	Gain1M  float64 `json:"gain1m"`  // 近1月漲幅 (%)
	Gain3M  float64 `json:"gain3m"`  // 近3月漲幅 (%)
	Gain6M  float64 `json:"gain6m"`  // 近6月漲幅 (%)
	GainYTD float64 `json:"gainYtd"` // 年初至今 (%)

	// VCP Score breakdown
	VCPScore       float64 `json:"vcpScore"`       // 總分 0-100
	TrendScore     float64 `json:"trendScore"`     // 趨勢分 (20)
	ContractionScore float64 `json:"contractionScore"` // 波動收縮分 (30)
	VolDryUpScore  float64 `json:"volDryUpScore"`  // 量縮分 (20)
	PivotScore     float64 `json:"pivotScore"`     // 接近樞紐點分 (15)
	RSScore        float64 `json:"rsScore"`        // 相對強度分 (15)

	// Key levels
	MA50    float64 `json:"ma50"`
	MA150   float64 `json:"ma150"`
	MA200   float64 `json:"ma200"`
	High52W float64 `json:"high52w"` // 52 週最高
	Low52W  float64 `json:"low52w"`  // 52 週最低
	ADV20   float64 `json:"adv20"`   // 20日均量 (張)

	// Trade plan
	PivotPrice float64 `json:"pivotPrice"` // 樞紐點 (整理區高點)
	StopLoss   float64 `json:"stopLoss"`
	EntryPrice float64 `json:"entryPrice"`
	Target     float64 `json:"target"`
	TargetLabel string `json:"targetLabel"`
	RewardRisk float64 `json:"rewardRisk"`

	TodayVolume int64 `json:"todayVolume"`
}

// IndustryHeat represents one industry's aggregate performance
type IndustryHeat struct {
	Industry    string  `json:"industry"`
	AvgGain1M   float64 `json:"avgGain1m"`
	AvgGain3M   float64 `json:"avgGain3m"`
	StockCount  int     `json:"stockCount"`
	TopStocks   []string `json:"topStocks"` // top 3 stock names
}

// SuperPerfScanResult is the response for /api/superperf/scan
type SuperPerfScanResult struct {
	Stocks     []SuperPerfAnalysis `json:"stocks"`
	Industries []IndustryHeat      `json:"industries"` // sorted by avgGain1m desc
	ScannedAt  string              `json:"scannedAt"`
	Total      int                 `json:"total"`
	Scanned    int                 `json:"scanned"`
}
