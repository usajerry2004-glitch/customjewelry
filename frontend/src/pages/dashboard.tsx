import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { OrderStatus, STATUS_CONFIG } from '../utils/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export async function getServerSideProps() { return { props: {} }; }

// ─── Types ────────────────────────────────────────────────────────────────────
interface Metrics { total: number; byStatus: { status: string; count: string }[] }
interface OverdueOrder { id: string; poNumber: string; status: string; daysOverdue: number; slaLabel: string }
interface PriorityOrder { id: string; poNumber: string; storeName?: string; customerFullName?: string; status: string; priorityReason: string; priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM'; createdAt: string }
interface TrendPoint { date: string; created: number; completed: number }
interface WeeklyOrder { id: string; poNumber: string; storeName?: string; customerFullName?: string; status: string; orderType?: string; createdAt: string }

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
};

const PIPELINE_ORDER: OrderStatus[] = [
  OrderStatus.CAD_IN_PROGRESS, OrderStatus.SKU_CREATION, OrderStatus.VPO_ISSUED,
  OrderStatus.PENDING_CONTRACTOR, OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED,
  OrderStatus.REPAIR, OrderStatus.COMPLETED,
];

const PRIORITY_COLORS = { CRITICAL: '#7C3AED', HIGH: '#DC2626', MEDIUM: '#F59E0B' };

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [metrics, setMetrics]     = useState<Metrics | null>(null);
  const [overdue, setOverdue]     = useState<OverdueOrder[]>([]);
  const [actions, setActions]     = useState<PriorityOrder[]>([]);
  const [trend, setTrend]         = useState<TrendPoint[]>([]);
  const [weekOrders, setWeekOrders] = useState<WeeklyOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [userRole, setUserRole]   = useState('');

  useEffect(() => {
    try { const u = localStorage.getItem('jf_user'); if (u) setUserRole(JSON.parse(u).role || ''); } catch {}
  }, []);

  useEffect(() => {
    const load = async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const [mRes, slaRes, priRes, trendRes, wRes] = await Promise.all([
        apiFetch(`${API}/orders/metrics`),
        apiFetch(`${API}/sla/overdue`),
        apiFetch(`${API}/orders/priority`),
        apiFetch(`${API}/reporting/daily-trend`),
        apiFetch(`${API}/orders?limit=10&dateFrom=${sevenDaysAgo}`),
      ]);
      if (mRes.ok)     setMetrics(await mRes.json());
      if (slaRes.ok)   setOverdue(await slaRes.json());
      if (priRes.ok)   setActions(await priRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
      if (wRes.ok)     { const d = await wRes.json(); setWeekOrders(d.orders || []); }
      setLoading(false);
    };
    load();
  }, []);

  // ── Derived KPIs ────────────────────────────────────────────────────────────
  const activeOrders  = metrics?.byStatus.reduce((s, b) =>
    ['COMPLETED','CANCELLED'].includes(b.status) ? s : s + parseInt(b.count), 0) ?? 0;
  const newThisWeek   = weekOrders.length;
  const slaCount      = overdue.length;
  const actionCount   = actions.length;

  const statusCount = (s: OrderStatus) =>
    parseInt(metrics?.byStatus.find(b => b.status === s)?.count || '0');

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Overview"
      actions={
        <button
          onClick={() => router.push('/orders')}
          style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
        >
          + New Order
        </button>
      }
    >
      {/* ── Row 1: KPI Cards ──────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Active Orders',   value: activeOrders,  color: '#1A2740', icon: '◻', sub: 'not completed or cancelled',  link: '/orders' },
          { label: 'New This Week',   value: newThisWeek,   color: '#0891B2', icon: '✦', sub: 'last 7 days',                  link: '/orders' },
          { label: 'SLA Breaches',    value: slaCount,      color: slaCount > 0 ? '#DC2626' : '#059669', icon: '⚠', sub: slaCount > 0 ? 'need attention' : 'all on time', link: '/todos' },
          { label: 'My Actions',      value: actionCount,   color: '#7C3AED', icon: '✓', sub: 'priority tasks',               link: '/todos' },
        ].map(k => (
          <div key={k.label} onClick={() => router.push(k.link)}
            style={{ ...card, padding: '18px 20px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: k.color, opacity: 0.7 }}>{k.icon}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 7px', borderRadius: '5px' }}>{k.sub}</span>
            </div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '34px', fontWeight: 600, color: k.color, lineHeight: 1, marginBottom: '4px' }}>
              {loading ? '—' : k.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Pipeline Funnel ────────────────────────────────────────────── */}
      <div style={{ ...card, padding: '18px 22px', marginBottom: '24px' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Order Pipeline
        </h2>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch', overflowX: 'auto' }}>
          {PIPELINE_ORDER.map((status, i) => {
            const cfg   = STATUS_CONFIG[status];
            const count = statusCount(status);
            const isLast = i === PIPELINE_ORDER.length - 1;
            return (
              <React.Fragment key={status}>
                <div
                  onClick={() => router.push(`/orders?status=${status}`)}
                  style={{
                    flex: '1 1 0', minWidth: '80px',
                    background: count > 0 ? `${cfg.color}12` : 'var(--bg-input)',
                    border: `1px solid ${count > 0 ? cfg.color + '40' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    padding: '12px 10px', textAlign: 'center', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (count > 0) (e.currentTarget as HTMLDivElement).style.background = `${cfg.color}22`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = count > 0 ? `${cfg.color}12` : 'var(--bg-input)'; }}
                >
                  <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '26px', fontWeight: 600, color: count > 0 ? cfg.color : 'var(--text-muted)', lineHeight: 1, marginBottom: '4px' }}>
                    {loading ? '—' : count}
                  </div>
                  <div style={{ fontSize: '10px', color: count > 0 ? cfg.color : 'var(--text-muted)', fontWeight: 600, lineHeight: 1.3 }}>
                    {cfg.label}
                  </div>
                </div>
                {!isLast && (
                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0, padding: '0 2px' }}>›</div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Row 3: Chart + SLA Alerts ─────────────────────────────────────────── */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', marginBottom: '24px' }}>

        {/* Weekly Trend Chart */}
        <div style={{ ...card, padding: '18px 22px' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Weekly Trend — Last 7 Days
          </h2>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                  cursor={{ fill: 'rgba(26,39,64,0.04)' }}
                />
                <Bar dataKey="created"   fill="#1A2740" radius={[4,4,0,0]} name="Created" />
                <Bar dataKey="completed" fill="#059669" radius={[4,4,0,0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px', justifyContent: 'center' }}>
            {[{ color: '#1A2740', label: 'Created' }, { color: '#059669', label: 'Completed' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* SLA Alerts */}
        <div style={{ ...card, padding: '18px 22px', borderTop: `3px solid ${slaCount > 0 ? '#EF4444' : '#059669'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              SLA Alerts
            </h2>
            <a href="/todos" style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>View all →</a>
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Loading…</div>
          ) : overdue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>All orders on time</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {overdue.map(o => (
                <div key={o.id} onClick={() => router.push(`/orders/${o.id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: '8px', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(220,38,38,0.08)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(220,38,38,0.04)'}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)' }}>{o.poNumber}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{o.slaLabel}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', padding: '2px 8px', borderRadius: '5px', whiteSpace: 'nowrap' }}>
                    +{o.daysOverdue}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: My Action Queue + New Orders This Week ─────────────────────── */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* My Action Queue */}
        <div style={{ ...card, padding: '18px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              My Action Queue
            </h2>
            <a href="/todos" style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>View all →</a>
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Loading…</div>
          ) : actions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '13px', color: '#059669', fontWeight: 600 }}>No actions needed</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {actions.slice(0, 6).map(o => {
                const pc = PRIORITY_COLORS[o.priorityLevel];
                const cfg = STATUS_CONFIG[o.status] || { label: o.status, color: '#6B7280', bg: '#F3F4F6' };
                return (
                  <div key={o.id} onClick={() => router.push(`/orders/${o.id}`)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: `${pc}08`, border: `1px solid ${pc}30`, borderLeft: `3px solid ${pc}`, borderRadius: '8px', cursor: 'pointer', gap: '8px' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = `${pc}14`}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = `${pc}08`}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)', marginBottom: '2px' }}>{o.poNumber}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.priorityReason}</div>
                    </div>
                    <span style={{ fontSize: '10px', background: cfg.bg, color: cfg.color, padding: '2px 7px', borderRadius: '99px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
              {actions.length > 6 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', paddingTop: '4px' }}>
                  +{actions.length - 6} more → <a href="/todos" style={{ color: 'var(--accent)', fontWeight: 600 }}>Priority Tasks</a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* New Orders This Week */}
        <div style={{ ...card, padding: '18px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              New This Week
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last 7 days</span>
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Loading…</div>
          ) : weekOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No new orders this week.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {weekOrders.map(o => {
                const cfg = STATUS_CONFIG[o.status] || { label: o.status, color: '#6B7280', bg: '#F3F4F6' };
                return (
                  <div key={o.id} onClick={() => router.push(`/orders/${o.id}`)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', gap: '8px' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-input)'}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)', marginBottom: '2px' }}>{o.poNumber}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {o.storeName || o.customerFullName || '—'}
                        {o.orderType ? ` · ${o.orderType}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', background: cfg.bg, color: cfg.color, padding: '2px 7px', borderRadius: '99px', fontWeight: 600, display: 'block', marginBottom: '3px' }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
