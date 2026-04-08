// Shared cache helper for Vercel serverless functions
// 台股盤中 (09:00-13:30 TWD) 不快取，盤後快取較久

export function setCacheHeaders(res: any, opts: { duringMarket: number; afterMarket: number }) {
  const now = new Date();
  // Taiwan is UTC+8
  const twHour = (now.getUTCHours() + 8) % 24;
  const twMin = twHour * 60 + now.getUTCMinutes();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat (adjust for TW timezone)
  const twDay = (now.getUTCHours() + 8 >= 24) ? (day + 1) % 7 : day;

  const isWeekday = twDay >= 1 && twDay <= 5;
  const isMarketHours = twMin >= 540 && twMin <= 810; // 09:00 - 13:30

  const maxAge = (isWeekday && isMarketHours) ? opts.duringMarket : opts.afterMarket;

  if (maxAge > 0) {
    // s-maxage = CDN cache, stale-while-revalidate = serve stale while fetching fresh
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}
