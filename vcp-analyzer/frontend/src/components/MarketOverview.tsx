import { useEffect, useState } from 'react';
import { fetchIndices, fetchTaifex, IndexQuote, TaifexQuote } from '../services/api';
import { useColors } from './ThemeContext';

export default function MarketOverview() {
  const c = useColors();
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [taifex, setTaifex] = useState<TaifexQuote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchIndices().catch(() => [] as IndexQuote[]),
      fetchTaifex().catch(() => null),
    ])
      .then(([idx, tx]) => {
        setIndices(idx);
        setTaifex(tx);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{
        background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
        padding: '12px 16px', fontSize: 12, color: c.textMuted,
      }}>
        載入全球指數中...
      </div>
    );
  }

  if (indices.length === 0 && !taifex) return null;

  return (
    <div style={{
      background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: c.textMuted, letterSpacing: '0.06em' }}>
        全球指數 / 期貨
      </span>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 6,
      }}>
        {indices.map((q) => <QuoteCard key={q.symbol} name={q.name} price={q.price} changePct={q.changePct} time={q.time} />)}
        {taifex && <QuoteCard name={taifex.name} price={taifex.price} changePct={taifex.changePct} time={taifex.time} />}
      </div>
    </div>
  );
}

function QuoteCard({ name, price, changePct, time }: { name: string; price: number; changePct: number; time: string }) {
  const c = useColors();
  const isUp = changePct > 0;
  const isDown = changePct < 0;
  const color = isUp ? c.up : isDown ? c.down : c.textMuted;

  return (
    <div style={{
      background: (isUp ? c.up : isDown ? c.down : c.textMuted) + '08',
      borderRadius: 6, padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{name}</span>
        <span style={{ fontSize: 9, color: c.textDim }}>{time}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{price.toLocaleString()}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>
          {changePct > 0 ? '+' : ''}{changePct}%
        </span>
      </div>
    </div>
  );
}
