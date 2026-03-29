package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"time"

	"vcp-analyzer/internal/model"
)

// YahooFinance fetches OHLCV data from Yahoo Finance for Taiwan stocks.
// Symbols should be in format "2330.TW" (TWSE) or "6269.TWO" (OTC).
type YahooFinance struct {
	client *http.Client
}

func NewYahooFinance() *YahooFinance {
	return &YahooFinance{
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// yahooResponse mirrors the JSON structure returned by Yahoo Finance v8 chart API
type yahooResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Symbol           string  `json:"symbol"`
				RegularMarketPrice float64 `json:"regularMarketPrice"`
				ShortName        string  `json:"shortName"`
			} `json:"meta"`
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Open   []float64 `json:"open"`
					High   []float64 `json:"high"`
					Low    []float64 `json:"low"`
					Close  []float64 `json:"close"`
					Volume []int64   `json:"volume"`
				} `json:"quote"`
			} `json:"indicators"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"chart"`
}

// FetchHistory returns up to 12 months of daily OHLCV for a symbol.
func (yf *YahooFinance) FetchHistory(symbol string) (*model.StockChartData, error) {
	end := time.Now()
	start := end.AddDate(-1, 0, 0) // 12 months back

	url := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&period1=%d&period2=%d",
		symbol, start.Unix(), end.Unix(),
	)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	// Yahoo Finance requires a User-Agent header
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := yf.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var yr yahooResponse
	if err := json.Unmarshal(body, &yr); err != nil {
		return nil, fmt.Errorf("parse error: %w", err)
	}
	if len(yr.Chart.Result) == 0 {
		return nil, fmt.Errorf("no data for symbol %s", symbol)
	}

	result := yr.Chart.Result[0]
	quotes := result.Indicators.Quote
	if len(quotes) == 0 {
		return nil, fmt.Errorf("empty quotes for %s", symbol)
	}
	q := quotes[0]

	candles := make([]model.OHLCV, 0, len(result.Timestamp))
	for i, ts := range result.Timestamp {
		if i >= len(q.Close) || q.Close[i] == 0 {
			continue
		}
		t := time.Unix(ts, 0).UTC()
		candles = append(candles, model.OHLCV{
			Date:   t.Format("2006-01-02"),
			Open:   roundTo2(safeGet(q.Open, i)),
			High:   roundTo2(safeGet(q.High, i)),
			Low:    roundTo2(safeGet(q.Low, i)),
			Close:  roundTo2(safeGet(q.Close, i)),
			Volume: safeGetInt(q.Volume, i),
		})
	}
	sort.Slice(candles, func(i, j int) bool {
		return candles[i].Date < candles[j].Date
	})

	name := result.Meta.ShortName
	if name == "" {
		name = symbol
	}

	closes := make([]float64, len(candles))
	for i, c := range candles {
		closes[i] = c.Close
	}

	return &model.StockChartData{
		Symbol:  result.Meta.Symbol,
		Name:    name,
		Candles: candles,
		MA50:    calcMA(closes, 50),
		MA150:   calcMA(closes, 150),
		MA200:   calcMA(closes, 200),
	}, nil
}

// TWSEStockList returns a curated list of major Taiwan stock symbols.
// In production this could be fetched from TWSE's listed companies API.
func TWSEStockList() []model.StockInfo {
	return []model.StockInfo{
		// TWSE heavyweights
		{Symbol: "2330.TW", Name: "台積電"},
		{Symbol: "2317.TW", Name: "鴻海"},
		{Symbol: "2454.TW", Name: "聯發科"},
		{Symbol: "2382.TW", Name: "廣達"},
		{Symbol: "2308.TW", Name: "台達電"},
		{Symbol: "2303.TW", Name: "聯電"},
		{Symbol: "3711.TW", Name: "日月光投控"},
		{Symbol: "2881.TW", Name: "富邦金"},
		{Symbol: "2882.TW", Name: "國泰金"},
		{Symbol: "2412.TW", Name: "中華電"},
		{Symbol: "2891.TW", Name: "中信金"},
		{Symbol: "2886.TW", Name: "兆豐金"},
		{Symbol: "1303.TW", Name: "南亞"},
		{Symbol: "1301.TW", Name: "台塑"},
		{Symbol: "2002.TW", Name: "中鋼"},
		{Symbol: "2357.TW", Name: "華碩"},
		{Symbol: "2395.TW", Name: "研華"},
		{Symbol: "3034.TW", Name: "聯詠"},
		{Symbol: "2379.TW", Name: "瑞昱"},
		{Symbol: "2408.TW", Name: "南亞科"},
		{Symbol: "2345.TW", Name: "智邦"},
		{Symbol: "3008.TW", Name: "大立光"},
		{Symbol: "2327.TW", Name: "國巨"},
		{Symbol: "4904.TW", Name: "遠傳"},
		{Symbol: "2207.TW", Name: "和泰車"},
		// OTC stars
		{Symbol: "6415.TWO", Name: "矽力-KY"},
		{Symbol: "3661.TWO", Name: "世芯-KY"},
		{Symbol: "6547.TWO", Name: "高端疫苗"},
		{Symbol: "3533.TWO", Name: "嘉澤"},
	}
}

// ---- helpers ----------------------------------------------------------------

func calcMA(closes []float64, period int) []float64 {
	result := make([]float64, len(closes))
	for i := range closes {
		if i < period-1 {
			result[i] = 0
			continue
		}
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			sum += closes[j]
		}
		result[i] = roundTo2(sum / float64(period))
	}
	return result
}

func safeGet(s []float64, i int) float64 {
	if i < len(s) {
		return s[i]
	}
	return 0
}

func safeGetInt(s []int64, i int) int64 {
	if i < len(s) {
		return s[i]
	}
	return 0
}

func roundTo2(v float64) float64 {
	f, _ := strconv.ParseFloat(fmt.Sprintf("%.2f", v), 64)
	return f
}
