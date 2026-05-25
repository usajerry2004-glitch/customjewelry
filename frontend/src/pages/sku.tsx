import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';

interface Sku {
  id: string;
  skuNumber: string;
  orderId?: string;
  orderType?: string;
  metalType?: string;
  metalColor?: string;
  centerStoneShape?: string;
  approximateCaratWeight?: string;
  generatedBy?: string;
  isActive: boolean;
  createdAt: string;
}

interface Order { id: string; poNumber: string; storeName?: string; customerFullName?: string; kiraSkuNumber?: string; orderType?: string; metalType?: string; metalColor?: string; }

export default function SKUPage() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sRes, oRes] = await Promise.all([
        apiFetch(`${API}/sku${search ? `?search=${search}` : ''}`),
        apiFetch(`${API}/orders?limit=100`),
      ]);
      if (sRes.ok) setSkus(await sRes.json());
      if (oRes.ok) { const d = await oRes.json(); setOrders(d.orders || []); }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, [search]);

  const generate = async (orderId: string) => {
    setGenerating(orderId);
    try {
      const res = await apiFetch(`${API}/sku/generate/${orderId}`, { method: 'POST' });
      if (res.ok) await loadAll();
    } finally { setGenerating(null); }
  };

  const ordersWithoutSku = orders.filter(o => !o.kiraSkuNumber && (o.orderType || o.metalType));

  return (
    <AppLayout title="SKU Management" subtitle="Generate and manage product SKUs">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', alignItems: 'start' }}>
        {/* SKU list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#CBD5E1' }}>{skus.length} SKUs Generated</h3>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍  Search SKUs…"
              style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '8px 14px', color: '#E2E8F0', fontSize: '13px', width: '220px', outline: 'none' }}
            />
          </div>

          {loading ? (
            <div style={{ color: '#4B5563', textAlign: 'center', padding: '40px' }}>Loading SKUs…</div>
          ) : skus.length === 0 ? (
            <div style={{ color: '#4B5563', textAlign: 'center', padding: '60px 0' }}>
              No SKUs yet. Generate one from the panel on the right.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {skus.map(sku => {
                const order = orders.find(o => o.id === sku.orderId);
                return (
                  <div key={sku.id} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#F6D860', letterSpacing: '0.5px', marginBottom: '4px' }}>{sku.skuNumber}</div>
                      <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {sku.orderType && <span>💍 {sku.orderType}</span>}
                        {sku.metalType && <span>✨ {sku.metalType} {sku.metalColor}</span>}
                        {sku.centerStoneShape && <span>💎 {sku.centerStoneShape}</span>}
                        {sku.approximateCaratWeight && <span>⚖️ {sku.approximateCaratWeight}ct</span>}
                        {order && <span style={{ color: '#818CF8' }}>📋 {order.poNumber}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
                      <div style={{ fontSize: '10px', color: '#4B5563' }}>{new Date(sku.createdAt).toLocaleDateString()}</div>
                      {sku.generatedBy && <div style={{ fontSize: '10px', color: '#4B5563', marginTop: '2px' }}>{sku.generatedBy.split('@')[0]}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Generate panel */}
        <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#CBD5E1', marginBottom: '4px' }}>Generate SKU</h3>
          <p style={{ fontSize: '12px', color: '#4B5563', marginBottom: '16px' }}>Select an order that doesn't have a SKU yet. The format will be auto-generated based on the order's product specs.</p>

          <div style={{ marginBottom: '12px', background: '#0F0F14', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11px', color: '#4B5563', marginBottom: '4px' }}>SKU FORMAT</div>
            <div style={{ fontSize: '13px', color: '#F6D860', fontFamily: 'monospace' }}>KJ-[TYPE]-[METAL][COLOR]-[SEQ]</div>
            <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '4px' }}>e.g. KJ-RING-18KWG-0001</div>
          </div>

          {ordersWithoutSku.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
              All eligible orders have SKUs.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {ordersWithoutSku.map(order => (
                <div key={order.id} style={{ background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0' }}>{order.poNumber}</div>
                    <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '2px' }}>
                      {order.orderType || '?'} · {order.metalType || '?'} {order.metalColor || ''}
                    </div>
                  </div>
                  <button
                    onClick={() => generate(order.id)}
                    disabled={generating === order.id}
                    style={{ background: 'rgba(230,168,23,0.15)', border: '1px solid rgba(230,168,23,0.4)', borderRadius: '7px', padding: '6px 12px', color: '#F6D860', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: generating === order.id ? 0.6 : 1 }}
                  >
                    {generating === order.id ? '…' : '+ Generate'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
