// Vercel Serverless Function: Proxy TAIFEX futures data (台指期貨/夜盤)
export const config = { regions: ['hkg1'] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const debug: string[] = [];

  try {
    const result = await fetchTAIFEX(debug);
    if (result) {
      res.json({ ...result, debug });
    } else {
      res.status(404).json({ error: 'No TAIFEX data available', debug });
    }
  } catch (e) {
    res.status(500).json({ error: String(e), debug });
  }
}

interface TaifexResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  time: string;
  session: string;
}

async function fetchTAIFEX(debug: string[]): Promise<TaifexResult | null> {
  // Strategy 1: cnyes (鉅亨網) — most reliable from overseas
  const cnyes = await tryCnyes(debug);
  if (cnyes) return cnyes;

  // Strategy 2: TAIFEX OpenAPI
  const openapi = await tryTaifexOpenAPI(debug);
  if (openapi) return openapi;

  // Strategy 3: TAIFEX MIS API
  const mis = await tryTaifexMIS(debug);
  if (mis) return mis;

  // Strategy 4: Fugle MarketData API (free tier)
  const fugle = await tryFugle(debug);
  if (fugle) return fugle;

  return null;
}

// ── Strategy 1: cnyes (鉅亨網) ──
async function tryCnyes(debug: string[]): Promise<TaifexResult | null> {
  try {
    // cnyes quote API for TXF (台指期近月)
    const url = 'https://ws.api.cnyes.com/ws/api/v1/quote/quotes/TXF1:TAIFEX';
    debug.push(`cnyes trying: ${url}`);
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
      },
    });
    debug.push(`cnyes → HTTP ${r.status}`);
    if (!r.ok) return null;

    const body = await r.json();
    debug.push(`cnyes keys: ${JSON.stringify(Object.keys(body)).slice(0, 200)}`);

    // cnyes format: { statusCode, message, data: { ... } }
    const data = body?.data?.items?.[0] ?? body?.data ?? body?.items?.[0];
    if (!data) {
      debug.push('cnyes: no data found in response');
      return null;
    }
    debug.push(`cnyes data keys: ${Object.keys(data).slice(0, 15).join(',')}`);

    const price = parseFloat(data.lastPrice ?? data.price ?? data.c ?? 0);
    const prevClose = parseFloat(data.previousClose ?? data.refPrice ?? data.preClose ?? data.o ?? 0);
    if (!price) {
      debug.push('cnyes: price is 0');
      return null;
    }

    const change = prevClose > 0 ? price - prevClose : parseFloat(data.change ?? data.priceChange ?? 0);
    const changePct = prevClose > 0
      ? (change / prevClose) * 100
      : parseFloat(data.changePct ?? data.changePercent ?? data.percentChange ?? 0);

    // Determine session (day/night) — night session is roughly 15:00-05:00 next day
    const now = new Date();
    const twHour = (now.getUTCHours() + 8) % 24;
    const isNight = twHour >= 15 || twHour < 5;

    return {
      symbol: 'TXF',
      name: isNight ? '台指夜盤' : '台指期貨',
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      time: data.tradeTime ?? data.lastUpdated ?? '',
      session: isNight ? 'night' : 'day',
    };
  } catch (e) {
    debug.push(`cnyes error: ${e}`);
    return null;
  }
}

// ── Strategy 2: TAIFEX OpenAPI ──
async function tryTaifexOpenAPI(debug: string[]): Promise<TaifexResult | null> {
  try {
    const url = 'https://openapi.taifex.com.tw/v1/getQuoteListSelection';
    debug.push(`TAIFEX OpenAPI trying: ${url}`);
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Origin': 'https://www.taifex.com.tw',
        'Referer': 'https://www.taifex.com.tw/',
      },
    });
    debug.push(`TAIFEX OpenAPI → HTTP ${r.status}`);
    if (!r.ok) return null;

    const body = await r.json();
    if (!Array.isArray(body)) {
      debug.push(`TAIFEX OpenAPI: not array, keys=${Object.keys(body).join(',')}`);
      return null;
    }

    // Find nearest-month TX contract
    const tx = body.find((item: any) =>
      (item.CommodityId === 'TX' || item.commodityId === 'TX' || item.ContractCode === 'TX')
    );
    if (!tx) {
      debug.push(`TAIFEX OpenAPI: TX not found in ${body.length} items`);
      return null;
    }
    debug.push(`TAIFEX OpenAPI found TX: ${JSON.stringify(tx).slice(0, 300)}`);

    const price = parseFloat(tx.LastPrice ?? tx.lastPrice ?? tx.SettlementPrice ?? 0);
    const prevClose = parseFloat(tx.PrevSettlementPrice ?? tx.prevSettlementPrice ?? tx.ReferencePrice ?? 0);
    const change = prevClose > 0 ? price - prevClose : 0;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: 'TX',
      name: '台指期貨',
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      time: tx.TradeDate ?? tx.Time ?? '',
      session: tx.Session === '1' ? 'night' : 'day',
    };
  } catch (e) {
    debug.push(`TAIFEX OpenAPI error: ${e}`);
    return null;
  }
}

// ── Strategy 3: TAIFEX MIS API ──
async function tryTaifexMIS(debug: string[]): Promise<TaifexResult | null> {
  try {
    const url = 'https://mis.taifex.com.tw/futures/api/getQuoteList';
    debug.push(`TAIFEX MIS trying: ${url}`);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://mis.taifex.com.tw',
        'Referer': 'https://mis.taifex.com.tw/futures/SpotQuotes',
      },
      body: JSON.stringify({ MarketType: '0', CID: 'TX', SymbolType: 'F' }),
    });
    debug.push(`TAIFEX MIS → HTTP ${r.status}`);
    if (!r.ok) return null;

    const body = await r.json();
    const list = body?.RtData?.QuoteList ?? body?.RtData ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      debug.push('TAIFEX MIS: empty list');
      return null;
    }

    const tx = list.find((item: any) => item.CID === 'TX' || item.SymbolID?.startsWith('TX'));
    if (!tx) {
      debug.push('TAIFEX MIS: TX not found');
      return null;
    }
    debug.push(`TAIFEX MIS found TX: ${JSON.stringify(tx).slice(0, 300)}`);

    const price = parseFloat(tx.CLastPrice ?? tx.LastPrice ?? 0);
    const prevClose = parseFloat(tx.CRefPrice ?? tx.ReferencePrice ?? 0);
    const change = prevClose > 0 ? price - prevClose : 0;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: 'TX',
      name: '台指期貨',
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      time: tx.CTime ?? tx.Time ?? '',
      session: tx.Session === '1' ? 'night' : 'day',
    };
  } catch (e) {
    debug.push(`TAIFEX MIS error: ${e}`);
    return null;
  }
}

// ── Strategy 4: Fugle MarketData API ──
async function tryFugle(debug: string[]): Promise<TaifexResult | null> {
  try {
    // Fugle intraday quote for TX futures
    const url = 'https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/TXF1';
    debug.push(`Fugle trying: ${url}`);
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    debug.push(`Fugle → HTTP ${r.status}`);
    if (!r.ok) return null;

    const body = await r.json();
    debug.push(`Fugle keys: ${Object.keys(body).join(',')}`);

    const price = parseFloat(body.lastPrice ?? body.closePrice ?? 0);
    const prevClose = parseFloat(body.previousClose ?? body.referencePrice ?? 0);
    if (!price) return null;

    const change = prevClose > 0 ? price - prevClose : 0;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: 'TXF',
      name: '台指期貨',
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      time: body.lastUpdated ?? '',
      session: 'day',
    };
  } catch (e) {
    debug.push(`Fugle error: ${e}`);
    return null;
  }
}
