import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { STATUS_CONFIG } from '../utils/types';

export async function getServerSideProps() { return { props: {} }; }

interface PriorityOrder {
  id: string;
  poNumber: string;
  storeName?: string;
  customerFullName?: string;
  orderType?: string;
  metalType?: string;
  metalColor?: string;
  status: string;
  cadSubStatus?: string;
  isPriorityCustomer?: boolean;
  quotedCost?: number;
  createdAt: string;
  updatedAt: string;
  priorityReason: string;
  priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

const PRIORITY_COLOR  = { CRITICAL: '#7C3AED', HIGH: '#DC2626', MEDIUM: '#F59E0B' };
const PRIORITY_BG     = { CRITICAL: 'rgba(124,58,237,0.08)', HIGH: 'rgba(220,38,38,0.08)', MEDIUM: 'rgba(245,158,11,0.08)' };
const PRIORITY_BORDER = { CRITICAL: 'rgba(124,58,237,0.35)', HIGH: 'rgba(220,38,38,0.3)', MEDIUM: 'rgba(245,158,11,0.3)' };

const COMPACT_THRESHOLD = 5;

function daysSince(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

// ── Jump-link bar ──────────────────────────────────────────────────────────
function findScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY, overflow } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') return node;
    node = node.parentElement;
  }
  return document.documentElement;
}

function JumpBar({ critical, high, medium, onJump }: { critical: number; high: number; medium: number; onJump: (id: string) => void }) {
  const items = [
    { id: 'sec-critical', label: `🚨 Critical`, count: critical, color: '#7C3AED', show: critical > 0 },
    { id: 'sec-high',     label: `🔴 High`,     count: high,     color: '#DC2626', show: high > 0 },
    { id: 'sec-medium',   label: `🟡 Medium`,   count: medium,   color: '#F59E0B', show: medium > 0 },
  ].filter(i => i.show);

  if (items.length < 2) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginRight: '4px' }}>Jump to:</span>
      {items.map(i => (
        <button key={i.id} onClick={() => onJump(i.id)} style={{
          padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 700,
          color: i.color, background: 'var(--bg-card)', border: `1px solid ${i.color}40`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          {i.label}
          <span style={{ background: i.color, color: '#fff', borderRadius: '99px', padding: '0 5px', fontSize: '10px' }}>{i.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────
function PrioritySection({
  id, icon, label, color, orders, open, onToggle, router,
}: {
  id: string; icon: string; label: string; color: string;
  orders: PriorityOrder[]; open: boolean; onToggle: () => void; router: ReturnType<typeof useRouter>;
}) {
  const compact = orders.length > COMPACT_THRESHOLD;

  if (orders.length === 0) return null;
  return (
    <div id={id}>
      {/* Section header */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: open ? '10px' : '0',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.8px', flex: 1 }}>
          {label} ({orders.length})
        </h3>
        {compact && open && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, marginRight: '8px' }}>compact view</span>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>▾</span>
      </button>

      {open && (
        compact ? (
          // ── Compact table ────────────────────────────────────────────────
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
                  {['PO Number', 'Store / Customer', 'Status', 'Reason', 'Age'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order, i) => {
                  const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
                  const sb = STATUS_BADGE[order.status];
                  const days = daysSince(order.createdAt);
                  const pc = PRIORITY_COLOR[order.priorityLevel];
                  return (
                    <tr key={order.id}
                      onClick={() => router.push(`/orders/${order.id}`)}
                      style={{ borderBottom: i < orders.length - 1 ? '1px solid var(--border-light)' : 'none', cursor: 'pointer', borderLeft: `3px solid ${pc}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(0,0,0,0.02)'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{order.poNumber}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.storeName || order.customerFullName || '—'}
                      </td>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                        {sb ? (
                          <span style={{ fontSize: '10px', fontWeight: 700, color: sb.color, background: sb.bg, border: `1px solid ${sb.border}`, padding: '1px 7px', borderRadius: '99px' }}>{sb.icon} {sb.label}</span>
                        ) : (
                          <span style={{ fontSize: '10px', fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '1px 7px', borderRadius: '99px' }}>{cfg.label}</span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{order.priorityReason}</td>
                      <td style={{ padding: '9px 14px', color: days >= 10 ? '#DC2626' : 'var(--text-muted)', fontWeight: days >= 10 ? 700 : 400, whiteSpace: 'nowrap' }}>{days}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // ── Card view ────────────────────────────────────────────────────
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {orders.map(order => <PriorityOrderCard key={order.id} order={order} onClick={() => router.push(`/orders/${order.id}`)} />)}
          </div>
        )
      )}
    </div>
  );
}

export default function PriorityTasksPage() {
  const router = useRouter();
  const [priorityOrders, setPriorityOrders] = useState<PriorityOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'sec-critical': true, 'sec-high': true, 'sec-medium': false,
  });

  const toggleSection = (id: string) => setOpenSections(s => ({ ...s, [id]: !s[id] }));

  const jumpTo = (id: string) => {
    // Open the section first, then scroll after paint
    setOpenSections(s => ({ ...s, [id]: true }));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        const container = findScrollParent(el);
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        container.scrollTo({ top: container.scrollTop + elRect.top - containerRect.top - 16, behavior: 'smooth' });
      });
    });
  };

  useEffect(() => {
    apiFetch(`${API}/orders/priority`).then(async res => {
      if (res.ok) setPriorityOrders(await res.json());
      setLoading(false);
    });
  }, []);

  const filtered = search.trim()
    ? priorityOrders.filter(o =>
        o.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        (o.storeName || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.customerFullName || '').toLowerCase().includes(search.toLowerCase())
      )
    : priorityOrders;

  const criticalOrders = filtered.filter(o => o.priorityLevel === 'CRITICAL');
  const highOrders     = filtered.filter(o => o.priorityLevel === 'HIGH');
  const medOrders      = filtered.filter(o => o.priorityLevel === 'MEDIUM');

  const subtitle = loading ? '' :
    priorityOrders.length === 0 ? 'All caught up' :
    [
      criticalOrders.length ? `${criticalOrders.length} critical` : '',
      highOrders.length     ? `${highOrders.length} high` : '',
      medOrders.length      ? `${medOrders.length} medium` : '',
    ].filter(Boolean).join(' · ');

  return (
    <AppLayout title="Priority Tasks" subtitle={subtitle}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading…</div>
      ) : priorityOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>All caught up!</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No orders need immediate attention right now.</div>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by PO number or store…"
              style={{
                flex: 1, minWidth: '220px', maxWidth: '320px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '7px 12px', fontSize: '13px',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>
                Clear
              </button>
            )}
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filtered.length} of {priorityOrders.length} orders
              {filtered.length > COMPACT_THRESHOLD && <span style={{ marginLeft: '8px', color: 'var(--accent)', fontWeight: 600 }}>· sections with &gt;{COMPACT_THRESHOLD} orders show compact view</span>}
            </span>
          </div>

          {/* Jump bar */}
          <JumpBar critical={criticalOrders.length} high={highOrders.length} medium={medOrders.length} onJump={jumpTo} />

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>No orders match "{search}"</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <PrioritySection id="sec-critical" icon="🚨" label="Critical — Needs Immediate Action" color="#7C3AED" orders={criticalOrders} open={openSections['sec-critical']} onToggle={() => toggleSection('sec-critical')} router={router} />
              <PrioritySection id="sec-high"     icon="🔴" label="High Priority"                   color="#DC2626" orders={highOrders}     open={openSections['sec-high']}     onToggle={() => toggleSection('sec-high')}     router={router} />
              <PrioritySection id="sec-medium"   icon="🟡" label="Medium Priority"                 color="#F59E0B" orders={medOrders}       open={openSections['sec-medium']}   onToggle={() => toggleSection('sec-medium')}   router={router} />
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}

const STATUS_BADGE: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  ORDER_REVISION: { icon: '↩', label: 'Revision Requested', color: '#C2410C', bg: '#FFF0E6', border: '#F97316' },
  PENDING_CAD:    { icon: '⏳', label: 'Awaiting CAD Start', color: '#6D28D9', bg: '#EDE9FE', border: '#8B5CF6' },
};

function PriorityOrderCard({ order, onClick }: { order: PriorityOrder; onClick: () => void }) {
  const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const specialBadge = STATUS_BADGE[order.status];
  const days = daysSince(order.createdAt);
  const pc = PRIORITY_COLOR[order.priorityLevel];
  const pb = PRIORITY_BG[order.priorityLevel];
  const pbd = PRIORITY_BORDER[order.priorityLevel];

  return (
    <div onClick={onClick} style={{ background: pb, border: `1px solid ${pbd}`, borderLeft: `4px solid ${pc}`, borderRadius: 'var(--radius)', padding: '14px 18px', cursor: 'pointer', transition: 'box-shadow 0.15s', boxShadow: 'var(--shadow-sm)' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '5px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{order.poNumber}</span>
            {specialBadge ? (
              <span style={{ fontSize: '10px', fontWeight: 700, color: specialBadge.color, background: specialBadge.bg, border: `1px solid ${specialBadge.border}`, padding: '2px 9px', borderRadius: '99px' }}>
                {specialBadge.icon} {specialBadge.label}
              </span>
            ) : (
              <span style={{ fontSize: '10px', background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: '99px', fontWeight: 600 }}>{cfg.label}</span>
            )}
            {order.isPriorityCustomer && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.15)', border: '1px solid var(--accent)', borderRadius: '99px', padding: '1px 8px' }}>★ Priority Customer</span>}
            <span style={{ fontSize: '10px', fontWeight: 700, color: pc, background: 'rgba(255,255,255,0.6)', border: `1px solid ${pbd}`, borderRadius: '5px', padding: '1px 7px' }}>
              🚨 {order.priorityReason}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            {order.storeName || order.customerFullName || '—'}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {order.orderType && <span style={{ fontSize: '11px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 8px', color: 'var(--text-secondary)' }}>{order.orderType}</span>}
            {order.metalType && order.metalColor && <span style={{ fontSize: '11px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 8px', color: 'var(--text-secondary)' }}>{order.metalType} · {order.metalColor}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: days >= 10 ? '#DC2626' : 'var(--text-muted)', fontWeight: days >= 10 ? 700 : 400, marginBottom: '4px' }}>{days} day{days !== 1 ? 's' : ''} old</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        </div>
      </div>
    </div>
  );
}
