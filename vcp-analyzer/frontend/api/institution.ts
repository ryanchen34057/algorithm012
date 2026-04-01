// Vercel Serverless Function: Proxy TWSE/TPEx institutional buying data
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const now = new Date();
    let twseData: Record<string, InstitutionEntry> = {};
    let tpexData: Record<string, InstitutionEntry> = {};

    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(now);
      d.setDate(d.getDate() - offset);
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const twseURL = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${dateStr}&selectType=ALLBUT0999`;
      const r = await fetch(twseURL, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const body = await r.json();
      if (body.stat !== 'OK' || !body.data?.length) continue;

      twseData = parseTWSE(body);
      tpexData = await fetchTPEx(d);
      break;
    }

    const merged = { ...twseData, ...tpexData };
    res.json({ data: merged, count: Object.keys(merged).length });
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
