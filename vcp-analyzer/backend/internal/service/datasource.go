package service

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
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
				Symbol             string  `json:"symbol"`
				RegularMarketPrice float64 `json:"regularMarketPrice"`
				ShortName          string  `json:"shortName"`
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

// FetchHistory returns up to 2 years of daily OHLCV for a symbol.
func (yf *YahooFinance) FetchHistory(symbol string) (*model.StockChartData, error) {
	end := time.Now()
	start := end.AddDate(-2, 0, 0)

	url := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&period1=%d&period2=%d",
		symbol, start.Unix(), end.Unix(),
	)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
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

	latestPrice := result.Meta.RegularMarketPrice
	if latestPrice == 0 && len(candles) > 0 {
		latestPrice = candles[len(candles)-1].Close
	}

	return &model.StockChartData{
		Symbol:      result.Meta.Symbol,
		Name:        name,
		LatestPrice: roundTo2(latestPrice),
		Candles:     candles,
		MA20:        calcMA(closes, 20),
		MA50:        calcMA(closes, 50),
		MA150:       calcMA(closes, 150),
		MA200:       calcMA(closes, 200),
	}, nil
}

// ── 全市場股票清單（動態從 TWSE / TPEx 抓取）─────────────────────────────────

// FetchAllStocks fetches all TWSE + TPEx listed stocks and pre-filters.
// Falls back to the comprehensive hardcoded list if API calls fail.
func FetchAllStocks(minVolumeLots int64, minPrice float64) []model.StockInfo {
	client := &http.Client{Timeout: 10 * time.Second}

	twse, err := fetchTWSEList(client, minVolumeLots, minPrice)
	if err != nil {
		log.Printf("[TWSE] fetch failed: %v — using fallback list", err)
		twse = nil
	}

	tpex, err2 := fetchTPExList(client, minVolumeLots, minPrice)
	if err2 != nil {
		log.Printf("[TPEx] fetch failed: %v — OTC stocks skipped", err2)
		tpex = nil
	}

	if twse == nil && tpex == nil {
		list := fallbackStockList()
		SetNames(list)
		log.Printf("[stock list] using fallback list: %d stocks", len(list))
		return list
	}

	// If one source failed, supplement with fallback for that market
	if twse == nil {
		log.Printf("[TWSE] using fallback TWSE stocks")
		fb := fallbackStockList()
		for _, s := range fb {
			if strings.HasSuffix(s.Symbol, ".TW") {
				twse = append(twse, s)
			}
		}
	}
	if tpex == nil {
		log.Printf("[TPEx] using fallback TPEx stocks")
		fb := fallbackStockList()
		for _, s := range fb {
			if strings.HasSuffix(s.Symbol, ".TWO") {
				tpex = append(tpex, s)
			}
		}
	}

	all := append(twse, tpex...)
	SetNames(all)
	log.Printf("[stock list] TWSE=%d TPEx=%d total=%d (minVol=%d張 minPrice=%.0f)",
		len(twse), len(tpex), len(all), minVolumeLots, minPrice)
	return all
}

// ── TWSE（上市）────────────────────────────────────────────────────────────────
type twseRow struct {
	Code         string `json:"Code"`
	Name         string `json:"Name"`
	TradeVolume  string `json:"TradeVolume"`
	ClosingPrice string `json:"ClosingPrice"`
}

// twseURLs are tried in order; first success wins.
var twseURLs = []string{
	"https://opendata.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
	"https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json",
}

func fetchTWSEList(client *http.Client, minVolumeLots int64, minPrice float64) ([]model.StockInfo, error) {
	var body []byte
	var lastErr error

	for _, url := range twseURLs {
		b, err := getJSON(client, url)
		if err != nil {
			lastErr = err
			log.Printf("[TWSE] %s failed: %v, trying next...", url, err)
			continue
		}
		body = b
		break
	}
	if body == nil {
		return nil, lastErr
	}

	// The response might be a plain array or wrapped in { "data": [...] }
	var rows []twseRow
	if err := json.Unmarshal(body, &rows); err != nil {
		// Try wrapped format: { "stat": "OK", "data": [...] } or similar
		var wrapper struct {
			Data json.RawMessage `json:"data"`
		}
		if err2 := json.Unmarshal(body, &wrapper); err2 == nil && len(wrapper.Data) > 0 {
			json.Unmarshal(wrapper.Data, &rows)
		}
		if len(rows) == 0 {
			return nil, fmt.Errorf("TWSE parse: %w", err)
		}
	}

	var result []model.StockInfo
	for _, r := range rows {
		if !is4DigitCode(r.Code) {
			continue
		}
		price := parseNumber(r.ClosingPrice)
		if price < minPrice {
			continue
		}
		volShares := int64(parseNumber(r.TradeVolume))
		if volShares/1000 < minVolumeLots {
			continue
		}
		result = append(result, model.StockInfo{
			Symbol: r.Code + ".TW",
			Name:   r.Name,
		})
	}
	return result, nil
}

// ── TPEx（上櫃）───────────────────────────────────────────────────────────────
type tpexRow struct {
	SecuritiesCompanyCode string `json:"SecuritiesCompanyCode"`
	CompanyName           string `json:"CompanyName"`
	Close                 string `json:"Close"`
	TradingShares         string `json:"TradingShares"`
}

var tpexURLs = []string{
	"https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
}

func fetchTPExList(client *http.Client, minVolumeLots int64, minPrice float64) ([]model.StockInfo, error) {
	var body []byte
	var lastErr error

	for _, url := range tpexURLs {
		b, err := getJSON(client, url)
		if err != nil {
			lastErr = err
			continue
		}
		body = b
		break
	}
	if body == nil {
		return nil, lastErr
	}

	var rows []tpexRow
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, fmt.Errorf("TPEx parse: %w", err)
	}

	var result []model.StockInfo
	for _, r := range rows {
		if !is4DigitCode(r.SecuritiesCompanyCode) {
			continue
		}
		price := parseNumber(r.Close)
		if price < minPrice {
			continue
		}
		volShares := int64(parseNumber(r.TradingShares))
		if volShares/1000 < minVolumeLots {
			continue
		}
		result = append(result, model.StockInfo{
			Symbol: r.SecuritiesCompanyCode + ".TWO",
			Name:   r.CompanyName,
		})
	}
	return result, nil
}

// ── fallback list（API 掛掉時用）─────────────────────────────────────────────
// Comprehensive list: top ~200 Taiwan stocks by trading volume / market cap.
// This ensures meaningful scan results even when TWSE/TPEx APIs are unavailable.
func fallbackStockList() []model.StockInfo {
	return []model.StockInfo{
		// ── 半導體 ──
		{Symbol: "2330.TW", Name: "台積電"}, {Symbol: "2303.TW", Name: "聯電"},
		{Symbol: "2454.TW", Name: "聯發科"}, {Symbol: "3034.TW", Name: "聯詠"},
		{Symbol: "2379.TW", Name: "瑞昱"}, {Symbol: "3711.TW", Name: "日月光投控"},
		{Symbol: "2408.TW", Name: "南亞科"}, {Symbol: "3443.TW", Name: "創意"},
		{Symbol: "6770.TW", Name: "力積電"}, {Symbol: "3529.TW", Name: "力旺"},
		{Symbol: "2344.TW", Name: "華邦電"}, {Symbol: "5347.TW", Name: "世界"},
		{Symbol: "6488.TW", Name: "環球晶"}, {Symbol: "5274.TW", Name: "信驊"},
		{Symbol: "3037.TW", Name: "欣興"}, {Symbol: "2449.TW", Name: "京元電子"},
		{Symbol: "3661.TW", Name: "世芯-KY"}, {Symbol: "6547.TW", Name: "高端疫苗"},
		{Symbol: "8046.TW", Name: "南電"}, {Symbol: "2363.TW", Name: "矽統"},
		// ── 電子代工/系統 ──
		{Symbol: "2317.TW", Name: "鴻海"}, {Symbol: "2382.TW", Name: "廣達"},
		{Symbol: "2356.TW", Name: "英業達"}, {Symbol: "2324.TW", Name: "仁寶"},
		{Symbol: "3231.TW", Name: "緯創"}, {Symbol: "2353.TW", Name: "宏碁"},
		{Symbol: "2357.TW", Name: "華碩"}, {Symbol: "2301.TW", Name: "光寶科"},
		{Symbol: "2345.TW", Name: "智邦"}, {Symbol: "3005.TW", Name: "神基"},
		{Symbol: "2395.TW", Name: "研華"}, {Symbol: "6669.TW", Name: "緯穎"},
		{Symbol: "3653.TW", Name: "健策"}, {Symbol: "2376.TW", Name: "技嘉"},
		{Symbol: "2377.TW", Name: "微星"}, {Symbol: "3706.TW", Name: "神達"},
		// ── 電子零組件/被動元件 ──
		{Symbol: "2327.TW", Name: "國巨"}, {Symbol: "3008.TW", Name: "大立光"},
		{Symbol: "2308.TW", Name: "台達電"}, {Symbol: "1590.TW", Name: "亞德客-KY"},
		{Symbol: "2474.TW", Name: "可成"}, {Symbol: "6533.TW", Name: "晶心科"},
		{Symbol: "3665.TW", Name: "貿聯-KY"}, {Symbol: "2059.TW", Name: "川湖"},
		// ── 面板/光電 ──
		{Symbol: "2409.TW", Name: "友達"}, {Symbol: "3481.TW", Name: "群創"},
		{Symbol: "2393.TW", Name: "億光"}, {Symbol: "3406.TW", Name: "玉晶光"},
		{Symbol: "2383.TW", Name: "台光電"}, {Symbol: "6176.TW", Name: "瑞儀"},
		// ── 金融 ──
		{Symbol: "2881.TW", Name: "富邦金"}, {Symbol: "2882.TW", Name: "國泰金"},
		{Symbol: "2891.TW", Name: "中信金"}, {Symbol: "2886.TW", Name: "兆豐金"},
		{Symbol: "2884.TW", Name: "玉山金"}, {Symbol: "2885.TW", Name: "元大金"},
		{Symbol: "2887.TW", Name: "台新金"}, {Symbol: "2880.TW", Name: "華南金"},
		{Symbol: "2883.TW", Name: "開發金"}, {Symbol: "2890.TW", Name: "永豐金"},
		{Symbol: "2892.TW", Name: "第一金"}, {Symbol: "5880.TW", Name: "合庫金"},
		{Symbol: "2888.TW", Name: "新光金"}, {Symbol: "2889.TW", Name: "國票金"},
		// ── 傳產/鋼鐵/水泥 ──
		{Symbol: "1301.TW", Name: "台塑"}, {Symbol: "1303.TW", Name: "南亞"},
		{Symbol: "1326.TW", Name: "台化"}, {Symbol: "6505.TW", Name: "台塑化"},
		{Symbol: "2002.TW", Name: "中鋼"}, {Symbol: "2207.TW", Name: "和泰車"},
		{Symbol: "1101.TW", Name: "台泥"}, {Symbol: "1102.TW", Name: "亞泥"},
		{Symbol: "2912.TW", Name: "統一超"}, {Symbol: "1216.TW", Name: "統一"},
		{Symbol: "2105.TW", Name: "正新"}, {Symbol: "9910.TW", Name: "豐泰"},
		{Symbol: "1476.TW", Name: "儒鴻"}, {Symbol: "9904.TW", Name: "寶成"},
		{Symbol: "1802.TW", Name: "台玻"}, {Symbol: "1402.TW", Name: "遠東新"},
		// ── 電信/公用 ──
		{Symbol: "2412.TW", Name: "中華電"}, {Symbol: "3045.TW", Name: "台灣大"},
		{Symbol: "4904.TW", Name: "遠傳"}, {Symbol: "6196.TW", Name: "帆宣"},
		// ── 航運 ──
		{Symbol: "2603.TW", Name: "長榮"}, {Symbol: "2609.TW", Name: "陽明"},
		{Symbol: "2615.TW", Name: "萬海"}, {Symbol: "2610.TW", Name: "華航"},
		{Symbol: "2618.TW", Name: "長榮航"}, {Symbol: "2606.TW", Name: "裕民"},
		// ── 營建/資產 ──
		{Symbol: "2504.TW", Name: "國產"}, {Symbol: "2542.TW", Name: "興富發"},
		{Symbol: "2520.TW", Name: "冠德"}, {Symbol: "5522.TW", Name: "遠雄"},
		// ── PCB/連接器 ──
		{Symbol: "2313.TW", Name: "華通"}, {Symbol: "3044.TW", Name: "健鼎"},
		{Symbol: "6153.TW", Name: "嘉聯益"}, {Symbol: "5243.TW", Name: "乙盛-KY"},
		// ── 電源/儲能 ──
		{Symbol: "6409.TW", Name: "旭隼"}, {Symbol: "3617.TW", Name: "碩天"},
		{Symbol: "8150.TW", Name: "南茂"}, {Symbol: "6443.TW", Name: "元晶"},
		// ── IC 設計 ──
		{Symbol: "3474.TW", Name: "華亞科"}, {Symbol: "2436.TW", Name: "偉詮電"},
		{Symbol: "4966.TW", Name: "譜瑞-KY"}, {Symbol: "5269.TW", Name: "祥碩"},
		{Symbol: "3189.TW", Name: "景碩"}, {Symbol: "2351.TW", Name: "順德"},
		// ── 其他電子 ──
		{Symbol: "2354.TW", Name: "鴻準"}, {Symbol: "2049.TW", Name: "上銀"},
		{Symbol: "4958.TW", Name: "臻鼎-KY"}, {Symbol: "2360.TW", Name: "致茂"},
		{Symbol: "6285.TW", Name: "啟碁"}, {Symbol: "3036.TW", Name: "文曄"},
		{Symbol: "2458.TW", Name: "義隆"}, {Symbol: "8454.TW", Name: "富邦媒"},
		{Symbol: "1605.TW", Name: "華新"}, {Symbol: "2371.TW", Name: "大同"},
		{Symbol: "2492.TW", Name: "華新科"}, {Symbol: "2014.TW", Name: "中鴻"},
		{Symbol: "2347.TW", Name: "聯強"}, {Symbol: "3702.TW", Name: "大聯大"},
		{Symbol: "6415.TW", Name: "矽力-KY"}, {Symbol: "3533.TW", Name: "嘉澤"},
		{Symbol: "2388.TW", Name: "威盛"}, {Symbol: "3023.TW", Name: "信邦"},
		{Symbol: "6239.TW", Name: "力成"}, {Symbol: "2404.TW", Name: "漢唐"},
		{Symbol: "6446.TW", Name: "藥華藥"}, {Symbol: "1795.TW", Name: "美時"},
		{Symbol: "6472.TW", Name: "保瑞"}, {Symbol: "4743.TW", Name: "合一"},
		{Symbol: "6789.TW", Name: "采鈺"}, {Symbol: "3529.TW", Name: "力旺"},
		{Symbol: "6531.TW", Name: "愛普"},
		// ── 上櫃 (TWO) ──
		{Symbol: "6488.TWO", Name: "環球晶"},
		{Symbol: "3293.TWO", Name: "鑫科"}, {Symbol: "5765.TWO", Name: "雃博"},
		{Symbol: "4919.TWO", Name: "新唐"}, {Symbol: "6147.TWO", Name: "頎邦"},
		{Symbol: "8069.TWO", Name: "元太"}, {Symbol: "5876.TWO", Name: "上海商銀"},
		{Symbol: "6278.TWO", Name: "台表科"}, {Symbol: "3105.TWO", Name: "穩懋"},
		{Symbol: "5871.TWO", Name: "中租-KY"}, {Symbol: "6223.TWO", Name: "旺矽"},
		{Symbol: "6510.TWO", Name: "精測"}, {Symbol: "6552.TWO", Name: "易華電"},
		{Symbol: "3163.TWO", Name: "波若威"}, {Symbol: "8112.TWO", Name: "至上"},
		{Symbol: "6264.TWO", Name: "鑫永銓"}, {Symbol: "4968.TWO", Name: "立積"},
		{Symbol: "6592.TWO", Name: "和潤企業"}, {Symbol: "3388.TWO", Name: "崇越電"},
		{Symbol: "5289.TWO", Name: "宜鼎"}, {Symbol: "6412.TWO", Name: "群電"},
		{Symbol: "6269.TWO", Name: "台郡"}, {Symbol: "6139.TWO", Name: "亞翔"},
		{Symbol: "3530.TWO", Name: "晶相光"}, {Symbol: "5483.TWO", Name: "中美晶"},
		{Symbol: "6462.TWO", Name: "神盾"}, {Symbol: "6257.TWO", Name: "矽格"},
		{Symbol: "2732.TWO", Name: "六角"}, {Symbol: "4977.TWO", Name: "眾達-KY"},
		{Symbol: "8261.TWO", Name: "富鼎"}, {Symbol: "3508.TWO", Name: "位速"},
		{Symbol: "6674.TWO", Name: "鋐寶科技"},
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func getJSON(client *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}
	return io.ReadAll(resp.Body)
}

// is4DigitCode checks if a stock code is exactly 4 numeric digits (普通股).
func is4DigitCode(code string) bool {
	if len(code) != 4 {
		return false
	}
	for _, c := range code {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// parseNumber parses a number string that may contain commas.
func parseNumber(s string) float64 {
	s = strings.ReplaceAll(s, ",", "")
	s = strings.TrimSpace(s)
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

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
