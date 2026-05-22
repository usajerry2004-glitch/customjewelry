import React, { useEffect, useState, useRef } from 'react';
import { AppLayout } from '../components/layout/AppLayout';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const STATUS_COLORS: Record<string, { color: string; label: string }> = {
  UPLOADED:            { color: '#6366F1', label: 'Uploaded' },
  SENT_FOR_APPROVAL:   { color: '#F59E0B', label: 'Sent for Approval' },
  APPROVED:            { color: '#10B981', label: 'Approved' },
  REJECTED:            { color: '#EF4444', label: 'Rejected' },
  REVISION_REQUESTED:  { color: '#8B5CF6', label: 'Revision Requested' },
};

interface CadFile {
  id: string;
  orderId: string;
  originalName: string;
  fileName: string;
  status: string;
  revisionNumber: number;
  designerNotes?: string;
  customerFeedback?: string;
  uploadedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

interface Order { id: string; poNumber: string; storeName?: string; customerFullName?: string; }

export default function CADPage() {
  const [files, setFiles] = useState<CadFile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fRes, oRes] = await Promise.all([
        fetch(`${API}/cad`),
        fetch(`${API}/orders?limit=100`),
      ]);
      if (fRes.ok) setFiles(await fRes.json());
      if (oRes.ok) { const d = await oRes.json(); setOrders(d.orders || []); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedOrderId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (notes) fd.append('designerNotes', notes);
      const res = await fetch(`${API}/cad/upload/${selectedOrderId}`, { method: 'POST', body: fd });
      if (res.ok) { setNotes(''); setSelectedOrderId(''); if (fileRef.current) fileRef.current.value = ''; await loadAll(); }
    } finally { setUploading(false); }
  };

  const action = async (id: string, endpoint: string, body?: object) => {
    setActionLoading(id + endpoint);
    try {
      await fetch(`${API}/cad/${id}/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      await loadAll();
    } finally { setActionLoading(null); }
  };

  return (
    <AppLayout title="CAD Files" subtitle="Upload designs, send for approval, track revisions">
      {/* Upload Panel */}
      <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#CBD5E1', marginBottom: '16px' }}>Upload New CAD File</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px' }}>ORDER *</label>
            <select
              value={selectedOrderId}
              onChange={e => setSelectedOrderId(e.target.value)}
              style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '9px 12px', color: selectedOrderId ? '#E2E8F0' : '#4B5563', fontSize: '13px', outline: 'none' }}
            >
              <option value="">Select order…</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>{o.poNumber} — {o.storeName || o.customerFullName || 'Unknown'}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px' }}>FILE *</label>
            <input
              ref={fileRef}
              type="file"
              accept=".stl,.obj,.3dm,.pdf,.jpg,.png,.zip"
              style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '8px 12px', color: '#E2E8F0', fontSize: '12px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '5px' }}>DESIGNER NOTES</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes for this revision…"
              style={{ width: '100%', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '9px 12px', color: '#E2E8F0', fontSize: '13px', outline: 'none' }}
            />
          </div>
          <button
            onClick={upload}
            disabled={uploading || !selectedOrderId}
            style={{ background: 'linear-gradient(135deg, #F6D860, #E6A817)', color: '#000', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: uploading || !selectedOrderId ? 0.6 : 1 }}
          >
            {uploading ? 'Uploading…' : '↑ Upload'}
          </button>
        </div>
      </div>

      {/* File list */}
      {loading ? (
        <div style={{ color: '#4B5563', textAlign: 'center', padding: '40px 0' }}>Loading CAD files…</div>
      ) : files.length === 0 ? (
        <div style={{ color: '#4B5563', textAlign: 'center', padding: '60px 0' }}>No CAD files yet. Upload one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {files.map(f => {
            const sc = STATUS_COLORS[f.status] || { color: '#64748B', label: f.status };
            const order = orders.find(o => o.id === f.orderId);
            return (
              <div key={f.id} style={{ background: '#111118', border: `1px solid ${sc.color}25`, borderRadius: '12px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#E2E8F0' }}>📎 {f.originalName}</span>
                      <span style={{ fontSize: '10px', background: `${sc.color}20`, color: sc.color, padding: '2px 8px', borderRadius: '99px', fontWeight: 600 }}>{sc.label}</span>
                      <span style={{ fontSize: '10px', color: '#4B5563' }}>Rev #{f.revisionNumber}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      Order: <span style={{ color: '#F6D860' }}>{order?.poNumber || f.orderId.slice(0, 8)}</span>
                      {order && <span style={{ marginLeft: '6px' }}>— {order.storeName || order.customerFullName}</span>}
                      {f.uploadedBy && <span style={{ marginLeft: '12px' }}>By: {f.uploadedBy}</span>}
                      <span style={{ marginLeft: '12px' }}>{new Date(f.createdAt).toLocaleDateString()}</span>
                    </div>
                    {f.designerNotes && <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Notes: {f.designerNotes}</div>}
                    {f.customerFeedback && <div style={{ fontSize: '12px', color: '#F59E0B', marginTop: '4px' }}>Feedback: {f.customerFeedback}</div>}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {f.status === 'UPLOADED' && (
                    <button onClick={() => action(f.id, 'send')} disabled={actionLoading === f.id + 'send'} style={btnStyle('#F59E0B')}>
                      📨 Send for Approval
                    </button>
                  )}
                  {(f.status === 'SENT_FOR_APPROVAL') && (
                    <>
                      <button onClick={() => action(f.id, 'approve')} disabled={!!actionLoading} style={btnStyle('#10B981')}>
                        ✅ Approve
                      </button>
                      <button onClick={() => action(f.id, 'reject', { feedback: feedback[f.id] || 'Rejected' })} disabled={!!actionLoading} style={btnStyle('#EF4444')}>
                        ❌ Reject
                      </button>
                      <button onClick={() => action(f.id, 'revision', { feedback: feedback[f.id] || 'Please revise' })} disabled={!!actionLoading} style={btnStyle('#8B5CF6')}>
                        🔄 Request Revision
                      </button>
                      <input
                        placeholder="Add feedback…"
                        value={feedback[f.id] || ''}
                        onChange={e => setFeedback(p => ({ ...p, [f.id]: e.target.value }))}
                        style={{ flex: 1, minWidth: '200px', background: '#0F0F14', border: '1px solid #2D2D3D', borderRadius: '7px', padding: '6px 10px', color: '#E2E8F0', fontSize: '12px', outline: 'none' }}
                      />
                    </>
                  )}
                  {f.status === 'APPROVED' && (
                    <span style={{ fontSize: '12px', color: '#10B981' }}>✅ Approved{f.approvedBy ? ` by ${f.approvedBy}` : ''}{f.approvedAt ? ` on ${new Date(f.approvedAt).toLocaleDateString()}` : ''}</span>
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

const btnStyle = (color: string): React.CSSProperties => ({
  background: `${color}15`,
  border: `1px solid ${color}40`,
  borderRadius: '7px',
  padding: '6px 14px',
  color,
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
});
