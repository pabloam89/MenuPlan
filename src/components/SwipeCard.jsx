import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Clock, Info } from "lucide-react";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { categoryColor, categoryLabel } from "../screens/CatalogBrowserSheet.jsx";
import { MenuPlanBadge } from "./RecipeProvenance.jsx";

const DIFFICULTY_LABEL = { facil: "Fácil", normal: "Media", elaborada: "Difícil" };
const DIFFICULTY_COLOR = { facil: "#2d5a3d", normal: "#a97a1f", elaborada: "#c0392b" };

// Tres salidas: derecha me gusta, izquierda no, abajo "ni fu ni fa". El eje
// vertical ya no cambia de categoría — para eso está el control de arriba, que
// además se ve; reutilizarlo para dos cosas hacía el gesto ambiguo.
// El umbral vertical es algo mayor porque arrastrar hacia abajo es el gesto
// más fácil de hacer sin querer al empezar a mover la carta.
const THRESHOLD_X = 110;
const THRESHOLD_Y = 130;
const EXIT_MS = 220;

function formatTime(totalMin) {
  if (!totalMin) return null;
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins ? `${hours}h${mins}` : `${hours}h`;
}

const reduceMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * La carta arrastrable del mazo de Inspíranos.
 *  · derecha = me gusta · izquierda = no me gusta · abajo = ni fu ni fa
 *
 * Pointer Events (no `touch*`) para que valga igual con dedo y con ratón, y
 * expone `swipe(dir)` por ref para que los botones de abajo disparen la misma
 * animación de salida — el gesto nunca es la única forma de decidir.
 */
export const SwipeCard = forwardRef(function SwipeCard({ recipe, onSwipe, onInfo }, ref) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0, dragging: false });
  const [exiting, setExiting] = useState(null);
  const start = useRef(null);
  const done = useRef(false);

  const commit = (dir) => {
    if (done.current) return;
    done.current = true;
    setExiting(dir);
    setTimeout(() => onSwipe(dir), reduceMotion() ? 0 : EXIT_MS);
  };

  useImperativeHandle(ref, () => ({ swipe: commit }));

  const onPointerDown = (e) => {
    if (done.current) return;
    start.current = { x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* puntero sintético */ }
    setDrag({ dx: 0, dy: 0, dragging: true });
  };

  const onPointerMove = (e) => {
    if (!start.current) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y, dragging: true });
  };

  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    const { dx, dy } = drag;
    const reset = () => setDrag({ dx: 0, dy: 0, dragging: false });
    // El eje dominante manda: arrastrar en diagonal no debe hacer dos cosas.
    if (Math.abs(dy) > Math.abs(dx)) {
      // Solo hacia abajo: arrastrar hacia arriba no significa nada.
      if (dy > THRESHOLD_Y) commit("meh");
      else reset();
      return;
    }
    if (Math.abs(dx) > THRESHOLD_X) commit(dx > 0 ? "like" : "no");
    else reset();
  };

  const photo = dishImageForRecipe(recipe);
  const color = categoryColor(recipe.category);
  const diffLabel = DIFFICULTY_LABEL[recipe.difficulty];
  const time = formatTime(recipe.time);

  const verticalDrag = Math.abs(drag.dy) > Math.abs(drag.dx);
  const dx = exiting === "like" ? 700 : exiting === "no" ? -700 : exiting ? 0 : drag.dx;
  // Arriba no hay salida, así que el arrastre se frena a un tercio para que se
  // note que por ahí no va.
  const dyRaw = exiting === "meh" ? 800 : exiting ? 0 : drag.dy;
  const dy = !exiting && verticalDrag && dyRaw < 0 ? dyRaw * 0.33 : dyRaw;
  const rotate = reduceMotion() || verticalDrag ? 0 : dx / 20;
  const stampX = verticalDrag ? 0 : Math.min(Math.abs(drag.dx) / THRESHOLD_X, 1);
  const stampMeh = verticalDrag && drag.dy > 0 ? Math.min(drag.dy / THRESHOLD_Y, 1) : 0;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 20,
        overflow: "hidden",
        background: `${color}14`,
        boxShadow: "0 6px 24px rgba(0,0,0,.18)",
        transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`,
        // Sin esto el scroll nativo del navegador compite con el arrastre en
        // móvil y el gesto se pierde a mitad.
        touchAction: "none",
        transition: drag.dragging ? "none" : `transform ${EXIT_MS}ms ease-out`,
        opacity: exiting && reduceMotion() ? 0 : 1,
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {photo ? (
        <img
          src={deckImg(photo, 600)}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: `${color}22` }} />
      )}

      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,.78) 0%, rgba(0,0,0,.25) 38%, rgba(0,0,0,0) 62%)",
          pointerEvents: "none",
        }}
      />

      {diffLabel && (
        <span style={{ ...cornerBadge, top: 12, left: 12, color: DIFFICULTY_COLOR[recipe.difficulty] ?? "#2d5a3d" }}>
          {diffLabel}
        </span>
      )}
      {time && (
        <span style={{ ...cornerBadge, top: 12, right: 12, color: "#42594c", gap: 4 }}>
          <Clock size={11} strokeWidth={2.6} /> {time}
        </span>
      )}

      <Stamp side="like" opacity={drag.dx > 0 ? stampX : 0} />
      <Stamp side="no" opacity={drag.dx < 0 ? stampX : 0} />
      <Stamp side="meh" opacity={stampMeh} />

      {/* Hueco a la derecha para la ⓘ, para que el nombre no pase por debajo. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 50px 18px 18px", color: "#fff", pointerEvents: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: .85, letterSpacing: ".4px", textTransform: "uppercase" }}>
          {categoryLabel(recipe.category)}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginTop: 4, textWrap: "balance" }}>
          {recipe.name}
        </div>
        {/* De quién es la receta. Misma regla que la ficha grande (Menu.jsx):
            sin `owner` es del catálogo, o sea MenuPlan. Importa aquí porque el
            mazo es donde vas a mezclar catálogo con recetas de otros. */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10 }}>
          {recipe.owner?.avatar ? (
            <img
              src={recipe.owner.avatar}
              alt=""
              style={{ width: 22, height: 22, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <MenuPlanBadge size={22} />
          )}
          <span style={{ fontSize: 12.5, fontWeight: 700, opacity: .95 }}>
            {recipe.owner ? (recipe.owner.name ?? "Tú") : "HoMenu"}
          </span>
        </div>
      </div>

      {onInfo && (
        <button
          type="button"
          aria-label={`Ver la receta de ${recipe.name}`}
          title="Ver la receta"
          // El pointerdown no debe llegar a la carta: sin esto, tocar la ⓘ
          // empieza un arrastre y el toque se interpreta como swipe corto.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onInfo(); }}
          style={{
            position: "absolute", right: 12, bottom: 16,
            padding: 4, border: "none", background: "transparent",
            color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            filter: "drop-shadow(0 1px 3px rgba(0,0,0,.5))",
          }}
        >
          <Info size={28} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
});

// Dificultad (izquierda) y tiempo (derecha) comparten forma: son los dos
// datos que se miran antes de decidir, así que pesan lo mismo.
const cornerBadge = {
  position: "absolute",
  display: "inline-flex", alignItems: "center",
  fontSize: 11, fontWeight: 800, letterSpacing: ".2px",
  padding: "4px 9px", borderRadius: 999,
  background: "rgba(255,255,255,.94)",
  boxShadow: "0 1px 3px rgba(0,0,0,.18)",
  pointerEvents: "none",
};

const STAMP = {
  like: { text: "ME GUSTA", color: "#2d5a3d", pos: { top: 26, left: 18 }, tilt: -14 },
  no: { text: "NO", color: "#c0392b", pos: { top: 26, right: 18 }, tilt: 14 },
  meh: { text: "NI FU NI FA", color: "#a97a1f", pos: { bottom: 78, left: "50%" }, tilt: -4 },
};

function Stamp({ side, opacity }) {
  const s = STAMP[side];
  const centered = side === "meh";
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute", ...s.pos,
        transform: `${centered ? "translateX(-50%) " : ""}rotate(${s.tilt}deg)`,
        padding: "6px 14px", borderRadius: 10,
        border: `3px solid ${s.color}`, color: s.color,
        background: "rgba(255,255,255,.9)",
        fontSize: 18, fontWeight: 900, letterSpacing: "1px", whiteSpace: "nowrap",
        opacity, transition: "opacity .1s linear", pointerEvents: "none",
      }}
    >
      {s.text}
    </span>
  );
}
