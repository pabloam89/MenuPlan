import { useMemo, useState } from "react";
import {
  Flame,
  Sparkles,
  ChefHat,
  ChevronRight,
  ClipboardList,
  BarChart3,
  RotateCw,
  Utensils,
  Settings as SettingsIcon,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { computeStreak, countMenusGenerated, favoriteCategoryThisWeek } from "../lib/menuStats.js";

const PAGE_BG = "#f4f8f5";
const GREEN = "#2d5a3d";
const INK = "#142f1d";
const RECIPE_GRADIENT = "linear-gradient(135deg, #8f3fc4 0%, #e0567a 100%)";
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
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "12px 14px", borderRadius: 14, border: "1px solid #eef2ef",
        background: disabled ? "#f7f9f7" : "#fff", cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left", fontFamily: "inherit", marginBottom: 8,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: 11, background: bg, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={16} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK }}>{title}</p>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#7a9485" }}>{subtitle}</p>}
      </div>
      <ChevronRight size={16} color="#b7c7bd" />
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
  onOpenAccount,
  onViewMenu,
  onGenerateNewMenu,
  onOpenAnalytics,
  onOpenRecipePlanner,
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
          <button
            type="button"
            onClick={onOpenAccount}
            aria-label="Ajustes de cuenta"
            style={{
              width: 38, height: 38, borderRadius: 12, border: "1px solid #e3ebe6",
              background: "#f4f7f5", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <SettingsIcon size={17} color={GREEN} />
          </button>
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

        {/* Actions */}
        <ActionCard
          icon={ClipboardList}
          title="Generar menú"
          subtitle="Estadísticas, editar esta semana o generar uno nuevo"
          gradient={MENU_GRADIENT}
          expanded={expanded === "menu"}
          onClick={() => setExpanded((v) => (v === "menu" ? null : "menu"))}
        >
          <QuickActionRow
            icon={ClipboardList}
            title="Ver menú de esta semana"
            subtitle={hasMenu ? "Editar los platos ya generados" : "Todavía no has generado ninguno"}
            onClick={onViewMenu}
            disabled={!hasMenu}
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
          <p style={{ margin: "6px 2px 0", fontSize: 11, color: "#a8b8ae" }}>
            Próximamente: histórico de semanas anteriores.
          </p>
        </ActionCard>

        <ActionCard
          icon={ChefHat}
          title="Crear receta"
          subtitle="Cuéntanos tu plato y la IA rellena lo que falte"
          gradient={RECIPE_GRADIENT}
          badge="IA"
          onClick={onOpenRecipePlanner}
        >
          {null}
        </ActionCard>

        {data.userRecipes?.length > 0 && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 2,
              padding: "10px 14px", borderRadius: 14,
              background: "#f2e7fb", border: "1px solid #e6d3f5",
            }}
          >
            <Sparkles size={14} color="#9647c9" style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 12, color: "#6d3a8f", fontWeight: 600, lineHeight: 1.4 }}>
              Tienes {data.userRecipes.length} receta{data.userRecipes.length === 1 ? "" : "s"} propia
              {data.userRecipes.length === 1 ? "" : "s"} — añádela{data.userRecipes.length === 1 ? "" : "s"} en "¿Qué repetimos?".
            </p>
          </div>
        )}
      </div>

      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
