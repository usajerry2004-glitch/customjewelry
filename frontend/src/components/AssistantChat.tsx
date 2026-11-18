import React, { useEffect, useRef, useState } from 'react';
import { API, apiFetch, getErrorMessage } from '../utils/apiFetch';
import { assistantHistoryKey, loadAssistantHistory, saveAssistantHistory } from '../utils/assistantHistory';

// Floating AI assistant for customers and staff. Hidden entirely until the
// backend reports it is configured (ANTHROPIC_API_KEY set).

interface Msg { role: 'user' | 'assistant'; content: string; error?: boolean }

const CUSTOMER_SUGGESTIONS = ['Where is my latest order?', 'Which designs need my approval?', 'How do I care for white gold?', 'How do I find my ring size?'];
const STAFF_SUGGESTIONS = ['Which orders are pending CAD?', 'Status of a PO number', 'What do the deadline chips mean?', '14K vs 18K gold?'];

export function AssistantChat({ role, userId }: { role: string; userId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  // Lazy init is SSR-safe here: the panel renders nothing until /status answers.
  const [messages, setMessages] = useState<Msg[]>(() => (typeof window === 'undefined' ? [] : loadAssistantHistory(userId)));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const isCustomer = role === 'CUSTOMER';

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API}/assistant/status`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setEnabled(!!d?.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The conversation is saved (see assistantHistory) so it survives page
  // changes and reloads; this keeps other open tabs in sync with it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === assistantHistoryKey(userId)) setMessages(loadAssistantHistory(userId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  useEffect(() => {
    saveAssistantHistory(userId, messages);
  }, [messages, userId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  if (!enabled) return null;

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await apiFetch(`${API}/assistant/chat`, {
        method: 'POST',
        body: JSON.stringify({ messages: next.filter(m => !m.error).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = res.status === 429 ? 'Too many questions in a short time. Please wait a minute.' : getErrorMessage(data, 'The assistant is unavailable right now.');
        setMessages(m => [...m, { role: 'assistant', content: msg, error: true }]);
      } else {
        setMessages(m => [...m, { role: 'assistant', content: String(data.reply || '') }]);
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Could not reach the assistant. Check your connection.', error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = isCustomer ? CUSTOMER_SUGGESTIONS : STAFF_SUGGESTIONS;

  return (
    <>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Dashboard assistant" style={{
          position: 'fixed', right: '20px', bottom: '88px', zIndex: 1000,
          width: 'min(380px, calc(100vw - 32px))', height: 'min(540px, calc(100vh - 120px))',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
          boxShadow: '0 18px 48px rgba(30,42,58,0.22)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', background: 'var(--sidebar-bg)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Dashboard Assistant</div>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>Orders, CAD, delivery, care & sizing</div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {messages.length > 0 && (
                <button type="button" onClick={() => setMessages([])} title="New chat" style={iconBtn}>New</button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={iconBtn}>✕</button>
            </div>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <>
                <div style={bubble('assistant')}>
                  Hi! Ask me about {isCustomer ? 'your orders' : 'any order'}, design status, delivery dates, jewelry care, sizing, metals, or how to use the dashboard.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {suggestions.map(s => (
                    <button key={s} type="button" onClick={() => send(s)} style={{
                      fontFamily: 'inherit', fontSize: '12px', padding: '6px 10px', borderRadius: '99px', cursor: 'pointer',
                      background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                    }}>{s}</button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ ...bubble(m.role), ...(m.error ? { color: '#B42318' } : {}) }}>{m.content}</div>
            ))}
            {busy && <div style={{ ...bubble('assistant'), color: 'var(--text-muted)' }}>Thinking…</div>}
          </div>

          <form onSubmit={e => { e.preventDefault(); send(input); }} style={{ display: 'flex', gap: '8px', padding: '10px', borderTop: '1px solid var(--border)' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question…"
              maxLength={2000}
              aria-label="Your question"
              style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: '13px', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
            />
            <button type="submit" disabled={busy || !input.trim()} style={{
              fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, padding: '0 14px', borderRadius: '10px', border: 'none',
              background: '#C09B58', color: '#fff', cursor: busy || !input.trim() ? 'default' : 'pointer', opacity: busy || !input.trim() ? 0.5 : 1,
            }}>Send</button>
          </form>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '0 10px 8px' }}>
            AI answers can be wrong. For changes or decisions, message the team on the order.
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        style={{
          position: 'fixed', right: '20px', bottom: '20px', zIndex: 1000, width: '56px', height: '56px', borderRadius: '50%',
          border: 'none', cursor: 'pointer', background: 'var(--sidebar-bg)', color: '#EDD48B',
          boxShadow: '0 8px 24px rgba(30,42,58,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
            <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
          </svg>
        )}
      </button>
    </>
  );
}

const iconBtn: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, padding: '4px 9px', borderRadius: '8px', cursor: 'pointer',
  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
};

function bubble(role: 'user' | 'assistant'): React.CSSProperties {
  const mine = role === 'user';
  return {
    alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    fontSize: '13px', lineHeight: 1.5, padding: '9px 12px', borderRadius: '12px',
    background: mine ? '#1E3A5F' : 'var(--bg-input)', color: mine ? '#fff' : 'var(--text-primary)',
    border: mine ? 'none' : '1px solid var(--border)',
  };
}
