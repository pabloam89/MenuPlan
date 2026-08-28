import { useState } from "react";
import { BriefcaseBusiness, Check, Moon, Shuffle, Sun, Sunset } from "lucide-react";
import {
  migrateCookTime,
  writeCookTimeMode,
  writeCookTimePeriod,
  writeCookTimeShared,
  COOK_LEVELS,
  cookLevelMinutes,
  cookLevelForMinutes,
} from "../lib/cookTime.js";
import { cookDayCounts, getMeals } from "../lib/planner.js";

const PERIODS = [
  { key: "weekday", label: "Entre semana", icon: BriefcaseBusiness },
  { key: "weekend", label: "Fin de semana", icon: Sunset },
];

function plannedMealTargets(plannedMeals) {
  const hasComida = plannedMeals.includes("Comida");
  const hasCena = plannedMeals.includes("Cena");
  if (hasComida && hasCena) return ["Comida", "Cena"];
  if (hasCena) return ["Cena"];
  return ["Comida"];
}

// Color por comida (mismo idioma que "cuándo coméis en casa" y el postre):
// Comida en ámbar, Cena en índigo. Se usa en el toggle y en los tabs por separado.
const MEAL_COLOR = { Comida: "#c9820a", Cena: "#5a7a9a" };
const MEAL_META = {
  Comida: { icon: Sun, label: "Comida", color: MEAL_COLOR.Comida },
  Cena: { icon: Moon, label: "Cena", color: MEAL_COLOR.Cena },
};

// Illustration + color + time hint per cooking-pace level. Colors always show
// (even when unselected) so the grid reads at a glance; "Depende del día" shows a
// "Variable" pill with a shuffle icon instead of a fixed time — the whole point is
// that it isn't a single number. Each level uses a Pixar-style cook illustration
// (agobio → calma) served from public/avatares/cards.
// Modelo de selección compartido con "Menú del cole", "Cómo os gusta comer" y
// "Quién cocina y cómo" (2026-08-24): teal + icono de check + franja teal con
// texto blanco al seleccionar. El acento propio de cada nivel (naranja/verde/
// azul/morado) se conserva solo como color ambiente (borde, píldora de
// tiempo) — no es lo que indica selección.
const SELECTED_TEAL = "#0f766e";
const LEVEL_META = {
  con_prisa: { img: "/avatares/cards/cook_con_prisa.png", accent: "#e08a2b", tint: "#fdf1e1", time: "≤ 20 min" },
  normal: { img: "/avatares/cards/cook_normal.png", accent: "#2d8a4e", tint: "#e6f5ec", time: "~ 35 min" },
  con_tiempo: { img: "/avatares/cards/cook_con_tiempo.png", accent: "#2f7d8a", tint: "#e1f0f2", time: "1 h o más" },
  depende: { img: "/avatares/cards/cook_depende.png", accent: "#7a5bd6", tint: "#efeaff", time: null },
};

/** Compact pill segmented control used to pick the editing context (period /
 *  meal) so a single level grid can drive them all instead of repeating it. */
function SegTabs({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: "#f0f4f1", borderRadius: 12, padding: 4, gap: 4, marginBottom: 12 }}>
      {options.map((o) => {
        const sel = o.id === value;
        const Icon = o.icon;
        const accent = o.color;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 9,
              border: "none",
              background: sel ? "#fff" : "transparent",
              color: sel ? (accent ?? "#1a3a24") : "#8aa092",
              fontWeight: sel ? 800 : 600,
              fontSize: 12.5,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: sel ? `0 1px 4px ${accent ? `${accent}33` : "rgba(0,0,0,.08)"}` : "none",
              transition: "all .15s ease",
            }}
          >
            {Icon && <Icon size={14} strokeWidth={2.3} color={sel ? (accent ?? "#2d5a3d") : "#9ab0a1"} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CookTimeModeToggle({ mode, onChange }) {
  const opts = [
    {
      id: "shared",
      label: "Igual para ambos",
      renderIcon: (sel) => (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center", opacity: sel ? 1 : 0.5 }}>
          <Sun size={18} strokeWidth={2.2} color={MEAL_COLOR.Comida} />
          <Moon size={18} strokeWidth={2.2} color={MEAL_COLOR.Cena} />
        </span>
      ),
    },
    {
      id: "split",
      label: "Por separado",
      renderIcon: (sel) => (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", opacity: sel ? 1 : 0.5 }}>
          <Sun size={18} strokeWidth={2.2} color={MEAL_COLOR.Comida} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#c5d4cb" }}>/</span>
          <Moon size={18} strokeWidth={2.2} color={MEAL_COLOR.Cena} />
        </span>
      ),
    },
  ];

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", background: "#f0f4f1", borderRadius: 14, padding: 5, gap: 5 }}>
        {opts.map((opt) => {
          const sel = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "16px 10px 14px",
                borderRadius: 10,
                border: sel ? "1.5px solid #d4e6da" : "1.5px solid transparent",
                background: sel ? "#fff" : "transparent",
                color: sel ? "#1a3a24" : "#8aa092",
                fontWeight: sel ? 800 : 500,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: sel ? "0 2px 8px rgba(45,90,61,.12)" : "none",
                transition: "all .15s ease",
                fontFamily: "inherit",
              }}
            >
              {opt.renderIcon(sel)}
              <span style={{ lineHeight: 1.2 }}>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 2×2 grid of qualitative cooking-pace levels — colored icon badge, a time
 *  pill (or "Variable" for depende) and a little time-flow meter. */
function CookLevelChips({ selected, onSelect }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
      {COOK_LEVELS.map((l) => {
        const sel = selected === l.id;
        const meta = LEVEL_META[l.id] ?? LEVEL_META.normal;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onSelect(l.id)}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              padding: 0,
              overflow: "hidden",
              borderRadius: 15,
              border: sel ? `2px solid ${SELECTED_TEAL}` : "1.5px solid #e2eae5",
              background: "#fff",
              boxShadow: sel ? `0 6px 18px rgba(15,118,110,.22)` : "0 1px 3px rgba(20,47,29,.05)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              transition: "all .16s cubic-bezier(.4,0,.2,1)",
            }}
          >
            {sel && (
              <span
                style={{
                  position: "absolute", top: 6, right: 6, zIndex: 2,
                  width: 18, height: 18, borderRadius: 999,
                  background: SELECTED_TEAL, border: "1.5px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Check size={10} color="#fff" strokeWidth={3} />
              </span>
            )}
            {/* Ilustración del nivel sobre el color del nivel (contain para no
                recortar al personaje) + píldora de tiempo/Variable superpuesta. */}
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1 / 1",
                background: meta.tint,
              }}
            >
              <img
                src={meta.img}
                alt=""
                loading="lazy"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
              {meta.time ? (
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: meta.accent,
                    background: "rgba(255,255,255,.92)",
                    borderRadius: 999,
                    padding: "3px 8px",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 4px rgba(20,47,29,.12)",
                  }}
                >
                  {meta.time}
                </span>
              ) : (
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: meta.accent,
                    background: "rgba(255,255,255,.92)",
                    borderRadius: 999,
                    padding: "3px 8px",
                    boxShadow: "0 1px 4px rgba(20,47,29,.12)",
                  }}
                >
                  <Shuffle size={11} strokeWidth={2.6} />
                  Variable
                </span>
              )}
            </div>
            <div style={{ width: "100%", padding: "10px 12px 11px", background: sel ? SELECTED_TEAL : "#fff" }}>
              <span
                style={{
                  display: "block",
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: sel ? "#fff" : "#25402f",
                  letterSpacing: "-.1px",
                }}
              >
                {l.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: sel ? "rgba(255,255,255,.85)" : "#9ab0a1",
                  lineHeight: 1.3,
                  marginTop: 1,
                }}
              >
                {l.sub}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CookTimeEditor({ data, setData, simple = false, showIntro = true }) {
  const cookTime = migrateCookTime(data);
  const targets = plannedMealTargets(getMeals(data));
  // En modo básico (simple) comida y cena comparten nivel siempre: sin el
  // toggle "Igual para ambos / Por separado".
  const dual = !simple && targets.includes("Comida") && targets.includes("Cena");
  const dayCounts = cookDayCounts(data);
  const split = dual && cookTime.mode === "split";

  // Only show a period that actually requires cooking in the real schedule.
  const activePeriods = PERIODS.filter((p) =>
    targets.some((m) => (dayCounts[p.key]?.[m] ?? 0) > 0)
  );

  // A single level grid drives every context; these tabs pick which one you're
  // editing (period + meal) so we never repeat the grid 2× or 4×.
  const [periodTab, setPeriodTab] = useState(activePeriods[0]?.key ?? "weekday");
  const [mealTab, setMealTab] = useState(targets[0]);
  // Guard against a schedule/plan change leaving a tab pointing nowhere.
  const periodKey = activePeriods.some((p) => p.key === periodTab)
    ? periodTab
    : activePeriods[0]?.key ?? "weekday";
  const mealKey = targets.includes(mealTab) ? mealTab : targets[0];

  const setMode = (mode) => setData((d) => writeCookTimeMode(d, mode));
  const patchPeriod = (period, patch) => setData((d) => writeCookTimePeriod(d, period, patch));
  const setShared = (period, value) => setData((d) => writeCookTimeShared(d, period, value));

  const values = cookTime[periodKey] ?? { Comida: 0, Cena: 0 };
  const currentMinutes = split
    ? values[mealKey]
    : dual
      ? Math.max(values.Comida, values.Cena)
      : values.Comida ?? values.Cena;

  const handleSelect = (id) => {
    const m = cookLevelMinutes(id);
    if (split) patchPeriod(periodKey, { [mealKey]: m });
    else if (dual) setShared(periodKey, m);
    else patchPeriod(periodKey, { Comida: m, Cena: m });
  };

  return (
    <>
      {showIntro && (
        <p style={{ fontSize: 11.5, color: "#9ab0a1", margin: "0 0 14px", lineHeight: 1.45 }}>
          ¿Cuánto tiempo sueles tener para cocinar? Ajustamos las recetas a tu ritmo.
        </p>
      )}

      {dual && <CookTimeModeToggle mode={cookTime.mode} onChange={setMode} />}

      {activePeriods.length > 1 && (
        <SegTabs
          options={activePeriods.map((p) => ({ id: p.key, label: p.label, icon: p.icon }))}
          value={periodKey}
          onChange={setPeriodTab}
        />
      )}

      {split && (
        <SegTabs
          options={targets.map((m) => ({ id: m, label: MEAL_META[m].label, icon: MEAL_META[m].icon, color: MEAL_META[m].color }))}
          value={mealKey}
          onChange={setMealTab}
        />
      )}

      <CookLevelChips selected={cookLevelForMinutes(currentMinutes)} onSelect={handleSelect} />
    </>
  );
}
