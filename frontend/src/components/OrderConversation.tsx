import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, API } from '../utils/apiFetch';
import { OrderMessage } from '../utils/types';
import { formatName } from '../utils/name';

const ROLE_COLORS: Record<string, string> = {
  ADMIN:          '#C09B58',
  AUTHORIZER:     '#F59E0B',
  CAD_DESIGNER:   '#6366F1',
  FACTORY_MANAGER:'#0D9488',
  STONE_MANAGER:  '#9333EA',
  SALES_REP:      '#8B5CF6',
  CUSTOMER:       '#059669',
};

interface MentionableUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

// Two staff members can share a display name (e.g. two "Harshil Lakhani"
// accounts with different roles) — showing the role alongside the name is
// the only way to tell them apart in the mention list.
function roleLabel(role: string): string {
  return role.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

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

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrderConversation({ orderId, currentUserRole, currentUserId }: Props) {
  const isCustomer = currentUserRole === 'CUSTOMER';
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionableLoading, setMentionableLoading] = useState(true);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    apiFetch(`${API}/orders/${orderId}/messages`)
      .then(r => r.ok ? r.json() : [])
      .then(setMessages);

  useEffect(() => { load(); }, [orderId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (isCustomer) return;
    setMentionableLoading(true);
    apiFetch(`${API}/orders/${orderId}/messages/mentionable-users`)
      .then(r => r.ok ? r.json() : [])
      .then(users => { setMentionableUsers(users); setMentionableLoading(false); });
  }, [orderId, isCustomer]);

  const mentionNameById = (id: string) => {
    const u = mentionableUsers.find(u => u.id === id);
    return u ? formatName(u.firstName, u.lastName) : 'Unknown user';
  };

  const toggleMention = (id: string) =>
    setMentions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_ATTACHMENT_SIZE) {
      setAttachError('File is too large — the limit is 50MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setAttachError('');
    setAttachedFile(file);
  };

  const send = async () => {
    if (!content.trim() && !attachedFile) return;
    setSending(true);
    const formData = new FormData();
    formData.append('content', content.trim());
    formData.append('isInternal', String(isInternal));
    formData.append('mentions', JSON.stringify(mentions));
    if (attachedFile) formData.append('file', attachedFile);
    await apiFetch(`${API}/orders/${orderId}/messages`, {
      method: 'POST',
      body: formData,
    });
    setContent('');
    setMentions([]);
    setIsInternal(false);
    setShowMentions(false);
    setAttachedFile(null);
    setAttachError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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
                    {msg.attachmentUrl && (
                      <a
                        href={msg.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          marginTop: msg.content ? '8px' : 0, display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.03)',
                          border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text-primary)',
                        }}
                      >
                        <span>📎</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, wordBreak: 'break-all' }}>{msg.attachmentName}</span>
                        {typeof msg.attachmentSize === 'number' && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{formatFileSize(msg.attachmentSize)}</span>
                        )}
                      </a>
                    )}
                    {msg.mentionNames && msg.mentionNames.length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {msg.mentionNames.map((name, i) => (
                          <span key={i} style={{ fontSize: '10px', background: 'rgba(37,99,235,0.1)', color: '#2563EB', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37,99,235,0.2)' }}>@{name}</span>
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
                <div style={{ position: 'absolute', bottom: '32px', left: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', zIndex: 10, minWidth: '220px', maxHeight: '240px', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                  {mentionableLoading && (
                    <div style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>
                  )}
                  {!mentionableLoading && mentionableUsers.length === 0 && (
                    <div style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>No one to mention yet.</div>
                  )}
                  {!mentionableLoading && mentionableUsers.map(u => (
                    <div
                      key={u.id}
                      onClick={() => toggleMention(u.id)}
                      style={{
                        padding: '6px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px',
                        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px',
                        color: mentions.includes(u.id) ? '#2563EB' : 'var(--text-secondary)',
                        background: mentions.includes(u.id) ? 'rgba(37,99,235,0.08)' : 'transparent',
                      }}
                    >
                      <span>{mentions.includes(u.id) ? '✓ ' : ''}{formatName(u.firstName, u.lastName)}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{roleLabel(u.role)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {mentions.length > 0 && mentions.map(id => (
              <span key={id} style={{ fontSize: '10px', background: 'rgba(37,99,235,0.1)', color: '#2563EB', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(37,99,235,0.2)' }}>@{mentionNameById(id)}</span>
            ))}
          </div>
        )}

        {attachedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', padding: '5px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', fontSize: '12px' }}>
            <span>📎</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{attachedFile.name}</span>
            <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(attachedFile.size)}</span>
            <button
              onClick={() => { setAttachedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: 0 }}
              aria-label="Remove attachment"
            >
              ×
            </button>
          </div>
        )}
        {attachError && (
          <div style={{ fontSize: '11px', color: '#EF4444', marginBottom: '8px' }}>{attachError}</div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file (up to 50MB)"
            style={{
              alignSelf: 'flex-end', padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
              border: attachedFile ? '1px solid rgba(5,150,105,0.4)' : '1px solid var(--border)',
              background: attachedFile ? 'rgba(5,150,105,0.08)' : 'var(--bg-card)',
              color: attachedFile ? '#059669' : 'var(--text-secondary)', fontSize: '15px',
            }}
          >
            📎
          </button>
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
            disabled={sending || (!content.trim() && !attachedFile)}
            style={{
              alignSelf: 'flex-end', padding: '9px 18px', borderRadius: '8px', border: 'none',
              background: (content.trim() || attachedFile) ? 'var(--navy)' : 'var(--border)',
              color: (content.trim() || attachedFile) ? '#fff' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: 600, cursor: (content.trim() || attachedFile) ? 'pointer' : 'default',
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
