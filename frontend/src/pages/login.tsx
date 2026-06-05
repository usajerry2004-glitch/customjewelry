import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/auth.store';

const API = '/api/proxy';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, hydrate, user } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { hydrate(); }, []);
  useEffect(() => {
    if (user) router.replace(user.role === 'CUSTOMER' ? '/customer/orders' : '/dashboard');
  }, [user]);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setAuth(data.user, data.access_token);
        router.replace(data.user.role === 'CUSTOMER' ? '/customer/orders' : '/dashboard');
      } else {
        const err = await res.json();
        setError(err.message || 'Invalid credentials');
      }
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper" style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-page)' }}>
      {/* Left panel - brand (desktop: side, mobile: top bar) */}
      <div className="login-left-panel" style={{
        width: '420px',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 48px',
        flexShrink: 0,
      }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/logo.png" alt="Kira Jewels" style={{ height: '72px', width: 'auto', display: 'block', margin: '0 auto 10px', objectFit: 'contain' }} />
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '20px' }}>
            Custom Jewelry
          </div>
          <div style={{ width: '40px', height: '1px', background: 'rgba(192,155,88,0.4)', margin: '0 auto 20px' }} />
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: '240px', margin: 0 }}>
            Custom jewelry workflow management — from order to delivery.
          </p>
        </div>
      </div>

      {/* Mobile-only logo bar (hidden on desktop via CSS) */}
      <div className="login-mobile-logo" style={{ display: 'none' }}>
        <img src="/logo.png" alt="Kira Jewels" style={{ height: '48px', width: 'auto', objectFit: 'contain' }} />
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '2.5px', textTransform: 'uppercase', marginTop: '6px' }}>
          Custom Jewelry
        </div>
      </div>

      {/* Right panel - form */}
      <div className="login-right-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ marginBottom: '36px' }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Sign in
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 14px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 14px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
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
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ marginTop: '28px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
            Contact your administrator if you need access or have forgotten your password.
          </p>
        </div>
      </div>
    </div>
  );
}
