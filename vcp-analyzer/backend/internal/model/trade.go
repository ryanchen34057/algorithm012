package model

// PositionRequest is the body for POST /api/stock/:symbol/position
type PositionRequest struct {
	MaxLoss float64 `json:"maxLoss"` // max loss in TWD the user can tolerate
}

// PositionResult is the trade plan calculation result
type PositionResult struct {
	Symbol          string  `json:"symbol"`
	EntryPrice      float64 `json:"entryPrice"`
	StopLoss        float64 `json:"stopLoss"`
	Target          float64 `json:"target"`
	RiskPerShare    float64 `json:"riskPerShare"`   // entry - stop
	RewardPerShare  float64 `json:"rewardPerShare"` // target - entry
	RiskRewardRatio float64 `json:"riskRewardRatio"`
	Shares          int     `json:"shares"`         // shares = maxLoss / riskPerShare
	TotalCost       float64 `json:"totalCost"`      // shares * entryPrice
	MaxLoss         float64 `json:"maxLoss"`
}
