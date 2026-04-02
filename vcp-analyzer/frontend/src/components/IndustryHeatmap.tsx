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
      padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: c.text }}>
          法人資金流向（全市場）
        </span>
        <span style={{ fontSize: 12, color: c.textMuted }}>{industries.length} 個產業</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 8,
      }}>
        {industries.map((g) => {
          const netColor = g.totalNetBuy > 0 ? c.up : g.totalNetBuy < 0 ? c.down : c.textMuted;
          const netBg = g.totalNetBuy > 0 ? c.up + '15' : g.totalNetBuy < 0 ? c.down + '15' : c.textMuted + '10';

          return (
            <div key={g.industry} style={{
              background: netBg, borderRadius: 8, padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{g.industry}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: c.bgCard, color: c.textSecondary,
                }}>{g.stockCount} 支</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: c.textMuted }}>法人合計</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: netColor }}>
                  {fmtNetBuy(g.totalNetBuy)} 張
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: c.textMuted }}>外資</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: g.foreignNetBuy > 0 ? c.up : g.foreignNetBuy < 0 ? c.down : c.textMuted }}>
                  {fmtNetBuy(g.foreignNetBuy)} 張
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: c.textMuted }}>投信</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: g.trustNetBuy > 0 ? c.up : g.trustNetBuy < 0 ? c.down : c.textMuted }}>
                  {fmtNetBuy(g.trustNetBuy)} 張
                </span>
              </div>

              {g.topBuyStock && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: c.textMuted }}>買超最多</span>
                  <span style={{ fontSize: 11, color: c.textSecondary }}>
                    {g.topBuyStock} {g.topBuyStockName} ({fmtNetBuy(g.topBuyAmount)})
                  </span>
                </div>
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
