import { useState } from 'react';
import { scanGap } from '../services/api';
import { GapAnalysis } from '../types';
import { useColors } from '../components/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import StockRow from '../components/StockRow';

interface ScanFilter {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  minTodayVolume: number;
  minGapPct: number;
  maxGapPct: number;
}

const DEFAULTS: ScanFilter = {
  minPrice: 10,
  maxPrice: 500,
  minVolume: 500,
  minTodayVolume: 300,
  minGapPct: 3,
  maxGapPct: 40,
};

export default function Dashboard() {
  const c = useColors();
  const [stocks, setStocks] = useState<GapAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannedAt, setScannedAt] = useState('');
  const [totalScanned, setTotalScanned] = useState(0);
  const [filter, setFilter] = useState<ScanFilter>({ ...DEFAULTS });

  const handleScan = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await scanGap({
        minVolume: filter.minVolume,
        minPrice: filter.minPrice,
        maxPrice: filter.maxPrice,
        minTodayVolume: filter.minTodayVolume,
        minGapPct: filter.minGapPct,
        maxGapPct: filter.maxGapPct,
      });
      setStocks(result.stocks ?? []);
      setScannedAt(result.scannedAt);
      setTotalScanned(result.scanned);
    } catch (e: unknown) {
      setError('掃描失敗：無法連線到後端伺服器，請確認後端是否已啟動');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => setFilter({ ...DEFAULTS });

  return (
    <div style={{ ...S.page, background: c.bg }}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={{ ...S.title, color: c.text }}>台股震撼跳空掃描系統</h1>
          <p style={{ ...S.subtitle, color: c.textMuted }}>
            自動偵測符合「震撼型跳空」條件的台灣上市櫃股票（Gap Up 做多 / Gap Down 做空）
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Filter bar */}
      <div style={{ ...S.filterBar, background: c.bgCard, borderColor: c.border }}>
        {/* Group 1: Price & Volume */}
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>價格 & 成交量</span>
          <div style={S.filterGroupInputs}>
            <FilterInput
              label="最低股價（元）"
              value={filter.minPrice}
              onChange={(v) => setFilter((f) => ({ ...f, minPrice: v }))}
              hint="建議 10–50"
            />
            <FilterInput
              label="最高股價（元）"
              value={filter.maxPrice}
              onChange={(v) => setFilter((f) => ({ ...f, maxPrice: v }))}
              hint="建議 100–1000"
            />
            <FilterInput
              label="最低日均量（張）"
              value={filter.minVolume}
              onChange={(v) => setFilter((f) => ({ ...f, minVolume: v }))}
              hint="ADV20, 建議 300–1000"
            />
            <FilterInput
              label="最低當日量（張）"
              value={filter.minTodayVolume}
              onChange={(v) => setFilter((f) => ({ ...f, minTodayVolume: v }))}
              hint="建議 100–500"
            />
          </div>
        </div>

        {/* Group 2: Gap Size */}
        <div style={S.filterGroup}>
          <span style={{ ...S.filterGroupLabel, color: c.textMuted }}>跳空幅度</span>
          <div style={S.filterGroupInputs}>
            <FilterInput
              label="最低跳空（%）"
              value={filter.minGapPct}
              onChange={(v) => setFilter((f) => ({ ...f, minGapPct: v }))}
              hint="建議 2–5"
              step={0.5}
            />
            <FilterInput
              label="最高跳空（%）"
              value={filter.maxGapPct}
              onChange={(v) => setFilter((f) => ({ ...f, maxGapPct: v }))}
              hint="建議 20–50"
              step={1}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 4 }}>
          <button
            onClick={handleScan}
            disabled={loading}
            style={{ ...S.scanBtn, background: c.blue, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <>
                <span style={S.spinner} />
                掃描中...
              </>
            ) : (
              '掃描全市場'
            )}
          </button>
          <button
            onClick={handleReset}
            style={{ ...S.resetBtn, borderColor: c.border, color: c.textSecondary }}
          >
            重設預設
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={S.legend}>
        <LegendItem color={c.green} label="Gap Up (做多訊號)" />
        <LegendItem color={c.red} label="Gap Down (做空訊號)" />
        <LegendItem color={c.yellow} label="分數越高品質越好" />
      </div>

      {/* Scan criteria summary (dynamic) */}
      <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: c.textSecondary, lineHeight: 1.8 }}>
        <strong style={{ color: c.text }}>目前篩選條件：</strong><br />
        股價 TWD {filter.minPrice}–{filter.maxPrice} · ADV20 {'>'} {filter.minVolume} 張 · 當日成交量 {'>'} {filter.minTodayVolume} 張 · 跳空幅度 {filter.minGapPct}%–{filter.maxGapPct}%<br />
        Gap Up：昨日陰線 + 今開 {'>'} 昨高 + 今開 {'>'} MA20 & MA200<br />
        Gap Down：昨日陽線 + 今開 {'<'} 昨低 + 今開 {'<'} MA20 & MA200
      </div>

      {error && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '12px 16px', borderRadius: 6, fontSize: 14 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ color: c.textSecondary, fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>
          正在從 TWSE / TPEx 抓取上市櫃股票清單，篩選後逐一向 Yahoo Finance
          取得歷史 K 線並分析跳空型態，股票數量較多時請耐心等待...
        </div>
      )}

      {scannedAt && !loading && (
        <div style={{ color: c.textDim, fontSize: 13 }}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;共分析 {totalScanned} 支，找到{' '}
          <strong style={{ color: c.text }}>{stocks.length}</strong> 支震撼型跳空
        </div>
      )}

      {/* Stock list with charts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stocks.map((gap) => (
          <StockRow key={gap.symbol} gap={gap} />
        ))}
      </div>

      {stocks.length === 0 && !loading && scannedAt && (
        <div style={{ ...S.empty, color: c.textDim }}>
          目前沒有符合震撼型跳空條件的股票。<br />
          可以調整篩選條件後再試。
        </div>
      )}

      {stocks.length === 0 && !loading && !scannedAt && (
        <div style={{ ...S.empty, color: c.textDim }}>
          點擊「掃描全市場」開始分析台灣上市櫃股票。<br />
          <span style={{ fontSize: 13 }}>
            系統會從 TWSE / TPEx 抓取完整股票清單，再依成交量與股價篩選後逐一分析跳空型態。
          </span>
        </div>
      )}
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  hint,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  step?: number;
}) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: c.textSecondary, fontSize: 12 }}>{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: c.bgInput,
          border: `1px solid ${c.border}`,
          borderRadius: 6,
          color: c.text,
          fontSize: 15,
          padding: '7px 12px',
          outline: 'none',
          width: 120,
        }}
      />
      {hint && <span style={{ color: c.textDim, fontSize: 11 }}>{hint}</span>}
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
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    minHeight: '100vh',
    transition: 'background-color 0.2s',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 15,
  },
  filterBar: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 24,
    padding: '16px 20px',
    borderRadius: 8,
    flexWrap: 'wrap',
    border: '1px solid transparent',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  filterGroupInputs: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  scanBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 24px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  resetBtn: {
    background: 'transparent',
    border: '1px solid',
    borderRadius: 8,
    padding: '9px 16px',
    fontSize: 13,
    cursor: 'pointer',
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid #ffffff44',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  legend: {
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 0',
    fontSize: 15,
    lineHeight: 2,
  },
};
