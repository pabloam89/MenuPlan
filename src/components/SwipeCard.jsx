import { useRef, useState } from "react";
import { Clock, Info, ThumbsUp, ThumbsDown, CookingPot, MessageCircle } from "lucide-react";
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
 * Las dos esquinas de un cartel de receta.
 *
 * Izquierda, apiladas: lo que la receta ES — cuánto cuesta hacerla y cuánto
 * tarda. Derecha: lo que la GENTE dice de ella. Dos columnas, dos naturalezas,
 * y ninguna pelea con el nombre de abajo.
 *
 * Vive suelto porque lo pintan dos carteles distintos —el de una receta del
 * feed y el de un plato dentro del menú de otra persona— y son los mismos
 * datos sobre el mismo objeto: si cada pantalla se los dibujara por su lado,
 * el mismo plato acabaría con dos fichas distintas según por dónde llegaras.
 */
export function PosterCorners({ difficulty = null, time = null, stats = null, inset = 12, statsTop = null }) {
  const diffLabel = DIFFICULTY_LABEL[difficulty];
  const timeLabel = formatTime(time);
  return (
    <>
      {(diffLabel || timeLabel) && (
        <div style={{ ...cornerStack, top: inset, left: inset, alignItems: "flex-start" }}>
          {diffLabel && (
            <span style={{ ...cornerBadge, color: DIFFICULTY_COLOR[difficulty] ?? "#2d5a3d" }}>
              {diffLabel}
            </span>
          )}
          {timeLabel && (
            <span style={{ ...cornerBadge, color: "#42594c", gap: 4 }}>
              <Clock size={11} strokeWidth={2.6} /> {timeLabel}
            </span>
          )}
        </div>
      )}

      {stats && (
        <div style={{ ...cornerStack, top: statsTop ?? inset, right: inset, alignItems: "flex-end" }}>
          <span style={{ ...cornerBadge, color: "#42594c", gap: 7 }}>
            <span style={statPair}><ThumbsUp size={11} strokeWidth={2.6} /> {stats.likes ?? 0}</span>
            <span style={statPair}><ThumbsDown size={11} strokeWidth={2.6} /> {stats.dislikes ?? 0}</span>
          </span>
          {/* Veces que alguien la ha cocinado de verdad. Cuesta más que un
              aplauso, así que es la señal que más dice — de ahí el teal. */}
          <span style={{ ...cornerBadge, color: "#0f766e", gap: 4 }}>
            <CookingPot size={12} strokeWidth={2.6} /> {stats.used ?? 0}
          </span>
          {/* Debajo de las veces cocinada: los dos son "que ha pasado con esta
              receta ahi fuera", frente a la columna izquierda, que es lo que
              la receta es. */}
          <span style={{ ...cornerBadge, color: "#42594c", gap: 4 }}>
            <MessageCircle size={12} strokeWidth={2.6} /> {stats.comments ?? 0}
          </span>
        </div>
      )}
    </>
  );
}

/**
 * El aspecto de una receta como cartel: foto a sangre, dificultad arriba a la
 * izquierda, tiempo arriba a la derecha, y el nombre sobre un degradado.
 *
 * Vive separado del arrastre porque lo usan dos sitios con gestos distintos:
 * el mazo de Inspírate (que lo arrastra) y el Feed (que lo apila en scroll).
 * Si cada uno lo pintara por su lado, dos "mismas" cartas acabarían siendo
 * distintas a la primera corrección de estilo.
 *
 * `children` se pinta encima, dentro del recorte: es donde el mazo mete sus
 * sellos de ME GUSTA / NO / NI FU NI FA.
 */
export function RecipePoster({ recipe, onInfo, onOwner = null, showOwner = true, when = null, stats = null, style, children }) {
  const photo = dishImageForRecipe(recipe);
  const color = categoryColor(recipe.category);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        background: `${color}14`,
        ...style,
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

      <PosterCorners difficulty={recipe.difficulty} time={recipe.time} stats={stats} />

      {children}

      {/* Hueco a la derecha para la ⓘ, para que el nombre no pase por debajo. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 50px 18px 18px", color: "#fff", pointerEvents: "none" }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: .85, letterSpacing: ".4px", textTransform: "uppercase" }}>
          {categoryLabel(recipe.category)}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginTop: 4, textWrap: "balance" }}>
          {recipe.name}
        </div>
        {/* De quién es la receta. Misma regla que la ficha grande (Menu.jsx):
            sin `owner` es del catálogo, o sea HoMenu. Importa aquí porque el
            mazo mezcla catálogo con recetas de otros. En el Feed se apaga
            (`showOwner`) porque la línea de autor ya va encima de la tarjeta,
            y con la hora al lado. */}
        {showOwner && (
          // Pulsable solo si hay a donde ir (en el mazo, el catalogo no tiene
          // perfil). `pointerEvents: auto` porque el bloque de abajo los tiene
          // apagados, y stopPropagation para que tocar el nombre no empiece un
          // arrastre de la carta.
          <div
            {...(onOwner ? {
              role: "button",
              tabIndex: 0,
              onPointerDown: (e) => e.stopPropagation(),
              onPointerUp: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); onOwner(); },
            } : {})}
            style={{
              display: "flex", alignItems: "center", gap: 7, marginTop: 10,
              ...(onOwner ? { pointerEvents: "auto", cursor: "pointer", width: "fit-content" } : {}),
            }}
          >
            {recipe.owner?.avatar ? (
              <img
                src={recipe.owner.avatar}
                alt=""
                style={{ width: 22, height: 22, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
              />
            ) : recipe.owner ? (
              // Persona sin foto: inicial en un círculo. Antes caía en el logo
              // de HoMenu, y eso firmaba como nuestra la receta de otro.
              <span
                style={{
                  width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,.28)", border: "1px solid rgba(255,255,255,.5)",
                  fontSize: 11, fontWeight: 900,
                }}
              >
                {String(recipe.owner.name ?? "?").replace(/^@/, "").charAt(0).toUpperCase()}
              </span>
            ) : (
              <MenuPlanBadge size={22} />
            )}
            <span style={{ fontSize: 12.5, fontWeight: 700, opacity: .95 }}>
              {recipe.owner ? (recipe.owner.name ?? "Tú") : "HoMenu"}
              {/* Cuándo se publicó: separado del autor por aire, no por un
                  punto — dos datos distintos se separan con espacio, y la
                  mayúscula inicial hace que se lea como dato propio y no como
                  coletilla del nombre. */}
              {when && (
                <span style={{ fontWeight: 600, opacity: .75, marginLeft: 14 }}>
                  {when.charAt(0).toUpperCase() + when.slice(1)}
                </span>
              )}
            </span>
          </div>
        )}
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
}


/**
 * Los botones redondos de debajo del mazo. Viven aquí, con la carta, porque
 * son la otra mitad del mismo gesto: cada uno dispara el mismo `swipe(dir)`
 * que haría el dedo, y el arrastre nunca puede ser la única vía (ratón,
 * accesibilidad).
 */
export function ActionButton({ label, color, size = 60, disabled, onClick, children, ...pointerProps }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...pointerProps}
      style={{
        width: size, height: size, borderRadius: "50%",
        border: `2px solid ${disabled ? "#e0eae3" : color}`,
        background: "#fff", color: disabled ? "#c2d2c8" : color,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        boxShadow: disabled ? "none" : "0 3px 12px rgba(20,47,29,.14)",
        transition: "transform .12s ease",
      }}
    >
      {children}
    </button>
  );
}

// Dificultad (izquierda) y tiempo (derecha) comparten forma: son los dos
// datos que se miran antes de decidir, así que pesan lo mismo.
const cornerStack = {
  position: "absolute",
  display: "flex", flexDirection: "column", gap: 6,
  pointerEvents: "none",
};

const statPair = { display: "inline-flex", alignItems: "center", gap: 3 };

const cornerBadge = {
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
