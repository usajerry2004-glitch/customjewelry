import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order, STATUS_CONFIG } from '../../../utils/types';
import { OrderConversation } from '../../../components/OrderConversation';

export async function getServerSideProps() {
  return { props: {} };
}

interface CadFile {
  id: string;
  originalName: string;
  status: string;
  revisionNumber: number;
  designerNotes?: string;
  customerFeedback?: string;
  createdAt: string;
}

const CAD_STATUS: Record<string, { label: string; color: string }> = {
  UPLOADED:           { label: 'Uploaded', color: '#6366F1' },
  SENT_FOR_APPROVAL:  { label: 'Awaiting Your Approval', color: '#F59E0B' },
  APPROVED:           { label: 'Approved', color: '#10B981' },
  REJECTED:           { label: 'Rejected', color: '#EF4444' },
  REVISION_REQUESTED: { label: 'Revision Requested', color: '#8B5CF6' },
};

const TIMELINE = [
  { status: 'WAITING_CONFIRMATION', label: 'Order Received' },
  { status: 'PENDING_CAD', label: 'CAD Design' },
  { status: 'CAD_IN_PROGRESS', label: 'Design Review' },
  { status: 'CUSTOMER_APPROVED', label: 'Approved' },
  { status: 'VPO_ISSUED', label: 'Manufacturing' },
  { status: 'READY_TO_SHIP', label: 'Ready to Ship' },
  { status: 'SHIPPED', label: 'Shipped' },
  { status: 'DELIVERED', label: 'Delivered' },
];

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '18px', marginBottom: '16px',
};

export default function CustomerOrderDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState<Partial<Order> | null>(null);
  const [cads, setCads] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cadFeedback, setCadFeedback] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jf_user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
  }, []);

  const reload = async () => {
    if (!id) return;
    const [oRes, cRes] = await Promise.all([
      apiFetch(`${API}/orders/${id}`),
      apiFetch(`${API}/cad/order/${id}`),
    ]);
    if (oRes.ok) setOrder(await oRes.json());
    if (cRes.ok) setCads(await cRes.json());
    setLoading(false);
  };

  useEffect(() => { reload(); }, [id]);

  const cadAction = async (cadId: string, action: 'approve' | 'reject' | 'revision') => {
    setActionLoading(cadId + action);
    const feedback = cadFeedback[cadId] || '';
    await apiFetch(`${API}/cad/${cadId}/${action}`, {
      method: 'PATCH',
      body: JSON.stringify({ feedback }),
    });
    await reload();
    setActionLoading(null);
  };

  if (loading) {
    return (
      <CustomerLayout title="Order Detail">
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>Loading…</div>
      </CustomerLayout>
    );
  }

  if (!order) {
    return (
      <CustomerLayout title="Not Found">
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--danger)' }}>
          Order not found. <a href="/customer/orders" style={{ color: 'var(--accent-dark)' }}>Back to orders</a>
        </div>
      </CustomerLayout>
    );
  }

  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#64748B' };
  const currentIdx = TIMELINE.findIndex(t => t.status === order.status);

  return (
    <CustomerLayout
      title={order.poNumber || 'Order Detail'}
      subtitle={order.orderType ? `${order.orderType} · ${order.metalType} ${order.metalColor}` : undefined}
      actions={
        <button onClick={() => router.push('/customer/orders')} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 14px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
          ← My Orders
        </button>
      }
    >
      {/* Status + Timeline */}
      <div style={{ ...card, border: `1px solid ${cfg.color}30`, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Current Status</div>
          <div style={{ background: `${cfg.color}18`, color: cfg.color, padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
            {cfg.label}
          </div>
        </div>
        {/* Timeline dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          {TIMELINE.map((step, i) => {
            const done = i <= currentIdx;
            const active = i === currentIdx;
            return (
              <React.Fragment key={step.status}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: active ? '14px' : '10px', height: active ? '14px' : '10px',
                    borderRadius: '50%', flexShrink: 0, zIndex: 1,
                    background: done ? cfg.color : 'var(--border)',
                    border: `2px solid ${done ? cfg.color : 'var(--border)'}`,
                    boxShadow: active ? `0 0 8px ${cfg.color}60` : 'none',
                    transition: 'all 0.2s',
                  }} />
                  <div style={{ fontSize: '9px', color: done ? cfg.color : 'var(--text-muted)', marginTop: '5px', textAlign: 'center', lineHeight: 1.2, maxWidth: '60px' }}>
                    {step.label}
                  </div>
                </div>
                {i < TIMELINE.length - 1 && (
                  <div style={{ height: '2px', flex: 1, background: i < currentIdx ? cfg.color : 'var(--border)', flexShrink: 0 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="customer-order-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Order specs */}
        <div style={card}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px', margin: '0 0 14px' }}>Product Specs</h3>
          {[
            { label: 'Order Type', value: order.orderType },
            { label: 'Metal', value: order.metalType ? `${order.metalType} ${order.metalColor || ''}`.trim() : null },
            { label: 'Size', value: order.size },
            { label: 'Stone Type', value: order.diamondType },
            { label: 'Stone Quality', value: order.diamondQuality },
            { label: 'Shape', value: order.centerStoneShape },
            { label: 'Carat Weight', value: order.approximateCaratWeight ? `${order.approximateCaratWeight}ct` : null },
          ].map(({ label, value }) => value ? (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
            </div>
          ) : null)}
        </div>

        {/* Order info */}
        <div style={card}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px', margin: '0 0 14px' }}>Order Info</h3>
          {[
            { label: 'Order #', value: order.poNumber },
            { label: 'SKU', value: order.kiraSkuNumber },
            { label: 'Tracking', value: order.trackingNumber },
            { label: 'Placed', value: order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null },
            { label: 'Updated', value: order.updatedAt ? new Date(order.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null },
          ].map(({ label, value }) => value ? (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
            </div>
          ) : null)}
        </div>
      </div>

      {/* Customer notes */}
      {order.customerNotes && (
        <div style={card}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', margin: '0 0 10px' }}>Your Notes</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{order.customerNotes}</p>
        </div>
      )}

      {/* CAD files */}
      <div style={card}>
        <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px', margin: '0 0 14px' }}>
          Design Files {cads.length > 0 && `(${cads.length})`}
        </h3>

        {cads.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            No design files yet. Our CAD team will upload designs once your order is confirmed.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cads.map(cad => {
              const cs = CAD_STATUS[cad.status] || { label: cad.status, color: '#64748B' };
              const needsApproval = cad.status === 'SENT_FOR_APPROVAL';
              return (
                <div key={cad.id} style={{ background: 'var(--bg-input)', border: `1px solid ${cs.color}30`, borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: needsApproval ? '14px' : '0' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{cad.originalName}</span>
                        <span style={{ fontSize: '10px', background: `${cs.color}15`, color: cs.color, padding: '2px 8px', borderRadius: '99px' }}>
                          {cs.label}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                      </div>
                      {cad.designerNotes && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Designer note: {cad.designerNotes}</div>
                      )}
                      {cad.customerFeedback && (
                        <div style={{ fontSize: '12px', color: '#F59E0B', marginTop: '4px' }}>Your feedback: {cad.customerFeedback}</div>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '12px' }}>
                      {new Date(cad.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {needsApproval && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#F59E0B', marginBottom: '10px', fontWeight: 600 }}>
                        This design is waiting for your review and approval.
                      </div>
                      <textarea
                        value={cadFeedback[cad.id] || ''}
                        onChange={e => setCadFeedback(p => ({ ...p, [cad.id]: e.target.value }))}
                        placeholder="Optional feedback or revision notes…"
                        rows={2}
                        style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '10px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => cadAction(cad.id, 'approve')}
                          disabled={!!actionLoading}
                          style={{ flex: 1, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: '7px', padding: '8px', color: '#059669', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                        >
                          Approve Design
                        </button>
                        <button
                          onClick={() => cadAction(cad.id, 'revision')}
                          disabled={!!actionLoading}
                          style={{ flex: 1, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '7px', padding: '8px', color: '#8B5CF6', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                        >
                          Request Changes
                        </button>
                        <button
                          onClick={() => cadAction(cad.id, 'reject')}
                          disabled={!!actionLoading}
                          style={{ flex: 1, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '7px', padding: '8px', color: '#DC2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation with the team */}
      {order.id && currentUser && (
        <div style={{ marginTop: '4px' }}>
          <OrderConversation
            orderId={order.id}
            currentUserRole={currentUser.role}
            currentUserId={currentUser.id}
          />
        </div>
      )}
    </CustomerLayout>
  );
}
