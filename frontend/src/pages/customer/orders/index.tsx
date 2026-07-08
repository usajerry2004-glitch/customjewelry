import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order, STATUS_CONFIG, getCadSubLabel } from '../../../utils/types';

const STATUS_ORDER = [
  'WAITING_CONFIRMATION','PENDING_CAD','CAD_IN_PROGRESS','CUSTOMER_APPROVED',
  'CUSTOMER_REJECTED','VPO_ISSUED','PENDING_CONTRACTOR',
  'ORDER_JOB_BAG_CREATED','READY_TO_INVOICE','READY_TO_SHIP','SHIPPED','DELIVERED',
];

export async function getServerSideProps() { return { props: {} }; }

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API}/orders?limit=50`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setOrders(data.orders || []); setLoading(false); });
  }, []);

  return (
    <CustomerLayout
      title="My Orders"
      subtitle={`${orders.length} order${orders.length !== 1 ? 's' : ''}`}
      actions={
        <button
          onClick={() => router.push('/customer/orders/new')}
          style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}
        >
          + Place New Order
        </button>
      }
    >
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>Loading your orders…</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>💍</div>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No orders yet</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px', maxWidth: '360px', margin: '0 auto 28px', lineHeight: 1.7 }}>
            Place your first custom jewelry order and we'll keep you updated every step of the way.
          </div>
          <button
            onClick={() => router.push('/customer/orders/new')}
            style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 28px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Place an Order
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map(order => {
            const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
            const cadSubLabel = order.status === 'CAD_IN_PROGRESS' ? getCadSubLabel(order) : null;
            const statusIdx = STATUS_ORDER.indexOf(order.status!);
            const progress = statusIdx >= 0 ? Math.round((statusIdx / (STATUS_ORDER.length - 1)) * 100) : 0;
            return (
              <div
                key={order.id}
                onClick={() => router.push(`/customer/orders/${order.id}`)}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '18px 20px',
                  cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.1s',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'var(--shadow-md)'; el.style.borderColor = 'var(--accent)'; el.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'var(--shadow-sm)'; el.style.borderColor = 'var(--border)'; el.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {order.poNumber}
                      {order.refCustomerPo && (
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '8px' }}>
                          (Your PO: {order.refCustomerPo})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {order.orderType && <span>{order.orderType}</span>}
                      {order.metalType && <span>{order.metalType} {order.metalColor}</span>}
                      {order.centerStoneShape && <span>{order.centerStoneShape}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                    <div style={{ display: 'inline-block', background: cfg.bg, color: cfg.color, padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      {cadSubLabel || cfg.label}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </CustomerLayout>
  );
}
