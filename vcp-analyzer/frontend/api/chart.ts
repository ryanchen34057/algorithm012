// Vercel Serverless Function: Proxy Yahoo Finance chart API
export const config = { regions: ['hkg1'] };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
import { setCacheHeaders } from './_cache';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // K線資料：盤中快取 3 分鐘，盤後快取 1 小時
  setCacheHeaders(res, { duringMarket: 180, afterMarket: 3600 });
  if (req.method === 'OPTIONS') return res.status(204).end();

  const symbol = req.query.symbol as string;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const interval = (req.query.interval as string) || '1d';
  const end = Math.floor(Date.now() / 1000) + 86400;
  // Adjust range based on interval
  const rangeDays = interval === '1mo' ? 20 * 365 : interval === '1wk' ? 10 * 365 : 2 * 365;
  const start = end - rangeDays * 86400;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&period1=${start}&period2=${end}&includePrePost=false&events=div`;

  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
