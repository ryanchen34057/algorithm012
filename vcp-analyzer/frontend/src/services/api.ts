import axios from 'axios';
import { ScanResult, StockChartData, VCPAnalysis, PositionResult } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

const api = axios.create({ baseURL: BASE });

export const scanVCP = (): Promise<ScanResult> =>
  api.get<ScanResult>('/api/vcp/scan').then(r => r.data);

export const getChart = (symbol: string): Promise<StockChartData> =>
  api.get<StockChartData>(`/api/stock/${encodeURIComponent(symbol)}/chart`).then(r => r.data);

export const getVCP = (symbol: string): Promise<VCPAnalysis> =>
  api.get<VCPAnalysis>(`/api/stock/${encodeURIComponent(symbol)}/vcp`).then(r => r.data);

export const calcPosition = (symbol: string, maxLoss: number): Promise<PositionResult> =>
  api
    .post<PositionResult>(`/api/stock/${encodeURIComponent(symbol)}/position`, { maxLoss })
    .then(r => r.data);
