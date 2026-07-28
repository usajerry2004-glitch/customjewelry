import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../../components/layout/AppLayout';
import { OrderCard } from '../../components/orders/OrderCard';
import { SkeletonOrderGrid } from '../../components/SkeletonOrderCard';
import { Order, OrderStatus, StoneStatus, Factory, SupplySource, FACTORY_CONFIG, SUPPLY_SOURCE_CONFIG, Permission } from '../../utils/types';
import { apiFetch, API, getErrorMessage } from '../../utils/apiFetch';
import { toast } from '../../utils/toast';
import { formatName } from '../../utils/name';

// Remembers filters, pagination, and scroll position across a visit to an
// order's detail page, so clicking "Back to Orders" lands where the user
// left off instead of resetting to a blank list.
const ORDERS_RETURN_STATE_KEY = 'jf_orders_list_state';
function readOrdersReturnState(): any {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ORDERS_RETURN_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const ALL_STATUS_FILTERS = [
  { label: 'All',             value: '' },
  { label: 'New',             value: OrderStatus.NEW },
  { label: 'CAD In Progress', value: OrderStatus.CAD_IN_PROGRESS },
  { label: 'VPO Issued',      value: OrderStatus.VPO_ISSUED },
  { label: 'Manufactured',    value: OrderStatus.MANUFACTURED },
  { label: 'Repair',          value: OrderStatus.REPAIR },
  { label: 'Completed',       value: OrderStatus.COMPLETED },
  { label: 'Cancelled',       value: OrderStatus.CANCELLED },
];

const ROLE_STATUS_FILTERS: Record<string, typeof ALL_STATUS_FILTERS> = {
  CAD_DESIGNER: [
    { label: 'All',      value: '' },
    { label: 'Pending',  value: 'cad_pending' },
    { label: 'Revision', value: 'cad_revision' },
  ],
  STONE_MANAGER: [
    { label: 'All',        value: '' },
    { label: 'VPO Issued', value: OrderStatus.VPO_ISSUED },
  ],
  FACTORY_MANAGER: [
    { label: 'All',          value: '' },
    { label: 'VPO Issued',   value: OrderStatus.VPO_ISSUED },
    { label: 'Manufactured', value: OrderStatus.MANUFACTURED },
  ],
  CUSTOMER: [
    { label: 'All',             value: '' },
    { label: 'CAD In Progress', value: OrderStatus.CAD_IN_PROGRESS },
    { label: 'Completed',       value: OrderStatus.COMPLETED },
  ],
  SALES_REP: [
    { label: 'All',             value: '' },
    { label: 'New',             value: OrderStatus.NEW },
    { label: 'CAD In Progress', value: OrderStatus.CAD_IN_PROGRESS },
    { label: 'VPO Issued',      value: OrderStatus.VPO_ISSUED },
    { label: 'Manufactured',    value: OrderStatus.MANUFACTURED },
    { label: 'Completed',       value: OrderStatus.COMPLETED },
    { label: 'Cancelled',       value: OrderStatus.CANCELLED },
  ],
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '9px 14px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none',
};

const fieldStyle: React.CSSProperties = { marginBottom: '14px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.8px', textTransform: 'uppercase' };
const modalSectionTitle: React.CSSProperties = {
  fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '15px', fontWeight: 600,
  color: 'var(--text-primary)', marginBottom: '14px', marginTop: '6px',
  paddingBottom: '8px', borderBottom: '1px solid var(--border)',
  letterSpacing: '1px', textTransform: 'uppercase' as const,
};

interface Customer { id: string; firstName: string; lastName: string; email: string; storeName?: string; phoneNumber?: string; }

interface SavedFilterPreset {
  id: string;
  name: string;
  search: string;
  statusFilter: string;
  cadSubFilter: string;
  stoneSubFilter: string;
  factoryFilter: string;
  supplySourceFilter: string;
  dateFrom: string;
  dateTo: string;
  activeMonth: string;
  customerFilterInput: string;
  customerTextedFilter?: boolean;
}

// Namespaced per user so one person's saved views don't show up for the next
// person who logs into the same browser/machine.
const presetsStorageKey = (userId: string) => `jf_order_filter_presets_${userId}`;

function loadPresets(userId: string): SavedFilterPreset[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(presetsStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresets(userId: string, presets: SavedFilterPreset[]) {
  if (!userId || typeof window === 'undefined') return;
  localStorage.setItem(presetsStorageKey(userId), JSON.stringify(presets));
}

const ROLES_NEED_CUSTOMER = ['SALES_REP', 'AUTHORIZER', 'ADMIN'];

const ORDER_TYPES_MODAL = ['Earring', 'Ring', 'Pendant', 'Necklace', 'Bracelet', 'Other'];
const RING_SIZES_MODAL = [
  '4', '4.25', '4.5', '4.75', '5', '5.25', '5.5', '5.75', '6', '6.25', '6.5', '6.75',
  '7', '7.25', '7.5', '7.75', '8', '8.25', '8.5', '8.75', '9', '9.25', '9.5', '9.75',
  '10', '10.25', '10.5', '10.75', '11', '11.25', '11.5', '11.75', '12',
];
const PENDANT_SIZES_MODAL = ['16 inches', '16 +1 extender', '16 +2 extender', '18 inches'];
const BRACELET_SIZES_MODAL = ['5 inches', '5.5 inches', '6 inches', '6.5 inches', '7 inches', '7.5 inches', '8 inches', '8.5 inches'];
const METAL_TYPES_MODAL   = ['10K', '14K', '18K', 'Platinum'];
const DIAMOND_TYPES_MODAL = ['Lab grown', 'Gemstone lab grown'];
const DIAMOND_QUALITY_MODAL = ['F+VS+', 'F+VVS+'];

function getModalAutoSize(orderType: string): string {
  if (orderType === 'Earring') return 'Earring';
  if (orderType === 'Other') return 'See in comment';
  return '';
}
function getModalSizeOptions(orderType: string): string[] | null {
  if (orderType === 'Ring') return RING_SIZES_MODAL;
  if (orderType === 'Pendant' || orderType === 'Necklace') return PENDANT_SIZES_MODAL;
  if (orderType === 'Bracelet') return BRACELET_SIZES_MODAL;
  return null;
}

export default function OrdersPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<Partial<Order>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState(() => readOrdersReturnState()?.search ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => readOrdersReturnState()?.search ?? '');
  // Pre-fill statusFilter from URL query param (e.g. /orders?status=CAD_IN_PROGRESS)
  // if present — an explicit link always wins over a remembered filter —
  // otherwise fall back to whatever was showing before the user left.
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('status');
      if (fromUrl !== null) return fromUrl;
    }
    return readOrdersReturnState()?.statusFilter ?? '';
  });
  const [dateFrom, setDateFrom] = useState(() => readOrdersReturnState()?.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(() => readOrdersReturnState()?.dateTo ?? '');
  const [activeMonth, setActiveMonth] = useState(() => readOrdersReturnState()?.activeMonth ?? '');
  const [showNew, setShowNew] = useState(false);
  const [newOrder, setNewOrder] = useState({
    orderType: '', size: '', metalType: '', metalColor: '',
    quantity: '1', stamping: '',
    diamondType: '', diamondQuality: '', customerNotes: '', refCustomerPo: '',
  });
  // Contact info for admin/sales rep placing order
  const [contact, setContact] = useState({ firstName: '', lastName: '', companyName: '', companyNameOther: '', email: '', phone: '' });
  const [companyDropOpen, setCompanyDropOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refLink, setRefLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');
  const [extraPermissions, setExtraPermissions] = useState<Permission[]>([]);
  const [filterPresets, setFilterPresets] = useState<SavedFilterPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState('');
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [cadSubFilter, setCadSubFilter] = useState(() => readOrdersReturnState()?.cadSubFilter ?? '');
  const [stoneSubFilter, setStoneSubFilter] = useState(() => readOrdersReturnState()?.stoneSubFilter ?? '');
  const [factoryFilter, setFactoryFilter] = useState(() => readOrdersReturnState()?.factoryFilter ?? '');
  const [supplySourceFilter, setSupplySourceFilter] = useState(() => readOrdersReturnState()?.supplySourceFilter ?? '');
  const [customerFilter, setCustomerFilter] = useState(() => readOrdersReturnState()?.customerFilter ?? '');
  const [customerFilterInput, setCustomerFilterInput] = useState(() => readOrdersReturnState()?.customerFilterInput ?? '');
  const [customerTextedFilter, setCustomerTextedFilter] = useState(() => readOrdersReturnState()?.customerTextedFilter ?? false);
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [page, setPage] = useState(() => readOrdersReturnState()?.page ?? 0);
  const PAGE_SIZE = 50;
  const skipInitialFilterReset = useRef(true);
  const scrollRestored = useRef(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignFactory, setReassignFactory] = useState<Factory | ''>('');
  const [reassignSupplySource, setReassignSupplySource] = useState<SupplySource | ''>('');
  const [nudgeStatus, setNudgeStatus] = useState<OrderStatus | ''>('');

  // Sync statusFilter when URL query changes without a remount (e.g.
  // clicking between two ?status= links while staying on this page).
  // Skip the very first run — on mount, the lazy useState initializers
  // above already picked the right value (URL query, else a restored
  // snapshot), and re-deriving from router.query here would clobber a
  // restored filter back to '' whenever the URL has no ?status= param.
  const skipInitialStatusSync = useRef(true);
  useEffect(() => {
    if (skipInitialStatusSync.current) {
      skipInitialStatusSync.current = false;
      return;
    }
    const s = (router.query.status as string) || '';
    setStatusFilter(s);
    setCadSubFilter('');
    setStoneSubFilter('');
  }, [router.query.status]);

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) {
        const parsed = JSON.parse(u);
        setIsAdmin(parsed.role === 'ADMIN');
        setUserRole(parsed.role || '');
        setExtraPermissions(parsed.extraPermissions || []);
        if (parsed.id) {
          setUserId(parsed.id);
          setFilterPresets(loadPresets(parsed.id));
        }
      }
    } catch {}
  }, []);

  const isCadSubFilter = ['cad_pending', 'cad_awaiting_quote', 'cad_awaiting_approval', 'cad_revision', 'cad_approved'].includes(statusFilter);
  const showCadSubRow = (statusFilter === OrderStatus.CAD_IN_PROGRESS || isCadSubFilter) &&
    ['ADMIN', 'AUTHORIZER'].includes(userRole);
  const showStoneSubRow = statusFilter === OrderStatus.VPO_ISSUED &&
    ['ADMIN', 'FACTORY_MANAGER', 'AUTHORIZER'].includes(userRole);

  const load = async (pageNum = 0) => {
    setLoading(true);
    setLoadError('');
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageNum * PAGE_SIZE) });
      if (search) params.set('search', search);
      if (statusFilter && !isCadSubFilter) params.set('status', statusFilter);
      if (isCadSubFilter) {
        params.set('status', 'CAD_IN_PROGRESS');
        params.set('cadSubFilter', statusFilter);
      }
      if (statusFilter === OrderStatus.CAD_IN_PROGRESS && cadSubFilter) params.set('cadSubFilter', cadSubFilter);
      if (stoneSubFilter) params.set('stoneSubFilter', stoneSubFilter);
      if (factoryFilter) params.set('assignedFactory', factoryFilter);
      if (supplySourceFilter) params.set('supplySource', supplySourceFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (customerTextedFilter) params.set('hasCustomerMessage', 'true');
      const res = await apiFetch(`${API}/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        const list: any[] = data.orders || [];
        setOrders(list);
        setTotal(data.total ?? list.length);

        const ids = list.map((o: any) => o.id).filter(Boolean);
        if (ids.length) {
          apiFetch(`${API}/cad/thumbnails?orderIds=${ids.join(',')}`)
            .then(r => r.ok ? r.json() : {})
            .then(map => setThumbnails(map))
            .catch(() => {});
        }
      } else {
        // Leaving the previous (now stale/mismatched) list on screen with no
        // indication anything failed is exactly how a broken filter query
        // used to look identical to "no results" or "unfiltered" — clear it
        // and say so instead.
        setOrders([]);
        setTotal(0);
        setLoadError('Failed to load orders. Try adjusting your filters or reloading.');
      }
    } catch {
      setOrders([]);
      setTotal(0);
      setLoadError('Cannot connect to the server. Check your connection and try again.');
    } finally { setLoading(false); }
  };

  const isFactoryManager = userRole === 'FACTORY_MANAGER';
  const canBulkCancel = ['ADMIN', 'AUTHORIZER', 'SALES_REP'].includes(userRole);
  const canBulkDelete = ['ADMIN', 'AUTHORIZER'].includes(userRole) || extraPermissions.includes(Permission.BULK_DELETE_ORDERS);
  const canBulkReassignFactory = ['ADMIN', 'AUTHORIZER'].includes(userRole) || extraPermissions.includes(Permission.ASSIGN_SUPPLIER);
  const canBulkStatusNudge = ['ADMIN', 'AUTHORIZER'].includes(userRole) || extraPermissions.includes(Permission.BULK_STATUS_NUDGE);

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setStoneSubFilter(''); };

  const handleBulkCancel = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Cancel ${selectedIds.size} order${selectedIds.size > 1 ? 's' : ''}? This cannot be undone from here.`)) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch(`${API}/orders/bulk/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ orderIds: Array.from(selectedIds) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(getErrorMessage(data, `Request failed (${res.status}). Please try again.`));
        return;
      }
      if (data.succeeded === 0) {
        toast.error(`${data.failed} order(s) could not be cancelled.`, 'Could not cancel orders');
        return;
      }
      exitSelectMode();
      load(page);
      if (data.failed > 0) {
        toast.warning(`${data.succeeded} order(s) cancelled. ${data.failed} failed.`);
      } else {
        toast.success(`${data.succeeded} order${data.succeeded > 1 ? 's' : ''} cancelled.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setBulkLoading(false); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Permanently delete ${selectedIds.size} order${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch(`${API}/orders/bulk`, {
        method: 'DELETE',
        body: JSON.stringify({ orderIds: Array.from(selectedIds) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(getErrorMessage(data, `Request failed (${res.status}). Please try again.`));
        return;
      }
      if (data.succeeded === 0) {
        toast.error(`${data.failed} order(s) could not be deleted.`, 'Could not delete orders');
        return;
      }
      exitSelectMode();
      load(page);
      if (data.failed > 0) {
        toast.warning(`${data.succeeded} order(s) deleted. ${data.failed} failed.`);
      } else {
        toast.success(`${data.succeeded} order${data.succeeded > 1 ? 's' : ''} deleted.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setBulkLoading(false); }
  };

  const handleBulkManufactured = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch(`${API}/orders/bulk/status`, {
        method: 'PATCH',
        body: JSON.stringify({ orderIds: Array.from(selectedIds), status: OrderStatus.MANUFACTURED }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(getErrorMessage(data, `Request failed (${res.status}). Please try again.`));
        return;
      }
      if (data.succeeded === 0) {
        toast.error(`${data.failed} order(s) could not be updated. Make sure all selected orders have Stone Received status.`, 'Could not mark as Manufactured');
        return;
      }
      exitSelectMode();
      load(page);
      if (data.failed > 0) {
        toast.warning(`${data.succeeded} marked as Manufactured. ${data.failed} skipped (stone not received).`);
      } else {
        toast.success(`${data.succeeded} order${data.succeeded > 1 ? 's' : ''} marked as Manufactured.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setBulkLoading(false); }
  };

  const handleBulkReassignFactory = async () => {
    if (selectedIds.size === 0 || !reassignFactory || !reassignSupplySource) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch(`${API}/orders/bulk/assign-supplier`, {
        method: 'PATCH',
        body: JSON.stringify({ orderIds: Array.from(selectedIds), factory: reassignFactory, supplySource: reassignSupplySource }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(getErrorMessage(data, `Request failed (${res.status}). Please try again.`));
        return;
      }
      if (data.succeeded === 0) {
        toast.error(`${data.failed} order(s) could not be reassigned. Make sure they all have VPO Issued status.`, 'Could not reassign factory');
        return;
      }
      setShowReassignModal(false);
      setReassignFactory('');
      setReassignSupplySource('');
      exitSelectMode();
      load(page);
      if (data.failed > 0) {
        toast.warning(`${data.succeeded} order(s) reassigned. ${data.failed} failed.`);
      } else {
        toast.success(`${data.succeeded} order${data.succeeded > 1 ? 's' : ''} reassigned.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setBulkLoading(false); }
  };

  const handleBulkStatusNudge = async () => {
    if (selectedIds.size === 0 || !nudgeStatus) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch(`${API}/orders/bulk/status`, {
        method: 'PATCH',
        body: JSON.stringify({ orderIds: Array.from(selectedIds), status: nudgeStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(getErrorMessage(data, `Request failed (${res.status}). Please try again.`));
        return;
      }
      if (data.succeeded === 0) {
        toast.error(`${data.failed} order(s) could not be moved. That status change may not be valid from their current stage.`, 'Could not move orders');
        return;
      }
      setNudgeStatus('');
      exitSelectMode();
      load(page);
      if (data.failed > 0) {
        toast.warning(`${data.succeeded} order(s) moved. ${data.failed} skipped (invalid from current stage).`);
      } else {
        toast.success(`${data.succeeded} order${data.succeeded > 1 ? 's' : ''} moved.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setBulkLoading(false); }
  };

  const applyMonth = (year: number, month: number) => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    setActiveMonth(key);
    setDateFrom(from);
    setDateTo(to);
  };

  const clearDates = () => { setDateFrom(''); setDateTo(''); setActiveMonth(''); };

  // Exports the current VPO Issued list — the date range (if set) filters
  // by vpoIssuedAt on the backend, not createdAt, so it matches "orders
  // approved in this window" rather than "orders placed in this window".
  const [exportingCsv, setExportingCsv] = useState(false);
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch(`${API}/orders/export/csv?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(getErrorMessage(err, 'Failed to export CSV'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = (dateFrom || dateTo)
        ? `vpo-issued-orders-${dateFrom || today}-${dateTo || today}.csv`
        : `vpo-issued-orders-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed — check your connection and try again.');
    } finally {
      setExportingCsv(false);
    }
  };

  const applyFilterPreset = (p: SavedFilterPreset) => {
    setSearch(p.search);
    setStatusFilter(p.statusFilter);
    setCadSubFilter(p.cadSubFilter);
    setStoneSubFilter(p.stoneSubFilter);
    setFactoryFilter(p.factoryFilter);
    setSupplySourceFilter(p.supplySourceFilter);
    setDateFrom(p.dateFrom);
    setDateTo(p.dateTo);
    setActiveMonth(p.activeMonth);
    setCustomerFilterInput(p.customerFilterInput);
    setCustomerFilter(p.customerFilterInput);
    setCustomerTextedFilter(p.customerTextedFilter ?? false);
    setActivePresetId(p.id);
  };

  const saveCurrentFiltersAsPreset = () => {
    const name = presetNameInput.trim();
    if (!name || !userId) return;
    const preset: SavedFilterPreset = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name,
      search, statusFilter, cadSubFilter, stoneSubFilter, factoryFilter, supplySourceFilter,
      dateFrom, dateTo, activeMonth, customerFilterInput, customerTextedFilter,
    };
    const next = [...filterPresets, preset];
    setFilterPresets(next);
    savePresets(userId, next);
    setActivePresetId(preset.id);
    setPresetNameInput('');
    setShowSavePresetInput(false);
  };

  const deleteFilterPreset = (id: string) => {
    const next = filterPresets.filter(p => p.id !== id);
    setFilterPresets(next);
    savePresets(userId, next);
    if (activePresetId === id) setActivePresetId('');
  };

  // Debounce the search box so typing doesn't fire a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    // On mount, filters may already be non-default (restored from a saved
    // visit or a ?status= link) — that's not a user-driven filter change,
    // so don't reset back to page 0. The [page] effect below handles the
    // actual initial load, using whatever page was restored.
    if (skipInitialFilterReset.current) {
      skipInitialFilterReset.current = false;
      return;
    }
    setPage(0);
    load(0);
  }, [debouncedSearch, statusFilter, cadSubFilter, stoneSubFilter, factoryFilter, supplySourceFilter, dateFrom, dateTo, customerTextedFilter]);
  useEffect(() => { load(page); }, [page]);

  // Remember filters/pagination on every change, so returning here (e.g.
  // via "Back to Orders") restores the same view instead of resetting it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(ORDERS_RETURN_STATE_KEY, JSON.stringify({
        search, statusFilter, cadSubFilter, stoneSubFilter, factoryFilter, supplySourceFilter,
        customerFilter, customerFilterInput, customerTextedFilter, dateFrom, dateTo, activeMonth, page,
      }));
    } catch {}
  }, [search, statusFilter, cadSubFilter, stoneSubFilter, factoryFilter, supplySourceFilter, customerFilter, customerFilterInput, customerTextedFilter, dateFrom, dateTo, activeMonth, page]);

  // Capture scroll position when leaving the page (merged into whatever
  // filter snapshot was last written above) and restore it once, after the
  // first restored load finishes rendering.
  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      try {
        const snap = readOrdersReturnState() || {};
        sessionStorage.setItem(ORDERS_RETURN_STATE_KEY, JSON.stringify({ ...snap, scrollY: window.scrollY }));
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (loading || scrollRestored.current) return;
    scrollRestored.current = true;
    const savedScrollY = readOrdersReturnState()?.scrollY;
    if (savedScrollY) requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
  }, [loading]);

  const openNewOrderModal = async () => {
    setShowNew(true);
    try {
      const res = await apiFetch(`${API}/users?role=CUSTOMER`);
      if (res.ok) setCustomers(await res.json());
    } catch {}
  };

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.storeName || formatName(c.firstName, c.lastName));
    setShowCustomerDrop(false);
    // Auto-fill contact info from selected customer
    setContact(p => ({
      ...p,
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      companyName: c.storeName ? c.storeName : 'Other',
      companyNameOther: c.storeName ? '' : formatName(c.firstName, c.lastName),
      email: c.email || '',
    }));
  };

  const createOrder = async () => {
    const resolvedCompany = contact.companyName === 'Other' ? contact.companyNameOther : contact.companyName;
    if (ROLES_NEED_CUSTOMER.includes(userRole) && !contact.firstName && !selectedCustomer) return;
    setSaving(true);
    try {
      const customerFields = selectedCustomer ? {
        customerId: selectedCustomer.id,
        customerEmail: contact.email || selectedCustomer.email,
        customerFullName: (contact.firstName || contact.lastName)
          ? formatName(contact.firstName, contact.lastName)
          : formatName(selectedCustomer.firstName, selectedCustomer.lastName),
      } : {
        customerFullName: formatName(contact.firstName, contact.lastName) || undefined,
        customerEmail: contact.email || undefined,
      };
      const res = await apiFetch(`${API}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          ...newOrder,
          ...customerFields,
          quantity: Math.max(1, parseInt(newOrder.quantity, 10) || 1),
          storeName: resolvedCompany || undefined,
          phoneNumber: contact.phone || undefined,
          manufacturingPath: 'STANDARD',
          referenceWeblink: refLink || undefined,
        }),
      });
      if (res.ok) {
        const order = await res.json();

        // Upload all reference files
        if (refFiles.length > 0 && order.id) {
          let uploadFailed = false;
          for (const file of refFiles) {
            try {
              const fd = new FormData();
              fd.append('file', file);
              const r = await fetch(`${API}/cad/reference/${order.id}`, {
                method: 'POST',
                credentials: 'include',
                body: fd,
              });
              if (!r.ok) uploadFailed = true;
            } catch { uploadFailed = true; }
          }
          if (uploadFailed) toast.warning('Order created but one or more reference files failed to upload. You can add them from the order detail page.', 'Upload incomplete');
        }

        setShowNew(false);
        setNewOrder({ orderType: '', size: '', metalType: '', metalColor: '', quantity: '1', stamping: '', diamondType: '', diamondQuality: '', customerNotes: '', refCustomerPo: '' });
        setContact({ firstName: '', lastName: '', companyName: '', companyNameOther: '', email: '', phone: '' });
        setSelectedCustomer(null);
        setCustomerSearch('');
        setRefFiles([]);
        setRefLink('');
        load();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(getErrorMessage(data, `Request failed (${res.status}). Please try again.`));
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setSaving(false); }
  };

  const closeModal = () => {
    setShowNew(false); setRefFiles([]); setRefLink('');
    setSelectedCustomer(null); setCustomerSearch('');
    setContact({ firstName: '', lastName: '', companyName: '', companyNameOther: '', email: '', phone: '' });
    setNewOrder({ orderType: '', size: '', metalType: '', metalColor: '', quantity: '1', stamping: '', diamondType: '', diamondQuality: '', customerNotes: '', refCustomerPo: '' });
  };

  return (
    <AppLayout
      title="Orders"
      subtitle={`${total} total orders`}
      actions={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {(isFactoryManager || canBulkCancel || canBulkDelete || canBulkReassignFactory || canBulkStatusNudge) && (
            <button
              onClick={() => {
                if (selectMode) {
                  exitSelectMode();
                } else {
                  setSelectMode(true);
                  setSelectedIds(new Set());
                  if (isFactoryManager) {
                    setStatusFilter(OrderStatus.VPO_ISSUED);
                    setStoneSubFilter('stone_received');
                    setCadSubFilter('');
                  }
                }
              }}
              style={{
                background: selectMode ? 'var(--accent)' : 'var(--bg-input)',
                color: selectMode ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${selectMode ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {selectMode ? '✕ Exit Select' : '☑ Select'}
            </button>
          )}
          <button
            onClick={openNewOrderModal}
            style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}
          >
            + New Order
          </button>
        </div>
      }
    >
      {/* New Order Modal */}
      {showNew && (() => {
        const setC = (k: string, v: string) => setContact(p => ({ ...p, [k]: v }));
        const setO = (k: string, v: string) => setNewOrder(p => ({ ...p, [k]: v }));
        const handleOrderType = (val: string) => {
          const auto = getModalAutoSize(val);
          setNewOrder(p => ({ ...p, orderType: val, size: auto }));
        };
        const sizeOpts = getModalSizeOptions(newOrder.orderType);
        const isAutoSize = newOrder.orderType === 'Earring' || newOrder.orderType === 'Other';
        const resolvedCompany = contact.companyName === 'Other' ? contact.companyNameOther : contact.companyName;
        const canSubmit = !saving && newOrder.orderType && newOrder.metalType && newOrder.size &&
          contact.firstName && contact.lastName && (resolvedCompany) && contact.email;

        // All unique store names from the loaded customers list
        const storeNames = Array.from(new Set(customers.map(c => c.storeName).filter(Boolean))) as string[];

        return (
        <div className="modal-bg" style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="modal-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px', width: '540px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>
                New Order
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
            </div>

            {/* PO Number — auto-generated */}
            <div style={{ ...fieldStyle, background: 'var(--bg-input)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🔖</span>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>PO Number</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Auto-generated on save — format: <strong>CO#####</strong></div>
              </div>
            </div>

            {/* ── CONTACT INFORMATION ── */}
            <div style={modalSectionTitle}>Contact Information</div>

            {/* First Name + Last Name */}
            <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>First Name *</label>
                <input value={contact.firstName} onChange={e => setC('firstName', e.target.value)}
                  placeholder="Jane" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Last Name *</label>
                <input value={contact.lastName} onChange={e => setC('lastName', e.target.value)}
                  placeholder="Smith" style={{ ...inputStyle, width: '100%' }} />
              </div>
            </div>

            {/* Company Name — dropdown + Other */}
            <div style={{ ...fieldStyle, position: 'relative' }}>
              <label style={labelStyle}>Company Name *</label>
              <select
                value={contact.companyName}
                onChange={e => {
                  const val = e.target.value;
                  setC('companyName', val);
                  if (val !== 'Other') setC('companyNameOther', '');
                  // Picking a known company here looks like it links the order, but on
                  // its own it only sets a text field — the backend still requires an
                  // actual customerId for Sales Rep/Authorizer orders. Auto-link to a
                  // matching account so this control alone is enough; the contact name/
                  // email already typed above stay untouched. The search box below
                  // still exists to link a specific teammate by email if needed.
                  if (val && val !== 'Other') {
                    const match = customers.find(c => c.storeName === val);
                    if (match) {
                      setSelectedCustomer(match);
                      setCustomerSearch(match.storeName || formatName(match.firstName, match.lastName));
                    }
                  } else {
                    setSelectedCustomer(null);
                    setCustomerSearch('');
                  }
                }}
                style={{ ...inputStyle, width: '100%' }}
              >
                <option value="">Select company…</option>
                {storeNames.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="Other">Other (enter below)</option>
              </select>
              {contact.companyName === 'Other' && (
                <input
                  value={contact.companyNameOther}
                  onChange={e => setC('companyNameOther', e.target.value)}
                  placeholder="Enter customer or company name"
                  style={{ ...inputStyle, width: '100%', marginTop: '8px' }}
                />
              )}
              {/* Quick-link: also allow searching existing customer accounts */}
              {ROLES_NEED_CUSTOMER.includes(userRole) && (
                <div style={{ marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Or link to a customer account: </span>
                  <div style={{ position: 'relative', display: 'inline-block', width: '100%', marginTop: '6px' }}>
                    <input
                      value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDrop(true); setSelectedCustomer(null); }}
                      onFocus={() => setShowCustomerDrop(true)}
                      onBlur={() => setShowCustomerDrop(false)}
                      onKeyDown={e => { if (e.key === 'Escape') { setShowCustomerDrop(false); e.currentTarget.blur(); } }}
                      placeholder="Search customer by name or email…"
                      style={{ ...inputStyle, width: '100%', fontSize: '12px', borderColor: selectedCustomer ? 'var(--accent)' : undefined }}
                      autoComplete="off"
                    />
                    {showCustomerDrop && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 100, maxHeight: '180px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', marginTop: '4px' }}>
                        {customers
                          .filter(c => {
                            const q = customerSearch.toLowerCase();
                            const name = (c.storeName || `${c.firstName} ${c.lastName}`).toLowerCase();
                            return !q || name.includes(q) || c.email.toLowerCase().includes(q);
                          })
                          .map(c => (
                            <div key={c.id}
                              onMouseDown={() => selectCustomer(c)}
                              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '12px' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.storeName || `${c.firstName} ${c.lastName}`}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.email}</div>
                            </div>
                          ))}
                        {customers.filter(c => {
                          const q = customerSearch.toLowerCase();
                          const name = (c.storeName || `${c.firstName} ${c.lastName}`).toLowerCase();
                          return !q || name.includes(q) || c.email.toLowerCase().includes(q);
                        }).length === 0 && (
                          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                            No customer found.
                          </div>
                        )}
                      </div>
                    )}
                    {selectedCustomer && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#10B981', fontWeight: 600 }}>
                        ✓ Linked: {selectedCustomer.storeName || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Email + Phone */}
            <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Email *</label>
                <input value={contact.email} onChange={e => setC('email', e.target.value)}
                  placeholder="you@example.com" type="email" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Phone Number</label>
                <input value={contact.phone} onChange={e => setC('phone', e.target.value)}
                  placeholder="+1 (555) 000-0000" type="tel" style={{ ...inputStyle, width: '100%' }} />
              </div>
            </div>

            {/* ── JEWELRY DETAILS ── */}
            <div style={modalSectionTitle}>Jewelry Details</div>

            {/* Order Type */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Order Type *</label>
              <select value={newOrder.orderType} onChange={e => handleOrderType(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Select type…</option>
                {ORDER_TYPES_MODAL.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            {/* Size — dynamic based on order type */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Size *</label>
              {!newOrder.orderType ? (
                <input value="" disabled placeholder="Select an order type first" style={{ ...inputStyle, width: '100%', opacity: 0.5, cursor: 'not-allowed' }} />
              ) : isAutoSize ? (
                <input value={newOrder.size} readOnly style={{ ...inputStyle, width: '100%', opacity: 0.75 }} />
              ) : (
                <select value={newOrder.size} onChange={e => setO('size', e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Select size…</option>
                  {sizeOpts!.map(s => <option key={s}>{s}</option>)}
                </select>
              )}
              {newOrder.orderType === 'Other' && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>Please describe in Special Instructions.</div>
              )}
            </div>

            {/* Metal Type + Metal Color */}
            <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Metal Type *</label>
                <select value={newOrder.metalType} onChange={e => setO('metalType', e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Select…</option>
                  {METAL_TYPES_MODAL.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Metal Color</label>
                <select value={newOrder.metalColor} onChange={e => setO('metalColor', e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Select…</option>
                  {['Yellow Gold', 'White Gold', 'Rose Gold', 'Platinum', 'Two-Tone'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Quantity + Stamping */}
            <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Quantity</label>
                <input
                  type="number" min={1} step={1}
                  value={newOrder.quantity}
                  onChange={e => setO('quantity', e.target.value)}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Stamping (optional)</label>
                <input
                  value={newOrder.stamping}
                  onChange={e => setO('stamping', e.target.value)}
                  placeholder="e.g. 14K, initials, a date…"
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
            </div>

            {/* ── STONE DETAILS ── */}
            <div style={modalSectionTitle}>Stone Details</div>

            <div className="form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Diamond Type</label>
                <select value={newOrder.diamondType} onChange={e => setO('diamondType', e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Select…</option>
                  {DIAMOND_TYPES_MODAL.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Diamond Quality</label>
                <select value={newOrder.diamondQuality} onChange={e => setO('diamondQuality', e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Select…</option>
                  {DIAMOND_QUALITY_MODAL.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Customer PO# */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Customer PO# (optional)</label>
              <input
                value={newOrder.refCustomerPo}
                onChange={e => setO('refCustomerPo', e.target.value)}
                placeholder="Customer's own PO / reference number"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            {/* Special Instructions */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Special Instructions</label>
              <textarea
                value={newOrder.customerNotes}
                onChange={e => setO('customerNotes', e.target.value)}
                placeholder="Any special requests, engraving details, design notes, or size info for 'Other'…"
                rows={3}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>

            {/* ── REFERENCES ── */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Reference Link (optional)</label>
              <input
                value={refLink}
                onChange={e => setRefLink(e.target.value)}
                placeholder="https://pinterest.com/pin/... or any inspiration URL"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Reference Photos / Videos (optional) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— max 10</span></label>
              <div
                onClick={() => refFiles.length < 10 && fileRef.current?.click()}
                style={{
                  border: `2px dashed ${refFiles.length ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center',
                  cursor: refFiles.length >= 10 ? 'not-allowed' : 'pointer',
                  background: refFiles.length ? 'rgba(192,155,88,0.04)' : 'var(--bg-input)',
                  opacity: refFiles.length >= 10 ? 0.6 : 1, transition: 'all 0.15s',
                }}
              >
                <input
                  ref={fileRef} type="file" multiple style={{ display: 'none' }}
                  onChange={e => {
                    const picked = Array.from(e.target.files || []);
                    setRefFiles(prev => [...prev, ...picked].slice(0, 10));
                    e.target.value = '';
                  }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  🖼 Click to add photos or videos · JPG, PNG, MP4, MOV, PDF, 3DM, STL
                </div>
              </div>
              {refFiles.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {refFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-input)', borderRadius: '6px', padding: '5px 10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {f.type.startsWith('video') ? '🎬' : '🖼'} {f.name}
                      </span>
                      <button onClick={() => setRefFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', padding: '0 4px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={closeModal} style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button
                onClick={createOrder}
                disabled={!canSubmit}
                style={{ flex: 2, background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: '13px', opacity: canSubmit ? 1 : 0.6, letterSpacing: '0.3px' }}
              >
                {saving ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Saved filter views — e.g. "My overdue orders", "This week's VPOs" */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {filterPresets.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => applyFilterPreset(p)}
              style={{
                padding: '5px 6px 5px 12px', borderRadius: '20px 0 0 20px', fontSize: '12px', cursor: 'pointer',
                fontWeight: activePresetId === p.id ? 600 : 400,
                background: activePresetId === p.id ? 'var(--accent)' : 'var(--bg-card)',
                color: activePresetId === p.id ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${activePresetId === p.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRight: 'none',
              }}
            >
              ⭐ {p.name}
            </button>
            <button
              onClick={() => deleteFilterPreset(p.id)}
              title="Delete this saved view"
              style={{
                padding: '5px 10px 5px 6px', borderRadius: '0 20px 20px 0', fontSize: '12px', cursor: 'pointer',
                background: activePresetId === p.id ? 'var(--accent)' : 'var(--bg-card)',
                color: activePresetId === p.id ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${activePresetId === p.id ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >✕</button>
          </div>
        ))}
        {showSavePresetInput ? (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              autoFocus
              value={presetNameInput}
              onChange={e => setPresetNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCurrentFiltersAsPreset(); if (e.key === 'Escape') { setShowSavePresetInput(false); setPresetNameInput(''); } }}
              placeholder="View name…"
              style={{ ...inputStyle, padding: '5px 10px', fontSize: '12px', width: '140px' }}
            />
            <button onClick={saveCurrentFiltersAsPreset} disabled={!presetNameInput.trim()}
              style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: presetNameInput.trim() ? 'pointer' : 'default', background: 'var(--navy)', color: '#fff', border: 'none', opacity: presetNameInput.trim() ? 1 : 0.6 }}
            >Save</button>
            <button onClick={() => { setShowSavePresetInput(false); setPresetNameInput(''); }}
              style={{ padding: '5px 10px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowSavePresetInput(true)}
            style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: 'none', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}
          >+ Save current filters</button>
        )}
        {statusFilter === OrderStatus.VPO_ISSUED && ['ADMIN', 'AUTHORIZER'].includes(userRole) && (
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            title="Export the VPO Issued list as CSV"
            style={{
              marginLeft: 'auto', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              cursor: exportingCsv ? 'default' : 'pointer', background: 'var(--navy)', color: '#fff', border: 'none',
              opacity: exportingCsv ? 0.7 : 1,
            }}
          >
            {exportingCsv ? 'Exporting…' : '⬇ Export CSV'}
          </button>
        )}
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search PO number, store, customer, SKU…"
          style={{ ...inputStyle, flex: '1 1 200px', minWidth: '140px', maxWidth: '300px' }}
        />

        {/* Factory names are other external manufacturing partners' business
            identities — only Admin gets to see the full list. A Factory
            Manager, Stone Manager, etc. has no legitimate reason to know who
            else Kira works with. */}
        {userRole === 'ADMIN' && (
          <select
            value={factoryFilter}
            onChange={e => setFactoryFilter(e.target.value)}
            style={{ ...inputStyle, flex: '0 1 160px', cursor: 'pointer' }}
          >
            <option value="">All Factories</option>
            {(Object.values(Factory) as Factory[]).map(f => (
              <option key={f} value={f}>{FACTORY_CONFIG[f].label}</option>
            ))}
          </select>
        )}
        {userRole === 'ADMIN' && (
          <select
            value={supplySourceFilter}
            onChange={e => setSupplySourceFilter(e.target.value)}
            style={{ ...inputStyle, flex: '0 1 170px', cursor: 'pointer' }}
          >
            <option value="">All Stone Suppliers</option>
            {(Object.values(SupplySource) as SupplySource[]).map(s => (
              <option key={s} value={s}>{SUPPLY_SOURCE_CONFIG[s].label}</option>
            ))}
          </select>
        )}

        {/* Desktop: pill buttons */}
        <div className="status-tabs-desktop" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {(ROLE_STATUS_FILTERS[userRole] ?? ALL_STATUS_FILTERS).map(f => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setCadSubFilter(''); setStoneSubFilter(''); setCustomerTextedFilter(false); }}
              style={{
                padding: '6px 13px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                fontWeight: statusFilter === f.value && !customerTextedFilter ? 600 : 400,
                background: statusFilter === f.value && !customerTextedFilter ? 'var(--navy)' : 'var(--bg-card)',
                color: statusFilter === f.value && !customerTextedFilter ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${statusFilter === f.value && !customerTextedFilter ? 'var(--navy)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
          {/* A tab like the others, not a combinable toggle — selecting it
              clears the status filter (it applies across all statuses), and
              selecting any status tab clears it back out. */}
          <button
            onClick={() => { setCustomerTextedFilter(true); setStatusFilter(''); setCadSubFilter(''); setStoneSubFilter(''); }}
            title="Only show orders where the customer has sent a chat message"
            style={{
              padding: '6px 13px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              fontWeight: customerTextedFilter ? 600 : 400,
              background: customerTextedFilter ? 'var(--navy)' : 'var(--bg-card)',
              color: customerTextedFilter ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${customerTextedFilter ? 'var(--navy)' : 'var(--border)'}`,
              transition: 'all 0.15s',
            }}
          >
            Customer Text
          </button>
        </div>

        {/* Mobile: dropdown select */}
        <select
          className="status-tabs-mobile"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setCadSubFilter(''); setStoneSubFilter(''); }}
          style={{ ...inputStyle, flex: '1 1 160px', maxWidth: '220px', fontSize: '13px', padding: '8px 12px', fontWeight: 500 }}
        >
          {(ROLE_STATUS_FILTERS[userRole] ?? ALL_STATUS_FILTERS).map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* CAD Sub-filters — shown for Admin/Authorizer when CAD In Progress is selected */}
      {showCadSubRow && (
        <div className="status-tabs-row" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px', paddingLeft: '8px', borderLeft: '3px solid var(--accent)' }}>
          {[
            { label: 'All CAD',             value: '' },
            { label: '⏳ Pending CAD',      value: 'cad_pending' },
            { label: '💰 Awaiting Quote',   value: 'cad_awaiting_quote' },
            { label: '✅ Awaiting Approval', value: 'cad_awaiting_approval' },
            { label: '↺ Revision',          value: 'cad_revision' },
          ].map(f => (
            <button key={f.value} onClick={() => setCadSubFilter(f.value)}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer',
                fontWeight: cadSubFilter === f.value ? 700 : 400,
                background: cadSubFilter === f.value ? 'var(--accent)' : 'var(--bg-card)',
                color: cadSubFilter === f.value ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${cadSubFilter === f.value ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* Stone Sub-filters — shown for Admin/Authorizer/Factory when VPO Created is selected */}
      {showStoneSubRow && (
        <div className="stone-sub-filter" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px', paddingLeft: '8px', borderLeft: '3px solid #7C3AED' }}>
          {[
            { label: 'All VPO',            value: '',                  color: '#7C3AED' },
            { label: '🏭 Assign Supplier', value: 'stone_unassigned',  color: '#0369A1' },
            { label: '💎 Pending Stone',   value: 'stone_pending',     color: '#7C3AED' },
            { label: '✓ Stone Received',   value: 'stone_received',    color: '#7C3AED' },
          ].map(f => (
            <button key={f.value} onClick={() => setStoneSubFilter(f.value)}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer',
                fontWeight: stoneSubFilter === f.value ? 700 : 400,
                background: stoneSubFilter === f.value ? f.color : 'var(--bg-card)',
                color: stoneSubFilter === f.value ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${stoneSubFilter === f.value ? f.color : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* Date filter row — chips + compact pickers in one line */}
      <div className="date-filter-row">
        {(() => {
          const now = new Date();
          const months = [
            { label: 'This Month', y: now.getFullYear(), m: now.getMonth() + 1 },
            { label: 'Last Month', y: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), m: now.getMonth() === 0 ? 12 : now.getMonth() },
          ];
          return months.map(({ label, y, m }) => {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            const isActive = activeMonth === key;
            return (
              <button key={key} onClick={() => isActive ? clearDates() : applyMonth(y, m)}
                style={{ padding: '6px 13px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--accent-dark)' : 'var(--bg-card)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? 'var(--accent-dark)' : 'var(--border)'}`, transition: 'all 0.15s',
                }}
              >{label}</button>
            );
          });
        })()}
        <input type="date" value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setActiveMonth(''); }}
          style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }}
        />
        <input type="date" value={dateTo}
          onChange={e => { setDateTo(e.target.value); setActiveMonth(''); }}
          style={{ ...inputStyle, fontSize: '12px', padding: '7px 10px' }}
        />
        {(dateFrom || dateTo || activeMonth) && (
          <button onClick={clearDates} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: 'rgba(220,38,38,0.08)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>✕ Clear</button>
        )}
      </div>

      {/* Customer filter combobox */}
      {(() => {
        const countMap: Record<string, number> = {};
        orders.forEach(o => {
          const name = o.storeName || o.customerFullName || '';
          if (name) countMap[name] = (countMap[name] || 0) + 1;
        });
        const allNames = Object.keys(countMap).sort((a, b) => a.localeCompare(b));
        const q = customerFilterInput.toLowerCase();
        const filtered = customerFilterInput
          ? allNames.filter(n => n.toLowerCase().includes(q))
          : allNames;
        return (
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  value={customerFilterInput}
                  onChange={e => { setCustomerFilterInput(e.target.value); setCustomerFilter(''); setShowFilterDrop(true); }}
                  onFocus={() => setShowFilterDrop(true)}
                  onBlur={() => setTimeout(() => setShowFilterDrop(false), 150)}
                  placeholder="Filter by customer / store…"
                  className="customer-filter-input"
                  style={{ ...inputStyle, width: '280px', maxWidth: '100%', paddingRight: customerFilter ? '28px' : '12px' }}
                />
                {customerFilter && (
                  <button
                    onMouseDown={e => { e.preventDefault(); setCustomerFilter(''); setCustomerFilterInput(''); setShowFilterDrop(false); }}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '0', lineHeight: 1 }}
                  >✕</button>
                )}
              </div>
            </div>
            {showFilterDrop && filtered.length > 0 && (
              <div className="customer-filter-drop" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '280px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 200, maxHeight: '220px', overflowY: 'auto' }}>
                {filtered.map(name => (
                  <div
                    key={name}
                    onMouseDown={e => { e.preventDefault(); setCustomerFilter(name); setCustomerFilterInput(name); setShowFilterDrop(false); }}
                    style={{ padding: '9px 14px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', background: customerFilter === name ? 'rgba(192,155,88,0.1)' : 'transparent', fontWeight: customerFilter === name ? 600 : 400, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                    onMouseEnter={e => { if (customerFilter !== name) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = customerFilter === name ? 'rgba(192,155,88,0.1)' : 'transparent'; }}
                  >
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ flexShrink: 0, fontSize: '11px', fontWeight: 600, color: 'var(--accent-dark)', background: 'rgba(192,155,88,0.12)', border: '1px solid rgba(192,155,88,0.25)', borderRadius: '99px', padding: '1px 8px' }}>{countMap[name]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Select mode hint bar */}
      {selectMode && selectedIds.size === 0 && (
        <div style={{ marginBottom: '12px', padding: '10px 16px', background: 'rgba(192,155,88,0.08)', border: '1px solid rgba(192,155,88,0.3)', borderRadius: '8px', fontSize: '12px', color: 'var(--accent-dark)', fontWeight: 500 }}>
          {isFactoryManager
            ? 'Only orders with Stone Received can be selected. Tap them to select, then mark as Manufactured.'
            : 'Tap orders to select them, then cancel in bulk. Already cancelled or completed orders can\'t be selected.'}
        </div>
      )}

      {/* Orders grid */}
      {(() => {
        const activeQ = (customerFilter || customerFilterInput).toLowerCase();
        const displayOrders = activeQ
          ? orders.filter(o =>
              (o.customerFullName || '').toLowerCase().includes(activeQ) ||
              (o.storeName || '').toLowerCase().includes(activeQ)
            )
          : orders;

        if (loading) return <SkeletonOrderGrid count={8} />;

        if (loadError) return (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '10px' }}>{loadError}</div>
            <button
              onClick={() => load(page)}
              style={{ padding: '7px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
            >
              Retry
            </button>
          </div>
        );

        if (displayOrders.length === 0) return (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>
            No orders found.{search || statusFilter || customerFilter || customerFilterInput ? ' Try clearing your filters.' : ''}
          </div>
        );

        const selectableOrders = isFactoryManager
          ? displayOrders.filter(o => o.stoneStatus === StoneStatus.STONE_RECEIVED)
          : displayOrders.filter(o => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.COMPLETED);
        const allSelectableSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedIds.has(o.id!));

        return (
          <>
            {/* Select-all row — factory manager (mark manufactured) or office roles (bulk cancel) */}
            {selectMode && displayOrders.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <button
                  disabled={selectableOrders.length === 0}
                  onClick={() => {
                    if (allSelectableSelected) {
                      setSelectedIds(s => { const n = new Set(s); selectableOrders.forEach(o => n.delete(o.id!)); return n; });
                    } else {
                      setSelectedIds(s => { const n = new Set(s); selectableOrders.forEach(o => o.id && n.add(o.id)); return n; });
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', background: allSelectableSelected ? 'var(--accent)' : 'var(--bg-card)', border: `1px solid ${allSelectableSelected ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: selectableOrders.length === 0 ? 'not-allowed' : 'pointer', color: allSelectableSelected ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s', opacity: selectableOrders.length === 0 ? 0.5 : 1 }}
                >
                  <span style={{ fontSize: '14px' }}>{allSelectableSelected ? '☑' : '☐'}</span>
                  {allSelectableSelected
                    ? 'Deselect all'
                    : isFactoryManager
                      ? `Select all Stone Received (${selectableOrders.length})`
                      : `Select all (${selectableOrders.length})`}
                </button>
                {selectedIds.size > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedIds.size} selected</span>
                )}
              </div>
            )}

            <div className="orders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {displayOrders.map(order => {
                const isSelected = selectedIds.has(order.id!);
                const isSelectable = isFactoryManager
                  ? order.stoneStatus === StoneStatus.STONE_RECEIVED
                  : order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.COMPLETED;
                return (
                  <div key={order.id} style={{ position: 'relative', opacity: selectMode && !isSelectable ? 0.45 : 1, transition: 'opacity 0.15s' }}
                    onClick={selectMode ? (e) => {
                      if (!isSelectable) return;
                      e.preventDefault();
                      setSelectedIds(s => { const n = new Set(s); n.has(order.id!) ? n.delete(order.id!) : n.add(order.id!); return n; });
                    } : undefined}
                  >
                    {/* Selection indicator overlay for factory manager (mark manufactured) or office roles (bulk cancel) select mode */}
                    {selectMode && isSelectable && (
                      <div style={{
                        position: 'absolute', inset: 0, zIndex: 2, borderRadius: 'var(--radius)',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                        background: isSelected ? 'rgba(192,155,88,0.06)' : 'transparent',
                        pointerEvents: 'none', transition: 'all 0.1s',
                      }} />
                    )}
                    {selectMode && isSelectable && (
                      <div style={{
                        position: 'absolute', top: '10px', left: '10px', zIndex: 3,
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.92)',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                        transition: 'all 0.1s',
                        pointerEvents: 'none',
                      }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: '13px', lineHeight: 1, fontWeight: 700 }}>✓</span>}
                      </div>
                    )}
                    <OrderCard
                      order={order}
                      hideFinancials={!isAdmin}
                      onClick={selectMode ? undefined : () => router.push(`/orders/${order.id}`)}
                      referenceImage={thumbnails[order.id!] || undefined}
                      currentUserRole={userRole}
                    />
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                >← Prev</button>
                {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    style={{ padding: '6px 12px', borderRadius: '7px', border: `1px solid ${page === i ? 'var(--navy)' : 'var(--border)'}`, background: page === i ? 'var(--navy)' : 'var(--bg-card)', color: page === i ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: page === i ? 700 : 400 }}
                  >{i + 1}</button>
                )).slice(Math.max(0, page - 2), page + 5)}
                <button
                  disabled={page >= Math.ceil(total / PAGE_SIZE) - 1}
                  onClick={() => setPage(p => p + 1)}
                  style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: page >= Math.ceil(total / PAGE_SIZE) - 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page >= Math.ceil(total / PAGE_SIZE) - 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                >Next →</button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Page {page + 1} of {Math.ceil(total / PAGE_SIZE)} · {total} total
                </span>
              </div>
            )}
          </>
        );
      })()}

      {/* Floating bulk action bar — factory manager (mark manufactured) or office roles (bulk cancel) */}
      {selectMode && selectedIds.size > 0 && (
        <div className="bulk-action-bar" style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          background: 'var(--navy)', borderRadius: '12px', padding: '12px 20px',
          boxShadow: '0 8px 32px rgba(26,39,64,0.4)', minWidth: '320px', maxWidth: 'calc(100vw - 32px)',
          justifyContent: 'center',
          animation: 'fadeSlideUp 0.2s ease',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>
              {selectedIds.size} order{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }}>
              {isFactoryManager ? 'Mark all as Manufactured?' : 'Cancel or delete selected orders?'}
            </span>
          </div>
          <div className="bulk-bar-spacer" style={{ flex: 1 }} />
          <button
            onClick={exitSelectMode}
            className="bulk-bar-btn"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px', padding: '7px 14px', color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Dismiss
          </button>
          {!isFactoryManager && canBulkReassignFactory && (
            <button
              onClick={() => setShowReassignModal(true)}
              disabled={bulkLoading}
              className="bulk-bar-btn"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px', padding: '7px 14px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: bulkLoading ? 'not-allowed' : 'pointer' }}
            >
              🏭 Reassign Factory
            </button>
          )}
          {!isFactoryManager && canBulkStatusNudge && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select
                value={nudgeStatus}
                onChange={e => setNudgeStatus(e.target.value as OrderStatus | '')}
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px', padding: '7px 10px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="" style={{ color: '#000' }}>Move to…</option>
                <option value={OrderStatus.CAD_IN_PROGRESS} style={{ color: '#000' }}>CAD In Progress</option>
                <option value={OrderStatus.MANUFACTURED} style={{ color: '#000' }}>Manufactured</option>
                <option value={OrderStatus.COMPLETED} style={{ color: '#000' }}>Completed</option>
              </select>
              <button
                onClick={handleBulkStatusNudge}
                disabled={bulkLoading || !nudgeStatus}
                className="bulk-bar-btn"
                style={{ background: 'var(--accent)', border: 'none', borderRadius: '7px', padding: '7px 14px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: (bulkLoading || !nudgeStatus) ? 'not-allowed' : 'pointer', opacity: (bulkLoading || !nudgeStatus) ? 0.6 : 1 }}
              >
                {bulkLoading ? 'Moving…' : 'Apply'}
              </button>
            </div>
          )}
          {(isFactoryManager || canBulkCancel) && (
            <button
              onClick={isFactoryManager ? handleBulkManufactured : handleBulkCancel}
              disabled={bulkLoading}
              className="bulk-bar-btn"
              style={{ background: isFactoryManager ? 'var(--accent)' : '#DC2626', border: 'none', borderRadius: '7px', padding: '8px 20px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: bulkLoading ? 'not-allowed' : 'pointer', opacity: bulkLoading ? 0.7 : 1, letterSpacing: '0.2px' }}
            >
              {isFactoryManager
                ? (bulkLoading ? 'Marking…' : '✓ Mark as Manufactured')
                : (bulkLoading ? 'Cancelling…' : '✕ Cancel Orders')}
            </button>
          )}
          {!isFactoryManager && canBulkDelete && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="bulk-bar-btn"
              style={{ background: 'transparent', border: '1px solid #DC2626', borderRadius: '7px', padding: '8px 20px', color: '#DC2626', fontSize: '13px', fontWeight: 700, cursor: bulkLoading ? 'not-allowed' : 'pointer', opacity: bulkLoading ? 0.7 : 1, letterSpacing: '0.2px' }}
            >
              {bulkLoading ? 'Deleting…' : '🗑 Delete Orders'}
            </button>
          )}
        </div>
      )}

      {/* Bulk Reassign Factory modal */}
      {showReassignModal && (
        <div className="modal-bg" style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="modal-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '440px', maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Reassign Factory
              </div>
              <button onClick={() => setShowReassignModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Assigns a factory and stone supplier to all {selectedIds.size} selected order{selectedIds.size > 1 ? 's' : ''}. Only orders with VPO Issued status can be reassigned.
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Factory *</label>
              <select value={reassignFactory} onChange={e => setReassignFactory(e.target.value as Factory)} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Select factory…</option>
                {(Object.values(Factory) as Factory[]).map(f => (
                  <option key={f} value={f}>{FACTORY_CONFIG[f].label}</option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Stone Supplier *</label>
              <select value={reassignSupplySource} onChange={e => setReassignSupplySource(e.target.value as SupplySource)} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Select supplier…</option>
                {(Object.values(SupplySource) as SupplySource[]).map(s => (
                  <option key={s} value={s}>{SUPPLY_SOURCE_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setShowReassignModal(false)} style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button
                onClick={handleBulkReassignFactory}
                disabled={bulkLoading || !reassignFactory || !reassignSupplySource}
                style={{ flex: 2, background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: (bulkLoading || !reassignFactory || !reassignSupplySource) ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: (bulkLoading || !reassignFactory || !reassignSupplySource) ? 0.6 : 1 }}
              >
                {bulkLoading ? 'Reassigning…' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 480px) {
          .bulk-action-bar {
            min-width: 0 !important;
            width: calc(100vw - 32px);
            flex-direction: column;
            align-items: stretch !important;
          }
          .bulk-action-bar .bulk-bar-spacer { display: none; }
          .bulk-action-bar .bulk-bar-btn { width: 100%; }
        }
      `}</style>
    </AppLayout>
  );
}
