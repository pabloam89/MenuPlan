import { useState } from "react";
import {
  CalendarDays,
  Zap,
  ChefHat,
  Check,
  BookOpen,
  Globe,
  Refrigerator,
} from "lucide-react";
import { WizardSheet } from "./ui.jsx";

const PANTRY_PREF_IMG = (slug) => `/avatares/cards/pantry_prefs/${slug}.png`;

// ── Ajustes «En casa» ──
// Una sola pregunta ilustrada: cuándo se da por gastado lo de casa. El usuario
// elige y pulsa Guardar (no avanza al primer toque).
export function PantryPrefOptionCard({
  img, Icon, iconColor, iconBg, title, subtitle, selected, onSelect,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(img) && !imgFailed;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 16,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        border: `2px solid ${selected ? "#2d5a3d" : "#d7e6dc"}`,
        background: selected ? "#eef6f0" : "#fff",
        boxShadow: selected ? "0 4px 14px rgba(45,90,61,.14)" : "0 4px 12px -10px rgba(20,47,29,.28)",
        transition: "border-color .15s ease, background .15s ease, box-shadow .15s ease",
      }}
    >
      <span
        style={{
          position: "relative",
          flex: "0 0 auto",
          width: 72,
          height: 72,
          borderRadius: 14,
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: iconBg,
          border: showImg ? "2px solid #cfe0d6" : "none",
        }}
      >
        {showImg ? (
          <img
            src={img}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Icon size={24} color={iconColor} strokeWidth={2.2} />
        )}
        {selected && (
          <span
            aria-hidden
            style={{
              position: "absolute", top: 4, right: 4,
              width: 18, height: 18, borderRadius: "50%",
              background: "#2d5a3d",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,.2)",
            }}
          >
            <Check size={11} color="#fff" strokeWidth={3} />
          </span>
        )}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "#142f1d", lineHeight: 1.25 }}>{title}</span>
        {subtitle && (
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#42594c", marginTop: 3, lineHeight: 1.35 }}>{subtitle}</span>
        )}
      </span>
    </button>
  );
}

// La pregunta de "cuándo se da por gastado lo de casa" pasó por dos sitios
// antes de este (2026-08-26): un sheet modal aquí mismo, y luego un paso
// condicional del wizard de onboarding — ambos retirados, porque la pregunta
// se entiende mejor mirando la despensa real que en abstracto. Ahora vive
// como sheet contextual en Compra → En casa (PantryPrefsSheet más abajo):
// aparece sola la primera vez que entras ahí tras tener un menú activo, y el
// icono de ajustes de esa pestaña la reabre cuando quieras.
export const PANTRY_CONSUME_QUESTION = {
  title: "¿Cuándo damos por gastado lo de casa?",
  subtitle: "Cuando el menú usa algo que acabas de añadir.",
  options: [
    {
      id: "onGenerate",
      img: PANTRY_PREF_IMG("onGenerate"),
      Icon: Zap,
      iconColor: "#2d5a3d",
      iconBg: "#e7f3ec",
      title: "Al crear el menú",
      subtitle: "Se descuenta todo de una vez al generarlo.",
    },
    {
      id: "endOfDay",
      img: PANTRY_PREF_IMG("endOfDay"),
      Icon: CalendarDays,
      iconColor: "#2f6d8a",
      iconBg: "#e0eef5",
      title: "Al final del día",
      subtitle: "Damos por comido lo de cada día cuando pasa.",
    },
    {
      id: "onCook",
      img: PANTRY_PREF_IMG("onCook"),
      Icon: ChefHat,
      iconColor: "#8a5a00",
      iconBg: "#fbeecd",
      title: "Al marcarlo cocinado",
      subtitle: "Solo cuando marcas el plato como hecho.",
    },
  ],
};

export function PantryPrefsSheet({ initial, onComplete, onClose }) {
  const [selected, setSelected] = useState(initial ?? "onCook");

  return (
    <WizardSheet
      icon={Refrigerator}
      title={PANTRY_CONSUME_QUESTION.title}
      subtitle={PANTRY_CONSUME_QUESTION.subtitle}
      onClose={onClose}
      maxWidth={360}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PANTRY_CONSUME_QUESTION.options.map((opt) => (
          <PantryPrefOptionCard
            key={opt.id}
            img={opt.img}
            Icon={opt.Icon}
            iconColor={opt.iconColor}
            iconBg={opt.iconBg}
            title={opt.title}
            subtitle={opt.subtitle}
            selected={selected === opt.id}
            onSelect={() => setSelected(opt.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onComplete(selected)}
        style={{
          display: "block",
          width: "100%",
          marginTop: 14,
          padding: "12px 16px",
          borderRadius: 14,
          border: "none",
          background: "#2d5a3d",
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Guardar
      </button>

      <button
        type="button"
        onClick={onClose}
        style={{
          display: "block",
          width: "100%",
          marginTop: 8,
          border: "none",
          background: "transparent",
          color: "#7a9080",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "6px 2px",
          textAlign: "center",
        }}
      >
        Cerrar
      </button>
    </WizardSheet>
  );
}

// ── Wizard de preferencias de recetas ──────────────────────────────────────
// Una sola pregunta: de dónde saca recetas el planificador al generar el menú.

const RECIPE_PREF_IMG = (slug) => `/avatares/cards/${slug}.png`;

const RECIPE_OPTIONS = [
  {
    id: "preferred",
    img: RECIPE_PREF_IMG("recetas_preferir_mias"),
    Icon: BookOpen,
    iconColor: "#2d5a3d",
    iconBg: "#e6f3ea",
    title: "Preferir las mías",
    subtitle: "Usa tus recetas siempre que puede; el catálogo cubre el resto.",
  },
  {
    id: "only",
    img: RECIPE_PREF_IMG("recetas_solo_mias"),
    Icon: BookOpen,
    iconColor: "#7a4e00",
    iconBg: "#fff8e7",
    title: "Solo las mías",
    subtitle: "El menú se genera únicamente con tus recetas propias.",
  },
  {
    id: "catalog",
    img: RECIPE_PREF_IMG("recetas_solo_catalog"),
    Icon: Globe,
    iconColor: "#5a2d7a",
    iconBg: "#f5edfc",
    title: "Solo catálogo",
    subtitle: "El menú usa únicamente el catálogo de recetas.",
  },
];

export function RecipePrefsWizard({ initial, onComplete, onClose }) {
  const [selected, setSelected] = useState(initial ?? "preferred");

  return (
    <WizardSheet
      icon={BookOpen}
      title="Recetas en el menú"
      subtitle="¿De dónde sacamos las recetas al generarlo?"
      onClose={onClose}
      maxWidth={360}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RECIPE_OPTIONS.map((opt) => (
          <PantryPrefOptionCard
            key={opt.id}
            img={opt.img}
            Icon={opt.Icon}
            iconColor={opt.iconColor}
            iconBg={opt.iconBg}
            title={opt.title}
            subtitle={opt.subtitle}
            selected={selected === opt.id}
            onSelect={() => setSelected(opt.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onComplete(selected)}
        style={{
          display: "block",
          width: "100%",
          marginTop: 14,
          padding: "12px 16px",
          borderRadius: 14,
          border: "none",
          background: "#2d5a3d",
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Guardar preferencias
      </button>

      <button
        type="button"
        onClick={onClose}
        style={{
          display: "block",
          width: "100%",
          marginTop: 8,
          border: "none",
          background: "transparent",
          color: "#7a9080",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "6px 2px",
          textAlign: "center",
        }}
      >
        Cerrar
      </button>
    </WizardSheet>
  );
}
