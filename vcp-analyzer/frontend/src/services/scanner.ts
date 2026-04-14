// Browser-side Bull Pick analysis logic (ported from Go backend)
import type { BullPickAnalysis, PatternShapeType, ScoreBreakdown } from '../types';

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
  requireVolShrink: boolean;  // 是否要求5日內有量縮
  requireVolContract: boolean; // 是否要求近期波動收斂
  volContractPct: number;      // 波動收斂門檻 % (e.g. 10 = 10%)
  volContractDays: number;     // 波動收斂觀察天數 (e.g. 15)
  allowedPatterns: PatternShapeType[]; // 限定線型（空陣列 = 不限制）
}

// ── Main Analyze Function ──

export function analyze(
  symbol: string,
  name: string,
  candles: OHLCV[],
  params: BullPickParams,
  institution?: InstitutionEntry,
  revenue?: RevenueEntry | null,
  overrideATH?: { high: number; date: string },
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

  // Volume contraction: avg vol of last 5 days vs avg vol of prior 20 days
  const vol5d = avgVolumeN(candles, 5);
  const vol20d = avgVolumeN(candles, 20);
  const volShrinkPct = vol20d > 0 ? r2((1 - vol5d / vol20d) * 100) : 0;

  // Hard filter: require volume contraction (5日均量 < 20日均量)
  if (params.requireVolShrink && volShrinkPct <= 0) return null;

  // Price range contraction (VCP core): use close prices over the last N trading
  // days — closes reflect how the chart "looks" far better than high/low which
  // includes intraday wicks. Range = (max close - min close) / min close.
  const rangeWindow = Math.min(params.volContractDays || 15, n);
  let rangeHigh = 0;
  let rangeLow = Number.MAX_VALUE;
  for (let i = n - rangeWindow; i < n; i++) {
    const c = candles[i].close;
    if (c > rangeHigh) rangeHigh = c;
    if (c < rangeLow) rangeLow = c;
  }
  const priceRangePct = rangeLow > 0 ? r2(((rangeHigh - rangeLow) / rangeLow) * 100) : 0;

  // Hard filter: require tight price range
  const contractThreshold = params.volContractPct || 10;
  if (params.requireVolContract && priceRangePct > contractThreshold) return null;

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

  // Hard filter: if user restricted to specific patterns, skip non-matches
  if (params.allowedPatterns && params.allowedPatterns.length > 0) {
    if (!params.allowedPatterns.includes(pattern)) return null;
  }

  // 2. Distance to All-Time High
  // Use override (from monthly data, up to 20 years) if available, otherwise use candle data
  let allTimeHigh = overrideATH?.high ?? 0;
  let allTimeHighDate = overrideATH?.date ?? '';
  // Also check daily candles in case they have a higher value
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
  const { score, breakdown: scoreBreakdown } = calcBullPickScore(
    pattern, maAligned, distHighPct, params.distHighMax,
    totalNetBuy, foreignNetBuy, trustNetBuy,
    revenueGrowth,
    price, ma20, ma60, adv20,
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

  // ATR(20) for volatility-based fallback targets
  const atr20 = calcATR(candles, n, 20);

  // ── 林則行 Measured Move (等幅測量) ──
  // Find swing structure: swing low → rally high → pullback low
  // T1 = pullback low + first leg (equal leg projection)
  // T2 = pullback low + 1.5 × first leg
  const mm = findMeasuredMove(candles, n);

  let target: number;
  let targetLabel: string;
  let targetFormula: string;
  let target2: number;
  let target2Label: string;
  let target2Formula: string;

  if (mm) {
    const pl = r2(mm.pullbackLow);
    const fl = r2(mm.firstLeg);
    const rh = r2(mm.rallyHigh);
    const sl = r2(mm.swingLow);
    const mmT1 = r2(pl + mm.firstLeg);
    const mmT2 = r2(pl + mm.firstLeg * 1.5);
    const mmFormula = `回調低 ${pl} + 漲幅 ${fl}（${rh} - ${sl}）`;

    // Only use ATH as T1 if price is MEANINGFULLY below it (> 3%).
    // For stocks at/near ATH, ATH ≈ current price → 0% upside, useless.
    if (distHighPct > 3 && allTimeHigh < mmT1) {
      // Below ATH and ATH is below measured move → ATH is first resistance
      target = r2(allTimeHigh);
      targetLabel = '歷史高點';
      targetFormula = `前高 ${r2(allTimeHigh)}`;
      target2 = mmT1;
      target2Label = '等幅測量';
      target2Formula = `${mmFormula} = ${mmT1}`;
    } else {
      target = mmT1;
      targetLabel = '等幅測量';
      targetFormula = `${mmFormula} = ${mmT1}`;
      target2 = mmT2;
      target2Label = '1.5倍等幅';
      target2Formula = `${pl} + ${fl} × 1.5 = ${mmT2}`;
    }
  } else {
    // Fallback: no clear swing structure → use ATR
    const atrR = r2(atr20);
    if (distHighPct > 3) {
      target = r2(allTimeHigh);
      targetLabel = '歷史高點';
      targetFormula = `前高 ${r2(allTimeHigh)}`;
      target2 = r2(allTimeHigh + 1.5 * atr20);
      target2Label = 'ATH+1.5×ATR';
      target2Formula = `${r2(allTimeHigh)} + ${atrR} × 1.5 = ${target2}`;
    } else {
      target = r2(price + 2 * atr20);
      targetLabel = '2×ATR';
      targetFormula = `${r2(price)} + ${atrR} × 2 = ${target}`;
      target2 = r2(price + 3 * atr20);
      target2Label = '3×ATR';
      target2Formula = `${r2(price)} + ${atrR} × 3 = ${target2}`;
    }
  }

  // Sanity check: targets must provide meaningful upside (≥ 3% for T1, ≥ 2%
  // additional for T2). Prevents T1 ≈ entry when stock is already at ATH.
  if (target <= price * 1.03) {
    const atrR = r2(atr20);
    target = r2(price + 2 * atr20);
    targetLabel = '2×ATR';
    targetFormula = `${r2(price)} + ${atrR} × 2 = ${target}`;
  }
  if (target2 <= target * 1.02) {
    const atrR = r2(atr20);
    target2 = r2(price + 3 * atr20);
    target2Label = '3×ATR';
    target2Formula = `${r2(price)} + ${atrR} × 3 = ${target2}`;
  }

  // 林則行 20% rule: upside to T1
  const upsidePct = r2(((target - price) / price) * 100);

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
    targetFormula,
    target2,
    target2Label,
    target2Formula,
    rewardRisk: rr,
    upsidePct,
    adv20: r2(adv20),
    todayVolume: today.volume,
    volShrinkPct,
    priceRangePct,
    score,
    scoreBreakdown,
  };
}

// ── Pattern Detection ──

function detectShape(candles: OHLCV[], n: number): [PatternShapeType, string] {
  let lb = 60;
  if (lb > n - 10) lb = n - 10;
  const start = n - lb;

  // Check most-specific patterns first (3 pivot structures)
  const hsResult = detectHeadShouldersBottom(candles, start, n);
  if (hsResult) return hsResult;

  const tbResult = detectTripleBottom(candles, start, n);
  if (tbResult) return tbResult;

  // Try W bottom (2 pivot structure)
  const wResult = detectWBottom(candles, start, n);
  if (wResult) return wResult;

  // V bottom (sharp reversal)
  const vResult = detectVBottom(candles, start, n);
  if (vResult) return vResult;

  // Find lowest point for other patterns
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

  // Cup (圓形底)
  if (lowPos > 0.25 && lowPos < 0.65 && lowDepth > 8 && recovery > 70) {
    return ['cup', '圓形底（杯型）'];
  }
  // U
  if (lowPos > 0.2 && lowPos < 0.6 && lowDepth > 5 && recovery > 60) {
    return ['u_shape', 'U型整理'];
  }
  // N
  if (secondLow && lowDepth > 5) {
    return ['n_shape', 'N型整理'];
  }

  // Consolidation bottom (least specific — long tight range)
  const cbResult = detectConsolidation(candles, start, n);
  if (cbResult) return cbResult;

  return ['none', ''];
}

// ── Helper: find all pivot lows in a range ──
function findPivotLows(candles: OHLCV[], start: number, end: number, pivotN: number): { idx: number; low: number }[] {
  const pivots: { idx: number; low: number }[] = [];
  for (let i = start + pivotN; i < end - pivotN; i++) {
    let isPivot = true;
    for (let j = 1; j <= pivotN; j++) {
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push({ idx: i, low: candles[i].low });
  }
  return pivots;
}

// ── Triple Bottom (三重底) ──
// 3 pivot lows within 5% of each other, each at least 8 days apart,
// with a clear neckline (drop > 5%) and current price recovered above 50%.
function detectTripleBottom(candles: OHLCV[], start: number, end: number): [PatternShapeType, string] | null {
  const minGap = 8;
  const pivots = findPivotLows(candles, start, end, 3);
  if (pivots.length < 3) return null;

  const price = candles[end - 1].close;

  for (let a = 0; a < pivots.length - 2; a++) {
    for (let b = a + 1; b < pivots.length - 1; b++) {
      for (let c = b + 1; c < pivots.length; c++) {
        const p1 = pivots[a], p2 = pivots[b], p3 = pivots[c];
        if (p2.idx - p1.idx < minGap || p3.idx - p2.idx < minGap) continue;

        const minLow = Math.min(p1.low, p2.low, p3.low);
        const maxLow = Math.max(p1.low, p2.low, p3.low);
        if ((maxLow - minLow) / minLow * 100 > 5) continue;

        // Neckline = highest high between p1 and p3
        let neckline = 0;
        for (let i = p1.idx; i <= p3.idx; i++) {
          if (candles[i].high > neckline) neckline = candles[i].high;
        }
        if (neckline <= 0) continue;

        const avgLow = (p1.low + p2.low + p3.low) / 3;
        if ((neckline - avgLow) / neckline * 100 < 5) continue;

        // Must have recovered above 50% of the base
        if (price < avgLow + (neckline - avgLow) * 0.5) continue;

        // Third low recent enough
        if (end - p3.idx > 30) continue;

        return ['triple_bottom', '三重底'];
      }
    }
  }
  return null;
}

// ── Head & Shoulders Bottom (頭肩底) ──
// 3 pivot lows: left shoulder, head (lowest), right shoulder.
// Shoulders within 5% of each other; head at least 3% below average shoulder.
function detectHeadShouldersBottom(candles: OHLCV[], start: number, end: number): [PatternShapeType, string] | null {
  const minGap = 8;
  const pivots = findPivotLows(candles, start, end, 3);
  if (pivots.length < 3) return null;

  const price = candles[end - 1].close;

  for (let a = 0; a < pivots.length - 2; a++) {
    for (let b = a + 1; b < pivots.length - 1; b++) {
      for (let c = b + 1; c < pivots.length; c++) {
        const ls = pivots[a], h = pivots[b], rs = pivots[c];
        if (h.idx - ls.idx < minGap || rs.idx - h.idx < minGap) continue;

        // Head must be the lowest
        if (h.low >= ls.low || h.low >= rs.low) continue;

        // Head at least 3% below average shoulder
        const avgShoulder = (ls.low + rs.low) / 2;
        if ((avgShoulder - h.low) / avgShoulder * 100 < 3) continue;

        // Shoulders within 5% of each other
        const shoulderDiff = Math.abs(ls.low - rs.low) / Math.min(ls.low, rs.low) * 100;
        if (shoulderDiff > 5) continue;

        // Neckline = highest between left shoulder and right shoulder
        let neckline = 0;
        for (let i = ls.idx; i <= rs.idx; i++) {
          if (candles[i].high > neckline) neckline = candles[i].high;
        }
        if (neckline <= 0) continue;

        // Recovery above 50% of depth
        if (price < h.low + (neckline - h.low) * 0.5) continue;

        // Right shoulder not too old
        if (end - rs.idx > 30) continue;

        return ['head_shoulders_bottom', '頭肩底'];
      }
    }
  }
  return null;
}

// ── V-Bottom (V形底) ──
// Sharp drop (>10%) into a low, followed by sharp rally (>10%) within a short window.
function detectVBottom(candles: OHLCV[], start: number, end: number): [PatternShapeType, string] | null {
  // Find lowest point
  let lowIdx = start;
  for (let i = start; i < end; i++) {
    if (candles[i].low < candles[lowIdx].low) lowIdx = i;
  }

  // Low should be in recent but not too recent area
  const lb = end - start;
  const lowPos = (lowIdx - start) / lb;
  if (lowPos < 0.2 || lowPos > 0.85) return null;

  // Pre-drop: highest point in the 25 candles before the low
  const preStart = Math.max(start, lowIdx - 25);
  let preHigh = 0;
  for (let i = preStart; i <= lowIdx; i++) {
    if (candles[i].high > preHigh) preHigh = candles[i].high;
  }
  const dropPct = preHigh > 0 ? (preHigh - candles[lowIdx].low) / preHigh * 100 : 0;
  if (dropPct < 10) return null;

  // Post-rally: highest point after the low
  let postHigh = candles[lowIdx].high;
  for (let i = lowIdx; i < end; i++) {
    if (candles[i].high > postHigh) postHigh = candles[i].high;
  }
  const rallyPct = (postHigh - candles[lowIdx].low) / candles[lowIdx].low * 100;
  if (rallyPct < 10) return null;

  // Recovery should be fast — within 30 days of the low
  if (end - lowIdx > 30) return null;

  // Current price in upper half of the V
  const price = candles[end - 1].close;
  const vLow = candles[lowIdx].low;
  if (price < vLow + (postHigh - vLow) * 0.5) return null;

  return ['v_bottom', 'V形底'];
}

// ── Consolidation Bottom (盤整底) ──
// Long tight range (≥ 30 days, close-to-close range ≤ 10%).
function detectConsolidation(candles: OHLCV[], start: number, end: number): [PatternShapeType, string] | null {
  const minDays = 30;
  const windowStart = Math.max(start, end - 40);
  const days = end - windowStart;
  if (days < minDays) return null;

  let hi = 0, lo = Number.MAX_VALUE;
  for (let i = windowStart; i < end; i++) {
    const cl = candles[i].close;
    if (cl > hi) hi = cl;
    if (cl < lo) lo = cl;
  }
  if (lo <= 0) return null;

  const rangePct = (hi - lo) / lo * 100;
  if (rangePct > 10) return null;

  return ['consolidation', '盤整底'];
}

// ── W Bottom (雙重底) Detection ──
// Criteria:
// 1. Find two significant pivot lows within the lookback period
// 2. Two lows must be within 5% of each other
// 3. At least 10 trading days apart
// 4. A neckline (middle high between the two lows) must exist
// 5. Drop from neckline to lows must be > 5%
// 6. Current price has recovered above 50% of neckline-to-low distance, or near/above neckline

function detectWBottom(candles: OHLCV[], start: number, end: number): [PatternShapeType, string] | null {
  const minGap = 10; // minimum trading days between two lows
  const pivotN = 3;  // pivot detection window

  // Find all pivot lows
  const pivotLows: { idx: number; low: number }[] = [];
  for (let i = start + pivotN; i < end - pivotN; i++) {
    let isPivot = true;
    for (let j = 1; j <= pivotN; j++) {
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      pivotLows.push({ idx: i, low: candles[i].low });
    }
  }

  if (pivotLows.length < 2) return null;

  const price = candles[end - 1].close;

  // Try all pairs of pivot lows (prefer the most recent valid W)
  for (let a = pivotLows.length - 2; a >= 0; a--) {
    for (let b = a + 1; b < pivotLows.length; b++) {
      const low1 = pivotLows[a];
      const low2 = pivotLows[b];

      // Must be at least minGap days apart
      if (low2.idx - low1.idx < minGap) continue;

      // Two lows must be within 5% of each other
      const lowDiff = Math.abs(low1.low - low2.low) / Math.min(low1.low, low2.low) * 100;
      if (lowDiff > 5) continue;

      // Find neckline (highest point between the two lows)
      let neckline = 0;
      for (let i = low1.idx + 1; i < low2.idx; i++) {
        if (candles[i].high > neckline) neckline = candles[i].high;
      }

      if (neckline <= 0) continue;

      // Neckline must be meaningfully above the lows (at least 5% drop)
      const avgLow = (low1.low + low2.low) / 2;
      const dropPct = ((neckline - avgLow) / neckline) * 100;
      if (dropPct < 5) continue;

      // Current price must have recovered: above 50% of neckline, or above neckline
      const recoveryLevel = avgLow + (neckline - avgLow) * 0.5;
      if (price < recoveryLevel) continue;

      // Second low must not be too old (within last 30 candles)
      if (end - low2.idx > 30) continue;

      return ['w_bottom', 'W底（雙重底）'];
    }
  }

  return null;
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

// Re-score a stock after revenue data is fetched
export function rescoreWithRevenue(stock: BullPickAnalysis): void {
  const { score, breakdown } = calcBullPickScore(
    stock.pattern, stock.maAligned, stock.distHighPct, 999,
    stock.totalNetBuy, stock.foreignNetBuy, stock.trustNetBuy,
    stock.revenueGrowth,
    stock.currentPrice, stock.ma20, stock.ma60, stock.adv20,
  );
  stock.score = score;
  stock.scoreBreakdown = breakdown;
}

function calcBullPickScore(
  pattern: PatternShapeType, maAligned: boolean, distHighPct: number, distHighMax: number,
  totalNetBuy: number, foreignNetBuy: number, trustNetBuy: number,
  revenueGrowth: number,
  price: number, ma20: number, ma60: number, adv20: number,
): { score: number; breakdown: ScoreBreakdown } {
  // ① Pattern (0-20)
  let patternScore = 5;
  if (pattern === 'head_shoulders_bottom') patternScore = 20;
  else if (pattern === 'cup') patternScore = 20;
  else if (pattern === 'triple_bottom') patternScore = 19;
  else if (pattern === 'w_bottom') patternScore = 19;
  else if (pattern === 'u_shape') patternScore = 17;
  else if (pattern === 'v_bottom') patternScore = 16;
  else if (pattern === 'consolidation') patternScore = 15;
  else if (pattern === 'n_shape') patternScore = 14;

  // ② MA alignment (0-15)
  let maScore = 0;
  if (maAligned) maScore = 15;
  else if (price > ma20 && ma20 > ma60) maScore = 12;
  else if (price > ma20) maScore = 8;
  else if (price > ma60) maScore = 4;

  // ③ Distance to high (0-20)
  let distScore = 2;
  if (distHighPct <= 0) distScore = 20;
  else if (distHighPct < 3) distScore = 18;
  else if (distHighPct < 5) distScore = 16;
  else if (distHighPct < distHighMax) distScore = 14;
  else if (distHighPct < 15) distScore = 10;
  else if (distHighPct < 20) distScore = 6;

  // ④ Institutional buying (0-25) — use relative ratio (net buy / ADV20)
  // This prevents large-cap stocks (e.g. financials) from getting inflated scores
  // just because their absolute net buy numbers are large
  const safeADV = adv20 > 0 ? adv20 : 1;
  const totalRatio = totalNetBuy / safeADV;     // 20日合計買超 / 日均量
  const foreignRatio = foreignNetBuy / safeADV;
  const trustRatio = trustNetBuy / safeADV;

  let instScore = 0;
  // Part A: total net buy ratio (0-10)
  if (totalRatio > 2) instScore += 10;
  else if (totalRatio > 1) instScore += 8;
  else if (totalRatio > 0.3) instScore += 6;
  else if (totalRatio > 0) instScore += 4;
  else instScore += 1;

  // Part B: foreign + trust sync bonus (0-8)
  if (foreignRatio > 0.1 && trustRatio > 0.1) instScore += 8;
  else if (foreignRatio > 0 && trustRatio > 0) instScore += 6;
  else if (foreignRatio > 0 || trustRatio > 0) instScore += 4;

  // Part C: trust conviction (0-7)
  if (trustRatio > 0.5) instScore += 7;
  else if (trustRatio > 0.2) instScore += 5;
  else if (trustRatio > 0) instScore += 3;

  instScore = Math.min(instScore, 25);

  // ⑤ Revenue growth (0-20)
  let revScore = 0;
  if (revenueGrowth > 100) revScore = 20;
  else if (revenueGrowth > 50) revScore = 17;
  else if (revenueGrowth > 30) revScore = 14;
  else if (revenueGrowth > 20) revScore = 12;
  else if (revenueGrowth > 10) revScore = 9;
  else if (revenueGrowth > 0) revScore = 5;
  else if (revenueGrowth > -10) revScore = 2;

  const total = Math.min(patternScore + maScore + distScore + instScore + revScore, 100);

  return {
    score: total,
    breakdown: {
      pattern: patternScore,
      maAlign: maScore,
      distHigh: distScore,
      institutional: instScore,
      revenue: revScore,
    },
  };
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

// ── Measured Move (林則行 兩段式上漲) ──
// Find: swing low → rally high → pullback low
// Target = pullback low + (rally high - swing low)

function findMeasuredMove(candles: OHLCV[], n: number): {
  swingLow: number;
  rallyHigh: number;
  pullbackLow: number;
  firstLeg: number;
} | null {
  const lb = Math.min(60, n - 10);
  if (lb < 20) return null;
  const start = n - lb;

  // Step 1: Find swing low (谷底) — the lowest point in the lookback
  let swingLowIdx = start;
  for (let i = start + 1; i < n; i++) {
    if (candles[i].low < candles[swingLowIdx].low) swingLowIdx = i;
  }

  // Step 2: Find rally high (第一段高點) — highest point after swing low
  // Leave last 3 candles so there's room for a pullback
  let rallyHighIdx = swingLowIdx;
  for (let i = swingLowIdx + 1; i < n - 3; i++) {
    if (candles[i].high > candles[rallyHighIdx].high) rallyHighIdx = i;
  }

  // Rally high must be meaningfully after swing low
  if (rallyHighIdx - swingLowIdx < 5) return null;

  // Step 3: Find pullback low (回調低點) — lowest point after rally high
  let pullbackLowIdx = rallyHighIdx + 1;
  if (pullbackLowIdx >= n) return null;
  for (let i = rallyHighIdx + 1; i < n; i++) {
    if (candles[i].low < candles[pullbackLowIdx].low) pullbackLowIdx = i;
  }

  const swingLow = candles[swingLowIdx].low;
  const rallyHigh = candles[rallyHighIdx].high;
  const pullbackLow = candles[pullbackLowIdx].low;
  const firstLeg = rallyHigh - swingLow;

  // Validate: first leg must be at least 5% of swing low
  if (firstLeg / swingLow < 0.05) return null;
  // Must have a real pullback (at least 10% retracement of first leg)
  if ((rallyHigh - pullbackLow) / firstLeg < 0.10) return null;

  return { swingLow, rallyHigh, pullbackLow, firstLeg };
}

// ── ATR (Average True Range) ──

function calcATR(candles: OHLCV[], n: number, period: number): number {
  if (n < period + 1) return 0;
  let sum = 0;
  for (let i = n - period; i < n; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
  }
  return sum / period;
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
