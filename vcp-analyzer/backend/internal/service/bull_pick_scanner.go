package service

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
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
	Revenue      float64 // 當月營收（千元）
	RevenueYoY   float64 // 年增率 %
	RevenueMoM   float64 // 月增率 %
	RevenueMonth string  // "2026-02"
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

// ── 月營收 ──

func (s *BullPickScanner) fetchRevenueData(client *http.Client) {
	// 公開資訊觀測站 - 月營收 (try last 2 months)
	now := time.Now()
	for offset := 1; offset <= 3; offset++ {
		d := now.AddDate(0, -offset, 0)
		year := d.Year() - 1911 // ROC year
		month := int(d.Month())
		monthStr := fmt.Sprintf("%d-%02d", d.Year(), d.Month())

		// TWSE (上市) 月營收
		twseCount := s.fetchTWSERevenue(client, year, month, monthStr)
		// TPEx (上櫃) 月營收
		tpexCount := s.fetchTPExRevenue(client, year, month, monthStr)

		if twseCount > 0 || tpexCount > 0 {
			log.Printf("[bullpick] Revenue data (%s): TWSE=%d TPEx=%d", monthStr, twseCount, tpexCount)
			return
		}
	}
	log.Printf("[bullpick] failed to fetch revenue data")
}

func (s *BullPickScanner) fetchTWSERevenue(client *http.Client, rocYear, month int, monthStr string) int {
	// 公開資訊觀測站 API
	url := fmt.Sprintf(
		"https://mops.twse.com.tw/nas/t21/sii/t21sc03_%d_%d_0.html",
		rocYear, month,
	)

	body, err := getJSON(client, url)
	if err != nil {
		// Try alternative: opendata API
		url2 := "https://opendata.twse.com.tw/v1/opendata/t187ap05_L"
		body, err = getJSON(client, url2)
		if err != nil {
			return 0
		}
		return s.parseOpenDataRevenue(body, ".TW", monthStr)
	}
	// HTML parsing is complex; try opendata instead
	url2 := "https://opendata.twse.com.tw/v1/opendata/t187ap05_L"
	body2, err2 := getJSON(client, url2)
	if err2 != nil {
		return 0
	}
	return s.parseOpenDataRevenue(body2, ".TW", monthStr)
}

func (s *BullPickScanner) fetchTPExRevenue(client *http.Client, rocYear, month int, monthStr string) int {
	// TPEx opendata for revenue
	url := "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O"
	body, err := getJSON(client, url)
	if err != nil {
		return 0
	}
	return s.parseOpenDataRevenue(body, ".TWO", monthStr)
}

func (s *BullPickScanner) parseOpenDataRevenue(body []byte, suffix, monthStr string) int {
	// Try various field name patterns
	var rows []map[string]string
	if err := json.Unmarshal(body, &rows); err != nil {
		return 0
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	count := 0
	for _, row := range rows {
		code := findField(row, "公司代號", "SecuritiesCompanyCode", "Code", "code")
		if code == "" || !is4DigitCode(strings.TrimSpace(code)) {
			continue
		}
		code = strings.TrimSpace(code)

		revStr := findField(row, "當月營收", "營業收入", "Revenue", "revenue", "當月營收淨額")
		yoyStr := findField(row, "去年同月增減(%)", "營收年增率", "YoY", "去年同月增減")
		momStr := findField(row, "上月比較增減(%)", "營收月增率", "MoM", "上月比較增減")

		rev := parseNumber(revStr)
		yoy := parseNumber(yoyStr)
		mom := parseNumber(momStr)

		if rev <= 0 {
			continue
		}

		s.revenueMap[code] = &RevenueData{
			Revenue:      rev,
			RevenueYoY:   yoy,
			RevenueMoM:   mom,
			RevenueMonth: monthStr,
		}
		count++
	}
	return count
}

func findField(m map[string]string, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != "" {
			return v
		}
	}
	// Fuzzy: check if any key contains the search term
	for _, k := range keys {
		for mk, mv := range m {
			if strings.Contains(mk, k) && mv != "" {
				return mv
			}
		}
	}
	return ""
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

	// ── 4. Revenue Data ──
	stockCode := extractStockCode(chart.Symbol)
	s.mu.RLock()
	rev := s.revenueMap[stockCode]
	s.mu.RUnlock()

	revenue := 0.0
	revenueYoY := 0.0
	revenueMoM := 0.0
	revenueMonth := ""
	if rev != nil {
		revenue = rev.Revenue / 100000 // 千元→億
		revenueYoY = rev.RevenueYoY
		revenueMoM = rev.RevenueMoM
		revenueMonth = rev.RevenueMonth
	}

	// ── Scoring ──
	score := calcBullPickScore(
		pattern, maAligned, distHighPct, params.DistHighMax,
		totalNetBuy, foreignNetBuy, trustNetBuy,
		revenueYoY, revenueMoM,
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

		Revenue:      roundTo2(revenue),
		RevenueYoY:   roundTo2(revenueYoY),
		RevenueMoM:   roundTo2(revenueMoM),
		RevenueMonth: revenueMonth,

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
	revenueYoY, revenueMoM float64,
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

	// ⑤ 年營收高成長 (0-20 pts) — 以 YoY 為主
	revScore := 0.0
	if revenueYoY > 100 {
		revScore += 18 // 營收翻倍
	} else if revenueYoY > 50 {
		revScore += 15
	} else if revenueYoY > 30 {
		revScore += 12
	} else if revenueYoY > 20 {
		revScore += 10
	} else if revenueYoY > 10 {
		revScore += 7
	} else if revenueYoY > 0 {
		revScore += 4
	} else {
		revScore += 1 // 營收衰退也給底分
	}
	// MoM 月增率加分（趨勢加速）
	if revenueMoM > 10 {
		revScore += 2
	}
	score += math.Min(revScore, 20)

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

// helper for int parsing with default
func parseIntDefault(s string, def int) int {
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}

// SortBullPickByScore sorts by score descending
func SortBullPickByScore(stocks []model.BullPickAnalysis) {
	sort.Slice(stocks, func(i, j int) bool {
		return stocks[i].Score > stocks[j].Score
	})
}
