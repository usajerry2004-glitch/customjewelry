import React from 'react';

interface ComingSoonProps {
  icon: string;
  title: string;
  description: string;
  phase?: string;
}

export const ComingSoon: React.FC<ComingSoonProps> = ({ icon, title, description, phase }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: '16px' }}>
    <div style={{ fontSize: '56px', marginBottom: '4px' }}>{icon}</div>
    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#CBD5E1', margin: 0 }}>{title}</h2>
    <p style={{ fontSize: '14px', color: '#4B5563', maxWidth: '420px', lineHeight: 1.6, margin: 0 }}>{description}</p>
    {phase && (
      <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '6px 16px', fontSize: '12px', color: '#818CF8', marginTop: '8px' }}>
        Scheduled for {phase}
      </div>
    )}
  </div>
);
