import { useCallback, useRef, useState } from "react";
import { Check, ChevronRight, RotateCw } from "../icons.jsx";

/**
 * "Regenerar": la barra que aparece cuando has tocado mandos.
 *
 * ── Se desliza, no se pulsa ───────────────────────────────────────────────
 * Regenerar tira una generación entera y cambia la semana de arriba abajo, así
 * que no puede salir de un roce. Un botón normal en un sitio donde el dedo ya
 * está tocando cosas se pulsa sin querer; llevar el tirador hasta el final es
 * un gesto que no se hace sin enterarse, y de paso convierte la espera que
 * viene en algo que TÚ has empezado.
 *
 * Por eso el teclado no dispara con el click sino con Enter o Espacio sobre el
 * tirador: para quien no puede arrastrar hay una tecla, y para quien puede, un
 * click suelto no hace nada.
 *
 * ── Cómo se dice que hay que deslizar ─────────────────────────────────────
 * Con el sitio al que hay que llegar, no con un adorno en el tirador. Hubo una
 * versión con una punta de flecha pegada al icono de regenerar: dos dibujos
 * tocándose dentro del tirador se leían como un icono roto, y encima el texto tenía
 * que explicar el gesto ("Desliza para rehacer") y se comía la barra entera.
 *
 * Ahora el destino son tres puntas al fondo a la derecha, encendiéndose en
 * cadena hacia allí, y el tirador se asoma cada pocos segundos. El texto vuelve
 * a ser lo que la barra HACE —"Regenerar (1 cambio)"—, que es lo que hay que
 * poder leer de un vistazo.
 *
 * ── A sangre y oscura ─────────────────────────────────────────────────────
 * Ocupa el ancho entero. La barra es la única cosa de la pantalla que va a
 * cambiarlo todo, y encogerla a una pastilla con márgenes la ponía al nivel de
 * una tarjeta más. El fondo es el verde profundo de los gradientes (§1.1) y no
 * el gradiente CTA verde→lima: sobre la franja clara de los mandos, el lima
 * quedaba chillón justo debajo de siete ilustraciones de comida.
 */

// Cuánto hay que llegar para que cuente. Por debajo de esto vuelve solo.
const UMBRAL = 0.72;

const ALTO = 54;
const TIRADOR = 36;
const HUECO = 6;

/** "1 cambio" / "3 cambios" — el número es lo que hace la barra creíble. */
function cuentaDeCambios(n) {
  return n === 1 ? "1 cambio" : `${n} cambios`;
}

export function BarraRehacer({ pendientes, onAplicar }) {
  const pista = useRef(null);
  const inicio = useRef(0);
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [hecho, setHecho] = useState(false);

  /** Lo que puede recorrer el tirador: la pista menos él mismo y sus huecos. */
  const recorrido = () => Math.max(1, (pista.current?.offsetWidth ?? 0) - TIRADOR - HUECO * 2);

  const rematar = useCallback(() => {
    setDx(recorrido());
    setHecho(true);
    onAplicar?.();
  }, [onAplicar]);

  const soltar = useCallback(() => {
    if (!arrastrando) return;
    setArrastrando(false);
    // Se queda al final mientras regenera: devolver el tirador al principio en
    // el mismo instante en que sale la pantalla de carga se lee como que el
    // gesto no ha llegado.
    if (dx >= recorrido() * UMBRAL) rematar();
    else setDx(0);
  }, [arrastrando, dx, rematar]);

  const alMover = useCallback((e) => {
    if (!arrastrando) return;
    setDx(Math.min(recorrido(), Math.max(0, e.clientX - inicio.current)));
  }, [arrastrando]);

  const max = recorrido();
  const parte = max > 0 ? Math.min(1, dx / max) : 0;
  const llegado = hecho || parte >= UMBRAL;

  return (
    <div
      className="mp-barra-rehacer"
      style={{
        // A sangre: el contenedor de la cabecera mete 16px de lado y la barra
        // tiene que llegar al borde de la pantalla.
        margin: "0 -16px", overflow: "hidden",
        background: "#1c4a2e",
      }}
    >
      <div
        ref={pista}
        onPointerMove={alMover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        style={{
          position: "relative", height: ALTO,
          display: "flex", alignItems: "center", gap: 10,
          // Todo el texto vive a la derecha del tirador.
          padding: `0 14px 0 ${HUECO + TIRADOR + 12}px`,
          touchAction: "pan-y",
        }}
      >
        {/* La estela: lo recorrido se aclara, para que el gesto deje marca. */}
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: HUECO + TIRADOR / 2 + dx,
            background: llegado ? "#2f7a4a" : "rgba(76,186,110,.18)",
            transition: arrastrando ? "background .2s" : "width .25s ease, background .2s",
            pointerEvents: "none",
          }}
        />

        <span
          style={{
            position: "relative", flex: 1,
            fontSize: 14, fontWeight: 800, color: "#fff",
            // Se apaga a medida que avanzas: el texto ha dicho lo que tenía
            // que decir en cuanto empiezas a moverlo.
            opacity: llegado ? 1 : 1 - parte * 0.6,
            transition: arrastrando ? "none" : "opacity .25s ease",
          }}
        >
          {llegado ? "Regenerando…" : "Regenerar"}
          {!llegado && (
            // En blanco y en la misma línea: es la misma frase. Apagado a un
            // 62% se leía como una nota al pie de otra cosa, no como el
            // paréntesis de "Regenerar".
            <span style={{ fontWeight: 700, color: "#fff" }}>
              {" "}({cuentaDeCambios(pendientes)})
            </span>
          )}
        </span>

        {/* El destino. Se apagan según te acercas: ya no hacen falta. */}
        {!llegado && (
          <span
            aria-hidden
            style={{
              position: "relative", flexShrink: 0, display: "flex",
              marginRight: -4, opacity: 1 - parte,
            }}
          >
            {[0, 1, 2].map((i) => (
              <ChevronRight
                key={i}
                size={17}
                color="#8fd3a8"
                strokeWidth={2.6}
                className="mp-desliz-punta"
                style={{ marginLeft: i === 0 ? 0 : -7, animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </span>
        )}

        <button
          type="button"
          aria-label={`Regenerar el menú · ${cuentaDeCambios(pendientes)}`}
          onPointerDown={(e) => {
            if (hecho) return;
            // Capturar el puntero es lo que deja seguir el arrastre aunque el
            // dedo se salga del tirador. Si el navegador no reconoce el id, se
            // arrastra igual —peor, pero se arrastra— así que no puede tirar
            // abajo el gesto entero.
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* da igual */ }
            inicio.current = e.clientX - dx;
            setArrastrando(true);
          }}
          onPointerMove={alMover}
          onPointerUp={soltar}
          // Enter y Espacio son la única forma de dispararlo sin arrastrar. El
          // click suelto no hace nada a propósito: es justo el toque sin querer
          // del que protege el gesto.
          onKeyDown={(e) => {
            if (hecho || (e.key !== "Enter" && e.key !== " ")) return;
            e.preventDefault();
            rematar();
          }}
          style={{
            position: "absolute", left: HUECO, top: (ALTO - TIRADOR) / 2,
            width: TIRADOR, height: TIRADOR, borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", background: "#fff", cursor: "grab",
            boxShadow: "0 2px 10px -3px rgba(0,0,0,.45)",
            transform: `translateX(${dx}px)`,
            transition: arrastrando ? "none" : "transform .25s cubic-bezier(.22,1,.36,1)",
            touchAction: "none",
          }}
        >
          <span
            // El asomo va DENTRO del botón: el botón ya lleva su propio
            // `translateX` con la posición del dedo, y una animación encima se
            // lo pisaría.
            className={arrastrando || llegado ? undefined : "mp-desliz-tirador"}
            style={{ display: "flex" }}
          >
            {llegado
              ? <Check size={17} color="#2d5a3d" strokeWidth={3} />
              : <RotateCw size={16} color="#2d5a3d" strokeWidth={2.6} />}
          </span>
        </button>
      </div>
    </div>
  );
}
