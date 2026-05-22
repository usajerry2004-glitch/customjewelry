import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { Order, STATUS_CONFIG } from '../../utils/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface KanbanColumn {
  status: string;
  orders: Partial<Order>[];
  count: number;
}

const COLUMN_ORDER = [
  'WAITING_CONFIRMATION',
  'PENDING_CAD',
  'CAD_IN_PROGRESS',
  'CUSTOMER_APPROVED',
  'SKU_CREATION',
  'VPO_ISSUED',
  'PENDING_CONTRACTOR',
  'ORDER_JOB_BAG_CREATED',
  'READY_TO_INVOICE',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
];

export default function KanbanPage() {
  const router = useRouter();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/orders/kanban`);
        if (res.ok) {
          const data: KanbanColumn[] = await res.json();
          const sorted = [...data].sort((a, b) =>
            COLUMN_ORDER.indexOf(a.status) - COLUMN_ORDER.indexOf(b.status)
          ).filter(col => COLUMN_ORDER.includes(col.status));
          setColumns(sorted);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updateStatus = async (orderId: string, newStatus: string) => {
    await fetch(`${API}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setColumns(prev => {
      const order = prev.flatMap(c => c.orders).find(o => o.id === orderId);
      if (!order) return prev;
      return prev.map(col => ({
        ...col,
        orders: col.status === newStatus
          ? [...col.orders, { ...order, status: newStatus as any }]
          : col.orders.filter(o => o.id !== orderId),
        count: col.status === newStatus ? col.count + 1 : col.orders.some(o => o.id === orderId) ? col.count - 1 : col.count,
      }));
    });
  };

  return (
    <AppLayout
      title="Kanban Board"
      subtitle="Drag orders across stages"
      actions={
        <button
          onClick={() => router.push('/orders')}
          style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '8px', padding: '7px 14px', color: '#818CF8', fontSize: '12px', cursor: 'pointer' }}
        >
          ☰ List view
        </button>
      }
    >
      {loading ? (
        <div style={{ color: '#4B5563', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading kanban…</div>
      ) : (
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', minHeight: '70vh' }}>
          {columns.map(col => {
            const cfg = STATUS_CONFIG[col.status] || { label: col.status, color: '#64748B', bg: '#1A1A24' };
            return (
              <div key={col.status} style={{ flexShrink: 0, width: '240px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Column header */}
                <div style={{
                  background: '#111118',
                  border: `1px solid ${cfg.color}30`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontSize: '11px', background: `${cfg.color}20`, color: cfg.color, borderRadius: '99px', padding: '1px 8px', fontWeight: 700 }}>{col.count}</span>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {col.orders.map(order => (
                    <div key={order.id}>
                      <OrderCard
                        order={order}
                        compact
                        onClick={() => router.push(`/orders/${order.id}`)}
                      />
                      {/* Quick move */}
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                        {COLUMN_ORDER.slice(COLUMN_ORDER.indexOf(col.status) + 1, COLUMN_ORDER.indexOf(col.status) + 2).map(nextStatus => {
                          const nc = STATUS_CONFIG[nextStatus];
                          if (!nc) return null;
                          return (
                            <button
                              key={nextStatus}
                              onClick={() => updateStatus(order.id!, nextStatus)}
                              style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '5px', border: `1px solid ${nc.color}40`, background: `${nc.color}10`, color: nc.color, cursor: 'pointer' }}
                            >
                              → {nc.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {col.orders.length === 0 && (
                    <div style={{ border: '1px dashed #2D2D3D', borderRadius: '8px', padding: '16px 10px', textAlign: 'center', color: '#2D2D3D', fontSize: '11px' }}>
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
