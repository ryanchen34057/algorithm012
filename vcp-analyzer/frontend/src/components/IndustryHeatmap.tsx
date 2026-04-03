import { useState } from 'react';
import { IndustrySector, IndustryStockEntry } from '../types';
import { useColors, ThemeColors } from './ThemeContext';

interface Props {
  industries: IndustrySector[];
  stocksByIndustry: Record<string, IndustryStockEntry[]>;
}

// ── Squarified Treemap Layout ──

interface TreemapRect {
  sector: IndustrySector;
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutTreemap(sectors: IndustrySector[], width: number, height: number): TreemapRect[] {
  if (sectors.length === 0 || width <= 0 || height <= 0) return [];

  const sorted = [...sectors]
    .filter(s => s.totalNetBuy !== 0)
    .sort((a, b) => Math.abs(b.totalNetBuy) - Math.abs(a.totalNetBuy));

  if (sorted.length === 0) return [];

  const totalValue = sorted.reduce((sum, s) => sum + Math.abs(s.totalNetBuy), 0);
  if (totalValue === 0) return [];

  const items = sorted.map(s => ({
    sector: s,
    value: Math.abs(s.totalNetBuy) / totalValue,
  }));

  const rects: TreemapRect[] = [];
  sliceLayout(items, 0, 0, width, height, rects, true);
  return rects;
}

// Slice-and-dice layout (alternating horizontal/vertical splits)
function sliceLayout(
  items: { sector: IndustrySector; value: number }[],
  x: number, y: number, w: number, h: number,
  rects: TreemapRect[],
  horizontal: boolean,
) {
  if (items.length === 0) return;
  if (items.length === 1) {
    rects.push({ sector: items[0].sector, x, y, w, h });
    return;
  }

  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return;

  let bestSplit = 1;
  let bestDiff = Infinity;
  let runSum = 0;
  const halfTotal = total / 2;

  for (let i = 0; i < items.length - 1; i++) {
    runSum += items[i].value;
    const diff = Math.abs(runSum - halfTotal);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i + 1;
    }
  }

  const left = items.slice(0, bestSplit);
  const right = items.slice(bestSplit);
  const leftTotal = left.reduce((s, i) => s + i.value, 0);
  const leftFrac = leftTotal / total;

  if (horizontal) {
    const splitX = w * leftFrac;
    sliceLayout(left, x, y, splitX, h, rects, !horizontal);
    sliceLayout(right, x + splitX, y, w - splitX, h, rects, !horizontal);
  } else {
    const splitY = h * leftFrac;
    sliceLayout(left, x, y, w, splitY, rects, !horizontal);
    sliceLayout(right, x, y + splitY, w, h - splitY, rects, !horizontal);
  }
}

// ── Color helpers ──

function getHeatColor(netBuy: number, maxAbs: number, c: ThemeColors): string {
  if (netBuy === 0 || maxAbs === 0) return c.textMuted + '20';
  const intensity = Math.min(Math.abs(netBuy) / maxAbs, 1);
  const alpha = Math.round(15 + intensity * 40).toString(16).padStart(2, '0');
  return netBuy > 0 ? c.up + alpha : c.down + alpha;
}

function getTextColor(netBuy: number, maxAbs: number, c: ThemeColors): string {
  const intensity = maxAbs > 0 ? Math.abs(netBuy) / maxAbs : 0;
  if (intensity > 0.3) return netBuy > 0 ? c.up : c.down;
  return c.text;
}

// ── Component ──

type ViewMode = 'treemap' | 'bars';

export default function IndustryHeatmap({ industries, stocksByIndustry }: Props) {
  const c = useColors();
  const [view, setView] = useState<ViewMode>('treemap');
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (industries.length === 0) return null;

  const maxAbs = Math.max(...industries.map(g => Math.abs(g.totalNetBuy)), 1);

  const topIndustries = [...industries]
    .filter(g => g.totalNetBuy !== 0)
    .sort((a, b) => Math.abs(b.totalNetBuy) - Math.abs(a.totalNetBuy))
    .slice(0, 15);

  const TREEMAP_H = 340;
  const rects = layoutTreemap(industries, 100, 100);

  const handleCellClick = (industry: string) => {
    setSelected(selected === industry ? null : industry);
  };

  const selectedStocks = selected ? (stocksByIndustry[selected] ?? []) : [];
  const selectedSector = selected ? industries.find(i => i.industry === selected) : null;

  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>法人資金流向（全市場）</span>
        <div style={{ display: 'flex', gap: 0, borderRadius: 5, overflow: 'hidden', border: `1px solid ${c.border}` }}>
          <button onClick={() => setView('treemap')} style={{
            padding: '3px 12px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: view === 'treemap' ? c.accent : 'transparent',
            color: view === 'treemap' ? '#141118' : c.textMuted,
          }}>熱力圖</button>
          <button onClick={() => setView('bars')} style={{
            padding: '3px 12px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: view === 'bars' ? c.accent : 'transparent',
            color: view === 'bars' ? '#141118' : c.textMuted,
          }}>長條圖</button>
        </div>
      </div>

      {/* Treemap view */}
      {view === 'treemap' && (
        <div style={{
          position: 'relative', width: '100%', height: TREEMAP_H,
          borderRadius: 6, overflow: 'hidden',
          background: c.bg,
        }}>
          {rects.map((r) => {
            const g = r.sector;
            const isHover = hovered === g.industry;
            const isSelected = selected === g.industry;
            return (
              <div
                key={g.industry}
                onMouseEnter={() => setHovered(g.industry)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handleCellClick(g.industry)}
                style={{
                  position: 'absolute',
                  left: `${r.x}%`, top: `${r.y}%`,
                  width: `${r.w}%`, height: `${r.h}%`,
                  background: getHeatColor(g.totalNetBuy, maxAbs, c),
                  borderRight: `1px solid ${c.bg}`,
                  borderBottom: `1px solid ${c.bg}`,
                  display: 'flex', flexDirection: 'column',
                  justifyContent: 'center', alignItems: 'center',
                  padding: 4, overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'filter 0.15s',
                  filter: isHover ? 'brightness(1.3)' : 'none',
                  outline: isSelected ? `2px solid ${c.accent}` : 'none',
                  outlineOffset: -2,
                }}
              >
                {r.w > 8 && r.h > 12 && (
                  <>
                    <span style={{
                      fontSize: r.w > 15 ? 12 : 10, fontWeight: 700,
                      color: c.text, lineHeight: 1.2, textAlign: 'center',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>{g.industry}</span>
                    <span style={{
                      fontSize: r.w > 15 ? 13 : 10, fontWeight: 900,
                      color: getTextColor(g.totalNetBuy, maxAbs, c),
                      lineHeight: 1.4,
                    }}>{fmtNetBuy(g.totalNetBuy)}</span>
                  </>
                )}
              </div>
            );
          })}

          {/* Tooltip on hover (only when not selected) */}
          {hovered && !selected && (() => {
            const g = industries.find(i => i.industry === hovered);
            if (!g) return null;
            return (
              <div style={{
                position: 'absolute', bottom: 8, left: 8,
                background: c.bgCard, border: `1px solid ${c.border}`,
                borderRadius: 6, padding: '8px 12px',
                fontSize: 11, lineHeight: 1.6,
                pointerEvents: 'none',
                zIndex: 10,
                minWidth: 160,
              }}>
                <div style={{ fontWeight: 800, color: c.text, fontSize: 13, marginBottom: 2 }}>{g.industry}</div>
                <div style={{ color: c.textMuted }}>{g.stockCount} 支股票</div>
                <div>
                  <span style={{ color: c.textMuted }}>法人合計 </span>
                  <span style={{ fontWeight: 800, color: g.totalNetBuy > 0 ? c.up : g.totalNetBuy < 0 ? c.down : c.textMuted }}>
                    {fmtNetBuy(g.totalNetBuy)} 張
                  </span>
                </div>
                <div>
                  <span style={{ color: c.textMuted }}>外資 </span>
                  <span style={{ fontWeight: 600, color: g.foreignNetBuy > 0 ? c.up : g.foreignNetBuy < 0 ? c.down : c.textMuted }}>
                    {fmtNetBuy(g.foreignNetBuy)}
                  </span>
                  <span style={{ color: c.textMuted, marginLeft: 8 }}>投信 </span>
                  <span style={{ fontWeight: 600, color: g.trustNetBuy > 0 ? c.up : g.trustNetBuy < 0 ? c.down : c.textMuted }}>
                    {fmtNetBuy(g.trustNetBuy)}
                  </span>
                </div>
                {g.topBuyStock && (
                  <div style={{ color: c.textDim, marginTop: 2 }}>
                    買超最多 {g.topBuyStock} {g.topBuyStockName} ({fmtNetBuy(g.topBuyAmount)})
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Bar chart view */}
      {view === 'bars' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {topIndustries.map((g) => {
            const ratio = g.totalNetBuy / maxAbs;
            const barWidth = Math.abs(ratio) * 50;
            const isPositive = g.totalNetBuy > 0;
            const barColor = isPositive ? c.up : c.down;
            const isSelected = selected === g.industry;

            return (
              <div key={g.industry} onClick={() => handleCellClick(g.industry)} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 80px',
                alignItems: 'center', gap: 8, height: 24,
                cursor: 'pointer', borderRadius: 4,
                background: isSelected ? c.accent + '18' : 'transparent',
                padding: '0 4px',
                transition: 'background 0.15s',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: isSelected ? 800 : 600, color: isSelected ? c.accent : c.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textAlign: 'right',
                }}>{g.industry}</span>

                <div style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
                  <div style={{
                    position: 'absolute', left: '50%', top: 0, bottom: 0,
                    width: 1, background: c.border,
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: isPositive ? '50%' : `${50 - barWidth}%`,
                    width: `${barWidth}%`,
                    height: 14, borderRadius: 2,
                    background: barColor + '50',
                    borderLeft: isPositive ? `2px solid ${barColor}` : 'none',
                    borderRight: !isPositive ? `2px solid ${barColor}` : 'none',
                    transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                  }} />
                </div>

                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: isPositive ? c.up : c.down,
                  textAlign: 'left',
                }}>{fmtNetBuy(g.totalNetBuy)} 張</span>
              </div>
            );
          })}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: c.up }}>← 買超</span>
            <span style={{ fontSize: 10, color: c.down }}>賣超 →</span>
          </div>
        </div>
      )}

      {/* Drill-down panel */}
      {selected && selectedSector && (
        <StockDrillDown
          sector={selectedSector}
          stocks={selectedStocks}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Drill-Down Panel ──

function StockDrillDown({ sector, stocks, onClose }: {
  sector: IndustrySector;
  stocks: IndustryStockEntry[];
  onClose: () => void;
}) {
  const c = useColors();
  const [showAll, setShowAll] = useState(false);
  const INITIAL_COUNT = 20;
  const displayed = showAll ? stocks : stocks.slice(0, INITIAL_COUNT);
  const hasMore = stocks.length > INITIAL_COUNT;

  // Find max absolute for bar scaling
  const maxAbs = Math.max(...stocks.map(s => Math.abs(s.totalNetBuy)), 1);

  return (
    <div style={{
      borderTop: `1px solid ${c.border}`,
      paddingTop: 12,
      animation: 'fadeIn 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: c.text }}>{sector.industry}</span>
          <span style={{ fontSize: 11, color: c.textMuted }}>
            {stocks.length} 支有法人交易
          </span>
          <span style={{
            fontSize: 12, fontWeight: 800,
            color: sector.totalNetBuy > 0 ? c.up : sector.totalNetBuy < 0 ? c.down : c.textMuted,
          }}>
            合計 {fmtNetBuy(sector.totalNetBuy)} 張
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 5,
          padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          color: c.textMuted,
        }}>收起</button>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr 80px 80px 80px 80px',
        gap: 4, padding: '0 4px 6px',
        borderBottom: `1px solid ${c.border}`,
      }}>
        {['代號', '名稱', '股價', '外資', '投信', '合計'].map((h, i) => (
          <span key={h} style={{
            fontSize: 10, fontWeight: 700, color: c.textDim,
            textAlign: i >= 2 ? 'right' : 'left',
            letterSpacing: '0.04em',
          }}>{h}</span>
        ))}
      </div>

      {/* Stock rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayed.map((s) => (
          <StockRow key={s.symbol} stock={s} maxAbs={maxAbs} />
        ))}
      </div>

      {/* Show more */}
      {hasMore && !showAll && (
        <button onClick={() => setShowAll(true)} style={{
          background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 6,
          padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          color: c.textMuted, width: '100%', marginTop: 6,
        }}>
          顯示全部 {stocks.length} 支
        </button>
      )}
    </div>
  );
}

function StockRow({ stock, maxAbs }: { stock: IndustryStockEntry; maxAbs: number }) {
  const c = useColors();
  const s = stock;
  const barRatio = Math.abs(s.totalNetBuy) / maxAbs;
  const barWidth = Math.min(barRatio * 100, 100);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '60px 1fr 80px 80px 80px 80px',
      gap: 4, padding: '5px 4px',
      alignItems: 'center',
      borderBottom: `1px solid ${c.border}22`,
      position: 'relative',
    }}>
      {/* Background bar for visual weight */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${barWidth}%`,
        background: s.totalNetBuy > 0 ? c.up + '08' : s.totalNetBuy < 0 ? c.down + '08' : 'transparent',
        pointerEvents: 'none',
      }} />

      <span style={{ fontSize: 12, fontWeight: 700, color: c.accent, position: 'relative' }}>
        {s.symbol}
      </span>
      <span style={{
        fontSize: 11, color: c.textSecondary, position: 'relative',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {s.name}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: c.text, textAlign: 'right', position: 'relative' }}>
        {s.price > 0 ? s.price.toFixed(s.price >= 100 ? 0 : 1) : '—'}
      </span>
      <NetBuyCell value={s.foreignNetBuy} />
      <NetBuyCell value={s.trustNetBuy} />
      <NetBuyCell value={s.totalNetBuy} bold />
    </div>
  );
}

function NetBuyCell({ value, bold }: { value: number; bold?: boolean }) {
  const c = useColors();
  const color = value > 0 ? c.up : value < 0 ? c.down : c.textDim;
  return (
    <span style={{
      fontSize: 11, fontWeight: bold ? 800 : 600, color,
      textAlign: 'right', position: 'relative',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {fmtNetBuy(value)}
    </span>
  );
}

function fmtNetBuy(v: number): string {
  if (v === 0) return '0';
  const sign = v > 0 ? '+' : '';
  if (Math.abs(v) >= 10000) return `${sign}${(v / 10000).toFixed(1)}萬`;
  if (Math.abs(v) >= 1000) return `${sign}${(v / 1000).toFixed(1)}K`;
  return `${sign}${Math.round(v)}`;
}
