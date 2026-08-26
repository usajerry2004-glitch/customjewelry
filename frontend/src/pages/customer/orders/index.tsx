import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order, STATUS_CONFIG, getCadSubLabel, customerStatusLabel } from '../../../utils/types';

const STATUS_ORDER = [
  'WAITING_CONFIRMATION','PENDING_CAD','CAD_IN_PROGRESS','CUSTOMER_APPROVED',
  'CUSTOMER_REJECTED','VPO_ISSUED','PENDING_CONTRACTOR',
  'ORDER_JOB_BAG_CREATED','READY_TO_INVOICE','READY_TO_SHIP','SHIPPED','DELIVERED',
];

// Single-select, exclusive tabs — same pattern as the internal Orders list
// (frontend/src/pages/orders/index.tsx): clicking one REPLACES the current
// filter rather than combining with it.
const STATUS_FILTERS = [
  { label: 'All',             value: '' },
  { label: 'New',             value: 'NEW' },
  { label: 'CAD In Progress', value: 'CAD_IN_PROGRESS' },
  { label: customerStatusLabel('VPO_ISSUED'), value: 'VPO_ISSUED' },
  { label: 'Manufactured',    value: 'MANUFACTURED' },
  { label: 'Shipped',         value: 'SHIPPED' },
  { label: 'Repair',          value: 'REPAIR' },
  { label: 'Completed',       value: 'COMPLETED' },
  { label: 'Cancelled',       value: 'CANCELLED' },
];

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // Picks up ?search= from the global search bar (or a shared/bookmarked link)
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.search;
    if (typeof q === 'string' && q !== search) setSearch(q);
    const s = router.query.status;
    if (typeof s === 'string' && s !== statusFilter) setStatusFilter(s);
  }, [router.isReady, router.query.search, router.query.status]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    const timer = setTimeout(() => {
      apiFetch(`${API}/orders?${params.toString()}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setOrders(data.orders || []); setLoading(false); });
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  // Count badge per status pill — same role-scoped endpoint the internal
  // Orders list uses, minus status itself (that's what's being counted).
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    apiFetch(`${API}/orders/status-counts?${params.toString()}`)
      .then(r => r.ok ? r.json() : {})
      .then(setStatusCounts)
      .catch(() => {});
  }, [search]);

  const hasOrders = orders.length > 0;
  const isSearching = search.trim().length > 0;
  const isFiltering = isSearching || !!statusFilter;

  return (
    <CustomerLayout
      title="My Orders"
      subtitle={`${orders.length} order${orders.length !== 1 ? 's' : ''}`}
      actions={
        <button
          onClick={() => router.push('/customer/orders/new')}
          style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}
        >
          + Place New Order
        </button>
      }
    >
      <div style={{ marginBottom: '16px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by order # or your PO #…"
          style={{
            width: '100%', maxWidth: '360px', background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '13px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Status filter — desktop: pill row (single-select, exclusive) */}
      <div className="status-tabs-desktop" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {STATUS_FILTERS.map(f => {
          const active = statusFilter === f.value;
          const count = statusCounts[f.value];
          return (
            <button
              key={f.value || 'all'}
              onClick={() => setStatusFilter(f.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 13px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                background: active ? 'var(--navy)' : 'var(--bg-card)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--navy)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >
              {f.label}
              {count !== undefined && (
                <span style={{
                  background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg-input)',
                  color: active ? '#fff' : 'var(--text-muted)',
                  fontSize: '10px', fontWeight: 700, borderRadius: '99px', padding: '1px 6px', minWidth: '10px', textAlign: 'center',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status filter — mobile: dropdown */}
      <select
        className="status-tabs-mobile"
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value)}
        style={{
          width: '100%', maxWidth: '360px', background: 'var(--bg-input)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '13px',
          outline: 'none', boxSizing: 'border-box', marginBottom: '16px', fontWeight: 500,
        }}
      >
        {STATUS_FILTERS.map(f => (
          <option key={f.value || 'all'} value={f.value}>
            {f.label}{statusCounts[f.value] !== undefined ? ` (${statusCounts[f.value]})` : ''}
          </option>
        ))}
      </select>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>Loading your orders…</div>
      ) : !hasOrders && isFiltering ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>🔍</div>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No matching orders</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '360px', margin: '0 auto', lineHeight: 1.7 }}>
            {isSearching
              ? `No orders match "${search}" by order # or your PO #.`
              : `You don't have any orders with a status of "${STATUS_FILTERS.find(f => f.value === statusFilter)?.label || statusFilter}".`}
          </div>
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); }}
            style={{ marginTop: '16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 18px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Clear filters
          </button>
        </div>
      ) : !hasOrders ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>💍</div>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No orders yet</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px', maxWidth: '360px', margin: '0 auto 28px', lineHeight: 1.7 }}>
            Place your first custom jewelry order and we'll keep you updated every step of the way.
          </div>
          <button
            onClick={() => router.push('/customer/orders/new')}
            style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 28px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Place an Order
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map(order => {
            const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
            const cadSubLabel = order.status === 'CAD_IN_PROGRESS' ? getCadSubLabel(order) : null;
            const statusIdx = STATUS_ORDER.indexOf(order.status!);
            const progress = statusIdx >= 0 ? Math.round((statusIdx / (STATUS_ORDER.length - 1)) * 100) : 0;
            return (
              <div
                key={order.id}
                onClick={() => router.push(`/customer/orders/${order.id}`)}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '18px 20px',
                  cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.1s',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'var(--shadow-md)'; el.style.borderColor = 'var(--accent)'; el.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'var(--shadow-sm)'; el.style.borderColor = 'var(--border)'; el.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', overflowWrap: 'break-word' }}>
                      {order.poNumber}
                    </div>
                    {order.refCustomerPo && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Your PO: <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{order.refCustomerPo}</span>
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {order.orderType && <span>{order.orderType}</span>}
                      {order.metalType && <span>{order.metalType} {order.metalColor}</span>}
                      {order.centerStoneShape && <span>{order.centerStoneShape}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                    <div style={{ display: 'inline-block', background: cfg.bg, color: cfg.color, padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      {cadSubLabel || customerStatusLabel(order.status)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </CustomerLayout>
  );
}
