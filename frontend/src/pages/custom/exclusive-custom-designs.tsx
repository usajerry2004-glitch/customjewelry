import React, { useRef, useState } from 'react';

export async function getServerSideProps() { return { props: {} }; }

// Dedicated, white-labeled intake page for the Exclusive Custom Designs
// referral partnership — every submission is tagged with their store name so
// it's grouped/searchable in the portal as their orders, same as any other
// storefront customer. Posts straight to the existing public web-order
// endpoint (the same one the WordPress plugin uses) — no backend changes
// needed. One-off page for this one partner, not a generalized system.

const PARTNER_STORE_NAME = 'Exclusive Custom Designs';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
// Not a real secret — the same key already ships in plaintext in the
// WordPress plugin source that hits this same endpoint.
const API_KEY = process.env.NEXT_PUBLIC_PARTNER_API_KEY || 'KiRa@WebForm#2026!';
const MAX_FILES = 5;

const emptyForm = {
  firstName: '', lastName: '', email: '', phoneNumber: '',
  orderType: '', size: '', metalType: '', metalColor: '',
  diamondType: '', diamondQuality: '', centerStoneShape: '', approximateCaratWeight: '',
  referenceWeblink: '', customerNotes: '',
};

export default function ExclusiveCustomDesignsPage() {
  const [logoBroken, setLogoBroken] = useState(false);
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
      const fd = new FormData();
      fd.append('storeName', PARTNER_STORE_NAME);
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
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

  return (
    <>
      <style>{css}</style>
      <div className="ecd-page">
        <div className="ecd-wrap">

          <div className="ecd-brandmark">
            {!logoBroken ? (
              <img
                src="/partners/exclusive-custom-designs-logo.png"
                alt="Exclusive Custom Designs"
                className="ecd-logo-img"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <>
                <div className="ecd-glyph">
                  <svg viewBox="0 0 100 100" fill="none">
                    <path d="M50 12 L74 40 L50 88 L26 40 Z" stroke="#C9A961" strokeWidth={2.2} />
                    <path d="M26 40 H74 M38 40 L50 12 M62 40 L50 12" stroke="#C9A961" strokeWidth={1.4} opacity={0.8} />
                    <path d="M14 22 L18 30 L14 38 L10 30 Z" fill="#E7CE8C" />
                  </svg>
                </div>
                <div className="ecd-word">Exclusive</div>
                <div className="ecd-sub">Custom Jewelry Designs</div>
              </>
            )}
          </div>

          {orderRef ? (
            <div className="ecd-card ecd-confirm">
              <div className="ecd-confirm-glyph">◈</div>
              <h2>Request Received</h2>
              <p>Thank you — one of our designers will reach out shortly to discuss your piece.</p>
              <div className="ecd-ref">Reference No. {orderRef}</div>
              <br />
              <button className="ecd-back" onClick={reset}>← Submit Another Request</button>
            </div>
          ) : (
            <>
              <p className="ecd-lede">
                Tell us about the piece you're dreaming up. <b>Our design team will follow up within 1–2 business days</b> with pricing and next steps.
              </p>

              <hr className="ecd-rule" />

              <form className="ecd-card" onSubmit={submit}>
                <div className="ecd-section">
                  <div className="ecd-section-head">Your Details</div>
                  <div className="ecd-grid2">
                    <div className="ecd-field"><label>First Name<span className="ecd-req">*</span></label><input required value={form.firstName} onChange={set('firstName')} placeholder="Jordan" /></div>
                    <div className="ecd-field"><label>Last Name</label><input value={form.lastName} onChange={set('lastName')} placeholder="Ellis" /></div>
                    <div className="ecd-field"><label>Email<span className="ecd-req">*</span></label><input required type="email" value={form.email} onChange={set('email')} placeholder="jordan@email.com" /></div>
                    <div className="ecd-field"><label>Phone</label><input type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="(555) 000-1234" /></div>
                  </div>
                </div>

                <div className="ecd-section">
                  <div className="ecd-section-head">The Design</div>
                  <div className="ecd-grid2">
                    <div className="ecd-field">
                      <label>Item Type</label>
                      <select value={form.orderType} onChange={set('orderType')}>
                        <option value="">Select…</option>
                        <option>Ring</option><option>Necklace</option><option>Earrings</option><option>Bracelet</option><option>Pendant</option><option>Custom</option>
                      </select>
                    </div>
                    <div className="ecd-field"><label>Size</label><input value={form.size} onChange={set('size')} placeholder="e.g. Ring — 6.5" /></div>
                    <div className="ecd-field">
                      <label>Metal Type</label>
                      <select value={form.metalType} onChange={set('metalType')}>
                        <option value="">Select…</option>
                        <option>10K</option><option>14K</option><option>18K</option><option>Platinum</option><option>Silver</option>
                      </select>
                    </div>
                    <div className="ecd-field">
                      <label>Metal Color</label>
                      <select value={form.metalColor} onChange={set('metalColor')}>
                        <option value="">Select…</option>
                        <option>Yellow</option><option>White</option><option>Rose</option><option>Two-Tone</option>
                      </select>
                    </div>
                    <div className="ecd-field">
                      <label>Diamond Type</label>
                      <select value={form.diamondType} onChange={set('diamondType')}>
                        <option value="">Select…</option>
                        <option>Certified Lab Grown Diamond</option><option>Non Certified (CVD)</option><option>Non Certified (HPHT)</option>
                      </select>
                    </div>
                    <div className="ecd-field"><label>Diamond Quality</label><input value={form.diamondQuality} onChange={set('diamondQuality')} placeholder="e.g. F+, VS+" /></div>
                    <div className="ecd-field">
                      <label>Center Stone Shape</label>
                      <select value={form.centerStoneShape} onChange={set('centerStoneShape')}>
                        <option value="">Select…</option>
                        <option>Round</option><option>Oval</option><option>Cushion</option><option>Emerald</option><option>Pear</option>
                        <option>Princess</option><option>Marquise</option><option>Asscher</option><option>Heart</option><option>Other</option>
                      </select>
                    </div>
                    <div className="ecd-field"><label>Approx. Carat Weight</label><input value={form.approximateCaratWeight} onChange={set('approximateCaratWeight')} placeholder="e.g. 1.5 ct" /></div>
                  </div>
                </div>

                <div className="ecd-section">
                  <div className="ecd-section-head">Reference</div>
                  <div className="ecd-field">
                    <label>Inspiration Photo{files.length > 0 && ` (${files.length} selected)`}</label>
                    <div className="ecd-upload" onClick={() => fileRef.current?.click()}>
                      <div className="ecd-upload-icon">◇</div>
                      <div className="ecd-upload-txt">Click to upload — JPG, PNG or PDF (up to {MAX_FILES})</div>
                    </div>
                    <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={onFilesChosen} />
                  </div>
                  <div className="ecd-field"><label>Reference Link (optional)</label><input value={form.referenceWeblink} onChange={set('referenceWeblink')} placeholder="https://…" /></div>
                  <div className="ecd-field">
                    <label>Anything else we should know?</label>
                    <textarea value={form.customerNotes} onChange={set('customerNotes')} placeholder="Describe the vision, occasion, budget range, timeline…" />
                  </div>
                </div>

                {error && <div className="ecd-error">{error}</div>}

                <div className="ecd-submit-row">
                  <button type="submit" className="ecd-submit-btn" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Design Request'}
                  </button>
                  <div className="ecd-fine-print">You'll receive a confirmation email with a reference number.</div>
                </div>
              </form>
            </>
          )}

          <div className="ecd-footer">Design &amp; fulfillment by Kira Custom Jewelry — Exclusive Custom Designs' trusted partner</div>
        </div>
      </div>
    </>
  );
}

const css = `
  .ecd-page {
    min-height: 100vh;
    background: radial-gradient(ellipse 900px 500px at 50% -5%, rgba(201,169,97,0.16), transparent 60%), #0B0B0C;
    color: #F3EFE6;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .ecd-page h2 { font-family: Georgia, 'Times New Roman', serif; margin: 0; }
  .ecd-wrap { max-width: 620px; margin: 0 auto; padding: 64px 20px 80px; }

  .ecd-brandmark { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 8px; }
  .ecd-logo-img { max-width: 320px; width: 100%; height: auto; }
  .ecd-glyph { width: 46px; height: 46px; margin-bottom: 18px; }
  .ecd-glyph svg { width: 100%; height: 100%; }
  .ecd-word { font-family: Georgia, 'Times New Roman', serif; font-size: 34px; font-weight: 400; letter-spacing: 0.5px; color: #E7CE8C; font-style: italic; }
  .ecd-sub { font-size: 10.5px; letter-spacing: 3px; text-transform: uppercase; color: #A69C8B; margin-top: 6px; }

  .ecd-lede { text-align: center; max-width: 46ch; margin: 30px auto 42px; color: #A69C8B; font-size: 14px; line-height: 1.7; }
  .ecd-lede b { color: #F3EFE6; font-weight: 600; }
  .ecd-rule { border: none; border-top: 1px solid rgba(201,169,97,0.22); margin: 0 0 36px; }

  .ecd-card { background: #16151A; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 40px 40px 36px; box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35); }
  .ecd-section-head { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #C9A961; margin: 0 0 20px; display: flex; align-items: center; gap: 12px; }
  .ecd-section-head::after { content: ''; flex: 1; height: 1px; background: rgba(201,169,97,0.22); }
  .ecd-section + .ecd-section { margin-top: 34px; }

  .ecd-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .ecd-field { margin-bottom: 20px; }
  .ecd-field:last-child { margin-bottom: 0; }
  .ecd-field label { display: block; font-size: 11px; color: #A69C8B; margin-bottom: 8px; letter-spacing: 0.6px; text-transform: uppercase; }
  .ecd-req { color: #C9A961; margin-left: 3px; }
  .ecd-field input, .ecd-field select, .ecd-field textarea {
    width: 100%; background: #1D1B20; border: 1px solid rgba(255,255,255,0.08); border-radius: 3px;
    padding: 11px 13px; color: #F3EFE6; font-size: 13.5px; outline: none; font-family: inherit; box-sizing: border-box;
  }
  .ecd-field input::placeholder, .ecd-field textarea::placeholder { color: #6E675C; }
  .ecd-field input:focus, .ecd-field select:focus, .ecd-field textarea:focus { border-color: #C9A961; }
  .ecd-field select { cursor: pointer; }
  .ecd-field textarea { resize: vertical; min-height: 84px; }

  .ecd-upload { border: 1px dashed rgba(201,169,97,0.22); border-radius: 3px; padding: 22px; text-align: center; cursor: pointer; }
  .ecd-upload:hover { border-color: #C9A961; }
  .ecd-upload-icon { font-size: 20px; color: #C9A961; margin-bottom: 6px; }
  .ecd-upload-txt { font-size: 12px; color: #A69C8B; }

  .ecd-error { margin-top: 18px; background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.35); color: #FCA5A5; border-radius: 4px; padding: 10px 14px; font-size: 12.5px; }

  .ecd-submit-row { margin-top: 38px; text-align: center; }
  .ecd-submit-btn { background: linear-gradient(180deg, #E7CE8C, #C9A961); color: #1A1305; border: none; border-radius: 3px; padding: 15px 46px; font-size: 12.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; font-family: inherit; }
  .ecd-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .ecd-fine-print { margin-top: 16px; font-size: 11px; color: #6E675C; }

  .ecd-confirm { text-align: center; padding: 46px 30px; }
  .ecd-confirm-glyph { font-size: 30px; color: #C9A961; margin-bottom: 18px; }
  .ecd-confirm p { color: #A69C8B; font-size: 13.5px; line-height: 1.7; max-width: 40ch; margin: 0 auto 22px; }
  .ecd-ref { display: inline-block; border: 1px solid rgba(201,169,97,0.22); border-radius: 3px; padding: 10px 22px; font-size: 13px; color: #E7CE8C; letter-spacing: 1px; margin-bottom: 26px; }
  .ecd-back { background: none; border: 1px solid rgba(201,169,97,0.22); color: #A69C8B; padding: 10px 22px; border-radius: 3px; font-size: 12px; cursor: pointer; font-family: inherit; }

  .ecd-footer { text-align: center; margin-top: 40px; font-size: 10.5px; color: #6E675C; letter-spacing: 0.4px; }

  @media (max-width: 560px) {
    .ecd-grid2 { grid-template-columns: 1fr; }
    .ecd-card { padding: 30px 22px; }
  }
`;
