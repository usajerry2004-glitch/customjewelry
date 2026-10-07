import React, { useEffect, useState } from 'react';
import { apiFetch, API } from '../../utils/apiFetch';
import {
  DateRange, CustomRangeControl, monthLabel,
  cardStyle, reportTitleStyle, periodStyle, arrowBtnStyle, thStyle, tdStyle,
} from '../dashboard/ReportsSection';

interface ClientConversion { client: string; ordersPlaced: number; cadsCreated: number; ordersCompleted: number; conversionPct: number }

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const ClientConversionReport: React.FC = () => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [clients, setClients] = useState<ClientConversion[]>([]);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const buildParams = () => customRange
    ? `dateFrom=${customRange.from}&dateTo=${customRange.to}`
    : `month=${monthLabel(monthOffset).param}`;

  useEffect(() => {
    apiFetch(`${API}/orders/reports/clients?${buildParams()}`).then(r => r.ok ? r.json() : []).then(setClients).catch(() => {});
    setShowAll(false);
  }, [monthOffset, customRange]);

  // Already sorted by orders placed (desc) from the backend, so the first 5
  // are the top 5 — "View more" below just reveals the rest of that same order.
  const TOP_N = 5;
  const visibleClients = showAll ? clients : clients.slice(0, TOP_N);

  const totals = clients.reduce((acc, c) => ({
    ordersPlaced: acc.ordersPlaced + c.ordersPlaced,
    cadsCreated: acc.cadsCreated + c.cadsCreated,
    ordersCompleted: acc.ordersCompleted + c.ordersCompleted,
  }), { ordersPlaced: 0, cadsCreated: 0, ordersCompleted: 0 });
  const totalConversionPct = totals.ordersPlaced ? Math.round((totals.ordersCompleted / totals.ordersPlaced) * 1000) / 10 : 0;

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await apiFetch(`${API}/orders/reports/clients/csv?${buildParams()}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = customRange
        ? `client-conversion-${customRange.from}-${customRange.to}.csv`
        : `client-conversion-${monthLabel(monthOffset).param}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
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
        <button
          onClick={handleExportCsv}
          disabled={exportingCsv || clients.length === 0}
          style={{
            padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            cursor: exportingCsv || clients.length === 0 ? 'default' : 'pointer',
            background: 'var(--navy)', color: '#fff', border: 'none',
            opacity: exportingCsv || clients.length === 0 ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {exportingCsv ? 'Exporting…' : '⬇ Export CSV'}
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Client</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Orders Placed</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>CADs Created</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Completed</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Conversion %</th>
          </tr>
        </thead>
        <tbody>
          {visibleClients.map(c => (
            <tr key={c.client}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{c.client}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{c.ordersPlaced}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{c.cadsCreated}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{c.ordersCompleted}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: c.conversionPct >= 50 ? 'var(--success)' : c.conversionPct > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.conversionPct}%</td>
            </tr>
          ))}
          {clients.length > 0 && (
            <tr>
              <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px' }}>Total</td>
              <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>{totals.ordersPlaced}</td>
              <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>{totals.cadsCreated}</td>
              <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>{totals.ordersCompleted}</td>
              <td style={{ ...tdStyle, borderBottom: 'none', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>{totalConversionPct}%</td>
            </tr>
          )}
          {clients.length === 0 && <tr><td style={tdStyle} colSpan={5}>No orders in this period.</td></tr>}
        </tbody>
      </table>
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
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '8px' }}>
        "CADs Created" excludes reference/inspiration images, and collapses every file uploaded for the same order on the same day into one (several angles or a quick re-export in one sitting is one design touched, not several). "Conversion %" is orders that reached Completed, out of all orders placed by that client in this period.
      </div>
    </div>
  );
};
