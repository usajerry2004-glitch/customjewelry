import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order } from '../../../utils/types';

export async function getServerSideProps() { return { props: {} }; }

interface CadFile {
  id: string;
  originalName: string;
  fileName: string;
  filePath?: string;
  designerNotes?: string;
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

export default function CadBriefPage() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState<Partial<Order> | null>(null);
  const [refs, setRefs] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch(`${API}/orders/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch(`${API}/cad/order/${id}`).then(r => r.ok ? r.json() : []),
    ]).then(([orderData, cadFiles]) => {
      setOrder(orderData);
      setRefs((cadFiles || []).filter((c: CadFile) =>
        c.designerNotes === 'Reference image' || c.designerNotes === 'Customer reference image'
      ));
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'DM Sans, sans-serif', color: '#6b7280' }}>Loading…</div>;
  if (!order) return <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>Order not found.</div>;

  const metal = [order.metalType, order.metalColor].filter(Boolean).join(' ');

  const specRows: { label: string; value?: string | null }[] = [
    { label: 'Order Type',   value: order.orderType },
    { label: 'Size',         value: order.size },
    { label: 'Metal',        value: metal || null },
    { label: 'Stone Type',   value: order.diamondType },
    { label: 'Stone Quality', value: order.diamondQuality },
    { label: 'Stone Shape',  value: order.centerStoneShape },
    { label: 'Carat Weight', value: order.approximateCaratWeight ? `${order.approximateCaratWeight} ct` : null },
  ].filter(r => r.value);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'DM Sans', 'Helvetica Neue', sans-serif; background: #e8e4dc; margin: 0; }
        @media print {
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          .no-print { display: none !important; }
          .brief-wrap { padding: 0 !important; }
          .brief-sheet { box-shadow: none !important; border: none !important; }
          img { break-inside: avoid; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ background: '#0d1b35', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '15px', fontWeight: 700, color: '#c09b58', letterSpacing: '1px' }}>KIRA JEWELS — CAD Brief</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => router.push(`/orders/${id}`)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '7px', padding: '6px 14px', color: 'rgba(255,255,255,0.75)', fontSize: '12px', cursor: 'pointer' }}>
            ← Back
          </button>
          <button onClick={() => window.print()} style={{ background: '#c09b58', border: 'none', borderRadius: '7px', padding: '6px 16px', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>
            🖨 Print Brief
          </button>
        </div>
      </div>

      <div className="brief-wrap" style={{ display: 'flex', justifyContent: 'center', padding: '32px 20px' }}>
        <div className="brief-sheet" style={{
          width: '210mm',
          maxWidth: '100%',
          background: '#fff',
          border: '1px solid #e5e0d8',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: '20px 26px',
          fontFamily: "'DM Sans', sans-serif",
        }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #0d1b35', paddingBottom: '10px', marginBottom: '14px' }}>
            <div>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 700, color: '#0d1b35', letterSpacing: '1px' }}>KIRA JEWELS</div>
              <div style={{ fontSize: '10px', color: '#9ca3af', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '2px' }}>CAD Design Brief</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0d1b35' }}>{order.poNumber}</div>
              {order.refCustomerPo && (
                <div style={{ fontSize: '11px', color: '#6b7280' }}>Customer PO#: {order.refCustomerPo}</div>
              )}
              {order.kiraSkuNumber && (
                <div style={{ fontSize: '11px', color: '#6b7280' }}>SKU: {order.kiraSkuNumber}</div>
              )}
            </div>
          </div>

          {/* Specs */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Specs</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 16px' }}>
              {specRows.map(row => (
                <div key={row.label}>
                  <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{row.label}</div>
                  <div style={{ fontSize: '13px', color: '#0d1b35', fontWeight: 600, marginTop: '2px' }}>{row.value}</div>
                </div>
              ))}
              {specRows.length === 0 && (
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>No specs on file.</div>
              )}
            </div>
          </div>

          {/* Notes */}
          {(order.customerNotes || (order as any).referenceWeblink) && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Notes</div>
              {order.customerNotes && (
                <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.6 }}>{order.customerNotes}</div>
              )}
              {(order as any).referenceWeblink && (
                <div style={{ fontSize: '12px', color: '#78350f', marginTop: order.customerNotes ? '6px' : 0, wordBreak: 'break-all' }}>
                  🔗 {(order as any).referenceWeblink}
                </div>
              )}
            </div>
          )}

          {/* Reference Images */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Reference Images {refs.length > 0 && `(${refs.length})`}
            </div>
            {refs.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>No reference images on file.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                {refs.map(ref => {
                  const url = ref.filePath || `/uploads/cad/${ref.fileName}`;
                  const ext = (ref.originalName.split('.').pop() || '').toLowerCase();
                  const isImage = IMAGE_EXT.includes(ext);
                  return (
                    <div key={ref.id} style={{ border: '1px solid #e5e0d8', borderRadius: '6px', overflow: 'hidden', background: '#f9f8f5', breakInside: 'avoid' }}>
                      {isImage ? (
                        <img src={url} alt={ref.originalName} style={{ width: '100%', height: 'auto', maxHeight: '420px', objectFit: 'contain', display: 'block', background: '#fff' }} />
                      ) : (
                        <div style={{ height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#9ca3af', padding: '8px', textAlign: 'center' }}>
                          📎 {ref.originalName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
