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
  const [refImage, setRefImage] = useState<File | null>(null);
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
        body: JSON.stringify({ ...form, manufacturingPath: 'STANDARD' }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || 'Failed to place order.');
        setSaving(false);
        return;
      }
      const order = await res.json();

      // Upload reference image if provided
      if (refImage && order.id) {
        try {
          const token = localStorage.getItem('jf_token');
          const fd = new FormData();
          fd.append('file', refImage);
          fd.append('designerNotes', 'Customer reference image');
          await fetch(`${API}/cad/upload/${order.id}`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: fd,
          });
        } catch {}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Diamond / Stone Type</label>
              <select value={form.diamondType} onChange={e => set('diamondType', e.target.value)} style={selectStyle}>
                <option value="">Select…</option>
                {['Natural Diamond','Lab Grown Diamond','Sapphire','Ruby','Emerald','Moissanite','No Stone'].map(o => <option key={o}>{o}</option>)}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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

          {/* Reference Image Upload */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Reference Image (optional)</label>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${refImage ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: refImage ? 'rgba(192,155,88,0.05)' : 'var(--bg-input)',
                transition: 'all 0.15s',
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={e => setRefImage(e.target.files?.[0] || null)}
              />
              {refImage ? (
                <div>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>📎</div>
                  <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>{refImage.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {(refImage.size / 1024).toFixed(0)} KB · Click to change
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }}>🖼</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Upload inspiration photo or reference
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    JPG, PNG, PDF up to 10MB
                  </div>
                </div>
              )}
            </div>
            {refImage && (
              <button
                onClick={() => setRefImage(null)}
                style={{ marginTop: '6px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: '0' }}
              >
                ✕ Remove image
              </button>
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
