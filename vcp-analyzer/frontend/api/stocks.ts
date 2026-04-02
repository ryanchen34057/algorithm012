// Vercel Serverless Function: Fetch stock list from TWSE + TPEx
export const config = { regions: ['hkg1'] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

interface StockInfo {
  symbol: string;
  name: string;
  close: number;
  volume: number;
  date: string;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const minPrice = Number(req.query.minPrice) || 15;
  const minVolLots = Number(req.query.minVolume) || 0;
  const debug: string[] = [];

  try {
    const [twse, tpex] = await Promise.allSettled([
      fetchTWSE(minPrice, minVolLots, debug),
      fetchTPEx(minPrice, minVolLots, debug),
    ]);

    const twseStocks = twse.status === 'fulfilled' ? twse.value : [];
    const tpexStocks = tpex.status === 'fulfilled' ? tpex.value : [];

    if (twse.status === 'rejected') debug.push(`TWSE rejected: ${twse.reason}`);
    if (tpex.status === 'rejected') debug.push(`TPEx rejected: ${tpex.reason}`);

    debug.push(`TWSE: ${twseStocks.length} stocks, TPEx: ${tpexStocks.length} stocks`);

    const stocks: StockInfo[] = [...twseStocks, ...tpexStocks];
    res.json({ stocks, total: stocks.length, debug });
  } catch (e) {
    res.status(500).json({ error: String(e), debug });
  }
}

async function fetchTWSE(minPrice: number, minVolLots: number, debug: string[]): Promise<StockInfo[]> {
  // Try multiple TWSE endpoints in order of reliability from overseas
  const strategies = [
    { name: 'MI_INDEX', fn: () => fetchTWSE_MI_INDEX(minPrice, minVolLots, debug) },
    { name: 'RWD', fn: () => fetchTWSE_RWD(minPrice, minVolLots, debug) },
    { name: 'OPENDATA', fn: () => fetchTWSE_OPENDATA(minPrice, minVolLots, debug) },
  ];

  for (const { name, fn } of strategies) {
    try {
      const result = await fn();
      if (result.length > 0) {
        debug.push(`TWSE ${name} success: ${result.length} stocks`);
        return result;
      }
    } catch (e) {
      debug.push(`TWSE ${name} failed: ${e}`);
    }
  }
  return [];
}

// Strategy 1: MI_INDEX (大盤每日收盤行情) - most reliable from overseas
async function fetchTWSE_MI_INDEX(minPrice: number, minVolLots: number, debug: string[]): Promise<StockInfo[]> {
  // Try last 5 days to find a trading day
  const now = new Date();
  for (let d = 0; d < 5; d++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    const dateStr = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
    const dateFmt = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${dateStr}&type=ALLBUT0999`;
    debug.push(`TWSE MI_INDEX trying date ${dateStr}`);

    const r = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Referer': 'https://www.twse.com.tw/zh/trading/exchange/MI_INDEX.html' },
    });
    debug.push(`TWSE MI_INDEX ${dateStr} → HTTP ${r.status}`);
    if (!r.ok) continue;

    const body = await r.json();
    if (body.stat !== 'OK') {
      debug.push(`TWSE MI_INDEX stat: ${body.stat}`);
      continue;
    }

    // Find the table with individual stock data (usually tables9 or the last large table)
    let table: string[][] | null = null;
    let fields: string[] = [];
    for (let i = 9; i >= 0; i--) {
      const key = `tables${i}`;
      if (body[key]?.data?.length > 100) {
        table = body[key].data;
        fields = body[key].fields ?? [];
        debug.push(`TWSE MI_INDEX using ${key}: ${table!.length} rows, fields: [${fields.slice(0, 5).join(',')}]`);
        break;
      }
    }
    // Also try body.data directly
    if (!table && body.data?.length > 100) {
      table = body.data;
      fields = body.fields ?? [];
    }

    if (!table || table.length < 100) continue;

    // Find column indices
    const codeIdx = fields.findIndex((f: string) => f.includes('證券代號'));
    const nameIdx = fields.findIndex((f: string) => f.includes('證券名稱'));
    const priceIdx = fields.findIndex((f: string) => f.includes('收盤價'));
    const volIdx = fields.findIndex((f: string) => f.includes('成交股數') || f.includes('成交量'));
    debug.push(`TWSE MI_INDEX indices: code=${codeIdx}, name=${nameIdx}, price=${priceIdx}, vol=${volIdx}`);

    if (codeIdx < 0) continue;

    const result: StockInfo[] = [];
    for (const row of table) {
      if (!Array.isArray(row) || row.length <= codeIdx) continue;
      const code = String(row[codeIdx]).trim();
      if (!/^\d{4}$/.test(code)) continue;
      const price = priceIdx >= 0 ? parseNum(String(row[priceIdx])) : 0;
      if (price < minPrice) continue;
      const vol = volIdx >= 0 ? parseNum(String(row[volIdx])) / 1000 : 0;
      if (vol < minVolLots) continue;
      result.push({
        symbol: code + '.TW',
        name: nameIdx >= 0 ? String(row[nameIdx]).trim() : '',
        close: price,
        volume: volIdx >= 0 ? parseNum(String(row[volIdx])) : 0,
        date: dateFmt,
      });
    }
    if (result.length > 0) return result;
  }
  return [];
}

// Strategy 2: RWD API (afterTrading/STOCK_DAY_ALL)
async function fetchTWSE_RWD(minPrice: number, minVolLots: number, debug: string[]): Promise<StockInfo[]> {
  const url = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json';
  debug.push(`TWSE RWD trying: ${url}`);
  const r = await fetch(url, {
    headers: { ...BROWSER_HEADERS, 'Referer': 'https://www.twse.com.tw/zh/trading/exchange/STOCK_DAY_ALL.html' },
  });
  debug.push(`TWSE RWD → HTTP ${r.status}`);
  if (!r.ok) return [];
  const body = await r.json();

  if (!body.fields || !Array.isArray(body.data)) return [];

  const fields: string[] = body.fields.map((f: string) => f.trim());
  const codeIdx = fields.findIndex((f: string) => f.includes('證券代號'));
  const nameIdx = fields.findIndex((f: string) => f.includes('證券名稱'));
  const priceIdx = fields.findIndex((f: string) => f.includes('收盤價'));
  const volIdx = fields.findIndex((f: string) => f.includes('成交股數') || f.includes('成交量'));
  if (codeIdx < 0) return [];

  const twseDate = body.date ?? '';
  const dateFmt = twseDate.length === 8
    ? `${twseDate.slice(0, 4)}-${twseDate.slice(4, 6)}-${twseDate.slice(6, 8)}`
    : '';

  const result: StockInfo[] = [];
  for (const row of body.data) {
    if (!Array.isArray(row) || row.length <= codeIdx) continue;
    const code = String(row[codeIdx]).trim();
    if (!/^\d{4}$/.test(code)) continue;
    const price = priceIdx >= 0 ? parseNum(String(row[priceIdx])) : 0;
    if (price < minPrice) continue;
    const vol = volIdx >= 0 ? parseNum(String(row[volIdx])) / 1000 : 0;
    if (vol < minVolLots) continue;
    result.push({
      symbol: code + '.TW',
      name: nameIdx >= 0 ? String(row[nameIdx]).trim() : '',
      close: price,
      volume: volIdx >= 0 ? parseNum(String(row[volIdx])) : 0,
      date: dateFmt,
    });
  }
  return result;
}

// Strategy 3: OPENDATA API
async function fetchTWSE_OPENDATA(minPrice: number, minVolLots: number, debug: string[]): Promise<StockInfo[]> {
  const url = 'https://opendata.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
  debug.push(`TWSE OPENDATA trying: ${url}`);
  const r = await fetch(url, { headers: BROWSER_HEADERS });
  debug.push(`TWSE OPENDATA → HTTP ${r.status}`);
  if (!r.ok) return [];
  const body = await r.json();

  if (!Array.isArray(body) || body.length === 0) return [];

  return body
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
      close: parseNum(r.ClosingPrice ?? r['收盤價'] ?? '0'),
      volume: parseNum(r.TradeVolume ?? r['成交股數'] ?? '0'),
      date: '',
    }));
}

async function fetchTPEx(minPrice: number, minVolLots: number, debug: string[]): Promise<StockInfo[]> {
  try {
    const url = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
    debug.push(`TPEx trying: ${url}`);
    const r = await fetch(url, { headers: BROWSER_HEADERS });
    debug.push(`TPEx → HTTP ${r.status}`);
    if (!r.ok) return [];
    const rows: any[] = await r.json();
    debug.push(`TPEx raw rows: ${rows.length}`);

    const tpexDateRaw = rows[0]?.Date ?? '';
    let tpexDate = '';
    if (tpexDateRaw) {
      const parts = tpexDateRaw.split('/');
      if (parts.length === 3) {
        const y = parseInt(parts[0]) + 1911;
        tpexDate = `${y}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      debug.push(`TPEx date: ${tpexDate}`);
    }

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
        close: parseNum(r.Close ?? '0'),
        volume: parseNum(r.TradingShares ?? '0'),
        date: tpexDate,
      }));
  } catch (e) {
    debug.push(`TPEx error: ${e}`);
    return [];
  }
}

function parseNum(s: string): number {
  return parseFloat(String(s).replace(/,/g, '')) || 0;
}
