import { createPortal } from "react-dom";

// La barra de acciones de un plato: el fondo se apaga, un recuadro claro marca
// el plato del que hablamos y debajo (o encima, si no cabe) salen sus botones,
// círculos con su texto, en una o dos filas. Vivía dentro de Menu.jsx; se saca
// para que Recetas use la misma (review de UX: «que sea igual que en Menú»).
//
// `anchor`: { tile: { top, left, width, height }, radius } del plato en pantalla.
// `actions`: [{ id, label, Icon, onPick, tint?, color? }].
export function DishActionBar({ anchor, actions, onClose }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tile = anchor?.tile;
  const BTN = 62;
  const GAP = 8;
  const PAD = 12;
  // Dos filas en vez de una: con 5 acciones, una sola fila se sale de un móvil
  // estrecho. Se reparten 3+2 (cinco) o 2+2 (cuatro, cuando la comida no admite
  // cambio de estructura). Nunca se deja un hueco suelto en la fila de abajo:
  // preferimos que los botones bailen de sitio a que se vea un agujero.
  //
  // Hasta TRES caben en una sola fila y van en horizontal: 3×62 + 2×8 + 24 de
  // padding son 226 px, que entran de sobra en el móvil más estrecho. La
  // fórmula de antes (`ceil(n/2)`) partía también los casos pequeños, así que
  // el submenú de "Cambiar" —dos acciones— salía una debajo de otra, en
  // vertical, sin necesidad ninguna.
  const topCount = actions.length <= 3 ? actions.length : actions.length >= 5 ? 3 : 2;
  const rows = [actions.slice(0, topCount), actions.slice(topCount)].filter((r) => r.length > 0);
  const widest = Math.max(...rows.map((r) => r.length));
  const barW = widest * BTN + (widest - 1) * GAP + PAD * 2;
  const cx = tile ? tile.left + tile.width / 2 : vw / 2;
  const halfW = barW / 2 + 10;
  const left = Math.min(Math.max(cx, halfW), vw - halfW);
  // Prefers sitting just below the tile; flips above it when there isn't
  // room (near the bottom of the viewport).
  const fitsBelow = !tile || tile.top + tile.height + 92 <= vh;
  const anchorFromBottom = Boolean(tile) && !fitsBelow;
  const top = !tile ? vh / 2 : anchorFromBottom ? tile.top - 14 : tile.top + tile.height + 14;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(9,18,12,.8)",
        animation: "deckFadeIn .16s ease both",
      }}
    >
      <style>{`
        @keyframes deckFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes actionBarPop { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .dish-action-bar, .dish-action-bar * { animation-duration: .001s !important; }
        }
      `}</style>

      {tile && (
        <div
          style={{
            position: "fixed",
            top: tile.top, left: tile.left, width: tile.width, height: tile.height,
            boxSizing: "border-box",
            borderRadius: anchor.radius,
            border: "2px solid rgba(255,255,255,.55)",
            pointerEvents: "none",
            zIndex: 1201,
            animation: "deckFadeIn .16s ease both",
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top,
          left,
          // Static positioning transform (incl. the above/below flip) lives on
          // this wrapper; the pop-in animation below only scales/fades, so the
          // two never fight over the `transform` property.
          transform: !tile ? "translate(-50%, -50%)" : anchorFromBottom ? "translate(-50%, -100%)" : "translate(-50%, 0)",
          zIndex: 1203,
        }}
      >
        <div
          className="dish-action-bar"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: GAP,
            padding: PAD,
            borderRadius: 20,
            background: "rgba(250,252,251,.98)",
            boxShadow: "0 14px 34px rgba(9,18,12,.42)",
            animation: "actionBarPop .22s cubic-bezier(.34,1.4,.64,1) both",
          }}
        >
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: GAP, justifyContent: "center" }}>
          {row.map((act) => (
            <button
              key={act.id}
              type="button"
              aria-label={act.label}
              onClick={() => act.onPick()}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                width: BTN, padding: "8px 2px", border: "none", background: "none",
                cursor: "pointer", fontFamily: "inherit", borderRadius: 12,
              }}
            >
              <span
                style={{
                  width: 38, height: 38, borderRadius: "50%",
                  display: "grid", placeItems: "center",
                  background: act.tint ?? "#eef5f0",
                }}
              >
                <act.Icon size={18} strokeWidth={2.3} color={act.color ?? "#2d5a3d"} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#142f1d", textAlign: "center", lineHeight: 1.15 }}>
                {act.label}
              </span>
            </button>
          ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
