import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, API } from '../../utils/apiFetch';
import { formatCurrency } from '../../utils/format';

interface WeeklyDay { date: string; dayLabel: string; received: number; approved: number; manufactured: number; cancelled: number }
interface TopCustomer { name: string; orderCount: number; amount: number }
interface TopSalesRep { repName: string; customerCount: number; orderCount: number }
interface DateRange { from: string; to: string }

const INFO = '#0EA5E9';
const MFG = '#8B5CF6';

function mondayOfWeek(offsetWeeks: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetWeeks * 7);
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(offsetMonths: number): { param: string; label: string } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  const param = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { param, label };
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-sm)', padding: '16px 20px', display: 'flex', flexDirection: 'column',
};

const reportTitleStyle: React.CSSProperties = { fontSize: '15px', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--text-secondary)' };
const periodStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' };
const arrowBtnStyle: React.CSSProperties = { width: '19px', height: '19px', borderRadius: '4px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', background: 'var(--bg-input)' };

function ViewToggle({ view, setView }: { view: 'table' | 'graph'; setView: (v: 'table' | 'graph') => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden', flexShrink: 0 }}>
      {(['table', 'graph'] as const).map(v => (
        <button
          key={v}
          onClick={() => setView(v)}
          title={v === 'table' ? 'Table view' : 'Graph view'}
          style={{
            border: 'none', borderRight: v === 'table' ? '1px solid var(--border)' : 'none',
            background: view === v ? 'var(--navy)' : 'var(--bg-input)', color: view === v ? '#fff' : 'var(--text-muted)',
            fontSize: '13px', padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
          }}
        >
          {v === 'table' ? '▤' : '📊'}
        </button>
      ))}
    </div>
  );
}

function CustomRangeControl({ active, onApply, onClear }: { active: DateRange | null; onApply: (r: DateRange) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(active?.from || '');
  const [to, setTo] = useState(active?.to || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const inputStyle: React.CSSProperties = { width: '100%', marginTop: '2px', fontSize: '12px', padding: '4px 5px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-input)', color: 'inherit', fontFamily: 'inherit' };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        style={{ ...arrowBtnStyle, width: 'auto', padding: '0 5px', color: active ? '#fff' : 'var(--text-secondary)', background: active ? 'var(--accent)' : 'var(--bg-input)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}
        title="Custom date range"
        onClick={() => { setFrom(active?.from || ''); setTo(active?.to || ''); setOpen(o => !o); }}
      >
        📅
      </span>
      {open && (
        <div style={{ position: 'absolute', top: '24px', left: 0, zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', padding: '10px', display: 'flex', flexDirection: 'column', gap: '7px', width: '190px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            From
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            To
            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
            <button
              disabled={!from || !to}
              onClick={() => { if (from && to) { onApply({ from, to }); setOpen(false); } }}
              style={{ flex: 1, fontSize: '12px', padding: '5px', border: 'none', borderRadius: '4px', background: 'var(--accent)', color: '#fff', cursor: from && to ? 'pointer' : 'not-allowed', opacity: from && to ? 1 : 0.5, fontFamily: 'inherit' }}
            >
              Apply
            </button>
            {active && (
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={{ fontSize: '12px', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-input)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '8px 8px', borderBottom: '1px solid var(--border-light)', fontSize: '13px' };

function RankBadge({ n }: { n: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px',
      borderRadius: '4px', background: n === 1 ? 'var(--accent-light)' : 'var(--bg-input)',
      color: n === 1 ? 'var(--accent-dark)' : 'var(--text-muted)', fontSize: '11px', fontWeight: 700, marginRight: '7px',
    }}>{n}</span>
  );
}

function HBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '9px' }}>
      <div style={{ width: '100px', flexShrink: 0, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, height: '11px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '4px', background: 'var(--accent)', width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <div style={{ width: '36px', textAlign: 'right', flexShrink: 0, fontSize: '13px', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export const ReportsSection: React.FC = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekCustomRange, setWeekCustomRange] = useState<DateRange | null>(null);
  const [weekly, setWeekly] = useState<WeeklyDay[]>([]);
  const [weeklyView, setWeeklyView] = useState<'table' | 'graph'>('table');

  const [monthOffset, setMonthOffset] = useState(0);
  const [customersCustomRange, setCustomersCustomRange] = useState<DateRange | null>(null);
  const [customerSortBy, setCustomerSortBy] = useState<'count' | 'amount'>('count');
  const [customers, setCustomers] = useState<TopCustomer[]>([]);
  const [customersView, setCustomersView] = useState<'table' | 'graph'>('table');

  const [repsMonthOffset, setRepsMonthOffset] = useState(0);
  const [repsCustomRange, setRepsCustomRange] = useState<DateRange | null>(null);
  const [reps, setReps] = useState<TopSalesRep[]>([]);
  const [repsView, setRepsView] = useState<'table' | 'graph'>('table');

  useEffect(() => {
    const params = weekCustomRange
      ? `dateFrom=${weekCustomRange.from}&dateTo=${weekCustomRange.to}`
      : `weekStart=${toISODate(mondayOfWeek(weekOffset))}`;
    apiFetch(`${API}/orders/reports/weekly?${params}`).then(r => r.ok ? r.json() : []).then(setWeekly).catch(() => {});
  }, [weekOffset, weekCustomRange]);

  useEffect(() => {
    const params = customersCustomRange
      ? `dateFrom=${customersCustomRange.from}&dateTo=${customersCustomRange.to}`
      : `month=${monthLabel(monthOffset).param}`;
    apiFetch(`${API}/orders/reports/top-customers?${params}&sortBy=${customerSortBy}`).then(r => r.ok ? r.json() : []).then(setCustomers).catch(() => {});
  }, [monthOffset, customersCustomRange, customerSortBy]);

  useEffect(() => {
    const params = repsCustomRange
      ? `dateFrom=${repsCustomRange.from}&dateTo=${repsCustomRange.to}`
      : `month=${monthLabel(repsMonthOffset).param}`;
    apiFetch(`${API}/orders/reports/top-sales-reps?${params}`).then(r => r.ok ? r.json() : []).then(setReps).catch(() => {});
  }, [repsMonthOffset, repsCustomRange]);

  const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekRange = weekly.length ? `${shortDate(weekly[0].date)} – ${shortDate(weekly[weekly.length - 1].date)}` : '';
  const weekTotals = weekly.reduce((acc, d) => ({ received: acc.received + d.received, approved: acc.approved + d.approved, manufactured: acc.manufactured + d.manufactured, cancelled: acc.cancelled + d.cancelled }), { received: 0, approved: 0, manufactured: 0, cancelled: 0 });
  const weekMax = Math.max(1, ...weekly.map(d => Math.max(d.received, d.approved, d.manufactured, d.cancelled)));
  const custMax = Math.max(1, ...customers.map(c => customerSortBy === 'amount' ? c.amount : c.orderCount));
  const repMax = Math.max(1, ...reps.map(r => r.orderCount));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>

      {/* Order Activity */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <div>
            <div style={reportTitleStyle}>Order Activity</div>
            <div style={periodStyle}>
              {weekCustomRange ? (
                <span>{weekRange || '…'}</span>
              ) : (
                <>
                  <span style={arrowBtnStyle} onClick={() => setWeekOffset(w => w - 1)}>‹</span>
                  Week of {weekRange || '…'}
                  <span style={arrowBtnStyle} onClick={() => setWeekOffset(w => w + 1)}>›</span>
                </>
              )}
              <CustomRangeControl active={weekCustomRange} onApply={setWeekCustomRange} onClear={() => setWeekCustomRange(null)} />
            </div>
          </div>
          <ViewToggle view={weeklyView} setView={setWeeklyView} />
        </div>

        {weeklyView === 'table' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}>Date</th><th style={{ ...thStyle, textAlign: 'right' }}>Received</th><th style={{ ...thStyle, textAlign: 'right' }}>Approved</th><th style={{ ...thStyle, textAlign: 'right' }}>Manufactured</th><th style={{ ...thStyle, textAlign: 'right' }}>Cancelled</th></tr></thead>
            <tbody>
              {weekly.map(d => (
                <tr key={d.date}>
                  <td style={tdStyle}>{d.dayLabel}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: INFO, fontWeight: 700 }}>{d.received}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{d.approved}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: MFG, fontWeight: 700 }}>{d.manufactured}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{d.cancelled}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>Total</td>
                <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', color: INFO, fontWeight: 700 }}>{weekTotals.received}</td>
                <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{weekTotals.approved}</td>
                <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', color: MFG, fontWeight: 700 }}>{weekTotals.manufactured}</td>
                <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{weekTotals.cancelled}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '118px', padding: '4px 2px 0' }}>
              {weekly.map(d => (
                <div key={d.date} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', height: '100%' }}>
                  <div style={{ width: '6px', borderRadius: '2px 2px 0 0', background: INFO, height: `${(d.received / weekMax) * 100}%` }} />
                  <div style={{ width: '6px', borderRadius: '2px 2px 0 0', background: 'var(--success)', height: `${(d.approved / weekMax) * 100}%` }} />
                  <div style={{ width: '6px', borderRadius: '2px 2px 0 0', background: MFG, height: `${(d.manufactured / weekMax) * 100}%` }} />
                  <div style={{ width: '6px', borderRadius: '2px 2px 0 0', background: 'var(--danger)', height: `${(d.cancelled / weekMax) * 100}%` }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              {weekly.map(d => <span key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>{d.date.slice(5).split('-').join('/')}</span>)}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><i style={{ width: '7px', height: '7px', borderRadius: '2px', background: INFO, display: 'inline-block' }} />Received</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><i style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--success)', display: 'inline-block' }} />Approved</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><i style={{ width: '7px', height: '7px', borderRadius: '2px', background: MFG, display: 'inline-block' }} />Manufactured</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><i style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--danger)', display: 'inline-block' }} />Cancelled</span>
            </div>
          </div>
        )}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '8px' }}>
          Each column counts independently — Approved/Cancelled reflect orders reaching that point on this date, not a breakdown of the same day's Received orders.
        </div>
      </div>

      {/* Top Customers */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <div>
            <div style={reportTitleStyle}>Top Customers</div>
            <div style={periodStyle}>
              {customersCustomRange ? (
                <span>{shortDate(customersCustomRange.from)} – {shortDate(customersCustomRange.to)}</span>
              ) : (
                <>
                  <span style={arrowBtnStyle} onClick={() => setMonthOffset(m => m - 1)}>‹</span>
                  {monthLabel(monthOffset).label}
                  <span style={arrowBtnStyle} onClick={() => setMonthOffset(m => m + 1)}>›</span>
                </>
              )}
              <CustomRangeControl active={customersCustomRange} onApply={setCustomersCustomRange} onClear={() => setCustomersCustomRange(null)} />
            </div>
          </div>
          <ViewToggle view={customersView} setView={setCustomersView} />
        </div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          {(['count', 'amount'] as const).map(s => (
            <button
              key={s}
              onClick={() => setCustomerSortBy(s)}
              style={{
                border: `1px solid ${customerSortBy === s ? 'var(--accent)' : 'var(--border)'}`,
                background: customerSortBy === s ? 'var(--accent)' : 'var(--bg-input)',
                color: customerSortBy === s ? '#fff' : 'var(--text-secondary)',
                fontSize: '12px', fontWeight: 600, padding: '4px 11px', borderRadius: '99px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {s === 'count' ? 'By Order Count' : 'By Amount'}
            </button>
          ))}
        </div>

        {customersView === 'table' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}>Customer</th><th style={{ ...thStyle, textAlign: 'right' }}>{customerSortBy === 'amount' ? 'Amount' : 'Orders'}</th></tr></thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.name}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}><RankBadge n={i + 1} />{c.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{customerSortBy === 'amount' ? formatCurrency(c.amount) : c.orderCount}</td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td style={tdStyle} colSpan={2}>No orders this month.</td></tr>}
            </tbody>
          </table>
        ) : (
          <div>
            {customers.map(c => (
              <HBar key={c.name} label={c.name} value={customerSortBy === 'amount' ? c.amount : c.orderCount} max={custMax} />
            ))}
          </div>
        )}
      </div>

      {/* Top Sales Reps */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <div>
            <div style={reportTitleStyle}>Top Sales Reps</div>
            <div style={periodStyle}>
              {repsCustomRange ? (
                <span>{shortDate(repsCustomRange.from)} – {shortDate(repsCustomRange.to)}</span>
              ) : (
                <>
                  <span style={arrowBtnStyle} onClick={() => setRepsMonthOffset(m => m - 1)}>‹</span>
                  {monthLabel(repsMonthOffset).label}
                  <span style={arrowBtnStyle} onClick={() => setRepsMonthOffset(m => m + 1)}>›</span>
                </>
              )}
              <CustomRangeControl active={repsCustomRange} onApply={setRepsCustomRange} onClear={() => setRepsCustomRange(null)} />
            </div>
          </div>
          <ViewToggle view={repsView} setView={setRepsView} />
        </div>

        {repsView === 'table' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}>Sales Rep</th><th style={{ ...thStyle, textAlign: 'right' }}>Customers</th><th style={{ ...thStyle, textAlign: 'right' }}>Orders</th></tr></thead>
            <tbody>
              {reps.map((r, i) => (
                <tr key={r.repName}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}><RankBadge n={i + 1} />{r.repName}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{r.customerCount}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{r.orderCount}</td>
                </tr>
              ))}
              {reps.length === 0 && <tr><td style={tdStyle} colSpan={3}>No orders yet.</td></tr>}
            </tbody>
          </table>
        ) : (
          <div>
            {reps.map(r => <HBar key={r.repName} label={r.repName} value={r.orderCount} max={repMax} />)}
          </div>
        )}
      </div>

    </div>
  );
};
