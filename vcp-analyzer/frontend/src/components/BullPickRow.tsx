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

// Score bar config
const SCORE_ITEMS = [
  { key: 'pattern' as const, label: '線型', max: 20, icon: '📐' },
  { key: 'maAlign' as const, label: '均線', max: 15, icon: '📈' },
  { key: 'distHigh' as const, label: '新高', max: 20, icon: '🏔' },
  { key: 'institutional' as const, label: '法人', max: 25, icon: '🏦' },
  { key: 'revenue' as const, label: '營收', max: 20, icon: '💰' },
];

function getScoreRank(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: 'SSS', color: '#fbbf24', bg: 'linear-gradient(135deg, #fbbf2430, #f59e0b20)' };
  if (score >= 80) return { label: 'SS', color: '#f59e0b', bg: 'linear-gradient(135deg, #f59e0b25, #ea580c15)' };
  if (score >= 70) return { label: 'S', color: '#ef4444', bg: 'linear-gradient(135deg, #ef444420, #dc262615)' };
  if (score >= 60) return { label: 'A', color: '#a855f7', bg: 'linear-gradient(135deg, #a855f720, #7c3aed15)' };
  if (score >= 50) return { label: 'B', color: '#3b82f6', bg: 'linear-gradient(135deg, #3b82f620, #2563eb15)' };
  return { label: 'C', color: '#6b7280', bg: 'linear-gradient(135deg, #6b728015, #4b556310)' };
}

function getBarColor(ratio: number): string {
  if (ratio >= 0.85) return '#fbbf24';
  if (ratio >= 0.7) return '#f59e0b';
  if (ratio >= 0.5) return '#22c55e';
  if (ratio >= 0.3) return '#3b82f6';
  return '#6b7280';
}

export default function BullPickRow({ stock }: Props) {
  const c = useColors();
  const [chart, setChart] = useState<StockChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<ChartInterval>('1d');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setChart(null);
    getChart(stock.symbol, interval).then(setChart).catch(() => {}).finally(() => setLoading(false));
  }, [stock.symbol, interval]);

  const code = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const market = stock.market === '上櫃' ? '櫃' : '市';
  const rank = getScoreRank(stock.score);

  const lines: PriceLine[] = [
    { price: stock.entryPrice, color: c.blue, title: `進場 ${stock.entryPrice}` },
    { price: stock.stopLoss, color: '#ef4444', title: `停損 ${stock.stopLoss}` },
    { price: stock.target, color: '#22c55e', title: `T1 ${stock.target}` },
    { price: stock.target2, color: '#16a34a', title: `T2 ${stock.target2}`, lineStyle: 1 },
    { price: stock.allTimeHigh, color: '#f59e0b', title: `ATH ${stock.allTimeHigh}`, lineStyle: 1 },
  ];

  const bd = stock.scoreBreakdown;

  return (
    <div style={{
      background: rank.bg, borderRadius: 14, overflow: 'hidden',
      border: `1.5px solid ${rank.color}33`,
      boxShadow: `0 2px 12px ${rank.color}15`,
    }}>
      {/* ── Header Row ── */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Top: Code + Name + Rank Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
              background: market === '櫃' ? '#8b5cf622' : '#3b82f622',
              color: market === '櫃' ? '#8b5cf6' : '#3b82f6',
              letterSpacing: '0.05em',
            }}>{market === '櫃' ? 'OTC' : 'TSE'}</span>
            <span style={{ fontWeight: 900, fontSize: 20, color: c.text }}>{code}</span>
            <span style={{ color: c.textSecondary, fontSize: 14 }}>{stock.name}</span>
          </div>
          {/* Rank Badge - game style */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              background: `linear-gradient(135deg, ${rank.color}, ${rank.color}88)`,
              color: '#000', fontWeight: 900, fontSize: 16,
              padding: '4px 12px', borderRadius: 8, letterSpacing: '0.05em',
              textShadow: '0 1px 2px rgba(255,255,255,0.3)',
              boxShadow: `0 2px 8px ${rank.color}44`,
            }}>
              {rank.label}
            </div>
            <span style={{
              fontSize: 22, fontWeight: 900, color: rank.color,
              textShadow: `0 0 10px ${rank.color}44`,
            }}>{stock.score.toFixed(0)}</span>
          </div>
        </div>

        {/* Price + Change + Tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 22, fontWeight: 900,
            color: stock.changePct > 0 ? c.up : stock.changePct < 0 ? c.down : c.text,
          }}>{stock.currentPrice}</span>
          <span style={{
            fontSize: 13, fontWeight: 800,
            padding: '3px 8px', borderRadius: 6,
            background: stock.changePct > 0 ? c.up + '20' : stock.changePct < 0 ? c.down + '20' : c.textMuted + '15',
            color: stock.changePct > 0 ? c.up : stock.changePct < 0 ? c.down : c.textMuted,
          }}>
            {stock.changePct > 0 ? '+' : ''}{stock.changePct}%
          </span>
          {stock.pattern !== 'none' && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
              background: '#a78bfa25', color: '#a78bfa', border: '1px solid #a78bfa33',
            }}>{stock.patternLabel}</span>
          )}
          {stock.maAligned && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
              background: c.up + '20', color: c.up, border: `1px solid ${c.up}33`,
            }}>多頭排列</span>
          )}
          {stock.industry && (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: c.blue + '15', color: c.blue }}>
              {stock.industry}
            </span>
          )}
          {stock.conceptTag && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#8b5cf622', color: '#8b5cf6' }}>
              {stock.conceptTag}
            </span>
          )}
        </div>

        {/* ── Score Breakdown Bars ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCORE_ITEMS.map(({ key, label, max, icon }) => {
            const val = bd?.[key] ?? 0;
            const ratio = val / max;
            const barColor = getBarColor(ratio);
            return (
              <div key={key} style={{
                flex: '1 1 80px', minWidth: 72,
                background: c.bgCard, borderRadius: 8, padding: '6px 8px',
                border: `1px solid ${c.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: c.textMuted }}>{icon} {label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: barColor }}>{val}/{max}</span>
                </div>
                <div style={{ background: c.border, borderRadius: 3, height: 5, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3, width: `${ratio * 100}%`,
                    background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chart Section ── */}
      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Timeframe Tabs */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${c.border}`, alignSelf: 'flex-start' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setInterval(tab.key)}
              style={{
                padding: '5px 20px', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer',
                background: interval === tab.key ? c.blue : 'transparent',
                color: interval === tab.key ? '#fff' : c.textMuted,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        {loading ? (
          <div style={{ color: c.textMuted, padding: '30px 0', textAlign: 'center', fontSize: 13 }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginRight: 6 }}>&#9881;</span>
            載入線圖中...
          </div>
        ) : chart ? (
          <StockChart chart={chart} priceLines={interval === '1d' ? lines : []} />
        ) : (
          <div style={{ color: c.textMuted, padding: '30px 0', textAlign: 'center', fontSize: 13 }}>無法載入線圖</div>
        )}
      </div>

      {/* ── Expand/Collapse Details ── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          textAlign: 'center', padding: '8px', cursor: 'pointer',
          color: c.blue, fontSize: 13, fontWeight: 700,
          borderTop: `1px solid ${c.border}`,
          background: c.bgCard + '80',
          userSelect: 'none',
        }}
      >
        {expanded ? '收合詳細資訊 ▲' : '展開詳細資訊 ▼'}
      </div>

      {expanded && (
        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Detail cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <InfoCard title="距歷史高點" c={c}>
              <Metric label="歷史最高" value={`${stock.allTimeHigh}`} color={c.text} />
              <Metric label="距離"
                value={stock.distHighPct <= 0 ? '已創新高!' : `-${stock.distHighPct}%`}
                color={stock.distHighPct <= 0 ? c.up : stock.distHighPct < 5 ? '#f59e0b' : c.textSecondary} />
              <Metric label="高點日期" value={stock.allTimeHighDate} color={c.textMuted} />
            </InfoCard>

            <InfoCard title="三大法人（張）" c={c}>
              <Metric label="外資" value={fmtNetBuy(stock.foreignNetBuy)}
                color={stock.foreignNetBuy > 0 ? c.up : stock.foreignNetBuy < 0 ? c.down : c.textMuted} />
              <Metric label="投信" value={fmtNetBuy(stock.trustNetBuy)}
                color={stock.trustNetBuy > 0 ? c.up : stock.trustNetBuy < 0 ? c.down : c.textMuted} />
              <Metric label="自營" value={fmtNetBuy(stock.dealerNetBuy)}
                color={stock.dealerNetBuy > 0 ? c.up : stock.dealerNetBuy < 0 ? c.down : c.textMuted} />
              <Metric label="合計" value={fmtNetBuy(stock.totalNetBuy)}
                color={stock.totalNetBuy > 0 ? c.up : stock.totalNetBuy < 0 ? c.down : c.textMuted} bold />
            </InfoCard>

            <InfoCard title={`年營收 ${stock.revenuePeriod || ''}`} c={c}>
              <Metric label="最近年度" value={stock.revenueLatest > 0 ? `${stock.revenueLatest} 億` : '無資料'} color={c.text} />
              <Metric label="前一年度" value={stock.revenuePrev > 0 ? `${stock.revenuePrev} 億` : '-'} color={c.textMuted} />
              <Metric label="成長率" value={stock.revenueGrowth !== 0 ? `${stock.revenueGrowth > 0 ? '+' : ''}${stock.revenueGrowth}%` : '-'}
                color={stock.revenueGrowth > 20 ? c.up : stock.revenueGrowth > 0 ? '#f59e0b' : stock.revenueGrowth < 0 ? c.down : c.textMuted} bold />
            </InfoCard>

            <InfoCard title="交易計畫" c={c}>
              <Metric label="停損" value={`${stock.stopLoss}`} color="#ef4444" sub={stock.stopLabel} />
              <Metric label="T1 目標" value={`${stock.target}`} color="#22c55e" sub={stock.targetLabel}
                tooltip={getT1Tooltip(stock.targetLabel)} />
              <Metric label="T2 目標" value={`${stock.target2}`} color="#16a34a" sub={stock.target2Label}
                tooltip={getT2Tooltip(stock.target2Label)} />
              <Metric label="風報比 (T1)" value={stock.rewardRisk > 0 ? `1 : ${stock.rewardRisk}` : '-'}
                color={stock.rewardRisk >= 3 ? c.up : c.blue} />
            </InfoCard>
          </div>

          {/* Position Calculator */}
          <PositionCalculator stock={stock} c={c} />

          {/* MA tags */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <MiniTag label="MA20" value={stock.ma20} price={stock.currentPrice} c={c} />
            <MiniTag label="MA60" value={stock.ma60} price={stock.currentPrice} c={c} />
            {stock.ma120 > 0 && <MiniTag label="MA120" value={stock.ma120} price={stock.currentPrice} c={c} />}
            {stock.ma200 > 0 && <MiniTag label="MA200" value={stock.ma200} price={stock.currentPrice} c={c} />}
          </div>
        </div>
      )}
    </div>
  );
}

function getT1Tooltip(label: string): string {
  if (label === '歷史高點')
    return 'T1（保守目標）= 歷史最高價\n股價尚未突破前高，歷史高點為最直接的壓力位。\n適合分批出場，先在此位置賣出部分持股鎖定獲利。';
  if (label === 'Fib 1.272')
    return 'T1（保守目標）= Fibonacci 1.272 延伸\n股價已突破歷史高點，以近期低點到前高的波段幅度，\n乘以 1.272 倍投射上方目標。Fibonacci 延伸是技術分析常用的目標位。';
  if (label === '2×ATR')
    return 'T1（保守目標）= 現價 + 2 × ATR(20)\nATR = 平均真實波幅（20日），衡量股價每日波動幅度。\n2 倍 ATR 為短期合理的獲利空間。';
  return 'T1 = 第一目標價（保守）';
}

function getT2Tooltip(label: string): string {
  if (label === 'ATH + 1.5×ATR')
    return 'T2（積極目標）= 歷史高點 + 1.5 × ATR(20)\n假設股價突破歷史高點後，再以波動率延伸 1.5 倍 ATR。\nATR 會根據每支股票的波動特性動態調整目標距離。';
  if (label === 'Fib 1.618')
    return 'T2（積極目標）= Fibonacci 1.618 延伸（黃金比例）\n又稱「黃金目標位」，是 Fibonacci 最經典的延伸比例。\n適合趨勢強勁時的持股目標，但不一定每次都會到達。';
  if (label === '3×ATR')
    return 'T2（積極目標）= 現價 + 3 × ATR(20)\n3 倍 ATR 為中期較積極的獲利目標。\n適合趨勢明確時繼續持有的參考。';
  return 'T2 = 第二目標價（積極）';
}

function PositionCalculator({ stock, c }: { stock: BullPickAnalysis; c: ReturnType<typeof useColors> }) {
  const [entryPrice, setEntryPrice] = useState(stock.entryPrice);
  const [riskAmount, setRiskAmount] = useState(10000);

  const riskPerShare = entryPrice - stock.stopLoss;
  const shares = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const totalCost = shares * entryPrice;
  const maxLoss = shares * riskPerShare;
  const profitT1 = shares * (stock.target - entryPrice);
  const profitT2 = shares * (stock.target2 - entryPrice);
  const rrT1 = riskPerShare > 0 ? ((stock.target - entryPrice) / riskPerShare) : 0;
  const rrT2 = riskPerShare > 0 ? ((stock.target2 - entryPrice) / riskPerShare) : 0;

  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: c.text, letterSpacing: '0.02em' }}>
        部位計算機
      </span>

      {/* Inputs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 11, color: c.textMuted }}>進場價</label>
          <input type="number" value={entryPrice} step={0.5}
            onChange={(e) => setEntryPrice(Number(e.target.value))}
            style={{
              background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 6,
              color: c.text, fontSize: 15, fontWeight: 700, padding: '6px 10px',
              outline: 'none', width: 100,
            }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 11, color: c.textMuted }}>可承受風險（元）</label>
          <input type="number" value={riskAmount} step={1000}
            onChange={(e) => setRiskAmount(Number(e.target.value))}
            style={{
              background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 6,
              color: c.text, fontSize: 15, fontWeight: 700, padding: '6px 10px',
              outline: 'none', width: 120,
            }} />
        </div>
      </div>

      {/* Results */}
      {riskPerShare > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          <ResultBox label="建議股數" value={`${shares} 股`} sub={`${Math.floor(shares / 1000)} 張 + ${shares % 1000} 股`} color={c.blue} c={c} />
          <ResultBox label="總成本" value={`$${totalCost.toLocaleString()}`} color={c.text} c={c} />
          <ResultBox label="最大損失" value={`-$${Math.round(maxLoss).toLocaleString()}`} color="#ef4444" c={c} />
          <ResultBox label="T1 預估獲利" value={`+$${Math.round(profitT1).toLocaleString()}`} sub={`風報比 1:${rrT1.toFixed(1)}`} color="#22c55e" c={c}
            tooltip={getT1Tooltip(stock.targetLabel)} />
          <ResultBox label="T2 預估獲利" value={`+$${Math.round(profitT2).toLocaleString()}`} sub={`風報比 1:${rrT2.toFixed(1)}`} color="#16a34a" c={c}
            tooltip={getT2Tooltip(stock.target2Label)} />
          <ResultBox label="每股風險" value={`$${riskPerShare.toFixed(1)}`} sub={`停損 ${stock.stopLoss}`} color="#f59e0b" c={c} />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#ef4444' }}>進場價必須高於停損價 {stock.stopLoss}</div>
      )}
    </div>
  );
}

function ResultBox({ label, value, sub, color, c, tooltip }: {
  label: string; value: string; sub?: string; color: string; c: ReturnType<typeof useColors>; tooltip?: string;
}) {
  return (
    <div title={tooltip} style={{
      background: color + '08', border: `1px solid ${color}22`, borderRadius: 8,
      padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2,
      cursor: tooltip ? 'help' : undefined,
    }}>
      <span style={{ fontSize: 10, color: c.textMuted }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: c.textMuted }}>{sub}</span>}
    </div>
  );
}

function InfoCard({ title, c, children }: { title: string; c: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8,
      padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, letterSpacing: '0.03em' }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function Metric({ label, value, color, sub, bold, tooltip }: {
  label: string; value: string; color?: string; sub?: string; bold?: boolean; tooltip?: string;
}) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
      title={tooltip}>
      <span style={{ color: c.textMuted, fontSize: 11, cursor: tooltip ? 'help' : undefined }}>{label}</span>
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
