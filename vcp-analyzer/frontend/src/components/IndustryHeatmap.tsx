import { IndustryHeat } from '../types';
import { useColors } from './ThemeContext';

interface Props {
  industries: IndustryHeat[];
}

export default function IndustryHeatmap({ industries }: Props) {
  const c = useColors();
  if (!industries || industries.length === 0) return null;

  return (
    <div style={{ background: c.bgCard, borderRadius: 10, border: `1px solid ${c.border}`, padding: '16px 20px' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: c.text, marginBottom: 12 }}>
        產業熱度排行（依近1月平均漲幅）
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {industries.map((ind, i) => {
          const isHot = ind.avgGain1m > 10;
          const isWarm = ind.avgGain1m > 5;
          const bgColor = isHot ? c.up + '18' : isWarm ? '#f59e0b18' : c.bgInput;
          const textColor = isHot ? c.up : isWarm ? '#f59e0b' : c.textSecondary;

          return (
            <div
              key={ind.industry}
              style={{
                background: bgColor,
                border: `1px solid ${isHot ? c.up + '44' : isWarm ? '#f59e0b44' : c.border}`,
                borderRadius: 8,
                padding: '10px 14px',
                minWidth: 140,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 600 }}>#{i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: c.text }}>{ind.industry}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: textColor + '22', color: textColor,
                }}>{ind.stockCount} 檔</span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 10, color: c.textMuted }}>近1月</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: ind.avgGain1m >= 0 ? c.up : c.down }}>
                    {ind.avgGain1m >= 0 ? '+' : ''}{ind.avgGain1m}%
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 10, color: c.textMuted }}>近3月</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: ind.avgGain3m >= 0 ? c.up : c.down }}>
                    {ind.avgGain3m >= 0 ? '+' : ''}{ind.avgGain3m}%
                  </span>
                </div>
              </div>
              {ind.topStocks && ind.topStocks.length > 0 && (
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                  {ind.topStocks.join('、')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
