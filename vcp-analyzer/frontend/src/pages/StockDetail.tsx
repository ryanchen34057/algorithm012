import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getChart, getVCP } from '../services/api';
import { StockChartData, VCPAnalysis } from '../types';
import StockChart from '../components/StockChart';
import VCPScoreCard from '../components/VCPScoreCard';
import RiskCalculator from '../components/RiskCalculator';

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();

  const [chart, setChart] = useState<StockChartData | null>(null);
  const [vcp, setVcp] = useState<VCPAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!symbol) return;
    const decoded = decodeURIComponent(symbol);

    setLoading(true);
    setError('');

    Promise.all([getChart(decoded), getVCP(decoded)])
      .then(([chartData, vcpData]) => {
        setChart(chartData);
        setVcp(vcpData);
      })
      .catch(() => setError('無法載入股票資料，請確認代號是否正確。'))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.loadingText}>載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <div style={styles.errorBox}>{error}</div>
        <button style={styles.backBtn} onClick={() => navigate('/')}>
          ← 返回
        </button>
      </div>
    );
  }

  if (!chart || !vcp) return null;

  return (
    <div style={styles.page}>
      {/* Back button */}
      <button style={styles.backBtn} onClick={() => navigate('/')}>
        ← 返回列表
      </button>

      {/* Page title */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          {vcp.symbol}
          <span style={styles.name}>{vcp.name}</span>
        </h2>
        <div style={styles.currentPrice}>${vcp.currentPrice}</div>
      </div>

      {/* K-line chart */}
      <div style={styles.chartBox}>
        <StockChart chart={chart} vcp={vcp} />
        <div style={styles.chartLegend}>
          <LegendLine color="#f59e0b" label="MA50" />
          <LegendLine color="#a78bfa" label="MA150" />
          <LegendLine color="#f472b6" label="MA200" />
          <LegendLine color="#3b82f6" label="進場點 (虛線)" dashed />
          <LegendLine color="#ef4444" label="停損點 (虛線)" dashed />
          <LegendLine color="#22c55e" label="目標價 (虛線)" dashed />
        </div>
      </div>

      {/* VCP analysis + Risk calculator side by side */}
      <div style={styles.bottomRow}>
        <div style={{ flex: '1 1 340px' }}>
          <VCPScoreCard vcp={vcp} />
        </div>
        <div style={{ flex: '1 1 340px' }}>
          <RiskCalculator vcp={vcp} />
        </div>
      </div>

      {/* Contraction details table */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>收縮詳情</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              {['收縮', '高點日期', '高點價格', '低點日期', '低點價格', '回檔幅度', '期間均量'].map(
                (h) => (
                  <th key={h} style={styles.th}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {vcp.contractions.map((c) => (
              <tr key={c.index} style={styles.tr}>
                <td style={styles.td}>C{c.index}</td>
                <td style={styles.td}>{c.highDate}</td>
                <td style={styles.td}>${c.highPrice}</td>
                <td style={styles.td}>{c.lowDate}</td>
                <td style={styles.td}>${c.lowPrice}</td>
                <td
                  style={{
                    ...styles.td,
                    color:
                      c.depth <= 6
                        ? '#22c55e'
                        : c.depth <= 12
                        ? '#f59e0b'
                        : '#ef4444',
                    fontWeight: 700,
                  }}
                >
                  {c.depth.toFixed(1)}%
                </td>
                <td style={styles.td}>{c.avgVolume.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LegendLine({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 20,
          height: 2,
          background: color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
          opacity: dashed ? 0.8 : 1,
        }}
      />
      <span style={{ color: '#94a3b8', fontSize: 12 }}>{label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
    gap: 16,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 18,
  },
  errorBox: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '12px 20px',
    borderRadius: 6,
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #334155',
    color: '#94a3b8',
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
    alignSelf: 'flex-start',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    margin: 0,
    color: '#f1f5f9',
    fontSize: 24,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  name: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: 400,
  },
  currentPrice: {
    fontSize: 28,
    fontWeight: 800,
    color: '#22c55e',
  },
  chartBox: {
    background: '#0f172a',
    borderRadius: 8,
    overflow: 'hidden',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  chartLegend: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    paddingTop: 8,
  },
  bottomRow: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: 700,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#1e293b',
    borderRadius: 8,
    overflow: 'hidden',
  },
  th: {
    background: '#0f172a',
    color: '#64748b',
    fontSize: 12,
    textTransform: 'uppercase',
    padding: '10px 16px',
    textAlign: 'left',
    letterSpacing: '0.04em',
  },
  tr: {
    borderBottom: '1px solid #334155',
  },
  td: {
    padding: '10px 16px',
    color: '#cbd5e1',
    fontSize: 14,
  },
};
