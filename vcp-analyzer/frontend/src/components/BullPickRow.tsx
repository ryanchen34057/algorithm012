import { useEffect, useState } from 'react';
import { getChart, ChartInterval } from '../services/api';
import { StockChartData, BullPickAnalysis } from '../types';
import { useColors, ThemeColors } from './ThemeContext';
import StockChart, { PriceLine } from './StockChart';

interface Props {
  stock: BullPickAnalysis;
}

const TABS: { key: ChartInterval; label: string }[] = [
  { key: '1d', label: '日' },
  { key: '1wk', label: '週' },
  { key: '1mo', label: '月' },
];

const SCORE_ITEMS = [
  { key: 'pattern' as const, label: '線型', max: 20 },
  { key: 'maAlign' as const, label: '均線', max: 15 },
  { key: 'distHigh' as const, label: '新高', max: 20 },
  { key: 'institutional' as const, label: '法人', max: 25 },
  { key: 'revenue' as const, label: '營收', max: 20 },
];

function getRank(score: number) {
  if (score >= 90) return { label: 'SSS', color: '#e5a100', border: '#e5a10040' };
  if (score >= 80) return { label: 'SS', color: '#d97706', border: '#d9770640' };
  if (score >= 70) return { label: 'S', color: '#ef4444', border: '#ef444440' };
  if (score >= 60) return { label: 'A', color: '#8b6cc1', border: '#8b6cc140' };
  if (score >= 50) return { label: 'B', color: '#6889ff', border: '#6889ff40' };
  return { label: 'C', color: '#706882', border: '#70688240' };
}

function barColor(ratio: number): string {
  if (ratio >= 0.85) return '#e5a100';
  if (ratio >= 0.7) return '#d97706';
  if (ratio >= 0.5) return '#22c55e';
  if (ratio >= 0.3) return '#6889ff';
  return '#706882';
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
  const rank = getRank(stock.score);
  const bd = stock.scoreBreakdown;

  const lines: PriceLine[] = [
    { price: stock.entryPrice, color: c.blue, title: `進場 ${stock.entryPrice}` },
    { price: stock.stopLoss, color: '#ef4444', title: `停損 ${stock.stopLoss}` },
    { price: stock.target, color: '#22c55e', title: `T1 ${stock.target}` },
    { price: stock.target2, color: '#16a34a', title: `T2 ${stock.target2}`, lineStyle: 1 },
    { price: stock.allTimeHigh, color: c.yellow, title: `ATH ${stock.allTimeHigh}`, lineStyle: 1 },
  ];

  return (
    <div style={{
      background: c.bgCard, borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${c.border}`,
      animation: 'fadeIn 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
    }}>
      {/* ── Header ── */}
      <div style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Row 1: code + name + rank */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
              background: market === '櫃' ? '#8b6cc118' : c.blue + '18',
              color: market === '櫃' ? '#8b6cc1' : c.blue,
              letterSpacing: '0.06em',
            }}>{market === '櫃' ? 'OTC' : 'TSE'}</span>
            <span style={{ fontWeight: 900, fontSize: 18, color: c.text, letterSpacing: '-0.02em' }}>{code}</span>
            <span style={{ color: c.textSecondary, fontSize: 13 }}>{stock.name}</span>
          </div>
          {/* Rank badge — solid, no gradient, no glow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 22, fontWeight: 900, color: rank.color,
              letterSpacing: '-0.02em',
            }}>{stock.score.toFixed(0)}</span>
            <span style={{
              background: rank.color, color: '#141118',
              fontWeight: 900, fontSize: 13, padding: '3px 10px',
              borderRadius: 5, letterSpacing: '0.08em',
            }}>{rank.label}</span>
          </div>
        </div>

        {/* Row 2: price + tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 20, fontWeight: 900,
            color: stock.changePct > 0 ? c.up : stock.changePct < 0 ? c.down : c.text,
            letterSpacing: '-0.02em',
          }}>{stock.currentPrice}</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: stock.changePct > 0 ? c.up + '14' : stock.changePct < 0 ? c.down + '14' : c.textMuted + '10',
            color: stock.changePct > 0 ? c.up : stock.changePct < 0 ? c.down : c.textMuted,
          }}>
            {stock.changePct > 0 ? '+' : ''}{stock.changePct}%
          </span>
          {stock.pattern !== 'none' && (
            <Tag label={stock.patternLabel} color="#8b6cc1" />
          )}
          {stock.maAligned && <Tag label="多頭排列" color={c.up} />}
          {stock.industry && <Tag label={stock.industry} color={c.blue} />}
          {stock.conceptTag && <Tag label={stock.conceptTag} color="#8b6cc1" />}
        </div>

        {/* Score bars — flat, no nested cards */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SCORE_ITEMS.map(({ key, label, max }) => {
            const val = bd?.[key] ?? 0;
            const ratio = val / max;
            const bc = barColor(ratio);
            return (
              <div key={key} style={{ flex: '1 1 70px', minWidth: 65 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: c.textMuted }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: bc }}>{val}/{max}</span>
                </div>
                <div style={{ background: c.border, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3, width: `${ratio * 100}%`,
                    background: bc,
                    transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chart ── */}
      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${c.border}`, alignSelf: 'flex-start' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setInterval(tab.key)}
              style={{
                padding: '4px 18px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: interval === tab.key ? c.accent : 'transparent',
                color: interval === tab.key ? '#141118' : c.textMuted,
              }}
            >{tab.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: c.textMuted, padding: '30px 0', textAlign: 'center', fontSize: 12 }}>
            載入中...
          </div>
        ) : chart ? (
          <StockChart chart={chart} priceLines={interval === '1d' ? lines : []} />
        ) : (
          <div style={{ color: c.textMuted, padding: '30px 0', textAlign: 'center', fontSize: 12 }}>無法載入線圖</div>
        )}
      </div>

      {/* ── Expand toggle ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', textAlign: 'center', padding: '8px', cursor: 'pointer',
          color: c.textMuted, fontSize: 12, fontWeight: 600,
          borderTop: `1px solid ${c.border}`,
          background: 'transparent', border: 'none',
          borderTopStyle: 'solid', borderTopWidth: 1, borderTopColor: c.border,
        }}
      >
        {expanded ? '收合 ▲' : '詳細資訊 ▼'}
      </button>

      {expanded && (
        <div style={{
          padding: '12px 16px 16px', borderTop: `1px solid ${c.border}`,
          display: 'flex', flexDirection: 'column', gap: 12,
          animation: 'fadeIn 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        }}>
          {/* Detail grid — flat rows, no card wrapping */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            <DetailSection title="距歷史高點">
              <Row label="歷史最高" value={`${stock.allTimeHigh}`} color={c.text} c={c} />
              <Row label="距離" value={stock.distHighPct <= 0 ? '已創新高' : `-${stock.distHighPct}%`}
                color={stock.distHighPct <= 0 ? c.up : stock.distHighPct < 5 ? c.yellow : c.textSecondary} c={c} />
              <Row label="高點日期" value={stock.allTimeHighDate} color={c.textMuted} c={c} />
            </DetailSection>

            <DetailSection title="三大法人 近20日（張）">
              <Row label="外資" value={fmtNetBuy(stock.foreignNetBuy)} color={nbColor(stock.foreignNetBuy, c)} c={c} />
              <Row label="投信" value={fmtNetBuy(stock.trustNetBuy)} color={nbColor(stock.trustNetBuy, c)} c={c} />
              <Row label="自營" value={fmtNetBuy(stock.dealerNetBuy)} color={nbColor(stock.dealerNetBuy, c)} c={c} />
              <Row label="合計" value={fmtNetBuy(stock.totalNetBuy)} color={nbColor(stock.totalNetBuy, c)} c={c} bold />
            </DetailSection>

            <DetailSection title={`年營收 ${stock.revenuePeriod || ''}`}>
              <Row label="最近年度" value={stock.revenueLatest > 0 ? `${stock.revenueLatest} 億` : '無資料'} color={c.text} c={c} />
              <Row label="前一年度" value={stock.revenuePrev > 0 ? `${stock.revenuePrev} 億` : '-'} color={c.textMuted} c={c} />
              <Row label="成長率" value={stock.revenueGrowth !== 0 ? `${stock.revenueGrowth > 0 ? '+' : ''}${stock.revenueGrowth}%` : '-'}
                color={stock.revenueGrowth > 20 ? c.up : stock.revenueGrowth > 0 ? c.yellow : stock.revenueGrowth < 0 ? c.down : c.textMuted} c={c} bold />
            </DetailSection>

            <DetailSection title="成交量">
              <Row label="日均量" value={`${Math.round(stock.adv20)} 張`} color={c.text} c={c} />
              <Row label="5日量縮" value={stock.volShrinkPct > 0 ? `${stock.volShrinkPct}%` : '無量縮'}
                color={stock.volShrinkPct >= 30 ? c.up : stock.volShrinkPct > 0 ? c.yellow : c.textMuted} c={c}
                bold={stock.volShrinkPct >= 30} />
            </DetailSection>

            <DetailSection title="交易計畫">
              <Row label="停損" value={`${stock.stopLoss}`} color="#ef4444" c={c} sub={stock.stopLabel} />
              <Row label="T1" value={`${stock.target}`} color="#22c55e" c={c} sub={stock.targetLabel}
                tooltip={getT1Tooltip(stock.targetLabel)} />
              {stock.targetFormula && (
                <div style={{ fontSize: 10, color: c.textDim, marginTop: -2, marginBottom: 2, paddingLeft: 2 }}>
                  {stock.targetFormula}
                </div>
              )}
              <Row label="T2" value={`${stock.target2}`} color="#16a34a" c={c} sub={stock.target2Label}
                tooltip={getT2Tooltip(stock.target2Label)} />
              {stock.target2Formula && (
                <div style={{ fontSize: 10, color: c.textDim, marginTop: -2, marginBottom: 2, paddingLeft: 2 }}>
                  {stock.target2Formula}
                </div>
              )}
              <Row label="T1預估漲幅" value={`${stock.upsidePct > 0 ? '+' : ''}${stock.upsidePct}%`}
                color={stock.upsidePct >= 20 ? c.up : stock.upsidePct >= 10 ? c.yellow : c.textMuted} c={c}
                bold={stock.upsidePct >= 20}
                tooltip="林則行建議：預估漲幅未達 20% 不買" />
              <Row label="風報比" value={stock.rewardRisk > 0 ? `1:${stock.rewardRisk}` : '-'}
                color={stock.rewardRisk >= 3 ? c.up : c.blue} c={c} />
              <TargetExplainer stock={stock} c={c} />
            </DetailSection>
          </div>

          <PositionCalculator stock={stock} c={c} />

          {/* MA tags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

// ── Sub-components ──

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: color + '14', color,
    }}>{label}</span>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, letterSpacing: '0.04em', marginBottom: 2 }}>{title}</span>
      {children}
    </div>
  );
}

function Row({ label, value, color, c, bold, sub, tooltip }: {
  label: string; value: string; color?: string; c: ThemeColors; bold?: boolean; sub?: string; tooltip?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }} title={tooltip}>
      <span style={{ color: c.textMuted, fontSize: 11, cursor: tooltip ? 'help' : undefined }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: bold ? 800 : 600, fontSize: bold ? 13 : 12, color: color ?? c.text }}>{value}</span>
        {sub && <span style={{ color: c.textDim, fontSize: 9, marginLeft: 3 }}>{sub}</span>}
      </div>
    </div>
  );
}

function PositionCalculator({ stock, c }: { stock: BullPickAnalysis; c: ThemeColors }) {
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
      borderTop: `1px solid ${c.border}`, paddingTop: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: c.text }}>部位計算機</span>
        <span style={{ fontSize: 11, color: '#ef4444' }}>停損 {stock.stopLoss}（{stock.stopLabel}）</span>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, color: c.textMuted }}>進場價</label>
          <input type="number" value={entryPrice} step={0.5}
            onChange={(e) => setEntryPrice(Number(e.target.value))}
            style={{
              background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 6,
              color: c.text, fontSize: 14, fontWeight: 700, padding: '6px 10px',
              outline: 'none', width: 100,
            }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, color: c.textMuted }}>可承受風險（元）</label>
          <input type="number" value={riskAmount} step={1000}
            onChange={(e) => setRiskAmount(Number(e.target.value))}
            style={{
              background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 6,
              color: c.text, fontSize: 14, fontWeight: 700, padding: '6px 10px',
              outline: 'none', width: 120,
            }} />
        </div>
      </div>

      {riskPerShare > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          <Stat label="建議股數" value={`${shares} 股`} sub={`${Math.floor(shares / 1000)} 張`} color={c.blue} c={c} />
          <Stat label="總成本" value={`$${totalCost.toLocaleString()}`} color={c.text} c={c} />
          <Stat label="最大損失" value={`-$${Math.round(maxLoss).toLocaleString()}`} color="#ef4444" c={c} />
          <Stat label="T1 獲利" value={`+$${Math.round(profitT1).toLocaleString()}`} sub={`1:${rrT1.toFixed(1)}`} color="#22c55e" c={c}
            tooltip={getT1Tooltip(stock.targetLabel)} />
          <Stat label="T2 獲利" value={`+$${Math.round(profitT2).toLocaleString()}`} sub={`1:${rrT2.toFixed(1)}`} color="#16a34a" c={c}
            tooltip={getT2Tooltip(stock.target2Label)} />
          <Stat label="每股風險" value={`$${riskPerShare.toFixed(1)}`} color={c.yellow} c={c} />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#ef4444' }}>進場價必須高於停損價 {stock.stopLoss}</div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, color, c, tooltip }: {
  label: string; value: string; sub?: string; color: string; c: ThemeColors; tooltip?: string;
}) {
  return (
    <div title={tooltip} style={{
      padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 1,
      cursor: tooltip ? 'help' : undefined,
    }}>
      <span style={{ fontSize: 10, color: c.textMuted }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: c.textDim }}>{sub}</span>}
    </div>
  );
}

function MiniTag({ label, value, price, c }: { label: string; value: number; price: number; c: ThemeColors }) {
  const above = price >= value;
  return (
    <span style={{
      fontSize: 10, padding: '2px 5px', borderRadius: 3,
      background: above ? c.up + '12' : c.down + '12',
      color: above ? c.up : c.down,
    }}>
      {label} {value}
    </span>
  );
}

function nbColor(v: number, c: ThemeColors): string {
  return v > 0 ? c.up : v < 0 ? c.down : c.textMuted;
}

function fmtNetBuy(v: number): string {
  if (v === 0) return '0';
  const sign = v > 0 ? '+' : '';
  if (Math.abs(v) >= 1000) return `${sign}${(v / 1000).toFixed(1)}K`;
  return `${sign}${v.toFixed(0)}`;
}

function getT1Tooltip(label: string): string {
  if (label === '等幅測量')
    return 'T1（等幅目標）= 回調低點 + 第一段漲幅\n林則行：股票從谷底反彈的漲幅，突破後會再走等幅的第二段。';
  if (label === '歷史高點')
    return 'T1（保守目標）= 歷史最高價\n前高是最直接的壓力位，先以此為第一目標。';
  if (label === '2×ATR')
    return 'T1 = 現價 + 2 × ATR(20)\n無明確波段結構時，以波動率估算。';
  return 'T1 = 第一目標價';
}

function getT2Tooltip(label: string): string {
  if (label === '等幅測量')
    return 'T2（等幅目標）= 回調低點 + 第一段漲幅\nATH 被突破後，以等幅投射做積極目標。';
  if (label === '1.5倍等幅')
    return 'T2（積極目標）= 回調低點 + 1.5 × 第一段漲幅\n趨勢強勁時，第二段可走到 1.5 倍。';
  if (label === 'ATH+1.5×ATR')
    return 'T2 = 歷史高點 + 1.5 × ATR(20)\n突破歷史高點後，以波動率延伸。';
  if (label === '3×ATR')
    return 'T2 = 現價 + 3 × ATR(20)';
  return 'T2 = 第二目標價（積極）';
}

function TargetExplainer({ stock, c }: { stock: BullPickAnalysis; c: ThemeColors }) {
  const [open, setOpen] = useState(false);
  const isMM = stock.targetLabel === '等幅測量' || stock.target2Label === '等幅測量' || stock.target2Label === '1.5倍等幅';

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: c.textDim, fontSize: 10, padding: 0, textAlign: 'left',
        }}
      >
        {open ? '▲ 收合說明' : '▼ T1/T2 怎麼算的？'}
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: '8px 10px', borderRadius: 6,
          background: c.bgInput, fontSize: 11, lineHeight: 1.7,
          color: c.textSecondary, border: `1px solid ${c.border}`,
        }}>
          {isMM ? (
            <>
              <div><b style={{ color: c.yellow }}>林則行「兩段式上漲」</b></div>
              <div style={{ marginTop: 4 }}>
                股票從谷底反彈到高點，這段叫「第一段」。突破後回調再起漲，通常會再走<b>等幅的第二段</b>。
              </div>
              <div style={{ marginTop: 4, padding: '4px 8px', background: c.border + '40', borderRadius: 4, fontSize: 10 }}>
                第一段漲幅 = 反彈高點 - 谷底<br />
                <b style={{ color: '#22c55e' }}>T1 = 回調低點 + 第一段漲幅</b>（等幅投射）<br />
                <b style={{ color: '#16a34a' }}>T2 = 回調低點 + 1.5 × 第一段漲幅</b>（趨勢強時）
              </div>
              {stock.distHighPct > 0 && stock.targetLabel === '歷史高點' && (
                <div style={{ marginTop: 4 }}>
                  目前前高 <b style={{ color: c.yellow }}>{stock.allTimeHigh}</b> 低於等幅目標，所以 T1 先設在歷史高點（天花板壓力），T2 為等幅投射。
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <b>門檻：</b>若預估漲幅不到 20%，風險報酬比不划算，建議跳過。
                {stock.upsidePct < 20 && (
                  <span style={{ color: '#ef4444', fontWeight: 700 }}> (目前僅 {stock.upsidePct}%)</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div>無法辨識明確的波段結構，改用 <b style={{ color: c.yellow }}>ATR（平均波動幅度）</b> 估算目標：</div>
              <div style={{ marginTop: 4 }}>
                <b style={{ color: '#22c55e' }}>T1 = 現價 + 2 倍日均波動</b>（短期合理空間）
              </div>
              <div style={{ marginTop: 4 }}>
                <b style={{ color: '#16a34a' }}>T2 = 現價 + 3 倍日均波動</b>（中期積極目標）
              </div>
            </>
          )}
          <div style={{ marginTop: 6, color: c.textDim, fontSize: 10 }}>
            停損 = 近期支撐位。風報比 = 預期獲利 ÷ 可能虧損，越大越好。
          </div>
        </div>
      )}
    </div>
  );
}
