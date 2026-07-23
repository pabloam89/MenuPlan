import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChefHat,
  Drumstick,
  Egg,
  Fish,
  Leaf,
  Moon,
  Refrigerator,
  Soup,
  Sun,
  Utensils,
  Wheat,
  X,
} from "lucide-react";
import {
  BottomNav,
  SegmentedControl,
  GroupScopePicker,
  WeekRangeBadge,
  bottomNavSpacer,
} from "../components/ui.jsx";
import { groupsFromModel } from "../lib/groups.js";
import { getConsumptionInsights, mergeConsumptionGroups, filterConsumptionByMeal } from "../lib/consumptionInsights.js";
import { getMenuInsights } from "../lib/menuInsights.js";
import { formatWeekRangeLabel, getWeekDates } from "../lib/weekCalendar.js";
import { visualForRecipe } from "../assets/dishes/dishVisuals.js";
import { tabDirection } from "../lib/motion.js";
import { SpendPanel } from "./SpendPanel.jsx";

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };
const TAB_OPTIONS = [
  { id: "cocina", label: "Cocina" },
  { id: "objetivos", label: "Objetivos" },
  { id: "gasto", label: "Gasto" },
];

export function AnalyticsScreen({ data, setData, menuPlan, shopping, setShopping, onUndoReceiptTachado, onNav, onToast, initialTab = null, onInitialTabHandled = null, onBackToPantry = null, navActive = "menu" }) {
  const [tab, setTab] = useState(initialTab ?? "cocina");
  const tabDirRef = useRef(0);
  // Deep link from "En casa" → Gastos: land directly on the requested tab.
  useEffect(() => {
    if (!initialTab) return;
    tabDirRef.current = tabDirection(TAB_OPTIONS, tab, initialTab);
    setTab(initialTab);
    onInitialTabHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
  const handleTabChange = (next) => {
    if (next === tab) return;
    tabDirRef.current = tabDirection(TAB_OPTIONS, tab, next);
    setTab(next);
  };
  const [scope, setScope] = useState("all");
  const weekLabel = formatWeekRangeLabel(getWeekDates());
  const groups = data.groups?.length ? data.groups : groupsFromModel(data.members, data.menuModel);

  const insights = useMemo(
    () => getMenuInsights(menuPlan, groups, data, shopping),
    [menuPlan, groups, data, shopping]
  );

  const multiGroup = groups.length > 1;
  const activeGroup = scope === "all" ? null : insights.byGroup.find((g) => g.groupId === scope);
  const consumption = useMemo(
    () => getConsumptionInsights(menuPlan, groups, data),
    [menuPlan, groups, data]
  );
  const cookView = useMemo(
    () => cookViewForScope(scope, insights, activeGroup),
    [scope, insights, activeGroup]
  );
  const activeConsumption =
    scope === "all" ? null : consumption.find((c) => c.groupId === scope);
  const viewConsumption = useMemo(() => {
    if (scope === "all") return mergeConsumptionGroups(consumption);
    return activeConsumption;
  }, [scope, consumption, activeConsumption]);

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100dvh" }}>
      <div style={{ padding: "20px 16px 0" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={titleStyle}>{tab === "gasto" ? "Tu gasto" : "Tu semana"}</h2>
          {tab !== "gasto" && <WeekRangeBadge label={weekLabel} />}
          {/* Quick jump to "En casa" from Gasto — the two are tightly linked
              (tickets feed the pantry) so it's useful from every route into
              this tab, not just the deep-link-from-Pantry case: falls back
              to a plain forward nav when there's no "back to where you came
              from" callback (i.e. reached via the bottom nav directly). */}
          {tab === "gasto" && (
            <button
              type="button"
              onClick={onBackToPantry ?? (() => onNav("pantry"))}
              aria-label="Ir a En casa"
              title="Ir a En casa"
              style={backToPantryBtnStyle}
            >
              <Refrigerator size={17} strokeWidth={2.3} />
            </button>
          )}
        </div>

        {/* Tabs are always available — Gasto works even without an active menú. */}
        {multiGroup && insights.hasMenu && tab !== "gasto" && (
          <GroupScopePicker groups={groups} scope={scope} onChange={setScope} />
        )}

        <SegmentedControl
          value={tab}
          onChange={handleTabChange}
          options={TAB_OPTIONS}
          activeDark
          style={{ marginBottom: 10 }}
        />
        <TabDivider options={TAB_OPTIONS} value={tab} />
        <div
          key={tab}
          className={tabDirRef.current >= 0 ? "mp-tab-fwd" : "mp-tab-back"}
        >
          {tab === "cocina" && insights.hasMenu && <CookKpiStrip stats={cookView.cookStats} />}
        </div>
      </div>

      <div
        key={`content-${tab}`}
        className={tabDirRef.current >= 0 ? "mp-tab-fwd" : "mp-tab-back"}
        style={{ padding: "0 16px", paddingBottom: `calc(${bottomNavSpacer()} + 12px)` }}
      >
        {tab === "gasto" ? (
          <SpendPanel data={data} setData={setData} shopping={shopping} setShopping={setShopping} onUndoReceiptTachado={onUndoReceiptTachado} onToast={onToast} />
        ) : !insights.hasMenu ? (
          <EmptyAnalytics onNav={onNav} />
        ) : tab === "cocina" ? (
          <CocinaTab cookView={cookView} meals={insights.meals} />
        ) : (
          <ObjetivosTab viewConsumption={viewConsumption} meals={insights.meals} />
        )}
      </div>

      {/* "Análisis" no longer has its own tab (see BottomNav) — it's an icon
          hanging off whichever tab you opened it from, so that's what stays
          lit here: "En casa" when opened from Pantry's ticket icon, "Menú"
          from its Cocina-stats icon (the default). */}
      <BottomNav active={navActive} onNav={onNav} />
    </div>
  );
}

function cookViewForScope(scope, insights, activeGroup) {
  if (scope === "all") {
    return {
      cookByDayMeal: insights.aggregate.cookByDayMeal,
      cookStats: insights.aggregate.cookStats,
      maxMinutes: insights.aggregate.cookStats?.maxDayMinutes ?? 1,
      durationBuckets: insights.aggregate.durationBuckets,
    };
  }
  return {
    cookByDayMeal: activeGroup?.cookByDayMeal ?? [],
    cookStats: activeGroup?.cookStats ?? {},
    maxMinutes: activeGroup?.maxCookMinutes ?? 1,
    durationBuckets: activeGroup?.durationBuckets ?? { total: 0, buckets: { quick: { count: 0, minutes: 0, recipes: [] }, medium: { count: 0, minutes: 0, recipes: [] }, long: { count: 0, minutes: 0, recipes: [] } } },
  };
}

function TabDivider({ options, value }) {
  const activeIdx = options.findIndex((o) => o.id === value);
  return (
    <div
      style={{
        display: "flex",
        gap: 5,
        marginBottom: 16,
        paddingTop: 2,
      }}
    >
      {options.map((opt, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        return (
          <div
            key={opt.id}
            style={{
              flex: 1,
              height: isActive ? 4 : 3,
              borderRadius: 999,
              background: isPast || isActive ? "#2d5a3d" : "#d6e6db",
              opacity: isActive ? 1 : isPast ? 0.55 : 1,
              boxShadow: isActive ? "0 0 8px rgba(45,90,61,.55)" : "none",
              transition: "all .28s cubic-bezier(.4,0,.2,1)",
            }}
          />
        );
      })}
    </div>
  );
}

function CookKpiStrip({ stats }) {
  if (!stats) return null;
  const items = [
    {
      label: "Media L–V / día",
      value: stats.weekdayAvg > 0 ? `${stats.weekdayAvg}′` : "—",
      color: "#2d5a3d",
    },
    {
      label: "Media finde / día",
      value: stats.weekendAvg > 0 ? `${stats.weekendAvg}′` : "—",
      color: "#4cba6e",
    },
    {
      label: "Día más intenso",
      value: stats.heaviestDay?.minutes > 0 ? DAY_LETTERS[stats.heaviestDay.day] : "—",
      color: "#c67030",
    },
    {
      label: "Día más suave",
      value: stats.lightestDay?.minutes > 0 ? DAY_LETTERS[stats.lightestDay.day] : "—",
      color: "#5a7ea8",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginBottom: 16,
      }}
    >
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#fff",
              border: `2.5px solid ${color}`,
              color,
              fontSize: 14,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color,
              lineHeight: 1.25,
              letterSpacing: "-.1px",
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function CocinaTab({ cookView, meals }) {
  const [mealFilter, setMealFilter] = useState("all");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card
        title="Tiempo en cocina por día"
        headerRight={
          <MealMiniToggle meals={meals} value={mealFilter} onChange={setMealFilter} />
        }
      >
        <DayCookChart rows={cookView.cookByDayMeal} meals={meals} mealFilter={mealFilter} />
      </Card>

      {cookView.durationBuckets?.total > 0 && (
        <Card title="Duración de platos">
          <DurationBucketsChart buckets={cookView.durationBuckets} />
        </Card>
      )}
    </div>
  );
}

const MEAL_FILTER_COLORS = { Comida: "#0d9488", Cena: "#2b7cd3" };

function MealMiniToggle({ meals, value, onChange }) {
  const comida = meals.find((m) => m === "Comida") ?? meals[0];
  const cena = meals.find((m) => m === "Cena") ?? meals[meals.length - 1];

  const options = [
    { id: "all", label: "Todos" },
    ...(comida ? [{ id: comida, label: null, Icon: Sun }] : []),
    ...(cena && cena !== comida ? [{ id: cena, label: null, Icon: Moon }] : []),
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        background: "#f0f4f1",
        borderRadius: 9,
        padding: 2,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {options.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            title={label ?? id}
            onClick={() => onChange(id)}
            style={{
              height: 26,
              minWidth: label ? 44 : 30,
              padding: label ? "0 10px" : 0,
              borderRadius: 7,
              border: "none",
              background: active ? "#2d5a3d" : "transparent",
              color: active ? "#fff" : "#7a8a7f",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 800,
              transition: "all .15s",
            }}
          >
            {label ?? (Icon ? <Icon size={14} strokeWidth={2.4} /> : id)}
          </button>
        );
      })}
    </div>
  );
}

const DURATION_BUCKETS = [
  { key: "quick", label: "Rápidos", sub: "< 20′", color: "#4cba6e" },
  { key: "medium", label: "Normales", sub: "20–40′", color: "#2d5a3d" },
  { key: "long", label: "Elaborados", sub: "> 40′", color: "#c67030" },
];

function DurationBucketsChart({ buckets }) {
  const [expanded, setExpanded] = useState(null);
  const rows = DURATION_BUCKETS.map((b) => ({
    ...b,
    data: buckets.buckets?.[b.key] ?? { count: 0, minutes: 0, recipes: [] },
  })).filter((r) => r.data.count > 0);
  const max = Math.max(...rows.map((r) => r.data.count), 1);
  const barH = 34;
  const rowGap = 14;
  const ICON_COL_W = 36;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: rowGap }}>
        {rows.map(({ key, label, sub, color, data }) => {
          const barWidthPct =
            data.count > 0 ? Math.max(6, Math.round((data.count / max) * 100)) : 0;
          const isOpen = expanded === key;

          return (
            <div key={key}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 6,
                  paddingRight: ICON_COL_W + 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color }}>
                  {label}{" "}
                  <span style={{ fontWeight: 600, color: "#8d978f" }}>{sub}</span>
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {data.minutes}′
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: barH,
                    borderRadius: 999,
                    background: "#eef4ef",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${barWidthPct}%`,
                      borderRadius: 999,
                      background: color,
                      transition: "width .35s ease",
                    }}
                  />
                </div>
                <button
                  type="button"
                  title={`Ver platos ${label}`}
                  onClick={() => setExpanded(isOpen ? null : key)}
                  style={{
                    width: ICON_COL_W,
                    height: barH,
                    flexShrink: 0,
                    borderRadius: 10,
                    border: `1.5px solid ${isOpen ? color : "#dde8e1"}`,
                    background: isOpen ? `${color}14` : "#f7f9f7",
                    color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                    transition: "all .15s ease",
                  }}
                >
                  <BookOpen size={16} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {expanded && (() => {
        const row = rows.find((r) => r.key === expanded);
        if (!row?.data.recipes.length) return null;
        const { color, data } = row;
        return (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {data.recipes.map((recipe) => {
              const visual = visualForRecipe(recipe);
              return (
                <div
                  key={recipe.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "#f7f9f7",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      background: visual.surface,
                      color: visual.ink,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <BookOpen size={13} strokeWidth={2.2} />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#142f1d",
                      minWidth: 0,
                    }}
                  >
                    {recipe.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {recipe.time}′
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

function DayCookChart({ rows, meals, mealFilter }) {
  const [hoverDay, setHoverDay] = useState(null);
  const comidaMeal = meals.find((m) => m === "Comida") ?? meals[0];
  const cenaMeal = meals.find((m) => m === "Cena") ?? meals[meals.length - 1];

  const chartRows = rows.map((row) => {
    if (mealFilter === "all") return { day: row.day, minutes: row.total, row };
    return { day: row.day, minutes: row.byMeal[mealFilter] ?? 0, row };
  });
  const chartMax = Math.max(...chartRows.map((r) => r.minutes), 1);
  const barColor =
    mealFilter === "all"
      ? null
      : MEAL_FILTER_COLORS[mealFilter] ?? "#2d5a3d";

  const hoverRow = hoverDay ? chartRows.find((r) => r.day === hoverDay) : null;

  return (
    <div>
      {hoverRow && hoverRow.minutes > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#eef4ef",
            border: "1px solid #dde8e1",
            fontSize: 13,
            fontWeight: 700,
            color: "#142f1d",
          }}
        >
          <strong>{hoverRow.day}</strong>
          {" · "}
          {hoverRow.minutes}′
          {mealFilter === "all" && (
            <>
              {comidaMeal && hoverRow.row.byMeal[comidaMeal] > 0 && (
                <span style={{ color: "#0d9488" }}>
                  {" "}
                  · Comida {hoverRow.row.byMeal[comidaMeal]}′
                </span>
              )}
              {cenaMeal && hoverRow.row.byMeal[cenaMeal] > 0 && (
                <span style={{ color: MEAL_FILTER_COLORS.Cena }}>
                  {" "}
                  · Cena {hoverRow.row.byMeal[cenaMeal]}′
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 6,
          height: 132,
          paddingTop: 4,
        }}
      >
        {chartRows.map(({ day, minutes, row }) => {
          const weekend = day === "Sáb" || day === "Dom";
          const h = minutes > 0 ? Math.max(16, (minutes / chartMax) * 100) : 8;
          const isHover = hoverDay === day;
          const fill = barColor ?? (weekend ? "#4cba6e" : "#2d5a3d");
          return (
            <div
              key={day}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                height: "100%",
                justifyContent: "flex-end",
              }}
              onMouseEnter={() => setHoverDay(day)}
              onMouseLeave={() => setHoverDay(null)}
              onClick={() => setHoverDay(hoverDay === day ? null : day)}
            >
              {minutes > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    color: isHover ? fill : "#8d978f",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {minutes}′
                </span>
              )}
              <div
                style={{
                  width: "100%",
                  maxWidth: 36,
                  height: `${h}%`,
                  minHeight: minutes > 0 ? 12 : 6,
                  borderRadius: 8,
                  background: fill,
                  opacity: minutes > 0 ? (isHover ? 1 : 0.88) : 0.2,
                  transition: "opacity .15s, transform .15s",
                  transform: isHover ? "scaleY(1.04)" : "scaleY(1)",
                  transformOrigin: "bottom",
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8a7f" }}>
                {DAY_LETTERS[day]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ObjetivosTab({ viewConsumption, meals }) {
  const [mealFilter, setMealFilter] = useState("all");
  const filtered = useMemo(
    () => filterConsumptionByMeal(viewConsumption, mealFilter),
    [viewConsumption, mealFilter]
  );

  if (!filtered?.hasMeals) {
    return (
      <Card>
        <p style={emptyTextStyle}>Sin comidas registradas esta semana.</p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ConsumptionGroupBody
        data={filtered}
        meals={meals}
        mealFilter={mealFilter}
        onMealFilterChange={setMealFilter}
      />
    </div>
  );
}

const FAMILY_COLORS = {
  pescado: "#2072b8",
  carne: "#c03818",
  legumbres: "#2d8a48",
  huevos: "#c8a000",
  verdura: "#4cba6e",
  pasta: "#c07018",
  arroz: "#caa544",
  otros: "#3f6948",
};

const FAMILY_ICON_TYPE = {
  pescado: "fish",
  carne: "meat",
  legumbres: "legume",
  huevos: "egg",
  verdura: "greens",
  pasta: "pasta",
  arroz: "rice",
  otros: "chef",
};

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

function FamilyDishIcon({ familyKey, size = 36 }) {
  const iconType = FAMILY_ICON_TYPE[familyKey] ?? "chef";
  const visual = visualForRecipe({ iconType });
  const Icon = ICONS_BY_TYPE[iconType] ?? Utensils;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        background: visual.accent,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2.2} />
    </span>
  );
}

function ConsumptionGroupBody({ data, meals, mealFilter, onMealFilterChange }) {
  return (
    <>
      <Card
        title="Qué coméis esta semana"
        headerRight={
          <MealMiniToggle meals={meals} value={mealFilter} onChange={onMealFilterChange} />
        }
      >
        <FamilyDonutChart items={data.familyCounts} mealCount={data.mealCount} />
      </Card>

      <Card>
        <FamilyLegendTable items={data.familyCounts} />
      </Card>

      <MacrosSection data={data} />
    </>
  );
}

const LEGEND_GRID = "minmax(0, 1fr) 64px 64px 44px";
const LEGEND_NUM_COL_BG = "#eef4ef";

function FamilyDonutChart({ items, mealCount }) {
  const size = 200;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) {
    return <p style={emptyTextStyle}>Sin datos de comidas.</p>;
  }

  let cursor = 0;
  const gradientStops = items
    .map((item) => {
      const pct = (item.count / total) * 100;
      const start = cursor;
      cursor += pct;
      const color = FAMILY_COLORS[item.key] ?? "#7a8a7f";
      return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    })
    .join(", ");

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: `conic-gradient(${gradientStops})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "26%",
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "inset 0 0 0 1px #e8f0ea",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 900, color: "#142f1d", lineHeight: 1 }}>
            {mealCount ?? total}
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#8d978f", letterSpacing: 0.5, marginTop: 4 }}>
            COMIDAS
          </span>
        </div>
      </div>
    </div>
  );
}

function FamilyLegendTable({ items }) {
  const [sheetFamily, setSheetFamily] = useState(null);
  const sheetItem = sheetFamily ? items.find((i) => i.key === sheetFamily) : null;

  if (items.length === 0) {
    return <p style={emptyTextStyle}>Sin datos de comidas.</p>;
  }

  return (
    <>
      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #dde8e1",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: LEGEND_GRID,
            background: "#2d5a3d",
            color: "#fff",
          }}
        >
          <span style={legendHeadFamStyle}>Familia</span>
          <span style={legendHeadNumStyle}>Veces</span>
          <span style={legendHeadNumStyle}>Platos</span>
          <span style={legendHeadActionStyle} aria-hidden="true" />
        </div>

        {items.map((item, idx) => {
          const recipeCount = item.recipeCount ?? item.recipes?.length ?? 0;
          const hasRecipes = recipeCount > 0;
          return (
            <div
              key={item.key}
              style={{
                display: "grid",
                gridTemplateColumns: LEGEND_GRID,
                alignItems: "center",
                borderTop: idx === 0 ? "none" : "1px solid #eef4ef",
                background: "#fff",
              }}
            >
              <div style={legendFamCellStyle}>
                <FamilyDishIcon familyKey={item.key} />
                <span style={{ fontSize: 14, fontWeight: 800, color: "#142f1d" }}>{item.label}</span>
              </div>
              <span style={legendNumCellStyle}>{item.count}</span>
              <span style={legendNumCellStyle}>{recipeCount}</span>
              <div style={legendActionCellStyle}>
                <button
                  type="button"
                  title="Ver recetas"
                  aria-label={`Ver recetas de ${item.label}`}
                  disabled={!hasRecipes}
                  onClick={() => hasRecipes && setSheetFamily(item.key)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    border: `1px solid ${hasRecipes ? "#e0eae3" : "#eef2ef"}`,
                    background: "#fff",
                    color: hasRecipes ? "#3d5245" : "#c5cdc8",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: hasRecipes ? "pointer" : "default",
                    fontFamily: "inherit",
                    padding: 0,
                    opacity: hasRecipes ? 1 : 0.45,
                  }}
                >
                  <BookOpen size={15} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {sheetItem && (
        <FamilyRecipesSheet
          family={sheetItem}
          onClose={() => setSheetFamily(null)}
        />
      )}
    </>
  );
}

const legendHeadFamStyle = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  textAlign: "left",
};

const legendHeadNumStyle = {
  padding: "10px 8px",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  textAlign: "center",
};

const legendHeadActionStyle = {
  padding: "10px 6px",
};

const legendFamCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  minWidth: 0,
};

const legendNumCellStyle = {
  padding: "10px 8px",
  fontSize: 15,
  fontWeight: 900,
  color: "#142f1d",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  background: LEGEND_NUM_COL_BG,
  alignSelf: "stretch",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const legendActionCellStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 6px",
};

function FamilyRecipesSheet({ family, onClose }) {
  const recipes = family.recipes ?? [];
  const accent = visualForRecipe({ iconType: FAMILY_ICON_TYPE[family.key] ?? "chef" }).accent;

  return (
    <div style={sheetOverlayStyle} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={sheetPanelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FamilyDishIcon familyKey={family.key} />
            <h3 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0 }}>{family.label}</h3>
          </div>
          <button type="button" onClick={onClose} style={sheetCloseBtnStyle} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#7a8a7f", margin: "12px 0 16px" }}>
          {recipes.length} {recipes.length === 1 ? "plato" : "platos"} esta semana
        </p>
        <div style={{ maxHeight: "45dvh", overflow: "auto" }}>
          {recipes.map((recipe) => (
            <div
              key={recipe.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid #e8f0ea",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: "#142f1d", minWidth: 0 }}>
                {recipe.name}
              </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: accent, flexShrink: 0 }}>×{recipe.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const sheetOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 150,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const sheetPanelStyle = {
  background: "#fff",
  borderRadius: "20px 20px 0 0",
  width: "100%",
  maxWidth: 420,
  padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
};

const sheetCloseBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "none",
  background: "#f0f4f1",
  color: "#64748b",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const MACRO_COLORS = {
  protein: "#5a7ea8",
  carbs: "#c67030",
  fat: "#8b6f35",
};

function PeriodMiniToggle({ value, onChange }) {
  const options = [
    { id: "day", label: "Día" },
    { id: "week", label: "Semana" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        background: "#f0f4f1",
        borderRadius: 9,
        padding: 2,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {options.map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              height: 26,
              minWidth: 52,
              padding: "0 10px",
              borderRadius: 7,
              border: "none",
              background: active ? "#2d5a3d" : "transparent",
              color: active ? "#fff" : "#7a8a7f",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 800,
              transition: "all .15s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function consumptionPeriodStats(data, period) {
  const activeDays = data.macrosByDay.filter((d) => d.meals > 0).length || 1;
  if (period === "week") {
    return {
      macros: data.macrosWeek,
      mealCount: data.mealCount,
      unitSuffix: "/ sem",
    };
  }
  return {
    macros: {
      protein: Math.round(data.macrosWeek.protein / activeDays),
      carbs: Math.round(data.macrosWeek.carbs / activeDays),
      fat: Math.round(data.macrosWeek.fat / activeDays),
      kcal: Math.round(data.macrosWeek.kcal / activeDays),
    },
    mealCount: Math.round((data.mealCount / activeDays) * 10) / 10,
    unitSuffix: "/ día",
  };
}

function formatKcalCircle(value) {
  if (!value) return "0";
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

function formatMealCircle(value) {
  if (!value) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function macroPercentages(macros) {
  const proteinKcal = macros.protein * 4;
  const carbsKcal = macros.carbs * 4;
  const fatKcal = macros.fat * 9;
  const total = proteinKcal + carbsKcal + fatKcal || 1;
  return {
    protein: Math.round((proteinKcal / total) * 100),
    carbs: Math.round((carbsKcal / total) * 100),
    fat: Math.round((fatKcal / total) * 100),
  };
}

function MacroPercentKpiRow({ macros }) {
  const pct = macroPercentages(macros);
  const items = [
    { key: "protein", label: "Proteína", value: `${pct.protein}%` },
    { key: "carbs", label: "Carbos", value: `${pct.carbs}%` },
    { key: "fat", label: "Grasas", value: `${pct.fat}%` },
  ];

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      {items.map(({ key, label, value }) => (
        <div
          key={key}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#fff",
              border: `2.5px solid ${MACRO_COLORS[key]}`,
              color: MACRO_COLORS[key],
              fontSize: 12,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: MACRO_COLORS[key],
              lineHeight: 1.25,
              letterSpacing: "-.1px",
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function MacroWeekKpiRow({ macrosWeek, mealCount }) {
  const items = [
    { label: "Kcal/Semana", value: formatKcalCircle(macrosWeek.kcal), color: "#2d5a3d" },
    { label: "Nº Comidas", value: formatMealCircle(mealCount), color: "#4cba6e" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, marginTop: 16, paddingTop: 16, borderTop: "1px solid #eef4ef" }}>
      {items.map(({ label, value, color }) => (
        <div
          key={label}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#fff",
              border: `2.5px solid ${color}`,
              color,
              fontSize: value.length > 4 ? 11 : 14,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color,
              lineHeight: 1.25,
              letterSpacing: "-.1px",
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function MacrosSection({ data }) {
  const [period, setPeriod] = useState("week");
  const stats = consumptionPeriodStats(data, period);
  const weekStats = consumptionPeriodStats(data, "week");

  return (
    <>
      <Card
        title="Macros"
        headerRight={<PeriodMiniToggle value={period} onChange={setPeriod} />}
      >
        <MacroPercentKpiRow macros={stats.macros} />
        <MacroBars macros={stats.macros} unitSuffix={stats.unitSuffix} />
      </Card>

      <Card title="Kcal/Día">
        <DayKcalChart rows={data.macrosByDay} />
        <MacroWeekKpiRow macrosWeek={weekStats.macros} mealCount={weekStats.mealCount} />
      </Card>
    </>
  );
}

function MacroBars({ macros, unitSuffix }) {
  const rows = [
    { key: "protein", label: "Proteína", unit: "g", value: macros.protein },
    { key: "carbs", label: "Carbos", unit: "g", value: macros.carbs },
    { key: "fat", label: "Grasas", unit: "g", value: macros.fat },
  ];
  const macroMax = Math.max(macros.protein, macros.carbs, macros.fat, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map(({ key, label, unit, value }) => (
        <div
          key={key}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "#fff",
            border: "1px solid #e8f0ea",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: MACRO_COLORS[key] }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: MACRO_COLORS[key], fontVariantNumeric: "tabular-nums" }}>
              {value}
              {unit} {unitSuffix}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "#eef4ef", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (value / macroMax) * 100)}%`,
                background: MACRO_COLORS[key],
                borderRadius: 999,
                transition: "width .35s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DayKcalChart({ rows }) {
  const chartMax = Math.max(...rows.map((r) => r.kcal), 1);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 6,
          height: 132,
          paddingTop: 4,
        }}
      >
        {rows.map((row) => {
          const weekend = row.day === "Sáb" || row.day === "Dom";
          const h = row.kcal > 0 ? Math.max(16, (row.kcal / chartMax) * 100) : 8;
          const fill = weekend ? "#4cba6e" : "#2d5a3d";
          return (
            <div
              key={row.day}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                height: "100%",
                justifyContent: "flex-end",
              }}
            >
              {row.kcal > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#8d978f",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.kcal >= 1000
                    ? `${(row.kcal / 1000).toFixed(1).replace(/\.0$/, "")}k`
                    : row.kcal}
                </span>
              )}
              <div
                style={{
                  width: "100%",
                  maxWidth: 36,
                  height: `${h}%`,
                  minHeight: row.kcal > 0 ? 12 : 6,
                  borderRadius: 8,
                  background: fill,
                  opacity: row.kcal > 0 ? 0.88 : 0.2,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8a7f" }}>
                {DAY_LETTERS[row.day]}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ ...emptyTextStyle, fontSize: 11, marginTop: 12 }}>
        Estimación según menú planificado, cole y horarios de cada persona.
      </p>
    </div>
  );
}

function Card({ title, headerRight, children, compact }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e8f0ea",
        padding: compact ? "14px 14px" : "16px 14px",
        boxShadow: "0 1px 4px rgba(20, 47, 29, 0.04)",
      }}
    >
      {(title || headerRight) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 12,
          }}
        >
          {title && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "#142f1d",
                letterSpacing: "-.2px",
                minWidth: 0,
              }}
            >
              {title}
            </div>
          )}
          {headerRight}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyAnalytics({ onNav }) {
  return (
    <div style={{ padding: "32px 0 16px", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#7a8a7f", margin: "0 0 16px" }}>
        Genera un menú para ver el análisis
      </p>
      <button type="button" onClick={() => onNav("menu")} style={primaryBtnStyle}>
        Ir al menú
      </button>
    </div>
  );
}

const titleStyle = {
  fontSize: 26,
  fontWeight: 900,
  color: "#142f1d",
  margin: 0,
  letterSpacing: "-.7px",
};

// Same icon-button language as Pantry.jsx's own header actions
// (pantryIconBtn) — smaller, since here it sits next to a big title instead
// of alone in a header row.
const backToPantryBtnStyle = {
  width: 34,
  height: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 11,
  border: "1.5px solid #dbe7df",
  background: "#fff",
  color: "#2d5a3d",
  fontFamily: "inherit",
  cursor: "pointer",
  boxShadow: "0 6px 16px -12px rgba(20,47,29,.3)",
  flexShrink: 0,
};

const emptyTextStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: "#7a8a7f",
};

const primaryBtnStyle = {
  padding: "12px 20px",
  borderRadius: 12,
  border: "none",
  background: "#2d5a3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
