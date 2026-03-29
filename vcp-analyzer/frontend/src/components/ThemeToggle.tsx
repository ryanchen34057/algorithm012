import { useTheme } from './ThemeContext';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} style={styles.btn} title="切換深色/淺色模式">
      {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? '淺色模式' : '深色模式'}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    background: 'transparent',
    border: '1px solid #64748b',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
    color: 'inherit',
    whiteSpace: 'nowrap',
  },
};
