import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { Order, OrderStatus } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

const STATUS_FILTERS = [
  { label: 'All',           value: '' },
  { label: 'Waiting',       value: OrderStatus.WAITING_CONFIRMATION },
  { label: 'CAD',           value: OrderStatus.CAD_IN_PROGRESS },
  { label: 'Approved',      value: OrderStatus.CUSTOMER_APPROVED },
  { label: 'VPO Issued',    value: OrderStatus.VPO_ISSUED },
  { label: 'Ready to Ship', value: OrderStatus.READY_TO_SHIP },
  { label: 'Shipped',       value: OrderStatus.SHIPPED },
  { label: 'Delivered',     value: OrderStatus.DELIVERED },
];

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '9px 14px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none',
};

const fieldStyle: React.CSSProperties = { marginBottom: '14px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.8px', textTransform: 'uppercase' };

export default function OrdersPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newOrder, setNewOrder] = useState({ poNumber: '', storeName: '', orderType: '', metalType: '', metalColor: '', quotedCost: '' });
  const [refImage, setRefImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) setIsAdmin(JSON.parse(u).role === 'ADMIN');
    } catch {}
  }, []);

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
    } finally { setLoading(false); }
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
      if (res.ok) {
        const order = await res.json();

        // Upload reference image if provided
        if (refImage && order.id) {
          try {
            const token = localStorage.getItem('jf_token');
            const fd = new FormData();
            fd.append('file', refImage);
            fd.append('designerNotes', 'Customer reference image');
            await fetch(`${API}/cad/upload/${order.id}`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: fd,
            });
          } catch {}
        }

        setShowNew(false);
        setNewOrder({ poNumber: '', storeName: '', orderType: '', metalType: '', metalColor: '', quotedCost: '' });
        setRefImage(null);
        load();
      }
    } finally { setSaving(false); }
  };

  const closeModal = () => { setShowNew(false); setRefImage(null); };

  return (
    <AppLayout
      title="Orders"
      subtitle={`${total} total orders`}
      actions={
        <button
          onClick={() => setShowNew(true)}
          style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}
        >
          + New Order
        </button>
      }
    >
      {/* New Order Modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px', width: '500px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>
                New Order
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
            </div>

            {[
              { label: 'PO Number *',            key: 'poNumber',   placeholder: 'e.g. PO-2025-010' },
              { label: 'Store / Customer Name',  key: 'storeName',  placeholder: 'e.g. Diamond Collection NYC' },
              { label: 'Order Type',             key: 'orderType',  placeholder: 'e.g. Engagement Ring' },
              { label: 'Metal Type',             key: 'metalType',  placeholder: 'e.g. 18K' },
              { label: 'Metal Color',            key: 'metalColor', placeholder: 'e.g. White Gold' },
              ...(isAdmin ? [{ label: 'Quoted Cost ($)', key: 'quotedCost', placeholder: 'e.g. 3500' }] : []),
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={fieldStyle}>
                <label style={labelStyle}>{label}</label>
                <input
                  value={(newOrder as any)[key]}
                  onChange={e => setNewOrder(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
            ))}

            {/* Reference Image */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Reference Image (optional)</label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${refImage ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: refImage ? 'rgba(192,155,88,0.04)' : 'var(--bg-input)',
                  transition: 'all 0.15s',
                }}
              >
                <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setRefImage(e.target.files?.[0] || null)} />
                {refImage ? (
                  <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>📎 {refImage.name}</div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🖼 Upload inspiration photo · JPG, PNG, PDF</div>
                )}
              </div>
              {refImage && (
                <button onClick={() => setRefImage(null)} style={{ marginTop: '4px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer' }}>
                  ✕ Remove
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={closeModal} style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button
                onClick={createOrder}
                disabled={saving || !newOrder.poNumber.trim()}
                style={{ flex: 2, background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', opacity: (saving || !newOrder.poNumber.trim()) ? 0.6 : 1, letterSpacing: '0.3px' }}
              >
                {saving ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="filter-row" style={{ display: 'flex', gap: '12px', marginBottom: '22px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search PO number, store, SKU…"
          style={{ ...inputStyle, width: '260px' }}
        />
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              style={{
                padding: '6px 13px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                fontWeight: statusFilter === f.value ? 600 : 400,
                background: statusFilter === f.value ? 'var(--navy)' : 'var(--bg-card)',
                color: statusFilter === f.value ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${statusFilter === f.value ? 'var(--navy)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban link */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => router.push('/orders/kanban')}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 16px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500, boxShadow: 'var(--shadow-sm)' }}
        >
          ⊞ Switch to Kanban view →
        </button>
      </div>

      {/* Orders grid */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>Loading orders…</div>
      ) : orders.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>
          No orders found.{search || statusFilter ? ' Try clearing your filters.' : ''}
        </div>
      ) : (
        <div className="orders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
          {orders.map(order => (
            <OrderCard key={order.id} order={order} hideFinancials={!isAdmin} onClick={() => router.push(`/orders/${order.id}`)} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
