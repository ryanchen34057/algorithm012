import { useState } from 'react';
import { scanGap, scanBreakout, scanPeakAttack, scanSuperPerf, scanElitePick, scanMAPullback, scanBullPick, GainPeriod, MarketFilter } from '../services/api';
import { GapAnalysis, BreakoutAnalysis, PeakAttackAnalysis, SuperPerfAnalysis, IndustryHeat, ElitePickAnalysis, MarketStatus, MAPullbackAnalysis, BullPickAnalysis, PatternType, VolumeCondition } from '../types';
import { useColors } from '../components/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import StockRow from '../components/StockRow';
import BreakoutRow from '../components/BreakoutRow';
import PeakAttackRow from '../components/PeakAttackRow';
import SuperPerfRow from '../components/SuperPerfRow';
import IndustryHeatmap from '../components/IndustryHeatmap';
import ElitePickRow from '../components/ElitePickRow';
import MAPullbackRow from '../components/MAPullbackRow';
import BullPickRow from '../components/BullPickRow';
import { downloadGapCsv, downloadBreakoutCsv, downloadPeakAttackCsv, downloadSuperPerfCsv, downloadElitePickCsv, downloadMAPullbackCsv, downloadBullPickCsv } from '../utils/csvExport';

// ── Scanner Tabs ──
type ScannerTab = 'gap' | 'breakout' | 'peakattack' | 'superperf' | 'elitepick' | 'mapullback' | 'bullpick';

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

// ── Peak Attack Scanner Types ──
interface PeakAttackFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  minTodayVol: number;
  peakRangeMax: number;
  minAttackCount: number;
  minVolRatio: number;
}

const PEAK_ATTACK_DEFAULTS: PeakAttackFilter = {
  minPrice: 10, maxPrice: 9999, minVolume: 500,
  minTodayVol: 2000, peakRangeMax: 5,
  minAttackCount: 3, minVolRatio: 1.0,
};

// ── Super Performance Scanner Types ──
interface SuperPerfFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  gainPeriod: GainPeriod;
  minGainPct: number;
  marketFilter: MarketFilter;
}

const SUPERPERF_DEFAULTS: SuperPerfFilter = {
  minPrice: 10, maxPrice: 9999, minVolume: 200,
  gainPeriod: '3m', minGainPct: 0, marketFilter: 'all',
};

// ── Elite Pick Scanner Types ──
interface ElitePickFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  volShrinkMax: number;
  nearHighPct: number;
  rangeMaxPct: number;
  lookbackDays: number;
  maxLoss: number;
  minScore: number;
}

const ELITE_PICK_DEFAULTS: ElitePickFilter = {
  minPrice: 15, maxPrice: 500, minVolume: 300,
  volShrinkMax: 0.8, nearHighPct: 10, rangeMaxPct: 10,
  lookbackDays: 120, maxLoss: 5, minScore: 40,
};

// ── MA Pullback Scanner Types ──
interface MAPullbackFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  pullbackPct: number;
  slopeDays: number;
  minScore: number;
}

const MA_PULLBACK_DEFAULTS: MAPullbackFilter = {
  minPrice: 15, maxPrice: 9999, minVolume: 300,
  pullbackPct: 3, slopeDays: 5, minScore: 50,
};

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
  const [tab, setTab] = useState<ScannerTab>('gap');

  // ── Gap state ──
  const [gapStocks, setGapStocks] = useState<GapAnalysis[]>([]);
  const [gapFilter, setGapFilter] = useState<GapFilter>({ ...GAP_DEFAULTS });

  // ── Breakout state ──
  const [breakoutStocks, setBreakoutStocks] = useState<BreakoutAnalysis[]>([]);
  const [breakoutFilter, setBreakoutFilter] = useState<BreakoutFilter>({ ...BREAKOUT_DEFAULTS });

  // ── Peak Attack state ──
  const [peakAttackStocks, setPeakAttackStocks] = useState<PeakAttackAnalysis[]>([]);
  const [peakAttackFilter, setPeakAttackFilter] = useState<PeakAttackFilter>({ ...PEAK_ATTACK_DEFAULTS });

  // ── Super Perf state ──
  const [superPerfStocks, setSuperPerfStocks] = useState<SuperPerfAnalysis[]>([]);
  const [superPerfIndustries, setSuperPerfIndustries] = useState<IndustryHeat[]>([]);
  const [superPerfFilter, setSuperPerfFilter] = useState<SuperPerfFilter>({ ...SUPERPERF_DEFAULTS });

  // ── Elite Pick state ──
  const [elitePickStocks, setElitePickStocks] = useState<ElitePickAnalysis[]>([]);
  const [elitePickMarket, setElitePickMarket] = useState<MarketStatus | null>(null);
  const [elitePickFilter, setElitePickFilter] = useState<ElitePickFilter>({ ...ELITE_PICK_DEFAULTS });

  // ── MA Pullback state ──
  const [maPullbackStocks, setMaPullbackStocks] = useState<MAPullbackAnalysis[]>([]);
  const [maPullbackFilter, setMaPullbackFilter] = useState<MAPullbackFilter>({ ...MA_PULLBACK_DEFAULTS });

  // ── Bull Pick state ──
  const [bullPickStocks, setBullPickStocks] = useState<BullPickAnalysis[]>([]);
  const [bullPickMarket, setBullPickMarket] = useState<MarketStatus | null>(null);
  const [bullPickFilter, setBullPickFilter] = useState<BullPickFilter>({ ...BULL_PICK_DEFAULTS });

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
      } else if (tab === 'breakout') {
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
      } else if (tab === 'peakattack') {
        const result = await scanPeakAttack({
          minPrice: peakAttackFilter.minPrice, maxPrice: peakAttackFilter.maxPrice,
          minVolume: peakAttackFilter.minVolume, minTodayVol: peakAttackFilter.minTodayVol,
          peakRangeMax: peakAttackFilter.peakRangeMax,
          minAttackCount: peakAttackFilter.minAttackCount,
          minVolRatio: peakAttackFilter.minVolRatio,
        });
        setPeakAttackStocks(result.stocks ?? []);
        setScannedAt(result.scannedAt);
        setTotalScanned(result.scanned);
      } else if (tab === 'superperf') {
        const result = await scanSuperPerf({
          minPrice: superPerfFilter.minPrice, maxPrice: superPerfFilter.maxPrice,
          minVolume: superPerfFilter.minVolume, gainPeriod: superPerfFilter.gainPeriod,
          minGainPct: superPerfFilter.minGainPct, marketFilter: superPerfFilter.marketFilter,
        });
        setSuperPerfStocks(result.stocks ?? []);
        setSuperPerfIndustries(result.industries ?? []);
        setScannedAt(result.scannedAt);
        setTotalScanned(result.scanned);
      } else if (tab === 'elitepick') {
        const result = await scanElitePick({
          minPrice: elitePickFilter.minPrice, maxPrice: elitePickFilter.maxPrice,
          minVolume: elitePickFilter.minVolume, volShrinkMax: elitePickFilter.volShrinkMax,
          nearHighPct: elitePickFilter.nearHighPct, rangeMaxPct: elitePickFilter.rangeMaxPct,
          lookbackDays: elitePickFilter.lookbackDays, maxLoss: elitePickFilter.maxLoss,
          minScore: elitePickFilter.minScore,
        });
        setElitePickStocks(result.stocks ?? []);
        setElitePickMarket(result.market ?? null);
        setScannedAt(result.scannedAt);
        setTotalScanned(result.scanned);
      } else if (tab === 'mapullback') {
        const result = await scanMAPullback({
          minPrice: maPullbackFilter.minPrice, maxPrice: maPullbackFilter.maxPrice,
          minVolume: maPullbackFilter.minVolume, pullbackPct: maPullbackFilter.pullbackPct,
          slopeDays: maPullbackFilter.slopeDays, minScore: maPullbackFilter.minScore,
        });
        setMaPullbackStocks(result.stocks ?? []);
        setScannedAt(result.scannedAt);
        setTotalScanned(result.scanned);
      } else {
        const result = await scanBullPick({
          minPrice: bullPickFilter.minPrice, maxPrice: bullPickFilter.maxPrice,
          minVolume: bullPickFilter.minVolume, distHighMax: bullPickFilter.distHighMax,
          minScore: bullPickFilter.minScore,
        });
        setBullPickStocks(result.stocks ?? []);
        setBullPickMarket(result.market ?? null);
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
    else if (tab === 'breakout') setBreakoutFilter({ ...BREAKOUT_DEFAULTS });
    else if (tab === 'peakattack') setPeakAttackFilter({ ...PEAK_ATTACK_DEFAULTS });
    else if (tab === 'superperf') setSuperPerfFilter({ ...SUPERPERF_DEFAULTS });
    else if (tab === 'elitepick') setElitePickFilter({ ...ELITE_PICK_DEFAULTS });
    else if (tab === 'mapullback') setMaPullbackFilter({ ...MA_PULLBACK_DEFAULTS });
    else setBullPickFilter({ ...BULL_PICK_DEFAULTS });
  };

  return (
    <div style={{ ...S.page, background: c.bg }}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={{ ...S.title, color: c.text }}>台股智慧掃描系統</h1>
          <p style={{ ...S.subtitle, color: c.textMuted }}>
            震撼跳空 · 突破前高 · 攻頂突破 · 超級績效 · 精選突破 · 均線回踩 · 強勢精選
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, background: c.bgCard, borderRadius: 8, padding: 4, border: `1px solid ${c.border}` }}>
        {([['gap', '震撼跳空'], ['breakout', '突破前高'], ['peakattack', '攻頂突破'], ['superperf', '超級績效'], ['elitepick', '精選突破'], ['mapullback', '均線回踩'], ['bullpick', '強勢精選']] as const).map(([key, label]) => (
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
      {tab === 'gap' && (
        <GapFilterBar filter={gapFilter} setFilter={setGapFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      )}
      {tab === 'breakout' && (
        <BreakoutFilterBar filter={breakoutFilter} setFilter={setBreakoutFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      )}
      {tab === 'peakattack' && (
        <PeakAttackFilterBar filter={peakAttackFilter} setFilter={setPeakAttackFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      )}
      {tab === 'superperf' && (
        <SuperPerfFilterBar filter={superPerfFilter} setFilter={setSuperPerfFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      )}
      {tab === 'elitepick' && (
        <ElitePickFilterBar filter={elitePickFilter} setFilter={setElitePickFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      )}
      {tab === 'mapullback' && (
        <MAPullbackFilterBar filter={maPullbackFilter} setFilter={setMaPullbackFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
      )}
      {tab === 'bullpick' && (
        <BullPickFilterBar filter={bullPickFilter} setFilter={setBullPickFilter} loading={loading} onScan={handleScan} onReset={handleReset} />
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
      {tab === 'gap' && (
        <GapResults stocks={gapStocks} filter={gapFilter} setFilter={setGapFilter} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      )}
      {tab === 'breakout' && (
        <BreakoutResults stocks={breakoutStocks} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      )}
      {tab === 'peakattack' && (
        <PeakAttackResults stocks={peakAttackStocks} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      )}
      {tab === 'superperf' && (
        <SuperPerfResults stocks={superPerfStocks} industries={superPerfIndustries} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      )}
      {tab === 'elitepick' && (
        <ElitePickResults stocks={elitePickStocks} market={elitePickMarket} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      )}
      {tab === 'mapullback' && (
        <MAPullbackResults stocks={maPullbackStocks} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
      )}
      {tab === 'bullpick' && (
        <BullPickResults stocks={bullPickStocks} market={bullPickMarket} loading={loading} scannedAt={scannedAt} totalScanned={totalScanned} />
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
          &nbsp;&nbsp;
          <DownloadCsvButton count={filtered.length} onDownload={() => downloadGapCsv(filtered)} />
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
          &nbsp;&nbsp;
          <DownloadCsvButton count={stocks.length} onDownload={() => downloadBreakoutCsv(stocks)} />
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
// ═══════════════════════════════════════════════════════════════════════════
// PEAK ATTACK SCANNER (攻頂突破)
// ═══════════════════════════════════════════════════════════════════════════

function PeakAttackFilterBar({ filter, setFilter, loading, onScan, onReset }: {
  filter: PeakAttackFilter; setFilter: React.Dispatch<React.SetStateAction<PeakAttackFilter>>;
  loading: boolean; onScan: () => void; onReset: () => void;
}) {
  const c = useColors();
  return (
    <>
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低股價（元）" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 10+" />
            <FilterInput label="最高股價（元）" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="預設不限" />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20, 建議 500+" />
            <FilterInput label="最低當日量（張）" value={filter.minTodayVol} onChange={(v) => setFilter((f) => ({ ...f, minTodayVol: v }))} hint="原策略 2000 張" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>攻頂條件</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="攻頂區間最大（%）" value={filter.peakRangeMax} onChange={(v) => setFilter((f) => ({ ...f, peakRangeMax: v }))} hint="原策略 5%" step={0.5} />
            <FilterInput label="最少攻頂次數" value={filter.minAttackCount} onChange={(v) => setFilter((f) => ({ ...f, minAttackCount: v }))} hint="建議 3–5" />
            <FilterInput label="最低量能倍數" value={filter.minVolRatio} onChange={(v) => setFilter((f) => ({ ...f, minVolRatio: v }))} hint="當日量/ADV20" step={0.1} />
          </div>
        </div>
        <ScanActions loading={loading} onScan={onScan} onReset={onReset} />
      </div>

      <div style={S.legend}>
        <LegendItem color="#f59e0b" label="攻頂區間" />
        <LegendItem color={c.up} label="已突破" />
        <LegendItem color={c.blue} label="攻頂次數" />
        <LegendItem color={c.yellow} label="分數越高品質越好" />
      </div>

      <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
        <strong style={{ color: c.text }}>攻頂突破策略說明：</strong><br />
        用 KD(9,3,3) 追蹤每次 K{'>'} D 的攻頂高點，當最近 {filter.minAttackCount} 次攻頂高點在 {filter.peakRangeMax}% 以內（形成天花板），<br />
        一旦股價突破這個天花板 + 當日成交量 {'>'} {filter.minTodayVol} 張 + 量能比 {'>'} {filter.minVolRatio}x → 飆股訊號<br />
        <span style={{ color: c.textMuted }}>
          註：原策略需要主力買賣超 {'>'} 2000 張 & 法人買賣超 {'>'} 1000 張，目前以量能比替代（Yahoo Finance 無法取得籌碼資料）
        </span>
      </div>
    </>
  );
}

function PeakAttackResults({ stocks, loading, scannedAt, totalScanned }: {
  stocks: PeakAttackAnalysis[]; loading: boolean; scannedAt: string; totalScanned: number;
}) {
  const c = useColors();
  const breakingCount = stocks.filter((s) => s.distPct <= 0).length;

  return (
    <>
      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支攻頂突破
          {stocks.length > 0 && (
            <span style={{ color: c.textMuted }}>
              （<span style={{ color: c.up }}>已突破 {breakingCount}</span> / 接近突破 {stocks.length - breakingCount}）
            </span>
          )}
          &nbsp;&nbsp;
          <DownloadCsvButton count={stocks.length} onDownload={() => downloadPeakAttackCsv(stocks)} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((s) => <PeakAttackRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合攻頂突破條件的股票。" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MA PULLBACK SCANNER (均線回踩)
// ═══════════════════════════════════════════════════════════════════════════

function MAPullbackFilterBar({ filter, setFilter, loading, onScan, onReset }: {
  filter: MAPullbackFilter; setFilter: React.Dispatch<React.SetStateAction<MAPullbackFilter>>;
  loading: boolean; onScan: () => void; onReset: () => void;
}) {
  const c = useColors();
  return (
    <>
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低股價（元）" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 15+" />
            <FilterInput label="最高股價（元）" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="預設不限" />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20, 建議 300+" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>回踩條件</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="日線距MA20（%）" value={filter.pullbackPct} onChange={(v) => setFilter((f) => ({ ...f, pullbackPct: v }))} hint="回踩容忍度, 建議 3–5" step={0.5} />
            <FilterInput label="斜率計算天數" value={filter.slopeDays} onChange={(v) => setFilter((f) => ({ ...f, slopeDays: v }))} hint="判斷MA20向上, 建議 5" />
            <FilterInput label="最低分數" value={filter.minScore} onChange={(v) => setFilter((f) => ({ ...f, minScore: v }))} hint="建議 50–70" step={5} />
          </div>
        </div>
        <ScanActions loading={loading} onScan={onScan} onReset={onReset} />
      </div>

      <div style={S.legend}>
        <LegendItem color={c.up} label="三線合一（日/週/月）" />
        <LegendItem color="#f59e0b" label="MA20 向上" />
        <LegendItem color="#8b5cf6" label="MA200 支撐" />
      </div>

      <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
        <strong style={{ color: c.text }}>均線回踩策略（多週期共振）：</strong><br />
        同時檢查日線、週線、月線三個週期：<br />
        ✅ MA20 向上（斜率 {'>'} 0）<br />
        ✅ 收盤價在 MA20 之上（容忍 {filter.pullbackPct}% 以內的回踩）<br />
        ✅ MA20 在 MA200 之上（多頭格局）<br />
        日線剛好拉回到 MA20 附近 = 最佳買點（回踩分數最高）<br />
        <span style={{ color: c.textMuted }}>
          週線/月線從日線資料模擬而成，需較長歷史資料（至少1年）
        </span>
      </div>
    </>
  );
}

function MAPullbackResults({ stocks, loading, scannedAt, totalScanned }: {
  stocks: MAPullbackAnalysis[]; loading: boolean; scannedAt: string; totalScanned: number;
}) {
  const c = useColors();
  const allOKCount = stocks.filter((s) => s.allOk).length;

  return (
    <>
      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支均線回踩
          {allOKCount > 0 && (
            <span style={{ color: c.up }}>（{allOKCount} 支三線合一）</span>
          )}
          &nbsp;&nbsp;
          <DownloadCsvButton count={stocks.length} onDownload={() => downloadMAPullbackCsv(stocks)} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((s) => <MAPullbackRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合均線回踩條件的股票。" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ELITE PICK SCANNER (精選突破)
// ═══════════════════════════════════════════════════════════════════════════

function ElitePickFilterBar({ filter, setFilter, loading, onScan, onReset }: {
  filter: ElitePickFilter; setFilter: React.Dispatch<React.SetStateAction<ElitePickFilter>>;
  loading: boolean; onScan: () => void; onReset: () => void;
}) {
  const c = useColors();
  return (
    <>
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低股價（元）" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 15+" />
            <FilterInput label="最高股價（元）" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="建議 500" />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20, 建議 300+" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>篩選條件</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="量縮比例上限" value={filter.volShrinkMax} onChange={(v) => setFilter((f) => ({ ...f, volShrinkMax: v }))} hint="5日量/20日量, 建議 0.8" step={0.05} />
            <FilterInput label="距前高最大（%）" value={filter.nearHighPct} onChange={(v) => setFilter((f) => ({ ...f, nearHighPct: v }))} hint="建議 5–10" step={1} />
            <FilterInput label="波動收斂上限（%）" value={filter.rangeMaxPct} onChange={(v) => setFilter((f) => ({ ...f, rangeMaxPct: v }))} hint="高點÷1.1, 建議 10" step={1} />
            <FilterInput label="前高回看天數" value={filter.lookbackDays} onChange={(v) => setFilter((f) => ({ ...f, lookbackDays: v }))} hint="建議 60–120" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>部位管理 & 門檻</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="每筆最大虧損（萬）" value={filter.maxLoss} onChange={(v) => setFilter((f) => ({ ...f, maxLoss: v }))} hint="停損回推張數" step={1} />
            <FilterInput label="最低分數" value={filter.minScore} onChange={(v) => setFilter((f) => ({ ...f, minScore: v }))} hint="建議 40–60" step={5} />
          </div>
        </div>
        <ScanActions loading={loading} onScan={onScan} onReset={onReset} />
      </div>

      <div style={S.legend}>
        <LegendItem color="#a78bfa" label="杯型/U型/N型" />
        <LegendItem color="#f59e0b" label="接近前高" />
        <LegendItem color="#22c55e" label="量縮整理" />
        <LegendItem color="#ef4444" label="出場訊號" />
      </div>

      <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
        <strong style={{ color: c.text }}>精選突破策略（評分制，各條件加分排序）：</strong><br />
        ① 量縮 (20分)：5日量/20日量越低越好，{'<'}{(filter.volShrinkMax * 100).toFixed(0)}% 滿分<br />
        ② 快過高 (25分)：距前高越近越好，{'<'}{filter.nearHighPct}% 高分（回看{filter.lookbackDays}日）<br />
        ③ 波動收斂 (20分)：近20日振幅越小越好，{'<'}{filter.rangeMaxPct}% 高分<br />
        ④ 整理型態 (15分)：杯型 {'>'} U型 {'>'} N型<br />
        ⑤ 趨勢排列 (15分)：價格{'>'} MA20 {'>'} MA60 滿分<br />
        ⑥ 風報比加分 (5分) · 最低分數門檻：{filter.minScore} 分<br />
        ⑦⑧ 出場訊號：大量長黑K → 賣一半 / 跌破MA10 → 全賣<br />
        ⑨⑩ 停損回推：依支撐或MA20設停損，最大虧損 {filter.maxLoss} 萬 → 算出張數<br />
        <span style={{ color: c.textMuted }}>⑥ 基本面（營收/獲利年增率）需另接公開資訊觀測站，暫未實作</span>
      </div>
    </>
  );
}

function ElitePickResults({ stocks, market, loading, scannedAt, totalScanned }: {
  stocks: ElitePickAnalysis[]; market: MarketStatus | null;
  loading: boolean; scannedAt: string; totalScanned: number;
}) {
  const c = useColors();
  const sellCount = stocks.filter((s) => s.sellSignal !== '').length;

  return (
    <>
      {/* Market status banner */}
      {market && scannedAt && !loading && (
        <div style={{
          background: market.trend === 'bull' ? c.up + '15' : market.trend === 'bear' ? '#ef444420' : c.bgCard,
          border: `1px solid ${market.trend === 'bull' ? c.up + '44' : market.trend === 'bear' ? '#ef444444' : c.border}`,
          borderRadius: 8, padding: '12px 20px', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div>
            <span style={{ fontSize: 12, color: c.textMuted }}>大盤（加權指數）</span>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>{market.indexPrice.toLocaleString()}</div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <MiniStat label="MA20" value={market.ma20} c={c} />
            <MiniStat label="MA60" value={market.ma60} c={c} />
            <MiniStat label="MA120" value={market.ma120} c={c} />
          </div>
          <div style={{
            fontWeight: 700, fontSize: 14, padding: '4px 12px', borderRadius: 4,
            background: market.trend === 'bull' ? c.up + '22' : market.trend === 'bear' ? '#ef444422' : c.bgInput,
            color: market.trend === 'bull' ? c.up : market.trend === 'bear' ? '#ef4444' : c.textSecondary,
          }}>
            {market.trendLabel}
          </div>
        </div>
      )}

      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支精選突破
          {sellCount > 0 && (
            <span style={{ color: '#ef4444' }}>（{sellCount} 支有出場訊號）</span>
          )}
          &nbsp;&nbsp;
          <DownloadCsvButton count={stocks.length} onDownload={() => downloadElitePickCsv(stocks)} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((s) => <ElitePickRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合精選突破條件的股票。" />
    </>
  );
}

function MiniStat({ label, value, c }: { label: string; value: number; c: ReturnType<typeof useColors> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 10, color: c.textMuted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{value.toLocaleString()}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPER PERFORMANCE SCANNER (超級績效)
// ═══════════════════════════════════════════════════════════════════════════

function SuperPerfFilterBar({ filter, setFilter, loading, onScan, onReset }: {
  filter: SuperPerfFilter; setFilter: React.Dispatch<React.SetStateAction<SuperPerfFilter>>;
  loading: boolean; onScan: () => void; onReset: () => void;
}) {
  const c = useColors();
  return (
    <>
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput label="最低股價（元）" value={filter.minPrice} onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))} hint="建議 10+" />
            <FilterInput label="最高股價（元）" value={filter.maxPrice} onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))} hint="預設不限" />
            <FilterInput label="最低日均量（張）" value={filter.minVolume} onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))} hint="ADV20, 建議 200+" />
          </div>
        </div>
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>排序 & 篩選</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ButtonGroup label="排序漲幅" value={filter.gainPeriod} options={[['1d', '最近收盤'], ['1w', '近1週'], ['1m', '近1月'], ['3m', '近3月'], ['6m', '近6月'], ['ytd', '今年至今']]} onChange={(v) => setFilter((f) => ({ ...f, gainPeriod: v as GainPeriod }))} />
            <ButtonGroup label="市場" value={filter.marketFilter} options={[['all', '全部'], ['listed', '上市'], ['otc', '上櫃']]} onChange={(v) => setFilter((f) => ({ ...f, marketFilter: v as MarketFilter }))} />
            <FilterInput label="最低漲幅（%）" value={filter.minGainPct} onChange={(v) => setFilter((f) => ({ ...f, minGainPct: v }))} hint="排序週期的最低漲幅" step={1} />
          </div>
        </div>
        <ScanActions loading={loading} onScan={onScan} onReset={onReset} />
      </div>

      <div style={S.legend}>
        <LegendItem color="#ef4444" label="VCP 高分（接近突破）" />
        <LegendItem color="#f59e0b" label="VCP 中分（整理中）" />
        <LegendItem color="#3b82f6" label="相對強度排名" />
      </div>

      <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
        <strong style={{ color: c.text }}>超級績效策略說明：</strong><br />
        依{filter.gainPeriod === '1d' ? '最近收盤日' : filter.gainPeriod === '1w' ? '近1週' : filter.gainPeriod === '1m' ? '近1月' : filter.gainPeriod === '3m' ? '近3月' : filter.gainPeriod === '6m' ? '近6月' : '今年至今'}漲幅排序所有台股，再以 VCP（波動收縮）五維度評分：<br />
        趨勢(20) + 波動收縮(30) + 量縮(20) + 接近樞紐(15) + 相對強度(15) = 100 分<br />
        <span style={{ color: c.textMuted }}>每檔股票標示產業分類與概念股標籤，上方顯示產業熱度排行</span>
      </div>
    </>
  );
}

function SuperPerfResults({ stocks, industries, loading, scannedAt, totalScanned }: {
  stocks: SuperPerfAnalysis[]; industries: IndustryHeat[];
  loading: boolean; scannedAt: string; totalScanned: number;
}) {
  const c = useColors();
  return (
    <>
      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支超級績效股
          {industries.length > 0 && (
            <span style={{ color: c.textMuted }}>（涵蓋 {industries.length} 個產業）</span>
          )}
          &nbsp;&nbsp;
          <DownloadCsvButton count={stocks.length} onDownload={() => downloadSuperPerfCsv(stocks)} />
        </div>
      )}

      {/* Industry Heatmap at top */}
      {industries.length > 0 && <IndustryHeatmap industries={industries} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((s) => <SuperPerfRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合超級績效條件的股票。" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BULL PICK SCANNER (強勢精選)
// ═══════════════════════════════════════════════════════════════════════════

function BullPickFilterBar({ filter, setFilter, loading, onScan, onReset }: {
  filter: BullPickFilter; setFilter: React.Dispatch<React.SetStateAction<BullPickFilter>>;
  loading: boolean; onScan: () => void; onReset: () => void;
}) {
  const c = useColors();
  return (
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
      <ScanActions loading={loading} onScan={onScan} onReset={onReset} />
    </div>
  );
}

function BullPickResults({ stocks, market, loading, scannedAt, totalScanned }: {
  stocks: BullPickAnalysis[]; market: MarketStatus | null;
  loading: boolean; scannedAt: string; totalScanned: number;
}) {
  const c = useColors();
  return (
    <>
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

      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支強勢精選
          &nbsp;&nbsp;
          <DownloadCsvButton count={stocks.length} onDownload={() => downloadBullPickCsv(stocks)} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((s) => <BullPickRow key={s.symbol} stock={s} />)}
      </div>

      <EmptyState loading={loading} hasResults={stocks.length > 0} scannedAt={scannedAt} emptyMsg="目前沒有符合強勢精選條件的股票。" />
    </>
  );
}

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
