import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, API } from '../../utils/apiFetch';
import {
  DateRange, CustomRangeControl, monthLabel,
  cardStyle, reportTitleStyle, periodStyle, arrowBtnStyle, thStyle, tdStyle,
} from '../dashboard/ReportsSection';

type Stage = 'completed' | 'pending_cad' | 'awaiting_quote' | 'awaiting_approval' | 'revision' | 'cancelled' | 'other';

interface ClientConversion {
  client: string; clientKey: string; ordersPlaced: number; cadsCreated: number;
  completed: number; pendingCad: number; awaitingQuote: number; awaitingApproval: number;
  revision: number; cancelled: number; other: number; conversionPct: number;
  revisions: number; ordersWithCad: number; revisionRatePct: number | null;
}
interface ClientOrder {
  id: string; poNumber: string; orderType: string | null; createdAt: string; status: string; stage: Stage;
  completedAt: string | null; awaitingSince: string | null;
  cancelledAt: string | null; shippedDate: string | null;
}

const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Chips deliberately show no day count — "days since placed" kept growing
// after an order finished and read as a delay. Dates are in the hover text.
const timelineTitle = (o: ClientOrder, statusLabel: string): string => [
  statusLabel,
  `Placed ${fmtDate(o.createdAt)}`,
  o.completedAt ? `Completed ${fmtDate(o.completedAt)}` : null,
  o.awaitingSince ? `Sent for approval ${fmtDate(o.awaitingSince)}` : null,
  o.cancelledAt ? `Cancelled ${fmtDate(o.cancelledAt)}` : null,
  o.shippedDate ? `Shipped ${fmtDate(o.shippedDate)}` : null,
].filter(Boolean).join(' · ');

// One column per stage — every order is counted in exactly one of these, so
// they always add up to Orders Placed (see getClientConversionReport).
const STAGES: { stage: Stage; key: keyof ClientConversion; label: string; title: string; color: string }[] = [
  { stage: 'completed',         key: 'completed',        label: 'Completed',         color: '#047857', title: 'Reached VPO Issued or beyond — design approved, in production' },
  { stage: 'pending_cad',       key: 'pendingCad',       label: 'Pending CAD',       color: '#B45309', title: 'New, or CAD In Progress at the "Pending CAD" label — waiting on the CAD team' },
  { stage: 'awaiting_quote',    key: 'awaitingQuote',    label: 'Awaiting Quote',    color: '#B45309', title: 'CAD uploaded, not yet priced / sent to the customer' },
  { stage: 'awaiting_approval', key: 'awaitingApproval', label: 'Awaiting Approval', color: '#2563EB', title: 'CAD sent — waiting on the customer to approve' },
  { stage: 'revision',          key: 'revision',         label: 'In Revision',       color: '#7C3AED', title: 'Right now, the customer has asked for changes (or rejected the CAD) and is waiting on a new version' },
  { stage: 'cancelled',         key: 'cancelled',        label: 'Cancelled',         color: '#DC2626', title: 'Orders currently Cancelled' },
  { stage: 'other',             key: 'other',            label: 'Other',             color: '#6B7280', title: 'Anything else — e.g. CAD approved but VPO not issued yet, or a project the customer closed' },
];
const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.stage, s])) as Record<Stage, typeof STAGES[number]>;
const STATUS_LABEL: Record<string, string> = {
  NEW: 'New', CAD_IN_PROGRESS: 'CAD In Progress', VPO_ISSUED: 'VPO Issued', MANUFACTURED: 'Manufactured',
  SHIPPED: 'Shipped', REPAIR: 'Repair', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const ClientConversionReport: React.FC = () => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [clients, setClients] = useState<ClientConversion[]>([]);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, ClientOrder[] | 'loading' | 'failed'>>({});

  const buildParams = () => customRange
    ? `dateFrom=${customRange.from}&dateTo=${customRange.to}`
    : `month=${monthLabel(monthOffset).param}`;

  useEffect(() => {
    apiFetch(`${API}/orders/reports/clients?${buildParams()}`).then(r => r.ok ? r.json() : []).then(setClients).catch(() => {});
    setShowAll(false);
    setExpanded(null);
    setOrders({});
  }, [monthOffset, customRange]);

  const toggleClient = async (clientKey: string) => {
    if (expanded === clientKey) { setExpanded(null); return; }
    setExpanded(clientKey);
    if (Array.isArray(orders[clientKey])) return;
    setOrders(o => ({ ...o, [clientKey]: 'loading' }));
    try {
      const res = await apiFetch(`${API}/orders/reports/clients/orders?clientKey=${encodeURIComponent(clientKey)}&${buildParams()}`);
      const list = res.ok ? await res.json() : null;
      setOrders(o => ({ ...o, [clientKey]: Array.isArray(list) ? list : 'failed' }));
    } catch {
      setOrders(o => ({ ...o, [clientKey]: 'failed' }));
    }
  };

  // Already sorted by orders placed (desc) from the backend, so the first 5
  // are the top 5 — "View more" below just reveals the rest of that same order.
  const TOP_N = 5;
  const visibleClients = showAll ? clients : clients.slice(0, TOP_N);

  const sum = (key: keyof ClientConversion) => clients.reduce((t, c) => t + (c[key] as number), 0);
  const totalOrders = sum('ordersPlaced');
  const totalConversionPct = totalOrders ? Math.round((sum('completed') / totalOrders) * 1000) / 10 : 0;
  const totalCads = sum('cadsCreated');
  const totalRevisionRatePct = totalCads ? Math.round((sum('revisions') / totalCads) * 1000) / 10 : null;
  const revisionTitle = (revisions: number, cads: number) =>
    `${revisions} of ${cads} CAD${cads === 1 ? '' : 's'} sent back for changes`;

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      const res = await apiFetch(`${API}/orders/reports/clients/${format}?${buildParams()}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = customRange
        ? `client-conversion-${customRange.from}-${customRange.to}.${format}`
        : `client-conversion-${monthLabel(monthOffset).param}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const totalCell: React.CSSProperties = { ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 };
  const colCount = 5 + STAGES.length;

  const renderOrders = (clientKey: string) => {
    const list = orders[clientKey];
    if (list === 'loading' || list === undefined) return <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading orders…</div>;
    if (list === 'failed') return <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>Couldn&apos;t load orders.</div>;
    // Grouped by stage, in the same order as the columns, so it reads as the
    // breakdown of that row's numbers.
    return (
      <div style={{ padding: '6px 4px 12px' }}>
        {STAGES.filter(s => list.some(o => o.stage === s.stage)).map(s => {
          const inStage = list.filter(o => o.stage === s.stage);
          return (
            <div key={s.stage} style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '6px 0 4px' }}>
                {s.label} · {inStage.length}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {inStage.map(o => (
                  <Link key={o.id} href={`/orders/${o.id}`} target="_blank"
                    title={timelineTitle(o, STATUS_LABEL[o.status] || o.status)}
                    style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '8px', border: `1px solid ${s.color}33`, background: `${s.color}0D`, color: 'var(--text-primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    <strong>{o.poNumber}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{o.orderType ? ` · ${o.orderType}` : ''}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="client-conversion" style={{ ...cardStyle, scrollMarginTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div>
          <div style={reportTitleStyle}>Client Conversion</div>
          <div style={periodStyle}>
            {customRange ? (
              <span>{shortDate(customRange.from)} – {shortDate(customRange.to)}</span>
            ) : (
              <>
                <span style={arrowBtnStyle} onClick={() => setMonthOffset(m => m - 1)}>‹</span>
                {monthLabel(monthOffset).label}
                <span style={arrowBtnStyle} onClick={() => setMonthOffset(m => m + 1)}>›</span>
              </>
            )}
            <CustomRangeControl active={customRange} onApply={setCustomRange} onClear={() => setCustomRange(null)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {([
            { format: 'xlsx', label: '⬇ Export Excel', title: 'Excel workbook: Summary (this table), All Orders (every order with its stage and details) and Definitions sheets' },          ] as const).map(b => {
            const disabled = exporting !== null || clients.length === 0;
            return (
              <button key={b.format} onClick={() => handleExport(b.format)} disabled={disabled} title={b.title}
                style={{
                  padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  background: b.format === 'xlsx' ? 'var(--navy)' : 'transparent',
                  color: b.format === 'xlsx' ? '#fff' : 'var(--navy)',
                  border: b.format === 'xlsx' ? 'none' : '1px solid var(--navy)',
                  opacity: disabled ? 0.6 : 1, whiteSpace: 'nowrap',
                }}
              >
                {exporting === b.format ? 'Exporting…' : b.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1080px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Client</th>
              <th title="Every order placed in this period" style={{ ...thStyle, textAlign: 'right' }}>Orders Placed</th>
              <th title="Design versions — files for the same order on the same day count once; reference images excluded" style={{ ...thStyle, textAlign: 'right' }}>CADs Created</th>
              {STAGES.map(s => <th key={s.stage} title={s.title} style={{ ...thStyle, textAlign: 'right', cursor: 'help' }}>{s.label}</th>)}
              <th title="Completed ÷ Orders Placed" style={{ ...thStyle, textAlign: 'right' }}>Conversion %</th>
              <th title="Share of CADs sent back for changes (including orders later approved): revised CADs ÷ CADs Created. E.g. 5 CADs, 3 sent back = 60%." style={{ ...thStyle, textAlign: 'right', cursor: 'help' }}>Revision Rate</th>
            </tr>
          </thead>
          <tbody>
            {visibleClients.map(c => (
              <React.Fragment key={c.clientKey}>
                <tr onClick={() => toggleClient(c.clientKey)} style={{ cursor: 'pointer', background: expanded === c.clientKey ? 'var(--bg-input)' : undefined }}
                  title="Click to see this client's orders and their status">
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', width: '14px', color: 'var(--text-muted)' }}>{expanded === c.clientKey ? '▾' : '▸'}</span>
                    {c.client}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.ordersPlaced}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.cadsCreated}</td>
                  {STAGES.map(s => {
                    const v = c[s.key] as number;
                    return <td key={s.stage} style={{ ...tdStyle, textAlign: 'right', color: v && s.stage !== 'completed' ? s.color : v ? undefined : 'var(--text-muted)' }}>{v}</td>;
                  })}
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: c.conversionPct >= 50 ? 'var(--success)' : c.conversionPct > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.conversionPct}%</td>
                  <td title={c.revisionRatePct == null ? 'No CADs yet' : revisionTitle(c.revisions, c.cadsCreated)}
                    style={{ ...tdStyle, textAlign: 'right', color: c.revisionRatePct == null ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    {c.revisionRatePct == null ? '—' : `${c.revisionRatePct}%`}
                  </td>
                </tr>
                {expanded === c.clientKey && (
                  <tr>
                    <td colSpan={colCount} style={{ ...tdStyle, background: 'var(--bg-input)' }}>{renderOrders(c.clientKey)}</td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {clients.length > 0 && (
              <tr>
                <td style={{ ...totalCell, textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>Total</td>
                <td style={totalCell}>{totalOrders}</td>
                <td style={totalCell}>{sum('cadsCreated')}</td>
                {STAGES.map(s => <td key={s.stage} style={totalCell}>{sum(s.key)}</td>)}
                <td style={totalCell}>{totalConversionPct}%</td>
                <td style={totalCell} title={revisionTitle(sum('revisions'), totalCads)}>{totalRevisionRatePct == null ? '—' : `${totalRevisionRatePct}%`}</td>
              </tr>
            )}
            {clients.length === 0 && <tr><td style={tdStyle} colSpan={colCount}>No orders in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      {clients.length > TOP_N && (
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <button
            onClick={() => setShowAll(s => !s)}
            style={{
              fontSize: '12px', fontWeight: 600, color: 'var(--accent-dark)', background: 'none',
              border: '1px solid var(--border)', borderRadius: '20px', padding: '5px 16px', cursor: 'pointer',
            }}
          >
            {showAll ? 'Show Top 5 Only' : `View More (${clients.length - TOP_N} more)`}
          </button>
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '8px', lineHeight: 1.6 }}>
        Covers every order placed in this period. Each order is counted in exactly one stage column, so Completed through Other always add up to Orders Placed — click a client to see its orders grouped by stage.
        &quot;CADs Created&quot; counts design versions (same order + same day = one, reference images excluded), so it can be higher than orders when designs are revised.
        &quot;Conversion %&quot; is Completed ÷ Orders Placed. &quot;Revision Rate&quot; is the share of CADs sent back for changes (even if the order was approved later): 5 CADs with 3 sent back = 60%. Clients are grouped ignoring capitalization, punctuation and LLC/Inc/Ltd. Hover a column header for its definition.
      </div>
    </div>
  );
};
