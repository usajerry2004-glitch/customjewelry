import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { Order, STATUS_CONFIG } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

interface KanbanColumn { status: string; orders: Partial<Order>[]; count: number; }

const COLUMN_ORDER = [
  'WAITING_CONFIRMATION', 'PENDING_CAD', 'CAD_IN_PROGRESS', 'CUSTOMER_APPROVED',
  'SKU_CREATION', 'VPO_ISSUED', 'PENDING_CONTRACTOR', 'ORDER_JOB_BAG_CREATED',
  'READY_TO_INVOICE', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED',
];

const PHASES = [
  {
    label: 'Intake',
    icon: '📥',
    statuses: ['WAITING_CONFIRMATION', 'PENDING_CAD'],
    color: '#6366F1',
  },
  {
    label: 'Design',
    icon: '✏️',
    statuses: ['CAD_IN_PROGRESS', 'CUSTOMER_APPROVED', 'SKU_CREATION'],
    color: '#F59E0B',
  },
  {
    label: 'Manufacturing',
    icon: '🏭',
    statuses: ['VPO_ISSUED', 'PENDING_CONTRACTOR', 'ORDER_JOB_BAG_CREATED', 'READY_TO_INVOICE'],
    color: '#EF4444',
  },
  {
    label: 'Delivery',
    icon: '🚚',
    statuses: ['READY_TO_SHIP', 'SHIPPED', 'DELIVERED'],
    color: '#10B981',
  },
];

export default function KanbanPage() {
  const router = useRouter();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('WAITING_CONFIRMATION');

  useEffect(() => {
    apiFetch(`${API}/orders/kanban`).then(async res => {
      if (res.ok) {
        const data: KanbanColumn[] = await res.json();
        setColumns(
          [...data]
            .sort((a, b) => COLUMN_ORDER.indexOf(a.status) - COLUMN_ORDER.indexOf(b.status))
            .filter(col => COLUMN_ORDER.includes(col.status))
        );
      }
      setLoading(false);
    });
  }, []);

  const updateStatus = async (orderId: string, newStatus: string) => {
    await apiFetch(`${API}/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    setColumns(prev => {
      const order = prev.flatMap(c => c.orders).find(o => o.id === orderId);
      if (!order) return prev;
      return prev.map(col => ({
        ...col,
        orders: col.status === newStatus
          ? [...col.orders, { ...order, status: newStatus as any }]
          : col.orders.filter(o => o.id !== orderId),
        count: col.status === newStatus
          ? col.count + 1
          : col.orders.some(o => o.id === orderId) ? col.count - 1 : col.count,
      }));
    });
  };

  const getColumn = (status: string) => columns.find(c => c.status === status);
  const selectedCol = getColumn(selected);
  const selectedCfg = STATUS_CONFIG[selected] || { label: selected, color: '#6B7280', bg: '#F3F4F6' };
  const totalOrders = columns.reduce((sum, c) => sum + c.count, 0);
  const nextStatus = COLUMN_ORDER[COLUMN_ORDER.indexOf(selected) + 1];
  const nextCfg = nextStatus ? STATUS_CONFIG[nextStatus] : null;

  return (
    <AppLayout
      title="Pipeline Board"
      subtitle={`${totalOrders} active orders · ${columns.length} stages`}
      actions={
        <button
          onClick={() => router.push('/orders')}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 16px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
        >
          ☰ List view
        </button>
      }
    >
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>
          Loading pipeline…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── Phase selector grid ── */}
          <div className="kanban-phase-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {PHASES.map(phase => {
              const phaseTotal = phase.statuses.reduce((sum, s) => sum + (getColumn(s)?.count || 0), 0);
              const phaseActive = phase.statuses.includes(selected);
              return (
                <div
                  key={phase.label}
                  style={{
                    background: 'var(--bg-card)',
                    border: `1px solid ${phaseActive ? phase.color + '40' : 'var(--border)'}`,
                    borderTop: `3px solid ${phase.color}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '14px',
                    boxShadow: phaseActive ? `0 0 0 1px ${phase.color}20, var(--shadow-sm)` : 'var(--shadow-sm)',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Phase header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>{phase.icon}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: phase.color,
                        letterSpacing: '0.8px', textTransform: 'uppercase',
                      }}>
                        {phase.label}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '12px', background: `${phase.color}15`, color: phase.color,
                      borderRadius: '99px', padding: '2px 9px', fontWeight: 700,
                    }}>
                      {phaseTotal}
                    </span>
                  </div>

                  {/* Status buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {phase.statuses.map(status => {
                      const col = getColumn(status);
                      const cfg = STATUS_CONFIG[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' };
                      const isSelected = selected === status;
                      const count = col?.count || 0;
                      return (
                        <button
                          key={status}
                          onClick={() => setSelected(status)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
                            border: isSelected ? `1.5px solid ${cfg.color}60` : '1.5px solid transparent',
                            background: isSelected ? `${cfg.color}12` : 'var(--bg-input)',
                            transition: 'all 0.12s', width: '100%', textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                            <div style={{
                              width: '7px', height: '7px', borderRadius: '50%',
                              background: cfg.color, flexShrink: 0,
                              boxShadow: isSelected ? `0 0 5px ${cfg.color}80` : 'none',
                            }} />
                            <span style={{
                              fontSize: '11px',
                              color: isSelected ? cfg.color : 'var(--text-secondary)',
                              fontWeight: isSelected ? 700 : 500,
                              lineHeight: 1.3,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {cfg.label}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '12px', fontWeight: 700, flexShrink: 0, marginLeft: '6px',
                            color: count > 0 ? cfg.color : 'var(--text-muted)',
                          }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Selected status order panel ── */}
          <div style={{
            background: 'var(--bg-card)',
            border: `1px solid ${selectedCfg.color}30`,
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: selectedCfg.color, boxShadow: `0 0 6px ${selectedCfg.color}60` }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedCfg.label}
                </span>
                <span style={{
                  fontSize: '12px', background: `${selectedCfg.color}15`, color: selectedCfg.color,
                  borderRadius: '99px', padding: '2px 10px', fontWeight: 700,
                }}>
                  {selectedCol?.count || 0} {selectedCol?.count === 1 ? 'order' : 'orders'}
                </span>
              </div>
              {nextCfg && (selectedCol?.count || 0) > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: nextCfg.color, fontWeight: 600 }}>→ {nextCfg.label}</span>
                  &nbsp;button advances each order
                </span>
              )}
            </div>

            {/* Empty state */}
            {!selectedCol || selectedCol.orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.25 }}>📭</div>
                <div style={{ fontWeight: 500 }}>No orders in this stage</div>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>All clear here</div>
              </div>
            ) : (
              /* Order cards grid — auto-fills available width, no horizontal scroll */
              <div className="kanban-orders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: '10px' }}>
                {selectedCol.orders.map(order => (
                  <div key={order.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <OrderCard order={order} compact onClick={() => router.push(`/orders/${order.id}`)} />
                    {nextCfg && (
                      <button
                        onClick={() => updateStatus(order.id!, nextStatus)}
                        style={{
                          fontSize: '11px', padding: '5px 10px', borderRadius: '7px', cursor: 'pointer',
                          fontWeight: 600, letterSpacing: '0.2px',
                          border: `1px solid ${nextCfg.color}40`,
                          background: `${nextCfg.color}0D`,
                          color: nextCfg.color,
                          display: 'flex', alignItems: 'center', gap: '5px',
                          width: '100%', justifyContent: 'center',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${nextCfg.color}1A`)}
                        onMouseLeave={e => (e.currentTarget.style.background = `${nextCfg.color}0D`)}
                      >
                        → Move to {nextCfg.label}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Full pipeline progress bar ── */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '12px' }}>
              Full pipeline overview
            </div>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'stretch', height: '36px' }}>
              {columns.map(col => {
                const cfg = STATUS_CONFIG[col.status] || { label: col.status, color: '#6B7280' };
                const pct = totalOrders > 0 ? (col.count / totalOrders) * 100 : 0;
                if (pct < 0.5) return null;
                const isSelected = selected === col.status;
                return (
                  <button
                    key={col.status}
                    onClick={() => setSelected(col.status)}
                    title={`${cfg.label}: ${col.count}`}
                    style={{
                      flex: col.count,
                      background: isSelected ? cfg.color : `${cfg.color}50`,
                      borderRadius: '5px',
                      border: isSelected ? `2px solid ${cfg.color}` : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: col.count > 0 ? '28px' : '0',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = cfg.color; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = `${cfg.color}50`; }}
                  >
                    {col.count > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: isSelected ? '#fff' : cfg.color, pointerEvents: 'none' }}>
                        {col.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Labels */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              {columns.filter(c => c.count > 0).map(col => {
                const cfg = STATUS_CONFIG[col.status] || { label: col.status, color: '#6B7280' };
                const isSelected = selected === col.status;
                return (
                  <button
                    key={col.status}
                    onClick={() => setSelected(col.status)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px', background: 'none',
                      border: 'none', cursor: 'pointer', padding: '2px 0',
                    }}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: isSelected ? cfg.color : 'var(--text-muted)', fontWeight: isSelected ? 700 : 400 }}>
                      {cfg.label} ({col.count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </AppLayout>
  );
}
