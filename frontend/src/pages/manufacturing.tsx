import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { Order, OrderStatus, StoneStatus, STATUS_CONFIG } from '../utils/types';

export async function getServerSideProps() { return { props: {} }; }

interface Metrics { pendingStart: number; inProgress: number; jobBagCreated: number; readyToShip: number; pendingStone: number }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' };
const inp: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', width: '100%' };

export default function ManufacturingPage() {
  const [queue, setQueue] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [vpoInputs, setVpoInputs] = useState<Record<string, { vpo: string; jobBag: string; vendor: string }>>({});

  const reload = async () => {
    const [qRes, mRes] = await Promise.all([apiFetch(`${API}/manufacturing/queue`), apiFetch(`${API}/manufacturing/metrics`)]);
    if (qRes.ok) setQueue(await qRes.json());
    if (mRes.ok) setMetrics(await mRes.json());
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const getVpo = (id: string) => vpoInputs[id] || { vpo: '', jobBag: '', vendor: '' };
  const setVpo = (id: string, field: string, val: string) =>
    setVpoInputs(p => ({ ...p, [id]: { ...getVpo(id), [field]: val } }));

  const action = async (id: string, endpoint: string, body?: object) => {
    setActionLoading(id + endpoint);
    await apiFetch(`${API}/manufacturing/${id}/${endpoint}`, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
    await reload();
    setActionLoading(null);
  };

  const moveStatus = async (orderId: string, status: string) => {
    setActionLoading(orderId + status);
    await apiFetch(`${API}/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await reload();
    setActionLoading(null);
  };

  const kpi = [
    { label: 'Pending Start',  value: metrics?.pendingStart ?? 0,  color: '#EA6C28' },
    { label: 'VPO Issued',     value: metrics?.inProgress ?? 0,    color: '#0891B2' },
    { label: 'Pending Stone',  value: metrics?.pendingStone ?? 0,  color: '#7C3AED' },
    { label: 'Job Bag Created',value: metrics?.jobBagCreated ?? 0, color: '#0D9488' },
    { label: 'Ready to Ship',  value: metrics?.readyToShip ?? 0,   color: '#2563EB' },
  ];

  return (
    <AppLayout title="Manufacturing" subtitle="Factory queue & production tracking">
      {/* KPIs */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {kpi.map(k => (
          <div key={k.label} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '32px', fontWeight: 600, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Queue */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Production Queue</h2>
          <button onClick={reload} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 14px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : queue.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>🏭</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>No orders in the production queue.</div>
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>Orders appear here once a SKU is generated.</div>
          </div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {queue.map(order => {
              const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#6B7280' };
              const inputs = getVpo(order.id);
              const busy = !!actionLoading;

              return (
                <div key={order.id} style={{ background: 'var(--bg-input)', border: `1px solid ${cfg.color}30`, borderLeft: `3px solid ${cfg.color}`, borderRadius: 'var(--radius)', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{order.poNumber}</span>
                        <span style={{ background: `${cfg.color}15`, color: cfg.color, padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>{cfg.label}</span>
                        {order.kiraSkuNumber && (
                          <span style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', border: '1px solid var(--border)' }}>{order.kiraSkuNumber}</span>
                        )}
                        {order.status === OrderStatus.VPO_ISSUED && (
                          order.stoneStatus === StoneStatus.STONE_RECEIVED
                            ? <span style={{ background: '#D1FAE5', color: '#065F46', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>💎 Stone Received</span>
                            : <span style={{ background: '#EDE9FE', color: '#5B21B6', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>⏳ Pending Stone</span>
                        )}
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

                  {(order.status === OrderStatus.SKU_CREATION || order.status === OrderStatus.CUSTOMER_APPROVED) && (
                    <div className="mfg-action-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px' }}>
                      <input value={inputs.vpo} onChange={e => setVpo(order.id, 'vpo', e.target.value)} placeholder="VPO Number" style={inp} />
                      <input value={inputs.jobBag} onChange={e => setVpo(order.id, 'jobBag', e.target.value)} placeholder="Job Bag Number" style={inp} />
                      <button onClick={() => action(order.id, 'start', { vpoNumber: inputs.vpo, jobBagNumber: inputs.jobBag })} disabled={busy}
                        style={{ background: '#0891B2', border: 'none', borderRadius: '7px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                        Issue VPO & Start
                      </button>
                    </div>
                  )}

                  {order.status === OrderStatus.VPO_ISSUED && (
                    order.stoneStatus !== StoneStatus.STONE_RECEIVED ? (
                      <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#92400E', fontWeight: 500 }}>
                        ⏳ Waiting for Stone Manager to confirm stone receipt before production can proceed.
                      </div>
                    ) : (
                      <div className="mfg-action-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px' }}>
                        <input value={inputs.vendor} onChange={e => setVpo(order.id, 'vendor', e.target.value)} placeholder="Vendor / Factory Name" style={inp} />
                        <button onClick={() => moveStatus(order.id, 'PENDING_CONTRACTOR')} disabled={busy}
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: '7px', padding: '8px 16px', color: 'var(--accent-dark)', fontSize: '12px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                          Pending Contractor
                        </button>
                        <button onClick={() => moveStatus(order.id, 'READY_TO_SHIP')} disabled={busy}
                          style={{ background: 'var(--navy)', border: 'none', borderRadius: '7px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                          Ready to Ship
                        </button>
                      </div>
                    )
                  )}

                  {order.status === OrderStatus.PENDING_CONTRACTOR && (
                    <div className="mfg-action-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                      <input value={inputs.vendor} onChange={e => setVpo(order.id, 'vendor', e.target.value)} placeholder="Vendor / Factory Name" style={inp} />
                      <button onClick={() => moveStatus(order.id, 'READY_TO_SHIP')} disabled={busy}
                        style={{ background: 'var(--navy)', border: 'none', borderRadius: '7px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                        Ready to Ship
                      </button>
                    </div>
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
