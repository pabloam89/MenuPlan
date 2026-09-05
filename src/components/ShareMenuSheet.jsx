import { useState } from "react";
import { X, Share2, EyeOff, Check } from "lucide-react";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";
const BLUE = "#4a6fd4";
const CLAY = "#cf7833";

/**
 * Publicar el menú en Gente: elegir alcance y confirmar.
 *
 * Un solo componente para las dos puertas (la pantalla de Menú y el hueco
 * "Tu menú" del carrusel de Gente): es la misma decisión, y dos copias
 * divergirían en el copy de privacidad — que es justo lo que no puede
 * divergir.
 *
 * El aviso de qué se comparte vive AQUÍ, en el momento de decidir, y no como
 * banner permanente en Gente: un texto que ves siempre deja de leerse a la
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
            {shared ? "Tu menú está publicado" : "Publicar tu menú"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <ScopeOption
            on={scope === "week"}
            art="/avatares/cards/share_semana.png"
            tint={BLUE}
            title="La semana"
            desc="Todos los días planificados"
            onClick={() => setScope("week")}
          />
          <ScopeOption
            on={scope === "today"}
            art="/avatares/cards/share_hoy.png"
            tint={CLAY}
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
          {shared ? "Volver a publicar" : "Publicar en Gente"}
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

/**
 * Una de las dos formas de compartir.
 *
 * La ilustracion va SIN caja blanca detras (el png viene recortado con alfa),
 * asi que apagada se lee como un objeto sobre la hoja y no como una foto
 * pegada. Al elegirla se enciende: la tarjeta coge el color de esa opcion en
 * muy suave, el borde se tiñe y aparece un halo — el resalte es el color, no
 * un check escondido en una esquina.
 *
 * El texto se queda en la escala de tinta pase lo que pase: teñirlo del mismo
 * tono que el fondo es lo que convierte una tarjeta en pegatina.
 */
function ScopeOption({ on, art, tint, title, desc, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{
        ...scopeBox,
        borderColor: on ? tint : "#e6ede8",
        background: on ? `${tint}12` : "#fbfcfb",
        boxShadow: on ? `0 6px 18px -8px ${tint}80` : "none",
      }}>
      <img
        src={art}
        alt=""
        loading="lazy"
        style={{
          ...scopeArt,
          // Apagada, la ilustracion baja de saturacion: la que esta elegida
          // tiene que ser la que canta, no las dos a la vez.
          filter: on ? "none" : "saturate(.55) opacity(.75)",
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{title}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#6b7d70", marginTop: 1, lineHeight: 1.3 }}>{desc}</span>
      {on && <span style={{ ...scopeCheck, background: tint }}><Check size={10} color="#fff" strokeWidth={3.4} /></span>}
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
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "10px 10px 12px", borderRadius: 16, border: "2px solid #e6ede8",
  cursor: "pointer", fontFamily: "inherit", textAlign: "center",
  transition: "background .18s ease, border-color .18s ease, box-shadow .18s ease",
};

const scopeArt = {
  width: 76, height: 76, display: "block", marginBottom: 2,
  transition: "filter .18s ease",
};

const scopeCheck = {
  position: "absolute", top: 8, right: 8,
  width: 17, height: 17, borderRadius: "50%",
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
