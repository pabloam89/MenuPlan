import { useAnimacionDelAgente } from "./pistaMotion.js";

/**
 * Una fila de slider, y solo una en toda la app.
 *
 * ── La fila es la de "¿Cómo os gusta comer?" ──────────────────────────────
 * Copia de las frecuencias de OnboardingMealStyle: burbuja de 32px con la
 * ilustración sobre un tinte de su color, etiqueta de 84, pista de 7px con el
 * relleno del color de la fila, y el número a la derecha. Es la misma pregunta
 * —cuántas veces por semana quiero esto— y verla con otra forma en otro sitio
 * se lee como otra cosa.
 *
 * ── Y sí, el color va POR FILA ────────────────────────────────────────────
 * Hubo una versión con todas en verde, argumentando que el verde es el color
 * de lo interactivo (§0.3). Era mirar la regla equivocada: la pantalla de
 * Estilos ya pinta cada familia con su color de categoría (§1.6) en ESTE mismo
 * control, y ese precedente manda. Lo que sí es ruido es un color por CONTROL
 * —se probó en la fila de baldosas y "tocado" acababa significando siete
 * colores distintos—, pero un color por fila dentro de una lista es justo lo
 * que deja distinguirlas de un vistazo.
 *
 * ── El pulgar es un div, no el nativo ─────────────────────────────────────
 * La posición de un `::-webkit-slider-thumb` no se puede animar por CSS, y
 * aquí eso es el gesto central de la pantalla: al pedir "más pescado" por voz,
 * el control tiene que VERSE moverse. Con el pulgar nativo, el relleno se
 * deslizaba y el pulgar pegaba un salto, que es peor que no animar nada.
 *
 * Así que el pulgar visible es un div con su transición, y el input nativo va
 * encima transparente haciendo lo único que hace bien: recoger el arrastre y
 * el toque en cualquier punto de la pista.
 */

const CSS = `
  .sl-eje { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; padding: 0; touch-action: none; }
  .sl-eje::-webkit-slider-runnable-track { background: transparent; height: 7px; }
  .sl-eje::-moz-range-track { background: transparent; height: 7px; border: none; }
  .sl-eje::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: transparent; border: none; margin-top: -7px; }
  .sl-eje::-moz-range-thumb { width: 20px; height: 20px; border: none; border-radius: 50%; background: transparent; }
  .sl-eje:focus-visible { outline: 2px solid #2d5a3d; outline-offset: 2px; border-radius: 4px; }
`;

/**
 * @param {object[]} ejes { id, arte, etiqueta, valor, resumen, color, max?, apagado?, aria? }
 * @param {string[]} movidas ids que acaba de mover el bot: esos se animan
 */
export function SliderEjes({ ejes, min = 0, max = 100, step = 1, movidas = [], porQue = null, onChange }) {
  const animando = useAnimacionDelAgente(movidas);

  return (
    <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, padding: "4px 14px" }}>
      <style>{CSS}</style>

      {ejes.map((eje, i) => {
        // El tope puede ser de la FILA y no del grupo: cada cocina aguanta un
        // número distinto de platos por semana. Con un max común, la barra de
        // peruana llegaba a cinco y el valor se recortaba a dos por detrás —
        // el pulgar dejaba de seguir al dedo.
        const tope = eje.max ?? max;
        const color = eje.color ?? "#2d5a3d";
        const parte = (eje.valor - min) / (tope - min);
        const pct = Math.round(parte * 100);
        // El pulgar no va en `left: pct%` sino metido hacia dentro sus 13px de
        // ancho, que es exactamente lo que hace el pulgar NATIVO: es el input
        // invisible de encima el que recoge el arrastre, así que el círculo
        // que se ve tiene que estar donde el navegador cree que está el suyo.
        // Sin el ajuste, al llegar a los extremos el círculo se despegaba del
        // dedo medio pulgar y encima se salía de la barra.
        const izquierda = `calc((100% - 13px) * ${parte})`;
        const anima = animando && movidas.includes(eje.id);
        // El pulgar solo se anima cuando lo mueve el bot: durante un arrastre
        // iría corriendo por detrás del dedo.
        const transicionPulgar = anima ? "left .45s cubic-bezier(.25,.46,.45,.94)" : "none";
        const transicionRelleno = anima ? "width .45s cubic-bezier(.25,.46,.45,.94)" : "width .3s ease";

        return (
          <div
            key={eje.id}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
              borderBottom: i < ejes.length - 1 ? "1px solid #e4ede7" : "none",
            }}
          >
            <span
              style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0, overflow: "hidden",
                background: `${color}14`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <img
                src={eje.arte}
                alt=""
                loading="lazy"
                style={{ width: "88%", height: "88%", objectFit: "contain" }}
              />
            </span>

            <span
              style={{
                width: 84, flexShrink: 0, fontSize: 12, fontWeight: 700,
                color: "#3a4a40", lineHeight: 1.2,
              }}
            >
              {eje.etiqueta}
            </span>

            <span style={{ flex: 1, position: "relative", height: 16, display: "flex", alignItems: "center" }}>
              <span
                style={{
                  position: "absolute", left: 0, right: 0, height: 7, borderRadius: 4,
                  background: "#e4ede7", overflow: "hidden", pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    display: "block", height: "100%", width: `${pct}%`,
                    background: color, borderRadius: 4, transition: transicionRelleno,
                  }}
                />
              </span>
              <span
                style={{
                  position: "absolute", left: izquierda, top: "50%",
                  width: 13, height: 13, marginTop: -6.5,
                  borderRadius: "50%", background: "#fff",
                  boxShadow: `0 1px 4px rgba(0,0,0,.25), 0 0 0 1.5px ${color}`,
                  transition: transicionPulgar, pointerEvents: "none",
                }}
              />
              <input
                className="sl-eje"
                type="range"
                min={min}
                max={tope}
                step={step}
                value={eje.valor}
                aria-label={eje.aria ?? eje.etiqueta}
                onChange={(e) => onChange(eje.id, +e.target.value)}
              />
            </span>

            <span
              style={{
                width: 62, flexShrink: 0, textAlign: "center",
                fontSize: 11, fontWeight: 800,
                // Lo que está en su estado neutro se apaga: si no, todas las
                // filas gritan lo mismo y ninguna destaca.
                color: eje.apagado ? "#9ab0a1" : color,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {eje.resumen}
            </span>
          </div>
        );
      })}

      {porQue && (
        <p style={{ margin: "4px 2px 10px", fontSize: 12, fontWeight: 600, color: "#5a7066", lineHeight: 1.35 }}>
          {porQue}
        </p>
      )}
    </div>
  );
}
