import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/auth.store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@kirajewels.one', password: 'admin123', role: 'ADMIN', color: '#6366F1' },
  { label: 'Sales Rep', email: 'sales@kirajewels.one', password: 'sales123', role: 'SALES_REP', color: '#10B981' },
  { label: 'CAD Designer', email: 'cad@kirajewels.one', password: 'cad123', role: 'CAD_DESIGNER', color: '#8B5CF6' },
  { label: 'SKU Manager', email: 'sku@kirajewels.one', password: 'sku123', role: 'SKU_MANAGER', color: '#F59E0B' },
  { label: 'Customer', email: 'customer@example.com', password: 'customer123', role: 'CUSTOMER', color: '#F97316' },
];

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, hydrate, user } = useAuthStore();
  const [email, setEmail] = useState('admin@kirajewels.one');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (user) router.replace(user.role === 'CUSTOMER' ? '/customer/orders' : '/dashboard');
  }, [user]);

  const handleLogin = async (e?: React.FormEvent, overrideEmail?: string, overridePassword?: string) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: overrideEmail || email, password: overridePassword || password }),
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
    <div style={{ minHeight: '100vh', background: '#0B0B10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>💎</div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, background: 'linear-gradient(135deg, #F6D860, #E6A817)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            JewelFlow OS
          </h1>
          <p style={{ fontSize: '13px', color: '#4B5563', marginTop: '6px' }}>Custom Jewelry Workflow Management</p>
        </div>

        {/* Form */}
        <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '16px', padding: '28px' }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '6px', letterSpacing: '0.5px' }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '10px 14px', color: '#E2E8F0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                placeholder="your@email.com"
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '6px', letterSpacing: '0.5px' }}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '10px 14px', color: '#E2E8F0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#EF4444', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Demo accounts */}
        <div style={{ marginTop: '20px', background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px' }}>
          <p style={{ fontSize: '11px', color: '#4B5563', marginBottom: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Quick Access — Demo Accounts</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.email}
                onClick={() => handleLogin(undefined, acc.email, acc.password)}
                style={{
                  background: `${acc.color}15`, border: `1px solid ${acc.color}30`, borderRadius: '8px',
                  padding: '10px 12px', color: acc.color, fontSize: '12px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>{acc.label}</div>
                <div style={{ fontSize: '10px', color: '#4B5563', marginTop: '2px' }}>{acc.email}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
