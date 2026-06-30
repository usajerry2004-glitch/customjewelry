import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: 'var(--text-muted)',
  marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 500,
};
const fieldWrap: React.CSSProperties = { marginBottom: '18px' };
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '10px 14px',
  color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle };
const readonlyStyle: React.CSSProperties = { ...inputStyle, background: 'var(--bg-input)', opacity: 0.75, cursor: 'default' };

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontFamily: 'Cormorant Garamond, Georgia, serif',
    fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)',
    marginBottom: '20px', marginTop: '8px',
    paddingBottom: '10px', borderBottom: '1px solid var(--border)',
    letterSpacing: '1px', textTransform: 'uppercase',
  }}>
    {children}
  </div>
);

const ORDER_TYPES = ['Earring', 'Ring', 'Pendant', 'Bracelet', 'Other'];

const RING_SIZES = ['4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12'];
const PENDANT_SIZES = ['16 inches', '16 +1 extender', '16 +2 extender', '18 inches'];
const BRACELET_SIZES = ['5 inches', '5.5 inches', '6 inches', '6.5 inches', '7 inches', '7.5 inches', '8 inches', '8.5 inches'];
const METAL_TYPES = ['10K', '14K', '18K', 'Platinum'];
const DIAMOND_TYPES = ['Lab grown', 'Gemstone lab grown'];
const DIAMOND_QUALITY = ['F+VS+', 'F+VVS+'];

function getAutoSize(orderType: string): string {
  if (orderType === 'Earring') return 'Earring';
  if (orderType === 'Other') return 'See in comment';
  return '';
}

function getSizeOptions(orderType: string): string[] | null {
  if (orderType === 'Ring') return RING_SIZES;
  if (orderType === 'Pendant') return PENDANT_SIZES;
  if (orderType === 'Bracelet') return BRACELET_SIZES;
  return null;
}

export default function NewOrderPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    orderType: '', metalType: '', metalColor: '', size: '',
    diamondType: '', diamondQuality: '', customerNotes: '',
  });
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refLink, setRefLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Customer contact info (pre-filled from account)
  const [contactInfo, setContactInfo] = useState({
    firstName: '', lastName: '', storeName: '', email: '',
  });
  const [contactLoaded, setContactLoaded] = useState(false);

  useEffect(() => {
    // Pre-fill from localStorage first
    try {
      const raw = localStorage.getItem('jf_user');
      if (raw) {
        const u = JSON.parse(raw);
        setContactInfo(p => ({ ...p, firstName: u.firstName || '', lastName: u.lastName || '', email: u.email || '' }));
      }
    } catch {}
    // Fetch full profile for storeName
    apiFetch(`${API}/auth/me`)
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (u) {
          setContactInfo({ firstName: u.firstName || '', lastName: u.lastName || '', storeName: u.storeName || '', email: u.email || '' });
        }
        setContactLoaded(true);
      })
      .catch(() => setContactLoaded(true));
  }, []);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleOrderTypeChange = (val: string) => {
    const auto = getAutoSize(val);
    setForm(p => ({ ...p, orderType: val, size: auto }));
  };

  const sizeOptions = getSizeOptions(form.orderType);
  const isAutoSize = form.orderType === 'Earring' || form.orderType === 'Other';

  const submit = async () => {
    if (!form.orderType) { setError('Please select an Order Type.'); return; }
    if (!form.metalType) { setError('Please select a Metal Type.'); return; }
    if (!form.size) { setError('Please select a Size.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`${API}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          manufacturingPath: 'STANDARD',
          referenceWeblink: refLink || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || 'Failed to place order.');
        setSaving(false);
        return;
      }
      const order = await res.json();

      if (refFiles.length > 0 && order.id) {
        for (const file of refFiles) {
          try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('designerNotes', 'Reference image');
            await fetch(`${API}/cad/reference/${order.id}`, {
              method: 'POST', credentials: 'include', body: fd,
            });
          } catch {}
        }
      }

      router.replace('/customer/orders');
    } catch {
      setError('Cannot connect to server.');
      setSaving(false);
    }
  };

  return (
    <CustomerLayout title="Place a New Order" subtitle="Tell us about your custom piece">
      <div style={{ maxWidth: '580px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px', boxShadow: 'var(--shadow-sm)' }}>

          {/* Contact Information (pre-filled from account) */}
          <SectionTitle>Contact Information</SectionTitle>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>First Name</label>
              <input value={contactLoaded ? contactInfo.firstName : '…'} readOnly style={readonlyStyle} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Last Name</label>
              <input value={contactLoaded ? contactInfo.lastName : '…'} readOnly style={readonlyStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Company Name</label>
              <input value={contactLoaded ? (contactInfo.storeName || '—') : '…'} readOnly style={readonlyStyle} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Email</label>
              <input value={contactLoaded ? contactInfo.email : '…'} readOnly style={readonlyStyle} />
            </div>
          </div>
          <div style={{ marginBottom: '24px', fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(192,155,88,0.06)', borderRadius: '6px', padding: '8px 12px' }}>
            Contact details are pulled from your account. To update them, visit your Profile settings.
          </div>

          {/* Jewelry Details */}
          <SectionTitle>Jewelry Details</SectionTitle>

          {/* Order Type */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Order Type *</label>
            <select value={form.orderType} onChange={e => handleOrderTypeChange(e.target.value)} style={selectStyle}>
              <option value="">Select type…</option>
              {ORDER_TYPES.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          {/* Size — compulsory, dynamic based on order type */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Size *</label>
            {!form.orderType ? (
              <input value="" disabled placeholder="Select an order type first" style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} />
            ) : isAutoSize ? (
              <input value={form.size} readOnly style={readonlyStyle} />
            ) : (
              <select value={form.size} onChange={e => set('size', e.target.value)} style={selectStyle}>
                <option value="">Select size…</option>
                {sizeOptions!.map(s => <option key={s}>{s}</option>)}
              </select>
            )}
            {form.orderType === 'Other' && (
              <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Please describe the size/length in the Special Instructions below.
              </div>
            )}
          </div>

          {/* Metal Type + Metal Color */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Metal Type *</label>
              <select value={form.metalType} onChange={e => set('metalType', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {METAL_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Metal Color</label>
              <select value={form.metalColor} onChange={e => set('metalColor', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {['Yellow Gold', 'White Gold', 'Rose Gold', 'Platinum', 'Two-Tone'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Diamond / Stone Details */}
          <SectionTitle>Stone Details</SectionTitle>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Diamond Type</label>
              <select value={form.diamondType} onChange={e => set('diamondType', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {DIAMOND_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Diamond Quality</label>
              <select value={form.diamondQuality} onChange={e => set('diamondQuality', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {DIAMOND_QUALITY.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Reference & Notes */}
          <SectionTitle>Reference & Notes</SectionTitle>

          <div style={fieldWrap}>
            <label style={labelStyle}>Reference Link (optional)</label>
            <input
              value={refLink}
              onChange={e => setRefLink(e.target.value)}
              placeholder="https://pinterest.com/pin/... or any inspiration URL"
              style={inputStyle}
            />
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Reference Photos / Videos (optional) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— max 10</span></label>
            <div
              onClick={() => refFiles.length < 10 && fileRef.current?.click()}
              style={{
                border: `2px dashed ${refFiles.length ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center',
                cursor: refFiles.length >= 10 ? 'not-allowed' : 'pointer',
                background: refFiles.length ? 'rgba(192,155,88,0.05)' : 'var(--bg-input)',
                opacity: refFiles.length >= 10 ? 0.6 : 1, transition: 'all 0.15s',
              }}
            >
              <input
                ref={fileRef} type="file" accept="image/*,video/*,.pdf" multiple style={{ display: 'none' }}
                onChange={e => {
                  const picked = Array.from(e.target.files || []);
                  setRefFiles(prev => [...prev, ...picked].slice(0, 10));
                  e.target.value = '';
                }}
              />
              <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.5 }}>🖼</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Click to add inspiration photos or videos</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>JPG, PNG, PDF, MP4, MOV — multiple files allowed</div>
            </div>
            {refFiles.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {refFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '16px', flexShrink: 0 }}>{f.type.startsWith('video') ? '🎬' : '🖼'}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(f.size / 1024).toFixed(0)} KB</div>
                      </div>
                    </div>
                    <button onClick={() => setRefFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', flexShrink: 0, padding: '2px 6px' }}>✕</button>
                  </div>
                ))}
                {refFiles.length >= 10 && (
                  <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--danger)', padding: '4px 0' }}>Maximum 10 files reached</div>
                )}
                {refFiles.length < 10 && (
                  <button onClick={() => fileRef.current?.click()}
                    style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '7px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>
                    + Add more files
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Special Instructions</label>
            <textarea
              value={form.customerNotes}
              onChange={e => set('customerNotes', e.target.value)}
              placeholder="Any special requests, engraving details, design notes, size details for Other, or additional references…"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger)', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={() => router.push('/customer/orders')}
              style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              style={{ flex: 2, background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '12px', color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: saving ? 0.7 : 1, letterSpacing: '0.3px' }}
            >
              {saving ? 'Placing Order…' : 'Place Order'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '16px', padding: '14px 18px', background: 'rgba(192,155,88,0.08)', border: '1px solid rgba(192,155,88,0.2)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--accent-dark)', lineHeight: 1.7 }}>
          After placing your order, our team will review it and provide a quote. You'll receive CAD designs to approve before manufacturing begins.
        </div>
      </div>
    </CustomerLayout>
  );
}
