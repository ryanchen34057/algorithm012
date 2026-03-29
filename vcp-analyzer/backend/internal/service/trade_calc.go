package service

import (
	"math"

	"vcp-analyzer/internal/model"
)

// CalcPosition computes position sizing from a gap analysis and a max-loss budget.
//
//	shares = floor( maxLoss / riskPerShare )
func CalcPosition(gap *model.GapAnalysis, maxLoss float64) *model.PositionResult {
	var riskPerShare float64
	if gap.Direction == model.GapUp {
		riskPerShare = gap.EntryPrice - gap.StopLoss
	} else {
		riskPerShare = gap.StopLoss - gap.EntryPrice
	}
	if riskPerShare <= 0 {
		riskPerShare = gap.EntryPrice * 0.05 // fallback: 5% of entry
	}

	var rewardPerShare float64
	if gap.Direction == model.GapUp {
		rewardPerShare = gap.Target - gap.EntryPrice
	} else {
		rewardPerShare = gap.EntryPrice - gap.Target
	}

	rrRatio := 0.0
	if riskPerShare > 0 {
		rrRatio = rewardPerShare / riskPerShare
	}

	shares := 0
	if riskPerShare > 0 && maxLoss > 0 {
		shares = int(math.Floor(maxLoss / riskPerShare))
	}

	return &model.PositionResult{
		Symbol:          gap.Symbol,
		EntryPrice:      gap.EntryPrice,
		StopLoss:        gap.StopLoss,
		Target:          gap.Target,
		RiskPerShare:    roundTo2(riskPerShare),
		RewardPerShare:  roundTo2(rewardPerShare),
		RiskRewardRatio: roundTo2(rrRatio),
		Shares:          shares,
		TotalCost:       roundTo2(float64(shares) * gap.EntryPrice),
		MaxLoss:         maxLoss,
	}
}
