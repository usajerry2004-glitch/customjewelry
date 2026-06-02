import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { Order, OrderStatus, STATUS_CONFIG, UserRole } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';
import { OrderConversation } from '../../components/OrderConversation';

// ── CAD types ────────────────────────────────────────────────────────────
interface CadFile {
  id: string; orderId: string; originalName: string; fileName: string;
  status: string; revisionNumber: number; uploadedBy: string;
  designerNotes?: string; customerFeedback?: string;
  approvedAt?: string; approvedBy?: string; createdAt: string;
}

const CAD_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  UPLOADED:           { label: 'Uploaded',          color: '#6366F1', bg: '#EEF2FF' },
  SENT_FOR_APPROVAL:  { label: 'Awaiting Approval', color: '#F59E0B', bg: '#FEF3C7' },
  APPROVED:           { label: 'Approved',          color: '#10B981', bg: '#D1FAE5' },
  REJECTED:           { label: 'Rejected',          color: '#EF4444', bg: '#FEE2E2' },
  REVISION_REQUESTED: { label: 'Revision Requested',color: '#8B5CF6', bg: '#EDE9FE' },
};

// Roles allowed to take approve/reject/revision actions
const CAD_ACTION_ROLES = [UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.SALES_REP];

// ── CAD Viewer Modal ──────────────────────────────────────────────────────
interface ViewerProps {
  cad: CadFile; userRole: string;
  onClose: () => void;
  onAction: (cadId: string, action: 'approve' | 'reject' | 'revision', feedback: string) => Promise<void>;
}

function CadViewerModal({ cad, userRole, onClose, onAction }: ViewerProps) {
  const [feedback, setFeedback] = useState('');
  const [acting, setActing] = useState(false);
  const ext = (cad.originalName.split('.').pop() || '').toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const isPdf   = ext === 'pdf';
  const fileUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000'}/uploads/cad/${cad.fileName}`;
  const cs = CAD_STATUS_CFG[cad.status] || { label: cad.status, color: '#6B7280', bg: '#F3F4F6' };
  const canAct  = CAD_ACTION_ROLES.includes(userRole as UserRole) && cad.status !== 'APPROVED';

  const act = async (action: 'approve' | 'reject' | 'revision') => {
    setActing(true);
    await onAction(cad.id, action, feedback);
    setActing(false);
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        width: '100%', maxWidth: '900px', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-input)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <span style={{ fontSize: '20px' }}>{isImage ? '🖼' : isPdf ? '📄' : '📎'}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {cad.originalName}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(cad.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>by {cad.uploadedBy}</span>
              </div>
            </div>
            <span style={{ fontSize: '11px', background: cs.bg, color: cs.color, padding: '3px 10px', borderRadius: '99px', fontWeight: 700, flexShrink: 0 }}>
              {cs.label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
            <a
              href={fileUrl} download={cad.originalName}
              style={{ background: 'var(--navy)', color: '#fff', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              ↓ Download
            </a>
            <button
              onClick={onClose}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── File Preview ── */}
        <div style={{ flex: 1, overflow: 'auto', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
          {isImage ? (
            <img
              src={fileUrl} alt={cad.originalName}
              style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : isPdf ? (
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=0`}
              style={{ width: '100%', height: '60vh', border: 'none' }}
              title={cad.originalName}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5 }}>📎</div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '20px' }}>
                Preview not available for .{ext} files
              </div>
              <a href={fileUrl} download={cad.originalName}
                style={{ background: 'var(--accent)', color: '#fff', padding: '10px 24px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}>
                ↓ Download File
              </a>
            </div>
          )}
        </div>

        {/* ── Notes + Actions ── */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', flexShrink: 0, background: 'var(--bg-card)' }}>
          {(cad.designerNotes || cad.customerFeedback) && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {cad.designerNotes && (
                <div style={{ flex: 1, minWidth: '200px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Designer Note</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{cad.designerNotes}</div>
                </div>
              )}
              {cad.customerFeedback && (
                <div style={{ flex: 1, minWidth: '200px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Customer Feedback</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{cad.customerFeedback}</div>
                </div>
              )}
            </div>
          )}

          {canAct && (
            <>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Add feedback or revision notes (optional)…"
                rows={2}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', marginBottom: '10px' }}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => act('approve')} disabled={acting}
                  style={{ flex: 1, minWidth: '120px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '8px', padding: '10px', color: '#059669', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                  ✓ Approve
                </button>
                <button onClick={() => act('revision')} disabled={acting}
                  style={{ flex: 1, minWidth: '140px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px', padding: '10px', color: '#8B5CF6', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                  ↺ Request Changes
                </button>
                <button onClick={() => act('reject')} disabled={acting}
                  style={{ flex: 1, minWidth: '100px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '10px', color: '#DC2626', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                  ✕ Reject
                </button>
              </div>
            </>
          )}
          {!canAct && cad.status === 'APPROVED' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontSize: '13px', fontWeight: 600 }}>
              <span style={{ fontSize: '18px' }}>✓</span>
              Approved{cad.approvedBy ? ` by ${cad.approvedBy}` : ''}
              {cad.approvedAt ? ` on ${new Date(cad.approvedAt).toLocaleDateString()}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [cads, setCads] = useState<CadFile[]>([]);
  const [viewingCad, setViewingCad] = useState<CadFile | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jf_user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch(`${API}/orders/${id}`),
      apiFetch(`${API}/cad/order/${id}`),
    ]).then(async ([oRes, cRes]) => {
      if (oRes.ok) setOrder(await oRes.json());
      if (cRes.ok) setCads(await cRes.json());
      setLoading(false);
    });
  }, [id]);

  const handleCadAction = async (cadId: string, action: 'approve' | 'reject' | 'revision', feedback: string) => {
    await apiFetch(`${API}/cad/${cadId}/${action === 'revision' ? 'revision' : action}`, {
      method: 'PATCH',
      body: JSON.stringify({ feedback }),
    });
    const res = await apiFetch(`${API}/cad/order/${id}`);
    if (res.ok) setCads(await res.json());
    const oRes = await apiFetch(`${API}/orders/${id}`);
    if (oRes.ok) setOrder(await oRes.json());
  };

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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => router.push(`/orders/${id}/summary`)}
            style={{ background: 'rgba(192,155,88,0.1)', border: '1px solid rgba(192,155,88,0.35)', borderRadius: '8px', padding: '7px 16px', color: 'var(--accent-dark)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
          >
            📊 Summary
          </button>
          {['SKU_CREATION','VPO_ISSUED','PENDING_CONTRACTOR','ORDER_JOB_BAG_CREATED','READY_TO_INVOICE','READY_TO_SHIP','SHIPPED','DELIVERED'].includes(order.status!) && (
            <button
              onClick={() => router.push(`/orders/${id}/jobbag`)}
              style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.35)', borderRadius: '8px', padding: '7px 16px', color: '#0369a1', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              🖨 Job Bag
            </button>
          )}
          <button
            onClick={() => router.push('/orders')}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 16px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
          >
            ← Back to Orders
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="order-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 288px', gap: '24px', alignItems: 'start' }}>

          {/* Field groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {FIELD_GROUPS.map(group => {
              const FINANCIAL_KEYS = ['quotedCost', 'invoiceNumber'];
              const visibleFields = userRole === UserRole.ADMIN
                ? group.fields
                : group.fields.filter(f => !FINANCIAL_KEYS.includes(f.key));
              if (visibleFields.length === 0) return null;
              return (
              <div key={group.title} style={cardStyle}>
                <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '16px' }}>
                  {group.title}
                </h3>
                <div className="order-spec-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  {visibleFields.map(({ key, label, format }) => {
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
              );
            })}

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

            {/* Created by */}
            {(order.salesRepName || order.salesRepEmail) && (
              <div style={cardStyle}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Created By
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {(order as any).salesRepName || order.salesRepEmail}
                </div>
                {(order as any).salesRepName && order.salesRepEmail && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {order.salesRepEmail}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {new Date(order.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            )}

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

        {/* ── Reference Images (visible to all roles) ── */}
        {(() => {
          const refs = cads.filter(c => c.designerNotes === 'Reference image');
          if (refs.length === 0) return null;
          return (
            <div style={cardStyle}>
              <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', margin: '0 0 14px' }}>
                📌 Reference Images ({refs.length})
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {refs.map(cad => {
                  const ext = (cad.originalName.split('.').pop() || '').toLowerCase();
                  const isImage = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
                  const fileUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000'}/uploads/cad/${cad.fileName}`;
                  return (
                    <div key={cad.id}
                      onClick={() => setViewingCad(cad)}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', width: '160px', flexShrink: 0, cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
                    >
                      {isImage ? (
                        <img src={fileUrl} alt={cad.originalName}
                          style={{ width: '160px', height: '120px', objectFit: 'cover', display: 'block' }}
                          onError={e => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = 'none';
                            const fallback = img.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div style={{ width: '160px', height: '120px', display: isImage ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', background: 'var(--bg-input)' }}>
                        🖼
                      </div>
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cad.originalName}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>by {cad.uploadedBy}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── CAD Design Files ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0 }}>
              Design Files {cads.filter(c => c.designerNotes !== 'Reference image').length > 0 && `(${cads.filter(c => c.designerNotes !== 'Reference image').length})`}
            </h3>
          </div>

          {cads.filter(c => c.designerNotes !== 'Reference image').length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)', fontSize: '13px', opacity: 0.6 }}>
              No CAD files uploaded yet for this order.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cads.filter(c => c.designerNotes !== 'Reference image').map(cad => {
                const cs = CAD_STATUS_CFG[cad.status] || { label: cad.status, color: '#6B7280', bg: '#F3F4F6' };
                const ext = (cad.originalName.split('.').pop() || '').toLowerCase();
                const isImage = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
                const isPdf = ext === 'pdf';
                return (
                  <div key={cad.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: `1px solid ${cs.color}25`, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '22px', flexShrink: 0 }}>{isImage ? '🖼' : isPdf ? '📄' : '📎'}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cad.originalName}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>·</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(cad.createdAt).toLocaleDateString()}</span>
                          {cad.designerNotes && <span style={{ fontSize: '10px', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {cad.designerNotes}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', background: cs.bg, color: cs.color, padding: '3px 10px', borderRadius: '99px', fontWeight: 700 }}>
                        {cs.label}
                      </span>
                      <button
                        onClick={() => setViewingCad(cad)}
                        style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                      >
                        👁 View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

      {/* CAD Viewer Modal */}
      {viewingCad && (
        <CadViewerModal
          cad={viewingCad}
          userRole={userRole}
          onClose={() => setViewingCad(null)}
          onAction={handleCadAction}
        />
      )}
    </AppLayout>
  );
}
