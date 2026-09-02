import { WizardSheet } from "./ui.jsx";
import { Eye } from "lucide-react";

const INK = "#142f1d";

/**
 * "¿Quién te puede encontrar?", una sola vez.
 *
 * Desde 0038 un perfil nuevo nace en 'followers': te encuentran por tu
 * nombre, pero tu contenido solo lo ve quien tú aceptes. Antes nacía privado
 * y la parte social arrancaba vacía para todo el mundo — gente con cuenta
 * buscándose sin encontrarse jamás, porque la decisión vivía escondida en un
 * ajuste que nadie visitaba.
 *
 * Justamente por eso esta pantalla ya no pide permiso: AVISA. Si abrimos el
 * valor por defecto, hay que decirlo a la cara la primera vez y dejar la
 * puerta de salida al lado. Por eso arriba se lee en qué estado estás ahora,
 * y la opción actual va marcada.
 *
 * Se enseña al entrar al Feed -el único momento en que importa- y UNA vez:
 * conteste lo que conteste, no se insiste. Cambiar de idea es ir a Mi perfil,
 * como cualquier otro ajuste.
 *
 * Lo único que va destacado es donde ESTÁS, nunca donde nos conviene que
 * vayas: "cualquiera" no se pone primera ni se resalta. Usar un momento de
 * confianza para ganar alcance sería justo lo contrario de lo que esta
 * pantalla está haciendo.
 *
 * La carcasa es WizardSheet (el modal de decisión de la casa), pero las filas
 * van a medida: el `img` de WizardOptionCard enmarca en teal y recorta, que
 * es lo correcto para una foto y no para estos recortes con transparencia.
 */
export function VisibilityPrompt({ current = "followers", onChoose, onClose }) {
  return (
    <WizardSheet
      icon={Eye}
      title="¿Quién te puede encontrar?"
      subtitle={SUBTITLE[current] ?? SUBTITLE.followers}
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* El estado actual va PRIMERO y marcado: la pantalla existe para
            contarte donde estas, no para llevarte a otro sitio. */}
        <Option
          art="/avatares/cards/vis_seguidores.png"
          tint="#7a4e00"
          now={current === "followers"}
          title="Solo quien yo acepte"
          subtitle="Te encuentran por tu nombre, pero tienen que pedirte seguirte."
          onClick={() => onChoose("followers")}
        />
        <Option
          art="/avatares/cards/vis_cualquiera.png"
          tint="#2d5a3d"
          now={current === "public"}
          title="Que me encuentre cualquiera"
          subtitle="Tus recetas y menús publicados los ve todo el mundo."
          onClick={() => onChoose("public")}
        />
        <Option
          art="/avatares/cards/vis_nadie.png"
          tint="#5a2d7a"
          now={current === "private"}
          title="Nadie"
          subtitle="Invisible en las búsquedas. Puedes mirar el feed igual."
          onClick={() => onChoose("private")}
        />
      </div>
    </WizardSheet>
  );
}

const SUBTITLE = {
  followers: "Ahora mismo te pueden encontrar por tu nombre, pero lo que publicas solo lo ve quien tú aceptes. Puedes cambiarlo aquí o luego desde Mi perfil.",
  public: "Ahora mismo cualquiera puede encontrarte y ver lo que publicas. Puedes cambiarlo aquí o luego desde Mi perfil.",
  private: "Ahora mismo no sales en las búsquedas de nadie. Puedes cambiarlo aquí o luego desde Mi perfil.",
};

/** Los mismos tres colores de privacidad que usa Mi perfil. */
function Option({ art, tint, now = false, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...row, borderColor: now ? tint : `${tint}33`, background: now ? `${tint}0c` : "#fff" }}
    >
      <img src={art} alt="" style={{ width: 46, height: 46, display: "block", flexShrink: 0 }} />
      <span style={{ minWidth: 0, textAlign: "left", flex: 1 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: INK }}>
          {title}
          {now && <span style={{ ...nowTag, background: tint }}>Ahora</span>}
        </span>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#6b7d70", marginTop: 2, lineHeight: 1.35 }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

const nowTag = {
  marginLeft: 6, padding: "2px 7px", borderRadius: 999,
  color: "#fff", fontSize: 9.5, fontWeight: 800, verticalAlign: "middle",
};

const row = {
  display: "flex", alignItems: "center", gap: 12, width: "100%",
  padding: "10px 12px", borderRadius: 18,
  border: "1.5px solid #e0eae3", background: "#fff",
  cursor: "pointer", fontFamily: "inherit",
};
