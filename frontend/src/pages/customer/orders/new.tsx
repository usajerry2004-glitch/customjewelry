import React, { useRef, useState } from 'react';
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

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontFamily: 'Cormorant Garamond, Georgia, serif',
    fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)',
    marginBottom: '20px', marginTop: '8px',
    paddingBottom: '10px', borderBottom: '1px solid var(--border)',
  }}>
    {children}
  </div>
);

export default function NewOrderPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    orderType: '', metalType: '', metalColor: '', size: '',
    diamondType: '', diamondQuality: '', centerStoneShape: '',
    approximateCaratWeight: '', customerNotes: '',
  });
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refLink, setRefLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.orderType || !form.metalType || !form.metalColor) {
      setError('Please fill in Order Type, Metal Type, and Metal Color.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`${API}/orders`, {
        method: 'POST',
        body: JSON.stringify({ ...form, manufacturingPath: 'STANDARD', referenceWeblink: refLink || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || 'Failed to place order.');
        setSaving(false);
        return;
      }
      const order = await res.json();

      // Upload all reference files
      if (refFiles.length > 0 && order.id) {
        for (const file of refFiles) {
          try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('designerNotes', 'Reference image');
            await fetch(`${API}/cad/reference/${order.id}`, {
              method: 'POST',
              credentials: 'include',
              body: fd,
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

          <SectionTitle>Jewelry Details</SectionTitle>

          <div style={fieldWrap}>
            <label style={labelStyle}>Order Type *</label>
            <select value={form.orderType} onChange={e => set('orderType', e.target.value)} style={selectStyle}>
              <option value="">Select type…</option>
              {['Engagement Ring','Wedding Band','Necklace','Earrings','Bracelet','Pendant','Brooch','Other'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Metal Type *</label>
              <select value={form.metalType} onChange={e => set('metalType', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {['14K','18K','Platinum','Sterling Silver','10K'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Metal Color *</label>
              <select value={form.metalColor} onChange={e => set('metalColor', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {['Yellow Gold','White Gold','Rose Gold','Platinum','Two-Tone'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Ring Size (if applicable)</label>
            <input value={form.size} onChange={e => set('size', e.target.value)} placeholder="e.g. 6.5" style={inputStyle} />
          </div>

          <SectionTitle>Stone Details</SectionTitle>

          <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Diamond / Stone Type</label>
              <select value={form.diamondType} onChange={e => set('diamondType', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {['Certified Lab Grown Diamond','Non Certified (CVD)','Non Certified (HPHT)'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Quality / Grade</label>
              <select value={form.diamondQuality} onChange={e => set('diamondQuality', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {['VVS1','VVS2','VS1','VS2','SI1','SI2','I1'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Stone Shape</label>
              <select value={form.centerStoneShape} onChange={e => set('centerStoneShape', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {['Round','Oval','Princess','Cushion','Emerald','Pear','Marquise','Radiant','Asscher'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Approx. Carat Weight</label>
              <input value={form.approximateCaratWeight} onChange={e => set('approximateCaratWeight', e.target.value)} placeholder="e.g. 1.25" style={inputStyle} />
            </div>
          </div>

          <SectionTitle>Reference & Notes</SectionTitle>

          {/* Reference Link */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Reference Link (optional)</label>
            <input
              value={refLink}
              onChange={e => setRefLink(e.target.value)}
              placeholder="https://pinterest.com/pin/... or any inspiration URL"
              style={inputStyle}
            />
          </div>

          {/* Reference Photos & Videos — multiple (max 10) */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Reference Photos / Videos (optional) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— max 10</span></label>
            <div
              onClick={() => refFiles.length < 10 && fileRef.current?.click()}
              style={{
                border: `2px dashed ${refFiles.length ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '20px',
                textAlign: 'center',
                cursor: refFiles.length >= 10 ? 'not-allowed' : 'pointer',
                background: refFiles.length ? 'rgba(192,155,88,0.05)' : 'var(--bg-input)',
                opacity: refFiles.length >= 10 ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,.pdf"
                multiple
                style={{ display: 'none' }}
                onChange={e => {
                  const picked = Array.from(e.target.files || []);
                  setRefFiles(prev => {
                    const combined = [...prev, ...picked];
                    return combined.slice(0, 10);
                  });
                  e.target.value = '';
                }}
              />
              <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.5 }}>🖼</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Click to add inspiration photos or videos
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                JPG, PNG, PDF, MP4, MOV — multiple files allowed
              </div>
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
                    <button
                      onClick={() => setRefFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', flexShrink: 0, padding: '2px 6px' }}
                    >✕</button>
                  </div>
                ))}
                {refFiles.length >= 10 && (
                  <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--danger)', padding: '4px 0' }}>
                    Maximum 10 files reached
                  </div>
                )}
                {refFiles.length < 10 && (
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '7px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
                >
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
              placeholder="Any special requests, engraving details, design notes, or additional references…"
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
