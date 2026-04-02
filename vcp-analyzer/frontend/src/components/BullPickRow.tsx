import { useEffect, useState } from 'react';
import { getChart, ChartInterval } from '../services/api';
import { StockChartData, BullPickAnalysis } from '../types';
import { useColors } from './ThemeContext';
import StockChart, { PriceLine } from './StockChart';

interface Props {
  stock: BullPickAnalysis;
}

const TABS: { key: ChartInterval; label: string }[] = [
  { key: '1d', label: '日' },
  { key: '1wk', label: '週' },
  { key: '1mo', label: '月' },
];

export default function BullPickRow({ stock }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<ChartInterval>('1d');

  useEffect(() => {
    setLoading(true);
    setChart(null);
    getChart(stock.symbol, interval).then(setChart).catch(() => {}).finally(() => setLoading(false));
  }, [stock.symbol, interval]);

  const code = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const market = stock.market === '上櫃' ? '櫃' : '市';

  const lines: PriceLine[] = [
    { price: stock.entryPrice, color: c.blue, title: `進場 ${stock.entryPrice}` },
    { price: stock.stopLoss, color: '#ef4444', title: `停損 ${stock.stopLoss} (${stock.stopLabel})` },
    { price: stock.target, color: '#22c55e', title: `目標 ${stock.target}` },
    { price: stock.allTimeHigh, color: '#f59e0b', title: `歷史高 ${stock.allTimeHigh}`, lineStyle: 1 },
  ];

  const scoreColor = stock.score >= 80 ? c.up : stock.score >= 60 ? '#f59e0b' : c.blue;

  return (
    <div style={{
      background: c.bgCard, borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${c.border}`,
    }}>
      {/* Header - responsive */}
      <div style={{ padding: '12px 16px' }}>
        {/* Top line: code + name + score */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 3, flexShrink: 0,
              background: market === '櫃' ? '#8b5cf622' : '#3b82f622',
              color: market === '櫃' ? '#8b5cf6' : '#3b82f6',
            }}>{market === '櫃' ? '上櫃' : '上市'}</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: c.text, letterSpacing: '0.02em' }}>{code}</span>
            <span style={{ color: c.textSecondary, fontSize: 14 }}>{stock.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {stock.pattern !== 'none' && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                background: '#a78bfa22', color: '#a78bfa',
              }}>{stock.patternLabel}</span>
            )}
            {stock.maAligned && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                background: c.up + '18', color: c.up,
              }}>多頭排列</span>
            )}
            <div style={{
              background: scoreColor + '18', color: scoreColor,
              borderRadius: 6, padding: '3px 10px', fontWeight: 800, fontSize: 16,
              minWidth: 42, textAlign: 'center',
            }}>{stock.score.toFixed(0)}</div>
          </div>
        </div>

        {/* Second line: price + change + tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em',
            color: stock.changePct > 0 ? c.up : stock.changePct < 0 ? c.down : c.text,
          }}>{stock.currentPrice}</span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            padding: '2px 6px', borderRadius: 4,
            background: stock.changePct > 0 ? c.up + '18' : stock.changePct < 0 ? c.down + '18' : c.textMuted + '18',
            color: stock.changePct > 0 ? c.up : stock.changePct < 0 ? c.down : c.textMuted,
          }}>
            {stock.changePct > 0 ? '+' : ''}{stock.changePct}%
          </span>
          {stock.industry && (
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, background: c.blue + '15', color: c.blue }}>
              {stock.industry}
            </span>
          )}
          {stock.conceptTag && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: '#8b5cf622', color: '#8b5cf6' }}>
              {stock.conceptTag}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Chart Timeframe Tabs */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${c.border}`, alignSelf: 'flex-start' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setInterval(tab.key)}
              style={{
                padding: '6px 18px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: interval === tab.key ? c.blue : 'transparent',
                color: interval === tab.key ? '#fff' : c.textSecondary,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        {loading ? (
          <div style={{ color: c.textMuted, padding: '30px 0', textAlign: 'center', fontSize: 13 }}>載入線圖中...</div>
        ) : chart ? (
          <StockChart chart={chart} priceLines={interval === '1d' ? lines : []} />
        ) : (
          <div style={{ color: c.textMuted, padding: '30px 0', textAlign: 'center', fontSize: 13 }}>無法載入線圖</div>
        )}

        {/* 4 indicator groups */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {/* 距歷史高 */}
          <InfoCard title="距歷史高點" c={c}>
            <Metric label="歷史最高" value={`${stock.allTimeHigh}`} color={c.text} />
            <Metric label="距離"
              value={stock.distHighPct <= 0 ? '已創新高!' : `-${stock.distHighPct}%`}
              color={stock.distHighPct <= 0 ? c.up : stock.distHighPct < 5 ? '#f59e0b' : c.textSecondary} />
            <Metric label="高點日期" value={stock.allTimeHighDate} color={c.textMuted} />
          </InfoCard>

          {/* 三大法人 */}
          <InfoCard title="三大法人買賣超（張）" c={c}>
            <Metric label="外資" value={fmtNetBuy(stock.foreignNetBuy)}
              color={stock.foreignNetBuy > 0 ? c.up : stock.foreignNetBuy < 0 ? c.down : c.textMuted} />
            <Metric label="投信" value={fmtNetBuy(stock.trustNetBuy)}
              color={stock.trustNetBuy > 0 ? c.up : stock.trustNetBuy < 0 ? c.down : c.textMuted} />
            <Metric label="自營" value={fmtNetBuy(stock.dealerNetBuy)}
              color={stock.dealerNetBuy > 0 ? c.up : stock.dealerNetBuy < 0 ? c.down : c.textMuted} />
            <Metric label="合計" value={fmtNetBuy(stock.totalNetBuy)}
              color={stock.totalNetBuy > 0 ? c.up : stock.totalNetBuy < 0 ? c.down : c.textMuted}
              bold />
          </InfoCard>

          {/* 年營收 */}
          <InfoCard title={`年營收 ${stock.revenuePeriod || ''}`} c={c}>
            <Metric label="最近年度" value={stock.revenueLatest > 0 ? `${stock.revenueLatest} 億` : '無資料'} color={c.text} />
            <Metric label="前一年度" value={stock.revenuePrev > 0 ? `${stock.revenuePrev} 億` : '-'} color={c.textMuted} />
            <Metric label="年營收成長率" value={stock.revenueGrowth !== 0 ? `${stock.revenueGrowth > 0 ? '+' : ''}${stock.revenueGrowth}%` : '-'}
              color={stock.revenueGrowth > 20 ? c.up : stock.revenueGrowth > 0 ? '#f59e0b' : stock.revenueGrowth < 0 ? c.down : c.textMuted}
              bold />
          </InfoCard>

          {/* 交易計畫 */}
          <InfoCard title="交易計畫" c={c}>
            <Metric label="進場" value={`${stock.entryPrice}`} color={c.blue} />
            <Metric label="停損" value={`${stock.stopLoss}`} color="#ef4444" sub={stock.stopLabel} />
            <Metric label="目標" value={`${stock.target}`} color="#22c55e" sub={stock.targetLabel} />
            <Metric label="風報比" value={stock.rewardRisk > 0 ? `1 : ${stock.rewardRisk}` : '-'}
              color={stock.rewardRisk >= 3 ? c.up : c.blue} />
          </InfoCard>
        </div>

        {/* MA row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <MiniTag label="MA20" value={stock.ma20} price={stock.currentPrice} c={c} />
          <MiniTag label="MA60" value={stock.ma60} price={stock.currentPrice} c={c} />
          {stock.ma120 > 0 && <MiniTag label="MA120" value={stock.ma120} price={stock.currentPrice} c={c} />}
          {stock.ma200 > 0 && <MiniTag label="MA200" value={stock.ma200} price={stock.currentPrice} c={c} />}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, c, children }: { title: string; c: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8,
      padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.03em' }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function Metric({ label, value, color, sub, bold }: {
  label: string; value: string; color?: string; sub?: string; bold?: boolean;
}) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: c.textMuted, fontSize: 11 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: bold ? 800 : 600, fontSize: bold ? 14 : 12, color: color ?? c.text }}>{value}</span>
        {sub && <span style={{ color: c.textMuted, fontSize: 9, marginLeft: 3 }}>{sub}</span>}
      </div>
    </div>
  );
}

function fmtNetBuy(v: number): string {
  if (v === 0) return '0';
  const sign = v > 0 ? '+' : '';
  if (Math.abs(v) >= 1000) return `${sign}${(v / 1000).toFixed(1)}K`;
  return `${sign}${v.toFixed(0)}`;
}

function MiniTag({ label, value, price, c }: { label: string; value: number; price: number; c: ReturnType<typeof useColors> }) {
  const above = price >= value;
  return (
    <span style={{
      fontSize: 10, padding: '2px 5px', borderRadius: 3,
      background: above ? c.up + '15' : c.down + '15',
      color: above ? c.up : c.down,
    }}>
      {label} {value}
    </span>
  );
}
