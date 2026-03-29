import { useEffect, useState } from 'react';
import { getChart } from '../services/api';
import { StockChartData, SuperPerfAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart, { PriceLine } from './StockChart';

interface Props {
  stock: SuperPerfAnalysis;
}

export default function SuperPerfRow({ stock }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    getChart(stock.symbol).then(setChart).catch(() => {}).finally(() => setLoading(false));
  }, [stock.symbol]);

  const code = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const market = stock.market === '上櫃' ? '櫃' : '市';

  const lines: PriceLine[] = [
    { price: stock.entryPrice, color: c.blue, title: `進場 ${stock.entryPrice}` },
    { price: stock.stopLoss, color: c.red, title: `停損 ${stock.stopLoss}` },
    { price: stock.target, color: c.green, title: `目標 ${stock.target}` },
    { price: stock.pivotPrice, color: '#f59e0b', title: `樞紐 ${stock.pivotPrice}`, lineStyle: 1 },
  ];

  const scoreColor = stock.vcpScore >= 70 ? c.up : stock.vcpScore >= 50 ? '#f59e0b' : stock.vcpScore >= 30 ? c.blue : c.textMuted;

  return (
    <div style={{ background: c.bgCard, borderRadius: 10, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
            background: market === '櫃' ? '#8b5cf622' : '#3b82f622',
            color: market === '櫃' ? '#8b5cf6' : '#3b82f6',
          }}>{market === '櫃' ? '上櫃' : '上市'}</span>
          <span style={{ fontWeight: 800, fontSize: 20, color: c.text }}>{code}</span>
          <span style={{ color: c.textSecondary, fontSize: 15 }}>{stock.name}</span>
          {stock.conceptTag && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
              background: '#8b5cf622', color: '#8b5cf6',
            }}>{stock.conceptTag}</span>
          )}
          {stock.industry && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
              background: c.bgInput, color: c.textMuted,
            }}>{stock.industry}</span>
          )}
          <span style={{ color: c.text, fontSize: 17, fontWeight: 700 }}>{stock.currentPrice}</span>
          <span style={{ color: c.textMuted, fontSize: 12 }}>收盤價</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Gains */}
          <GainBadge label="1M" value={stock.gain1m} c={c} />
          <GainBadge label="3M" value={stock.gain3m} c={c} />
          <GainBadge label="6M" value={stock.gain6m} c={c} />
          <GainBadge label="YTD" value={stock.gainYtd} c={c} />
          {/* VCP Score */}
          <div style={{
            background: scoreColor + '18',
            color: scoreColor,
            borderRadius: 6, padding: '4px 12px', fontWeight: 800, fontSize: 18,
            minWidth: 50, textAlign: 'center',
          }}>
            {stock.vcpScore.toFixed(0)}
          </div>
          <span style={{ color: c.textMuted, fontSize: 16, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Chart */}
        {loading ? (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>載入線圖中...</div>
        ) : chart ? (
          <StockChart chart={chart} priceLines={lines} />
        ) : (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>無法載入線圖</div>
        )}

        {/* Info chips */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label="VCP 總分" value={`${stock.vcpScore}`} color={scoreColor} />
          <Chip label="進場點" value={`${stock.entryPrice}`} color={c.blue} />
          <Chip label="停損點" value={`${stock.stopLoss}`} color={c.red} />
          <Chip label="目標價" value={`${stock.target}`} color={c.green} sub={stock.targetLabel} />
          <Chip label="風報比" value={stock.rewardRisk > 0 ? `1 : ${stock.rewardRisk}` : '-'} color={stock.rewardRisk >= 3 ? c.up : c.blue} />
          <Chip label="樞紐點" value={`${stock.pivotPrice}`} color="#f59e0b" />
          <Chip label="ADV20" value={`${stock.adv20.toLocaleString()} 張`} />
        </div>

        {/* Expanded: VCP score breakdown + MA/52w details */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* VCP Score Breakdown */}
            <div style={{ background: c.bgInput, borderRadius: 6, padding: '12px 16px' }}>
              <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 10 }}>VCP 評分細項</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <ScoreBar label="趨勢 (20)" value={stock.trendScore} max={20} c={c} />
                <ScoreBar label="波動收縮 (30)" value={stock.contractionScore} max={30} c={c} />
                <ScoreBar label="量縮 (20)" value={stock.volDryUpScore} max={20} c={c} />
                <ScoreBar label="接近樞紐 (15)" value={stock.pivotScore} max={15} c={c} />
                <ScoreBar label="相對強度 (15)" value={stock.rsScore} max={15} c={c} />
              </div>
            </div>

            {/* MA + 52w */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <Chip label="MA50" value={`${stock.ma50}`} />
              <Chip label="MA150" value={`${stock.ma150}`} />
              <Chip label="MA200" value={`${stock.ma200}`} />
              <Chip label="52W High" value={`${stock.high52w}`} color={c.up} />
              <Chip label="52W Low" value={`${stock.low52w}`} color={c.down} />
            </div>

            {/* Gains detail */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <Chip label="近1月漲幅" value={`${stock.gain1m >= 0 ? '+' : ''}${stock.gain1m}%`} color={stock.gain1m >= 0 ? c.up : c.down} />
              <Chip label="近3月漲幅" value={`${stock.gain3m >= 0 ? '+' : ''}${stock.gain3m}%`} color={stock.gain3m >= 0 ? c.up : c.down} />
              <Chip label="近6月漲幅" value={`${stock.gain6m >= 0 ? '+' : ''}${stock.gain6m}%`} color={stock.gain6m >= 0 ? c.up : c.down} />
              <Chip label="今年至今" value={`${stock.gainYtd >= 0 ? '+' : ''}${stock.gainYtd}%`} color={stock.gainYtd >= 0 ? c.up : c.down} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GainBadge({ label, value, c }: { label: string; value: number; c: ReturnType<typeof useColors> }) {
  const color = value >= 0 ? c.up : c.down;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: 9, color: c.textMuted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>
        {value >= 0 ? '+' : ''}{value}%
      </span>
    </div>
  );
}

function ScoreBar({ label, value, max, c }: { label: string; value: number; max: number; c: ReturnType<typeof useColors> }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const barColor = pct >= 80 ? c.up : pct >= 50 ? '#f59e0b' : c.blue;
  return (
    <div style={{ flex: '1 1 120px', minWidth: 120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: c.textMuted }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: c.border }}>
        <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${pct}%`, transition: 'width 0.3s' }} />
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
