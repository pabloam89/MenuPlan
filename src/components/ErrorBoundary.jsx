import React from "react";

/**
 * Catches render/runtime errors anywhere below it so a single broken screen
 * shows a readable message (with the error text) instead of unmounting the
 * whole app into a blank white page.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the details in the console for debugging.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "#f4f8f5",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "#fff3f3",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 28 }}>😵</span>
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, color: "#142f1d" }}>
          Algo ha fallado en esta pantalla
        </h2>
        <pre
          style={{
            margin: "0 0 20px",
            maxWidth: 420,
            width: "100%",
            overflowX: "auto",
            fontSize: 12,
            color: "#c0392b",
            background: "#fff",
            border: "1px solid #f0d0cc",
            borderRadius: 12,
            padding: "12px 14px",
            textAlign: "left",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {String(error?.message ?? error)}
        </pre>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: "12px 20px",
              borderRadius: 12,
              border: "none",
              background: "#2d5a3d",
              color: "#fff",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Volver a intentar
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 20px",
              borderRadius: 12,
              border: "1.5px solid #d9e5dd",
              background: "#fff",
              color: "#2d5a3d",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Recargar app
          </button>
        </div>
      </div>
    );
  }
}
