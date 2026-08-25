import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../utils/types';
import { apiFetch, API } from '../../utils/apiFetch';

interface Notification { id: string; title: string; message: string; isRead: boolean; createdAt: string; type: string; orderId?: string; isPriority?: boolean; }

interface SearchOrder { id: string; poNumber: string; storeName?: string; customerFullName?: string; status: string; }
interface SearchCustomer { id: string; firstName: string; lastName: string; email: string; storeName: string | null; }
interface SearchCompany { id: string; name: string; }
interface SearchMessage { id: string; orderId: string; content: string; authorName: string; createdAt: string; poNumber: string | null; storeName: string | null; }
interface SearchResults { orders: SearchOrder[]; customers: SearchCustomer[]; companies: SearchCompany[]; messages: SearchMessage[]; }

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, title, subtitle, actions, onBack, backLabel = 'Back' }) => {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [prefs, setPrefs] = useState<{ emailNotificationsEnabled: boolean; notifyPriorityOnly: boolean; mutedOrderIds: string[] } | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [globalQuery, setGlobalQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = globalQuery.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API}/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [globalQuery]);

  const goToOrder = (o: SearchOrder) => {
    setSearchOpen(false);
    setGlobalQuery('');
    router.push(`/orders/${o.id}`);
  };
  const goToCustomer = (c: SearchCustomer) => {
    setSearchOpen(false);
    setGlobalQuery('');
    router.push(`/customers?q=${encodeURIComponent(c.email)}`);
  };
  const goToCompany = (c: SearchCompany) => {
    setSearchOpen(false);
    setGlobalQuery('');
    router.push(`/customers?q=${encodeURIComponent(c.name)}`);
  };
  const goToMessage = (m: SearchMessage) => {
    setSearchOpen(false);
    setGlobalQuery('');
    router.push(`/orders/${m.orderId}`);
  };

  const hasResults = !!searchResults && (searchResults.orders.length + searchResults.customers.length + searchResults.companies.length + searchResults.messages.length > 0);

  // Shared between the desktop inline search box and the mobile full-width
  // overlay — same results, just anchored differently by the caller.
  const renderSearchDropdown = () => (
    <div style={{
      width: '100%',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
      maxHeight: '420px', overflowY: 'auto',
    }}>
      {searching && !searchResults ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Searching…</div>
      ) : !hasResults ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No results found</div>
      ) : (
        <>
          {searchResults!.orders.length > 0 && (
            <div>
              <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Orders</div>
              {searchResults!.orders.map(o => (
                <div key={o.id} onClick={() => goToOrder(o)}
                  style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(192,155,88,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.poNumber}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.customerFullName || o.storeName || '—'}
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{o.status.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          )}
          {searchResults!.customers.length > 0 && (
            <div>
              <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customers</div>
              {searchResults!.customers.map(c => (
                <div key={c.id} onClick={() => goToCustomer(c)}
                  style={{ padding: '9px 14px', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(192,155,88,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.storeName || `${c.firstName} ${c.lastName}`}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.email}</div>
                </div>
              ))}
            </div>
          )}
          {searchResults!.companies.length > 0 && (
            <div>
              <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Companies</div>
              {searchResults!.companies.map(c => (
                <div key={c.id} onClick={() => goToCompany(c)}
                  style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(192,155,88,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {c.name}
                </div>
              ))}
            </div>
          )}
          {searchResults!.messages.length > 0 && (
            <div>
              <div style={{ padding: '10px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Messages</div>
              {searchResults!.messages.map(m => (
                <div key={m.id} onClick={() => goToMessage(m)}
                  style={{ padding: '9px 14px', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(192,155,88,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span>{m.authorName}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>{m.poNumber || ''}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`${API}/notifications/unread-count`);
        if (res.ok) { const d = await res.json(); setUnread(d.count); }
      } catch {}
    };
    load();
    const t = setInterval(load, 60000);
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

  const openNotifPrefs = async () => {
    setShowNotifPrefs(true);
    if (prefs) return;
    setPrefsLoading(true);
    try {
      const res = await apiFetch(`${API}/notifications/preferences`);
      if (res.ok) setPrefs(await res.json());
    } finally { setPrefsLoading(false); }
  };

  const updateNotifPref = async (patch: Partial<{ emailNotificationsEnabled: boolean; notifyPriorityOnly: boolean }>) => {
    setPrefs(p => p ? { ...p, ...patch } : p);
    await apiFetch(`${API}/notifications/preferences`, { method: 'PATCH', body: JSON.stringify(patch) });
  };

  const unmuteAllOrders = async () => {
    if (!prefs) return;
    const ids = prefs.mutedOrderIds;
    setPrefs({ ...prefs, mutedOrderIds: [] });
    await Promise.all(ids.map(oid => apiFetch(`${API}/notifications/mute/${oid}`, { method: 'DELETE' })));
  };

  const dismissNotif = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    await apiFetch(`${API}/notifications/${n.id}`, { method: 'DELETE' });
    setNotifs(p => p.filter(x => x.id !== n.id));
    if (!n.isRead) setUnread(c => Math.max(0, c - 1));
  };

  const handleNotifClick = async (n: Notification) => {
    if (!n.isRead) {
      await apiFetch(`${API}/notifications/${n.id}/read`, { method: 'PATCH' });
      setNotifs(p => p.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      setUnread(c => Math.max(0, c - 1));
    }
    if (n.orderId) {
      setShowNotifs(false);
      router.push(`/orders/${n.orderId}`);
    }
  };

  const role = (user?.role as UserRole) || UserRole.ADMIN;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)' }}>
      <Sidebar activeRole={role} activePath={router.pathname} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', minWidth: 0 }}>

        {/* Topbar */}
        <div className="admin-topbar" style={{
          background: 'var(--topbar-bg)',
          borderBottom: '2px solid var(--border-light)',
          borderBottomColor: 'var(--border-light)',
          backgroundImage: 'linear-gradient(180deg, #FDFCFA 0%, #F9F6F1 100%)',
          padding: '0 28px',
          height: '66px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxShadow: '0 2px 12px rgba(26,39,64,0.08)',
          gap: '10px',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {/* Hamburger */}
            <button
              className="hamburger-btn"
              onClick={() => setSidebarOpen(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '20px', color: 'var(--text-primary)', padding: '4px',
                flexShrink: 0, lineHeight: 1,
              }}
              aria-label="Open menu"
            >
              ☰
            </button>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '6px 12px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500,
                  cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                }}
              >
                ← {backLabel}
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              {title && (
                <div className="topbar-title" style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)',
                  letterSpacing: '-0.3px', lineHeight: 1, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {title}
                </div>
              )}
              {subtitle && (
                <div className="topbar-subtitle" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          {/* Global search — desktop inline box; collapses to an icon below 768px (see .topbar-search-desktop / .topbar-search-mobile-btn in globals.css) */}
          <div className="topbar-search-desktop" style={{ flex: 1, maxWidth: '420px', minWidth: '120px', position: 'relative' }}>
            <input
              value={globalQuery}
              onChange={e => { setGlobalQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search orders, customers, companies…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '9px 13px', fontSize: '12px',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            {searchOpen && globalQuery.trim().length >= 2 && (
              <div style={{ position: 'absolute', left: 0, top: '44px', width: '360px', maxWidth: 'calc(100vw - 32px)', zIndex: 100 }}>
                {renderSearchDropdown()}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {actions && <div className="topbar-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{actions}</div>}

            {/* Mobile search icon — only visible below 768px, opens a full-width overlay */}
            <button
              className="topbar-search-mobile-btn"
              onClick={() => setMobileSearchOpen(true)}
              style={{
                display: 'none', background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: '8px', width: '36px', height: '36px',
                cursor: 'pointer', fontSize: '15px', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
              aria-label="Search"
            >
              🔍
            </button>

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={openNotifs}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: '8px', width: '36px', height: '36px',
                  cursor: 'pointer', fontSize: '15px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', color: 'var(--text-secondary)',
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
                  position: 'absolute', right: 0, top: '44px', width: '300px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 100, overflow: 'hidden',
                  maxWidth: 'calc(100vw - 32px)',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {showNotifPrefs ? 'Notification Settings' : 'Notifications'}
                    </span>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {!showNotifPrefs && unread > 0 && (
                        <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                          Mark all read
                        </button>
                      )}
                      <button
                        onClick={() => showNotifPrefs ? setShowNotifPrefs(false) : openNotifPrefs()}
                        title="Notification settings"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: showNotifPrefs ? 'var(--accent)' : 'var(--text-muted)', fontSize: '13px', padding: 0 }}
                      >
                        {showNotifPrefs ? '✕' : '⚙'}
                      </button>
                    </div>
                  </div>
                  {showNotifPrefs ? (
                    <div style={{ padding: '16px' }}>
                      {prefsLoading || !prefs ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>
                      ) : (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                            Email notifications
                            <input type="checkbox" checked={prefs.emailNotificationsEnabled} onChange={e => updateNotifPref({ emailNotificationsEnabled: e.target.checked })} />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                            Priority orders only
                            <input type="checkbox" checked={prefs.notifyPriorityOnly} onChange={e => updateNotifPref({ notifyPriorityOnly: e.target.checked })} />
                          </label>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
                            To mute a specific order, use the 🔔 Mute button on that order's page.
                          </div>
                          {prefs.mutedOrderIds.length > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {prefs.mutedOrderIds.length} order{prefs.mutedOrderIds.length > 1 ? 's' : ''} muted
                              </span>
                              <button onClick={unmuteAllOrders} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                                Unmute all
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No notifications</div>
                    ) : notifs.map(n => {
                      const typeIcon: Record<string, string> = {
                        CAD_UPLOADED: '📐', CAD_SENT_FOR_APPROVAL: '📤', CAD_APPROVED: '✅', CAD_REJECTED: '❌',
                        ORDER_CREATED: '🆕', ORDER_AUTHORIZED: '✔', SKU_GENERATED: '🏷️',
                        ORDER_IN_MANUFACTURING: '🏭', ORDER_SHIPPED: '📦', READY_TO_SHIP: '🚚',
                        STATUS_CHANGED: '🔄', CUSTOMER_MESSAGE: '💬', FACTORY_MESSAGE: '🏭', MENTION: '@', SLA_OVERDUE: '⏰',
                        APPROVAL_SURVEY_RESPONSE: '📝',
                      };
                      const icon = typeIcon[n.type] || '🔔';
                      const clickable = !!n.orderId;
                      return (
                        <div key={n.id}
                          onClick={() => handleNotifClick(n)}
                          style={{
                            padding: '12px 16px', borderBottom: '1px solid var(--border-light)',
                            background: n.isRead ? 'transparent' : 'rgba(192,155,88,0.05)',
                            cursor: clickable ? 'pointer' : 'default',
                            display: 'flex', gap: '10px', alignItems: 'flex-start',
                          }}
                          onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = 'rgba(192,155,88,0.1)'; }}
                          onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = n.isRead ? 'transparent' : 'rgba(192,155,88,0.05)'; }}
                        >
                          <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: n.isRead ? 400 : 600, color: n.isRead ? 'var(--text-secondary)' : 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {n.title}
                              {n.isPriority && (
                                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.15)', border: '1px solid rgba(192,155,88,0.3)', borderRadius: '99px', padding: '1px 7px', letterSpacing: '0.3px' }}>
                                  ★ Priority
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.message}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', opacity: 0.7 }}>
                              {new Date(n.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {!n.isRead && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)' }} />}
                            <button
                              onClick={e => dismissNotif(e, n)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '0', lineHeight: 1, opacity: 0.5 }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                              title="Dismiss"
                            >✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
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
                  fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {user.firstName[0]}{user.lastName[0]}
                </div>
                <div className="topbar-user-name">
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.firstName} {user.lastName}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{user.role}</div>
                </div>
                <button
                  className="topbar-signout"
                  onClick={() => {
                    clearAuth();
                    // Clear httpOnly cookie server-side
                    fetch('/api/proxy/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
                    router.replace('/login');
                  }}
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

          {/* Mobile search overlay — covers the topbar so the input has full width on phones */}
          {mobileSearchOpen && (
            <div style={{
              position: 'absolute', inset: 0, background: 'var(--topbar-bg, #FDFCFA)',
              display: 'flex', alignItems: 'center', gap: '8px', padding: '0 14px', zIndex: 101,
            }}>
              <input
                autoFocus
                value={globalQuery}
                onChange={e => { setGlobalQuery(e.target.value); setSearchOpen(true); }}
                placeholder="Search orders, customers, companies…"
                style={{
                  flex: 1, minWidth: 0, boxSizing: 'border-box',
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '9px 13px', fontSize: '13px',
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <button
                onClick={() => { setMobileSearchOpen(false); setSearchOpen(false); setGlobalQuery(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', flexShrink: 0 }}
                aria-label="Close search"
              >
                ✕
              </button>
              {searchOpen && globalQuery.trim().length >= 2 && (
                <div style={{ position: 'absolute', left: '14px', right: '14px', top: '54px' }}>
                  {renderSearchDropdown()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="main-content-pad" style={{ flex: 1, overflow: 'auto', padding: '32px 36px' }}>
          {children}
        </div>
      </div>

      {showNotifs && <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNotifs(false)} />}
      {searchOpen && !mobileSearchOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setSearchOpen(false)} />}
      {mobileSearchOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => { setMobileSearchOpen(false); setSearchOpen(false); }} />}
    </div>
  );
};
