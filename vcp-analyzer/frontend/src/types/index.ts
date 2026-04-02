export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MALine {
  data: number[];
  color: string;
  label: string;
}

export interface StockChartData {
  symbol: string;
  name: string;
  latestPrice: number;
  candles: OHLCV[];
  maLines: MALine[];
  // Legacy fields kept for compatibility
  ma20: number[];
  ma50: number[];
  ma150: number[];
  ma200: number[];
}

export type GapDirection = 'long' | 'short';

export type TargetType = 'swing' | 'ma200' | 'ma20' | 'consolidation' | 'trailing_stop';

export interface GapAnalysis {
  symbol: string;
  name: string;
  direction: GapDirection;
  gapPercent: number;
  todayOpen: number;
  todayClose: number;
  yesterdayOpen: number;
  yesterdayClose: number;
  yesterdayHigh: number;
  yesterdayLow: number;
  currentPrice: number;
  entryPrice: number;
  stopLoss: number;
  target: number;
  targetType: TargetType;
  targetLabel: string;
  rewardRisk: number;
  adv20: number;
  todayVolume: number;
  ma20: number;
  ma200: number;
  score: number;
}

export interface ScanResult {
  stocks: GapAnalysis[];
  scannedAt: string;
  total: number;    // matched count
  scanned: number;  // total stocks analyzed
}

// ── Breakout Scanner ──

export type PatternType = 'w_bottom' | 'v_bottom' | 'none';
export type VolumeCondition = 'expand' | 'shrink' | 'any';

export interface BreakoutAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  prevHigh: number;
  prevHighDate: string;
  distPct: number;
  pattern: PatternType;
  patternLabel: string;
  low1: number;
  low1Date: string;
  low2: number;
  low2Date: string;
  neckline: number;
  vLow: number;
  vLowDate: string;
  dropPct: number;
  bouncePct: number;
  ma20: number;
  ma50: number;
  ma150: number;
  ma200: number;
  maAligned: boolean;
  adv20: number;
  recentVolRatio: number;
  todayVolume: number;
  entryPrice: number;
  stopLoss: number;
  target: number;
  targetLabel: string;
  rewardRisk: number;
  score: number;
}

export interface BreakoutScanResult {
  stocks: BreakoutAnalysis[];
  scannedAt: string;
  total: number;
  scanned: number;
}

// ── Peak Attack Scanner (攻頂突破) ──

export interface PeakAttackAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  k: number;
  d: number;
  attackPeaks: number[];
  peakHigh: number;
  peakLow: number;
  peakRangePct: number;
  attackCount: number;
  breakoutPrice: number;
  distPct: number;
  adv20: number;
  todayVolume: number;
  todayVolLots: number;
  volRatio: number;
  ma20: number;
  ma50: number;
  ma200: number;
  entryPrice: number;
  stopLoss: number;
  target: number;
  targetLabel: string;
  rewardRisk: number;
  score: number;
}

export interface PeakAttackScanResult {
  stocks: PeakAttackAnalysis[];
  scannedAt: string;
  total: number;
  scanned: number;
}

// ── Super Performance Scanner (超級績效) ──

export interface SuperPerfAnalysis {
  symbol: string;
  name: string;
  market: string;
  industry: string;
  conceptTag: string;
  currentPrice: number;
  gain1d: number;
  gain1w: number;
  gain1m: number;
  gain3m: number;
  gain6m: number;
  gainYtd: number;
  vcpScore: number;
  trendScore: number;
  contractionScore: number;
  volDryUpScore: number;
  pivotScore: number;
  rsScore: number;
  ma50: number;
  ma150: number;
  ma200: number;
  high52w: number;
  low52w: number;
  adv20: number;
  pivotPrice: number;
  stopLoss: number;
  entryPrice: number;
  target: number;
  targetLabel: string;
  rewardRisk: number;
  todayVolume: number;
}

export interface IndustryHeat {
  industry: string;
  avgGain1m: number;
  avgGain3m: number;
  stockCount: number;
  topStocks: string[];
}

export interface SuperPerfScanResult {
  stocks: SuperPerfAnalysis[];
  industries: IndustryHeat[];
  scannedAt: string;
  total: number;
  scanned: number;
}

// ── Elite Pick Scanner (精選突破) ──

export type PatternShapeType = 'w_bottom' | 'u_shape' | 'n_shape' | 'cup' | 'none';
export type MarketTrendType = 'bull' | 'bear' | 'neutral';
export type SellSignalType = '' | 'big_black_k' | 'below_ma10' | 'both';

export interface ElitePickAnalysis {
  symbol: string;
  name: string;
  market: string;
  industry: string;
  conceptTag: string;
  currentPrice: number;
  vol5d: number;
  vol20d: number;
  volShrink: number;
  prevHigh: number;
  prevHighDate: string;
  distPct: number;
  rangeHigh: number;
  rangeLow: number;
  rangePct: number;
  pattern: PatternShapeType;
  patternLabel: string;
  ma10: number;
  ma20: number;
  ma60: number;
  ma120: number;
  ma200: number;
  sellSignal: SellSignalType;
  sellLabel: string;
  stopLoss: number;
  stopLabel: string;
  entryPrice: number;
  target: number;
  targetLabel: string;
  rewardRisk: number;
  suggestLots: number;
  adv20: number;
  todayVolume: number;
  score: number;
}

export interface MarketStatus {
  indexPrice: number;
  ma20: number;
  ma60: number;
  ma120: number;
  trend: MarketTrendType;
  trendLabel: string;
}

export interface ElitePickScanResult {
  stocks: ElitePickAnalysis[];
  market: MarketStatus;
  scannedAt: string;
  total: number;
  scanned: number;
}

// ── MA Pullback Scanner (均線回踩) ──

export interface MAPullbackAnalysis {
  symbol: string;
  name: string;
  market: string;
  industry: string;
  conceptTag: string;
  currentPrice: number;
  dailyMa20: number;
  dailyMa200: number;
  dailyMa20Slope: number;
  dailyDistMa20: number;
  weeklyMa20: number;
  weeklyMa200: number;
  weeklyMa20Slope: number;
  weeklyDistMa20: number;
  weeklyClose: number;
  monthlyMa20: number;
  monthlyMa200: number;
  monthlyMa20Slope: number;
  monthlyDistMa20: number;
  monthlyClose: number;
  dailyOk: boolean;
  weeklyOk: boolean;
  monthlyOk: boolean;
  allOk: boolean;
  entryPrice: number;
  stopLoss: number;
  stopLabel: string;
  target: number;
  targetLabel: string;
  rewardRisk: number;
  adv20: number;
  todayVolume: number;
  score: number;
}

export interface MAPullbackScanResult {
  stocks: MAPullbackAnalysis[];
  scannedAt: string;
  total: number;
  scanned: number;
}

// ── Bull Pick Scanner (強勢精選) ──

export interface ScoreBreakdown {
  pattern: number;       // 0-20
  maAlign: number;       // 0-15
  distHigh: number;      // 0-20
  institutional: number; // 0-25
  revenue: number;       // 0-20
}

export interface BullPickAnalysis {
  symbol: string;
  name: string;
  market: string;
  industry: string;
  conceptTag: string;
  currentPrice: number;
  changePct: number;
  pattern: PatternShapeType;
  patternLabel: string;
  maAligned: boolean;
  allTimeHigh: number;
  allTimeHighDate: string;
  distHighPct: number;
  foreignNetBuy: number;
  trustNetBuy: number;
  dealerNetBuy: number;
  totalNetBuy: number;
  netBuyDays: number;
  revenueLatest: number;
  revenuePrev: number;
  revenueGrowth: number;
  revenuePeriod: string;
  ma20: number;
  ma60: number;
  ma120: number;
  ma200: number;
  entryPrice: number;
  stopLoss: number;
  stopLabel: string;
  target: number;
  targetLabel: string;
  target2: number;
  target2Label: string;
  rewardRisk: number;
  adv20: number;
  todayVolume: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface IndustrySector {
  industry: string;
  stockCount: number;
  avgChangePct: number;
  totalNetBuy: number;      // 三大法人合計（張）
  foreignNetBuy: number;    // 外資合計（張）
  trustNetBuy: number;      // 投信合計（張）
  topBuyStock: string;      // 法人買超最多的個股
  topBuyStockName: string;
  topBuyAmount: number;
}

export interface BullPickScanResult {
  stocks: BullPickAnalysis[];
  market: MarketStatus;
  industries: IndustrySector[];
  scannedAt: string;
  total: number;
  scanned: number;
  latestDate?: string;
}

export interface PositionResult {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
  riskPerShare: number;
  rewardPerShare: number;
  riskRewardRatio: number;
  shares: number;
  totalCost: number;
  maxLoss: number;
}
