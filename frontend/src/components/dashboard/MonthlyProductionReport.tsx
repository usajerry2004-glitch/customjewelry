import React, { useEffect, useState } from 'react';
import { apiFetch, API } from '../../utils/apiFetch';

type PeriodType = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
type TileKey = 'direct' | 'cads' | 'samples' | 'revisions';
type BreakdownMode = 'person' | 'customer' | 'time';
type ViewMode = 'simple' | 'graph';

interface Kpi { value: number; deltaPct: number | null; inferred?: boolean }
interface DirectCustomerGroup { customer: string; orders: number; poNumbers: string[] }
interface CadAgg { name: string; made: number; approved: number; rejected: number; revised: number }
interface CadTimeAgg { bucket: string; made: number; approved: number; rejected: number; revised: number }
interface SamplePersonAgg { name: string; uploaded: number; approved: number }
interface SampleCustomerAgg { name: string; approved: number }
interface SampleTimeAgg { bucket: string; approved: number }
interface RevisionPersonAgg { name: string; uploaded: number; revised: number }
interface RevisionCustomerAgg { name: string; revised: number }
interface RevisionTimeAgg { bucket: string; revised: number }

interface ReportData {
  period: { type: PeriodType; from: string; to: string; label: string };
  kpis: { directOrders: Kpi; cadsMade: Kpi; samplesApproved: Kpi; revisionsCompleted: Kpi };
  direct: { byCustomer: DirectCustomerGroup[] };
  cads: { byPerson: CadAgg[]; byCustomer: CadAgg[]; byTime: CadTimeAgg[] };
  samples: { byPerson: SamplePersonAgg[]; byCustomer: SampleCustomerAgg[]; byTime: SampleTimeAgg[] };
  revisions: { byPerson: RevisionPersonAgg[]; byCustomer: RevisionCustomerAgg[]; byTime: RevisionTimeAgg[] };
}

const CADS_SERIES = [
  { key: 'made', label: 'CADs Made', color: '#6366F1' },
  { key: 'approved', label: 'Approved', color: '#059669' },
  { key: 'rejected', label: 'Rejected', color: '#DC2626' },
  { key: 'revised', label: 'Revised', color: '#8B5CF6' },
] as const;

const TILES: { key: TileKey; label: string; bg: string; color: string; caption: string; inferred: boolean }[] = [
  { key: 'direct', label: 'Direct Orders Received', bg: '#E0F2FE', color: '#0369A1', inferred: false,
    caption: 'Submitted directly via the customer portal — salesRepName = "Web Order".' },
  { key: 'cads', label: 'CADs Made', bg: '#EEF2FF', color: '#4338CA', inferred: false,
    caption: 'Design files uploaded by the CAD team this period.' },
  { key: 'samples', label: 'Samples Approved', bg: '#D1FAE5', color: '#047857', inferred: true,
    caption: 'Proxy: CAD files marked Approved. No physical-sample stage exists in the app.' },
  { key: 'revisions', label: 'Revisions Completed', bg: '#EDE9FE', color: '#6D28D9', inferred: true,
    caption: 'Next file uploaded after a Revision Requested status — not a stored event.' },
];

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
  boxShadow: 'var(--shadow-sm)', padding: '18px 22px',
};
const thStyle: React.CSSProperties = { textAlign: 'right', fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: '8px 8px', borderBottom: '1px solid var(--border-light)', fontSize: '13px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' };
const nameCellStyle: React.CSSProperties = { ...tdStyle, textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)' };

function monthShift(anchor: string, delta: number): string {
  const [y, m] = anchor.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function bucketUnit(period: PeriodType): 'day' | 'month' { return period === 'monthly' ? 'day' : 'month'; }
function bucketShortLabel(bucket: string, unit: 'day' | 'month'): string {
  if (unit === 'day') return String(parseInt(bucket.slice(8, 10), 10));
  return new Date(bucket + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' });
}
function bucketFullLabel(bucket: string, unit: 'day' | 'month'): string {
  if (unit === 'day') return new Date(bucket + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return new Date(bucket + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function shortName(s: string): string { return s.length > 16 ? s.slice(0, 15) + '…' : s; }

function Segmented({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px', gap: '2px', flexShrink: 0 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          style={{ border: 'none', background: value === o.value ? 'var(--navy)' : 'transparent', color: value === o.value ? '#fff' : 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 600, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function HBarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
      <div title={label} style={{ width: '150px', flexShrink: 0, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, height: '13px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '4px', background: color, width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <div style={{ width: '32px', textAlign: 'right', flexShrink: 0, fontSize: '13px', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function GroupedBarChart({ rows }: { rows: CadAgg[] }) {
  const max = Math.max(1, ...rows.flatMap(r => CADS_SERIES.map(s => (r as any)[s.key] as number)));
  const minWidth = Math.max(100, rows.length * 60);
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '150px', padding: '4px 4px 0', minWidth: `${minWidth}px` }}>
          {rows.map(r => (
            <div key={r.name} style={{ flex: 1, minWidth: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', height: '100%' }}>
              {CADS_SERIES.map(s => (
                <div key={s.key} title={`${s.label}: ${(r as any)[s.key]}`} style={{ width: '11px', borderRadius: '2px 2px 0 0', background: s.color, flexShrink: 0, height: `${((r as any)[s.key] / max) * 100}%` }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '6px', minWidth: `${minWidth}px` }}>
          {rows.map(r => <span key={r.name} title={r.name} style={{ flex: 1, textAlign: 'center', fontSize: '10.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(r.name)}</span>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {CADS_SERIES.map(s => <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><i style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, display: 'inline-block' }} />{s.label}</span>)}
      </div>
    </div>
  );
}

function TimeBarChart({ buckets, series, unit }: { buckets: string[]; series: { label: string; color: string; values: number[] }[]; unit: 'day' | 'month' }) {
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const tight = buckets.length > 12;
  const barW = tight ? 5 : 10;
  const gap = tight ? 4 : 10;
  const showEvery = buckets.length > 20 ? 5 : 1;
  const minWidth = Math.max(100, buckets.length * (tight ? 9 : 22));
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: `${gap}px`, height: '150px', padding: '4px 4px 0', minWidth: `${minWidth}px` }}>
          {buckets.map((b, i) => (
            <div key={b} style={{ flex: 1, minWidth: '10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', height: '100%' }}>
              {series.map(s => (
                <div key={s.label} title={`${s.label} — ${bucketFullLabel(b, unit)}: ${s.values[i]}`} style={{ width: `${barW}px`, borderRadius: '2px 2px 0 0', background: s.color, flexShrink: 0, height: `${(s.values[i] / max) * 100}%` }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: `${gap}px`, marginTop: '6px', minWidth: `${minWidth}px` }}>
          {buckets.map((b, i) => <span key={b} style={{ flex: 1, minWidth: '10px', textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>{i % showEvery === 0 ? bucketShortLabel(b, unit) : ''}</span>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {series.map(s => <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><i style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, display: 'inline-block' }} />{s.label}</span>)}
      </div>
    </div>
  );
}

export const MonthlyProductionReport: React.FC = () => {
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [anchorMonth, setAnchorMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTile, setSelectedTile] = useState<TileKey | null>(null);
  const [breakdownMode, setBreakdownMode] = useState<Record<'cads' | 'samples' | 'revisions', BreakdownMode>>({ cads: 'person', samples: 'person', revisions: 'person' });
  const [viewMode, setViewMode] = useState<Record<TileKey, ViewMode>>({ direct: 'simple', cads: 'simple', samples: 'simple', revisions: 'simple' });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErrorMessage(null);
    apiFetch(`${API}/reports/monthly-production?period=${periodType}&month=${anchorMonth}`)
      .then(async r => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => null);
        // eslint-disable-next-line no-console
        console.error('Monthly Production Report failed:', r.status, body);
        setErrorMessage(body?.message ? `${body.message} (${r.status})` : `Request failed (${r.status})`);
        return null;
      })
      .then(setData)
      .catch(err => { console.error('Monthly Production Report request error:', err); setErrorMessage('Network error — check your connection.'); setData(null); })
      .finally(() => setLoading(false));
  }, [periodType, anchorMonth]);

  const unit = bucketUnit(periodType);

  const renderDirectDetail = () => {
    if (!data) return null;
    const rows = data.direct.byCustomer;
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <Segmented options={[{ value: 'simple', label: '▤ Simple' }, { value: 'graph', label: '📊 Graph' }]} value={viewMode.direct} onChange={v => setViewMode(m => ({ ...m, direct: v as ViewMode }))} />
        </div>
        {viewMode.direct === 'simple' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>Customer / Store</th><th style={{ ...thStyle, textAlign: 'center' }}>Orders</th><th style={{ ...thStyle, textAlign: 'left' }}>PO Numbers</th></tr></thead>
              <tbody>
                {rows.map(g => (
                  <tr key={g.customer}>
                    <td style={nameCellStyle}>{g.customer}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{g.orders}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {g.poNumbers.map(po => <span key={po} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-dark)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 6px', margin: '1px 3px 1px 0', display: 'inline-block' }}>{po}</span>)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td style={tdStyle} colSpan={3}>No direct orders this period.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div>{rows.map(g => <HBarRow key={g.customer} label={g.customer} value={g.orders} max={Math.max(1, ...rows.map(r => r.orders))} color="#0EA5E9" />)}</div>
        )}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '12px' }}>One row per customer — multiple orders in the period list all their PO numbers together.</div>
      </>
    );
  };

  const renderGroupedMetricDetail = (key: 'cads' | 'samples' | 'revisions') => {
    if (!data) return null;
    const mode = breakdownMode[key];
    const view = viewMode[key];
    const color = TILES.find(t => t.key === key)!.color;

    let body: React.ReactNode = null;

    if (mode === 'time') {
      const buckets = key === 'cads' ? data.cads.byTime.map(b => b.bucket) : key === 'samples' ? data.samples.byTime.map(b => b.bucket) : data.revisions.byTime.map(b => b.bucket);
      if (key === 'cads') {
        const series = CADS_SERIES.map(s => ({ label: s.label, color: s.color, values: data.cads.byTime.map(b => (b as any)[s.key] as number) }));
        body = view === 'graph' ? <TimeBarChart buckets={buckets} series={series} unit={unit} /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>{unit === 'day' ? 'Day' : 'Month'}</th>{CADS_SERIES.map(s => <th key={s.key} style={thStyle}>{s.label}</th>)}</tr></thead>
              <tbody>
                {data.cads.byTime.map(b => (
                  <tr key={b.bucket}>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{bucketFullLabel(b.bucket, unit)}</td>
                    {CADS_SERIES.map(s => <td key={s.key} style={{ ...tdStyle, color: s.color, fontWeight: 700 }}>{(b as any)[s.key]}</td>)}
                  </tr>
                ))}
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'left', borderBottom: 'none', borderTop: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>Total</td>
                  {CADS_SERIES.map(s => <td key={s.key} style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', color: s.color, fontWeight: 700 }}>{data.cads.byTime.reduce((a, b) => a + (b as any)[s.key], 0)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        );
      } else {
        const rows = key === 'samples' ? data.samples.byTime : data.revisions.byTime;
        const metricKey = key === 'samples' ? 'approved' : 'revised';
        const metricLabel = key === 'samples' ? 'CADs Approved' : 'Revisions Completed';
        const values = rows.map((b: any) => b[metricKey] as number);
        body = view === 'graph' ? <TimeBarChart buckets={buckets} series={[{ label: metricLabel, color, values }]} unit={unit} /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>{unit === 'day' ? 'Day' : 'Month'}</th><th style={thStyle}>{metricLabel}</th></tr></thead>
              <tbody>
                {rows.map((b: any) => <tr key={b.bucket}><td style={{ ...tdStyle, textAlign: 'left' }}>{bucketFullLabel(b.bucket, unit)}</td><td style={{ ...tdStyle, color, fontWeight: 700 }}>{b[metricKey]}</td></tr>)}
                <tr>
                  <td style={{ ...tdStyle, textAlign: 'left', borderBottom: 'none', borderTop: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>Total</td>
                  <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', color, fontWeight: 700 }}>{values.reduce((a, b) => a + b, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      }
    } else {
      if (key === 'cads') {
        const rows = mode === 'person' ? data.cads.byPerson : data.cads.byCustomer;
        body = view === 'graph' ? <GroupedBarChart rows={rows} /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>{mode === 'person' ? 'CAD Person' : 'Customer'}</th><th style={thStyle}>CADs Made</th><th style={thStyle}>Approved</th><th style={thStyle}>Rejected</th><th style={thStyle}>Revised</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name}>
                    <td style={nameCellStyle}>{r.name}</td>
                    <td style={{ ...tdStyle, color: '#4338CA', fontWeight: 700 }}>{r.made}</td>
                    <td style={{ ...tdStyle, color: 'var(--success)', fontWeight: 700 }}>{r.approved}</td>
                    <td style={{ ...tdStyle, color: 'var(--danger)', fontWeight: 700 }}>{r.rejected}</td>
                    <td style={{ ...tdStyle, color: '#8B5CF6', fontWeight: 700 }}>{r.revised}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td style={tdStyle} colSpan={5}>No CAD files this period.</td></tr>}
              </tbody>
            </table>
          </div>
        );
      } else if (key === 'samples') {
        if (mode === 'person') {
          const rows = data.samples.byPerson;
          body = view === 'graph' ? <div>{rows.map(r => <HBarRow key={r.name} label={r.name} value={r.approved} max={Math.max(1, ...rows.map(x => x.approved))} color={color} />)}</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>CAD Person</th><th style={thStyle}>CADs Uploaded</th><th style={thStyle}>CADs Approved</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r.name}><td style={nameCellStyle}>{r.name}</td><td style={tdStyle}>{r.uploaded}</td><td style={{ ...tdStyle, color, fontWeight: 700 }}>{r.approved}</td></tr>)}
              {rows.length === 0 && <tr><td style={tdStyle} colSpan={3}>No approvals this period.</td></tr>}</tbody>
            </table>
          );
        } else {
          const rows = data.samples.byCustomer;
          body = view === 'graph' ? <div>{rows.map(r => <HBarRow key={r.name} label={r.name} value={r.approved} max={Math.max(1, ...rows.map(x => x.approved))} color={color} />)}</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>Customer</th><th style={thStyle}>CADs Approved</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r.name}><td style={nameCellStyle}>{r.name}</td><td style={{ ...tdStyle, color, fontWeight: 700 }}>{r.approved}</td></tr>)}
              {rows.length === 0 && <tr><td style={tdStyle} colSpan={2}>No approvals this period.</td></tr>}</tbody>
            </table>
          );
        }
      } else {
        if (mode === 'person') {
          const rows = data.revisions.byPerson;
          body = view === 'graph' ? <div>{rows.map(r => <HBarRow key={r.name} label={r.name} value={r.revised} max={Math.max(1, ...rows.map(x => x.revised))} color={color} />)}</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>CAD Person</th><th style={thStyle}>CADs Uploaded</th><th style={thStyle}>Revisions Completed</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r.name}><td style={nameCellStyle}>{r.name}</td><td style={tdStyle}>{r.uploaded}</td><td style={{ ...tdStyle, color, fontWeight: 700 }}>{r.revised}</td></tr>)}
              {rows.length === 0 && <tr><td style={tdStyle} colSpan={3}>No revisions completed this period.</td></tr>}</tbody>
            </table>
          );
        } else {
          const rows = data.revisions.byCustomer;
          body = view === 'graph' ? <div>{rows.map(r => <HBarRow key={r.name} label={r.name} value={r.revised} max={Math.max(1, ...rows.map(x => x.revised))} color={color} />)}</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thStyle, textAlign: 'left' }}>Customer</th><th style={thStyle}>Revisions Completed</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r.name}><td style={nameCellStyle}>{r.name}</td><td style={{ ...tdStyle, color, fontWeight: 700 }}>{r.revised}</td></tr>)}
              {rows.length === 0 && <tr><td style={tdStyle} colSpan={2}>No revisions completed this period.</td></tr>}</tbody>
            </table>
          );
        }
      }
    }

    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Breakdown</span>
            <Segmented
              options={[{ value: 'person', label: 'CAD Person-wise' }, { value: 'customer', label: 'Customer-wise' }, { value: 'time', label: unit === 'day' ? 'Day-wise' : 'Month-wise' }]}
              value={mode}
              onChange={v => setBreakdownMode(m => ({ ...m, [key]: v as BreakdownMode }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>View</span>
            <Segmented options={[{ value: 'simple', label: '▤ Simple' }, { value: 'graph', label: '📊 Graph' }]} value={view} onChange={v => setViewMode(m => ({ ...m, [key]: v as ViewMode }))} />
          </div>
        </div>
        {body}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '12px' }}>
          {key !== 'cads' ? 'Rows are inferred — see the note above.' : 'Made / Approved / Rejected / Revised reflect files created this period, by current status.'}
        </div>
      </>
    );
  };

  return (
    <div style={{ ...cardStyle, marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Monthly Production Report</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span onClick={() => setAnchorMonth(a => monthShift(a, -1))} style={{ width: '19px', height: '19px', borderRadius: '4px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', cursor: 'pointer', background: 'var(--bg-input)' }}>‹</span>
            {data?.period.label || '…'}
            <span onClick={() => setAnchorMonth(a => monthShift(a, 1))} style={{ width: '19px', height: '19px', borderRadius: '4px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', cursor: 'pointer', background: 'var(--bg-input)' }}>›</span>
          </div>
        </div>
        <Segmented
          options={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'halfyearly', label: 'Half-Yearly' }, { value: 'yearly', label: 'Yearly' }]}
          value={periodType}
          onChange={v => setPeriodType(v as PeriodType)}
        />
      </div>

      {loading && !data ? (
        <div style={{ color: 'var(--text-muted)', padding: '30px 0', textAlign: 'center', fontSize: '13px' }}>Loading…</div>
      ) : !data ? (
        <div style={{ color: 'var(--text-muted)', padding: '30px 0', textAlign: 'center', fontSize: '13px' }}>
          Couldn't load this report.{errorMessage && <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--danger)' }}>{errorMessage}</div>}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px', marginBottom: '18px' }}>
            {TILES.map(t => {
              const kpi = data.kpis[t.key === 'direct' ? 'directOrders' : t.key === 'cads' ? 'cadsMade' : t.key === 'samples' ? 'samplesApproved' : 'revisionsCompleted'];
              const isSelected = selectedTile === t.key;
              const up = (kpi.deltaPct ?? 0) >= 0;
              return (
                <button key={t.key} onClick={() => setSelectedTile(isSelected ? null : t.key)}
                  style={{ background: t.bg, borderRadius: '10px', padding: '14px 16px', border: `1.5px ${t.inferred ? 'dashed' : 'solid'} ${isSelected ? 'var(--navy)' : 'transparent'}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxShadow: isSelected ? 'var(--shadow-md)' : 'none' }}
                >
                  <div style={{ fontSize: '10px', letterSpacing: '0.6px', textTransform: 'uppercase', fontWeight: 700, color: t.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {t.label}{t.inferred && <span style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', padding: '1px 5px', borderRadius: '4px', background: 'rgba(0,0,0,0.08)' }}>inferred</span>}
                  </div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px', marginTop: '6px', lineHeight: 1, color: t.color }}>{kpi.value}</div>
                  {kpi.deltaPct !== null && (
                    <div style={{ fontSize: '11.5px', fontWeight: 700, marginTop: '5px', color: up ? 'var(--success)' : 'var(--danger)' }}>{up ? '▲' : '▼'} {Math.abs(kpi.deltaPct)}% vs prior period</div>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.45 }}>{t.caption}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '9px', color: t.color, opacity: 0.85 }}>{isSelected ? '▾ Viewing detail rows' : '↳ View detail rows'}</div>
                </button>
              );
            })}
          </div>

          {selectedTile && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{TILES.find(t => t.key === selectedTile)!.label} — {data.period.label}</div>
                <button onClick={() => setSelectedTile(null)} style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>← Back to summary</button>
              </div>
              {selectedTile === 'direct' ? renderDirectDetail() : renderGroupedMetricDetail(selectedTile)}
            </div>
          )}
        </>
      )}
    </div>
  );
};
