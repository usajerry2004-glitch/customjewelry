import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { toast as toastUtil, ToastOptions, ToastVariant } from '../utils/toast';

interface ToastItem extends ToastOptions {
  id: string;
}

const STYLE: Record<ToastVariant, { bg: string; border: string; icon: string; iconColor: string }> = {
  success: { bg: '#ECFDF5', border: '#6EE7B7',       icon: '✓', iconColor: '#059669' },
  error:   { bg: '#FEF2F2', border: '#FCA5A5',       icon: '✕', iconColor: '#DC2626' },
  warning: { bg: '#FFFBEB', border: '#FCD34D',       icon: '⚠', iconColor: '#D97706' },
  info:    { bg: 'var(--bg-card)', border: 'var(--border)', icon: 'ℹ', iconColor: 'var(--navy)' },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    toastUtil._subscribe(opts => {
      const id = String(++counter.current);
      setItems(prev => [...prev, { id, variant: 'info', ...opts }]);
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  return (
    <RadixToast.Provider swipeDirection="right">
      {items.map(item => {
        const s = STYLE[item.variant ?? 'info'];
        return (
          <RadixToast.Root
            key={item.id}
            open
            onOpenChange={open => { if (!open) dismiss(item.id); }}
            duration={item.duration ?? (item.variant === 'error' ? 7000 : 4000)}
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              minWidth: '280px',
              maxWidth: '420px',
            }}
          >
            <span style={{ fontSize: '14px', color: s.iconColor, fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>
              {s.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <RadixToast.Title style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'block' }}>
                {item.title}
              </RadixToast.Title>
              {item.description && (
                <RadixToast.Description style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.5, display: 'block' }}>
                  {item.description}
                </RadixToast.Description>
              )}
            </div>
            <RadixToast.Close style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: 0, lineHeight: 1, flexShrink: 0 }}>
              ✕
            </RadixToast.Close>
          </RadixToast.Root>
        );
      })}
      <RadixToast.Viewport
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 99999,
          listStyle: 'none',
          margin: 0,
          padding: 0,
          outline: 'none',
        }}
      />
    </RadixToast.Provider>
  );
}
