import React from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../../store/auth.store';

interface CustomerLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const CustomerLayout: React.FC<CustomerLayoutProps> = ({ children, title, subtitle, actions }) => {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Top nav */}
      <div style={{
        background: 'var(--sidebar-bg)',
        padding: '0 36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '1px' }}>
            KIRA JEWELS
          </div>
          <nav style={{ display: 'flex', gap: '4px' }}>
            {[
              { label: 'My Orders', path: '/customer/orders' },
              { label: 'Place Order', path: '/customer/orders/new' },
            ].map(item => {
              const isActive = router.pathname === item.path;
              return (
                <a
                  key={item.path}
                  href={item.path}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    color: isActive ? '#EDD48B' : 'rgba(255,255,255,0.5)',
                    background: isActive ? 'rgba(192,155,88,0.15)' : 'transparent',
                    letterSpacing: '0.2px',
                  }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user && (
            <>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: '#fff',
              }}>
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                {user.firstName} {user.lastName}
              </span>
              <button
                onClick={() => { clearAuth(); router.replace('/login'); }}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px', padding: '5px 12px',
                  color: 'rgba(255,255,255,0.5)', fontSize: '11px', cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>

      {/* Page header */}
      {(title || actions) && (
        <div style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-light)',
          padding: '20px 36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 0 rgba(26,39,64,0.06)',
        }}>
          <div>
            {title && (
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.3px' }}>
                {title}
              </div>
            )}
            {subtitle && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{subtitle}</div>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}

      <div style={{ padding: '32px 36px', maxWidth: '900px', margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
};
