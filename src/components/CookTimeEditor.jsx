import { useState } from "react";
import { BriefcaseBusiness, Moon, Sun, Sunset } from "lucide-react";
import { SliderInput } from "./ui.jsx";
import {
  migrateCookTime,
  writeCookTimeMode,
  writeCookTimePeriod,
  writeCookTimeShared,
  toDisplayCookMinutes,
  fromDisplayCookMinutes,
  displayCookBounds,
  formatCookDurationLabel,
  weekCookScale,
} from "../lib/cookTime.js";
import { cookDayCounts, getMeals } from "../lib/planner.js";

// Both periods share the same min/max so the slider fill % always maps to the
// same minutes — otherwise two thumbs at "the same spot" would show different
// times just because their ranges differed (weekday used to cap at 90, weekend
// at 120), which looked like a bug even though the math was correct.
const PERIODS = [
  { key: "weekday", label: "Entre semana", icon: BriefcaseBusiness, min: 10, max: 120 },
  { key: "weekend", label: "Fin de semana", icon: Sunset, min: 10, max: 120 },
];

function plannedMealTargets(plannedMeals) {
  const hasComida = plannedMeals.includes("Comida");
  const hasCena = plannedMeals.includes("Cena");
  if (hasComida && hasCena) return ["Comida", "Cena"];
  if (hasCena) return ["Cena"];
  return ["Comida"];
}

const MEAL_META = {
  Comida: { icon: Sun, label: "Comida" },
  Cena: { icon: Moon, label: "Cena" },
};

function CookTimeUnitToggle({ unit, onChange }) {
  const options = [
    { id: "day", label: "Día" },
    { id: "week", label: "Semana" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        background: "#f0f4f1",
        borderRadius: 10,
        padding: 3,
        gap: 2,
        marginBottom: 10,
      }}
    >
      {options.map(({ id, label }) => {
        const active = unit === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              padding: "5px 14px",
              borderRadius: 8,
              border: "none",
              fontSize: 11,
              fontWeight: 800,
              background: active ? (id === "week" ? "#2d5a3d" : "#fff") : "transparent",
              color: active ? (id === "week" ? "#fff" : "#1a3a24") : "#9ab0a1",
              boxShadow: active && id === "day" ? "0 1px 4px rgba(0,0,0,.1)" : "none",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all .15s ease",
            }}
          >
            {label}
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
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <Sun size={18} strokeWidth={2.2} color={sel ? "#2d5a3d" : "#9ab0a1"} />
          <Moon size={18} strokeWidth={2.2} color={sel ? "#2d5a3d" : "#9ab0a1"} />
        </span>
      ),
    },
    {
      id: "split",
      label: "Por separado",
      renderIcon: (sel) => (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Sun size={18} strokeWidth={2.2} color={sel ? "#2d5a3d" : "#9ab0a1"} />
          <span style={{ fontSize: 11, fontWeight: 700, color: sel ? "#2d5a3d" : "#c5d4cb" }}>/</span>
          <Moon size={18} strokeWidth={2.2} color={sel ? "#2d5a3d" : "#9ab0a1"} />
        </span>
      ),
    },
  ];

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          background: "#f0f4f1",
          borderRadius: 14,
          padding: 5,
          gap: 5,
        }}
      >
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
      <p style={{ fontSize: 11, color: "#9ab0a1", margin: "8px 4px 0", lineHeight: 1.4, textAlign: "center" }}>
        {opts.find((o) => o.id === mode)?.desc}
      </p>
    </div>
  );
}

function CompactMealSlider({ meal, value, min, max, step = 5, unit, onChange }) {
  const { icon: Icon, label } = MEAL_META[meal];
  const pct = ((value - min) / (max - min)) * 100;
  const display = formatCookDurationLabel(value, unit);
  return (
    <div style={{ padding: "8px 0 4px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            fontWeight: 600,
            color: "#5a7262",
          }}
        >
          <Icon size={13} color="#2d5a3d" strokeWidth={2.2} />
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#2d5a3d" }}>{display}</span>
      </div>
      <div style={{ position: "relative", height: 22, display: "flex", alignItems: "center" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 3,
            borderRadius: 2,
            background: "#e5ede7",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            height: 3,
            borderRadius: 2,
            background: "#2d5a3d",
            width: `${pct}%`,
            pointerEvents: "none",
          }}
        />
        <input
          className="sl-ios"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

function CookTimePeriodBlock({
  periodKey,
  label,
  icon: PeriodIcon,
  min,
  max,
  values,
  mode,
  dual,
  unit,
  mealTargets,
  dayCounts,
  onPatch,
  onShared,
}) {
  // In "week" mode the slider step scales with the number of cooked slots so
  // dragging one notch always maps cleanly to a 5-min change per slot (avoids
  // the rounding jumpiness that made weekday/weekend feel inconsistent).
  const stepFor = (opts) =>
    unit === "week"
      ? Math.max(5, 5 * weekCookScale(periodKey, mealTargets, opts))
      : 5;

  const sharedValue = Math.max(values.Comida, values.Cena);
  const sharedOpts = { shared: true, dayCounts };
  const soloOpts = { dayCounts };
  const sharedBounds = displayCookBounds(min, max, periodKey, mealTargets, unit, sharedOpts);
  const sharedDisplay = toDisplayCookMinutes(
    dual ? sharedValue : values.Comida ?? values.Cena,
    periodKey,
    mealTargets,
    unit,
    dual ? sharedOpts : soloOpts
  );
  const soloBounds = displayCookBounds(min, max, periodKey, mealTargets, unit, soloOpts);

  // Shared / single-meal: SliderInput already has its own bordered container.
  if (mode === "shared" || !dual) {
    return (
      <SliderInput
        label={label}
        icon={PeriodIcon}
        value={sharedDisplay}
        min={dual ? sharedBounds.min : soloBounds.min}
        max={dual ? sharedBounds.max : soloBounds.max}
        step={stepFor(dual ? sharedOpts : soloOpts)}
        valueLabel={formatCookDurationLabel(sharedDisplay, unit)}
        onChange={(v) => {
          const stored = fromDisplayCookMinutes(v, periodKey, mealTargets, unit, dual ? sharedOpts : soloOpts);
          if (dual) onShared(stored);
          else onPatch({ Comida: stored, Cena: stored });
        }}
      />
    );
  }

  // Split mode: wrap the per-meal sliders in a single bordered container.
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eef2ef",
        borderRadius: 14,
        padding: "10px 14px 6px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingTop: 2 }}>
        <PeriodIcon size={14} color="#2d5a3d" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24" }}>{label}</span>
      </div>
      {mealTargets.map((meal, idx) => {
        const mealOpts = { meal, dayCounts };
        const mealBounds = displayCookBounds(min, max, periodKey, mealTargets, unit, mealOpts);
        const displayValue = toDisplayCookMinutes(values[meal], periodKey, mealTargets, unit, mealOpts);
        return (
          <div key={meal}>
            {idx > 0 && <div style={{ height: 1, background: "#f0f4f1", margin: "2px 0 4px" }} />}
            <CompactMealSlider
              meal={meal}
              value={displayValue}
              min={mealBounds.min}
              max={mealBounds.max}
              step={stepFor(mealOpts)}
              unit={unit}
              onChange={(v) => {
                const stored = fromDisplayCookMinutes(v, periodKey, mealTargets, unit, mealOpts);
                onPatch({ [meal]: stored });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function CookTimeEditor({ data, setData }) {
  const [unit, setUnit] = useState("day");
  const cookTime = migrateCookTime(data);
  const targets = plannedMealTargets(getMeals(data));
  const dual = targets.includes("Comida") && targets.includes("Cena");
  const dayCounts = cookDayCounts(data);

  // Only show a period that actually requires cooking in the real schedule.
  const activePeriods = PERIODS.filter((p) =>
    targets.some((m) => (dayCounts[p.key]?.[m] ?? 0) > 0)
  );

  const setMode = (mode) => setData((d) => writeCookTimeMode(d, mode));
  const patchPeriod = (period, patch) => setData((d) => writeCookTimePeriod(d, period, patch));
  const setShared = (period, value) => setData((d) => writeCookTimeShared(d, period, value));

  return (
    <>
      <style>{`
        .sl-ios { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; }
        .sl-ios::-webkit-slider-runnable-track { background: transparent; height: 3px; }
        .sl-ios::-moz-range-track { background: transparent; height: 3px; border: none; }
        .sl-ios::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.06); cursor: pointer; margin-top: -9.5px; }
        .sl-ios::-moz-range-thumb { width: 22px; height: 22px; border: none; border-radius: 50%; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.16); cursor: pointer; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <CookTimeUnitToggle unit={unit} onChange={setUnit} />
      </div>
      <p style={{ fontSize: 11, color: "#9ab0a1", margin: "0 0 14px", lineHeight: 1.45 }}>
        {unit === "day"
          ? "Tiempo máximo por comida o cena."
          : "Tiempo total de cocina en ese tramo de la semana."}
      </p>

      {dual && <CookTimeModeToggle mode={cookTime.mode} onChange={setMode} />}

      {activePeriods.map((p) => (
        <CookTimePeriodBlock
          key={p.key}
          periodKey={p.key}
          label={p.label}
          icon={p.icon}
          min={p.min}
          max={p.max}
          values={cookTime[p.key]}
          mode={dual ? cookTime.mode : "shared"}
          dual={dual}
          unit={unit}
          mealTargets={targets}
          dayCounts={dayCounts}
          onPatch={(patch) => patchPeriod(p.key, patch)}
          onShared={(v) => setShared(p.key, v)}
        />
      ))}
    </>
  );
}
