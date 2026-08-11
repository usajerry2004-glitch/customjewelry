import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { ReportsSection } from '../components/dashboard/ReportsSection';
import { MonthlyProductionReport } from '../components/dashboard/MonthlyProductionReport';
import { CadTrackingSection } from '../components/reports/CadTrackingSection';
import { UserRole } from '../utils/types';

const RAIL_ITEMS: { id: string; label: string }[] = [
  { id: 'order-activity', label: 'Order Activity' },
  { id: 'top-customers', label: 'Top Customers' },
  { id: 'top-sales-reps', label: 'Top Sales Reps' },
  { id: 'monthly-production', label: 'Monthly Production' },
];
const WORKBOOK_ITEMS: { id: string; label: string }[] = [
  { id: 'style-count', label: 'Daily Per-Person Style Count' },
  { id: 'cad-channel', label: 'CAD Report — by Channel' },
  { id: 'approval-rate', label: 'CAD Approval Rate' },
  { id: 'channel-comparison', label: 'Kira vs V+V Comparison' },
  { id: 'revision-activity', label: 'Revision Activity' },
];

export default function ReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState('order-activity');

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      const parsed = u ? JSON.parse(u) : null;
      if (!parsed || parsed.role !== UserRole.ADMIN) { router.replace('/dashboard'); return; }
      setReady(true);
    } catch {
      router.replace('/dashboard');
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const sections = [...RAIL_ITEMS, ...WORKBOOK_ITEMS].map(i => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-90px 0px -70% 0px' });
    sections.forEach(s => io.observe(s));
    return () => io.disconnect();
  }, [ready]);

  if (!ready) return <AppLayout title="Reports"><div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading…</div></AppLayout>;

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const railLinkStyle = (id: string): React.CSSProperties => ({
    padding: '7px 10px', borderRadius: '7px', fontSize: '12.5px', cursor: 'pointer', display: 'block',
    background: active === id ? 'var(--navy)' : 'transparent', color: active === id ? '#fff' : 'var(--text-secondary)', fontWeight: active === id ? 600 : 400,
  });

  return (
    <AppLayout title="Reports" subtitle="Every dashboard report, plus everything your CAD tracking sheets used to cover — now computed live from real data">
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <aside style={{ width: '210px', flexShrink: 0, position: 'sticky', top: '20px', display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 10px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700, padding: '0 6px 5px' }}>Dashboard</div>
          {RAIL_ITEMS.map(i => <a key={i.id} onClick={() => jump(i.id)} style={railLinkStyle(i.id)}>{i.label}</a>)}
          <div style={{ margin: '10px 6px', borderTop: '1px solid var(--border-light)' }} />
          {WORKBOOK_ITEMS.map(i => <a key={i.id} onClick={() => jump(i.id)} style={railLinkStyle(i.id)}>{i.label}</a>)}
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <ReportsSection />
          <div id="monthly-production" style={{ scrollMarginTop: '20px' }}><MonthlyProductionReport /></div>
          <CadTrackingSection />
        </div>
      </div>
    </AppLayout>
  );
}
