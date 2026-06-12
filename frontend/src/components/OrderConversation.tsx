import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, API } from '../utils/apiFetch';
import { OrderMessage } from '../utils/types';

const ROLE_COLORS: Record<string, string> = {
  ADMIN:          '#C09B58',
  AUTHORIZER:     '#F59E0B',
  CAD_DESIGNER:   '#6366F1',
  SKU_MANAGER:    '#F97316',
  FACTORY_MANAGER:'#0D9488',
  STONE_MANAGER:  '#9333EA',
  SALES_REP:      '#8B5CF6',
  CUSTOMER:       '#059669',
};

const MENTION_ROLES = [
  '@ADMIN', '@AUTHORIZER', '@CAD_DESIGNER', '@SKU_MANAGER',
  '@FACTORY_MANAGER', '@STONE_MANAGER', '@SALES_REP',
];

// CAD event messages start with one of these emojis
const CAD_EVENT_PREFIX = /^(📎|🔔|✅|❌|↺)/;

const CAD_EVENT_STYLE: Record<string, { border: string; bg: string; accent: string }> = {
  '📎': { border: '#6366F1', bg: 'rgba(99,102,241,0.06)',  accent: '#6366F1' }, // uploaded
  '🔔': { border: '#F59E0B', bg: 'rgba(245,158,11,0.06)', accent: '#F59E0B' }, // sent for approval
  '✅': { border: '#10B981', bg: 'rgba(16,185,129,0.06)', accent: '#10B981' }, // approved
  '❌': { border: '#EF4444', bg: 'rgba(239,68,68,0.06)',  accent: '#EF4444' }, // rejected
  '↺':  { border: '#8B5CF6', bg: 'rgba(139,92,246,0.06)', accent: '#8B5CF6' }, // revision
};

interface Props {
  orderId: string;
  currentUserRole: string;
  currentUserId: string;
}

export function OrderConversation({ orderId, currentUserRole, currentUserId }: Props) {
  const isCustomer = currentUserRole === 'CUSTOMER';
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () =>
    apiFetch(`${API}/orders/${orderId}/messages`)
      .then(r => r.ok ? r.json() : [])
      .then(setMessages);

  useEffect(() => { load(); }, [orderId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const toggleMention = (m: string) =>
    setMentions(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const send = async () => {
    if (!content.trim()) return;
    setSending(true);
    await apiFetch(`${API}/orders/${orderId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: content.trim(), isInternal, mentions }),
    });
    setContent('');
    setMentions([]);
    setIsInternal(false);
    setShowMentions(false);
    await load();
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  };

  const groupedByDate = messages.reduce<Record<string, OrderMessage[]>>((acc, msg) => {
    const date = new Date(msg.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    (acc[date] = acc[date] || []).push(msg);
    return acc;
  }, {});

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Conversation {messages.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '14px' }}>({messages.length})</span>}
        </h3>
        {!isCustomer && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Internal = visible to staff only</span>
        )}
      </div>

      {/* Thread */}
      <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '0' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: '13px' }}>No messages yet. Start the conversation.</div>
        )}
        {Object.entries(groupedByDate).map(([date, msgs]) => (
          <div key={date}>
            <div style={{ textAlign: 'center', margin: '10px 0', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{date}</div>
            {msgs.map(msg => {
              const isMine     = msg.authorId === currentUserId;
              const roleColor  = ROLE_COLORS[msg.authorRole] || 'var(--text-muted)';
              const internal   = msg.isInternal;
              const cadPrefix  = CAD_EVENT_PREFIX.exec(msg.content)?.[0];
              const isCadEvent = !!cadPrefix;
              const cadStyle   = cadPrefix ? CAD_EVENT_STYLE[cadPrefix] : null;

              // ── CAD event: full-width activity card ──────────────────
              if (isCadEvent && cadStyle) {
                return (
                  <div key={msg.id} style={{ marginBottom: '10px' }}>
                    <div style={{
                      background: cadStyle.bg,
                      border: `1px solid ${cadStyle.border}30`,
                      borderLeft: `3px solid ${cadStyle.border}`,
                      borderRadius: '8px',
                      padding: '10px 14px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                          {msg.content}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                          <div>{msg.authorName}</div>
                          <div>{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Regular chat bubble ───────────────────────────────────
              return (
                <div key={msg.id} style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    {internal && !isCustomer && (
                      <span style={{ fontSize: '10px', background: 'rgba(99,102,241,0.1)', color: '#6366F1', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(99,102,241,0.2)' }}>Internal</span>
                    )}
                    <span style={{ fontSize: '11px', color: roleColor, fontWeight: 600 }}>{msg.authorName}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{
                    maxWidth: '75%',
                    background: internal && !isCustomer ? 'rgba(99,102,241,0.06)' : isMine ? 'rgba(26,39,64,0.06)' : 'var(--bg-input)',
                    border: `1px solid ${internal && !isCustomer ? 'rgba(99,102,241,0.2)' : isMine ? 'rgba(26,39,64,0.15)' : 'var(--border)'}`,
                    borderRadius: '10px', padding: '10px 14px', fontSize: '13px',
                    color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {msg.content}
                    {msg.mentions?.length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {msg.mentions.map(m => (
                          <span key={m} style={{ fontSize: '10px', background: 'rgba(37,99,235,0.1)', color: '#2563EB', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37,99,235,0.2)' }}>{m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--bg-input)' }}>
        {/* Options row (company only) */}
        {!isCustomer && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Internal toggle */}
            <button
              onClick={() => setIsInternal(p => !p)}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                border: isInternal ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
                background: isInternal ? 'rgba(99,102,241,0.1)' : 'var(--bg-card)',
                color: isInternal ? '#6366F1' : 'var(--text-secondary)',
              }}
            >
              {isInternal ? 'Internal' : 'Public'}
            </button>
            {/* Mention */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMentions(p => !p)}
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  border: mentions.length ? '1px solid rgba(5,150,105,0.4)' : '1px solid var(--border)',
                  background: mentions.length ? 'rgba(5,150,105,0.08)' : 'var(--bg-card)',
                  color: mentions.length ? '#059669' : 'var(--text-secondary)',
                }}
              >
                @ Mention {mentions.length > 0 && `(${mentions.length})`}
              </button>
              {showMentions && (
                <div style={{ position: 'absolute', bottom: '32px', left: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', zIndex: 10, minWidth: '180px', boxShadow: 'var(--shadow-md)' }}>
                  {MENTION_ROLES.map(m => (
                    <div
                      key={m}
                      onClick={() => toggleMention(m)}
                      style={{
                        padding: '6px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px',
                        color: mentions.includes(m) ? '#2563EB' : 'var(--text-secondary)',
                        background: mentions.includes(m) ? 'rgba(37,99,235,0.08)' : 'transparent',
                      }}
                    >
                      {mentions.includes(m) ? '✓ ' : ''}{m}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {mentions.length > 0 && mentions.map(m => (
              <span key={m} style={{ fontSize: '10px', background: 'rgba(37,99,235,0.1)', color: '#2563EB', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37,99,235,0.2)' }}>{m}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKey}
            placeholder={isCustomer ? 'Send a message to the team…' : isInternal ? 'Internal note (not visible to customer)…' : 'Reply to customer or add a note…'}
            rows={2}
            style={{
              flex: 1, background: 'var(--bg-card)',
              border: `1px solid ${isInternal ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
              borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px',
              resize: 'none', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={send}
            disabled={sending || !content.trim()}
            style={{
              alignSelf: 'flex-end', padding: '9px 18px', borderRadius: '8px', border: 'none',
              background: content.trim() ? 'var(--navy)' : 'var(--border)',
              color: content.trim() ? '#fff' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: 600, cursor: content.trim() ? 'pointer' : 'default',
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px' }}>Ctrl+Enter to send</div>
      </div>
    </div>
  );
}
