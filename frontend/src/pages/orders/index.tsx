import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { Order, OrderStatus, STATUS_CONFIG } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Waiting', value: OrderStatus.WAITING_CONFIRMATION },
  { label: 'CAD', value: OrderStatus.CAD_IN_PROGRESS },
  { label: 'Approved', value: OrderStatus.CUSTOMER_APPROVED },
  { label: 'VPO Issued', value: OrderStatus.VPO_ISSUED },
  { label: 'Ready to Ship', value: OrderStatus.READY_TO_SHIP },
  { label: 'Shipped', value: OrderStatus.SHIPPED },
  { label: 'Delivered', value: OrderStatus.DELIVERED },
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newOrder, setNewOrder] = useState({ poNumber: '', storeName: '', orderType: '', metalType: '', metalColor: '', quotedCost: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch(`${API}/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const createOrder = async () => {
    if (!newOrder.poNumber.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/orders`, {
        method: 'POST',
        body: JSON.stringify({ ...newOrder, quotedCost: Number(newOrder.quotedCost) || undefined, manufacturingPath: 'STANDARD' }),
      });
      if (res.ok) { setShowNew(false); setNewOrder({ poNumber: '', storeName: '', orderType: '', metalType: '', metalColor: '', quotedCost: '' }); load(); }
    } finally { setSaving(false); }
  };

  return (
    <AppLayout
      title="Orders"
      subtitle={`${total} total orders`}
      actions={
        <button
          onClick={() => setShowNew(true)}
          style={{ background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
        >
          + New Order
        </button>
      }
    >
      {/* New Order Modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#111118', border: '1px solid #2D2D3D', borderRadius: '14px', padding: '28px', width: '460px', maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#E2E8F0' }}>New Order</h2>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            {[
              { label: 'PO Number *', key: 'poNumber', placeholder: 'e.g. PO-2025-010' },
              { label: 'Store / Customer Name', key: 'storeName', placeholder: 'e.g. Kira Jewels NYC' },
              { label: 'Order Type', key: 'orderType', placeholder: 'e.g. Engagement Ring' },
              { label: 'Metal Type', key: 'metalType', placeholder: 'e.g. 18K' },
              { label: 'Metal Color', key: 'metalColor', placeholder: 'e.g. White Gold' },
              { label: 'Quoted Cost ($)', key: 'quotedCost', placeholder: 'e.g. 3500' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px', letterSpacing: '0.5px' }}>{label}</label>
                <input
                  value={(newOrder as any)[key]}
                  onChange={e => setNewOrder(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '9px 12px', color: '#E2E8F0', fontSize: '13px', outline: 'none' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, background: '#1A1A24', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '10px', color: '#94A3B8', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={createOrder} disabled={saving || !newOrder.poNumber.trim()} style={{ flex: 1, background: 'linear-gradient(135deg, #F6D860, #E6A817)', border: 'none', borderRadius: '8px', padding: '10px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search PO number, store, SKU…"
          style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '9px 14px', color: '#E2E8F0', fontSize: '13px', width: '280px', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              style={{
                padding: '6px 12px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, border: 'none',
                background: statusFilter === f.value ? 'rgba(230,168,23,0.2)' : '#111118',
                color: statusFilter === f.value ? '#F6D860' : '#64748B',
                outline: statusFilter === f.value ? '1px solid #E6A817' : '1px solid #1E1E2E',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban link */}
      <div style={{ marginBottom: '16px' }}>
        <button onClick={() => router.push('/orders/kanban')} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '7px 14px', color: '#818CF8', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
          🔲 Switch to Kanban view →
        </button>
      </div>

      {/* Orders */}
      {loading ? (
        <div style={{ color: '#4B5563', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading orders…</div>
      ) : orders.length === 0 ? (
        <div style={{ color: '#4B5563', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>
          No orders found.{search || statusFilter ? ' Try clearing your filters.' : ''}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px' }}>
          {orders.map(order => (
            <OrderCard key={order.id} order={order} onClick={() => router.push(`/orders/${order.id}`)} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
