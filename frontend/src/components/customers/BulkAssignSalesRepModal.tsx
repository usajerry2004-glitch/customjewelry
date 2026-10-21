import React, { useMemo, useState } from 'react';
import { apiFetch, API, getErrorMessage } from '../../utils/apiFetch';
import { formatName } from '../../utils/name';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  salesRepId?: string;
  storeName?: string;
  companyId?: string | null;
}

interface Props {
  customers: Customer[];
  salesRepMap: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}

interface ListRow { line: number; company: string; email: string; manager: string }
interface MatchedRow extends ListRow { matches: Customer[]; matchedBy: 'email' | 'company' | null }

// Same normalization as the backend's CLIENT_KEY_SQL: case, punctuation and
// trailing LLC/Inc/Ltd… ignored, so "Edan Diamonds" in a spreadsheet matches
// an account saved as "Edan Diamonds Inc".
const normalizeCompany = (s: string) => s
  .toLowerCase()
  .replace(/ /g, ' ')
  .replace(/[.,']/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/( (llc|inc|incorporated|ltd|limited|co|corp|corporation|gmbh|bv|pty))+$/, '')
  .trim();

const EMAIL_RE = /[^\s,;"<>]+@[^\s,;"<>]+\.[^\s,;"<>]+/;

// Minimal CSV/TSV line splitter — handles quoted fields with commas inside.
const splitLine = (line: string): string[] => {
  const sep = line.includes('\t') ? '\t' : ',';
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === sep && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

// Accepts a pasted spreadsheet export (with a header row naming the company /
// email / account-manager columns, like the Account Details CSV) or a plain
// list of emails and/or company names, one per line.
const parseList = (text: string): ListRow[] => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = splitLine(lines[0]).map(h => h.toLowerCase());
  const companyIdx = header.findIndex(h => h.includes('company name') || h === 'company' || h === 'store name' || h === 'customer');
  const emailIdx = header.findIndex(h => h.includes('email'));
  const managerIdx = header.findIndex(h => h.includes('manager') || h.includes('sales rep'));
  const hasHeader = companyIdx >= 0 || emailIdx >= 0;

  return lines.slice(hasHeader ? 1 : 0).map((raw, i) => {
    const cells = splitLine(raw);
    const email = (hasHeader && emailIdx >= 0 ? cells[emailIdx] : cells.find(c => EMAIL_RE.test(c))) || '';
    const company = hasHeader && companyIdx >= 0
      ? cells[companyIdx] || ''
      : cells.find(c => c && !EMAIL_RE.test(c) && !/^\d+$/.test(c)) || '';
    return {
      line: i + (hasHeader ? 2 : 1),
      company,
      email: (email.match(EMAIL_RE)?.[0] || '').toLowerCase(),
      manager: managerIdx >= 0 ? cells[managerIdx] || '' : '',
    };
  }).filter(r => r.company || r.email);
};

export const BulkAssignSalesRepModal: React.FC<Props> = ({ customers, salesRepMap, onClose, onDone }) => {
  const [text, setText] = useState('');
  const [repId, setRepId] = useState('');
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: { label: string; error: string }[] } | null>(null);

  const rows = useMemo(() => parseList(text), [text]);

  // Pre-select the rep when the pasted list's Account Manager column names one.
  const suggestedRepId = useMemo(() => {
    const names = new Set(rows.map(r => r.manager.toLowerCase()).filter(Boolean));
    if (names.size !== 1) return '';
    const [name] = Array.from(names);
    return Object.entries(salesRepMap).find(([, n]) => n.toLowerCase() === name)?.[0] || '';
  }, [rows, salesRepMap]);
  const effectiveRepId = repId || suggestedRepId;

  const matched: MatchedRow[] = useMemo(() => {
    const byEmail = new Map<string, Customer[]>();
    const byCompany = new Map<string, Customer[]>();
    for (const c of customers) {
      const e = c.email?.toLowerCase();
      if (e) byEmail.set(e, [...(byEmail.get(e) || []), c]);
      const k = c.storeName ? normalizeCompany(c.storeName) : '';
      if (k) byCompany.set(k, [...(byCompany.get(k) || []), c]);
    }
    return rows.map(r => {
      const viaEmail = r.email ? byEmail.get(r.email) : undefined;
      if (viaEmail?.length) return { ...r, matches: viaEmail, matchedBy: 'email' as const };
      const viaCompany = r.company ? byCompany.get(normalizeCompany(r.company)) : undefined;
      if (viaCompany?.length) return { ...r, matches: viaCompany, matchedBy: 'company' as const };
      return { ...r, matches: [], matchedBy: null };
    });
  }, [rows, customers]);

  // One update per company is enough — the backend applies a customer's rep
  // to their whole company (teammates + existing orders). Customers without a
  // company are updated individually.
  const targets = useMemo(() => {
    const seen = new Set<string>();
    const list: Customer[] = [];
    for (const m of matched) for (const c of m.matches) {
      const key = c.companyId ? `co:${c.companyId}` : `u:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(c);
    }
    return list;
  }, [matched]);

  const toUpdate = targets.filter(c => c.salesRepId !== effectiveRepId);
  const alreadyAssigned = targets.length - toUpdate.length;
  const reassigning = toUpdate.filter(c => c.salesRepId && c.salesRepId !== effectiveRepId);
  const unmatched = matched.filter(m => !m.matches.length);
  const label = (c: Customer) => c.storeName || formatName(c.firstName, c.lastName) || c.email;

  const apply = async () => {
    if (!effectiveRepId || !toUpdate.length) return;
    setApplying(true);
    const failed: { label: string; error: string }[] = [];
    setProgress({ done: 0, total: toUpdate.length, failed });
    // Small batches — each update also rewrites that company's orders.
    const BATCH = 4;
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      await Promise.all(toUpdate.slice(i, i + BATCH).map(async c => {
        try {
          const res = await apiFetch(`${API}/users/${c.id}`, { method: 'PATCH', body: JSON.stringify({ salesRepId: effectiveRepId }) });
          if (!res.ok) failed.push({ label: label(c), error: getErrorMessage(await res.json().catch(() => null), `HTTP ${res.status}`) });
        } catch {
          failed.push({ label: label(c), error: 'Network error' });
        }
      }));
      setProgress({ done: Math.min(i + BATCH, toUpdate.length), total: toUpdate.length, failed: [...failed] });
    }
    setApplying(false);
    onDone();
  };

  const finished = progress && !applying;
  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', background: 'var(--bg-input)', fontSize: '12px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', width: '100%', maxWidth: '760px', maxHeight: '88vh', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h3 style={{ margin: 0, fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', color: 'var(--text-primary)' }}>Bulk Assign Sales Rep</h3>
          <button onClick={onClose} disabled={applying} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Paste a list copied from a spreadsheet (with its header row), or one email / company name per line. Customers are matched by email first, then by company name.
          Assigning a rep updates the whole company — every teammate and their existing orders.
        </p>

        {!progress && (
          <>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
              placeholder={'Company ID,Account Manager,Company Name,User Email\n26625,Kishan Thakkar,Henleys Trading Post Inc,henleytrading@shaw.ca\n…'}
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '12px 0' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assign to</span>
              <select value={effectiveRepId} onChange={e => setRepId(e.target.value)}
                style={{ fontSize: '13px', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
                <option value="">— Select Sales Rep —</option>
                {Object.entries(salesRepMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>

            {rows.length > 0 && (
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={box}>
                  <strong>{rows.length}</strong> rows in list · <strong>{rows.length - unmatched.length}</strong> matched to customer accounts ·{' '}
                  <strong>{toUpdate.length}</strong> {toUpdate.length === 1 ? 'company/customer' : 'companies/customers'} will be updated
                  {alreadyAssigned > 0 && <> · {alreadyAssigned} already assigned to this rep</>}
                </div>

                {reassigning.length > 0 && effectiveRepId && (
                  <div style={{ ...box, borderColor: '#F59E0B', background: '#FEF3C7' }}>
                    <strong>{reassigning.length} currently assigned to a different rep</strong> — they will be moved to {salesRepMap[effectiveRepId]}:
                    <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
                      {reassigning.map(c => `${label(c)} (now ${salesRepMap[c.salesRepId!] || 'unknown rep'})`).join(' · ')}
                    </div>
                  </div>
                )}

                {unmatched.length > 0 && (
                  <div style={{ ...box, borderColor: '#DC2626', background: 'rgba(220,38,38,0.05)' }}>
                    <strong>{unmatched.length} not found</strong> — no customer account with this email or company name, so nothing will change for these:
                    <div style={{ marginTop: '4px', color: 'var(--text-secondary)', maxHeight: '140px', overflowY: 'auto' }}>
                      {unmatched.map(u => <div key={u.line}>{u.company || '—'}{u.email ? ` · ${u.email}` : ''}</div>)}
                    </div>
                  </div>
                )}

                <details style={box}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Show every match ({rows.length - unmatched.length})</summary>
                  <div style={{ marginTop: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                    {matched.filter(m => m.matches.length).map(m => (
                      <div key={m.line} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                        {m.company || m.email} → {m.matches.map(c => `${label(c)} <${c.email}>`).join(', ')}
                        <span style={{ color: 'var(--text-muted)' }}> · by {m.matchedBy}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={apply} disabled={!effectiveRepId || !toUpdate.length}
                style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 600, cursor: !effectiveRepId || !toUpdate.length ? 'default' : 'pointer', opacity: !effectiveRepId || !toUpdate.length ? 0.5 : 1 }}>
                Assign {toUpdate.length || ''} to {effectiveRepId ? salesRepMap[effectiveRepId] : 'rep'}
              </button>
            </div>
          </>
        )}

        {progress && (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={box}>
              {applying ? 'Assigning…' : 'Done.'} {progress.done} / {progress.total} processed
              {finished && <> · <strong>{progress.total - progress.failed.length}</strong> updated</>}
            </div>
            {progress.failed.length > 0 && (
              <div style={{ ...box, borderColor: '#DC2626' }}>
                <strong>{progress.failed.length} failed:</strong>
                {progress.failed.map((f, i) => <div key={i}>{f.label} — {f.error}</div>)}
              </div>
            )}
            {finished && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Close</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
