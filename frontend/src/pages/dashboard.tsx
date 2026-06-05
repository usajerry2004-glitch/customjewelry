import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { OrderStatus, STATUS_CONFIG } from '../utils/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export async function getServerSideProps() { return { props: {} }; }

interface Metrics   { total: number; byStatus: { status: string; count: string }[] }
interface Overdue   { id: string; poNumber: string; storeName: string; status: string; daysOld: number; slaLabel: string }
interface Priority  { id: string; poNumber: string; storeName?: string; customerFullName?: string; status: string; priorityReason: string; priorityLevel: 'CRITICAL'|'HIGH'|'MEDIUM'; createdAt: string }
interface Trend     { date: string; created: number; completed: number }
interface RecentOrder { id: string; poNumber: string; storeName?: string; customerFullName?: string; status: string; orderType?: string; createdAt: string }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' };
const PIPELINE_ORDER: OrderStatus[] = [OrderStatus.CAD_IN_PROGRESS, OrderStatus.SKU_CREATION, OrderStatus.VPO_ISSUED, OrderStatus.PENDING_CONTRACTOR, OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.REPAIR, OrderStatus.COMPLETED];
const PRIORITY_COLORS = { CRITICAL: '#7C3AED', HIGH: '#DC2626', MEDIUM: '#F59E0B' };

export default function Dashboard() {
  const router = useRouter();
  const [metrics, setMetrics]   = useState<Metrics | null>(null);
  const [overdue, setOverdue]   = useState<Overdue[]>([]);
  const [actions, setActions]   = useState<Priority[]>([]);
  const [trend, setTrend]       = useState<Trend[]>([]);
  const [recent, setRecent]     = useState<RecentOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [userRole, setUserRole] = useState('');
  const [refImages, setRefImages] = useState<Record<string, string>>({});
  const [showMoreA, setShowMoreA] = useState(false);
  const [showMoreR, setShowMoreR] = useState(false);

  useEffect(() => {
    try { const u = localStorage.getItem('jf_user'); if (u) setUserRole(JSON.parse(u).role || ''); } catch {}
  }, []);

  useEffect(() => {
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const load = async () => {
      const [mRes, slaRes, priRes, trendRes, rRes] = await Promise.all([
        apiFetch(`${API}/orders/metrics`),
        apiFetch(`${API}/sla/overdue`),
        apiFetch(`${API}/orders/priority`),
        apiFetch(`${API}/reporting/daily-trend`),
        apiFetch(`${API}/orders?limit=10&dateFrom=${sevenAgo}`),
      ]);
      if (mRes.ok)     setMetrics(await mRes.json());
      if (slaRes.ok)   setOverdue(await slaRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
      let allIds: string[] = [];
      if (priRes.ok)  { const p = await priRes.json(); setActions(p); allIds.push(...p.map((o: any) => o.id)); }
      if (rRes.ok)    { const d = await rRes.json(); const list = d.orders || []; setRecent(list); allIds.push(...list.map((o: any) => o.id)); }
      if (allIds.length) {
        const unique = [...new Set(allIds)];
        const entries = await Promise.all(unique.map(async id => {
          try {
            const r = await apiFetch(`${API}/cad/order/${id}`);
            if (!r.ok) return null;
            const cads = await r.json();
            const ref = cads.find((c: any) => c.designerNotes === 'Reference image' || c.designerNotes === 'Customer reference image');
            return ref ? [id, `/uploads/cad/${ref.fileName}`] : null;
          } catch { return null; }
        }));
        const map: Record<string, string> = {};
        entries.forEach(e => { if (e) map[e[0]] = e[1]; });
        setRefImages(map);
      }
      setLoading(false);
    };
    load();
  }, []);

  const sc = (s: string) => parseInt(metrics?.byStatus.find(b => b.status === s)?.count || '0');
  const activeOrders = metrics?.byStatus.reduce((t, b) => ['COMPLETED','CANCELLED'].includes(b.status) ? t : t + parseInt(b.count), 0) ?? 0;

  // ─── Shared helpers ──────────────────────────────────────────────────────────
  const OrderRow = ({ o, showImg = true }: { o: any; showImg?: boolean }) => {
    const cfg = STATUS_CONFIG[o.status] || { label: o.status, color: '#6B7280', bg: '#F3F4F6' };
    const pc  = o.priorityLevel ? PRIORITY_COLORS[o.priorityLevel as keyof typeof PRIORITY_COLORS] : null;
    const img = refImages[o.id];
    return (
      <div onClick={() => router.push(`/orders/${o.id}`)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: pc ? `${pc}08` : 'var(--bg-input)', border: `1px solid ${pc ? pc + '30' : 'var(--border)'}`, borderLeft: pc ? `3px solid ${pc}` : '3px solid transparent', borderRadius: '8px', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = pc ? `${pc}14` : 'var(--bg-hover)'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = pc ? `${pc}08` : 'var(--bg-input)'}
      >
        {showImg && (img
          ? <img src={img} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid var(--border)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          : <div style={{ width: 40, height: 40, borderRadius: 6, flexShrink: 0, background: 'var(--bg-card)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text-muted)' }}>🖼</div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>{o.poNumber}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.storeName || o.customerFullName || '—'}{o.orderType ? ` · ${o.orderType}` : ''}
            {o.priorityReason ? ` · ${o.priorityReason}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontSize: 10, background: cfg.bg, color: cfg.color, padding: '2px 7px', borderRadius: 99, fontWeight: 600, display: 'block', marginBottom: 2 }}>{cfg.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    );
  };

  const KpiCard = ({ label, value, color, sub, link }: { label: string; value: any; color: string; sub: string; link?: string }) => (
    <div onClick={() => link && router.push(link)} style={{ ...card, padding: '18px 20px', cursor: link ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => { if (link) (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'}
    >
      <div style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 7px', borderRadius: 5, display: 'inline-block', marginBottom: 10 }}>{sub}</div>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 34, fontWeight: 600, color, lineHeight: 1, marginBottom: 4 }}>{loading ? '—' : value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
    </div>
  );

  const ActionSection = ({ title, items, link, showMore, setShowMore }: { title: string; items: any[]; link: string; showMore: boolean; setShowMore: (v: boolean) => void }) => (
    <div style={{ ...card, padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
        <a href={link} style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>View all →</a>
      </div>
      {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
      : items.length === 0 ? <div style={{ textAlign: 'center', padding: '24px 0' }}><div style={{ fontSize: 28, marginBottom: 8 }}>✅</div><div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>All clear</div></div>
      : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.slice(0, showMore ? items.length : 5).map(o => <OrderRow key={o.id} o={o} />)}
          {items.length > 5 && <button onClick={() => setShowMore(!showMore)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, paddingTop: 4, textAlign: 'center' }}>{showMore ? '▲ Show less' : `▼ Show ${items.length - 5} more`}</button>}
        </div>}
    </div>
  );

  const SLAPanel = () => (
    <div style={{ ...card, padding: '18px 22px', borderTop: `3px solid ${overdue.length > 0 ? '#EF4444' : '#059669'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>SLA Alerts</h2>
        <a href="/todos" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>View all →</a>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Orders created more than <strong>10 days ago</strong> that are not yet completed. Days counted from order creation date.
      </div>
      {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
      : overdue.length === 0
        ? <div style={{ textAlign: 'center', padding: '24px 0' }}><div style={{ fontSize: 28, marginBottom: 8 }}>✅</div><div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>All orders on time</div></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {overdue.map(o => (
              <div key={o.id} onClick={() => router.push(`/orders/${o.id}`)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 8, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(220,38,38,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(220,38,38,0.04)'}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{o.poNumber}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.storeName || o.slaLabel}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.1)', padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>{o.daysOld}d old</span>
              </div>
            ))}
          </div>}
    </div>
  );

  const TrendChart = () => (
    <div style={{ ...card, padding: '18px 22px' }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Weekly Trend — Last 7 Days</h2>
      {trend.length > 0
        ? <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(26,39,64,0.04)' }} />
                <Bar dataKey="created" fill="#1A2740" radius={[4,4,0,0]} name="Created" />
                <Bar dataKey="completed" fill="#059669" radius={[4,4,0,0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center' }}>
              {[{ c: '#1A2740', l: 'Created' }, { c: '#059669', l: 'Completed' }].map(i => (
                <div key={i.l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: i.c }} />{i.l}
                </div>
              ))}
            </div>
          </>
        : <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{loading ? 'Loading…' : 'No data'}</div>}
    </div>
  );

  const PipelineFunnel = () => (
    <div style={{ ...card, padding: '18px 22px', marginBottom: 24 }}>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Order Pipeline</h2>
      <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', overflowX: 'auto' }}>
        {PIPELINE_ORDER.map((status, i) => {
          const cfg = STATUS_CONFIG[status]; const count = sc(status); const isLast = i === PIPELINE_ORDER.length - 1;
          return (
            <React.Fragment key={status}>
              <div onClick={() => router.push(`/orders?status=${status}`)} style={{ flex: '1 1 0', minWidth: 80, background: count > 0 ? `${cfg.color}12` : 'var(--bg-input)', border: `1px solid ${count > 0 ? cfg.color + '40' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '12px 10px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { if (count > 0) (e.currentTarget as HTMLDivElement).style.background = `${cfg.color}22`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = count > 0 ? `${cfg.color}12` : 'var(--bg-input)'; }}>
                <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, fontWeight: 600, color: count > 0 ? cfg.color : 'var(--text-muted)', lineHeight: 1, marginBottom: 4 }}>{loading ? '—' : count}</div>
                <div style={{ fontSize: 10, color: count > 0 ? cfg.color : 'var(--text-muted)', fontWeight: 600, lineHeight: 1.3 }}>{cfg.label}</div>
              </div>
              {!isLast && <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: 12, flexShrink: 0, padding: '0 2px' }}>›</div>}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  // ─── ROLE-BASED DASHBOARD RENDER ─────────────────────────────────────────────

  // ADMIN / AUTHORIZER — full view
  if (!userRole || userRole === 'ADMIN' || userRole === 'AUTHORIZER') return (
    <AppLayout title="Dashboard" subtitle="Overview" actions={<button onClick={() => router.push('/orders')} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ New Order</button>}>
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Active Orders"  value={activeOrders}    color="#1A2740" sub="not completed or cancelled" link="/orders" />
        <KpiCard label="New This Week"  value={recent.length}   color="#0891B2" sub="last 7 days"                link="/orders" />
        <KpiCard label="SLA Breaches"   value={overdue.length}  color={overdue.length > 0 ? '#DC2626' : '#059669'} sub={overdue.length > 0 ? 'need attention' : 'all on time'} link="/todos" />
        <KpiCard label="My Actions"     value={actions.length}  color="#7C3AED" sub="priority tasks"             link="/todos" />
      </div>
      <PipelineFunnel />
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>
        <TrendChart />
        <SLAPanel />
      </div>
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ActionSection title="My Action Queue" items={actions} link="/todos"   showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="New This Week"   items={recent}  link="/orders"  showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // SALES REP — their customers/orders only
  if (userRole === 'SALES_REP') return (
    <AppLayout title="Dashboard" subtitle="My Orders" actions={<button onClick={() => router.push('/orders')} style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ New Order</button>}>
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="My Active Orders" value={activeOrders}   color="#1A2740" sub="all open orders"   link="/orders" />
        <KpiCard label="New This Week"    value={recent.length}  color="#0891B2" sub="last 7 days"       link="/orders" />
        <KpiCard label="Priority Actions" value={actions.length} color="#7C3AED" sub="needs attention"   link="/todos" />
      </div>
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ActionSection title="Priority Actions" items={actions} link="/todos"  showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="New This Week"    items={recent}  link="/orders" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // CAD DESIGNER — CAD queue
  if (userRole === 'CAD_DESIGNER') return (
    <AppLayout title="Dashboard" subtitle="CAD Queue">
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="In CAD Queue"     value={sc('CAD_IN_PROGRESS')} color="#6366F1" sub="awaiting design"  link="/orders?status=CAD_IN_PROGRESS" />
        <KpiCard label="Revision Needed"  value={actions.filter(a => a.priorityReason.toLowerCase().includes('revision')).length} color="#DC2626" sub="customer requested" link="/todos" />
        <KpiCard label="Awaiting Quote"   value={actions.filter(a => a.priorityReason.toLowerCase().includes('quote')).length} color="#F59E0B" sub="approved, price needed" link="/todos" />
      </div>
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ActionSection title="My Priority Queue" items={actions} link="/todos"  showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="Recent Activity"   items={recent}  link="/orders" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // SKU MANAGER — SKU queue
  if (userRole === 'SKU_MANAGER') return (
    <AppLayout title="Dashboard" subtitle="SKU Queue">
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Pending SKU"    value={sc('SKU_CREATION')}    color="#F97316" sub="ready for SKU generation" link="/orders?status=SKU_CREATION" />
        <KpiCard label="VPO Active"     value={sc('VPO_ISSUED')}      color="#0891B2" sub="SKU generated"            link="/orders?status=VPO_ISSUED" />
        <KpiCard label="Priority Tasks" value={actions.length}         color="#7C3AED" sub="needs attention"          link="/todos" />
      </div>
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ActionSection title="My Priority Queue" items={actions} link="/todos"  showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="Recent Activity"   items={recent}  link="/orders" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // FACTORY MANAGER — production queue
  if (userRole === 'FACTORY_MANAGER') return (
    <AppLayout title="Dashboard" subtitle="Production Queue">
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="VPO Active"        value={sc('VPO_ISSUED')}         color="#0891B2" sub="in production"      link="/orders?status=VPO_ISSUED" />
        <KpiCard label="With Contractor"   value={sc('PENDING_CONTRACTOR')} color="#F59E0B" sub="sent out"           link="/orders?status=PENDING_CONTRACTOR" />
        <KpiCard label="Ready to Ship"     value={sc('READY_TO_SHIP')}      color="#3B82F6" sub="awaiting shipping"  link="/orders?status=READY_TO_SHIP" />
        <KpiCard label="Priority Actions"  value={actions.length}           color="#DC2626" sub="need attention"     link="/todos" />
      </div>
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ActionSection title="My Priority Queue" items={actions} link="/todos"         showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="Production Orders" items={recent}  link="/manufacturing" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // STONE MANAGER — stone queue
  if (userRole === 'STONE_MANAGER') return (
    <AppLayout title="Dashboard" subtitle="Stone Queue">
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Pending Stone"   value={sc('VPO_ISSUED')} color="#7C3AED" sub="awaiting dispatch"  link="/orders?status=VPO_ISSUED" />
        <KpiCard label="Priority Tasks"  value={actions.length}   color="#DC2626" sub="> 1 day overdue"    link="/todos" />
        <KpiCard label="Total VPO"       value={sc('VPO_ISSUED')} color="#0891B2" sub="in VPO stage"       link="/orders" />
      </div>
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ActionSection title="Overdue Stone Orders" items={actions} link="/todos"  showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="All Stone Orders"     items={recent}  link="/orders" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // SHIPPING MANAGER — shipping queue
  if (userRole === 'SHIPPING_MANAGER') return (
    <AppLayout title="Dashboard" subtitle="Shipping Queue">
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Ready to Ship" value={sc('READY_TO_SHIP')} color="#3B82F6" sub="awaiting dispatch" link="/orders?status=READY_TO_SHIP" />
        <KpiCard label="Shipped"       value={sc('SHIPPED')}       color="#8B5CF6" sub="in transit"        link="/orders?status=SHIPPED" />
        <KpiCard label="Priority Tasks" value={actions.length}     color="#DC2626" sub="overdue items"     link="/todos" />
      </div>
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ActionSection title="Priority Shipments" items={actions} link="/todos"    showMore={showMoreA} setShowMore={setShowMoreA} />
        <ActionSection title="Recent Shipments"   items={recent}  link="/shipping" showMore={showMoreR} setShowMore={setShowMoreR} />
      </div>
    </AppLayout>
  );

  // CUSTOMER — their orders only
  if (userRole === 'CUSTOMER') return (
    <AppLayout title="My Orders" subtitle="Track your custom jewelry">
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Active Orders"  value={activeOrders}            color="#1A2740" sub="in progress"      link="/orders" />
        <KpiCard label="Ready to Ship"  value={sc('READY_TO_SHIP')}    color="#3B82F6" sub="being prepared"   link="/orders?status=READY_TO_SHIP" />
        <KpiCard label="Shipped"        value={sc('SHIPPED')}           color="#8B5CF6" sub="on the way"       link="/orders?status=SHIPPED" />
      </div>
      <ActionSection title="My Orders" items={recent} link="/orders" showMore={showMoreR} setShowMore={setShowMoreR} />
    </AppLayout>
  );

  // Fallback
  return <AppLayout title="Dashboard"><div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading…</div></AppLayout>;
}
