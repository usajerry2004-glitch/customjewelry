import React, { useEffect, useState } from 'react';
import { apiFetch, API } from '../../utils/apiFetch';
import { downloadCsv } from '../../utils/csvExport';

interface ApprovalDetail { style: string; date: string; approved: boolean; family: string }
interface RevisionStyle { style: string; dates: string[]; count: number }
interface PersonRow {
  name: string; counts: number[]; total: number; kira: number[]; vv: number[]; kiraTotal: number; vvTotal: number;
  approvalStyles: number; approvalApproved: number; approvalDetail: ApprovalDetail[];
  revisionStyles: RevisionStyle[]; distinctStyles: number; totalEntries: number; revisions: number;
}
interface CadRecord { d: string; p: string; s: string; f: string; a: boolean }
interface CadTrackingData {
  dates: string[]; dateLabels: Record<string, string>; people: PersonRow[];
  channel: Record<string, { styles: number; approvals: number }>; records: CadRecord[];
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-sm)', padding: '18px 22px', scrollMarginTop: '20px',
};
const titleStyle: React.CSSProperties = { fontSize: '15px', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--text-secondary)' };
const descStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '560px', lineHeight: 1.55 };
const sheetTag: React.CSSProperties = { fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#4338CA', background: '#EEF2FF', border: '1px solid rgba(67,56,202,0.25)', borderRadius: '99px', padding: '2px 8px' };
const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 8px', borderBottom: '1px solid var(--border-light)', fontSize: '13px' };
const downloadBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent-dark)', fontSize: '11.5px', fontWeight: 700, padding: '6px 13px', borderRadius: '99px', cursor: 'pointer', whiteSpace: 'nowrap' };
const pillStyle = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'var(--bg-input)', color: active ? '#fff' : 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 600, padding: '5px 12px', borderRadius: '99px', cursor: 'pointer' });
const segStyle = (active: boolean): React.CSSProperties => ({ border: 'none', background: active ? 'var(--navy)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 600, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' });
const segWrapStyle: React.CSSProperties = { display: 'flex', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px', gap: '2px' };
const dateChip = (multi: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', fontSize: '10.5px', fontWeight: 600, background: multi ? 'var(--accent-light)' : 'var(--bg-input)', border: `1px solid ${multi ? 'var(--accent)' : 'var(--border)'}`, color: multi ? 'var(--accent-dark)' : 'var(--text-secondary)', borderRadius: '99px', padding: '2px 8px', margin: '1px 3px 1px 0' });
const rankStyle = (first: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '4px', background: first ? 'var(--accent-light)' : 'var(--bg-input)', color: first ? 'var(--accent-dark)' : 'var(--text-muted)', fontSize: '11px', fontWeight: 700, marginRight: '7px' });

function shortDate(iso: string): string { return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fullDate(iso: string): string { return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '9px' }}>
      <div style={{ width: '150px', flexShrink: 0, fontSize: '12.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, height: '12px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '4px', background: color, width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <div style={{ width: '34px', textAlign: 'right', flexShrink: 0, fontSize: '12.5px', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// Anchored right where you clicked, not a page-centered modal — so it opens
// on top of the row/cell you were actually looking at instead of dumping you
// back at the top of a long scrolled page behind a full-screen dim.
function DrillPopover({ title, sub, rows, top, left, onClose }: { title: string; sub: string; rows: CadRecord[]; top: number; left: number; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
      <div style={{ position: 'fixed', top, left, zIndex: 300, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)', width: '520px', maxWidth: '92vw', maxHeight: '70vh', overflow: 'auto', padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '6px' }}>
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '19px', fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px', marginBottom: '12px' }}>{sub}</div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', width: '26px', height: '26px', flexShrink: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>✕</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Person</th><th style={thStyle}>Style No.</th><th style={thStyle}>Family</th><th style={thStyle}>Approved</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((r, i) => (
                <tr key={i}><td style={tdStyle}>{fullDate(r.d)}</td><td style={{ ...tdStyle, fontWeight: 600 }}>{r.p}</td><td style={tdStyle}>{r.s}</td><td style={tdStyle}>{r.f}</td><td style={tdStyle}>{r.a ? '✅' : '—'}</td></tr>
              )) : <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No rows match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export const CadTrackingSection: React.FC = () => {
  const [dateTo, setDateTo] = useState(() => toISODate(new Date()));
  const [dateFrom, setDateFrom] = useState(() => toISODate(new Date(Date.now() - 6 * 86400000)));
  const [data, setData] = useState<CadTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<{ title: string; sub: string; rows: CadRecord[]; top: number; left: number } | null>(null);

  const [channelLens, setChannelLens] = useState<'all' | 'Kira' | 'V+V'>('all');
  const [expandedPeople, setExpandedPeople] = useState<Set<string>>(new Set());
  const [scMode, setScMode] = useState<'grid' | 'person' | 'day'>('grid');
  const [scView, setScView] = useState<'table' | 'graph'>('table');

  const [ccCollapsed, setCcCollapsed] = useState(false);

  const [arSort, setArSort] = useState<'styles' | 'rate'>('styles');
  const [arExpanded, setArExpanded] = useState<Set<string>>(new Set());

  const [revExpanded, setRevExpanded] = useState<Set<string>>(new Set());

  const [sdQuery, setSdQuery] = useState('');
  const [sdFamily, setSdFamily] = useState<'all' | 'Kira' | 'V+V'>('all');

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API}/reports/cad-tracking?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  if (loading && !data) return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading your CAD tracking data…</div>;
  if (!data) return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Couldn't load this report.</div>;

  const { dates, dateLabels, records } = data;
  const personCounts = (p: PersonRow) => channelLens === 'all' ? p.counts : (channelLens === 'Kira' ? p.kira : p.vv);
  const people = data.people;
  const dayTotals = dates.map((_, i) => people.reduce((s, p) => s + personCounts(p)[i], 0));
  const grand = dayTotals.reduce((a, b) => a + b, 0);

  const POPOVER_W = 520, POPOVER_H_EST = 380;
  const drillFor = (title: string, sub: string, filter: (r: CadRecord) => boolean, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + POPOVER_W > window.innerWidth - 16) left = Math.max(16, window.innerWidth - POPOVER_W - 16);
    if (top + POPOVER_H_EST > window.innerHeight - 16) top = Math.max(16, rect.top - POPOVER_H_EST - 6);
    setDrill({ title, sub, rows: records.filter(filter), top, left });
  };

  return (
    <>
      {/* ── shared date range for every "Your Workbook" report below ── */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', padding: '14px 22px' }}>
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          Every report below is computed live from your <strong>cad_files</strong> and <strong>orders</strong> data — no manual sheet needed.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>From</label>
          <input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: '12px', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>To</label>
          <input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} style={{ fontSize: '12px', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {/* ── Daily Per-Person Style Count ── */}
      <div id="style-count" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={titleStyle}>Daily Per-Person Style Count</span><span style={sheetTag}>cad_files</span>
            </div>
            <p style={descStyle}>How many styles each CAD person touched, per day. Click a name to split it into Kira vs V+V; click any number to see the exact style rows behind it.</p>
          </div>
          <button style={downloadBtnStyle} onClick={() => downloadCsv(`Daily_Per_Person_Style_Count_${dateFrom}_${dateTo}.csv`, ['Person', ...dates.map(d => dateLabels[d]), 'Total'], people.map(p => [p.name, ...personCounts(p), p.total]))}>⬇ Download CSV</button>
        </div>

        {channelLens !== 'all' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--accent-light)', color: 'var(--accent-dark)', fontSize: '12px', fontWeight: 600, padding: '8px 12px', borderRadius: '8px', margin: '12px 0' }}>
            <span>Showing {channelLens === 'Kira' ? 'custom (non-V+V)' : 'V+V (Vow and Vine)'} styles only</span>
            <button onClick={() => setChannelLens('all')} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--accent-dark)', color: 'var(--accent-dark)', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Reset to all channels</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '14px 0 10px' }}>
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Breakdown</span>
          <div style={segWrapStyle}>
            {(['grid', 'person', 'day'] as const).map(m => (
              <button key={m} style={segStyle(scMode === m)} onClick={() => setScMode(m)}>{m === 'grid' ? 'Full Grid' : m === 'person' ? 'By Person' : 'By Day'}</button>
            ))}
          </div>
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginLeft: '8px' }}>View</span>
          <div style={segWrapStyle}>
            <button style={segStyle(scMode === 'grid' || scView === 'table')} disabled={scMode === 'grid'} onClick={() => setScView('table')}>▤ Table</button>
            <button style={{ ...segStyle(scMode !== 'grid' && scView === 'graph'), opacity: scMode === 'grid' ? 0.4 : 1, cursor: scMode === 'grid' ? 'not-allowed' : 'pointer' }} disabled={scMode === 'grid'} title={scMode === 'grid' ? "A big grid doesn't chart well — switch to By Person or By Day" : undefined} onClick={() => scMode !== 'grid' && setScView('graph')}>📊 Graph</button>
          </div>
        </div>

        {scMode === 'grid' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}></th><th style={thStyle}>Person</th>{dates.map(d => <th key={d} style={{ ...thStyle, textAlign: 'right' }}>{dateLabels[d]}</th>)}<th style={{ ...thStyle, textAlign: 'right', color: 'var(--accent-dark)' }}>Total</th></tr></thead>
              <tbody>
                {people.map(p => {
                  const counts = personCounts(p);
                  const total = counts.reduce((a, b) => a + b, 0);
                  const open = expandedPeople.has(p.name);
                  return (
                    <React.Fragment key={p.name}>
                      <tr>
                        <td style={{ ...tdStyle, width: '18px' }}>{channelLens === 'all' && (
                          <span onClick={() => setExpandedPeople(s => { const n = new Set(s); n.has(p.name) ? n.delete(p.name) : n.add(p.name); return n; })}
                            style={{ cursor: 'pointer', fontSize: '10px', color: 'var(--text-muted)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
                        )}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, cursor: channelLens === 'all' ? 'pointer' : 'default' }}
                          onClick={() => channelLens === 'all' && setExpandedPeople(s => { const n = new Set(s); n.has(p.name) ? n.delete(p.name) : n.add(p.name); return n; })}>{p.name}</td>
                        {counts.map((c, i) => (
                          <td key={i} style={{ ...tdStyle, textAlign: 'right', cursor: 'pointer' }}
                            onClick={e => drillFor(`${p.name} — ${dateLabels[dates[i]]}`, `${records.filter(r => r.p === p.name && r.d === dates[i] && (channelLens === 'all' || r.f === channelLens)).length} styles behind this cell`, r => r.p === p.name && r.d === dates[i] && (channelLens === 'all' || r.f === channelLens), e)}>{c}</td>
                        ))}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--accent-dark)', cursor: 'pointer' }}
                          onClick={e => drillFor(`${p.name} — full range`, `${total} styles across ${dates.length} day${dates.length === 1 ? '' : 's'}`, r => r.p === p.name && (channelLens === 'all' || r.f === channelLens), e)}>{total}</td>
                      </tr>
                      {channelLens === 'all' && open && (
                        <>
                          <tr style={{ background: 'var(--bg-input)' }}>
                            <td style={tdStyle}></td><td style={{ ...tdStyle, color: '#0369A1', fontSize: '12px' }}>↳ Kira</td>
                            {p.kira.map((c, i) => <td key={i} style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{c}</td>)}
                            <td style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{p.kiraTotal}</td>
                          </tr>
                          <tr style={{ background: 'var(--bg-input)' }}>
                            <td style={tdStyle}></td><td style={{ ...tdStyle, color: '#6D28D9', fontSize: '12px' }}>↳ V+V</td>
                            {p.vv.map((c, i) => <td key={i} style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{c}</td>)}
                            <td style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{p.vvTotal}</td>
                          </tr>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
                <tr>
                  <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)' }}></td>
                  <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>Total</td>
                  {dayTotals.map((t, i) => <td key={i} style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, cursor: 'pointer' }}
                    onClick={e => drillFor(`${fullDate(dates[i])} — everyone`, `${records.filter(r => r.d === dates[i] && (channelLens === 'all' || r.f === channelLens)).length} styles this day`, r => r.d === dates[i] && (channelLens === 'all' || r.f === channelLens), e)}>{t}</td>)}
                  <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, color: 'var(--accent-dark)' }}>{grand}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {scMode === 'person' && (() => {
          const rows = [...people].map(p => ({ name: p.name, total: personCounts(p).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
          const max = Math.max(1, ...rows.map(r => r.total));
          return scView === 'table' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}>Rank</th><th style={thStyle}>Person</th><th style={{ ...thStyle, textAlign: 'right' }}>Total Styles</th></tr></thead>
              <tbody>{rows.map((r, i) => <tr key={r.name}><td style={tdStyle}><span style={rankStyle(i === 0)}>{i + 1}</span></td><td style={{ ...tdStyle, fontWeight: 600 }}>{r.name}</td><td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{r.total}</td></tr>)}</tbody>
            </table>
          ) : <div>{rows.map(r => <HBar key={r.name} label={r.name} value={r.total} max={max} color="var(--accent)" />)}</div>;
        })()}
        {scMode === 'day' && (() => {
          return scView === 'table' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thStyle}>Day</th><th style={{ ...thStyle, textAlign: 'right' }}>Total Styles</th></tr></thead>
              <tbody>{dates.map((d, i) => <tr key={d}><td style={tdStyle}>{dateLabels[d]}</td><td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{dayTotals[i]}</td></tr>)}</tbody>
            </table>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '130px', padding: '4px 2px 0' }}>
              {dayTotals.map((t, i) => { const max = Math.max(1, ...dayTotals); return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '22px', borderRadius: '2px 2px 0 0', background: 'var(--accent)', height: `${(t / max) * 100}%` }} />
                </div>
              ); })}
            </div>
          );
        })()}
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '10px' }}>See the same numbers split by channel for every row at once → <a onClick={() => document.getElementById('cad-channel')?.scrollIntoView({ behavior: 'smooth' })} style={{ color: 'var(--accent-dark)', fontWeight: 700, cursor: 'pointer' }}>CAD Report — by Channel</a>.</p>
      </div>

      {/* ── CAD Report — by Channel ── */}
      <div id="cad-channel" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={titleStyle}>CAD Report — by Channel</span><span style={sheetTag}>cad_files + orders</span></div>
            <p style={descStyle}>The same grid as above, but every row is pre-split into Kira vs V+V.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={pillStyle(ccCollapsed)} onClick={() => setCcCollapsed(v => !v)}>{ccCollapsed ? 'Expand channels' : 'Collapse to totals'}</button>
            <button style={downloadBtnStyle} onClick={() => {
              const rows: (string | number)[][] = [];
              people.forEach(p => { rows.push([p.name, '', ...p.counts, p.total]); if (!ccCollapsed) { rows.push(['↳ Kira', '', ...p.kira, p.kiraTotal]); rows.push(['↳ V+V', '', ...p.vv, p.vvTotal]); } });
              downloadCsv(`Cad_Report_by_Channel_${dateFrom}_${dateTo}.csv`, ['Person', 'Channel', ...dates.map(d => dateLabels[d]), 'Total'], rows);
            }}>⬇ Download CSV</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}>Person / Channel</th>{dates.map(d => <th key={d} style={{ ...thStyle, textAlign: 'right' }}>{dateLabels[d]}</th>)}<th style={{ ...thStyle, textAlign: 'right', color: 'var(--accent-dark)' }}>Total</th></tr></thead>
            <tbody>
              {people.map(p => (
                <React.Fragment key={p.name}>
                  <tr style={{ cursor: 'pointer' }} onClick={e => drillFor(p.name, `${records.filter(r => r.p === p.name).length} style rows`, r => r.p === p.name, e)}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                    {p.counts.map((c, i) => <td key={i} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{c}</td>)}
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--accent-dark)' }}>{p.total}</td>
                  </tr>
                  {!ccCollapsed && (
                    <>
                      <tr style={{ background: 'var(--bg-input)', cursor: 'pointer' }} onClick={e => drillFor(`${p.name} — Kira`, `${records.filter(r => r.p === p.name && r.f === 'Kira').length} style rows`, r => r.p === p.name && r.f === 'Kira', e)}>
                        <td style={{ ...tdStyle, color: '#0369A1', fontSize: '12px' }}>↳ Kira</td>
                        {p.kira.map((c, i) => <td key={i} style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{c}</td>)}
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{p.kiraTotal}</td>
                      </tr>
                      <tr style={{ background: 'var(--bg-input)', cursor: 'pointer' }} onClick={e => drillFor(`${p.name} — V+V`, `${records.filter(r => r.p === p.name && r.f === 'V+V').length} style rows`, r => r.p === p.name && r.f === 'V+V', e)}>
                        <td style={{ ...tdStyle, color: '#6D28D9', fontSize: '12px' }}>↳ V+V</td>
                        {p.vv.map((c, i) => <td key={i} style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{c}</td>)}
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '12px' }}>{p.vvTotal}</td>
                      </tr>
                    </>
                  )}
                </React.Fragment>
              ))}
              <tr>
                <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>Grand Total</td>
                {dayTotals.map((t, i) => <td key={i} style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>{t}</td>)}
                <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, color: 'var(--accent-dark)' }}>{grand}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '10px' }}>Click any row to see the underlying style numbers.</p>
      </div>

      {/* ── CAD Approval Rate ── */}
      <div id="approval-rate" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={titleStyle}>CAD Approval Rate</span><span style={sheetTag}>cad_files.status</span></div>
            <p style={descStyle}>Of the styles each person made, how many were approved — covering Kira and V+V alike, since JewelFlow tracks approvals for both.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button style={pillStyle(arSort === 'styles')} onClick={() => setArSort('styles')}>By Styles Made</button>
              <button style={pillStyle(arSort === 'rate')} onClick={() => setArSort('rate')}>By Approval Rate</button>
            </div>
            <button style={downloadBtnStyle} onClick={() => downloadCsv(`Approval_Rate_${dateFrom}_${dateTo}.csv`, ['Person', 'Styles Made', 'Approved', 'Approval Rate %'],
              people.filter(p => p.approvalStyles > 0).map(p => [p.name, p.approvalStyles, p.approvalApproved, (p.approvalApproved / p.approvalStyles * 100).toFixed(1)]))}>⬇ Download CSV</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}></th><th style={thStyle}>Person</th><th style={{ ...thStyle, textAlign: 'right' }}>Styles Made</th><th style={{ ...thStyle, textAlign: 'right' }}>Approved</th><th style={thStyle}>Approval Rate</th></tr></thead>
            <tbody>
              {[...people].filter(p => p.approvalStyles > 0)
                .sort((a, b) => arSort === 'styles' ? b.approvalStyles - a.approvalStyles : (b.approvalApproved / b.approvalStyles) - (a.approvalApproved / a.approvalStyles))
                .map(p => {
                  const rate = p.approvalApproved / p.approvalStyles * 100;
                  const open = arExpanded.has(p.name);
                  return (
                    <React.Fragment key={p.name}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setArExpanded(s => { const n = new Set(s); n.has(p.name) ? n.delete(p.name) : n.add(p.name); return n; })}>
                        <td style={tdStyle}><span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▸</span></td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{p.approvalStyles}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{p.approvalApproved}</td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                            <div style={{ flex: 1, height: '12px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '4px', background: 'var(--success)', width: `${rate}%` }} /></div>
                            <span style={{ fontSize: '12px', fontWeight: 700, width: '42px', textAlign: 'right' }}>{rate.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ background: 'var(--bg-input)' }}>
                          <td colSpan={5} style={{ padding: '10px 24px' }}>
                            {p.approvalDetail.map((s, i) => <span key={i} style={dateChip(s.approved)}>{s.style} · {dateLabels[s.date]}{s.family === 'V+V' ? ' · V+V' : ''}{s.approved ? ' ✅' : ''}</span>)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '10px' }}>Click a person to see which specific styles were approved.</p>
      </div>

      {/* ── Kira vs V+V Comparison ── */}
      <div id="channel-comparison" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={titleStyle}>Kira vs V+V Comparison</span><span style={sheetTag}>orders.storeName</span></div>
            <p style={descStyle}>Your two order channels, side by side. Click either card to filter Daily Per-Person Style Count above to just that channel.</p>
          </div>
          <button style={downloadBtnStyle} onClick={() => downloadCsv(`Kira_vs_VV_Comparison_${dateFrom}_${dateTo}.csv`, ['Channel', 'Styles', 'Approvals', 'Approval Rate %'],
            (['Kira', 'V+V'] as const).map(ch => { const c = data.channel[ch] || { styles: 0, approvals: 0 }; return [ch, c.styles, c.approvals, c.styles ? (c.approvals / c.styles * 100).toFixed(1) : '0.0']; }))}>⬇ Download CSV</button>
        </div>
        {(() => {
          const kira = data.channel['Kira'] || { styles: 0, approvals: 0 };
          const vv = data.channel['V+V'] || { styles: 0, approvals: 0 };
          const kiraRate = kira.styles ? kira.approvals / kira.styles * 100 : 0;
          const vvRate = vv.styles ? vv.approvals / vv.styles * 100 : 0;
          const maxStyles = Math.max(1, kira.styles, vv.styles);
          const maxRate = Math.max(1, kiraRate, vvRate);
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                {(['Kira', 'V+V'] as const).map(ch => {
                  const c = ch === 'Kira' ? kira : vv;
                  const rate = ch === 'Kira' ? kiraRate : vvRate;
                  const active = channelLens === ch;
                  return (
                    <button key={ch} onClick={() => setChannelLens(v => v === ch ? 'all' : ch)}
                      style={{ background: ch === 'Kira' ? '#E0F2FE' : '#EDE9FE', color: ch === 'Kira' ? '#0369A1' : '#6D28D9', borderRadius: '10px', padding: '16px 18px', cursor: 'pointer', border: `1.5px solid ${active ? 'var(--navy)' : 'transparent'}`, boxShadow: active ? 'var(--shadow-md)' : 'none', textAlign: 'left', fontFamily: 'inherit' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{ch === 'Kira' ? 'Custom (all other orders)' : 'V+V (Vow and Vine)'}</div>
                      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '34px', fontWeight: 600, marginTop: '6px', lineHeight: 1 }}>{c.styles}</div>
                      <div style={{ fontSize: '11.5px', marginTop: '6px', color: 'var(--text-secondary)' }}>styles made · {c.approvals} approved · {rate.toFixed(1)}% approval rate</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: '8px' }}>Styles Made</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}><span style={{ width: '44px', flexShrink: 0, fontSize: '12px', fontWeight: 700, color: '#0369A1' }}>Kira</span><div style={{ flex: 1, height: '14px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '4px', background: '#0369A1', width: `${kira.styles / maxStyles * 100}%` }} /></div><span style={{ width: '56px', textAlign: 'right', flexShrink: 0, fontSize: '12px', fontWeight: 700 }}>{kira.styles}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '44px', flexShrink: 0, fontSize: '12px', fontWeight: 700, color: '#6D28D9' }}>V+V</span><div style={{ flex: 1, height: '14px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '4px', background: '#6D28D9', width: `${vv.styles / maxStyles * 100}%` }} /></div><span style={{ width: '56px', textAlign: 'right', flexShrink: 0, fontSize: '12px', fontWeight: 700 }}>{vv.styles}</span></div>
              </div>
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: '8px' }}>Approval Rate</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}><span style={{ width: '44px', flexShrink: 0, fontSize: '12px', fontWeight: 700, color: '#0369A1' }}>Kira</span><div style={{ flex: 1, height: '14px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '4px', background: '#0369A1', width: `${kiraRate / maxRate * 100}%` }} /></div><span style={{ width: '56px', textAlign: 'right', flexShrink: 0, fontSize: '12px', fontWeight: 700 }}>{kiraRate.toFixed(1)}%</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '44px', flexShrink: 0, fontSize: '12px', fontWeight: 700, color: '#6D28D9' }}>V+V</span><div style={{ flex: 1, height: '14px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '4px', background: '#6D28D9', width: `${vvRate / maxRate * 100}%` }} /></div><span style={{ width: '56px', textAlign: 'right', flexShrink: 0, fontSize: '12px', fontWeight: 700 }}>{vvRate.toFixed(1)}%</span></div>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Revision Activity ── */}
      <div id="revision-activity" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={titleStyle}>Revision Activity</span><span style={sheetTag}>cad_files per order</span></div>
            <p style={descStyle}>Orders touched more than once by the same person — a real, per-style revision count, not inferred. Click a person to see which styles.</p>
          </div>
          <button style={downloadBtnStyle} onClick={() => downloadCsv(`Revision_Activity_${dateFrom}_${dateTo}.csv`, ['Person', 'Distinct Styles', 'Total Entries', 'Revisions'],
            [...people].sort((a, b) => b.revisions - a.revisions).map(p => [p.name, p.distinctStyles, p.totalEntries, p.revisions]))}>⬇ Download CSV</button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={thStyle}></th><th style={thStyle}>Person</th><th style={{ ...thStyle, textAlign: 'right' }}>Distinct Styles</th><th style={{ ...thStyle, textAlign: 'right' }}>Total Entries</th><th style={{ ...thStyle, textAlign: 'right' }}>Revisions</th></tr></thead>
            <tbody>
              {[...people].sort((a, b) => b.revisions - a.revisions).map(p => {
                const open = revExpanded.has(p.name);
                return (
                  <React.Fragment key={p.name}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setRevExpanded(s => { const n = new Set(s); n.has(p.name) ? n.delete(p.name) : n.add(p.name); return n; })}>
                      <td style={tdStyle}><span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▸</span></td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{p.distinctStyles}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{p.totalEntries}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: p.revisions > 0 ? 'var(--accent-dark)' : 'var(--text-muted)' }}>{p.revisions}</td>
                    </tr>
                    {open && (
                      <tr style={{ background: 'var(--bg-input)' }}>
                        <td colSpan={5} style={{ padding: '12px 24px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={thStyle}>Style No.</th><th style={thStyle}>Days Touched</th><th style={{ ...thStyle, textAlign: 'right' }}>Count</th></tr></thead>
                            <tbody>
                              {p.revisionStyles.map(s => (
                                <tr key={s.style}><td style={{ ...tdStyle, fontWeight: 600 }}>{s.style}</td><td style={tdStyle}>{s.dates.map((d, i) => <span key={i} style={dateChip(s.count > 1)}>{dateLabels[d]}</span>)}</td><td style={{ ...tdStyle, textAlign: 'right', fontWeight: s.count > 1 ? 700 : 400 }}>{s.count}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '10px' }}>More precise than the dashboard's inferred Revisions Completed tile.</p>
      </div>

      {/* ── Style Data (raw) ── */}
      <div id="style-data" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={titleStyle}>Style Data</span><span style={sheetTag}>cad_files raw</span></div>
            <p style={descStyle}>The source rows every report above is a rollup of. Search by person or style number.</p>
          </div>
          <button style={downloadBtnStyle} onClick={() => downloadCsv(`Style_Data_Raw_${dateFrom}_${dateTo}.csv`, ['Date', 'Person', 'Style No.', 'Family', 'Approved'],
            records.map(r => [fullDate(r.d), r.p, r.s, r.f, r.a ? 'Yes' : 'No']))}>⬇ Download CSV</button>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '14px 0 10px' }}>
          <input value={sdQuery} onChange={e => setSdQuery(e.target.value)} placeholder="Search person or style no.…"
            style={{ flex: '1 1 180px', maxWidth: '280px', padding: '7px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '12.5px' }} />
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'Kira', 'V+V'] as const).map(f => <button key={f} style={pillStyle(sdFamily === f)} onClick={() => setSdFamily(f)}>{f === 'all' ? 'All' : f}</button>)}
          </div>
        </div>
        {(() => {
          const q = sdQuery.trim().toLowerCase();
          const rows = records.filter(r => (sdFamily === 'all' || r.f === sdFamily) && (!q || r.p.toLowerCase().includes(q) || r.s.toLowerCase().includes(q)));
          return (
            <>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{rows.length} of {records.length} rows</div>
              <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--bg-card)' }}>Date</th><th style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--bg-card)' }}>Person</th><th style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--bg-card)' }}>Style No.</th><th style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--bg-card)' }}>Family</th><th style={{ ...thStyle, position: 'sticky', top: 0, background: 'var(--bg-card)' }}>Approved</th></tr></thead>
                  <tbody>
                    {rows.length ? rows.map((r, i) => <tr key={i}><td style={tdStyle}>{fullDate(r.d)}</td><td style={{ ...tdStyle, fontWeight: 600 }}>{r.p}</td><td style={tdStyle}>{r.s}</td><td style={tdStyle}>{r.f}</td><td style={tdStyle}>{r.a ? '✅' : '—'}</td></tr>)
                      : <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No matching rows.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>

      {drill && <DrillPopover title={drill.title} sub={drill.sub} rows={drill.rows} top={drill.top} left={drill.left} onClose={() => setDrill(null)} />}
    </>
  );
};
