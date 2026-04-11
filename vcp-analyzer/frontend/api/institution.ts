// Vercel Serverless Function: Proxy TWSE/TPEx institutional buying data
// Supports ?days=N to accumulate N trading days (default: 1)
// Gracefully returns partial data if approaching timeout
export const config = { regions: ['hkg1'], maxDuration: 60 };
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
  // 法人資料盤後才更新：盤中不快取，盤後快取 2 小時
  setCacheHeaders(res, { duringMarket: 0, afterMarket: 7200 });
  if (req.method === 'OPTIONS') return res.status(204).end();

  const days = Math.min(Math.max(parseInt(req.query?.days) || 1, 1), 20);
  const startTime = Date.now();
  // Leave 1.5s buffer before Vercel kills us (free=10s, pro=60s)
  const TIMEOUT_MS = 8500;

  try {
    // Collect candidate trading dates (skip weekends)
    const candidates: Date[] = [];
    const now = new Date();
    for (let offset = 0; candidates.length < days + 10 && offset < 45; offset++) {
      const d = new Date(now);
      d.setDate(d.getDate() - offset);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      candidates.push(new Date(d));
    }

    // Fetch dates in parallel batches, stop if approaching timeout
    const BATCH = 3; // smaller batches to reduce per-batch time
    const accumulated: Record<string, InstitutionEntry> = {};
    let tradingDaysFound = 0;

    for (let i = 0; i < candidates.length && tradingDaysFound < days; i += BATCH) {
      // Check timeout before starting a new batch
      if (Date.now() - startTime > TIMEOUT_MS) {
        break;
      }

      const batch = candidates.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(d => fetchOneDay(d)));

      for (const dayData of results) {
        if (!dayData || Object.keys(dayData).length === 0) continue;
        tradingDaysFound++;
        if (tradingDaysFound > days) break;

        for (const [sym, entry] of Object.entries(dayData)) {
          if (!accumulated[sym]) {
            accumulated[sym] = { foreignNetBuy: 0, trustNetBuy: 0, dealerNetBuy: 0, totalNetBuy: 0 };
          }
          accumulated[sym].foreignNetBuy += entry.foreignNetBuy;
          accumulated[sym].trustNetBuy += entry.trustNetBuy;
          accumulated[sym].dealerNetBuy += entry.dealerNetBuy;
          accumulated[sym].totalNetBuy += entry.totalNetBuy;
        }
      }
    }

    // Round accumulated values
    for (const entry of Object.values(accumulated)) {
      entry.foreignNetBuy = Math.round(entry.foreignNetBuy);
      entry.trustNetBuy = Math.round(entry.trustNetBuy);
      entry.dealerNetBuy = Math.round(entry.dealerNetBuy);
      entry.totalNetBuy = Math.round(entry.totalNetBuy);
    }

    res.json({ data: accumulated, count: Object.keys(accumulated).length, days: tradingDaysFound });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

interface InstitutionEntry {
  foreignNetBuy: number;
  trustNetBuy: number;
  dealerNetBuy: number;
  totalNetBuy: number;
}

async function fetchOneDay(d: Date): Promise<Record<string, InstitutionEntry> | null> {
  try {
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const twseURL = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${dateStr}&selectType=ALLBUT0999`;
    const r = await fetch(twseURL, { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const body = await r.json();
    if (body.stat !== 'OK' || !body.data?.length) return null;

    const twseData = parseTWSE(body);
    const tpexData = await fetchTPEx(d);
    return { ...twseData, ...tpexData };
  } catch {
    return null;
  }
}

function parseTWSE(body: { fields: string[]; data: string[][] }): Record<string, InstitutionEntry> {
  const result: Record<string, InstitutionEntry> = {};
  const fields = body.fields.map((f: string) => f.trim());

  let codeIdx = 0, foreignIdx = -1, trustIdx = -1, dealerIdx = -1, totalIdx = -1;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.includes('證券代號')) codeIdx = i;
    if ((f.includes('外陸資買賣超股數') || f.includes('外資買賣超股數')) && foreignIdx === -1) foreignIdx = i;
    if (f.includes('投信買賣超股數')) trustIdx = i;
    if (f.includes('自營商買賣超股數') && !f.includes('避險') && dealerIdx === -1) dealerIdx = i;
    if (f.includes('三大法人買賣超股數')) totalIdx = i;
  }

  for (const row of body.data) {
    const code = (row[codeIdx] ?? '').trim();
    if (!/^\d{4}$/.test(code)) continue;
    const symbol = code + '.TW';

    const entry: InstitutionEntry = {
      foreignNetBuy: foreignIdx >= 0 ? parseNum(row[foreignIdx]) / 1000 : 0,
      trustNetBuy: trustIdx >= 0 ? parseNum(row[trustIdx]) / 1000 : 0,
      dealerNetBuy: dealerIdx >= 0 ? parseNum(row[dealerIdx]) / 1000 : 0,
      totalNetBuy: 0,
    };
    entry.totalNetBuy = totalIdx >= 0
      ? parseNum(row[totalIdx]) / 1000
      : entry.foreignNetBuy + entry.trustNetBuy + entry.dealerNetBuy;

    result[symbol] = entry;
  }
  return result;
}

async function fetchTPEx(date: Date): Promise<Record<string, InstitutionEntry>> {
  const result: Record<string, InstitutionEntry> = {};
  try {
    const rocYear = date.getFullYear() - 1911;
    const dateStr = `${rocYear}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    const url = `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&d=${dateStr}&se=EW&t=D`;

    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) return result;
    const body = await r.json();
    if (!body.aaData?.length) return result;

    for (const row of body.aaData) {
      if (row.length < 13) continue;
      const code = (row[0] as string).trim();
      if (!/^\d{4}$/.test(code)) continue;
      const symbol = code + '.TWO';

      const entry: InstitutionEntry = {
        foreignNetBuy: parseNum(row[4]) / 1000,
        trustNetBuy: parseNum(row[8]) / 1000,
        dealerNetBuy: parseNum(row[12]) / 1000,
        totalNetBuy: 0,
      };
      entry.totalNetBuy = entry.foreignNetBuy + entry.trustNetBuy + entry.dealerNetBuy;
      result[symbol] = entry;
    }
  } catch { /* ignore */ }
  return result;
}

function parseNum(s: string): number {
  return parseFloat(String(s).replace(/,/g, '').trim()) || 0;
}
