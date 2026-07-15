import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API, getErrorMessage } from '../utils/apiFetch';
import { UserRole, Factory, SupplySource, FACTORY_CONFIG, SUPPLY_SOURCE_CONFIG } from '../utils/types';
import { toast } from '../utils/toast';
import { formatName, getInitials } from '../utils/name';

export async function getServerSideProps() { return { props: {} }; }

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  emailNotificationsEnabled: boolean;
  createdAt: string;
}

const STAFF_ROLES = [
  UserRole.SALES_REP,
  UserRole.AUTHORIZER,
  UserRole.CAD_DESIGNER,
  UserRole.FACTORY_MANAGER,
  UserRole.STONE_MANAGER,
  UserRole.ADMIN,
  UserRole.CUSTOMER,
];

const ROLE_LABELS: Record<string, string> = {
  [UserRole.ADMIN]:           'Admin',
  [UserRole.SALES_REP]:       'Sales Rep',
  [UserRole.AUTHORIZER]:      'Authorizer',
  [UserRole.CAD_DESIGNER]:    'CAD Designer',
  [UserRole.FACTORY_MANAGER]: 'Factory Manager',
  [UserRole.STONE_MANAGER]:   'Stone Manager',
  [UserRole.CUSTOMER]:        'Customer',
};

const ROLE_COLORS: Record<string, string> = {
  [UserRole.ADMIN]:           '#DC2626',
  [UserRole.SALES_REP]:       '#2563EB',
  [UserRole.AUTHORIZER]:      '#7C3AED',
  [UserRole.CAD_DESIGNER]:    '#0891B2',
  [UserRole.FACTORY_MANAGER]: '#D97706',
  [UserRole.STONE_MANAGER]:   '#9333EA',
  [UserRole.CUSTOMER]:        '#BE185D',
};

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
};

const inp: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '7px',
  padding: '8px 10px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const emptyForm = {
  firstName: '', lastName: '', email: '', role: UserRole.SALES_REP, salesRepId: '',
  assignedFactory: '' as Factory | '', assignedSupplySource: '' as SupplySource | '',
};

export default function SettingsPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', role: UserRole.SALES_REP as UserRole, emailNotificationsEnabled: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [salesReps, setSalesReps] = useState<StaffUser[]>([]);
  const [sortKey, setSortKey] = useState<'name' | 'email' | 'role' | 'status' | 'added'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (key: typeof sortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedStaff = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...staff].sort((a, b) => {
      switch (sortKey) {
        case 'email':
          return dir * a.email.localeCompare(b.email);
        case 'role':
          return dir * (ROLE_LABELS[a.role] || a.role).localeCompare(ROLE_LABELS[b.role] || b.role);
        case 'status':
          return dir * (Number(a.isActive) - Number(b.isActive));
        case 'added':
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case 'name':
        default:
          return dir * formatName(a.firstName, a.lastName).localeCompare(formatName(b.firstName, b.lastName));
      }
    });
  }, [staff, sortKey, sortDir]);

  const reload = async () => {
    setLoading(true);
    const res = await apiFetch(`${API}/users`);
    if (res.ok) {
      const all: StaffUser[] = await res.json();
      setStaff(all.filter(u => u.role !== UserRole.CUSTOMER));
      setSalesReps(all.filter(u => u.role === UserRole.SALES_REP));
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
    try {
      const u = localStorage.getItem('jf_user');
      if (u) {
        const parsed = JSON.parse(u);
        setCurrentUserId(parsed.id || null);
        setCurrentUserRole(parsed.role || null);
      }
    } catch {}
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role === UserRole.CUSTOMER && !form.salesRepId) {
      setError('Please select a Sales Rep for this customer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = { ...form };
      if (!payload.assignedFactory) delete payload.assignedFactory;
      if (!payload.assignedSupplySource) delete payload.assignedSupplySource;
      const res = await apiFetch(`${API}/users/invite`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSuccessEmail(form.email);
        setForm(emptyForm);
        setShowForm(false);
        await reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(getErrorMessage(data, 'Failed to send invite. Please try again.'));
      }
    } catch {
      setError('Failed to send invite — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (u: StaffUser) => {
    if (!confirm(`Remove ${formatName(u.firstName, u.lastName)} (${u.email})? This cannot be undone.`)) return;
    setRemovingId(u.id);
    try {
      const res = await apiFetch(`${API}/users/${u.id}`, { method: 'DELETE' });
      if (res.ok) {
        await reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(getErrorMessage(data, 'Failed to remove user.'));
      }
    } catch {
      toast.error('Failed to remove user — check your connection and try again.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleEditClick = (u: StaffUser) => {
    setEditingId(u.id);
    setEditForm({ firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, emailNotificationsEnabled: u.emailNotificationsEnabled });
  };

  const handleCancelEdit = () => setEditingId(null);

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch(`${API}/users/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        await reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(getErrorMessage(data, 'Failed to update user.'));
      }
    } catch {
      toast.error('Failed to update user — check your connection and try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  const activeCount  = staff.filter(u => u.isActive).length;
  const pendingCount = staff.filter(u => !u.isActive).length;

  return (
    <AppLayout title="Settings" subtitle="Team management & system configuration">

      {/* Success banner */}
      {successEmail && (
        <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: '8px', padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: '#065F46', fontWeight: 500 }}>
            ✓ Invite sent to <strong>{successEmail}</strong> — they'll receive their login credentials by email.
          </span>
          <button onClick={() => setSuccessEmail(null)} style={{ background: 'none', border: 'none', color: '#065F46', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* KPIs */}
      <div className="dash-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Staff',   value: staff.length,  color: '#1A2740' },
          { label: 'Active',        value: activeCount,   color: '#059669' },
          { label: 'Inactive',      value: pendingCount,  color: '#9CA3AF' },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '32px', fontWeight: 600, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Team Members */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Team Members</h2>
          <button
            onClick={() => { setShowForm(f => !f); setError(null); setSuccessEmail(null); }}
            style={{ background: 'var(--navy)', border: 'none', borderRadius: '7px', padding: '8px 16px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            {showForm ? 'Cancel' : '+ Invite Member'}
          </button>
        </div>

        {/* Invite form */}
        {showForm && (
          <form onSubmit={handleInvite} style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>Invite a New Team Member</div>
            <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>First Name</label>
                <input
                  required
                  value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane"
                  style={inp}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Last Name</label>
                <input
                  required
                  value={form.lastName}
                  onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  placeholder="Smith"
                  style={inp}
                />
              </div>
            </div>
            <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Email Address</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@kirajewels.one"
                  style={inp}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Role</label>
                <select
                  value={form.role}
                  onChange={e => {
                    const role = e.target.value as UserRole;
                    setForm(f => ({ ...f, role, assignedFactory: '', assignedSupplySource: '' }));
                  }}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  {STAFF_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            {form.role === UserRole.CUSTOMER && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sales Rep (required)</label>
                <select
                  required
                  value={form.salesRepId}
                  onChange={e => setForm(f => ({ ...f, salesRepId: e.target.value }))}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  <option value="">— Select a Sales Rep —</option>
                  {salesReps.map(r => (
                    <option key={r.id} value={r.id}>{formatName(r.firstName, r.lastName)}</option>
                  ))}
                </select>
              </div>
            )}
            {(form.role === UserRole.FACTORY_MANAGER || form.role === UserRole.STONE_MANAGER) && (
              <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Factory{form.role === UserRole.FACTORY_MANAGER ? ' (required)' : ' (optional)'}
                  </label>
                  <select
                    required={form.role === UserRole.FACTORY_MANAGER}
                    value={form.assignedFactory}
                    onChange={e => setForm(f => ({ ...f, assignedFactory: e.target.value as Factory }))}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="">— Select a Factory —</option>
                    {(Object.values(Factory) as Factory[]).map(fac => (
                      <option key={fac} value={fac}>{FACTORY_CONFIG[fac].label}</option>
                    ))}
                  </select>
                </div>
                {form.role === UserRole.STONE_MANAGER && (
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Stone Supplier (required)</label>
                    <select
                      required
                      value={form.assignedSupplySource}
                      onChange={e => setForm(f => ({ ...f, assignedSupplySource: e.target.value as SupplySource }))}
                      style={{ ...inp, cursor: 'pointer' }}
                    >
                      <option value="">— Select a Supplier —</option>
                      {(Object.values(SupplySource) as SupplySource[]).map(s => (
                        <option key={s} value={s}>{SUPPLY_SOURCE_CONFIG[s].label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            {error && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '7px', padding: '10px 14px', fontSize: '12px', color: '#991B1B', marginBottom: '12px' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{ background: 'var(--navy)', border: 'none', borderRadius: '7px', padding: '9px 22px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? 'Sending Invite…' : 'Send Invite'}
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                A temporary password will be auto-generated and emailed to the new member.
              </span>
            </div>
          </form>
        )}

        {/* Staff table */}
        {loading ? (
          <div style={{ padding: '16px 22px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
                <span className="skeleton skeleton-text" style={{ flex: 1 }} />
                <span className="skeleton skeleton-badge" />
              </div>
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>No staff members found.</div>
        ) : (
          <div className="table-scroll">
            <table className="staff-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)' }}>
                  {([
                    { key: 'name', label: 'Name' },
                    { key: 'email', label: 'Email' },
                    { key: 'role', label: 'Role' },
                    { key: 'status', label: 'Status' },
                    { key: 'added', label: 'Added' },
                    { key: null, label: '' },
                  ] as { key: typeof sortKey | null; label: string }[]).map(({ key, label }) => (
                    <th
                      key={label || 'actions'}
                      onClick={() => key && toggleSort(key)}
                      style={{
                        padding: '10px 18px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.7px', borderBottom: '1px solid var(--border)',
                        cursor: key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                      {key && sortKey === key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStaff.map((u, i) => {
                  const isEditing = editingId === u.id;
                  return (
                  <tr key={u.id} style={{ borderBottom: i < sortedStaff.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '12px 18px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            value={editForm.firstName}
                            onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                            placeholder="First name"
                            style={{ ...inp, width: '90px' }}
                          />
                          <input
                            value={editForm.lastName}
                            onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                            placeholder="Last name"
                            style={{ ...inp, width: '90px' }}
                          />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${ROLE_COLORS[u.role] || '#6B7280'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: ROLE_COLORS[u.role] || '#6B7280', flexShrink: 0 }}>
                            {getInitials(u.firstName, u.lastName)}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatName(u.firstName, u.lastName)}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {isEditing ? (
                        <>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            style={{ ...inp, minWidth: '200px' }}
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={editForm.emailNotificationsEnabled}
                              onChange={e => setEditForm(f => ({ ...f, emailNotificationsEnabled: e.target.checked }))}
                            />
                            Send notification emails
                          </label>
                        </>
                      ) : (
                        <>
                          {u.email}
                          {!u.emailNotificationsEnabled && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Email notifications off</div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      {isEditing ? (
                        <select
                          value={editForm.role}
                          onChange={e => setEditForm(f => ({ ...f, role: e.target.value as UserRole }))}
                          style={{ ...inp, cursor: 'pointer', width: 'auto' }}
                        >
                          {STAFF_ROLES.map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ background: `${ROLE_COLORS[u.role] || '#6B7280'}15`, color: ROLE_COLORS[u.role] || '#6B7280', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ background: u.isActive ? '#D1FAE5' : '#F3F4F6', color: u.isActive ? '#065F46' : '#6B7280', padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={handleCancelEdit}
                            disabled={savingEdit}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 12px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, cursor: savingEdit ? 'not-allowed' : 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={savingEdit}
                            style={{ background: 'var(--navy)', border: 'none', borderRadius: '6px', padding: '4px 12px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.6 : 1 }}
                          >
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {currentUserRole === UserRole.ADMIN && (
                            <button
                              onClick={() => handleEditClick(u)}
                              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 12px', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                          )}
                          {u.id !== currentUserId && (
                            <button
                              onClick={() => handleRemove(u)}
                              disabled={removingId === u.id}
                              style={{ background: 'none', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '4px 12px', color: '#DC2626', fontSize: '11px', fontWeight: 600, cursor: removingId === u.id ? 'not-allowed' : 'pointer', opacity: removingId === u.id ? 0.5 : 1 }}
                            >
                              {removingId === u.id ? 'Removing…' : 'Remove'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
