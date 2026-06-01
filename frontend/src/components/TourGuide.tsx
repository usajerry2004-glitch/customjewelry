import React, { useEffect, useState, useCallback } from 'react';

interface Step {
  title: string;
  body: string;
  icon: string;
  target: string | null;
  side: 'center' | 'right' | 'bottom' | 'left';
  tip?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to JewelFlow OS',
    body: 'Your end-to-end custom jewelry workflow platform — from customer inquiry to final delivery. This tour walks you through every key area in under 2 minutes.',
    icon: '💎',
    target: null,
    side: 'center',
  },
  {
    title: 'Sidebar Navigation',
    body: 'Every module is one click away. Each role sees only the sections relevant to them — Sales Reps, Authorizers, CAD Designers, Factory Managers all have tailored views.',
    icon: '🗂',
    target: '.app-sidebar nav',
    side: 'right',
    tip: 'Tip: Click any item to jump straight to that module.',
  },
  {
    title: 'Dashboard',
    body: 'Your live operations hub. See active orders, overdue alerts, pipeline health, and role-specific quick actions — all updated in real time.',
    icon: '◈',
    target: 'a[href="/dashboard"]',
    side: 'right',
  },
  {
    title: 'Orders',
    body: 'Every custom order lives here. Search by PO number or store name, filter by status, or narrow down by month and date range.',
    icon: '📋',
    target: 'a[href="/orders"]',
    side: 'right',
    tip: 'Tip: Use the month chips or From/To date pickers to slice orders by time period.',
  },
  {
    title: 'Pipeline Board',
    body: 'The Kanban view shows orders as cards moving through every workflow stage — from Waiting Confirmation all the way to Delivered.',
    icon: '⊞',
    target: 'a[href="/orders/kanban"]',
    side: 'right',
  },
  {
    title: 'Customers',
    body: 'Manage customer accounts and place orders on their behalf. Sales Reps see only their own assigned customers; Authorizers and Admins see everyone.',
    icon: '👥',
    target: 'a[href="/customers"]',
    side: 'right',
    tip: 'Tip: Reference images can be attached directly when placing a new order.',
  },
  {
    title: 'CAD Files',
    body: 'CAD Designers upload design files here. Click the order link on any file to jump straight to full order details, conversations, and file history.',
    icon: '🎨',
    target: 'a[href="/cad"]',
    side: 'right',
    tip: 'Tip: Only CAD Designers can upload CAD files. Others can approve, reject, or request revisions.',
  },
  {
    title: 'Reports & Analytics',
    body: 'Order pipeline analytics by period — new orders, revenue, top stores, pipeline by stage, and SLA breach alerts. Export the full report as CSV or PDF.',
    icon: '📊',
    target: 'a[href="/reports"]',
    side: 'right',
  },
  {
    title: 'Notifications',
    body: 'Real-time alerts for order status changes, CAD approvals, SLA breaches, and shipping updates. The badge shows your unread count.',
    icon: '🔔',
    target: '#tour-notif-bell',
    side: 'bottom',
  },
  {
    title: "You're all set! 🎉",
    body: "You now know the key areas of JewelFlow OS. Click any module in the sidebar to get started, or replay this tour anytime using the ? button in the top bar.",
    icon: '✅',
    target: null,
    side: 'center',
  },
];

interface SpotRect { top: number; left: number; width: number; height: number; }

interface Props { onClose: () => void; }

export const TourGuide: React.FC<Props> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<SpotRect | null>(null);
  const [cardPos, setCardPos] = useState<React.CSSProperties>({});

  const current = STEPS[step];
  const CARD_W = 360;

  const layout = useCallback(() => {
    const centered: React.CSSProperties = {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)', width: `${CARD_W}px`, maxWidth: '92vw',
    };

    if (!current.target) { setSpot(null); setCardPos(centered); return; }

    const el = document.querySelector(current.target);
    if (!el) { setSpot(null); setCardPos(centered); return; }

    const r = el.getBoundingClientRect();
    const pad = 8;
    setSpot({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });

    const GAP = 18;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let pos: React.CSSProperties = {};
    if (current.side === 'right') {
      const leftCandidate = r.right + GAP;
      pos = {
        position: 'fixed',
        top: Math.max(16, Math.min(r.top - 4, vh - 320)),
        left: leftCandidate + CARD_W < vw ? leftCandidate : Math.max(16, r.left - CARD_W - GAP),
        width: `${CARD_W}px`,
      };
    } else if (current.side === 'bottom') {
      pos = {
        position: 'fixed',
        top: r.bottom + GAP,
        left: Math.max(16, Math.min(r.left + r.width / 2 - CARD_W / 2, vw - CARD_W - 16)),
        width: `${CARD_W}px`,
      };
    } else if (current.side === 'left') {
      pos = {
        position: 'fixed',
        top: Math.max(16, r.top - 4),
        left: Math.max(16, r.left - CARD_W - GAP),
        width: `${CARD_W}px`,
      };
    } else {
      pos = centered;
    }

    setCardPos(pos);
  }, [current]);

  useEffect(() => {
    layout();
    window.addEventListener('resize', layout);
    return () => window.removeEventListener('resize', layout);
  }, [layout]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step]);

  const next = () => step < STEPS.length - 1 ? setStep(s => s + 1) : onClose();
  const prev = () => step > 0 && setStep(s => s - 1);

  return (
    <>
      {/* Backdrop — only shown when no spotlight (center steps) */}
      {!spot && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(13,27,53,0.72)', backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        />
      )}

      {/* Spotlight box + overlay */}
      {spot && (
        <div
          style={{
            position: 'fixed',
            top: spot.top, left: spot.left,
            width: spot.width, height: spot.height,
            borderRadius: '8px',
            boxShadow: '0 0 0 10000px rgba(13,27,53,0.72)',
            border: '2px solid rgba(192,155,88,0.85)',
            outline: '1px solid rgba(192,155,88,0.3)',
            zIndex: 10001,
            pointerEvents: 'none',
            transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease',
          }}
        />
      )}

      {/* Tour card */}
      <div
        style={{
          ...cardPos,
          zIndex: 10002,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '26px 28px',
          boxShadow: '0 24px 64px rgba(13,27,53,0.38), 0 2px 8px rgba(13,27,53,0.12)',
          transition: 'top 0.3s ease, left 0.3s ease',
        }}
      >
        {/* Progress dots + close */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? '22px' : '7px',
                  height: '7px',
                  borderRadius: '99px',
                  background: i === step ? '#0D1B35' : i < step ? '#C09B58' : 'var(--border)',
                  transition: 'all 0.25s ease',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '17px', lineHeight: 1, padding: '2px 4px', borderRadius: '4px' }}
          >
            ✕
          </button>
        </div>

        {/* Icon */}
        <div style={{ fontSize: '30px', marginBottom: '10px', lineHeight: 1 }}>{current.icon}</div>

        {/* Title */}
        <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.25 }}>
          {current.title}
        </div>

        {/* Body */}
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: current.tip ? '12px' : '22px' }}>
          {current.body}
        </div>

        {/* Tip */}
        {current.tip && (
          <div style={{ fontSize: '11.5px', color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.08)', border: '1px solid rgba(192,155,88,0.2)', borderRadius: '7px', padding: '8px 12px', marginBottom: '22px', lineHeight: 1.6 }}>
            {current.tip}
          </div>
        )}

        {/* Nav buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={prev}
            disabled={step === 0}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', cursor: step === 0 ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', opacity: step === 0 ? 0.35 : 1, fontWeight: 500 }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
            {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={next}
            style={{ background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '8px 22px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#fff', letterSpacing: '0.3px' }}
          >
            {step === STEPS.length - 1 ? '✓ Finish' : 'Next →'}
          </button>
        </div>

        {/* Keyboard hint */}
        <div style={{ marginTop: '12px', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', opacity: 0.6 }}>
          ← → arrow keys to navigate · Esc to close
        </div>
      </div>
    </>
  );
};
