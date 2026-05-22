import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { MetricsPanel } from '../components/dashboard/MetricsPanel';
import { OrderCard } from '../components/orders/OrderCard';
import { Order, OrderStatus } from '../utils/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface Metrics {
  total: number;
  totalRevenue: number;
  byStatus: { status: string; count: string }[];
}

const MOCK_ORDERS: Partial<Order>[] = [
  { id: '1', poNumber: 'PO-2025-001', storeName: 'Kira Jewels NYC', status: OrderStatus.CAD_IN_PROGRESS, orderType: 'Engagement Ring', metalType: '18K', metalColor: 'White Gold', quotedCost: 4200 },
  { id: '2', poNumber: 'PO-2025-002', customerFullName: 'Sarah Mitchell', status: OrderStatus.CUSTOMER_APPROVED, orderType: 'Wedding Band', metalType: '14K', metalColor: 'Yellow Gold', quotedCost: 1850 },
  { id: '3', poNumber: 'PO-2025-003', storeName: 'Diamond Gallery', status: OrderStatus.VPO_ISSUED, orderType: 'Necklace', metalType: 'Platinum', metalColor: 'Platinum', quotedCost: 7600 },
  { id: '4', poNumber: 'PO-2025-004', customerFullName: 'James Chen', status: OrderStatus.READY_TO_SHIP, orderType: 'Pendant', metalType: '18K', metalColor: 'Rose Gold', quotedCost: 3100 },
  { id: '5', poNumber: 'PO-2025-005', storeName: 'Luxury Jewels', status: OrderStatus.WAITING_CONFIRMATION, orderType: 'Bracelet', metalType: '14K', metalColor: 'White Gold', quotedCost: 2400 },
];

const MOCK_METRICS: Metrics = {
  total: 48,
  totalRevenue: 187400,
  byStatus: [
    { status: 'WAITING_CONFIRMATION', count: '7' },
    { status: 'CAD_IN_PROGRESS', count: '9' },
    { status: 'CUSTOMER_APPROVED', count: '5' },
    { status: 'VPO_ISSUED', count: '8' },
    { status: 'READY_TO_SHIP', count: '6' },
    { status: 'SHIPPED', count: '13' },
  ],
};

export default function Dashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics>(MOCK_METRICS);
  const [orders, setOrders] = useState<Partial<Order>[]>(MOCK_ORDERS);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'connecting' | 'live' | 'demo'>('connecting');

  useEffect(() => {
    const load = async () => {
      try {
        const [mRes, oRes] = await Promise.all([
          fetch(`${API}/orders/metrics`),
          fetch(`${API}/orders?limit=20`),
        ]);
        if (mRes.ok && oRes.ok) {
          const mData = await mRes.json();
          const oData = await oRes.json();
          setMetrics(mData);
          if (oData.orders?.length) setOrders(oData.orders);
          setApiStatus('live');
        } else {
          setApiStatus('demo');
        }
      } catch {
        setApiStatus('demo');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const statusBadge = (
    <span style={{
      fontSize: '11px', padding: '4px 10px', borderRadius: '99px', fontWeight: 600,
      background: apiStatus === 'live' ? 'rgba(16,185,129,0.15)' : apiStatus === 'connecting' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
      color: apiStatus === 'live' ? '#10B981' : apiStatus === 'connecting' ? '#818CF8' : '#F59E0B',
    }}>
      {apiStatus === 'live' ? '● Live API' : apiStatus === 'connecting' ? '● Connecting…' : '● Demo Mode'}
    </span>
  );

  return (
    <AppLayout
      title="Dashboard"
      subtitle="JewelFlow OS — Custom Order Management"
      actions={
        <>
          {statusBadge}
          <button
            onClick={() => router.push('/orders')}
            style={{ background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            + New Order
          </button>
        </>
      }
    >
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Active Orders', value: metrics.total, icon: '📋', color: '#6366F1', delta: '+3 today' },
          { label: 'Total Revenue', value: `$${Number(metrics.totalRevenue).toLocaleString()}`, icon: '💰', color: '#10B981', delta: '+$12k this week' },
          { label: 'In CAD Design', value: metrics.byStatus.find(s => s.status === 'CAD_IN_PROGRESS')?.count || '0', icon: '🎨', color: '#8B5CF6', delta: 'Avg 3.2 days' },
          { label: 'Ready to Ship', value: metrics.byStatus.find(s => s.status === 'READY_TO_SHIP')?.count || '0', icon: '🚚', color: '#F59E0B', delta: 'Action needed' },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '20px' }}>{kpi.icon}</span>
              <span style={{ fontSize: '10px', color: '#4B5563', background: '#0F0F14', padding: '2px 7px', borderRadius: '6px' }}>{kpi.delta}</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: kpi.color, marginBottom: '4px' }}>{kpi.value}</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#CBD5E1' }}>Recent Orders</h2>
            <a href="/orders" style={{ fontSize: '12px', color: '#F6D860', fontWeight: 500 }}>View all →</a>
          </div>
          {loading ? (
            <div style={{ color: '#4B5563', fontSize: '13px', padding: '20px 0' }}>Loading orders…</div>
          ) : orders.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: '13px', padding: '20px 0' }}>No orders yet.</div>
          ) : (
            orders.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => router.push(`/orders/${order.id}`)} />
            ))
          )}
        </div>
        <div>
          <div style={{ marginBottom: '14px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#CBD5E1' }}>Pipeline Status</h2>
          </div>
          <MetricsPanel metrics={metrics} />
        </div>
      </div>
    </AppLayout>
  );
}
