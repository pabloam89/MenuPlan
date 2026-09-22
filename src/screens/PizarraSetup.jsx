import { useMemo, useState } from "react";
import { Coffee, Moon, Sun, Check, ChevronLeft, X } from "../components/icons.jsx";
import { ProgressDots } from "../components/ui.jsx";
import { ALL_DAY_MEALS, DAYS, getMeals } from "../lib/planner.js";
import { MAX_MENU_WEEKS } from "../lib/menuArchive.js";
import { todayDayIdx } from "../lib/weekCalendar.js";
import {
  buildCalendarWeeks,
  conDiaMarcado,
  conSemanaCompleta,
  diasDeSemana,
} from "../lib/semanaDias.js";

/**
 * Las dos preguntas que hay que responder ANTES de que exista la pizarra.
 *
 * ── Por qué van delante y no dentro ───────────────────────────────────────
 * Un menú en blanco no puede dibujarse sin saber cuántos huecos tiene. Las
 * comidas y los días no son ajustes que se afinan sobre la marcha: son la
 * forma del tablero. Preguntarlas después obligaría a re-crear el plan entero
 * con el primer cambio, y a decidir qué pasa con lo que ya hubieras colocado.
 *
 * ── Por qué un borrador local y no `setData` a cada toque ─────────────────
 * Lo elegido aquí no se escribe en la casa hasta "Empezar": si te arrepientes
 * a mitad, tus ajustes de siempre siguen intactos. Y lo que sale por
 * `onStart` es el objeto entero, no una señal de "ya está guardado" — así
 * quien crea el plan lo construye con estos valores sin esperar a que un
 * `setData` haya llegado al render, que es la carrera clásica de este flujo.
 *
 * El borrador arranca de lo que la casa ya tenía: la mayoría de las veces
 * estas dos respuestas ya están dadas desde el onboarding y esto es un
 * repaso de dos toques, no un formulario.
 */

const VERDE = "#2d5a3d";
const INK = "#142f1d";

/**
 * Cada comida con SU color y SU icono, no tres círculos verdes iguales.
 *
 * Los tres pares salen de `MEAL_EMPTY_ACCENT` y `MEAL_META` (Menu.jsx): son
 * exactamente el color y el icono con los que esa franja se va a pintar en el
 * tablero un segundo después. Si aquí el desayuno fuera de otro color, lo que
 * eliges y lo que aparece no se reconocerían como la misma cosa.
 */
const COMIDAS = [
  { id: "Desayuno", label: "Desayuno", Icon: Coffee, color: "#9b6a3f" },
  { id: "Comida", label: "Comida", Icon: Sun, color: "#c98a1e" },
  { id: "Cena", label: "Cena", Icon: Moon, color: "#4f68b0" },
];

/**
 * Las semanas toman la paleta de grupos (lib/groups.js): verde, naranja, azul
 * y malva. Ya es el idioma que la app usa para "esto y esto son cosas
 * distintas del mismo tipo", así que cuatro semanas se distinguen de un
 * vistazo sin inventar colores nuevos.
 */
const COLOR_SEMANA = ["#2d5a3d", "#c67030", "#5a7ea8", "#a85a7e"];

const ETIQUETA_SEMANA = ["Esta semana", "La que viene", "En 2 semanas", "En 3 semanas"];

const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Un círculo de opción, con el color de lo que representa.
 *
 * ── Que se vea marcado, aunque cada uno sea de un color ───────────────────
 * Con una paleta variada, "relleno = puesto" deja de bastar: un círculo
 * naranja lleno y otro azul lleno se leen como dos cosas distintas antes que
 * como dos cosas marcadas. Así que lo marcado se dice tres veces y las tres
 * son independientes del color:
 *   · el relleno sólido con el icono en blanco (sin marcar es fondo blanco);
 *   · el halo de color, que solo tiene el que está puesto;
 *   · una insignia con un check pegada abajo a la derecha.
 * Y lo NO marcado se apaga a gris verdoso en vez de quedarse en su color
 * apagado, que es lo que hacía dudar de si estaba puesto o no.
 */
function Radial({ label, Icon, texto, active, onClick, delay = 0, size = 64, color = VERDE }) {
  const apagado = "#c2cfc7";
  return (
    <button
      type="button"
      className="mp-rise mp-press"
      style={{
        "--d": `${delay}ms`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
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
            fontSize: 19, fontWeight: 900,
            transition: "all .18s ease",
          }}
        >
          {Icon ? <Icon size={26} strokeWidth={active ? 2.4 : 2} /> : texto}
        </span>
        {active && (
          <span
            aria-hidden
            style={{
              position: "absolute", right: -2, bottom: -2,
              width: 21, height: 21, borderRadius: 999,
              background: "#fff", border: `2px solid ${color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Check size={12} color={color} strokeWidth={3} />
          </span>
        )}
      </span>
      <span style={{ fontSize: 11, fontWeight: active ? 800 : 700, color: active ? color : "#9ab0a1", letterSpacing: "-.1px" }}>
        {label}
      </span>
    </button>
  );
}

function Cabecera({ titulo, subtitulo }) {
  return (
    <div style={{ padding: "0 2px 18px" }}>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: INK, letterSpacing: "-.7px", lineHeight: 1.1 }}>
        {titulo}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
        {subtitulo}
      </p>
    </div>
  );
}

export function PizarraSetup({ data, onCancel, onStart }) {
  const [paso, setPaso] = useState(0);
  const todayIdx = useMemo(() => todayDayIdx(), []);
  const semanas = useMemo(() => buildCalendarWeeks(MAX_MENU_WEEKS), []);
  const allOffsets = useMemo(() => semanas.map((s) => s.offset), [semanas]);
  const opts = useMemo(() => ({ allOffsets, todayIdx }), [allOffsets, todayIdx]);

  const hoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [comidas, setComidas] = useState(() => new Set(getMeals(data)));
  // Solo los campos de semana: es lo único que estas pantallas tocan, y así el
  // borrador no arrastra una copia entera del estado de la casa.
  const [semanaDraft, setSemanaDraft] = useState(() => ({
    menuWeekDays: data.menuWeekDays ?? {},
    menuWeekOffsets: data.menuWeekOffsets ?? null,
    menuWeek: data.menuWeek ?? null,
  }));

  const toggleComida = (id) => {
    setComidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const diasDe = (offset) => diasDeSemana(semanaDraft, offset, todayIdx);
  const totalDias = allOffsets.reduce((n, o) => n + diasDe(o).length, 0);
  const puedeSeguir = comidas.size > 0;

  const empezar = () => {
    onStart({
      meals: ALL_DAY_MEALS.filter((m) => comidas.has(m)),
      menuWeekDays: semanaDraft.menuWeekDays,
      menuWeekOffsets: semanaDraft.menuWeekOffsets,
      menuWeek: semanaDraft.menuWeek,
    });
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f8f5", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1, width: "100%", maxWidth: 420, margin: "0 auto", boxSizing: "border-box",
          padding: "16px 18px 0",
        }}
      >
        {/* Cabecera de navegación: atrás (o cerrar en el primer paso) + pasos */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className="mp-press"
            onClick={paso === 0 ? onCancel : () => setPaso(0)}
            aria-label={paso === 0 ? "Salir" : "Atrás"}
            style={{
              width: 36, height: 36, borderRadius: 12, flexShrink: 0,
              background: "#fff", border: "1px solid #e0eae3", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}
          >
            {paso === 0 ? <X size={17} color={VERDE} /> : <ChevronLeft size={18} color={VERDE} />}
          </button>
          <div style={{ flex: 1 }}>
            <ProgressDots current={paso} total={2} onJump={(i) => { if (i === 0) setPaso(0); }} compact />
          </div>
        </div>

        {paso === 0 ? (
          <>
            <Cabecera
              titulo="Tu pizarra"
              subtitulo="Primero, qué comidas quieres planificar. Cada una abrirá su propio hueco cada día."
            />
            <div key="comidas" style={{ display: "flex", justifyContent: "center", gap: 26, padding: "10px 0 4px" }}>
              {COMIDAS.map((c, i) => (
                <Radial
                  key={c.id}
                  label={c.label}
                  Icon={c.Icon}
                  color={c.color}
                  active={comidas.has(c.id)}
                  onClick={() => toggleComida(c.id)}
                  delay={i * 70}
                />
              ))}
            </div>
            {comidas.size === 0 && (
              <p style={{ margin: "18px 0 0", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "#b45309" }}>
                Elige al menos una.
              </p>
            )}
          </>
        ) : (
          <>
            <Cabecera
              titulo="¿Qué días?"
              subtitulo="Toca una semana entera, o afina día a día en el calendario."
            />
            <div key="semanas" style={{ display: "flex", justifyContent: "center", gap: 18, padding: "4px 0 18px", flexWrap: "wrap" }}>
              {semanas.map((s, i) => {
                const n = diasDe(s.offset).length;
                return (
                  <Radial
                    key={s.offset}
                    label={ETIQUETA_SEMANA[i] ?? `En ${i} semanas`}
                    // El número es cuántos días lleva puesta esa semana: con la
                    // insignia diciendo ya "marcada", aquí vale más el dato que
                    // repetir el check.
                    texto={n === 0 ? "·" : String(n)}
                    color={COLOR_SEMANA[i % COLOR_SEMANA.length]}
                    active={n > 0}
                    size={56}
                    delay={i * 70}
                    onClick={() => setSemanaDraft((d) => conSemanaCompleta(d, s.offset, opts))}
                  />
                );
              })}
            </div>

            {/* Calendario: tocar pone y quita un día. Sin arrastre a propósito
                —aquí se viene a rematar, no a pintar la semana entera, que ya
                lo hacen los círculos de arriba de un toque. */}
            <div style={{ background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16, padding: "12px 10px" }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: VERDE, letterSpacing: ".8px",
                textTransform: "uppercase", padding: "0 4px 8px",
              }}>
                {MESES[semanas[0].monday.getMonth()]} {semanas[0].monday.getFullYear()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
                {DIAS_CORTOS.map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 800, color: "#4a6b55", padding: "2px 0" }}>
                    {d}
                  </div>
                ))}
              </div>
              {semanas.map((s, wi) => {
                const puestos = new Set(diasDe(s.offset));
                // Cada fila del calendario lleva el color de su círculo: así
                // se ve de qué semana son los días que acabas de marcar sin
                // tener que contar filas.
                const colorSemana = COLOR_SEMANA[wi % COLOR_SEMANA.length];
                return (
                  <div key={s.offset} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", alignItems: "center" }}>
                    {s.days.map((fecha, i) => {
                      const esHoy = fecha.getTime() === hoy.getTime();
                      const pasado = fecha < hoy;
                      const code = DAYS[i];
                      const marcado = puestos.has(code);
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "center", height: 38 }}>
                          <button
                            type="button"
                            disabled={pasado}
                            onClick={() => setSemanaDraft((d) => conDiaMarcado(d, s.offset, code, !marcado, opts))}
                            style={{
                              width: 32, height: 32, borderRadius: 999, padding: 0, alignSelf: "center",
                              border: marcado ? `1.5px solid ${colorSemana}` : "1.5px solid transparent",
                              background: marcado ? `${colorSemana}22` : "transparent",
                              color: pasado ? "#ccd6cf" : marcado ? colorSemana : "#3a4a42",
                              // Hoy se subraya con un punto debajo, no pintando
                              // el círculo: el relleno ya significa "marcado", y
                              // usarlo también para "es hoy" hacía que el día de
                              // hoy pareciera puesto aunque no lo estuviera.
                              boxShadow: esHoy ? "inset 0 -3px 0 -1px #f59e0b" : "none",
                              fontSize: 13.5, fontWeight: esHoy ? 900 : marcado ? 800 : 600,
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
          </>
        )}
      </div>

      {/* Pie fijo: el CTA no se va con el scroll del calendario. */}
      <div
        style={{
          position: "sticky", bottom: 0, background: "#f4f8f5",
          borderTop: "1px solid #eef3f0",
          padding: `12px 18px calc(12px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          {paso === 0 ? (
            <button
              type="button"
              className="mp-press"
              disabled={!puedeSeguir}
              onClick={() => setPaso(1)}
              style={ctaStyle(puedeSeguir)}
            >
              Seguir
            </button>
          ) : (
            <button
              type="button"
              className="mp-press"
              disabled={totalDias === 0}
              onClick={empezar}
              style={ctaStyle(totalDias > 0)}
            >
              {totalDias > 0 ? `Empezar · ${totalDias} ${totalDias === 1 ? "día" : "días"}` : "Elige algún día"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ctaStyle(enabled) {
  return {
    width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
    background: enabled ? VERDE : "#c8d9ce",
    color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit",
    cursor: enabled ? "pointer" : "default",
    boxShadow: enabled ? "0 4px 18px rgba(45,90,61,.25)" : "none",
    transition: "background .18s ease",
  };
}
