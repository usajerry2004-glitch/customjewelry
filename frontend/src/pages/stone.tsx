import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { Order, OrderStatus, StoneStatus, STATUS_CONFIG } from '../utils/types';
import { toast } from '../utils/toast';

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' };

export default function StonePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/manufacturing/queue`);
      if (res.ok) {
        const all: Order[] = await res.json();
        setOrders(all.filter(o => o.status === OrderStatus.VPO_ISSUED));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const pendingCount  = orders.filter(o => o.stoneStatus !== StoneStatus.STONE_RECEIVED).length;
  const receivedCount = orders.filter(o => o.stoneStatus === StoneStatus.STONE_RECEIVED).length;

  const markStoneSent = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`${API}/manufacturing/${id}/stone-sent`, { method: 'PATCH' });
      await reload();
    } catch {
      toast.error('Failed to update — check your connection and try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const kpi = [
    { label: 'Pending Stone',   value: pendingCount,  color: '#7C3AED' },
    { label: 'Stone Received',  value: receivedCount, color: '#059669' },
    { label: 'Total VPO Issued',value: orders.length, color: '#0891B2' },
  ];

  return (
    <AppLayout title="Stone Department" subtitle="Manage stone dispatch for VPO-issued orders">
      {/* KPIs */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {kpi.map(k => (
          <div key={k.label} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '32px', fontWeight: 600, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Orders list */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Stone Queue</h2>
          <button onClick={reload} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 14px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>💎</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>No VPO-issued orders awaiting stone.</div>
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>Orders appear here once a VPO is issued.</div>
          </div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {orders.map(order => {
              const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#6B7280' };
              const unassigned = !order.assignedFactory || !order.supplySource;
              const stonePending = order.stoneStatus !== StoneStatus.STONE_RECEIVED;
              const busy = actionLoading === order.id;

              return (
                <div key={order.id} style={{ background: 'var(--bg-input)', border: `1px solid ${stonePending ? '#7C3AED30' : '#05966930'}`, borderLeft: `3px solid ${stonePending ? '#7C3AED' : '#059669'}`, borderRadius: 'var(--radius)', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{order.poNumber}</span>
                        <span style={{ background: `${cfg.color}15`, color: cfg.color, padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>{cfg.label}</span>
                        {order.kiraSkuNumber && (
                          <span style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', border: '1px solid var(--border)' }}>{order.kiraSkuNumber}</span>
                        )}
                        {unassigned
                          ? <span style={{ background: 'rgba(14,165,233,0.1)', color: '#0369A1', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>🏭 Assign Supplier</span>
                          : stonePending
                            ? <span style={{ background: '#EDE9FE', color: '#5B21B6', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>⏳ Pending Stone</span>
                            : <span style={{ background: '#D1FAE5', color: '#065F46', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>💎 Stone Received</span>
                        }
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {order.orderType} · {order.metalType} {order.metalColor}
                        {order.customerFullName && ` · ${order.customerFullName}`}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(order.updatedAt).toLocaleDateString()}
                    </div>
                  </div>

                  {unassigned && (
                    <div style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#0369A1', fontWeight: 500 }}>
                      🏭 This order needs a factory and stone supplier assigned before it can be worked on.
                    </div>
                  )}

                  {!unassigned && stonePending && (
                    <button
                      onClick={() => markStoneSent(order.id)}
                      disabled={busy}
                      style={{ background: '#7C3AED', border: 'none', borderRadius: '7px', padding: '8px 20px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
                    >
                      {busy ? 'Sending…' : 'Mark Stone Sent'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
