import { WizardSheet } from "./ui.jsx";
import { ShieldCheck, Lock, FileText } from "./icons.jsx";
import { URL_PRIVACIDAD, URL_TERMINOS } from "../lib/legal.js";

const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * El único sitio donde se pide el "acepto" legal, en la app. Lo abre
 * GoogleButton (antes de entrar, si este dispositivo no lo ha dicho todavía) y
 * App.jsx (para quien ya tenía sesión de antes de que esto existiera).
 *
 * Misma carcasa que VisibilityPrompt (WizardSheet) y mismo botón primario que
 * "Continuar" en el onboarding (OnboardingShell): nada de chrome nuevo. Cerrar
 * con la X no es "rechazar" — es "ahora no": `onClose` no llama a `onAccept`,
 * así que no se guarda nada, y se vuelve a preguntar la próxima vez.
 */
export function LegalGate({ onAccept, onClose }) {
  return (
    <WizardSheet
      icon={ShieldCheck}
      iconColor="#2d5a3d"
      title="Antes de entrar"
      subtitle="Dos enlaces cortos, nada más"
      onClose={onClose}
    >
      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "#4f6a5a", lineHeight: 1.5 }}>
        Para montar vuestro menú guardamos quién vive en casa, alergias y lo que os gusta.
        Aquí tienes cómo lo cuidamos:
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <LinkRow icon={Lock} href={URL_PRIVACIDAD} label="Política de privacidad" />
        <LinkRow icon={FileText} href={URL_TERMINOS} label="Términos de uso" />
      </div>

      <button type="button" onClick={onAccept} style={ctaStyle}>
        Aceptar y continuar
      </button>
    </WizardSheet>
  );
}

function LinkRow({ icon: Icon, href, label }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={rowStyle}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={iconBubble}>
          <Icon size={15} color="#2d5a3d" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{label}</span>
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9ab0a1", flexShrink: 0 }}>Abrir ↗</span>
    </a>
  );
}

const iconBubble = {
  width: 28, height: 28, borderRadius: 9, background: "#eaf3ee",
  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

const rowStyle = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
  width: "100%", padding: "12px 13px", borderRadius: 14,
  border: "1.5px solid #e0eae3", background: "#fff",
  textDecoration: "none", cursor: "pointer", boxSizing: "border-box",
};

const ctaStyle = {
  width: "100%", padding: "14px", borderRadius: 12, border: "none",
  background: TEAL, color: "#fff", fontSize: 14, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 4px 18px rgba(15,118,110,.3)",
};
