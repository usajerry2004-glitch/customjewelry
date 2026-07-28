import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { UserRole } from '../utils/types';

interface AuditEvent {
  id: string;
  orderId: string;
  userId?: string;
  userEmail: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string;
  createdAt: string;
  poNumber: string | null;
  storeName: string | null;
  customerFullName: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  STATUS_CHANGE: 'Status Change',
  SUPPLIER_ASSIGNED: 'Supplier Assigned',
  ORDER_UPDATED: 'Order Updated',
  QUOTE_OPTIONS_UPDATED: 'Quote Options Updated',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '9px 14px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none',
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [userEmail, setUserEmail] = useState('');
  const [debouncedUserEmail, setDebouncedUserEmail] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [debouncedPoNumber, setDebouncedPoNumber] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      const parsed = u ? JSON.parse(u) : null;
      // Non-admin staff can still view this page — the backend scopes their
      // results down to their own actions. Customers get none of this data
      // and are redirected, same as a direct nav around the sidebar link.
      setIsAdmin(parsed?.role === UserRole.ADMIN);
      if (!parsed || parsed.role === UserRole.CUSTOMER) {
        router.replace('/dashboard');
      }
    } catch {
      router.replace('/dashboard');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserEmail(userEmail), 300);
    return () => clearTimeout(t);
  }, [userEmail]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPoNumber(poNumber), 300);
    return () => clearTimeout(t);
  }, [poNumber]);

  const load = async (pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageNum * PAGE_SIZE) });
      if (debouncedUserEmail) params.set('userEmail', debouncedUserEmail);
      if (debouncedPoNumber) params.set('poNumber', debouncedPoNumber);
      if (action) params.set('action', action);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch(`${API}/reports/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(0); load(0); }, [debouncedUserEmail, debouncedPoNumber, action, dateFrom, dateTo]);

  const clearFilters = () => { setUserEmail(''); setPoNumber(''); setAction(''); setDateFrom(''); setDateTo(''); };
  const hasFilters = userEmail || poNumber || action || dateFrom || dateTo;

  return (
    <AppLayout
      title="Audit Log"
      subtitle={isAdmin
        ? 'Every status change, supplier assignment, and edit — across all orders'
        : 'Every status change, supplier assignment, and edit you’ve made'}
    >
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {isAdmin && (
          <input
            value={userEmail}
            onChange={e => setUserEmail(e.target.value)}
            placeholder="Filter by user email…"
            style={{ ...inputStyle, flex: '1 1 180px', maxWidth: '260px' }}
          />
        )}
        <input
          value={poNumber}
          onChange={e => setPoNumber(e.target.value)}
          placeholder="Filter by PO number…"
          style={{ ...inputStyle, flex: '1 1 160px', maxWidth: '220px' }}
        />
        <select value={action} onChange={e => setAction(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }} />
        {hasFilters && (
          <button onClick={clearFilters} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: 'rgba(220,38,38,0.08)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)', fontWeight: 500 }}>
            ✕ Clear
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['When', 'User', 'Action', 'Order', 'Details'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && events.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No events found.{hasFilters ? ' Try clearing your filters.' : ''}</td></tr>
              )}
              {events.map(ev => (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {new Date(ev.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>{ev.userEmail}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.12)', border: '1px solid rgba(192,155,88,0.25)', borderRadius: '4px', padding: '2px 8px' }}>
                      {ACTION_LABELS[ev.action] || ev.action}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {ev.poNumber ? (
                      <a
                        onClick={() => router.push(`/orders/${ev.orderId}`)}
                        style={{ color: 'var(--accent-dark)', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}
                      >
                        {ev.poNumber}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                    {(ev.storeName || ev.customerFullName) && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ev.storeName || ev.customerFullName}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: '360px' }}>
                    {ev.fromStatus && ev.toStatus && (
                      <div>{ev.fromStatus.replace(/_/g, ' ')} → {ev.toStatus.replace(/_/g, ' ')}</div>
                    )}
                    {ev.note && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ev.note}</div>}
                    {!ev.fromStatus && !ev.note && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', marginTop: '16px' }}>
          <button
            onClick={() => { const p = page - 1; setPage(p); load(p); }}
            disabled={page === 0}
            style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 0 ? 'default' : 'pointer', fontSize: '13px' }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <button
            onClick={() => { const p = page + 1; setPage(p); load(p); }}
            disabled={(page + 1) * PAGE_SIZE >= total}
            style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: (page + 1) * PAGE_SIZE >= total ? 'var(--text-muted)' : 'var(--text-primary)', cursor: (page + 1) * PAGE_SIZE >= total ? 'default' : 'pointer', fontSize: '13px' }}
          >
            Next →
          </button>
        </div>
      )}
    </AppLayout>
  );
}
