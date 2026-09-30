import { Component, type ReactNode } from "react";

/** Shows a readable message instead of a blank page if the UI crashes. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 640, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ color: "#717171", marginBottom: 16 }}>Please reload the page. If it keeps happening, share this message with support:</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 16, borderRadius: 12, fontSize: 13 }}>{String(this.state.error?.stack || this.state.error)}</pre>
        <button onClick={() => location.reload()} style={{ marginTop: 16, padding: "12px 20px", borderRadius: 8, background: "#222", color: "#fff", border: 0, cursor: "pointer" }}>
          Reload
        </button>
      </div>
    );
  }
}
