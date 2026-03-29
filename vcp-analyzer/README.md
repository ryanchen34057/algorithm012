# VCP 台股分析系統

自動偵測符合 Mark Minervini **VCP (Volatility Contraction Pattern)** 型態的台灣上市櫃股票，
並計算建議進場點、停損點、目標價與風險報酬比。

## 功能

1. **VCP 掃描** — 並發掃描 29 支台股，按評分排序列出符合 VCP 的股票
2. **K 線圖** — 使用 TradingView Lightweight Charts 繪製日 K + MA50/150/200 + VCP 標記線
3. **交易計算** — 自動計算進場點、停損點(距進場-8%)、目標價(+25%)
4. **風險計算器** — 輸入可承受損失金額，計算建議股數與風險報酬比

## 架構

```
vcp-analyzer/
├── backend/           # Go (標準庫 net/http，無外部依賴)
│   ├── cmd/server/    # 入口
│   └── internal/
│       ├── api/       # HTTP 路由 + CORS
│       ├── model/     # 資料結構
│       └── service/   # Yahoo Finance, VCP演算法, 交易計算
└── frontend/          # React + TypeScript + Vite
    └── src/
        ├── pages/     # Dashboard, StockDetail
        ├── components/# StockChart, VCPScoreCard, RiskCalculator
        ├── services/  # API 呼叫
        └── types/     # TypeScript 型別
```

## 快速啟動

### 後端

```bash
cd backend
go run cmd/server/main.go
# 監聽 http://localhost:8080
```

### 前端

```bash
cd frontend
npm install
npm run dev
# 開啟 http://localhost:5173
```

## API 端點

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/vcp/scan` | 掃描全部台股，回傳 VCP 排名 |
| GET | `/api/stock/:symbol/chart` | K 線 + MA 資料 |
| GET | `/api/stock/:symbol/vcp` | 個股 VCP 分析 |
| POST | `/api/stock/:symbol/position` | `{ maxLoss: 10000 }` → 計算建議股數 |

## VCP 評分機制

| 項目 | 分數 |
|------|------|
| 通過 Trend Template (MA 多頭排列) | 30 |
| 收縮次數 ≥ 3 | 20 |
| 收縮幅度遞減品質 (各約前次 50%) | 30 |
| 最後收縮成交量萎縮至 70% 以下 | 15 |
| 最後收縮幅度 ≤ 5% | 5 |

## 注意事項

- 資料來源：Yahoo Finance (台股代號格式 `2330.TW` / `6269.TWO`)
- 每次掃描約需 30-60 秒（並行 5 條連線取 29 支股票歷史資料）
- 本系統僅供教育目的，不構成投資建議
