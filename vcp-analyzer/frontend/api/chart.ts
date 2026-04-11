// Vercel Serverless Function: Proxy Yahoo Finance chart API
export const config = { regions: ['hkg1'] };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function setCacheHeaders(res: any, opts: { duringMarket: number; afterMarket: number }) {
  const now = new Date();
  const twHour = (now.getUTCHours() + 8) % 24;
  const twMin = twHour * 60 + now.getUTCMinutes();
  const day = now.getUTCDay();
  const twDay = (now.getUTCHours() + 8 >= 24) ? (day + 1) % 7 : day;
  const isWeekday = twDay >= 1 && twDay <= 5;
  const isMarketHours = twMin >= 540 && twMin <= 810;
  const maxAge = (isWeekday && isMarketHours) ? opts.duringMarket : opts.afterMarket;
  if (maxAge > 0) {
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}

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
