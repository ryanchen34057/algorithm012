import { useTheme, useColors } from './ThemeContext';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const c = useColors();
  return (
    <button onClick={toggle} style={{
      background: 'transparent', border: `1px solid ${c.border}`,
      borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
      cursor: 'pointer', color: c.textSecondary, whiteSpace: 'nowrap',
    }} title="切換深色/淺色模式">
      {theme === 'dark' ? '淺色模式' : '深色模式'}
    </button>
  );
}
