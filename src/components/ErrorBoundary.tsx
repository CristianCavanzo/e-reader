import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Reader boundary error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="reader-error boundary-error">
          <h2>Algo falló en esta vista.</h2>
          <p>{this.state.message || 'Error desconocido'}</p>
          <button type="button" onClick={() => this.setState({ hasError: false, message: undefined })}>
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
