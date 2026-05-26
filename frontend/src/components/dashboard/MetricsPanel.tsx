import React from 'react';
import { STATUS_CONFIG } from '../../utils/types';

interface MetricsPanelProps {
  metrics?: {
    total: number;
    totalRevenue: number;
    byStatus: { status: string; count: string }[];
  };
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({ metrics }) => {
  if (!metrics) return null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
        {[
          { label: 'Total Orders',  value: metrics.total,             color: 'var(--navy)' },
          { label: 'Total Revenue', value: `$${Number(metrics.totalRevenue).toLocaleString()}`, color: 'var(--accent-dark)' },
        ].map((k, i) => (
          <div key={k.label} style={{ padding: '16px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '24px', fontWeight: 600, color: k.color, lineHeight: 1 }}>
              {k.value}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', padding: '0 4px' }}>
          By Status
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {metrics.byStatus.map((s) => {
            const cfg = STATUS_CONFIG[s.status] || { label: s.status, color: '#6B7280', bg: '#F3F4F6' };
            const max = Math.max(...metrics.byStatus.map(x => Number(x.count)));
            const pct = max > 0 ? (Number(s.count) / max) * 100 : 0;
            return (
              <div key={s.status} style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: '7px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{cfg.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color }}>{s.count}</span>
                </div>
                <div style={{ height: '3px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: '99px', opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
