import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../utils/toast';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { AppLayout } from '../../components/layout/AppLayout';
import { Order, OrderStatus, StoneStatus, STATUS_CONFIG, UserRole, getCadSubLabel } from '../../utils/types';
import { apiFetch, API, getErrorMessage } from '../../utils/apiFetch';
import { OrderConversation } from '../../components/OrderConversation';

const ThreeDmViewer = dynamic(() => import('../../components/ThreeDmViewer'), { ssr: false });
const StlViewer = dynamic(() => import('../../components/StlViewer'), { ssr: false });

// ── CAD types ────────────────────────────────────────────────────────────
interface CadFile {
  id: string; orderId: string; originalName: string; fileName: string;
  status: string; revisionNumber: number; uploadedBy: string;
  designerNotes?: string; customerFeedback?: string;
  approvedAt?: string; approvedBy?: string; createdAt: string;
  filePath?: string; thumbnailPath?: string;
  cadPersonName?: string; verifiedByName?: string;
}

const CAD_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  UPLOADED:           { label: 'Uploaded',          color: '#6366F1', bg: '#EEF2FF' },
  SENT_FOR_APPROVAL:  { label: 'Awaiting Approval', color: '#F59E0B', bg: '#FEF3C7' },
  APPROVED:           { label: 'Approved',          color: '#10B981', bg: '#D1FAE5' },
  REJECTED:           { label: 'Rejected',          color: '#EF4444', bg: '#FEE2E2' },
  REVISION_REQUESTED: { label: 'Revision Requested',color: '#8B5CF6', bg: '#EDE9FE' },
};

// Roles allowed to take approve/reject/revision actions
const CAD_ACTION_ROLES = [UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.SALES_REP];

// ── CAD Inline Viewer ─────────────────────────────────────────────────────
interface ViewerProps {
  cad: CadFile;
  cads?: CadFile[];      // full list for prev/next navigation
  initialIndex?: number; // starting position in the list
  userRole: string; batchCount?: number;
  onClose: () => void;
  onAction: (cadId: string, action: 'approve' | 'reject' | 'revision', feedback: string) => Promise<void>;
}

function CadInlineViewer({ cad: initialCad, cads = [], initialIndex = 0, userRole, batchCount = 1, onClose, onAction }: ViewerProps) {
  const [idx, setIdx] = useState(initialIndex);
  const [feedback, setFeedback] = useState('');
  const [acting, setActing] = useState(false);

  const list = cads.length > 0 ? cads : [initialCad];
  const cad = list[idx] ?? initialCad;
  const hasPrev = idx > 0;
  const hasNext = idx < list.length - 1;

  const ext = (cad.originalName.split('.').pop() || '').toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const isPdf   = ext === 'pdf';
  const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'wmv'].includes(ext);
  const isJcd   = ext === 'jcd';
  const fileUrl = cad.filePath || `/uploads/cad/${cad.fileName}`;
  const companionForJcd = isJcd
    ? list.find(f => {
        const base = cad.originalName.replace(/\.jcd$/i, '');
        const fBase = f.originalName.replace(/\.[^.]+$/, '');
        const fExt = (f.originalName.split('.').pop() || '').toLowerCase();
        return f.id !== cad.id && fBase === base && ['jpg','jpeg','png','webp'].includes(fExt);
      })
    : undefined;
  const cs = CAD_STATUS_CFG[cad.status] || { label: cad.status, color: '#6B7280', bg: '#F3F4F6' };
  const canAct  = CAD_ACTION_ROLES.includes(userRole as UserRole) && cad.status !== 'APPROVED';

  const act = async (action: 'approve' | 'reject' | 'revision') => {
    setActing(true);
    await onAction(cad.id, action, feedback);
    setActing(false);
    onClose();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft'  && hasPrev) setIdx(i => i - 1);
      if (e.key === 'ArrowRight' && hasNext) setIdx(i => i + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, hasPrev, hasNext]);

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: `1px solid ${cs.color}50`,
      boxShadow: `0 0 0 3px ${cs.color}18, 0 4px 24px rgba(0,0,0,0.12)`,
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-input)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span style={{ fontSize: '18px' }}>{isImage ? '🖼' : isPdf ? '📄' : isVideo ? '🎬' : isJcd ? '💎' : ext === '3dm' ? '🧊' : ext === 'stl' ? '🔺' : '📎'}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cad.originalName}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>·</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {new Date(cad.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>·</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>by {cad.uploadedBy}</span>
            </div>
          </div>
          <span style={{ fontSize: '11px', background: cs.bg, color: cs.color, padding: '3px 10px', borderRadius: '99px', fontWeight: 700, flexShrink: 0 }}>
            {cs.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '12px', alignItems: 'center' }}>
          {list.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px 6px' }}>
              <button
                onClick={() => setIdx(i => i - 1)} disabled={!hasPrev}
                style={{ background: 'none', border: 'none', cursor: hasPrev ? 'pointer' : 'default', fontSize: '14px', opacity: hasPrev ? 1 : 0.3, padding: '2px 5px', lineHeight: 1, color: 'var(--text-primary)' }}
              >
                ‹
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, minWidth: '34px', textAlign: 'center' }}>
                {idx + 1} / {list.length}
              </span>
              <button
                onClick={() => setIdx(i => i + 1)} disabled={!hasNext}
                style={{ background: 'none', border: 'none', cursor: hasNext ? 'pointer' : 'default', fontSize: '14px', opacity: hasNext ? 1 : 0.3, padding: '2px 5px', lineHeight: 1, color: 'var(--text-primary)' }}
              >
                ›
              </button>
            </div>
          )}
          {!(ext === '3dm' && userRole === UserRole.CUSTOMER) && (
            <a
              href={fileUrl} download={cad.originalName}
              style={{ background: 'var(--navy)', color: '#fff', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              ↓ Download
            </a>
          )}
          {ext === '3dm' && userRole === UserRole.CUSTOMER && (
            <span style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 600 }}>
              View Only
            </span>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '15px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── File Preview ── */}
      <div style={{ background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px', maxHeight: '480px', overflow: 'auto' }}>
        {isImage ? (
          <img
            src={fileUrl} alt={cad.originalName}
            style={{ maxWidth: '100%', maxHeight: '460px', objectFit: 'contain', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : isPdf ? (
          <iframe
            src={`${fileUrl}#toolbar=1&navpanes=0`}
            style={{ width: '100%', height: '460px', border: 'none' }}
            title={cad.originalName}
          />
        ) : isVideo ? (
          <video
            src={fileUrl} controls
            style={{ maxWidth: '100%', maxHeight: '460px', display: 'block' }}
          />
        ) : ext === '3dm' ? (
          <ThreeDmViewer fileUrl={fileUrl} height={460} />
        ) : ext === 'stl' ? (
          <StlViewer fileUrl={fileUrl} height={460} />
        ) : isJcd ? (
          companionForJcd ? (
            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={`${companionForJcd.filePath || '/uploads/cad/' + companionForJcd.fileName}`}
                alt={cad.originalName}
                style={{ maxWidth: '100%', maxHeight: '460px', objectFit: 'contain', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.75)', color: '#c09b58', fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                💎 JewelCAD Design File — Download to open source in JewelCAD or Matrix
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: '64px', marginBottom: '10px' }}>💎</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: '8px' }}>
                JewelCAD Design File
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                Use the Download button above to open in JewelCAD or Matrix.
              </div>
            </div>
          )
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: '56px', marginBottom: '14px', opacity: 0.5 }}>📎</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '18px' }}>
              Preview not available for .{ext} files
            </div>
            <a href={fileUrl} download={cad.originalName}
              style={{ background: 'var(--accent)', color: '#fff', padding: '9px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}>
              ↓ Download File
            </a>
          </div>
        )}
      </div>

      {/* ── Notes + Actions ── */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--bg-card)' }}>
        {(cad.cadPersonName || cad.verifiedByName) && (
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {cad.cadPersonName && (
              <div><span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.6px' }}>CAD Person </span>{cad.cadPersonName}</div>
            )}
            {cad.verifiedByName && (
              <div><span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.6px' }}>Verified By </span>{cad.verifiedByName}</div>
            )}
          </div>
        )}
        {(cad.designerNotes || cad.customerFeedback) && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {cad.designerNotes && (
              <div style={{ flex: 1, minWidth: '200px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Designer Note</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{cad.designerNotes}</div>
              </div>
            )}
            {cad.customerFeedback && (
              <div style={{ flex: 1, minWidth: '200px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Customer Feedback</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{cad.customerFeedback}</div>
              </div>
            )}
          </div>
        )}

        {canAct && (
          <>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Add feedback or revision notes (optional)…"
              rows={2}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', marginBottom: '10px' }}
            />
            {batchCount > 1 && (
              <div style={{ fontSize: '11px', color: '#F59E0B', marginBottom: '8px', fontWeight: 600 }}>
                ⚠ Action applies to all {batchCount} files uploaded together
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => act('approve')} disabled={acting}
                style={{ flex: 1, minWidth: '120px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '8px', padding: '10px', color: '#059669', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                ✓ Approve{batchCount > 1 ? ' All' : ''}
              </button>
              <button onClick={() => act('revision')} disabled={acting}
                style={{ flex: 1, minWidth: '140px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px', padding: '10px', color: '#8B5CF6', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                ↺ Request Changes{batchCount > 1 ? ' (All)' : ''}
              </button>
              <button onClick={() => act('reject')} disabled={acting}
                style={{ flex: 1, minWidth: '100px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '10px', color: '#DC2626', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                ✕ Reject{batchCount > 1 ? ' All' : ''}
              </button>
            </div>
          </>
        )}
        {!canAct && cad.status === 'APPROVED' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontSize: '13px', fontWeight: 600 }}>
            <span style={{ fontSize: '18px' }}>✓</span>
            Approved{cad.approvedBy ? ` by ${cad.approvedBy}` : ''}
            {cad.approvedAt ? ` on ${new Date(cad.approvedAt).toLocaleDateString()}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}

// Valid next statuses from each current status (workflow transitions)
const STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.NEW]:             [OrderStatus.CAD_IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.CAD_IN_PROGRESS]: [OrderStatus.VPO_ISSUED, OrderStatus.CANCELLED],
  [OrderStatus.VPO_ISSUED]:      [OrderStatus.MANUFACTURED, OrderStatus.CANCELLED],
  [OrderStatus.MANUFACTURED]:    [OrderStatus.COMPLETED, OrderStatus.REPAIR, OrderStatus.CANCELLED],
  [OrderStatus.REPAIR]:          [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]:       [],
  [OrderStatus.CANCELLED]:       [],
};

// Statuses each role is permitted to move an order into
const ROLE_STAGE_PERMISSIONS: Record<string, OrderStatus[]> = {
  [UserRole.ADMIN]:           Object.values(OrderStatus),
  [UserRole.AUTHORIZER]:      [OrderStatus.CAD_IN_PROGRESS, OrderStatus.CANCELLED, OrderStatus.REPAIR, OrderStatus.COMPLETED],
  [UserRole.SALES_REP]:       [OrderStatus.CANCELLED],
  [UserRole.CAD_DESIGNER]:    [],
  [UserRole.FACTORY_MANAGER]: [OrderStatus.MANUFACTURED],
  [UserRole.STONE_MANAGER]:   [],
  [UserRole.CUSTOMER]:        [],
};

const FIELD_GROUPS = [
  {
    title: 'Order Details',
    fields: [
      { key: 'poNumber', label: 'PO Number' },
      { key: 'refCustomerPo', label: 'Customer PO#' },
      { key: 'kiraSkuNumber', label: 'Kira SKU' },
      { key: 'orderType', label: 'Order Type' },
      { key: 'manufacturingPath', label: 'Manufacturing Path' },
      { key: 'referenceWeblink', label: 'Reference Link' },
    ],
  },
  {
    title: 'Customer',
    fields: [
      { key: 'storeName', label: 'Store Name' },
      { key: 'customerFullName', label: 'Customer Name' },
      { key: 'customerEmail', label: 'Customer Email' },
      { key: 'phoneNumber', label: 'Phone' },
    ],
  },
  {
    title: 'Product Specs',
    fields: [
      { key: 'metalType', label: 'Metal Type' },
      { key: 'metalColor', label: 'Metal Color' },
      { key: 'size', label: 'Size' },
      { key: 'diamondType', label: 'Diamond Type' },
      { key: 'diamondQuality', label: 'Diamond Quality' },
      { key: 'centerStoneShape', label: 'Stone Shape' },
      { key: 'approximateCaratWeight', label: 'Carat Weight' },
    ],
  },
  {
    title: 'Pricing & Logistics',
    fields: [
      { key: 'quotedCost', label: 'Quoted Cost', format: (v: any) => v ? `$${Number(v).toLocaleString()}` : '—' },
      { key: 'vendorName', label: 'Vendor' },
      { key: 'invoiceNumber', label: 'Invoice #' },
    ],
  },
];

// Product spec fields — editable inline, Admin/Authorizer only, any order status
const EDITABLE_SPEC_KEYS = ['metalType', 'metalColor', 'size', 'diamondType', 'diamondQuality', 'centerStoneShape', 'approximateCaratWeight'];

const MAX_REFERENCE_IMAGES = 4;
const DESIGN_FILES_COLLAPSED_COUNT = 2;

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '14px 18px',
  boxShadow: 'var(--shadow-sm)',
};

export default function OrderDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState<Partial<Order> | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [cads, setCads] = useState<CadFile[]>([]);
  const [viewingCad, setViewingCad] = useState<CadFile | null>(null);
  const [viewingCadList, setViewingCadList] = useState<CadFile[]>([]);
  const [viewingRef, setViewingRef] = useState<CadFile | null>(null);
  const [viewingRefList, setViewingRefList] = useState<CadFile[]>([]);
  const refSectionRef = useRef<HTMLDivElement>(null);
  const [priceModal, setPriceModal] = useState(false);
  const [pendingPrice, setPendingPrice] = useState('');
  const [quotedPriceInput, setQuotedPriceInput] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [customerPoInput, setCustomerPoInput] = useState('');
  const [savingPo, setSavingPo] = useState(false);
  const [shipDateInput, setShipDateInput] = useState('');
  const [savingShipDate, setSavingShipDate] = useState(false);
  const [specInputs, setSpecInputs] = useState<Record<string, string>>({});
  const [savingSpecKey, setSavingSpecKey] = useState<string | null>(null);
  const [showAllRefs, setShowAllRefs] = useState(false);
  const [showAllDesignFiles, setShowAllDesignFiles] = useState(false);
  const [repairModal, setRepairModal] = useState(false);
  const [repairContractorInput, setRepairContractorInput] = useState('');
  const [sendingToCustomer, setSendingToCustomer] = useState(false);
  const [events, setEvents] = useState<{ id: string; action: string; userEmail: string; fromStatus?: string; toStatus?: string; createdAt: string }[]>([]);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCadPerson, setUploadCadPerson] = useState('');
  const [uploadVerifiedBy, setUploadVerifiedBy] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jf_user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const { signal } = controller;

    setCads([]);
    setLoading(true);

    // Load audit events in parallel (non-blocking)
    apiFetch(`${API}/orders/${id}/events`).then(r => r.ok ? r.json() : []).then(setEvents).catch(() => {});

    const fetchOrder = apiFetch(`${API}/orders/${id}`, { signal })
      .then(async (oRes) => {
        if (signal.aborted) return;
        if (oRes.ok) {
          const o = await oRes.json();
          setOrder(o);
          setQuotedPriceInput(o.quotedCost ? String(o.quotedCost) : '');
          setCustomerPoInput(o.refCustomerPo || '');
          setShipDateInput(o.committedShipDate ? String(o.committedShipDate).slice(0, 10) : '');
          const specs: Record<string, string> = {};
          EDITABLE_SPEC_KEYS.forEach(k => { specs[k] = o[k] ?? ''; });
          setSpecInputs(specs);
        }
      })
      .catch((e) => { if (!signal.aborted) console.error('Order fetch error:', e); });

    const fetchCads = apiFetch(`${API}/cad/order/${id}`, { signal })
      .then(async (cRes) => {
        if (signal.aborted) return;
        if (cRes.ok) {
          setCads(await cRes.json());
        } else {
          console.error(`CAD files fetch failed: ${cRes.status} ${cRes.statusText} for order ${id}`);
        }
      })
      .catch((e) => { if (!signal.aborted) console.error('CAD files fetch error:', e); });

    Promise.all([fetchOrder, fetchCads]).finally(() => {
      if (!signal.aborted) setLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [id]);

  const handleCadAction = async (cadId: string, action: 'approve' | 'reject' | 'revision', feedback: string) => {
    // Apply action to the clicked file AND all other SENT_FOR_APPROVAL files in the same order (batch)
    const batchIds = cads
      .filter(c => c.status === 'SENT_FOR_APPROVAL')
      .map(c => c.id);
    const targets = batchIds.length > 0 ? batchIds : [cadId];
    for (const cid of targets) {
      await apiFetch(`${API}/cad/${cid}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify({ feedback }),
      });
    }
    const res = await apiFetch(`${API}/cad/order/${id}`);
    if (res.ok) setCads(await res.json());
    const oRes = await apiFetch(`${API}/orders/${id}`);
    if (oRes.ok) setOrder(await oRes.json());
  };

  const authorizeOrder = async () => {
    if (!order?.id) return;
    setAuthorizing(true);
    const res = await apiFetch(`${API}/orders/${order.id}/authorize`, { method: 'PATCH' });
    if (res.ok) setOrder(await res.json());
    setAuthorizing(false);
  };

  const loadSummary = async () => {
    if (!order?.id) return;
    setSummaryLoading(true);
    const res = await apiFetch(`${API}/orders/${order.id}/summary`);
    if (res.ok) { const d = await res.json(); setSummary(d.summary); }
    setSummaryLoading(false);
  };

  const moveStatus = async (newStatus: OrderStatus, quotedCost?: number, repairContractor?: string) => {
    if (!order?.id) return;
    // Issuing the VPO requires a price — show modal if not provided
    if (newStatus === OrderStatus.VPO_ISSUED && !quotedCost) {
      setPendingPrice(order.quotedCost ? String(order.quotedCost) : '');
      setPriceModal(true);
      return;
    }
    // REPAIR requires a contractor name — show modal
    if (newStatus === OrderStatus.REPAIR && !repairContractor) {
      setRepairContractorInput('');
      setRepairModal(true);
      return;
    }
    setUpdatingStatus(true);
    const body: any = { status: newStatus };
    if (quotedCost) body.quotedCost = quotedCost;
    if (repairContractor) body.repairContractor = repairContractor;
    const res = await apiFetch(`${API}/orders/${order.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrder(updated);
    }
    setUpdatingStatus(false);
  };

  const saveQuotedPrice = async () => {
    const price = parseFloat(quotedPriceInput);
    if (!price || price <= 0 || !order?.id) return;
    setSavingPrice(true);
    const res = await apiFetch(`${API}/orders/${order.id}`, {
      method: 'PUT',
      body: JSON.stringify({ quotedCost: price }),
    });
    if (res.ok && order.status === 'CAD_IN_PROGRESS' && !order.sentToCustomer) {
      // Auto-send CAD files to customer — moves label from Awaiting Quote → Awaiting Approval
      await apiFetch(`${API}/cad/order/${order.id}/send-to-customer`, { method: 'PATCH' });
    }
    if (res.ok) {
      const fresh = await apiFetch(`${API}/orders/${order.id}`);
      if (fresh.ok) setOrder(await fresh.json());
    }
    setSavingPrice(false);
  };

  const saveCustomerPo = async () => {
    if (!order?.id) return;
    setSavingPo(true);
    const res = await apiFetch(`${API}/orders/${order.id}`, {
      method: 'PUT',
      body: JSON.stringify({ refCustomerPo: customerPoInput.trim() || null }),
    });
    if (res.ok) {
      const fresh = await apiFetch(`${API}/orders/${order.id}`);
      if (fresh.ok) setOrder(await fresh.json());
    }
    setSavingPo(false);
  };

  const saveSpecField = async (key: string) => {
    if (!order?.id) return;
    setSavingSpecKey(key);
    try {
      const res = await apiFetch(`${API}/orders/${order.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [key]: specInputs[key]?.trim() || null }),
      });
      if (res.ok) {
        setOrder(await res.json());
      } else {
        const err = await res.json().catch(() => null);
        toast.error(getErrorMessage(err, 'Failed to save.'));
      }
    } catch {
      toast.error('Failed to save — check your connection and try again.');
    } finally {
      setSavingSpecKey(null);
    }
  };

  const saveShipDate = async () => {
    if (!order?.id || !shipDateInput) return;
    setSavingShipDate(true);
    try {
      const res = await apiFetch(`${API}/orders/${order.id}`, {
        method: 'PUT',
        body: JSON.stringify({ committedShipDate: shipDateInput }),
      });
      if (res.ok) {
        setOrder(await res.json());
      } else {
        const err = await res.json().catch(() => null);
        toast.error(getErrorMessage(err, 'Failed to save committed ship date.'));
      }
    } catch {
      toast.error('Failed to save committed ship date — check your connection and try again.');
    } finally {
      setSavingShipDate(false);
    }
  };

  const confirmPriceAndMove = async () => {
    const price = parseFloat(pendingPrice);
    if (!price || price <= 0) return;
    setPriceModal(false);
    await moveStatus(OrderStatus.VPO_ISSUED, price);
  };

  const confirmRepair = async () => {
    if (!repairContractorInput.trim()) return;
    setRepairModal(false);
    await moveStatus(OrderStatus.REPAIR, undefined, repairContractorInput.trim());
  };

  const sendCadToCustomer = async () => {
    if (!order?.id) return;
    setSendingToCustomer(true);
    const res = await apiFetch(`${API}/cad/order/${order.id}/send-to-customer`, { method: 'PATCH' });
    if (res.ok) {
      const fresh = await apiFetch(`${API}/orders/${order.id}`);
      if (fresh.ok) setOrder(await fresh.json());
    }
    setSendingToCustomer(false);
  };

  if (loading) {
    return (
      <AppLayout title="Order Detail">
        <div style={{ color: 'var(--text-muted)', padding: '60px 0', textAlign: 'center', fontSize: '14px' }}>Loading…</div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout title="Order Not Found">
        <div style={{ color: 'var(--danger)', padding: '60px 0', textAlign: 'center' }}>
          Order not found. <a href="/orders" style={{ color: 'var(--accent)', fontWeight: 600 }}>Back to orders</a>
        </div>
      </AppLayout>
    );
  }

  const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const userRole = currentUser?.role || '';
  const allowedStatuses = ROLE_STAGE_PERMISSIONS[userRole] || [];
  const validNextStatuses = STATUS_TRANSITIONS[order.status as OrderStatus] ?? [];
  // Admins see all valid transitions; other roles see only what they're permitted to do
  const movableStatuses = userRole === UserRole.ADMIN
    ? validNextStatuses
    : allowedStatuses.filter(s => validNextStatuses.includes(s));
  const canDelete = [UserRole.ADMIN, UserRole.AUTHORIZER].includes(userRole as UserRole);

  const handleUploadFiles = async () => {
    if (!order?.id || !uploadFiles.length || !uploadCadPerson.trim() || !uploadVerifiedBy.trim()) return;
    setUploadingFiles(true);
    try {
      const fd = new FormData();
      uploadFiles.forEach(f => fd.append('files', f));
      fd.append('cadPersonName', uploadCadPerson.trim());
      fd.append('verifiedByName', uploadVerifiedBy.trim());
      const res = await apiFetch(`${API}/cad/upload/${order.id}`, { method: 'POST', body: fd });
      if (res.ok) {
        const cRes = await apiFetch(`${API}/cad/order/${order.id}`);
        if (cRes.ok) setCads(await cRes.json());
        const oRes = await apiFetch(`${API}/orders/${order.id}`);
        if (oRes.ok) setOrder(await oRes.json());
        setShowUploadModal(false);
        setUploadFiles([]);
        setUploadCadPerson('');
        setUploadVerifiedBy('');
      } else {
        const err = await res.json().catch(() => null);
        toast.error(getErrorMessage(err, 'Failed to upload files'));
      }
    } catch {
      toast.error('Upload failed — check your connection and try again.');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!order?.id || deleteConfirmInput !== order.poNumber) return;
    setDeleting(true);
    const res = await apiFetch(`${API}/orders/${order.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(`Order ${order.poNumber} permanently deleted.`);
      router.push('/orders');
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.message || 'Failed to delete order');
      setDeleting(false);
    }
  };

  return (
    <>
    <style>{`
      @media print {
        /* Unlock every overflow/height constraint from html down to the content pad */
        html, body,
        #__next, #__next > div,
        .app-main, .main-content-pad {
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
        /* Hide chrome */
        .admin-topbar, .sidebar-nav,
        .order-sticky-sidebar,
        .topbar-actions, button { display: none !important; }
        /* White background */
        body { background: #fff !important; }
        /* Collapse grids to single column */
        .order-detail-outer { grid-template-columns: 1fr !important; }
        .order-detail-grid  { grid-template-columns: 1fr !important; }
        /* Fit media */
        img, iframe, video { max-width: 100% !important; break-inside: avoid; }
        /* Reference file thumbnails are cropped to 110px on screen — show them
           fully uncropped when printing */
        .ref-thumb-img { height: auto !important; max-height: none !important; object-fit: contain !important; }
      }
    `}</style>
    <AppLayout
      title={order.poNumber || 'Order Detail'}
      subtitle={order.storeName || order.customerFullName || ''}
      actions={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            style={{ background: 'rgba(192,155,88,0.1)', border: '1px solid rgba(192,155,88,0.35)', borderRadius: '8px', padding: '7px 16px', color: 'var(--accent-dark)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
          >
            🖨 Print
          </button>
          <button
            onClick={() => router.push(`/orders/${id}/cad-brief`)}
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '8px', padding: '7px 16px', color: '#7C3AED', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
          >
            🖨 CAD Brief
          </button>
          {['VPO_ISSUED','MANUFACTURED','SHIPPED','COMPLETED'].includes(order.status!) && (
            <button
              onClick={() => router.push(`/orders/${id}/jobbag`)}
              style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.35)', borderRadius: '8px', padding: '7px 16px', color: '#0369a1', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              🖨 Job Bag
            </button>
          )}
          <button
            onClick={() => router.push('/orders')}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 16px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
          >
            ← Back to Orders
          </button>
          {canDelete && (
            <button
              onClick={() => { setDeleteConfirmInput(''); setShowDeleteModal(true); }}
              style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: '8px', padding: '7px 16px', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              🗑 Delete Order
            </button>
          )}
        </div>
      }
    >
      {/* ── Outer: content (left) + sidebar (right, sticky) ── */}
      <div className="order-detail-outer" style={{ display: 'grid', gridTemplateColumns: '1fr 288px', gap: '20px', alignItems: 'start' }}>

        {/* ── Main content column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="order-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>

          {/* ── Col 1: Field groups ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {FIELD_GROUPS.map(group => {
              // invoiceNumber stays admin-only; Factory/Stone Manager don't see pricing or
              // customer identity (also enforced server-side, see FactoryRedactionInterceptor);
              // phone number only shows up when the order actually has one
              const FACTORY_HIDDEN_KEYS = ['quotedCost', 'customerFullName', 'storeName', 'customerEmail', 'phoneNumber'];
              const isRestrictedRole = userRole === UserRole.FACTORY_MANAGER || userRole === UserRole.STONE_MANAGER;
              const visibleFields = group.fields.filter(f => {
                if (f.key === 'invoiceNumber' && userRole !== UserRole.ADMIN) return false;
                if (FACTORY_HIDDEN_KEYS.includes(f.key) && isRestrictedRole) return false;
                if (f.key === 'phoneNumber' && !order.phoneNumber) return false;
                return true;
              });
              if (visibleFields.length === 0) return null;
              return (
              <div key={group.title} style={cardStyle}>
                <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '10px' }}>
                  {group.title}
                </h3>
                <div className="order-spec-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {visibleFields.map(({ key, label, format }) => {
                    const raw = (order as any)[key];
                    const val = format ? format(raw) : (raw ?? '—');
                    const isLink = key === 'referenceWeblink' && raw;
                    const canEditPo = key === 'refCustomerPo' &&
                      [UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER].includes(userRole as UserRole);
                    const canEditSpec = EDITABLE_SPEC_KEYS.includes(key) &&
                      (userRole === UserRole.ADMIN || userRole === UserRole.AUTHORIZER);
                    return (
                      <div key={key}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          {label}
                        </div>
                        {canEditPo ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              value={customerPoInput}
                              onChange={e => setCustomerPoInput(e.target.value)}
                              placeholder="Add customer PO#"
                              style={{ flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
                            />
                            {customerPoInput !== (order.refCustomerPo || '') && (
                              <button
                                onClick={saveCustomerPo}
                                disabled={savingPo}
                                style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: savingPo ? 0.5 : 1 }}
                              >
                                {savingPo ? '…' : 'Save'}
                              </button>
                            )}
                          </div>
                        ) : canEditSpec ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              value={specInputs[key] ?? ''}
                              onChange={e => setSpecInputs(s => ({ ...s, [key]: e.target.value }))}
                              placeholder={label}
                              style={{ flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 8px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
                            />
                            {(specInputs[key] ?? '') !== (raw ?? '') && (
                              <button
                                onClick={() => saveSpecField(key)}
                                disabled={savingSpecKey === key}
                                style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: savingSpecKey === key ? 0.5 : 1 }}
                              >
                                {savingSpecKey === key ? '…' : 'Save'}
                              </button>
                            )}
                          </div>
                        ) : isLink ? (
                          <a href={raw} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 500, wordBreak: 'break-all', textDecoration: 'underline' }}>
                            {raw}
                          </a>
                        ) : (
                          <div style={{ fontSize: '13px', color: raw ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: raw ? 500 : 400 }}>
                            {val || '—'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}

            {order.customerNotes && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Customer Notes
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{order.customerNotes}</p>
              </div>
            )}
          </div>

          {/* ── Col 2: Reference Files + Design Files ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(() => {
            const refs = cads.filter(c => c.designerNotes === 'Reference image' || c.designerNotes === 'Customer reference image');
            const canUploadRef = [UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP].includes(userRole as UserRole);
            const atRefLimit = refs.length >= MAX_REFERENCE_IMAGES;
            const visibleRefs = showAllRefs ? refs : refs.slice(0, MAX_REFERENCE_IMAGES);
            const hiddenRefCount = refs.length - visibleRefs.length;
            return (
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0 }}>
                    📌 Reference Files {refs.length > 0 && `(${refs.length}/${MAX_REFERENCE_IMAGES})`}
                  </h3>
                  {canUploadRef && (atRefLimit ? (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Limit reached</span>
                  ) : (
                    <label style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--accent-dark)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '3px 10px', background: 'transparent', whiteSpace: 'nowrap' }}>
                      + Add Reference
                      <input type="file" multiple style={{ display: 'none' }}
                        onChange={async e => {
                          const files = Array.from(e.target.files || []);
                          if (!files.length || !order?.id) return;
                          const allowed = Math.max(0, MAX_REFERENCE_IMAGES - refs.length);
                          if (allowed === 0) { e.target.value = ''; return; }
                          for (const file of files.slice(0, allowed)) {
                            const fd = new FormData();
                            fd.append('file', file);
                            await fetch(`${API}/cad/reference/${order.id}`, {
                              method: 'POST',
                              credentials: 'include',
                              body: fd,
                            });
                          }
                          const cRes = await apiFetch(`${API}/cad/order/${order.id}`);
                          if (cRes.ok) setCads(await cRes.json());
                          e.target.value = '';
                        }}
                      />
                    </label>
                  ))}
                </div>

                {refs.length === 0 ? (
                  <div className="card-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[...Array(4)].map((_, i) => (
                      <div key={i} style={{ height: '110px', background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}>
                        <span style={{ fontSize: '22px' }}>🖼</span>
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                      No reference files uploaded yet
                    </div>
                  </div>
                ) : (
                  <div className="card-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {visibleRefs.map(cad => {
                      const ext = (cad.originalName.split('.').pop() || '').toLowerCase();
                      const isImg = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
                      const isVid = ['mp4','mov','avi','webm','mkv','wmv'].includes(ext);
                      const fileUrl = cad.filePath || `/uploads/cad/${cad.fileName}`;
                      const thumbUrl = cad.thumbnailPath || fileUrl;
                      const fallbackIcon = ext === '3dm' ? '🧊' : ext === 'stl' ? '🔺' : ext === 'pdf' ? '📄' : '📎';
                      return (
                        <div key={cad.id}
                          onClick={() => { setViewingRefList(refs); setViewingRef(cad); }}
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
                        >
                          {isImg ? (
                            <img src={thumbUrl} alt={cad.originalName} className="ref-thumb-img"
                              style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                              onError={e => { const img = e.target as HTMLImageElement; img.style.display = 'none'; const fb = img.nextElementSibling as HTMLElement; if (fb) fb.style.display = 'flex'; }}
                            />
                          ) : isVid ? (
                            <video src={fileUrl} className="ref-thumb-img" style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                          ) : null}
                          <div style={{ width: '100%', height: '110px', display: (isImg || isVid) ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>
                            {fallbackIcon}
                          </div>
                          <div style={{ padding: '5px 7px', borderTop: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {isImg ? '🖼' : isVid ? '🎬' : '📎'} {cad.originalName}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {hiddenRefCount > 0 && (
                  <button
                    onClick={() => setShowAllRefs(v => !v)}
                    style={{ width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '8px', fontSize: '12px', color: 'var(--accent-dark)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {showAllRefs ? '▴ Show less' : `▾ View ${hiddenRefCount} more`}
                  </button>
                )}

                {/* ── Reference Image Modal ── */}
                {viewingRef && (
                  <div
                    className="modal-bg"
                    onClick={e => { if (e.target === e.currentTarget) setViewingRef(null); }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                  >
                    <div className="cad-viewer-modal" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto', borderRadius: 'var(--radius-lg)' }}>
                      <CadInlineViewer
                        cad={viewingRef}
                        cads={viewingRefList}
                        initialIndex={viewingRefList.findIndex(c => c.id === viewingRef.id)}
                        userRole={userRole}
                        batchCount={1}
                        onClose={() => setViewingRef(null)}
                        onAction={handleCadAction}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Design Files (moved into Col 2, right after Reference Files) ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', margin: 0 }}>
              Design Files {cads.filter(c => c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image').length > 0 && `(${cads.filter(c => c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image').length})`}
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {(userRole === UserRole.CAD_DESIGNER || userRole === UserRole.ADMIN) && order.status === OrderStatus.CAD_IN_PROGRESS && (
              <button
                onClick={() => uploadFileRef.current?.click()}
                style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--accent-dark)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '4px 12px', background: 'transparent', whiteSpace: 'nowrap' }}
              >
                + Upload Files
              </button>
            )}
            <input ref={uploadFileRef} type="file" multiple style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setUploadFiles(files);
                setShowUploadModal(true);
                e.target.value = '';
              }}
            />
            </div>
          </div>

          {(() => {
            const isAuthAdmin = [UserRole.ADMIN, UserRole.AUTHORIZER].includes(userRole as UserRole);
            const designFiles = cads.filter(c => c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image');
            const filesUploaded = designFiles.length > 0;
            const alreadySent = (order as any).sentToCustomer;

            // Auth/Admin: files uploaded but not yet sent to customer — prompt to set quote
            if (isAuthAdmin && filesUploaded && !alreadySent && order.status === OrderStatus.CAD_IN_PROGRESS) {
              return (
                <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#6366F1', fontWeight: 700, marginBottom: '2px' }}>
                    {designFiles.length === 1 ? '1 design file' : `${designFiles.length} design files`} uploaded — set quote to send to customer
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Enter and save the quoted price in the sidebar — files will be sent to the customer automatically.
                  </div>
                </div>
              );
            }

            // Authorizer/Admin: customer can now review (files were sent)
            if (isAuthAdmin && filesUploaded && alreadySent && order.status === OrderStatus.CAD_IN_PROGRESS) {
              const pendingBatch = cads.filter(c => c.status === 'SENT_FOR_APPROVAL');
              if (pendingBatch.length > 0) {
                return (
                  <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 600 }}>
                      Sent to customer — awaiting their approval
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleCadAction(pendingBatch[0].id, 'approve', '')}
                        style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '7px', padding: '6px 14px', color: '#059669', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        ✓ Approve All
                      </button>
                      <button onClick={() => { setViewingCadList(pendingBatch); setViewingCad(pendingBatch[0]); }}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 14px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        Review →
                      </button>
                    </div>
                  </div>
                );
              }
            }
            return null;
          })()}
          {(() => {
            const designList = cads.filter(c => c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image');
            if (designList.length === 0) return (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)', fontSize: '13px', opacity: 0.6 }}>
                No CAD files uploaded yet for this order.
              </div>
            );
            const visibleDesignFiles = showAllDesignFiles ? designList : designList.slice(0, DESIGN_FILES_COLLAPSED_COUNT);
            const hiddenDesignFileCount = designList.length - visibleDesignFiles.length;
            return (
            <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {visibleDesignFiles.map(cad => {
                const cs = CAD_STATUS_CFG[cad.status] || { label: cad.status, color: '#6B7280', bg: '#F3F4F6' };
                const ext = (cad.originalName.split('.').pop() || '').toLowerCase();
                const isImage = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
                const isPdf = ext === 'pdf';
                return (
                  <div key={cad.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: `1px solid ${cs.color}25`, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      {isImage ? (
                        <img
                          src={cad.thumbnailPath || cad.filePath || `/uploads/cad/${cad.fileName}`}
                          alt={cad.originalName}
                          style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, border: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => { setViewingCadList(designList); setViewingCad(cad); }}
                          onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      ) : (
                        <span style={{ fontSize: '22px', flexShrink: 0 }}>{isPdf ? '📄' : ext === '3dm' ? '🧊' : ext === 'stl' ? '🔺' : ext === 'jcd' ? '💎' : ['mp4','mov','webm','avi','mkv','wmv'].includes(ext) ? '🎬' : '📎'}</span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cad.originalName}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rev #{cad.revisionNumber}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>·</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(cad.createdAt).toLocaleDateString()}</span>
                          {cad.cadPersonName && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>· CAD: {cad.cadPersonName}</span>}
                          {cad.verifiedByName && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>· Verified: {cad.verifiedByName}</span>}
                          {cad.designerNotes && <span style={{ fontSize: '10px', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {cad.designerNotes}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', background: cs.bg, color: cs.color, padding: '3px 10px', borderRadius: '99px', fontWeight: 700 }}>
                        {cs.label}
                      </span>
                      <button
                        onClick={() => { setViewingCadList(designList); setViewingCad(cad); }}
                        style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                      >
                        👁 View
                      </button>
                      {(userRole === UserRole.CAD_DESIGNER || userRole === UserRole.ADMIN) &&
                        cad.status !== 'APPROVED' && cad.status !== 'REJECTED' && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Remove "${cad.originalName}"? This cannot be undone.`)) return;
                            await apiFetch(`${API}/cad/${cad.id}`, { method: 'DELETE' });
                            const cRes = await apiFetch(`${API}/cad/order/${order.id}`);
                            if (cRes.ok) setCads(await cRes.json());
                          }}
                          title="Remove file"
                          style={{ background: 'transparent', border: 'none', padding: '4px 6px', fontSize: '14px', color: '#9CA3AF', cursor: 'pointer', lineHeight: 1, borderRadius: '4px' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#9CA3AF')}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {hiddenDesignFileCount > 0 && (
              <button
                onClick={() => setShowAllDesignFiles(v => !v)}
                style={{ width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '8px', fontSize: '12px', color: 'var(--accent-dark)', fontWeight: 600, cursor: 'pointer', marginTop: '10px' }}
              >
                {showAllDesignFiles ? '▴ Show less' : `▾ View ${hiddenDesignFileCount} more`}
              </button>
            )}
            </>
            );
          })()}
        </div>

          </div>{/* ── end Col 2 (Reference Files + Design Files) ── */}

          </div>{/* ── end fields+refs sub-grid ── */}

          {/* Conversation */}
          {order.id && currentUser && (
            <div>
              <OrderConversation
                orderId={order.id}
                currentUserRole={currentUser.role}
                currentUserId={currentUser.id}
              />
            </div>
          )}

          {/* ── Design File Preview Modal (fixed: full viewport, matches Reference Image Modal) ── */}
          {viewingCad && (
            <div
              onClick={e => { if (e.target === e.currentTarget) setViewingCad(null); }}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
                zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: '16px', overflowY: 'auto',
              }}
            >
              <div style={{ width: '100%', maxWidth: '900px', flexShrink: 0, borderRadius: 'var(--radius-lg)' }}>
                <CadInlineViewer
                  cad={viewingCad}
                  cads={viewingCadList}
                  initialIndex={viewingCadList.findIndex(c => c.id === viewingCad.id)}
                  userRole={userRole}
                  batchCount={cads.filter(c => c.status === 'SENT_FOR_APPROVAL').length}
                  onClose={() => setViewingCad(null)}
                  onAction={handleCadAction}
                />
              </div>
            </div>
          )}

        </div>{/* ── end main content column ── */}

        {/* ── Sidebar: sticky beside all content ── */}
        <div className="order-sticky-sidebar" style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Current status */}
          {(() => {
            const subLabel = order.status === OrderStatus.CAD_IN_PROGRESS ? getCadSubLabel(order as any) : null;
            return (
              <div style={{ ...cardStyle, borderTop: `3px solid ${cfg.color}` }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>Current Status</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: cfg.bg, color: cfg.color, padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>
                  {subLabel || cfg.label}
                </div>
                {subLabel && (
                  <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>CAD In Progress</div>
                )}
              </div>
            );
          })()}

          {/* Stone status — sidebar card */}
          {order.status === OrderStatus.VPO_ISSUED && (
            <div style={{ ...cardStyle, borderTop: `3px solid ${order.stoneStatus === StoneStatus.STONE_RECEIVED ? '#10B981' : '#7C3AED'}` }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>💎 Stone Status</div>
              <div style={{ marginBottom: (userRole === UserRole.STONE_MANAGER || userRole === UserRole.ADMIN) && order.stoneStatus !== StoneStatus.STONE_RECEIVED ? '12px' : '0' }}>
                {order.stoneStatus === StoneStatus.STONE_RECEIVED
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#D1FAE5', color: '#065F46', padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>Stone Received ✓</span>
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#EDE9FE', color: '#5B21B6', padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700 }}>Pending Stone</span>
                }
              </div>
              {(userRole === UserRole.STONE_MANAGER || userRole === UserRole.ADMIN) && order.stoneStatus !== StoneStatus.STONE_RECEIVED && (
                <button
                  onClick={async () => {
                    if (!order?.id) return;
                    const res = await apiFetch(`${API}/manufacturing/${order.id}/stone-sent`, { method: 'PATCH' });
                    if (res.ok) setOrder(await res.json());
                  }}
                  style={{ width: '100%', background: '#7C3AED', border: 'none', borderRadius: '8px', padding: '9px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  📦 Mark Stone Sent
                </button>
              )}
            </div>
          )}

          {/* Quoted Price — editable for Authorizer/Admin, read-only for others */}
          {userRole !== UserRole.CUSTOMER && (
            <div style={cardStyle}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Quoted Price
              </div>
              {(userRole === UserRole.AUTHORIZER || userRole === UserRole.ADMIN) ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none' }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quotedPriceInput}
                      onChange={e => setQuotedPriceInput(e.target.value)}
                      placeholder="0.00"
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px 8px 22px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    onClick={saveQuotedPrice}
                    disabled={savingPrice || !quotedPriceInput || parseFloat(quotedPriceInput) <= 0}
                    style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (savingPrice || !quotedPriceInput || parseFloat(quotedPriceInput) <= 0) ? 0.5 : 1 }}
                  >
                    {savingPrice ? '…' : 'Save'}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '20px', fontWeight: 700, color: order.quotedCost ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
                  {order.quotedCost ? `$${Number(order.quotedCost).toLocaleString()}` : 'Not set yet'}
                </div>
              )}
            </div>
          )}

          {/* Committed Ship Date — only once the order is approved (VPO issued or later) */}
          {userRole !== UserRole.CUSTOMER
            && ![OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS, OrderStatus.CANCELLED].includes(order.status!) && (
            <div style={cardStyle}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Committed Ship Date
              </div>
              {(userRole === UserRole.AUTHORIZER || userRole === UserRole.ADMIN) ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={shipDateInput}
                    onChange={e => setShipDateInput(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    onClick={saveShipDate}
                    disabled={savingShipDate || !shipDateInput}
                    style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (savingShipDate || !shipDateInput) ? 0.5 : 1 }}
                  >
                    {savingShipDate ? '…' : 'Save'}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '20px', fontWeight: 700, color: order.committedShipDate ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
                  {order.committedShipDate
                    ? new Date(order.committedShipDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not set yet'}
                </div>
              )}
            </div>
          )}

          {/* Created by */}
          {(order.salesRepName || order.salesRepEmail) && (
            <div style={cardStyle}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase' }}>Created By</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{(order as any).salesRepName || order.salesRepEmail}</div>
              {(order as any).salesRepName && order.salesRepEmail && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{order.salesRepEmail}</div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {new Date(order.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          )}

          {/* CAD Approved — prompt to add quote price */}
          {order.status === OrderStatus.CAD_IN_PROGRESS && (order as any).customerEmailApproval &&
            (userRole === UserRole.AUTHORIZER || userRole === UserRole.ADMIN) && (
            <div style={{ ...cardStyle, borderLeft: '3px solid #F59E0B' }}>
              <div style={{ fontSize: '10px', color: '#F59E0B', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>CAD Approved — Price Required</div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>Add a quote price above to issue the VPO.</p>
            </div>
          )}


          {/* Move to Stage */}
          {movableStatuses.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>Move to Stage</div>

              {/* Block Factory Manager until stone is received on VPO orders */}
              {userRole === UserRole.FACTORY_MANAGER
               && order.status === OrderStatus.VPO_ISSUED
               && order.stoneStatus !== StoneStatus.STONE_RECEIVED ? (
                <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#92400E', fontWeight: 500, lineHeight: 1.6 }}>
                  ⏳ Cannot change status until stone is received.<br/>
                  Waiting for Stone Manager to dispatch the stone.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {movableStatuses.map(s => {
                    const sc = STATUS_CONFIG[s];
                    return (
                      <button key={s} onClick={() => moveStatus(s)} disabled={updatingStatus}
                        style={{ background: sc.bg, border: `1px solid ${sc.color}40`, borderRadius: '8px', padding: '9px 14px', color: sc.color, fontSize: '12px', fontWeight: 600, cursor: updatingStatus ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: updatingStatus ? 0.6 : 1, transition: 'opacity 0.15s', letterSpacing: '0.2px' }}>
                        → {sc.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Audit Log button */}
          {events.length > 0 && (
            <button onClick={() => setShowAuditLog(true)}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 14px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}>
              📋 Audit Log <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>({events.length})</span>
            </button>
          )}


          {/* Timeline */}
          <div style={cardStyle}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>Timeline</div>
            {[{ label: 'Created', value: order.createdAt }, { label: 'Updated', value: order.updatedAt }].map(({ label, value }) => (
              <div key={label} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>{/* ── end sidebar ── */}

      </div>{/* ── end outer grid ── */}

      {/* ── Price Required Modal (VPO Issuance) ── */}
      {priceModal && (
        <div className="modal-bg" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26,39,64,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '380px', maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Set Quoted Price
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              The customer has approved the CAD design. Please add an <strong>approximate quoted price</strong> before issuing the VPO — the SKU will be generated automatically. The customer will be notified.
            </p>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
              Approximate Price ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={pendingPrice}
              onChange={e => setPendingPrice(e.target.value)}
              placeholder="e.g. 2500"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmPriceAndMove(); }}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '15px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setPriceModal(false)}
                style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button
                onClick={confirmPriceAndMove}
                disabled={!pendingPrice || parseFloat(pendingPrice) <= 0}
                style={{ flex: 2, background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', opacity: (!pendingPrice || parseFloat(pendingPrice) <= 0) ? 0.5 : 1 }}>
                Confirm & Issue VPO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repair Contractor Modal */}
      {repairModal && (
        <div className="modal-bg" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26,39,64,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '400px', maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Send for Repair
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              Enter the <strong>contractor name</strong> who will handle this repair. This is required for tracking.
            </p>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
              Repair Contractor Name *
            </label>
            <input
              type="text"
              value={repairContractorInput}
              onChange={e => setRepairContractorInput(e.target.value)}
              placeholder="e.g. Diamond Setters NY"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmRepair(); }}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRepairModal(false)}
                style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button
                onClick={confirmRepair}
                disabled={!repairContractorInput.trim()}
                style={{ flex: 2, background: '#EF4444', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', opacity: !repairContractorInput.trim() ? 0.5 : 1 }}>
                🔧 Confirm — Send for Repair
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-bg" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26,39,64,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '420px', maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: '#dc2626', marginBottom: '8px' }}>
              ⚠ Delete Order Permanently
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
              This will permanently delete order <strong>{order.poNumber}</strong> and everything attached to it —
              CAD/reference files, SKU, notifications, messages, and the audit log. <strong>This cannot be undone.</strong>
            </p>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
              Type <strong>{order.poNumber}</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              placeholder={order.poNumber}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleDeleteOrder(); }}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDeleteModal(false)} disabled={deleting}
                style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button
                onClick={handleDeleteOrder}
                disabled={deleteConfirmInput !== order.poNumber || deleting}
                style={{ flex: 2, background: '#dc2626', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', opacity: (deleteConfirmInput !== order.poNumber || deleting) ? 0.5 : 1 }}>
                {deleting ? 'Deleting…' : '🗑 Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="modal-bg" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26,39,64,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '420px', maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Upload CAD Files
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
              {uploadFiles.length} file{uploadFiles.length === 1 ? '' : 's'} selected. Both fields are required before uploading.
            </p>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
              CAD Person Name *
            </label>
            <input
              type="text"
              value={uploadCadPerson}
              onChange={e => setUploadCadPerson(e.target.value)}
              placeholder="Who modeled this file"
              autoFocus
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: '14px' }}
            />
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
              Verified By Name *
            </label>
            <input
              type="text"
              value={uploadVerifiedBy}
              onChange={e => setUploadVerifiedBy(e.target.value)}
              placeholder="Who verified it before upload"
              onKeyDown={e => { if (e.key === 'Enter') handleUploadFiles(); }}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowUploadModal(false); setUploadFiles([]); setUploadCadPerson(''); setUploadVerifiedBy(''); }} disabled={uploadingFiles}
                style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button
                onClick={handleUploadFiles}
                disabled={!uploadCadPerson.trim() || !uploadVerifiedBy.trim() || uploadingFiles}
                style={{ flex: 2, background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', opacity: (!uploadCadPerson.trim() || !uploadVerifiedBy.trim() || uploadingFiles) ? 0.5 : 1 }}>
                {uploadingFiles ? 'Uploading…' : '↑ Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>

      {/* Audit Log Modal — portal to body so it's always centered on viewport */}
      {showAuditLog && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,39,64,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowAuditLog(false)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', width: '520px', maxWidth: '94vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Audit Log</h3>
              <button onClick={() => setShowAuditLog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}>✕</button>
            </div>
            {events.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>No events recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {events.map(ev => (
                  <div key={ev.id} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '12px', paddingBottom: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ev.action.replace(/_/g, ' ')}
                      {ev.fromStatus && ev.toStatus && ` · ${ev.fromStatus} → ${ev.toStatus}`}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {ev.userEmail} · {new Date(ev.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
