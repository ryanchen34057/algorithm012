package service

import (
	"math"

	"vcp-analyzer/internal/model"
)

// CalcPosition computes position sizing from a VCP analysis and a max-loss budget.
//
//   shares = floor( maxLoss / (entryPrice - stopLoss) )
func CalcPosition(vcp *model.VCPAnalysis, maxLoss float64) *model.PositionResult {
	riskPerShare := vcp.EntryPrice - vcp.StopLoss
	if riskPerShare <= 0 {
		riskPerShare = vcp.EntryPrice * 0.08 // fallback: 8% of entry
	}

	rewardPerShare := vcp.Target - vcp.EntryPrice
	rrRatio := 0.0
	if riskPerShare > 0 {
		rrRatio = rewardPerShare / riskPerShare
	}

	shares := 0
	if riskPerShare > 0 && maxLoss > 0 {
		shares = int(math.Floor(maxLoss / riskPerShare))
	}

	// Taiwan stocks trade in lots of 1000; floor to nearest 1000
	// (Uncomment if you want lot-based sizing)
	// shares = (shares / 1000) * 1000

	return &model.PositionResult{
		Symbol:          vcp.Symbol,
		EntryPrice:      vcp.EntryPrice,
		StopLoss:        vcp.StopLoss,
		Target:          vcp.Target,
		RiskPerShare:    roundTo2(riskPerShare),
		RewardPerShare:  roundTo2(rewardPerShare),
		RiskRewardRatio: roundTo2(rrRatio),
		Shares:          shares,
		TotalCost:       roundTo2(float64(shares) * vcp.EntryPrice),
		MaxLoss:         maxLoss,
	}
}
