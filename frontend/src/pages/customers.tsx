import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { Order, STATUS_CONFIG } from '../utils/types';

export async function getServerSideProps() { return { props: {} }; }

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface Stats { totalCustomers: number; activeCustomers: number; totalStaff: number }

const INPUT = {
  background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px',
  padding: '9px 13px', color: '#E2E8F0', fontSize: '13px', outline: 'none',
  width: '100%', boxSizing: 'border-box' as const,
};

const ORDER_FIELDS = [
  { key: 'orderType', label: 'Order Type', type: 'select', options: ['Ring', 'Pendant', 'Earrings', 'Bracelet', 'Necklace', 'Bangle', 'Other'] },
  { key: 'metalType', label: 'Metal Type', type: 'select', options: ['14K', '18K', '10K', 'Platinum', 'Silver'] },
  { key: 'metalColor', label: 'Metal Color', type: 'select', options: ['YG-Yellow', 'WG-White', 'RG-Rose', 'WY-White & Yellow', 'Two-Tone'] },
  { key: 'size', label: 'Size / Ring Size', type: 'text', placeholder: 'e.g. Ring - 6.5' },
  { key: 'diamondType', label: 'Natural or Lab', type: 'select', options: ['Natural', 'Lab', 'Both'] },
  { key: 'diamondQuality', label: 'Diamond Quality', type: 'text', placeholder: 'e.g. F+VS+' },
  { key: 'centerStoneShape', label: 'Center Stone Shape', type: 'select', options: ['Round', 'Oval', 'Cushion', 'Emerald', 'Pear', 'Princess', 'Radiant', 'Marquise', 'Asscher', 'Heart', 'Other'] },
  { key: 'approximateCaratWeight', label: 'Approx. Carat Weight', type: 'text', placeholder: 'e.g. 1.5' },
  { key: 'quotedCost', label: 'Quoted Cost ($)', type: 'text', placeholder: 'e.g. 1250' },
  { key: 'vendorName', label: 'Vendor / Factory', type: 'text', placeholder: 'e.g. Creations' },
  { key: 'salesRepEmail', label: 'Sales Rep Email', type: 'text', placeholder: 'sales@kirajewels.one' },
];

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showOrder, setShowOrder] = useState<Customer | null>(null);
  const [showOrders, setShowOrders] = useState<{ customer: Customer; orders: Order[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [newUser, setNewUser] = useState({ firstName: '', lastName: '', email: '', password: '', storeName: '' });
  const [newOrder, setNewOrder] = useState<Record<string, string>>({
    orderType: '', metalType: '', metalColor: '', size: '', diamondType: '',
    diamondQuality: '', centerStoneShape: '', approximateCaratWeight: '',
    quotedCost: '', vendorName: '', salesRepEmail: '', customerNotes: '',
  });

  const load = async () => {
    const [uRes, sRes] = await Promise.all([
      apiFetch(`${API}/users?role=CUSTOMER`),
      apiFetch(`${API}/users/stats`),
    ]);
    if (uRes.ok) setCustomers(await uRes.json());
    if (sRes.ok) setStats(await sRes.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c =>
    `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const createCustomer = async () => {
    if (!newUser.firstName || !newUser.email || !newUser.password) {
      setError('First name, email, and password are required.');
      return;
    }
    setSaving(true); setError('');
    const res = await apiFetch(`${API}/users`, {
      method: 'POST',
      body: JSON.stringify({ ...newUser, role: 'CUSTOMER', lastName: newUser.lastName || '—' }),
    });
    if (res.ok) {
      setShowCreate(false);
      setNewUser({ firstName: '', lastName: '', email: '', password: '', storeName: '' });
      await load();
    } else {
      const d = await res.json();
      setError(d.message || 'Failed to create customer.');
    }
    setSaving(false);
  };

  const placeOrder = async () => {
    if (!showOrder || !newOrder.orderType || !newOrder.metalType || !newOrder.metalColor) {
      setError('Order Type, Metal Type, and Metal Color are required.'); return;
    }
    setSaving(true); setError('');
    const res = await apiFetch(`${API}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        ...newOrder,
        customerId: showOrder.id,
        customerEmail: showOrder.email,
        customerFullName: `${showOrder.firstName} ${showOrder.lastName}`,
        quotedCost: newOrder.quotedCost ? parseFloat(newOrder.quotedCost) : undefined,
        manufacturingPath: 'STANDARD',
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setShowOrder(null);
      setNewOrder({ orderType: '', metalType: '', metalColor: '', size: '', diamondType: '', diamondQuality: '', centerStoneShape: '', approximateCaratWeight: '', quotedCost: '', vendorName: '', salesRepEmail: '', customerNotes: '' });
      router.push(`/orders/${created.id}`);
    } else {
      const d = await res.json();
      setError(d.message || 'Failed to create order.');
    }
    setSaving(false);
  };

  const viewOrders = async (customer: Customer) => {
    const res = await apiFetch(`${API}/users/${customer.id}/orders`);
    if (res.ok) {
      const data = await res.json();
      setShowOrders({ customer, orders: data.orders || [] });
    }
  };

  const deactivate = async (id: string) => {
    await apiFetch(`${API}/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
    await load();
  };

  const modalBg: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
  };
  const modalBox: React.CSSProperties = {
    background: '#111118', border: '1px solid #2D2D3D', borderRadius: '16px',
    padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto',
  };

  return (
    <AppLayout
      title="Customers"
      subtitle={stats ? `${stats.totalCustomers} customers · ${stats.activeCustomers} active` : 'Loading…'}
      actions={
        <button
          onClick={() => { setShowCreate(true); setError(''); }}
          style={{ background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Add Customer
        </button>
      }
    >
      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          style={{ ...INPUT, maxWidth: '360px' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '14px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1E1E2E' }}>
              {['Customer', 'Email', 'Status', 'Joined', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: '#4B5563' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>👥</div>
                  <div style={{ fontSize: '14px', color: '#2D2D3D' }}>No customers yet</div>
                  <div style={{ fontSize: '12px', color: '#1E1E2E', marginTop: '4px' }}>Click "+ Add Customer" to create the first account.</div>
                </td>
              </tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #0F0F14' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0' }}>{c.firstName} {c.lastName}</div>
                </td>
                <td style={{ padding: '14px 16px', fontSize: '12px', color: '#94A3B8' }}>{c.email}</td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '99px', background: c.isActive ? '#10B98120' : '#EF444420', color: c.isActive ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: '12px', color: '#4B5563' }}>
                  {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={() => { setShowOrder(c); setError(''); }} style={{ padding: '5px 11px', borderRadius: '6px', border: 'none', background: 'rgba(246,216,96,0.15)', color: '#F6D860', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      + Order
                    </button>
                    <button onClick={() => viewOrders(c)} style={{ padding: '5px 11px', borderRadius: '6px', border: 'none', background: '#1A1A24', color: '#94A3B8', fontSize: '11px', cursor: 'pointer' }}>
                      View Orders
                    </button>
                    {c.isActive && (
                      <button onClick={() => deactivate(c.id)} style={{ padding: '5px 11px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: '11px', cursor: 'pointer' }}>
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Create Customer Modal ── */}
      {showCreate && (
        <div style={modalBg} onClick={() => setShowCreate(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#E2E8F0', marginBottom: '20px' }}>Add New Customer</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[['First Name *', 'firstName', 'text'], ['Last Name', 'lastName', 'text']].map(([label, key, type]) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
                  <input type={type} value={(newUser as any)[key]} onChange={e => setNewUser(p => ({ ...p, [key]: e.target.value }))} style={INPUT} />
                </div>
              ))}
            </div>

            {[['Email *', 'email', 'email'], ['Password *', 'password', 'password']].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
                <input type={type} value={(newUser as any)[key]} onChange={e => setNewUser(p => ({ ...p, [key]: e.target.value }))} style={INPUT} placeholder={key === 'password' ? 'Min 6 characters' : ''} />
              </div>
            ))}

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Store / Business Name</label>
              <input value={newUser.storeName} onChange={e => setNewUser(p => ({ ...p, storeName: e.target.value }))} style={INPUT} placeholder="Optional" />
            </div>

            {error && <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={createCustomer} disabled={saving} style={{ flex: 1, background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Creating…' : 'Create Customer'}
              </button>
              <button onClick={() => setShowCreate(false)} style={{ padding: '11px 20px', background: '#1A1A24', border: '1px solid #2D2D3D', borderRadius: '8px', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Order Modal ── */}
      {showOrder && (
        <div style={modalBg} onClick={() => setShowOrder(null)}>
          <div style={{ ...modalBox, maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>New Order</h2>
            <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '20px' }}>
              For <span style={{ color: '#F6D860', fontWeight: 600 }}>{showOrder.firstName} {showOrder.lastName}</span> ({showOrder.email})
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {ORDER_FIELDS.map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={newOrder[f.key] || ''} onChange={e => setNewOrder(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ ...INPUT, color: newOrder[f.key] ? '#E2E8F0' : '#4B5563' }}>
                      <option value="">Select…</option>
                      {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input value={newOrder[f.key] || ''} onChange={e => setNewOrder(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={INPUT} />
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Notes</label>
              <textarea value={newOrder.customerNotes} onChange={e => setNewOrder(p => ({ ...p, customerNotes: e.target.value }))}
                placeholder="Special instructions, reference links, etc."
                rows={3}
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {error && <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={placeOrder} disabled={saving} style={{ flex: 1, background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Creating…' : '🛍️ Place Order'}
              </button>
              <button onClick={() => setShowOrder(null)} style={{ padding: '11px 20px', background: '#1A1A24', border: '1px solid #2D2D3D', borderRadius: '8px', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Orders Modal ── */}
      {showOrders && (
        <div style={modalBg} onClick={() => setShowOrders(null)}>
          <div style={{ ...modalBox, maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#E2E8F0', margin: 0 }}>
                  {showOrders.customer.firstName} {showOrders.customer.lastName}
                </h2>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>{showOrders.orders.length} order{showOrders.orders.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => { setShowOrders(null); setShowOrder(showOrders.customer); setError(''); }}
                style={{ background: 'rgba(246,216,96,0.15)', border: 'none', borderRadius: '7px', padding: '7px 14px', color: '#F6D860', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                + New Order
              </button>
            </div>

            {showOrders.orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#2D2D3D', fontSize: '13px' }}>No orders yet for this customer.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {showOrders.orders.map((o: any) => {
                  const cfg = STATUS_CONFIG[o.status] || { label: o.status, color: '#64748B' };
                  return (
                    <div key={o.id} onClick={() => { setShowOrders(null); router.push(`/orders/${o.id}`); }}
                      style={{ background: '#0F0F14', border: `1px solid ${cfg.color}25`, borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0', marginBottom: '3px' }}>{o.poNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {o.orderType} {o.metalType && `· ${o.metalType} ${o.metalColor}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ background: `${cfg.color}20`, color: cfg.color, padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, marginBottom: '3px' }}>{cfg.label}</div>
                        <div style={{ fontSize: '10px', color: '#4B5563' }}>{new Date(o.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
