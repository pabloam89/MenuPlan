import { useEffect, useState } from "react";
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
  Check,
} from "lucide-react";
import { WizardSheet } from "./ui.jsx";

const PANTRY_PREF_IMG = (slug) => `/avatares/cards/pantry_prefs/${slug}.png`;

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
          img="/avatares/cards/modo_sencillo.jpg"
          title="Modo sencillo"
          subtitle="Comidas y cenas, y decidimos el resto por ti."
          onClick={() => onChoose(false)}
        />
        <ModeIllustCard
          img="/avatares/cards/modo_avanzado.jpg"
          title="Modo avanzado"
          subtitle="Tú controlas desayunos, meriendas, despensa y cocina."
          onClick={() => onChoose(true)}
        />
      </div>
    </WizardSheet>
  );
}

// ── Cuestionario «En casa» (modo avanzado) ──
// 4 preguntas × 12 opciones ilustradas. Nevera + despensa + congelador.
// El usuario elige y pulsa Continuar (no avanza al primer toque).
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
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5f7568", marginTop: 3, lineHeight: 1.35 }}>{subtitle}</span>
        )}
      </span>
    </button>
  );
}

const PANTRY_QUESTIONS = [
  {
    key: "apply",
    title: "¿Cuándo cuenta lo de casa?",
    subtitle: "Nevera, despensa y congelador. Elige una opción.",
    options: [
      {
        id: "snapshot",
        img: PANTRY_PREF_IMG("snapshot"),
        Icon: Camera,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Solo al generar el menú",
        subtitle: "Foto fija de lo que hay; luego no cambia sola.",
      },
      {
        id: "onShop",
        img: PANTRY_PREF_IMG("onShop"),
        Icon: ShoppingCart,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "También al comprar",
        subtitle: "Se actualiza al subir ticket o marcar la compra.",
      },
      {
        id: "live",
        img: PANTRY_PREF_IMG("live"),
        Icon: RefreshCw,
        iconColor: "#2f6d8a",
        iconBg: "#e0eef5",
        title: "Siempre al día",
        subtitle: "También al marcar platos como cocinados.",
      },
    ],
  },
  {
    key: "multiWeek",
    title: "¿Qué semana usa tu stock?",
    subtitle: "Si planificas varias semanas a la vez. Elige una.",
    options: [
      {
        id: "nearest",
        img: PANTRY_PREF_IMG("nearest"),
        Icon: CalendarDays,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Solo la primera semana",
        subtitle: "Lo de casa cuenta para la semana más cercana.",
      },
      {
        id: "all",
        img: PANTRY_PREF_IMG("all"),
        Icon: CalendarRange,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "En todas por igual",
        subtitle: "Cada semana asume el mismo stock en casa.",
      },
      {
        id: "spread",
        img: PANTRY_PREF_IMG("spread"),
        Icon: Layers,
        iconColor: "#2f6d8a",
        iconBg: "#e0eef5",
        title: "Restando semana a semana",
        subtitle: "Lo gastado en una ya no cuenta en la siguiente.",
      },
    ],
  },
  {
    key: "lifecycle",
    title: "¿Qué pasa con lo que sobra?",
    subtitle: "Al empezar una semana nueva. Elige una.",
    options: [
      {
        id: "weekly",
        img: PANTRY_PREF_IMG("weekly"),
        Icon: RotateCcw,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Revisar cada semana",
        subtitle: "Vuelves a contar nevera, despensa y congelador.",
      },
      {
        id: "persist",
        img: PANTRY_PREF_IMG("persist"),
        Icon: Archive,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "Lo que sobra sigue",
        subtitle: "No se borra: sigue disponible la semana siguiente.",
      },
    ],
  },
  {
    key: "consume",
    title: "¿Cuándo baja el stock?",
    subtitle: "Al usar ingredientes del menú. Elige una.",
    options: [
      {
        id: "endOfDay",
        img: PANTRY_PREF_IMG("endOfDay"),
        Icon: Sprout,
        iconColor: "#2f6d8a",
        iconBg: "#e0eef5",
        title: "Al final del día",
        subtitle: "Resto sola lo de ayer si no lo marcaste tú.",
      },
      {
        id: "onGenerate",
        img: PANTRY_PREF_IMG("onGenerate"),
        Icon: Zap,
        iconColor: "#2d5a3d",
        iconBg: "#e7f3ec",
        title: "Al generar el menú",
        subtitle: "Todo el menú se descuenta de golpe al crearlo.",
      },
      {
        id: "onCook",
        img: PANTRY_PREF_IMG("onCook"),
        Icon: ChefHat,
        iconColor: "#8a5a00",
        iconBg: "#fbeecd",
        title: "Al marcar «Cocinado»",
        subtitle: "Plato a plato, cuando lo cocinas de verdad.",
      },
      {
        id: "none",
        img: PANTRY_PREF_IMG("none"),
        Icon: Pencil,
        iconColor: "#7a5a8a",
        iconBg: "#f1e7f7",
        title: "Solo a mano",
        subtitle: "Yo lo edito en En casa cuando quiera.",
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
      <p style={{
        margin: "0 0 12px", fontSize: 12, fontWeight: 800, color: "#2d5a3d",
        textAlign: "center", letterSpacing: ".02em",
      }}
      >
        Pregunta {step + 1} de {PANTRY_QUESTIONS.length} · Toca una opción
      </p>

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
