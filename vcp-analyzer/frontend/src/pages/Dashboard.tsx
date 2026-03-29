import { useState } from 'react';
import { scanGap, scanBreakout } from '../services/api';
import { GapAnalysis, BreakoutAnalysis, PatternType, VolumeCondition } from '../types';
import { useColors } from '../components/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import StockRow from '../components/StockRow';
import BreakoutRow from '../components/BreakoutRow';

// ── Scanner Tabs ──
type ScannerTab = 'gap' | 'breakout';

// ── Gap Scanner Types ──
type DirectionFilter = 'all' | 'long' | 'short';

interface GapFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  minTodayVolume: number;
  minGapPct: number;
  maxGapPct: number;
  strictGap: boolean;
  requireCandle: boolean;
  requireBothMA: boolean;
  direction: DirectionFilter;
}

const GAP_DEFAULTS: GapFilter = {
  minPrice: 10, maxPrice: 500, minVolume: 500, minTodayVolume: 300,
  minGapPct: 1.5, maxGapPct: 40,
  strictGap: false, requireCandle: true, requireBothMA: false,
  direction: 'all',
};

// ── Breakout Scanner Types ──
interface BreakoutFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  lookbackDays: number;
  nearHighPct: number;
  pattern: PatternType;
  volumeFilter: VolumeCondition;
  volumeFactor: number;
}

const BREAKOUT_DEFAULTS: BreakoutFilter = {
  minPrice: 10, maxPrice: 500, minVolume: 300,
  lookbackDays: 120, nearHighPct: 5,
  pattern: 'none', volumeFilter: 'any', volumeFactor: 1.2,
};

export default function Dashboard() {
  const c = useColors();
  const [tab, setTab] = useState<ScannerTab>('gap');

  // ── Gap state ──
  const [gapStocks, setGapStocks] = useState<GapAnalysis[]>([]);
  const [gapFilter, setGapFilter] = useState<GapFilter>({ ...GAP_DEFAULTS });

  // ── Breakout state ──
  const [breakoutStocks, setBreakoutStocks] = useState<BreakoutAnalysis[]>([]);
  const [breakoutFilter, setBreakoutFilter] = useState<BreakoutFilter>({ ...BREAKOUT_DEFAULTS });

  // ── Shared state ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannedAt, setScannedAt] = useState('');
  const [totalScanned, setTotalScanned] = useState(0);

  // ── Handlers ──
  const handleScan = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'gap') {
        const result = await scanGap({
          minVolume: gapFilter.minVolume, minPrice: gapFilter.minPrice,
          maxPrice: gapFilter.maxPrice, minTodayVolume: gapFilter.minTodayVolume,
          minGapPct: gapFilter.minGapPct, maxGapPct: gapFilter.maxGapPct,
          strictGap: gapFilter.strictGap, requireCandle: gapFilter.requireCandle,
          requireBothMA: gapFilter.requireBothMA,
        });
        setGapStocks(result.stocks ?? []);
        setScannedAt(result.scannedAt);
        setTotalScanned(result.scanned);
      } else {
        const result = await scanBreakout({
          minPrice: breakoutFilter.minPrice, maxPrice: breakoutFilter.maxPrice,
          minVolume: breakoutFilter.minVolume, lookbackDays: breakoutFilter.lookbackDays,
          nearHighPct: breakoutFilter.nearHighPct, pattern: breakoutFilter.pattern === 'none' ? undefined : breakoutFilter.pattern,
          volumeFilter: breakoutFilter.volumeFilter === 'any' ? undefined : breakoutFilter.volumeFilter,
          volumeFactor: breakoutFilter.volumeFactor,
        });
        setBreakoutStocks(result.stocks ?? []);
        setScannedAt(result.scannedAt);
        setTotalScanned(result.scanned);
      }
    } catch (e: unknown) {
      setError('掃描失敗：無法連線到後端伺服器，請確認後端是否已啟動');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (tab === 'gap') setGapFilter({ ...GAP_DEFAULTS });
    else setBreakoutFilter({ ...BREAKOUT_DEFAULTS });
  };

  return (
    <div style={{ ...S.page, background: c.bg }}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={{ ...S.title, color: c.text }}>台股智慧掃描系統</h1>
          <p style={{ ...S.subtitle, color: c.textMuted }}>
            震撼型跳空 & 突破前高掃描
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, background: c.bgCard, borderRadius: 8, padding: 4, border: `1px solid ${c.border}` }}>
        {([['gap', '震撼跳空'], ['breakout', '突破前高']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '10px 0', border: 'none', borderRadius: 6,
              background: tab === key ? c.blue : 'transparent',
              color: tab === key ? '#fff' : c.textSecondary,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      {tab === 'gap' ? (
        <GapFilterBar filter={gapFilter} setFilter={setGapFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      ) : (
        <BreakoutFilterBar filter={breakoutFilter} setFilter={setBreakoutFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '12px 16px', borderRadius: 6, fontSize: 14 }}>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ color: c.textSecondary, fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>
          正在從 TWSE / TPEx 抓取上市櫃股票清單，逐一分析中，請耐心等待...
        </div>
      )}

      {/* Results */}
      {tab === 'gap' ? (
        <GapResults stocks={gapStocks} filter={gapFilter} setFilter={setGapFilter} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      ) : (
        <BreakoutResults stocks={breakoutStocks} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAP SCANNER
// ═══════════════════════════════════════════════════════════════════════════

function GapFilterBar({ filter, setFilter, loading, onScan, onReset }: {
  filter: GapFilter; setFilter: React.Dispatch<React.SetStateAction<GapFilter>>;
  loading: boolean; onScan: () => void; onReset: () => void;
}) {
  const c = useColors();
  const gapRefLabel = filter.strictGap ? '跳過昨高/昨低' : '跳過昨收';
  const candleLabel = filter.requireCandle ? '要求昨日K線顏色' : '不限';
  const maLabel = filter.requireBothMA ? 'MA20 且 MA200' : 'MA20 或 MA200';

  return (
    <>
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低股價（元）" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 10–50" />
            <FilterInput label="最高股價（元）" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="建議 100–1000" />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20, 建議 300–1000" />
            <FilterInput label="最低當日量（張）" value={filter.minTodayVolume} onChange={(v) => setFilter((f) => ({ ...f, minTodayVolume: v }))} hint="建議 100–500" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>跳空幅度</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低跳空（%）" value={filter.minGapPct} onChange={(v) => setFilter((f) => ({ ...f, minGapPct: v }))} hint="建議 1–5" step={0.5} />
            <FilterInput label="最高跳空（%）" value={filter.maxGapPct} onChange={(v) => setFilter((f) => ({ ...f, maxGapPct: v }))} hint="建議 20–50" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>嚴格度</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ToggleSwitch label="跳空基準" checked={filter.strictGap} onChange={(v) => setFilter((f) => ({ ...f, strictGap: v }))} onLabel="跳過昨高/昨低（嚴格）" offLabel="跳過昨收（建議）" />
            <ToggleSwitch label="昨日K線" checked={filter.requireCandle} onChange={(v) => setFilter((f) => ({ ...f, requireCandle: v }))} onLabel="要求陰/陽線" offLabel="不限顏色" />
            <ToggleSwitch label="均線條件" checked={filter.requireBothMA} onChange={(v) => setFilter((f) => ({ ...f, requireBothMA: v }))} onLabel="同時符合 MA20 & MA200" offLabel="任一即可（建議）" />
            <ButtonGroup label="方向篩選" value={filter.direction} options={[['all', '全部'], ['long', '做多'], ['short', '做空']]} onChange={(v) => setFilter((f) => ({ ...f, direction: v as DirectionFilter }))} />
          </div>
        </div>
        <ScanActions loading={loading} onScan={onScan} onReset={onReset} />
      </div>

      {/* Legend */}
      <div style={S.legend}>
        <LegendItem color={c.up} label="Gap Up (做多訊號)" />
        <LegendItem color={c.down} label="Gap Down (做空訊號)" />
        <LegendItem color={c.yellow} label="分數越高品質越好" />
      </div>

      {/* Summary */}
      <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
        <strong style={{ color: c.text }}>目前篩選條件：</strong><br />
        股價 TWD {filter.minPrice}–{filter.maxPrice} · ADV20 {'>'} {filter.minVolume} 張 · 當日成交量 {'>'} {filter.minTodayVolume} 張 · 跳空幅度 {filter.minGapPct}%–{filter.maxGapPct}%<br />
        跳空基準：{gapRefLabel} · 昨日K線：{candleLabel} · 均線：{maLabel}<br />
        Gap Up：{filter.requireCandle ? '昨日陰線 + ' : ''}今開 {'>'} {filter.strictGap ? '昨高' : '昨收'} + 今開 {'>'} {maLabel}<br />
        Gap Down：{filter.requireCandle ? '昨日陽線 + ' : ''}今開 {'<'} {filter.strictGap ? '昨低' : '昨收'} + 今開 {'<'} {maLabel}
      </div>
    </>
  );
}

function GapResults({ stocks, filter, setFilter, loading, scannedAt, totalScanned }: {
  stocks: GapAnalysis[]; filter: GapFilter; setFilter: React.Dispatch<React.SetStateAction<GapFilter>>;
  loading: boolean; scannedAt: string; totalScanned: number;
}) {
  const c = useColors();
  const filtered = stocks.filter((g) => filter.direction === 'all' || g.direction === filter.direction);
  const longCount = stocks.filter((g) => g.direction === 'long').length;
  const shortCount = stocks.filter((g) => g.direction === 'short').length;

  return (
    <>
      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支震撼型跳空
          <span style={{ color: c.textMuted }}>
            （<span style={{ color: c.up }}>做多 {longCount}</span> / <span style={{ color: c.down }}>做空 {shortCount}</span>）
          </span>
          {filter.direction !== 'all' && (
            <span style={{ color: c.blue }}> → 顯示 {filtered.length} 支（{filter.direction === 'long' ? '做多' : '做空'}）</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {filtered.map((gap) => <StockRow key={gap.symbol} gap={gap} />)}
      </div>

      {filtered.length === 0 && stocks.length > 0 && !loading && scannedAt && (
        <div style={{ ...S.empty, color: c.textDim }}>
          目前篩選方向「{filter.direction === 'long' ? '做多' : '做空'}」下沒有符合條件的股票。
          <br />
          <button
            onClick={() => setFilter((f) => ({ ...f, direction: 'all' }))}
            style={{ background: c.blue, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', marginTop: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            切換為「全部」顯示所有 {stocks.length} 支
          </button>
        </div>
      )}

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合震撼型跳空條件的股票。" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BREAKOUT SCANNER
// ═══════════════════════════════════════════════════════════════════════════

function BreakoutFilterBar({ filter, setFilter, loading, onScan, onReset }: {
  filter: BreakoutFilter; setFilter: React.Dispatch<React.SetStateAction<BreakoutFilter>>;
  loading: boolean; onScan: () => void; onReset: () => void;
}) {
  const c = useColors();
  const volLabel = filter.volumeFilter === 'expand' ? '量增' : filter.volumeFilter === 'shrink' ? '量縮' : '不限';

  return (
    <>
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低股價（元）" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 10–50" />
            <FilterInput label="最高股價（元）" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="建議 100–1000" />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20, 建議 300+" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>突破條件</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="回看天數" value={filter.lookbackDays} onChange={(v) => setFilter((f) => ({ ...f, lookbackDays: v }))} hint="找前高範圍，建議 60–120" />
            <FilterInput label="距前高（%）" value={filter.nearHighPct} onChange={(v) => setFilter((f) => ({ ...f, nearHighPct: v }))} hint="建議 3–10" step={0.5} />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>篩選條件</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ButtonGroup label="底部型態" value={filter.pattern} options={[['none', '不限'], ['w_bottom', 'W底'], ['v_bottom', 'V底']]} onChange={(v) => setFilter((f) => ({ ...f, pattern: v as PatternType }))} />
            <ButtonGroup label="量能條件" value={filter.volumeFilter} options={[['any', '不限'], ['expand', '量增'], ['shrink', '量縮']]} onChange={(v) => setFilter((f) => ({ ...f, volumeFilter: v as VolumeCondition }))} />
            <FilterInput label="量能倍數" value={filter.volumeFactor} onChange={(v) => setFilter((f) => ({ ...f, volumeFactor: v }))} hint="量增: >此倍數, 量縮: <1/此倍數" step={0.1} />
          </div>
        </div>
        <ScanActions loading={loading} onScan={onScan} onReset={onReset} />
      </div>

      {/* Legend */}
      <div style={S.legend}>
        <LegendItem color="#a78bfa" label="W底（雙底）" />
        <LegendItem color="#22d3ee" label="V底（V型反轉）" />
        <LegendItem color={c.up} label="接近前高" />
        <LegendItem color={c.yellow} label="分數越高品質越好" />
      </div>

      {/* Summary */}
      <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
        <strong style={{ color: c.text }}>目前篩選條件：</strong><br />
        股價 TWD {filter.minPrice}–{filter.maxPrice} · ADV20 {'>'} {filter.minVolume} 張<br />
        前高回看 {filter.lookbackDays} 日 · 距前高 {'<'} {filter.nearHighPct}%<br />
        趨勢要求：收盤 {'>'} MA20 且 MA20 {'>'} MA200（上升趨勢）<br />
        底部型態：{filter.pattern === 'w_bottom' ? 'W底' : filter.pattern === 'v_bottom' ? 'V底' : '不限'} · 量能：{volLabel}
        {filter.volumeFilter !== 'any' && ` (${filter.volumeFactor}x)`}
      </div>
    </>
  );
}

function BreakoutResults({ stocks, loading, scannedAt, totalScanned }: {
  stocks: BreakoutAnalysis[]; loading: boolean; scannedAt: string; totalScanned: number;
}) {
  const c = useColors();
  const wCount = stocks.filter((s) => s.pattern === 'w_bottom').length;
  const vCount = stocks.filter((s) => s.pattern === 'v_bottom').length;

  return (
    <>
      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支接近突破前高
          {stocks.length > 0 && (
            <span style={{ color: c.textMuted }}>
              （<span style={{ color: '#a78bfa' }}>W底 {wCount}</span> / <span style={{ color: '#22d3ee' }}>V底 {vCount}</span> / 其他 {stocks.length - wCount - vCount}）
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((s) => <BreakoutRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合突破前高條件的股票。" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function EmptyState({ loading, hasResults, scannedAt, emptyMsg }: { loading: boolean; hasResults: boolean; scannedAt: string; emptyMsg: string }) {
  const c = useColors();
  if (hasResults || loading) return null;
  if (scannedAt) {
    return (
      <div style={{ ...S.empty, color: c.textDim }}>
        {emptyMsg}<br />可以調整篩選條件後再試。
      </div>
    );
  }
  return (
    <div style={{ ...S.empty, color: c.textDim }}>
      點擊「掃描全市場」開始分析台灣上市櫃股票。<br />
      <span style={{ fontSize: 13 }}>系統會從 TWSE / TPEx 抓取完整股票清單，再逐一分析。</span>
    </div>
  );
}

function ScanActions({ loading, onScan, onReset }: { loading: boolean; onScan: () => void; onReset: () => void }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 4 }}>
      <button onClick={onScan} disabled={loading} style={{ ...S.scanBtn, background: c.blue, opacity: loading ? 0.7 : 1 }}>
        {loading ? (<><span style={S.spinner} />掃描中...</>) : '掃描全市場'}
      </button>
      <button onClick={onReset} style={{ ...S.resetBtn, borderColor: c.border, color: c.textSecondary }}>重設預設</button>
    </div>
  );
}

function ButtonGroup({ label, value, options, onChange }: {
  label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void;
}) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: c.textSecondary, fontSize: 12, minWidth: 50 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            style={{
              background: value === val ? c.blue : 'transparent',
              color: value === val ? '#fff' : c.textSecondary,
              border: `1px solid ${value === val ? c.blue : c.border}`,
              borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterInput({ label, value, onChange, hint, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string; step?: number;
}) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: c.textSecondary, fontSize: 12 }}>{label}</label>
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, fontSize: 15, padding: '7px 12px', outline: 'none', width: 120 }} />
      {hint && <span style={{ color: c.textDim, fontSize: 11 }}>{hint}</span>}
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange, onLabel, offLabel }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; onLabel: string; offLabel: string;
}) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }} onClick={() => onChange(!checked)}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: checked ? c.blue : c.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: checked ? 18 : 2, transition: 'left 0.2s' }} />
      </div>
      <span style={{ color: c.textSecondary, fontSize: 12, minWidth: 50 }}>{label}</span>
      <span style={{ color: checked ? c.blue : c.textMuted, fontSize: 12, fontWeight: 600 }}>{checked ? onLabel : offLabel}</span>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 12, height: 12, borderRadius: 2, background: color }} />
      <span style={{ color: c.textSecondary, fontSize: 13 }}>{label}</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh', transition: 'background-color 0.2s' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 },
  title: { margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' },
  subtitle: { margin: '4px 0 0', fontSize: 15 },
  filterBar: { display: 'flex', alignItems: 'flex-start', gap: 24, padding: '16px 20px', borderRadius: 8, flexWrap: 'wrap', border: '1px solid transparent' },
  filterGroup: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  filterGroupLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  filterGroupInputs: { display: 'flex', gap: 16, flexWrap: 'wrap' as const },
  scanBtn: { display: 'flex', alignItems: 'center', gap: 8, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  resetBtn: { background: 'transparent', border: '1px solid', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer' },
  spinner: { display: 'inline-block', width: 14, height: 14, border: '2px solid #ffffff44', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  legend: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  empty: { textAlign: 'center', padding: '60px 0', fontSize: 15, lineHeight: 2 },
};
