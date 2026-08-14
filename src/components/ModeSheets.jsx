import { useState } from "react";
import {
  SlidersHorizontal,
  Refrigerator,
  Camera,
  ShoppingCart,
  RefreshCw,
  CalendarDays,
  CalendarRange,
  Layers,
  RotateCcw,
  Archive,
  Sprout,
  Zap,
  ChefHat,
  Pencil,
  ChevronLeft,
} from "lucide-react";
import { WizardSheet, WizardOptionCard } from "./ui.jsx";

// ── Selector inicial de modo (básico vs avanzado) ──
// Se muestra una vez, tras el spotlight de Inicio. Si el usuario lo cierra sin
// elegir, se queda en modo básico (progressive disclosure por defecto).
function ModeIllustCard({ img, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: 0,
        overflow: "hidden",
        borderRadius: 15,
        border: "2px solid #e0eae3",
        background: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
      }}
    >
      <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#f4f7f5" }}>
        <img
          src={img}
          alt=""
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
      <div style={{ padding: "8px 6px 10px", textAlign: "center", color: "#142f1d" }}>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2, opacity: 0.85, lineHeight: 1.25 }}>
          {subtitle}
        </div>
      </div>
    </button>
  );
}

export function ModeSelectSheet({ onChoose, onDismiss }) {
  return (
    <WizardSheet
      icon={SlidersHorizontal}
      title="¿Cómo quieres usar la app?"
      subtitle="Puedes cambiarlo cuando quieras desde Inicio."
      onClose={onDismiss}
      maxWidth={340}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <ModeIllustCard
          img="/avatares/cards/modo_sencillo.png"
          title="Modo sencillo"
          subtitle="Comidas y cenas, y decidimos el resto por ti."
          onClick={() => onChoose(false)}
        />
        <ModeIllustCard
          img="/avatares/cards/modo_avanzado.png"
          title="Modo avanzado"
          subtitle="Tú controlas desayunos, meriendas, despensa y cocina."
          onClick={() => onChoose(true)}
        />
      </div>
    </WizardSheet>
  );
}

// ── Cuestionario de despensa (solo modo avanzado) ──
// Las 4 decisiones sobre cómo la despensa interactúa con el menú. One-select por
// pregunta, con la posibilidad de responder más tarde. En modo básico no se
// pregunta nada: se asumen los defaults sencillos.
const PANTRY_QUESTIONS = [
  {
    key: "apply",
    title: "¿Cuándo mira el menú tu despensa?",
    subtitle: "Si el menú se reajusta al cambiar tus existencias.",
    options: [
      {
        id: "snapshot",
        Icon: Camera,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Solo al crear el menú",
        subtitle: "Uso lo que hay al generarlo; luego no cambia solo.",
      },
      {
        id: "onShop",
        Icon: ShoppingCart,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "También al comprar",
        subtitle: "Se reajusta cuando registras una compra o un ticket.",
      },
      {
        id: "live",
        Icon: RefreshCw,
        iconColor: "#2f6d8a",
        iconBg: "#e0eef5",
        title: "Siempre",
        subtitle: "Se reajusta también al marcar platos como cocinados.",
      },
    ],
  },
  {
    key: "multiWeek",
    title: "¿A qué semana aplico tu despensa?",
    subtitle: "Cómo repartes tu despensa cuando planificas varias semanas de golpe.",
    options: [
      {
        id: "nearest",
        Icon: CalendarDays,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Solo a la más cercana",
        subtitle: "Lo de casa cuenta para la primera semana.",
      },
      {
        id: "all",
        Icon: CalendarRange,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "A todas",
        subtitle: "Cada semana asume que tienes lo mismo en casa.",
      },
      {
        id: "spread",
        Icon: Layers,
        iconColor: "#2f6d8a",
        iconBg: "#e0eef5",
        title: "Resta",
        subtitle: "Lo que gasta una semana no cuenta para la siguiente.",
      },
    ],
  },
  {
    key: "lifecycle",
    title: "¿Qué pasa con la despensa cada semana?",
    subtitle: "Qué hago con lo que quedó de la semana anterior.",
    options: [
      {
        id: "weekly",
        Icon: RotateCcw,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Se resetea cada semana",
        subtitle: "Reviso lo que hay al empezar cada semana.",
      },
      {
        id: "persist",
        Icon: Archive,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "Persiste siempre",
        subtitle: "No se borra: lo que sobra sigue disponible después.",
      },
    ],
  },
  {
    key: "consume",
    title: "¿Cuándo descuento lo que uso?",
    subtitle: "En qué momento baja el stock de tu despensa.",
    options: [
      {
        id: "endOfDay",
        Icon: Sprout,
        iconColor: "#2f6d8a",
        iconBg: "#e0eef5",
        title: "Al final del día",
        subtitle: "Resto sola lo del día anterior si no lo marcaste tú.",
      },
      {
        id: "onGenerate",
        Icon: Zap,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Al generar el menú",
        subtitle: "Resto el menú entero de golpe al crearlo.",
      },
      {
        id: "onCook",
        Icon: ChefHat,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "Al darle a «Cocinado»",
        subtitle: "Resto cada plato cuando lo marcas como cocinado.",
      },
      {
        id: "none",
        Icon: Pencil,
        iconColor: "#7a5a8a",
        iconBg: "#f1e7f7",
        title: "No descontar",
        subtitle: "Solo baja cuando lo edito yo en «En casa».",
      },
    ],
  },
];

export function PantryPrefsWizard({ initial, onComplete, onLater }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => ({ ...(initial ?? {}) }));

  const q = PANTRY_QUESTIONS[step];
  const isLast = step === PANTRY_QUESTIONS.length - 1;
  const current = answers[q.key];

  const pick = (optId) => {
    const next = { ...answers, [q.key]: optId };
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
      maxWidth={340}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.options.map((opt) => (
          <div key={opt.id} style={{ position: "relative" }}>
            <WizardOptionCard
              icon={opt.Icon}
              iconColor={opt.iconColor}
              iconBg={opt.iconBg}
              title={opt.title}
              subtitle={opt.subtitle}
              onClick={() => pick(opt.id)}
            />
            {current === opt.id && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 10,
                  right: 12,
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: "#2d5a3d",
                  background: "#e7f3ec",
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
              >
                Actual
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Footer: divisor + progreso a la izquierda, "Atrás" a la derecha, y
          "Responder más tarde" centrado debajo — mismo lenguaje visual que el
          resto de la app. */}
      <div style={{ height: 1, background: "#dce9e1", margin: "18px 0 12px" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
        <div style={{ display: "flex", gap: 5 }}>
          {PANTRY_QUESTIONS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 999,
                background: i === step ? "#2d5a3d" : "#cfe0d6",
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
      <button
        type="button"
        onClick={onLater}
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
        Responder más tarde
      </button>
    </WizardSheet>
  );
}
