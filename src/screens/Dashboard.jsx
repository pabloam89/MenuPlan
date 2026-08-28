import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  CalendarDays,
  UtensilsCrossed,
  Settings,
  Sparkles,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { planHasDishes } from "../lib/menuArchive.js";
import { DAYS, getDayMeals } from "../lib/planner.js";
import { adhocReasonLabel } from "../lib/groups.js";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { memberAvatarColor, memberAvatarThumbSrc } from "../lib/stages.js";
import menuCardPhoto2 from "../assets/dashboard/menu-card-2.jpg";
import menuCardPhoto3 from "../assets/dashboard/menu-card-3.jpg";

// Degradado de fondo de toda Inicio (2026-08-28): sustituye la card verde
// sólida del perfil, que se sentía como una caja vacía sin contenido real
// dentro. Se aplica a TODA la pantalla salvo la card de "Generar menú" y las
// de "Hoy toca" (TodayDishCard), que llevan su propia foto. PAGE_BG es el
// tono aproximado en el punto donde se usa como color sólido de apoyo (el
// fundido del borde del carrusel de "Hoy toca") — el degradado es suave así
// que un tono intermedio pasa desapercibido.
const PAGE_GRADIENT = "linear-gradient(165deg, #e3f5e9 0%, #fbf3d9 45%, #fce6d1 65%, #fde3d3 100%)";
const PAGE_BG = "#fbf3d9";
const GREEN = "#2d5a3d";
const INK = "#142f1d";


const todayShort = () => DAYS[(new Date().getDay() + 6) % 7];

// Saludo contextual: le da a la cabecera un texto propio en vez de depender
// solo de los avatares — pequeño, gratis, y varía a lo largo del día en vez
// de ser una etiqueta estática.
function greetingWord() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

// Nombres compuestos españoles frecuentes: en "José María García" las dos
// primeras palabras son UN nombre, mientras que en "Pablo Artiñano" la
// segunda ya es el apellido. No hay forma programática de distinguirlos sin
// una lista — esta cubre los más habituales y el resto cae al caso general
// (solo la primera palabra).
const COMPOUND_FIRST_NAMES = new Set([
  "jose maria", "jose luis", "jose antonio", "jose manuel", "jose miguel",
  "jose carlos", "jose ramon", "jose ignacio", "jose angel", "jose javier",
  "juan carlos", "juan jose", "juan manuel", "juan antonio", "juan luis",
  "juan pablo", "juan miguel", "juan ramon", "juan ignacio", "juan francisco",
  "maria jose", "maria carmen", "maria luisa", "maria teresa", "maria pilar",
  "maria isabel", "maria dolores", "maria angeles", "maria jesus", "maria elena",
  "maria victoria", "maria rosa", "maria antonia", "maria cristina", "maria eugenia",
  "ana maria", "ana belen", "ana isabel", "ana rosa", "ana cristina",
  "luis miguel", "luis alberto", "luis fernando", "luis javier", "luis enrique",
  "francisco javier", "francisco jose", "francisco manuel",
  "miguel angel", "antonio jose", "carlos alberto", "jesus maria",
  "victor manuel", "pedro pablo", "rosa maria", "carmen maria", "isabel maria",
]);

// Solo el nombre de pila para el saludo: "Pablo Artiñano" → "Pablo", pero
// "José María García" → "José María" (ver COMPOUND_FIRST_NAMES).
function firstNameOf(fullName) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const firstTwo = parts.slice(0, 2).join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return COMPOUND_FIRST_NAMES.has(firstTwo) ? parts.slice(0, 2).join(" ") : parts[0];
}

// ── Today's dish row ────────────────────────────────────────────────────────

function TodayDishCard({ meal, recipe, photo, basis, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        flex: `0 0 ${basis}`,
        minWidth: 0,
        height: 132,
        scrollSnapAlign: "start",
        padding: 0,
        overflow: "hidden",
        borderRadius: 16,
        border: "1.5px solid #e3ebe6",
        background: "#eef4f0",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        boxShadow: "0 6px 16px -12px rgba(20,47,29,.3)",
      }}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <UtensilsCrossed size={26} color="#9ab0a1" />
        </div>
      )}

      {/* Scrim solo en la franja inferior, para que el nombre del plato se
          lea encima de cualquier foto sin tapar las pills de arriba. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "58%",
          background: "linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.18) 65%, transparent 100%)",
        }}
      />

      <span style={{ ...todayPillStyle, top: 6, left: 6, color: GREEN }}>{meal}</span>
      {recipe.time ? (
        <span style={{ ...todayPillStyle, top: 6, right: 6, color: "#5a7262" }}>{recipe.time} min</span>
      ) : null}
      <p
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          bottom: 8,
          margin: 0,
          fontSize: 13,
          fontWeight: 800,
          color: "#fff",
          lineHeight: 1.25,
          textShadow: "0 1px 3px rgba(0,0,0,.4)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {recipe.name}
      </p>
    </button>
  );
}

const todayPillStyle = {
  position: "absolute",
  fontSize: 9.5,
  fontWeight: 800,
  background: "rgba(255,255,255,.92)",
  padding: "2px 7px",
  borderRadius: 999,
  letterSpacing: ".3px",
  whiteSpace: "nowrap",
  boxShadow: "0 1px 4px rgba(20,47,29,.16)",
};

// ── Discreet, icon-only switch between the family's separate menus ─────────

// Antes iconos genéricos (adulto/niño/bebé) — ahora los avatares reales de
// cada miembro del grupo, así se reconoce a quién pertenece cada menú de un
// vistazo en vez de leer un símbolo abstracto (2026-08-28).
function GroupSegmentedControl({ groups, members, activeId, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      {groups.map((group) => {
        const label = group.adHoc ? adhocReasonLabel(group.reason) : group.label;
        const active = group.id === activeId;
        const groupMembers = group.memberIds
          .map((id) => members.find((m) => m.id === id))
          .filter(Boolean)
          .slice(0, 2);
        return (
          <button
            key={group.id}
            type="button"
            title={label}
            onClick={() => onChange(group.id)}
            style={{
              display: "flex", border: "none", cursor: "pointer", background: "transparent",
              padding: 0, opacity: active ? 1 : 0.4, transition: "opacity .15s ease",
            }}
          >
            {groupMembers.length > 0 ? (
              groupMembers.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    marginLeft: i === 0 ? 0 : -10,
                    borderRadius: "50%",
                    border: `2px solid ${active ? GREEN : "transparent"}`,
                    zIndex: groupMembers.length - i,
                    lineHeight: 0,
                  }}
                >
                  <Avatar name={m.name} photo={memberAvatarThumbSrc(m)} size={24} color={memberAvatarColor(m.id, members)} />
                </div>
              ))
            ) : (
              <div
                style={{
                  width: 24, height: 24, borderRadius: "50%", background: "#eaf1ec",
                  border: `2px solid ${active ? GREEN : "transparent"}`,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Cycles through a list of photos with a slide-in + crossfade transition.
 * Respects prefers-reduced-motion (stays on the first image if set).
 */
function RotatingPhoto({ photos, objectPosition = "center", interval = 2000 }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!photos || photos.length <= 1) return undefined;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;
    const t = setInterval(() => setIdx((v) => (v + 1) % photos.length), interval);
    return () => clearInterval(t);
  }, [photos, interval]);

  return (
    <>
      {photos.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          loading={i === 0 ? "eager" : "lazy"}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition,
            opacity: i === idx ? 1 : 0,
            transform: i === idx ? "translateX(0)" : "translateX(-18px)",
            transition: "opacity .45s ease, transform .55s cubic-bezier(.34,1.08,.5,1)",
          }}
        />
      ))}
    </>
  );
}

// ── Menu hero: full-width illustrated banner, left-anchored copy, icon over
// the photo. "Generar menú nuevo" is the one CTA Inicio still has (2026-08-25)
// — every other action moved out from under it (En casa → wizard, Recetas/
// Compra → their own tabs), so this is the single front door to a new menú.
function MenuHeroCard({ photos, onClick, title, subtitle, Icon = Sparkles }) {
  return (
    <button
      type="button"
      data-coach="dashboard-generate"
      onClick={onClick}
      style={{
        position: "relative", width: "100%", aspectRatio: "3 / 2",
        borderRadius: 22, overflow: "hidden", border: "none", cursor: "pointer",
        padding: 0, fontFamily: "inherit", display: "block", marginBottom: 16,
        boxShadow: "0 16px 30px -14px rgba(20,47,29,.5)",
      }}
    >
      <RotatingPhoto photos={photos} objectPosition="center 45%" interval={5000} />
      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(10,26,16,.8) 0%, rgba(10,26,16,.46) 34%, rgba(10,26,16,.08) 62%, rgba(10,26,16,0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: 0, padding: "18px 20px 0", textAlign: "left",
          display: "flex", alignItems: "center", gap: 13,
        }}
      >
        <div
          style={{
            width: 48, height: 48, borderRadius: 15, flexShrink: 0,
            background: "rgba(255,255,255,.22)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon size={24} color="#fff" strokeWidth={2.4} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: "-.4px", lineHeight: 1.05 }}>
            {title}
          </p>
          {subtitle && (
            <p style={{ margin: "5px 0 0", fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,.9)", lineHeight: 1.3 }}>
              {subtitle}
            </p>
          )}
        </div>
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
  activeHousehold,
  householdReadOnly,
  onNav,
  onViewMenu,
  onOpenAccount,
  onGenerateMenu,
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

  // Siempre visible (2026-08-28): antes la sección desaparecía entera cuando
  // no había menú, así que Inicio se quedaba en un hueco vacío bajo la card.
  // Ahora mantiene su cabecera (y el selector de grupos con sus avatares en
  // hogares con varios) y solo cambia las cards de plato por un copy.
  const showTodaySection = true;

  // The hero is the one place with room to spare, so nobody hides behind a
  // "+N" here. Past six the row folds into two staggered halves — the same
  // interlocking the shared GroupAvatarStack uses — instead of running off the
  // card. This keeps its own markup rather than borrowing that component
  // because Avatar still renders an initial for members with no photo, which a
  // faces-only stack would silently drop.
  const familyRows =
    members.length > 6
      ? [members.slice(0, Math.ceil(members.length / 2)), members.slice(Math.ceil(members.length / 2))]
      : [members];

  return (
    <div style={{ minHeight: "100dvh", background: PAGE_GRADIENT, display: "flex", flexDirection: "column" }}>
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
        {/* Sin card propia (2026-08-28): el fondo ya es el degradado de toda
            la pantalla (PAGE_GRADIENT) — meter esto en una caja verde aparte
            era una caja grande casi vacía. Familia + usuario flotan directo
            encima, texto oscuro porque el fondo ahora es claro. */}
        <div
          style={{
            position: "relative",
            padding: "4px 0 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Saludo protagonista: antes la cabecera no tenía ningún texto
              propio, solo avatares. El botón de ajustes se cuelga de la
              misma línea (a la derecha) en vez de flotar suelto en una
              esquina sin contexto — sigue siendo el mismo acceso a "Perfil"
              (ver BottomNav en ui.jsx). Color/tamaño provisionales (dorado,
              más grande) hasta tener la ilustración Pixar de la rueda. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <p
              style={{
                margin: 0, fontSize: 19, fontWeight: 900, color: INK,
                letterSpacing: "-.3px", flex: 1, minWidth: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {greetingWord()}, {firstNameOf(g.name)}
            </p>
            {onOpenAccount && (
              <button
                type="button"
                data-coach="dashboard-profile"
                onClick={onOpenAccount}
                aria-label="Tu perfil"
                title="Tu perfil"
                style={{
                  flexShrink: 0,
                  width: 34, height: 34, borderRadius: "50%",
                  border: "none", background: "rgba(255,255,255,.75)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", boxShadow: "0 2px 6px rgba(20,47,29,.14)",
                }}
              >
                <Settings size={18} color="#c9820a" strokeWidth={2.4} />
              </button>
            )}
          </div>

          {/* Familia como hero: el usuario es el primer avatar del racimo
              (aro dorado lo distingue de "tú"), no una foto grande aparte. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 18, position: "relative" }}>
            {familyRows.map((row, r) => (
              <div
                key={r}
                style={{
                  display: "flex",
                  alignItems: "center",
                  // Half a step right and biting into the row above, so the
                  // two halves interlock rather than sit in a grid.
                  marginLeft: r === 0 ? 0 : 14,
                  marginTop: r === 0 ? 0 : -14,
                  zIndex: r,
                }}
              >
                {r === 0 && (
                  <div
                    style={{
                      borderRadius: "50%", border: "2.5px solid #f5b642",
                      zIndex: row.length + 2, lineHeight: 0,
                    }}
                  >
                    <Avatar name={g.name} photo={g.photo} size={52} color="#1f4a30" />
                  </div>
                )}
                {row.map((m, i) => (
                  <div
                    key={m.id}
                    style={{
                      marginLeft: i === 0 && r === 0 ? -8 : i === 0 ? 0 : -12,
                      borderRadius: "50%",
                      border: "2px solid #fff9ef",
                      boxShadow: "0 0 0 2px #2d5a3d33",
                      zIndex: row.length - i,
                      lineHeight: 0,
                    }}
                  >
                    <Avatar name={m.name} photo={memberAvatarThumbSrc(m)} size={40} color={memberAvatarColor(m.id, members)} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {user && activeHousehold && (
            <p
              style={{
                margin: "8px 0 0", fontSize: 11, fontWeight: 700, color: "#5c7568",
              }}
            >
              {activeHousehold.name}
            </p>
          )}
        </div>

        {/* Ruptura mínima entre cabecera y card: antes todo fluía en un
            único bloque continuo sobre el degradado — esta línea tenue
            marca "aquí acaba lo tuyo, aquí empieza la acción" sin
            necesitar un color ni una caja nueva. */}
        <div aria-hidden style={{ height: 1, background: "rgba(45,90,61,.12)", margin: "2px 0 18px" }} />

        {/* Único CTA que le queda a Inicio (2026-08-25): generar un menú
            nuevo. Todo lo demás (En casa, Recetas, Compra, favoritos e
            históricos) tiene ya su propia puerta fuera de aquí. */}
        {!householdReadOnly && onGenerateMenu && (
          <MenuHeroCard
            photos={[menuCardPhoto2, menuCardPhoto3]}
            onClick={onGenerateMenu}
            title={hasMenu ? "Generar menú" : "Genera tu primer menú"}
          />
        )}

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
                  <GroupSegmentedControl groups={groups} members={members} activeId={selectedGroup?.id} onChange={setActiveGroupId} />
                </>
              )}
            </div>
            {todayMeals.length > 0 ? (
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    overflowX: "auto",
                    scrollSnapType: "x proximity",
                    scrollbarWidth: "none",
                    WebkitOverflowScrolling: "touch",
                    padding: "2px 2px 4px",
                  }}
                >
                  {todayMeals.map(({ meal, recipe, photo }) => (
                    <TodayDishCard
                      key={meal}
                      meal={meal}
                      recipe={recipe}
                      photo={photo}
                      // Con más de 2 platos, las cards se quedan un pelín por
                      // debajo del 50% para que el siguiente asome por el
                      // borde derecho — así se percibe que hay más y que el
                      // carrusel gira hacia la derecha, sin necesitar flechas.
                      basis={todayMeals.length > 2 ? "calc(50% - 14px)" : "calc(50% - 5px)"}
                      onClick={onViewMenu}
                    />
                  ))}
                </div>
                {todayMeals.length > 2 && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      bottom: 4,
                      width: 32,
                      pointerEvents: "none",
                      background: `linear-gradient(90deg, transparent, ${PAGE_BG})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                    }}
                  >
                    <ChevronRight size={15} color="#9ab0a1" strokeWidth={2.5} />
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: "2px 2px 0", fontSize: 12.5, color: "#9aa8a0", fontStyle: "italic" }}>
                {multiGroup && selectedGroup?.label
                  ? `Hoy no tenemos menú para ${selectedGroup.label.toLowerCase()}`
                  : "Hoy no tenemos menú"}
              </p>
            )}
          </div>
        )}
      </div>

      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
