import React from 'react';

interface State { hasError: boolean; message: string }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-page, #F4F6F9)', flexDirection: 'column', gap: '16px', padding: '32px',
      }}>
        <div style={{
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #E5E7EB)',
          borderRadius: '12px', padding: '40px 48px', maxWidth: '480px', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '24px', fontWeight: 600, color: 'var(--text-primary, #1A2740)', marginBottom: '10px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #4B5563)', marginBottom: '24px', lineHeight: 1.6 }}>
            An unexpected error occurred. Please refresh the page. If the problem persists, contact support.
          </p>
          {this.state.message && (
            <code style={{ display: 'block', background: 'var(--bg-input, #F3F4F6)', borderRadius: '6px', padding: '8px 12px', fontSize: '11px', color: '#DC2626', marginBottom: '20px', wordBreak: 'break-word' }}>
              {this.state.message}
            </code>
          )}
          <button
            onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload(); }}
            style={{ background: 'var(--navy, #1A2740)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
