import { useMemo, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  RotateCw,
  CalendarDays,
  UtensilsCrossed,
  Sparkles,
  User,
  Users,
  PersonStanding,
  Baby,
  CookingPot,
  Refrigerator,
  Settings,
  Leaf,
  SlidersHorizontal,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { countMenusGenerated } from "../lib/menuStats.js";
import { planHasDishes } from "../lib/menuArchive.js";
import { DAYS, getMeals, getDayMeals } from "../lib/planner.js";
import { adhocReasonLabel } from "../lib/groups.js";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { memberAvatarColor } from "../lib/stages.js";
import menuCardPhoto from "../assets/dashboard/menu-card.png";
import recipesCardPhoto from "../assets/dashboard/recipes-card.jpg";
import pantryCardPhoto from "../assets/dashboard/pantry-card.jpg";
import heroProducePhoto from "../assets/dashboard/hero-produce.jpg";

const PAGE_BG = "#f4f8f5";
const GREEN = "#2d5a3d";
const INK = "#142f1d";
const MENU_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";

const GROUP_ICONS = { Familia: Users, Adultos: User, Niños: PersonStanding, Bebé: Baby };

const todayShort = () => DAYS[(new Date().getDay() + 6) % 7];

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
        const Icon = group.adHoc ? CookingPot : GROUP_ICONS[group.label] ?? Users;
        const label = group.adHoc ? adhocReasonLabel(group.reason) : group.label;
        const active = group.id === activeId;
        return (
          <button
            key={group.id}
            type="button"
            title={label}
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

// ── Menu hero: the app is about generating menus, so this is the single, big,
// full-width action that owns the home. Horizontal banner, left-anchored copy,
// action arrow on the right over the photo. ────────────────────────────────
function MenuHeroCard({ photo, onClick, id }) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 7",
        borderRadius: 22,
        overflow: "hidden",
        border: "none",
        cursor: "pointer",
        padding: 0,
        fontFamily: "inherit",
        display: "block",
        boxShadow: "0 16px 30px -14px rgba(20,47,29,.5)",
      }}
    >
      <img
        src={photo}
        alt=""
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center 45%",
        }}
      />
      {/* Darken only the top band (behind the copy) and let the rest of the
          photo show whole, so the dish stays the centre of attention. */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(10,26,16,.8) 0%, rgba(10,26,16,.46) 34%, rgba(10,26,16,.08) 62%, rgba(10,26,16,0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: 0, padding: "14px 18px 0", textAlign: "left",
          display: "flex", alignItems: "center", gap: 11,
        }}
      >
        <div
          style={{
            width: 40, height: 40, borderRadius: 13, flexShrink: 0,
            background: "rgba(255,255,255,.22)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <RotateCw size={20} color="#fff" strokeWidth={2.4} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-.4px", lineHeight: 1.05 }}>
            Generar menú
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.9)", lineHeight: 1.3 }}>
            Tu menú de la (o las) semanas, en segundos
          </p>
        </div>
      </div>
    </button>
  );
}

// ── Quick action: full-bleed photo card with the title embedded ────────────

function QuickActionTile({ icon: Icon, title, subtitle, photo, objectPosition = "center", aspectRatio = "4 / 5", onClick, id }) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      style={{
        flex: 1,
        position: "relative",
        aspectRatio,
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
      {/* Fixed-height + top-anchored (not bottom-flow): the 3 titles/subtitles
          wrap to a different number of lines ("Actualizar despensa" wraps,
          "Generar menú" doesn't), so letting the block just hug its own
          content while pinned to `bottom` made the icon sit at a different
          height on each card. Reserving a constant height and starting the
          flex column from its top means the icon lands at the exact same Y
          on all 3 regardless of how many lines the copy below it takes. */}
      <div
        style={{
          position: "absolute", left: 12, right: 12, bottom: 12, textAlign: "left",
          minHeight: 112, display: "flex", flexDirection: "column", justifyContent: "flex-start",
        }}
      >
        <div
          style={{
            width: 32, height: 32, borderRadius: 10, marginBottom: 8, flexShrink: 0,
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
          <p style={{ margin: "3px 0 0", fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,.8)", lineHeight: 1.3 }}>{subtitle}</p>
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
  onOpenStreak,
  onOpenAccount,
  expertMode = false,
  onToggleMode,
}) {
  const g = googleInfo(user);
  // Real dishes, not just key count: a plan always carries `_warnings`, so an
  // empty/aborted plan would otherwise show a phantom "hoy te toca" section.
  const hasMenu = planHasDishes(menuPlan);
  const members = data.members ?? [];
  const groups = data.groups ?? [];
  const multiGroup = groups.length > 1;

  const [activeGroupId, setActiveGroupId] = useState(null);
  const selectedGroup = groups.find((gr) => gr.id === activeGroupId) ?? groups[0] ?? null;

  const { count: menusGenerated, isCapped } = useMemo(
    () => countMenusGenerated(data.menuHistory),
    [data.menuHistory],
  );

  // Today's planned dishes for the selected group (home shows only HOY).
  // With several menus (Adultos/Niños/Bebé) a discreet control lets you flip
  // between them; the section itself only ever renders dishes.
  const todayMeals = useMemo(() => {
    if (!selectedGroup || !hasMenu) return [];
    const day = todayShort();
    const out = [];
    for (const meal of getDayMeals(data)) {
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

          {/* Interruptor de modo (básico ⇄ avanzado). El spotlight lo señala
              para que quien se quede en básico sepa que puede subir de nivel. */}
          {onToggleMode && (
            <button
              type="button"
              data-coach="home-mode"
              onClick={onToggleMode}
              aria-label={expertMode ? "Modo avanzado (toca para modo sencillo)" : "Modo sencillo (toca para modo avanzado)"}
              title={expertMode ? "Modo avanzado" : "Modo sencillo"}
              style={{
                position: "absolute", top: 14, left: 14, zIndex: 1,
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 34, padding: "0 12px", borderRadius: 999,
                border: "none", background: "rgba(255,255,255,.22)",
                backdropFilter: "blur(6px)",
                cursor: "pointer", color: "#fff",
                fontFamily: "inherit", fontSize: 12, fontWeight: 800,
              }}
            >
              {expertMode ? <SlidersHorizontal size={14} color="#fff" strokeWidth={2.4} /> : <Leaf size={14} color="#fff" strokeWidth={2.4} />}
              {expertMode ? "Avanzado" : "Sencillo"}
            </button>
          )}

          {/* "Perfil" lost its bottom-nav tab (see BottomNav in ui.jsx) —
              it's reached from here now, the "Inicio" it always stays under. */}
          {onOpenAccount && (
            <button
              type="button"
              data-coach="dashboard-profile"
              onClick={onOpenAccount}
              aria-label="Tu perfil"
              title="Tu perfil"
              style={{
                position: "absolute", top: 14, right: 14, zIndex: 1,
                width: 34, height: 34, borderRadius: "50%",
                border: "none", background: "rgba(255,255,255,.22)",
                backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Settings size={16} color="#fff" strokeWidth={2.3} />
            </button>
          )}

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

          {/* Racha / menús generados. Vive aquí (identidad/logro) ahora que los
              stats desaparecieron; sigue siendo el único acceso a "account". */}
          {menusGenerated > 0 && onOpenStreak && (
            <button
              type="button"
              onClick={onOpenStreak}
              aria-label="Tu racha de menús"
              style={{
                position: "relative", marginTop: 14,
                display: "inline-flex", alignItems: "center", gap: 7,
                height: 30, padding: "0 13px", borderRadius: 999,
                border: "none", background: "rgba(255,255,255,.2)",
                backdropFilter: "blur(6px)", cursor: "pointer",
                color: "#fff", fontFamily: "inherit",
              }}
            >
              <ClipboardList size={14} color="#fff" strokeWidth={2.4} />
              <span style={{ fontSize: 12.5, fontWeight: 800 }}>
                {menusGenerated}{isCapped ? "+" : ""} {menusGenerated === 1 ? "menú generado" : "menús generados"}
              </span>
            </button>
          )}
        </div>

        {/* ── Acción principal: generar menú (el corazón de la app) ─────── */}
        <div style={{ marginBottom: 12 }}>
          <MenuHeroCard
            id="coach-generate-menu"
            photo={menuCardPhoto}
            onClick={onGenerateNewMenu}
          />
        </div>

        {/* ── Acciones secundarias: despensa + recetas ──────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <QuickActionTile
            id="coach-update-pantry"
            icon={Refrigerator}
            title="Actualizar despensa"
            subtitle="Foto, ticket o a mano"
            photo={pantryCardPhoto}
            objectPosition="center 40%"
            aspectRatio="4 / 5"
            onClick={() => onNav("pantry")}
          />
          <QuickActionTile
            id="coach-generate-recipes"
            icon={Sparkles}
            title="Generar recetas"
            subtitle="Con lo que hay en casa"
            photo={recipesCardPhoto}
            objectPosition="center 62%"
            aspectRatio="4 / 5"
            onClick={onOpenRecipePlanner}
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
      </div>

      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
