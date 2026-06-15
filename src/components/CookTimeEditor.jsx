import { BriefcaseBusiness, Moon, Sun, Sunset } from "lucide-react";
import { SliderInput } from "./ui.jsx";
import {
  migrateCookTime,
  writeCookTimeMode,
  writeCookTimePeriod,
  writeCookTimeShared,
} from "../lib/cookTime.js";
import { getMeals } from "../lib/planner.js";

const PERIODS = [
  { key: "weekday", label: "Entre semana", icon: BriefcaseBusiness, min: 10, max: 90 },
  { key: "weekend", label: "Fin de semana", icon: Sunset, min: 10, max: 120 },
];

function mealTargets(plannedMeals) {
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

function CookTimeModeToggle({ mode, onChange }) {
  const opts = [
    {
      id: "shared",
      label: "Igual para ambos",
      desc: "Mismo tiempo en comida y cena",
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
      desc: "Un límite para comida, otro para cena",
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

function CompactMealSlider({ meal, value, min, max, onChange }) {
  const { icon: Icon, label } = MEAL_META[meal];
  const pct = ((value - min) / (max - min)) * 100;
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
        <span style={{ fontSize: 13, fontWeight: 800, color: "#2d5a3d" }}>{value} min</span>
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
          step={5}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

function CookTimePeriodBlock({ label, icon: PeriodIcon, min, max, values, mode, dual, onPatch, onShared }) {
  const sharedValue = Math.max(values.Comida, values.Cena);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eef2ef",
        borderRadius: 14,
        padding: mode === "split" && dual ? "10px 14px 6px" : "0",
        marginBottom: 10,
      }}
    >
      {mode === "shared" || !dual ? (
        <SliderInput
          label={label}
          icon={PeriodIcon}
          value={dual ? sharedValue : values.Comida ?? values.Cena}
          min={min}
          max={max}
          step={5}
          suffix=" min"
          onChange={(v) => (dual ? onShared(v) : onPatch({ Comida: v, Cena: v }))}
        />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
              paddingTop: 2,
            }}
          >
            <PeriodIcon size={14} color="#2d5a3d" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24" }}>{label}</span>
          </div>
          <CompactMealSlider
            meal="Comida"
            value={values.Comida}
            min={min}
            max={max}
            onChange={(v) => onPatch({ Comida: v })}
          />
          <div style={{ height: 1, background: "#f0f4f1", margin: "2px 0 4px" }} />
          <CompactMealSlider
            meal="Cena"
            value={values.Cena}
            min={min}
            max={max}
            onChange={(v) => onPatch({ Cena: v })}
          />
        </>
      )}
    </div>
  );
}

export function CookTimeEditor({ data, setData }) {
  const cookTime = migrateCookTime(data);
  const targets = mealTargets(getMeals(data));
  const dual = targets.includes("Comida") && targets.includes("Cena");

  const setMode = (mode) => setData((d) => writeCookTimeMode(d, mode));
  const patchPeriod = (period, patch) => setData((d) => writeCookTimePeriod(d, period, patch));
  const setShared = (period, value) => setData((d) => writeCookTimeShared(d, period, value));

  return (
    <>
      <style>{`
        .sl-ios { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; }
        .sl-ios::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.06); cursor: pointer; }
        .sl-ios::-moz-range-thumb { width: 22px; height: 22px; border: none; border-radius: 50%; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.16); cursor: pointer; }
      `}</style>

      {dual && <CookTimeModeToggle mode={cookTime.mode} onChange={setMode} />}

      {PERIODS.map((p) => (
        <CookTimePeriodBlock
          key={p.key}
          label={p.label}
          icon={p.icon}
          min={p.min}
          max={p.max}
          values={cookTime[p.key]}
          mode={dual ? cookTime.mode : "shared"}
          dual={dual}
          onPatch={(patch) => patchPeriod(p.key, patch)}
          onShared={(v) => setShared(p.key, v)}
        />
      ))}
    </>
  );
}
