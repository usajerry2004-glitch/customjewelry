import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { Order } from '../utils/types';

export async function getServerSideProps() {
  return { props: {} };
}

interface Metrics { readyToShip: number; shipped: number; delivered: number }

export default function ShippingPage() {
  const [ready, setReady] = useState<Order[]>([]);
  const [shipped, setShipped] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tab, setTab] = useState<'ready' | 'shipped'>('ready');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, { tracking: string; method: string }>>({});

  const reload = async () => {
    const [rRes, sRes, mRes] = await Promise.all([
      apiFetch(`${API}/shipping/ready`),
      apiFetch(`${API}/shipping/shipped`),
      apiFetch(`${API}/shipping/metrics`),
    ]);
    if (rRes.ok) setReady(await rRes.json());
    if (sRes.ok) setShipped(await sRes.json());
    if (mRes.ok) setMetrics(await mRes.json());
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const getTracking = (id: string) => trackingInputs[id] || { tracking: '', method: '' };
  const setTracking = (id: string, field: string, val: string) =>
    setTrackingInputs(p => ({ ...p, [id]: { ...getTracking(id), [field]: val } }));

  const dispatch = async (order: Order) => {
    const inputs = getTracking(order.id);
    if (!inputs.tracking.trim()) { alert('Please enter a tracking number.'); return; }
    setActionLoading(order.id + 'dispatch');
    await apiFetch(`${API}/shipping/${order.id}/dispatch`, {
      method: 'PATCH',
      body: JSON.stringify({ trackingNumber: inputs.tracking, shipMethod: inputs.method }),
    });
    await reload();
    setActionLoading(null);
  };

  const markDelivered = async (id: string) => {
    setActionLoading(id + 'deliver');
    await apiFetch(`${API}/shipping/${id}/deliver`, { method: 'PATCH' });
    await reload();
    setActionLoading(null);
  };

  const kpi = [
    { label: 'Ready to Ship', value: metrics?.readyToShip ?? 0, color: '#3B82F6' },
    { label: 'Shipped', value: metrics?.shipped ?? 0, color: '#6366F1' },
    { label: 'Delivered', value: metrics?.delivered ?? 0, color: '#10B981' },
  ];

  const SHIP_METHODS = ['FedEx', 'UPS', 'USPS', 'DHL', 'Hand Delivery', 'Other'];

  const OrderCard = ({ order, isReady }: { order: Order; isReady: boolean }) => {
    const inputs = getTracking(order.id);
    const busy = !!actionLoading;
    const statusColor = isReady ? '#3B82F6' : order.status === 'DELIVERED' ? '#10B981' : '#6366F1';
    const statusLabel = isReady ? 'Ready to Ship' : order.status === 'DELIVERED' ? 'Delivered' : 'Shipped';

    return (
      <div style={{ background: '#0F0F14', border: `1px solid ${statusColor}30`, borderRadius: '12px', padding: '18px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isReady ? '14px' : '0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#E2E8F0' }}>{order.poNumber}</span>
              <span style={{ background: `${statusColor}20`, color: statusColor, padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>
                {statusLabel}
              </span>
              {order.kiraSkuNumber && (
                <span style={{ background: '#1E1E2E', color: '#94A3B8', padding: '3px 8px', borderRadius: '6px', fontSize: '11px' }}>{order.kiraSkuNumber}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              {order.orderType} · {order.metalType} {order.metalColor}
              {order.customerFullName && ` · ${order.customerFullName}`}
            </div>
            {order.trackingNumber && (
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                Tracking: <span style={{ color: '#F6D860', fontWeight: 600 }}>{order.trackingNumber}</span>
                {(order as any).shipMethod && ` via ${(order as any).shipMethod}`}
              </div>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#4B5563' }}>
            {new Date(order.updatedAt).toLocaleDateString()}
          </div>
        </div>

        {isReady && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto', gap: '8px' }}>
            <input
              value={inputs.tracking}
              onChange={e => setTracking(order.id, 'tracking', e.target.value)}
              placeholder="Tracking number *"
              style={{ background: '#111118', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '8px 10px', color: '#E2E8F0', fontSize: '12px', outline: 'none' }}
            />
            <select
              value={inputs.method}
              onChange={e => setTracking(order.id, 'method', e.target.value)}
              style={{ background: '#111118', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '8px 10px', color: inputs.method ? '#E2E8F0' : '#4B5563', fontSize: '12px', outline: 'none' }}
            >
              <option value="">Carrier…</option>
              {SHIP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              onClick={() => dispatch(order)}
              disabled={busy}
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '7px', padding: '8px 16px', color: '#3B82F6', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}
            >
              🚚 Dispatch
            </button>
          </div>
        )}

        {!isReady && order.status === 'SHIPPED' && (
          <div style={{ marginTop: '10px' }}>
            <button
              onClick={() => markDelivered(order.id)}
              disabled={busy}
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '7px', padding: '8px 18px', color: '#10B981', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
            >
              ✅ Mark Delivered
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout title="Shipping" subtitle="Dispatch & delivery tracking">
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {kpi.map(k => (
          <div key={k.label} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#0A0A12', borderRadius: '10px', padding: '4px', width: 'fit-content', border: '1px solid #1E1E2E' }}>
        {(['ready', 'shipped'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: tab === t ? '#1E1E2E' : 'transparent', color: tab === t ? '#F6D860' : '#64748B', fontSize: '13px', fontWeight: tab === t ? 600 : 400, cursor: 'pointer' }}
          >
            {t === 'ready' ? `Ready to Ship (${ready.length})` : `Shipped / Delivered (${shipped.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #1E1E2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#E2E8F0', margin: 0 }}>
            {tab === 'ready' ? 'Orders Ready for Dispatch' : 'Shipped & Delivered Orders'}
          </h2>
          <button onClick={reload} style={{ background: '#1A1A24', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '6px 12px', color: '#64748B', fontSize: '12px', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#4B5563' }}>Loading…</div>
        ) : (
          <div style={{ padding: '16px' }}>
            {tab === 'ready' ? (
              ready.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#2D2D3D' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>📦</div>
                  <div style={{ fontSize: '14px' }}>No orders ready to ship right now.</div>
                </div>
              ) : ready.map(o => <OrderCard key={o.id} order={o} isReady={true} />)
            ) : (
              shipped.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#2D2D3D' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>🚚</div>
                  <div style={{ fontSize: '14px' }}>No shipped orders yet.</div>
                </div>
              ) : shipped.map(o => <OrderCard key={o.id} order={o} isReady={false} />)
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
