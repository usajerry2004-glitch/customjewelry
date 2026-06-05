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

  // Group by repairContractor (fallback to 'Unassigned')
  const grouped: Record<string, Partial<Order>[]> = {};
  orders.forEach(o => {
    const key = (o as any).repairContractor || 'Unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(o);
  });

  // Sort contractors alphabetically, Unassigned last
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
        <div style={{ textAlign: 'center', padding: '80px', ...card }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔧</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>No orders in repair</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Orders sent for repair will appear here, grouped by contractor.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {contractors.map(contractor => {
            const contractorOrders = grouped[contractor];
            const overdueCount = contractorOrders.filter(o => daysSince(o.updatedAt!) > 1).length;

            return (
              <div key={contractor}>
                {/* Contractor header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
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

                {/* Orders under this contractor */}
                <div className="table-scroll" style={{ ...card, overflow: 'hidden' }}>
                  <table className="repairs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
                        {['PO Number', 'Store / Customer', 'Product', 'Sent for Repair', 'Days', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contractorOrders
                        .sort((a, b) => new Date(a.updatedAt!).getTime() - new Date(b.updatedAt!).getTime())
                        .map((order, i) => {
                          const days = daysSince(order.updatedAt!);
                          const isOverdue = days > 1;
                          return (
                            <tr key={order.id}
                              style={{ borderBottom: i < contractorOrders.length - 1 ? '1px solid var(--border-light)' : 'none', cursor: 'pointer', borderLeft: isOverdue ? '3px solid #DC2626' : '3px solid transparent' }}
                              onClick={() => router.push(`/orders/${order.id}`)}
                              onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(0,0,0,0.02)'}
                              onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                            >
                              <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                                {order.poNumber}
                              </td>
                              <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                {order.storeName || order.customerFullName || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                                {[order.orderType, order.metalType, order.metalColor].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {new Date(order.updatedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontWeight: 700, color: isOverdue ? '#DC2626' : 'var(--text-secondary)', background: isOverdue ? 'rgba(220,38,38,0.08)' : 'transparent', padding: isOverdue ? '2px 8px' : '0', borderRadius: '5px', fontSize: '12px' }}>
                                  {days} day{days !== 1 ? 's' : ''}{isOverdue ? ' ⚠' : ''}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <button
                                  onClick={e => { e.stopPropagation(); router.push(`/orders/${order.id}`); }}
                                  style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent-dark)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                  View →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
