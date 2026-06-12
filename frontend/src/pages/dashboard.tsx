import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { OrderStatus, STATUS_CONFIG } from '../utils/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from 'recharts';

export async function getServerSideProps() { return { props: {} }; }

interface Metrics    { total: number; byStatus: { status: string; count: string }[] }
interface Overdue    { id: string; poNumber: string; storeName: string; status: string; daysOld: number; slaLabel: string }
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
  OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS, OrderStatus.SKU_CREATION, OrderStatus.VPO_ISSUED,
  OrderStatus.MANUFACTURED, OrderStatus.SHIPPED,
  OrderStatus.REPAIR, OrderStatus.COMPLETED,
];

const BAR_COLORS = [NAVY, '#243858', '#2E4870', GOLD, GOLD_DARK, '#8A6B2E'];
const PRIORITY_COLORS = { CRITICAL: '#7C3AED', HIGH: '#DC2626', MEDIUM: GOLD_DARK };

export default function Dashboard() {
  const router = useRouter();
  const [metrics, setMetrics]     = useState<Metrics | null>(null);
  const [overdue, setOverdue]     = useState<Overdue[]>([]);
  const [actions, setActions]     = useState<Priority[]>([]);
  const [recent, setRecent]       = useState<RecentOrder[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [monthReport, setMonthReport]     = useState<any>(null);
  const [monthLoading, setMonthLoading]   = useState(false);
  const [myOrderTotal, setMyOrderTotal] = useState<number>(0);
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
      const [mRes, slaRes, priRes, rRes] = await Promise.all([
        apiFetch(`${API}/orders/metrics`),
        apiFetch(`${API}/sla/overdue`),
        apiFetch(`${API}/orders/priority`),
        apiFetch(`${API}/orders?limit=10&dateFrom=${sevenAgo}`),
      ]);
      if (mRes.ok)   setMetrics(await mRes.json());
      if (slaRes.ok) setOverdue(await slaRes.json());
      // Fetch role-filtered total (used by Sales Rep and other roles)
      const myRes = await apiFetch(`${API}/orders?limit=1`);
      if (myRes.ok) { const d = await myRes.json(); setMyOrderTotal(d.total || 0); }
      let ids: string[] = [];
      if (priRes.ok) { const p = await priRes.json(); setActions(p); ids.push(...p.map((o: any) => o.id)); }
      if (rRes.ok)   { const d = await rRes.json(); const l = d.orders || []; setRecent(l); ids.push(...l.map((o: any) => o.id)); }
      if (ids.length) {
        const map: Record<string, string> = {};
        await Promise.all([...new Set(ids)].map(async id => {
          try {
            const r = await apiFetch(`${API}/cad/order/${id}`);
            if (!r.ok) return;
            const cads = await r.json();
            const ref = cads.find((c: any) => c.designerNotes === 'Reference image' || c.designerNotes === 'Customer reference image');
            if (ref) map[id] = `/uploads/cad/${ref.fileName}`;
          } catch {}
        }));
        setRefImages(map);
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const y = selectedMonth.getFullYear();
    const m = String(selectedMonth.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, selectedMonth.getMonth() + 1, 0).getDate();
    const from = `${y}-${m}-01`;
    const to   = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    setMonthLoading(true);
    apiFetch(`${API}/reporting/report?from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMonthReport(d); setMonthLoading(false); });
  }, [selectedMonth]);

  const sc = (s: string) => parseInt(metrics?.byStatus.find(b => b.status === s)?.count || '0');
  const activeOrders  = metrics?.byStatus.reduce((t, b) => ['COMPLETED','CANCELLED'].includes(b.status) ? t : t + parseInt(b.count), 0) ?? 0;
  const monthReceived  = monthReport?.newOrders ?? 0;
  const monthCompleted = monthReport?.completedOrders ?? 0;
  const pieData = [
    { name: `Received  ${monthReceived}`,   value: monthReceived,  fill: NAVY },
    { name: `Completed  ${monthCompleted}`, value: monthCompleted, fill: GOLD },
  ].filter(d => d.value > 0);
  const now2 = new Date();
  const isCurrentMonth = selectedMonth.getFullYear() === now2.getFullYear() && selectedMonth.getMonth() === now2.getMonth();
  const monthLabel = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const goPrev = () => setSelectedMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNext = () => setSelectedMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

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
          ? <img className="order-row-img" src={img} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid #E8E0D4' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
        <KpiCard label="SLA Breaches"   value={overdue.length} color={overdue.length > 0 ? '#DC2626' : '#059669'}  sub="orders older than 10 days"  link="/todos" accent />
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

      {/* ── Analytics ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '28px 0 18px' }}>
        <div style={{ width: 3, height: 18, background: GOLD, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 16, fontWeight: 700, color: NAVY, letterSpacing: '1px', whiteSpace: 'nowrap' }}>Monthly Analytics</span>
        <div style={{ flex: 1, height: 1, background: '#E8E0D4' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={goPrev} style={{ background: '#fff', border: '1px solid #E8E0D4', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: NAVY, fontSize: 16, fontWeight: 700, lineHeight: 1, padding: 0 }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, minWidth: 108, textAlign: 'center', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{monthLabel}</span>
          <button onClick={goNext} disabled={isCurrentMonth} style={{ background: '#fff', border: '1px solid #E8E0D4', borderRadius: 6, width: 28, height: 28, cursor: isCurrentMonth ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCurrentMonth ? '#C9D0D8' : NAVY, fontSize: 16, fontWeight: 700, lineHeight: 1, padding: 0 }}>›</button>
        </div>
      </div>
      <div className="dash-3col">

        {/* Monthly Activity — Pie */}
        <div style={{ ...card, padding: '20px 22px' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 600, color: NAVY, marginBottom: 3 }}>Monthly Activity</h2>
          <div style={{ fontSize: 13, color: '#9BA8B5', marginBottom: 14 }}>Received vs Completed — {monthLabel}</div>
          {monthLoading ? (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9BA8B5', fontSize: 13 }}>Loading…</div>
          ) : pieData.length === 0 ? (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9BA8B5', fontSize: 13 }}>No orders this month</div>
          ) : <>
            <ResponsiveContainer width="100%" height={155}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={68} innerRadius={34} paddingAngle={4}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E0D4', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(26,39,64,0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10 }}>
              {pieData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5C6B7A' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: d.fill }} />
                  {d.name}
                </div>
              ))}
            </div>
          </>}
        </div>

        {/* Top Customers */}
        <div style={{ ...card, padding: '20px 22px' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 600, color: NAVY, marginBottom: 3 }}>Top Customers</h2>
          <div style={{ fontSize: 13, color: '#9BA8B5', marginBottom: 14 }}>Most active — {monthLabel}</div>
          {monthLoading ? (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9BA8B5', fontSize: 13 }}>Loading…</div>
          ) : !monthReport?.topStores?.length ? (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9BA8B5', fontSize: 13 }}>No data this month</div>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={monthReport.topStores.slice(0, 5)} layout="vertical" margin={{ top: 2, right: 32, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#9BA8B5' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="store" tick={{ fontSize: 12, fill: '#5C6B7A' }} axisLine={false} tickLine={false} width={108} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E8E0D4', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(26,39,64,0.1)' }} formatter={(v) => [`${v} orders`, 'Orders']} />
                <Bar dataKey="count" radius={[0,5,5,0]}>
                  {monthReport.topStores.slice(0, 5).map((_: any, i: number) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* SLA Alerts */}
        <div style={{ ...card, padding: '20px 22px', borderTop: `3px solid ${overdue.length > 0 ? '#DC2626' : '#059669'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 19, fontWeight: 600, color: NAVY, margin: 0 }}>SLA Alerts</h2>
            <a href="/todos" style={{ fontSize: 11, color: GOLD, fontWeight: 600, textDecoration: 'none', marginTop: 4 }}>View all →</a>
          </div>
          <div style={{ fontSize: 13, color: '#9BA8B5', marginBottom: 14 }}>Orders older than 10 days not yet completed</div>
          {loading ? (
            <div style={{ color: '#9BA8B5', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Loading…</div>
          ) : overdue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>All orders on time</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 210, overflowY: 'auto' }}>
              {overdue.map(o => (
                <div key={o.id} onClick={() => router.push(`/orders/${o.id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'rgba(220,38,38,0.03)', border: '1px solid rgba(220,38,38,0.12)', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(220,38,38,0.07)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(220,38,38,0.03)'}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{o.poNumber}</div>
                    <div style={{ fontSize: 12, color: '#9BA8B5', marginTop: 1 }}>{o.storeName}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap' }}>{o.daysOld}d old</span>
                </div>
              ))}
            </div>
          )}
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
    SKU_MANAGER:     { subtitle: 'SKU Queue',         kpis: [{ label: 'Pending SKU', value: sc('SKU_CREATION'), color: '#F97316', sub: 'ready for generation', link: '/orders?status=SKU_CREATION' }, { label: 'Priority Tasks', value: actions.length, color: '#7C3AED', sub: 'needs attention', link: '/todos' }] },
    FACTORY_MANAGER: { subtitle: 'Production Queue',  kpis: [{ label: 'VPO Active', value: sc('VPO_ISSUED'), color: '#0891B2', sub: 'in production', link: '/orders?status=VPO_ISSUED' }, { label: 'Manufactured', value: sc('MANUFACTURED'), color: '#8B5CF6', sub: 'done, en route to US', link: '/orders?status=MANUFACTURED' }, { label: 'Priority', value: actions.length, color: '#DC2626', sub: 'need attention', link: '/todos' }] },
    STONE_MANAGER:   { subtitle: 'Stone Queue',       kpis: [{ label: 'Pending Stone', value: sc('VPO_ISSUED'), color: '#7C3AED', sub: 'awaiting dispatch', link: '/orders?status=VPO_ISSUED' }, { label: 'Priority Tasks', value: actions.length, color: '#DC2626', sub: '> 1 day overdue', link: '/todos' }] },
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
