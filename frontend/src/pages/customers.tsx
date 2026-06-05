import React, { useEffect, useRef, useState } from 'react';
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
  isPriority: boolean;
  createdAt: string;
  salesRepId?: string;
  storeName?: string;
}

interface Stats { totalCustomers: number; activeCustomers: number; totalStaff: number }

const INPUT: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px',
  padding: '9px 13px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

const ORDER_FIELDS = [
  { key: 'orderType', label: 'Order Type', type: 'select', options: ['Ring', 'Pendant', 'Earrings', 'Bracelet', 'Necklace', 'Bangle', 'Other'] },
  { key: 'metalType', label: 'Metal Type', type: 'select', options: ['14K', '18K', '10K', 'Platinum', 'Silver'] },
  { key: 'metalColor', label: 'Metal Color', type: 'select', options: ['YG-Yellow', 'WG-White', 'RG-Rose', 'WY-White & Yellow', 'Two-Tone'] },
  { key: 'size', label: 'Size / Ring Size', type: 'text', placeholder: 'e.g. Ring - 6.5' },
  { key: 'diamondType', label: 'Diamond Type', type: 'select', options: ['Certified Lab Grown Diamond', 'Non Certified (CVD)', 'Non Certified (HPHT)'] },
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
  const [salesRepMap, setSalesRepMap] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showOrder, setShowOrder] = useState<Customer | null>(null);
  const [showOrders, setShowOrders] = useState<{ customer: Customer; orders: Order[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [refImage, setRefImage] = useState<File | null>(null);
  const refImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) {
        const parsed = JSON.parse(u);
        setIsAdmin(parsed.role === 'ADMIN');
        setUserRole(parsed.role || '');
      }
    } catch {}
  }, []);

  const [newUser, setNewUser] = useState({ firstName: '', lastName: '', email: '', password: '', storeName: '' });
  const [newOrder, setNewOrder] = useState<Record<string, string>>({
    orderType: '', metalType: '', metalColor: '', size: '', diamondType: '',
    diamondQuality: '', centerStoneShape: '', approximateCaratWeight: '',
    quotedCost: '', vendorName: '', salesRepEmail: '', customerNotes: '',
  });

  const load = async () => {
    const [uRes, sRes, rRes] = await Promise.all([
      apiFetch(`${API}/users?role=CUSTOMER`),
      apiFetch(`${API}/users/stats`),
      apiFetch(`${API}/users?role=SALES_REP`),
    ]);
    if (uRes.ok) setCustomers(await uRes.json());
    if (sRes.ok) setStats(await sRes.json());
    if (rRes.ok) {
      const reps: any[] = await rRes.json();
      const map: Record<string, string> = {};
      reps.forEach(r => { map[r.id] = `${r.firstName} ${r.lastName}`; });
      setSalesRepMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = customers
    .filter(c =>
      `${c.storeName || ''} ${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const nameA = (a.storeName || `${a.firstName} ${a.lastName}`).toLowerCase();
      const nameB = (b.storeName || `${b.firstName} ${b.lastName}`).toLowerCase();
      return nameA.localeCompare(nameB);
    });

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
      if (refImage && created.id) {
        try {
          const token = localStorage.getItem('jf_token');
          const fd = new FormData();
          fd.append('file', refImage);
          await fetch(`${API}/cad/reference/${created.id}`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: fd,
          });
        } catch {}
      }
      setShowOrder(null);
      setRefImage(null);
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

  const togglePriority = async (id: string) => {
    await apiFetch(`${API}/users/${id}/priority`, { method: 'PATCH' });
    await load();
  };

  const modalBg: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.6)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
  };
  const modalBox: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto',
    boxShadow: 'var(--shadow-md)',
  };

  return (
    <AppLayout
      title="Customers"
      subtitle={stats ? `${stats.totalCustomers} customers · ${stats.activeCustomers} active` : 'Loading…'}
      actions={
        <button
          onClick={() => { setShowCreate(true); setError(''); }}
          style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}
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
      <div className="table-scroll" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <table className="customers-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
              {['Customer', 'Email', 'Sales Rep', 'Priority', 'Status', 'Joined', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.3 }}>👥</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No customers yet</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Click "+ Add Customer" to create the first account.</div>
                </td>
              </tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {c.storeName || `${c.firstName} ${c.lastName}`}
                  </div>
                  {c.storeName && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {c.firstName} {c.lastName}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>{c.email}</td>
                <td style={{ padding: '14px 16px' }}>
                  {c.salesRepId && salesRepMap[c.salesRepId] ? (
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {salesRepMap[c.salesRepId]}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                {/* Priority column */}
                <td style={{ padding: '14px 16px' }}>
                  {(isAdmin || userRole === 'AUTHORIZER') ? (
                    <button
                      onClick={() => togglePriority(c.id)}
                      title={c.isPriority ? 'Click to set Regular' : 'Click to set Priority'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px', borderRadius: '99px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                        background: c.isPriority ? 'rgba(192,155,88,0.15)' : 'var(--bg-input)',
                        color: c.isPriority ? 'var(--accent-dark)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {c.isPriority ? '★ Priority' : '☆ Regular'}
                    </button>
                  ) : (
                    <span style={{ fontSize: '11px', color: c.isPriority ? 'var(--accent-dark)' : 'var(--text-muted)', fontWeight: c.isPriority ? 600 : 400 }}>
                      {c.isPriority ? '★ Priority' : 'Regular'}
                    </span>
                  )}
                </td>

                <td style={{ padding: '14px 16px' }}>
                  <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '99px', background: c.isActive ? 'rgba(5,150,105,0.12)' : 'rgba(220,38,38,0.1)', color: c.isActive ? '#059669' : '#DC2626', fontWeight: 600 }}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={() => { setShowOrder(c); setError(''); }} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent-dark)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      + Order
                    </button>
                    <button onClick={() => viewOrders(c)} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>
                      View Orders
                    </button>
                    {isAdmin && c.isActive && (
                      <button onClick={() => deactivate(c.id)} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid rgba(220,38,38,0.3)', background: 'transparent', color: '#DC2626', fontSize: '11px', cursor: 'pointer' }}>
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
        <div className="modal-bg" style={modalBg} onClick={() => setShowCreate(false)}>
          <div className="modal-box" style={modalBox} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '20px', margin: '0 0 20px' }}>Add New Customer</h2>

            <div className="modal-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[['First Name *', 'firstName', 'text'], ['Last Name', 'lastName', 'text']].map(([label, key, type]) => (
                <div key={key}>
                  <label style={LABEL}>{label}</label>
                  <input type={type} value={(newUser as any)[key]} onChange={e => setNewUser(p => ({ ...p, [key]: e.target.value }))} style={INPUT} />
                </div>
              ))}
            </div>

            {[['Email *', 'email', 'email'], ['Password *', 'password', 'password']].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <label style={LABEL}>{label}</label>
                <input type={type} value={(newUser as any)[key]} onChange={e => setNewUser(p => ({ ...p, [key]: e.target.value }))} style={INPUT} placeholder={key === 'password' ? 'Min 6 characters' : ''} />
              </div>
            ))}

            <div style={{ marginBottom: '20px' }}>
              <label style={LABEL}>Store / Business Name</label>
              <input value={newUser.storeName} onChange={e => setNewUser(p => ({ ...p, storeName: e.target.value }))} style={INPUT} placeholder="Optional" />
            </div>

            {error && <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={createCustomer} disabled={saving} style={{ flex: 1, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Creating…' : 'Create Customer'}
              </button>
              <button onClick={() => setShowCreate(false)} style={{ padding: '11px 20px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Order Modal ── */}
      {showOrder && (
        <div className="modal-bg" style={modalBg} onClick={() => setShowOrder(null)}>
          <div className="modal-box" style={{ ...modalBox, maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: '0 0 4px' }}>New Order</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', margin: '4px 0 20px' }}>
              For <span style={{ color: 'var(--accent-dark)', fontWeight: 600 }}>{showOrder.firstName} {showOrder.lastName}</span> ({showOrder.email})
            </p>

            <div className="modal-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {ORDER_FIELDS.filter(f => isAdmin || f.key !== 'quotedCost').map(f => (
                <div key={f.key}>
                  <label style={LABEL}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={newOrder[f.key] || ''} onChange={e => setNewOrder(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ ...INPUT, color: newOrder[f.key] ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      <option value="">Select…</option>
                      {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input value={newOrder[f.key] || ''} onChange={e => setNewOrder(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={INPUT} />
                  )}
                </div>
              ))}
            </div>

            {/* Reference Image */}
            <div style={{ marginBottom: '12px' }}>
              <label style={LABEL}>Reference Image (optional)</label>
              <div
                onClick={() => refImageRef.current?.click()}
                style={{
                  border: `2px dashed ${refImage ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center',
                  cursor: 'pointer', background: refImage ? 'rgba(192,155,88,0.04)' : 'var(--bg-input)',
                  transition: 'all 0.15s',
                }}
              >
                <input ref={refImageRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                  onChange={e => setRefImage(e.target.files?.[0] || null)} />
                {refImage
                  ? <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>📎 {refImage.name}</div>
                  : <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🖼 Upload inspiration photo · JPG, PNG, PDF</div>
                }
              </div>
              {refImage && (
                <button onClick={() => setRefImage(null)}
                  style={{ marginTop: '4px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer' }}>
                  ✕ Remove
                </button>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={LABEL}>Customer Notes</label>
              <textarea value={newOrder.customerNotes} onChange={e => setNewOrder(p => ({ ...p, customerNotes: e.target.value }))}
                placeholder="Special instructions, reference links, etc."
                rows={3}
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {error && <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '12px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={placeOrder} disabled={saving} style={{ flex: 1, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Creating…' : 'Place Order'}
              </button>
              <button onClick={() => { setShowOrder(null); setRefImage(null); }} style={{ padding: '11px 20px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer Orders Modal ── */}
      {showOrders && (
        <div className="modal-bg" style={modalBg} onClick={() => setShowOrders(null)}>
          <div className="modal-box" style={{ ...modalBox, maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {showOrders.customer.firstName} {showOrders.customer.lastName}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{showOrders.orders.length} order{showOrders.orders.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => { setShowOrders(null); setShowOrder(showOrders.customer); setError(''); }}
                style={{ background: 'var(--navy)', border: 'none', borderRadius: '7px', padding: '7px 14px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                + New Order
              </button>
            </div>

            {showOrders.orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>No orders yet for this customer.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {showOrders.orders.map((o: any) => {
                  const cfg = STATUS_CONFIG[o.status] || { label: o.status, color: '#64748B' };
                  return (
                    <div key={o.id} onClick={() => { setShowOrders(null); router.push(`/orders/${o.id}`); }}
                      style={{ background: 'var(--bg-input)', border: `1px solid ${cfg.color}25`, borderRadius: 'var(--radius)', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        transition: 'box-shadow 0.15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>{o.poNumber}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {o.orderType} {o.metalType && `· ${o.metalType} ${o.metalColor}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ background: `${cfg.color}15`, color: cfg.color, padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, marginBottom: '3px' }}>{cfg.label}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(o.createdAt).toLocaleDateString()}</div>
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
