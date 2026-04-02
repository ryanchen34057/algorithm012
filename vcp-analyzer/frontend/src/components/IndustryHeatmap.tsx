import { useMemo } from 'react';
import { BullPickAnalysis } from '../types';
import { useColors } from './ThemeContext';

interface Props {
  stocks: BullPickAnalysis[];
}

interface IndustryGroup {
  industry: string;
  count: number;
  avgChange: number;
  totalNetBuy: number;
  avgScore: number;
  topStock: string;
  topStockName: string;
}

export default function IndustryHeatmap({ stocks }: Props) {
  const c = useColors();

  const groups = useMemo(() => {
    const map = new Map<string, {
      count: number; changes: number[]; netBuys: number[]; scores: number[];
      topScore: number; topSymbol: string; topName: string;
    }>();

    for (const s of stocks) {
      const key = s.industry || '其他';
      let g = map.get(key);
      if (!g) {
        g = { count: 0, changes: [], netBuys: [], scores: [], topScore: 0, topSymbol: '', topName: '' };
        map.set(key, g);
      }
      g.count++;
      g.changes.push(s.changePct);
      g.netBuys.push(s.totalNetBuy);
      g.scores.push(s.score);
      if (s.score > g.topScore) {
        g.topScore = s.score;
        g.topSymbol = s.symbol.replace(/\.(TW|TWO)$/, '');
        g.topName = s.name;
      }
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const result: IndustryGroup[] = [];
    for (const [industry, g] of map) {
      result.push({
        industry,
        count: g.count,
        avgChange: Math.round(avg(g.changes) * 100) / 100,
        totalNetBuy: Math.round(g.netBuys.reduce((a, b) => a + b, 0)),
        avgScore: Math.round(avg(g.scores)),
        topStock: g.topSymbol,
        topStockName: g.topName,
      });
    }

    result.sort((a, b) => b.count - a.count);
    return result;
  }, [stocks]);

  if (stocks.length === 0 || groups.length === 0) return null;

  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: c.text }}>
          類股分佈
        </span>
        <span style={{ fontSize: 12, color: c.textMuted }}>{groups.length} 個產業</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 8,
      }}>
        {groups.map((g) => {
          const changeBg = g.avgChange > 0 ? c.up + '15' : g.avgChange < 0 ? c.down + '15' : c.textMuted + '10';
          const changeColor = g.avgChange > 0 ? c.up : g.avgChange < 0 ? c.down : c.textMuted;
          const netBuyColor = g.totalNetBuy > 0 ? c.up : g.totalNetBuy < 0 ? c.down : c.textMuted;

          return (
            <div key={g.industry} style={{
              background: changeBg, borderRadius: 8, padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{g.industry}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: c.bgCard, color: c.textSecondary,
                }}>{g.count} 支</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: c.textMuted }}>均漲跌</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: changeColor }}>
                  {g.avgChange > 0 ? '+' : ''}{g.avgChange}%
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: c.textMuted }}>法人合計</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: netBuyColor }}>
                  {fmtNetBuy(g.totalNetBuy)} 張
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                <span style={{ fontSize: 10, color: c.textMuted }}>最高分</span>
                <span style={{ fontSize: 11, color: c.textSecondary }}>
                  {g.topStock} {g.topStockName} ({g.avgScore})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtNetBuy(v: number): string {
  if (v === 0) return '0';
  const sign = v > 0 ? '+' : '';
  if (Math.abs(v) >= 10000) return `${sign}${(v / 10000).toFixed(1)}萬`;
  if (Math.abs(v) >= 1000) return `${sign}${(v / 1000).toFixed(1)}K`;
  return `${sign}${Math.round(v)}`;
}
