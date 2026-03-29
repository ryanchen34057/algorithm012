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
  candles: OHLCV[];
  ma50: number[];
  ma150: number[];
  ma200: number[];
}

export interface Contraction {
  index: number;
  highDate: string;
  highPrice: number;
  lowDate: string;
  lowPrice: number;
  depth: number;
  avgVolume: number;
}

export interface VCPAnalysis {
  symbol: string;
  name: string;
  score: number;
  contractions: Contraction[];
  pivotPrice: number;
  entryPrice: number;
  stopLoss: number;
  target: number;
  currentPrice: number;
  avgVolume50: number;
  stage2: boolean;
  passesTrend: boolean;
}

export interface ScanResult {
  stocks: VCPAnalysis[];
  scannedAt: string;
  total: number;
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
