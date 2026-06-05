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

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'DM Sans, sans-serif', color: '#6b7280' }}>Loading job bag…</div>;
  if (!order) return <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>Order not found.</div>;

  const orderUrl = typeof window !== 'undefined' ? `${window.location.origin}/orders/${id}` : `/orders/${id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(orderUrl)}&bgcolor=FFFFFF&color=0D1B35&margin=10`;
  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };

  const rows: { label: string; value?: string | null }[] = [
    { label: 'PO Number',     value: order.poNumber },
    { label: 'Kira SKU',      value: order.kiraSkuNumber },
    { label: 'Order Type',    value: order.orderType },
    { label: 'Metal',         value: order.metalType && order.metalColor ? `${order.metalType} ${order.metalColor}` : order.metalType },
    { label: 'Ring Size',     value: order.size },
    { label: 'Stone Type',    value: order.diamondType },
    { label: 'Stone Quality', value: order.diamondQuality },
    { label: 'Stone Shape',   value: order.centerStoneShape },
    { label: 'Carat Weight',  value: order.approximateCaratWeight ? `${order.approximateCaratWeight} ct` : null },
    { label: 'Store/Customer',value: order.storeName || order.customerFullName },
    { label: 'Status',        value: cfg.label },
  ].filter(r => r.value);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Helvetica Neue', sans-serif; background: #f5f3ef; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .jobbag { box-shadow: none !important; border: 1px solid #ccc !important; }
          @page { margin: 10mm; }
        }
      `}</style>

      {/* Print / Back buttons */}
      <div className="no-print" style={{ background: '#0d1b35', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>KIRA JEWELS — Job Bag</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => router.push(`/orders/${id}`)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px', padding: '7px 14px', color: 'rgba(255,255,255,0.8)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
            ← Back to Order
          </button>
          <button onClick={() => window.print()} style={{ background: '#c09b58', border: 'none', borderRadius: '7px', padding: '7px 18px', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>
            🖨 Print Job Bag
          </button>
        </div>
      </div>

      <div style={{ padding: '28px 24px', display: 'flex', justifyContent: 'center' }}>
        <div className="jobbag" style={{ background: '#fff', border: '2px solid #0d1b35', borderRadius: '12px', width: '100%', maxWidth: '680px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>

          {/* Header */}
          <div style={{ background: '#0d1b35', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '1.5px' }}>KIRA JEWELS</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '2.5px', textTransform: 'uppercase', marginTop: '2px' }}>Manufacturing Job Bag</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#c09b58', letterSpacing: '0.5px' }}>{order.poNumber}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                Printed: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Status banner */}
          <div style={{ background: `${cfg.color}15`, borderBottom: `3px solid ${cfg.color}`, padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: cfg.color }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{cfg.label}</span>
          </div>

          {/* Body */}
          <div className="jobbag-body" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0' }}>
            {/* Order specs */}
            <div style={{ padding: '20px 24px', borderRight: '1px solid #e5e1d8' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>Order Specifications</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 0', fontSize: '11px', color: '#9ca3af', width: '120px', fontWeight: 500 }}>{row.label}</td>
                      <td style={{ padding: '7px 0 7px 12px', fontSize: '12px', color: '#0d1b35', fontWeight: 600 }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {order.customerNotes && (
                <div style={{ marginTop: '14px', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Special Instructions</div>
                  <div style={{ fontSize: '11px', color: '#78350f', lineHeight: 1.6 }}>{order.customerNotes}</div>
                </div>
              )}
            </div>

            {/* QR code */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', minWidth: '210px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Scan to Open Order</div>
              <img src={qrUrl} alt={`QR code for order ${order.poNumber}`} width={180} height={180} style={{ border: '1px solid #e5e1d8', borderRadius: '8px', display: 'block' }} />
              <div style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.5, maxWidth: '160px' }}>
                Scan with phone camera to open this order in Kira Custom Jewelry
              </div>
              <div style={{ marginTop: '10px', width: '100%' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Production Checklist</div>
                {['Casting', 'Stone Setting', 'Polishing', 'Quality Check', 'Hallmarking'].map(step => (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ width: '14px', height: '14px', border: '1.5px solid #d1cdc7', borderRadius: '3px', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: '#374151' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ background: '#f9f8f5', borderTop: '1px solid #e5e1d8', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>SKU: {order.kiraSkuNumber || '—'} &nbsp;|&nbsp; Created: {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'}</div>
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>Kira Custom Jewelry · Kira Jewels</div>
          </div>
        </div>
      </div>
    </>
  );
}
