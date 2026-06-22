import React from 'react';

export const SkeletonOrderCard: React.FC = () => (
  <div className="skeleton-card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
      <span className="skeleton skeleton-badge" />
      <span className="skeleton" style={{ height: '12px', width: '70px' }} />
    </div>
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-text skeleton-half" />
    <div className="skeleton skeleton-text skeleton-third" style={{ marginTop: '12px' }} />
  </div>
);

export const SkeletonOrderGrid: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="orders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonOrderCard key={i} />
    ))}
  </div>
);
