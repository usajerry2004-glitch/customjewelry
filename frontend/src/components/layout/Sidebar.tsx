import React from 'react';
import Image from 'next/image';
import { UserRole } from '../../utils/types';

interface NavItem {
  icon: string;
  label: string;
  path: string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { icon: '◈', label: 'Dashboard',      path: '/dashboard',       roles: Object.values(UserRole) as UserRole[] },
  { icon: '◻', label: 'Orders',         path: '/orders',          roles: Object.values(UserRole) as UserRole[] },
  { icon: '⊞', label: 'Pipeline Board', path: '/orders/kanban',   roles: [UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER] },
  { icon: '◎', label: 'CAD Files',      path: '/cad',             roles: [UserRole.ADMIN, UserRole.CAD_DESIGNER] },
  { icon: '⬡', label: 'Manufacturing',  path: '/manufacturing',   roles: [UserRole.ADMIN, UserRole.FACTORY_MANAGER] },
  { icon: '💎', label: 'Stone',         path: '/stone',           roles: [UserRole.ADMIN, UserRole.STONE_MANAGER] },
  { icon: '◉', label: 'Repairs',        path: '/repairs',         roles: [UserRole.ADMIN, UserRole.AUTHORIZER] },
  { icon: '◌', label: 'Customers',      path: '/customers',       roles: [UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER] },
  { icon: '↑', label: 'Import Orders',  path: '/import',          roles: [UserRole.ADMIN, UserRole.SALES_REP] },
  { icon: '✓', label: 'Priority Tasks',   path: '/todos',           roles: Object.values(UserRole) as UserRole[] },
  { icon: '◇', label: 'Settings',       path: '/settings',        roles: [UserRole.ADMIN] },
  { icon: '🕐', label: 'Audit Log',      path: '/audit-log',       roles: [UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER] },
];

interface SidebarProps {
  activeRole?: UserRole;
  activePath?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeRole = UserRole.ADMIN, activePath = '/dashboard', isOpen = false, onClose }) => {
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(activeRole));

  return (
    <>
      {/* Mobile overlay */}
      <div className={`sidebar-overlay${isOpen ? ' open' : ''}`} onClick={onClose} />

      <div
        className={`app-sidebar${isOpen ? ' open' : ''}`}
        style={{
          width: '220px',
          height: '100vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #0D1E3A 0%, #0A1628 60%, #081220 100%)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          borderTop: '2px solid #C09B58',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '28px 22px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Image
              src="/logo.png"
              alt="Kira Jewels"
              width={784}
              height={261}
              priority
              style={{ height: '42px', width: 'auto', display: 'block', objectFit: 'contain' }}
            />
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '6px', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Custom Jewelry
            </div>
          </div>
          {/* Close button — only visible on mobile via CSS */}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '18px', padding: '4px', display: 'none' }}
            className="hamburger-btn"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav style={{ padding: '16px 10px', flex: 1 }}>
          {visibleItems.map((item) => {
            const isActive = activePath === item.path || (item.path !== '/dashboard' && activePath?.startsWith(item.path));
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  marginBottom: '2px',
                  background: isActive ? 'rgba(192,155,88,0.18)' : 'transparent',
                  color: isActive ? '#EDD48B' : 'rgba(255,255,255,0.48)',
                  textDecoration: 'none',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: '0.2px',
                  transition: 'all 0.15s ease',
                  borderLeft: isActive ? '2px solid #C09B58' : '2px solid transparent',
                }}
              >
                <span style={{ fontSize: '13px', opacity: 0.8 }}>{item.icon}</span>
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 22px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Signed in as</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{activeRole}</div>
        </div>
      </div>
    </>
  );
};
