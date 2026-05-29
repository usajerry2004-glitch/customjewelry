import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../../components/layout/AppLayout';
import { Order, STATUS_CONFIG } from '../../../utils/types';
import { apiFetch, API } from '../../../utils/apiFetch';

export async function getServerSideProps() { return { props: {} }; }

interface CadFile {
  id: string; originalName: string; status: string;
  revisionNumber: number; designerNotes?: string; customerFeedback?: string; createdAt: string;
}
interface Message {
  id: string; authorName: string; authorRole: string;
  content: string; isInternal: boolean; createdAt: string;
}

const PIPELINE = [
  { status: 'WAITING_CONFIRMATION', label: 'Received',    icon: '📥' },
  { status: 'PENDING_CAD',          label: 'Pending CAD', icon: '⏳' },
  { status: 'CAD_IN_PROGRESS',      label: 'Design',      icon: '✏️' },
  { status: 'CUSTOMER_APPROVED',    label: 'Approved',    icon: '✅' },
  { status: 'SKU_CREATION',         label: 'SKU',         icon: '🏷️' },
  { status: 'VPO_ISSUED',           label: 'VPO',         icon: '📋' },
  { status: 'ORDER_JOB_BAG_CREATED',label: 'Job Bag',     icon: '🏭' },
  { status: 'READY_TO_SHIP',        label: 'Ready',       icon: '📦' },
  { status: 'SHIPPED',              label: 'Shipped',     icon: '🚚' },
  { status: 'DELIVERED',            label: 'Delivered',   icon: '🎁' },
];

const CAD_STATUS_CFG: Record<string, { label: string; color: string }> = {
  UPLOADED:           { label: 'Uploaded',          color: '#6366F1' },
  SENT_FOR_APPROVAL:  { label: 'Awaiting Approval', color: '#F59E0B' },
  APPROVED:           { label: 'Approved',          color: '#10B981' },
  REJECTED:           { label: 'Rejected',          color: '#EF4444' },
  REVISION_REQUESTED: { label: 'Revision Requested',color: '#8B5CF6' },
};

// ── Shared card shell ──────────────────────────────────────────────────────
const Card: React.FC<{ children: React.ReactNode; accent?: string; style?: React.CSSProperties }> = ({ children, accent, style }) => (
  <div style={{
    background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
    border: `1px solid ${accent ? accent + '30' : 'var(--border)'}`,
    borderTop: accent ? `3px solid ${accent}` : undefined,
    boxShadow: 'var(--shadow-sm)', padding: '20px 22px', ...style,
  }}>
    {children}
  </div>
);

const CardTitle: React.FC<{ icon: string; label: string; color?: string }> = ({ icon, label, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
    <span style={{ fontSize: '16px' }}>{icon}</span>
    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: color || 'var(--text-muted)' }}>
      {label}
    </span>
  </div>
);

const Row: React.FC<{ label: string; value?: string | number | null; accent?: boolean }> = ({ label, value, accent }) => {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0, marginRight: '12px' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: accent ? 'var(--accent-dark)' : 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────
export default function OrderSummaryPage() {
  const router = useRouter();
  const { id } = router.query;

  const [order, setOrder]       = useState<Partial<Order> | null>(null);
  const [cads, setCads]         = useState<CadFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [summary, setSummary]   = useState<string | null>(null);
  const [sumLoading, setSumLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) setIsAdmin(JSON.parse(u).role === 'ADMIN');
    } catch {}
  }, []);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch(`${API}/orders/${id}`),
      apiFetch(`${API}/cad/order/${id}`),
      apiFetch(`${API}/orders/${id}/messages`),
    ]).then(async ([oRes, cRes, mRes]) => {
      if (oRes.ok) setOrder(await oRes.json());
      if (cRes.ok) setCads(await cRes.json());
      if (mRes.ok) setMessages(await mRes.json());
      setLoading(false);
    });
  }, [id]);

  const loadSummary = async () => {
    if (!id) return;
    setSumLoading(true);
    const res = await apiFetch(`${API}/orders/${id}/summary`);
    if (res.ok) { const d = await res.json(); setSummary(d.summary); }
    setSumLoading(false);
  };

  if (loading) {
    return (
      <AppLayout title="Order Summary">
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)', fontSize: '14px' }}>Loading summary…</div>
      </AppLayout>
    );
  }
  if (!order) {
    return (
      <AppLayout title="Not Found">
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--danger)' }}>
          Order not found. <a href="/orders" style={{ color: 'var(--accent-dark)' }}>Back to orders</a>
        </div>
      </AppLayout>
    );
  }

  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const currentStep = PIPELINE.findIndex(p => p.status === order.status);
  const completedPct = currentStep >= 0 ? Math.round((currentStep / (PIPELINE.length - 1)) * 100) : 0;
  const recentMessages = messages.slice(-3).reverse();

  return (
    <AppLayout
      title={`Summary · ${order.poNumber || ''}`}
      subtitle={order.storeName || order.customerFullName || ''}
      actions={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}
          >
            🖨 Print
          </button>
          <button
            onClick={() => router.push(`/orders/${id}`)}
            style={{ background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', cursor: 'pointer', color: '#fff', fontWeight: 600 }}
          >
            ← Full Detail
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* ── HERO CARD ──────────────────────────────────────────────── */}
        <Card accent={cfg.color}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            {/* Left */}
            <div>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '0.5px' }}>
                {order.poNumber}
              </div>
              {order.kiraSkuNumber && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>{order.kiraSkuNumber}</div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ background: cfg.bg, color: cfg.color, padding: '5px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.3px' }}>
                  {cfg.label}
                </span>
                {order.orderType && (
                  <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {order.orderType}
                  </span>
                )}
                {order.manufacturingPath && (
                  <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {order.manufacturingPath}
                  </span>
                )}
              </div>
            </div>
            {/* Right */}
            <div style={{ textAlign: 'right' }}>
              {isAdmin && order.quotedCost && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Quoted Cost</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--accent-dark)', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
                    ${Number(order.quotedCost).toLocaleString()}
                  </div>
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Created {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Updated {order.updatedAt ? new Date(order.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </div>
            </div>
          </div>
        </Card>

        {/* ── PIPELINE PROGRESS ─────────────────────────────────────── */}
        <Card>
          <CardTitle icon="📍" label="Order Pipeline" />
          {/* Progress bar */}
          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '99px', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${completedPct}%`, background: cfg.color, borderRadius: '99px', transition: 'width 0.5s ease' }} />
          </div>
          {/* Steps */}
          <div style={{ display: 'flex', overflowX: 'auto', gap: '0', paddingBottom: '4px' }}>
            {PIPELINE.map((step, i) => {
              const done    = i < currentStep;
              const active  = i === currentStep;
              return (
                <React.Fragment key={step.status}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 0 auto', minWidth: '64px' }}>
                    <div style={{
                      width: active ? '40px' : '32px', height: active ? '40px' : '32px',
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: active ? '18px' : '14px',
                      background: done ? cfg.color : active ? cfg.bg : 'var(--bg-input)',
                      border: `2px solid ${done || active ? cfg.color : 'var(--border)'}`,
                      boxShadow: active ? `0 0 12px ${cfg.color}50` : 'none',
                      transition: 'all 0.2s', zIndex: 1,
                    }}>
                      {done ? '✓' : step.icon}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '6px', textAlign: 'center', lineHeight: 1.3, maxWidth: '56px',
                      color: done ? cfg.color : active ? cfg.color : 'var(--text-muted)',
                      fontWeight: active ? 700 : done ? 600 : 400,
                    }}>
                      {step.label}
                    </div>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <div style={{ height: '2px', flex: '1 1 auto', background: done ? cfg.color : 'var(--border)', alignSelf: 'flex-start', marginTop: '15px', minWidth: '8px' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
            {completedPct}% complete
          </div>
        </Card>

        {/* ── 2-column grid ─────────────────────────────────────────── */}
        <div className="order-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Customer */}
          <Card accent="#C09B58">
            <CardTitle icon="👤" label="Customer" color="#C09B58" />
            <Row label="Store"         value={order.storeName} />
            <Row label="Customer Name" value={order.customerFullName} />
            <Row label="Email"         value={order.customerEmail} />
          </Card>

          {/* Product Specs */}
          <Card accent="#6366F1">
            <CardTitle icon="💎" label="Product Specs" color="#6366F1" />
            <Row label="Metal"         value={order.metalType && order.metalColor ? `${order.metalType} · ${order.metalColor}` : order.metalType} />
            <Row label="Ring Size"     value={order.size} />
            <Row label="Stone Type"    value={order.diamondType} />
            <Row label="Stone Quality" value={order.diamondQuality} />
            <Row label="Stone Shape"   value={order.centerStoneShape} />
            <Row label="Carat Weight"  value={order.approximateCaratWeight ? `${order.approximateCaratWeight} ct` : null} />
          </Card>

          {/* Pricing & Logistics */}
          <Card accent="#10B981">
            <CardTitle icon="💰" label="Pricing & Logistics" color="#10B981" />
            {isAdmin && <Row label="Quoted Cost" value={order.quotedCost ? `$${Number(order.quotedCost).toLocaleString()}` : null} accent />}
            <Row label="Vendor"        value={order.vendorName} />
            <Row label="Tracking #"    value={order.trackingNumber} />
          </Card>

          {/* CAD Files */}
          <Card accent="#8B5CF6">
            <CardTitle icon="🖥️" label={`CAD Files (${cads.length})`} color="#8B5CF6" />
            {cads.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '20px 0', opacity: 0.6 }}>
                No design files uploaded yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cads.map(cad => {
                  const cs = CAD_STATUS_CFG[cad.status] || { label: cad.status, color: '#6B7280' };
                  return (
                    <div key={cad.id} style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '10px 12px', border: `1px solid ${cs.color}25` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: cad.designerNotes ? '6px' : '0' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{cad.originalName}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, marginLeft: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                          <span style={{ fontSize: '10px', background: `${cs.color}15`, color: cs.color, padding: '2px 7px', borderRadius: '99px', fontWeight: 700 }}>{cs.label}</span>
                        </div>
                      </div>
                      {cad.designerNotes && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>📝 {cad.designerNotes}</div>
                      )}
                      {cad.customerFeedback && (
                        <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '2px' }}>💬 {cad.customerFeedback}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>

        {/* ── AI SUMMARY ────────────────────────────────────────────── */}
        <Card accent="#0EA5E9">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🤖</span>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#0EA5E9' }}>AI Summary</span>
            </div>
            {!summary && (
              <button
                onClick={loadSummary}
                disabled={sumLoading}
                style={{
                  background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: sumLoading ? 'not-allowed' : 'pointer',
                  opacity: sumLoading ? 0.7 : 1,
                }}
              >
                {sumLoading ? 'Generating…' : '✨ Generate Summary'}
              </button>
            )}
          </div>
          {summary ? (
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.8, background: 'rgba(14,165,233,0.05)', borderRadius: '8px', padding: '14px 16px', border: '1px solid rgba(14,165,233,0.15)' }}>
              {summary}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', opacity: 0.7 }}>
              {sumLoading ? 'Generating AI summary for this order…' : 'Click Generate to get an AI briefing on this order.'}
            </div>
          )}
        </Card>

        {/* ── NOTES + MESSAGES ─────────────────────────────────────── */}
        <div className="order-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Customer Notes */}
          {order.customerNotes && (
            <Card accent="#F59E0B">
              <CardTitle icon="📋" label="Customer Notes" color="#F59E0B" />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, background: 'rgba(245,158,11,0.05)', borderRadius: '8px', padding: '12px 14px', border: '1px solid rgba(245,158,11,0.15)' }}>
                {order.customerNotes}
              </p>
            </Card>
          )}

          {/* Recent Messages */}
          <Card accent="#6B7280" style={{ gridColumn: order.customerNotes ? undefined : '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>💬</span>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Recent Messages ({messages.length})
                </span>
              </div>
              <button
                onClick={() => router.push(`/orders/${id}`)}
                style={{ fontSize: '11px', color: 'var(--accent-dark)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                View all →
              </button>
            </div>
            {recentMessages.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', opacity: 0.6 }}>No messages yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentMessages.map(msg => (
                  <div key={msg.id} style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>{msg.authorName}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(msg.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* ── QUICK ACTIONS ─────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: '10px', padding: '16px 20px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginRight: '4px' }}>
            Quick actions
          </span>
          <button
            onClick={() => router.push(`/orders/${id}`)}
            style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Edit Order
          </button>
          {cads.length > 0 && (
            <button
              onClick={() => router.push(`/cad?order=${id}`)}
              style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              View CAD Files
            </button>
          )}
          <button
            onClick={() => router.push('/orders')}
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            ← All Orders
          </button>
        </div>

      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .app-sidebar, .hamburger-btn, button { display: none !important; }
          .order-summary-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 768px) {
          .order-summary-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppLayout>
  );
}
