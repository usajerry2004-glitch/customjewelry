import React from 'react';

interface ComingSoonProps {
  icon: string;
  title: string;
  description: string;
  phase?: string;
}

export const ComingSoon: React.FC<ComingSoonProps> = ({ icon, title, description, phase }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: '16px' }}>
    <div style={{ fontSize: '56px', marginBottom: '4px', opacity: 0.35 }}>{icon}</div>
    <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.7, margin: 0 }}>{description}</p>
    {phase && (
      <div style={{ background: 'rgba(26,39,64,0.06)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 16px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
        Scheduled for {phase}
      </div>
    )}
  </div>
);
