import { useMemo, useState } from "react";
import {
  Flame,
  ChevronRight,
  ClipboardList,
  BarChart3,
  RotateCw,
  Utensils,
  BookOpen,
  CalendarDays,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { computeStreak, countMenusGenerated, favoriteCategoryThisWeek } from "../lib/menuStats.js";

const PAGE_BG = "#f4f8f5";
const GREEN = "#2d5a3d";
const INK = "#142f1d";
const MENU_GRADIENT = "linear-gradient(135deg, #1f4a30 0%, #3f9c5f 100%)";

function StatCard({ icon: Icon, value, label, color, bg }) {
  return (
    <div
      style={{
        flex: 1,
        background: "#fff",
        border: `1.5px solid ${bg}`,
        borderRadius: 18,
        padding: "14px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        textAlign: "center",
        minWidth: 0,
        boxShadow: `0 6px 16px -10px ${color}88`,
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: 11, background: bg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={17} color={color} />
      </div>
      <span style={{ fontSize: 16, fontWeight: 900, color: INK, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 10.5, color: "#7a9485", fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}

function QuickActionRow({ icon: Icon, title, subtitle, onClick, disabled, color = GREEN, bg = "#f0f7f2" }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 13, width: "100%",
        padding: "13px 14px", borderRadius: 16,
        border: `1.5px solid ${disabled ? "#eef2ef" : bg}`,
        background: "#fff", cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left", fontFamily: "inherit", marginBottom: 10,
        opacity: disabled ? 0.5 : 1,
        boxShadow: disabled ? "none" : `0 8px 18px -14px ${color}99`,
        transition: "transform .12s ease, box-shadow .12s ease",
      }}
    >
      <div
        style={{
          width: 42, height: 42, borderRadius: 13, background: bg, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={19} color={color} strokeWidth={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK, letterSpacing: "-.1px" }}>{title}</p>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#7a9485", lineHeight: 1.35 }}>{subtitle}</p>}
      </div>
      <ChevronRight size={17} color={disabled ? "#c7d3cb" : color} style={{ opacity: 0.55 }} />
    </button>
  );
}

function ActionCard({ icon: Icon, title, subtitle, gradient, expanded, onClick, badge, children }) {
  return (
    <div
      style={{
        borderRadius: 22,
        overflow: "hidden",
        marginBottom: 14,
        boxShadow: "0 14px 28px -14px rgba(20,47,29,.35)",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", gap: 14, width: "100%",
          border: "none", background: gradient, cursor: "pointer", padding: "18px 16px",
          fontFamily: "inherit", textAlign: "left", overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute", top: -26, right: -18, width: 90, height: 90, borderRadius: "50%",
            background: "rgba(255,255,255,.14)", pointerEvents: "none",
          }}
        />
        <div
          style={{
            width: 48, height: 48, borderRadius: 15, flexShrink: 0,
            background: "rgba(255,255,255,.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}
        >
          <Icon size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 16.5, fontWeight: 900, color: "#fff", letterSpacing: "-.2px" }}>{title}</p>
            {badge && (
              <span
                style={{
                  fontSize: 9.5, fontWeight: 900, color: "#fff", background: "rgba(255,255,255,.25)",
                  padding: "2px 7px", borderRadius: 999, letterSpacing: ".3px",
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,.85)" }}>{subtitle}</p>
        </div>
        <ChevronRight
          size={19}
          color="rgba(255,255,255,.9)"
          style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s ease", position: "relative" }}
        />
      </button>
      {expanded && <div style={{ background: "#fff", padding: "14px 14px 10px" }}>{children}</div>}
    </div>
  );
}

/**
 * Post-login home screen: profile summary, light stats, and the two
 * top-level actions (generate/manage the menu, or create a new recipe).
 */
export function DashboardScreen({
  user,
  data,
  menuPlan,
  onNav,
  onViewMenu,
  onGenerateNewMenu,
  onOpenAnalytics,
  onOpenRecipePlanner,
  onOpenRecipes,
}) {
  const [expanded, setExpanded] = useState(null); // "menu" | null
  const g = googleInfo(user);
  const hasMenu = Object.keys(menuPlan ?? {}).length > 0;

  const streak = useMemo(() => computeStreak(data.menuHistory), [data.menuHistory]);
  const { count: menusGenerated, isCapped } = useMemo(
    () => countMenusGenerated(data.menuHistory),
    [data.menuHistory],
  );
  const favorite = useMemo(
    () => favoriteCategoryThisWeek(menuPlan, data.groups, data),
    [menuPlan, data],
  );

  return (
    <div style={{ minHeight: "100dvh", background: PAGE_BG, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          padding: `18px 18px calc(${bottomNavSpacer()} + 12px)`,
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Profile header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: "#fff",
            border: "1px solid #eef2ef",
            borderRadius: 20,
            padding: "14px 14px",
            marginBottom: 16,
            boxShadow: "0 4px 14px -10px rgba(20,47,29,.2)",
          }}
        >
          <Avatar name={g.name} photo={g.photo} size={50} color={GREEN} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
              Hola, {g.name.split(" ")[0]}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#7a9485", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {g.email ?? "Tu panel"}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <StatCard
            icon={Flame}
            value={streak > 0 ? streak : "—"}
            label={streak === 1 ? "semana seguida" : "semanas seguidas"}
            color="#d9711f"
            bg="#fdece1"
          />
          <StatCard
            icon={ClipboardList}
            value={menusGenerated > 0 ? `${menusGenerated}${isCapped ? "+" : ""}` : "—"}
            label="menús generados"
            color="#2f6fb8"
            bg="#e5eff9"
          />
          <StatCard
            icon={Utensils}
            value={favorite ? favorite.label : "—"}
            label={favorite ? "favorito esta semana" : "sin menú aún"}
            color="#9647c9"
            bg="#f2e7fb"
          />
        </div>

        {/* Acceso directo al menú */}
        <ActionCard
          icon={ClipboardList}
          title="Tu menú semanal"
          subtitle={hasMenu ? "Ver y editar los platos de esta semana" : "Genera tu primer menú personalizado"}
          gradient={MENU_GRADIENT}
          expanded={expanded === "menu"}
          onClick={hasMenu ? () => setExpanded((v) => (v === "menu" ? null : "menu")) : onGenerateNewMenu}
        >
          <QuickActionRow
            icon={CalendarDays}
            title="Ver menú de esta semana"
            subtitle="Editar los platos ya generados"
            onClick={onViewMenu}
            color="#2f6fb8"
            bg="#e5eff9"
          />
          <QuickActionRow
            icon={RotateCw}
            title="Generar un menú nuevo"
            subtitle="Vuelve a repartir los platos de esta semana"
            onClick={onGenerateNewMenu}
            color={GREEN}
            bg="#e4f3e9"
          />
          <QuickActionRow
            icon={BarChart3}
            title="Ver estadísticas"
            subtitle="Cocina, macros y consumo semanal"
            onClick={onOpenAnalytics}
            disabled={!hasMenu}
            color="#9647c9"
            bg="#f2e7fb"
          />
        </ActionCard>

        {/* Acceso al recetario */}
        <button
          type="button"
          onClick={onOpenRecipes}
          style={{
            display: "flex", alignItems: "center", gap: 14, width: "100%",
            padding: "14px 16px", borderRadius: 18, border: "1.5px solid #e3ebe6",
            background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            boxShadow: "0 4px 14px -10px rgba(20,47,29,.15)",
          }}
        >
          <div
            style={{
              width: 44, height: 44, borderRadius: 13, background: "#f2e7fb", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <BookOpen size={20} color="#9647c9" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Recetario</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#7a9485" }}>
              {data.userRecipes?.length > 0
                ? `${data.userRecipes.length} receta${data.userRecipes.length === 1 ? "" : "s"} propia${data.userRecipes.length === 1 ? "" : "s"} · catálogo completo`
                : "Explora el catálogo o crea tus propias recetas"}
            </p>
          </div>
          <ChevronRight size={17} color="#b7c7bd" />
        </button>
      </div>

      <BottomNav active="dashboard" onNav={onNav} context="home" />
    </div>
  );
}
