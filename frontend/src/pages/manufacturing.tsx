import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { Order, OrderStatus, STATUS_CONFIG } from '../utils/types';

export async function getServerSideProps() {
  return { props: {} };
}

interface Metrics { pendingStart: number; inProgress: number; jobBagCreated: number; readyToShip: number }

export default function ManufacturingPage() {
  const [queue, setQueue] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [vpoInputs, setVpoInputs] = useState<Record<string, { vpo: string; jobBag: string; vendor: string }>>({});

  const reload = async () => {
    const [qRes, mRes] = await Promise.all([
      apiFetch(`${API}/manufacturing/queue`),
      apiFetch(`${API}/manufacturing/metrics`),
    ]);
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
    await apiFetch(`${API}/manufacturing/${id}/${endpoint}`, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
    await reload();
    setActionLoading(null);
  };

  const kpi = [
    { label: 'Pending Start', value: metrics?.pendingStart ?? 0, color: '#F97316' },
    { label: 'VPO Issued', value: metrics?.inProgress ?? 0, color: '#0EA5E9' },
    { label: 'Job Bag Created', value: metrics?.jobBagCreated ?? 0, color: '#14B8A6' },
    { label: 'Ready to Ship', value: metrics?.readyToShip ?? 0, color: '#3B82F6' },
  ];

  return (
    <AppLayout title="Manufacturing" subtitle="Factory queue & production tracking">
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {kpi.map(k => (
          <div key={k.label} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Queue */}
      <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #1E1E2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#E2E8F0', margin: 0 }}>Production Queue</h2>
          <button onClick={reload} style={{ background: '#1A1A24', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '6px 12px', color: '#64748B', fontSize: '12px', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#4B5563' }}>Loading…</div>
        ) : queue.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#2D2D3D' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🏭</div>
            <div style={{ fontSize: '14px' }}>No orders in the production queue.</div>
            <div style={{ fontSize: '12px', color: '#1E1E2E', marginTop: '4px' }}>Orders appear here once SKU is generated.</div>
          </div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {queue.map(order => {
              const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#64748B' };
              const inputs = getVpo(order.id);
              const busy = !!actionLoading;

              return (
                <div key={order.id} style={{ background: '#0F0F14', border: `1px solid ${cfg.color}30`, borderRadius: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#E2E8F0' }}>{order.poNumber}</span>
                        <span style={{ background: `${cfg.color}20`, color: cfg.color, padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>{cfg.label}</span>
                        {order.kiraSkuNumber && (
                          <span style={{ background: '#1E1E2E', color: '#94A3B8', padding: '3px 8px', borderRadius: '6px', fontSize: '11px' }}>{order.kiraSkuNumber}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        {order.orderType} · {order.metalType} {order.metalColor}
                        {order.customerFullName && ` · ${order.customerFullName}`}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#4B5563' }}>
                      {new Date(order.updatedAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* SKU_CREATION / CUSTOMER_APPROVED → start production */}
                  {(order.status === OrderStatus.SKU_CREATION || order.status === OrderStatus.CUSTOMER_APPROVED) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <input value={inputs.vpo} onChange={e => setVpo(order.id, 'vpo', e.target.value)} placeholder="VPO Number"
                        style={{ background: '#111118', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '8px 10px', color: '#E2E8F0', fontSize: '12px', outline: 'none' }} />
                      <input value={inputs.jobBag} onChange={e => setVpo(order.id, 'jobBag', e.target.value)} placeholder="Job Bag Number"
                        style={{ background: '#111118', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '8px 10px', color: '#E2E8F0', fontSize: '12px', outline: 'none' }} />
                      <button
                        onClick={() => action(order.id, 'start', { vpoNumber: inputs.vpo, jobBagNumber: inputs.jobBag })}
                        disabled={busy}
                        style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.4)', borderRadius: '7px', padding: '8px', color: '#0EA5E9', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
                      >
                        🚀 Issue VPO & Start
                      </button>
                    </div>
                  )}

                  {/* VPO_ISSUED → create job bag */}
                  {order.status === OrderStatus.VPO_ISSUED && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <input value={inputs.jobBag} onChange={e => setVpo(order.id, 'jobBag', e.target.value)} placeholder="Job Bag Number"
                        style={{ background: '#111118', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '8px 10px', color: '#E2E8F0', fontSize: '12px', outline: 'none' }} />
                      <input value={inputs.vendor} onChange={e => setVpo(order.id, 'vendor', e.target.value)} placeholder="Vendor / Factory Name"
                        style={{ background: '#111118', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '8px 10px', color: '#E2E8F0', fontSize: '12px', outline: 'none' }} />
                      <button
                        onClick={() => action(order.id, 'jobbag', { jobBagNumber: inputs.jobBag, vendorName: inputs.vendor })}
                        disabled={busy}
                        style={{ background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.4)', borderRadius: '7px', padding: '8px', color: '#14B8A6', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
                      >
                        📋 Create Job Bag
                      </button>
                    </div>
                  )}

                  {/* ORDER_JOB_BAG_CREATED → complete */}
                  {order.status === OrderStatus.ORDER_JOB_BAG_CREATED && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                      <button
                        onClick={() => action(order.id, 'complete')}
                        disabled={busy}
                        style={{ flex: 1, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '7px', padding: '10px', color: '#10B981', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
                      >
                        ✅ Mark Manufacturing Complete — Move to Ready to Ship
                      </button>
                    </div>
                  )}

                  {order.status === OrderStatus.ORDER_JOB_BAG_CREATED && (
                    <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '6px' }}>
                      Completing will notify the authorizer and customer that the order is ready for shipment.
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
