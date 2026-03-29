import axios from 'axios';
import { ScanResult, StockChartData, VCPAnalysis, PositionResult } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8090';

const api = axios.create({ baseURL: BASE });

export interface ScanParams {
  minVolume?: number;   // 最低日均量（張），預設 1000
  minPrice?: number;    // 最低股價（元），預設 10
  concurrency?: number; // 並行請求數，預設 10
}

export const scanVCP = (params: ScanParams = {}): Promise<ScanResult> => {
  const p = new URLSearchParams();
  if (params.minVolume !== undefined) p.set('minVolume', String(params.minVolume));
  if (params.minPrice !== undefined) p.set('minPrice', String(params.minPrice));
  if (params.concurrency !== undefined) p.set('concurrency', String(params.concurrency));
  return api.get<ScanResult>(`/api/vcp/scan?${p.toString()}`).then(r => r.data);
};

export const getChart = (symbol: string): Promise<StockChartData> =>
  api.get<StockChartData>(`/api/stock/${encodeURIComponent(symbol)}/chart`).then(r => r.data);

export const getVCP = (symbol: string): Promise<VCPAnalysis> =>
  api.get<VCPAnalysis>(`/api/stock/${encodeURIComponent(symbol)}/vcp`).then(r => r.data);

export const calcPosition = (symbol: string, maxLoss: number): Promise<PositionResult> =>
  api
    .post<PositionResult>(`/api/stock/${encodeURIComponent(symbol)}/position`, { maxLoss })
    .then(r => r.data);
