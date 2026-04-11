// Frontend-only API: fetches data via Vercel serverless proxies,
// then runs analysis in the browser.

import { BullPickAnalysis, BullPickScanResult, MarketStatus, StockChartData, OHLCV, IndustrySector, IndustryFlowData, IndustryStockEntry } from '../types';
import { analyze, parseYahooChart, BullPickParams, InstitutionEntry, RevenueEntry, rescoreWithRevenue } from './scanner';
import { INDUSTRY_MAP } from '../data/industryMap';

// ── Stock code → industry classification (fallback when API unavailable) ──

const CONCEPT_TAGS: Record<string, string> = {
  '2330': '晶圓代工', '2454': 'IC 設計', '3443': 'IC 設計', '2379': 'IC 設計',
  '3034': 'AI 伺服器', '2382': 'AI 伺服器', '3017': 'AI 伺服器', '6669': 'AI 伺服器',
  '2345': 'AI 伺服器', '3005': 'AI 伺服器', '2353': 'AI 伺服器', '2383': 'AI 伺服器',
  '3706': 'AI 伺服器', '6085': 'AI 伺服器',
  '2324': 'PCB/IC載板', '2467': 'PCB/IC載板', '2395': 'PCB/IC載板',
  '5274': '矽智財', '3661': '矽智財', '6547': 'ASIC',
  '2303': 'DRAM', '6510': '記憶體 IC',
  '2317': '代工/雲端', '4938': 'iPhone 組裝', '2354': '鴻海集團',
  '3037': 'AI 散熱', '3653': 'AI 散熱', '6285': 'AI 散熱', '3380': 'AI 散熱', '6414': 'AI 散熱',
  '3231': 'AI 機殼', '2441': 'AI 機殼',
  '4915': '高階 PCB', '3189': 'HDI PCB', '8046': '軟板 PCB', '8299': 'PCB',
  '2327': '網通設備', '4904': '光通訊', '2455': '光通訊', '3045': '網通設備', '3044': '網通設備',
  '6488': '低軌衛星', '3376': '低軌衛星', '6231': '低軌衛星',
  '3481': '面板', '6116': 'Mini LED', '6176': 'LED 驅動',
  '2207': '汽車零件', '2227': '輪胎', '6271': '車用面板',
  '2891': '金控', '2881': '金控', '2882': '金控', '2886': '金控',
  '2883': '金控', '2884': '金控', '2885': '金控', '2887': '金控',
  '2890': '金控', '2892': '金控', '5880': '金控',
  '2002': '鋼鐵', '2006': '鋼鐵', '2014': '鋼鐵',
  '1301': '塑化', '1303': '塑化', '1326': '塑化', '6505': '塑化',
  '1101': '水泥', '1102': '水泥',
  '1216': '食品', '1227': '食品', '2912': '食品通路',
  '2603': '貨櫃航運', '2609': '貨櫃航運', '2615': '貨櫃航運',
  '2605': '散裝航運', '2634': '航空',
  '4743': '新藥', '6446': 'CDMO', '4142': '基因檢測',
  '6533': '風電', '6244': '太陽能', '6409': '儲能',
  '2208': '國防航太', '2049': '機器人', '4506': '減速機', '2308': '工業自動化',
  '3665': '連接器', '2368': '光電/IC',
};

// Look up industry from static map (1,925 stocks from TWSE/TPEx official data)
function classifyBySymbol(symbol: string): string {
  const code = symbol.replace(/\.(TW|TWO)$/, '');
  return INDUSTRY_MAP[code] ?? '';
}

// Base URL: empty string when deployed to Vercel (same origin), or override for local dev
const BASE = import.meta.env.VITE_API_URL ?? '';

async function fetchJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`);
  return r.json();
}

// ── Stock List ──

interface StockListItem {
  symbol: string;
  name: string;
  close: number;
  volume: number;
  date: string;  // TWSE/TPEx 資料日期 (e.g. "2026-04-01")
}

interface StockListResponse {
  stocks: StockListItem[];
  total: number;
  debug?: string[];
}

// ── Institution Data ──

interface InstitutionResponse {
  data: Record<string, InstitutionEntry>;
  count: number;
}

// ── Revenue Data ──

interface RevenueResponse {
  revenue: RevenueEntry | null;
  error?: string;
}

// ── Global Indices ──

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  time: string;  // last update time
}

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq' },
  { symbol: '^DJI', name: 'Dow Jones' },
  { symbol: '^SOX', name: '費半指數' },
  { symbol: '^TWII', name: '台灣加權' },
  { symbol: 'NQ=F', name: '那斯達克期貨' },
  { symbol: 'ES=F', name: 'S&P 期貨' },
];

// ── TAIFEX Futures ──

export interface TaifexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  time: string;
  session: string; // 'day' | 'night'
}

export async function fetchTaifex(): Promise<TaifexQuote | null> {
  try {
    const data = await fetchJSON<{
      symbol?: string; name?: string; price?: number;
      change?: number; changePct?: number; time?: string; session?: string;
      error?: string;
    }>('/api/taifex');
    if (data.error || !data.price) return null;
    return {
      symbol: data.symbol ?? 'TX',
      name: data.name ?? (data.session === 'night' ? '台指夜盤' : '台指期貨'),
      price: data.price,
      change: data.change ?? 0,
      changePct: data.changePct ?? 0,
      time: data.time ?? '',
      session: data.session ?? 'day',
    };
  } catch {
    return null;
  }
}

export async function fetchIndices(): Promise<IndexQuote[]> {
  const results: IndexQuote[] = [];
  const promises = INDICES.map(async (idx) => {
    try {
      const data = await fetchJSON<Record<string, unknown>>(`/api/chart?symbol=${encodeURIComponent(idx.symbol)}`);
      const meta = (data as any)?.chart?.result?.[0]?.meta;
      if (!meta) return null;

      const price = meta.regularMarketPrice ?? 0;
      // Use previousClose (yesterday's close), NOT chartPreviousClose (chart start date)
      // Fallback: use second-to-last candle close from actual data
      let prevClose = meta.previousClose ?? 0;
      if (!prevClose) {
        const closes = (data as any)?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        if (closes.length >= 2) {
          prevClose = closes[closes.length - 2] ?? 0;
        }
      }
      const change = prevClose > 0 ? price - prevClose : 0;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      // Format update time
      const ts = meta.regularMarketTime ?? 0;
      const d = new Date(ts * 1000);
      const time = d.toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

      return {
        symbol: idx.symbol,
        name: idx.name,
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
        time,
      };
    } catch {
      return null;
    }
  });

  const settled = await Promise.all(promises);
  for (const q of settled) {
    if (q) results.push(q);
  }
  return results;
}

// ── Industry Data ──

interface IndustryResponse {
  data: Record<string, { industry: string; concept: string }>;
  count: number;
}

async function fetchChart(symbol: string): Promise<{ candles: OHLCV[]; name: string; allTimeHigh?: number; allTimeHighDate?: string } | null> {
  try {
    // Fetch daily chart (2 years) for analysis + monthly chart (20 years) for true ATH
    const [dailyData, monthlyData] = await Promise.all([
      fetchJSON<Record<string, unknown>>(`/api/chart?symbol=${encodeURIComponent(symbol)}`),
      fetchJSON<Record<string, unknown>>(`/api/chart?symbol=${encodeURIComponent(symbol)}&interval=1mo`),
    ]);

    const candles = parseYahooChart(dailyData, symbol, '');
    if (!candles) return null;

    const meta = (dailyData as any)?.chart?.result?.[0]?.meta;
    const name = meta?.shortName ?? meta?.symbol ?? symbol;

    // Find true all-time high from monthly data (up to 20 years)
    let allTimeHigh = 0;
    let allTimeHighDate = '';
    const monthlyCandles = parseYahooChart(monthlyData, symbol, '');
    if (monthlyCandles) {
      for (const c of monthlyCandles) {
        if (c.high > allTimeHigh) {
          allTimeHigh = c.high;
          allTimeHighDate = c.date;
        }
      }
    }

    return { candles, name, allTimeHigh: allTimeHigh || undefined, allTimeHighDate: allTimeHighDate || undefined };
  } catch {
    return null;
  }
}

// ── Market Status (TAIEX via ^TWII) ──

async function fetchMarketStatus(): Promise<MarketStatus | null> {
  try {
    const data = await fetchJSON<Record<string, unknown>>('/api/chart?symbol=^TWII');
    const candles = parseYahooChart(data, '^TWII', '');
    if (!candles || candles.length < 60) return null;

    const closes = candles.map((c) => c.close);
    const n = closes.length;
    const price = closes[n - 1];
    const ma20 = avg(closes, 20);
    const ma60 = avg(closes, 60);
    const ma120 = n >= 120 ? avg(closes, 120) : 0;

    let trend: 'bull' | 'bear' | 'neutral' = 'neutral';
    let trendLabel = '盤整';
    if (price > ma20 && ma20 > ma60) { trend = 'bull'; trendLabel = '多頭'; }
    else if (price < ma20 && ma20 < ma60) { trend = 'bear'; trendLabel = '空頭'; }

    return {
      indexPrice: r2(price),
      ma20: r2(ma20),
      ma60: r2(ma60),
      ma120: r2(ma120),
      trend,
      trendLabel,
    };
  } catch {
    return null;
  }
}

function avg(data: number[], period: number): number {
  const n = data.length;
  if (n < period) return 0;
  let sum = 0;
  for (let i = n - period; i < n; i++) sum += data[i];
  return sum / period;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Main Scan Orchestrator ──

export interface BullPickScanParams {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  distHighMax?: number;
  minScore?: number;
  requireVolShrink?: boolean;
  excludeFinancial?: boolean;
}

export async function scanBullPick(
  params: BullPickScanParams,
  onProgress?: (done: number, total: number) => void,
): Promise<BullPickScanResult> {
  const p: BullPickParams = {
    minPrice: params.minPrice ?? 15,
    maxPrice: params.maxPrice ?? 9999,
    minADV20Lots: params.minVolume ?? 300,
    distHighMax: params.distHighMax ?? 10,
    minScore: params.minScore ?? 40,
    requireVolShrink: params.requireVolShrink ?? false,
  };

  // Step 1: Fetch stock list + institution data + market status in parallel
  // Institution may timeout on free plan — don't let it break the entire scan
  let stockListRes = await Promise.all([
    fetchJSON<StockListResponse>(`/api/stocks?minPrice=${p.minPrice}&minVolume=0`),
    fetchJSON<InstitutionResponse>('/api/institution?days=20')
      .catch(() => ({ data: {}, count: 0 } as InstitutionResponse)),
    fetchMarketStatus(),
  ]).then(([s, i, m]) => ({ stockListRes: s, instRes: i, market: m }));

  // Retry stock list if TWSE failed (< 1000 stocks means TWSE likely down)
  if (stockListRes.stockListRes.stocks.length < 1000) {
    console.log(`[scanner] only ${stockListRes.stockListRes.stocks.length} stocks, retrying stock list...`);
    await new Promise(r => setTimeout(r, 2000));
    const retry = await fetchJSON<StockListResponse>(`/api/stocks?minPrice=${p.minPrice}&minVolume=0`).catch(() => null);
    if (retry && retry.stocks.length > stockListRes.stockListRes.stocks.length) {
      stockListRes = { ...stockListRes, stockListRes: retry };
      console.log(`[scanner] retry got ${retry.stocks.length} stocks`);
    }
  }

  const stocks = stockListRes.stockListRes.stocks;
  const instMap = stockListRes.instRes.data ?? {};
  const market = stockListRes.market;
  const total = stocks.length;

  // Step 1b: Fetch industry data (API may fail from overseas, has code-based fallback)
  const indRes = await fetchJSON<IndustryResponse>('/api/industry')
    .catch(() => ({ data: {}, count: 0 } as IndustryResponse));
  const indMap = indRes.data ?? {};
  console.log(`[scanner] industry data: ${Object.keys(indMap).length} entries`);

  // Debug: log stock list source info
  if (stockListRes.stockListRes.debug) {
    console.log('[scanner] stock list debug:', stockListRes.stockListRes.debug);
  }
  console.log(`[scanner] ${total} stocks loaded (TWSE+TPEx), institution: ${Object.keys(instMap).length}`);

  // Compute industry sectors from ALL stocks (not just filtered)
  const flowData = computeIndustrySectors(stocks, instMap, indMap);
  const industries = flowData.sectors;
  console.log(`[scanner] ${industries.length} industry sectors computed`);

  // Filter out financial stocks before chart fetch (saves API calls)
  let scanStocks = stocks;
  if (params.excludeFinancial) {
    scanStocks = stocks.filter(s => classifyBySymbol(s.symbol) !== '金融保險業');
    console.log(`[scanner] excluded financial: ${stocks.length - scanStocks.length} stocks removed, ${scanStocks.length} remaining`);
  }
  const scanTotal = scanStocks.length;

  // Step 2: Fetch charts in batches and analyze
  const BATCH_SIZE = 8;
  const results: BullPickAnalysis[] = [];
  let done = 0;
  let latestDate = '';

  for (let i = 0; i < scanStocks.length; i += BATCH_SIZE) {
    const batch = scanStocks.slice(i, i + BATCH_SIZE);
    const chartPromises = batch.map((s) => fetchChart(s.symbol));
    const charts = await Promise.all(chartPromises);

    for (let j = 0; j < batch.length; j++) {
      const s = batch[j];
      const chartData = charts[j];

      if (chartData?.candles) {
        let candles = chartData.candles;

        // Patch: if TWSE/TPEx has newer data than Yahoo Finance, append it
        if (s.close > 0 && s.date) {
          const lastCandle = candles[candles.length - 1];
          if (lastCandle && s.date > lastCandle.date) {
            candles = [...candles, {
              date: s.date,
              open: s.close,  // approximate: use close as OHLC
              high: s.close,
              low: s.close,
              close: s.close,
              volume: s.volume,
            }];
          }
        }

        // Track the latest candle date across all stocks
        const lastCandle = candles[candles.length - 1];
        if (lastCandle && lastCandle.date > latestDate) latestDate = lastCandle.date;

        const inst = instMap[s.symbol];
        // Pass true ATH from monthly data (up to 20 years)
        const ath = chartData.allTimeHigh ? { high: chartData.allTimeHigh, date: chartData.allTimeHighDate ?? '' } : undefined;
        const result = analyze(
          s.symbol,
          s.name || chartData.name,
          candles,
          p,
          inst,
          null, // revenue fetched separately for matched stocks
          ath,
        );
        if (result) {
          // Attach industry data from API or fallback
          const ind = indMap[s.symbol];
          if (ind) {
            result.industry = ind.industry || result.industry;
            result.conceptTag = ind.concept || result.conceptTag;
          }
          // Fallback: classify by stock code if still empty
          if (!result.industry) {
            result.industry = classifyBySymbol(s.symbol);
          }
          if (!result.conceptTag) {
            const code = s.symbol.replace(/\.(TW|TWO)$/, '');
            result.conceptTag = CONCEPT_TAGS[code] || '';
          }
          results.push(result);
        }
      }
      done++;
    }

    onProgress?.(done, scanTotal);
  }

  // Step 3: Fetch revenue for matched stocks (top candidates only, to save time)
  const revBatchSize = 5;
  // Sort by score descending before fetching revenue
  results.sort((a, b) => b.score - a.score);

  for (let i = 0; i < results.length; i += revBatchSize) {
    const batch = results.slice(i, i + revBatchSize);
    const revPromises = batch.map((s) =>
      fetchJSON<RevenueResponse>(`/api/revenue?symbol=${encodeURIComponent(s.symbol)}`)
        .catch(() => ({ revenue: null } as RevenueResponse))
    );
    const revResults = await Promise.all(revPromises);

    for (let j = 0; j < batch.length; j++) {
      const rev = revResults[j].revenue;
      if (rev) {
        const s = batch[j];
        s.revenueLatest = r2(rev.revenueLatest / 1e8);
        s.revenuePrev = r2(rev.revenuePrev / 1e8);
        s.revenueGrowth = r2(rev.revenueGrowth);
        s.revenuePeriod = rev.period;
        // Re-calculate score with actual revenue data
        rescoreWithRevenue(s);
      }
    }
  }

  // Re-sort after revenue re-scoring
  results.sort((a, b) => b.score - a.score);

  console.log(`[scanner] latest candle date: ${latestDate}, matched: ${results.length}/${scanTotal}`);

  return {
    stocks: results,
    market: market ?? { indexPrice: 0, ma20: 0, ma60: 0, ma120: 0, trend: 'neutral', trendLabel: '無資料' },
    industries,
    stocksByIndustry: flowData.stocksByIndustry,
    scannedAt: new Date().toISOString(),
    total: results.length,
    scanned: scanTotal,
    latestDate,
  };
}

// ── Chart fetcher for BullPickRow ──

export type ChartInterval = '1d' | '1wk' | '1mo';

// MA configs per interval
// 日線: 5MA(短期), 20MA(月線), 60MA(季線), 200MA(年線)
// 週線: 5MA(月線), 20MA(半年線), 60MA(年線)
// 月線: 5MA(季線), 20MA(年線)
const MA_CONFIGS: Record<ChartInterval, { period: number; color: string; label: string }[]> = {
  '1d': [
    { period: 5, color: '#22d3ee', label: '5MA' },
    { period: 20, color: '#f59e0b', label: '20MA' },
    { period: 60, color: '#a78bfa', label: '60MA' },
    { period: 200, color: '#f472b6', label: '200MA' },
  ],
  '1wk': [
    { period: 5, color: '#22d3ee', label: '5MA' },
    { period: 20, color: '#f59e0b', label: '20MA' },
    { period: 60, color: '#a78bfa', label: '60MA' },
  ],
  '1mo': [
    { period: 5, color: '#22d3ee', label: '5MA' },
    { period: 20, color: '#f59e0b', label: '20MA' },
  ],
};

export async function getChart(symbol: string, interval: ChartInterval = '1d'): Promise<StockChartData> {
  const data = await fetchJSON<Record<string, unknown>>(`/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}`);
  const candles = parseYahooChart(data, symbol, '');
  if (!candles) throw new Error('No chart data');

  const meta = (data as any)?.chart?.result?.[0]?.meta;
  const name = meta?.shortName ?? meta?.symbol ?? symbol;

  const closes = candles.map((c) => c.close);

  // Build MA lines based on interval
  const maLines = MA_CONFIGS[interval].map(({ period, color, label }) => ({
    data: calcMAArray(closes, period),
    color,
    label,
  }));

  // Legacy fields (for analyze() compatibility)
  const ma20 = calcMAArray(closes, 20);
  const ma50 = calcMAArray(closes, 50);
  const ma150 = calcMAArray(closes, 150);
  const ma200 = calcMAArray(closes, 200);

  return {
    symbol,
    name,
    latestPrice: candles[candles.length - 1]?.close ?? 0,
    candles,
    maLines,
    ma20,
    ma50,
    ma150,
    ma200,
  };
}

// ── Compute Industry Sectors from ALL stocks ──

function computeIndustrySectors(
  stocks: StockListItem[],
  instMap: Record<string, InstitutionEntry>,
  indMap: Record<string, { industry: string; concept: string }>,
): IndustryFlowData {
  const map = new Map<string, {
    count: number;
    changes: number[];
    foreignNet: number;
    trustNet: number;
    totalNet: number;
    topBuyAmount: number;
    topBuySymbol: string;
    topBuyName: string;
  }>();
  const stocksByIndustry: Record<string, IndustryStockEntry[]> = {};

  for (const s of stocks) {
    const code = s.symbol.replace(/\.(TW|TWO)$/, '');
    const ind = indMap[s.symbol];
    const industry = ind?.industry || classifyBySymbol(s.symbol);
    if (!industry) continue; // skip unclassifiable stocks

    let g = map.get(industry);
    if (!g) {
      g = { count: 0, changes: [], foreignNet: 0, trustNet: 0, totalNet: 0, topBuyAmount: 0, topBuySymbol: '', topBuyName: '' };
      map.set(industry, g);
    }

    g.count++;

    // Institution data (in 張 = lots)
    const inst = instMap[s.symbol];
    if (inst) {
      const foreignLots = inst.foreignNetBuy;
      const trustLots = inst.trustNetBuy;
      const totalLots = inst.totalNetBuy;
      g.foreignNet += foreignLots;
      g.trustNet += trustLots;
      g.totalNet += totalLots;

      if (totalLots > g.topBuyAmount) {
        g.topBuyAmount = totalLots;
        g.topBuySymbol = code;
        g.topBuyName = s.name;
      }

      // Collect per-stock entries (only stocks with institution data)
      if (!stocksByIndustry[industry]) stocksByIndustry[industry] = [];
      stocksByIndustry[industry].push({
        symbol: code,
        name: s.name,
        price: s.close,
        foreignNetBuy: Math.round(foreignLots),
        trustNetBuy: Math.round(trustLots),
        dealerNetBuy: Math.round(inst.dealerNetBuy ?? 0),
        totalNetBuy: Math.round(totalLots),
      });
    }
  }

  // Sort per-stock entries by totalNetBuy descending
  for (const key of Object.keys(stocksByIndustry)) {
    stocksByIndustry[key].sort((a, b) => b.totalNetBuy - a.totalNetBuy);
  }

  const sectors: IndustrySector[] = [];
  for (const [industry, g] of map) {
    sectors.push({
      industry,
      stockCount: g.count,
      avgChangePct: 0,
      totalNetBuy: Math.round(g.totalNet),
      foreignNetBuy: Math.round(g.foreignNet),
      trustNetBuy: Math.round(g.trustNet),
      topBuyStock: g.topBuySymbol,
      topBuyStockName: g.topBuyName,
      topBuyAmount: Math.round(g.topBuyAmount),
    });
  }

  sectors.sort((a, b) => Math.abs(b.totalNetBuy) - Math.abs(a.totalNetBuy));
  return { sectors, stocksByIndustry };
}

// ── Standalone Industry Flow (no full scan needed) ──

export async function fetchIndustryFlow(): Promise<IndustryFlowData> {
  // Fetch stock list + institution data + industry classification in parallel
  const [stockListRes, instRes, indRes] = await Promise.all([
    fetchJSON<StockListResponse>('/api/stocks?minPrice=0&minVolume=0'),
    fetchJSON<InstitutionResponse>('/api/institution?days=20')
      .catch(() => ({ data: {}, count: 0 } as InstitutionResponse)),
    fetchJSON<IndustryResponse>('/api/industry').catch(() => ({ data: {}, count: 0 } as IndustryResponse)),
  ]);

  const stocks = stockListRes.stocks ?? [];
  const instMap = instRes.data ?? {};
  const indMap = indRes.data ?? {};

  console.log(`[industryFlow] stocks=${stocks.length}, institution=${Object.keys(instMap).length}`);

  if (stocks.length === 0 || Object.keys(instMap).length === 0) {
    return { sectors: [], stocksByIndustry: {} };
  }

  return computeIndustrySectors(stocks, instMap, indMap);
}

function calcMAArray(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}
