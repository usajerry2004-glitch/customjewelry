import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { Order, OrderStatus, STATUS_CONFIG, UserRole } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';
import { OrderConversation } from '../../components/OrderConversation';

export async function getServerSideProps() {
  return { props: {} };
}

// Statuses each role is permitted to move an order into
const ROLE_STAGE_PERMISSIONS: Record<string, OrderStatus[]> = {
  [UserRole.ADMIN]: Object.values(OrderStatus).filter(s => s !== OrderStatus.CANCELLED),
  [UserRole.SALES_REP]: [OrderStatus.WAITING_CONFIRMATION, OrderStatus.CANCELLED],
  [UserRole.AUTHORIZER]: [OrderStatus.PENDING_CAD, OrderStatus.CANCELLED],
  [UserRole.CAD_DESIGNER]: [OrderStatus.CAD_IN_PROGRESS, OrderStatus.CUSTOMER_APPROVED, OrderStatus.CUSTOMER_REJECTED],
  [UserRole.SKU_MANAGER]: [OrderStatus.SKU_CREATION, OrderStatus.VPO_ISSUED],
  [UserRole.FACTORY_MANAGER]: [OrderStatus.VPO_ISSUED, OrderStatus.PENDING_CONTRACTOR, OrderStatus.ORDER_JOB_BAG_CREATED, OrderStatus.READY_TO_INVOICE],
  [UserRole.SHIPPING_MANAGER]: [OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
  [UserRole.STONE_MANAGER]: [],
  [UserRole.US_SETTER]: [OrderStatus.REPAIR],
  [UserRole.CUSTOMER]: [],
};

const FIELD_GROUPS = [
  {
    title: 'Order Details',
    fields: [
      { key: 'poNumber', label: 'PO Number' },
      { key: 'kiraSkuNumber', label: 'Kira SKU' },
      { key: 'orderType', label: 'Order Type' },
      { key: 'manufacturingPath', label: 'Manufacturing Path' },
    ],
  },
  {
    title: 'Customer',
    fields: [
      { key: 'storeName', label: 'Store Name' },
      { key: 'customerFullName', label: 'Customer Name' },
      { key: 'customerEmail', label: 'Customer Email' },
    ],
  },
  {
    title: 'Product Specs',
    fields: [
      { key: 'metalType', label: 'Metal Type' },
      { key: 'metalColor', label: 'Metal Color' },
      { key: 'size', label: 'Size' },
      { key: 'diamondType', label: 'Diamond Type' },
      { key: 'diamondQuality', label: 'Diamond Quality' },
      { key: 'centerStoneShape', label: 'Stone Shape' },
      { key: 'approximateCaratWeight', label: 'Carat Weight' },
    ],
  },
  {
    title: 'Pricing & Logistics',
    fields: [
      { key: 'quotedCost', label: 'Quoted Cost', format: (v: any) => v ? `$${Number(v).toLocaleString()}` : '—' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'shipMethod', label: 'Ship Method' },
      { key: 'trackingNumber', label: 'Tracking #' },
      { key: 'invoiceNumber', label: 'Invoice #' },
    ],
  },
];

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 22px',
  boxShadow: 'var(--shadow-sm)',
};

export default function OrderDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState<Partial<Order> | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jf_user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`${API}/orders/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setOrder(data); setLoading(false); });
  }, [id]);

  const authorizeOrder = async () => {
    if (!order?.id) return;
    setAuthorizing(true);
    const res = await apiFetch(`${API}/orders/${order.id}/authorize`, { method: 'PATCH' });
    if (res.ok) setOrder(await res.json());
    setAuthorizing(false);
  };

  const loadSummary = async () => {
    if (!order?.id) return;
    setSummaryLoading(true);
    const res = await apiFetch(`${API}/orders/${order.id}/summary`);
    if (res.ok) { const d = await res.json(); setSummary(d.summary); }
    setSummaryLoading(false);
  };

  const moveStatus = async (newStatus: OrderStatus) => {
    if (!order?.id) return;
    setUpdatingStatus(true);
    const res = await apiFetch(`${API}/orders/${order.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setOrder(prev => prev ? { ...prev, status: newStatus } : prev);
    setUpdatingStatus(false);
  };

  if (loading) {
    return (
      <AppLayout title="Order Detail">
        <div style={{ color: 'var(--text-muted)', padding: '60px 0', textAlign: 'center', fontSize: '14px' }}>Loading…</div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout title="Order Not Found">
        <div style={{ color: 'var(--danger)', padding: '60px 0', textAlign: 'center' }}>
          Order not found. <a href="/orders" style={{ color: 'var(--accent)', fontWeight: 600 }}>Back to orders</a>
        </div>
      </AppLayout>
    );
  }

  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const userRole = currentUser?.role || '';
  const allowedStatuses = ROLE_STAGE_PERMISSIONS[userRole] || [];
  const movableStatuses = allowedStatuses.filter(s => s !== order.status);

  return (
    <AppLayout
      title={order.poNumber || 'Order Detail'}
      subtitle={order.storeName || order.customerFullName || ''}
      actions={
        <button
          onClick={() => router.push('/orders')}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 16px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
        >
          ← Back to Orders
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="order-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 288px', gap: '24px', alignItems: 'start' }}>

          {/* Field groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {FIELD_GROUPS.map(group => (
              <div key={group.title} style={cardStyle}>
                <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '16px' }}>
                  {group.title}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  {group.fields.map(({ key, label, format }) => {
                    const raw = (order as any)[key];
                    const val = format ? format(raw) : (raw ?? '—');
                    return (
                      <div key={key}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '13px', color: raw ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: raw ? 500 : 400 }}>
                          {val || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {order.customerNotes && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Customer Notes
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{order.customerNotes}</p>
              </div>
            )}
          </div>

          {/* Status sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Current status */}
            <div style={{ ...cardStyle, borderTop: `3px solid ${cfg.color}` }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Current Status
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: cfg.bg, color: cfg.color, padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>
                {cfg.label}
              </div>
            </div>

            {/* Authorize panel — only for WAITING_CONFIRMATION and authorizers/admin */}
            {order.status === OrderStatus.WAITING_CONFIRMATION &&
              (userRole === UserRole.AUTHORIZER || userRole === UserRole.ADMIN) && (
              <div style={{ ...cardStyle, borderLeft: '3px solid var(--accent)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Awaiting Authorization
                </div>

                {summary ? (
                  <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      AI Order Brief
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{summary}</p>
                  </div>
                ) : (
                  <button
                    onClick={loadSummary}
                    disabled={summaryLoading}
                    style={{ width: '100%', marginBottom: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', opacity: summaryLoading ? 0.7 : 1 }}
                  >
                    {summaryLoading ? '✨ Generating…' : '✨ Generate AI Order Brief'}
                  </button>
                )}

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.6 }}>
                  Review and authorize to release to the CAD design team.
                </p>
                <button
                  onClick={authorizeOrder}
                  disabled={authorizing}
                  style={{ width: '100%', background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '11px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: authorizing ? 'not-allowed' : 'pointer', opacity: authorizing ? 0.7 : 1, letterSpacing: '0.3px' }}
                >
                  {authorizing ? 'Authorizing…' : 'Authorize Order'}
                </button>
              </div>
            )}

            {/* Move to Stage — role-filtered */}
            {movableStatuses.length > 0 && (
              <div style={cardStyle}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Move to Stage
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {movableStatuses.map(s => {
                    const sc = STATUS_CONFIG[s];
                    return (
                      <button
                        key={s}
                        onClick={() => moveStatus(s)}
                        disabled={updatingStatus}
                        style={{
                          background: sc.bg,
                          border: `1px solid ${sc.color}40`,
                          borderRadius: '8px',
                          padding: '9px 14px',
                          color: sc.color,
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: updatingStatus ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          opacity: updatingStatus ? 0.6 : 1,
                          transition: 'opacity 0.15s',
                          letterSpacing: '0.2px',
                        }}
                      >
                        → {sc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div style={cardStyle}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Timeline
              </div>
              {[
                { label: 'Created', value: order.createdAt },
                { label: 'Updated', value: order.updatedAt },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Conversation */}
        {order.id && currentUser && (
          <OrderConversation
            orderId={order.id}
            currentUserRole={currentUser.role}
            currentUserId={currentUser.id}
          />
        )}
      </div>
    </AppLayout>
  );
}
