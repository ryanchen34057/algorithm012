import { useEffect, useState } from 'react';
import { getChart } from '../services/api';
import { StockChartData, MAPullbackAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart, { PriceLine } from './StockChart';

interface Props {
  stock: MAPullbackAnalysis;
}

export default function MAPullbackRow({ stock }: Props) {
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
    { price: stock.dailyMa20, color: '#f59e0b', title: `日MA20 ${stock.dailyMa20}`, lineStyle: 0 },
    { price: stock.dailyMa200, color: '#8b5cf6', title: `日MA200 ${stock.dailyMa200}`, lineStyle: 2 },
    { price: stock.entryPrice, color: c.blue, title: `進場 ${stock.entryPrice}` },
    { price: stock.stopLoss, color: '#ef4444', title: `停損 ${stock.stopLoss}` },
    { price: stock.target, color: '#22c55e', title: `目標 ${stock.target}` },
  ];

  const scoreColor = stock.score >= 80 ? c.up : stock.score >= 60 ? '#f59e0b' : c.blue;

  return (
    <div style={{ background: c.bgCard, borderRadius: 10, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
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

          {/* Timeframe badges */}
          <div style={{ display: 'flex', gap: 4 }}>
            <TFBadge label="日" ok={stock.dailyOk} c={c} />
            <TFBadge label="週" ok={stock.weeklyOk} c={c} />
            <TFBadge label="月" ok={stock.monthlyOk} c={c} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {stock.allOk && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: c.up + '22', color: c.up }}>
              三線合一
            </span>
          )}
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

        {/* Timeframe details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <TFCard label="日線" ok={stock.dailyOk} ma20={stock.dailyMa20} ma200={stock.dailyMa200}
            slope={stock.dailyMa20Slope} dist={stock.dailyDistMa20} close={stock.currentPrice} c={c} />
          <TFCard label="週線" ok={stock.weeklyOk} ma20={stock.weeklyMa20} ma200={stock.weeklyMa200}
            slope={stock.weeklyMa20Slope} dist={stock.weeklyDistMa20} close={stock.weeklyClose} c={c} />
          <TFCard label="月線" ok={stock.monthlyOk} ma20={stock.monthlyMa20} ma200={stock.monthlyMa200}
            slope={stock.monthlyMa20Slope} dist={stock.monthlyDistMa20} close={stock.monthlyClose} c={c} />
        </div>

        {/* Trade plan */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Chip label="進場" value={`${stock.entryPrice}`} color={c.blue} />
          <Chip label="停損" value={`${stock.stopLoss}`} color="#ef4444" sub={stock.stopLabel} />
          <Chip label="目標" value={`${stock.target}`} color="#22c55e" sub={stock.targetLabel} />
          <Chip label="風報比" value={stock.rewardRisk > 0 ? `1 : ${stock.rewardRisk}` : '-'}
            color={stock.rewardRisk >= 3 ? c.up : c.blue} />
          <Chip label="ADV20" value={`${stock.adv20.toLocaleString()} 張`} />
        </div>
      </div>
    </div>
  );
}

function TFBadge({ label, ok, c }: { label: string; ok: boolean; c: ReturnType<typeof useColors> }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
      background: ok ? c.up + '22' : c.down + '15',
      color: ok ? c.up : c.down,
    }}>
      {label}{ok ? '✓' : '✗'}
    </span>
  );
}

function TFCard({ label, ok, ma20, ma200, slope, dist, close, c }: {
  label: string; ok: boolean; ma20: number; ma200: number;
  slope: number; dist: number; close: number;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <div style={{
      background: ok ? c.up + '08' : c.bgInput,
      border: `1px solid ${ok ? c.up + '33' : c.border}`,
      borderRadius: 8, padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: c.text, fontSize: 14 }}>{label}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
          background: ok ? c.up + '22' : c.down + '15',
          color: ok ? c.up : c.down,
        }}>{ok ? '符合' : '未符'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
        <Row label="收盤" value={close} color={c.text} c={c} />
        <Row label="MA20" value={ma20} color="#f59e0b" c={c} />
        {ma200 > 0 && <Row label="MA200" value={ma200} color="#8b5cf6" c={c} />}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: c.textMuted }}>MA20斜率</span>
          <span style={{ fontWeight: 600, color: slope > 0 ? c.up : c.down }}>
            {slope > 0 ? '+' : ''}{slope}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: c.textMuted }}>距MA20</span>
          <span style={{ fontWeight: 600, color: dist >= 0 ? c.up : c.down }}>
            {dist >= 0 ? '+' : ''}{dist}%
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, c }: { label: string; value: number; color: string; c: ReturnType<typeof useColors> }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: c.textMuted }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
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
