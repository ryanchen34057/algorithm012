import { useColors } from './ThemeContext';
import { GapAnalysis } from '../types';

interface Props {
  gap: GapAnalysis;
}

export default function GapInfoCard({ gap }: Props) {
  const c = useColors();
  const isLong = gap.direction === 'long';
  const dirColor = isLong ? c.green : c.red;
  const scoreColor = gap.score >= 70 ? c.green : gap.score >= 50 ? c.yellow : c.red;

  const code = gap.symbol.replace(/\.(TW|TWO)$/, '');

  return (
    <div style={{ background: c.bgCard, borderRadius: 8, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${c.border}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: c.text }}>{code}</span>
          <span style={{ color: c.textSecondary, fontSize: 14 }}>{gap.name}</span>
          <span style={{
            background: dirColor + '22', color: dirColor,
            borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700,
          }}>
            {isLong ? 'Gap Up' : 'Gap Down'}
          </span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>
          {gap.score.toFixed(0)}
          <span style={{ fontSize: 14, fontWeight: 400, color: c.textSecondary }}> / 100</span>
        </div>
      </div>

      {/* Gap visual bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: c.textSecondary, fontSize: 12 }}>跳空幅度</span>
        <div style={{
          height: 10,
          borderRadius: 5,
          minWidth: 8,
          width: `${Math.min(Math.abs(gap.gapPercent) * 5, 100)}%`,
          background: dirColor,
          transition: 'width 0.4s ease',
        }} />
        <span style={{ color: dirColor, fontSize: 14, fontWeight: 700 }}>
          {gap.gapPercent > 0 ? '+' : ''}{gap.gapPercent.toFixed(1)}%
        </span>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 16px' }}>
        <Stat label="現價" value={`$${gap.currentPrice}`} />
        <Stat label="進場點" value={`$${gap.entryPrice}`} color={c.blue} />
        <Stat label="停損點" value={`$${gap.stopLoss}`} color={c.red} />
        <Stat label="目標價" value={`$${gap.target}`} color={c.green} />
        <Stat label="MA20" value={`$${gap.ma20}`} />
        <Stat label="MA200" value={`$${gap.ma200}`} />
        <Stat label="ADV20" value={`${gap.adv20.toLocaleString()}張`} />
        <Stat label="當日量" value={`${(gap.todayVolume / 1000).toLocaleString()}張`} />
        <Stat label="方向" value={isLong ? '做多' : '做空'} color={dirColor} />
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
