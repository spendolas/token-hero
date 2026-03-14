/**
 * ErrorBoundary — catches React render errors and displays them
 * instead of leaving the UI blank.
 */

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TokenHero] React error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
          <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
            Plugin crashed
          </div>
          <div style={{ color: '#ef4444', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error.message}
          </div>
          {this.state.error.stack && (
            <div style={{ marginTop: 8, opacity: 0.5, fontSize: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
              {this.state.error.stack}
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
