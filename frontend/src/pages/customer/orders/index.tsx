import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CustomerLayout } from '../../../components/layout/CustomerLayout';
import { apiFetch, API } from '../../../utils/apiFetch';
import { Order, STATUS_CONFIG } from '../../../utils/types';

const STATUS_ORDER = [
  'WAITING_CONFIRMATION', 'PENDING_CAD', 'CAD_IN_PROGRESS', 'CUSTOMER_APPROVED',
  'CUSTOMER_REJECTED', 'SKU_CREATION', 'VPO_ISSUED', 'PENDING_CONTRACTOR',
  'ORDER_JOB_BAG_CREATED', 'READY_TO_INVOICE', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED',
];

export async function getServerSideProps() {
  return { props: {} };
}

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
          style={{ background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Place New Order
        </button>
      }
    >
      {loading ? (
        <div style={{ color: '#4B5563', textAlign: 'center', padding: '60px 0' }}>Loading your orders…</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>💍</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#CBD5E1', marginBottom: '8px' }}>No orders yet</div>
          <div style={{ fontSize: '13px', color: '#4B5563', marginBottom: '24px' }}>Place your first custom jewelry order and we'll keep you updated every step of the way.</div>
          <button
            onClick={() => router.push('/customer/orders/new')}
            style={{ background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '11px 24px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            Place an Order
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map(order => {
            const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#64748B' };
            const statusIdx = STATUS_ORDER.indexOf(order.status!);
            const progress = statusIdx >= 0 ? Math.round((statusIdx / (STATUS_ORDER.length - 1)) * 100) : 0;
            return (
              <div
                key={order.id}
                onClick={() => router.push(`/customer/orders/${order.id}`)}
                style={{ background: '#111118', border: `1px solid ${cfg.color}25`, borderRadius: '12px', padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>{order.poNumber}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {order.orderType && <span>💍 {order.orderType}</span>}
                      {order.metalType && <span>✨ {order.metalType} {order.metalColor}</span>}
                      {order.centerStoneShape && <span>💎 {order.centerStoneShape}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-block', background: `${cfg.color}20`, color: cfg.color, padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: '10px', color: '#4B5563', marginTop: '4px' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: '3px', background: '#1A1A24', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}80)`, borderRadius: '99px', transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#2D2D3D' }}>Order placed</span>
                  <span style={{ fontSize: '10px', color: '#4B5563' }}>{progress}% complete</span>
                  <span style={{ fontSize: '10px', color: '#2D2D3D' }}>Delivered</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CustomerLayout>
  );
}
