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
// Warm-tinted palette. No pure black/white. Neutrals tinted toward amber.
export const colors = {
  dark: {
    bg:          '#141118',  // warm near-black (purple-tint)
    bgCard:      '#1c1825',  // warm card surface
    bgInput:     '#17131f',  // input bg
    border:      '#2d2636',  // warm border
    text:        '#ede8f5',  // warm off-white
    textSecondary: '#a099b0', // warm mid gray
    textMuted:   '#706882',  // warm muted
    textDim:     '#524a62',  // warm dim
    up:          '#ef4444',   // 台股：紅色漲
    down:        '#22c55e',   // 台股：綠色跌
    green:       '#22c55e',
    red:         '#ef4444',
    blue:        '#6889ff',   // softer blue, less generic
    yellow:      '#e5a100',   // warm gold
    accent:      '#e5a100',   // primary game accent (gold)
    accentMuted: '#b38200',   // muted gold
    gridLine:    '#1c1825',
    scrollTrack: '#1c1825',
    scrollThumb: '#2d2636',
    chartBg:     '#141118',
  },
  light: {
    bg:          '#f5f2f0',  // warm off-white
    bgCard:      '#fefdfb',  // warm white
    bgInput:     '#eeebe8',  // warm input
    border:      '#ddd6ce',  // warm border
    text:        '#1a1520',  // warm near-black
    textSecondary: '#5c5466', // warm mid
    textMuted:   '#7d7588',  // warm muted
    textDim:     '#a39bae',  // warm dim
    up:          '#dc2626',   // 台股：紅色漲
    down:        '#16a34a',   // 台股：綠色跌
    green:       '#16a34a',
    red:         '#dc2626',
    blue:        '#4862d9',   // softer blue
    yellow:      '#b38200',   // warm gold
    accent:      '#b38200',   // primary accent
    accentMuted: '#8a6400',
    gridLine:    '#ddd6ce',
    scrollTrack: '#eeebe8',
    scrollThumb: '#c4bcb2',
    chartBg:     '#fefdfb',
  },
};

export type ThemeColors = typeof colors.dark;

export function useColors(): ThemeColors {
  const { theme } = useTheme();
  return colors[theme];
}
