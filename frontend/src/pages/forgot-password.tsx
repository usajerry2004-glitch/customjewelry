import React, { useState } from 'react';

const API = '/api/proxy';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '11px 14px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email address.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-page)' }}>
      {/* Left brand panel */}
      <div className="login-left-panel" style={{ width: '420px', background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 48px', flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/logo.png" alt="Kira Jewels" style={{ height: '72px', width: 'auto', display: 'block', margin: '0 auto 10px', objectFit: 'contain' }} />
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '20px' }}>Custom Jewelry</div>
          <div style={{ width: '40px', height: '1px', background: 'rgba(192,155,88,0.4)', margin: '0 auto 20px' }} />
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: '240px', margin: 0 }}>
            Custom jewelry workflow management — from order to delivery.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-right-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📬</div>
              <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Check your email</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '28px' }}>
                If <strong>{email}</strong> is registered, you'll receive a password reset link shortly.
              </p>
              <a href="/login" style={{ fontSize: '13px', color: 'var(--accent-dark)', textDecoration: 'none', fontWeight: 500 }}>
                ← Back to Sign In
              </a>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Forgot Password
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Enter your email and we'll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase' }}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    autoComplete="email"
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger)', fontSize: '13px', marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '13px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, letterSpacing: '0.5px' }}
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>

              <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                <a href="/login" style={{ color: 'var(--accent-dark)', textDecoration: 'none', fontWeight: 500 }}>← Back to Sign In</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
