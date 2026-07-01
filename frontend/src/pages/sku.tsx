import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';

interface Sku {
  id: string; skuNumber: string; orderId?: string; orderType?: string;
  metalType?: string; metalColor?: string; centerStoneShape?: string;
  approximateCaratWeight?: string; generatedBy?: string; isActive: boolean; createdAt: string;
}
interface Order { id: string; poNumber: string; storeName?: string; customerFullName?: string; kiraSkuNumber?: string; orderType?: string; metalType?: string; metalColor?: string; status?: string; }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' };

export default function SKUPage() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  return (
    <AppLayout title="SKU Management" subtitle="SKUs are generated automatically when the customer approves the design">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {skus.length} SKUs Generated
        </h3>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKUs…"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-primary)', fontSize: '13px', width: '220px', outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Loading SKUs…</div>
      ) : skus.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>
          No SKUs yet. They're generated automatically once a customer approves their design.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {skus.map(sku => {
            const order = orders.find(o => o.id === sku.orderId);
            return (
              <div key={sku.id} style={{ ...card, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--accent-dark)', letterSpacing: '0.5px', marginBottom: '5px' }}>
                    {sku.skuNumber}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {sku.orderType && <span>{sku.orderType}</span>}
                    {sku.metalType && <span>{sku.metalType} {sku.metalColor}</span>}
                    {sku.centerStoneShape && <span>{sku.centerStoneShape}</span>}
                    {sku.approximateCaratWeight && <span>{sku.approximateCaratWeight}ct</span>}
                    {order && <span style={{ color: 'var(--navy)', fontWeight: 600 }}>→ {order.poNumber}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(sku.createdAt).toLocaleDateString()}</div>
                  {sku.generatedBy && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{sku.generatedBy.split('@')[0]}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
