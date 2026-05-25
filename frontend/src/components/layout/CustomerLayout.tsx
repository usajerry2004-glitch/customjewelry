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
    <div style={{ minHeight: '100vh', background: '#0B0B10', color: '#E2E8F0' }}>
      {/* Top nav */}
      <div style={{ background: '#111118', borderBottom: '1px solid #1E1E2E', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, background: 'linear-gradient(135deg, #F6D860, #E6A817)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            💎 JewelFlow
          </div>
          <nav style={{ display: 'flex', gap: '4px' }}>
            {[
              { label: 'My Orders', path: '/customer/orders' },
              { label: 'Place Order', path: '/customer/orders/new' },
            ].map(item => (
              <a
                key={item.path}
                href={item.path}
                style={{
                  padding: '6px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
                  textDecoration: 'none', color: router.pathname === item.path ? '#F6D860' : '#64748B',
                  background: router.pathname === item.path ? 'rgba(246,216,96,0.1)' : 'transparent',
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user && (
            <>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #F97316, #EA580C)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff' }}>
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <span style={{ fontSize: '12px', color: '#CBD5E1' }}>{user.firstName} {user.lastName}</span>
              <button
                onClick={() => { clearAuth(); router.replace('/login'); }}
                style={{ background: 'none', border: '1px solid #2D2D3D', borderRadius: '6px', padding: '4px 10px', color: '#64748B', fontSize: '11px', cursor: 'pointer' }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>

      {/* Page header */}
      {(title || actions) && (
        <div style={{ background: '#111118', borderBottom: '1px solid #1E1E2E', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {title && <div style={{ fontSize: '20px', fontWeight: 700 }}>{title}</div>}
            {subtitle && <div style={{ fontSize: '12px', color: '#4B5563', marginTop: '2px' }}>{subtitle}</div>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}

      <div style={{ padding: '28px', maxWidth: '900px', margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
};
