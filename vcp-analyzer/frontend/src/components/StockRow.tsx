import { useEffect, useState } from 'react';
import { getChart } from '../services/api';
import { StockChartData, GapAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart from './StockChart';
import RiskCalculator from './RiskCalculator';

interface Props {
  gap: GapAnalysis;
}

export default function StockRow({ gap }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    getChart(gap.symbol)
      .then(setChart)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gap.symbol]);

  const code = gap.symbol.replace(/\.(TW|TWO)$/, '');
  const isLong = gap.direction === 'long';
  const dirColor = isLong ? c.up : c.down;
  const dirLabel = isLong ? 'Gap Up' : 'Gap Down';
  const dirChinese = isLong ? '做多' : '做空';

  return (
    <div style={{ background: c.bgCard, borderRadius: 10, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 20, color: c.text }}>{code}</span>
          <span style={{ color: c.textSecondary, fontSize: 15 }}>{gap.name}</span>
          <span style={{ color: c.textMuted, fontSize: 13 }}>
            ${gap.currentPrice}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Direction badge */}
          <span style={{
            background: dirColor + '22',
            color: dirColor,
            borderRadius: 4,
            padding: '3px 10px',
            fontSize: 13,
            fontWeight: 700,
          }}>
            {dirLabel} {dirChinese}
          </span>
          {/* Gap percent */}
          <span style={{
            background: dirColor + '18',
            color: dirColor,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 13,
            fontWeight: 600,
          }}>
            {gap.gapPercent > 0 ? '+' : ''}{gap.gapPercent.toFixed(1)}%
          </span>
          {/* Score badge */}
          <div style={{
            background: (gap.score >= 70 ? c.up : gap.score >= 50 ? c.yellow : c.down) + '18',
            color: gap.score >= 70 ? c.up : gap.score >= 50 ? c.yellow : c.down,
            borderRadius: 6,
            padding: '4px 12px',
            fontWeight: 800,
            fontSize: 18,
            minWidth: 50,
            textAlign: 'center',
          }}>
            {gap.score.toFixed(0)}
          </div>
          {/* Expand arrow */}
          <span style={{ color: c.textMuted, fontSize: 16, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Chart + details */}
      <div style={{
        padding: '0 20px 20px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* K-line chart */}
        {loading ? (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>
            載入線圖中...
          </div>
        ) : chart ? (
          <StockChart chart={chart} gap={gap} />
        ) : (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>
            無法載入線圖
          </div>
        )}

        {/* Trade info bar */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <InfoChip label="方向" value={`${dirLabel} ${dirChinese}`} color={dirColor} />
          <InfoChip label="跳空幅度" value={`${gap.gapPercent > 0 ? '+' : ''}${gap.gapPercent}%`} color={dirColor} />
          <InfoChip label="進場點" value={`$${gap.entryPrice}`} color={c.blue} />
          <InfoChip label="停損點" value={`$${gap.stopLoss}`} color={c.red} />
          <InfoChip label="目標價" value={`$${gap.target}`} color={c.green} />
          <InfoChip label="ADV20" value={`${gap.adv20.toLocaleString()} 張`} />
          <InfoChip label="MA20" value={`$${gap.ma20}`} />
          <InfoChip label="MA200" value={`$${gap.ma200}`} />
        </div>

        {/* Expandable: risk calculator + gap details */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <RiskCalculator gap={gap} />

            {/* Gap detail table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['項目', '數值'].map((h) => (
                    <th key={h} style={{
                      background: c.bgInput, color: c.textMuted, fontSize: 11,
                      textTransform: 'uppercase', padding: '8px 12px', textAlign: 'left',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <DetailRow label="昨日開盤" value={`$${gap.yesterdayOpen}`} c={c} />
                <DetailRow label="昨日收盤" value={`$${gap.yesterdayClose}`} c={c} />
                <DetailRow label="昨日最高" value={`$${gap.yesterdayHigh}`} c={c} />
                <DetailRow label="昨日最低" value={`$${gap.yesterdayLow}`} c={c} />
                <DetailRow label="今日開盤" value={`$${gap.todayOpen}`} c={c} />
                <DetailRow label="今日收盤" value={`$${gap.todayClose}`} c={c} />
                <DetailRow label="跳空幅度" value={`${gap.gapPercent > 0 ? '+' : ''}${gap.gapPercent}%`} c={c} highlight={dirColor} />
                <DetailRow label="當日成交量" value={`${(gap.todayVolume / 1000).toLocaleString()} 張`} c={c} />
                <DetailRow label="20日均量" value={`${gap.adv20.toLocaleString()} 張`} c={c} />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, c, highlight }: {
  label: string; value: string;
  c: ReturnType<typeof useColors>;
  highlight?: string;
}) {
  return (
    <tr style={{ borderBottom: `1px solid ${c.border}` }}>
      <td style={{ padding: '8px 12px', color: c.textMuted, fontSize: 13 }}>{label}</td>
      <td style={{ padding: '8px 12px', color: highlight ?? c.textSecondary, fontSize: 13, fontWeight: highlight ? 700 : 400 }}>{value}</td>
    </tr>
  );
}

function InfoChip({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: c.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 15, color: color ?? c.text }}>{value}</span>
    </div>
  );
}
