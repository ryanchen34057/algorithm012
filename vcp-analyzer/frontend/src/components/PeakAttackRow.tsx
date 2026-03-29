import { useEffect, useState } from 'react';
import { getChart } from '../services/api';
import { StockChartData, PeakAttackAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart, { PriceLine } from './StockChart';

interface Props {
  stock: PeakAttackAnalysis;
}

export default function PeakAttackRow({ stock }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    getChart(stock.symbol).then(setChart).catch(() => {}).finally(() => setLoading(false));
  }, [stock.symbol]);

  const code = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const market = stock.symbol.endsWith('.TWO') ? '櫃' : '市';
  const isBreaking = stock.distPct <= 0;

  // Price lines
  const lines: PriceLine[] = [
    { price: stock.entryPrice, color: c.blue, title: `進場 ${stock.entryPrice}` },
    { price: stock.stopLoss, color: c.red, title: `停損 ${stock.stopLoss}` },
    { price: stock.target, color: c.green, title: `目標 ${stock.target}` },
    { price: stock.peakHigh, color: '#f59e0b', title: `攻頂高 ${stock.peakHigh}`, lineStyle: 1 },
    { price: stock.peakLow, color: '#f59e0b', title: `攻頂低 ${stock.peakLow}`, lineStyle: 1 },
  ];

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
          <span style={{ color: c.text, fontSize: 17, fontWeight: 700 }}>{stock.currentPrice}</span>
          <span style={{ color: c.textMuted, fontSize: 12 }}>收盤價</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Breakout status */}
          <span style={{
            background: (isBreaking ? c.up : '#f59e0b') + '22',
            color: isBreaking ? c.up : '#f59e0b',
            borderRadius: 4, padding: '3px 10px', fontSize: 13, fontWeight: 700,
          }}>
            {isBreaking ? '已突破' : `距攻頂 ${stock.distPct}%`}
          </span>
          {/* Attack count */}
          <span style={{
            background: c.blue + '18', color: c.blue,
            borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 600,
          }}>
            攻頂 {stock.attackCount} 次
          </span>
          {/* Range tightness */}
          <span style={{
            background: (stock.peakRangePct <= 2 ? c.up : c.yellow) + '18',
            color: stock.peakRangePct <= 2 ? c.up : c.yellow,
            borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
          }}>
            區間 {stock.peakRangePct}%
          </span>
          {/* Score */}
          <div style={{
            background: (stock.score >= 70 ? c.up : stock.score >= 50 ? c.yellow : c.down) + '18',
            color: stock.score >= 70 ? c.up : stock.score >= 50 ? c.yellow : c.down,
            borderRadius: 6, padding: '4px 12px', fontWeight: 800, fontSize: 18,
            minWidth: 50, textAlign: 'center',
          }}>
            {stock.score.toFixed(0)}
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
          <Chip label="攻頂高點" value={`${stock.peakHigh}`} color="#f59e0b" />
          <Chip label="攻頂低點" value={`${stock.peakLow}`} color="#f59e0b" />
          <Chip label="區間寬度" value={`${stock.peakRangePct}%`} color={stock.peakRangePct <= 2 ? c.up : c.yellow} />
          <Chip label="攻頂次數" value={`${stock.attackCount} 次`} color={c.blue} />
          <Chip label="進場點" value={`${stock.entryPrice}`} color={c.blue} />
          <Chip label="停損點" value={`${stock.stopLoss}`} color={c.red} />
          <Chip label="目標價" value={`${stock.target}`} color={c.green} sub={stock.targetLabel} />
          <Chip label="風報比" value={stock.rewardRisk > 0 ? `1 : ${stock.rewardRisk}` : '-'} color={stock.rewardRisk >= 3 ? c.up : c.blue} />
          <Chip label="量能比" value={`${stock.volRatio}x`} color={stock.volRatio >= 2 ? c.up : c.textSecondary} sub={`${stock.todayVolLots.toLocaleString()} 張`} />
        </div>

        {/* Expanded details */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* KD + MA */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <Chip label="K" value={`${stock.k}`} color={stock.k > stock.d ? c.up : c.down} />
              <Chip label="D" value={`${stock.d}`} />
              <Chip label="K > D" value={stock.k > stock.d ? '是（多方）' : '否'} color={stock.k > stock.d ? c.up : c.textMuted} />
              <Chip label="MA20" value={`${stock.ma20}`} />
              <Chip label="MA50" value={`${stock.ma50}`} />
              <Chip label="MA200" value={`${stock.ma200}`} />
              <Chip label="ADV20" value={`${stock.adv20.toLocaleString()} 張`} />
            </div>

            {/* Attack peaks visualization */}
            <div style={{ background: c.bgInput, borderRadius: 6, padding: '12px 16px' }}>
              <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>攻頂戰果（最近 → 最舊）</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {stock.attackPeaks.map((p, i) => (
                  <div key={i} style={{
                    background: '#f59e0b22', border: '1px solid #f59e0b44',
                    borderRadius: 4, padding: '4px 10px', fontSize: 14, fontWeight: 600, color: '#f59e0b',
                  }}>
                    #{i + 1}: {p}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, color: c.textMuted, fontSize: 12 }}>
                高點 {stock.peakHigh} ↔ 低點 {stock.peakLow}，區間 {stock.peakRangePct}%
                {stock.peakRangePct <= 2 && ' ← 非常緊密！'}
              </div>
            </div>
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
