import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { toast } from '../../utils/toast';

const API = '/api/proxy';

interface FeedbackContext {
  poNumber: string;
  orderType: string | null;
  alreadyResponded: boolean;
  experienceRating: number | null;
  priceRating: number | null;
  qualityRating: number | null;
  comments: string | null;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill={filled ? '#C09B58' : 'none'} stroke="#C09B58" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 2.5l2.9 6.13 6.6.75-4.9 4.62 1.28 6.6L12 17.35l-5.88 3.25 1.28-6.6-4.9-4.62 6.6-.75L12 2.5z" />
    </svg>
  );
}

function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: '#1A2740', fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', lineHeight: 0 }}
          >
            <StarIcon filled={n <= (hover || value)} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const router = useRouter();
  const { token } = router.query as { token: string };

  const [ctx, setCtx] = useState<FeedbackContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [experience, setExperience] = useState(0);
  const [price, setPrice] = useState(0);
  const [quality, setQuality] = useState(0);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/public/feedback/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(data => {
        setCtx(data);
        setSubmitted(!!data.alreadyResponded);
        if (data.alreadyResponded) {
          setExperience(data.experienceRating || 0);
          setPrice(data.priceRating || 0);
          setQuality(data.qualityRating || 0);
          setComments(data.comments || '');
        }
        setLoading(false);
      })
      .catch(() => { setError("We couldn't find this feedback request. Please check your link or contact us."); setLoading(false); });
  }, [token]);

  const canSubmit = experience > 0 && price > 0 && quality > 0;

  const submit = async () => {
    if (!canSubmit || !token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/public/feedback/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experienceRating: experience,
          priceRating: price,
          qualityRating: quality,
          comments: comments.trim(),
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

  return (
    <>
      <Head>
        <title>{ctx ? `Feedback — Order ${ctx.poNumber} — Kira Custom Jewelry` : 'Feedback — Kira Custom Jewelry'}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F5F4F0', fontFamily: "'DM Sans', Helvetica, Arial, sans-serif" }}>
        <div style={{ background: '#1A2740', padding: '20px 24px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div style={{ color: '#C09B58', fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>KIRA CUSTOM JEWELRY</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>Feedback Survey</div>
          </div>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px 64px' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#6B7280' }}>Loading…</div>
          )}

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#DC2626', fontWeight: 600, margin: '0 0 8px' }}>Feedback Request Not Found</p>
              <p style={{ color: '#6B7280', margin: 0, fontSize: 14 }}>{error}</p>
            </div>
          )}

          {ctx && !error && (
            <>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E8E4DC', padding: '24px 28px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Order Reference</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1A2740', marginBottom: 4 }}>{ctx.poNumber}</div>
                {ctx.orderType && <div style={{ fontSize: 14, color: '#4B5563' }}>{ctx.orderType}</div>}
              </div>

              {submitted ? (
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '36px 28px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#059669', marginBottom: 8 }}>✓ Thank you for your feedback!</div>
                  <div style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
                    We really appreciate you taking the time to share this with us.
                  </div>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, border: '2px solid #C09B58', padding: '24px 28px', marginBottom: 20 }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 700, color: '#1A2740', margin: '0 0 8px' }}>
                    How did we do?
                  </h2>
                  <p style={{ color: '#4B5563', fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>
                    Now that your order is complete, we'd love to hear your thoughts.
                  </p>

                  <StarRow label="Overall experience" value={experience} onChange={setExperience} />
                  <StarRow label="Price" value={price} onChange={setPrice} />
                  <StarRow label="Quality" value={quality} onChange={setQuality} />

                  <div style={{ marginTop: 4, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, color: '#1A2740', fontWeight: 600, marginBottom: 8 }}>How can we improve? <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional)</span></div>
                    <textarea
                      value={comments}
                      onChange={e => setComments(e.target.value)}
                      placeholder="Anything we could have done better?"
                      rows={4}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #E8E4DC', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1A2740' }}
                    />
                  </div>

                  <div style={{ marginTop: 18 }}>
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
                      {submitting ? 'Submitting…' : 'Submit Feedback'}
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
