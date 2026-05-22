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

  const kpis = [
    { label: 'Total Orders', value: metrics.total, icon: '📋', color: '#6366F1' },
    { label: 'Total Revenue', value: `$${Number(metrics.totalRevenue).toLocaleString()}`, icon: '💰', color: '#10B981' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#1A1A24', border: '1px solid #2D2D3D', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>{k.icon}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {metrics.byStatus.map((s) => {
          const cfg = STATUS_CONFIG[s.status] || { label: s.status, color: '#64748B', bg: '#1A1A24' };
          return (
            <div key={s.status} style={{ background: '#0F0F14', border: `1px solid ${cfg.color}25`, borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: cfg.color }}>{s.count}</div>
              <div style={{ fontSize: '10px', color: '#64748B' }}>{cfg.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
