import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { Order, OrderStatus, STATUS_CONFIG } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';
import { OrderConversation } from '../../components/OrderConversation';

export async function getServerSideProps() {
  return { props: {} };
}

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
    if (res.ok) {
      const updated = await res.json();
      setOrder(updated);
    }
    setAuthorizing(false);
  };

  const loadSummary = async () => {
    if (!order?.id) return;
    setSummaryLoading(true);
    const res = await apiFetch(`${API}/orders/${order.id}/summary`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
    }
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
        <div style={{ color: '#4B5563', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout title="Order Not Found">
        <div style={{ color: '#EF4444', padding: '40px 0', textAlign: 'center' }}>
          Order not found. <a href="/orders" style={{ color: '#F6D860' }}>Back to orders</a>
        </div>
      </AppLayout>
    );
  }

  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#64748B', bg: '#1A1A24' };

  return (
    <AppLayout
      title={order.poNumber || 'Order Detail'}
      subtitle={order.storeName || order.customerFullName || ''}
      actions={
        <button onClick={() => router.push('/orders')} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '7px 14px', color: '#94A3B8', fontSize: '12px', cursor: 'pointer' }}>
          ← Back to Orders
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>
        {/* Field groups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {FIELD_GROUPS.map(group => (
            <div key={group.title} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px 20px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>{group.title}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {group.fields.map(({ key, label, format }) => {
                  const raw = (order as any)[key];
                  const val = format ? format(raw) : (raw ?? '—');
                  return (
                    <div key={key}>
                      <div style={{ fontSize: '10px', color: '#4B5563', marginBottom: '3px', letterSpacing: '0.5px' }}>{label}</div>
                      <div style={{ fontSize: '13px', color: raw ? '#E2E8F0' : '#2D2D3D', fontWeight: raw ? 500 : 400 }}>{val || '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {order.customerNotes && (
            <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px 20px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Customer Notes</h3>
              <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.6 }}>{order.customerNotes}</p>
            </div>
          )}
        </div>

        {/* Status sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Current status */}
          <div style={{ background: '#111118', border: `1px solid ${cfg.color}30`, borderRadius: '12px', padding: '18px' }}>
            <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '8px', letterSpacing: '0.5px' }}>CURRENT STATUS</div>
            <div style={{ display: 'inline-block', background: `${cfg.color}20`, color: cfg.color, padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
              {cfg.label}
            </div>
          </div>

          {/* Authorize panel — only for WAITING_CONFIRMATION */}
          {order.status === OrderStatus.WAITING_CONFIRMATION && (
            <div style={{ background: '#111118', border: '1px solid rgba(246,216,96,0.3)', borderRadius: '12px', padding: '18px' }}>
              <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '10px', letterSpacing: '0.5px' }}>AWAITING AUTHORIZATION</div>

              {/* AI Summary */}
              {summary ? (
                <div style={{ background: '#0A0A12', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', color: '#F6D860', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI Order Brief</div>
                  <p style={{ fontSize: '12px', color: '#CBD5E1', lineHeight: 1.65, margin: 0 }}>{summary}</p>
                </div>
              ) : (
                <button
                  onClick={loadSummary}
                  disabled={summaryLoading}
                  style={{ width: '100%', marginBottom: '10px', background: '#0A0A12', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '9px', color: '#64748B', fontSize: '12px', cursor: 'pointer', opacity: summaryLoading ? 0.7 : 1 }}
                >
                  {summaryLoading ? '✨ Generating summary…' : '✨ Generate AI Order Brief'}
                </button>
              )}

              <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '12px', lineHeight: 1.5 }}>
                Review and authorize this order to release it to the CAD design team.
              </p>
              <button
                onClick={authorizeOrder}
                disabled={authorizing}
                style={{ width: '100%', background: 'linear-gradient(135deg, rgba(246,216,96,0.15), rgba(230,168,23,0.15))', border: '1px solid rgba(246,216,96,0.5)', borderRadius: '8px', padding: '10px', color: '#F6D860', fontSize: '13px', fontWeight: 700, cursor: authorizing ? 'not-allowed' : 'pointer', opacity: authorizing ? 0.7 : 1 }}
              >
                {authorizing ? 'Authorizing…' : '✅ Authorize Order'}
              </button>
            </div>
          )}

          {/* Move to next status */}
          <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px' }}>
            <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '12px', letterSpacing: '0.5px' }}>MOVE TO STAGE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.values(OrderStatus)
                .filter(s => s !== order.status && s !== OrderStatus.CANCELLED)
                .map(s => {
                  const sc = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => moveStatus(s)}
                      disabled={updatingStatus}
                      style={{
                        background: '#0F0F14', border: `1px solid ${sc.color}30`, borderRadius: '7px', padding: '8px 12px',
                        color: sc.color, fontSize: '12px', cursor: 'pointer', textAlign: 'left', opacity: updatingStatus ? 0.5 : 1,
                      }}
                    >
                      {sc.label}
                    </button>
                  );
                })
              }
            </div>
          </div>

          {/* Dates */}
          <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px' }}>
            <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '12px', letterSpacing: '0.5px' }}>TIMELINE</div>
            {[
              { label: 'Created', value: order.createdAt },
              { label: 'Updated', value: order.updatedAt },
            ].map(({ label, value }) => (
              <div key={label} style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: '#4B5563' }}>{label}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>
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
