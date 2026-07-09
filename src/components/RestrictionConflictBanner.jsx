import { useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

// Non-blocking warning shown ABOVE an already-generated menu when a member's
// allergies/intolerances changed after generation (e.g. edited from "Tu
// perfil" and the user chose "No, solo guardar cambios") and one or more
// already-planned dishes now violate the new restriction. See
// utils/menuConflicts.js — this never auto-regenerates on its own; it only
// makes the drift visible instead of leaving it silent.
export function RestrictionConflictBanner({ message, onRegenerate }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ padding: "0 16px 12px" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "#fff5ef",
          border: "1px solid #f1c08a",
          borderRadius: 14,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <AlertTriangle size={17} style={{ color: "#a85a00", flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#a85a00", marginBottom: 2 }}>
            Restricciones cambiadas desde que se generó este menú
          </div>
          <div style={{ fontSize: 12, color: "#7a4a12", lineHeight: 1.45, marginBottom: 10 }}>
            {message} Revísalo antes de cocinar o genera un menú nuevo.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 12px", borderRadius: 10, border: "none",
                  background: "#1a3a24", color: "#fff", fontSize: 12, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <RotateCw size={12} />
                Generar menú nuevo
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              style={{
                padding: "8px 12px", borderRadius: 10,
                border: "1px solid #f1c08a", background: "transparent",
                color: "#7a4a12", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
