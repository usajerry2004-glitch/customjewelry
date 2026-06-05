import React from 'react';
import { Order, STATUS_CONFIG, StoneStatus } from '../../utils/types';

interface OrderCardProps {
  order: Partial<Order>;
  onClick?: (order: Partial<Order>) => void;
  compact?: boolean;
  hideFinancials?: boolean;
  daysOverdue?: number;
  referenceImage?: string;
}

function calcPriorityReason(order: Partial<Order>): string | null {
  const days = Math.floor((Date.now() - new Date((order as any).createdAt || 0).getTime()) / (1000 * 60 * 60 * 24));
  const fin = ['COMPLETED','DELIVERED','CANCELLED'];
  if ((order as any).isPriorityCustomer && !fin.includes(order.status!)) return '★ Priority Customer';
  if (days > 10 && !fin.includes(order.status!)) return `${days}d — overdue`;
  return null;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, compact, hideFinancials = false, daysOverdue, referenceImage }) => {
  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const awaitingQuote = order.status === 'CAD_IN_PROGRESS' && (order as any).cadSubStatus === 'APPROVED';
  const priorityReason = calcPriorityReason(order);

  return (
    <div
      onClick={() => onClick?.(order)}
      style={{
        background: awaitingQuote ? 'rgba(192,155,88,0.06)' : 'var(--bg-card)',
        border: awaitingQuote ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderLeft: awaitingQuote ? '4px solid var(--accent-dark)' : undefined,
        borderRadius: 'var(--radius)',
        padding: compact ? '12px 16px' : '16px 20px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
        marginBottom: '8px',
        boxShadow: awaitingQuote ? '0 0 0 3px rgba(192,155,88,0.15)' : 'var(--shadow-sm)',
        display: 'flex',
        gap: '14px',
        alignItems: 'stretch',
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
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--navy)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.3px' }}>
              {order.poNumber}
            </span>
            {order.kiraSkuNumber && (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{order.kiraSkuNumber}</span>
            )}
            {(order as any).isPriorityCustomer && (
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.15)', border: '1px solid rgba(192,155,88,0.3)', borderRadius: '99px', padding: '1px 8px', letterSpacing: '0.3px' }}>
                ★ Priority
              </span>
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

        {priorityReason && (
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '5px', padding: '2px 8px', marginBottom: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            🚨 {priorityReason}
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {order.orderType && <Tag text={order.orderType} />}
          {order.metalType && order.metalColor && <Tag text={`${order.metalType} · ${order.metalColor}`} />}
          {!hideFinancials && order.quotedCost && <Tag text={`$${order.quotedCost.toLocaleString()}`} gold />}
          {order.status === 'CAD_IN_PROGRESS' && (() => {
            const sub = (order as any).cadSubStatus;
            if (sub === 'APPROVED') return <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.15)', border: '1px solid var(--accent)', borderRadius: '5px', padding: '1px 7px' }}>💰 Awaiting Quote</span>;
            if (sub === 'REVISION') return <span style={{ fontSize: '10px', fontWeight: 700, color: '#8B5CF6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '5px', padding: '1px 7px' }}>↺ Revision</span>;
            return <span style={{ fontSize: '10px', fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '5px', padding: '1px 7px' }}>⏳ Pending CAD</span>;
          })()}
          {daysOverdue !== undefined && daysOverdue > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              ⚠ +{daysOverdue}d overdue
            </span>
          )}
          {(order as any).stoneStatus === StoneStatus.PENDING_STONE && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#5B21B6', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              💎 Pending Stone
            </span>
          )}
          {(order as any).stoneStatus === StoneStatus.STONE_RECEIVED && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#065F46', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              💎 Stone Received
            </span>
          )}
        </div>

        {(order.salesRepName || order.salesRepEmail) && (
          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
            Created by <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{order.salesRepName || order.salesRepEmail}</span>
          </div>
        )}
      </div>

      {/* Reference image thumbnail */}
      {referenceImage && (
        <div style={{ width: '76px', flexShrink: 0, alignSelf: 'center' }}>
          <img
            src={referenceImage}
            alt="Reference"
            style={{ width: '76px', height: '76px', objectFit: 'cover', borderRadius: '8px', display: 'block', border: '1px solid var(--border)' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
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
