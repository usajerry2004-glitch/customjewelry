import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { SkeletonOrderGrid } from '../../components/SkeletonOrderCard';
import { Order, OrderStatus, StoneStatus } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';
import { toast } from '../../utils/toast';

const ALL_STATUS_FILTERS = [
  { label: 'All',             value: '' },
  { label: 'New',             value: OrderStatus.NEW },
  { label: 'CAD In Progress', value: OrderStatus.CAD_IN_PROGRESS },
  { label: 'SKU Creation',    value: OrderStatus.SKU_CREATION },
  { label: 'VPO Issued',      value: OrderStatus.VPO_ISSUED },
  { label: 'Manufactured',    value: OrderStatus.MANUFACTURED },
  { label: 'Repair',          value: OrderStatus.REPAIR },
  { label: 'Completed',       value: OrderStatus.COMPLETED },
  { label: 'Cancelled',       value: OrderStatus.CANCELLED },
];

const ROLE_STATUS_FILTERS: Record<string, typeof ALL_STATUS_FILTERS> = {
  CAD_DESIGNER: [
    { label: 'All',      value: '' },
    { label: 'Pending',  value: 'cad_pending' },
    { label: 'Revision', value: 'cad_revision' },
  ],
  SKU_MANAGER: [
    { label: 'All',          value: '' },
    { label: 'SKU Creation', value: OrderStatus.SKU_CREATION },
  ],
  STONE_MANAGER: [
    { label: 'All',        value: '' },
    { label: 'VPO Issued', value: OrderStatus.VPO_ISSUED },
  ],
  FACTORY_MANAGER: [
    { label: 'All',          value: '' },
    { label: 'VPO Issued',   value: OrderStatus.VPO_ISSUED },
    { label: 'Manufactured', value: OrderStatus.MANUFACTURED },
  ],
  CUSTOMER: [
    { label: 'All',             value: '' },
    { label: 'CAD In Progress', value: OrderStatus.CAD_IN_PROGRESS },
    { label: 'Completed',       value: OrderStatus.COMPLETED },
  ],
  SALES_REP: [
    { label: 'All',             value: '' },
    { label: 'New',             value: OrderStatus.NEW },
    { label: 'CAD In Progress', value: OrderStatus.CAD_IN_PROGRESS },
    { label: 'SKU Creation',    value: OrderStatus.SKU_CREATION },
    { label: 'VPO Issued',      value: OrderStatus.VPO_ISSUED },
    { label: 'Manufactured',    value: OrderStatus.MANUFACTURED },
    { label: 'Completed',       value: OrderStatus.COMPLETED },
    { label: 'Cancelled',       value: OrderStatus.CANCELLED },
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
  // Pre-fill statusFilter from URL query param (e.g. /orders?status=CAD_IN_PROGRESS)
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('status') || '';
    }
    return '';
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeMonth, setActiveMonth] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newOrder, setNewOrder] = useState({ storeName: '', orderType: '', metalType: '', metalColor: '' });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refLink, setRefLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [cadSubFilter, setCadSubFilter] = useState('');
  const [stoneSubFilter, setStoneSubFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [customerFilterInput, setCustomerFilterInput] = useState('');
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Sync statusFilter when URL query changes (Next.js router)
  useEffect(() => {
    const s = (router.query.status as string) || '';
    setStatusFilter(s);
    setCadSubFilter('');
    setStoneSubFilter('');
  }, [router.query.status]);

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

  const isCadSubFilter = ['cad_pending', 'cad_awaiting_quote', 'cad_awaiting_approval', 'cad_revision', 'cad_approved'].includes(statusFilter);
  const showCadSubRow = (statusFilter === OrderStatus.CAD_IN_PROGRESS || isCadSubFilter) &&
    ['ADMIN', 'AUTHORIZER'].includes(userRole);
  const showStoneSubRow = statusFilter === OrderStatus.VPO_ISSUED &&
    ['ADMIN', 'FACTORY_MANAGER', 'AUTHORIZER'].includes(userRole);

  const load = async (pageNum = 0) => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageNum * PAGE_SIZE) });
      if (search) params.set('search', search);
      if (statusFilter && !isCadSubFilter) params.set('status', statusFilter);
      if (isCadSubFilter) {
        params.set('status', 'CAD_IN_PROGRESS');
        params.set('cadSubFilter', statusFilter);
      }
      if (statusFilter === OrderStatus.CAD_IN_PROGRESS && cadSubFilter) params.set('cadSubFilter', cadSubFilter);
      if (stoneSubFilter) params.set('stoneSubFilter', stoneSubFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch(`${API}/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        const list: any[] = data.orders || [];
        setOrders(list);
        setTotal(data.total ?? list.length);

        const ids = list.map((o: any) => o.id).filter(Boolean);
        if (ids.length) {
          apiFetch(`${API}/cad/thumbnails?orderIds=${ids.join(',')}`)
            .then(r => r.ok ? r.json() : {})
            .then(map => setThumbnails(map))
            .catch(() => {});
        }
      }
    } finally { setLoading(false); }
  };

  const isFactoryManager = userRole === 'FACTORY_MANAGER';

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setStoneSubFilter(''); };

  const handleBulkManufactured = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch(`${API}/orders/bulk/status`, {
        method: 'PATCH',
        body: JSON.stringify({ orderIds: Array.from(selectedIds), status: OrderStatus.MANUFACTURED }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || `Request failed (${res.status}). Please try again.`);
        return;
      }
      if (data.succeeded === 0) {
        toast.error(`${data.failed} order(s) could not be updated. Make sure all selected orders have Stone Received status.`, 'Could not mark as Manufactured');
        return;
      }
      exitSelectMode();
      load(page);
      if (data.failed > 0) {
        toast.warning(`${data.succeeded} marked as Manufactured. ${data.failed} skipped (stone not received).`);
      } else {
        toast.success(`${data.succeeded} order${data.succeeded > 1 ? 's' : ''} marked as Manufactured.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setBulkLoading(false); }
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

  useEffect(() => { setPage(0); load(0); }, [search, statusFilter, cadSubFilter, stoneSubFilter, dateFrom, dateTo]);
  useEffect(() => { load(page); }, [page]);

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
        body: JSON.stringify({ ...newOrder, ...customerFields, manufacturingPath: 'STANDARD', referenceWeblink: refLink || undefined }),
      });
      if (res.ok) {
        const order = await res.json();

        // Upload all reference files
        if (refFiles.length > 0 && order.id) {
          let uploadFailed = false;
          for (const file of refFiles) {
            try {
              const fd = new FormData();
              fd.append('file', file);
              const r = await fetch(`${API}/cad/reference/${order.id}`, {
                method: 'POST',
                credentials: 'include',
                body: fd,
              });
              if (!r.ok) uploadFailed = true;
            } catch { uploadFailed = true; }
          }
          if (uploadFailed) toast.warning('Order created but one or more reference files failed to upload. You can add them from the order detail page.', 'Upload incomplete');
        }

        setShowNew(false);
        setNewOrder({ storeName: '', orderType: '', metalType: '', metalColor: '' });
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isFactoryManager && (
            <button
              onClick={() => {
                if (selectMode) {
                  exitSelectMode();
                } else {
                  setSelectMode(true);
                  setSelectedIds(new Set());
                  setStatusFilter(OrderStatus.VPO_ISSUED);
                  setStoneSubFilter('stone_received');
                  setCadSubFilter('');
                }
              }}
              style={{
                background: selectMode ? 'var(--accent)' : 'var(--bg-input)',
                color: selectMode ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${selectMode ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {selectMode ? '✕ Cancel' : '☑ Select'}
            </button>
          )}
          <button
            onClick={openNewOrderModal}
            style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}
          >
            + New Order
          </button>
        </div>
      }
    >
      {/* New Order Modal */}
      {showNew && (
        <div className="modal-bg" style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="modal-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px', width: '500px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
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
          placeholder="Search PO number, store, customer, SKU…"
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
            { label: 'All CAD',             value: '' },
            { label: '⏳ Pending CAD',      value: 'cad_pending' },
            { label: '💰 Awaiting Quote',   value: 'cad_awaiting_quote' },
            { label: '✅ Awaiting Approval', value: 'cad_awaiting_approval' },
            { label: '↺ Revision',          value: 'cad_revision' },
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
            { label: 'This Month', y: now.getFullYear(), m: now.getMonth() + 1 },
            { label: 'Last Month', y: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), m: now.getMonth() === 0 ? 12 : now.getMonth() },
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

      {/* Customer filter combobox */}
      {(() => {
        const countMap: Record<string, number> = {};
        orders.forEach(o => {
          const name = o.storeName || o.customerFullName || '';
          if (name) countMap[name] = (countMap[name] || 0) + 1;
        });
        const allNames = Object.keys(countMap).sort((a, b) => a.localeCompare(b));
        const q = customerFilterInput.toLowerCase();
        const filtered = customerFilterInput
          ? allNames.filter(n => n.toLowerCase().includes(q))
          : allNames;
        return (
          <div style={{ position: 'relative', marginBottom: '20px', display: 'inline-block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  value={customerFilterInput}
                  onChange={e => { setCustomerFilterInput(e.target.value); setCustomerFilter(''); setShowFilterDrop(true); }}
                  onFocus={() => setShowFilterDrop(true)}
                  onBlur={() => setTimeout(() => setShowFilterDrop(false), 150)}
                  placeholder="Filter by customer / store…"
                  className="customer-filter-input"
                  style={{ ...inputStyle, width: '280px', maxWidth: '100%', paddingRight: customerFilter ? '28px' : '12px' }}
                />
                {customerFilter && (
                  <button
                    onMouseDown={e => { e.preventDefault(); setCustomerFilter(''); setCustomerFilterInput(''); setShowFilterDrop(false); }}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '0', lineHeight: 1 }}
                  >✕</button>
                )}
              </div>
            </div>
            {showFilterDrop && filtered.length > 0 && (
              <div className="customer-filter-drop" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '280px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 200, maxHeight: '220px', overflowY: 'auto' }}>
                {filtered.map(name => (
                  <div
                    key={name}
                    onMouseDown={e => { e.preventDefault(); setCustomerFilter(name); setCustomerFilterInput(name); setShowFilterDrop(false); }}
                    style={{ padding: '9px 14px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', background: customerFilter === name ? 'rgba(192,155,88,0.1)' : 'transparent', fontWeight: customerFilter === name ? 600 : 400, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                    onMouseEnter={e => { if (customerFilter !== name) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = customerFilter === name ? 'rgba(192,155,88,0.1)' : 'transparent'; }}
                  >
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ flexShrink: 0, fontSize: '11px', fontWeight: 600, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.12)', border: '1px solid rgba(192,155,88,0.25)', borderRadius: '99px', padding: '1px 8px' }}>{countMap[name]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Select mode hint bar */}
      {selectMode && selectedIds.size === 0 && (
        <div style={{ marginBottom: '12px', padding: '10px 16px', background: 'rgba(192,155,88,0.08)', border: '1px solid rgba(192,155,88,0.3)', borderRadius: '8px', fontSize: '12px', color: 'var(--accent-dark)', fontWeight: 500 }}>
          Only orders with Stone Received can be selected. Tap them to select, then mark as Manufactured.
        </div>
      )}

      {/* Orders grid */}
      {(() => {
        const activeQ = (customerFilter || customerFilterInput).toLowerCase();
        const displayOrders = activeQ
          ? orders.filter(o =>
              (o.customerFullName || '').toLowerCase().includes(activeQ) ||
              (o.storeName || '').toLowerCase().includes(activeQ)
            )
          : orders;

        if (loading) return <SkeletonOrderGrid count={8} />;

        if (displayOrders.length === 0) return (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>
            No orders found.{search || statusFilter || customerFilter || customerFilterInput ? ' Try clearing your filters.' : ''}
          </div>
        );

        const selectableOrders = displayOrders.filter(o => o.stoneStatus === StoneStatus.STONE_RECEIVED);
        const allSelectableSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedIds.has(o.id!));

        return (
          <>
            {/* Select-all row — only in select mode for factory manager */}
            {selectMode && displayOrders.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <button
                  disabled={selectableOrders.length === 0}
                  onClick={() => {
                    if (allSelectableSelected) {
                      setSelectedIds(s => { const n = new Set(s); selectableOrders.forEach(o => n.delete(o.id!)); return n; });
                    } else {
                      setSelectedIds(s => { const n = new Set(s); selectableOrders.forEach(o => o.id && n.add(o.id)); return n; });
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', background: allSelectableSelected ? 'var(--accent)' : 'var(--bg-card)', border: `1px solid ${allSelectableSelected ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: selectableOrders.length === 0 ? 'not-allowed' : 'pointer', color: allSelectableSelected ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s', opacity: selectableOrders.length === 0 ? 0.5 : 1 }}
                >
                  <span style={{ fontSize: '14px' }}>{allSelectableSelected ? '☑' : '☐'}</span>
                  {allSelectableSelected ? 'Deselect all' : `Select all Stone Received (${selectableOrders.length})`}
                </button>
                {selectedIds.size > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedIds.size} selected</span>
                )}
              </div>
            )}

            <div className="orders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {displayOrders.map(order => {
                const isSelected = selectedIds.has(order.id!);
                const isSelectable = order.stoneStatus === StoneStatus.STONE_RECEIVED;
                return (
                  <div key={order.id} style={{ position: 'relative', opacity: selectMode && !isSelectable ? 0.45 : 1, transition: 'opacity 0.15s' }}
                    onClick={selectMode ? (e) => {
                      if (!isSelectable) return;
                      e.preventDefault();
                      setSelectedIds(s => { const n = new Set(s); n.has(order.id!) ? n.delete(order.id!) : n.add(order.id!); return n; });
                    } : undefined}
                  >
                    {/* Selection indicator overlay for factory manager select mode */}
                    {selectMode && isSelectable && (
                      <div style={{
                        position: 'absolute', inset: 0, zIndex: 2, borderRadius: 'var(--radius)',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                        background: isSelected ? 'rgba(192,155,88,0.06)' : 'transparent',
                        pointerEvents: 'none', transition: 'all 0.1s',
                      }} />
                    )}
                    {selectMode && isSelectable && (
                      <div style={{
                        position: 'absolute', top: '10px', left: '10px', zIndex: 3,
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.92)',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                        transition: 'all 0.1s',
                        pointerEvents: 'none',
                      }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: '13px', lineHeight: 1, fontWeight: 700 }}>✓</span>}
                      </div>
                    )}
                    <OrderCard
                      order={order}
                      hideFinancials={!isAdmin}
                      onClick={selectMode ? undefined : () => router.push(`/orders/${order.id}`)}
                      referenceImage={thumbnails[order.id!] || undefined}
                      currentUserRole={userRole}
                    />
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                >← Prev</button>
                {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    style={{ padding: '6px 12px', borderRadius: '7px', border: `1px solid ${page === i ? 'var(--navy)' : 'var(--border)'}`, background: page === i ? 'var(--navy)' : 'var(--bg-card)', color: page === i ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: page === i ? 700 : 400 }}
                  >{i + 1}</button>
                )).slice(Math.max(0, page - 2), page + 5)}
                <button
                  disabled={page >= Math.ceil(total / PAGE_SIZE) - 1}
                  onClick={() => setPage(p => p + 1)}
                  style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: page >= Math.ceil(total / PAGE_SIZE) - 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page >= Math.ceil(total / PAGE_SIZE) - 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                >Next →</button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Page {page + 1} of {Math.ceil(total / PAGE_SIZE)} · {total} total
                </span>
              </div>
            )}
          </>
        );
      })()}

      {/* Floating bulk action bar — fixed bottom, factory manager only */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, display: 'flex', alignItems: 'center', gap: '12px',
          background: 'var(--navy)', borderRadius: '12px', padding: '12px 20px',
          boxShadow: '0 8px 32px rgba(26,39,64,0.4)', minWidth: '320px',
          animation: 'fadeSlideUp 0.2s ease',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>
              {selectedIds.size} order{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }}>Mark all as Manufactured?</span>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={exitSelectMode}
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px', padding: '7px 14px', color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleBulkManufactured}
            disabled={bulkLoading}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: '7px', padding: '8px 20px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: bulkLoading ? 'not-allowed' : 'pointer', opacity: bulkLoading ? 0.7 : 1, letterSpacing: '0.2px' }}
          >
            {bulkLoading ? 'Marking…' : '✓ Mark as Manufactured'}
          </button>
        </div>
      )}
    </AppLayout>
  );
}
