import { useState } from 'react';
import { scanBullPick } from '../services/api';
import { BullPickAnalysis, MarketStatus } from '../types';
import { useColors } from '../components/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import BullPickRow from '../components/BullPickRow';
import { downloadBullPickCsv } from '../utils/csvExport';

// ── Bull Pick Scanner Types ──
interface BullPickFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  distHighMax: number;
  minScore: number;
}

const BULL_PICK_DEFAULTS: BullPickFilter = {
  minPrice: 15, maxPrice: 9999, minVolume: 300,
  distHighMax: 10, minScore: 40,
};

export default function Dashboard() {
  const c = useColors();

  // ── Bull Pick state ──
  const [stocks, setStocks] = useState<BullPickAnalysis[]>([]);
  const [market, setMarket] = useState<MarketStatus | null>(null);
  const [filter, setFilter] = useState<BullPickFilter>({ ...BULL_PICK_DEFAULTS });

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
      const result = await scanBullPick({
        minPrice: filter.minPrice, maxPrice: filter.maxPrice,
        minVolume: filter.minVolume, distHighMax: filter.distHighMax,
        minScore: filter.minScore,
      });
      setStocks(result.stocks ?? []);
      setMarket(result.market ?? null);
      setScannedAt(result.scannedAt);
      setTotalScanned(result.scanned);
    } catch (e: unknown) {
      setError('掃描失敗：無法連線到後端伺服器，請確認後端是否已啟動');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFilter({ ...BULL_PICK_DEFAULTS });
  };

  return (
    <div style={{ ...S.page, background: c.bg }}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={{ ...S.title, color: c.text }}>台股強勢精選掃描系統</h1>
          <p style={{ ...S.subtitle, color: c.textMuted }}>
            線型多頭 · 距歷史高點10%內 · 主力買超 · 年營收高成長
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Filter bar */}
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低股價（元）" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 15+" />
            <FilterInput label="最高股價（元）" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="不限" />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20, 建議 300+" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>篩選條件</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="距歷史高點上限（%）" value={filter.distHighMax} onChange={(v) => setFilter((f) => ({ ...f, distHighMax: v }))} hint="建議 10" />
            <FilterInput label="最低分數" value={filter.minScore} onChange={(v) => setFilter((f) => ({ ...f, minScore: v }))} hint="0-100, 建議 40" />
          </div>
        </div>
        <ScanActions loading={loading} onScan={handleScan} onReset={handleReset} />
      </div>

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

      {/* Market status */}
      {market && (
        <div style={{
          background: market.trend === 'bull' ? '#16a34a15' : market.trend === 'bear' ? '#ef444415' : c.bgCard,
          border: `1px solid ${market.trend === 'bull' ? '#16a34a33' : market.trend === 'bear' ? '#ef444433' : c.border}`,
          borderRadius: 8, padding: '10px 16px', fontSize: 13,
          color: market.trend === 'bull' ? '#16a34a' : market.trend === 'bear' ? '#ef4444' : c.textSecondary,
        }}>
          大盤趨勢：{market.trendLabel} &nbsp;（加權指數 {market.indexPrice} · MA20 {market.ma20} · MA60 {market.ma60}）
        </div>
      )}

      {/* Results summary */}
      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支強勢精選
          &nbsp;&nbsp;
          <DownloadCsvButton count={stocks.length} onDownload={() => downloadBullPickCsv(stocks)} />
        </div>
      )}

      {/* Stock cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((s) => <BullPickRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合強勢精選條件的股票。" />
    </div>
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

function DownloadCsvButton({ count, onDownload }: { count: number; onDownload: () => void }) {
  const c = useColors();
  if (count === 0) return null;
  return (
    <button onClick={onDownload} style={{
      background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 6,
      padding: '5px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      color: c.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 15 }}>&#8681;</span>
      下載 CSV（{count} 筆）
    </button>
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
  empty: { textAlign: 'center', padding: '60px 0', fontSize: 15, lineHeight: 2 },
};
