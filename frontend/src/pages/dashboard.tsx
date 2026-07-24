import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { OrderStatus, STATUS_CONFIG } from '../utils/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

interface Metrics    { total: number; byStatus: { status: string; count: string }[] }
interface Priority   { id: string; poNumber: string; storeName?: string; customerFullName?: string; status: string; priorityReason: string; priorityLevel: 'CRITICAL'|'HIGH'|'MEDIUM'; createdAt: string }
interface Trend      { date: string; created: number; completed: number }
interface RecentOrder{ id: string; poNumber: string; storeName?: string; customerFullName?: string; status: string; orderType?: string; createdAt: string }
interface TopStore   { store: string; count: number }

const NAVY = '#1A2740';
const GOLD = '#C09B58';
const GOLD_DARK = '#A07C3A';

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #E8E0D4',
  borderRadius: 16, boxShadow: '0 2px 12px rgba(26,39,64,0.06)',
};

const PIPELINE_ORDER: OrderStatus[] = [
  OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS, OrderStatus.VPO_ISSUED,
  OrderStatus.MANUFACTURED, OrderStatus.SHIPPED,
  OrderStatus.REPAIR, OrderStatus.COMPLETED,
];

const BAR_COLORS = [NAVY, '#243858', '#2E4870', GOLD, GOLD_DARK, '#8A6B2E'];
const PRIORITY_COLORS = { CRITICAL: '#7C3AED', HIGH: '#DC2626', MEDIUM: GOLD_DARK };

export default function Dashboard() {
  const router = useRouter();
  const [metrics, setMetrics]     = useState<Metrics | null>(null);
  const [actions, setActions]     = useState<Priority[]>([]);
  const [recent, setRecent]       = useState<RecentOrder[]>([]);
  const [myOrderTotal, setMyOrderTotal] = useState<number>(0);
  const [myVpoTotal, setMyVpoTotal] = useState<number>(0);
  const [myManufacturedTotal, setMyManufacturedTotal] = useState<number>(0);
  const [loading, setLoading]         = useState(true);
  const [userRole, setUserRole]   = useState('');
  const [refImages, setRefImages] = useState<Record<string, string>>({});
  const [showMoreA, setShowMoreA] = useState(false);
  const [showMoreR, setShowMoreR] = useState(false);

  useEffect(() => {
    try { const u = localStorage.getItem('jf_user'); if (u) setUserRole(JSON.parse(u).role || ''); } catch {}
  }, []);

  useEffect(() => {
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const load = async () => {
      // Fetch role-filtered totals (used by Sales Rep, Stone Manager, Factory
      // Manager, etc.) alongside everything else — /orders/metrics below is a
      // GLOBAL count across every supplier/factory, unscoped to the current
      // user, so Stone/Factory Manager KPI tiles need these instead (the
      // plain /orders list endpoint already applies each role's own scoping
      // — own assigned supply source / factory — server-side).
      const [mRes, priRes, rRes, myRes, vpoRes, manufacturedRes] = await Promise.all([
        apiFetch(`${API}/orders/metrics`),
        apiFetch(`${API}/orders/priority`),
        apiFetch(`${API}/orders?limit=10&dateFrom=${sevenAgo}`),
        apiFetch(`${API}/orders?limit=1`),
        apiFetch(`${API}/orders?limit=1&status=VPO_ISSUED`),
        apiFetch(`${API}/orders?limit=1&status=MANUFACTURED`),
      ]);
      if (mRes.ok)  setMetrics(await mRes.json());
      if (myRes.ok) { const d = await myRes.json(); setMyOrderTotal(d.total || 0); }
      if (vpoRes.ok) { const d = await vpoRes.json(); setMyVpoTotal(d.total || 0); }
      if (manufacturedRes.ok) { const d = await manufacturedRes.json(); setMyManufacturedTotal(d.total || 0); }
      let ids: string[] = [];
      if (priRes.ok) { const p = await priRes.json(); setActions(p); ids.push(...p.map((o: any) => o.id)); }
      if (rRes.ok)   { const d = await rRes.json(); const l = d.orders || []; setRecent(l); ids.push(...l.map((o: any) => o.id)); }
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length) {
        // Single batched lookup instead of one /cad/order/:id call per order.
        try {
          const tRes = await apiFetch(`${API}/cad/thumbnails?orderIds=${uniqueIds.join(',')}`);
          if (tRes.ok) setRefImages(await tRes.json());
        } catch {}
      }
      setLoading(false);
    };
    load();
  }, []);


  const sc = (s: string) => parseInt(metrics?.byStatus.find(b => b.status === s)?.count || '0');
  const activeOrders  = metrics?.byStatus.reduce((t, b) => ['COMPLETED','CANCELLED'].includes(b.status) ? t : t + parseInt(b.count), 0) ?? 0;

  // ── Shared components ────────────────────────────────────────────────────────

  const Divider = ({ label }: { label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '28px 0 18px' }}>
      <div style={{ width: 3, height: 18, background: GOLD, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 16, fontWeight: 700, color: NAVY, letterSpacing: '1px' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#E8E0D4' }} />
    </div>
  );

  const KpiCard = ({ label, value, color, sub, link, accent = false }: { label: string; value: any; color: string; sub: string; link?: string; accent?: boolean }) => (
    <div onClick={() => link && router.push(link)}
      style={{ ...card, padding: '20px 22px', cursor: link ? 'pointer' : 'default', borderTop: `3px solid ${accent ? GOLD : color}`, transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { if (link) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(26,39,64,0.12)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(26,39,64,0.06)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      <div style={{ fontSize: 12, color: '#9BA8B5', letterSpacing: '0.5px', marginBottom: 10, fontWeight: 500 }}>{sub}</div>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 40, fontWeight: 600, color, lineHeight: 1, marginBottom: 8 }}>
        {loading ? '—' : value}
      </div>
      <div style={{ fontSize: 14, color: '#5C6B7A', fontWeight: 500 }}>{label}</div>
    </div>
  );

  const OrderRow = ({ o }: { o: any }) => {
    const cfg = STATUS_CONFIG[o.status] || { label: o.status, color: '#6B7280', bg: '#F3F4F6' };
    const pc  = o.priorityLevel ? PRIORITY_COLORS[o.priorityLevel as keyof typeof PRIORITY_COLORS] : null;
    const img = refImages[o.id];
    return (
      <div className="order-row-card" onClick={() => router.push(`/orders/${o.id}`)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: pc ? `${pc}06` : '#FAFAF8', border: `1px solid ${pc ? pc + '25' : '#EDE9E2'}`, borderLeft: `3px solid ${pc || GOLD}20`, borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s', overflow: 'hidden' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = pc ? `${pc}10` : '#F5F3EF'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = pc ? `${pc}06` : '#FAFAF8'}
      >
        {img
          ? <Image className="order-row-img" src={img} alt="" width={42} height={42} style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid #E8E0D4' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          : <div className="order-row-img" style={{ width: 42, height: 42, borderRadius: 8, flexShrink: 0, background: '#F5F3EF', border: '1px dashed #D4CEC6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🖼</div>
        }
        <div className="order-row-text" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <div className="order-row-name" style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 3, fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{o.poNumber}</div>
          <div className="order-row-sub" style={{ fontSize: 12, color: '#9BA8B5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.storeName || o.customerFullName || '—'}{o.orderType ? ` · ${o.orderType}` : ''}
            {o.priorityReason ? ` · ${o.priorityReason}` : ''}
          </div>
        </div>
        <div className="order-row-right" style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontSize: 11, background: cfg.bg, color: cfg.color, padding: '3px 9px', borderRadius: 99, fontWeight: 600, display: 'block', marginBottom: 4 }}>{cfg.label}</span>
          <span style={{ fontSize: 11, color: '#9BA8B5' }}>{new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    );
  };

  const ActionSection = ({ title, subtitle, items, link, showMore, setShowMore }: any) => (
    <div className="dash-action-card" style={{ ...card, padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 600, color: NAVY, margin: '0 0 3px' }}>{title}</h2>
          {subtitle && <div style={{ fontSize: 12, color: '#9BA8B5' }}>{subtitle}</div>}
        </div>
        <a href={link} style={{ fontSize: 12, color: GOLD, fontWeight: 600, textDecoration: 'none', marginTop: 4 }}>View all →</a>
      </div>
      {loading
        ? <div style={{ color: '#9BA8B5', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Loading…</div>
        : items.length === 0
          ? <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>All clear</div>
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {items.slice(0, 5).map((o: any) => <OrderRow key={o.id} o={o} />)}
            </div>
      }
    </div>
  );

  // ── Role-based views ─────────────────────────────────────────────────────────

  if (!userRole || userRole === 'ADMIN' || userRole === 'AUTHORIZER') return (
    <AppLayout title="Dashboard" subtitle="Overview"
      actions={<button onClick={() => router.push('/orders')} style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}>+ New Order</button>}
    >
      {/* ── KPIs ── */}
      <div className="dash-kpi">
        <KpiCard label="Active Orders"  value={activeOrders}   color={NAVY}                                         sub="not completed or cancelled" link="/orders" />
        <KpiCard label="New This Week"  value={recent.length}  color="#0891B2"                                      sub="last 7 days"                link="/orders" />
        <KpiCard label="My Actions"     value={actions.length} color="#7C3AED"                                      sub="priority tasks"              link="/todos" accent />
      </div>

      {/* ── Pipeline ── */}
      <div style={{ ...card, padding: '20px 22px', marginBottom: 8 }}>
        <div className="pipeline-row" style={{ display: 'flex', gap: 4, alignItems: 'stretch', overflowX: 'auto' }}>
          {PIPELINE_ORDER.map((status, i) => {
            const cfg = STATUS_CONFIG[status]; const count = sc(status); const isLast = i === PIPELINE_ORDER.length - 1;
            return (
              <React.Fragment key={status}>
                <div className="pipeline-tile" onClick={() => router.push(`/orders?status=${status}`)} style={{ flex: '1 1 0', minWidth: 60, background: count > 0 ? `${cfg.color}10` : '#F9F8F5', border: `1px solid ${count > 0 ? cfg.color + '35' : '#EDE9E2'}`, borderRadius: 10, padding: '14px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { if (count > 0) (e.currentTarget as HTMLDivElement).style.background = `${cfg.color}1E`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = count > 0 ? `${cfg.color}10` : '#F9F8F5'; }}
                >
                  <div className="pipeline-count" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 30, fontWeight: 600, color: count > 0 ? cfg.color : '#C9D0D8', lineHeight: 1, marginBottom: 6 }}>{loading ? '—' : count}</div>
                  <div className="pipeline-label" style={{ fontSize: 11, color: count > 0 ? cfg.color : '#C9D0D8', fontWeight: 600, lineHeight: 1.3 }}>{cfg.label}</div>
                </div>
                {!isLast && <div style={{ display: 'flex', alignItems: 'center', color: '#D4CEC6', fontSize: 14, flexShrink: 0 }}>›</div>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Queues ── */}
      <div className="dash-2col">
        <ActionSection title="My Action Queue" subtitle="Orders requiring your attention" items={actions} link="/todos"  showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="New This Week"    subtitle="Last 7 days"                      items={recent}  link="/orders" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // ── Other roles (compact) ────────────────────────────────────────────────────
  const RoleKpi = ({ items }: { items: { label: string; value: any; color: string; sub: string; link?: string }[] }) => (
    <div className="dash-kpi" style={{ marginBottom: 8 }}>
      {items.map(k => <KpiCard key={k.label} {...k} />)}
    </div>
  );

  const roleConfigs: Record<string, any> = {
    SALES_REP:       { subtitle: 'My Orders',        kpis: [{ label: 'My Active Orders', value: myOrderTotal, color: NAVY, sub: 'my customers only', link: '/orders' }, { label: 'New This Week', value: recent.length, color: '#0891B2', sub: 'last 7 days', link: '/orders' }, { label: 'Priority Actions', value: actions.length, color: '#7C3AED', sub: 'needs attention', link: '/todos' }] },
    CAD_DESIGNER:    { subtitle: 'CAD Queue',         kpis: [{ label: 'In CAD Queue', value: sc('CAD_IN_PROGRESS'), color: '#6366F1', sub: 'awaiting design', link: '/orders?status=CAD_IN_PROGRESS' }, { label: 'Revision Needed', value: actions.filter((a: any) => a.priorityReason?.toLowerCase().includes('revision')).length, color: '#DC2626', sub: 'customer requested', link: '/todos' }, { label: 'Awaiting Quote', value: actions.filter((a: any) => a.priorityReason?.toLowerCase().includes('quote')).length, color: GOLD_DARK, sub: 'approved, needs price', link: '/todos' }] },
    FACTORY_MANAGER: { subtitle: 'Production Queue',  kpis: [{ label: 'VPO Active', value: myVpoTotal, color: '#0891B2', sub: 'in production', link: '/orders?status=VPO_ISSUED' }, { label: 'Manufactured', value: myManufacturedTotal, color: '#8B5CF6', sub: 'done, en route to US', link: '/orders?status=MANUFACTURED' }, { label: 'Priority', value: actions.length, color: '#DC2626', sub: 'need attention', link: '/todos' }] },
    STONE_MANAGER:   { subtitle: 'Stone Queue',       kpis: [{ label: 'Pending Stone', value: myOrderTotal, color: '#7C3AED', sub: 'awaiting dispatch', link: '/orders?status=VPO_ISSUED' }, { label: 'Priority Tasks', value: actions.length, color: '#DC2626', sub: '> 1 day overdue', link: '/todos' }] },
    CUSTOMER:        { subtitle: 'My Orders',         kpis: [{ label: 'Active Orders', value: activeOrders, color: NAVY, sub: 'in progress', link: '/orders' }, { label: 'Shipped', value: sc('SHIPPED'), color: '#3B82F6', sub: 'on the way', link: '/orders?status=SHIPPED' }, { label: 'Completed', value: sc('COMPLETED'), color: '#10B981', sub: 'delivered', link: '/orders?status=COMPLETED' }] },
  };

  const cfg = roleConfigs[userRole];
  if (cfg) return (
    <AppLayout title="Dashboard" subtitle={cfg.subtitle} actions={<button onClick={() => router.push('/orders')} style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ New Order</button>}>
      <RoleKpi items={cfg.kpis} />
      <div className="dash-2col">
        <ActionSection title="My Priority Queue" subtitle="Needs your attention" items={actions} link="/todos"  showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="Recent Activity"   subtitle="Last 7 days"          items={recent}  link="/orders" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  return <AppLayout title="Dashboard"><div style={{ textAlign: 'center', padding: '60px', color: '#9BA8B5' }}>Loading…</div></AppLayout>;
}
