import React from 'react';
import { Order, STATUS_CONFIG } from '../../utils/types';

interface OrderCardProps {
  order: Partial<Order>;
  onClick?: (order: Partial<Order>) => void;
  compact?: boolean;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, compact }) => {
  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#64748B', bg: '#F1F5F9' };

  return (
    <div
      onClick={() => onClick?.(order)}
      style={{
        background: '#1A1A24',
        border: '1px solid #2D2D3D',
        borderRadius: '10px',
        padding: compact ? '12px' : '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginBottom: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <span style={{ color: '#F6D860', fontWeight: 700, fontSize: '13px' }}>{order.poNumber}</span>
          {order.kiraSkuNumber && (
            <span style={{ color: '#64748B', fontSize: '11px', marginLeft: '8px' }}>{order.kiraSkuNumber}</span>
          )}
        </div>
        <span style={{
          background: cfg.bg,
          color: cfg.color,
          padding: '2px 8px',
          borderRadius: '99px',
          fontSize: '10px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>
          {cfg.label}
        </span>
      </div>
      <div style={{ color: '#CBD5E1', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
        {order.storeName || order.customerFullName || 'Unknown Store'}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {order.orderType && (
          <Tag icon="💍" text={order.orderType} />
        )}
        {order.metalType && order.metalColor && (
          <Tag icon="✨" text={`${order.metalType} ${order.metalColor}`} />
        )}
        {order.quotedCost && (
          <Tag icon="💰" text={`$${order.quotedCost.toLocaleString()}`} color="#10B981" />
        )}
      </div>
    </div>
  );
};

const Tag: React.FC<{ icon: string; text: string; color?: string }> = ({ icon, text, color }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    background: '#0F0F14',
    border: '1px solid #2D2D3D',
    borderRadius: '6px',
    padding: '2px 6px',
    fontSize: '11px',
    color: color || '#94A3B8',
  }}>
    {icon} {text}
  </span>
);
