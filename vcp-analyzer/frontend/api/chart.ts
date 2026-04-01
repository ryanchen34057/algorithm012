// Vercel Serverless Function: Proxy Yahoo Finance chart API
import type { VercelRequest, VercelResponse } from '@vercel/node';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const symbol = req.query.symbol as string;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const end = Math.floor(Date.now() / 1000) + 86400; // +1 day buffer to ensure latest
  const start = end - 2 * 365 * 86400; // 2 years

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;

  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
