import { TANDA_MAX, TANDA_MIN, TANDA_PASO, aLoGrueso, enHoras } from "../lib/cookTime.js";

/**
 * El tiempo del día de la tanda: cuánto tienes (se arrastra, escribe
 * `data.tandaMinutos`) y cuánto llevas invertido (se lee, no se toca).
 *
 * Dos barras en la MISMA escala y pegadas, que es lo que hace que se lean de
 * un vistazo. Lo invertido son MANOS, no reloj: el domingo se solapa —mientras
 * el caldo hierve estás picando otra cosa—.
 *
 * Vivía dentro de BasesPreferidas (el asistente). Sale aquí para que la
 * pizarra enseñe el mismo par de barras sin arrastrar el selector de tandas.
 */
const CSS_TIEMPO = `
  .sl-tiempo { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; padding: 0; touch-action: none; }
  .sl-tiempo::-webkit-slider-runnable-track { background: transparent; height: 7px; }
  .sl-tiempo::-moz-range-track { background: transparent; height: 7px; border: none; }
  .sl-tiempo::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: transparent; border: none; margin-top: -7px; }
  .sl-tiempo::-moz-range-thumb { width: 20px; height: 20px; border: none; border-radius: 50%; background: transparent; }
  .sl-tiempo:focus-visible { outline: 2px solid #2d5a3d; outline-offset: 2px; border-radius: 4px; }
`;

/**
 * Dónde cae un número de minutos en la barra. La MISMA para las dos: con hora
 * y media disponible y media hora gastada, lo gastado no puede pintarse más
 * largo que lo que tienes.
 */
const posicion = (min) => Math.max(0, Math.min(1, (min - TANDA_MIN) / (TANDA_MAX - TANDA_MIN)));

export function TiempoDeTanda({ presupuesto, invertido, onPresupuesto }) {
  const pasado = invertido > presupuesto;
  // Topada en el pulgar: que te hayas pasado lo dice el color, no una barra
  // que se sale.
  const gastado = Math.min(posicion(invertido), posicion(presupuesto));
  return (
    <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, padding: "12px 14px", marginBottom: 12 }}>
      <style>{CSS_TIEMPO}</style>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#142f1d" }}>Tiempo disponible</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#2d5a3d" }}>{enHoras(presupuesto)}</span>
      </div>

      <span style={{ position: "relative", height: 16, display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span style={{ position: "absolute", left: 0, right: 0, height: 7, borderRadius: 4, background: "#e4ede7", overflow: "hidden", pointerEvents: "none" }}>
          <span style={{
            display: "block", height: "100%", borderRadius: 4, background: "#2d5a3d",
            width: `${posicion(presupuesto) * 100}%`,
            transition: "width .3s ease",
          }} />
        </span>
        <span
          aria-hidden="true"
          style={{
            position: "absolute", width: 20, height: 20, borderRadius: "50%",
            background: "#fff", border: "2.5px solid #2d5a3d", boxShadow: "0 1px 4px rgba(9,18,12,.2)",
            left: `calc((100% - 13px) * ${(presupuesto - TANDA_MIN) / (TANDA_MAX - TANDA_MIN)})`,
            pointerEvents: "none",
          }}
        />
        <input
          className="sl-tiempo"
          type="range"
          min={TANDA_MIN}
          max={TANDA_MAX}
          step={TANDA_PASO}
          value={presupuesto}
          aria-label="Tiempo que quieres dedicar a cocinar de antes"
          onChange={(e) => onPresupuesto?.(Number(e.target.value))}
        />
      </span>

      {/* Lo gastado, en la misma escala y sin pulgar: es una lectura, no un
          mando, y un círculo invitaría a arrastrarlo.

          En el mismo negro que la línea de arriba, y no en ámbar al pasarse:
          el texto se ponía del color de una alarma para decir un número que
          no tiene nada de malo. Que no quepa más lo dicen los deslizadores,
          que dejan de subir, y esta barra, que se ve llena. Debajo hubo un
          aviso ("Se pasa de lo que dijiste. Quita alguna tanda…") y llegaba
          tarde: te dejaba pedir la mañana entera y luego regañaba sin decir
          qué quitar. */}
      {/* Mismo cuerpo y mismo peso que la línea de arriba: iban un punto más
          pequeñas (12/700 contra 12.5/800) y, una encima de otra, la de abajo
          parecía un pie de foto de la de arriba en vez de su pareja. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#142f1d" }}>
          Tiempo invertido
        </span>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#142f1d" }}>
          {invertido === 0 ? "nada todavía" : enHoras(aLoGrueso(invertido))}
        </span>
      </div>
      <span style={{ position: "relative", height: 16, display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: 0, right: 0, height: 7, borderRadius: 4, background: "#e4ede7", overflow: "hidden" }}>
          <span style={{
            display: "block", height: "100%", borderRadius: 4,
            // El ámbar solo queda para lo que ya venía pasado de antes (bajar
            // el tiempo disponible con tandas ya pedidas): ahí la barra llena
            // y ámbar es lo único que lo cuenta.
            background: pasado ? "#b45309" : "#7bbf93",
            width: `${gastado * 100}%`,
            transition: "width .3s ease",
          }} />
        </span>
        {/* El círculo del final, para que las dos barras se lean como una
            pareja y no como una barra y su sombra. Va con la misma medida y
            el mismo calce de 13px que el de arriba —el que el navegador le da
            a su pulgar— para que los dos caigan en la misma vertical cuando
            marcan lo mismo.

            Pinta pero no se toca: sin `input` debajo y con los eventos
            apagados. Lo que dice es dónde acaba una lectura. */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute", width: 20, height: 20, borderRadius: "50%",
            background: "#fff", border: `2.5px solid ${pasado ? "#b45309" : "#7bbf93"}`,
            boxShadow: "0 1px 4px rgba(9,18,12,.2)",
            left: `calc((100% - 13px) * ${gastado})`,
            transition: "left .3s ease",
            pointerEvents: "none",
          }}
        />
      </span>
    </div>
  );
}
