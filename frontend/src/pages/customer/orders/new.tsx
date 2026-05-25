import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';

const SELECT_FIELD = (label: string, key: string, options: string[], value: string, onChange: (k: string, v: string) => void) => (
  <div key={key} style={{ marginBottom: '18px' }}>
    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</label>
    <select
      value={value}
      onChange={e => onChange(key, e.target.value)}
      style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '10px 14px', color: value ? '#E2E8F0' : '#4B5563', fontSize: '13px', outline: 'none' }}
    >
      <option value="">Select…</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const TEXT_FIELD = (label: string, key: string, placeholder: string, value: string, onChange: (k: string, v: string) => void, type = 'text') => (
  <div key={key} style={{ marginBottom: '18px' }}>
    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(key, e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '10px 14px', color: '#E2E8F0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
    />
  </div>
);

export default function NewOrderPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    orderType: '', metalType: '', metalColor: '', size: '',
    diamondType: '', diamondQuality: '', centerStoneShape: '',
    approximateCaratWeight: '', customerNotes: '',
  });
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
      if (res.ok) {
        router.replace('/customer/orders');
      } else {
        const d = await res.json();
        setError(d.message || 'Failed to place order.');
      }
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CustomerLayout title="Place a New Order" subtitle="Tell us about your custom piece">
      <div style={{ maxWidth: '560px' }}>
        <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '14px', padding: '28px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '20px' }}>Jewelry Details</h3>

          {SELECT_FIELD('Order Type *', 'orderType', ['Engagement Ring', 'Wedding Band', 'Necklace', 'Earrings', 'Bracelet', 'Pendant', 'Brooch', 'Other'], form.orderType, set)}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              {SELECT_FIELD('Metal Type *', 'metalType', ['14K', '18K', 'Platinum', 'Sterling Silver', '10K'], form.metalType, set)}
            </div>
            <div>
              {SELECT_FIELD('Metal Color *', 'metalColor', ['Yellow Gold', 'White Gold', 'Rose Gold', 'Platinum', 'Two-Tone'], form.metalColor, set)}
            </div>
          </div>

          {TEXT_FIELD('Ring Size (if applicable)', 'size', 'e.g. 6.5', form.size, set)}

          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '20px', marginTop: '8px' }}>Stone Details</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              {SELECT_FIELD('Diamond / Stone Type', 'diamondType', ['Natural Diamond', 'Lab Grown Diamond', 'Sapphire', 'Ruby', 'Emerald', 'Moissanite', 'No Stone'], form.diamondType, set)}
            </div>
            <div>
              {SELECT_FIELD('Quality / Grade', 'diamondQuality', ['VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1'], form.diamondQuality, set)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              {SELECT_FIELD('Stone Shape', 'centerStoneShape', ['Round', 'Oval', 'Princess', 'Cushion', 'Emerald', 'Pear', 'Marquise', 'Radiant', 'Asscher'], form.centerStoneShape, set)}
            </div>
            <div>
              {TEXT_FIELD('Approx. Carat Weight', 'approximateCaratWeight', 'e.g. 1.25', form.approximateCaratWeight, set)}
            </div>
          </div>

          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px', marginTop: '8px' }}>Special Instructions</h3>
          <div style={{ marginBottom: '24px' }}>
            <textarea
              value={form.customerNotes}
              onChange={e => set('customerNotes', e.target.value)}
              placeholder="Any special requests, engraving, references, or design notes…"
              rows={4}
              style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '10px 14px', color: '#E2E8F0', fontSize: '13px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#EF4444', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => router.push('/customer/orders')}
              style={{ flex: 1, background: '#1A1A24', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '11px', color: '#94A3B8', cursor: 'pointer', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              style={{ flex: 2, background: 'linear-gradient(135deg, #F6D860, #E6A817)', border: 'none', borderRadius: '8px', padding: '11px', color: '#000', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Placing Order…' : 'Place Order'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '16px', padding: '14px 18px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', fontSize: '12px', color: '#818CF8', lineHeight: 1.6 }}>
          After placing your order, our team will review it and provide a quote. You'll receive CAD designs to approve before manufacturing begins.
        </div>
      </div>
    </CustomerLayout>
  );
}
