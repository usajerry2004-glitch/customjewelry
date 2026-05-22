import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../utils/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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
        const res = await fetch(`${API}/notifications/unread-count`);
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
        const res = await fetch(`${API}/notifications`);
        if (res.ok) setNotifs(await res.json());
      } catch {}
    }
    setShowNotifs(v => !v);
  };

  const markAllRead = async () => {
    await fetch(`${API}/notifications/read-all`, { method: 'PATCH' });
    setUnread(0);
    setNotifs(p => p.map(n => ({ ...n, isRead: true })));
  };

  const role = (user?.role as UserRole) || UserRole.ADMIN;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B0B10' }}>
      <Sidebar activeRole={role} activePath={router.pathname} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ background: '#111118', borderBottom: '1px solid #1E1E2E', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            {title && <div style={{ fontFamily: 'Georgia, serif', fontSize: '22px', fontWeight: 600, letterSpacing: '0.5px' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: '12px', color: '#4B5563', marginTop: '2px' }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {actions}

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={openNotifs}
                style={{ background: '#0F0F14', border: '1px solid #1E1E2E', borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
              >
                🔔
                {unread > 0 && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#EF4444', color: '#fff', fontSize: '9px', fontWeight: 700, borderRadius: '99px', padding: '1px 5px', minWidth: '16px', textAlign: 'center' }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div style={{ position: 'absolute', right: 0, top: '44px', width: '320px', background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 100, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #1E1E2E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#CBD5E1' }}>Notifications</span>
                    {unread > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#6366F1', fontSize: '11px', cursor: 'pointer' }}>Mark all read</button>}
                  </div>
                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#4B5563', fontSize: '13px' }}>No notifications</div>
                    ) : notifs.map(n => (
                      <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #0F0F14', background: n.isRead ? 'transparent' : 'rgba(99,102,241,0.06)' }}>
                        <div style={{ fontSize: '12px', fontWeight: n.isRead ? 400 : 700, color: n.isRead ? '#94A3B8' : '#E2E8F0', marginBottom: '2px' }}>{n.title}</div>
                        <div style={{ fontSize: '11px', color: '#4B5563' }}>{n.message}</div>
                        <div style={{ fontSize: '10px', color: '#2D2D3D', marginTop: '4px' }}>{new Date(n.createdAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, #F6D860, #E6A817)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#000' }}>
                  {user.firstName[0]}{user.lastName[0]}
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#CBD5E1' }}>{user.firstName} {user.lastName}</div>
                  <div style={{ fontSize: '9px', color: '#4B5563' }}>{user.role}</div>
                </div>
                <button onClick={() => { clearAuth(); router.replace('/login'); }} style={{ background: 'none', border: '1px solid #2D2D3D', borderRadius: '6px', padding: '4px 8px', color: '#64748B', fontSize: '11px', cursor: 'pointer' }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          {children}
        </div>
      </div>

      {/* Close notif panel on outside click */}
      {showNotifs && <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNotifs(false)} />}
    </div>
  );
};
