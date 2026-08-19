import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Sparkles,
  BookOpen,
  UserRound,
  Plus,
  Heart,
  ChefHat,
  Users,
  Menu as MenuIcon,
  UtensilsCrossed,
  MoreVertical,
  RotateCw,
  Ban,
  ShoppingCart,
  ArrowRight,
  Share2,
  Receipt,
  Check,
  Trash2,
  CircleHelp,
  X,
  Home,
  Eye,
} from "lucide-react";

// One-shot guided tours ("coach-marks"): a dimming overlay with a cut-out
// spotlight around each target button plus a branded bubble (with a pointer)
// that explains what it does. Unlike the centered "bubble" modals elsewhere in
// the app, these point at real UI. Targets are located by a stable selector so
// we don't have to thread refs through screens or the portaled BottomNav.

// Hogares: tarjeta propia, acceso, acciones, carrusel y biblioteca personal.
export const HOUSEHOLDS_COACH_STEPS = [
  {
    selector: '[data-coach="households-card"]',
    Icon: Home,
    title: "Tu hogar",
    desc: "Menú, compra y despensa de la familia viven aquí. Al terminar el asistente ya quedó creado — renómbralo tocando el nombre.",
    place: "below",
  },
  {
    selector: '[data-coach="households-members"]',
    Icon: Users,
    title: "Quién tiene acceso",
    desc: "Cuentas Google invitadas (propietario o visitante). Las caritas de comensales del menú son otra cosa.",
    place: "above",
  },
  {
    selector: '[data-coach="households-menu"]',
    Icon: MoreVertical,
    title: "Acciones del hogar",
    desc: "Invitar, compartir enlace o vaciar. El menú ⋯ está arriba a la derecha de la tarjeta.",
    place: "below",
  },
  {
    selector: '[data-coach="households-dots"]',
    Icon: ArrowRight,
    title: "Desliza a la derecha",
    desc: "Tu hogar es la primera tarjeta. A la derecha hay huecos para hogares ajenos — en el siguiente paso vamos al primero.",
    place: "above",
  },
  {
    selector: '[data-coach="households-viewer-card"]',
    Icon: Eye,
    title: "Hogar ajeno (solo lectura)",
    desc: "Si te invitan, entras aquí como visitante: ves menú, compra y despensa pero no editas. Máximo 2. Pega el enlace y pulsa Unirse.",
    place: "below",
  },
  {
    selector: '[data-coach="households-biblioteca"]',
    Icon: BookOpen,
    title: "Tu biblioteca",
    desc: "Favoritas y recetas creadas solo tuyas (cuenta Google), aparte del hogar activo.",
    place: "below",
  },
];

// Home: the two action tiles + the meaningful nav tabs.
export const HOME_COACH_STEPS = [
  // El paso "Modo sencillo" desapareció con la píldora de la cabecera: sencillo
  // vs avanzado se pregunta ahora en la primera pantalla del asistente.
  {
    selector: "#coach-generate-menu",
    Icon: CalendarDays,
    title: "Generar menú",
    desc: "Crea el menú semanal para toda la familia, con cada persona y sus necesidades ya tenidas en cuenta.",
    place: "below",
  },
  {
    selector: "#coach-generate-recipes",
    Icon: Sparkles,
    title: "Generar recetas",
    desc: "Inventa recetas nuevas con lo que tengas en casa. La IA te las ajusta a tu cocina y tus gustos.",
    place: "below",
  },
  {
    selector: '[data-coach="nav-recipes"]',
    Icon: BookOpen,
    title: "Recetas",
    desc: "El recetario: explora nuestro catálogo y el de otras familias, añade las tuyas y marca tus favoritas.",
    place: "above",
  },
  {
    // "Perfil" moved off the bottom nav (now a single, always-consistent bar
    // — see BottomNav in ui.jsx) onto this icon in the Inicio hero.
    selector: '[data-coach="dashboard-profile"]',
    Icon: UserRound,
    title: "Perfil",
    desc: "Ajusta tu familia, tus preferencias y tu cuenta siempre que quieras.",
    place: "below",
  },
];

// Recetas del hogar: favoritas, mis recetas y descartados (catálogo → Biblioteca).
export const RECIPES_COACH_STEPS = [
  {
    selector: '[data-coach="recipes-tab-favorites"]',
    Icon: Heart,
    title: "Favoritas del hogar",
    desc: "Las recetas que este hogar guarda para generar menús — las del propietario si entras como visitante.",
    place: "below",
  },
  {
    selector: '[data-coach="recipes-tab-mine"]',
    Icon: ChefHat,
    title: "Mis recetas",
    desc: "Las recetas creadas para este hogar: edítalas y elige si las ve el resto de la familia.",
    place: "below",
  },
  {
    selector: '[data-coach="recipes-tab-discarded"]',
    Icon: Ban,
    title: "Descartados",
    desc: "Los platos que has descartado «para siempre» desde el menú. Aquí puedes recuperarlos cuando quieras.",
    place: "below",
  },
];

// Tu menú screen: views, who-it's-for filter, a dish, + nav (shopping…).
export const MENU_COACH_STEPS = [
  {
    selector: '[data-coach="menu-viewmode"]',
    Icon: CalendarDays,
    title: "Día o semana",
    desc: "Cambia entre lo que toca hoy y la semana completa.",
    place: "below",
  },
  {
    // The circle of faces that opens the scope picker (only when the family
    // eats from more than one menú — otherwise there's nothing to filter).
    selector: '[data-coach="menu-filters"]',
    Icon: Users,
    title: "El menú de cada uno",
    desc: "Toca las caras de tu familia para ver solo el menú de un grupo o de una persona. Y en cada plato, las caras de arriba te dicen quién lo come.",
    place: "below",
  },
  {
    selector: '[data-coach="menu-dish"]',
    Icon: UtensilsCrossed,
    title: "Cada plato",
    desc: "Toca cualquier plato para ver sus ingredientes, los pasos adaptados a tu cocina, sus valores y marcarlo como cocinado.",
    place: "below",
  },
  {
    // The 3-dots button on every tile → quick actions popover.
    selector: '[data-coach="menu-actions"]',
    Icon: MoreVertical,
    title: "Acciones rápidas",
    desc: "En los tres puntos de cada plato: muévelo a otro día, regenéralo, elígelo a mano, duplícalo o quítalo. El menú es tuyo.",
    place: "below",
  },
  {
    // Per-day regenerate control in each day header (scoped by menú if varios).
    selector: '[data-coach="menu-day-regen"]',
    Icon: RotateCw,
    title: "Regenerar un día",
    desc: "¿No os convence un día entero? Regenéralo de golpe. Con varios menús, eliges para quién.",
    place: "below",
  },
  {
    selector: '[data-coach="nav-shopping"]',
    Icon: ShoppingCart,
    title: "Compra",
    desc: "La lista de la compra se genera sola, con todo lo que necesitáis para el menú de la semana.",
    place: "above",
  },
  {
    // Everything that used to be separate header icons now lives inside this
    // burger: Análisis, Menús guardados, Perfil, Compartir, PDF y Regenerar.
    selector: '[data-coach="menu-options"]',
    Icon: MenuIcon,
    title: "Opciones de tu menú",
    desc: "Aquí dentro tienes el análisis nutricional, tus menús guardados, compartir, descargar en PDF y regenerar el menú entero.",
    place: "below",
  },
];

// Compra screen: explains every clickable icon (header actions + per-product
// actions). Unlike the other tours this one is opened on demand from the "?"
// button and can be re-run any time — it's a toggleable spotlight, not a
// one-shot for first-timers.
export const SHOPPING_COACH_STEPS = [
  {
    selector: '[data-coach="shop-share"]',
    Icon: Share2,
    title: "Compartir",
    desc: "Manda la lista por WhatsApp o cópiala para pegarla donde quieras.",
    place: "below",
  },
  {
    selector: '[data-coach="shop-receipt"]',
    Icon: Receipt,
    title: "Ticket",
    desc: "Sube una foto del ticket y marcamos como comprado lo que coincida.",
    place: "below",
  },
  {
    selector: '[data-coach="shop-purchased"]',
    Icon: Check,
    title: "Comprado",
    desc: "Lo acabas de comprar: sale de la lista (puedes deshacerlo al momento).",
    place: "above",
  },
  {
    selector: '[data-coach="shop-recipes"]',
    Icon: BookOpen,
    title: "Recetas",
    desc: "Mira en qué días y platos se usa ese ingrediente.",
    place: "above",
  },
  {
    selector: '[data-coach="shop-remove"]',
    Icon: Trash2,
    title: "Quitar",
    desc: "Elimina el producto de la lista por completo.",
    place: "above",
  },
];

// En casa (Pantry) screen: the input CTA + the header options button. The
// per-action icons (subir ticket / gastos / ajustes) now live inside the burger
// sidebar, so the tour points at the burger and describes what's inside.
export const PANTRY_COACH_STEPS = [
  {
    selector: '[data-coach="pantry-add"]',
    Icon: Plus,
    title: "Añadir a tu despensa",
    desc: "Suma lo que tienes en casa: por foto, subiendo el ticket o a mano. Lo usaremos en tus recetas y tu lista de la compra.",
    place: "below",
  },
  {
    selector: '[data-coach="pantry-options"]',
    Icon: MenuIcon,
    title: "Opciones de En casa",
    desc: "Aquí dentro tienes: subir el ticket de la compra, ver tus gastos y el histórico de tickets, y ajustar cómo influye tu despensa en el menú.",
    place: "below",
  },
];

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const PAD = 8; // spotlight breathing room around the target
const GAP = 14; // distance between spotlight and bubble
const BUBBLE_MAX_W = 320;

function measure(selector) {
  const el = typeof document !== "undefined" ? document.querySelector(selector) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

export function CoachTour({ steps, onClose, onStepChange }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [vp, setVp] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 375,
    h: typeof window !== "undefined" ? window.innerHeight : 812,
  }));

  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  const recompute = useCallback(() => {
    setVp({ w: window.innerWidth, h: window.innerHeight });
    setRect(measure(step.selector));
  }, [step.selector]);

  // Re-measure whenever the step changes, and keep the target in view.
  useLayoutEffect(() => {
    onStepChange?.(step, idx);
    const el = document.querySelector(step.selector);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // rAF lets any smooth-scroll settle a touch before the first read; we also
    // listen to scroll/resize below so the highlight tracks continuously.
    const raf = requestAnimationFrame(recompute);
    // The Dashboard is lazy-mounted (Suspense), so on the very first paint the
    // target may not exist yet — retry a handful of times until it resolves.
    let tries = 0;
    const timer = setInterval(() => {
      const r = measure(step.selector);
      if (r || tries++ > 12) {
        if (r) setRect(r);
        clearInterval(timer);
      }
    }, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [idx, step.selector, recompute, step, onStepChange]);

  useEffect(() => {
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [recompute]);

  const next = useCallback(() => {
    if (isLast) onClose();
    else setIdx((i) => i + 1);
  }, [isLast, onClose]);

  // Bubble geometry (memoized off the measured rect + viewport).
  const layout = useMemo(() => {
    if (!rect) return null;
    const bubbleW = Math.min(BUBBLE_MAX_W, vp.w - 24);
    const targetCX = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(targetCX - bubbleW / 2, vp.w - bubbleW - 12));

    // Prefer the step's requested side, but flip if there's clearly no room.
    const spaceBelow = vp.h - rect.bottom;
    const spaceAbove = rect.top;
    let place = step.place;
    if (place === "below" && spaceBelow < 190 && spaceAbove > spaceBelow) place = "above";
    if (place === "above" && spaceAbove < 190 && spaceBelow > spaceAbove) place = "below";

    const arrowX = Math.max(18, Math.min(targetCX - left, bubbleW - 18));
    const pos =
      place === "below"
        ? { top: rect.bottom + PAD + GAP }
        : { bottom: vp.h - rect.top + PAD + GAP };
    return { bubbleW, left, place, arrowX, pos };
  }, [rect, vp, step.place]);

  const overlay = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        animation: "coachFade .22s ease",
      }}
    >
      <style>{`
        @keyframes coachFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes coachPop {
          0%   { opacity: 0; transform: translateY(10px) scale(.96); }
          60%  { transform: translateY(-2px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes coachBob {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50%      { transform: translateY(-4px) rotate(-4deg); }
        }
      `}</style>

      {/* Spotlight: a transparent box whose massive box-shadow dims everything
          around it, leaving the target button bright and legible. */}
      {rect ? (
        <div
          style={{
            position: "fixed",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 16,
            boxShadow: "0 0 0 9999px rgba(11,28,18,.66)",
            border: "2px solid rgba(255,255,255,.85)",
            pointerEvents: "none",
            transition: "top .28s cubic-bezier(.4,0,.2,1), left .28s cubic-bezier(.4,0,.2,1), width .28s cubic-bezier(.4,0,.2,1), height .28s cubic-bezier(.4,0,.2,1)",
          }}
        />
      ) : (
        // No target found (unexpected): dim the whole screen so the bubble
        // still reads, and let the user advance/skip out of it.
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,18,.66)" }} />
      )}

      {/* Click-catcher over the dim area (advances the tour). Sits under the
          bubble so bubble buttons keep their own handlers. */}
      <div style={{ position: "fixed", inset: 0 }} onClick={next} />

      {/* Bubble */}
      {layout && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: layout.left,
            width: layout.bubbleW,
            ...layout.pos,
            background: "#fff",
            borderRadius: 20,
            padding: "18px 16px 14px",
            boxShadow: "0 18px 50px rgba(20,47,29,.34)",
            animation: "coachPop .34s cubic-bezier(.34,1.56,.5,1) both",
          }}
        >
          {/* pointer arrow toward the target */}
          <div
            style={{
              position: "absolute",
              left: layout.arrowX - 9,
              [layout.place === "below" ? "top" : "bottom"]: -9,
              width: 18,
              height: 18,
              background: "#fff",
              transform: "rotate(45deg)",
              borderRadius: 3,
              boxShadow:
                layout.place === "below"
                  ? "-2px -2px 4px rgba(20,47,29,.06)"
                  : "2px 2px 4px rgba(20,47,29,.06)",
            }}
          />

          <div style={{ display: "flex", alignItems: "flex-start", gap: 11, position: "relative" }}>
            <div
              style={{
                flexShrink: 0,
                width: 42,
                height: 42,
                borderRadius: "50% 50% 50% 8px",
                background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 16px rgba(45,90,61,.38)",
                animation: "coachBob 2.4s ease-in-out infinite",
              }}
            >
              <step.Icon size={20} color="#fff" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={{ margin: "2px 0 4px", fontSize: 16.5, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
                {step.title}
              </h3>
              <p style={{ margin: 0, fontSize: 12.5, color: "#5a7a66", lineHeight: 1.45 }}>{step.desc}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                flexShrink: 0,
                width: 26,
                height: 26,
                borderRadius: 999,
                border: "none",
                background: "#f0f4f1",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: -2,
              }}
            >
              <X size={15} color="#5a7a66" />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
            {/* step dots */}
            <div style={{ display: "flex", gap: 5 }}>
              {steps.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === idx ? 16 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === idx ? GREEN : "#d3e2d8",
                    transition: "width .2s ease, background .2s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!isLast && (
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#7a9080",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "6px 4px",
                  }}
                >
                  Saltar
                </button>
              )}
              <button
                type="button"
                onClick={next}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "none",
                  borderRadius: 999,
                  padding: "9px 16px",
                  background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 8px 18px -6px rgba(45,90,61,.6)",
                }}
              >
                {isLast ? "Entendido" : "Siguiente"}
                {!isLast && <ArrowRight size={15} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

export function HomeCoachTour({ onClose }) {
  return <CoachTour steps={HOME_COACH_STEPS} onClose={onClose} />;
}

// Drop steps whose target isn't currently in the DOM so the spotlight never
// lands on an empty selector (e.g. no dishes yet → no 3-dots / day-regen).
function presentSteps(steps) {
  if (typeof document === "undefined") return steps;
  return steps.filter((s) => document.querySelector(s.selector));
}

/**
 * Resolves which steps to run, once the screen has actually painted.
 *
 * Filtering on the first render is a race we mostly lose: App mounts the tour
 * as soon as the screen flag flips, while the screen itself is lazy-loaded, so
 * every selector but the always-mounted BottomNav looks missing and the tour
 * collapses to a single step. `grace` is how long to keep re-checking before
 * settling for whatever is on screen; it resolves early as soon as every step
 * is found. On-demand tours pass 0 — their screen is already up.
 */
function useResolvedSteps(steps, grace) {
  const [resolved, setResolved] = useState(() => {
    const now = presentSteps(steps);
    return now.length === steps.length ? now : null;
  });

  useEffect(() => {
    if (resolved) return undefined;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const now = presentSteps(steps);
      if (now.length === steps.length || Date.now() - startedAt >= grace) {
        clearInterval(id);
        setResolved(now);
      }
    }, 120);
    return () => clearInterval(id);
  }, [steps, resolved, grace]);

  return resolved;
}

function ResolvingCoachTour({ steps, grace, onClose, onStepChange }) {
  const resolved = useResolvedSteps(steps, grace);
  const empty = resolved?.length === 0;

  // Closing is a parent state change, so it can't happen during render.
  useEffect(() => {
    if (empty) onClose();
  }, [empty, onClose]);

  if (!resolved || empty) return null;
  return <CoachTour steps={resolved} onClose={onClose} onStepChange={onStepChange} />;
}

// 1.8s covers a cold lazy-load of the screen without leaving a first-time user
// staring at an undimmed page wondering whether anything is coming.
const SCREEN_LOAD_GRACE = 1800;

export function RecipesCoachTour({ onClose }) {
  return <ResolvingCoachTour steps={RECIPES_COACH_STEPS} grace={SCREEN_LOAD_GRACE} onClose={onClose} />;
}

export function MenuCoachTour({ onClose }) {
  return <ResolvingCoachTour steps={MENU_COACH_STEPS} grace={SCREEN_LOAD_GRACE} onClose={onClose} />;
}

export function ShoppingCoachTour({ onClose }) {
  // "Añadir" only exists while the list is empty, and the per-row actions only
  // once a row is swiped open — without filtering, those steps dimmed the whole
  // screen with nothing lit up.
  return <ResolvingCoachTour steps={SHOPPING_COACH_STEPS} grace={0} onClose={onClose} />;
}

export function PantryCoachTour({ onClose }) {
  // Receipt/settings targets are conditional, so some steps may be absent.
  return <ResolvingCoachTour steps={PANTRY_COACH_STEPS} grace={0} onClose={onClose} />;
}

export function HouseholdsCoachTour({ onClose, onStepChange }) {
  return (
    <ResolvingCoachTour
      steps={HOUSEHOLDS_COACH_STEPS}
      grace={SCREEN_LOAD_GRACE}
      onClose={onClose}
      onStepChange={onStepChange}
    />
  );
}

// Round help button that (re)launches a screen's spotlight tour on demand —
// same idea as Compra's "?", so users aren't limited to the first-run tour.
// Round on purpose (the other header icons are squared) to break the monotony.
export function CoachHelpButton({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Explicar los iconos de esta pantalla"
      aria-pressed={active}
      style={{
        width: 32, height: 32, borderRadius: 999, flexShrink: 0,
        border: "1px solid #e0eae3", background: active ? "#e8f0ea" : "#fff",
        color: GREEN, cursor: "pointer", fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <CircleHelp size={17} strokeWidth={2.2} />
    </button>
  );
}
