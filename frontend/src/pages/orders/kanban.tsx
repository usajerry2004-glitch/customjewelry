import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { Order, STATUS_CONFIG, getCadSubLabel } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

interface KanbanColumn { status: string; orders: Partial<Order>[]; count: number; }

const COLUMN_ORDER = [
  'NEW', 'CAD_IN_PROGRESS',
  'VPO_ISSUED', 'MANUFACTURED', 'COMPLETED',
  'REPAIR', 'CANCELLED', 'SHIPPED',
];

const PHASES = [
  {
    label: 'New',
    icon: '📥',
    statuses: ['NEW'],
    color: '#EC4899',
  },
  {
    label: 'Design',
    icon: '✏️',
    statuses: ['CAD_IN_PROGRESS'],
    color: '#6366F1',
  },
  {
    label: 'Production',
    icon: '🏭',
    statuses: ['VPO_ISSUED'],
    color: '#F59E0B',
  },
  {
    label: 'Fulfilment',
    icon: '🚚',
    statuses: ['MANUFACTURED', 'COMPLETED'],
    color: '#10B981',
  },
  {
    label: 'Aftercare',
    icon: '🔧',
    statuses: ['REPAIR', 'CANCELLED'],
    color: '#EF4444',
  },
];

const CAD_SUB_LABELS: { status: string; label: string; color: string }[] = [
  { status: 'PENDING_CAD',       label: 'Pending CAD',       color: '#6B7280' },
  { status: 'AWAITING_QUOTE',    label: 'Awaiting Quote',    color: '#F59E0B' },
  { status: 'AWAITING_APPROVAL', label: 'Awaiting Approval', color: '#3B82F6' },
  { status: 'REVISION',          label: 'Revision',          color: '#8B5CF6' },
];

export default function KanbanPage() {
  const router = useRouter();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('CAD_IN_PROGRESS');
  const [userRole, setUserRole] = useState('');
  const [cadCounts, setCadCounts] = useState<Record<string, number>>({});
  const [cadSubFilter, setCadSubFilter] = useState<string | null>(null);

  useEffect(() => {
    try { const u = localStorage.getItem('jf_user'); if (u) setUserRole(JSON.parse(u).role || ''); } catch {}
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/orders/kanban`),
      apiFetch(`${API}/cad/status-counts`),
    ]).then(async ([kanbanRes, cadRes]) => {
      if (kanbanRes.ok) {
        const data: KanbanColumn[] = await kanbanRes.json();
        setColumns(
          [...data]
            .sort((a, b) => COLUMN_ORDER.indexOf(a.status) - COLUMN_ORDER.indexOf(b.status))
            .filter(col => COLUMN_ORDER.includes(col.status))
        );
      }
      if (cadRes.ok) setCadCounts(await cadRes.json());
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
  const rawSelectedCol = getColumn(selected);
  const selectedCol = selected === 'CAD_IN_PROGRESS' && cadSubFilter
    ? { ...rawSelectedCol!, orders: (rawSelectedCol?.orders || []).filter(o => getCadSubLabel(o as any) === CAD_SUB_LABELS.find(s => s.status === cadSubFilter)?.label) }
    : rawSelectedCol;
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
                        <React.Fragment key={status}>
                          <button
                            onClick={() => { setSelected(status); if (status !== 'CAD_IN_PROGRESS') setCadSubFilter(null); }}
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
                          {/* CAD label sub-rows — only for CAD_IN_PROGRESS */}
                          {status === 'CAD_IN_PROGRESS' && CAD_SUB_LABELS.filter(s => (cadCounts[s.status] || 0) > 0).length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px', paddingLeft: '12px', borderLeft: '2px solid var(--border)' }}>
                              {CAD_SUB_LABELS.filter(s => (cadCounts[s.status] || 0) > 0).map(s => {
                                const isSubSelected = cadSubFilter === s.status;
                                return (
                                  <button
                                    key={s.status}
                                    onClick={() => { setSelected('CAD_IN_PROGRESS'); setCadSubFilter(isSubSelected ? null : s.status); }}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 7px', borderRadius: '5px', cursor: 'pointer', width: '100%', textAlign: 'left', border: isSubSelected ? `1px solid ${s.color}50` : '1px solid transparent', background: isSubSelected ? `${s.color}15` : `${s.color}08`, transition: 'all 0.12s' }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                      <span style={{ fontSize: '10px', color: s.color, fontWeight: isSubSelected ? 700 : 600 }}>{s.label}</span>
                                    </div>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: s.color }}>{cadCounts[s.status]}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </React.Fragment>
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
                  <div key={order.id}>
                    <OrderCard order={order} compact onClick={() => router.push(`/orders/${order.id}`)} currentUserRole={userRole} hideFinancials={userRole === 'FACTORY_MANAGER'} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Full pipeline overview — grouped by phase ── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '14px' }}>
              Full Pipeline Overview
            </div>

            {/* Phase groups */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
              {PHASES.map(phase => {
                const phaseStatuses = phase.statuses
                  .map(s => columns.find(c => c.status === s))
                  .filter(Boolean) as { status: string; orders: any[]; count: number }[];
                const phaseTotal = phaseStatuses.reduce((s, c) => s + c.count, 0);
                if (phaseTotal === 0) return null;

                return (
                  <div key={phase.label} style={{ flex: phaseTotal, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {/* Phase label */}
                    <div style={{ fontSize: '9px', fontWeight: 700, color: phase.color, textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'center', marginBottom: '2px' }}>
                      {phase.label}
                    </div>
                    {/* Status segments within phase */}
                    <div style={{ display: 'flex', gap: '2px', height: '36px' }}>
                      {phaseStatuses.filter(c => c.count > 0).map(col => {
                        const cfg = STATUS_CONFIG[col.status] || { label: col.status, color: '#6B7280' };
                        const isSelected = selected === col.status;
                        return (
                          <button
                            key={col.status}
                            onClick={() => setSelected(col.status)}
                            title={`${cfg.label}: ${col.count}`}
                            style={{
                              flex: col.count,
                              background: isSelected ? cfg.color : `${cfg.color}45`,
                              borderRadius: '5px',
                              border: isSelected ? `2px solid ${cfg.color}` : '2px solid transparent',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              minWidth: '28px', overflow: 'hidden',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = cfg.color;
                              const span = (e.currentTarget as HTMLElement).querySelector('span');
                              if (span) span.style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = isSelected ? cfg.color : `${cfg.color}45`;
                              const span = (e.currentTarget as HTMLElement).querySelector('span');
                              if (span) span.style.color = isSelected ? '#fff' : cfg.color;
                            }}
                          >
                            <span style={{ fontSize: '11px', fontWeight: 700, color: isSelected ? '#fff' : cfg.color, pointerEvents: 'none', transition: 'color 0.15s' }}>
                              {col.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Sub-status labels */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {phaseStatuses.filter(c => c.count > 0).map(col => {
                        const cfg = STATUS_CONFIG[col.status] || { label: col.status, color: '#6B7280' };
                        const isSelected = selected === col.status;
                        return (
                          <button key={col.status} onClick={() => setSelected(col.status)}
                            style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', color: isSelected ? cfg.color : 'var(--text-muted)', fontWeight: isSelected ? 700 : 400, whiteSpace: 'nowrap' }}>
                              {cfg.label} ({col.count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </AppLayout>
  );
}
