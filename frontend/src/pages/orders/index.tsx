import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { Order, OrderStatus } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

const ALL_STATUS_FILTERS = [
  { label: 'All',           value: '' },
  { label: 'Waiting',       value: OrderStatus.WAITING_CONFIRMATION },
  { label: 'CAD',           value: OrderStatus.CAD_IN_PROGRESS },
  { label: 'Approved',      value: OrderStatus.CUSTOMER_APPROVED },
  { label: 'VPO Issued',    value: OrderStatus.VPO_ISSUED },
  { label: 'Ready to Ship', value: OrderStatus.READY_TO_SHIP },
  { label: 'Shipped',       value: OrderStatus.SHIPPED },
  { label: 'Delivered',     value: OrderStatus.DELIVERED },
];

const ROLE_STATUS_FILTERS: Record<string, typeof ALL_STATUS_FILTERS> = {
  SHIPPING_MANAGER: [
    { label: 'All',           value: '' },
    { label: 'Ready to Ship', value: OrderStatus.READY_TO_SHIP },
    { label: 'Shipped',       value: OrderStatus.SHIPPED },
    { label: 'Delivered',     value: OrderStatus.DELIVERED },
  ],
  FACTORY_MANAGER: [
    { label: 'All',           value: '' },
    { label: 'SKU Created',   value: OrderStatus.SKU_CREATION },
    { label: 'VPO Issued',    value: OrderStatus.VPO_ISSUED },
    { label: 'Job Bag',       value: OrderStatus.ORDER_JOB_BAG_CREATED },
    { label: 'Ready to Ship', value: OrderStatus.READY_TO_SHIP },
  ],
  CAD_DESIGNER: [
    { label: 'All',           value: '' },
    { label: 'Pending CAD',   value: OrderStatus.PENDING_CAD },
    { label: 'CAD',           value: OrderStatus.CAD_IN_PROGRESS },
    { label: 'Approved',      value: OrderStatus.CUSTOMER_APPROVED },
    { label: 'Rejected',      value: OrderStatus.CUSTOMER_REJECTED },
  ],
  SKU_MANAGER: [
    { label: 'All',           value: '' },
    { label: 'Approved',      value: OrderStatus.CUSTOMER_APPROVED },
    { label: 'SKU Creation',  value: OrderStatus.SKU_CREATION },
  ],
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '9px 14px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none',
};

const fieldStyle: React.CSSProperties = { marginBottom: '14px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.8px', textTransform: 'uppercase' };

interface Customer { id: string; firstName: string; lastName: string; email: string; storeName?: string; }

const ROLES_NEED_CUSTOMER = ['SALES_REP', 'AUTHORIZER', 'ADMIN'];

export default function OrdersPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeMonth, setActiveMonth] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newOrder, setNewOrder] = useState({ storeName: '', orderType: '', metalType: '', metalColor: '', quotedCost: '' });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [refImage, setRefImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) {
        const parsed = JSON.parse(u);
        setIsAdmin(parsed.role === 'ADMIN');
        setUserRole(parsed.role || '');
      }
    } catch {}
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch(`${API}/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      }
    } finally { setLoading(false); }
  };

  const applyMonth = (year: number, month: number) => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    setActiveMonth(key);
    setDateFrom(from);
    setDateTo(to);
  };

  const clearDates = () => { setDateFrom(''); setDateTo(''); setActiveMonth(''); };

  useEffect(() => { load(); }, [search, statusFilter, dateFrom, dateTo]);

  const openNewOrderModal = async () => {
    setShowNew(true);
    try {
      const res = await apiFetch(`${API}/users?role=CUSTOMER`);
      if (res.ok) setCustomers(await res.json());
    } catch {}
  };

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.storeName || `${c.firstName} ${c.lastName}`);
    setShowCustomerDrop(false);
    setNewOrder(p => ({ ...p, storeName: c.storeName || `${c.firstName} ${c.lastName}` }));
  };

  const createOrder = async () => {
    if (ROLES_NEED_CUSTOMER.includes(userRole) && !selectedCustomer) return;
    setSaving(true);
    try {
      const customerFields = selectedCustomer ? {
        customerId: selectedCustomer.id,
        customerEmail: selectedCustomer.email,
        customerFullName: `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
      } : {};
      const res = await apiFetch(`${API}/orders`, {
        method: 'POST',
        body: JSON.stringify({ ...newOrder, ...customerFields, quotedCost: Number(newOrder.quotedCost) || undefined, manufacturingPath: 'STANDARD' }),
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
            await fetch(`${API}/cad/reference/${order.id}`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: fd,
            });
          } catch {}
        }

        setShowNew(false);
        setNewOrder({ storeName: '', orderType: '', metalType: '', metalColor: '', quotedCost: '' });
        setSelectedCustomer(null);
        setCustomerSearch('');
        setRefImage(null);
        load();
      }
    } finally { setSaving(false); }
  };

  const closeModal = () => { setShowNew(false); setRefImage(null); setSelectedCustomer(null); setCustomerSearch(''); };

  return (
    <AppLayout
      title="Orders"
      subtitle={`${total} total orders`}
      actions={
        <button
          onClick={openNewOrderModal}
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

            {/* PO Number — auto-generated */}
            <div style={{ ...fieldStyle, background: 'var(--bg-input)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🔖</span>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>PO Number</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Auto-generated on save — format: <strong>KJ-{new Date().getFullYear()}-XXXX</strong></div>
              </div>
            </div>

            {/* Customer picker — dropdown of existing customers */}
            {ROLES_NEED_CUSTOMER.includes(userRole) && (
              <div style={{ ...fieldStyle, position: 'relative' }}>
                <label style={labelStyle}>Customer *</label>
                <input
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDrop(true); setSelectedCustomer(null); }}
                  onFocus={() => setShowCustomerDrop(true)}
                  placeholder="Search by name or email…"
                  style={{ ...inputStyle, width: '100%', borderColor: selectedCustomer ? 'var(--accent)' : undefined }}
                  autoComplete="off"
                />
                {showCustomerDrop && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', marginTop: '4px' }}>
                    {customers
                      .filter(c => {
                        const q = customerSearch.toLowerCase();
                        const name = (c.storeName || `${c.firstName} ${c.lastName}`).toLowerCase();
                        return !q || name.includes(q) || c.email.toLowerCase().includes(q);
                      })
                      .map(c => (
                        <div key={c.id}
                          onMouseDown={() => selectCustomer(c)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '13px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {c.storeName || `${c.firstName} ${c.lastName}`}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.email}</div>
                        </div>
                      ))}
                    {customers.filter(c => {
                      const q = customerSearch.toLowerCase();
                      const name = (c.storeName || `${c.firstName} ${c.lastName}`).toLowerCase();
                      return !q || name.includes(q) || c.email.toLowerCase().includes(q);
                    }).length === 0 && (
                      <div style={{ padding: '14px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                        No customer found. Add them first via the Customers page.
                      </div>
                    )}
                  </div>
                )}
                {selectedCustomer && (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#10B981', fontWeight: 600 }}>
                    ✓ {selectedCustomer.storeName || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`} · {selectedCustomer.email}
                  </div>
                )}
              </div>
            )}

            {/* Store Name */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Store / Company Name</label>
              <input value={newOrder.storeName} onChange={e => setNewOrder(p => ({ ...p, storeName: e.target.value }))}
                placeholder="e.g. Diamond Collection NYC" style={{ ...inputStyle, width: '100%' }} />
            </div>

            {/* Order details */}
            {[
              { label: 'Order Type',  key: 'orderType',  placeholder: 'e.g. Engagement Ring' },
              { label: 'Metal Type',  key: 'metalType',  placeholder: 'e.g. 18K' },
              { label: 'Metal Color', key: 'metalColor', placeholder: 'e.g. White Gold' },
              ...(isAdmin ? [{ label: 'Quoted Cost ($)', key: 'quotedCost', placeholder: 'e.g. 3500' }] : []),
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={fieldStyle}>
                <label style={labelStyle}>{label}</label>
                <input value={(newOrder as any)[key]} onChange={e => setNewOrder(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder} style={{ ...inputStyle, width: '100%' }} />
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
                disabled={saving || (ROLES_NEED_CUSTOMER.includes(userRole) && !selectedCustomer)}
                style={{ flex: 2, background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', opacity: (saving || (ROLES_NEED_CUSTOMER.includes(userRole) && !selectedCustomer)) ? 0.6 : 1, letterSpacing: '0.3px' }}
              >
                {saving ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="filter-row" style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search PO number, store, SKU…"
          style={{ ...inputStyle, width: '260px' }}
        />
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {(ROLE_STATUS_FILTERS[userRole] ?? ALL_STATUS_FILTERS).map(f => (
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

      {/* Date Filters */}
      <div className="filter-row" style={{ display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Quick month chips */}
        {(() => {
          const now = new Date();
          const months = [
            { label: 'This Month', y: now.getFullYear(), m: now.getMonth() + 1 },
            { label: 'Last Month', y: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), m: now.getMonth() === 0 ? 12 : now.getMonth() },
            { label: '3 Months Ago', y: now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear(), m: ((now.getMonth() - 2 + 12) % 12) + 1 },
          ];
          return months.map(({ label, y, m }) => {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            const isActive = activeMonth === key;
            return (
              <button key={key} onClick={() => isActive ? clearDates() : applyMonth(y, m)}
                style={{
                  padding: '6px 13px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--accent-dark)' : 'var(--bg-card)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? 'var(--accent-dark)' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}
              >{label}</button>
            );
          });
        })()}

        {/* Month picker */}
        <input
          type="month"
          value={activeMonth}
          onChange={e => {
            if (!e.target.value) { clearDates(); return; }
            const [y, m] = e.target.value.split('-').map(Number);
            applyMonth(y, m);
          }}
          style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px', color: activeMonth ? 'var(--text-primary)' : 'var(--text-muted)' }}
          title="Pick a specific month"
        />

        <span style={{ color: 'var(--border)', fontSize: '14px' }}>|</span>

        {/* Custom date range */}
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>From</label>
        <input type="date" value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setActiveMonth(''); }}
          style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
        />
        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>To</label>
        <input type="date" value={dateTo}
          onChange={e => { setDateTo(e.target.value); setActiveMonth(''); }}
          style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
        />

        {(dateFrom || dateTo) && (
          <button onClick={clearDates}
            style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: 'rgba(220,38,38,0.08)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)', fontWeight: 500 }}
          >✕ Clear</button>
        )}
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
