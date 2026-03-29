package model

// PeakAttackAnalysis is the scan result for one stock matching the "攻頂突破" pattern.
//
// Pattern logic:
//  1. Calculate KD stochastic (9,3,3)
//  2. While K>D, track the highest high of each "attack" cycle
//  3. On each KD death cross, store the attack peak into a history array
//  4. If the last N attack peaks are within a tight range (<= threshold %),
//     it means the stock keeps hitting the same ceiling — coiling energy
//  5. When price breaks above that tight range → breakout signal
type PeakAttackAnalysis struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	CurrentPrice float64 `json:"currentPrice"`

	// KD values
	K float64 `json:"k"`
	D float64 `json:"d"`

	// Attack peaks (most recent first)
	AttackPeaks    []float64 `json:"attackPeaks"`    // 最近幾次攻頂高點
	PeakHigh       float64   `json:"peakHigh"`       // 攻頂區間最高
	PeakLow        float64   `json:"peakLow"`        // 攻頂區間最低
	PeakRangePct   float64   `json:"peakRangePct"`   // 攻頂區間寬度 (%)
	AttackCount    int       `json:"attackCount"`     // 有效攻頂次數

	// Breakout info
	BreakoutPrice  float64 `json:"breakoutPrice"`  // 突破價位 (peakHigh)
	DistPct        float64 `json:"distPct"`         // 目前距突破價 (%)，負數=已突破

	// Volume
	ADV20          float64 `json:"adv20"`           // 20日均量（張）
	TodayVolume    int64   `json:"todayVolume"`
	TodayVolLots   float64 `json:"todayVolLots"`    // 當日量（張）
	VolRatio       float64 `json:"volRatio"`        // 當日量 / ADV20

	// MA
	MA20  float64 `json:"ma20"`
	MA50  float64 `json:"ma50"`
	MA200 float64 `json:"ma200"`

	// Trade plan
	EntryPrice  float64 `json:"entryPrice"`
	StopLoss    float64 `json:"stopLoss"`
	Target      float64 `json:"target"`
	TargetLabel string  `json:"targetLabel"`
	RewardRisk  float64 `json:"rewardRisk"`

	Score float64 `json:"score"`
}

// PeakAttackScanResult is the response for /api/peakattack/scan
type PeakAttackScanResult struct {
	Stocks    []PeakAttackAnalysis `json:"stocks"`
	ScannedAt string               `json:"scannedAt"`
	Total     int                  `json:"total"`
	Scanned   int                  `json:"scanned"`
}
