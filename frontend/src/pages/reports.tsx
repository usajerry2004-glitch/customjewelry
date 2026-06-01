import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { STATUS_CONFIG } from '../utils/types';

type Period = 'week' | 'month' | 'last_month';
interface Report {
  period: string; from: string; to: string;
  totalOrders: number; newOrders: number; completedOrders: number;
  activeOrders: number; cancelledOrders: number;
  byStatus: { status: string; count: number }[];
  topStores: { store: string; count: number }[];
  avgDaysToDelivery: number | null;
  totalRevenue: number;
}

const PERIOD_LABELS: Record<Period, string> = { week: 'Last 7 Days', month: 'This Month', last_month: 'Last Month' };

export async function getServerSideProps() { return { props: {} }; }

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [overdueOrders, setOverdueOrders] = useState<any[]>([]);

  useEffect(() => {
    try { const u = localStorage.getItem('jf_user'); if (u) setIsAdmin(JSON.parse(u).role === 'ADMIN'); } catch {}
  }, []);

  const load = async (p: Period) => {
    setLoading(true);
    const [rRes, oRes] = await Promise.all([
      apiFetch(`${API}/reporting/report?period=${p}`),
      apiFetch(`${API}/sla/overdue`),
    ]);
    if (rRes.ok) setReport(await rRes.json());
    if (oRes.ok) setOverdueOrders(await oRes.json());
    setLoading(false);
  };

  useEffect(() => { load(period); }, [period]);

  const exportPDF = () => {
    window.print();
  };

  const exportCSV = () => {
    if (!report) return;
    const rows = [
      ['Period', report.period],
      ['From', new Date(report.from).toLocaleDateString()],
      ['To',   new Date(report.to).toLocaleDateString()],
      [],
      ['Metric', 'Value'],
      ['New Orders', report.newOrders],
      ['Completed (Delivered)', report.completedOrders],
      ['Active Orders', report.activeOrders],
      ['Cancelled', report.cancelledOrders],
      ...(isAdmin ? [['Total Revenue', `$${report.totalRevenue.toLocaleString()}`]] : []),
      ['Avg Days to Delivery', report.avgDaysToDelivery ?? 'N/A'],
      [],
      ['Status', 'Count'],
      ...report.byStatus.map(s => [s.status, s.count]),
      [],
      ['Store', 'Orders (period)'],
      ...report.topStores.map(s => [s.store, s.count]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `kira-jewels-report-${period}.csv`;
    a.click();
  };

  const maxByStatus = Math.max(...(report?.byStatus.map(s => s.count) || [1]));
  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' };

  return (
    <AppLayout title="Reports" subtitle="Order pipeline analytics and SLA status"
      actions={
        <div className="report-actions" style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportCSV} disabled={!report} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
            ↓ CSV
          </button>
          <button onClick={exportPDF} disabled={!report} style={{ background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', cursor: 'pointer', color: '#fff', fontWeight: 600, opacity: !report ? 0.5 : 1 }}>
            ↓ Download PDF
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Period selector */}
        <div className="report-period-selector" style={{ display: 'flex', gap: '8px' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: period === p ? 700 : 500, cursor: 'pointer', border: period === p ? '2px solid var(--navy)' : '1px solid var(--border)', background: period === p ? 'var(--navy)' : 'var(--bg-card)', color: period === p ? '#fff' : 'var(--text-secondary)', transition: 'all .15s' }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Loading report…</div>
        ) : !report ? null : (
          <div id="printable-report">
            {/* Hidden header shown only in print */}
            <div id="print-header" style={{ display: 'none', marginBottom: '24px', borderBottom: '2px solid #0D1B35', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '22px', fontWeight: 700, color: '#0D1B35', letterSpacing: '1px' }}>KIRA JEWELS</div>
                  <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>Custom Jewelry Workflow — Order Analytics Report</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '11px', color: '#6B7280' }}>
                  <div style={{ fontWeight: 700, color: '#0D1B35' }}>{report.period}</div>
                  <div>{new Date(report.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(report.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <div style={{ marginTop: '2px' }}>Generated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </div>
              </div>
            </div>
          <>
            {/* ── KPI ROW ── */}
            <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              {[
                { label: 'New Orders',        value: report.newOrders,       color: '#6366F1', icon: '📥' },
                { label: 'Delivered',         value: report.completedOrders, color: '#10B981', icon: '✅' },
                { label: 'Active Pipeline',   value: report.activeOrders,    color: '#F59E0B', icon: '⚡' },
                { label: 'Avg Days Delivery', value: report.avgDaysToDelivery !== null ? `${report.avgDaysToDelivery}d` : '—', color: '#0EA5E9', icon: '📅' },
                ...(isAdmin ? [{ label: 'Revenue', value: `$${report.totalRevenue.toLocaleString()}`, color: '#059669', icon: '💰' }] : []),
              ].map(kpi => (
                <div key={kpi.label} style={{ ...card, borderTop: `3px solid ${kpi.color}` }}>
                  <div style={{ fontSize: '20px', marginBottom: '8px' }}>{kpi.icon}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '28px', fontWeight: 700, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 500 }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* ── 2-col: Status chart + Top Stores ── */}
            <div className="reports-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Orders by status */}
              <div style={card}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px' }}>Current Pipeline by Stage</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {report.byStatus.slice(0, 10).map(s => {
                    const cfg = STATUS_CONFIG[s.status] || { label: s.status, color: '#6B7280' };
                    const pct = Math.round((s.count / maxByStatus) * 100);
                    return (
                      <div key={s.status}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{cfg.label}</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color }}>{s.count}</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: '99px', transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Stores + Period info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={card}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px' }}>Top Stores / Customers</h3>
                  {report.topStores.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No orders in this period</div>
                  ) : (
                    report.topStores.map((s, i) => (
                      <div key={s.store} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < report.topStores.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', minWidth: '16px' }}>#{i + 1}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{s.store}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 8px' }}>{s.count}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ ...card, background: 'rgba(192,155,88,0.06)', border: '1px solid rgba(192,155,88,0.25)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-dark)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Report Period</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{report.period}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(report.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(report.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── SLA / OVERDUE ── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  ⚠️ SLA Breaches — Overdue Orders {overdueOrders.length > 0 && <span style={{ color: '#EF4444' }}>({overdueOrders.length})</span>}
                </h3>
                <a href="/orders" style={{ fontSize: '12px', color: 'var(--accent-dark)', fontWeight: 600, textDecoration: 'none' }}>View all orders →</a>
              </div>
              {overdueOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#10B981' }}>No SLA breaches — all orders on track</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)', borderBottom: '2px solid var(--border)' }}>
                        {['PO Number', 'Stage', 'Days Overdue', 'Action'].map(h => (
                          <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {overdueOrders.map((o, i) => (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'rgba(239,68,68,0.02)' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--navy)' }}>{o.poNumber}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: '11px', background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '5px', padding: '2px 8px' }}>{o.slaLabel}</span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: o.daysOverdue > 3 ? '#DC2626' : '#F59E0B' }}>+{o.daysOverdue} day{o.daysOverdue !== 1 ? 's' : ''}</span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <a href={`/orders/${o.id}`} style={{ fontSize: '11px', color: 'var(--accent-dark)', fontWeight: 600, textDecoration: 'none' }}>Open order →</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
