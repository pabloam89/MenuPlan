import { useMemo, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  RotateCw,
  Heart,
  ChefHat,
  CalendarDays,
  UtensilsCrossed,
  Sparkles,
  User,
  Users,
  PersonStanding,
  Baby,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { countMenusGenerated } from "../lib/menuStats.js";
import { favoriteRecipeIds } from "../lib/recipeVotes.js";
import { DAYS, getMeals } from "../lib/planner.js";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { memberAvatarColor } from "../lib/stages.js";
import menuCardPhoto from "../assets/dashboard/menu-card.jpg";
import recipesCardPhoto from "../assets/dashboard/recipes-card.jpg";
import heroProducePhoto from "../assets/dashboard/hero-produce.jpg";

const PAGE_BG = "#f4f8f5";
const GREEN = "#2d5a3d";
const INK = "#142f1d";
const MENU_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";

const GROUP_ICONS = { Familia: Users, Adultos: User, Niños: PersonStanding, Bebé: Baby };

const todayShort = () => DAYS[(new Date().getDay() + 6) % 7];

// ── Liquid-glass stat pill ──────────────────────────────────────────────────

function GlassStat({ icon: Icon, value, label, tint }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        position: "relative",
        borderRadius: 20,
        padding: "15px 8px 13px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        textAlign: "center",
        // Liquid glass: translucent fill + blur + a strong green rim and a
        // top inner highlight so it reads as frosted glass over the page.
        background:
          "linear-gradient(180deg, rgba(255,255,255,.85) 0%, rgba(240,247,242,.6) 100%)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "2px solid rgba(45,90,61,.55)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.9), 0 10px 22px -14px rgba(31,74,48,.5)",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: tint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
        }}
      >
        <Icon size={18} color={GREEN} strokeWidth={2.3} />
      </div>
      <span style={{ fontSize: 20, fontWeight: 900, color: INK, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10.5, color: "#5f7568", fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}

// ── Today's dish row ────────────────────────────────────────────────────────

function TodayDishRow({ meal, recipe, photo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        width: "100%",
        padding: 10,
        borderRadius: 16,
        border: "1.5px solid #e3ebe6",
        background: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        boxShadow: "0 6px 16px -12px rgba(20,47,29,.3)",
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 14,
          overflow: "hidden",
          flexShrink: 0,
          background: "#eef4f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px solid #e3ebe6",
        }}
      >
        {photo ? (
          <img src={photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <UtensilsCrossed size={22} color="#9ab0a1" />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 10,
            fontWeight: 800,
            color: GREEN,
            background: "#e6f3ea",
            padding: "2px 8px",
            borderRadius: 999,
            letterSpacing: ".3px",
            textTransform: "uppercase",
          }}
        >
          {meal}
        </span>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 14.5,
            fontWeight: 800,
            color: INK,
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {recipe.name}
        </p>
      </div>
      <ChevronRight size={17} color="#b7c7bd" style={{ flexShrink: 0 }} />
    </button>
  );
}

// ── Discreet, icon-only switch between the family's separate menus ─────────

function GroupSegmentedControl({ groups, activeId, onChange }) {
  return (
    <div
      style={{
        display: "flex", gap: 2, padding: 3, borderRadius: 999,
        background: "#eaf1ec", flexShrink: 0,
      }}
    >
      {groups.map((group) => {
        const Icon = GROUP_ICONS[group.label] ?? Users;
        const active = group.id === activeId;
        return (
          <button
            key={group.id}
            type="button"
            title={group.label}
            onClick={() => onChange(group.id)}
            style={{
              width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: active ? GREEN : "transparent",
              transition: "background .15s ease",
            }}
          >
            <Icon size={13.5} color={active ? "#fff" : "#7a9485"} strokeWidth={2.3} />
          </button>
        );
      })}
    </div>
  );
}

// ── Quick action: full-bleed photo card with the title embedded ────────────

function QuickActionTile({ icon: Icon, title, subtitle, photo, objectPosition = "center", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        position: "relative",
        aspectRatio: "4 / 5",
        borderRadius: 20,
        overflow: "hidden",
        border: "none",
        cursor: "pointer",
        padding: 0,
        fontFamily: "inherit",
        boxShadow: "0 14px 26px -14px rgba(20,47,29,.45)",
      }}
    >
      <img
        src={photo}
        alt=""
        loading="lazy"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition,
        }}
      />
      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(190deg, rgba(15,35,22,0) 38%, rgba(13,32,20,.55) 72%, rgba(10,26,16,.86) 100%)",
        }}
      />
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, textAlign: "left" }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 10, marginBottom: 8,
            background: "rgba(255,255,255,.22)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon size={16} color="#fff" strokeWidth={2.3} />
        </div>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: "#fff", letterSpacing: "-.2px", lineHeight: 1.15 }}>
          {title}
        </p>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>{subtitle}</p>
        )}
      </div>
    </button>
  );
}

/**
 * Post-login home screen: a social-style profile header (avatar, name, family,
 * follows), liquid-glass stats, today's dishes, and the weekly-menu action.
 * The recipe catalog lives in the bottom nav, not here.
 */
export function DashboardScreen({
  user,
  data,
  menuPlan,
  onNav,
  onViewMenu,
  onGenerateNewMenu,
  onOpenRecipePlanner,
}) {
  const g = googleInfo(user);
  const hasMenu = Object.keys(menuPlan ?? {}).length > 0;
  const members = data.members ?? [];
  const groups = data.groups ?? [];
  const multiGroup = groups.length > 1;

  const [activeGroupId, setActiveGroupId] = useState(null);
  const selectedGroup = groups.find((gr) => gr.id === activeGroupId) ?? groups[0] ?? null;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Buenas noches";
    if (h < 14) return "Buenos días";
    if (h < 21) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const { count: menusGenerated, isCapped } = useMemo(
    () => countMenusGenerated(data.menuHistory),
    [data.menuHistory],
  );
  const recipesCreated = data.userRecipes?.length ?? 0;
  const favoritesCount = useMemo(
    () => favoriteRecipeIds(data.recipeVotes).length,
    [data.recipeVotes],
  );

  // Today's planned dishes for the selected group (home shows only HOY).
  // With several menus (Adultos/Niños/Bebé) a discreet control lets you flip
  // between them; the section itself only ever renders dishes.
  const todayMeals = useMemo(() => {
    if (!selectedGroup || !hasMenu) return [];
    const day = todayShort();
    const out = [];
    for (const meal of getMeals(data)) {
      const slot = menuPlan[selectedGroup.id]?.[`${day}-${meal}`];
      if (!slot?.recipeId) continue;
      const recipe = RECIPES_BY_ID[slot.recipeId];
      if (!recipe) continue;
      out.push({ meal, recipe, photo: dishImageForRecipe(recipe) });
    }
    return out;
  }, [menuPlan, data, hasMenu, selectedGroup]);

  const showTodaySection = multiGroup ? hasMenu : todayMeals.length > 0;

  const familyShown = members.slice(0, 5);
  const familyExtra = members.length - familyShown.length;

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
        {/* ── Profile hero ─────────────────────────────── */}
        <div
          style={{
            position: "relative",
            background: MENU_GRADIENT,
            borderRadius: 26,
            padding: "26px 18px 22px",
            marginBottom: 16,
            overflow: "hidden",
            boxShadow: "0 18px 34px -16px rgba(20,47,29,.6)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <img
            src={heroProducePhoto}
            alt=""
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "top", pointerEvents: "none",
              // Zoom from a bottom-anchored origin so the busy produce arc
              // (near the top of the source photo) gets pushed further up
              // and out of frame, leaving mostly the calmer plain backdrop.
              transform: "scale(1.4)", transformOrigin: "50% 82%",
            }}
          />
          <div
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "linear-gradient(180deg, rgba(12,34,21,.5) 0%, rgba(12,34,21,.32) 32%, rgba(10,28,18,.68) 100%)",
            }}
          />

          {/* greeting */}
          <p
            style={{
              margin: "0 0 12px", fontSize: 15.5, fontWeight: 800, color: "#fff",
              textShadow: "0 1px 4px rgba(0,0,0,.4)", position: "relative",
            }}
          >
            {greeting}
          </p>

          {/* avatar circle */}
          <div style={{ padding: 3, borderRadius: "50%", background: "rgba(255,255,255,.3)", position: "relative" }}>
            <Avatar name={g.name} photo={g.photo} size={84} color="#1f4a30" />
          </div>

          {/* name */}
          <p
            style={{
              margin: "12px 0 0", fontSize: 24, fontWeight: 900, color: "#fff",
              letterSpacing: "-.4px", position: "relative", textAlign: "center",
              textShadow: "0 1px 5px rgba(0,0,0,.4)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
            }}
          >
            {g.name}
          </p>

          {/* family avatars */}
          {familyShown.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", marginTop: 12, position: "relative" }}>
              {familyShown.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    marginLeft: i === 0 ? 0 : -10,
                    borderRadius: "50%",
                    border: "2px solid #2d5a3d",
                    zIndex: familyShown.length - i,
                    lineHeight: 0,
                  }}
                >
                  <Avatar name={m.name} photo={m.photo} size={34} color={memberAvatarColor(m.id, members)} />
                </div>
              ))}
              {familyExtra > 0 && (
                <div
                  style={{
                    marginLeft: -10, width: 34, height: 34, borderRadius: "50%",
                    border: "2px solid #2d5a3d", background: "rgba(255,255,255,.24)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color: "#fff",
                  }}
                >
                  +{familyExtra}
                </div>
              )}
            </div>
          )}

          {/* follows — social model, wired later (user_follows) */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 22, marginTop: 16, position: "relative",
              textShadow: "0 1px 3px rgba(0,0,0,.35)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1 }}>0</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>siguiendo</p>
            </div>
            <div style={{ width: 1, height: 26, background: "rgba(255,255,255,.3)" }} />
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1 }}>0</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>seguidores</p>
            </div>
          </div>
        </div>

        {/* ── Stats (liquid glass) ──────────────────────── */}
        <div style={{ display: "flex", gap: 9, marginBottom: 16 }}>
          <GlassStat
            icon={ChefHat}
            value={recipesCreated > 0 ? recipesCreated : "—"}
            label={recipesCreated === 1 ? "receta creada" : "recetas creadas"}
            tint="#e6f3ea"
          />
          <GlassStat
            icon={ClipboardList}
            value={menusGenerated > 0 ? `${menusGenerated}${isCapped ? "+" : ""}` : "—"}
            label={menusGenerated === 1 ? "menú generado" : "menús generados"}
            tint="#e5eff9"
          />
          <GlassStat
            icon={Heart}
            value={favoritesCount > 0 ? favoritesCount : "—"}
            label={favoritesCount === 1 ? "favorita" : "favoritas"}
            tint="#fdeef1"
          />
        </div>

        {/* ── Hoy toca (solo renderiza platos; vacío si no hay menú) ── */}
        {showTodaySection && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "2px 2px 10px" }}>
              <CalendarDays size={16} color={GREEN} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: INK, letterSpacing: "-.2px", flexShrink: 0 }}>
                Hoy toca
              </p>
              {multiGroup && (
                <>
                  <div style={{ flex: 1, borderTop: "2px dashed #d7e4dc" }} />
                  <GroupSegmentedControl groups={groups} activeId={selectedGroup?.id} onChange={setActiveGroupId} />
                </>
              )}
            </div>
            {todayMeals.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {todayMeals.map(({ meal, recipe, photo }) => (
                  <TodayDishRow key={meal} meal={meal} recipe={recipe} photo={photo} onClick={onViewMenu} />
                ))}
              </div>
            ) : (
              <p style={{ margin: "2px 2px 0", fontSize: 12.5, color: "#9aa8a0", fontStyle: "italic" }}>
                Sin menú de hoy para {selectedGroup?.label?.toLowerCase() ?? "este grupo"}
              </p>
            )}
          </div>
        )}

        {/* ── Acciones rápidas ──────────────────────────── */}
        <div style={{ display: "flex", gap: 10 }}>
          <QuickActionTile
            icon={RotateCw}
            title="Generar menú"
            subtitle="Para toda la semana"
            photo={menuCardPhoto}
            objectPosition="center 38%"
            onClick={onGenerateNewMenu}
          />
          <QuickActionTile
            icon={Sparkles}
            title="Generar recetas"
            subtitle="Con lo que tengas en casa"
            photo={recipesCardPhoto}
            objectPosition="center 62%"
            onClick={onOpenRecipePlanner}
          />
        </div>
      </div>

      <BottomNav active="dashboard" onNav={onNav} context="home" />
    </div>
  );
}
