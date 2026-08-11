import React, { useEffect, useState, useRef } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { apiFetch, API } from '../utils/apiFetch';
import { toast } from '../utils/toast';
import { CAD_PERSON_OPTIONS, CAD_PERSON_OTHER } from '../utils/cadPersons';

interface Order { id: string; poNumber: string; storeName?: string; customerFullName?: string; status?: string; cadSubStatus?: string | null; }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.8px', textTransform: 'uppercase' };
const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' };

export default function CADPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [cadPersonSelect, setCadPersonSelect] = useState('');
  const [cadPersonOther, setCadPersonOther] = useState('');
  const cadPersonName = cadPersonSelect === CAD_PERSON_OTHER ? cadPersonOther.trim() : cadPersonSelect;
  const [verifiedByName, setVerifiedByName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const [isCadDesigner, setIsCadDesigner] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Bulk upload (multiple files → multiple orders in one batch) ──────────
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState<{ file: File; orderId: string }[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);

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
        setCadPersonSelect('');
        setCadPersonOther('');
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

  const eligibleOrders = orders.filter(o => !o.cadSubStatus || o.cadSubStatus === 'REVISION');

  // Best-effort match so designers usually don't have to hand-pick every file —
  // still fully overridable per row before uploading.
  const guessOrderForFile = (filename: string): string => {
    const upper = filename.toUpperCase();
    return eligibleOrders.find(o => upper.includes(o.poNumber.toUpperCase()))?.id || '';
  };

  const handleBulkFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBulkItems(Array.from(fileList).map(file => ({ file, orderId: guessOrderForFile(file.name) })));
  };

  const updateBulkItemOrder = (index: number, orderId: string) => {
    setBulkItems(prev => prev.map((it, i) => (i === index ? { ...it, orderId } : it)));
  };

  const removeBulkItem = (index: number) => {
    setBulkItems(prev => prev.filter((_, i) => i !== index));
  };

  const bulkOrderCount = new Set(bulkItems.map(it => it.orderId).filter(Boolean)).size;

  const bulkUpload = async () => {
    if (bulkItems.length === 0 || !cadPersonName.trim() || !verifiedByName.trim()) return;
    const unassigned = bulkItems.filter(it => !it.orderId).length;
    if (unassigned > 0) {
      toast.error(`${unassigned} file${unassigned > 1 ? 's' : ''} still need${unassigned > 1 ? '' : 's'} an order selected.`);
      return;
    }
    setBulkUploading(true);
    try {
      const byOrder = new Map<string, File[]>();
      bulkItems.forEach(({ file, orderId }) => {
        if (!byOrder.has(orderId)) byOrder.set(orderId, []);
        byOrder.get(orderId)!.push(file);
      });
      const results = await Promise.allSettled(
        Array.from(byOrder.entries()).map(([orderId, files]) => {
          const fd = new FormData();
          files.forEach(f => fd.append('files', f));
          if (notes) fd.append('designerNotes', notes);
          fd.append('cadPersonName', cadPersonName.trim());
          fd.append('verifiedByName', verifiedByName.trim());
          return apiFetch(`${API}/cad/upload/${orderId}`, { method: 'POST', body: fd }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          });
        }),
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      if (succeeded > 0) {
        setBulkItems([]);
        setNotes('');
        setCadPersonSelect('');
        setCadPersonOther('');
        setVerifiedByName('');
        if (bulkFileRef.current) bulkFileRef.current.value = '';
      }
      if (failed === 0) {
        toast.success(`Uploaded to ${succeeded} order${succeeded > 1 ? 's' : ''}.`);
      } else if (succeeded === 0) {
        toast.error(`Upload failed for all ${failed} order${failed > 1 ? 's' : ''}. Please try again.`);
      } else {
        toast.warning(`Uploaded to ${succeeded} order${succeeded > 1 ? 's' : ''}. ${failed} failed.`);
      }
    } catch {
      toast.error('Cannot connect to server. Please check your connection.');
    } finally { setBulkUploading(false); }
  };

  return (
    <AppLayout title="CAD Files" subtitle="Upload designs, send for approval, track revisions">
      {isCadDesigner && (
        <div style={{ ...card, marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Upload New CAD File
            </h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setBulkMode(false)}
                style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: `1px solid ${!bulkMode ? 'var(--navy)' : 'var(--border)'}`, background: !bulkMode ? 'var(--navy)' : 'var(--bg-input)', color: !bulkMode ? '#fff' : 'var(--text-secondary)' }}
              >
                Single Order
              </button>
              <button
                onClick={() => setBulkMode(true)}
                style={{ padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: `1px solid ${bulkMode ? 'var(--navy)' : 'var(--border)'}`, background: bulkMode ? 'var(--navy)' : 'var(--bg-input)', color: bulkMode ? '#fff' : 'var(--text-secondary)' }}
              >
                Bulk Upload
              </button>
            </div>
          </div>

          {!bulkMode && (
            <div className="cad-upload-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={lbl}>Order *</label>
                <select value={selectedOrderId} onChange={e => setSelectedOrderId(e.target.value)} style={inp}>
                  <option value="">Select order…</option>
                  {eligibleOrders.map(o => (
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
          )}

          {bulkMode && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end', marginBottom: '14px' }}>
                <div>
                  <label style={lbl}>Files * {bulkItems.length > 0 && <span style={{ color: 'var(--accent-dark)', fontWeight: 700 }}>({bulkItems.length} selected, {bulkOrderCount} order{bulkOrderCount === 1 ? '' : 's'})</span>}</label>
                  <input
                    ref={bulkFileRef}
                    type="file"
                    multiple
                    style={inp}
                    onChange={e => handleBulkFilesSelected(e.target.files)}
                  />
                </div>
                <div>
                  <label style={lbl}>Designer Notes (applied to all)</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for this revision…" style={inp} />
                </div>
              </div>

              {bulkItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {bulkItems.map((item, i) => (
                    <div key={`${item.file.name}-${item.file.size}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.file.name}>
                        {item.file.name}
                      </span>
                      <select
                        value={item.orderId}
                        onChange={e => updateBulkItemOrder(i, e.target.value)}
                        style={{ ...inp, padding: '6px 10px', borderColor: item.orderId ? 'var(--border)' : '#EF4444' }}
                      >
                        <option value="">Select order…</option>
                        {eligibleOrders.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.poNumber}{o.cadSubStatus === 'REVISION' ? ' ↺ Revision' : ''} — {o.storeName || o.customerFullName || 'Unknown'}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeBulkItem(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={bulkUpload}
                disabled={bulkUploading || bulkItems.length === 0 || !cadPersonName.trim() || !verifiedByName.trim()}
                style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: (bulkUploading || bulkItems.length === 0 || !cadPersonName.trim() || !verifiedByName.trim()) ? 0.6 : 1 }}
              >
                {bulkUploading ? 'Uploading…' : `↑ Upload to ${bulkOrderCount || 0} Order${bulkOrderCount === 1 ? '' : 's'}`}
              </button>
            </div>
          )}

          <div className="cad-upload-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'end', marginTop: '12px' }}>
            <div>
              <label style={lbl}>CAD Person Name *</label>
              <select value={cadPersonSelect} onChange={e => setCadPersonSelect(e.target.value)} style={inp}>
                <option value="">Select…</option>
                {CAD_PERSON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {cadPersonSelect === CAD_PERSON_OTHER && (
                <input
                  value={cadPersonOther}
                  onChange={e => setCadPersonOther(e.target.value)}
                  placeholder="Enter their name"
                  style={{ ...inp, marginTop: '8px' }}
                />
              )}
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
