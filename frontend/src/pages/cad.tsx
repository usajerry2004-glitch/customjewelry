import React, { useEffect, useState, useRef } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { toast } from '../utils/toast';

interface Order { id: string; poNumber: string; storeName?: string; customerFullName?: string; status?: string; cadSubStatus?: string | null; }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.8px', textTransform: 'uppercase' };
const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' };

export default function CADPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [cadPersonName, setCadPersonName] = useState('');
  const [verifiedByName, setVerifiedByName] = useState('');
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
    if (!files || files.length === 0 || !selectedOrderId || !cadPersonName.trim() || !verifiedByName.trim()) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('files', f));
      if (notes) fd.append('designerNotes', notes);
      fd.append('cadPersonName', cadPersonName.trim());
      fd.append('verifiedByName', verifiedByName.trim());
      const res = await apiFetch(`${API}/cad/upload/${selectedOrderId}`, { method: 'POST', body: fd });
      if (res.ok) {
        toast.success('CAD file uploaded.');
        setNotes('');
        setCadPersonName('');
        setVerifiedByName('');
        setSelectedOrderId('');
        setSelectedFileCount(0);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || `Upload failed (${res.status}). Please try again.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
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
              {selectedOrderId && (
                <a
                  href={`/orders/${selectedOrderId}/cad-brief`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '6px', fontSize: '11px', color: 'var(--accent-dark)', fontWeight: 600, textDecoration: 'none' }}
                >
                  🖨 View CAD Brief (specs, refs, notes)
                </a>
              )}
            </div>
            <div>
              <label style={lbl}>Files * {selectedFileCount > 1 && <span style={{ color: 'var(--accent-dark)', fontWeight: 700 }}>({selectedFileCount} selected)</span>}</label>
              <input
                ref={fileRef}
                type="file"
                multiple
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
              disabled={uploading || !selectedOrderId || !cadPersonName.trim() || !verifiedByName.trim()}
              style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (uploading || !selectedOrderId || !cadPersonName.trim() || !verifiedByName.trim()) ? 0.6 : 1 }}
            >
              {uploading ? 'Uploading…' : '↑ Upload'}
            </button>
          </div>
          <div className="cad-upload-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end', marginTop: '12px' }}>
            <div>
              <label style={lbl}>CAD Person Name *</label>
              <input value={cadPersonName} onChange={e => setCadPersonName(e.target.value)} placeholder="Who modeled this file" style={inp} />
            </div>
            <div>
              <label style={lbl}>Verified By Name *</label>
              <input value={verifiedByName} onChange={e => setVerifiedByName(e.target.value)} placeholder="Who verified it before upload" style={inp} />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
