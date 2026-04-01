// CSV download utility for scan results

function escapeCsvField(val: string | number | boolean): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean)[][]) {
  // Add BOM for Excel to recognize UTF-8
  const bom = '\uFEFF';
  const csvContent = [
    headers.map(escapeCsvField).join(','),
    ...rows.map(row => row.map(escapeCsvField).join(',')),
  ].join('\n');

  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ── Per-scanner CSV exports ──

import type {
  GapAnalysis, BreakoutAnalysis, PeakAttackAnalysis, SuperPerfAnalysis,
  ElitePickAnalysis, MAPullbackAnalysis, BullPickAnalysis,
} from '../types';

export function downloadGapCsv(stocks: GapAnalysis[]) {
  const headers = ['代碼', '名稱', '方向', '收盤價', '跳空%', '進場', '停損', '目標', '風報比', '分數', '日均量(張)', '當日量'];
  const rows = stocks.map(s => [
    s.symbol.replace(/\.(TW|TWO)$/, ''), s.name,
    s.direction === 'long' ? '做多' : '做空',
    s.currentPrice, s.gapPercent, s.entryPrice, s.stopLoss, s.target,
    s.rewardRisk, s.score, s.adv20, s.todayVolume,
  ]);
  downloadCsv(`震撼跳空_${fmtDate()}.csv`, headers, rows);
}

export function downloadBreakoutCsv(stocks: BreakoutAnalysis[]) {
  const headers = ['代碼', '名稱', '收盤價', '前高', '距前高%', '型態', 'MA20', 'MA50', 'MA200', '進場', '停損', '目標', '風報比', '分數', '日均量(張)'];
  const rows = stocks.map(s => [
    s.symbol.replace(/\.(TW|TWO)$/, ''), s.name,
    s.currentPrice, s.prevHigh, s.distPct, s.patternLabel || s.pattern,
    s.ma20, s.ma50, s.ma200,
    s.entryPrice, s.stopLoss, s.target, s.rewardRisk, s.score, s.adv20,
  ]);
  downloadCsv(`突破前高_${fmtDate()}.csv`, headers, rows);
}

export function downloadPeakAttackCsv(stocks: PeakAttackAnalysis[]) {
  const headers = ['代碼', '名稱', '收盤價', 'K值', 'D值', '攻頂次數', '突破價', '距突破%', '量比', '進場', '停損', '目標', '風報比', '分數', '日均量(張)'];
  const rows = stocks.map(s => [
    s.symbol.replace(/\.(TW|TWO)$/, ''), s.name,
    s.currentPrice, s.k, s.d, s.attackCount, s.breakoutPrice, s.distPct,
    s.volRatio, s.entryPrice, s.stopLoss, s.target, s.rewardRisk, s.score, s.adv20,
  ]);
  downloadCsv(`攻頂突破_${fmtDate()}.csv`, headers, rows);
}

export function downloadSuperPerfCsv(stocks: SuperPerfAnalysis[]) {
  const headers = ['代碼', '名稱', '市場', '產業', '概念', '收盤價', '近1日%', '近1週%', '近1月%', '近3月%', '近6月%', 'YTD%', 'VCP分', '趨勢', '收斂', '量縮', '支點', 'RS', 'MA50', 'MA150', 'MA200', '52週高', '52週低', '進場', '停損', '目標', '風報比', '日均量(張)'];
  const rows = stocks.map(s => [
    s.symbol.replace(/\.(TW|TWO)$/, ''), s.name, s.market, s.industry, s.conceptTag,
    s.currentPrice, s.gain1d, s.gain1w, s.gain1m, s.gain3m, s.gain6m, s.gainYtd,
    s.vcpScore, s.trendScore, s.contractionScore, s.volDryUpScore, s.pivotScore, s.rsScore,
    s.ma50, s.ma150, s.ma200, s.high52w, s.low52w,
    s.entryPrice, s.stopLoss, s.target, s.rewardRisk, s.adv20,
  ]);
  downloadCsv(`超級績效_${fmtDate()}.csv`, headers, rows);
}

export function downloadElitePickCsv(stocks: ElitePickAnalysis[]) {
  const headers = ['代碼', '名稱', '市場', '產業', '概念', '收盤價', '型態', '距前高%', '量縮比', '整理波幅%', 'MA10', 'MA20', 'MA60', 'MA120', '出場訊號', '進場', '停損', '停損依據', '目標', '風報比', '建議張數', '分數', '日均量(張)'];
  const rows = stocks.map(s => [
    s.symbol.replace(/\.(TW|TWO)$/, ''), s.name, s.market, s.industry, s.conceptTag,
    s.currentPrice, s.patternLabel || '-', s.distPct, s.volShrink, s.rangePct,
    s.ma10, s.ma20, s.ma60, s.ma120,
    s.sellLabel || '無',
    s.entryPrice, s.stopLoss, s.stopLabel, s.target, s.rewardRisk, s.suggestLots, s.score, s.adv20,
  ]);
  downloadCsv(`精選突破_${fmtDate()}.csv`, headers, rows);
}

export function downloadMAPullbackCsv(stocks: MAPullbackAnalysis[]) {
  const headers = ['代碼', '名稱', '市場', '產業', '概念', '收盤價',
    '日MA20', '日MA200', '日MA20斜率', '日距MA20%',
    '週MA20', '週MA200', '週MA20斜率', '週距MA20%',
    '月MA20', '月MA200', '月MA20斜率', '月距MA20%',
    '日線OK', '週線OK', '月線OK', '全通過',
    '進場', '停損', '停損依據', '目標', '風報比', '分數', '日均量(張)'];
  const rows = stocks.map(s => [
    s.symbol.replace(/\.(TW|TWO)$/, ''), s.name, s.market, s.industry, s.conceptTag, s.currentPrice,
    s.dailyMa20, s.dailyMa200, s.dailyMa20Slope, s.dailyDistMa20,
    s.weeklyMa20, s.weeklyMa200, s.weeklyMa20Slope, s.weeklyDistMa20,
    s.monthlyMa20, s.monthlyMa200, s.monthlyMa20Slope, s.monthlyDistMa20,
    s.dailyOk ? 'V' : 'X', s.weeklyOk ? 'V' : 'X', s.monthlyOk ? 'V' : 'X', s.allOk ? 'V' : 'X',
    s.entryPrice, s.stopLoss, s.stopLabel, s.target, s.rewardRisk, s.score, s.adv20,
  ]);
  downloadCsv(`均線回踩_${fmtDate()}.csv`, headers, rows);
}

export function downloadBullPickCsv(stocks: BullPickAnalysis[]) {
  const headers = ['代碼', '名稱', '市場', '產業', '概念', '收盤價',
    '型態', '多頭排列', '歷史高點', '距歷史高%',
    '外資(張)', '投信(張)', '自營(張)', '法人合計(張)',
    '最近年度營收(億)', '前一年度營收(億)', '年營收成長率%', '營收期間',
    'MA20', 'MA60', 'MA120', 'MA200',
    '進場', '停損', '停損依據', '目標', '風報比', '分數', '日均量(張)'];
  const rows = stocks.map(s => [
    s.symbol.replace(/\.(TW|TWO)$/, ''), s.name, s.market, s.industry, s.conceptTag, s.currentPrice,
    s.patternLabel || '-', s.maAligned ? 'V' : 'X', s.allTimeHigh, s.distHighPct,
    s.foreignNetBuy, s.trustNetBuy, s.dealerNetBuy, s.totalNetBuy,
    s.revenueLatest, s.revenuePrev, s.revenueGrowth, s.revenuePeriod,
    s.ma20, s.ma60, s.ma120, s.ma200,
    s.entryPrice, s.stopLoss, s.stopLabel, s.target, s.rewardRisk, s.score, s.adv20,
  ]);
  downloadCsv(`強勢精選_${fmtDate()}.csv`, headers, rows);
}
