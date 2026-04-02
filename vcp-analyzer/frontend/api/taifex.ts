// Vercel Serverless Function: Proxy TAIFEX futures data (台指期貨/夜盤)
export const config = { regions: ['hkg1'] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const debug: string[] = [];

  try {
    // Try multiple TAIFEX endpoints
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
  session: string; // 'day' | 'night'
}

async function fetchTAIFEX(debug: string[]): Promise<TaifexResult | null> {
  // Strategy 1: TAIFEX OpenAPI
  try {
    const url = 'https://openapi.taifex.com.tw/v1/getQuoteListSelection';
    debug.push(`TAIFEX trying OpenAPI: ${url}`);
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Origin': 'https://www.taifex.com.tw',
        'Referer': 'https://www.taifex.com.tw/',
      },
    });
    debug.push(`TAIFEX OpenAPI → HTTP ${r.status}`);
    if (r.ok) {
      const body = await r.json();
      debug.push(`TAIFEX OpenAPI response keys: ${JSON.stringify(Object.keys(body)).slice(0, 200)}`);
      const parsed = parseTaifexOpenAPI(body, debug);
      if (parsed) return parsed;
    }
  } catch (e) {
    debug.push(`TAIFEX OpenAPI error: ${e}`);
  }

  // Strategy 2: TAIFEX MIS API (market information system)
  try {
    const url = 'https://mis.taifex.com.tw/futures/api/getQuoteList';
    debug.push(`TAIFEX trying MIS: ${url}`);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://mis.taifex.com.tw',
        'Referer': 'https://mis.taifex.com.tw/futures/SpotQuotes',
      },
      body: JSON.stringify({
        MarketType: '0',
        CID: 'TX',
        SymbolType: 'F',
      }),
    });
    debug.push(`TAIFEX MIS → HTTP ${r.status}`);
    if (r.ok) {
      const body = await r.json();
      debug.push(`TAIFEX MIS response: ${JSON.stringify(body).slice(0, 500)}`);
      const parsed = parseTaifexMIS(body, debug);
      if (parsed) return parsed;
    }
  } catch (e) {
    debug.push(`TAIFEX MIS error: ${e}`);
  }

  // Strategy 3: TAIFEX daily futures data page
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    const url = `https://www.taifex.com.tw/cht/3/futContractsDate`;
    debug.push(`TAIFEX trying daily page: ${url}`);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html, application/json',
        'Referer': 'https://www.taifex.com.tw/cht/3/futContractsDate',
      },
      body: `queryType=1&goession=0&commodityId=TX&queryDate=${encodeURIComponent(dateStr)}&MarketCode=0`,
    });
    debug.push(`TAIFEX daily → HTTP ${r.status}`);
    if (r.ok) {
      const text = await r.text();
      debug.push(`TAIFEX daily response length: ${text.length}`);
      // Try to parse if JSON
      try {
        const body = JSON.parse(text);
        debug.push(`TAIFEX daily JSON keys: ${Object.keys(body).join(',')}`);
      } catch {
        // HTML response - try to extract data
        const match = text.match(/台股期貨[\s\S]*?(\d{2},?\d{3})/);
        if (match) debug.push(`TAIFEX daily found price pattern: ${match[1]}`);
      }
    }
  } catch (e) {
    debug.push(`TAIFEX daily error: ${e}`);
  }

  return null;
}

function parseTaifexOpenAPI(body: any, debug: string[]): TaifexResult | null {
  // OpenAPI may return array of quotes
  if (Array.isArray(body)) {
    const tx = body.find((item: any) =>
      (item.CommodityId === 'TX' || item.commodityId === 'TX' || item.ContractCode === 'TX') &&
      item.ExpiryMonth // near-month contract
    );
    if (tx) {
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
    }
  }
  return null;
}

function parseTaifexMIS(body: any, debug: string[]): TaifexResult | null {
  // MIS API returns { RtCode, RtMsg, RtData: { QuoteList: [...] } }
  const list = body?.RtData?.QuoteList ?? body?.RtData ?? [];
  if (Array.isArray(list) && list.length > 0) {
    // Find nearest month TX contract
    const tx = list.find((item: any) => item.CID === 'TX' || item.SymbolID?.startsWith('TX'));
    if (tx) {
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
    }
  }
  return null;
}
