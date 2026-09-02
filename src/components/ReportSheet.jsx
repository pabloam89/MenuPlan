import { useState } from "react";
import { X, Flag, Check } from "lucide-react";
import { reportContent, REPORT_REASONS } from "../lib/social.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * Reportar una receta, un menú, un perfil o un comentario.
 *
 * Un solo componente para los cuatro porque el gesto es idéntico: motivo +
 * nota opcional, y ya. Vive aparte de PersonSheet/FeedScreen/CommentThread —
 * lo abren los cuatro, y una copia por sitio sería la misma hoja repetida
 * cuatro veces con la primera corrección de estilo divergiendo.
 *
 * No hay confirmación "gracias por avisar" con detalle de qué pasa después:
 * moderación todavía no tiene panel (ver 0033_social_blocking_reports.sql),
 * así que prometer una revisión sería mentir sobre lo que hay montado hoy.
 */
export function ReportSheet({ user, targetType, targetId, onClose }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const send = async () => {
    if (!reason) return;
    setSending(true);
    const ok = await reportContent(user?.id, { targetType, targetId, reason, note });
    setSending(false);
    if (ok) setDone(true);
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Flag size={16} strokeWidth={2.5} color="#c0392b" />
          <h2 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 900, color: INK }}>
            {done ? "Reportado" : "Reportar"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>

        {done ? (
          <div style={{ padding: "14px 0 4px", textAlign: "center" }}>
            <Check size={22} color={TEAL} strokeWidth={2.6} />
            <p style={{ margin: "8px 0 0", fontSize: 12.5, fontWeight: 600, color: "#42594c", lineHeight: 1.4 }}>
              Gracias por avisar. Ya no tienes que hacer nada más.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  aria-pressed={reason === r.id}
                  style={{ ...reasonRow, borderColor: reason === r.id ? TEAL : "#e0eae3", background: reason === r.id ? "#eef6f4" : "#fff" }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: INK }}>{r.label}</span>
                  {reason === r.id && <Check size={14} color={TEAL} strokeWidth={3} />}
                </button>
              ))}
            </div>

            {reason && (
              <textarea
                className="mp-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Añade algo de contexto (opcional)"
                style={{ ...noteField }}
              />
            )}

            <button type="button" onClick={send} disabled={!reason || sending} style={{ ...sendBtn, opacity: reason ? 1 : .5 }}>
              Enviar reporte
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 320,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  width: "100%", maxWidth: 380, background: "#fff",
  borderRadius: "20px 20px 0 0", padding: "16px 18px",
  paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const closeBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 30, height: 30, borderRadius: 10,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};

const reasonRow = {
  display: "flex", alignItems: "center", width: "100%",
  padding: "10px 12px", borderRadius: 12, border: "1.5px solid #e0eae3",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const noteField = {
  width: "100%", marginTop: 10, padding: "9px 11px", borderRadius: 10, boxSizing: "border-box",
  border: "1.5px solid #dde7e0", fontSize: 16, outline: "none",
  fontFamily: "inherit", color: "#142f1d", resize: "vertical",
};

const sendBtn = {
  width: "100%", marginTop: 12, padding: "11px", borderRadius: 11, border: "none",
  background: "#c0392b", color: "#fff", fontSize: 13.5, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit",
};
