import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  t: (dark: string, light: string) => string;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggle: () => {},
  t: (dark) => dark,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('vcp-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('vcp-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  const t = (dark: string, light: string) => (theme === 'dark' ? dark : light);

  return (
    <ThemeContext.Provider value={{ theme, toggle, t }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Color tokens ────────────────────────────────────────────────────────────
export const colors = {
  dark: {
    bg:          '#0f172a',
    bgCard:      '#1e293b',
    bgInput:     '#0f172a',
    border:      '#334155',
    text:        '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted:   '#64748b',
    textDim:     '#475569',
    green:       '#22c55e',
    red:         '#ef4444',
    blue:        '#3b82f6',
    yellow:      '#f59e0b',
    gridLine:    '#1e293b',
    scrollTrack: '#1e293b',
    scrollThumb: '#334155',
    chartBg:     '#0f172a',
  },
  light: {
    bg:          '#f8fafc',
    bgCard:      '#ffffff',
    bgInput:     '#f1f5f9',
    border:      '#e2e8f0',
    text:        '#0f172a',
    textSecondary: '#475569',
    textMuted:   '#64748b',
    textDim:     '#94a3b8',
    green:       '#16a34a',
    red:         '#dc2626',
    blue:        '#2563eb',
    yellow:      '#d97706',
    gridLine:    '#e2e8f0',
    scrollTrack: '#f1f5f9',
    scrollThumb: '#cbd5e1',
    chartBg:     '#ffffff',
  },
};

export type ThemeColors = typeof colors.dark;

export function useColors(): ThemeColors {
  const { theme } = useTheme();
  return colors[theme];
}
