import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { scanVCP } from '../services/api';
import { VCPAnalysis } from '../types';
import VCPScoreCard from '../components/VCPScoreCard';

export default function Dashboard() {
  const [stocks, setStocks] = useState<VCPAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannedAt, setScannedAt] = useState('');
  const navigate = useNavigate();

  const handleScan = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await scanVCP();
      setStocks(result.stocks ?? []);
      setScannedAt(result.scannedAt);
    } catch (e: unknown) {
      setError('掃描失敗：無法連線到後端伺服器');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>台股 VCP 分析系統</h1>
          <p style={styles.subtitle}>
            自動偵測符合 Mark Minervini VCP 型態的台灣股票
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={loading}
          style={{ ...styles.scanBtn, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? (
            <>
              <span style={styles.spinner} />
              掃描中...
            </>
          ) : (
            '🔍 掃描 VCP'
          )}
        </button>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <LegendItem color="#22c55e" label="分數 ≥ 80：高品質 VCP" />
        <LegendItem color="#f59e0b" label="分數 60-79：中等 VCP" />
        <LegendItem color="#ef4444" label="分數 &lt; 60：低信心" />
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading && (
        <div style={styles.loadingMsg}>
          正在掃描 {29} 支台股，取得歷史資料並分析 VCP 型態，請稍候...
        </div>
      )}

      {scannedAt && !loading && (
        <div style={styles.meta}>
          掃描時間：{new Date(scannedAt).toLocaleString('zh-TW')}
          &nbsp;·&nbsp;找到 {stocks.length} 支符合條件的股票
        </div>
      )}

      {/* Stock grid */}
      <div style={styles.grid}>
        {stocks.map((vcp) => (
          <div
            key={vcp.symbol}
            style={styles.cardWrapper}
            onClick={() => navigate(`/stock/${encodeURIComponent(vcp.symbol)}`)}
          >
            <VCPScoreCard vcp={vcp} />
          </div>
        ))}
      </div>

      {stocks.length === 0 && !loading && scannedAt && (
        <div style={styles.empty}>目前沒有符合 VCP 型態的股票，請稍後再掃描。</div>
      )}

      {stocks.length === 0 && !loading && !scannedAt && (
        <div style={styles.empty}>點擊「掃描 VCP」開始分析台股。</div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 12, height: 12, borderRadius: 2, background: color }} />
      <span style={{ color: '#94a3b8', fontSize: 13 }}>{label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
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
    color: '#f1f5f9',
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    color: '#64748b',
    fontSize: 15,
  },
  scanBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 28px',
    fontSize: 15,
    fontWeight: 700,
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
  error: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '12px 16px',
    borderRadius: 6,
    fontSize: 14,
  },
  loadingMsg: {
    color: '#94a3b8',
    fontSize: 14,
    fontStyle: 'italic',
  },
  meta: {
    color: '#475569',
    fontSize: 13,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
  },
  cardWrapper: {
    cursor: 'pointer',
    transition: 'transform 0.15s',
  },
  empty: {
    color: '#475569',
    textAlign: 'center',
    padding: '60px 0',
    fontSize: 15,
  },
};
