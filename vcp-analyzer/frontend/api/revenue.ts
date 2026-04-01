// Vercel Serverless Function: Proxy Yahoo Finance quoteSummary for revenue data
export const config = { regions: ['hkg1'] };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

let cachedCrumb = '';
let cachedCookie = '';

async function fetchCrumb(): Promise<void> {
  if (cachedCrumb) return;

  const r1 = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
  });

  const cookies: string[] = [];
  // Try getSetCookie first (Node 18.15+), then fallback
  const rawSetCookie = r1.headers.get('set-cookie') ?? '';
  if (rawSetCookie) {
    for (const part of rawSetCookie.split(/,(?=[^ ])/)) {
      const kv = part.split(';')[0].trim();
      if (kv.includes('=')) cookies.push(kv);
    }
  }

  cachedCookie = cookies.join('; ');
  if (!cachedCookie) return;

  const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cachedCookie },
  });
  const crumb = (await r2.text()).trim();
  if (crumb && !crumb.includes('<')) {
    cachedCrumb = crumb;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const symbol = req.query.symbol as string;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    await fetchCrumb();

    if (!cachedCrumb) {
      return res.json({ revenue: null, error: 'crumb_unavailable' });
    }

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=incomeStatementHistory,financialData&crumb=${encodeURIComponent(cachedCrumb)}`;

    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Cookie: cachedCookie },
    });

    if (r.status === 401 || r.status === 403) {
      cachedCrumb = '';
      cachedCookie = '';
      return res.json({ revenue: null, error: 'crumb_expired' });
    }

    if (!r.ok) {
      return res.json({ revenue: null, error: `HTTP ${r.status}` });
    }

    const data = await r.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return res.json({ revenue: null });

    const stmts = result.incomeStatementHistory?.incomeStatementHistory ?? [];
    const fin = result.financialData;

    let revenue: {
      revenueLatest: number; revenuePrev: number;
      revenueGrowth: number; period: string;
    } | null = null;

    if (stmts.length >= 2) {
      const latest = stmts[0];
      const prev = stmts[1];
      const rl = latest.totalRevenue?.raw ?? 0;
      const rp = prev.totalRevenue?.raw ?? 0;
      const growth = rp > 0 ? ((rl - rp) / rp) * 100 : 0;
      const ly = (latest.endDate?.fmt ?? '').slice(0, 4);
      const py = (prev.endDate?.fmt ?? '').slice(0, 4);
      revenue = {
        revenueLatest: rl,
        revenuePrev: rp,
        revenueGrowth: Math.round(growth * 100) / 100,
        period: `${ly} vs ${py}`,
      };
    } else if (fin?.totalRevenue?.raw > 0) {
      revenue = {
        revenueLatest: fin.totalRevenue.raw,
        revenuePrev: 0,
        revenueGrowth: Math.round((fin.revenueGrowth?.raw ?? 0) * 10000) / 100,
        period: 'TTM',
      };
    }

    res.json({ revenue });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
