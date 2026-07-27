import React from 'react';
import { useTheme } from '../utils/theme';

interface Props {
  size?: number;
  // 'on-dark' matches bars that are always dark regardless of theme (e.g. the
  // customer top nav, which sits on --sidebar-bg) — transparent + white-based
  // border like the sign-out button next to it, instead of --bg-input which
  // would render as a light card in light mode and clash with the dark bar.
  variant?: 'default' | 'on-dark';
}

export function ThemeToggle({ size = 36, variant = 'default' }: Props) {
  const [theme, toggleTheme] = useTheme();
  const isDark = theme === 'dark';

  const onDark = variant === 'on-dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: onDark ? 'none' : 'var(--bg-input)',
        border: onDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border)',
        borderRadius: '8px', width: `${size}px`, height: `${size}px`,
        cursor: 'pointer', fontSize: '15px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: onDark ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', flexShrink: 0,
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
