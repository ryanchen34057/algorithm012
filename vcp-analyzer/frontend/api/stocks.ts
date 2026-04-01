// Vercel Serverless Function: Fetch stock list from TWSE + TPEx
import type { VercelRequest, VercelResponse } from '@vercel/node';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

interface StockInfo {
  symbol: string;
  name: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const minPrice = Number(req.query.minPrice) || 15;
  const minVolLots = Number(req.query.minVolume) || 0;

  try {
    const [twse, tpex] = await Promise.allSettled([
      fetchTWSE(minPrice, minVolLots),
      fetchTPEx(minPrice, minVolLots),
    ]);

    const stocks: StockInfo[] = [
      ...(twse.status === 'fulfilled' ? twse.value : []),
      ...(tpex.status === 'fulfilled' ? tpex.value : []),
    ];

    res.json({ stocks, total: stocks.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

async function fetchTWSE(minPrice: number, minVolLots: number): Promise<StockInfo[]> {
  const urls = [
    'https://opendata.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
    'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json',
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const body = await r.json();
      let rows = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(rows)) continue;

      return rows
        .filter((r: any) => {
          const code = r.Code ?? r['證券代號'] ?? '';
          if (!/^\d{4}$/.test(code)) return false;
          const price = parseNum(r.ClosingPrice ?? r['收盤價'] ?? '0');
          if (price < minPrice) return false;
          const vol = parseNum(r.TradeVolume ?? r['成交股數'] ?? '0') / 1000;
          return vol >= minVolLots;
        })
        .map((r: any) => ({
          symbol: (r.Code ?? r['證券代號']) + '.TW',
          name: r.Name ?? r['證券名稱'] ?? '',
        }));
    } catch { continue; }
  }
  return [];
}

async function fetchTPEx(minPrice: number, minVolLots: number): Promise<StockInfo[]> {
  try {
    const r = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', {
      headers: { 'User-Agent': UA },
    });
    if (!r.ok) return [];
    const rows: any[] = await r.json();

    return rows
      .filter((r) => {
        const code = r.SecuritiesCompanyCode ?? '';
        if (!/^\d{4}$/.test(code)) return false;
        const price = parseNum(r.Close ?? '0');
        if (price < minPrice) return false;
        const vol = parseNum(r.TradingShares ?? '0') / 1000;
        return vol >= minVolLots;
      })
      .map((r) => ({
        symbol: r.SecuritiesCompanyCode + '.TWO',
        name: r.CompanyName ?? '',
      }));
  } catch { return []; }
}

function parseNum(s: string): number {
  return parseFloat(String(s).replace(/,/g, '')) || 0;
}
