import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useAuthStore } from '../store/auth.store';
import { getErrorMessage } from '../utils/apiFetch';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

function parseErrorMessage(err: any, fallback: string): string {
  const msg = err?.message;
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) return msg.join(', ');
  if (msg && typeof msg === 'object') {
    const inner = (msg as any).message;
    return Array.isArray(inner) ? inner.join(', ') : (inner || fallback);
  }
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, hydrate, user } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [otp, setOtp] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [redirectTo, setRedirectTo] = useState('');

  useEffect(() => { hydrate(); }, []);
  useEffect(() => {
    if (user) router.replace(redirectTo || (user.role === 'CUSTOMER' ? '/customer/orders' : '/dashboard'));
  }, [user]);

  // Support email links that prefill the address and jump straight into OTP mode
  useEffect(() => {
    if (!router.isReady) return;
    const { email: qEmail, mode: qMode, redirect: qRedirect } = router.query;
    if (typeof qEmail === 'string') setEmail(qEmail);
    if (qMode === 'otp') setMode('otp');
    if (typeof qRedirect === 'string' && qRedirect.startsWith('/customer/')) setRedirectTo(qRedirect);
  }, [router.isReady]);

  const afterLogin = (data: { user: any; access_token: string }) => {
    setAuth(data.user, data.access_token);
    const target = redirectTo || (data.user.role === 'CUSTOMER' ? '/customer/orders' : '/dashboard');
    router.replace(target);
  };

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        afterLogin(await res.json());
      } else {
        setError(parseErrorMessage(await res.json(), 'Invalid credentials'));
      }
    } catch (err: any) {
      const detail = err?.message ? ` (${err.message})` : '';
      setError(`Cannot connect to server. Make sure the backend is running.${detail}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email) { setOtpMessage('Please enter your email.'); return; }
    setOtpMessage('');
    setOtpLoading(true);
    try {
      const res = await fetch(`${API}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setOtpMessage(getErrorMessage(data, ''));
      if (data.found) setOtpStep('verify');
    } catch (err: any) {
      setOtpMessage('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!otp) { setOtpMessage('Please enter the code from your email.'); return; }
    setOtpMessage('');
    setOtpLoading(true);
    try {
      const res = await fetch(`${API}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, otp }),
      });
      if (res.ok) {
        afterLogin(await res.json());
      } else {
        setOtpMessage(parseErrorMessage(await res.json(), 'Invalid or expired code'));
      }
    } catch (err: any) {
      setOtpMessage('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setOtpLoading(false);
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
          <Image src="/logo.png" alt="Kira Jewels" width={784} height={261} priority style={{ height: '72px', width: 'auto', display: 'block', margin: '0 auto 10px', objectFit: 'contain' }} />
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
        <Image src="/logo.png" alt="Kira Jewels" width={784} height={261} style={{ height: '48px', width: 'auto', objectFit: 'contain' }} />
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
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {mode === 'password' ? 'Enter your credentials to continue' : 'We\'ll email you a one-time code'}
            </p>
          </div>

          {mode === 'password' ? (
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
          ) : (
            <form onSubmit={otpStep === 'request' ? handleRequestOtp : handleVerifyOtp}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  disabled={otpStep === 'verify'}
                  style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 14px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', opacity: otpStep === 'verify' ? 0.6 : 1 }}
                />
              </div>
              {otpStep === 'verify' && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '1px', textTransform: 'uppercase' }}>6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '11px 14px', color: 'var(--text-primary)', fontSize: '18px', letterSpacing: '4px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}
              {otpMessage && (
                <div style={{ background: 'rgba(192,155,88,0.08)', border: '1px solid rgba(192,155,88,0.25)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                  {otpMessage}
                </div>
              )}
              <button
                type="submit"
                disabled={otpLoading}
                style={{ width: '100%', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '13px', fontSize: '14px', fontWeight: 600, cursor: otpLoading ? 'not-allowed' : 'pointer', opacity: otpLoading ? 0.7 : 1, letterSpacing: '0.5px' }}
              >
                {otpStep === 'request'
                  ? (otpLoading ? 'Sending…' : 'Send Code')
                  : (otpLoading ? 'Verifying…' : 'Verify & Sign In')}
              </button>
              {otpStep === 'verify' && (
                <p style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  <span onClick={handleRequestOtp} style={{ color: 'var(--accent-dark)', fontWeight: 500, cursor: 'pointer' }}>Resend code</span>
                </p>
              )}
            </form>
          )}

          <p style={{ marginTop: '28px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
            {mode === 'password' ? (
              <>
                <span
                  onClick={() => router.push('/forgot-password')}
                  style={{ color: 'var(--accent-dark)', textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}
                >
                  Forgot your password?
                </span>
                <br />
                <span
                  onClick={() => { setMode('otp'); setOtpStep('request'); setOtpMessage(''); setError(''); }}
                  style={{ color: 'var(--accent-dark)', textDecoration: 'none', fontWeight: 500, cursor: 'pointer', display: 'inline-block', marginTop: '6px' }}
                >
                  Or log in with an email code instead →
                </span>
              </>
            ) : (
              <span
                onClick={() => { setMode('password'); setOtpMessage(''); setOtpStep('request'); setOtp(''); }}
                style={{ color: 'var(--accent-dark)', textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}
              >
                Use password instead
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
