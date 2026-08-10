import React, { useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { API, getErrorMessage } from '../utils/apiFetch';
import { formatCurrency } from '../utils/format';

interface PreviewRow {
  poNumber: string; storeName: string; customerFullName: string;
  orderType: string; metalType: string; metalColor: string;
  status: string; quotedCost: number | null;
}
interface ImportResult { imported: number; skipped: number; errors: string[] }

const REQUIRED_COLS = ['PO #', 'Store Name / Customer Name', 'Order Type', 'Metal Type', 'Metal Color'];

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imagesZip, setImagesZip] = useState<File | null>(null);
  const [customerFullName, setCustomerFullName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [storeName, setStoreName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      setError('Only CSV, XLSX, and XLS files are supported.');
      return;
    }
    setFile(f);
    setError('');
  };

  const handleImagesZip = (f: File) => {
    if (f.name.split('.').pop()?.toLowerCase() !== 'zip') {
      setError('Reference photos must be a single .zip file.');
      return;
    }
    setImagesZip(f);
    setError('');
  };

  const buildFormData = (extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.append('file', file as File);
    if (imagesZip) fd.append('images', imagesZip);
    if (customerFullName.trim()) fd.append('customerFullName', customerFullName.trim());
    if (customerEmail.trim()) fd.append('customerEmail', customerEmail.trim());
    if (storeName.trim()) fd.append('storeName', storeName.trim());
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    return fd;
  };

  const doPreview = async () => {
    if (!file) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/import/upload?preview=true`, {
        method: 'POST',
        credentials: 'include',
        body: buildFormData(),
      });
      const data = await res.json();
      if (!res.ok) { setError(getErrorMessage(data, 'Preview failed')); return; }
      setPreview(data.preview || []);
      setStep('preview');
    } catch { setError('Cannot connect to server.'); }
    finally { setLoading(false); }
  };

  const doImport = async () => {
    if (!file) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/import/upload`, {
        method: 'POST',
        credentials: 'include',
        body: buildFormData(),
      });
      const data = await res.json();
      if (!res.ok) { setError(getErrorMessage(data, 'Import failed')); return; }
      setResult({ imported: data.imported, skipped: data.skipped, errors: data.errors || [] });
      setStep('result');
    } catch { setError('Cannot connect to server.'); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setFile(null); setImagesZip(null); setCustomerFullName(''); setCustomerEmail(''); setStoreName('');
    setPreview([]); setResult(null); setStep('upload'); setError('');
  };

  const downloadTemplate = async () => {
    const res = await fetch(`${API}/import/template`, { credentials: 'include' });
    const data = await res.json();
    const csv = [data.headers.join(','), Object.values(data.example).join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = data.filename;
    a.click();
  };

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', boxShadow: 'var(--shadow-sm)' };

  return (
    <AppLayout title="Import Orders" subtitle="Bulk import from CSV or Excel">
      <div style={{ maxWidth: '860px' }}>

        {/* Progress steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '28px' }}>
          {(['upload', 'preview', 'result'] as const).map((s, i) => {
            const labels = ['Upload File', 'Preview Data', 'Done'];
            const active = s === step;
            const done   = ['upload','preview','result'].indexOf(s) < ['upload','preview','result'].indexOf(step);
            return (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, background: done ? '#10B981' : active ? 'var(--navy)' : 'var(--border)', color: done || active ? '#fff' : 'var(--text-muted)' }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: active ? 700 : 500, color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{labels[i]}</span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: '2px', background: done ? '#10B981' : 'var(--border)', margin: '0 12px' }} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── STEP 1: UPLOAD ── */}
        {step === 'upload' && (
          <div style={card}>
            <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Upload Your File</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>Drag and drop a CSV or Excel file, or click to browse. The file must have a <strong>PO #</strong> column.</p>

            {/* Drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{ border: `2px dashed ${file ? '#10B981' : dragging ? 'var(--navy)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(16,185,129,0.04)' : dragging ? 'rgba(26,39,64,0.03)' : 'var(--bg-input)', transition: 'all 0.15s' }}
            >
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {file ? (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#10B981' }}>{file.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{(file.size / 1024).toFixed(0)} KB · Click to change</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '40px', marginBottom: '10px', opacity: 0.3 }}>📂</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Drop your CSV or Excel file here</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>or click to browse — .csv, .xlsx, .xls supported</div>
                </>
              )}
            </div>

            {/* Required columns */}
            <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Required column: <span style={{ color: '#EF4444' }}>PO #</span> — all others optional</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['PO #', 'Store Name', 'Customer Full Name', 'Type', 'Metal Type', 'Metal Color', 'Natural or Lab', 'Dia Quality', 'Center Stone Shape', 'Status', 'Kira Quoted Cost'].map(col => (
                  <span key={col} style={{ fontSize: '11px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '5px', padding: '2px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{col}</span>
                ))}
              </div>
            </div>

            {/* Design-spec import extras: customer identity (this CSV format has none of
                its own) + an optional ZIP of reference photos, applied to every row */}
            <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
                Optional — applies to every row in this file
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                <input value={customerFullName} onChange={e => setCustomerFullName(e.target.value)} placeholder="Customer Full Name"
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }} />
                <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Customer Email"
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }} />
                <input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Store Name"
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Only used for rows that don't already have their own Customer Full Name / Email / Store Name column.
              </div>

              <input ref={imagesRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleImagesZip(e.target.files[0])} />
              <button onClick={() => imagesRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: imagesZip ? 'rgba(16,185,129,0.06)' : 'var(--bg-card)', border: `1px solid ${imagesZip ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`, borderRadius: '8px', padding: '9px 14px', color: imagesZip ? '#059669' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                {imagesZip ? `✅ ${imagesZip.name} (${(imagesZip.size / 1024 / 1024).toFixed(1)} MB)` : '📷 Attach reference photos (.zip) — matched by "Reference Image Filename"'}
              </button>
            </div>

            {error && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger)', fontSize: '13px', marginTop: '14px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button onClick={downloadTemplate} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 18px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                ↓ Download Template CSV
              </button>
              <button onClick={doPreview} disabled={!file || loading} style={{ background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '9px 24px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: !file || loading ? 'not-allowed' : 'pointer', opacity: !file || loading ? 0.6 : 1 }}>
                {loading ? 'Loading…' : 'Preview Import →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: PREVIEW ── */}
        {step === 'preview' && (
          <div style={card}>
            <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, marginBottom: '6px' }}>Preview — First {preview.length} Rows</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>Review the data below. If it looks correct, click <strong>Import All Rows</strong> to proceed.</p>

            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-input)', borderBottom: '2px solid var(--border)' }}>
                    {['PO #', 'Store / Customer', 'Type', 'Metal', 'Status', 'Quoted Cost'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-input)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{row.poNumber || <span style={{ color: '#EF4444' }}>⚠ Missing</span>}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{row.storeName || row.customerFullName || '—'}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{row.orderType || '—'}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{[row.metalType, row.metalColor].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ padding: '9px 12px' }}><span style={{ fontSize: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', padding: '2px 7px' }}>{row.status || 'Waiting Confirmation'}</span></td>
                      <td style={{ padding: '9px 12px', color: row.quotedCost ? 'var(--accent-dark)' : 'var(--text-muted)', fontWeight: row.quotedCost ? 600 : 400 }}>{row.quotedCost ? formatCurrency(row.quotedCost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '8px', fontSize: '12px', color: '#0369a1' }}>
              ℹ️ Showing first {preview.length} rows. The full file will be processed on import. Rows with duplicate PO numbers will be skipped automatically.
            </div>

            {error && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '8px', padding: '10px 14px', color: 'var(--danger)', fontSize: '13px', marginTop: '14px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button onClick={reset} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 18px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>← Choose different file</button>
              <button onClick={doImport} disabled={loading} style={{ background: '#10B981', border: 'none', borderRadius: '8px', padding: '9px 24px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Importing…' : '✓ Import All Rows'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: RESULT ── */}
        {step === 'result' && result && (
          <div style={card}>
            <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>Import Complete</h3>

            <div className="import-result-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#10B981', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{result.imported}</div>
                <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600, marginTop: '4px' }}>Orders Imported</div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#F59E0B', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{result.skipped}</div>
                <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 600, marginTop: '4px' }}>Skipped (duplicates)</div>
              </div>
              <div style={{ background: result.errors.length > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.05)', border: `1px solid ${result.errors.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.2)'}`, borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: result.errors.length > 0 ? '#EF4444' : '#10B981', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{result.errors.length}</div>
                <div style={{ fontSize: '12px', color: result.errors.length > 0 ? '#DC2626' : '#059669', fontWeight: 600, marginTop: '4px' }}>Errors</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', marginBottom: '8px' }}>Errors ({result.errors.length})</div>
                {result.errors.slice(0, 10).map((err, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#7F1D1D', padding: '3px 0', borderBottom: '1px solid rgba(239,68,68,0.1)', fontFamily: 'monospace' }}>{err}</div>
                ))}
                {result.errors.length > 10 && <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>+ {result.errors.length - 10} more errors…</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={reset} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 18px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>Import another file</button>
              <a href="/orders" style={{ background: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '9px 24px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>View Orders →</a>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
