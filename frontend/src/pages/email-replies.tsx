import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';

// Admin view of every customer reply to a follow-up email (approval check-in,
// feedback request) that the inbox check picked up — see EmailRepliesService.

interface ReplyItem {
  id: string;
  kind: 'APPROVAL_CHECKIN' | 'FEEDBACK';
  outcome: 'APPLIED' | 'NEEDS_REVIEW' | 'IGNORED';
  fromEmail: string | null;
  subject: string | null;
  bodyText: string | null;
  receivedAt: string;
  note: string | null;
  summary: string | null;
  orders: { id: string; poNumber: string; customer: string | null }[];
}

interface ListResponse {
  enabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  counts: { APPLIED: number; NEEDS_REVIEW: number; IGNORED: number };
  total: number;
  items: ReplyItem[];
}

const TABS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'APPLIED', label: 'Filled in' },
  { key: 'NEEDS_REVIEW', label: 'Needs a look' },
  { key: 'IGNORED', label: 'Skipped' },
];

const OUTCOME_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  APPLIED:      { label: 'Filled in',    bg: '#D1FAE5', color: '#065F46' },
  NEEDS_REVIEW: { label: 'Needs a look', bg: '#FEF3C7', color: '#92400E' },
  IGNORED:      { label: 'Skipped',      bg: '#EEECE7', color: '#4A5968' },
};

const KIND_LABEL: Record<string, string> = { APPROVAL_CHECKIN: 'Approval check-in', FEEDBACK: 'Feedback' };
const PAGE_SIZE = 50;

const fmt = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function EmailRepliesPage() {
  const [tab, setTab] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (tab) params.set('outcome', tab);
    apiFetch(`${API}/email-replies?${params}`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Only admins can see this page.' : 'Could not load email replies.');
        return r.json();
      })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, page]);

  const counts = data?.counts;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <AppLayout title="Email Replies" subtitle="Customer replies to follow-up emails, filled in automatically or flagged for a look">
      {/* Status line */}
      {data && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {!data.enabled ? (
            <span style={{ color: '#B42318', fontWeight: 600 }}>Inbox check is off (needs the Gmail login and AI key, and EMAIL_REPLY_SYNC not set to off).</span>
          ) : data.lastError ? (
            <span style={{ color: '#B42318', fontWeight: 600 }}>Last inbox check failed: {data.lastError}</span>
          ) : (
            <span>Inbox checked every 5 minutes{data.lastCheckedAt ? ` · last check ${fmt(data.lastCheckedAt)}` : ' · waiting for first check'}</span>
          )}
          {counts && (
            <span style={{ marginLeft: 'auto' }}>
              Last 30 days: {counts.APPLIED} filled in · {counts.NEEDS_REVIEW} need a look · {counts.IGNORED} skipped
            </span>
          )}
        </div>
      )}

      {/* Tabs (single-select) */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <button
              key={t.key || 'all'}
              type="button"
              onClick={() => { setTab(t.key); setPage(0); setExpanded(null); }}
              style={{
                fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '99px', cursor: 'pointer',
                border: `1px solid ${on ? 'var(--navy, #1A2740)' : 'var(--border)'}`,
                background: on ? 'var(--navy, #1A2740)' : 'var(--bg-card)',
                color: on ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {t.label}{t.key && counts ? ` (${counts[t.key as keyof typeof counts]})` : ''}
            </button>
          );
        })}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading && !data ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#B42318' }}>{error}</div>
        ) : !data?.items.length ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No email replies {tab ? 'in this tab ' : ''}yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '820px' }}>
              <thead>
                <tr>
                  {['Received', 'Order', 'Email', 'From', 'Reply', 'Result'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map(r => {
                  const o = OUTCOME_STYLE[r.outcome] || OUTCOME_STYLE.IGNORED;
                  const isOpen = expanded === r.id;
                  const preview = (r.bodyText || '').replace(/\s+/g, ' ').trim();
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmt(r.receivedAt)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {r.orders.length ? r.orders.map((ord, i) => (
                          <span key={ord.id}>
                            {i > 0 && ', '}
                            <Link href={`/orders/${ord.id}`} style={{ color: '#1E3A5F', fontWeight: 700 }}>{ord.poNumber}</Link>
                          </span>
                        )) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        {r.orders[0]?.customer && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.orders[0].customer}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{KIND_LABEL[r.kind] || r.kind}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{r.fromEmail || '—'}</td>
                      <td style={{ padding: '12px 14px', maxWidth: '360px' }}>
                        {preview ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            aria-expanded={isOpen}
                            style={{ all: 'unset', cursor: 'pointer', display: 'block', color: 'var(--text-primary)', whiteSpace: isOpen ? 'pre-wrap' : 'normal' }}
                          >
                            {isOpen ? r.bodyText : `"${preview.length > 90 ? preview.slice(0, 90) + '…' : preview}"`}
                            <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{isOpen ? 'Show less' : 'Show full reply'}</span>
                          </button>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', minWidth: '170px' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', background: o.bg, color: o.color, whiteSpace: 'nowrap' }}>{o.label}</span>
                        {(r.summary || r.note) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.45 }}>
                            {r.outcome === 'APPLIED' ? (r.summary || r.note) : r.note}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={pagerBtn(page === 0)}>← Prev</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} style={pagerBtn(page + 1 >= pages)}>Next →</button>
        </div>
      )}
    </AppLayout>
  );
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    fontFamily: 'inherit', fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}
