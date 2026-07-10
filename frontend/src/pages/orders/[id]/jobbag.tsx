import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order, STATUS_CONFIG } from '../../../utils/types';

export async function getServerSideProps() { return { props: {} }; }

export default function JobBagPage() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState<Partial<Order> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch(`${API}/orders/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setOrder(data); setLoading(false); });
  }, [id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'DM Sans, sans-serif', color: '#6b7280' }}>Loading…</div>;
  if (!order) return <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>Order not found.</div>;

  const orderUrl = typeof window !== 'undefined' ? `${window.location.origin}/orders/${id}` : `/orders/${id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(orderUrl)}&bgcolor=FFFFFF&color=0D1B35&margin=6`;
  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };

  const metal = [order.metalType, order.metalColor].filter(Boolean).join(' ');

  const specRows: { label: string; value?: string | null }[] = [
    { label: 'SKU',           value: order.kiraSkuNumber },
    { label: 'Type',          value: order.orderType },
    { label: 'Metal',         value: metal || null },
    { label: 'Size',          value: order.size },
    { label: 'Stone',         value: order.diamondType },
    { label: 'Quality',       value: order.diamondQuality },
    { label: 'Shape',         value: order.centerStoneShape },
    { label: 'Carat',         value: order.approximateCaratWeight ? `${order.approximateCaratWeight} ct` : null },
    { label: 'Tracking',      value: (order as any).trackingNumber },
  ].filter(r => r.value);

  const checklist = ['Casting', 'Stone Setting', 'Polishing', 'QC', 'Hallmarking'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Helvetica Neue', sans-serif; background: #e8e4dc; }
        .sticker-wrap { display: flex; align-items: flex-start; justify-content: center; padding: 40px 24px; gap: 32px; flex-wrap: wrap; }
        @media print {
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          .no-print { display: none !important; }
          .sticker-wrap { padding: 0; gap: 0; }
          .sticker { box-shadow: none !important; }
          @page { size: 100mm 150mm; margin: 4mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ background: '#0d1b35', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '15px', fontWeight: 700, color: '#c09b58', letterSpacing: '1px' }}>KIRA JEWELS — Job Bag Sticker</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => router.push(`/orders/${id}`)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '7px', padding: '6px 14px', color: 'rgba(255,255,255,0.75)', fontSize: '12px', cursor: 'pointer' }}>
            ← Back
          </button>
          <button onClick={() => window.print()} style={{ background: '#c09b58', border: 'none', borderRadius: '7px', padding: '6px 16px', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>
            🖨 Print Sticker
          </button>
        </div>
      </div>

      <div className="sticker-wrap">
        {/* ── STICKER ─────────────────────────────────────── */}
        <div className="sticker" style={{
          width: '340px',
          background: '#fff',
          border: '2px dashed #aaa5a0',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          fontFamily: "'DM Sans', sans-serif",
        }}>

          {/* ── TOP BAND ── */}
          <div style={{ background: '#0d1b35', padding: '10px 14px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '16px', fontWeight: 700, color: '#c09b58', letterSpacing: '1.5px', lineHeight: 1 }}>KIRA JEWELS</div>
              <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '3px' }}>Manufacturing Job Bag</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.5px', lineHeight: 1 }}>{order.poNumber}</div>
              <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* ── STATUS STRIP ── */}
          <div style={{ background: cfg.color, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.7)', flexShrink: 0 }} />
            <span style={{ fontSize: '9px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{cfg.label}</span>
          </div>

          {/* ── BODY: specs + QR ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 0 }}>

            {/* Specs */}
            <div style={{ padding: '10px 12px 8px 14px', borderRight: '1px dashed #d8d3cc' }}>
              {specRows.map(row => (
                <div key={row.label} style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ fontSize: '8px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', width: '54px', flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontSize: '10px', color: '#0d1b35', fontWeight: 600, lineHeight: 1.3 }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* QR code */}
            <div style={{ padding: '10px 10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
              <img src={qrUrl} alt="QR" width={80} height={80} style={{ display: 'block', borderRadius: '4px' }} />
              <div style={{ fontSize: '7px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.4 }}>Scan to open order</div>
            </div>
          </div>

          {/* ── NOTES (if any) ── */}
          {order.customerNotes && (
            <div style={{ margin: '0 14px 8px', padding: '7px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '5px' }}>
              <div style={{ fontSize: '7.5px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '3px' }}>⚠ Special Instructions</div>
              <div style={{ fontSize: '9px', color: '#78350f', lineHeight: 1.5 }}>{order.customerNotes}</div>
            </div>
          )}

          {/* ── CHECKLIST STRIP ── */}
          <div style={{ background: '#f9f8f5', borderTop: '1px dashed #d8d3cc', padding: '7px 14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {checklist.map(step => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '11px', height: '11px', border: '1.5px solid #9ca3af', borderRadius: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '8.5px', color: '#374151', fontWeight: 500 }}>{step}</span>
              </div>
            ))}
          </div>

          {/* ── FOOTER ── */}
          <div style={{ background: '#0d1b35', padding: '5px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '8px', color: 'rgba(255,255,255,0.45)' }}>
              {order.kiraSkuNumber || '—'}
            </span>
            <span style={{ fontSize: '7.5px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>kirajewels.one</span>
          </div>
        </div>

        {/* Preview note */}
        <div className="no-print" style={{ width: '220px', padding: '16px', background: 'rgba(255,255,255,0.6)', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontWeight: 700, fontSize: '12px', color: '#0d1b35', marginBottom: '8px' }}>Print tips</div>
          <ul style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.7, paddingLeft: '16px' }}>
            <li>Target size: 100 × 150 mm label</li>
            <li>Set <strong>scale to 100%</strong> in print dialog</li>
            <li>Disable headers &amp; footers</li>
            <li>Use label paper or glossy sticker sheet</li>
          </ul>
        </div>
      </div>
    </>
  );
}
