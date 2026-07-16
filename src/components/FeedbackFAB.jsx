import { useState, useRef, useEffect } from "react";
import { MessageSquarePlus, Send, X } from "lucide-react";
import { submitFeedback } from "../lib/feedback.js";
import { BOTTOM_NAV_HEIGHT } from "./ui.jsx";

const TYPES = [
  { id: "bug",      emoji: "🐛", label: "Algo falla",   sub: "Encontré un error.",         bg: "#fde8e8" },
  { id: "menu",     emoji: "🍽️", label: "El menú",      sub: "Recetas o planificación.",    bg: "#e8f5ed" },
  { id: "diseno",   emoji: "🎨", label: "El diseño",    sub: "Algo es difícil de usar.",    bg: "#e6f1fb" },
  { id: "idea",     emoji: "💡", label: "Sugerencia",   sub: "Tengo una idea.",             bg: "#fef3d8" },
];

export function FeedbackFAB({ user, screen, onToast }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (type && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [type]);

  const reset = () => {
    setType(null);
    setMessage("");
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (!type) return;
    setSending(true);
    try {
      await submitFeedback({ type, message: message.trim(), screen, user });
      onToast?.("Feedback enviado — ¡gracias!");
      reset();
    } catch {
      onToast?.("No se pudo enviar el feedback");
    } finally {
      setSending(false);
    }
  };

  const fabBottom = BOTTOM_NAV_HEIGHT + 16;

  if (!user) return null;

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Enviar feedback"
          style={{
            position: "fixed",
            right: 18,
            bottom: `calc(${fabBottom}px + env(safe-area-inset-bottom, 0px))`,
            zIndex: 150,
            width: 48,
            height: 48,
            borderRadius: 16,
            border: "none",
            background: "#2d5a3d",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(20,47,29,.3)",
            transition: "transform .15s",
          }}
        >
          <MessageSquarePlus size={22} />
        </button>
      )}

      {/* Overlay + Bottom Sheet */}
      {open && (
        <div
          onClick={reset}
          className="mp-overlay-in"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 250,
            background: "rgba(0,0,0,.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mp-sheet-up"
            style={{
              background: "#fff",
              borderRadius: "24px 24px 0 0",
              width: "100%",
              maxWidth: 480,
              overflow: "hidden",
              boxShadow: "0 -12px 40px rgba(0,0,0,.15)",
            }}
          >
            {/* Header */}
            <div style={{ background: "#1a3a24", padding: "20px 20px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
                  Ayúdanos a mejorar
                </div>
                <button
                  type="button"
                  onClick={reset}
                  style={{
                    background: "rgba(255,255,255,.15)",
                    border: "none",
                    borderRadius: 8,
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "rgba(255,255,255,.85)",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)" }}>
                ¿Algo falla o tienes una idea?
              </div>
            </div>

            {/* List of options */}
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {TYPES.map((t) => {
                const selected = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(selected ? null : t.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: selected ? "1.5px solid #2d5a3d" : "1px solid #e8ece9",
                      background: selected ? "#f0f9f3" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "all .15s",
                    }}
                  >
                    <div style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      background: t.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      flexShrink: 0,
                    }}>
                      {t.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#142f1d" }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: "#8d978f", marginTop: 1 }}>{t.sub}</div>
                    </div>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: selected ? "#2d5a3d" : "#d5ddd7",
                      flexShrink: 0,
                    }}>
                      {selected ? "✓" : "›"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Textarea + Send (visible only when type selected) */}
            {type && (
              <div style={{ padding: "0 14px calc(20px + env(safe-area-inset-bottom, 0px))" }}>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Cuéntanos qué pasó o qué mejorarías..."
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "11px 13px",
                    borderRadius: 12,
                    border: "1px solid #e0e5e2",
                    background: "#f7f9f8",
                    fontSize: 16,
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                    lineHeight: 1.5,
                    color: "#142f1d",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#2d5a3d"; e.target.style.background = "#fff"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#e0e5e2"; e.target.style.background = "#f7f9f8"; }}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={sending}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "14px",
                    borderRadius: 14,
                    border: "none",
                    background: "#2d5a3d",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: sending ? "default" : "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: sending ? 0.7 : 1,
                    transition: "opacity .15s",
                  }}
                >
                  <Send size={16} />
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
