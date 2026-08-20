import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { toast } from '../../utils/toast';
import { formatCurrency } from '../../utils/format';

const API = '/api/proxy';

// ── Status helpers ────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'received',   label: 'Order Received',      statuses: ['NEW', 'CAD_IN_PROGRESS', 'VPO_ISSUED', 'MANUFACTURED', 'SHIPPED', 'COMPLETED'] },
  { key: 'design',     label: 'Design in Progress',  statuses: ['CAD_IN_PROGRESS', 'VPO_ISSUED', 'MANUFACTURED', 'SHIPPED', 'COMPLETED'] },
  { key: 'production', label: 'In Production',       statuses: ['VPO_ISSUED', 'MANUFACTURED', 'SHIPPED', 'COMPLETED'] },
  { key: 'shipped',    label: 'Shipped',             statuses: ['SHIPPED', 'COMPLETED'] },
  { key: 'completed',  label: 'Completed',           statuses: ['COMPLETED'] },
];

const STATUS_LABELS: Record<string, string> = {
  NEW:             'Order Received',
  CAD_IN_PROGRESS: 'Design in Progress',
  VPO_ISSUED:      'In Production',
  MANUFACTURED:    'In Production',
  SHIPPED:         'Shipped',
  COMPLETED:       'Completed',
  CANCELLED:       'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  NEW:             '#EC4899',
  CAD_IN_PROGRESS: '#6366F1',
  VPO_ISSUED:      '#8B5CF6',
  MANUFACTURED:    '#8B5CF6',
  SHIPPED:         '#3B82F6',
  COMPLETED:       '#10B981',
  CANCELLED:       '#EF4444',
};

const CAD_STATUS_LABELS: Record<string, string> = {
  UPLOADED:           'Reference Image',
  SENT_FOR_APPROVAL:  'Awaiting Your Approval',
  APPROVED:           'Approved',
  REJECTED:           'Rejected',
  REVISION_REQUESTED: 'Revision Requested',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface CadFile {
  id: string;
  status: string;
  originalName: string;
  fileName: string;
  filePath?: string;
  designerNotes: string | null;
  customerFeedback: string | null;
  revisionNumber: number;
  createdAt: string;
}

interface OrderData {
  poNumber: string;
  status: string;
  customerName: string;
  orderType: string | null;
  metalType: string | null;
  metalColor: string | null;
  size: string | null;
  diamondQuality: string | null;
  centerStoneShape: string | null;
  approximateCaratWeight: string | null;
  hasGemstone: boolean;
  customerNotes: string | null;
  refCustomerPo: string | null;
  createdAt: string;
  trackingNumber: string | null;
  shipMethod: string | null;
  quotedCost: number | null;
  quoteOptions: { label: string; price: number }[] | null;
  committedShipDate: string | null;
  cadFiles: CadFile[];
  viewerAccessEnabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const router = useRouter();
  const { token } = router.query as { token: string };

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<'approved' | 'rejected' | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/public/track/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Order not found');
        return r.json();
      })
      .then(data => { setOrder(data); setLoading(false); })
      .catch(() => { setError('We couldn\'t find your order. Please check your link or contact us.'); setLoading(false); });
  }, [token]);

  const handleApproveAll = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      await Promise.all(
        approvalFiles.map(f =>
          fetch(`${API}/public/track/${token}/cad/${f.id}/approve`, { method: 'PATCH' })
        )
      );
      setOrder(prev => prev ? {
        ...prev,
        cadFiles: prev.cadFiles.map(f =>
          f.status === 'SENT_FOR_APPROVAL' ? { ...f, status: 'APPROVED' } : f
        ),
      } : prev);
      setActionResult('approved');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectAll = async () => {
    if (!order || !feedback.trim()) return;
    setActionLoading(true);
    try {
      await Promise.all(
        approvalFiles.map(f =>
          fetch(`${API}/public/track/${token}/cad/${f.id}/reject`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback }),
          })
        )
      );
      setOrder(prev => prev ? {
        ...prev,
        cadFiles: prev.cadFiles.map(f =>
          f.status === 'SENT_FOR_APPROVAL'
            ? { ...f, status: 'REVISION_REQUESTED', customerFeedback: feedback }
            : f
        ),
      } : prev);
      setShowRejectModal(false);
      setFeedback('');
      setActionResult('rejected');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const activeStep = order ? STEPS.findIndex(s => !s.statuses.includes(order.status)) - 1 : -1;
  const completedUpTo = order ? STEPS.filter(s => s.statuses.includes(order.status)).length - 1 : -1;

  const quoteSet = order && order.quotedCost != null && order.quotedCost > 0;
  const approvalFiles = order?.cadFiles.filter(f => f.status === 'SENT_FOR_APPROVAL') ?? [];
  const historyFiles  = order?.cadFiles.filter(f => f.status !== 'SENT_FOR_APPROVAL' && f.status !== 'UPLOADED') ?? [];

  return (
    <>
      <Head>
        <title>{order ? `Order ${order.poNumber} — Kira Custom Jewelry` : 'Track Order — Kira Custom Jewelry'}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F5F4F0', fontFamily: "'DM Sans', Helvetica, Arial, sans-serif" }}>
        {/* Header */}
        <div style={{ background: '#1A2740', padding: '20px 24px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#C09B58', fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>KIRA CUSTOM JEWELRY</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>Order Tracking</div>
            </div>
            {order && (
              <div style={{ background: STATUS_COLORS[order.status] || '#6366F1', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                {STATUS_LABELS[order.status] || order.status}
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px 64px' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#6B7280' }}>Loading your order…</div>
          )}

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>😕</div>
              <p style={{ color: '#DC2626', fontWeight: 600, margin: '0 0 8px' }}>Order Not Found</p>
              <p style={{ color: '#6B7280', margin: 0, fontSize: 14 }}>{error}</p>
            </div>
          )}

          {order && (
            <>
              {/* PO + summary */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4DC', padding: '24px 28px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Order Reference</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1A2740' }}>{order.poNumber}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#6B7280' }}>
                    Placed {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px 24px', marginTop: 20 }}>
                  {[
                    { label: 'Order Type',      value: order.orderType },
                    { label: 'Metal',           value: [order.metalType, order.metalColor].filter(Boolean).join(' ') || null },
                    { label: 'Size',            value: order.size },
                    { label: 'Stone Shape',     value: order.centerStoneShape },
                    { label: 'Carat Weight',    value: order.approximateCaratWeight },
                    { label: 'Diamond Quality', value: order.diamondQuality },
                    { label: 'Gemstone',        value: order.hasGemstone ? 'Yes' : 'No' },
                    { label: 'Your PO #',       value: order.refCustomerPo },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8 }}>{row.label}</div>
                      <div style={{ fontSize: 14, color: '#1A2740', fontWeight: 500, marginTop: 2 }}>{row.value}</div>
                    </div>
                  ))}
                </div>

                {order.customerNotes && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F0EDE8' }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Your Notes</div>
                    <div style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.6 }}>{order.customerNotes}</div>
                  </div>
                )}

                {order.quoteOptions && order.quoteOptions.length > 0 && (
                  <div style={{ marginTop: 16, background: '#EFF6FF', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Price Options</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {order.quoteOptions.map((q, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: '#4B5563' }}>{q.label || `Option ${i + 1}`}</span>
                          <span style={{ fontWeight: 700, color: '#1A2740' }}>{formatCurrency(Number(q.price))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {order.quotedCost != null && order.quotedCost > 0 && (
                  <div style={{ marginTop: 16, background: '#F0FDF4', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#16A34A', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Quoted Price</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2740' }}>{formatCurrency(Number(order.quotedCost))}</div>
                    </div>
                  </div>
                )}

                {order.trackingNumber && (
                  <div style={{ marginTop: 16, background: '#EFF6FF', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Shipping Tracking</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2740' }}>{order.trackingNumber}</div>
                    {order.shipMethod && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{order.shipMethod}</div>}
                  </div>
                )}

                {order.committedShipDate && (
                  <div style={{ marginTop: 16, background: '#FFF7ED', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#C2410C', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Committed Ship Date</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2740' }}>
                      {new Date(order.committedShipDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                )}
              </div>

              {/* Status timeline */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4DC', padding: '24px 28px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 }}>Progress</div>
                {STEPS.map((step, i) => {
                  const done    = i <= completedUpTo;
                  const current = i === completedUpTo;
                  return (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: i < STEPS.length - 1 ? 4 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                          background: done ? (current ? '#C09B58' : '#1A2740') : '#E8E4DC',
                          color: done ? '#fff' : '#9CA3AF',
                          boxShadow: current ? '0 0 0 4px rgba(192,155,88,0.2)' : 'none',
                        }}>
                          {done ? (current ? i + 1 : '✓') : i + 1}
                        </div>
                        {i < STEPS.length - 1 && (
                          <div style={{ width: 2, height: 24, background: done && i < completedUpTo ? '#1A2740' : '#E8E4DC', marginTop: 2 }} />
                        )}
                      </div>
                      <div style={{ paddingTop: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: current ? 700 : 500, color: done ? '#1A2740' : '#9CA3AF' }}>
                          {step.label}
                          {current && <span style={{ marginLeft: 8, fontSize: 11, background: '#C09B58', color: '#fff', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>Current</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CAD approval — only visible after quote is set */}
              {quoteSet && approvalFiles.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 12, border: '2px solid #6366F1', padding: '24px 28px', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366F1', animation: 'pulse 2s infinite' }} />
                    <div style={{ fontSize: 12, color: '#6366F1', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Action Required — Design Review</div>
                  </div>
                  <p style={{ color: '#4B5563', fontSize: 14, marginBottom: 20, marginTop: 0 }}>
                    Our design team has completed your CAD. Please review all designs below and either <strong>approve</strong> to move into production, or <strong>request changes</strong>.
                  </p>

                  {/* All design files — no per-file buttons */}
                  {approvalFiles.map(f => (
                    <div key={f.id} style={{ border: '1px solid #E8E4DC', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                      {/\.(jpg|jpeg|png|gif|webp)$/i.test(f.fileName) && (
                        <img
                          src={`${f.filePath || '/uploads/cad/' + f.fileName}`}
                          alt={f.originalName}
                          style={{ width: '100%', maxHeight: 400, objectFit: 'contain', background: '#F9F8F6', display: 'block' }}
                        />
                      )}
                      <div style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, color: '#1A2740', fontWeight: 600 }}>{f.originalName}</div>
                        {f.designerNotes && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{f.designerNotes}</div>}
                      </div>
                    </div>
                  ))}

                  {/* Single set of action buttons for all files */}
                  {actionResult ? (
                    <div style={{ padding: '14px 18px', borderRadius: 8, background: actionResult === 'approved' ? '#ECFDF5' : '#FFF7ED', color: actionResult === 'approved' ? '#059669' : '#D97706', fontWeight: 600, fontSize: 14 }}>
                      {actionResult === 'approved'
                        ? '✓ Designs approved — our team has been notified and will move your order into production!'
                        : '✓ Revision requested — we\'ll update the designs and send you a new version shortly.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                      <button
                        onClick={handleApproveAll}
                        disabled={actionLoading}
                        style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: actionLoading ? 0.7 : 1 }}
                      >
                        {actionLoading ? 'Processing…' : '✓ Approve Design' + (approvalFiles.length > 1 ? 's' : '')}
                      </button>
                      <button
                        onClick={() => setShowRejectModal(true)}
                        disabled={actionLoading}
                        style={{ background: '#fff', color: '#DC2626', border: '1.5px solid #DC2626', borderRadius: 8, padding: '12px 28px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                      >
                        Request Changes
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 3D Viewer — company-gated placeholder, real iJewel3D embed not wired up yet */}
              {order.viewerAccessEnabled && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4DC', padding: '24px 28px', marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>3D Viewer</div>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '32px 16px', borderRadius: 8, border: '1px dashed #E8E4DC', background: '#FAF9F6', textAlign: 'center',
                  }}>
                    <span style={{ fontSize: 22 }}>💍</span>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2740' }}>Interactive 3D preview coming soon</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', maxWidth: 320 }}>
                      Your account has 3D preview access — the live viewer isn't connected yet, but it'll appear right here once it is.
                    </div>
                  </div>
                </div>
              )}

              {/* Design history — only visible after quote is set */}
              {quoteSet && historyFiles.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4DC', padding: '24px 28px', marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Design History</div>
                  {historyFiles.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0EDE8', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#1A2740', fontWeight: 500 }}>{f.originalName}</div>
                        {f.designerNotes && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{f.designerNotes}</div>}
                        {f.customerFeedback && (
                          <div style={{ fontSize: 12, color: '#D97706', marginTop: 4 }}>Your feedback: "{f.customerFeedback}"</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '3px 10px',
                          background: f.status === 'APPROVED' ? '#ECFDF5' : f.status === 'REVISION_REQUESTED' ? '#FFF7ED' : '#F3F4F6',
                          color: f.status === 'APPROVED' ? '#059669' : f.status === 'REVISION_REQUESTED' ? '#D97706' : '#6B7280',
                        }}>
                          {CAD_STATUS_LABELS[f.status] || f.status}
                        </span>
                        {/\.(jpg|jpeg|png|gif|webp)$/i.test(f.fileName) && (
                          <a href={`${f.filePath || '/uploads/cad/' + f.fileName}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6366F1', textDecoration: 'none' }}>View</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Help footer */}
              <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>
                Questions about your order?{' '}
                <a href="mailto:info@kirajewels.com" style={{ color: '#C09B58', textDecoration: 'none' }}>Contact us</a>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <h3 style={{ margin: '0 0 8px', color: '#1A2740', fontSize: 18 }}>Request Changes</h3>
            <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 16px' }}>
              Please describe what changes you'd like. Our team will revise and send you an updated version.
            </p>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="e.g. Please make the band thinner, change the prong style to 6-prong…"
              rows={4}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowRejectModal(false); setFeedback(''); }}
                style={{ background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectAll}
                disabled={!feedback.trim() || actionLoading}
                style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: !feedback.trim() ? 0.5 : 1 }}
              >
                {actionLoading ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
