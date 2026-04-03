import { IndustrySector } from '../types';
import { useColors } from './ThemeContext';

interface Props {
  industries: IndustrySector[];
}

export default function IndustryHeatmap({ industries }: Props) {
  const c = useColors();

  if (industries.length === 0) return null;

  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>法人資金流向（全市場）</span>
        <span style={{ fontSize: 11, color: c.textDim }}>{industries.length} 個產業</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: 6,
      }}>
        {industries.map((g) => {
          const netColor = g.totalNetBuy > 0 ? c.up : g.totalNetBuy < 0 ? c.down : c.textMuted;

          return (
            <div key={g.industry} style={{
              borderLeft: `3px solid ${netColor}`,
              padding: '8px 10px',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{g.industry}</span>
                <span style={{ fontSize: 10, color: c.textDim }}>{g.stockCount} 支</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: c.textMuted }}>合計</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: netColor }}>{fmtNetBuy(g.totalNetBuy)}</span>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 10 }}>
                  <span style={{ color: c.textDim }}>外資 </span>
                  <span style={{ fontWeight: 600, color: g.foreignNetBuy > 0 ? c.up : g.foreignNetBuy < 0 ? c.down : c.textMuted }}>
                    {fmtNetBuy(g.foreignNetBuy)}
                  </span>
                </span>
                <span style={{ fontSize: 10 }}>
                  <span style={{ color: c.textDim }}>投信 </span>
                  <span style={{ fontWeight: 600, color: g.trustNetBuy > 0 ? c.up : g.trustNetBuy < 0 ? c.down : c.textMuted }}>
                    {fmtNetBuy(g.trustNetBuy)}
                  </span>
                </span>
              </div>

              {g.topBuyStock && (
                <span style={{ fontSize: 9, color: c.textDim }}>
                  買超最多 {g.topBuyStock} {g.topBuyStockName}
                </span>
              )}
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
