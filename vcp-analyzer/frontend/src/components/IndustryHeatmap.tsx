import { useState } from 'react';
import { IndustrySector } from '../types';
import { useColors, ThemeColors } from './ThemeContext';

interface Props {
  industries: IndustrySector[];
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

  // Sort descending by absolute net buy
  const sorted = [...sectors]
    .filter(s => s.totalNetBuy !== 0)
    .sort((a, b) => Math.abs(b.totalNetBuy) - Math.abs(a.totalNetBuy));

  if (sorted.length === 0) return [];

  const totalValue = sorted.reduce((sum, s) => sum + Math.abs(s.totalNetBuy), 0);
  if (totalValue === 0) return [];

  // Normalized values (area proportional to absolute net buy)
  const items = sorted.map(s => ({
    sector: s,
    value: Math.abs(s.totalNetBuy) / totalValue,
  }));

  const rects: TreemapRect[] = [];
  squarify(items, 0, 0, width, height, rects);
  return rects;
}

function squarify(
  items: { sector: IndustrySector; value: number }[],
  x: number, y: number, w: number, h: number,
  rects: TreemapRect[],
) {
  if (items.length === 0) return;
  if (items.length === 1) {
    rects.push({ sector: items[0].sector, x, y, w, h });
    return;
  }

  const totalValue = items.reduce((s, i) => s + i.value, 0);
  if (totalValue === 0) return;

  // Lay out along the shorter side
  const vertical = w >= h;
  const side = vertical ? h : w;

  let rowItems: typeof items = [];
  let rowValue = 0;
  let bestAspect = Infinity;

  for (let i = 0; i < items.length; i++) {
    const testItems = [...rowItems, items[i]];
    const testValue = rowValue + items[i].value;
    const aspect = worstAspect(testItems.map(it => it.value), testValue, totalValue, side, vertical ? w : h);

    if (aspect <= bestAspect) {
      rowItems = testItems;
      rowValue = testValue;
      bestAspect = aspect;
    } else {
      // Lay out current row
      const rowFrac = rowValue / totalValue;
      const rowSize = (vertical ? w : h) * rowFrac;

      let offset = 0;
      for (const item of rowItems) {
        const frac = item.value / rowValue;
        const itemSize = side * frac;
        if (vertical) {
          rects.push({ sector: item.sector, x: x + offset * 0, y: y + offset * 0, w: rowSize, h: itemSize });
          // Actually lay out correctly
        } else {
          // horizontal
        }
      }

      // Reset — use simpler slice approach
      break;
    }
  }

  // Simpler approach: slice-and-dice
  rects.length = 0;
  sliceLayout(items, x, y, w, h, rects, true);
}

function worstAspect(values: number[], rowTotal: number, total: number, side: number, otherSide: number): number {
  const rowSize = otherSide * (rowTotal / total);
  if (rowSize === 0) return Infinity;
  let worst = 0;
  for (const v of values) {
    const frac = v / rowTotal;
    const itemLen = side * frac;
    const aspect = Math.max(rowSize / itemLen, itemLen / rowSize);
    if (aspect > worst) worst = aspect;
  }
  return worst;
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

  // For better aspect ratios: split into two groups of roughly equal total value
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
  // Stronger flow = more saturated color
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

export default function IndustryHeatmap({ industries }: Props) {
  const c = useColors();
  const [view, setView] = useState<ViewMode>('treemap');
  const [hovered, setHovered] = useState<string | null>(null);

  if (industries.length === 0) return null;

  const maxAbs = Math.max(...industries.map(g => Math.abs(g.totalNetBuy)), 1);

  // Top industries for bar chart (top 15 by absolute net buy)
  const topIndustries = [...industries]
    .filter(g => g.totalNetBuy !== 0)
    .sort((a, b) => Math.abs(b.totalNetBuy) - Math.abs(a.totalNetBuy))
    .slice(0, 15);

  // Treemap rects
  const TREEMAP_H = 340;
  const rects = layoutTreemap(industries, 100, 100); // percent-based

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
            return (
              <div
                key={g.industry}
                onMouseEnter={() => setHovered(g.industry)}
                onMouseLeave={() => setHovered(null)}
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
                  cursor: 'default',
                  transition: 'filter 0.15s',
                  filter: isHover ? 'brightness(1.3)' : 'none',
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

          {/* Tooltip on hover */}
          {hovered && (() => {
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
            const ratio = g.totalNetBuy / maxAbs; // -1 to 1
            const barWidth = Math.abs(ratio) * 50; // max 50% width
            const isPositive = g.totalNetBuy > 0;
            const barColor = isPositive ? c.up : c.down;

            return (
              <div key={g.industry} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 80px',
                alignItems: 'center', gap: 8, height: 24,
              }}>
                {/* Industry name */}
                <span style={{
                  fontSize: 11, fontWeight: 600, color: c.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textAlign: 'right',
                }}>{g.industry}</span>

                {/* Bar */}
                <div style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
                  {/* Center line */}
                  <div style={{
                    position: 'absolute', left: '50%', top: 0, bottom: 0,
                    width: 1, background: c.border,
                  }} />
                  {/* Bar fill */}
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

                {/* Value */}
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: isPositive ? c.up : c.down,
                  textAlign: 'left',
                }}>{fmtNetBuy(g.totalNetBuy)} 張</span>
              </div>
            );
          })}

          {/* Legend */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: c.up }}>← 買超</span>
            <span style={{ fontSize: 10, color: c.down }}>賣超 →</span>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtNetBuy(v: number): string {
  if (v === 0) return '0';
  const sign = v > 0 ? '+' : '';
  if (Math.abs(v) >= 10000) return `${sign}${(v / 10000).toFixed(1)}萬`;
  if (Math.abs(v) >= 1000) return `${sign}${(v / 1000).toFixed(1)}K`;
  return `${sign}${Math.round(v)}`;
}
