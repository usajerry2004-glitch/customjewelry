import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order, STATUS_CONFIG, getCadSubLabel } from '../../../utils/types';
import { OrderConversation } from '../../../components/OrderConversation';

const ThreeDmViewer = dynamic(() => import('../../../components/ThreeDmViewer'), { ssr: false });
const StlViewer = dynamic(() => import('../../../components/StlViewer'), { ssr: false });

interface CadFile {
  id: string;
  fileName: string;
  originalName: string;
  status: string;
  revisionNumber: number;
  designerNotes?: string;
  customerFeedback?: string;
  createdAt: string;
  filePath?: string;
  thumbnailPath?: string;
}


// ── Inline viewer modal (customer-facing) ─────────────────────────────────
function CadViewer({ cads, initialIndex, onClose }: { cads: CadFile[]; initialIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(initialIndex);
  const cad      = cads[idx];
  const ext      = (cad.originalName.split('.').pop() || '').toLowerCase();
  const isImage  = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
  const isPdf    = ext === 'pdf';
  const isVideo  = ['mp4','mov','webm','avi','mkv','wmv'].includes(ext);
  const is3dm    = ext === '3dm';
  const isStl    = ext === 'stl';
  const isJcd    = ext === 'jcd';
  const fileUrl  = cad.filePath || `/uploads/cad/${cad.fileName}`;
  const companionForJcd = isJcd
    ? cads.find(f => {
        const base = cad.originalName.replace(/\.jcd$/i, '');
        const fBase = f.originalName.replace(/\.[^.]+$/, '');
        const fExt = (f.originalName.split('.').pop() || '').toLowerCase();
        return f.id !== cad.id && fBase === base && ['jpg','jpeg','png','webp'].includes(fExt);
      })
    : undefined;
  const cs       = CAD_STATUS[cad.status] || { label: cad.status, color: '#64748B' };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(cads.length - 1, i + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, cads.length]);

  return (
    <div
      className="modal-bg"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div className="modal-box" style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', width: '100%', maxWidth: '860px', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{ fontSize: '20px' }}>{isImage ? '🖼' : isPdf ? '📄' : isVideo ? '🎬' : is3dm ? '📐' : isStl ? '🔺' : isJcd ? '💎' : '📎'}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cad.originalName}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '2px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                <span style={{ fontSize: '11px', background: `${cs.color}18`, color: cs.color, padding: '1px 8px', borderRadius: '99px', fontWeight: 700 }}>{cs.label}</span>
                {cads.length > 1 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{idx + 1} / {cads.length}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
            <button onClick={onClose}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' }}>
              ✕
            </button>
          </div>
        </div>

        {/* Preview with slider arrows */}
        <div style={{ flex: 1, overflow: 'auto', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '320px', position: 'relative' }}>
          {cads.length > 1 && (
            <>
              <button
                onClick={() => setIdx(i => Math.max(0, i - 1))}
                disabled={idx === 0}
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '22px', lineHeight: 1, cursor: idx === 0 ? 'not-allowed' : 'pointer', color: '#fff', opacity: idx === 0 ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s' }}
              >‹</button>
              <button
                onClick={() => setIdx(i => Math.min(cads.length - 1, i + 1))}
                disabled={idx === cads.length - 1}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '22px', lineHeight: 1, cursor: idx === cads.length - 1 ? 'not-allowed' : 'pointer', color: '#fff', opacity: idx === cads.length - 1 ? 0.25 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s' }}
              >›</button>
            </>
          )}
          {isImage ? (
            <img src={fileUrl} alt={cad.originalName}
              style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', display: 'block' }} />
          ) : isPdf ? (
            <iframe src={`${fileUrl}#toolbar=1`} style={{ width: '100%', height: '65vh', border: 'none' }} title={cad.originalName} />
          ) : isVideo ? (
            <video
              src={fileUrl}
              controls
              style={{ maxWidth: '100%', maxHeight: '65vh', display: 'block', borderRadius: '6px' }}
            />
          ) : is3dm ? (
            <ThreeDmViewer fileUrl={fileUrl} height={480} />
          ) : isStl ? (
            <StlViewer fileUrl={fileUrl} height={480} />
          ) : isJcd ? (
            companionForJcd ? (
              <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={`${companionForJcd.filePath || '/uploads/cad/' + companionForJcd.fileName}`}
                  alt={cad.originalName}
                  style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.75)', color: '#c09b58', fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px' }}>
                  💎 JewelCAD Design File
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '64px', marginBottom: '12px' }}>💎</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: '6px' }}>JewelCAD Design File</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>Use Download to open in JewelCAD or Matrix.</div>
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '56px', marginBottom: '14px', opacity: 0.4 }}>📎</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Preview not available for .{ext} files</div>
            </div>
          )}
        </div>

        {/* Dot indicators */}
        {cads.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '10px', background: '#111827', flexShrink: 0 }}>
            {cads.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                style={{ width: i === idx ? '20px' : '8px', height: '8px', borderRadius: '4px', border: 'none', background: i === idx ? 'var(--accent, #6366F1)' : 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0, transition: 'all 0.2s' }}
              />
            ))}
          </div>
        )}

        {/* Notes footer */}
        {(cad.designerNotes || cad.customerFeedback) && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', display: 'flex', gap: '10px', flexWrap: 'wrap', background: 'var(--bg-card)', flexShrink: 0 }}>
            {cad.designerNotes && (
              <div style={{ flex: 1, minWidth: '180px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Designer Note</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{cad.designerNotes}</div>
              </div>
            )}
            {cad.customerFeedback && (
              <div style={{ flex: 1, minWidth: '180px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Your Feedback</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{cad.customerFeedback}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const CAD_STATUS: Record<string, { label: string; color: string }> = {
  UPLOADED:           { label: 'Uploaded', color: '#6366F1' },
  SENT_FOR_APPROVAL:  { label: 'Awaiting Your Approval', color: '#F59E0B' },
  APPROVED:           { label: 'Approved', color: '#10B981' },
  REJECTED:           { label: 'Rejected', color: '#EF4444' },
  REVISION_REQUESTED: { label: 'Revision Requested', color: '#8B5CF6' },
};

const TIMELINE = [
  { status: 'NEW',            label: 'Order Received' },
  { status: 'CAD_IN_PROGRESS', label: 'CAD Design' },
  { status: 'VPO_ISSUED',     label: 'In Production' },
  { status: 'MANUFACTURED',   label: 'Manufactured' },
  { status: 'COMPLETED',      label: 'Completed' },
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
  const [batchFeedback, setBatchFeedback] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [viewerState, setViewerState] = useState<{ list: CadFile[]; idx: number } | null>(null);

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
    try {
      const feedback = cadFeedback[cadId] || '';
      await apiFetch(`${API}/cad/${cadId}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify({ feedback }),
      });
      await reload();
    } catch {
      alert('Failed to submit — check your connection and try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const batchCadAction = async (cadIds: string[], action: 'approve' | 'reject' | 'revision') => {
    setActionLoading('batch-' + action);
    try {
      for (const cadId of cadIds) {
        await apiFetch(`${API}/cad/${cadId}/${action}`, {
          method: 'PATCH',
          body: JSON.stringify({ feedback: batchFeedback }),
        });
      }
      setBatchFeedback('');
      await reload();
    } catch {
      alert('Failed to submit — check your connection and try again.');
    } finally {
      setActionLoading(null);
    }
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
  const cadSubLabel = order.status === 'CAD_IN_PROGRESS' ? getCadSubLabel(order) : null;
  const currentIdx = TIMELINE.findIndex(t => t.status === order.status);

  return (
    <>
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
            {cadSubLabel || cfg.label}
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
            { label: 'Your PO #', value: order.refCustomerPo },
            { label: 'SKU', value: order.kiraSkuNumber },
            { label: 'Tracking', value: order.trackingNumber },
            { label: 'Committed Ship Date', value: order.committedShipDate ? new Date(order.committedShipDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null },
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

      {/* Price options — additional priced items/tiers the sales rep has quoted
          (e.g. a matching band). Shown whenever they exist, independent of
          whether a final price has also been set for the main item — these
          aren't mutually exclusive with the Quoted Price below. */}
      {order.quoteOptions && order.quoteOptions.length > 0 && (
        <div style={{ ...card, marginBottom: '16px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Price Options</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            {order.quoteOptions.map((q, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{q.label || `Option ${i + 1}`}</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>${Number(q.price).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quote */}
      {order.quotedCost != null && order.quotedCost > 0 && (
        <div style={{ ...card, marginBottom: '16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Quoted Price</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>${Number(order.quotedCost).toLocaleString()}</div>
        </div>
      )}

      {/* Customer notes */}
      {order.customerNotes && (
        <div style={card}>
          <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', margin: '0 0 10px' }}>Your Notes</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{order.customerNotes}</p>
        </div>
      )}

      {/* Reference Images — always visible, customers can upload */}
      {(() => {
        const refs = cads.filter(c => c.designerNotes === 'Reference image' || c.designerNotes === 'Customer reference image');
        return (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', margin: 0 }}>
              📌 Reference Images {refs.length > 0 && `(${refs.length})`}
            </h3>
            <label style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--accent-dark)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '4px 10px', background: 'transparent' }}>
              + Add Image
              <input type="file" style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file || !order?.id) { e.target.value = ''; return; }
                  try {
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await fetch(`/api/proxy/cad/reference/${order.id}`, {
                      method: 'POST',
                      credentials: 'include',
                      body: fd,
                    });
                    if (res.ok) reload();
                    else alert('Failed to upload image — check your connection and try again.');
                  } catch {
                    alert('Failed to upload image — check your connection and try again.');
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </label>
          </div>

          {refs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
              No reference images yet. Upload an inspiration photo to share with our design team.
            </div>
          ) : (
          <div className="ref-images-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {refs.map((cad, cadIdx) => {
              const ext = (cad.originalName.split('.').pop() || '').toLowerCase();
              const isImage = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
              const isVid = ['mp4','mov','webm','avi','mkv','wmv'].includes(ext);
              const fileUrl = cad.filePath || `/uploads/cad/${cad.fileName}`;
              const thumbUrl = cad.thumbnailPath || fileUrl;
              const fallbackIcon = isVid ? '🎬' : ext === 'pdf' ? '📄' : ext === '3dm' ? '🧊' : ext === 'stl' ? '🔺' : ext === 'jcd' ? '💎' : '📎';
              return (
                <div key={cad.id}
                  onClick={() => setViewerState({ list: refs, idx: cadIdx })}
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', width: '150px', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
                >
                  {isImage ? (
                    <Image src={thumbUrl} alt={cad.originalName} width={150} height={110}
                      style={{ width: '150px', height: '110px', objectFit: 'cover', display: 'block' }}
                      onError={e => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        const fallback = img.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div style={{ width: '150px', height: '110px', display: isImage ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', background: 'var(--bg-input)' }}>
                    {fallbackIcon}
                  </div>
                  <div style={{ padding: '5px 8px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cad.originalName}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
        );
      })()}

      {/* CAD Design Files */}
      {(() => {
        const designFiles = cads.filter(c =>
          c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image'
        );
        const pendingBatch = designFiles.filter(c => c.status === 'SENT_FOR_APPROVAL');
        const otherFiles   = designFiles.filter(c => c.status !== 'SENT_FOR_APPROVAL');
        const pendingIds   = pendingBatch.map(c => c.id);

        return (
          <div style={card}>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 14px' }}>
              Design Files {designFiles.length > 0 && `(${designFiles.length})`}
            </h3>

            {designFiles.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No design files yet. Our CAD team will upload designs once your order is confirmed.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Pending batch — all SENT_FOR_APPROVAL files as a single review request */}
                {pendingBatch.length > 0 && (
                  <div style={{ background: 'var(--bg-input)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                    <div style={{ fontSize: '12px', color: '#F59E0B', marginBottom: '12px', fontWeight: 600 }}>
                      {pendingBatch.length === 1
                        ? 'This design is waiting for your review and approval.'
                        : `${pendingBatch.length} designs are waiting for your review and approval.`}
                    </div>

                    {/* List each file in the batch */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                      {pendingBatch.map((cad, cadIdx) => (
                        <div key={cad.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{cad.originalName}</span>
                              <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 8px', borderRadius: '99px' }}>Awaiting Your Approval</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                            </div>
                            {cad.designerNotes && cad.designerNotes !== 'Reference image' && (
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Designer note: {cad.designerNotes}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(cad.createdAt).toLocaleDateString()}</span>
                            <button
                              onClick={() => setViewerState({ list: pendingBatch, idx: cadIdx })}
                              style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                            >
                              👁 View
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Single shared feedback + action buttons for the whole batch */}
                    <textarea
                      value={batchFeedback}
                      onChange={e => setBatchFeedback(e.target.value)}
                      placeholder="Optional feedback or revision notes…"
                      rows={2}
                      style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '10px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => batchCadAction(pendingIds, 'approve')}
                        disabled={!!actionLoading}
                        style={{ flex: 1, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: '7px', padding: '8px', color: '#059669', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                      >
                        Approve Design
                      </button>
                      <button
                        onClick={() => batchCadAction(pendingIds, 'revision')}
                        disabled={!!actionLoading}
                        style={{ flex: 1, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '7px', padding: '8px', color: '#8B5CF6', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                      >
                        Request Changes
                      </button>
                      <button
                        onClick={() => batchCadAction(pendingIds, 'reject')}
                        disabled={!!actionLoading}
                        style={{ flex: 1, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '7px', padding: '8px', color: '#DC2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {/* Already-actioned files */}
                {otherFiles.map((cad, cadIdx) => {
                  const cs = CAD_STATUS[cad.status] || { label: cad.status, color: '#64748B' };
                  return (
                    <div key={cad.id} style={{ background: 'var(--bg-input)', border: `1px solid ${cs.color}30`, borderRadius: 'var(--radius)', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{cad.originalName}</span>
                            <span style={{ fontSize: '10px', background: `${cs.color}15`, color: cs.color, padding: '2px 8px', borderRadius: '99px' }}>{cs.label}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                          </div>
                          {cad.designerNotes && cad.designerNotes !== 'Reference image' && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Designer note: {cad.designerNotes}</div>
                          )}
                          {cad.customerFeedback && (
                            <div style={{ fontSize: '12px', color: '#F59E0B', marginTop: '4px' }}>Your feedback: {cad.customerFeedback}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(cad.createdAt).toLocaleDateString()}</span>
                          <button
                            onClick={() => setViewerState({ list: otherFiles, idx: cadIdx })}
                            style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                          >
                            👁 View
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}
          </div>
        );
      })()}

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

    {viewerState && (
      <CadViewer cads={viewerState.list} initialIndex={viewerState.idx} onClose={() => setViewerState(null)} />
    )}
    </>
  );
}
