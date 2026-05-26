import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, API } from '../utils/apiFetch';
import { OrderMessage } from '../utils/types';

const ROLE_COLORS: Record<string, string> = {
  ADMIN:            '#F6D860',
  AUTHORIZER:       '#F59E0B',
  CAD_DESIGNER:     '#6366F1',
  SKU_MANAGER:      '#F97316',
  FACTORY_MANAGER:  '#14B8A6',
  SHIPPING_MANAGER: '#3B82F6',
  SALES_REP:        '#8B5CF6',
  CUSTOMER:         '#10B981',
};

const MENTION_ROLES = [
  '@ADMIN', '@AUTHORIZER', '@CAD_DESIGNER', '@SKU_MANAGER',
  '@FACTORY_MANAGER', '@SHIPPING_MANAGER', '@SALES_REP',
];

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
    <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #1E1E2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#E2E8F0' }}>
          💬 Conversation {messages.length > 0 && <span style={{ color: '#4B5563', fontWeight: 400 }}>({messages.length})</span>}
        </h3>
        {!isCustomer && (
          <span style={{ fontSize: '11px', color: '#4B5563' }}>🔒 = internal only</span>
        )}
      </div>

      {/* Thread */}
      <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '0' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#2D2D3D', padding: '24px 0', fontSize: '13px' }}>No messages yet. Start the conversation.</div>
        )}
        {Object.entries(groupedByDate).map(([date, msgs]) => (
          <div key={date}>
            <div style={{ textAlign: 'center', margin: '10px 0', fontSize: '10px', color: '#2D2D3D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{date}</div>
            {msgs.map(msg => {
              const isMine = msg.authorId === currentUserId;
              const roleColor = ROLE_COLORS[msg.authorRole] || '#94A3B8';
              const internal = msg.isInternal;
              return (
                <div key={msg.id} style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                  {/* Author + time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    {internal && !isCustomer && (
                      <span style={{ fontSize: '10px', background: '#1E1E2E', color: '#6366F1', padding: '1px 6px', borderRadius: '4px' }}>🔒 Internal</span>
                    )}
                    <span style={{ fontSize: '11px', color: roleColor, fontWeight: 600 }}>{msg.authorName}</span>
                    <span style={{ fontSize: '10px', color: '#2D2D3D' }}>
                      {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {/* Bubble */}
                  <div style={{
                    maxWidth: '75%',
                    background: internal && !isCustomer ? '#1A1A2E' : isMine ? '#1A1E2E' : '#0F0F14',
                    border: `1px solid ${internal && !isCustomer ? '#6366F130' : isMine ? '#3B82F630' : '#1E1E2E'}`,
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: '#CBD5E1',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                    {msg.mentions?.length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {msg.mentions.map(m => (
                          <span key={m} style={{ fontSize: '10px', background: '#1E2A3A', color: '#60A5FA', padding: '2px 6px', borderRadius: '4px' }}>{m}</span>
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
      <div style={{ borderTop: '1px solid #1E1E2E', padding: '14px 18px' }}>
        {/* Options row (company only) */}
        {!isCustomer && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Internal toggle */}
            <button
              onClick={() => setIsInternal(p => !p)}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none',
                background: isInternal ? '#6366F130' : '#1A1A24',
                color: isInternal ? '#818CF8' : '#4B5563',
              }}
            >
              🔒 {isInternal ? 'Internal' : 'Public'}
            </button>
            {/* Mention */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMentions(p => !p)}
                style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', background: mentions.length ? '#1E3A2E' : '#1A1A24', color: mentions.length ? '#34D399' : '#4B5563' }}
              >
                @ Mention {mentions.length > 0 && `(${mentions.length})`}
              </button>
              {showMentions && (
                <div style={{ position: 'absolute', bottom: '32px', left: 0, background: '#111118', border: '1px solid #2D2D3D', borderRadius: '8px', padding: '6px', zIndex: 10, minWidth: '180px' }}>
                  {MENTION_ROLES.map(m => (
                    <div
                      key={m}
                      onClick={() => toggleMention(m)}
                      style={{
                        padding: '6px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px',
                        color: mentions.includes(m) ? '#60A5FA' : '#94A3B8',
                        background: mentions.includes(m) ? '#1E2A3A' : 'transparent',
                      }}
                    >
                      {mentions.includes(m) ? '✓ ' : ''}{m}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {mentions.length > 0 && mentions.map(m => (
              <span key={m} style={{ fontSize: '10px', background: '#1E2A3A', color: '#60A5FA', padding: '2px 6px', borderRadius: '4px' }}>{m}</span>
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
              flex: 1, background: '#0F0F14', border: `1px solid ${isInternal ? '#6366F140' : '#2D2D3D'}`,
              borderRadius: '8px', padding: '9px 12px', color: '#E2E8F0', fontSize: '13px',
              resize: 'none', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={send}
            disabled={sending || !content.trim()}
            style={{
              alignSelf: 'flex-end', padding: '9px 18px', borderRadius: '8px', border: 'none',
              background: content.trim() ? 'linear-gradient(135deg, #F6D860, #E6A817)' : '#1A1A24',
              color: content.trim() ? '#000' : '#4B5563',
              fontSize: '13px', fontWeight: 700, cursor: content.trim() ? 'pointer' : 'default',
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
        <div style={{ fontSize: '10px', color: '#2D2D3D', marginTop: '5px' }}>Ctrl+Enter to send</div>
      </div>
    </div>
  );
}
