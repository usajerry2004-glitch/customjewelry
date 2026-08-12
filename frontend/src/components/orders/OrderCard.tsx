import React from 'react';
import Image from 'next/image';
import { Order, STATUS_CONFIG, StoneStatus, FACTORY_CONFIG, SUPPLY_SOURCE_CONFIG, MOUNTING_OPTION_CONFIG, getCadSubLabel } from '../../utils/types';
import { formatCurrency } from '../../utils/format';

interface OrderCardProps {
  order: Partial<Order>;
  onClick?: (order: Partial<Order>) => void;
  compact?: boolean;
  hideFinancials?: boolean;
  referenceImage?: string;
  currentUserRole?: string;
}

function calcPriorityReason(order: Partial<Order>): string | null {
  const fin = ['COMPLETED','DELIVERED','CANCELLED'];
  if ((order as any).isPriorityCustomer && !fin.includes(order.status!)) return '★ Priority Customer';
  return null;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, compact, hideFinancials = false, referenceImage, currentUserRole }) => {
  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const cadSubLabel = order.status === 'CAD_IN_PROGRESS' ? getCadSubLabel(order as any) : null;
  const priorityReason = calcPriorityReason(order);
  const daysSinceCreated = order.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 86400000)) : null;

  return (
    <div
      onClick={() => onClick?.(order)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: compact ? '12px 16px' : '16px 20px',
        cursor: 'pointer',
        outline: 'none',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
        marginBottom: '8px',
        boxShadow: 'var(--shadow-sm)',
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
            {order.refCustomerPo && (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Cust PO# {order.refCustomerPo}</span>
            )}
            {(order as any).isPriorityCustomer && (
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.15)', border: '1px solid rgba(192,155,88,0.3)', borderRadius: '99px', padding: '1px 8px', letterSpacing: '0.3px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                ★ Priority
              </span>
            )}
            {order.mountingOption && MOUNTING_OPTION_CONFIG[order.mountingOption] && (
              <span style={{ fontSize: '10px', fontWeight: 700, color: MOUNTING_OPTION_CONFIG[order.mountingOption].color, background: MOUNTING_OPTION_CONFIG[order.mountingOption].bg, border: `1px solid ${MOUNTING_OPTION_CONFIG[order.mountingOption].color}40`, borderRadius: '99px', padding: '1px 8px', letterSpacing: '0.3px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {MOUNTING_OPTION_CONFIG[order.mountingOption].icon} {MOUNTING_OPTION_CONFIG[order.mountingOption].label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
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
              {cadSubLabel || cfg.label}
            </span>
            {daysSinceCreated !== null && (
              <span title={`Created ${daysSinceCreated === 0 ? 'today' : `${daysSinceCreated} day${daysSinceCreated === 1 ? '' : 's'} ago`}`} style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '3px 9px', borderRadius: '99px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {String(daysSinceCreated).padStart(2, '0')}d
              </span>
            )}
          </div>
        </div>

        {(order.storeName || order.customerFullName || !['FACTORY_MANAGER', 'STONE_MANAGER'].includes(currentUserRole || '')) && (
          <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
            {order.storeName || order.customerFullName || 'Unknown Store'}
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {priorityReason && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '5px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              🚨 {priorityReason}
            </span>
          )}
          {order.orderType && <Tag text={order.orderType} />}
          {order.metalType && order.metalColor && <Tag text={`${order.metalType} · ${order.metalColor}`} />}
          {!hideFinancials && order.quotedCost && <Tag text={formatCurrency(order.quotedCost)} gold />}
          {cadSubLabel === 'Revision' && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#8B5CF6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '5px', padding: '1px 7px' }}>↺ Revision</span>
          )}
          {order.status === 'VPO_ISSUED' && (!(order as any).assignedFactory || !order.supplySource) && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#0369A1', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: '5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              🏭 Assign Supplier
            </span>
          )}
          {order.status === 'VPO_ISSUED' && (order as any).assignedFactory && order.supplySource && (order as any).stoneStatus !== StoneStatus.STONE_RECEIVED && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#5B21B6', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              💎 Pending Stone
            </span>
          )}
          {(order as any).stoneStatus === StoneStatus.STONE_RECEIVED && order.status === 'VPO_ISSUED' && (order as any).assignedFactory && order.supplySource && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#065F46', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              💎 Stone Received
            </span>
          )}
          {(order as any).assignedFactory && FACTORY_CONFIG[(order as any).assignedFactory] && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: FACTORY_CONFIG[(order as any).assignedFactory].color, background: FACTORY_CONFIG[(order as any).assignedFactory].bg, border: `1px solid ${FACTORY_CONFIG[(order as any).assignedFactory].color}30`, borderRadius: '5px', padding: '1px 7px' }}>
              🏭 {FACTORY_CONFIG[(order as any).assignedFactory].label}
            </span>
          )}
          {order.supplySource && SUPPLY_SOURCE_CONFIG[order.supplySource] && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: SUPPLY_SOURCE_CONFIG[order.supplySource].color, background: SUPPLY_SOURCE_CONFIG[order.supplySource].bg, border: `1px solid ${SUPPLY_SOURCE_CONFIG[order.supplySource].color}30`, borderRadius: '5px', padding: '1px 7px' }}>
              💎 {SUPPLY_SOURCE_CONFIG[order.supplySource].label}
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
          <Image
            src={referenceImage}
            alt="Reference"
            width={76}
            height={76}
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
