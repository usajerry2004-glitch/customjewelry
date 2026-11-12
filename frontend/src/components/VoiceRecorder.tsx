import React, { useEffect, useRef, useState } from 'react';

// Voice notes are recorded in the browser and then uploaded through the same
// endpoints as any other file (reference files / chat attachments), so the
// backend needs nothing special — it stores whatever audio blob it gets.

export const MAX_VOICE_SECONDS = 5 * 60;

// .webm is deliberately absent — it's also a video format; webm voice notes
// are recognised by their "Voice note" name instead.
const AUDIO_EXTS = ['weba', 'ogg', 'oga', 'opus', 'mp3', 'm4a', 'wav', 'aac', 'mp4a'];

// Voice notes are saved as "Voice note ….<ext>" — the name prefix is what
// tells a recorded .webm/.mp4 apart from an uploaded video with the same
// extension.
export function isAudioFile(name?: string | null, mime?: string | null): boolean {
  if (mime && mime.startsWith('audio/')) return true;
  if (!name) return false;
  if (/^voice note/i.test(name)) return true;
  const ext = (name.split('.').pop() || '').toLowerCase();
  return AUDIO_EXTS.includes(ext);
}

// Plays a local (not yet uploaded) File.
export function LocalAudio({ file, style }: { file: File; style?: React.CSSProperties }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <audio controls preload="metadata" src={url} style={{ height: '34px', maxWidth: '100%', ...style }} /> : null;
}

// Safari only records mp4/AAC; Chrome/Firefox prefer webm/opus. mp4/AAC is
// tried first because it plays back everywhere (webm doesn't on older iPhones).
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find(t => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  });
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fileNameFor(mime: string): string {
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.${String(d.getSeconds()).padStart(2, '0')}`;
  return `Voice note ${stamp}.${ext}`;
}

type Phase = 'idle' | 'recording' | 'review';

interface Props {
  // Called with the finished recording once the user confirms it.
  onRecorded: (file: File) => void;
  disabled?: boolean;
  // 'block' = full-width panel (forms); 'compact' = icon button (chat composer).
  variant?: 'block' | 'compact';
  label?: string;
  // Helper text beside the record button (block variant).
  hint?: string;
}

export function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

export function VoiceRecorder({ onRecorded, disabled, variant = 'block', label = 'Record a voice note', hint }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => {
    try { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); } catch {}
    stopStream();
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const stop = () => {
    try { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); } catch {}
  };

  const start = async () => {
    setError('');
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording isn’t supported in this browser. Please try Chrome or Safari.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.');
      return;
    }
    streamRef.current = stream;
    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stopStream();
      setError('Could not start recording on this device.');
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      stopStream();
      const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size === 0) { setPhase('idle'); setError('Nothing was recorded — please try again.'); return; }
      const file = new File([blob], fileNameFor(type), { type });
      setPreview({ file, url: URL.createObjectURL(blob) });
      setPhase('review');
    };
    recorderRef.current = rec;
    rec.start(1000);
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('recording');
    timerRef.current = setInterval(() => {
      const sec = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(sec);
      if (sec >= MAX_VOICE_SECONDS) stop();
    }, 250);
  };

  const discard = () => { setPreview(null); setPhase('idle'); setElapsed(0); };
  const keep = () => {
    if (!preview) return;
    onRecorded(preview.file);
    setPreview(null);
    setPhase('idle');
    setElapsed(0);
  };

  const btn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
  };
  const recDot = <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#DC2626', display: 'inline-block', animation: 'jf-rec-pulse 1s ease-in-out infinite' }} />;
  const pulseCss = <style>{'@keyframes jf-rec-pulse{0%,100%{opacity:1}50%{opacity:.25}}'}</style>;

  // ── Compact (chat composer) ─────────────────────────────────────────
  if (variant === 'compact') {
    if (phase === 'recording') {
      return (
        <button onClick={stop} title="Stop recording"
          style={{ alignSelf: 'flex-end', padding: '9px 10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(220,38,38,0.45)', background: 'rgba(220,38,38,0.08)', color: '#DC2626', fontSize: '12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {pulseCss}{recDot} {fmt(elapsed)} ■
        </button>
      );
    }
    if (phase === 'review' && preview) {
      return (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '8px', zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <audio controls src={preview.url} style={{ height: '36px', flex: '1 1 200px', minWidth: 0 }} />
          <button onClick={discard} style={btn}>Discard</button>
          <button onClick={keep} style={{ ...btn, background: 'var(--navy)', color: '#fff', border: 'none' }}>Attach</button>
        </div>
      );
    }
    return (
      <>
        <button onClick={start} disabled={disabled} title={error || `${label} (up to ${MAX_VOICE_SECONDS / 60} min)`}
          style={{ alignSelf: 'flex-end', padding: '9px 12px', borderRadius: '8px', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${error ? 'rgba(220,38,38,0.45)' : 'var(--border)'}`, background: 'var(--bg-card)', color: error ? '#DC2626' : 'var(--text-secondary)', opacity: disabled ? 0.5 : 1 }}>
          <MicIcon />
        </button>
        {error && (
          <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px', zIndex: 20, fontSize: '11px', color: '#DC2626', background: 'var(--bg-card)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', padding: '6px 10px', maxWidth: '320px' }}
            onClick={() => setError('')}>
            {error}
          </div>
        )}
      </>
    );
  }

  // ── Block (forms) ───────────────────────────────────────────────────
  return (
    <div style={{ border: `1px solid ${phase === 'recording' ? 'rgba(220,38,38,0.45)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '12px 14px', background: phase === 'recording' ? 'rgba(220,38,38,0.04)' : 'var(--bg-input)' }}>
      {pulseCss}
      {phase === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={start} disabled={disabled}
            style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-dark)', borderColor: 'var(--accent)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
            <MicIcon size={14} /> {label}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {hint || 'Explain in your own words how you’d like the piece'} — up to {MAX_VOICE_SECONDS / 60} minutes.
          </span>
        </div>
      )}
      {phase === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {recDot}
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
            Recording {fmt(elapsed)} / {fmt(MAX_VOICE_SECONDS)}
          </span>
          <button onClick={stop} style={{ ...btn, marginLeft: 'auto', background: '#DC2626', color: '#fff', border: 'none' }}>■ Stop</button>
        </div>
      )}
      {phase === 'review' && preview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <audio controls src={preview.url} style={{ height: '36px', flex: '1 1 220px', minWidth: 0 }} />
          <button onClick={discard} style={btn}>Re-record</button>
          <button onClick={keep} style={{ ...btn, background: 'var(--navy)', color: '#fff', border: 'none' }}>Use this</button>
        </div>
      )}
      {error && <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '8px' }}>{error}</div>}
    </div>
  );
}
