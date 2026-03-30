package service

import (
	"sync"
)

// conceptTags maps stock symbols to their concept/theme tag (概念股標籤)
var conceptTags = map[string]string{
	// ── 半導體 ──
	"2330.TW": "晶圓代工", "2303.TW": "IC 設計", "2454.TW": "IC 設計",
	"3034.TW": "IC 設計", "2379.TW": "IC 設計", "3661.TW": "矽智財",
	"6415.TW": "矽智財", "3443.TW": "記憶體封測", "2408.TW": "DRAM",
	"3711.TW": "晶圓代工", "6770.TW": "先進封裝", "5347.TW": "IC 設計",
	"2344.TW": "IC 設計", "8150.TW": "RF 晶片", "4966.TW": "IC 封測",
	"2449.TW": "利基型記憶體", "6531.TW": "ABF 載板",
	// ── AI / 伺服器 ──
	"2382.TW": "AI 伺服器", "3231.TW": "AI 伺服器", "2356.TW": "AI 伺服器",
	"6669.TW": "AI 伺服器", "3017.TW": "AI 網通", "2395.TW": "AI 伺服器",
	"3005.TW": "AI 伺服器", "4938.TW": "AI 散熱", "2360.TW": "AI 散熱",
	"3504.TW": "AI 機殼", "6285.TW": "AI 伺服器", "2345.TW": "AI 伺服器",
	"3037.TW": "AI 散熱", "6239.TW": "AI 散熱",
	// ── PCB / 載板 ──
	"2313.TW": "低軌衛星/PCB", "4104.TW": "高階 PCB",
	"8046.TW": "HDI PCB", "3044.TW": "IC 載板", "2353.TW": "PCB",
	"6153.TW": "PCB", "3189.TWO": "軟板",
	// ── 網通 / 低軌衛星 ──
	"3704.TW": "低軌衛星",
	"4977.TW": "光通訊", "2455.TW": "光通訊", "5388.TW": "光通訊",
	"2327.TW": "光通訊", "3149.TW": "光通訊模組", "2332.TW": "網通設備",
	// ── 電動車 / 車用 ──
	"2201.TW": "汽車零件", "1319.TW": "輪胎", "2231.TW": "車用面板",
	"3491.TW": "車用電子", "2308.TW": "車用連接器", "6488.TW": "車用 IC",
	"3035.TW": "車用晶片",
	// ── 面板 / 顯示 ──
	"2409.TW": "面板", "3481.TW": "面板", "6116.TW": "LED 驅動",
	"3023.TW": "Mini LED", "6176.TW": "光電",
	// ── 金融 ──
	"2881.TW": "金控", "2882.TW": "金控", "2883.TW": "金控",
	"2884.TW": "金控", "2885.TW": "金控", "2886.TW": "金控",
	"2887.TW": "金控", "2880.TW": "金控", "2891.TW": "金控",
	"2892.TW": "金控", "5880.TW": "金控", "2801.TW": "金控",
	"2834.TW": "銀行", "2838.TW": "銀行", "2845.TW": "壽險",
	"2823.TW": "壽險",
	// ── 傳產 / 鋼鐵 / 塑化 ──
	"1301.TW": "塑化", "1303.TW": "塑化", "1326.TW": "塑化",
	"2002.TW": "鋼鐵", "2006.TW": "鋼鐵", "9802.TW": "鋼鐵",
	"1101.TW": "水泥", "1102.TW": "水泥", "2207.TW": "汽車",
	"2912.TW": "統一超", "1216.TW": "食品", "1229.TW": "食品",
	"2105.TW": "輪胎", "2103.TW": "輪胎", "9904.TW": "寶成",
	// ── 航運 ──
	"2603.TW": "貨櫃航運", "2609.TW": "貨櫃航運", "2615.TW": "貨櫃航運",
	"2618.TW": "航空", "5765.TW": "散裝航運", "2606.TW": "散裝航運",
	// ── 生技 ──
	"4743.TW": "新藥", "6446.TW": "新藥", "6472.TW": "新藥",
	"1760.TW": "CDMO", "4174.TW": "基因檢測", "4142.TW": "原料藥",
	"1795.TW": "美德醫療", "6547.TW": "醫材",
	// ── 綠能 / 儲能 ──
	"6244.TW": "風電", "2374.TW": "太陽能", "3576.TW": "儲能",
	"6443.TW": "充電樁", "6464.TW": "儲能",
	// ── 軍工 / 國防 ──
	"2208.TW": "國防航太", "2634.TW": "國防航太",
	// ── 機器人 ──
	"2049.TW": "機器人", "1507.TW": "減速機", "4510.TW": "工業自動化",
	"2059.TW": "感測器",
	// ── OTC 熱門 ──
	"5274.TWO": "ASIC", "6768.TWO": "IP 矽智財", "5765.TWO": "散裝航運",
	"6547.TWO": "醫材", "3105.TWO": "穩懋砷化鎵", "8069.TWO": "CoWoS",
	"6679.TWO": "先進封裝", "3707.TWO": "漢磊 SiC", "8271.TWO": "OLED",
	"6863.TWO": "AI 邊緣運算",
}

// ── Global Industry Registry ──
// Populated at runtime from TWSE/TPEx API or stock list data.

type industryRegistry struct {
	mu   sync.RWMutex
	data map[string]string // symbol → industry
}

var globalIndustry = &industryRegistry{
	data: make(map[string]string),
}

// SetIndustries bulk-updates the industry registry (called after TWSE/TPEx fetch).
func SetIndustries(stocks []struct{ Symbol, Industry string }) {
	globalIndustry.mu.Lock()
	defer globalIndustry.mu.Unlock()
	for _, s := range stocks {
		if s.Industry != "" {
			globalIndustry.data[s.Symbol] = s.Industry
		}
	}
}

// SetIndustry sets the industry for a single symbol.
func SetIndustry(symbol, industry string) {
	globalIndustry.mu.Lock()
	defer globalIndustry.mu.Unlock()
	if industry != "" {
		globalIndustry.data[symbol] = industry
	}
}

// GetConceptTag returns the concept tag for a stock symbol
func GetConceptTag(symbol string) string {
	if tag, ok := conceptTags[symbol]; ok {
		return tag
	}
	return ""
}

// GetIndustry returns the industry for a stock symbol.
// Priority: 1) dynamic registry  2) static map  3) code-range heuristic
func GetIndustry(symbol, name string) string {
	// 1. Check dynamic registry (populated from TWSE/TPEx API)
	globalIndustry.mu.RLock()
	if ind, ok := globalIndustry.data[symbol]; ok {
		globalIndustry.mu.RUnlock()
		return ind
	}
	globalIndustry.mu.RUnlock()

	// 2. Check static map (legacy, for fallback stocks)
	if ind, ok := staticIndustryMap[symbol]; ok {
		return ind
	}

	// 3. Code-range heuristic for TWSE stocks
	code := symbol
	if idx := len(code) - 3; idx > 0 && (code[idx:] == ".TW" || false) {
		code = code[:idx]
	} else if idx := len(code) - 4; idx > 0 && code[idx:] == ".TWO" {
		code = code[:idx]
	}
	if len(code) == 4 && code[0] >= '0' && code[0] <= '9' {
		return classifyByCode(code)
	}

	return "其他"
}

// classifyByCode uses TWSE code ranges to guess industry.
// This is a rough heuristic; real classification comes from the API.
func classifyByCode(code string) string {
	if len(code) < 2 {
		return "其他"
	}
	prefix2 := code[:2]
	switch prefix2 {
	case "11":
		return "水泥"
	case "12":
		return "食品"
	case "13":
		return "塑膠"
	case "14":
		return "紡織纖維"
	case "15":
		return "電機機械"
	case "16":
		return "電器電纜"
	case "17":
		return "化學"
	case "18":
		return "生技醫療"
	case "19":
		return "玻璃陶瓷"
	case "20":
		return "鋼鐵"
	case "21":
		return "橡膠"
	case "22":
		return "汽車"
	case "23":
		return "電子"
	case "24":
		return "電子"
	case "25":
		return "建材營造"
	case "26":
		return "航運"
	case "27":
		return "觀光餐旅"
	case "28":
		return "金融保險"
	case "29":
		return "貿易百貨"
	case "30", "31", "32", "33", "34", "35", "36", "37", "38", "39":
		return "電子"
	case "40", "41", "42", "43", "44", "45", "46", "47", "48", "49":
		return "電子"
	case "50", "51", "52", "53", "54", "55", "56", "57", "58":
		return "電子"
	case "59":
		return "金融保險"
	case "60", "61", "62", "63", "64", "65", "66", "67", "68":
		return "電子"
	case "69":
		return "電子"
	case "80", "81", "82", "83", "84", "85", "86", "87", "88", "89":
		return "電子"
	case "91":
		return "其他"
	case "99":
		return "存託憑證"
	}
	return "其他"
}

// staticIndustryMap is the legacy static mapping (kept for fallback stocks)
var staticIndustryMap = map[string]string{
	// 半導體
	"2330.TW": "半導體", "2303.TW": "半導體", "2454.TW": "半導體",
	"3034.TW": "半導體", "2379.TW": "半導體", "3661.TW": "半導體",
	"6415.TW": "半導體", "3443.TW": "半導體", "2408.TW": "半導體",
	"3711.TW": "半導體", "6770.TW": "半導體", "5347.TW": "半導體",
	"2344.TW": "半導體", "8150.TW": "半導體", "4966.TW": "半導體",
	"2449.TW": "半導體", "6531.TW": "半導體",
	// 電子零組件
	"2313.TW": "電子零組件", "2308.TW": "電子零組件", "3037.TW": "電子零組件",
	"4104.TW": "電子零組件", "8046.TW": "電子零組件", "3044.TW": "電子零組件",
	"2353.TW": "電子零組件", "6153.TW": "電子零組件",
	// 電腦及週邊
	"2382.TW": "電腦及週邊", "3231.TW": "電腦及週邊", "2356.TW": "電腦及週邊",
	"6669.TW": "電腦及週邊", "2395.TW": "電腦及週邊", "3005.TW": "電腦及週邊",
	"2345.TW": "電腦及週邊", "2357.TW": "電腦及週邊",
	// 通信網路
	"3017.TW": "通信網路", "4977.TW": "通信網路", "2455.TW": "通信網路",
	"5388.TW": "通信網路", "2327.TW": "通信網路", "3149.TW": "通信網路",
	"2332.TW": "通信網路", "3704.TW": "通信網路",
	// 光電
	"2409.TW": "光電", "3481.TW": "光電", "6116.TW": "光電",
	"3023.TW": "光電", "6176.TW": "光電",
	// 散熱
	"2360.TW": "散熱", "4938.TW": "散熱", "3504.TW": "散熱",
	"6239.TW": "散熱", "6285.TW": "散熱",
	// 金融保險
	"2881.TW": "金融保險", "2882.TW": "金融保險", "2883.TW": "金融保險",
	"2884.TW": "金融保險", "2885.TW": "金融保險", "2886.TW": "金融保險",
	"2887.TW": "金融保險", "2880.TW": "金融保險", "2891.TW": "金融保險",
	"2892.TW": "金融保險", "5880.TW": "金融保險", "2801.TW": "金融保險",
	"2834.TW": "金融保險", "2838.TW": "金融保險", "2845.TW": "金融保險", "2823.TW": "金融保險",
	// 塑膠
	"1301.TW": "塑膠", "1303.TW": "塑膠", "1326.TW": "塑膠",
	// 鋼鐵
	"2002.TW": "鋼鐵", "2006.TW": "鋼鐵", "9802.TW": "鋼鐵",
	// 水泥
	"1101.TW": "水泥", "1102.TW": "水泥",
	// 航運
	"2603.TW": "航運", "2609.TW": "航運", "2615.TW": "航運",
	"2618.TW": "航運", "5765.TW": "航運", "2606.TW": "航運",
	// 食品
	"1216.TW": "食品", "1229.TW": "食品", "2912.TW": "食品",
	// 生技醫療
	"4743.TW": "生技醫療", "6446.TW": "生技醫療", "6472.TW": "生技醫療",
	"1760.TW": "生技醫療", "4174.TW": "生技醫療", "4142.TW": "生技醫療",
	"1795.TW": "生技醫療", "6547.TW": "生技醫療",
	// 汽車
	"2201.TW": "汽車", "2207.TW": "汽車", "1319.TW": "汽車",
	// 電機機械
	"1507.TW": "電機機械", "2049.TW": "電機機械", "4510.TW": "電機機械",
	// 綠能
	"6244.TW": "綠能", "2374.TW": "綠能", "3576.TW": "綠能",
	"6443.TW": "綠能", "6464.TW": "綠能",
	// 國防
	"2208.TW": "國防", "2634.TW": "國防",
}
