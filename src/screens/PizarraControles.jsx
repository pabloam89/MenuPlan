import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, Check, Sparkles, X } from "../components/icons.jsx";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { recuentoDelMenu } from "../lib/menuRecuento.js";
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

/**
 * Las familias del balance, con el color con el que esa categoría se pinta en
 * el resto de la app (ver DESIGN_SYSTEM §1.6). El id es el de
 * `recuentoDelMenu`, que es el mismo del reparto: si aquí se renombrara uno,
 * la barra contaría una familia y compararía con otra.
 */
const FAMILIAS_BALANCE = [
  { id: "carne", label: "Carne", color: "#c0392b", img: "carnes.png" },
  { id: "pescado", label: "Pescado", color: "#2f6f9f", img: "pescados.png" },
  { id: "legumbres", label: "Legumbres", color: "#b9770e", img: "legumbres.png" },
  { id: "huevos", label: "Huevos", color: "#d4a017", img: "huevos.png" },
  { id: "pasta_arroz", label: "Pasta y arroz", color: "#cf7833", img: "pasta_arroces.png" },
  { id: "verdura", label: "Verdura", color: "#3f9656", img: "ensaladas_verduras.png" },
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

/**
 * "Cómo va la semana": lo que llevas puesto, contado.
 *
 * ── Cuenta, no corrige ────────────────────────────────────────────────────
 * En un tablero vacío la pregunta no es "¿esto está bien?" sino "¿qué me
 * falta?". Así que esto no bloquea nada ni pinta errores: enseña cuántos
 * platos de cada familia llevas y, si la casa tiene un reparto pedido,
 * cuántos pediste. La diferencia se lee sola.
 *
 * ── Del mismo recuento que usa el bot ─────────────────────────────────────
 * `recuentoDelMenu` es la función que ya alimenta las sugerencias del panel,
 * y el reparto sale de `freqsEfectivos`, el mismo que baja los porcentajes a
 * platos para el motor. Si este panel contara por su cuenta, acabaría
 * diciendo "te falta pescado" mientras el generador cree que va sobrado.
 */
function PanelBalance({ menuPlan, groups }) {
  const recuento = useMemo(() => {
    const plan = {};
    for (const g of groups ?? []) {
      if (menuPlan?.[g.id]) plan[g.id] = menuPlan[g.id];
    }
    return recuentoDelMenu(plan, recipeCatalogById);
  }, [menuPlan, groups]);

  const filas = FAMILIAS_BALANCE.map((f) => ({ ...f, puestos: recuento.familias[f.id] ?? 0 }));

  return (
    <>
      {/* Esto cuenta, y ya está. Sin objetivos ni huecos que faltan: no hay
          tope que respetar, así que un "0 de 3" pintaba un límite que no
          existe y convertía el panel en un examen. */}
      <p style={{ margin: "0 0 16px", fontSize: 12.5, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
        {recuento.huecos === 0
          ? "Todavía no has puesto ningún plato."
          : `${recuento.huecos} ${recuento.huecos === 1 ? "plato puesto" : "platos puestos"} esta semana.`}
      </p>

      <div
        style={{
          background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16,
          overflow: "hidden", boxShadow: "0 1px 3px rgba(20,47,29,.05)",
        }}
      >
        {filas.map((f, i) => {
          const vacia = f.puestos === 0;
          return (
            <div
              key={f.id}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                borderBottom: i === filas.length - 1 ? "none" : "1px solid #eef3f0",
              }}
            >
              {/* La foto de la categoría, la misma que ves en las carpetas del
                  recetario: reconoces la familia antes de leer su nombre. Las
                  que van a cero se quedan en gris — que falte pescado tiene que
                  verse sin leer números. */}
              <span
                style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  overflow: "hidden", background: "#f4f8f5",
                  border: "1px solid #eef3f0", display: "block",
                  opacity: vacia ? 0.4 : 1,
                  filter: vacia ? "saturate(.2)" : "none",
                  transition: "opacity .25s ease, filter .25s ease",
                }}
              >
                <img
                  src={`/categories/${f.img}`}
                  alt=""
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </span>

              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: vacia ? "#9ab0a1" : INK }}>
                {f.label}
              </span>

              {/* El número en su círculo, del color de la familia. Sustituye a
                  la barra: una barra mide contra algo, y aquí ya no hay contra
                  qué — solo cuántos llevas. */}
              <span
                style={{
                  width: 32, height: 32, borderRadius: 999, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: vacia ? "#f4f7f5" : `${f.color}18`,
                  border: `1.5px solid ${vacia ? "#e3ebe6" : `${f.color}55`}`,
                  color: vacia ? "#c2cfc7" : f.color,
                  fontSize: 14, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  transition: "all .25s ease",
                }}
              >
                {f.puestos}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Los mandos de la pizarra, en baldosas.
 *
 * Vivían en dos lengüetas pegadas al borde izquierdo, asomando 20px. Era
 * discreto de más: había que descubrirlas, y un mando que no se ve no se usa.
 * Aquí comparten sitio y forma con la fila de mandos del menú generado —misma
 * baldosa, mismo tamaño, mismo nombre debajo— así que se leen como lo que
 * son: los controles de este tablero.
 *
 * El tinte de la franja los separa de las tarjetas de plato que vienen justo
 * debajo: son otra cosa y hay que verlo sin leer.
 */
function BaldosaMando({ Icon, label, color, tinte, onClick, badge = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mp-press"
      style={{
        flexShrink: 0, width: 72,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        background: "none", border: "none", padding: 0,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <span
        style={{
          position: "relative",
          width: 52, height: 52, borderRadius: 17,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: tinte, border: "2px solid transparent",
          boxShadow: "0 2px 8px -4px rgba(20,47,29,.18)",
        }}
      >
        <Icon size={21} color={color} strokeWidth={2.2} />
        {badge != null && (
          <span
            style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999,
              background: color, color: "#fff",
              fontSize: 11, fontWeight: 900, fontVariantNumeric: "tabular-nums",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #f4f8f5",
            }}
          >
            {badge}
          </span>
        )}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "#5a7066", letterSpacing: "-.1px" }}>
        {label}
      </span>
    </button>
  );
}

export function PizarraControles({ data, menuPlan, groups, onAplicar, onRellenar }) {
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

  // Cuántos PLATOS faltan por poner: una comida partida en dos que está
  // entera vacía son dos, no uno. Es el número de la chapa de "Rellenar".
  const huecosVacios = useMemo(() => {
    let n = 0;
    for (const g of groups ?? []) {
      for (const s of Object.values(menuPlan?.[g.id] ?? {})) {
        if (!s) continue;
        if (s.dosPlatos && !s.firstRecipeId) n++;
        if (!s.recipeId) n++;
      }
    }
    return n;
  }, [menuPlan, groups]);

  return (
    <>
      <style>{`
        @keyframes mpPizarraPanel {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .mp-pizarra-panel { animation: mpPizarraPanel .24s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      <div
        style={{
          display: "flex", gap: 4, overflowX: "auto",
          background: "#eef4f0", borderTop: "1px solid #e3ebe6",
          padding: "10px 12px 8px", marginBottom: 14,
          scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
        }}
      >
        <BaldosaMando
          Icon={CalendarDays}
          label="Días"
          color={TEAL}
          tinte="#fff"
          onClick={() => setAbierto("dias")}
        />
        <BaldosaMando
          Icon={BarChart3}
          label="Balance"
          color="#7a5aa8"
          tinte="#fff"
          onClick={() => setAbierto("balance")}
        />
        {onRellenar && huecosVacios > 0 && (
          <BaldosaMando
            Icon={Sparkles}
            label="Rellenar"
            color="#c98a1e"
            tinte="#fff"
            badge={huecosVacios}
            onClick={() => onRellenar()}
          />
        )}
      </div>

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
                {abierto === "balance" ? "Cómo va la semana" : "¿Qué días?"}
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

            {abierto === "balance" ? (
              <PanelBalance menuPlan={menuPlan} groups={groups} />
            ) : (
              <>
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

                <div style={{ background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16, padding: "14px 10px 10px" }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 800, color: TEAL, letterSpacing: ".8px",
                    textTransform: "uppercase", padding: "0 4px 8px",
                  }}>
                    {MESES[semanas[0].monday.getMonth()]} {semanas[0].monday.getFullYear()}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
                    {DIAS_CORTOS.map((d, i) => (
                      <div key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#9ab0a1", letterSpacing: ".3px" }}>
                        {d}
                      </div>
                    ))}
                  </div>
                  {/* Las semanas, separadas de verdad: cuatro filas de
                      números pegadas se leían como una tabla de treinta
                      números sin estructura, y lo que hay que ver de un
                      vistazo es dónde empieza y acaba cada semana. */}
                  {semanas.map((s, wi) => {
                    const puestos = new Set(diasDe(s.offset));
                    return (
                      <div
                        key={s.offset}
                        style={{
                          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                          marginTop: wi === 0 ? 4 : 10,
                          paddingTop: wi === 0 ? 0 : 10,
                          borderTop: wi === 0 ? "none" : "1px solid #f1f5f2",
                        }}
                      >
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
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
