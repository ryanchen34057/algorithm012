import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getChart, getVCP } from '../services/api';
import { StockChartData, VCPAnalysis } from '../types';
import { useColors } from '../components/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import StockChart from '../components/StockChart';
import VCPScoreCard from '../components/VCPScoreCard';
import RiskCalculator from '../components/RiskCalculator';

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const c = useColors();

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
      <div style={{ ...S.center, background: c.bg }}>
        <div style={{ color: c.textSecondary, fontSize: 18 }}>載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...S.center, background: c.bg }}>
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '12px 20px', borderRadius: 6 }}>{error}</div>
        <button style={{ ...S.backBtn, borderColor: c.border, color: c.textSecondary }} onClick={() => navigate('/')}>
          返回
        </button>
      </div>
    );
  }

  if (!chart || !vcp) return null;

  const code = vcp.symbol.replace(/\.(TW|TWO)$/, '');

  return (
    <div style={{ ...S.page, background: c.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <button style={{ ...S.backBtn, borderColor: c.border, color: c.textSecondary }} onClick={() => navigate('/')}>
          ← 返回列表
        </button>
        <ThemeToggle />
      </div>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: c.text, fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 }}>
          {code}
          <span style={{ fontSize: 16, color: c.textMuted, fontWeight: 400 }}>{vcp.name}</span>
        </h2>
        <div style={{ fontSize: 28, fontWeight: 800, color: c.green }}>${vcp.currentPrice}</div>
      </div>

      {/* Chart */}
      <div style={{ background: c.chartBg, borderRadius: 8, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${c.border}` }}>
        <StockChart chart={chart} vcp={vcp} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 8 }}>
          <Legend color="#f59e0b" label="MA50" />
          <Legend color="#a78bfa" label="MA150" />
          <Legend color="#f472b6" label="MA200" />
          <Legend color={c.blue} label="進場點 (虛線)" dashed />
          <Legend color={c.red} label="停損點 (虛線)" dashed />
          <Legend color={c.green} label="目標價 (虛線)" dashed />
        </div>
      </div>

      {/* VCP + Risk calculator */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px' }}>
          <VCPScoreCard vcp={vcp} />
        </div>
        <div style={{ flex: '1 1 340px' }}>
          <RiskCalculator vcp={vcp} />
        </div>
      </div>

      {/* Contraction table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, color: c.text, fontSize: 16, fontWeight: 700 }}>收縮詳情</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: c.bgCard, borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr>
              {['收縮', '高點日期', '高點價格', '低點日期', '低點價格', '回檔幅度', '期間均量'].map((h) => (
                <th key={h} style={{ background: c.bgInput, color: c.textMuted, fontSize: 12, textTransform: 'uppercase', padding: '10px 16px', textAlign: 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vcp.contractions.map((con) => (
              <tr key={con.index} style={{ borderBottom: `1px solid ${c.border}` }}>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>C{con.index}</td>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>{con.highDate}</td>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>${con.highPrice}</td>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>{con.lowDate}</td>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>${con.lowPrice}</td>
                <td style={{
                  padding: '10px 16px', fontSize: 14, fontWeight: 700,
                  color: con.depth <= 6 ? c.green : con.depth <= 12 ? c.yellow : c.red,
                }}>
                  {con.depth.toFixed(1)}%
                </td>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>{con.avgVolume.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 20, height: 2, background: color, borderTop: dashed ? `2px dashed ${color}` : undefined, opacity: dashed ? 0.8 : 1 }} />
      <span style={{ color: c.textSecondary, fontSize: 12 }}>{label}</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    minHeight: '100vh',
    transition: 'background-color 0.2s',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 16,
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid',
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
  },
};
