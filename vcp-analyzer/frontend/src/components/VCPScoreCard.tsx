import { useColors } from './ThemeContext';
import { VCPAnalysis } from '../types';

interface Props {
  vcp: VCPAnalysis;
}

export default function VCPScoreCard({ vcp }: Props) {
  const c = useColors();
  const scoreColor =
    vcp.score >= 80 ? c.green : vcp.score >= 60 ? c.yellow : c.red;

  // Display: "2330.TW" → code "2330", show name beside it
  const code = vcp.symbol.replace(/\.(TW|TWO)$/, '');

  return (
    <div style={{ background: c.bgCard, borderRadius: 8, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${c.border}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 18, color: c.text, marginRight: 8 }}>{code}</span>
          <span style={{ color: c.textSecondary, fontSize: 14 }}>{vcp.name}</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>
          {vcp.score.toFixed(0)}
          <span style={{ fontSize: 14, fontWeight: 400, color: c.textSecondary }}> / 100</span>
        </div>
      </div>

      {/* Contraction bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(vcp.contractions ?? []).map((con) => (
          <div key={con.index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: c.textSecondary, fontSize: 12, width: 24, flexShrink: 0 }}>C{con.index}</div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                minWidth: 4,
                width: `${Math.min(con.depth * 3, 100)}%`,
                background: scoreColor,
                transition: 'width 0.4s ease',
              }}
            />
            <div style={{ color: c.textSecondary, fontSize: 12, marginLeft: 4 }}>{con.depth.toFixed(1)}%</div>
          </div>
        ))}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 16px' }}>
        <Stat label="現價" value={`$${vcp.currentPrice}`} />
        <Stat label="進場點" value={`$${vcp.entryPrice}`} color={c.blue} />
        <Stat label="停損點" value={`$${vcp.stopLoss}`} color={c.red} />
        <Stat label="目標價" value={`$${vcp.target}`} color={c.green} />
        <Stat label="Pivot" value={`$${vcp.pivotPrice}`} />
        <Stat label="Stage 2" value={vcp.stage2 ? 'Yes' : 'No'} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = useColors();
  return (
    <div>
      <div style={{ color: c.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: color ?? c.text }}>{value}</div>
    </div>
  );
}
