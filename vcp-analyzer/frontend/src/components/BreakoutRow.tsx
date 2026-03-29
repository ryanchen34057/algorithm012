import { useEffect, useState } from 'react';
import { getChart } from '../services/api';
import { StockChartData, BreakoutAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart from './StockChart';

interface Props {
  stock: BreakoutAnalysis;
}

export default function BreakoutRow({ stock }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    getChart(stock.symbol)
      .then(setChart)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [stock.symbol]);

  const code = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const patternColor = stock.pattern === 'w_bottom' ? '#a78bfa' : stock.pattern === 'v_bottom' ? '#22d3ee' : c.textMuted;

  return (
    <div style={{ background: c.bgCard, borderRadius: 10, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 20, color: c.text }}>{code}</span>
          <span style={{ color: c.textSecondary, fontSize: 15 }}>{stock.name}</span>
          <span style={{ color: c.text, fontSize: 17, fontWeight: 700 }}>{stock.currentPrice}</span>
          <span style={{ color: c.textMuted, fontSize: 12 }}>收盤價</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Pattern badge */}
          <span style={{
            background: patternColor + '22', color: patternColor,
            borderRadius: 4, padding: '3px 10px', fontSize: 13, fontWeight: 700,
          }}>
            {stock.patternLabel}
          </span>
          {/* Distance to high */}
          <span style={{
            background: c.up + '18', color: c.up,
            borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 600,
          }}>
            距前高 {stock.distPct.toFixed(1)}%
          </span>
          {/* MA aligned badge */}
          {stock.maAligned && (
            <span style={{
              background: c.up + '18', color: c.up,
              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
            }}>
              均線多頭排列
            </span>
          )}
          {/* Score */}
          <div style={{
            background: (stock.score >= 70 ? c.up : stock.score >= 50 ? c.yellow : c.down) + '18',
            color: stock.score >= 70 ? c.up : stock.score >= 50 ? c.yellow : c.down,
            borderRadius: 6, padding: '4px 12px', fontWeight: 800, fontSize: 18,
            minWidth: 50, textAlign: 'center',
          }}>
            {stock.score.toFixed(0)}
          </div>
          <span style={{ color: c.textMuted, fontSize: 16, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Chart */}
        {loading ? (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>載入線圖中...</div>
        ) : chart ? (
          <StockChart chart={chart} />
        ) : (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>無法載入線圖</div>
        )}

        {/* Info chips */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label="前高" value={`${stock.prevHigh}`} color={c.up} sub={stock.prevHighDate} />
          <Chip label="距前高" value={`${stock.distPct}%`} color={c.up} />
          <Chip label="型態" value={stock.patternLabel} color={patternColor} />
          <Chip label="進場點" value={`${stock.entryPrice}`} color={c.blue} />
          <Chip label="停損點" value={`${stock.stopLoss}`} color={c.red} />
          <Chip label="目標價" value={`${stock.target}`} color={c.green} sub={stock.targetLabel} />
          <Chip label="風報比" value={stock.rewardRisk > 0 ? `1 : ${stock.rewardRisk}` : '-'} color={stock.rewardRisk >= 3 ? c.up : c.blue} />
          <Chip label="量能比" value={`${stock.recentVolRatio}x`} color={stock.recentVolRatio >= 1.2 ? c.up : stock.recentVolRatio <= 0.8 ? c.down : c.textSecondary} sub={stock.recentVolRatio >= 1.2 ? '量增' : stock.recentVolRatio <= 0.8 ? '量縮' : '正常'} />
          <Chip label="ADV20" value={`${stock.adv20.toLocaleString()} 張`} />
        </div>

        {/* Expanded details */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* MA info */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <Chip label="MA20" value={`${stock.ma20}`} />
              <Chip label="MA50" value={`${stock.ma50}`} />
              <Chip label="MA150" value={`${stock.ma150}`} />
              <Chip label="MA200" value={`${stock.ma200}`} />
              <Chip label="均線排列" value={stock.maAligned ? '多頭排列 ✓' : '未完全排列'} color={stock.maAligned ? c.up : c.textMuted} />
            </div>

            {/* Pattern details */}
            {stock.pattern === 'w_bottom' && (
              <div style={{ background: c.bgInput, borderRadius: 6, padding: '12px 16px' }}>
                <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>W底（雙底）詳情</div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <Chip label="第一低點" value={`${stock.low1}`} sub={stock.low1Date} />
                  <Chip label="第二低點" value={`${stock.low2}`} sub={stock.low2Date} />
                  <Chip label="頸線" value={`${stock.neckline}`} color={c.yellow} />
                </div>
              </div>
            )}
            {stock.pattern === 'v_bottom' && (
              <div style={{ background: c.bgInput, borderRadius: 6, padding: '12px 16px' }}>
                <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>V型反轉詳情</div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <Chip label="V底最低" value={`${stock.vLow}`} sub={stock.vLowDate} />
                  <Chip label="跌幅" value={`${stock.dropPct}%`} color={c.down} />
                  <Chip label="反彈幅度" value={`${stock.bouncePct}%`} color={c.up} />
                </div>
              </div>
            )}

            {/* Detail table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['項目', '數值'].map((h) => (
                    <th key={h} style={{ background: c.bgInput, color: c.textMuted, fontSize: 11, textTransform: 'uppercase' as const, padding: '8px 12px', textAlign: 'left' as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['前高價位', `${stock.prevHigh} (${stock.prevHighDate})`],
                  ['距離前高', `${stock.distPct}%`],
                  ['當日成交量', `${(stock.todayVolume / 1000).toLocaleString()} 張`],
                  ['20日均量', `${stock.adv20.toLocaleString()} 張`],
                  ['近5日量 / ADV20', `${stock.recentVolRatio}x`],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td style={{ padding: '8px 12px', color: c.textMuted, fontSize: 13 }}>{label}</td>
                    <td style={{ padding: '8px 12px', color: c.textSecondary, fontSize: 13 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: c.textMuted, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 15, color: color ?? c.text }}>{value}</span>
      {sub && <span style={{ color: c.textMuted, fontSize: 10 }}>{sub}</span>}
    </div>
  );
}
