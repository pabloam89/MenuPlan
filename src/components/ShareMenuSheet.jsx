import { useState } from "react";
import { X, CalendarDays, CalendarClock, Share2, EyeOff, Check } from "lucide-react";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * Publicar el menú en el Feed: elegir alcance y confirmar.
 *
 * Un solo componente para las dos puertas (la pantalla de Menú y el hueco
 * "Tu menú" del carrusel del Feed): es la misma decisión, y dos copias
 * divergirían en el copy de privacidad — que es justo lo que no puede
 * divergir.
 *
 * El aviso de qué se comparte vive AQUÍ, en el momento de decidir, y no como
 * banner permanente en el Feed: un texto que ves siempre deja de leerse a la
 * segunda visita; uno que aparece al ir a publicar se lee cuando importa.
 *
 * Dos alcances y ya — la semana o solo hoy. "Algunas semanas" o "solo este
 * plato" quedaron fuera a propósito: la unidad del producto es la semana, y
 * el plato de hoy ya es la cara visible del menú publicado en «Hoy cocinan».
 */
export function ShareMenuSheet({ shared = false, sharing = false, onPublish, onUnpublish, onClose }) {
  const [scope, setScope] = useState("week");

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Share2 size={16} strokeWidth={2.5} color={TEAL} />
          <h2 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 900, color: INK }}>
            {shared ? "Tu menú está en el feed" : "Publicar tu menú"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <ScopeOption
            on={scope === "week"}
            Icon={CalendarDays}
            title="La semana"
            desc="Todos los días planificados"
            onClick={() => setScope("week")}
          />
          <ScopeOption
            on={scope === "today"}
            Icon={CalendarClock}
            title="Solo hoy"
            desc="Lo que coméis hoy y ya"
            onClick={() => setScope("today")}
          />
        </div>

        {/* Qué sale y qué no, corto: dos frases, en el momento de decidir. */}
        <p style={privacyNote}>
          Se comparten los platos y los avatares de quién come.
          La compra, el presupuesto y vuestros horarios se quedan en casa.
        </p>

        <button
          type="button"
          disabled={sharing}
          onClick={() => onPublish?.(scope)}
          style={publishBtn}
        >
          <Share2 size={14} strokeWidth={2.6} />
          {shared ? "Volver a publicar" : "Publicar en el feed"}
        </button>

        {shared && (
          <button type="button" disabled={sharing} onClick={onUnpublish} style={retireBtn}>
            <EyeOff size={13} strokeWidth={2.5} /> Retirar del feed
          </button>
        )}
      </div>
    </div>
  );
}

function ScopeOption({ on, Icon, title, desc, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ ...scopeBox, borderColor: on ? TEAL : "#e0eae3", background: on ? "#eef6f4" : "#fff" }}>
      <Icon size={17} strokeWidth={2.4} color={on ? TEAL : "#8aa294"} />
      <span style={{ fontSize: 13, fontWeight: 800, color: INK, marginTop: 5 }}>{title}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#6b7d70", marginTop: 1, lineHeight: 1.3 }}>{desc}</span>
      {on && <span style={scopeCheck}><Check size={10} color="#fff" strokeWidth={3.4} /></span>}
    </button>
  );
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 310,
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

const scopeBox = {
  position: "relative", flex: 1,
  display: "flex", flexDirection: "column", alignItems: "flex-start",
  padding: "12px 12px 11px", borderRadius: 14, border: "2px solid #e0eae3",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const scopeCheck = {
  position: "absolute", top: 8, right: 8,
  width: 17, height: 17, borderRadius: "50%", background: TEAL,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const privacyNote = {
  margin: "12px 0 0", fontSize: 11.5, fontWeight: 600, color: "#6b7d70", lineHeight: 1.45,
};

const publishBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
  width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, border: "none",
  background: GREEN, color: "#fff", fontSize: 13.5, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit",
};

const retireBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  width: "100%", marginTop: 8, padding: "10px", borderRadius: 12,
  border: "1.5px solid #e6cfc9", background: "#fff", color: "#c0392b",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
