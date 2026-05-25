import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order, STATUS_CONFIG } from '../../../utils/types';

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

export default function CustomerOrderDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState<Partial<Order> | null>(null);
  const [cads, setCads] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cadFeedback, setCadFeedback] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
        <div style={{ color: '#4B5563', textAlign: 'center', padding: '60px 0' }}>Loading…</div>
      </CustomerLayout>
    );
  }

  if (!order) {
    return (
      <CustomerLayout title="Not Found">
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#EF4444' }}>
          Order not found. <a href="/customer/orders" style={{ color: '#F6D860' }}>Back to orders</a>
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
        <button onClick={() => router.push('/customer/orders')} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '7px 14px', color: '#94A3B8', fontSize: '12px', cursor: 'pointer' }}>
          ← My Orders
        </button>
      }
    >
      {/* Status + Timeline */}
      <div style={{ background: '#111118', border: `1px solid ${cfg.color}30`, borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#64748B' }}>CURRENT STATUS</div>
          <div style={{ background: `${cfg.color}20`, color: cfg.color, padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
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
                    background: done ? cfg.color : '#1A1A24',
                    border: `2px solid ${done ? cfg.color : '#2D2D3D'}`,
                    boxShadow: active ? `0 0 8px ${cfg.color}80` : 'none',
                    transition: 'all 0.2s',
                  }} />
                  <div style={{ fontSize: '9px', color: done ? cfg.color : '#2D2D3D', marginTop: '5px', textAlign: 'center', lineHeight: 1.2, maxWidth: '60px' }}>
                    {step.label}
                  </div>
                </div>
                {i < TIMELINE.length - 1 && (
                  <div style={{ height: '2px', flex: 1, background: i < currentIdx ? cfg.color : '#1A1A24', flexShrink: 0 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Order specs */}
        <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>Product Specs</h3>
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
              <span style={{ fontSize: '12px', color: '#4B5563' }}>{label}</span>
              <span style={{ fontSize: '12px', color: '#CBD5E1', fontWeight: 500 }}>{value}</span>
            </div>
          ) : null)}
        </div>

        {/* Timeline info */}
        <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>Order Info</h3>
          {[
            { label: 'Order #', value: order.poNumber },
            { label: 'SKU', value: order.kiraSkuNumber },
            { label: 'Tracking', value: order.trackingNumber },
            { label: 'Placed', value: order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null },
            { label: 'Updated', value: order.updatedAt ? new Date(order.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null },
          ].map(({ label, value }) => value ? (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#4B5563' }}>{label}</span>
              <span style={{ fontSize: '12px', color: '#CBD5E1', fontWeight: 500 }}>{value}</span>
            </div>
          ) : null)}
        </div>
      </div>

      {/* Customer notes */}
      {order.customerNotes && (
        <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Your Notes</h3>
          <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>{order.customerNotes}</p>
        </div>
      )}

      {/* CAD files */}
      <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px' }}>
        <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>
          Design Files {cads.length > 0 && `(${cads.length})`}
        </h3>

        {cads.length === 0 ? (
          <div style={{ color: '#2D2D3D', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            No design files yet. Our CAD team will upload designs once your order is confirmed.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cads.map(cad => {
              const cs = CAD_STATUS[cad.status] || { label: cad.status, color: '#64748B' };
              const needsApproval = cad.status === 'SENT_FOR_APPROVAL';
              return (
                <div key={cad.id} style={{ background: '#0F0F14', border: `1px solid ${cs.color}30`, borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: needsApproval ? '14px' : '0' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px' }}>📎</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0' }}>{cad.originalName}</span>
                        <span style={{ fontSize: '10px', background: `${cs.color}20`, color: cs.color, padding: '2px 8px', borderRadius: '99px' }}>
                          {cs.label}
                        </span>
                        <span style={{ fontSize: '10px', color: '#4B5563' }}>Rev #{cad.revisionNumber}</span>
                      </div>
                      {cad.designerNotes && (
                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Designer note: {cad.designerNotes}</div>
                      )}
                      {cad.customerFeedback && (
                        <div style={{ fontSize: '12px', color: '#F59E0B', marginTop: '4px' }}>Your feedback: {cad.customerFeedback}</div>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: '#4B5563', flexShrink: 0, marginLeft: '12px' }}>
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
                        style={{ width: '100%', background: '#111118', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '8px 10px', color: '#E2E8F0', fontSize: '12px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '10px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => cadAction(cad.id, 'approve')}
                          disabled={!!actionLoading}
                          style={{ flex: 1, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '7px', padding: '8px', color: '#10B981', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                        >
                          ✅ Approve Design
                        </button>
                        <button
                          onClick={() => cadAction(cad.id, 'revision')}
                          disabled={!!actionLoading}
                          style={{ flex: 1, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '7px', padding: '8px', color: '#8B5CF6', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                        >
                          🔄 Request Changes
                        </button>
                        <button
                          onClick={() => cadAction(cad.id, 'reject')}
                          disabled={!!actionLoading}
                          style={{ flex: 1, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '7px', padding: '8px', color: '#EF4444', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                        >
                          ❌ Reject
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
    </CustomerLayout>
  );
}
