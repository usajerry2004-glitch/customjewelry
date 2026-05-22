import React from 'react';
import { UserRole } from '../../utils/types';

interface NavItem {
  icon: string;
  label: string;
  path: string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { icon: '🏠', label: 'Dashboard', path: '/dashboard', roles: Object.values(UserRole) as UserRole[] },
  { icon: '📋', label: 'Orders', path: '/orders', roles: Object.values(UserRole) as UserRole[] },
  { icon: '🔲', label: 'Kanban Board', path: '/orders/kanban', roles: [UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER] },
  { icon: '🎨', label: 'CAD Files', path: '/cad', roles: [UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER] },
  { icon: '🏷️', label: 'SKU Management', path: '/sku', roles: [UserRole.ADMIN, UserRole.SKU_MANAGER] },
  { icon: '💎', label: 'Inventory', path: '/inventory', roles: [UserRole.ADMIN, UserRole.STONE_MANAGER] },
  { icon: '🏭', label: 'Manufacturing', path: '/manufacturing', roles: [UserRole.ADMIN, UserRole.FACTORY_MANAGER] },
  { icon: '🚚', label: 'Shipping', path: '/shipping', roles: [UserRole.ADMIN, UserRole.SHIPPING_MANAGER] },
  { icon: '🔧', label: 'Repairs', path: '/repairs', roles: [UserRole.ADMIN, UserRole.US_SETTER] },
  { icon: '👥', label: 'Customers', path: '/customers', roles: [UserRole.ADMIN, UserRole.SALES_REP] },
  { icon: '📊', label: 'Analytics', path: '/analytics', roles: [UserRole.ADMIN] },
  { icon: '⚙️', label: 'Settings', path: '/settings', roles: [UserRole.ADMIN] },
];

interface SidebarProps {
  activeRole?: UserRole;
  activePath?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeRole = UserRole.ADMIN, activePath = '/dashboard' }) => {
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(activeRole));

  return (
    <div style={{
      width: '240px',
      minHeight: '100vh',
      background: '#0A0A12',
      borderRight: '1px solid #1E1E2E',
      padding: '0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid #1E1E2E' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, background: 'linear-gradient(135deg, #F6D860, #E6A817)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          💎 JewelFlow OS
        </div>
        <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '2px' }}>Workflow Management</div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 8px', flex: 1 }}>
        {visibleItems.map((item) => (
          <a
            key={item.path}
            href={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              marginBottom: '2px',
              background: activePath === item.path ? '#1E1E2E' : 'transparent',
              color: activePath === item.path ? '#F6D860' : '#64748B',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: activePath === item.path ? 600 : 400,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: '16px' }}>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #1E1E2E' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #F6D860, #E6A817)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
            👤
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E1' }}>Admin User</div>
            <div style={{ fontSize: '10px', color: '#4B5563' }}>{activeRole}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
