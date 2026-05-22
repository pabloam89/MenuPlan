import { createElement, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChefHat,
  Clock3,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Gauge,
  Layers,
  Leaf,
  RotateCw,
  School,
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
import { BottomNav, Chip, AvatarStack } from "../components/ui.jsx";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { membersOfGroup } from "../lib/groups.js";
import { getMenuInsights } from "../lib/menuInsights.js";
import { DAYS, getMeals, isLunchMeal, slotKey } from "../lib/planner.js";
import { getSchoolDish, hasAnySchoolDish } from "../lib/schoolMenu.js";

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

function PremiumMetric({ icon, label, value, caption, tone }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 16,
        padding: "11px 12px",
        background: "#fff",
        border: "1px solid #ecf1ed",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: tone,
          marginBottom: 6,
          fontSize: 9,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {createElement(icon, { size: 12 })}
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 900, color: "#15331c", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#8d978f", marginTop: 4 }}>{caption}</div>
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

function DishCard({ slot, onTap, group, showGroupTag }) {
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
  const hasWarning = (slot.warnings ?? []).length > 0;
  const firstWarning = hasWarning ? slot.warnings[0] : null;

  return (
    <button
      type="button"
      onClick={() => onTap(recipe, slot)}
      title={firstWarning ? firstWarning.message : undefined}
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
      {hasWarning && (
        <span
          aria-label="Aviso"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: "#f1a23a",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AlertTriangle size={9} />
        </span>
      )}
      <DishIcon recipe={recipe} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: hasWarning ? 22 : 0 }}>
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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <MacroPill label="min" value={recipe.time} tone="#2d5a3d" />
          <MacroPill label="g prot" value={recipe.macros.protein} tone="#5a7ea8" />
        </div>
      </div>
    </button>
  );
}

export function MenuScreen({
  data,
  menuPlan,
  isGenerating = false,
  error = null,
  onDishTap,
  onNav,
  onRegenerate,
  onRetry,
  onReset,
}) {
  const [activeGroupIds, setActiveGroupIds] = useState(() =>
    data.groups.slice(0, 1).map((g) => g.id)
  );
  const [warningsOpen, setWarningsOpen] = useState(false);

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
  const visibleGroupSet = new Set(visibleGroups.map((g) => g.id));
  const showGroupTag = visibleGroups.length > 1;
  const warnings = (menuPlan._warnings ?? []).filter((warning) =>
    visibleGroupSet.has(warning.groupId)
  );
  const insights = useMemo(
    () => getMenuInsights(menuPlan, visibleGroups),
    [menuPlan, visibleGroups]
  );

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
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onReset}
              style={ghostButtonStyle}
              disabled={isGenerating}
            >
              Reiniciar
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              style={{
                ...primaryMiniButtonStyle,
                opacity: isGenerating ? 0.6 : 1,
                cursor: isGenerating ? "default" : "pointer",
              }}
              disabled={isGenerating}
            >
              {isGenerating ? "Generando…" : "Regenerar"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 8,
            marginBottom: 12,
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

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <PremiumMetric
            icon={Layers}
            label="Variedad"
            value={`${insights.varietyScore}%`}
            caption={`${insights.uniqueCount} platos únicos`}
            tone="#3f6948"
          />
          <PremiumMetric
            icon={Sparkles}
            label="Proteína media"
            value={`${insights.proteinAvg}g`}
            caption="por plato"
            tone="#5a7ea8"
          />
          <PremiumMetric
            icon={Clock3}
            label="Tiempo medio"
            value={`${insights.timeAvg}m`}
            caption={`${insights.tupperCount} tupper`}
            tone="#c67030"
          />
        </div>

        {!isGenerating && !error && warnings.length > 0 && (
          <div style={warningPanelStyle}>
            <button
              type="button"
              onClick={() => setWarningsOpen((open) => !open)}
              style={warningButtonStyle}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={14} />
                {warnings.length} aviso{warnings.length === 1 ? "" : "s"} para revisar
              </span>
              <span>{warningsOpen ? "Ocultar" : "Ver"}</span>
            </button>
            {warningsOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {warnings.slice(0, 8).map((warning, idx) => (
                  <div
                    key={`${warning.groupId}-${warning.day}-${warning.meal}-${idx}`}
                    style={{ fontSize: 11, color: "#7a4a12" }}
                  >
                    <strong>
                      {warning.groupLabel} · {warning.day} · {warning.meal}:
                    </strong>{" "}
                    {warning.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isGenerating && <GeneratingSkeleton />}

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
                  gap: 8,
                  padding: "0 4px",
                  marginBottom: 10,
                }}
              >
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
                  if (slot) result.push({ kind: "dish", group: g, slot });
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
                            key={`dish-${card.group.id}-${idx}`}
                            slot={card.slot}
                            onTap={onDishTap}
                            group={card.group}
                            showGroupTag={showGroupTag}
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
        <div style={{ padding: "12px 24px 16px", display: "flex", gap: 10 }}>
          <button type="button" onClick={() => onNav("shopping")} style={shoppingButtonStyle}>
            <ShoppingCart size={16} />
            Lista de la compra
          </button>
        </div>
      )}
      <BottomNav active="menu" onNav={onNav} />
    </div>
  );
}

function GeneratingSkeleton() {
  const skeletonRows = [0, 1, 2];
  return (
    <div style={{ padding: "0 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 14px",
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #ecf1ed",
          marginBottom: 14,
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 12,
            background: "#eaf2ec",
            color: "#3f6948",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Wand2 size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#15331c" }}>
            Generando tu menú con IA…
          </div>
          <div style={{ fontSize: 11, color: "#8d978f", marginTop: 2 }}>
            Tarda unos segundos. Estamos encajando alergias, kcal, tupper y horarios.
          </div>
        </div>
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
                <div
                  style={{ display: "flex", gap: 6 }}
                >
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
  const ingredients = scaledIngredients(recipe, slot.eaters);
  const macros = recipe.macros;

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

          {(slot.warnings ?? []).length > 0 && (
            <section style={detailWarningStyle}>
              <AlertTriangle size={15} />
              <div>
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Avisos de ajuste</div>
                {(slot.warnings ?? []).map((warning) => (
                  <div key={`${warning.type}-${warning.message}`}>{warning.message}</div>
                ))}
              </div>
            </section>
          )}

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
            <ol
              style={{
                margin: 0,
                paddingLeft: 18,
                color: "#526057",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {recipe.steps.map((step) => (
                <li key={step} style={{ marginBottom: 6 }}>
                  {step}
                </li>
              ))}
            </ol>
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

const warningPanelStyle = {
  background: "#fff8ed",
  border: "1px solid #f1c58f",
  borderRadius: 14,
  padding: "10px 12px",
  marginBottom: 12,
};

const warningButtonStyle = {
  width: "100%",
  border: "none",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  color: "#8a4f00",
  fontSize: 12,
  fontWeight: 800,
};

const shoppingButtonStyle = {
  flex: 1,
  padding: "14px",
  borderRadius: 14,
  border: "none",
  background: "#1a3a24",
  color: "#fff",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
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

const detailWarningStyle = {
  display: "flex",
  gap: 8,
  background: "#fff8ed",
  color: "#8a4f00",
  borderRadius: 14,
  padding: "12px",
  fontSize: 12,
  lineHeight: 1.45,
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
