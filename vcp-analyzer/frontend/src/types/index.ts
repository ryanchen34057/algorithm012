export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockChartData {
  symbol: string;
  name: string;
  latestPrice: number;
  candles: OHLCV[];
  ma20: number[];
  ma50: number[];
  ma150: number[];
  ma200: number[];
}

export type GapDirection = 'long' | 'short';

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
