import axios from 'axios';
import { ScanResult, StockChartData, GapAnalysis, PositionResult, BreakoutScanResult, VolumeCondition, PatternType, PeakAttackScanResult, SuperPerfScanResult, ElitePickScanResult } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8090';

const api = axios.create({ baseURL: BASE });

export interface ScanParams {
  minVolume?: number;       // ADV20 最低日均量（張），預設 500
  minPrice?: number;        // 最低股價（元），預設 10
  maxPrice?: number;        // 最高股價（元），預設 500
  minTodayVolume?: number;  // 最低當日成交量（張），預設 300
  minGapPct?: number;       // 最低跳空幅度（%），預設 1.5
  maxGapPct?: number;       // 最高跳空幅度（%），預設 40
  strictGap?: boolean;      // 嚴格跳空（過昨高/昨低），預設 false
  requireCandle?: boolean;  // 要求昨日 K 線顏色，預設 true
  requireBothMA?: boolean;  // 要求同時符合 MA20 & MA200，預設 false
  concurrency?: number;     // 並行請求數，預設 10
}

export const scanGap = (params: ScanParams = {}): Promise<ScanResult> => {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) p.set(key, String(val));
  }
  return api.get<ScanResult>(`/api/gap/scan?${p.toString()}`).then(r => r.data);
};

export interface BreakoutScanParams {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  lookbackDays?: number;
  nearHighPct?: number;
  pattern?: PatternType;
  volumeFilter?: VolumeCondition;
  volumeFactor?: number;
  concurrency?: number;
}

export const scanBreakout = (params: BreakoutScanParams = {}): Promise<BreakoutScanResult> => {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) p.set(key, String(val));
  }
  return api.get<BreakoutScanResult>(`/api/breakout/scan?${p.toString()}`).then(r => r.data);
};

export interface PeakAttackScanParams {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  minTodayVol?: number;
  peakRangeMax?: number;
  minAttackCount?: number;
  minVolRatio?: number;
  kdPeriod?: number;
  kdSmooth1?: number;
  kdSmooth2?: number;
  concurrency?: number;
}

export const scanPeakAttack = (params: PeakAttackScanParams = {}): Promise<PeakAttackScanResult> => {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) p.set(key, String(val));
  }
  return api.get<PeakAttackScanResult>(`/api/peakattack/scan?${p.toString()}`).then(r => r.data);
};

export type GainPeriod = '1d' | '1w' | '1m' | '3m' | '6m' | 'ytd';
export type MarketFilter = 'all' | 'listed' | 'otc';

export interface SuperPerfScanParams {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  gainPeriod?: GainPeriod;
  minGainPct?: number;
  marketFilter?: MarketFilter;
  concurrency?: number;
}

export interface ElitePickScanParams {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  volShrinkMax?: number;
  nearHighPct?: number;
  rangeMaxPct?: number;
  lookbackDays?: number;
  maxLoss?: number;
  concurrency?: number;
}

export const scanElitePick = (params: ElitePickScanParams = {}): Promise<ElitePickScanResult> => {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) p.set(key, String(val));
  }
  return api.get<ElitePickScanResult>(`/api/elitepick/scan?${p.toString()}`).then(r => r.data);
};

export const scanSuperPerf = (params: SuperPerfScanParams = {}): Promise<SuperPerfScanResult> => {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined) p.set(key, String(val));
  }
  return api.get<SuperPerfScanResult>(`/api/superperf/scan?${p.toString()}`).then(r => r.data);
};

export const getChart = (symbol: string): Promise<StockChartData> =>
  api.get<StockChartData>(`/api/stock/${encodeURIComponent(symbol)}/chart`).then(r => r.data);

export const getGap = (symbol: string): Promise<GapAnalysis> =>
  api.get<GapAnalysis>(`/api/stock/${encodeURIComponent(symbol)}/gap`).then(r => r.data);

export const calcPosition = (symbol: string, maxLoss: number): Promise<PositionResult> =>
  api
    .post<PositionResult>(`/api/stock/${encodeURIComponent(symbol)}/position`, { maxLoss })
    .then(r => r.data);
