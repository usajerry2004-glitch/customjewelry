import React, { useEffect, useState, useRef } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';

interface Order { id: string; poNumber: string; storeName?: string; customerFullName?: string; status?: string; cadSubStatus?: string | null; }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.8px', textTransform: 'uppercase' };
const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' };

export default function CADPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFileCount, setSelectedFileCount] = useState(0);
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

  useEffect(() => {
    apiFetch(`${API}/orders?limit=200`).then(async res => {
      if (res.ok) { const d = await res.json(); setOrders(d.orders || []); }
    });
  }, []);

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
      }
    } finally { setUploading(false); }
  };

  return (
    <AppLayout title="CAD Files" subtitle="Upload designs, send for approval, track revisions">
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
                  .filter(o => !o.cadSubStatus || o.cadSubStatus === 'REVISION')
                  .map(o => (
                    <option key={o.id} value={o.id}>
                      {o.poNumber}{o.cadSubStatus === 'REVISION' ? ' ↺ Revision' : ''} — {o.storeName || o.customerFullName || 'Unknown'}
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
    </AppLayout>
  );
}
