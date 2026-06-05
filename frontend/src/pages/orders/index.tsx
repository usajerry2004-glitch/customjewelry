import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { Order, OrderStatus, StoneStatus } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

const ALL_STATUS_FILTERS = [
  { label: 'All',                value: '' },
  { label: 'CAD In Progress',    value: OrderStatus.CAD_IN_PROGRESS },
  { label: 'SKU Creation',       value: OrderStatus.SKU_CREATION },
  { label: 'VPO Created',        value: OrderStatus.VPO_ISSUED },
  { label: 'Pending Contractor', value: OrderStatus.PENDING_CONTRACTOR },
  { label: 'Ready to Ship',      value: OrderStatus.READY_TO_SHIP },
  { label: 'Shipped',            value: OrderStatus.SHIPPED },
  { label: 'Repair',             value: OrderStatus.REPAIR },
  { label: 'Completed',          value: OrderStatus.COMPLETED },
  { label: 'Cancelled',          value: OrderStatus.CANCELLED },
];

const ROLE_STATUS_FILTERS: Record<string, typeof ALL_STATUS_FILTERS> = {
  CAD_DESIGNER: [
    { label: 'All',            value: '' },
    { label: 'Pending',        value: 'cad_pending' },
    { label: 'Revision',       value: 'cad_revision' },
    { label: 'Awaiting Quote', value: 'cad_approved' },
  ],
  SKU_MANAGER: [
    { label: 'All',          value: '' },
    { label: 'SKU Creation', value: OrderStatus.SKU_CREATION },
  ],
  STONE_MANAGER: [
    { label: 'All',        value: '' },
    { label: 'VPO Created', value: OrderStatus.VPO_ISSUED },
  ],
  FACTORY_MANAGER: [
    { label: 'All',                value: '' },
    { label: 'VPO Created',        value: OrderStatus.VPO_ISSUED },
    { label: 'Pending Contractor', value: OrderStatus.PENDING_CONTRACTOR },
  ],
  SHIPPING_MANAGER: [
    { label: 'All',           value: '' },
    { label: 'Ready to Ship', value: OrderStatus.READY_TO_SHIP },
    { label: 'Shipped',       value: OrderStatus.SHIPPED },
  ],
  CUSTOMER: [
    { label: 'All',             value: '' },
    { label: 'CAD In Progress', value: OrderStatus.CAD_IN_PROGRESS },
    { label: 'VPO Created',     value: OrderStatus.VPO_ISSUED },
    { label: 'Ready to Ship',   value: OrderStatus.READY_TO_SHIP },
    { label: 'Shipped',         value: OrderStatus.SHIPPED },
    { label: 'Completed',       value: OrderStatus.COMPLETED },
  ],
  SALES_REP: [
    { label: 'All',                value: '' },
    { label: 'CAD In Progress',    value: OrderStatus.CAD_IN_PROGRESS },
    { label: 'SKU Creation',       value: OrderStatus.SKU_CREATION },
    { label: 'VPO Created',        value: OrderStatus.VPO_ISSUED },
    { label: 'Pending Contractor', value: OrderStatus.PENDING_CONTRACTOR },
    { label: 'Ready to Ship',      value: OrderStatus.READY_TO_SHIP },
    { label: 'Shipped',            value: OrderStatus.SHIPPED },
    { label: 'Completed',          value: OrderStatus.COMPLETED },
    { label: 'Cancelled',          value: OrderStatus.CANCELLED },
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
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refLink, setRefLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [cadSubFilter, setCadSubFilter] = useState('');
  const [stoneSubFilter, setStoneSubFilter] = useState('');

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

  const isCadSubFilter = ['cad_pending', 'cad_revision', 'cad_approved'].includes(statusFilter);
  const showCadSubRow = (statusFilter === OrderStatus.CAD_IN_PROGRESS || isCadSubFilter) &&
    ['ADMIN', 'AUTHORIZER'].includes(userRole);
  const showStoneSubRow = statusFilter === OrderStatus.VPO_ISSUED &&
    ['ADMIN', 'FACTORY_MANAGER', 'AUTHORIZER'].includes(userRole);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search) params.set('search', search);
      // CAD sub-filters: send CAD_IN_PROGRESS to backend, filter locally
      if (statusFilter && !isCadSubFilter) params.set('status', statusFilter);
      if (isCadSubFilter) params.set('status', 'CAD_IN_PROGRESS');
      if (statusFilter === OrderStatus.CAD_IN_PROGRESS) params.set('status', 'CAD_IN_PROGRESS');
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch(`${API}/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        let list: any[] = data.orders || [];
        // Apply CAD sub-filter (for both CAD designer role filters and admin inline sub-filter)
        const activeCadSub = isCadSubFilter ? statusFilter : cadSubFilter;
        if (activeCadSub === 'cad_pending')  list = list.filter((o: any) => !o.cadSubStatus || o.cadSubStatus === 'UPLOADED');
        if (activeCadSub === 'cad_revision') list = list.filter((o: any) => o.cadSubStatus === 'REVISION');
        if (activeCadSub === 'cad_approved') list = list.filter((o: any) => o.cadSubStatus === 'APPROVED');
        if (stoneSubFilter === 'stone_pending')  list = list.filter((o: any) => !o.stoneStatus || o.stoneStatus === StoneStatus.PENDING_STONE);
        if (stoneSubFilter === 'stone_received') list = list.filter((o: any) => o.stoneStatus === StoneStatus.STONE_RECEIVED);
        setOrders(list);
        setTotal(list.length);
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

  useEffect(() => { load(); }, [search, statusFilter, cadSubFilter, stoneSubFilter, dateFrom, dateTo]);

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
        body: JSON.stringify({ ...newOrder, ...customerFields, quotedCost: Number(newOrder.quotedCost) || undefined, manufacturingPath: 'STANDARD', referenceWeblink: refLink || undefined }),
      });
      if (res.ok) {
        const order = await res.json();

        // Upload all reference files
        if (refFiles.length > 0 && order.id) {
          const token = localStorage.getItem('jf_token');
          for (const file of refFiles) {
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('designerNotes', 'Reference image');
              await fetch(`${API}/cad/reference/${order.id}`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: fd,
              });
            } catch {}
          }
        }

        setShowNew(false);
        setNewOrder({ storeName: '', orderType: '', metalType: '', metalColor: '', quotedCost: '' });
        setSelectedCustomer(null);
        setCustomerSearch('');
        setRefFiles([]);
        setRefLink('');
        load();
      }
    } finally { setSaving(false); }
  };

  const closeModal = () => { setShowNew(false); setRefFiles([]); setRefLink(''); setSelectedCustomer(null); setCustomerSearch(''); };

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

            {/* Reference Link */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Reference Link (optional)</label>
              <input
                value={refLink}
                onChange={e => setRefLink(e.target.value)}
                placeholder="https://pinterest.com/pin/... or any inspiration URL"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            {/* Reference Files — images + videos, multiple (max 10) */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Reference Photos / Videos (optional) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— max 10</span></label>
              <div
                onClick={() => refFiles.length < 10 && fileRef.current?.click()}
                style={{
                  border: `2px dashed ${refFiles.length ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '14px',
                  textAlign: 'center',
                  cursor: refFiles.length >= 10 ? 'not-allowed' : 'pointer',
                  background: refFiles.length ? 'rgba(192,155,88,0.04)' : 'var(--bg-input)',
                  opacity: refFiles.length >= 10 ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <input
                  ref={fileRef} type="file"
                  accept="image/*,video/*,.pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => {
                    const picked = Array.from(e.target.files || []);
                    setRefFiles(prev => {
                      const combined = [...prev, ...picked];
                      return combined.slice(0, 10);
                    });
                    e.target.value = '';
                  }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  🖼 Click to add photos or videos · JPG, PNG, MP4, MOV, PDF
                </div>
              </div>
              {refFiles.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {refFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-input)', borderRadius: '6px', padding: '5px 10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {f.type.startsWith('video') ? '🎬' : '🖼'} {f.name}
                      </span>
                      <button onClick={() => setRefFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', padding: '0 4px' }}>✕</button>
                    </div>
                  ))}
                </div>
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
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search PO number, store, SKU…"
          style={{ ...inputStyle, flex: '1 1 200px', minWidth: '140px', maxWidth: '300px' }}
        />

        {/* Desktop: pill buttons */}
        <div className="status-tabs-desktop" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {(ROLE_STATUS_FILTERS[userRole] ?? ALL_STATUS_FILTERS).map(f => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setCadSubFilter(''); setStoneSubFilter(''); }}
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

        {/* Mobile: dropdown select */}
        <select
          className="status-tabs-mobile"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setCadSubFilter(''); setStoneSubFilter(''); }}
          style={{ ...inputStyle, flex: '1 1 160px', maxWidth: '220px', fontSize: '13px', padding: '8px 12px', fontWeight: 500 }}
        >
          {(ROLE_STATUS_FILTERS[userRole] ?? ALL_STATUS_FILTERS).map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* CAD Sub-filters — shown for Admin/Authorizer when CAD In Progress is selected */}
      {showCadSubRow && (
        <div className="status-tabs-row" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px', paddingLeft: '8px', borderLeft: '3px solid var(--accent)' }}>
          {[
            { label: 'All CAD', value: '' },
            { label: '⏳ Pending CAD', value: 'cad_pending' },
            { label: '↺ Revision', value: 'cad_revision' },
            { label: '💰 Awaiting Quote', value: 'cad_approved' },
          ].map(f => (
            <button key={f.value} onClick={() => setCadSubFilter(f.value)}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer',
                fontWeight: cadSubFilter === f.value ? 700 : 400,
                background: cadSubFilter === f.value ? 'var(--accent)' : 'var(--bg-card)',
                color: cadSubFilter === f.value ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${cadSubFilter === f.value ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* Stone Sub-filters — shown for Admin/Authorizer/Factory when VPO Created is selected */}
      {showStoneSubRow && (
        <div className="stone-sub-filter" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px', paddingLeft: '8px', borderLeft: '3px solid #7C3AED' }}>
          {[
            { label: 'All VPO',         value: '' },
            { label: '💎 Pending Stone', value: 'stone_pending' },
            { label: '✓ Stone Received', value: 'stone_received' },
          ].map(f => (
            <button key={f.value} onClick={() => setStoneSubFilter(f.value)}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer',
                fontWeight: stoneSubFilter === f.value ? 700 : 400,
                background: stoneSubFilter === f.value ? '#7C3AED' : 'var(--bg-card)',
                color: stoneSubFilter === f.value ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${stoneSubFilter === f.value ? '#7C3AED' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* Date filter row — chips + compact pickers in one line */}
      <div className="date-filter-row">
        {(() => {
          const now = new Date();
          const months = [
            { label: 'This Month',   y: now.getFullYear(), m: now.getMonth() + 1 },
            { label: 'Last Month',   y: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), m: now.getMonth() === 0 ? 12 : now.getMonth() },
            { label: '3 Months Ago', y: now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear(), m: ((now.getMonth() - 2 + 12) % 12) + 1 },
          ];
          return months.map(({ label, y, m }) => {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            const isActive = activeMonth === key;
            return (
              <button key={key} onClick={() => isActive ? clearDates() : applyMonth(y, m)}
                style={{ padding: '6px 13px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--accent-dark)' : 'var(--bg-card)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? 'var(--accent-dark)' : 'var(--border)'}`, transition: 'all 0.15s',
                }}
              >{label}</button>
            );
          });
        })()}
        <input type="month" value={activeMonth}
          onChange={e => { if (!e.target.value) { clearDates(); return; } const [y,m]=e.target.value.split('-').map(Number); applyMonth(y,m); }}
          style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }} title="Pick a month"
        />
        <input type="date" value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setActiveMonth(''); }}
          style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }}
        />
        <input type="date" value={dateTo}
          onChange={e => { setDateTo(e.target.value); setActiveMonth(''); }}
          style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }}
        />
        {(dateFrom || dateTo || activeMonth) && (
          <button onClick={clearDates} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: 'rgba(220,38,38,0.08)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>✕ Clear</button>
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
