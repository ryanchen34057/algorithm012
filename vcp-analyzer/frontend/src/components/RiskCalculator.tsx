import { useState } from 'react';
import { calcPosition } from '../services/api';
import { PositionResult, VCPAnalysis } from '../types';
import { useColors } from './ThemeContext';

interface Props {
  vcp: VCPAnalysis;
}

export default function RiskCalculator({ vcp }: Props) {
  const c = useColors();
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
    <div style={{ background: c.bgCard, borderRadius: 8, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, border: `1px solid ${c.border}` }}>
      <h3 style={{ margin: 0, color: c.text, fontSize: 18, fontWeight: 700 }}>風險計算器</h3>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: c.textMuted, fontSize: 12, textTransform: 'uppercase' }}>進場點</span>
        <span style={{ color: c.text, fontWeight: 600, fontSize: 15 }}>${vcp.entryPrice}</span>
        <span style={{ color: c.textMuted, fontSize: 12, textTransform: 'uppercase' }}>停損點</span>
        <span style={{ color: c.red, fontWeight: 600, fontSize: 15 }}>${vcp.stopLoss}</span>
        <span style={{ color: c.textMuted, fontSize: 12, textTransform: 'uppercase' }}>目標價</span>
        <span style={{ color: c.green, fontWeight: 600, fontSize: 15 }}>${vcp.target}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: c.textSecondary, fontSize: 13 }}>可承受最大損失 (TWD)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: c.textMuted, fontSize: 16 }}>$</span>
          <input
            type="number"
            value={maxLoss}
            onChange={(e) => setMaxLoss(e.target.value)}
            placeholder="例: 10000"
            style={{
              flex: 1,
              background: c.bgInput,
              border: `1px solid ${c.border}`,
              borderRadius: 6,
              color: c.text,
              fontSize: 16,
              padding: '8px 12px',
              outline: 'none',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleCalc()}
          />
          <button
            onClick={handleCalc}
            disabled={loading}
            style={{
              background: c.blue,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '9px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '計算中...' : '計算'}
          </button>
        </div>
        {error && <div style={{ color: c.red, fontSize: 13 }}>{error}</div>}
      </div>

      {result && (
        <div style={{ background: c.bgInput, borderRadius: 6, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Row label="建議買入股數" value={`${result.shares.toLocaleString()} 股`} big color={c.text} />
          <Row label="每股風險" value={`$${result.riskPerShare}`} />
          <Row label="每股報酬" value={`$${result.rewardPerShare}`} />
          <Row
            label="風險報酬比"
            value={`1 : ${result.riskRewardRatio.toFixed(2)}`}
            color={result.riskRewardRatio >= 2 ? c.green : undefined}
          />
          <Row label="總投入資金" value={`$${result.totalCost.toLocaleString()}`} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, big, color }: { label: string; value: string; big?: boolean; color?: string }) {
  const c = useColors();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${c.border}`, paddingBottom: 8 }}>
      <span style={{ color: c.textMuted, fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: big ? 22 : 16, color: color ?? c.textSecondary }}>{value}</span>
    </div>
  );
}
