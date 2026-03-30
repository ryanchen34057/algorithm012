import { useEffect, useState } from 'react';
import { getChart } from '../services/api';
import { StockChartData, ElitePickAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart, { PriceLine } from './StockChart';

interface Props {
  stock: ElitePickAnalysis;
}

const patternLabels: Record<string, string> = {
  cup: '杯型', u_shape: 'U型', n_shape: 'N型', none: '-',
};

export default function ElitePickRow({ stock }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getChart(stock.symbol).then(setChart).catch(() => {}).finally(() => setLoading(false));
  }, [stock.symbol]);

  const code = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const market = stock.market === '上櫃' ? '櫃' : '市';

  const lines: PriceLine[] = [
    { price: stock.entryPrice, color: c.blue, title: `進場 ${stock.entryPrice}` },
    { price: stock.stopLoss, color: '#ef4444', title: `停損 ${stock.stopLoss} (${stock.stopLabel})` },
    { price: stock.target, color: '#22c55e', title: `目標 ${stock.target}` },
    { price: stock.prevHigh, color: '#f59e0b', title: `前高 ${stock.prevHigh}`, lineStyle: 1 },
  ];
  if (stock.ma10 > 0) {
    lines.push({ price: stock.ma10, color: '#a78bfa', title: `MA10 ${stock.ma10}`, lineStyle: 2 });
  }

  const scoreColor = stock.score >= 80 ? c.up : stock.score >= 60 ? '#f59e0b' : c.blue;
  const hasSellSignal = stock.sellSignal !== '';

  return (
    <div style={{
      background: c.bgCard, borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${hasSellSignal ? '#ef444466' : c.border}`,
    }}>
      {/* Sell signal banner */}
      {hasSellSignal && (
        <div style={{
          background: '#7f1d1d', color: '#fca5a5', padding: '6px 20px',
          fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>&#9888;</span>
          出場訊號：{stock.sellLabel}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
            background: market === '櫃' ? '#8b5cf622' : '#3b82f622',
            color: market === '櫃' ? '#8b5cf6' : '#3b82f6',
          }}>{market === '櫃' ? '上櫃' : '上市'}</span>
          <span style={{ fontWeight: 800, fontSize: 20, color: c.text }}>{code}</span>
          <span style={{ color: c.textSecondary, fontSize: 15 }}>{stock.name}</span>
          {stock.conceptTag && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#8b5cf622', color: '#8b5cf6' }}>
              {stock.conceptTag}
            </span>
          )}
          <span style={{ color: c.text, fontSize: 17, fontWeight: 700 }}>{stock.currentPrice}</span>
          <span style={{ color: c.textMuted, fontSize: 12 }}>收盤價</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Pattern badge */}
          {stock.pattern !== 'none' && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
              background: '#a78bfa22', color: '#a78bfa',
            }}>{stock.patternLabel}</span>
          )}
          {/* Score */}
          <div style={{
            background: scoreColor + '18', color: scoreColor,
            borderRadius: 6, padding: '4px 12px', fontWeight: 800, fontSize: 18,
            minWidth: 50, textAlign: 'center',
          }}>{stock.score.toFixed(0)}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Chart */}
        {loading ? (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>載入線圖中...</div>
        ) : chart ? (
          <StockChart chart={chart} priceLines={lines} />
        ) : (
          <div style={{ color: c.textMuted, padding: '40px 0', textAlign: 'center', fontSize: 14 }}>無法載入線圖</div>
        )}

        {/* Key metrics */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Chip label="距前高" value={stock.distPct <= 0 ? '已突破' : `-${stock.distPct}%`}
            color={stock.distPct <= 0 ? c.up : stock.distPct < 5 ? '#f59e0b' : c.textSecondary} />
          <Chip label="5日量/20日量" value={`${(stock.volShrink * 100).toFixed(0)}%`}
            color={stock.volShrink < 0.6 ? c.up : stock.volShrink < 0.8 ? '#f59e0b' : c.textSecondary}
            sub={`${stock.vol5d.toFixed(0)}張 / ${stock.vol20d.toFixed(0)}張`} />
          <Chip label="整理波幅" value={`${stock.rangePct}%`}
            color={stock.rangePct < 5 ? c.up : '#f59e0b'}
            sub={`${stock.rangeLow} ~ ${stock.rangeHigh}`} />
          <Chip label="型態" value={patternLabels[stock.pattern] || '-'}
            color={stock.pattern !== 'none' ? '#a78bfa' : c.textMuted} />
          <Chip label="進場" value={`${stock.entryPrice}`} color={c.blue} />
          <Chip label="停損" value={`${stock.stopLoss}`} color="#ef4444" sub={stock.stopLabel} />
          <Chip label="目標" value={`${stock.target}`} color="#22c55e" sub={stock.targetLabel} />
          <Chip label="風報比" value={stock.rewardRisk > 0 ? `1 : ${stock.rewardRisk}` : '-'}
            color={stock.rewardRisk >= 3 ? c.up : c.blue} />
          <Chip label="建議張數" value={`${stock.suggestLots} 張`} color={c.text} sub="依停損回推" />
        </div>

        {/* MA row */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <MiniTag label="MA10" value={stock.ma10} price={stock.currentPrice} c={c} />
          <MiniTag label="MA20" value={stock.ma20} price={stock.currentPrice} c={c} />
          <MiniTag label="MA60" value={stock.ma60} price={stock.currentPrice} c={c} />
          <MiniTag label="MA120" value={stock.ma120} price={stock.currentPrice} c={c} />
          {stock.ma200 > 0 && <MiniTag label="MA200" value={stock.ma200} price={stock.currentPrice} c={c} />}
        </div>
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

function MiniTag({ label, value, price, c }: { label: string; value: number; price: number; c: ReturnType<typeof useColors> }) {
  const above = price >= value;
  return (
    <span style={{
      fontSize: 11, padding: '2px 6px', borderRadius: 3,
      background: above ? c.up + '15' : c.down + '15',
      color: above ? c.up : c.down,
    }}>
      {label} {value}
    </span>
  );
}
