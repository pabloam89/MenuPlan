import { memo, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  BookOpenCheck,
  Calendar,
  ChefHat,
  Clock3,
  Download,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Gauge,
  Leaf,
  Loader2,
  RotateCw,
  StopCircle,
  School,
  Share2,
  ShoppingCart,
  Soup,
  Sparkles,
  Users,
  Utensils,
  Wand2,
  Wheat,
  X,
} from "lucide-react";
import { visualForRecipe } from "../assets/dishes/dishVisuals.js";
import { BottomNav, Chip, AvatarStack, SliderInput } from "../components/ui.jsx";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { membersOfGroup } from "../lib/groups.js";
import { downloadMenu, shareMenu } from "../lib/menuExport.js";
import { generateRecipeSteps } from "../lib/aiPlanner.js";
import { partialEaterInitials } from "../lib/slotEaters.js";
import { DAYS, getMeals, isLunchMeal, slotKey } from "../lib/planner.js";
import { getSchoolDish, hasAnySchoolDish } from "../lib/schoolMenu.js";
import {
  calendarDayNumber,
  formatWeekRangeLabel,
  getWeekDates,
} from "../lib/weekCalendar.js";

const ICONS_BY_TYPE = {
  fish: Fish,
  meat: Drumstick,
  egg: Egg,
  legume: Soup,
  pasta: Wheat,
  rice: Wheat,
  greens: Leaf,
  soup: Soup,
  chef: ChefHat,
};

const COLE_COLOR = "#2d5a3d";

function formatQty(qty, unit) {
  if (unit === "ud") return `${Math.ceil(qty)} ${Math.ceil(qty) === 1 ? "ud" : "uds"}`;
  if (unit === "g" && qty >= 1000) return `${(qty / 1000).toFixed(1)} kg`;
  if (unit === "ml" && qty >= 1000) return `${(qty / 1000).toFixed(1)} l`;
  return `${Math.ceil(qty)} ${unit}`;
}

function scaledIngredients(recipe, eaters) {
  const factor = Math.max(1, eaters) / recipe.servings;
  return recipe.ingredients.map((ing) => ({
    ...ing,
    label: formatQty(ing.qty * factor, ing.unit),
  }));
}

function MacroPill({ label, value, tone = "#2d5a3d" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 999,
        background: "#f4f7f4",
        color: tone,
        fontSize: 10.5,
        fontWeight: 800,
      }}
    >
      <span style={{ fontWeight: 900 }}>{value}</span>
      <span style={{ opacity: 0.7, fontWeight: 700 }}>{label}</span>
    </span>
  );
}

function DishIcon({ recipe, size = 44 }) {
  const visual = visualForRecipe(recipe);
  const Icon = ICONS_BY_TYPE[recipe.iconType] ?? Utensils;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: visual.ink,
        background: visual.surface,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}

function DishVisual({ recipe, height = 220 }) {
  const visual = visualForRecipe(recipe);
  const Icon = ICONS_BY_TYPE[recipe.iconType] ?? Utensils;
  return (
    <div
      style={{
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: 22,
        background: visual.surface,
      }}
    >
      <svg
        viewBox="0 0 320 220"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        aria-hidden="true"
      >
        <circle cx="252" cy="44" r="58" fill={visual.ink} fillOpacity="0.07" />
        <circle cx="280" cy="186" r="36" fill={visual.ink} fillOpacity="0.05" />
        <path
          d="M-10 168 Q 80 132 170 168 T 340 168 L 340 230 L -10 230 Z"
          fill={visual.ink}
          fillOpacity="0.06"
        />
        <path
          d="M-10 196 Q 80 168 170 196 T 340 196 L 340 230 L -10 230 Z"
          fill={visual.ink}
          fillOpacity="0.05"
        />
      </svg>
      <span
        style={{
          position: "absolute",
          top: 18,
          left: 18,
          width: 56,
          height: 56,
          borderRadius: 18,
          background: "#fff",
          color: visual.ink,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={28} strokeWidth={1.7} />
      </span>
      <div
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 20,
          color: visual.ink,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            opacity: 0.62,
            marginBottom: 4,
          }}
        >
          Receta de la semana
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-.4px",
          }}
        >
          {recipe.name}
        </div>
      </div>
    </div>
  );
}

function ProfileButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 11px",
        borderRadius: 12,
        border: "1px solid #2d5a3d",
        background: "#2d5a3d",
        cursor: "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "rgba(255,255,255,.18)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Users size={14} />
      </span>
      <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", letterSpacing: "-.2px", lineHeight: 1 }}>
        Tu perfil
      </div>
    </button>
  );
}

const COOK_LEVELS = [
  { id: "basic",  label: "Básico",           icon: <BookOpenCheck size={20} /> },
  { id: "normal", label: "Normal",            icon: <ChefHat size={20} /> },
  { id: "pro",    label: "Me gusta cocinar",  icon: <Sparkles size={20} /> },
];

const KITCHEN_TOOLS = ["Airfryer", "Horno", "Microondas", "Robot/Thermomix", "Olla rápida", "Batidora"];

const FREQ_OPTIONS = [
  { id: "verdura", label: "Verdura" },
  { id: "pescado", label: "Pescado" },
  { id: "legumbres", label: "Legumbres" },
];

const profileLabelStyle = {
  fontSize: 10,
  fontWeight: 800,
  color: "#8d978f",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 6,
};

function FreqStepper({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a3a24" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #d7e1db",
            background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700,
            color: "#2d5a3d", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          −
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", minWidth: 40, textAlign: "center" }}>
          ≥{value}/sem
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(7, value + 1))}
          style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #d7e1db",
            background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700,
            color: "#2d5a3d", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function ProfileSettingsSheet({ data, setData, onClose, onRegenerate }) {
  const members = data.members ?? [];
  const allergies = [...new Set(members.flatMap((m) => m.allergies ?? []))];
  const dislikes = [...new Set([...(data.dislikes ?? []), ...members.flatMap((m) => m.dislikes ?? [])])];
  const allTools = [...KITCHEN_TOOLS, ...(data.customKitchenTools ?? [])];

  const toggleTool = (tool) =>
    setData((d) => ({
      ...d,
      kitchenTools: (d.kitchenTools ?? []).includes(tool)
        ? (d.kitchenTools ?? []).filter((v) => v !== tool)
        : [...(d.kitchenTools ?? []), tool],
    }));

  const divider = <div style={{ height: 1, background: "#e8f0ea", margin: "12px 0" }} />;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 150,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 420,
          maxHeight: "82vh",
          overflow: "auto",
          padding: "16px 18px calc(18px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>Tu perfil</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: "none", background: "#f0f4f1", borderRadius: 999,
              width: 32, height: 32, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Familia */}
        {members.length > 0 && (
          <div style={{ marginBottom: 0 }}>
            <div style={profileLabelStyle}>Familia</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map((m) => (
                <span
                  key={m.id}
                  style={{
                    padding: "4px 10px", borderRadius: 8, background: "#f0f5f1",
                    fontSize: 12, fontWeight: 600, color: "#1a3a24",
                  }}
                >
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {(allergies.length > 0 || dislikes.length > 0) && (
          <>
            {divider}
            <div style={profileLabelStyle}>Evitar</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allergies.map((a) => (
                <span key={a} style={{ padding: "4px 10px", borderRadius: 8, background: "#fef3f0", fontSize: 12, fontWeight: 600, color: "#a83a1f" }}>
                  {a}
                </span>
              ))}
              {dislikes.map((d) => (
                <span key={d} style={{ padding: "4px 10px", borderRadius: 8, background: "#f5f0e8", fontSize: 12, fontWeight: 600, color: "#8a6d3b" }}>
                  {d}
                </span>
              ))}
            </div>
          </>
        )}

        {divider}

        {/* Nivel de cocina — tarjetas con icono */}
        <div style={profileLabelStyle}>Nivel de cocina</div>
        <div style={{ display: "flex", gap: 8 }}>
          {COOK_LEVELS.map((l) => {
            const sel = data.cookLevel === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setData((d) => ({ ...d, cookLevel: l.id }))}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 8px 12px",
                  borderRadius: 14,
                  cursor: "pointer",
                  background: sel ? "#2d5a3d" : "#f4f7f5",
                  border: `1.5px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                  color: sel ? "#fff" : "#9ab0a1",
                  transition: "all .15s ease",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {l.icon}
                {l.label}
              </button>
            );
          })}
        </div>

        {divider}

        {/* Herramientas — grid 3 columnas */}
        <div style={profileLabelStyle}>Herramientas</div>
        <div style={{ background: "#f6f9f7", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            {allTools.map((t) => {
              const sel = (data.kitchenTools ?? []).includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTool(t)}
                  style={{
                    height: 30,
                    borderRadius: 7,
                    border: `1.5px solid ${sel ? "#2d5a3d" : "#dde8e0"}`,
                    background: sel ? "#2d5a3d" : "#fff",
                    color: sel ? "#fff" : "#526057",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {divider}

        {/* Tiempo disponible */}
        <div style={{ ...profileLabelStyle, marginBottom: 8 }}>Tiempo disponible</div>
        <SliderInput
          label="Entre semana"
          value={data.timeWeekday ?? 30}
          min={10} max={90} step={5} suffix=" min"
          onChange={(v) => setData((d) => ({ ...d, timeWeekday: v }))}
        />
        <SliderInput
          label="Fin de semana"
          value={data.timeWeekend ?? 60}
          min={10} max={120} step={5} suffix=" min"
          onChange={(v) => setData((d) => ({ ...d, timeWeekend: v }))}
        />

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => { onClose(); onRegenerate(); }}
            style={{
              width: "100%", padding: "12px", borderRadius: 12,
              border: "none", background: "#2d5a3d", color: "#fff",
              fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Regenerar menú
          </button>
        </div>
      </div>
    </div>
  );
}

function SchoolDishCard({ name, courses }) {
  const rows = [
    { label: "1º", value: courses.primero },
    { label: "2º", value: courses.segundo },
    { label: "Postre", value: courses.postre },
  ];
  const empty = !hasAnySchoolDish(courses);
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "12px",
        background: "#fff",
        borderRadius: 14,
        border: `1px dashed ${COLE_COLOR}66`,
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: `${COLE_COLOR}18`,
          color: COLE_COLOR,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <School size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: COLE_COLOR, marginBottom: 4 }}>
          {name} · comedor
        </div>
        {empty ? (
          <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic" }}>(sin menú cargado)</div>
        ) : (
          rows.map((row) => (
            <div key={row.label} style={{ display: "flex", gap: 6, fontSize: 12, minWidth: 0 }}>
              <span style={{ width: 34, color: COLE_COLOR, fontWeight: 900 }}>{row.label}</span>
              <span
                style={{
                  color: row.value ? "#1a3a24" : "#bbb",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.value || "-"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function dishesFromSlot(slot, isLunch) {
  if (!slot?.recipeId) return [];
  const items = [];
  if (isLunch && slot.firstRecipeId) {
    items.push({
      course: "1º",
      courseKey: "first",
      recipeId: slot.firstRecipeId,
    });
  }
  items.push({
    course: isLunch && slot.firstRecipeId ? "2º" : null,
    courseKey: "main",
    recipeId: slot.recipeId,
  });
  return items;
}

function DishCard({ slot, onTap, group, showGroupTag, eaterInitials = [], courseLabel = null }) {
  if (!slot) {
    return (
      <div
        style={{
          padding: "13px 14px",
          background: "#fafafa",
          borderRadius: 14,
          border: "1px dashed #e2e8e3",
          color: "#bbb",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        No aplica
      </div>
    );
  }

  const recipe = RECIPES_BY_ID[slot.recipeId];
  if (!recipe) return null;

  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        width: "100%",
        border: "1px solid #ecf1ed",
        textAlign: "left",
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: "#fff",
        borderRadius: 16,
        cursor: "pointer",
        fontFamily: "inherit",
        position: "relative",
        boxShadow: "0 1px 0 rgba(20,47,29,.02)",
      }}
    >
      {showGroupTag && group && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -1,
            top: 14,
            bottom: 14,
            width: 3,
            borderRadius: 3,
            background: group.color,
          }}
        />
      )}
      {courseLabel && (
        <span
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            fontSize: 9,
            fontWeight: 900,
            color: "#2d5a3d",
            background: "#eef3ef",
            padding: "2px 6px",
            borderRadius: 6,
          }}
        >
          {courseLabel}
        </span>
      )}
      <DishIcon recipe={recipe} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showGroupTag && group && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                color: group.color,
                textTransform: "uppercase",
                letterSpacing: 0.7,
              }}
            >
              {group.label}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: "#15331c",
            lineHeight: 1.18,
            letterSpacing: "-.1px",
            marginTop: showGroupTag && group ? 2 : 0,
          }}
        >
          {recipe.name}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          <MacroPill label="min" value={recipe.time} tone="#2d5a3d" />
          {slot.mode === "tupper" && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                padding: "4px 8px",
                borderRadius: 999,
                background: "#fff5ef",
                color: "#c67030",
              }}
            >
              tupper
            </span>
          )}
        </div>
      </div>
      {eaterInitials.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            flexShrink: 0,
            alignSelf: "center",
            maxWidth: 56,
            justifyContent: "flex-end",
          }}
        >
          {eaterInitials.map((init) => (
            <span
              key={init}
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: "#eef3ef",
                color: "#2d5a3d",
                fontSize: 9,
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {init}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export const MenuScreen = memo(function MenuScreen({
  data,
  setData,
  menuPlan,
  isGenerating = false,
  error = null,
  onDishTap,
  onNav,
  onRegenerate,
  onRetry,
  onStop,
  onReset,
  onToast,
}) {
  const [activeGroupIds, setActiveGroupIds] = useState(() =>
    data.groups.slice(0, 1).map((g) => g.id)
  );
  const [profileOpen, setProfileOpen] = useState(false);

  const weekDates = useMemo(() => getWeekDates(), []);
  const weekLabel = useMemo(() => formatWeekRangeLabel(weekDates), [weekDates]);
  const hasMenu = !isGenerating && !error && Object.keys(menuPlan).length > 0;

  const toggleGroup = (id) => {
    setActiveGroupIds((cur) => {
      if (cur.includes(id)) {
        if (cur.length === 1) return cur;
        return cur.filter((x) => x !== id);
      }
      return [...cur, id];
    });
  };

  const visibleGroups = data.groups.filter((g) => activeGroupIds.includes(g.id));
  const showGroupTag = visibleGroups.length > 1;

  const handleShare = async () => {
    try {
      const result = await shareMenu(data, menuPlan, data.groups);
      if (result.method === "cancelled") return;
      const msg =
        result.method === "share"
          ? "Menú compartido"
          : result.method === "clipboard"
            ? "Menú copiado al portapapeles"
            : "Menú descargado";
      onToast?.(msg);
    } catch {
      onToast?.("No se pudo compartir el menú");
    }
  };

  const handleDownload = async () => {
    try {
      await downloadMenu(data, menuPlan, data.groups);
      onToast?.("Menú descargado");
    } catch {
      onToast?.("No se pudo descargar el menú");
    }
  };

  return (
    <div style={{ paddingBottom: 0, background: "#f7f9f7" }}>
      <div style={{ padding: "20px 20px 0" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: "#142f1d",
                margin: 0,
                letterSpacing: "-.7px",
              }}
            >
              Tu menú
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onReset}
              style={ghostButtonStyle}
              disabled={isGenerating}
            >
              Reiniciar
            </button>
            {!isGenerating && (
              <button
                type="button"
                onClick={onRegenerate}
                style={primaryMiniButtonStyle}
              >
                Regenerar
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            height: 1,
            background: "#e6eee8",
            marginBottom: 14,
          }}
        />

        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                flex: 1,
                minWidth: 0,
                flexWrap: "wrap",
              }}
            >
              {data.groups.map((g) => {
                const sel = activeGroupIds.includes(g.id);
                const members = membersOfGroup(g, data.members);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 12px 7px 8px",
                      borderRadius: 999,
                      background: sel ? g.color : "#fff",
                      color: sel ? "#fff" : "#526057",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      flexShrink: 0,
                      border: `1px solid ${sel ? g.color : "#e6eee8"}`,
                      fontFamily: "inherit",
                    }}
                  >
                    <AvatarStack
                      names={members.map((m) => m.name)}
                      size={22}
                      max={3}
                      color={sel ? "rgba(255,255,255,.25)" : "#c9d2cc"}
                    />
                    {g.label}
                  </button>
                );
              })}
            </div>
            {hasMenu && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleShare}
                  aria-label="Compartir menú"
                  title="Compartir"
                  style={iconChipButtonStyle}
                >
                  <Share2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  aria-label="Descargar menú"
                  title="Descargar"
                  style={iconChipButtonStyle}
                >
                  <Download size={16} />
                </button>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "#e6eee8", margin: "10px 0" }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 11px",
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #ecf1ed",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "#eef3ef",
                  color: "#2d5a3d",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Calendar size={14} />
              </span>
              <div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: "#8d978f",
                    textTransform: "uppercase",
                    letterSpacing: 0.9,
                    lineHeight: 1,
                    marginBottom: 3,
                  }}
                >
                  Semana
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: "#142f1d",
                    letterSpacing: "-.2px",
                    lineHeight: 1,
                  }}
                >
                  {weekLabel}
                </div>
              </div>
            </div>

            <ProfileButton onClick={() => setProfileOpen(true)} />
          </div>
        </div>
      </div>

      {isGenerating && <GeneratingSkeleton onStop={onStop} />}

      {!isGenerating && error && (
        <ErrorCard error={error} onRetry={onRetry} />
      )}

      {!isGenerating && !error && Object.keys(menuPlan).length === 0 && (
        <EmptyState onRegenerate={onRegenerate} />
      )}

      {!isGenerating && !error && Object.keys(menuPlan).length > 0 && (
      <div style={{ padding: "0 16px" }}>
        {DAYS.map((day) => {
          const meals = getMeals(data);
          const hasAnyContent = meals.some((meal) => {
            const isLunch = isLunchMeal(meal);
            return visibleGroups.some((g) => {
              if (menuPlan[g.id]?.[`${day}-${meal}`]) return true;
              if (!isLunch) return false;
              return membersOfGroup(g, data.members).some(
                (m) => (data.schedule[slotKey(m.id, day, meal)] ?? "casa") === "cole"
              );
            });
          });
          if (!hasAnyContent) return null;
          return (
            <div key={day} style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 4px",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: "#fff",
                    border: "1px solid #e6eee8",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 900,
                    color: "#142f1d",
                    flexShrink: 0,
                  }}
                >
                  {calendarDayNumber(day, weekDates)}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: "#142f1d",
                    textTransform: "uppercase",
                    letterSpacing: 1.4,
                  }}
                >
                  {day}
                </span>
                <span style={{ flex: 1, height: 1, background: "#e6eee8" }} />
              </div>
              {meals.map((meal) => {
                const isLunch = isLunchMeal(meal);
                const cards = visibleGroups.flatMap((g) => {
                  const result = [];
                  const slot = menuPlan[g.id]?.[`${day}-${meal}`] ?? null;
                  if (slot) {
                    for (const dish of dishesFromSlot(slot, isLunch)) {
                      result.push({ kind: "dish", group: g, slot, dish });
                    }
                  }
                  if (isLunch) {
                    const groupMembers = membersOfGroup(g, data.members);
                    for (const m of groupMembers) {
                      const value = data.schedule[slotKey(m.id, day, meal)] ?? "casa";
                      if (value === "cole") {
                        result.push({
                          kind: "school",
                          group: g,
                          member: m,
                          courses: getSchoolDish(data.schoolMenus, m.id, day),
                        });
                      }
                    }
                  }
                  return result;
                });
                if (cards.length === 0) return null;
                return (
                  <div key={meal} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#7a8580",
                        padding: "0 4px",
                        marginBottom: 6,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      {meal}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {cards.map((card, idx) =>
                        card.kind === "dish" ? (
                          <DishCard
                            key={`dish-${card.group.id}-${card.dish.courseKey}-${idx}`}
                            slot={{ ...card.slot, recipeId: card.dish.recipeId }}
                            courseLabel={card.dish.course}
                            onTap={() =>
                              onDishTap({
                                recipe: RECIPES_BY_ID[card.dish.recipeId],
                                slot: card.slot,
                                groupId: card.group.id,
                                day,
                                meal,
                                group: card.group,
                                course: card.dish.courseKey,
                              })
                            }
                            group={card.group}
                            showGroupTag={showGroupTag}
                            eaterInitials={
                              card.dish.courseKey === "main"
                                ? partialEaterInitials(
                                    card.group,
                                    data.members,
                                    data.schedule ?? {},
                                    day,
                                    meal
                                  )
                                : []
                            }
                          />
                        ) : (
                          <SchoolDishCard
                            key={`school-${card.member.id}-${idx}`}
                            name={card.member.name}
                            courses={card.courses}
                          />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      )}

      {!isGenerating && !error && Object.keys(menuPlan).length > 0 && (
        <div style={{ padding: "12px 16px 16px", display: "flex", gap: 10 }}>
          <button type="button" onClick={() => onNav("shopping")} style={shoppingButtonStyle}>
            <ShoppingCart size={16} />
            Compra
          </button>
        </div>
      )}

      {profileOpen && (
        <ProfileSettingsSheet
          data={data}
          setData={setData}
          onClose={() => setProfileOpen(false)}
          onRegenerate={() => {
            setProfileOpen(false);
            onRegenerate();
          }}
        />
      )}

      <BottomNav active="menu" onNav={onNav} />
    </div>
  );
});

const COUNTDOWN_TOTAL = 90;

function GeneratingSkeleton({ onStop }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, COUNTDOWN_TOTAL - elapsed);
  const progress = Math.min(1, elapsed / COUNTDOWN_TOTAL);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeLabel = remaining > 0
    ? `${mins}:${String(secs).padStart(2, "0")}`
    : null;

  const skeletonRows = [0, 1, 2];
  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: "#ecf1ed",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              borderRadius: 3,
              background: "#2d5a3d",
              transition: "width .3s linear",
            }}
          />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8d978f", flexShrink: 0 }}>
          {timeLabel ?? ""}
        </span>
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1.5px solid #d7e1db",
              background: "#fff",
              color: "#2d5a3d",
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
              padding: 0,
            }}
          >
            <StopCircle size={14} />
          </button>
        )}
      </div>

      {skeletonRows.map((i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div
            style={{
              width: 60,
              height: 12,
              borderRadius: 4,
              background: "#e8eee9",
              marginBottom: 8,
            }}
          />
          {[0, 1].map((j) => (
            <div
              key={j}
              style={{
                display: "flex",
                gap: 12,
                padding: 14,
                background: "#fff",
                borderRadius: 14,
                border: "1px solid #ecf1ed",
                marginBottom: 8,
                animation: "pulse 1.4s ease-in-out infinite",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: "#eef3ef",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    width: "70%",
                    height: 14,
                    borderRadius: 4,
                    background: "#eef3ef",
                    marginBottom: 8,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ width: 50, height: 18, borderRadius: 999, background: "#f1f5f2" }} />
                  <div style={{ width: 60, height: 18, borderRadius: 999, background: "#f1f5f2" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
      `}</style>
    </div>
  );
}

function ErrorCard({ error, onRetry }) {
  return (
    <div style={{ padding: "0 16px" }}>
      <div
        style={{
          padding: "16px 16px 14px",
          background: "#fff5ef",
          border: "1px solid #f1c08a",
          borderRadius: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
            color: "#a85a00",
          }}
        >
          <AlertTriangle size={18} />
          <div style={{ fontSize: 14, fontWeight: 900 }}>No se pudo generar el menú</div>
        </div>
        <div style={{ fontSize: 12, color: "#7a4a12", marginBottom: 14, lineHeight: 1.45 }}>
          {error?.message ?? "La IA no respondió correctamente. Inténtalo de nuevo."}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: "#1a3a24",
              color: "#fff",
              fontSize: 12,
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <RotateCw size={13} />
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onRegenerate }) {
  return (
    <div style={{ padding: "0 16px" }}>
      <div
        style={{
          padding: "20px 16px",
          background: "#fff",
          border: "1px dashed #d9e5dd",
          borderRadius: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: "#eaf2ec",
            color: "#3f6948",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          <Wand2 size={18} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#15331c", marginBottom: 4 }}>
          Aún no tienes menú esta semana
        </div>
        <div style={{ fontSize: 12, color: "#8d978f", marginBottom: 14, lineHeight: 1.45 }}>
          Pulsa "Generar" y la IA diseñará tu menú a partir de todo lo que has configurado.
        </div>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: "#1a3a24",
              color: "#fff",
              fontSize: 12,
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Wand2 size={13} />
            Generar
          </button>
        )}
      </div>
    </div>
  );
}

export function DishDetail({ recipe, slot, onClose, onReject }) {
  const rejectReasons = ["No me gusta", "Esta semana no", "Tarda demasiado", "Lo comí hace poco"];
  const [rejected, setRejected] = useState(null);
  // Las recetas IA llegan sin steps (se generan bajo demanda para acortar la
  // generación del menú); las del catálogo estático ya los traen.
  const [steps, setSteps] = useState(() => recipe.steps ?? []);
  const [stepsLoading, setStepsLoading] = useState(
    () => (recipe.steps?.length ?? 0) === 0
  );
  const ingredients = scaledIngredients(recipe, slot.eaters);
  const macros = recipe.macros;

  useEffect(() => {
    if ((recipe.steps?.length ?? 0) > 0) return undefined;
    let active = true;
    const ctrl = new AbortController();
    generateRecipeSteps(recipe, { signal: ctrl.signal })
      .then((s) => {
        recipe.steps = s;
        if (active) {
          setSteps(s);
          setStepsLoading(false);
        }
      })
      .catch(() => {
        if (active) setStepsLoading(false);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [recipe]);

  return (
    <div style={detailOverlayStyle} onClick={onClose}>
      <div style={detailSheetStyle} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" style={closeButtonStyle}>
          <X size={20} />
        </button>

        <DishVisual recipe={recipe} height={220} />

        <div style={{ padding: "18px 2px 0" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={detailTagStyle}>
              <Users size={12} /> {slot.eaters} comensales
            </span>
            <span style={detailTagStyle}>
              <Clock3 size={12} /> {recipe.time} min
            </span>
            <span style={detailTagStyle}>
              <Gauge size={12} /> {recipe.difficulty}
            </span>
          </div>

          <section style={macroCardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Flame size={17} color="#c67030" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#15331c" }}>
                  Perfil nutricional
                </div>
                <div style={{ fontSize: 11, color: "#8a948d" }}>{recipe.kcal} kcal por ración</div>
              </div>
            </div>
            {[
              ["Proteína", macros.protein, "#5a7ea8"],
              ["Carbohidratos", macros.carbs, "#c67030"],
              ["Grasas", macros.fat, "#8b6f35"],
            ].map(([label, value, color]) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#526057",
                    marginBottom: 5,
                  }}
                >
                  <span>{label}</span>
                  <span>{value}g</span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: "#edf2ee",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Number(value) * 1.45)}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: color,
                    }}
                  />
                </div>
              </div>
            ))}
          </section>

          <section style={recipeBlockStyle}>
            <div style={sectionTitleStyle}>
              <BookOpen size={16} /> Receta
            </div>
            <p style={{ fontSize: 13, color: "#66736b", margin: "0 0 14px", lineHeight: 1.5 }}>
              {recipe.prepSummary}
            </p>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#15331c", marginBottom: 8 }}>
              Ingredientes ajustados
            </div>
            <div style={{ display: "grid", gap: 7, marginBottom: 16 }}>
              {ingredients.map((ing) => (
                <div key={ing.id} style={ingredientRowStyle}>
                  <span>{ing.name}</span>
                  <strong>{ing.label}</strong>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#15331c", marginBottom: 8 }}>
              Paso a paso
            </div>
            {stepsLoading ? (
              <div
                style={{
                  fontSize: 13,
                  color: "#8a948d",
                  animation: "pulse 1.4s ease-in-out infinite",
                }}
              >
                Preparando el paso a paso…
                <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }`}</style>
              </div>
            ) : steps.length > 0 ? (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: "#526057",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {steps.map((step) => (
                  <li key={step} style={{ marginBottom: 6 }}>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: 13, color: "#8a948d", margin: 0 }}>
                No se pudo cargar el paso a paso. Cierra y vuelve a abrir el plato para reintentar.
              </p>
            )}
          </section>

          {recipe.allergens.length > 0 && (
            <div
              style={{
                fontSize: 12,
                color: "#c67030",
                marginBottom: 14,
                display: "flex",
                gap: 6,
              }}
            >
              <AlertTriangle size={14} />
              Contiene: {recipe.allergens.join(", ")}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1a3a24", marginBottom: 10 }}>
              ¿No te convence?
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {rejectReasons.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  selected={rejected === r}
                  onClick={() => setRejected(rejected === r ? null : r)}
                />
              ))}
            </div>
          </div>

          {rejected && (
            <button
              type="button"
              onClick={() => {
                onReject(slot, rejected);
                onClose();
              }}
              style={replaceButtonStyle}
            >
              Sustituir plato
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ghostButtonStyle = {
  border: "1px solid #d9e5dd",
  background: "#fff",
  color: "#2d5a3d",
  padding: "7px 11px",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryMiniButtonStyle = {
  ...ghostButtonStyle,
  border: "none",
  background: "#1a3a24",
  color: "#fff",
};

const shoppingButtonStyle = {
  flex: 1,
  padding: "14px",
  borderRadius: 14,
  border: "none",
  background: "#1a3a24",
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: "inherit",
};

const iconChipButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  padding: 0,
  borderRadius: 999,
  border: "1px solid #e6eee8",
  background: "#fff",
  color: "#2d5a3d",
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: "inherit",
};

const detailOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(9,22,13,.58)",
  zIndex: 1000,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  width: "100vw",
  height: "100vh",
};

const detailSheetStyle = {
  background: "#fff",
  borderRadius: "26px 26px 0 0",
  width: "100%",
  maxWidth: 420,
  maxHeight: "92vh",
  overflow: "auto",
  padding: "14px 16px 24px",
  position: "relative",
};

const closeButtonStyle = {
  position: "absolute",
  right: 26,
  top: 26,
  zIndex: 2,
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,.92)",
  color: "#1a3a24",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const detailTagStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 9px",
  borderRadius: 999,
  background: "#f3f7f4",
  color: "#526057",
  fontSize: 11,
  fontWeight: 800,
};

const macroCardStyle = {
  borderRadius: 16,
  padding: "14px 15px",
  background: "#fff",
  border: "1px solid #e8eee9",
  marginBottom: 14,
};

const recipeBlockStyle = {
  borderRadius: 16,
  padding: "14px 15px",
  background: "#fff",
  border: "1px solid #e8eee9",
  marginBottom: 14,
};

const sectionTitleStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 14,
  fontWeight: 900,
  color: "#15331c",
  marginBottom: 10,
};

const ingredientRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 10,
  background: "#f8faf8",
  color: "#526057",
  fontSize: 12,
};

const replaceButtonStyle = {
  width: "100%",
  padding: "14px",
  borderRadius: 12,
  border: "none",
  background: "#c67030",
  color: "#fff",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
};
