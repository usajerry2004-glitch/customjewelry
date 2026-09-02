import React, { useRef, useState } from 'react';

// Dedicated intake page for the Limitless Fish LLC referral partnership.
// Every submission routes to their existing account (limitlessfish.ecom@gmail.com)
// — we never create a new customer per submission, and Kira never contacts
// the actual end buyer. The buyer's name/email/phone are collected only so
// Limitless Fish can follow up with their own customer themselves; that info is
// folded into the order's notes, not used as the order's customer identity.
// Posts straight to the existing public web-order endpoint (the same one the
// WordPress plugin uses) — no backend changes needed. One-off page for this
// one partner, not a generalized system. Styled with the portal's own theme
// (same tokens as every other page) rather than a separate visual identity.
// No partner logo provided — always renders the text/icon mark, unlike
// exclusive-custom-designs.tsx which tries an <Image> first.

const PARTNER_ACCOUNT_EMAIL = 'limitlessfish.ecom@gmail.com';
const PARTNER_ACCOUNT_NAME = 'Limitless Fish LLC';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
// Not a real secret — the same key already ships in plaintext in the
// WordPress plugin source that hits this same endpoint.
const API_KEY = process.env.NEXT_PUBLIC_PARTNER_API_KEY || 'KiRa@WebForm#2026!';
const MAX_FILES = 5;

const emptyForm = {
  firstName: '', lastName: '', email: '', phoneNumber: '',
  orderType: '', size: '', metalType: '', metalColor: '',
  diamondType: '', diamondQuality: '', centerStoneShape: '', approximateCaratWeight: '', hasGemstone: 'No',
  referenceWeblink: '', customerNotes: '',
};

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const inp: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '7px',
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontSize: '13.5px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginBottom: '6px',
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
};

export default function LimitlessFishPage() {
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []).slice(0, MAX_FILES);
    setFiles(chosen);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.email.trim()) {
      setError('First name and email are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // The buyer's own contact info is for Limitless Fish's follow-up only —
      // it never becomes the order's customer identity in the portal, just a
      // note on the order so whoever's handling it there knows who to reach.
      const requestedByLines = [
        `Requested by: ${[form.firstName, form.lastName].filter(Boolean).join(' ') || '—'}`,
        form.email && `Email: ${form.email}`,
        form.phoneNumber && `Phone: ${form.phoneNumber}`,
      ].filter(Boolean).join('\n');
      const combinedNotes = [requestedByLines, form.customerNotes.trim()].filter(Boolean).join('\n\n');

      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v && k !== 'customerNotes') fd.append(k, v); });
      if (combinedNotes) fd.set('customerNotes', combinedNotes);
      // Overrides whatever was collected above — every order always belongs
      // to the one existing Limitless Fish LLC account, not a new customer
      // per submission.
      fd.set('firstName', PARTNER_ACCOUNT_NAME);
      fd.delete('lastName');
      fd.set('email', PARTNER_ACCOUNT_EMAIL);
      fd.delete('phoneNumber');
      files.forEach(f => fd.append('files', f));

      const res = await fetch(`${API_BASE}/public/orders`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setOrderRef(data.orderRef);
      } else {
        setError(data?.message || 'Something went wrong submitting your request. Please try again.');
      }
    } catch {
      setError('Network error — please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setForm(emptyForm);
    setFiles([]);
    setOrderRef(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const sectionHead: React.CSSProperties = {
    fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase',
    color: 'var(--text-muted)', marginBottom: '16px', paddingBottom: '8px',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 20px 80px' }}>

        {/* Header band */}
        <div style={{ background: 'var(--navy)', borderRadius: '0 0 16px 16px', padding: '36px 32px 30px', textAlign: 'center', marginBottom: '36px' }}>
          <svg viewBox="0 0 100 100" fill="none" style={{ width: '38px', height: '38px', margin: '0 auto 12px' }}>
            <path d="M50 12 L74 40 L50 88 L26 40 Z" stroke="var(--accent)" strokeWidth={2.2} />
            <path d="M26 40 H74 M38 40 L50 12 M62 40 L50 12" stroke="var(--accent)" strokeWidth={1.4} opacity={0.8} />
            <path d="M14 22 L18 30 L14 38 L10 30 Z" fill="var(--accent)" />
          </svg>
          <h1 style={{ fontSize: '30px', fontWeight: 600, color: 'var(--accent)', margin: 0, fontStyle: 'italic' }}>Limitless Fish</h1>
          <div style={{ fontSize: '10.5px', letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>
            Custom Jewelry Designs
          </div>
        </div>

        {orderRef ? (
          <div style={{ ...card, padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#059669', background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: '99px', padding: '6px 18px', display: 'inline-block', marginBottom: '18px' }}>
              ✓ Request Received
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px' }}>Thank you!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: 1.7, maxWidth: '38ch', margin: '0 auto 22px' }}>
              One of our designers will reach out shortly to discuss your piece.
            </p>
            <div style={{ display: 'inline-block', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 22px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '26px' }}>
              Reference No. {orderRef}
            </div>
            <br />
            <button onClick={reset} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '9px 20px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Submit Another Request
            </button>
          </div>
        ) : (
          <>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: 1.7, maxWidth: '46ch', margin: '0 auto 30px' }}>
              Tell us about the piece you're dreaming up. <b style={{ color: 'var(--text-primary)' }}>Our design team will follow up within 1–2 business days</b> with pricing and next steps.
            </p>

            <form onSubmit={submit} style={{ ...card, padding: '32px' }}>

              <div style={sectionHead}>Your Details</div>
              <div className="lf-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '30px' }}>
                <div><label style={label}>First Name *</label><input required value={form.firstName} onChange={set('firstName')} placeholder="Jordan" style={inp} /></div>
                <div><label style={label}>Last Name</label><input value={form.lastName} onChange={set('lastName')} placeholder="Ellis" style={inp} /></div>
                <div><label style={label}>Email *</label><input required type="email" value={form.email} onChange={set('email')} placeholder="jordan@email.com" style={inp} /></div>
                <div><label style={label}>Phone</label><input type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="(555) 000-1234" style={inp} /></div>
              </div>

              <div style={sectionHead}>The Design</div>
              <div className="lf-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '30px' }}>
                <div>
                  <label style={label}>Item Type</label>
                  <select value={form.orderType} onChange={set('orderType')} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Select…</option>
                    <option>Ring</option><option>Necklace</option><option>Earrings</option><option>Bracelet</option><option>Pendant</option><option>Custom</option>
                  </select>
                </div>
                <div><label style={label}>Size</label><input value={form.size} onChange={set('size')} placeholder="e.g. Ring — 6.5" style={inp} /></div>
                <div>
                  <label style={label}>Metal Type</label>
                  <select value={form.metalType} onChange={set('metalType')} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Select…</option>
                    <option>10K</option><option>14K</option><option>18K</option><option>Platinum</option><option>Silver</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Metal Color</label>
                  <select value={form.metalColor} onChange={set('metalColor')} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Select…</option>
                    <option>Yellow</option><option>White</option><option>Rose</option><option>Two-Tone</option>
                  </select>
                </div>
                <div>
                  <label style={label}>Diamond Type</label>
                  <select value={form.diamondType} onChange={set('diamondType')} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Select…</option>
                    <option>Certified Lab Grown Diamond</option><option>Non Certified (CVD)</option><option>Non Certified (HPHT)</option><option>Natural</option>
                  </select>
                </div>
                <div><label style={label}>Diamond Quality</label><input value={form.diamondQuality} onChange={set('diamondQuality')} placeholder="e.g. F+, VS+" style={inp} /></div>
                <div>
                  <label style={label}>Center Stone Shape</label>
                  <select value={form.centerStoneShape} onChange={set('centerStoneShape')} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Select…</option>
                    <option>Round</option><option>Oval</option><option>Cushion</option><option>Emerald</option><option>Pear</option>
                    <option>Princess</option><option>Marquise</option><option>Asscher</option><option>Heart</option><option>Other</option>
                  </select>
                </div>
                <div><label style={label}>Approx. Carat Weight</label><input value={form.approximateCaratWeight} onChange={set('approximateCaratWeight')} placeholder="e.g. 1.5 ct" style={inp} /></div>
                <div>
                  <label style={label}>Gemstone</label>
                  <select value={form.hasGemstone} onChange={set('hasGemstone')} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div style={sectionHead}>Reference</div>
              <div style={{ marginBottom: '18px' }}>
                <label style={label}>Inspiration Photo{files.length > 0 && ` (${files.length} selected)`}</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed var(--border)', borderRadius: '8px', padding: '18px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-input)' }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🖼 Click to upload — JPG, PNG or PDF (up to {MAX_FILES})</div>
                </div>
                <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={onFilesChosen} />
              </div>
              <div style={{ marginBottom: '18px' }}>
                <label style={label}>Reference Link (optional)</label>
                <input value={form.referenceWeblink} onChange={set('referenceWeblink')} placeholder="https://…" style={inp} />
              </div>
              <div>
                <label style={label}>Anything else we should know?</label>
                <textarea
                  value={form.customerNotes}
                  onChange={set('customerNotes')}
                  placeholder="Describe the vision, occasion, budget range, timeline…"
                  rows={4}
                  style={{ ...inp, resize: 'vertical' }}
                />
              </div>

              {error && (
                <div style={{ marginTop: '20px', background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px' }}>
                  {error}
                </div>
              )}

              <div style={{ marginTop: '32px', textAlign: 'center' }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px',
                    padding: '13px 40px', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.6 : 1, fontFamily: 'inherit', letterSpacing: '0.3px',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit Design Request'}
                </button>
                <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  You'll receive a confirmation email with a reference number.
                </div>
              </div>
            </form>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Design &amp; fulfillment by Kira Custom Jewelry — Limitless Fish LLC's trusted partner
        </div>
      </div>

      <style>{`@media (max-width: 560px) { .lf-grid2 { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
