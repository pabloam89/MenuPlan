import {
  Apple,
  IceCream,
  Moon,
  Salad,
  Soup,
  Utensils,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { deriveUsageTagsFromType, USAGE_TAGS } from "../lib/userRecipes.js";
import { mealTimeColor } from "../lib/mealTimes.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const COMIDA_POSITIONS = ["plato_unico", "primero", "segundo"];

const USAGE_TAG_ICONS = {
  plato_unico: Utensils,
  plato_normal: UtensilsCrossed,
  guarnicion: Salad,
};

const USAGE_TAG_COLORS = {
  plato_unico: "#2d5a3d",
  plato_normal: "#2f6fb8",
  guarnicion: "#16a34a",
};

function defaultComidaRole(usageTags = []) {
  if (usageTags[0] === "plato_unico") return "plato_unico";
  return "segundo";
}

function ToggleChip({ icon: Icon, color, label, checked, onToggle, last = false }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 0",
        borderBottom: last ? "none" : "1px solid #eef3f0",
        cursor: "pointer",
        gridColumn: "1 / -1",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `${color}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={14} color={color} strokeWidth={2.3} />
      </span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: INK }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ width: 18, height: 18, accentColor: GREEN }} />
    </label>
  );
}

/**
 * Owner-only inline editor for how a user recipe fits the menu planner.
 * `value` reads the catalog-shaped recipe; `onChange` receives partial patches.
 */
export function RecipeClassificationFields({ value, onChange }) {
  const usageTags = value.usageTags?.length ? value.usageTags : deriveUsageTagsFromType(value.type);
  const mealRole = value.mealRole ?? [];
  const quickDinner = value.category === "cenas_rapidas";
  const comidaChecked = mealRole.some((r) => COMIDA_POSITIONS.includes(r));
  const selectedUsage = usageTags[0] ?? null;

  const setUsage = (id) => {
    onChange({
      usageTags: selectedUsage === id ? [] : [id],
      pinnedGarnishId: id === "plato_normal" ? value.pinnedGarnishId : undefined,
      linkedCatalogId: id === "guarnicion" ? value.linkedCatalogId : undefined,
    });
  };

  const toggleMealRole = (id) => {
    onChange({
      mealRole: mealRole.includes(id) ? mealRole.filter((r) => r !== id) : [...mealRole, id],
    });
  };

  const toggleComida = () => {
    if (comidaChecked) {
      onChange({ mealRole: mealRole.filter((r) => !COMIDA_POSITIONS.includes(r)) });
    } else {
      const role = defaultComidaRole(usageTags);
      onChange({
        mealRole: [...mealRole.filter((r) => !COMIDA_POSITIONS.includes(r)), role],
      });
    }
  };

  const toggleQuickDinner = () => {
    const next = !quickDinner;
    onChange({
      quickDinner: next,
      mealRole: next && !mealRole.includes("cena") ? [...mealRole, "cena"] : mealRole,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 800, color: "#7a9485", letterSpacing: ".3px" }}>
          TIPO
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {USAGE_TAGS.map((t) => {
            const Icon = USAGE_TAG_ICONS[t.id] ?? UtensilsCrossed;
            const color = USAGE_TAG_COLORS[t.id] ?? GREEN;
            const sel = selectedUsage === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setUsage(t.id)}
                title={t.hint}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                  padding: "10px 4px 8px",
                  borderRadius: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: `1.5px solid ${sel ? GREEN : "#e8efe9"}`,
                  background: sel ? "#eef6f0" : "#fff",
                  boxShadow: sel ? "0 1px 6px rgba(45,90,61,.1)" : "none",
                }}
              >
                <Icon size={15} color={color} strokeWidth={2.3} />
                <span style={{ fontSize: 10.5, fontWeight: sel ? 800 : 700, color: sel ? INK : "#5a6b60", textAlign: "center", lineHeight: 1.15 }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 800, color: "#7a9485", letterSpacing: ".3px" }}>
          APLICA
        </p>
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#9ab0a1", lineHeight: 1.35 }}>
          Cuándo puede salir en el menú semanal.
        </p>
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #e8efe9",
            borderRadius: 12,
            padding: "2px 12px",
          }}
        >
          <ToggleChip
            icon={Soup}
            color={mealTimeColor("Comida")}
            label="Comida"
            checked={comidaChecked}
            onToggle={toggleComida}
          />
          <ToggleChip
            icon={Moon}
            color={mealTimeColor("Cena")}
            label="Cena"
            checked={mealRole.includes("cena")}
            onToggle={() => toggleMealRole("cena")}
          />
          <ToggleChip
            icon={Zap}
            color="#d56b9a"
            label="Cena rápida"
            checked={quickDinner}
            onToggle={toggleQuickDinner}
          />
          <ToggleChip
            icon={Apple}
            color="#c0504d"
            label="Merienda"
            checked={mealRole.includes("merienda")}
            onToggle={() => toggleMealRole("merienda")}
          />
          <ToggleChip
            icon={IceCream}
            color="#c0568f"
            label="Postre"
            checked={mealRole.includes("postre")}
            onToggle={() => toggleMealRole("postre")}
            last
          />
        </div>
      </div>
    </div>
  );
}
