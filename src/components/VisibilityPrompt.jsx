import { WizardSheet } from "./ui.jsx";
import { Eye } from "lucide-react";

const INK = "#142f1d";

/**
 * "¿Quieres que te encuentren?", una sola vez.
 *
 * Todo perfil nace PRIVADO: nadie se vuelve buscable sin decidirlo. Eso está
 * bien, pero tenía un efecto secundario feo — la red social arrancaba vacía
 * para todo el mundo, porque la decisión vivía escondida en ajustes y nadie
 * la tomaba nunca. Gente con cuenta buscándose sin encontrarse jamás.
 *
 * Se pregunta al entrar al Feed, que es el único momento en que la respuesta
 * le importa a quien la contesta, y se pregunta UNA vez: conteste lo que
 * conteste, no se vuelve a insistir. Cambiar de idea es ir a Mi perfil, como
 * cualquier otro ajuste.
 *
 * Las tres opciones pesan lo mismo a propósito: ninguna va destacada ni de
 * primera por ser la que más nos conviene. Empujar hacia "cualquiera" sería
 * usar un momento de confianza para ganar alcance, y la privacidad es
 * justamente lo que esta pantalla está preguntando.
 *
 * La carcasa es WizardSheet (el modal de decisión de la casa), pero las filas
 * van a medida: el `img` de WizardOptionCard enmarca en teal y recorta, que
 * es lo correcto para una foto y no para estos recortes con transparencia.
 */
export function VisibilityPrompt({ onChoose, onClose }) {
  return (
    <WizardSheet
      icon={Eye}
      title="¿Quieres que te encuentren?"
      subtitle="Ahora mismo tu perfil es privado: no sales en las búsquedas de nadie. Puedes cambiarlo cuando quieras desde Mi perfil."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Option
          art="/avatares/cards/vis_cualquiera.png"
          tint="#2d5a3d"
          title="Que me encuentre cualquiera"
          subtitle="Tus recetas y menús publicados los ve todo el mundo."
          onClick={() => onChoose("public")}
        />
        <Option
          art="/avatares/cards/vis_seguidores.png"
          tint="#7a4e00"
          title="Solo quien yo acepte"
          subtitle="Te encuentran por tu nombre, pero tienen que pedirte seguirte."
          onClick={() => onChoose("followers")}
        />
        <Option
          art="/avatares/cards/vis_nadie.png"
          tint="#5a2d7a"
          title="Nadie, de momento"
          subtitle="Sigues invisible. Puedes mirar el feed igual."
          onClick={() => onChoose("private")}
        />
      </div>
    </WizardSheet>
  );
}

/** Los mismos tres colores de privacidad que usa Mi perfil. */
function Option({ art, tint, title, subtitle, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ ...row, borderColor: `${tint}33` }}>
      <img src={art} alt="" style={{ width: 46, height: 46, display: "block", flexShrink: 0 }} />
      <span style={{ minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: INK }}>{title}</span>
        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#6b7d70", marginTop: 2, lineHeight: 1.35 }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

const row = {
  display: "flex", alignItems: "center", gap: 12, width: "100%",
  padding: "10px 12px", borderRadius: 18,
  border: "1.5px solid #e0eae3", background: "#fff",
  cursor: "pointer", fontFamily: "inherit",
};
