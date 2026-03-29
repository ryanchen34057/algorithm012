import { useState } from 'react';
import { calcPosition } from '../services/api';
import { PositionResult, VCPAnalysis } from '../types';

interface Props {
  vcp: VCPAnalysis;
}

export default function RiskCalculator({ vcp }: Props) {
  const [maxLoss, setMaxLoss] = useState('');
  const [result, setResult] = useState<PositionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalc = async () => {
    const loss = parseFloat(maxLoss);
    if (isNaN(loss) || loss <= 0) {
      setError('請輸入有效的損失金額');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await calcPosition(vcp.symbol, loss);
      setResult(res);
    } catch {
      setError('計算失敗，請稍後重試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>風險計算器</h3>

      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>進場點</span>
        <span style={styles.infoValue}>${vcp.entryPrice}</span>
        <span style={styles.infoLabel}>停損點</span>
        <span style={{ ...styles.infoValue, color: '#ef4444' }}>${vcp.stopLoss}</span>
        <span style={styles.infoLabel}>目標價</span>
        <span style={{ ...styles.infoValue, color: '#22c55e' }}>${vcp.target}</span>
      </div>

      <div style={styles.inputRow}>
        <label style={styles.label}>可承受最大損失 (TWD)</label>
        <div style={styles.inputGroup}>
          <span style={styles.prefix}>$</span>
          <input
            type="number"
            value={maxLoss}
            onChange={(e) => setMaxLoss(e.target.value)}
            placeholder="例: 10000"
            style={styles.input}
            onKeyDown={(e) => e.key === 'Enter' && handleCalc()}
          />
          <button
            onClick={handleCalc}
            disabled={loading}
            style={styles.btn}
          >
            {loading ? '計算中...' : '計算'}
          </button>
        </div>
        {error && <div style={styles.error}>{error}</div>}
      </div>

      {result && (
        <div style={styles.result}>
          <ResultRow
            label="建議買入股數"
            value={`${result.shares.toLocaleString()} 股`}
            big
          />
          <ResultRow
            label="每股風險"
            value={`$${result.riskPerShare}`}
          />
          <ResultRow
            label="每股報酬"
            value={`$${result.rewardPerShare}`}
          />
          <ResultRow
            label="風險報酬比"
            value={`1 : ${result.riskRewardRatio.toFixed(2)}`}
            highlight={result.riskRewardRatio >= 2}
          />
          <ResultRow
            label="總投入資金"
            value={`$${result.totalCost.toLocaleString()}`}
          />
        </div>
      )}
    </div>
  );
}

function ResultRow({
  label,
  value,
  big,
  highlight,
}: {
  label: string;
  value: string;
  big?: boolean;
  highlight?: boolean;
}) {
  return (
    <div style={styles.resultRow}>
      <span style={styles.resultLabel}>{label}</span>
      <span
        style={{
          ...styles.resultValue,
          fontSize: big ? 22 : 16,
          color: highlight ? '#22c55e' : big ? '#f1f5f9' : '#cbd5e1',
        }}
      >
        {value}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1e293b',
    borderRadius: 8,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: {
    margin: 0,
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: 700,
  },
  infoRow: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  infoValue: {
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: 15,
  },
  inputRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  prefix: {
    color: '#64748b',
    fontSize: 16,
  },
  input: {
    flex: 1,
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#f1f5f9',
    fontSize: 16,
    padding: '8px 12px',
    outline: 'none',
  },
  btn: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '9px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  error: {
    color: '#f87171',
    fontSize: 13,
  },
  result: {
    background: '#0f172a',
    borderRadius: 6,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1e293b',
    paddingBottom: 8,
  },
  resultLabel: {
    color: '#64748b',
    fontSize: 13,
  },
  resultValue: {
    fontWeight: 700,
  },
};
