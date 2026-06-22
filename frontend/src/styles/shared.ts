import type { CSSProperties } from 'react';

export const card: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

export const input: CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '9px 14px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
};

export const label: CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
};

export const btnPrimary: CSSProperties = {
  background: 'var(--navy)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 18px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '0.3px',
};

export const btnSecondary: CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 16px',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  cursor: 'pointer',
};

export const sectionHeading: CSSProperties = {
  fontFamily: 'Cormorant Garamond, Georgia, serif',
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: 0,
};

export const fieldWrap: CSSProperties = { marginBottom: '14px' };

export const badge = (color: string): CSSProperties => ({
  background: `${color}15`,
  color,
  padding: '3px 10px',
  borderRadius: '99px',
  fontSize: '11px',
  fontWeight: 600,
  display: 'inline-block',
});
