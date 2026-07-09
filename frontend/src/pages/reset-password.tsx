import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getErrorMessage } from '../utils/apiFetch';

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (router.isReady) {
      const t = router.query.token as string;
      if (t) setToken(t);
    }
  }, [router.isReady, router.query.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!token) { setError('Reset token is missing. Please use the link from your email.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => router.replace('/login'), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(getErrorMessage(data, 'Reset link is invalid or has expired. Please request a new one.'));
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
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
              <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Password Updated</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                Your password has been changed. Redirecting you to sign in…
              </p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Set New Password
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Choose a strong password for your account.
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase' }}>New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase' }}>Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    style={inputStyle}
                  />
                </div>

                {/* Strength hint */}
                {password.length > 0 && (
                  <div style={{ marginBottom: '16px', fontSize: '12px', color: password.length >= 8 ? '#059669' : '#D97706' }}>
                    {password.length < 8 ? `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'} needed` : '✓ Password length OK'}
                  </div>
                )}

                {error && (
                  <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger)', fontSize: '13px', marginBottom: '16px' }}>
                    {error}{' '}
                    {error.includes('expired') && (
                      <a href="/forgot-password" style={{ color: 'var(--danger)', fontWeight: 600 }}>Request a new one →</a>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '13px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, letterSpacing: '0.5px' }}
                >
                  {loading ? 'Saving…' : 'Save New Password'}
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
