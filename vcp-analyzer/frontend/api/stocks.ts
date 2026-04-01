// Vercel Serverless Function: Fetch stock list from TWSE + TPEx
export const config = { regions: ['hkg1'] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface StockInfo {
  symbol: string;
  name: string;
  close: number;
  volume: number;  // 成交股數
  date: string;    // TWSE/TPEx 資料日期
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
  const urls = [
    'https://opendata.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
    'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json',
  ];

  for (const url of urls) {
    try {
      debug.push(`TWSE trying: ${url}`);
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        },
      });
      debug.push(`TWSE ${url} → HTTP ${r.status}`);
      if (!r.ok) continue;
      const body = await r.json();

      // Format 1: Array of objects (opendata API)
      if (Array.isArray(body) && body.length > 0 && typeof body[0] === 'object' && !Array.isArray(body[0])) {
        debug.push(`TWSE format: object array, rows: ${body.length}`);
        const result = body
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
        if (result.length > 0) return result;
      }

      // Format 2: {fields: [...], data: [[...], ...]} (rwd API)
      if (body.fields && Array.isArray(body.data)) {
        debug.push(`TWSE format: fields+data, fields: [${body.fields.slice(0, 8).join(',')}], rows: ${body.data.length}`);
        const fields: string[] = body.fields.map((f: string) => f.trim());
        const codeIdx = fields.findIndex((f: string) => f.includes('證券代號'));
        const nameIdx = fields.findIndex((f: string) => f.includes('證券名稱'));
        const priceIdx = fields.findIndex((f: string) => f.includes('收盤價'));
        const volIdx = fields.findIndex((f: string) => f.includes('成交股數') || f.includes('成交量'));
        const openIdx = fields.findIndex((f: string) => f.includes('開盤價'));
        const highIdx = fields.findIndex((f: string) => f.includes('最高價'));
        const lowIdx = fields.findIndex((f: string) => f.includes('最低價'));

        debug.push(`TWSE indices: code=${codeIdx}, name=${nameIdx}, price=${priceIdx}, vol=${volIdx}`);

        // Extract date from response body
        const twseDate = body.date ?? ''; // e.g. "20260401"
        const dateFmt = twseDate.length === 8
          ? `${twseDate.slice(0, 4)}-${twseDate.slice(4, 6)}-${twseDate.slice(6, 8)}`
          : '';
        if (dateFmt) debug.push(`TWSE date: ${dateFmt}`);

        if (codeIdx < 0) continue;

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
        debug.push(`TWSE filtered: ${result.length}`);
        if (result.length > 0) return result;
      }

      debug.push(`TWSE: unrecognized format, keys: ${Object.keys(body).join(',')}`);
    } catch (e) {
      debug.push(`TWSE ${url} error: ${e}`);
      continue;
    }
  }
  return [];
}

async function fetchTPEx(minPrice: number, minVolLots: number, debug: string[]): Promise<StockInfo[]> {
  try {
    const url = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
    debug.push(`TPEx trying: ${url}`);
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    });
    debug.push(`TPEx → HTTP ${r.status}`);
    if (!r.ok) return [];
    const rows: any[] = await r.json();
    debug.push(`TPEx raw rows: ${rows.length}`);

    // TPEx date from first row
    const tpexDateRaw = rows[0]?.Date ?? ''; // e.g. "115/03/31"
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
