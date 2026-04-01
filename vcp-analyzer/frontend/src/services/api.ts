// Frontend-only API: fetches data via Vercel serverless proxies,
// then runs analysis in the browser.

import { BullPickAnalysis, BullPickScanResult, MarketStatus, StockChartData, OHLCV } from '../types';
import { analyze, parseYahooChart, BullPickParams, InstitutionEntry, RevenueEntry } from './scanner';

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

// ── Chart Data (Yahoo Finance) ──

async function fetchChart(symbol: string): Promise<{ candles: OHLCV[]; name: string } | null> {
  try {
    const data = await fetchJSON<Record<string, unknown>>(`/api/chart?symbol=${encodeURIComponent(symbol)}`);
    const candles = parseYahooChart(data, symbol, '');
    if (!candles) return null;

    // Extract name from Yahoo response
    const meta = (data as any)?.chart?.result?.[0]?.meta;
    const name = meta?.shortName ?? meta?.symbol ?? symbol;
    return { candles, name };
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
  };

  // Step 1: Fetch stock list + institution data + market status in parallel
  const [stockListRes, instRes, market] = await Promise.all([
    fetchJSON<StockListResponse>(`/api/stocks?minPrice=${p.minPrice}&minVolume=0`),
    fetchJSON<InstitutionResponse>('/api/institution'),
    fetchMarketStatus(),
  ]);

  const stocks = stockListRes.stocks;
  const instMap = instRes.data ?? {};
  const total = stocks.length;

  // Debug: log stock list source info
  if (stockListRes.debug) {
    console.log('[scanner] stock list debug:', stockListRes.debug);
  }
  console.log(`[scanner] ${total} stocks loaded (TWSE+TPEx), institution: ${Object.keys(instMap).length}`, stockListRes.debug);

  // Step 2: Fetch charts in batches and analyze
  const BATCH_SIZE = 8;
  const results: BullPickAnalysis[] = [];
  let done = 0;
  let latestDate = '';

  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
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
        const result = analyze(
          s.symbol,
          s.name || chartData.name,
          candles,
          p,
          inst,
          null, // revenue fetched separately for matched stocks
        );
        if (result) results.push(result);
      }
      done++;
    }

    onProgress?.(done, total);
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
      }
    }
  }

  // Re-score with revenue data
  // (Revenue contributes up to 20 pts; we already have partial scores without it)
  // For simplicity, we just re-sort
  results.sort((a, b) => b.score - a.score);

  console.log(`[scanner] latest candle date: ${latestDate}, matched: ${results.length}/${total}`);

  return {
    stocks: results,
    market: market ?? { indexPrice: 0, ma20: 0, ma60: 0, ma120: 0, trend: 'neutral', trendLabel: '無資料' },
    scannedAt: new Date().toISOString(),
    total: results.length,
    scanned: total,
    latestDate,
  };
}

// ── Chart fetcher for BullPickRow ──

export async function getChart(symbol: string): Promise<StockChartData> {
  const data = await fetchJSON<Record<string, unknown>>(`/api/chart?symbol=${encodeURIComponent(symbol)}`);
  const candles = parseYahooChart(data, symbol, '');
  if (!candles) throw new Error('No chart data');

  const meta = (data as any)?.chart?.result?.[0]?.meta;
  const name = meta?.shortName ?? meta?.symbol ?? symbol;

  const closes = candles.map((c) => c.close);
  const ma20 = calcMAArray(closes, 20);
  const ma50 = calcMAArray(closes, 50);
  const ma150 = calcMAArray(closes, 150);
  const ma200 = calcMAArray(closes, 200);

  return {
    symbol,
    name,
    latestPrice: candles[candles.length - 1]?.close ?? 0,
    candles,
    ma20,
    ma50,
    ma150,
    ma200,
  };
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
