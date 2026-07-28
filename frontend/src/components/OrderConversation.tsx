import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, API } from '../utils/apiFetch';
import { getSocket } from '../utils/socket';
import { OrderMessage } from '../utils/types';
import { formatName } from '../utils/name';

interface ReadReceipt { userId: string; name: string; lastReadAt: string }

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

// Attach-file icon — an inline SVG (not an emoji glyph) so it renders
// identically across platforms instead of picking up the OS emoji font.
function PaperclipIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inline "@" typeahead — null means no trigger is active. mentionQueryStart
  // is the index of the triggering '@' in `content`, used to splice the typed
  // query back out once a name is picked.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionQueryStart, setMentionQueryStart] = useState(-1);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const [replyTo, setReplyTo] = useState<OrderMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [reads, setReads] = useState<ReadReceipt[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    apiFetch(`${API}/orders/${orderId}/messages/reads`).then(r => r.ok ? r.json() : []).then(setReads).catch(() => {});
  }, [orderId]);

  // Opening the thread counts as reading it — re-marked whenever a new
  // message shows up while it's open, not just on first mount.
  useEffect(() => {
    if (messages.length === 0) return;
    apiFetch(`${API}/orders/${orderId}/messages/read`, { method: 'PATCH' }).catch(() => {});
  }, [orderId, messages.length]);

  // Live updates: join this order's room for as long as the thread is
  // mounted, and leave on unmount/order change so typing/read broadcasts
  // don't keep going to a chat the user has navigated away from.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('order:join', orderId);

    const onNewMessage = (msg: OrderMessage) => {
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    };
    const onTyping = (data: { userId: string; userName: string; isTyping: boolean }) => {
      if (data.userId === currentUserId) return;
      setTypingUsers(prev => {
        const next = { ...prev };
        if (data.isTyping) next[data.userId] = data.userName; else delete next[data.userId];
        return next;
      });
    };
    const onRead = (data: { userId: string; userName: string; lastReadAt: string }) => {
      setReads(prev => [...prev.filter(r => r.userId !== data.userId), { userId: data.userId, name: data.userName, lastReadAt: data.lastReadAt }]);
    };

    socket.on('message:new', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('message:read', onRead);

    return () => {
      socket.emit('order:leave', orderId);
      socket.off('message:new', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('message:read', onRead);
    };
  }, [orderId, currentUserId]);

  const emitTyping = (isTyping: boolean) => {
    getSocket()?.emit('typing', { orderId, isTyping });
  };

  const mentionNameById = (id: string) => {
    const u = mentionableUsers.find(u => u.id === id);
    return u ? formatName(u.firstName, u.lastName) : 'Unknown user';
  };

  const toggleMention = (id: string) =>
    setMentions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const mentionMatches = mentionQuery === null
    ? []
    : mentionableUsers.filter(u => formatName(u.firstName, u.lastName).toLowerCase().includes(mentionQuery.toLowerCase()));
  const mentionActiveSafe = mentionMatches.length ? mentionActiveIndex % mentionMatches.length : 0;

  const closeMentionTypeahead = () => { setMentionQuery(null); setMentionQueryStart(-1); };

  // Fires on every keystroke — looks at the text immediately before the
  // caret (not the whole message) so an "@" earlier in an already-typed
  // sentence doesn't reopen the picker while editing later in the message.
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    emitTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 2000);

    if (isCustomer) return;
    const cursor = e.target.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const match = /(?:^|\s)@([a-zA-Z]*)$/.exec(beforeCursor);
    if (match) {
      setMentionQueryStart(cursor - match[1].length - 1);
      setMentionQuery(match[1]);
      setMentionActiveIndex(0);
    } else {
      closeMentionTypeahead();
    }
  };

  const selectMention = (u: MentionableUser) => {
    if (mentionQueryStart < 0) return;
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const before = content.slice(0, mentionQueryStart);
    const after = content.slice(cursor);
    const inserted = `@${formatName(u.firstName, u.lastName)} `;
    setContent(before + inserted + after);
    setMentions(prev => prev.includes(u.id) ? prev : [...prev, u.id]);
    closeMentionTypeahead();
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

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
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTyping(false);
    const formData = new FormData();
    formData.append('content', content.trim());
    formData.append('isInternal', String(isInternal));
    formData.append('mentions', JSON.stringify(mentions));
    if (replyTo) formData.append('parentMessageId', replyTo.id);
    if (attachedFile) formData.append('file', attachedFile);
    await apiFetch(`${API}/orders/${orderId}/messages`, {
      method: 'POST',
      body: formData,
    });
    setContent('');
    setMentions([]);
    setIsInternal(false);
    setShowMentions(false);
    closeMentionTypeahead();
    setReplyTo(null);
    setAttachedFile(null);
    setAttachError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    await load();
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionActiveIndex(i => (i + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionActiveIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); selectMention(mentionMatches[mentionActiveSafe]); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeMentionTypeahead(); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  };

  const groupedByDate = messages.reduce<Record<string, OrderMessage[]>>((acc, msg) => {
    const date = new Date(msg.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    (acc[date] = acc[date] || []).push(msg);
    return acc;
  }, {});

  // "Seen by" is only worth showing once, on the most recent message that
  // someone else has actually read — readers whose last visit landed after
  // it was sent have necessarily seen every earlier one too, so repeating
  // this per-message would just be noise. Walking backward (rather than
  // always checking only the literal last message) means the indicator
  // still shows up as soon as any message has been read, instead of
  // disappearing entirely the moment a newest message goes out that nobody
  // has reopened the thread to see yet.
  let seenAtMessageId: string | null = null;
  let seenByNames: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    // CAD event system messages render in a separate branch below that
    // never checks seenAtMessageId, so anchoring the indicator to one would
    // make it silently vanish instead of attaching to the nearest real bubble.
    if (CAD_EVENT_PREFIX.exec(m.content)) continue;
    const names = reads
      .filter(r => r.userId !== m.authorId && r.userId !== currentUserId && new Date(r.lastReadAt) >= new Date(m.createdAt))
      .map(r => r.name);
    if (names.length > 0) {
      seenAtMessageId = m.id;
      seenByNames = names;
      break;
    }
  }

  const typingNames = Object.values(typingUsers);

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
                    <button
                      onClick={() => setReplyTo(msg)}
                      title="Reply"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: '0 2px', opacity: 0.7 }}
                    >
                      ↩
                    </button>
                  </div>
                  <div style={{
                    maxWidth: '75%',
                    background: internal && !isCustomer ? 'rgba(99,102,241,0.06)' : isMine ? 'rgba(26,39,64,0.06)' : 'var(--bg-input)',
                    border: `1px solid ${internal && !isCustomer ? 'rgba(99,102,241,0.2)' : isMine ? 'rgba(26,39,64,0.15)' : 'var(--border)'}`,
                    borderRadius: '10px', padding: '10px 14px', fontSize: '13px',
                    color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {msg.parentPreview && (
                      <div style={{
                        marginBottom: '6px', paddingLeft: '8px', borderLeft: '2px solid var(--border)',
                        fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'normal',
                      }}>
                        <span style={{ fontWeight: 600 }}>{msg.parentPreview.authorName}</span>: {msg.parentPreview.content}
                      </div>
                    )}
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
                        <PaperclipIcon />
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
                  {msg.id === seenAtMessageId && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      Seen by {seenByNames.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {typingNames.length > 0 && (
        <div style={{ padding: '0 18px 8px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {typingNames.join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing…
        </div>
      )}

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

        {replyTo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-hover)', border: '1px solid var(--border)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Replying to <strong style={{ color: 'var(--text-primary)' }}>{replyTo.authorName}</strong>:</span>
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {replyTo.content || (replyTo.attachmentName ? `📎 ${replyTo.attachmentName}` : '')}
            </span>
            <button
              onClick={() => setReplyTo(null)}
              style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: 0 }}
              aria-label="Cancel reply"
            >
              ×
            </button>
          </div>
        )}

        {attachedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', padding: '5px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', fontSize: '12px' }}>
            <PaperclipIcon />
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

        <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
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
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: attachedFile ? '1px solid rgba(5,150,105,0.4)' : '1px solid var(--border)',
              background: attachedFile ? 'rgba(5,150,105,0.08)' : 'var(--bg-card)',
              color: attachedFile ? '#059669' : 'var(--text-secondary)',
            }}
          >
            <PaperclipIcon size={16} />
          </button>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKey}
            onBlur={closeMentionTypeahead}
            placeholder={isCustomer ? 'Send a message to the team…' : isInternal ? 'Internal note (not visible to customer)…' : 'Reply to customer or add a note…'}
            rows={2}
            style={{
              flex: 1, background: 'var(--bg-card)',
              border: `1px solid ${isInternal ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
              borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px',
              resize: 'none', outline: 'none', fontFamily: 'inherit',
            }}
          />
          {mentionQuery !== null && !isCustomer && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '44px', marginBottom: '6px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px', zIndex: 20, minWidth: '220px', maxHeight: '200px', overflowY: 'auto',
              boxShadow: 'var(--shadow-md)',
            }}>
              {mentionMatches.length === 0 ? (
                <div style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>No matches</div>
              ) : mentionMatches.map((u, i) => (
                <div
                  key={u.id}
                  onMouseDown={e => { e.preventDefault(); selectMention(u); }}
                  onMouseEnter={() => setMentionActiveIndex(i)}
                  style={{
                    padding: '6px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px',
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px',
                    color: i === mentionActiveSafe ? '#2563EB' : 'var(--text-secondary)',
                    background: i === mentionActiveSafe ? 'rgba(37,99,235,0.08)' : 'transparent',
                  }}
                >
                  <span>{formatName(u.firstName, u.lastName)}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{roleLabel(u.role)}</span>
                </div>
              ))}
            </div>
          )}
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
