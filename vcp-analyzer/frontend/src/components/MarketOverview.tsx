import { useEffect, useState } from 'react';
import { fetchIndices, IndexQuote } from '../services/api';
import { useColors } from './ThemeContext';

export default function MarketOverview() {
  const c = useColors();
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchIndices()
      .then(setIndices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{
        background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
        padding: '14px 20px', fontSize: 13, color: c.textMuted,
      }}>
        載入全球指數中...
      </div>
    );
  }

  if (indices.length === 0) return null;

  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>全球指數 / 期貨</span>
        <span style={{ fontSize: 11, color: c.textMuted }}>含美股盤後 & 台指夜盤</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 8,
      }}>
        {indices.map((q) => {
          const isUp = q.changePct > 0;
          const isDown = q.changePct < 0;
          const color = isUp ? c.up : isDown ? c.down : c.textMuted;
          const bg = isUp ? c.up + '12' : isDown ? c.down + '12' : c.textMuted + '08';

          return (
            <div key={q.symbol} style={{
              background: bg, borderRadius: 8, padding: '8px 10px',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{q.name}</span>
                <span style={{ fontSize: 10, color: c.textMuted }}>{q.time}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color }}>
                  {q.price.toLocaleString()}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color,
                  padding: '1px 5px', borderRadius: 3,
                  background: isUp ? c.up + '20' : isDown ? c.down + '20' : 'transparent',
                }}>
                  {q.changePct > 0 ? '+' : ''}{q.changePct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
