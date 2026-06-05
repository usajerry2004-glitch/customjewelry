import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';

const STATUS_COLORS: Record<string, { color: string; label: string }> = {
  UPLOADED:            { color: '#6366F1', label: 'Uploaded' },
  SENT_FOR_APPROVAL:   { color: '#D97706', label: 'Sent for Approval' },
  APPROVED:            { color: '#059669', label: 'Approved' },
  REJECTED:            { color: '#DC2626', label: 'Rejected' },
  REVISION_REQUESTED:  { color: '#7C3AED', label: 'Revision Requested' },
};

interface CadFile {
  id: string; orderId: string; originalName: string; fileName: string;
  status: string; revisionNumber: number; designerNotes?: string;
  customerFeedback?: string; uploadedBy?: string; approvedBy?: string;
  approvedAt?: string; createdAt: string;
}
interface Order { id: string; poNumber: string; storeName?: string; customerFullName?: string; status?: string; }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.8px', textTransform: 'uppercase' };
const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' };

export default function CADPage() {
  const router = useRouter();
  const [files, setFiles] = useState<CadFile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isCadDesigner, setIsCadDesigner] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const u = localStorage.getItem('jf_user');
      if (u) {
        const role = JSON.parse(u).role;
        setIsCadDesigner(role === 'CAD_DESIGNER' || role === 'ADMIN');
      }
    } catch {}
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fRes, oRes] = await Promise.all([apiFetch(`${API}/cad`), apiFetch(`${API}/orders?limit=200`)]);
      if (fRes.ok) setFiles(await fRes.json());
      if (oRes.ok) { const d = await oRes.json(); setOrders(d.orders || []); }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const upload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0 || !selectedOrderId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('files', f));
      if (notes) fd.append('designerNotes', notes);
      const res = await apiFetch(`${API}/cad/upload/${selectedOrderId}`, { method: 'POST', body: fd });
      if (res.ok) {
        setNotes('');
        setSelectedOrderId('');
        setSelectedFileCount(0);
        if (fileRef.current) fileRef.current.value = '';
        await loadAll();
      }
    } finally { setUploading(false); }
  };

  const action = async (id: string, endpoint: string, body?: object) => {
    setActionLoading(id + endpoint);
    try {
      await apiFetch(`${API}/cad/${id}/${endpoint}`, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
      await loadAll();
    } finally { setActionLoading(null); }
  };

  return (
    <AppLayout title="CAD Files" subtitle="Upload designs, send for approval, track revisions">
      {/* Upload Panel — CAD Designer / Admin only */}
      {isCadDesigner && (
        <div style={{ ...card, marginBottom: '24px' }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '18px' }}>
            Upload New CAD File
          </h3>
          <div className="cad-upload-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={lbl}>Order *</label>
              <select value={selectedOrderId} onChange={e => setSelectedOrderId(e.target.value)} style={inp}>
                <option value="">Select order…</option>
                {orders
                  .filter(o => o.status === 'PENDING_CAD' || o.status === 'ORDER_REVISION')
                  .map(o => (
                    <option key={o.id} value={o.id}>
                      {o.poNumber}{o.status === 'ORDER_REVISION' ? ' ↺ Revision' : ''} — {o.storeName || o.customerFullName || 'Unknown'}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Files * {selectedFileCount > 1 && <span style={{ color: 'var(--accent-dark)', fontWeight: 700 }}>({selectedFileCount} selected)</span>}</label>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".stl,.obj,.3dm,.pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.webm,.mkv,.wmv,.zip"
                style={inp}
                onChange={e => setSelectedFileCount(e.target.files?.length ?? 0)}
              />
            </div>
            <div>
              <label style={lbl}>Designer Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for this revision…" style={inp} />
            </div>
            <button
              onClick={upload}
              disabled={uploading || !selectedOrderId}
              style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: uploading || !selectedOrderId ? 0.6 : 1 }}
            >
              {uploading ? 'Uploading…' : '↑ Upload'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading CAD files…</div>
      ) : files.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>No CAD files yet. Upload one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {files.map(f => {
            const sc = STATUS_COLORS[f.status] || { color: '#6B7280', label: f.status };
            const order = orders.find(o => o.id === f.orderId);
            return (
              <div key={f.id} style={{ ...card, borderLeft: `3px solid ${sc.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>📎 {f.originalName}</span>
                      <span style={{ fontSize: '10px', background: `${sc.color}15`, color: sc.color, padding: '2px 8px', borderRadius: '99px', fontWeight: 600 }}>{sc.label}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 7px', borderRadius: '5px' }}>Rev #{f.revisionNumber}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Order:{' '}
                      <span
                        onClick={() => router.push(`/orders/${f.orderId}`)}
                        style={{ color: 'var(--accent-dark)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                        title="Open order details"
                      >
                        {order?.poNumber || f.orderId.slice(0, 8)}
                      </span>
                      {order && (
                        <span
                          onClick={() => router.push(`/orders/${f.orderId}`)}
                          style={{ marginLeft: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                          — {order.storeName || order.customerFullName}
                        </span>
                      )}
                      {f.uploadedBy && <span style={{ marginLeft: '12px' }}>By: {f.uploadedBy}</span>}
                      <span style={{ marginLeft: '12px' }}>{new Date(f.createdAt).toLocaleDateString()}</span>
                    </div>
                    {f.designerNotes && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Notes: {f.designerNotes}</div>}
                    {f.customerFeedback && <div style={{ fontSize: '12px', color: '#D97706', marginTop: '4px' }}>Feedback: {f.customerFeedback}</div>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {f.status === 'UPLOADED' && (
                    <button onClick={() => action(f.id, 'send')} disabled={actionLoading === f.id + 'send'} style={actionBtn('#D97706')}>
                      Send for Approval
                    </button>
                  )}
                  {f.status === 'SENT_FOR_APPROVAL' && (
                    <>
                      <button onClick={() => action(f.id, 'approve')} disabled={!!actionLoading} style={actionBtn('#059669')}>Approve</button>
                      <button onClick={() => action(f.id, 'reject', { feedback: feedback[f.id] || 'Rejected' })} disabled={!!actionLoading} style={actionBtn('#DC2626')}>Reject</button>
                      <button onClick={() => action(f.id, 'revision', { feedback: feedback[f.id] || 'Please revise' })} disabled={!!actionLoading} style={actionBtn('#7C3AED')}>Request Revision</button>
                      <input
                        placeholder="Add feedback…"
                        value={feedback[f.id] || ''}
                        onChange={e => setFeedback(p => ({ ...p, [f.id]: e.target.value }))}
                        style={{ flex: 1, minWidth: '200px', ...inp }}
                      />
                    </>
                  )}
                  {f.status === 'APPROVED' && (
                    <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                      ✓ Approved{f.approvedBy ? ` by ${f.approvedBy}` : ''}{f.approvedAt ? ` · ${new Date(f.approvedAt).toLocaleDateString()}` : ''}
                    </span>
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

const actionBtn = (color: string): React.CSSProperties => ({
  background: `${color}12`, border: `1px solid ${color}35`, borderRadius: '7px',
  padding: '6px 14px', color, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
});
