import React from 'react';
import { Order, STATUS_CONFIG } from '../../utils/types';

interface OrderCardProps {
  order: Partial<Order>;
  onClick?: (order: Partial<Order>) => void;
  compact?: boolean;
  hideFinancials?: boolean;
  daysOverdue?: number;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, compact, hideFinancials = false, daysOverdue }) => {
  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };

  return (
    <div
      onClick={() => onClick?.(order)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: compact ? '12px 16px' : '16px 20px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
        marginBottom: '8px',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <span style={{ color: 'var(--navy)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.3px' }}>
            {order.poNumber}
          </span>
          {order.kiraSkuNumber && (
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>{order.kiraSkuNumber}</span>
          )}
        </div>
        <span style={{
          background: cfg.bg,
          color: cfg.color,
          padding: '3px 9px',
          borderRadius: '99px',
          fontSize: '10px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          letterSpacing: '0.3px',
        }}>
          {cfg.label}
        </span>
      </div>

      <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
        {order.storeName || order.customerFullName || 'Unknown Store'}
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {order.orderType && <Tag text={order.orderType} />}
        {order.metalType && order.metalColor && <Tag text={`${order.metalType} · ${order.metalColor}`} />}
        {!hideFinancials && order.quotedCost && <Tag text={`$${order.quotedCost.toLocaleString()}`} gold />}
        {daysOverdue !== undefined && daysOverdue > 0 && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            ⚠ +{daysOverdue}d overdue
          </span>
        )}
      </div>
    </div>
  );
};

const Tag: React.FC<{ text: string; gold?: boolean }> = ({ text, gold }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    background: gold ? 'rgba(192,155,88,0.1)' : 'var(--bg-input)',
    border: `1px solid ${gold ? 'rgba(192,155,88,0.25)' : 'var(--border)'}`,
    borderRadius: '5px',
    padding: '2px 8px',
    fontSize: '11px',
    color: gold ? 'var(--accent-dark)' : 'var(--text-secondary)',
    fontWeight: gold ? 600 : 400,
  }}>
    {text}
  </span>
);
