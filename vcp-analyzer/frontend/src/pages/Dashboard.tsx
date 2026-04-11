import { useState, useEffect } from 'react';
import { scanBullPick, fetchIndustryFlow } from '../services/api';
import { BullPickAnalysis, MarketStatus, IndustrySector, IndustryStockEntry } from '../types';
import { useColors } from '../components/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import BullPickRow from '../components/BullPickRow';
import { downloadBullPickCsv } from '../utils/csvExport';
import IndustryHeatmap from '../components/IndustryHeatmap';
import MarketOverview from '../components/MarketOverview';

// ── Bull Pick Scanner Types ──
interface BullPickFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  distHighMax: number;
  minScore: number;
  requireVolShrink: boolean;
  excludeFinancial: boolean;
}

const BULL_PICK_DEFAULTS: BullPickFilter = {
  minPrice: 15, maxPrice: 9999, minVolume: 300,
  distHighMax: 10, minScore: 40, requireVolShrink: false, excludeFinancial: true,
};

const RANK_TIERS = [
  { label: 'SSS', min: 90, max: 101, color: '#e5a100' },
  { label: 'SS', min: 80, max: 90, color: '#d97706' },
  { label: 'S', min: 70, max: 80, color: '#ef4444' },
  { label: 'A', min: 60, max: 70, color: '#8b6cc1' },
  { label: 'B', min: 50, max: 60, color: '#6889ff' },
];

export default function Dashboard() {
  const c = useColors();

  const [stocks, setStocks] = useState<BullPickAnalysis[]>([]);
  const [market, setMarket] = useState<MarketStatus | null>(null);
  const [industries, setIndustries] = useState<IndustrySector[]>([]);
  const [stocksByIndustry, setStocksByIndustry] = useState<Record<string, IndustryStockEntry[]>>({});
  const [filter, setFilter] = useState<BullPickFilter>({ ...BULL_PICK_DEFAULTS });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannedAt, setScannedAt] = useState('');
  const [totalScanned, setTotalScanned] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [latestDate, setLatestDate] = useState('');

  // Auto-load industry flow on mount (no scan needed)
  useEffect(() => {
    fetchIndustryFlow()
      .then((flowData) => {
        if (flowData.sectors.length > 0) {
          setIndustries(flowData.sectors);
          setStocksByIndustry(flowData.stocksByIndustry);
        }
      })
      .catch(() => {});
  }, []);

  const handleScan = async () => {
    setLoading(true);
    setError('');
    setProgress({ done: 0, total: 0 });
    try {
      const result = await scanBullPick(
        {
          minPrice: filter.minPrice, maxPrice: filter.maxPrice,
          minVolume: filter.minVolume, distHighMax: filter.distHighMax,
          minScore: filter.minScore, requireVolShrink: filter.requireVolShrink,
          excludeFinancial: filter.excludeFinancial,
        },
        (done, total) => setProgress({ done, total }),
      );
      setStocks(result.stocks ?? []);
      setMarket(result.market ?? null);
      setIndustries(result.industries ?? []);
      setStocksByIndustry(result.stocksByIndustry ?? {});
      setScannedAt(result.scannedAt);
      setTotalScanned(result.scanned);
      setLatestDate(result.latestDate ?? '');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`掃描失敗：${msg}`);
      console.error('[scan error]', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => setFilter({ ...BULL_PICK_DEFAULTS });

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{
      maxWidth: 1100, margin: '0 auto', padding: '40px 20px',
      display: 'flex', flexDirection: 'column', gap: 20,
      minHeight: '100vh',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 900, color: c.text,
            letterSpacing: '-0.03em', lineHeight: 1.2,
          }}>
            台股強勢精選
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: c.textMuted, lineHeight: 1.6 }}>
            線型多頭 · 距歷史高點 10% 內 · 主力買超 · 年營收高成長
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Notice */}
      <div style={{
        background: c.yellow + '0c', borderLeft: `3px solid ${c.yellow}`,
        padding: '8px 14px', fontSize: 12, color: c.textSecondary, lineHeight: 1.6,
      }}>
        本系統只顯示最新的盤後收盤資料，不是即時報價。建議於收盤後（下午 2:00 後）使用。
      </div>

      {/* Global indices */}
      <MarketOverview />

      {/* Industry money flow — always visible */}
      <IndustryHeatmap industries={industries} stocksByIndustry={stocksByIndustry} />

      {/* Filter bar */}
      <div style={{
        background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
        padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <FilterGroup label="價格 & 成交量">
            <FilterInput label="最低股價" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 15+" c={c} />
            <FilterInput label="最高股價" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="不限" c={c} />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20" c={c} />
          </FilterGroup>
          <FilterGroup label="篩選條件">
            <FilterInput label="距高點上限 %" value={filter.distHighMax} onChange={(v) => setFilter((f) => ({ ...f, distHighMax: v }))} hint="建議 10" c={c} />
            <FilterInput label="最低分數" value={filter.minScore} onChange={(v) => setFilter((f) => ({ ...f, minScore: v }))} hint="0-100" c={c} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'flex-end' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                fontSize: 12, color: filter.requireVolShrink ? c.accent : c.textSecondary,
                fontWeight: filter.requireVolShrink ? 700 : 400,
                userSelect: 'none',
              }}>
                <input type="checkbox" checked={filter.requireVolShrink}
                  onChange={(e) => setFilter((f) => ({ ...f, requireVolShrink: e.target.checked }))}
                  style={{ accentColor: c.accent, width: 14, height: 14, cursor: 'pointer' }} />
                5日量縮
              </label>
              <span style={{ color: c.textDim, fontSize: 10 }}>近5日均量 &lt; 20日均量</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'flex-end' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                fontSize: 12, color: filter.excludeFinancial ? c.accent : c.textSecondary,
                fontWeight: filter.excludeFinancial ? 700 : 400,
                userSelect: 'none',
              }}>
                <input type="checkbox" checked={filter.excludeFinancial}
                  onChange={(e) => setFilter((f) => ({ ...f, excludeFinancial: e.target.checked }))}
                  style={{ accentColor: c.accent, width: 14, height: 14, cursor: 'pointer' }} />
                排除金融股
              </label>
              <span style={{ color: c.textDim, fontSize: 10 }}>金融保險業</span>
            </div>
          </FilterGroup>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={handleScan} disabled={loading} style={{
            background: c.accent, color: '#141118', border: 'none', borderRadius: 8,
            padding: '10px 28px', fontSize: 15, fontWeight: 800, cursor: 'pointer',
            opacity: loading ? 0.7 : 1, letterSpacing: '0.01em',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {loading ? (<><span style={{
              display: 'inline-block', width: 14, height: 14,
              border: '2px solid #14111844', borderTopColor: '#141118',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />掃描中...</>) : '掃描全市場'}
          </button>
          <button onClick={handleReset} style={{
            background: 'transparent', border: `1px solid ${c.border}`,
            borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', color: c.textSecondary,
          }}>重設</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#ef44440c', borderLeft: '3px solid #ef4444',
          color: '#ef4444', padding: '10px 14px', fontSize: 13,
        }}>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
          padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ color: c.textSecondary, fontSize: 13, fontWeight: 600 }}>
            正在掃描全市場股票...
          </div>
          {progress.total > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: c.textMuted }}>{progress.done} / {progress.total}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: c.accent }}>{pct}%</span>
              </div>
              <div style={{ background: c.border, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  background: c.accent, height: '100%', borderRadius: 4,
                  width: `${pct}%`,
                  transition: 'width 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Market status */}
      {market && (
        <div style={{
          borderLeft: `3px solid ${market.trend === 'bull' ? c.up : market.trend === 'bear' ? c.down : c.textMuted}`,
          padding: '8px 14px', fontSize: 13, lineHeight: 1.6,
          color: market.trend === 'bull' ? c.up : market.trend === 'bear' ? c.down : c.textSecondary,
        }}>
          大盤趨勢：<strong>{market.trendLabel}</strong> （加權 {market.indexPrice} · MA20 {market.ma20} · MA60 {market.ma60}）
        </div>
      )}

      {/* Results summary */}
      {scannedAt && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {totalScanned < 1000 && (
            <div style={{
              background: '#ef44440c', borderLeft: '3px solid #ef4444',
              padding: '8px 12px', fontSize: 12, color: '#ef4444', fontWeight: 600,
            }}>
              僅掃描到 {totalScanned} 支股票（正常約 1700 支）。TWSE 資料可能抓取失敗，建議稍後重新掃描。
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: c.text }}>
                {totalScanned} 支掃描 →{' '}
                <span style={{ color: c.accent, fontSize: 20 }}>{stocks.length}</span> 支精選
              </span>
              {stocks.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {RANK_TIERS.map(({ label, min, max, color }) => {
                    const count = stocks.filter(s => s.score >= min && s.score < max).length;
                    if (count === 0) return null;
                    return (
                      <span key={label} style={{
                        fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                        background: color + '18', color, letterSpacing: '0.03em',
                      }}>
                        {label} {count}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: c.textMuted }}>
                {new Date(scannedAt).toLocaleString('zh-TW')}
                {latestDate && ` · 資料 ${latestDate}`}
              </span>
              {stocks.length > 0 && (
                <button onClick={() => downloadBullPickCsv(stocks)} style={{
                  background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 6,
                  padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  color: c.textSecondary,
                }}>CSV</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {stocks.map((s) => <BullPickRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function EmptyState({ loading, hasResults, scannedAt }: { loading: boolean; hasResults: boolean; scannedAt: string }) {
  const c = useColors();
  if (hasResults || loading) return null;
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: c.textDim, fontSize: 14, lineHeight: 2 }}>
      {scannedAt
        ? <>目前沒有符合條件的股票，可調整篩選後再試。</>
        : <>點擊「掃描全市場」開始分析台灣上市櫃股票。</>}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function FilterInput({ label, value, onChange, hint, c }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string; c: ReturnType<typeof useColors>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ color: c.textSecondary, fontSize: 11 }}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: c.bgInput, border: `1px solid ${c.border}`, borderRadius: 6,
          color: c.text, fontSize: 14, fontWeight: 600, padding: '7px 10px',
          outline: 'none', width: 110,
        }} />
      {hint && <span style={{ color: c.textDim, fontSize: 10 }}>{hint}</span>}
    </div>
  );
}
