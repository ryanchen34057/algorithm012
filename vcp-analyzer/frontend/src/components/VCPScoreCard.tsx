import { VCPAnalysis } from '../types';

interface Props {
  vcp: VCPAnalysis;
}

export default function VCPScoreCard({ vcp }: Props) {
  const scoreColor =
    vcp.score >= 80 ? '#22c55e' : vcp.score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <span style={styles.symbol}>{vcp.symbol}</span>
          <span style={styles.name}>{vcp.name}</span>
        </div>
        <div style={{ ...styles.score, color: scoreColor }}>
          {vcp.score.toFixed(0)}
          <span style={styles.scoreLabel}> / 100</span>
        </div>
      </div>

      {/* Contraction visualizer */}
      <div style={styles.contractions}>
        {(vcp.contractions ?? []).map((c) => (
          <div key={c.index} style={styles.contraction}>
            <div style={styles.contrLabel}>C{c.index}</div>
            <div
              style={{
                ...styles.contrBar,
                width: `${Math.min(c.depth * 3, 100)}%`,
                background: scoreColor,
              }}
            />
            <div style={styles.contrDepth}>{c.depth.toFixed(1)}%</div>
          </div>
        ))}
      </div>

      <div style={styles.grid}>
        <Stat label="現價" value={`$${vcp.currentPrice}`} />
        <Stat label="進場點" value={`$${vcp.entryPrice}`} highlight />
        <Stat label="停損點" value={`$${vcp.stopLoss}`} danger />
        <Stat label="目標價" value={`$${vcp.target}`} />
        <Stat label="Pivot" value={`$${vcp.pivotPrice}`} />
        <Stat label="Stage 2" value={vcp.stage2 ? '✓' : '✗'} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  const color = highlight ? '#3b82f6' : danger ? '#ef4444' : '#e5e7eb';
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#1e293b',
    borderRadius: 8,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symbol: {
    fontWeight: 700,
    fontSize: 18,
    color: '#f1f5f9',
    marginRight: 8,
  },
  name: {
    color: '#94a3b8',
    fontSize: 14,
  },
  score: {
    fontSize: 28,
    fontWeight: 800,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: 400,
    color: '#94a3b8',
  },
  contractions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  contraction: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  contrLabel: {
    color: '#94a3b8',
    fontSize: 12,
    width: 24,
    flexShrink: 0,
  },
  contrBar: {
    height: 8,
    borderRadius: 4,
    minWidth: 4,
    flexGrow: 0,
    transition: 'width 0.4s ease',
  },
  contrDepth: {
    color: '#cbd5e1',
    fontSize: 12,
    marginLeft: 4,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px 16px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statLabel: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statValue: {
    fontWeight: 600,
    fontSize: 14,
  },
};
