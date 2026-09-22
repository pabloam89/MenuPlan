import { useMemo, useState } from "react";
import { CalendarDays, Check, X } from "../components/icons.jsx";
import { DAYS } from "../lib/planner.js";
import { MAX_MENU_WEEKS } from "../lib/menuArchive.js";
import { todayDayIdx } from "../lib/weekCalendar.js";
import {
  buildCalendarWeeks,
  conDiaMarcado,
  conSemanaCompleta,
  diasDeSemana,
} from "../lib/semanaDias.js";

/**
 * Los mandos de la pizarra: dos pestañas metidas en el borde izquierdo.
 *
 * ── Por qué al borde y no delante ─────────────────────────────────────────
 * Esto era un asistente de dos pantallas que se pasaba ANTES de ver nada.
 * Preguntaba lo correcto en el peor momento: te hacía decidir la forma del
 * tablero sin tener el tablero delante. Ahora entras directo a la rejilla
 * vacía —comida y cena, la semana de hoy— y los dos mandos viven pegados al
 * margen, asomando lo justo para saber que están. Cambias una comida y el
 * tablero se reforma debajo, que es cuando de verdad puedes juzgar si querías
 * eso.
 *
 * ── Lo que NO hacen ───────────────────────────────────────────────────────
 * Quitar. Apagar el desayuno deja de pintarlo, pero los desayunos que hubieras
 * puesto siguen en el plan (ver `conHuecosAlDia`): un interruptor no puede
 * destruir trabajo sin avisar, y avisar por esto sería un modal cada dos
 * toques.
 */

const VERDE = "#2d5a3d";
const INK = "#142f1d";

/**
 * Un solo color para las cuatro semanas: el teal de la casa.
 *
 * Estaban con la paleta de grupos, cuatro colores distintos, y el color pasaba
 * a significar "esta semana es otra cosa" cuando lo único que las distingue es
 * cuándo caen — que ya lo dice la etiqueta. Con cuatro tonos, además, ninguno
 * destacaba: el que importa es el estado (puesta o no), y eso se lee mejor con
 * un color y dos intensidades.
 */
const TEAL = "#0f766e";

const ETIQUETA_SEMANA = ["Esta", "La próxima", "En 2 sem.", "En 3 sem."];
const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const PANELES = [
  { id: "dias", label: "Días", Icon: CalendarDays },
];

/**
 * Un círculo de opción, con el color de lo que representa.
 *
 * Con paleta variada, "relleno = puesto" no basta: un círculo naranja lleno y
 * otro azul lleno se leen antes como dos cosas distintas que como dos cosas
 * marcadas. Lo marcado se dice tres veces, y ninguna depende del color: el
 * relleno sólido, el halo, y una insignia con un check. Lo apagado se va a
 * gris verdoso en vez de quedarse en su propio color atenuado, que es lo que
 * hacía dudar.
 */
function Radial({ label, Icon, texto, active, onClick, delay = 0, size = 58, color = VERDE }) {
  const apagado = "#c2cfc7";
  return (
    <button
      type="button"
      className="mp-rise mp-press"
      style={{
        "--d": `${delay}ms`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: 0, border: "none", background: "transparent", cursor: "pointer",
        fontFamily: "inherit", flex: "0 0 auto",
      }}
      onClick={onClick}
      aria-pressed={active}
    >
      <span style={{ position: "relative", display: "inline-flex" }}>
        <span
          style={{
            width: size, height: size, borderRadius: 999,
            background: active ? color : "#fff",
            border: `2.5px solid ${active ? color : apagado}`,
            color: active ? "#fff" : apagado,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: active ? `0 6px 18px ${color}66` : "0 1px 3px rgba(20,47,29,.05)",
            transform: active ? "none" : "scale(.94)",
            fontSize: 17, fontWeight: 900,
            transition: "all .18s ease",
          }}
        >
          {Icon ? <Icon size={24} strokeWidth={active ? 2.4 : 2} /> : texto}
        </span>
        {active && (
          <span
            aria-hidden
            style={{
              position: "absolute", right: -2, bottom: -2,
              width: 20, height: 20, borderRadius: 999,
              background: "#fff", border: `2px solid ${color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Check size={11} color={color} strokeWidth={3} />
          </span>
        )}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 700, color: active ? color : "#9ab0a1" }}>
        {label}
      </span>
    </button>
  );
}

export function PizarraControles({ data, onAplicar }) {
  const [abierto, setAbierto] = useState(null);
  const todayIdx = useMemo(() => todayDayIdx(), []);
  const semanas = useMemo(() => buildCalendarWeeks(MAX_MENU_WEEKS), []);
  const allOffsets = useMemo(() => semanas.map((s) => s.offset), [semanas]);
  const opts = useMemo(() => ({ allOffsets, todayIdx }), [allOffsets, todayIdx]);
  const hoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const diasDe = (offset) => diasDeSemana(data, offset, todayIdx);

  return (
    <>
      <style>{`
        @keyframes mpPizarraPanel {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .mp-pizarra-panel { animation: mpPizarraPanel .24s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      {/* ── Las dos lengüetas, pegadas al margen ──────────────────────────
          Asoman 20px y nada más: si pidieran atención competirían con el
          tablero, que es lo que se ha venido a mirar. Se colocan a un tercio
          de la altura para no chocar ni con la cabecera ni con la nav. */}
      {/* Anclado a la COLUMNA de la app, no a la ventana.
          `position: fixed` se resuelve contra el primer ancestro con
          transform, y el contenedor de pantalla lleva la animación de
          navegación: según el momento, `left: 0` caía en el borde del
          navegador o en el de la columna, y en escritorio eso son 500px de
          diferencia. La caja centrada de 420 da el mismo sitio siempre — y en
          un móvil, donde la columna ES la ventana, no cambia nada. */}
      {!abierto && (
        <div
          style={{
            // A media altura y no a un tercio: arriba pisaba el nombre del
            // día y su número, y más abajo caía sobre las tarjetas de comida y
            // cena. En el centro la lengüeta cae entre dos filas.
            position: "fixed", top: "50dvh", transform: "translate(-50%, -50%)",
            zIndex: 150, left: "50%",
            // `100%` y no `100vw`: vw incluye la barra de scroll, así que en
            // escritorio la caja salía 7px más ancha que lo visible y la
            // lengüeta se quedaba medio fuera por la izquierda.
            width: "min(420px, 100%)", pointerEvents: "none",
            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
          }}
        >
          {PANELES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAbierto(id)}
              aria-label={label}
              className="mp-press"
              style={{
                // Más ancha para que el icono respire, y sin color: gris
                // verdoso sobre blanco translúcido. Un mando que está siempre
                // ahí no puede pedir atención cada vez que miras el tablero.
                width: 26, height: 72, padding: 0,
                borderRadius: "0 14px 14px 0",
                border: "1px solid #e6ede9", borderLeft: "none",
                background: "rgba(255,255,255,.86)",
                backdropFilter: "blur(4px)",
                boxShadow: "1px 1px 6px -4px rgba(20,47,29,.3)",
                cursor: "pointer", pointerEvents: "auto",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Icon size={14} color="#aab8b0" strokeWidth={2} />
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <>
          <div
            onClick={() => setAbierto(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(20,47,29,.28)", zIndex: 160 }}
          />
          <div
            className="mp-pizarra-panel"
            style={{
              // Mismo anclaje que las lengüetas: el panel sale del borde de la
              // columna, que es de donde el usuario lo ha tirado.
              position: "fixed", top: 0, bottom: 0, zIndex: 161,
              left: "max(0px, calc(50% - 210px))",
              width: "min(320px, 86vw)", boxSizing: "border-box",
              background: "#f4f8f5", borderRight: "1px solid #e0eae3",
              boxShadow: "8px 0 28px -18px rgba(20,47,29,.5)",
              overflowY: "auto",
              padding: `18px 16px calc(18px + env(safe-area-inset-bottom, 0px))`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <p style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
                ¿Qué días?
              </p>
              <button
                type="button"
                onClick={() => setAbierto(null)}
                aria-label="Cerrar"
                className="mp-press"
                style={{
                  width: 32, height: 32, borderRadius: 999, flexShrink: 0, padding: 0,
                  background: "#fff", border: "1px solid #e0eae3", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={16} color={VERDE} />
              </button>
            </div>

                <p style={{ margin: "0 0 14px", fontSize: 12.5, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
                  Toca una semana entera, o afina día a día.
                </p>
                {/* Las cuatro en UNA fila: partidas en 3+1 se leían como dos
                    grupos de semanas, que no significa nada. */}
                <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginBottom: 16 }}>
                  {semanas.map((s, i) => {
                    const n = diasDe(s.offset).length;
                    return (
                      <Radial
                        key={s.offset}
                        label={ETIQUETA_SEMANA[i] ?? `En ${i} semanas`}
                        texto={n === 0 ? "·" : String(n)}
                        color={TEAL}
                        active={n > 0}
                        size={44}
                        delay={i * 70}
                        onClick={() => onAplicar(conSemanaCompleta(data, s.offset, opts))}
                      />
                    );
                  })}
                </div>

                <div style={{ background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16, padding: "12px 8px" }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 800, color: TEAL, letterSpacing: ".8px",
                    textTransform: "uppercase", padding: "0 4px 8px",
                  }}>
                    {MESES[semanas[0].monday.getMonth()]} {semanas[0].monday.getFullYear()}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
                    {DIAS_CORTOS.map((d, i) => (
                      <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "#4a6b55" }}>
                        {d}
                      </div>
                    ))}
                  </div>
                  {semanas.map((s) => {
                    const puestos = new Set(diasDe(s.offset));
                    return (
                      <div key={s.offset} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                        {s.days.map((fecha, i) => {
                          const esHoy = fecha.getTime() === hoy.getTime();
                          const pasado = fecha < hoy;
                          const code = DAYS[i];
                          const marcado = puestos.has(code);
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "center", height: 34 }}>
                              <button
                                type="button"
                                disabled={pasado}
                                onClick={() => onAplicar(conDiaMarcado(data, s.offset, code, !marcado, opts))}
                                style={{
                                  width: 30, height: 30, borderRadius: 999, padding: 0, alignSelf: "center",
                                  border: marcado ? `1.5px solid ${TEAL}` : "1.5px solid transparent",
                                  background: marcado ? `${TEAL}22` : "transparent",
                                  color: pasado ? "#ccd6cf" : marcado ? TEAL : "#3a4a42",
                                  // Hoy se subraya, no se rellena: el relleno ya
                                  // significa "marcado", y usándolo para las dos
                                  // cosas hoy parecía puesto sin estarlo.
                                  boxShadow: esHoy ? "inset 0 -3px 0 -1px #f59e0b" : "none",
                                  fontSize: 13, fontWeight: esHoy ? 900 : marcado ? 800 : 600,
                                  fontFamily: "inherit",
                                  cursor: pasado ? "default" : "pointer",
                                  transition: "background .12s ease, color .12s ease",
                                }}
                              >
                                {fecha.getDate()}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
          </div>
        </>
      )}
    </>
  );
}
