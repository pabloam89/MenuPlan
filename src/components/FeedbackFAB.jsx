import { useState, useRef, useEffect } from "react";
import { MessageSquarePlus, Send, X } from "lucide-react";
import { submitFeedback } from "../lib/feedback.js";
import { BOTTOM_NAV_HEIGHT } from "./ui.jsx";

const TYPES = [
  { id: "bug",     emoji: "🐛", label: "Bug" },
  { id: "menu",    emoji: "🍽️", label: "Menú" },
  { id: "diseno",  emoji: "🎨", label: "Diseño" },
  { id: "idea",    emoji: "💡", label: "Idea" },
];

export function FeedbackFAB({ user, screen, onToast }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open]);

  const reset = () => {
    setType(null);
    setMessage("");
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (!type) return;
    setSending(true);
    try {
      await submitFeedback({
        type,
        message: message.trim(),
        screen,
        user,
      });
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
              padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 -12px 40px rgba(0,0,0,.15)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#142f1d" }}>
                ¿Qué pasó?
              </div>
              <button
                type="button"
                onClick={reset}
                style={{
                  background: "none",
                  border: "none",
                  padding: 4,
                  cursor: "pointer",
                  color: "#8d978f",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Emoji grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "12px 4px",
                    borderRadius: 14,
                    border: type === t.id ? "2px solid #2d5a3d" : "1.5px solid #e8ece9",
                    background: type === t.id ? "#e8f5ed" : "#fafcfa",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all .15s",
                  }}
                >
                  <span style={{ fontSize: 24 }}>{t.emoji}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: type === t.id ? "#1a3a24" : "#4a5a4d",
                  }}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Textarea (opcional) */}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="(Opcional) Cuéntanos más..."
              rows={2}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1.5px solid #e0e5e2",
                background: "#f7f9f8",
                fontSize: 14,
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

            {/* Pantalla indicator */}
            <div style={{ fontSize: 11, color: "#a0a8a2", marginTop: 8, marginBottom: 14 }}>
              Pantalla: {screen}
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!type || sending}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 14,
                border: "none",
                background: !type ? "#c8d0cb" : "#2d5a3d",
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
                cursor: !type ? "default" : "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "background .15s",
                opacity: sending ? 0.7 : 1,
              }}
            >
              <Send size={16} />
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
