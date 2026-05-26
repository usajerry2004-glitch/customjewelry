import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

interface Notification { id: string; title: string; message: string; isRead: boolean; createdAt: string; type: string; }

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, title, subtitle, actions }) => {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`${API}/notifications/unread-count`);
        if (res.ok) { const d = await res.json(); setUnread(d.count); }
      } catch {}
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const openNotifs = async () => {
    if (!showNotifs) {
      try {
        const res = await apiFetch(`${API}/notifications`);
        if (res.ok) setNotifs(await res.json());
      } catch {}
    }
    setShowNotifs(v => !v);
  };

  const markAllRead = async () => {
    await apiFetch(`${API}/notifications/read-all`, { method: 'PATCH' });
    setUnread(0);
    setNotifs(p => p.map(n => ({ ...n, isRead: true })));
  };

  const role = (user?.role as UserRole) || UserRole.ADMIN;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Sidebar activeRole={role} activePath={router.pathname} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Topbar */}
        <div style={{
          background: 'var(--topbar-bg)',
          borderBottom: '1px solid var(--border-light)',
          padding: '0 28px',
          height: '62px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxShadow: '0 1px 0 rgba(26,39,64,0.06)',
        }}>
          <div>
            {title && (
              <div style={{
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '24px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '0.3px',
                lineHeight: 1,
              }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', letterSpacing: '0.2px' }}>
                {subtitle}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {actions}

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={openNotifs}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  color: 'var(--text-secondary)',
                }}
              >
                🔔
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    background: '#DC2626', color: '#fff', fontSize: '9px', fontWeight: 700,
                    borderRadius: '99px', padding: '1px 5px', minWidth: '16px', textAlign: 'center',
                  }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div style={{
                  position: 'absolute', right: 0, top: '44px', width: '320px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 100, overflow: 'hidden',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</span>
                    {unread > 0 && (
                      <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No notifications</div>
                    ) : notifs.map(n => (
                      <div key={n.id} style={{
                        padding: '12px 16px', borderBottom: '1px solid var(--border-light)',
                        background: n.isRead ? 'transparent' : 'rgba(192,155,88,0.05)',
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: n.isRead ? 400 : 600, color: n.isRead ? 'var(--text-secondary)' : 'var(--text-primary)', marginBottom: '2px' }}>
                          {n.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.message}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', opacity: 0.7 }}>
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700, color: '#fff',
                }}>
                  {user.firstName[0]}{user.lastName[0]}
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.firstName} {user.lastName}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{user.role}</div>
                </div>
                <button
                  onClick={() => { clearAuth(); router.replace('/login'); }}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
                    padding: '5px 10px', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer',
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          {children}
        </div>
      </div>

      {showNotifs && <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNotifs(false)} />}
    </div>
  );
};
