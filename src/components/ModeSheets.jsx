import { useEffect, useState } from "react";
import {
  Refrigerator,
  CalendarDays,
  Zap,
  ChefHat,
  ChevronLeft,
  Check,
  BookOpen,
  Globe,
} from "lucide-react";
import { WizardSheet } from "./ui.jsx";

const PANTRY_PREF_IMG = (slug) => `/avatares/cards/pantry_prefs/${slug}.png`;

// ── Ajustes «En casa» ──
// Una sola pregunta ilustrada: cuándo se da por gastado lo de casa. El usuario
// elige y pulsa Guardar (no avanza al primer toque).
function PantryPrefOptionCard({
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

const PANTRY_QUESTIONS = [
  {
    key: "consume",
    title: "¿Cuándo damos por gastado lo de casa?",
    subtitle: "Cuando el menú usa algo que ya tienes.",
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
  },
];

export function PantryPrefsWizard({ initial, onComplete, onLater }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => ({ ...(initial ?? {}) }));
  const [pending, setPending] = useState(null);

  const q = PANTRY_QUESTIONS[step];
  const isLast = step === PANTRY_QUESTIONS.length - 1;

  useEffect(() => {
    setPending(answers[q.key] ?? null);
  }, [step, q.key, answers]);

  const confirm = () => {
    if (!pending) return;
    const next = { ...answers, [q.key]: pending };
    setAnswers(next);
    if (isLast) onComplete(next);
    else setStep((s) => s + 1);
  };

  return (
    <WizardSheet
      icon={Refrigerator}
      title={q.title}
      subtitle={q.subtitle}
      onClose={onLater}
      maxWidth={360}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((opt) => (
          <PantryPrefOptionCard
            key={opt.id}
            img={opt.img}
            Icon={opt.Icon}
            iconColor={opt.iconColor}
            iconBg={opt.iconBg}
            title={opt.title}
            subtitle={opt.subtitle}
            selected={pending === opt.id}
            onSelect={() => setPending(opt.id)}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={!pending}
        onClick={confirm}
        style={{
          display: "block",
          width: "100%",
          marginTop: 14,
          padding: "12px 16px",
          borderRadius: 14,
          border: "none",
          background: pending ? "#2d5a3d" : "#cfe0d6",
          color: pending ? "#fff" : "#8aa396",
          fontSize: 14,
          fontWeight: 800,
          cursor: pending ? "pointer" : "default",
          fontFamily: "inherit",
          transition: "background .15s ease, color .15s ease",
        }}
      >
        {isLast ? "Guardar preferencias" : "Continuar"}
      </button>

      {/* Con una sola pregunta el punto de progreso y el "Atrás" sobran; el
          bloque se mantiene por si vuelven a haber varias. */}
      {PANTRY_QUESTIONS.length > 1 && (
        <>
          <div style={{ height: 1, background: "#dce9e1", margin: "16px 0 12px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {PANTRY_QUESTIONS.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === step ? "#2d5a3d" : i < step ? "#7ab896" : "#cfe0d6",
                    transition: "width .2s ease, background .2s ease",
                  }}
                />
              ))}
            </div>
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  border: "none",
                  background: "transparent",
                  color: "#4f6a5a",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: "6px 2px",
                }}
              >
                <ChevronLeft size={15} strokeWidth={2.4} />
                Atrás
              </button>
            ) : (
              <span style={{ width: 1 }} />
            )}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={onLater}
        style={{
          display: "block",
          width: "100%",
          // Sin la fila de progreso hace falta algo de aire propio.
          marginTop: PANTRY_QUESTIONS.length > 1 ? 8 : 14,
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
        Responder más tarde
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
