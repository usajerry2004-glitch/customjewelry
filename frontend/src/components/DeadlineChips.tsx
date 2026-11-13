import React, { useEffect, useState } from 'react';

// Staff-only deadline chips shown beside the PO number on the order page.
// Targets (calendar time):
//   CAD           — first design CAD within 24 hours of moving to CAD In Progress
//   Stone         — stone received within 2 days of the supplier being assigned
//   Manufacturing — manufactured within 6 days of the VPO being issued
// Each chip turns amber in the last quarter of its window and red once overdue.

const HOUR = 3600_000;
const DAY = 24 * HOUR;

interface DeadlineOrder {
  status?: string;
  createdAt?: string;
  vpoIssuedAt?: string | null;
  supplySource?: string | null;
  stoneStatus?: string | null;
}
interface DeadlineCad { createdAt: string; designerNotes?: string | null }
interface DeadlineEvent { action: string; toStatus?: string; createdAt: string }

type Level = 'ok' | 'soon' | 'late';
interface Deadline {
  key: string;
  label: string;
  title: string;
  rule: string;
  start: Date;
  due: Date;
}

const REFERENCE_TAGS = ['Reference image', 'Customer reference image'];

function buildDeadlines(order: DeadlineOrder, cads: DeadlineCad[], events: DeadlineEvent[]): Deadline[] {
  const list: Deadline[] = [];
  const status = order.status;
  const latest = (match: (e: DeadlineEvent) => boolean) =>
    events.filter(match).map(e => new Date(e.createdAt)).sort((a, b) => b.getTime() - a.getTime())[0] || null;

  // CAD — while In CAD and no design file (not a reference) is uploaded yet;
  // clock starts when the order moved to CAD In Progress (order placed, if it
  // started there and has no logged status change).
  const hasDesign = cads.some(c => !c.designerNotes || !REFERENCE_TAGS.includes(c.designerNotes));
  if (status === 'CAD_IN_PROGRESS' && !hasDesign) {
    const start = latest(e => e.action === 'STATUS_CHANGE' && e.toStatus === 'CAD_IN_PROGRESS')
      || (order.createdAt ? new Date(order.createdAt) : null);
    if (start) list.push({ key: 'cad', label: 'CAD', title: 'First CAD due', rule: '24 hours from moved to CAD In Progress', start, due: new Date(start.getTime() + DAY) });
  }

  if (status === 'VPO_ISSUED') {
    const vpoAt = order.vpoIssuedAt
      ? new Date(order.vpoIssuedAt)
      : latest(e => e.action === 'STATUS_CHANGE' && e.toStatus === 'VPO_ISSUED');

    // Stone — from the latest supplier assignment until the stone is received.
    const stonePending = !order.stoneStatus || order.stoneStatus === 'PENDING_STONE';
    if (order.supplySource && stonePending) {
      const start = latest(e => e.action === 'SUPPLIER_ASSIGNED') || vpoAt;
      if (start) list.push({ key: 'stone', label: 'Stone', title: 'Stone due', rule: '2 days from supplier assigned', start, due: new Date(start.getTime() + 2 * DAY) });
    }

    // Manufacturing — from VPO issued until the order is marked Manufactured.
    if (vpoAt) list.push({ key: 'mfg', label: 'Manufacturing', title: 'Manufacturing due', rule: '6 days from VPO issued', start: vpoAt, due: new Date(vpoAt.getTime() + 6 * DAY) });
  }
  return list;
}

function levelOf(d: Deadline, now: number): Level {
  const left = d.due.getTime() - now;
  if (left < 0) return 'late';
  const window = d.due.getTime() - d.start.getTime();
  return left <= window / 4 ? 'soon' : 'ok';
}

function shortSpan(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= DAY) return `${Math.floor(abs / DAY)}d`;
  if (abs >= HOUR) return `${Math.floor(abs / HOUR)}h`;
  return `${Math.max(1, Math.floor(abs / 60_000))}m`;
}

function longSpan(ms: number): string {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}${h ? ` ${h} hr` : ''}`;
  if (h > 0) return `${h} hr`;
  return `${Math.max(1, Math.floor(abs / 60_000))} min`;
}

const fmtDate = (d: Date) => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const STYLES: Record<Level, { chip: React.CSSProperties; text: string }> = {
  late: { chip: { background: '#D92D20', color: '#FFFFFF', border: '1px solid #D92D20' }, text: '#B42318' },
  soon: { chip: { background: '#FEF0C7', color: '#93370D', border: '1px solid #FEC84B' }, text: '#93370D' },
  ok:   { chip: { background: '#E8EFF8', color: '#1E3A5F', border: '1px solid #C2D3EA' }, text: '#1E3A5F' },
};

function ChipIcon({ level }: { level: Level }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      {level === 'late' ? <><path d="M12 7v5" /><path d="M12 16h.01" /></> : <path d="M12 7v5l3 2" />}
    </svg>
  );
}

export function DeadlineChips({ order, cads, events }: { order: DeadlineOrder; cads: DeadlineCad[]; events: DeadlineEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<string | null>(null);

  // Keep the countdown current while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const deadlines = buildDeadlines(order, cads, events);
  if (!deadlines.length) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {deadlines.map(d => {
        const level = levelOf(d, now);
        const left = d.due.getTime() - now;
        const s = STYLES[level];
        return (
          <div key={d.key} style={{ position: 'relative' }}
            onMouseEnter={() => setOpen(d.key)} onMouseLeave={() => setOpen(o => (o === d.key ? null : o))}>
            <button
              type="button"
              onClick={() => setOpen(o => (o === d.key ? null : d.key))}
              aria-expanded={open === d.key}
              style={{ ...s.chip, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, padding: '5px 11px', borderRadius: '99px', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.2 }}
            >
              <ChipIcon level={level} />
              {d.label} · {left < 0 ? `${shortSpan(left)} overdue` : `${shortSpan(left)} left`}
            </button>
            {open === d.key && (
              <div role="tooltip" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50, width: '280px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 12px 32px rgba(30,42,58,0.16)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.title}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Staff only</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{fmtDate(d.due)}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: s.text }}>
                  {left < 0 ? `Overdue by ${longSpan(left)}` : `${longSpan(left)} left`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target: {d.rule} ({fmtDate(d.start)})</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
