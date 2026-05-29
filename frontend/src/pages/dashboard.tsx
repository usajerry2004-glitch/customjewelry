import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { MetricsPanel } from '../components/dashboard/MetricsPanel';
import { OrderCard } from '../components/orders/OrderCard';
import { Order } from '../utils/types';
import { apiFetch, API } from '../utils/apiFetch';

interface Metrics {
  total: number;
  totalRevenue: number;
  byStatus: { status: string; count: string }[];
}


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

const KPI_CARDS = (metrics: Metrics) => [
  { label: 'Active Orders',   value: metrics.total,            color: '#1A2740', icon: '◻', delta: '+3 today' },
  { label: 'Total Revenue',   value: `$${Number(metrics.totalRevenue).toLocaleString()}`, color: '#059669', icon: '◈', delta: '+$12k this week' },
  { label: 'In CAD Design',   value: metrics.byStatus.find(s => s.status === 'CAD_IN_PROGRESS')?.count || '0', color: '#7C3AED', icon: '◎', delta: 'Avg 3.2 days' },
  { label: 'Ready to Ship',   value: metrics.byStatus.find(s => s.status === 'READY_TO_SHIP')?.count || '0',  color: '#C09B58', icon: '▷', delta: 'Action needed' },
];

export default function Dashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics>(MOCK_METRICS);
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'connecting' | 'live' | 'demo'>('connecting');
  const [isAdmin, setIsAdmin] = useState(false);
  const [overdueOrders, setOverdueOrders] = useState<{ id: string; poNumber: string; status: string; daysOverdue: number; slaLabel: string }[]>([]);

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) setIsAdmin(JSON.parse(u).role === 'ADMIN');
    } catch {}
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [mRes, oRes, slaRes] = await Promise.all([
          apiFetch(`${API}/orders/metrics`),
          apiFetch(`${API}/orders?limit=20`),
          apiFetch(`${API}/sla/overdue`),
        ]);
        let gotRealData = false;
        if (mRes.ok) {
          setMetrics(await mRes.json());
          gotRealData = true;
        }
        if (oRes.ok) {
          const oData = await oRes.json();
          if (oData.orders?.length) setOrders(oData.orders);
          gotRealData = true;
        }
        if (slaRes.ok) setOverdueOrders(await slaRes.json());
        setApiStatus(gotRealData ? 'live' : 'demo');
      } catch {
        setApiStatus('demo');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const statusDot = {
    live: { bg: 'rgba(5,150,105,0.1)', color: '#059669', label: '● Live' },
    connecting: { bg: 'rgba(124,58,237,0.1)', color: '#7C3AED', label: '● Connecting…' },
    demo: { bg: 'rgba(192,155,88,0.1)', color: '#C09B58', label: '● Demo' },
  }[apiStatus];

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Kira Jewels Custom — Order Management"
      actions={
        <>
          <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '99px', fontWeight: 600, background: statusDot.bg, color: statusDot.color }}>
            {statusDot.label}
          </span>
          <button
            onClick={() => router.push('/orders')}
            style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}
          >
            + New Order
          </button>
        </>
      }
    >
      {/* KPI Cards */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {KPI_CARDS(metrics).filter(kpi => isAdmin || kpi.label !== 'Total Revenue').map((kpi) => (
          <div key={kpi.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '20px 22px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <span style={{ fontSize: '18px', color: kpi.color, opacity: 0.8 }}>{kpi.icon}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 7px', borderRadius: '5px', letterSpacing: '0.2px' }}>
                {kpi.delta}
              </span>
            </div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '30px', fontWeight: 600, color: kpi.color, marginBottom: '4px', lineHeight: 1 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px' }}>
        {/* Recent Orders */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Recent Orders
            </h2>
            <a href="/orders" style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.3px' }}>
              View all →
            </a>
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading orders…</div>
          ) : orders.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>No orders yet.</div>
          ) : (
            orders.map((order) => (
              <OrderCard key={order.id} order={order} hideFinancials={!isAdmin} onClick={() => router.push(`/orders/${order.id}`)} />
            ))
          )}
        </div>

        {/* Pipeline + Overdue */}
        <div>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Pipeline
          </h2>
          <MetricsPanel metrics={metrics} />

          {/* SLA / Overdue widget */}
          {overdueOrders.length > 0 && (
            <div style={{ marginTop: '20px', background: 'var(--bg-card)', border: '1px solid rgba(220,38,38,0.25)', borderTop: '3px solid #EF4444', borderRadius: 'var(--radius-lg)', padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  ⚠ SLA Breaches ({overdueOrders.length})
                </div>
                <a href="/reports" style={{ fontSize: '11px', color: 'var(--accent-dark)', fontWeight: 600, textDecoration: 'none' }}>View report →</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {overdueOrders.slice(0, 5).map(o => (
                  <div key={o.id} onClick={() => router.push(`/orders/${o.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: '7px', cursor: 'pointer' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)' }}>{o.poNumber}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{o.slaLabel}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', padding: '2px 7px', borderRadius: '5px' }}>+{o.daysOverdue}d</span>
                  </div>
                ))}
                {overdueOrders.length > 5 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', paddingTop: '4px' }}>+{overdueOrders.length - 5} more overdue orders</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
