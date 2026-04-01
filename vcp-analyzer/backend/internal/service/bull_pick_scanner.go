package service

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"vcp-analyzer/internal/model"
)

type BullPickScanParams struct {
	MinPrice     float64 // default 15
	MaxPrice     float64 // default 9999
	MinADV20Lots float64 // default 300
	DistHighMax  float64 // 距歷史高點最大 %，default 10
	MinScore     float64 // 最低分數，default 40
}

func DefaultBullPickScanParams() BullPickScanParams {
	return BullPickScanParams{
		MinPrice:     15,
		MaxPrice:     9999,
		MinADV20Lots: 300,
		DistHighMax:  10,
		MinScore:     40,
	}
}

type BullPickScanner struct {
	mu             sync.RWMutex
	institutionMap map[string]*InstitutionData // symbol → data
	revenueMap     map[string]*RevenueData     // stockCode (e.g. "2330") → data
	lastFetchDate  string
}

type InstitutionData struct {
	ForeignNetBuy float64 // 外資買賣超（張）
	TrustNetBuy   float64 // 投信買賣超（張）
	DealerNetBuy  float64 // 自營商買賣超（張）
	TotalNetBuy   float64 // 合計
}

type RevenueData struct {
	RevenueLatest float64 // 最近年度營收
	RevenuePrev   float64 // 前一年度營收
	RevenueGrowth float64 // 年營收成長率 %
	Period        string  // "2025 vs 2024"
}

func NewBullPickScanner() *BullPickScanner {
	return &BullPickScanner{
		institutionMap: make(map[string]*InstitutionData),
		revenueMap:     make(map[string]*RevenueData),
	}
}

// FetchExternalData fetches institutional buying and revenue data
func (s *BullPickScanner) FetchExternalData(client *http.Client) {
	today := time.Now().Format("2006-01-02")
	s.mu.RLock()
	cached := s.lastFetchDate == today
	s.mu.RUnlock()
	if cached {
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		s.fetchInstitutionData(client)
	}()
	go func() {
		defer wg.Done()
		s.fetchRevenueData(client)
	}()
	wg.Wait()

	s.mu.Lock()
	s.lastFetchDate = today
	s.mu.Unlock()
}

// ── 三大法人買賣超 ──

func (s *BullPickScanner) fetchInstitutionData(client *http.Client) {
	now := time.Now()
	// Try today and last 3 trading days (in case of holidays)
	for offset := 0; offset < 5; offset++ {
		d := now.AddDate(0, 0, -offset)
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			continue
		}
		dateStr := d.Format("20060102")

		// TWSE 三大法人買賣超日報
		twseURL := fmt.Sprintf(
			"https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=%s&selectType=ALLBUT0999",
			dateStr,
		)
		if body, err := getJSON(client, twseURL); err == nil {
			count := s.parseTWSEInstitution(body)
			if count > 0 {
				log.Printf("[bullpick] TWSE institution data: %d stocks (date=%s)", count, dateStr)

				// Also try TPEx for the same date
				s.fetchTPExInstitution(client, d)
				return
			}
		}
	}
	log.Printf("[bullpick] failed to fetch institution data")
}

func (s *BullPickScanner) parseTWSEInstitution(body []byte) int {
	var resp struct {
		Stat   string     `json:"stat"`
		Fields []string   `json:"fields"`
		Data   [][]string `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return 0
	}
	if resp.Stat != "OK" || len(resp.Data) == 0 {
		return 0
	}

	// Fields: 證券代號, 證券名稱, 外陸資買賣超股數(不含外資自營商), ..., 投信買賣超股數, ..., 自營商買賣超股數, 三大法人買賣超股數
	// Field indices may vary; find them by name
	foreignIdx, trustIdx, dealerIdx, totalIdx := -1, -1, -1, -1
	codeIdx := 0
	for i, f := range resp.Fields {
		f = strings.TrimSpace(f)
		if strings.Contains(f, "證券代號") {
			codeIdx = i
		}
		if strings.Contains(f, "外陸資買賣超股數") || strings.Contains(f, "外資買賣超股數") {
			if foreignIdx == -1 { // Take first match (not 外資自營商)
				foreignIdx = i
			}
		}
		if strings.Contains(f, "投信買賣超股數") {
			trustIdx = i
		}
		if strings.Contains(f, "自營商買賣超股數") && !strings.Contains(f, "自營商(避險)") {
			if dealerIdx == -1 {
				dealerIdx = i
			}
		}
		if strings.Contains(f, "三大法人買賣超股數") {
			totalIdx = i
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	count := 0
	for _, row := range resp.Data {
		if len(row) <= codeIdx {
			continue
		}
		code := strings.TrimSpace(row[codeIdx])
		if !is4DigitCode(code) {
			continue
		}
		symbol := code + ".TW"

		data := &InstitutionData{}
		if foreignIdx >= 0 && foreignIdx < len(row) {
			data.ForeignNetBuy = parseNumber(row[foreignIdx]) / 1000 // 股→張
		}
		if trustIdx >= 0 && trustIdx < len(row) {
			data.TrustNetBuy = parseNumber(row[trustIdx]) / 1000
		}
		if dealerIdx >= 0 && dealerIdx < len(row) {
			data.DealerNetBuy = parseNumber(row[dealerIdx]) / 1000
		}
		if totalIdx >= 0 && totalIdx < len(row) {
			data.TotalNetBuy = parseNumber(row[totalIdx]) / 1000
		} else {
			data.TotalNetBuy = data.ForeignNetBuy + data.TrustNetBuy + data.DealerNetBuy
		}

		s.institutionMap[symbol] = data
		count++
	}
	return count
}

func (s *BullPickScanner) fetchTPExInstitution(client *http.Client, date time.Time) {
	// TPEx uses ROC year format: 115/03/30
	rocYear := date.Year() - 1911
	dateStr := fmt.Sprintf("%d/%02d/%02d", rocYear, date.Month(), date.Day())
	tpexURL := fmt.Sprintf(
		"https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&d=%s&se=EW&t=D",
		dateStr,
	)

	body, err := getJSON(client, tpexURL)
	if err != nil {
		log.Printf("[bullpick] TPEx institution fetch failed: %v", err)
		return
	}

	var resp struct {
		ReportDate   string     `json:"reportDate"`
		ReportTitle  string     `json:"reportTitle"`
		AaData       [][]string `json:"aaData"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		log.Printf("[bullpick] TPEx institution parse failed: %v", err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	count := 0
	for _, row := range resp.AaData {
		if len(row) < 13 {
			continue
		}
		code := strings.TrimSpace(row[0])
		if !is4DigitCode(code) {
			continue
		}
		symbol := code + ".TWO"

		data := &InstitutionData{
			ForeignNetBuy: parseNumber(row[4]) / 1000,  // 外資買賣超股數
			TrustNetBuy:   parseNumber(row[8]) / 1000,  // 投信買賣超股數
			DealerNetBuy:  parseNumber(row[12]) / 1000, // 自營商買賣超股數（合計）
		}
		data.TotalNetBuy = data.ForeignNetBuy + data.TrustNetBuy + data.DealerNetBuy
		s.institutionMap[symbol] = data
		count++
	}
	log.Printf("[bullpick] TPEx institution data: %d stocks", count)
}

// ── 年營收（從 Yahoo Finance financialData 抓取）──

// yahooQuoteSummary mirrors Yahoo Finance v10 quoteSummary response
type yahooQuoteSummary struct {
	QuoteSummary struct {
		Result []struct {
			IncomeStatementHistory struct {
				IncomeStatementHistory []struct {
					TotalRevenue struct {
						Raw float64 `json:"raw"`
					} `json:"totalRevenue"`
					EndDate struct {
						Fmt string `json:"fmt"` // "2025-12-31"
					} `json:"endDate"`
				} `json:"incomeStatementHistory"`
			} `json:"incomeStatementHistory"`
			FinancialData struct {
				RevenueGrowth struct {
					Raw float64 `json:"raw"` // 0.25 = 25%
				} `json:"revenueGrowth"`
				TotalRevenue struct {
					Raw float64 `json:"raw"`
				} `json:"totalRevenue"`
			} `json:"financialData"`
		} `json:"result"`
	} `json:"quoteSummary"`
}

func (s *BullPickScanner) fetchRevenueData(client *http.Client) {
	// 年營收從 Yahoo Finance 抓，在 Analyze 裡逐檔抓取（因為每支股票要個別 call）
	// 這裡不需要批次抓，改為 lazy fetch per stock
	log.Printf("[bullpick] Revenue will be fetched per-stock from Yahoo Finance")
}

// FetchStockRevenue fetches annual revenue for a single stock from Yahoo Finance
func (s *BullPickScanner) FetchStockRevenue(client *http.Client, symbol string) *RevenueData {
	code := extractStockCode(symbol)

	// Check cache first
	s.mu.RLock()
	if cached, ok := s.revenueMap[code]; ok {
		s.mu.RUnlock()
		return cached
	}
	s.mu.RUnlock()

	// Fetch from Yahoo Finance v10 quoteSummary
	url := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v10/finance/quoteSummary/%s?modules=incomeStatementHistory,financialData",
		symbol,
	)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}

	var qs yahooQuoteSummary
	if err := json.Unmarshal(body, &qs); err != nil {
		return nil
	}

	if len(qs.QuoteSummary.Result) == 0 {
		return nil
	}

	result := qs.QuoteSummary.Result[0]
	data := &RevenueData{}

	// 方法1: 從 incomeStatementHistory 取最近兩年營收算成長率
	stmts := result.IncomeStatementHistory.IncomeStatementHistory
	if len(stmts) >= 2 {
		latest := stmts[0]
		prev := stmts[1]
		data.RevenueLatest = latest.TotalRevenue.Raw
		data.RevenuePrev = prev.TotalRevenue.Raw
		if data.RevenuePrev > 0 {
			data.RevenueGrowth = (data.RevenueLatest - data.RevenuePrev) / data.RevenuePrev * 100
		}
		latestYear := ""
		prevYear := ""
		if len(latest.EndDate.Fmt) >= 4 {
			latestYear = latest.EndDate.Fmt[:4]
		}
		if len(prev.EndDate.Fmt) >= 4 {
			prevYear = prev.EndDate.Fmt[:4]
		}
		data.Period = latestYear + " vs " + prevYear
	} else if result.FinancialData.TotalRevenue.Raw > 0 {
		// 方法2: 從 financialData 取 revenueGrowth
		data.RevenueLatest = result.FinancialData.TotalRevenue.Raw
		data.RevenueGrowth = result.FinancialData.RevenueGrowth.Raw * 100 // 0.25 → 25%
		data.Period = "TTM"
	}

	if data.RevenueLatest > 0 {
		s.mu.Lock()
		s.revenueMap[code] = data
		s.mu.Unlock()
		return data
	}
	return nil
}

// ── Analyze ──

func (s *BullPickScanner) Analyze(chart *model.StockChartData, params BullPickScanParams) *model.BullPickAnalysis {
	candles := chart.Candles
	n := len(candles)
	if n < 130 {
		return nil
	}

	today := candles[n-1]
	price := chart.LatestPrice
	if price == 0 {
		price = today.Close
	}
	if price < params.MinPrice || price > params.MaxPrice {
		return nil
	}

	adv20 := avgVolumeN(candles, 20) / 1000.0
	if adv20 < params.MinADV20Lots {
		return nil
	}

	// ── MAs ──
	closes := make([]float64, n)
	for i, c := range candles {
		closes[i] = c.Close
	}
	ma20 := simpleMA(closes, 20)
	ma60 := simpleMA(closes, 60)
	ma120 := simpleMA(closes, 120)
	ma200 := 0.0
	if n >= 200 {
		ma200 = simpleMA(closes, 200)
	}
	if ma20 <= 0 || ma60 <= 0 {
		return nil
	}

	// ── 1. Pattern Detection ──
	pattern, patternLabel := detectShape(candles, n)
	maAligned := price > ma20 && ma20 > ma60 && (ma120 <= 0 || ma60 > ma120)

	// ── 2. Distance to All-Time High ──
	allTimeHigh := 0.0
	allTimeHighDate := ""
	for _, c := range candles {
		if c.High > allTimeHigh {
			allTimeHigh = c.High
			allTimeHighDate = c.Date
		}
	}
	distHighPct := 0.0
	if allTimeHigh > 0 {
		distHighPct = (allTimeHigh - price) / allTimeHigh * 100
	}

	// 硬篩：距歷史高點必須在上限內
	if distHighPct > params.DistHighMax {
		return nil
	}

	// ── 3. Institutional Data ──
	s.mu.RLock()
	inst := s.institutionMap[chart.Symbol]
	s.mu.RUnlock()

	foreignNetBuy := 0.0
	trustNetBuy := 0.0
	dealerNetBuy := 0.0
	totalNetBuy := 0.0
	if inst != nil {
		foreignNetBuy = inst.ForeignNetBuy
		trustNetBuy = inst.TrustNetBuy
		dealerNetBuy = inst.DealerNetBuy
		totalNetBuy = inst.TotalNetBuy
	}

	// ── 4. Annual Revenue Data (from Yahoo Finance) ──
	revenueLatest := 0.0
	revenuePrev := 0.0
	revenueGrowth := 0.0
	revenuePeriod := ""

	revClient := &http.Client{Timeout: 10 * time.Second}
	rev := s.FetchStockRevenue(revClient, chart.Symbol)
	if rev != nil {
		revenueLatest = rev.RevenueLatest / 1e8 // → 億
		revenuePrev = rev.RevenuePrev / 1e8
		revenueGrowth = rev.RevenueGrowth
		revenuePeriod = rev.Period
	}

	// ── Scoring ──
	score := calcBullPickScore(
		pattern, maAligned, distHighPct, params.DistHighMax,
		totalNetBuy, foreignNetBuy, trustNetBuy,
		revenueGrowth,
		price, ma20, ma60,
	)

	if score < params.MinScore {
		return nil
	}

	// ── Trade Plan ──
	stopLoss, stopLabel := calcEliteStopLoss(candles, n, price, ma20)
	risk := price - stopLoss
	if risk <= 0 {
		stopLoss = roundTo2(price * 0.95)
		risk = price - stopLoss
	}
	target := roundTo2(price + 2*risk)
	targetLabel := "2:1 風報比"
	if distHighPct < 3 {
		target = roundTo2(price + 3*risk)
		targetLabel = "接近歷史高 3:1"
	}
	rr := 0.0
	if risk > 0 {
		rr = roundTo2((target - price) / risk)
	}

	market := "上市"
	if strings.HasSuffix(chart.Symbol, ".TWO") {
		market = "上櫃"
	}

	return &model.BullPickAnalysis{
		Symbol:       chart.Symbol,
		Name:         chart.Name,
		Market:       market,
		Industry:     GetIndustry(chart.Symbol, chart.Name),
		ConceptTag:   GetConceptTag(chart.Symbol),
		CurrentPrice: roundTo2(price),

		Pattern:      pattern,
		PatternLabel: patternLabel,
		MAAligned:    maAligned,

		AllTimeHigh:     roundTo2(allTimeHigh),
		AllTimeHighDate: allTimeHighDate,
		DistHighPct:     roundTo2(distHighPct),

		ForeignNetBuy: roundTo2(foreignNetBuy),
		TrustNetBuy:   roundTo2(trustNetBuy),
		DealerNetBuy:  roundTo2(dealerNetBuy),
		TotalNetBuy:   roundTo2(totalNetBuy),

		RevenueLatest: roundTo2(revenueLatest),
		RevenuePrev:   roundTo2(revenuePrev),
		RevenueGrowth: roundTo2(revenueGrowth),
		RevenuePeriod: revenuePeriod,

		MA20:  roundTo2(ma20),
		MA60:  roundTo2(ma60),
		MA120: roundTo2(ma120),
		MA200: roundTo2(ma200),

		EntryPrice:  roundTo2(price),
		StopLoss:    stopLoss,
		StopLabel:   stopLabel,
		Target:      target,
		TargetLabel: targetLabel,
		RewardRisk:  rr,

		ADV20:       roundTo2(adv20),
		TodayVolume: today.Volume,
		Score:       score,
	}
}

func calcBullPickScore(
	pattern model.PatternShape, maAligned bool, distHighPct, distHighMax float64,
	totalNetBuy, foreignNetBuy, trustNetBuy float64,
	revenueGrowth float64,
	price, ma20, ma60 float64,
) float64 {
	score := 0.0

	// ① 線型型態 (0-20 pts)
	switch pattern {
	case model.ShapeCup:
		score += 20
	case model.ShapeU:
		score += 17
	case model.ShapeN:
		score += 14
	default:
		score += 5 // 沒型態也給底分
	}

	// ② 多頭排列 (0-15 pts)
	if maAligned {
		score += 15
	} else if price > ma20 && ma20 > ma60 {
		score += 12
	} else if price > ma20 {
		score += 8
	} else if price > ma60 {
		score += 4
	}

	// ③ 距歷史高點 (0-20 pts): closer = better
	if distHighPct <= 0 {
		score += 20 // 創新高
	} else if distHighPct < 3 {
		score += 18
	} else if distHighPct < 5 {
		score += 16
	} else if distHighPct < distHighMax {
		score += 14
	} else if distHighPct < 15 {
		score += 10
	} else if distHighPct < 20 {
		score += 6
	} else {
		score += 2
	}

	// ④ 三大法人買超 (0-25 pts)
	instScore := 0.0
	if totalNetBuy > 1000 {
		instScore += 10
	} else if totalNetBuy > 500 {
		instScore += 8
	} else if totalNetBuy > 100 {
		instScore += 6
	} else if totalNetBuy > 0 {
		instScore += 4
	} else {
		instScore += 1 // 賣超也給底分
	}
	// 外資+投信同步買超額外加分
	if foreignNetBuy > 0 && trustNetBuy > 0 {
		instScore += 8
	} else if foreignNetBuy > 0 || trustNetBuy > 0 {
		instScore += 4
	}
	// 投信買超特別加分（投信選股較嚴謹）
	if trustNetBuy > 100 {
		instScore += 7
	} else if trustNetBuy > 50 {
		instScore += 5
	} else if trustNetBuy > 0 {
		instScore += 3
	}
	score += math.Min(instScore, 25)

	// ⑤ 年營收成長率 (0-20 pts)
	revScore := 0.0
	if revenueGrowth > 100 {
		revScore += 20 // 營收翻倍
	} else if revenueGrowth > 50 {
		revScore += 17
	} else if revenueGrowth > 30 {
		revScore += 14
	} else if revenueGrowth > 20 {
		revScore += 12
	} else if revenueGrowth > 10 {
		revScore += 9
	} else if revenueGrowth > 0 {
		revScore += 5
	} else if revenueGrowth > -10 {
		revScore += 2 // 小幅衰退
	} else {
		revScore += 0 // 營收大幅衰退不給分
	}
	score += revScore

	return math.Min(score, 100)
}

func extractStockCode(symbol string) string {
	// "2330.TW" → "2330"
	if idx := strings.Index(symbol, "."); idx > 0 {
		return symbol[:idx]
	}
	return symbol
}

// GetInstitution returns institution data for a symbol (for handler use)
func (s *BullPickScanner) GetInstitution(symbol string) *InstitutionData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.institutionMap[symbol]
}

// GetRevenue returns revenue data for a stock code
func (s *BullPickScanner) GetRevenue(code string) *RevenueData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.revenueMap[code]
}

func (s *BullPickScanner) InstitutionCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.institutionMap)
}

func (s *BullPickScanner) RevenueCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.revenueMap)
}

// SortBullPickByScore sorts by score descending
func SortBullPickByScore(stocks []model.BullPickAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}
