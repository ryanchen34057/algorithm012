package service

import (
	"strings"
	"sync"

	"vcp-analyzer/internal/model"
)

// stockNameMap maintains a cache of symbol → Chinese name mappings.
// Populated when FetchAllStocks is called.
type stockNameMap struct {
	mu    sync.RWMutex
	names map[string]string
}

var globalNames = &stockNameMap{
	names: make(map[string]string),
}

func init() {
	// Pre-populate with common names so single-stock endpoints work
	// even before a full scan has been run.
	globalNames.names = map[string]string{
		"2330.TW": "台積電", "2317.TW": "鴻海", "2454.TW": "聯發科",
		"2382.TW": "廣達", "2308.TW": "台達電", "2303.TW": "聯電",
		"3711.TW": "日月光投控", "2881.TW": "富邦金", "2882.TW": "國泰金",
		"2412.TW": "中華電", "2891.TW": "中信金", "2886.TW": "兆豐金",
		"1303.TW": "南亞", "1301.TW": "台塑", "2002.TW": "中鋼",
		"2357.TW": "華碩", "2395.TW": "研華", "3034.TW": "聯詠",
		"2379.TW": "瑞昱", "2408.TW": "南亞科", "2345.TW": "智邦",
		"3008.TW": "大立光", "2327.TW": "國巨", "4904.TW": "遠傳",
		"2207.TW": "和泰車", "6415.TWO": "矽力-KY", "3661.TWO": "世芯-KY",
		"3533.TWO": "嘉澤",
	}
}

// SetNames bulk-updates the name map (called after TWSE/TPEx fetch).
func SetNames(stocks []model.StockInfo) {
	globalNames.mu.Lock()
	defer globalNames.mu.Unlock()
	for _, s := range stocks {
		globalNames.names[s.Symbol] = s.Name
	}
}

// GetChineseName returns the Chinese name for a symbol, or "" if unknown.
func GetChineseName(symbol string) string {
	globalNames.mu.RLock()
	defer globalNames.mu.RUnlock()

	if name, ok := globalNames.names[symbol]; ok {
		return name
	}
	for k, v := range globalNames.names {
		code := strings.TrimSuffix(strings.TrimSuffix(k, ".TW"), ".TWO")
		if code == symbol {
			return v
		}
	}
	return ""
}
