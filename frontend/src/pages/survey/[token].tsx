import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { toast } from '../../utils/toast';

const API = '/api/proxy';

interface SurveyContext {
  poNumber: string;
  orderType: string | null;
  metalType: string | null;
  metalColor: string | null;
  centerStoneShape: string | null;
  diamondQuality: string | null;
  alreadyResponded: boolean;
  isReminder: boolean;
  sentAt: string | null;
  reminderAt: string | null;
}

type Reason = 'WAITING_ON_CUSTOMER' | 'PRICE_ISSUE' | 'NOT_INTERESTED';
type SubReason = 'CUSTOMER_CANCELLED' | 'OTHER';

const OPTIONS: { key: Reason; label: string }[] = [
  { key: 'WAITING_ON_CUSTOMER', label: "I'm still waiting on my own customer to approve" },
  { key: 'PRICE_ISSUE',         label: "There's a price concern" },
  { key: 'NOT_INTERESTED',      label: "I'm no longer interested in moving forward" },
];

const SUB_OPTIONS: { key: SubReason; label: string }[] = [
  { key: 'CUSTOMER_CANCELLED', label: 'My customer cancelled the order' },
  { key: 'OTHER',               label: 'Something else' },
];

function Radio({ active }: { active: boolean }) {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? '#6366F1' : '#D1D5DB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: active ? '#6366F1' : 'transparent' }} />
    </div>
  );
}

export default function SurveyPage() {
  const router = useRouter();
  const { token } = router.query as { token: string };

  const [ctx, setCtx] = useState<SurveyContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Reason | null>(null);
  const [subSelected, setSubSelected] = useState<SubReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/public/survey/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(data => { setCtx(data); setSubmitted(!!data.alreadyResponded); setLoading(false); })
      .catch(() => { setError("We couldn't find this survey. Please check your link or contact us."); setLoading(false); });
  }, [token]);

  const canSubmit = selected === 'NOT_INTERESTED' ? !!subSelected : !!selected;

  const submit = async () => {
    if (!canSubmit || !token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/public/survey/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: selected,
          subReason: selected === 'NOT_INTERESTED' ? subSelected : undefined,
        }),
      });
      if (!res.ok) throw new Error('Submit failed');
      setSubmitted(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isReminder = !!ctx?.isReminder;

  return (
    <>
      <Head>
        <title>{ctx ? `Order ${ctx.poNumber} — Kira Custom Jewelry` : 'Approval Check-In — Kira Custom Jewelry'}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F5F4F0', fontFamily: "'DM Sans', Helvetica, Arial, sans-serif" }}>
        <div style={{ background: '#1A2740', padding: '20px 24px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ color: '#C09B58', fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>KIRA CUSTOM JEWELRY</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>Design Approval Follow-Up</div>
            </div>
            {isReminder && !submitted && (
              <div style={{ background: '#6366F1', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>Reminder</div>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px 64px' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#6B7280' }}>Loading…</div>
          )}

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#DC2626', fontWeight: 600, margin: '0 0 8px' }}>Survey Not Found</p>
              <p style={{ color: '#6B7280', margin: 0, fontSize: 14 }}>{error}</p>
            </div>
          )}

          {ctx && !error && (
            <>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4DC', padding: '24px 28px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Order Reference</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1A2740', marginBottom: 14 }}>{ctx.poNumber}</div>
                <div style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.5 }}>
                  {[ctx.orderType, [ctx.metalType, ctx.metalColor].filter(Boolean).join(' '), ctx.centerStoneShape, ctx.diamondQuality]
                    .filter(Boolean).join(' — ')}
                </div>
                {ctx.sentAt && (
                  <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 10 }}>
                    Sent for your approval on {new Date(ctx.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    {ctx.reminderAt && ` · Reminder sent ${new Date(ctx.reminderAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                  </div>
                )}
              </div>

              {submitted ? (
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '36px 28px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#059669', marginBottom: 8 }}>✓ Thank you — we've let our team know.</div>
                  <div style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
                    Someone from Kira will be in touch shortly. If anything changes in the meantime, just reply to any of our emails.
                  </div>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, border: '2px solid #6366F1', padding: '24px 28px', marginBottom: 20 }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: '#1A2740', margin: '0 0 8px' }}>
                    {isReminder ? 'Following up on your design approval' : 'Still deciding on your design?'}
                  </h2>
                  <p style={{ color: '#4B5563', fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>
                    {isReminder
                      ? "We haven't heard back since our last note on this order — no rush, we just want to make sure nothing's stuck on our end. Let us know what's going on:"
                      : "It's been a few days since we sent your CAD for approval. Let us know what's going on so we can help move things along."}
                  </p>

                  <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>What's the status?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {OPTIONS.map(opt => {
                      const active = selected === opt.key;
                      return (
                        <div
                          key={opt.key}
                          onClick={() => { setSelected(opt.key); setSubSelected(null); }}
                          style={{
                            cursor: 'pointer',
                            border: active ? '1.5px solid #6366F1' : '1.5px solid #E8E4DC',
                            background: active ? 'rgba(99,102,241,0.06)' : '#fff',
                            borderRadius: 10, padding: '14px 16px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <Radio active={active} />
                            <div style={{ fontSize: 14, color: '#1A2740', fontWeight: 500, lineHeight: 1.5 }}>{opt.label}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {selected === 'NOT_INTERESTED' && (
                    <div style={{ marginTop: 14, marginLeft: 24, paddingLeft: 16, borderLeft: '2px solid #E8E4DC' }}>
                      <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Can you tell us a bit more?</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {SUB_OPTIONS.map(sub => {
                          const active = subSelected === sub.key;
                          return (
                            <div
                              key={sub.key}
                              onClick={() => setSubSelected(sub.key)}
                              style={{
                                cursor: 'pointer',
                                border: active ? '1.5px solid #6366F1' : '1.5px solid #E8E4DC',
                                background: active ? 'rgba(99,102,241,0.06)' : '#fff',
                                borderRadius: 10, padding: '14px 16px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <Radio active={active} />
                                <div style={{ fontSize: 13, color: '#1A2740', fontWeight: 500 }}>{sub.label}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 22 }}>
                    <button
                      onClick={submit}
                      disabled={!canSubmit || submitting}
                      style={{
                        background: canSubmit ? '#1A2740' : '#E8E4DC',
                        color: canSubmit ? '#fff' : '#9CA3AF',
                        border: 'none', borderRadius: 8, padding: '12px 28px', fontWeight: 600, fontSize: 14,
                        cursor: canSubmit ? 'pointer' : 'default', opacity: submitting ? 0.7 : 1,
                      }}
                    >
                      {submitting ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, marginTop: 24 }}>
                Questions about your order?{' '}
                <a href="mailto:info@kirajewels.com" style={{ color: '#C09B58', textDecoration: 'none' }}>Contact us</a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
