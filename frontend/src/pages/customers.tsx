import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API, getErrorMessage } from '../utils/apiFetch';
import { Order, STATUS_CONFIG } from '../utils/types';
import { formatName } from '../utils/name';
import { toast } from '../utils/toast';
import { downloadCsv } from '../utils/csvExport';

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
  companyId?: string | null;
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
  { key: 'diamondType', label: 'Diamond Type', type: 'select', options: ['Certified Lab Grown Diamond', 'Non Certified (CVD)', 'Non Certified (HPHT)', 'Natural'] },
  { key: 'diamondQuality', label: 'Diamond Quality', type: 'text', placeholder: 'e.g. F+VS+' },
  { key: 'mountingOption', label: 'Mounting Option', type: 'select', options: ['Mounting Only', 'Semi-Mount'] },
  { key: 'centerStoneShape', label: 'Center Stone Shape', type: 'select', options: ['Round', 'Oval', 'Cushion', 'Emerald', 'Pear', 'Princess', 'Radiant', 'Marquise', 'Asscher', 'Heart', 'Other'] },
  { key: 'approximateCaratWeight', label: 'Approx. Carat Weight', type: 'text', placeholder: 'e.g. 1.5' },
  { key: 'hasGemstone', label: 'Gemstone', type: 'select', options: ['No', 'Yes'] },
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'priority' | 'regular'>('all');
  const [filterSalesRep, setFilterSalesRep] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [showOrder, setShowOrder] = useState<Customer | null>(null);
  const [showOrders, setShowOrders] = useState<{ customer: Customer; orders: Order[] } | null>(null);
  const [showOrdersTop, setShowOrdersTop] = useState(200);
  const [showOrdersH, setShowOrdersH] = useState(400);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [refImage, setRefImage] = useState<File | null>(null);
  const refImageRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showTeam, setShowTeam] = useState<{ customer: Customer; teammates: Customer[] } | null>(null);
  const [showTeamTop, setShowTeamTop] = useState(200);
  const [showTeamH, setShowTeamH] = useState(400);
  const [viewerAccess, setViewerAccess] = useState<boolean | null>(null);
  const [viewerAccessSaving, setViewerAccessSaving] = useState(false);
  const [addingTeammate, setAddingTeammate] = useState(false);
  const [teammateForm, setTeammateForm] = useState({ firstName: '', lastName: '', email: '' });
  const [savingTeammate, setSavingTeammate] = useState(false);
  const [teammateError, setTeammateError] = useState('');
  const [addingExisting, setAddingExisting] = useState(false);
  const [existingSearch, setExistingSearch] = useState('');

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) {
        const parsed = JSON.parse(u);
        setIsAdmin(parsed.role === 'ADMIN');
        setUserRole(parsed.role || '');
        setCurrentUserId(parsed.id || '');
      }
    } catch {}
  }, []);

  const [newOrder, setNewOrder] = useState<Record<string, string>>({
    orderType: '', metalType: '', metalColor: '', size: '', diamondType: '',
    diamondQuality: '', mountingOption: '', centerStoneShape: '', approximateCaratWeight: '', hasGemstone: 'No',
    quotedCost: '', vendorName: '', salesRepEmail: '', customerNotes: '',
  });

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
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
        reps.forEach(r => { map[r.id] = formatName(r.firstName, r.lastName); });
        setSalesRepMap(map);
      }
      if (!uRes.ok || !sRes.ok || !rRes.ok) {
        setLoadError('Some customer data failed to load. Try refreshing.');
      }
    } catch {
      // A rejected fetch (network error, timeout, CORS) rather than just a
      // non-2xx status — without this catch, loading stayed true forever
      // and the page never left "Loading…" (nothing below the try ever ran).
      setLoadError('Cannot connect to the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Deep link from the topbar global search (?q=email-or-name) — prefill once
  // the router's query params are ready.
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.q;
    if (typeof q === 'string' && q) setSearch(q);
  }, [router.isReady, router.query.q]);

  const allFiltered = useMemo(() => {
    const matched = customers.filter(c => {
      // A Sales Rep only manages their own book of customers here — Admin
      // and Authorizer still see everyone. This doesn't affect who they can
      // place an order for; the order form's customer picker is a separate,
      // unfiltered fetch.
      if (userRole === 'SALES_REP' && c.salesRepId !== currentUserId) return false;
      if (search && !`${c.storeName || ''} ${formatName(c.firstName, c.lastName)} ${c.email}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus === 'active' && !c.isActive) return false;
      if (filterStatus === 'inactive' && c.isActive) return false;
      if (filterPriority === 'priority' && !c.isPriority) return false;
      if (filterPriority === 'regular' && c.isPriority) return false;
      if (filterSalesRep && c.salesRepId !== filterSalesRep) return false;
      return true;
    });

    // Teammates share a companyId and are all real, separate logins — the
    // list still shows just one row per company (use "Team" to see/manage
    // the rest) so the same business doesn't appear as duplicate rows.
    // Prefer whichever teammate has a real name over import artifacts
    // like "#N/A", then whoever's been around longest, as the row shown.
    const hasRealName = (c: Customer) => {
      const f = (c.firstName || '').trim();
      return !!f && f !== '#N/A' && f !== '#NAME?';
    };
    const ranked = [...matched].sort((a, b) => {
      const av = hasRealName(a) ? 0 : 1;
      const bv = hasRealName(b) ? 0 : 1;
      if (av !== bv) return av - bv;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const seenCompany = new Set<string>();
    const deduped = ranked.filter(c => {
      if (!c.companyId) return true;
      if (seenCompany.has(c.companyId)) return false;
      seenCompany.add(c.companyId);
      return true;
    });

    return deduped.sort((a, b) => {
      const nameA = (a.storeName || formatName(a.firstName, a.lastName)).toLowerCase();
      const nameB = (b.storeName || formatName(b.firstName, b.lastName)).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [customers, search, filterStatus, filterPriority, filterSalesRep, userRole, currentUserId]);

  // Team size per company, computed from the already-fetched customer list
  // — no extra request needed just to show a "2 people" badge per row.
  const teamSizeByCompany = useMemo(() => {
    const counts: Record<string, number> = {};
    customers.forEach(c => { if (c.companyId) counts[c.companyId] = (counts[c.companyId] || 0) + 1; });
    return counts;
  }, [customers]);

  const totalPages = Math.max(1, Math.ceil(allFiltered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const filtered = allFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetPage = () => setPage(1);

  // Exports whatever the current search/status/priority/rep filters show —
  // with nothing set, that's every customer. One row per store/company
  // (allFiltered is already deduped that way), not one per teammate login.
  const handleExportEmails = () => {
    const rows = allFiltered.map(c => [c.storeName || formatName(c.firstName, c.lastName), c.email]);
    downloadCsv(`Customer_Emails_${new Date().toISOString().slice(0, 10)}.csv`, ['Customer / Store Name', 'Email'], rows);
  };

  const placeOrder = async () => {
    if (!showOrder || !newOrder.orderType || !newOrder.metalType || !newOrder.metalColor || !newOrder.diamondType) {
      setError('Order Type, Metal Type, Metal Color, and Diamond Type are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await apiFetch(`${API}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          ...newOrder,
          customerId: showOrder.id,
          customerEmail: showOrder.email,
          customerFullName: formatName(showOrder.firstName, showOrder.lastName),
          quotedCost: newOrder.quotedCost ? parseFloat(newOrder.quotedCost) : undefined,
          hasGemstone: newOrder.hasGemstone === 'Yes',
          manufacturingPath: 'STANDARD',
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (refImage && created.id) {
          try {
            const fd = new FormData();
            fd.append('file', refImage);
            await fetch(`${API}/cad/reference/${created.id}`, {
              method: 'POST',
              credentials: 'include',
              body: fd,
            });
          } catch {}
        }
        setShowOrder(null);
        setRefImage(null);
        setNewOrder({ orderType: '', metalType: '', metalColor: '', size: '', diamondType: '', diamondQuality: '', mountingOption: '', centerStoneShape: '', approximateCaratWeight: '', quotedCost: '', vendorName: '', salesRepEmail: '', customerNotes: '' });
        router.push(`/orders/${created.id}`);
      } else {
        const d = await res.json().catch(() => null);
        setError(getErrorMessage(d, 'Failed to create order.'));
      }
    } catch {
      setError('Failed to create order — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const viewOrders = async (customer: Customer, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vh = window.innerHeight;
    const mh = Math.min(400, vh - 80);
    const rowY = rect.top;
    const spaceBelow = vh - rowY - 20;
    const rawTop = spaceBelow >= mh ? rowY - 12 : rowY - mh + 30;
    setShowOrdersTop(Math.min(Math.max(rawTop, 12), vh - mh - 12));
    setShowOrdersH(mh);
    const res = await apiFetch(`${API}/users/${customer.id}/orders`);
    if (res.ok) {
      const data = await res.json();
      setShowOrders({ customer, orders: data.orders || [] });
    }
  };

  const viewTeam = async (customer: Customer, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vh = window.innerHeight;
    const mh = Math.min(360, vh - 80);
    const rowY = rect.top;
    const spaceBelow = vh - rowY - 20;
    const rawTop = spaceBelow >= mh ? rowY - 12 : rowY - mh + 30;
    setShowTeamTop(Math.min(Math.max(rawTop, 12), vh - mh - 12));
    setShowTeamH(mh);
    setAddingTeammate(false);
    setAddingExisting(false);
    setExistingSearch('');
    setTeammateError('');
    setTeammateForm({ firstName: '', lastName: '', email: '' });
    setViewerAccess(null);
    const res = await apiFetch(`${API}/users/${customer.id}/teammates`);
    if (res.ok) {
      const teammates = await res.json();
      // The backend backfills a companyId on the fly for legacy accounts that
      // don't have one yet — use the fresh copy, not the one from the list
      // fetched before this call, so "Add a Teammate" has something to attach to.
      const freshCustomer = teammates.find((t: Customer) => t.id === customer.id) || customer;
      setShowTeam({ customer: freshCustomer, teammates });
      if (isAdmin && freshCustomer.companyId) {
        const companyRes = await apiFetch(`${API}/companies/${freshCustomer.companyId}`);
        if (companyRes.ok) setViewerAccess((await companyRes.json()).viewerAccessEnabled);
      }
    }
  };

  const toggleViewerAccess = async () => {
    if (!showTeam?.customer.companyId || viewerAccessSaving) return;
    setViewerAccessSaving(true);
    try {
      const res = await apiFetch(`${API}/companies/${showTeam.customer.companyId}/viewer-access`, { method: 'PATCH' });
      if (res.ok) setViewerAccess((await res.json()).viewerAccessEnabled);
    } finally {
      setViewerAccessSaving(false);
    }
  };

  const addTeammate = async () => {
    if (!showTeam?.customer.companyId) {
      setTeammateError('Could not set up this company — please close and try again.');
      return;
    }
    if (!teammateForm.firstName.trim() || !teammateForm.lastName.trim() || !teammateForm.email.trim()) {
      setTeammateError('First name, last name, and email are all required.');
      return;
    }
    setSavingTeammate(true);
    setTeammateError('');
    try {
      const res = await apiFetch(`${API}/users/invite`, {
        method: 'POST',
        body: JSON.stringify({
          firstName: teammateForm.firstName.trim(),
          lastName: teammateForm.lastName.trim(),
          email: teammateForm.email.trim(),
          role: 'CUSTOMER',
          companyId: showTeam.customer.companyId,
        }),
      });
      if (res.ok) {
        const teamRes = await apiFetch(`${API}/users/${showTeam.customer.id}/teammates`);
        if (teamRes.ok) setShowTeam({ customer: showTeam.customer, teammates: await teamRes.json() });
        setAddingTeammate(false);
        setTeammateForm({ firstName: '', lastName: '', email: '' });
        toast.success('Teammate invited — they\'ll receive their login by email.');
        await load();
      } else {
        const d = await res.json().catch(() => null);
        setTeammateError(getErrorMessage(d, 'Failed to add teammate.'));
      }
    } catch {
      setTeammateError('Failed to add teammate — check your connection and try again.');
    } finally {
      setSavingTeammate(false);
    }
  };

  // Merges an already-existing Customer account into this company — e.g.
  // two separate invites that turned out to be the same business.
  const addExistingTeammate = async (customerId: string) => {
    if (!showTeam?.customer.companyId) {
      setTeammateError('Could not set up this company — please close and try again.');
      return;
    }
    setSavingTeammate(true);
    setTeammateError('');
    try {
      const res = await apiFetch(`${API}/users/${customerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ companyId: showTeam.customer.companyId }),
      });
      if (res.ok) {
        const teamRes = await apiFetch(`${API}/users/${showTeam.customer.id}/teammates`);
        if (teamRes.ok) setShowTeam({ customer: showTeam.customer, teammates: await teamRes.json() });
        setAddingExisting(false);
        setExistingSearch('');
        toast.success('Customer added to this company.');
        await load();
      } else {
        const d = await res.json().catch(() => null);
        setTeammateError(getErrorMessage(d, 'Failed to add this customer to the company.'));
      }
    } catch {
      setTeammateError('Failed to add this customer — check your connection and try again.');
    } finally {
      setSavingTeammate(false);
    }
  };

  // Optimistic local update, same pattern as changeSalesRep below — a single
  // boolean flip shouldn't refetch the entire customer list (+ stats + sales
  // rep list) just to re-render one row. Only reload on actual failure.
  const deactivate = async (id: string) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, isActive: false } : c));
    const res = await apiFetch(`${API}/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
    if (!res.ok) {
      toast.error(getErrorMessage(await res.json().catch(() => null), 'Failed to deactivate customer.'));
      await load();
    }
  };

  const reactivate = async (id: string) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, isActive: true } : c));
    const res = await apiFetch(`${API}/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
    if (!res.ok) {
      toast.error(getErrorMessage(await res.json().catch(() => null), 'Failed to reactivate customer.'));
      await load();
    }
  };

  // Permanent — deleting removes the login/account row itself, not order
  // history (orders keep their own copy of customerEmail/storeName, so past
  // orders still show up). Gated to inactive accounts only, and requires
  // typing the email, so this can't happen from a stray click.
  const confirmDelete = async () => {
    if (!deleteTarget || deleteConfirmInput.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`${API}/users/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Deleted ${deleteTarget.storeName || formatName(deleteTarget.firstName, deleteTarget.lastName)}.`);
        setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id));
        setDeleteTarget(null);
        setDeleteConfirmInput('');
      } else {
        toast.error(getErrorMessage(await res.json().catch(() => null), 'Failed to delete customer.'));
      }
    } finally {
      setDeleting(false);
    }
  };

  const togglePriority = async (id: string) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, isPriority: !c.isPriority } : c));
    const res = await apiFetch(`${API}/users/${id}/priority`, { method: 'PATCH' });
    if (!res.ok) {
      toast.error(getErrorMessage(await res.json().catch(() => null), 'Failed to update priority.'));
      await load();
    }
  };

  const changeSalesRep = async (customerId: string, salesRepId: string) => {
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, salesRepId } : c));
    const res = await apiFetch(`${API}/users/${customerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ salesRepId }),
    });
    if (!res.ok) {
      toast.error(getErrorMessage(await res.json().catch(() => null), 'Failed to update Sales Rep.'));
      await load();
    }
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
      subtitle={stats ? `${stats.totalCustomers} customers · ${stats.activeCustomers} active` : loading ? 'Loading…' : (loadError || '')}
    >
      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); resetPage(); }}
          placeholder="Search by name or email…"
          style={{ ...INPUT, maxWidth: '280px', flex: '1 1 200px' }}
        />
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value as any); resetPage(); }}
          style={{ ...INPUT, width: 'auto', flex: '0 0 auto', cursor: 'pointer' }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={filterPriority}
          onChange={e => { setFilterPriority(e.target.value as any); resetPage(); }}
          style={{ ...INPUT, width: 'auto', flex: '0 0 auto', cursor: 'pointer' }}
        >
          <option value="all">All Priority</option>
          <option value="priority">Priority</option>
          <option value="regular">Regular</option>
        </select>
        {userRole !== 'SALES_REP' && Object.keys(salesRepMap).length > 0 && (
          <select
            value={filterSalesRep}
            onChange={e => { setFilterSalesRep(e.target.value); resetPage(); }}
            style={{ ...INPUT, width: 'auto', flex: '0 0 auto', cursor: 'pointer' }}
          >
            <option value="">All Sales Reps</option>
            {Object.entries(salesRepMap).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
        {(search || filterStatus !== 'all' || filterPriority !== 'all' || filterSalesRep) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('all'); setFilterPriority('all'); setFilterSalesRep(''); resetPage(); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 13px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Clear filters
          </button>
        )}
        <button
          onClick={handleExportEmails}
          disabled={allFiltered.length === 0}
          title="Export the customer/store names and emails currently shown (respects the filters above) as a CSV"
          style={{ marginLeft: 'auto', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12px', fontWeight: 600, cursor: allFiltered.length === 0 ? 'default' : 'pointer', opacity: allFiltered.length === 0 ? 0.6 : 1, whiteSpace: 'nowrap' }}
        >
          ⬇ Export CSV
        </button>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {allFiltered.length} result{allFiltered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="table-scroll" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflowY: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
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
            ) : loadError ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '10px' }}>{loadError}</div>
                  <button
                    onClick={load}
                    style={{ padding: '7px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.3 }}>👥</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No customers yet</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Invite customers via Settings → Invite a New Team Member.</div>
                </td>
              </tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {c.storeName || formatName(c.firstName, c.lastName)}
                    </div>
                    {c.companyId && teamSizeByCompany[c.companyId] > 1 && (
                      <span title="Teammates share access to all of this company's orders" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '99px', padding: '1px 7px', whiteSpace: 'nowrap' }}>
                        👥 {teamSizeByCompany[c.companyId]}
                      </span>
                    )}
                  </div>
                  {c.storeName && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {formatName(c.firstName, c.lastName)}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>{c.email}</td>
                <td style={{ padding: '14px 16px' }}>
                  {isAdmin ? (
                    <select
                      value={c.salesRepId || ''}
                      onChange={e => changeSalesRep(c.id, e.target.value)}
                      style={{
                        fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
                        padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-light)',
                        background: 'var(--bg-input)', cursor: 'pointer', maxWidth: '160px',
                      }}
                    >
                      <option value="">— Unassigned —</option>
                      {Object.entries(salesRepMap).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  ) : c.salesRepId && salesRepMap[c.salesRepId] ? (
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
                    <button onClick={e => viewOrders(c, e)} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>
                      View Orders
                    </button>
                    {isAdmin && (
                      <button onClick={e => viewTeam(c, e)} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>
                        Team
                      </button>
                    )}
                    {isAdmin && c.isActive && (
                      <button onClick={() => deactivate(c.id)} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid rgba(220,38,38,0.3)', background: 'transparent', color: '#DC2626', fontSize: '11px', cursor: 'pointer' }}>
                        Deactivate
                      </button>
                    )}
                    {isAdmin && !c.isActive && (
                      <button onClick={() => reactivate(c.id)} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid rgba(5,150,105,0.3)', background: 'transparent', color: '#059669', fontSize: '11px', cursor: 'pointer' }}>
                        Reactivate
                      </button>
                    )}
                    {isAdmin && !c.isActive && (
                      <button onClick={() => { setDeleteTarget(c); setDeleteConfirmInput(''); }} style={{ padding: '5px 11px', borderRadius: '6px', border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)', color: '#DC2626', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, allFiltered.length)} of {allFiltered.length}
          </span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: safePage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '12px', cursor: safePage === 1 ? 'default' : 'pointer', opacity: safePage === 1 ? 0.5 : 1 }}
            >
              « First
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: safePage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '12px', cursor: safePage === 1 ? 'default' : 'pointer', opacity: safePage === 1 ? 0.5 : 1 }}
            >
              ‹ Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pg: number;
              if (totalPages <= 7) {
                pg = i + 1;
              } else if (safePage <= 4) {
                pg = i + 1;
                if (i === 6) pg = totalPages;
              } else if (safePage >= totalPages - 3) {
                pg = i === 0 ? 1 : totalPages - 6 + i;
              } else {
                const map = [1, 0, safePage - 1, safePage, safePage + 1, 0, totalPages];
                pg = map[i];
              }
              if (pg === 0) return <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '12px' }}>…</span>;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  style={{
                    padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer',
                    background: pg === safePage ? 'var(--navy)' : 'var(--bg-input)',
                    color: pg === safePage ? '#fff' : 'var(--text-primary)',
                    fontWeight: pg === safePage ? 700 : 400,
                  }}
                >
                  {pg}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: safePage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '12px', cursor: safePage === totalPages ? 'default' : 'pointer', opacity: safePage === totalPages ? 0.5 : 1 }}
            >
              Next ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: safePage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '12px', cursor: safePage === totalPages ? 'default' : 'pointer', opacity: safePage === totalPages ? 0.5 : 1 }}
            >
              Last »
            </button>
          </div>
        </div>
      )}

      {/* ── Create Order Modal ── */}
      {showOrder && (
        <div className="modal-bg" style={modalBg} onClick={() => setShowOrder(null)}>
          <div className="modal-box" style={{ ...modalBox, maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: '0 0 4px' }}>New Order</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', margin: '4px 0 20px' }}>
              For <span style={{ color: 'var(--accent-dark)', fontWeight: 600 }}>{formatName(showOrder.firstName, showOrder.lastName)}</span> ({showOrder.email})
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
                <input ref={refImageRef} type="file" style={{ display: 'none' }}
                  onChange={e => setRefImage(e.target.files?.[0] || null)} />
                {refImage
                  ? <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>📎 {refImage.name}</div>
                  : <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🖼 Upload inspiration photo · JPG, PNG, PDF, 3DM, STL</div>
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

      {/* ── Customer Orders Modal (portal: outside scroll container) ── */}
      {showOrders && createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.6)', zIndex: 1000 }}
            onClick={() => setShowOrders(null)}
          />
          {/* Modal card — anchored to clicked row's viewport position */}
          <div
            style={{
              position: 'fixed',
              left: '50%',
              transform: 'translateX(-50%)',
              top: `${showOrdersTop}px`,
              zIndex: 1001,
              width: '560px',
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: `${showOrdersH}px`,
              overflowY: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {showOrders.customer.storeName || formatName(showOrders.customer.firstName, showOrders.customer.lastName)}
                </h2>
                {showOrders.customer.storeName && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>{formatName(showOrders.customer.firstName, showOrders.customer.lastName)}</div>
                )}
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{showOrders.orders.length} order{showOrders.orders.length !== 1 ? 's' : ''}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => { setShowOrders(null); setShowOrder(showOrders.customer); setError(''); }}
                  style={{ background: 'var(--navy)', border: 'none', borderRadius: '7px', padding: '7px 14px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  + New Order
                </button>
                <button onClick={() => setShowOrders(null)}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 10px', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            </div>

            {showOrders.orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>No orders yet for this customer.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {showOrders.orders.map((o: any) => {
                  const cfg = STATUS_CONFIG[o.status] || { label: o.status, color: '#64748B' };
                  return (
                    <div key={o.id} onClick={() => { setShowOrders(null); router.push(`/orders/${o.id}`); }}
                      style={{ background: 'var(--bg-input)', border: `1px solid ${cfg.color}25`, borderRadius: 'var(--radius)', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'box-shadow 0.15s' }}
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
        </>,
        document.body
      )}

      {/* ── Team Modal (portal: outside scroll container) ── */}
      {showTeam && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.6)', zIndex: 1000 }}
            onClick={() => setShowTeam(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              transform: 'translateX(-50%)',
              top: `${showTeamTop}px`,
              zIndex: 1001,
              width: '480px',
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: `${showTeamH}px`,
              overflowY: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {showTeam.customer.storeName || formatName(showTeam.customer.firstName, showTeam.customer.lastName)}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {showTeam.teammates.length} {showTeam.teammates.length === 1 ? 'person' : 'people'} — all can view & manage this company's orders
                </p>
              </div>
              <button onClick={() => setShowTeam(null)}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 10px', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>
                ✕
              </button>
            </div>

            {isAdmin && showTeam.customer.companyId && viewerAccess !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>3D Viewer Access</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Company-wide — shows a 3D preview slot on this company's orders</div>
                </div>
                <button
                  onClick={toggleViewerAccess}
                  disabled={viewerAccessSaving}
                  style={{
                    padding: '5px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 600,
                    border: `1px solid ${viewerAccess ? 'var(--accent)' : 'var(--border)'}`,
                    background: viewerAccess ? 'var(--accent)' : 'var(--bg-card)',
                    color: viewerAccess ? '#fff' : 'var(--text-secondary)',
                    cursor: viewerAccessSaving ? 'default' : 'pointer', opacity: viewerAccessSaving ? 0.6 : 1,
                  }}
                >
                  {viewerAccess ? 'On' : 'Off'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {showTeam.teammates.map(t => (
                <div key={t.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatName(t.firstName, t.lastName)}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{t.email}</div>
                </div>
              ))}
            </div>

            {addingTeammate ? (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>Add a Teammate</div>
                <div className="modal-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <input value={teammateForm.firstName} onChange={e => setTeammateForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" style={INPUT} />
                  <input value={teammateForm.lastName} onChange={e => setTeammateForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" style={INPUT} />
                </div>
                <input value={teammateForm.email} onChange={e => setTeammateForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" type="email" style={{ ...INPUT, marginBottom: '10px' }} />
                {teammateError && <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '10px' }}>{teammateError}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={addTeammate} disabled={savingTeammate} style={{ flex: 1, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: savingTeammate ? 0.7 : 1 }}>
                    {savingTeammate ? 'Inviting…' : 'Send Invite'}
                  </button>
                  <button onClick={() => { setAddingTeammate(false); setTeammateError(''); }} style={{ padding: '9px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : addingExisting ? (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>Add an Existing Customer</div>
                <input
                  value={existingSearch}
                  onChange={e => setExistingSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  autoFocus
                  style={{ ...INPUT, marginBottom: '8px' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto', marginBottom: '10px' }}>
                  {customers
                    .filter(c => c.id !== showTeam.customer.id && !showTeam.teammates.some(t => t.id === c.id))
                    .filter(c => {
                      if (!existingSearch.trim()) return false;
                      const q = existingSearch.toLowerCase();
                      const name = (c.storeName || formatName(c.firstName, c.lastName)).toLowerCase();
                      return name.includes(q) || c.email.toLowerCase().includes(q);
                    })
                    .slice(0, 8)
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => addExistingTeammate(c.id)}
                        disabled={savingTeammate}
                        style={{ textAlign: 'left', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', cursor: savingTeammate ? 'not-allowed' : 'pointer', opacity: savingTeammate ? 0.6 : 1 }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.storeName || formatName(c.firstName, c.lastName)}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{c.email}{c.companyId && c.companyId !== showTeam.customer.companyId ? ' — currently with another company' : ''}</div>
                      </button>
                    ))}
                  {existingSearch.trim() && customers.filter(c => {
                    if (c.id === showTeam.customer.id || showTeam.teammates.some(t => t.id === c.id)) return false;
                    const q = existingSearch.toLowerCase();
                    const name = (c.storeName || formatName(c.firstName, c.lastName)).toLowerCase();
                    return name.includes(q) || c.email.toLowerCase().includes(q);
                  }).length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 2px' }}>No matching customer found.</div>
                  )}
                </div>
                {teammateError && <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '10px' }}>{teammateError}</div>}
                <button onClick={() => { setAddingExisting(false); setExistingSearch(''); setTeammateError(''); }} style={{ width: '100%', padding: '9px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setAddingTeammate(true)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid var(--accent)', borderRadius: '8px', padding: '9px', color: 'var(--accent-dark)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  + Invite New Teammate
                </button>
                <button onClick={() => setAddingExisting(true)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  + Add Existing Customer
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}

      {/* ── Delete Customer Confirmation ── */}
      {deleteTarget && (
        <div className="modal-bg" style={modalBg} onClick={() => { if (!deleting) { setDeleteTarget(null); setDeleteConfirmInput(''); } }}>
          <div className="modal-box" style={{ ...modalBox, maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: '#DC2626', margin: '0 0 8px' }}>Delete customer account?</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
              This permanently removes <strong>{deleteTarget.storeName || formatName(deleteTarget.firstName, deleteTarget.lastName)}</strong>'s login ({deleteTarget.email}). Their past orders keep their own record of the name/email, so order history isn't deleted — but this account can no longer sign in, and this can't be undone.
            </p>
            <label style={LABEL}>Type the email to confirm: {deleteTarget.email}</label>
            <input
              autoFocus
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmDelete(); }}
              placeholder={deleteTarget.email}
              style={{ ...INPUT, marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmInput(''); }}
                disabled={deleting}
                style={{ flex: 1, padding: '9px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', cursor: deleting ? 'default' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || deleteConfirmInput.trim().toLowerCase() !== deleteTarget.email.toLowerCase()}
                style={{
                  flex: 1, padding: '9px 16px', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600,
                  background: '#DC2626',
                  cursor: (deleting || deleteConfirmInput.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) ? 'not-allowed' : 'pointer',
                  opacity: (deleting || deleteConfirmInput.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) ? 0.5 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
