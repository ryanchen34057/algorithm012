import { useEffect, useState } from 'react';
import { getChart } from '../services/api';
import { StockChartData, VCPAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart from './StockChart';
import RiskCalculator from './RiskCalculator';

interface Props {
  vcp: VCPAnalysis;
}

export default function StockRow({ vcp }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    getChart(vcp.symbol)
      .then(setChart)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [vcp.symbol]);

  const code = vcp.symbol.replace(/\.(TW|TWO)$/, '');
  const scoreColor = vcp.score >= 80 ? c.green : vcp.score >= 60 ? c.yellow : c.red;

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
          <span style={{ color: c.textSecondary, fontSize: 15 }}>{vcp.name}</span>
          <span style={{ color: c.textMuted, fontSize: 13 }}>
            ${vcp.currentPrice}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Contraction summary */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {(vcp.contractions ?? []).map((con) => (
              <span key={con.index} style={{
                background: scoreColor + '22',
                color: scoreColor,
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 11,
                fontWeight: 600,
              }}>
                {con.depth.toFixed(1)}%
              </span>
            ))}
          </div>
          {/* Score badge */}
          <div style={{
            background: scoreColor + '18',
            color: scoreColor,
            borderRadius: 6,
            padding: '4px 12px',
            fontWeight: 800,
            fontSize: 18,
            minWidth: 50,
            textAlign: 'center',
          }}>
            {vcp.score.toFixed(0)}
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
          <StockChart chart={chart} vcp={vcp} />
        ) : (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>
            無法載入線圖
          </div>
        )}

        {/* Trade info bar */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <InfoChip label="進場點" value={`$${vcp.entryPrice}`} color={c.blue} />
          <InfoChip label="停損點" value={`$${vcp.stopLoss}`} color={c.red} />
          <InfoChip label="目標價" value={`$${vcp.target}`} color={c.green} />
          <InfoChip label="Pivot" value={`$${vcp.pivotPrice}`} />
          <InfoChip label="Stage 2" value={vcp.stage2 ? 'Yes' : 'No'} />
        </div>

        {/* Expandable: risk calculator + contraction table */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <RiskCalculator vcp={vcp} />

            {/* Contraction table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['收縮', '高點日期', '高點價格', '低點日期', '低點價格', '回檔幅度', '期間均量'].map((h) => (
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
                {(vcp.contractions ?? []).map((con) => (
                  <tr key={con.index} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td style={tdStyle(c)}>C{con.index}</td>
                    <td style={tdStyle(c)}>{con.highDate}</td>
                    <td style={tdStyle(c)}>${con.highPrice}</td>
                    <td style={tdStyle(c)}>{con.lowDate}</td>
                    <td style={tdStyle(c)}>${con.lowPrice}</td>
                    <td style={{
                      ...tdStyle(c), fontWeight: 700,
                      color: con.depth <= 6 ? c.green : con.depth <= 12 ? c.yellow : c.red,
                    }}>
                      {con.depth.toFixed(1)}%
                    </td>
                    <td style={tdStyle(c)}>{con.avgVolume.toLocaleString()}</td>
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

function InfoChip({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: c.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 15, color: color ?? c.text }}>{value}</span>
    </div>
  );
}

function tdStyle(c: ReturnType<typeof useColors>): React.CSSProperties {
  return { padding: '8px 12px', color: c.textSecondary, fontSize: 13 };
}
