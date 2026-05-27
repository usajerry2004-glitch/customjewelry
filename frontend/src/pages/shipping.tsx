import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { Order, OrderStatus } from '../utils/types';

export async function getServerSideProps() { return { props: {} }; }

interface Metrics { readyToShip: number; shipped: number; delivered: number }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' };
const inp: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', width: '100%' };
const SHIP_METHODS = ['FedEx', 'UPS', 'USPS', 'DHL', 'Hand Delivery', 'Other'];

export default function ShippingPage() {
  const [ready, setReady] = useState<Order[]>([]);
  const [shipped, setShipped] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tab, setTab] = useState<'ready' | 'shipped'>('ready');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, { tracking: string; method: string }>>({});

  const reload = async () => {
    const [rRes, sRes, mRes] = await Promise.all([apiFetch(`${API}/shipping/ready`), apiFetch(`${API}/shipping/shipped`), apiFetch(`${API}/shipping/metrics`)]);
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
    await apiFetch(`${API}/shipping/${order.id}/dispatch`, { method: 'PATCH', body: JSON.stringify({ trackingNumber: inputs.tracking, shipMethod: inputs.method }) });
    await reload(); setActionLoading(null);
  };

  const markDelivered = async (id: string) => {
    setActionLoading(id + 'deliver');
    await apiFetch(`${API}/shipping/${id}/deliver`, { method: 'PATCH' });
    await reload(); setActionLoading(null);
  };

  const kpi = [
    { label: 'Ready to Ship', value: metrics?.readyToShip ?? 0, color: '#2563EB' },
    { label: 'Shipped',        value: metrics?.shipped ?? 0,     color: '#6366F1' },
    { label: 'Delivered',      value: metrics?.delivered ?? 0,   color: '#059669' },
  ];

  const ShipCard = ({ order, isReady }: { order: Order; isReady: boolean }) => {
    const inputs = getTracking(order.id);
    const busy = !!actionLoading;
    const statusColor = isReady ? '#2563EB' : order.status === OrderStatus.DELIVERED ? '#059669' : '#6366F1';
    const statusLabel = isReady ? 'Ready to Ship' : order.status === OrderStatus.DELIVERED ? 'Delivered' : 'Shipped';

    return (
      <div style={{ background: 'var(--bg-input)', border: `1px solid ${statusColor}25`, borderLeft: `3px solid ${statusColor}`, borderRadius: 'var(--radius)', padding: '16px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isReady ? '14px' : '0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{order.poNumber}</span>
              <span style={{ background: `${statusColor}15`, color: statusColor, padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>{statusLabel}</span>
              {order.kiraSkuNumber && (
                <span style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', border: '1px solid var(--border)' }}>{order.kiraSkuNumber}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {order.orderType} · {order.metalType} {order.metalColor}
              {order.customerFullName && ` · ${order.customerFullName}`}
            </div>
            {order.trackingNumber && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Tracking: <span style={{ color: 'var(--accent-dark)', fontWeight: 600 }}>{order.trackingNumber}</span>
                {(order as any).shipMethod && ` via ${(order as any).shipMethod}`}
              </div>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(order.updatedAt).toLocaleDateString()}</div>
        </div>

        {isReady && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto', gap: '8px' }}>
            <input value={inputs.tracking} onChange={e => setTracking(order.id, 'tracking', e.target.value)} placeholder="Tracking number *" style={inp} />
            <select value={inputs.method} onChange={e => setTracking(order.id, 'method', e.target.value)} style={inp}>
              <option value="">Carrier…</option>
              {SHIP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={() => dispatch(order)} disabled={busy}
              style={{ background: '#2563EB', border: 'none', borderRadius: '7px', padding: '8px 18px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
              Dispatch
            </button>
          </div>
        )}

        {!isReady && order.status === OrderStatus.SHIPPED && (
          <div style={{ marginTop: '10px' }}>
            <button onClick={() => markDelivered(order.id)} disabled={busy}
              style={{ background: '#059669', border: 'none', borderRadius: '7px', padding: '8px 18px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              Mark Delivered
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout title="Shipping" subtitle="Dispatch & delivery tracking">
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {kpi.map(k => (
          <div key={k.label} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '32px', fontWeight: 600, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '18px', background: 'var(--bg-card)', borderRadius: '10px', padding: '4px', width: 'fit-content', border: '1px solid var(--border)' }}>
        {(['ready', 'shipped'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: tab === t ? 'var(--navy)' : 'transparent', color: tab === t ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: tab === t ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>
            {t === 'ready' ? `Ready to Ship (${ready.length})` : `Shipped / Delivered (${shipped.length})`}
          </button>
        ))}
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {tab === 'ready' ? 'Orders Ready for Dispatch' : 'Shipped & Delivered Orders'}
          </h2>
          <button onClick={reload} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 14px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>Refresh</button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          <div style={{ padding: '16px' }}>
            {tab === 'ready' ? (
              ready.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.3 }}>📦</div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>No orders ready to ship right now.</div>
                </div>
              ) : ready.map(o => <ShipCard key={o.id} order={o} isReady={true} />)
            ) : (
              shipped.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.3 }}>🚚</div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>No shipped orders yet.</div>
                </div>
              ) : shipped.map(o => <ShipCard key={o.id} order={o} isReady={false} />)
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
