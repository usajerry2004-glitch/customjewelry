import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { Order } from '../utils/types';

export async function getServerSideProps() { return { props: {} }; }

function daysSince(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
};

export default function RepairsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API}/orders?status=REPAIR&limit=200`).then(async res => {
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
      setLoading(false);
    });
  }, []);

  // Group by repairContractor
  const grouped: Record<string, Partial<Order>[]> = {};
  orders.forEach(o => {
    const key = (o as any).repairContractor || 'Unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(o);
  });

  const contractors = Object.keys(grouped).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  const total = orders.length;
  const overdue = orders.filter(o => daysSince(o.updatedAt!) > 1).length;

  return (
    <AppLayout
      title="Repairs"
      subtitle={loading ? '' : `${total} order${total !== 1 ? 's' : ''} in repair${overdue > 0 ? ` · ${overdue} overdue` : ''}`}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', ...card }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔧</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>No orders in repair</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Orders sent for repair will appear here, grouped by contractor.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {contractors.map(contractor => {
            const contractorOrders = grouped[contractor];
            const overdueCount = contractorOrders.filter(o => daysSince(o.updatedAt!) > 1).length;

            return (
              <div key={contractor}>
                {/* Contractor header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
                    🔧 {contractor}
                  </div>
                  <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '99px', padding: '2px 10px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {contractorOrders.length} order{contractorOrders.length !== 1 ? 's' : ''}
                  </span>
                  {overdueCount > 0 && (
                    <span style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '99px', padding: '2px 10px', fontSize: '11px', color: '#DC2626', fontWeight: 700 }}>
                      ⚠ {overdueCount} overdue
                    </span>
                  )}
                </div>

                {/* Cards — works on all screen sizes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {contractorOrders
                    .sort((a, b) => new Date(a.updatedAt!).getTime() - new Date(b.updatedAt!).getTime())
                    .map(order => {
                      const days = daysSince(order.updatedAt!);
                      const isOverdue = days > 1;
                      return (
                        <div
                          key={order.id}
                          onClick={() => router.push(`/orders/${order.id}`)}
                          style={{
                            ...card,
                            borderLeft: `4px solid ${isOverdue ? '#DC2626' : 'var(--border)'}`,
                            padding: '14px 16px',
                            cursor: 'pointer',
                            transition: 'box-shadow 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              {/* PO + overdue badge */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '5px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)' }}>{order.poNumber}</span>
                                {isOverdue && (
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '5px', padding: '1px 7px' }}>
                                    ⚠ {days} day{days !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              {/* Store */}
                              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                {order.storeName || order.customerFullName || '—'}
                              </div>
                              {/* Product specs */}
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {[order.orderType, order.metalType, order.metalColor].filter(Boolean).join(' · ') || '—'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              {!isOverdue && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '4px' }}>
                                  {days} day{days !== 1 ? 's' : ''}
                                </div>
                              )}
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {new Date(order.updatedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginTop: '4px' }}>
                                View →
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
