// Vercel Serverless Function: Proxy TAIFEX futures data (台指期貨 日盤/夜盤)
export const config = { regions: ['hkg1'] };
import { setCacheHeaders } from './_cache';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  setCacheHeaders(res, { duringMarket: 60, afterMarket: 1800 });
  if (req.method === 'OPTIONS') return res.status(204).end();

  const debug: string[] = [];
  const session = detectSession();
  debug.push(`session: ${session.type} (TW hour: ${session.twHour}:${session.twMin})`);

  try {
    const result = await fetchTAIFEX(session, debug);
    if (result) {
      res.json({ ...result, debug });
    } else {
      res.status(404).json({ error: 'No TAIFEX data available', debug });
    }
  } catch (e) {
    res.status(500).json({ error: String(e), debug });
  }
}

interface Session {
  type: 'day' | 'night' | 'closed';
  twHour: number;
  twMin: number;
  marketCode: string; // '0' = day, '1' = night
}

function detectSession(): Session {
  const now = new Date();
  const twHour = (now.getUTCHours() + 8) % 24;
  const twMin = now.getUTCMinutes();
  const hm = twHour * 100 + twMin;
  const twDay = new Date(now.getTime() + 8 * 3600 * 1000).getUTCDay();
  const isWeekday = twDay >= 1 && twDay <= 5;
  // Sat night session runs from Fri 15:00 ~ Sat 05:00
  const isFriNight = twDay === 6 && hm < 500;

  let type: 'day' | 'night' | 'closed' = 'closed';
  let marketCode = '0';

  if ((isWeekday || isFriNight) && (hm >= 845 && hm <= 1345)) {
    type = 'day';
    marketCode = '0';
  } else if ((isWeekday || isFriNight) && (hm >= 1500 || hm < 500)) {
    type = 'night';
    marketCode = '1';
  }

  return { type, twHour, twMin, marketCode };
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

async function fetchTAIFEX(session: Session, debug: string[]): Promise<TaifexResult | null> {
  // Strategy 1: TAIFEX official after-hours daily data (最可靠)
  const daily = await tryTaifexDaily(session, debug);
  if (daily) return daily;

  // Strategy 2: TAIFEX MIS real-time API (盤中即時)
  const mis = await tryTaifexMIS(session, debug);
  if (mis) return mis;

  // Strategy 3: Yahoo Finance ^TWII as proxy (永遠可用的備案)
  const yahoo = await tryYahooTWII(debug);
  if (yahoo) return yahoo;

  return null;
}

// ── Strategy 1: TAIFEX official daily settlement data ──
async function tryTaifexDaily(session: Session, debug: string[]): Promise<TaifexResult | null> {
  try {
    // Try last 5 trading days
    const now = new Date(Date.now() + 8 * 3600 * 1000); // TW time
    for (let offset = 0; offset < 5; offset++) {
      const d = new Date(now);
      d.setDate(d.getDate() - offset);
      const day = d.getUTCDay();
      if (day === 0 || day === 6) continue;

      const dateStr = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
      const url = 'https://www.taifex.com.tw/rwd/zh/afterTrading/futContractsDate';

      debug.push(`TAIFEX daily trying: ${dateStr}, marketCode=${session.marketCode}`);
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://www.taifex.com.tw/cht/3/futContractsDate',
          'Origin': 'https://www.taifex.com.tw',
        },
        body: `queryType=2&marketCode=${session.marketCode}&commodity_id=TX&queryDate=${dateStr}`,
      });

      debug.push(`TAIFEX daily ${dateStr} → HTTP ${r.status}`);
      if (!r.ok) continue;

      const text = await r.text();
      // Response is HTML with a data table, or JSON
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        // Try to parse HTML table
        const result = parseTaifexHTML(text, session, debug);
        if (result) return result;
        continue;
      }

      // JSON response
      if (body?.reportDate && body?.totalTableName) {
        debug.push(`TAIFEX daily JSON got data for ${body.reportDate}`);
        // Look for TX nearest month
        const tables = [body.table1, body.table2, body.table3];
        for (const table of tables) {
          if (!Array.isArray(table)) continue;
          for (const row of table) {
            if (!Array.isArray(row)) continue;
            // Row format: [契約, 到期月份, 開盤價, 最高價, 最低價, 收盤價, 漲跌, 漲跌%, 成交量, ...]
            const contract = String(row[0] ?? '').trim();
            if (contract !== '臺股期貨' && contract !== 'TX') continue;

            const price = parseNum(String(row[5] ?? ''));
            const change = parseNum(String(row[6] ?? ''));
            if (!price) continue;

            const prevClose = price - change;
            const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

            debug.push(`TAIFEX daily found: price=${price}, change=${change}`);
            return {
              symbol: 'TX',
              name: session.type === 'night' ? '台指夜盤' : '台指期貨',
              price,
              change: Math.round(change * 100) / 100,
              changePct: Math.round(changePct * 100) / 100,
              time: body.reportDate ?? dateStr,
              session: session.type === 'night' ? 'night' : 'day',
            };
          }
        }
      }
    }
  } catch (e) {
    debug.push(`TAIFEX daily error: ${e}`);
  }
  return null;
}

function parseTaifexHTML(html: string, session: Session, debug: string[]): TaifexResult | null {
  try {
    // Find TX row in HTML table: look for 臺股期貨 or TX
    // The table has columns: 契約, 到期月份(週別), 開盤價, 最高價, 最低價, 收盤價, 漲跌價, 漲跌%, ...
    const txMatch = html.match(/臺股期貨[\s\S]*?<\/tr>/);
    if (!txMatch) {
      debug.push('TAIFEX HTML: 臺股期貨 not found');
      return null;
    }

    // Extract all <td> values from the row
    const tdValues: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let m;
    while ((m = tdRegex.exec(txMatch[0])) !== null) {
      tdValues.push(m[1].replace(/<[^>]*>/g, '').trim());
    }

    debug.push(`TAIFEX HTML tds: [${tdValues.slice(0, 8).join(', ')}]`);
    if (tdValues.length < 7) return null;

    // Find the settlement/close price (index 5) and change (index 6)
    const price = parseNum(tdValues[5] ?? '');
    const change = parseNum(tdValues[6] ?? '');
    if (!price) return null;

    const prevClose = price - change;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: 'TX',
      name: session.type === 'night' ? '台指夜盤' : '台指期貨',
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      time: '',
      session: session.type === 'night' ? 'night' : 'day',
    };
  } catch (e) {
    debug.push(`TAIFEX HTML parse error: ${e}`);
    return null;
  }
}

// ── Strategy 2: TAIFEX MIS real-time API ──
async function tryTaifexMIS(session: Session, debug: string[]): Promise<TaifexResult | null> {
  // MIS API only works during trading hours
  if (session.type === 'closed') {
    debug.push('TAIFEX MIS: market closed, skip');
    return null;
  }

  try {
    // Step 1: Get session token by visiting the page
    const pageUrl = 'https://mis.taifex.com.tw/futures/RegularSession/EquityIndices/FuturesDomestic/';
    debug.push('TAIFEX MIS: fetching page for session...');
    const pageRes = await fetch(pageUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    });
    const cookies = pageRes.headers.get('set-cookie') ?? '';
    debug.push(`TAIFEX MIS page → ${pageRes.status}, cookie: ${cookies.slice(0, 50)}`);

    // Step 2: Query the API
    const url = 'https://mis.taifex.com.tw/futures/api/getQuoteList';
    debug.push(`TAIFEX MIS trying: marketCode=${session.marketCode}`);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://mis.taifex.com.tw',
        'Referer': pageUrl,
        'Cookie': cookies.split(';')[0] ?? '',
      },
      body: JSON.stringify({
        MarketType: session.marketCode,
        CID: 'TXF',
        SymbolType: 'F',
        ShowType: 'All',
      }),
    });

    debug.push(`TAIFEX MIS → HTTP ${r.status}`);
    if (!r.ok) return null;

    const body = await r.json();
    debug.push(`TAIFEX MIS keys: ${JSON.stringify(Object.keys(body))}`);

    const list = body?.RtData?.QuoteList ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      debug.push(`TAIFEX MIS: empty list, RtData keys: ${JSON.stringify(Object.keys(body?.RtData ?? {}))}`);
      return null;
    }

    debug.push(`TAIFEX MIS: ${list.length} items, first: ${JSON.stringify(list[0]).slice(0, 200)}`);

    // Find nearest month TX contract (CID starts with TX, not TXO)
    const tx = list.find((item: any) => {
      const symbolId = item.SymbolID ?? '';
      return symbolId.startsWith('TX') && !symbolId.startsWith('TXO');
    }) ?? list[0];

    if (!tx) return null;

    const price = parseFloat(tx.CLastPrice ?? tx.LastPrice ?? 0);
    const refPrice = parseFloat(tx.CRefPrice ?? tx.ReferencePrice ?? 0);
    if (!price) {
      debug.push(`TAIFEX MIS: price=0`);
      return null;
    }

    const change = refPrice > 0 ? price - refPrice : parseFloat(tx.CDiff ?? 0);
    const changePct = refPrice > 0 ? (change / refPrice) * 100 : parseFloat(tx.CDiffRate ?? 0);

    return {
      symbol: 'TX',
      name: session.type === 'night' ? '台指夜盤' : '台指期貨',
      price,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      time: tx.CTime ?? '',
      session: session.type === 'night' ? 'night' : 'day',
    };
  } catch (e) {
    debug.push(`TAIFEX MIS error: ${e}`);
    return null;
  }
}

// ── Strategy 3: Yahoo Finance ^TWII as fallback ──
async function tryYahooTWII(debug: string[]): Promise<TaifexResult | null> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?range=5d&interval=1d';
    debug.push('Yahoo ^TWII trying');
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    debug.push(`Yahoo ^TWII → HTTP ${r.status}`);
    if (!r.ok) return null;

    const body = await r.json();
    const meta = body?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? 0;
    if (!price) return null;

    const change = prevClose > 0 ? price - prevClose : 0;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const ts = meta.regularMarketTime ?? 0;
    const d = new Date(ts * 1000);
    const time = d.toLocaleString('zh-TW', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Taipei',
    });

    debug.push(`Yahoo ^TWII got: ${price}`);
    return {
      symbol: '^TWII',
      name: '加權指數',
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      time,
      session: 'day',
    };
  } catch (e) {
    debug.push(`Yahoo ^TWII error: ${e}`);
    return null;
  }
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, '').replace(/[△▲▽▼↑↓]/g, '').trim()) || 0;
}
