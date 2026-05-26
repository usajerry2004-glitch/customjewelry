import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/auth.store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const DEMO_ACCOUNTS = [
  { label: 'Admin',            email: 'admin@kirajewels.one',      password: 'admin123',    color: '#1A2740' },
  { label: 'Sales Rep',        email: 'sales@kirajewels.one',      password: 'sales123',    color: '#059669' },
  { label: 'Authorizer',       email: 'authorizer@kirajewels.one', password: 'auth123',     color: '#7C3AED' },
  { label: 'CAD Designer',     email: 'cad@kirajewels.one',        password: 'cad123',      color: '#2563EB' },
  { label: 'SKU Manager',      email: 'sku@kirajewels.one',        password: 'sku123',      color: '#C09B58' },
  { label: 'Factory Manager',  email: 'factory@kirajewels.one',    password: 'factory123',  color: '#DC6828' },
  { label: 'Shipping Manager', email: 'shipping@kirajewels.one',   password: 'shipping123', color: '#0891B2' },
  { label: 'Customer',         email: 'customer@example.com',      password: 'customer123', color: '#9D4EDD' },
];

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, hydrate, user } = useAuthStore();
  const [email, setEmail] = useState('admin@kirajewels.one');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { hydrate(); }, []);
  useEffect(() => {
    if (user) router.replace(user.role === 'CUSTOMER' ? '/customer/orders' : '/dashboard');
  }, [user]);

  const handleLogin = async (e?: React.FormEvent, overEmail?: string, overPass?: string) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: overEmail || email, password: overPass || password }),
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
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-page)' }}>
      {/* Left panel - brand */}
      <div style={{
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
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '36px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '2px', marginBottom: '8px' }}>
            KIRA JEWELS
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '48px' }}>
            Flow OS
          </div>
          <div style={{ width: '48px', height: '1px', background: 'rgba(192,155,88,0.4)', margin: '0 auto 48px' }} />
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.8, maxWidth: '260px' }}>
            Custom jewelry workflow management — from order to delivery.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
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

          {/* Demo accounts */}
          <div style={{ marginTop: '36px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px', textAlign: 'center' }}>
              Quick Access
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => handleLogin(undefined, acc.email, acc.password)}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '8px', padding: '10px 12px',
                    color: 'var(--text-primary)', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s',
                    borderLeft: `3px solid ${acc.color}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = acc.color)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ color: acc.color }}>{acc.label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{acc.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
