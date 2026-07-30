import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the crashed subtree. Defaults to null (hide it). */
  fallback?: ReactNode;
  /** Notified once per caught error — e.g. to flip a parent into a failed state. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Generic error boundary. Without one, any render-time error (a failed splat
 * fetch thrown through Suspense by drei's <Splat>, a WebGL init failure, …)
 * unmounts the ENTIRE React tree and leaves a black page.
 *
 * Give it a `key` tied to the content (e.g. the splat URL) so swapping to new
 * content automatically resets a tripped boundary.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/**
 * Full-screen fallback for the app-level boundary: dark-theme friendly,
 * responsive, and recoverable via reload (state-corrupting crashes are rare;
 * a reload almost always restores the app).
 */
export function AppErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred while rendering the page. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
