import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getChart, getGap } from '../services/api';
import { StockChartData, GapAnalysis } from '../types';
import { useColors } from '../components/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import StockChart from '../components/StockChart';
import GapInfoCard from '../components/VCPScoreCard';
import RiskCalculator from '../components/RiskCalculator';

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const c = useColors();

  const [chart, setChart] = useState<StockChartData | null>(null);
  const [gap, setGap] = useState<GapAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!symbol) return;
    const decoded = decodeURIComponent(symbol);

    setLoading(true);
    setError('');

    Promise.all([getChart(decoded), getGap(decoded)])
      .then(([chartData, gapData]) => {
        setChart(chartData);
        setGap(gapData);
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

  if (!chart || !gap) return null;

  const code = gap.symbol.replace(/\.(TW|TWO)$/, '');
  const isLong = gap.direction === 'long';
  const dirColor = isLong ? c.green : c.red;

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
          <span style={{ fontSize: 16, color: c.textMuted, fontWeight: 400 }}>{gap.name}</span>
          <span style={{
            background: dirColor + '22', color: dirColor,
            borderRadius: 4, padding: '3px 10px', fontSize: 14, fontWeight: 700,
          }}>
            {isLong ? 'Gap Up 做多' : 'Gap Down 做空'}
          </span>
        </h2>
        <div style={{ fontSize: 28, fontWeight: 800, color: dirColor }}>${gap.currentPrice}</div>
      </div>

      {/* Chart */}
      <div style={{ background: c.chartBg, borderRadius: 8, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${c.border}` }}>
        <StockChart chart={chart} gap={gap} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 8 }}>
          <Legend color="#22d3ee" label="MA20" />
          <Legend color="#f59e0b" label="MA50" />
          <Legend color="#a78bfa" label="MA150" />
          <Legend color="#f472b6" label="MA200" />
          <Legend color={c.blue} label="進場點 (虛線)" dashed />
          <Legend color={c.red} label="停損點 (虛線)" dashed />
          <Legend color={c.green} label="目標價 (虛線)" dashed />
        </div>
      </div>

      {/* Gap info + Risk calculator */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px' }}>
          <GapInfoCard gap={gap} />
        </div>
        <div style={{ flex: '1 1 340px' }}>
          <RiskCalculator gap={gap} />
        </div>
      </div>

      {/* Gap detail table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, color: c.text, fontSize: 16, fontWeight: 700 }}>跳空詳情</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: c.bgCard, borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr>
              {['項目', '數值'].map((h) => (
                <th key={h} style={{ background: c.bgInput, color: c.textMuted, fontSize: 12, textTransform: 'uppercase', padding: '10px 16px', textAlign: 'left' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['昨日開盤', `$${gap.yesterdayOpen}`],
              ['昨日收盤', `$${gap.yesterdayClose}`],
              ['昨日最高', `$${gap.yesterdayHigh}`],
              ['昨日最低', `$${gap.yesterdayLow}`],
              ['今日開盤', `$${gap.todayOpen}`],
              ['今日收盤', `$${gap.todayClose}`],
              ['跳空幅度', `${gap.gapPercent > 0 ? '+' : ''}${gap.gapPercent}%`],
              ['當日成交量', `${(gap.todayVolume / 1000).toLocaleString()} 張`],
              ['20日均量', `${gap.adv20.toLocaleString()} 張`],
              ['MA20', `$${gap.ma20}`],
              ['MA200', `$${gap.ma200}`],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: `1px solid ${c.border}` }}>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>{label}</td>
                <td style={{ padding: '10px 16px', color: c.textSecondary, fontSize: 14 }}>{value}</td>
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
