// Browser-side Bull Pick analysis logic (ported from Go backend)
import type { BullPickAnalysis, PatternShapeType } from '../types';

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InstitutionEntry {
  foreignNetBuy: number;
  trustNetBuy: number;
  dealerNetBuy: number;
  totalNetBuy: number;
}

export interface RevenueEntry {
  revenueLatest: number;
  revenuePrev: number;
  revenueGrowth: number;
  period: string;
}

export interface BullPickParams {
  minPrice: number;
  maxPrice: number;
  minADV20Lots: number;
  distHighMax: number;
  minScore: number;
}

// ── Main Analyze Function ──

export function analyze(
  symbol: string,
  name: string,
  candles: OHLCV[],
  params: BullPickParams,
  institution?: InstitutionEntry,
  revenue?: RevenueEntry | null,
): BullPickAnalysis | null {
  const n = candles.length;
  if (n < 130) return null;

  const today = candles[n - 1];
  const price = today.close;
  const prevClose = n >= 2 ? candles[n - 2].close : price;
  const changePct = prevClose > 0 ? r2(((price - prevClose) / prevClose) * 100) : 0;
  if (price < params.minPrice || price > params.maxPrice) return null;

  const adv20 = avgVolumeN(candles, 20) / 1000;
  if (adv20 < params.minADV20Lots) return null;

  // MAs
  const closes = candles.map((c) => c.close);
  const ma20 = simpleMA(closes, 20);
  const ma60 = simpleMA(closes, 60);
  const ma120 = simpleMA(closes, 120);
  const ma200 = n >= 200 ? simpleMA(closes, 200) : 0;
  if (ma20 <= 0 || ma60 <= 0) return null;

  // 1. Pattern Detection
  const [pattern, patternLabel] = detectShape(candles, n);
  const maAligned = price > ma20 && ma20 > ma60 && (ma120 <= 0 || ma60 > ma120);

  // 2. Distance to All-Time High
  let allTimeHigh = 0;
  let allTimeHighDate = '';
  for (const c of candles) {
    if (c.high > allTimeHigh) {
      allTimeHigh = c.high;
      allTimeHighDate = c.date;
    }
  }
  const distHighPct = allTimeHigh > 0 ? ((allTimeHigh - price) / allTimeHigh) * 100 : 0;

  // Hard filter: must be within distHighMax
  if (distHighPct > params.distHighMax) return null;

  // 3. Institutional Data
  const foreignNetBuy = institution?.foreignNetBuy ?? 0;
  const trustNetBuy = institution?.trustNetBuy ?? 0;
  const dealerNetBuy = institution?.dealerNetBuy ?? 0;
  const totalNetBuy = institution?.totalNetBuy ?? 0;

  // 4. Revenue Data
  const revenueLatest = revenue ? revenue.revenueLatest / 1e8 : 0; // → 億
  const revenuePrev = revenue ? revenue.revenuePrev / 1e8 : 0;
  const revenueGrowth = revenue?.revenueGrowth ?? 0;
  const revenuePeriod = revenue?.period ?? '';

  // Scoring
  const score = calcBullPickScore(
    pattern, maAligned, distHighPct, params.distHighMax,
    totalNetBuy, foreignNetBuy, trustNetBuy,
    revenueGrowth,
    price, ma20, ma60,
  );

  if (score < params.minScore) return null;

  // Trade Plan
  const [stopLoss, stopLabel] = calcStopLoss(candles, n, price, ma20);
  let risk = price - stopLoss;
  let finalStopLoss = stopLoss;
  if (risk <= 0) {
    finalStopLoss = r2(price * 0.95);
    risk = price - finalStopLoss;
  }
  let target = r2(price + 2 * risk);
  let targetLabel = '2:1 風報比';
  if (distHighPct < 3) {
    target = r2(price + 3 * risk);
    targetLabel = '接近歷史高 3:1';
  }
  const rr = risk > 0 ? r2((target - price) / risk) : 0;

  const market = symbol.endsWith('.TWO') ? '上櫃' : '上市';

  return {
    symbol,
    name,
    market,
    industry: '',
    conceptTag: '',
    currentPrice: r2(price),
    changePct,
    pattern,
    patternLabel,
    maAligned,
    allTimeHigh: r2(allTimeHigh),
    allTimeHighDate,
    distHighPct: r2(distHighPct),
    foreignNetBuy: r2(foreignNetBuy),
    trustNetBuy: r2(trustNetBuy),
    dealerNetBuy: r2(dealerNetBuy),
    totalNetBuy: r2(totalNetBuy),
    netBuyDays: 0,
    revenueLatest: r2(revenueLatest),
    revenuePrev: r2(revenuePrev),
    revenueGrowth: r2(revenueGrowth),
    revenuePeriod,
    ma20: r2(ma20),
    ma60: r2(ma60),
    ma120: r2(ma120),
    ma200: r2(ma200),
    entryPrice: r2(price),
    stopLoss: finalStopLoss,
    stopLabel,
    target,
    targetLabel,
    rewardRisk: rr,
    adv20: r2(adv20),
    todayVolume: today.volume,
    score,
  };
}

// ── Pattern Detection ──

function detectShape(candles: OHLCV[], n: number): [PatternShapeType, string] {
  let lb = 60;
  if (lb > n - 10) lb = n - 10;
  const start = n - lb;

  // Find lowest point
  let lowestIdx = start;
  for (let i = start; i < n; i++) {
    if (candles[i].low < candles[lowestIdx].low) lowestIdx = i;
  }

  const lowPos = (lowestIdx - start) / lb;

  // Drop from pre-low high
  let preLowHigh = 0;
  for (let i = start; i < lowestIdx; i++) {
    if (candles[i].high > preLowHigh) preLowHigh = candles[i].high;
  }
  const lowDepth = preLowHigh > 0 ? ((preLowHigh - candles[lowestIdx].low) / preLowHigh) * 100 : 0;

  // Recovery
  let postLowHigh = 0;
  for (let i = lowestIdx; i < n; i++) {
    if (candles[i].high > postLowHigh) postLowHigh = candles[i].high;
  }
  const recovery =
    preLowHigh > 0 && lowDepth > 0
      ? ((postLowHigh - candles[lowestIdx].low) / (preLowHigh - candles[lowestIdx].low)) * 100
      : 0;

  const secondLow = findSecondLow(candles, start, n, lowestIdx);

  // Cup
  if (lowPos > 0.25 && lowPos < 0.65 && lowDepth > 8 && recovery > 70) {
    return ['cup', '杯型整理'];
  }
  // U
  if (lowPos > 0.2 && lowPos < 0.6 && lowDepth > 5 && recovery > 60) {
    return ['u_shape', 'U型整理'];
  }
  // N
  if (secondLow && lowDepth > 5) {
    return ['n_shape', 'N型整理'];
  }

  return ['none', ''];
}

function findSecondLow(candles: OHLCV[], start: number, end: number, firstLowIdx: number): boolean {
  if (firstLowIdx >= end - 10) return false;
  const pivotN = 5;
  for (let i = firstLowIdx + pivotN + 3; i < end - pivotN; i++) {
    let isPivot = true;
    for (let j = 1; j <= pivotN; j++) {
      if (i - j < start || i + j >= end) { isPivot = false; break; }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      const diff = (Math.abs(candles[i].low - candles[firstLowIdx].low) / candles[firstLowIdx].low) * 100;
      if (diff < 10) return true;
    }
  }
  return false;
}

// ── Scoring ──

function calcBullPickScore(
  pattern: PatternShapeType, maAligned: boolean, distHighPct: number, distHighMax: number,
  totalNetBuy: number, foreignNetBuy: number, trustNetBuy: number,
  revenueGrowth: number,
  price: number, ma20: number, ma60: number,
): number {
  let score = 0;

  // ① Pattern (0-20)
  if (pattern === 'cup') score += 20;
  else if (pattern === 'u_shape') score += 17;
  else if (pattern === 'n_shape') score += 14;
  else score += 5;

  // ② MA alignment (0-15)
  if (maAligned) score += 15;
  else if (price > ma20 && ma20 > ma60) score += 12;
  else if (price > ma20) score += 8;
  else if (price > ma60) score += 4;

  // ③ Distance to high (0-20)
  if (distHighPct <= 0) score += 20;
  else if (distHighPct < 3) score += 18;
  else if (distHighPct < 5) score += 16;
  else if (distHighPct < distHighMax) score += 14;
  else if (distHighPct < 15) score += 10;
  else if (distHighPct < 20) score += 6;
  else score += 2;

  // ④ Institutional buying (0-25)
  let instScore = 0;
  if (totalNetBuy > 1000) instScore += 10;
  else if (totalNetBuy > 500) instScore += 8;
  else if (totalNetBuy > 100) instScore += 6;
  else if (totalNetBuy > 0) instScore += 4;
  else instScore += 1;

  if (foreignNetBuy > 0 && trustNetBuy > 0) instScore += 8;
  else if (foreignNetBuy > 0 || trustNetBuy > 0) instScore += 4;

  if (trustNetBuy > 100) instScore += 7;
  else if (trustNetBuy > 50) instScore += 5;
  else if (trustNetBuy > 0) instScore += 3;

  score += Math.min(instScore, 25);

  // ⑤ Revenue growth (0-20)
  if (revenueGrowth > 100) score += 20;
  else if (revenueGrowth > 50) score += 17;
  else if (revenueGrowth > 30) score += 14;
  else if (revenueGrowth > 20) score += 12;
  else if (revenueGrowth > 10) score += 9;
  else if (revenueGrowth > 0) score += 5;
  else if (revenueGrowth > -10) score += 2;

  return Math.min(score, 100);
}

// ── Stop Loss ──

function calcStopLoss(candles: OHLCV[], n: number, price: number, ma20: number): [number, string] {
  let support = price;
  for (let i = Math.max(0, n - 20); i < n; i++) {
    if (candles[i].low < support) support = candles[i].low;
  }
  support = r2(support * 0.99);

  let ma20Stop = r2(ma20 * 0.99);

  if (support >= price) support = r2(price * 0.95);
  if (ma20Stop >= price) ma20Stop = r2(price * 0.95);

  if (support > ma20Stop && support < price) return [support, '近期支撐'];
  if (ma20Stop < price) return [ma20Stop, '20日均線'];
  return [r2(price * 0.95), '預設5%停損'];
}

// ── Helpers ──

function simpleMA(data: number[], period: number): number {
  const n = data.length;
  if (n < period) return 0;
  let sum = 0;
  for (let i = n - period; i < n; i++) sum += data[i];
  return sum / period;
}

function avgVolumeN(candles: OHLCV[], period: number): number {
  const n = candles.length;
  if (n === 0) return 0;
  const start = Math.max(0, n - period);
  let sum = 0;
  let count = 0;
  for (let i = start; i < n; i++) {
    sum += candles[i].volume;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Yahoo Finance Chart Parsing ──

export function parseYahooChart(
  data: Record<string, unknown>,
  _symbol: string,
  _name: string,
): OHLCV[] | null {
  try {
    const chart = (data as any)?.chart?.result?.[0];
    if (!chart) return null;

    const timestamps: number[] = chart.timestamp ?? [];
    const quote = chart.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return null;

    const opens: number[] = quote.open ?? [];
    const highs: number[] = quote.high ?? [];
    const lows: number[] = quote.low ?? [];
    const closes: number[] = quote.close ?? [];
    const volumes: number[] = quote.volume ?? [];

    const candles: OHLCV[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = opens[i], h = highs[i], l = lows[i], c = closes[i], v = volumes[i];
      if (o == null || h == null || l == null || c == null) continue;

      const d = new Date(timestamps[i] * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      candles.push({ date: dateStr, open: o, high: h, low: l, close: c, volume: v ?? 0 });
    }

    return candles.length > 0 ? candles : null;
  } catch {
    return null;
  }
}
