import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Apple, ArrowRight, BarChart3, Check, ChevronRight, Coffee, CookingPot, Eraser,
  Heart, IceCream, Minus, Moon, Package, Plus, Salad, Search, Sparkles, Sun, X,
} from "../components/icons.jsx";
import { ingredientImageSrc, ingredientThumbSrc } from "../lib/ingredientImages.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { formatStockQty } from "../lib/kitchenUnits.js";
import { medidasDe, medidaPorId, enPlural, UNIDAD_SUELTA } from "../lib/medidasDeIngrediente.js";
import { Picker } from "../components/Picker.jsx";
import { GroupAvatarStack, groupAvatarFaces } from "../components/ui.jsx";
import { membersOfGroup } from "../lib/groups.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { recuentoDelMenu } from "../lib/menuRecuento.js";
import { DAYS, getDayMeals } from "../lib/planner.js";
import { MAX_MENU_WEEKS } from "../lib/menuArchive.js";
import { calendarDayNumber, getWeekDates, todayDayIdx } from "../lib/weekCalendar.js";
import { tandaDelMenu } from "../lib/tandaDelPlato.js";
import { APPLIANCE_COLORS, REQUIRED_APPLIANCE_ICONS, selectMethodForRecipe } from "../lib/applianceMethods.js";
import { enHoras, minutosDeTanda } from "../lib/cookTime.js";
import { TiempoDeTanda } from "../components/TiempoDeTanda.jsx";
import { BASES_UI } from "../lib/basesUI.js";
import { claveDeBase } from "../lib/bases.js";
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

/** El naranja de la cocina: el mismo con el que la pestaña de Cocina pinta la tanda. */
const NARANJA = "#b2622f";

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
/** La inicial del día, la misma que usan Compra, Análisis y el menú. */
const LETRA_DIA = { Lun: "L", Mar: "M", "Mié": "X", Jue: "J", Vie: "V", "Sáb": "S", Dom: "D" };

/** El icono de la franja, el mismo del tablero. */
const ICONO_FRANJA = {
  Desayuno: { Icon: Coffee, color: "#c98a3a" },
  Comida: { Icon: Sun, color: "#d4a017" },
  Merienda: { Icon: Apple, color: "#c0504d" },
  Cena: { Icon: Moon, color: "#4f68b0" },
  Postre: { Icon: IceCream, color: "#c0568f" },
};

/**
 * Los tres macros, con su color y sus kcal por gramo.
 *
 * El anillo reparte por ENERGÍA, no por gramos. 26 g de grasa y 26 g de
 * hidratos ocupan lo mismo en una báscula y no se parecen en nada en un plato:
 * la grasa lleva 9 kcal por gramo y los hidratos 4. Un anillo por gramos
 * dibujaría la grasa a menos de la mitad de lo que pesa de verdad en la comida,
 * que es justo el error que este dibujo tiene que no cometer.
 *
 * Los gramos siguen ahí, en los números — cada cosa dice lo suyo y el pie lo
 * declara, para que nadie intente cuadrar los porcentajes con los gramos.
 */
const MACROS = [
  { id: "protein_g", letra: "P", nombre: "proteína", color: "#c0392b", kcalPorG: 4 },
  { id: "carbs_g", letra: "H", nombre: "hidratos", color: "#cf7833", kcalPorG: 4 },
  { id: "fat_g", letra: "G", nombre: "grasa", color: "#d4a017", kcalPorG: 9 },
];

/**
 * El anillo de macros: cuánta de la energía viene de cada uno.
 *
 * Un arco por macro sobre un mismo círculo, con las kcal en el centro. Es un
 * SVG y no tres divs porque un arco se dibuja con `stroke-dasharray` y ya está:
 * no hay que calcular ni un path.
 */
function AnilloMacros({ platos, size = 74 }) {
  const suma = (campo) => platos.reduce((t, p) => t + (Number(p[campo]) || 0), 0);
  const trozos = MACROS.map((m) => ({ ...m, gramos: suma(m.id), kcal: suma(m.id) * m.kcalPorG }));
  const energia = trozos.reduce((t, x) => t + x.kcal, 0);
  const fibra = suma("fiber_g");
  const kcalMedia = platos.length ? Math.round(suma("kcal") / platos.length) : 0;
  if (energia <= 0) return null;

  const grosor = 9;
  const r = (size - grosor) / 2;
  const circ = 2 * Math.PI * r;
  // El punto de arranque de cada arco se calcula ANTES de pintar, no mutando
  // un contador dentro del map: el compilador de React no admite reasignar
  // durante el render, y además así el trozo trae ya todo lo que necesita.
  const arcos = trozos.reduce((acc, x) => {
    const frac = x.kcal / energia;
    const previo = acc.length ? acc[acc.length - 1] : null;
    acc.push({ ...x, frac, desde: previo ? previo.desde + previo.frac : 0 });
    return acc;
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ display: "block", transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef3f0" strokeWidth={grosor} />
          {arcos.map((x) => {
            // Un pelo de aire entre arcos para que se vean tres y no uno.
            const largo = Math.max(0, circ * x.frac - 2);
            return (
              <circle
                key={x.id}
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={x.color} strokeWidth={grosor} strokeLinecap="round"
                strokeDasharray={`${largo} ${circ - largo}`}
                strokeDashoffset={-circ * x.desde}
              />
            );
          })}
        </svg>
        <span
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums" }}>{kcalMedia}</span>
          <span style={{ fontSize: 8.5, fontWeight: 800, color: "#9ab0a1", marginTop: 2 }}>kcal</span>
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {trozos.map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: x.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: "#5a7066" }}>{x.nombre}</span>
            <span style={{ fontSize: 11.5, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(x.gramos / platos.length)} g
            </span>
          </div>
        ))}
        {/* La fibra NO es un arco: no aporta energía, así que dentro del
            anillo estaría mintiendo sobre de dónde salen las calorías. Va
            debajo, con su punto hueco, porque vale la pena verla —está al
            99,5 % en el catálogo y es lo que más se queda corto en una
            semana real. */}
        {fibra > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, paddingTop: 5, borderTop: "1px solid #e8efea" }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, border: "1.5px solid #3f9656", boxSizing: "border-box", flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: "#5a7066" }}>fibra</span>
            <span style={{ fontSize: 11.5, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(fibra / platos.length)} g
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

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
      {label && (
        <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 700, color: active ? color : "#9ab0a1" }}>
          {label}
        </span>
      )}
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
function PanelBalance({ menuPlan, groups, members = [] }) {
  // Con más de un menú en casa, el reparto de uno no es el del otro: el de los
  // peques lleva cosas que el de los mayores no, y mezclarlos da una media que
  // no es la semana de nadie. `null` = todos juntos, que sigue siendo el
  // arranque porque es lo que se quiere ver casi siempre.
  const [soloGrupo, setSoloGrupo] = useState(null);
  const variosMenus = (groups ?? []).length > 1;

  const recuento = useMemo(() => {
    const plan = {};
    for (const g of groups ?? []) {
      if (soloGrupo && g.id !== soloGrupo) continue;
      if (menuPlan?.[g.id]) plan[g.id] = menuPlan[g.id];
    }
    return recuentoDelMenu(plan, recipeCatalogById);
  }, [menuPlan, groups, soloGrupo]);

  const filas = FAMILIAS_BALANCE.map((f) => ({
    ...f,
    puestos: recuento.familias[f.id] ?? 0,
    platos: recuento.platosPorFamilia?.[f.id] ?? [],
  }));

  // Qué familia está abierta, o null. Una sola: dos abiertas a la vez hacen
  // scroll de más en un panel de 320px y nadie compara dos listas largas.
  const [abierta, setAbierta] = useState(null);
  // Los números del mes, para el chip del día. La pizarra vive siempre en la
  // semana en curso (ver handleStartPizarra), así que no hay offset que pasar.
  const fechas = useMemo(() => getWeekDates(), []);

  return (
    <>
      {/* Esto cuenta, y ya está. Sin objetivos ni huecos que faltan: no hay
          tope que respetar, así que un "0 de 3" pintaba un límite que no
          existe y convertía el panel en un examen. */}
      <p style={{ margin: "0 0 12px", fontSize: 12.5, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
        {recuento.huecos === 0
          ? "Todavía no has puesto ningún plato."
          : `${recuento.huecos} ${recuento.huecos === 1 ? "plato puesto" : "platos puestos"} esta semana.`}
      </p>

      {/* ── De quién es esta semana ──────────────────────────────────────
          Solo con más de un menú: con uno, un filtro de una opción es un
          control que no controla nada. Las caras y no los nombres porque un
          menú de casa se reconoce por quién come de él. */}
      {variosMenus && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {[{ id: null, label: "Todos" }, ...groups].map((g) => {
            const activo = soloGrupo === g.id;
            const caras = g.id ? groupAvatarFaces(membersOfGroup(g, members), members) : [];
            return (
              <button
                key={g.id ?? "todos"}
                type="button"
                onClick={() => setSoloGrupo(g.id)}
                style={{
                  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6,
                  padding: caras.length ? "3px 10px 3px 3px" : "6px 12px",
                  borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                  background: activo ? VERDE : "#fff",
                  border: `1px solid ${activo ? VERDE : "#e0eae3"}`,
                  color: activo ? "#fff" : "#5a7066",
                  fontSize: 11.5, fontWeight: 800,
                }}
              >
                {caras.length > 0 && <GroupAvatarStack faces={caras} size={22} active={activo} max={3} />}
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── El anillo, una vez y arriba ──────────────────────────────────
          Estaba dentro de cada familia y se repetía seis veces diciendo cada
          vez algo distinto sobre un trozo pequeño. Una semana tiene UN
          reparto de macros, y es este. Se calcula sobre `recuento.platos` —la
          lista plana— y no sumando las familias: un arroz a la cubana está en
          dos y contaría por partida doble. */}
      {recuento.platos.length > 0 && (
        <div
          style={{
            background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16,
            padding: "12px 14px", marginBottom: 12,
            boxShadow: "0 1px 3px rgba(20,47,29,.05)",
          }}
        >
          <AnilloMacros platos={recuento.platos} />
          <p style={{ margin: "10px 0 0", fontSize: 9.5, fontWeight: 700, color: "#9ab0a1", lineHeight: 1.35 }}>
            Media por ración. El anillo reparte las calorías, no los gramos.
          </p>
        </div>
      )}

      <div
        style={{
          background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16,
          overflow: "hidden", boxShadow: "0 1px 3px rgba(20,47,29,.05)",
        }}
      >
        {filas.map((f, i) => {
          const vacia = f.puestos === 0;
          const abierto = abierta === f.id;
          return (
            <div
              key={f.id}
              style={{
                borderBottom: i === filas.length - 1 && !abierto ? "none" : "1px solid #eef3f0",
              }}
            >
            {/* La fila entera abre: el número por sí solo no dice de qué se
                compone, y «3 carnes» sin saber cuáles no se puede juzgar. Las
                vacías no abren — no hay nada que enseñar. */}
            <button
              type="button"
              disabled={vacia}
              onClick={() => setAbierta((a) => (a === f.id ? null : f.id))}
              aria-expanded={abierto}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", border: "none", background: "none",
                cursor: vacia ? "default" : "pointer", fontFamily: "inherit", textAlign: "left",
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
              {!vacia && (
                <span
                  style={{
                    flexShrink: 0, color: "#9ab0a1", display: "flex",
                    transform: abierto ? "rotate(90deg)" : "none",
                    transition: "transform .22s cubic-bezier(.2,.9,.3,1)",
                  }}
                >
                  <ChevronRight size={15} strokeWidth={2.6} />
                </span>
              )}
            </button>

            {abierto && (
              <div style={{ padding: "8px 10px 10px", background: "#f1f6f3" }}>
                {/* Cabecera de las tres columnas. Los números van sin letra
                    pegada —cabían mal y ensuciaban— así que la letra vive aquí
                    arriba, una vez, con el color de su arco. */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 0 2px" }}>
                  <span style={{ flex: 1, minWidth: 0 }} />
                  <span style={{ flexShrink: 0, display: "flex", gap: 4 }}>
                    {MACROS.map((m) => (
                      <span
                        key={m.id}
                        style={{ width: 21, textAlign: "right", fontSize: 9, fontWeight: 900, color: m.color, letterSpacing: ".3px" }}
                      >
                        {m.letra}
                      </span>
                    ))}
                  </span>
                </div>

                {f.platos.map((p, n) => {
                  const franja = ICONO_FRANJA[p.comida] ?? ICONO_FRANJA.Comida;
                  const FranjaIcon = franja.Icon;
                  return (
                    <div
                      key={`${p.id}-${p.dia}-${p.comida}-${n}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "8px 0",
                        borderTop: "1px solid #dfe9e3",
                      }}
                    >
                      {/* El día como en Compra: la inicial arriba y el número
                          debajo. Ocupa la mitad que «Miércoles · cena» y se lee
                          igual de rápido — mejor, porque todos miden lo mismo y
                          se alinean en columna. */}
                      <span
                        style={{
                          width: 24, flexShrink: 0, borderRadius: 8, padding: "3px 0",
                          background: "#fff", border: "1px solid #e0eae3",
                          display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1,
                        }}
                      >
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#9ab0a1" }}>
                          {LETRA_DIA[p.dia] ?? String(p.dia).slice(0, 1)}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 900, color: VERDE, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                          {calendarDayNumber(p.dia, fechas) ?? ""}
                        </span>
                      </span>

                      <span style={{ flexShrink: 0, color: franja.color, display: "flex" }}>
                        <FranjaIcon size={14} strokeWidth={2.4} />
                      </span>

                      {/* Una línea y a lo que quepa. Los nombres largos partían
                          la fila en tres y la tabla se leía como un párrafo. */}
                      <span
                        style={{
                          flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: INK,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                        title={p.nombre}
                      >
                        {p.nombre}
                      </span>

                      {/* Los gramos, en columnas fijas y con el color de su arco
                          en el anillo: así se sabe cuál es cuál sin leyenda. */}
                      <span style={{ flexShrink: 0, display: "flex", gap: 4, fontVariantNumeric: "tabular-nums" }}>
                        {MACROS.map((m) => (
                          <span
                            key={m.id}
                            style={{
                              width: 21, textAlign: "right", fontSize: 10.5, fontWeight: 900,
                              color: p[m.id] == null ? "#c2cfc7" : m.color,
                            }}
                          >
                            {p[m.id] == null ? "–" : Math.round(p[m.id])}
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}

                <p style={{ margin: "9px 0 0", fontSize: 9.5, fontWeight: 700, color: "#9ab0a1", lineHeight: 1.35 }}>
                  Gramos por ración.
                </p>
              </div>
            )}
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
function BaldosaMando({ Icon, label, color, tinte, onClick, badge = null, orden = 0, apagada = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={apagada}
      aria-disabled={apagada}
      // Entran en cascada, una detrás de otra. A la vez serían una fila que ya
      // estaba; así se leen como cinco cosas y da tiempo a ver cuáles son.
      className="mp-press mp-baldosa-entra"
      style={{
        "--d": `${orden * 55}ms`,
        // Caben CUATRO, siempre cuatro. Antes se repartían el ancho que
        // hubiera, así que cada baldosa que se añadía encogía a todas las
        // demás y con cinco ya se leían apretadas. Ahora la quinta no encoge
        // a nadie: se sale por el borde y la fila hace scroll, que además
        // asoma media baldosa y dice que hay más.
        //
        // El gap de 2px entre cuatro son 6px que hay que descontar.
        flex: "0 0 auto", width: "calc((100% - 6px) / 4)", minWidth: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        background: "none", border: "none", padding: 0,
        cursor: apagada ? "default" : "pointer", fontFamily: "inherit",
        // Apagada se ve, pero en gris: dice que el Batch está ahí para cuando
        // pongas dos platos que compartan olla o uno que se deje hecho.
        opacity: apagada ? 0.42 : 1,
        filter: apagada ? "grayscale(1)" : "none",
      }}
    >
      <span
        style={{
          position: "relative",
          width: 46, height: 46, borderRadius: 15,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: tinte, border: "2px solid transparent",
          boxShadow: "0 2px 8px -4px rgba(20,47,29,.18)",
        }}
      >
        <Icon size={19} color={color} strokeWidth={2.2} />
        {badge != null && (
          <span
            style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999,
              background: color, color: "#fff",
              fontSize: 11, fontWeight: 900, fontVariantNumeric: "tabular-nums",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid var(--pz-fondo-suave, #f4f8f5)",
            }}
          >
            {badge}
          </span>
        )}
      </span>
      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--pz-tinta-suave, #5a7066)", letterSpacing: "-.1px" }}>
        {label}
      </span>
    </button>
  );
}

/**
 * "Lo que tengo en casa".
 *
 * ── No es un inventario aparte ────────────────────────────────────────────
 * Escribe en la MISMA despensa que cruza la lista de la compra, así que en
 * cuanto añades algo, lo que la semana ya pedía se va solo a "Ya en casa".
 * Por eso aquí no hay nada que imputar a mano: solo decir qué tienes.
 *
 * ── Sin cantidades, a propósito ───────────────────────────────────────────
 * Para empezar lo que importa es si algo está o no está. La cantidad es el
 * siguiente escalón y arrastra el cruce parcial de `shoppingBuilder`, que hoy
 * tacha la línea entera: pedir "medio kilo" y tener 200 g daría la compra por
 * cubierta.
 */
/**
 * La miniatura del ingrediente. Siempre hay dibujo: `ingredientThumbSrc` cae al
 * arte del pasillo cuando no conoce el nombre, y solo si esa imagen tampoco
 * carga aparece el icono neutro. Mismo lenguaje que la ficha de la despensa.
 */
function Miniatura({ name, size = 38, soloSiSeConoce = false }) {
  // Se guarda QUÉ imagen falló y no un sí/no: en la barra de búsqueda el
  // nombre cambia con cada tecla, y un booleano se quedaría pegado en "rota"
  // desde el primer nombre que no tuviera dibujo.
  const [fallida, setFallida] = useState(null);
  // En la barra de búsqueda se usa el resolutor ESTRICTO: `ingredientThumbSrc`
  // cae al dibujo del pasillo cuando no reconoce el nombre, y ahí eso mentiría
  // —saldría una foto de verduras para cualquier cosa mal escrita—. Aquí no
  // salir nada es la respuesta correcta: no te hemos entendido.
  const src = soloSiSeConoce
    ? (name?.trim().length >= 3 ? ingredientImageSrc(name) : null)
    : ingredientThumbSrc(name);
  if (!src || fallida === src) {
    if (soloSiSeConoce) return null;
    return (
      <span style={{ width: size, height: size, borderRadius: 10, background: "#eef4ef", flexShrink: 0, display: "grid", placeItems: "center" }}>
        <Salad size={Math.round(size * 0.45)} color={VERDE} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFallida(src)}
      style={{ width: size, height: size, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#eef4ef" }}
    />
  );
}

/** Las mismas cinco que la despensa de verdad, para que el stock case. */
const UNIDADES = ["ud", "g", "kg", "ml", "l"];

const campoBase = {
  boxSizing: "border-box", height: 32, borderRadius: 10,
  border: "1.5px solid #cfe0d6", background: "#fff",
  fontFamily: "inherit", color: INK, outline: "none",
  fontSize: 13, fontWeight: 800,
};

/**
 * La cantidad de una línea guardada: se lee como una píldora y se edita al
 * tocarla, sin salir del panel. Solo escribe al soltar el foco —o con Enter—
 * para no mandar un guardado por cada tecla.
 */
function CantidadDeLinea({ item, onQty, pool, onEditarFicha }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [unidad, setUnidad] = useState(item.unit ?? "ud");

  // Si la línea vino del pool se LEE en su medida —tres cabezas, no ciento
  // ochenta gramos— aunque por debajo se guarden los gramos, que es lo que
  // necesita el cruce con la compra. Y al tocarla se abre su ficha.
  //
  // Dos columnas fijas: el envase y el peso. Lo escrito a mano no tiene
  // envase que declarar, así que su cantidad cae en la columna del peso y la
  // primera se queda en blanco — es lo que hace que todas las líneas se
  // alineen aunque unas sepan más de sí mismas que otras.
  const envase = pool?.envase ?? null;
  const peso = pool ? pool.peso : formatStockQty(item.qty ?? 1, item.unit ?? "ud");

  const guardar = () => {
    setEditando(false);
    const n = Number(String(valor).replace(",", "."));
    if (!(n > 0)) return;
    if (n !== Number(item.qty) || unidad !== item.unit) onQty?.(item.id, n, unidad);
  };

  const abrir = () => {
    if (pool && onEditarFicha) { onEditarFicha(pool); return; }
    setValor(String(item.qty ?? 1));
    setUnidad(item.unit ?? "ud");
    setEditando(true);
  };

  if (!editando) {
    // Anchos FIJOS, no al contenido: una píldora que mide lo que dice deja el
    // borde izquierdo distinto en cada línea, y entonces no hay columna que
    // leer. Con el ancho clavado, «1 paquete» y «3 cabezas» empiezan y acaban
    // en el mismo sitio en todas las filas.
    const columna = (texto, ancho, etiquetaAria) => (
      <button
        type="button"
        onClick={abrir}
        disabled={!texto}
        aria-label={texto ? etiquetaAria : undefined}
        aria-hidden={texto ? undefined : true}
        tabIndex={texto ? undefined : -1}
        style={{
          // Alto CLAVADO, no al contenido: la columna vacía no tiene texto que
          // la estire, así que sin esto se quedaba 8px más abajo que su pareja
          // y la fila entera se leía torcida.
          boxSizing: "border-box", width: ancho, height: 23, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          padding: "0 6px", borderRadius: 999,
          // La columna vacía sigue ocupando su sitio: es lo que mantiene el
          // peso siempre en la segunda, tenga envase o no.
          background: texto ? "#f0f6f2" : "transparent",
          border: texto ? "1px solid #dfeae3" : "1px solid transparent",
          cursor: texto ? "pointer" : "default",
          fontSize: 11.5, fontWeight: 900, color: VERDE, fontFamily: "inherit",
          fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", textAlign: "center",
        }}
      >
        {texto ?? ""}
      </button>
    );
    const nombre = item.ingredientName ?? item.name;
    return (
      <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {columna(envase, 86, `Cambiar cuántos ${nombre} tienes`)}
        {columna(peso, 62, `Cambiar cuánto pesa ${nombre}`)}
      </span>
    );
  }

  // Número Y unidad: cambiar "2 kg" por "500 g" son las dos cosas a la vez, y
  // con solo el número había que borrar la línea y volver a escribirla.
  return (
    <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) guardar();
    }}>
      <input
        autoFocus
        value={valor}
        inputMode="decimal"
        aria-label="Cantidad"
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") guardar(); if (e.key === "Escape") setEditando(false); }}
        style={{ ...campoBase, width: 52, height: 28, textAlign: "center", padding: "0 4px" }}
      />
      <select
        value={unidad}
        onChange={(e) => setUnidad(e.target.value)}
        aria-label="Unidad"
        style={{ ...campoBase, width: 54, height: 28, padding: "0 2px", cursor: "pointer" }}
      >
        {UNIDADES.map((u) => <option key={u} value={u}>{u === "l" ? "L" : u}</option>)}
      </select>
    </span>
  );
}

/**
 * Lo que casi todo el mundo tiene en casa, para no tener que escribirlo.
 *
 * Una despensa vacía pide quince gestos antes de servir para nada, y los
 * quince son los mismos en todas las casas: cebolla, ajo, patatas, arroz,
 * leche. El pool los pone a un toque.
 *
 * ── Cada uno en la unidad en la que lo tienes ─────────────────────────────
 * El ajo no se tiene en gramos, se tiene en CABEZAS. El arroz no se tiene a
 * peso, se tiene en paquetes de medio kilo. Los huevos van de uno en uno.
 * Preguntar «¿cuántos gramos de ajo?» es pedir una cuenta que nadie tiene
 * hecha, así que cada entrada trae su propia palabra y el factor que la lleva
 * a lo que se guarda de verdad — `canon`, que acaba siendo g, ml o ud.
 *
 * Por eso no salen de `defaultPackFor`: esa función sabe de envases y aquí la
 * mitad no vienen en envase. Son doce nombres elegidos a mano, y sus doce
 * unidades son doce decisiones, no valores que se puedan deducir.
 *
 * ── Y se declara: tocar no mete nada ──────────────────────────────────────
 * Tocar abre la ficha para decir cuántos tienes. Meterlo de una con una
 * cantidad inventada es justo el dato malo que luego descuadra la compra, y
 * encima sin que te enteres de que lo has dicho.
 */
const POOL = [
  { nombre: "Cebolla", n: 2, medida: "ud" },
  { nombre: "Ajo", n: 1, medida: "cabeza" },
  { nombre: "Patata", n: 1, medida: "kg" },
  { nombre: "Tomate", n: 4, medida: "ud" },
  { nombre: "Zanahoria", n: 3, medida: "ud" },
  { nombre: "Limón", n: 2, medida: "ud" },
  { nombre: "Huevos", n: 6, medida: "ud" },
  { nombre: "Leche", n: 1, medida: "brick" },
  { nombre: "Arroz", n: 1, medida: "paquete" },
  { nombre: "Macarrones", n: 1, medida: "paquete" },
  { nombre: "Lentejas", n: 1, medida: "paquete" },
  { nombre: "Aceite de oliva", n: 1, medida: "botella" },
];

/** La clave con la que un nombre del pool queda guardado en la despensa. */
const CLAVES_POOL = new Map();
function claveDePool(nombre) {
  if (!CLAVES_POOL.has(nombre)) {
    const [p] = normalizePantryInput(nombre);
    CLAVES_POOL.set(nombre, p?.normalized ?? nombre.toLowerCase());
  }
  return CLAVES_POOL.get(nombre);
}

/**
 * Cómo se lee una línea ya guardada: «3 cabezas», no «180 g».
 *
 * Se guarda en g, ml o ud —lo exige el cruce con la compra— pero eso no es
 * como se piensa en el ajo. Se busca la medida con la que se metió, y si los
 * gramos guardados son un múltiplo limpio de lo que vale una, se cuenta en
 * ellas. Si no lo son, se lee en crudo: 750 g de arroz son 750 g, y decir
 * «1,5 paquetes» sería redondear un dato que tú diste exacto.
 */
const POOL_POR_CLAVE = new Map();

/**
 * Cómo se lee una línea guardada, y cómo se vuelve a abrir su ficha.
 *
 * Vale para CUALQUIER ingrediente, no solo para los doce del pool: la tabla de
 * medidas conoce el catálogo entero por familias, así que la quinoa que
 * escribiste a mano se lee igual que el arroz que tocaste. Antes esto miraba
 * solo el pool y por eso lo escrito se leía en crudo — «500 g» — mientras lo
 * tocado decía «1 paquete».
 *
 * Se guarda en g, ml o ud —lo exige el cruce con la compra— pero eso no es
 * como se piensa en el ajo. Si lo guardado es un múltiplo limpio de lo que
 * vale una medida, se cuenta en ellas. Si no, se lee en crudo: 750 g de arroz
 * son 750 g, y decir «1,5 paquetes» sería redondear un dato que diste exacto.
 */
function poolDe(item, elegidas = {}) {
  if (POOL_POR_CLAVE.size === 0) {
    for (const p of POOL) POOL_POR_CLAVE.set(claveDePool(p.nombre), p);
  }
  const nombre = item?.ingredientName ?? item?.name;
  if (!nombre) return null;
  const clave = item.ingredientNormalized;
  const base = POOL_POR_CLAVE.get(clave) ?? { nombre, n: 1 };

  const medidas = medidasDe(nombre);
  const medida = medidaPorId(medidas, elegidas[clave] ?? base.medida ?? medidas[0].id);
  // Si algo la ha tocado por otro lado —un ticket, la compra— y ahora son
  // mililitros de una cosa que contábamos en unidades, se lee en crudo.
  if (item.unit !== medida.base) return null;
  const n = Number(item.qty) / medida.por;
  if (!(n > 0) || Math.abs(n - Math.round(n)) > 0.01) return null;
  const veces = Math.round(n);

  return {
    ...base,
    nombre,
    medida: medida.id,
    n: veces,
    // La línea dice TODO lo declarado, y en DOS trozos: cuántos envases y
    // cuánto pesa cada uno. El envase solo no basta —un paquete es de medio
    // kilo o de kilo— y el peso solo tampoco: 500 g no te dicen si te queda un
    // paquete o medio. Iban juntos en una píldora con un punto en medio, y un
    // punto no es una columna: así cada mitad cae en la suya y las líneas se
    // leen en vertical. Con una unidad suelta no hay peso que añadir: «2 ud ·
    // 2 ud» sobra, así que la columna del peso se queda vacía.
    envase: UNIDAD_SUELTA.has(medida.id)
      ? formatStockQty(item.qty, medida.base)
      : `${veces} ${veces === 1 ? medida.id : enPlural(medida.id)}`,
    peso: UNIDAD_SUELTA.has(medida.id)
      ? null
      : formatStockQty(medida.por, medida.base),
  };
}

function FichaDelPool({ item, inicial = null, onCancelar, onConfirmar }) {
  // En qué se puede medir ESTO. El ajo en cabezas o dientes; el arroz en
  // paquetes o a peso. La lista entera del súper ofrecía "brick de ajos".
  const medidas = useMemo(() => medidasDe(item.nombre), [item.nombre]);

  const [n, setN] = useState(String(inicial ?? item.n));
  const [medidaId, setMedidaId] = useState(
    medidas.some((m) => m.id === item.medida) ? item.medida : medidas[0].id,
  );
  const medida = medidaPorId(medidas, medidaId);

  // El contenido solo existe para las medidas ABIERTAS. Se guarda aparte del
  // id para que cambiar de paquete a bolsa no borre lo que hubieras escrito.
  const [tam, setTam] = useState(null);
  const [unidadTam, setUnidadTam] = useState(null);

  const abierta = medida.abierto === true;
  const unidades = medida.unidades ?? [];
  // Por defecto, el contenido se enseña en la unidad más pequeña que la
  // medida admite: un paquete son "500 g", no "0,5 kg".
  const unidadActual = unidadTam && unidades.includes(unidadTam) ? unidadTam : unidades[0];
  const porDefecto = unidadActual === "kg" || unidadActual === "l" ? medida.por / 1000 : medida.por;
  const tamTexto = tam ?? String(porDefecto);

  const nNum = Number(n) || 0;
  const tamNum = Number(String(tamTexto).replace(",", ".")) || 0;
  const porUnidad = abierta
    ? tamNum * (unidadActual === "kg" || unidadActual === "l" ? 1000 : 1)
    : medida.por;
  const total = nNum * porUnidad;

  const campo = {
    ...campoBase, height: 32, padding: "0 4px", textAlign: "center",
    minWidth: 0, flexShrink: 0,
  };

  return (
    <div
      style={{
        background: "#fff", border: `1.5px solid ${VERDE}`, borderRadius: 16,
        padding: 12, marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Miniatura name={item.nombre} size={40} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, color: INK, lineHeight: 1.2 }}>
          {item.nombre}
        </span>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cancelar"
          style={{
            width: 24, height: 24, borderRadius: 999, padding: 0, flexShrink: 0,
            border: "none", background: "#f0f4f1", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={13} color="#7a9485" strokeWidth={2.6} />
        </button>
      </div>

      {/* Dos huecos, o cuatro si la medida no sabe lo que vale. Una cabeza de
          ajo son 60 g y no hay que preguntarlo; un paquete de arroz es de medio
          kilo o de kilo según cuál cojas, y ahí sí. Y con dos, el desplegable
          no se estira hasta el borde: prometería un hueco que no existe. */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 12 }}>
        <input
          value={n}
          onChange={(e) => setN(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
          inputMode="numeric"
          aria-label="Cuántos"
          style={{ ...campo, width: 46, fontWeight: 900 }}
        />
        <Picker
          value={medidaId}
          options={medidas.map((m) => ({
            value: m.id,
            label: m.id === "l" ? "L" : nNum === 1 ? m.id : enPlural(m.id),
          }))}
          onChange={(v) => { setMedidaId(v); setTam(null); setUnidadTam(null); }}
          ariaLabel="Medida"
          flex={abierta ? 1 : undefined}
          minWidth={abierta ? 74 : undefined}
          width={abierta ? undefined : 104}
        />
        {abierta && (
          <>
            {/* Aquí iba un "de" que leía bonito —"1 paquete DE 500 g"— y se
                comía 21 px de los 262 que hay: con él, la fila pedía 271 y se
                salía por la derecha en cuanto la medida tenía nombre largo. Lo
                que agrupa ya es el espacio. */}
            <input
              value={tamTexto}
              onChange={(e) => setTam(e.target.value)}
              inputMode="decimal"
              aria-label="Contenido"
              style={{ ...campo, width: 44 }}
            />
            {unidades.length > 1 ? (
              <Picker
                value={unidadActual}
                options={unidades.map((u) => ({ value: u, label: u === "l" ? "L" : u }))}
                onChange={setUnidadTam}
                ariaLabel="Unidad"
                width={48}
                align="center"
              />
            ) : (
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#5a7066", flexShrink: 0, width: 20 }}>
                {unidadActual === "l" ? "L" : unidadActual}
              </span>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        className="mp-press"
        disabled={!(total > 0)}
        onClick={() => onConfirmar(total, medida.base, medidaId)}
        style={{
          width: "100%", height: 36, borderRadius: 11, border: "none",
          background: total > 0 ? VERDE : "#c8d9ce", color: "#fff",
          cursor: total > 0 ? "pointer" : "default",
          fontSize: 13, fontWeight: 800, fontFamily: "inherit",
        }}
      >
        {inicial == null ? "Lo tengo" : "Guardar"}
      </button>
    </div>
  );
}

function PanelDespensa({ despensa, onAnadir, onQuitar, onQty }) {
  const [texto, setTexto] = useState("");
  const [pendiente, setPendiente] = useState(null);
  // La medida en la que cada cosa se declaró, por clave de ingrediente. No va
  // a la despensa —allí solo caben cantidad y unidad— así que vive aquí para
  // que la línea siga diciendo «cabezas» y no «180 g».
  const [medidaElegida, setMedidaElegida] = useState({});
  const ingredientes = (despensa ?? []).filter((i) => (i.itemType ?? "ingredient") !== "cooked_dish");
  const escribiendo = texto.trim().length > 0;

  // Lo que ya está guardado sale del pool: la fila encoge conforme llenas la
  // despensa, que es la señal de que vas avanzando. Si se quedaran todos,
  // tocar uno dos veces duplicaría la cantidad sin decirlo.
  const yaPuesto = useMemo(
    () => new Set(ingredientes.map((i) => i.ingredientNormalized).filter(Boolean)),
    [ingredientes],
  );
  // Se compara por la clave NORMALIZADA, la misma con la que se guarda: "Aceite
  // de oliva" se archiva como `aceite_oliva` y "Huevos" como `huevo`, así que
  // cotejar los nombres tal cual no habría casado ni uno de los dos.
  const pool = useMemo(() => POOL.filter((p) => !yaPuesto.has(claveDePool(p.nombre))), [yaPuesto]);

  // Escribir y tocar el pool acaban en el MISMO sitio: la ficha. Antes lo
  // escrito iba por su propia fila de cantidad+unidad, así que «quinoa» —que
  // es pasta a todos los efectos— pedía gramos mientras «arroz» pedía
  // paquetes. La tabla de medidas sabe lo mismo de los dos; lo único que
  // cambiaba era por dónde habías entrado.
  const enviar = (e) => {
    e?.preventDefault?.();
    const t = texto.trim();
    if (!t) return;
    const [parsed] = normalizePantryInput(t);
    const nombre = parsed?.raw ?? t;
    setPendiente({ nombre, n: 1, medida: medidasDe(nombre)[0].id });
    setTexto("");
  };

  return (
    <>
      <form onSubmit={enviar} style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, minWidth: 0,
            height: 38, padding: "0 11px", borderRadius: 11,
            background: "#fff", border: `1.5px solid ${escribiendo ? VERDE : "#dbe7df"}`,
            transition: "border-color .15s ease",
          }}
        >
          <Search size={15} color={escribiendo ? VERDE : "#9ab0a1"} style={{ flexShrink: 0 }} />
          {/* El input va a 16px porque por debajo iOS hace zoom al enfocar; lo
              que se encoge es el placeholder, con su propia regla. */}
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busca un ingrediente"
            className="mp-despensa-input"
            style={{
              flex: 1, border: "none", background: "transparent", outline: "none",
              fontSize: 16, color: INK, fontFamily: "inherit", minWidth: 0,
            }}
          />
          <Miniatura name={texto} size={26} soloSiSeConoce />
        </div>

        {/* Aquí había una fila de cantidad+unidad propia de lo escrito, y era
            la que hacía que «quinoa» y «arroz» se comportaran distinto. Ahora
            el Enter —o el botón— abre la misma ficha que el pool. */}
        {escribiendo && (
          <button
            type="submit"
            className="mp-press"
            style={{
              width: "100%", height: 32, borderRadius: 10, marginTop: 8, padding: 0,
              border: "none", cursor: "pointer", background: VERDE, color: "#fff",
              fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <Plus size={15} strokeWidth={3} />
            Añadir «{texto.trim()}»
          </button>
        )}
      </form>

      {/* La ficha de declaración, en el hueco del pool. Sustituye a la fila en
          vez de abrirse encima: es la misma pregunta —qué metes— un paso más
          adelante, y una hoja flotante por tocar un chip sería un modal cada
          dos gestos. */}
      {!escribiendo && pendiente && (
        <FichaDelPool
          item={pendiente}
          inicial={pendiente.editando?.n ?? null}
          onCancelar={() => setPendiente(null)}
          onConfirmar={(qty, base, medidaId) => {
            // La MISMA ficha da de alta y corrige. Lo único que cambia es a
            // dónde va el número: a una línea nueva o a la que ya existe.
            //
            // La medida elegida viaja en el estado del panel, no en la
            // despensa: `setPantryItemQty` no guarda más que cantidad y
            // unidad, así que la palabra («cabezas») se vuelve a deducir al
            // leer. Recordarla aquí es lo que hace que reabrir la ficha te
            // devuelva a la medida en la que lo dijiste.
            setMedidaElegida((m) => ({ ...m, [claveDePool(pendiente.nombre)]: medidaId }));
            if (pendiente.editando) onQty?.(pendiente.editando.id, qty, base);
            else onAnadir(pendiente.nombre, qty, base);
            setPendiente(null);
          }}
        />
      )}

      {/* El pool. Desaparece mientras escribes —entonces la respuesta está en
          la barra, no aquí— y también cuando ya lo tienes todo puesto. */}
      {!escribiendo && !pendiente && pool.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: "#9ab0a1", letterSpacing: ".3px", margin: "0 2px 7px" }}>
            LO DE SIEMPRE
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pool.map((p) => (
              <button
                key={p.nombre}
                type="button"
                className="mp-press"
                onClick={() => setPendiente(p)}
                aria-label={`Añadir ${p.nombre}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 9px 3px 3px", borderRadius: 999,
                  background: "#fff", border: "1px solid #e0eae3", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Miniatura name={p.nombre} size={24} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: INK, whiteSpace: "nowrap" }}>
                  {p.nombre}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {ingredientes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px" }}>
          <Package size={32} color="#cdd8d0" />
          <p style={{ margin: "8px 0 0", fontSize: 12.5, fontWeight: 700, color: "#9ab0a1" }}>
            Nada guardado todavía
          </p>
        </div>
      ) : (
        // Sin card: el inventario NO es un bloque aparte, es lo que hay. La
        // caja blanca lo separaba del buscador de arriba como si fuera otra
        // cosa, y son la misma: lo que escribes acaba ahí.
        <div>
          {ingredientes.map((i, n) => (
            <div
              key={i.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderBottom: n === ingredientes.length - 1 ? "none" : "1px solid #eef3f0",
              }}
            >
              <Miniatura name={i.ingredientName ?? i.name} />
              {/* El nombre arriba y las cantidades debajo. En una sola línea
                  las dos columnas se comían el nombre: en 288px de panel,
                  «Aceite de oliva» se quedaba en «Aceite d…» para que cupiera
                  «1 botella». Partirlo en dos les da sitio a las dos cosas y,
                  de paso, alinea las píldoras de todas las filas en la misma
                  vertical, que es justo lo que se pedía. */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
                <span style={{ maxWidth: "100%", fontSize: 12.5, fontWeight: 800, color: INK, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.ingredientName ?? i.name}
                </span>
                {/* Lo del pool se corrige en su ficha —la misma del alta, con el
                    contador de paquetes Y los gramos—. Lo escrito a mano no tiene
                    ficha, así que se edita en el sitio, en la unidad en la que
                    esté guardado. */}
                <CantidadDeLinea
                  item={i}
                  onQty={onQty}
                  pool={poolDe(i, medidaElegida)}
                  onEditarFicha={(p) => setPendiente({ ...p, editando: { id: i.id, n: p.n } })}
                />
              </div>
              <button
                type="button"
                onClick={() => onQuitar(i.id)}
                aria-label={`Quitar ${i.ingredientName ?? i.name}`}
                style={{
                  width: 22, height: 22, borderRadius: 999, padding: 0, flexShrink: 0,
                  border: "none", background: "transparent", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={13} color="#9ab0a1" strokeWidth={2.6} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Aquí vivía un «Usar lo que tengo al rellenar». Se ha ido porque no
          era una pregunta: nadie apunta lo que tiene en casa para pedir luego
          que no se use. Rellenar tira SIEMPRE de la despensa. */}
    </>
  );
}

/**
 * "El domingo".
 *
 * ── La sesión no se configura: se mira ────────────────────────────────────
 * Sale de lo que ya has puesto en el tablero (`sesionDeBases`, la misma que
 * pinta la pestaña de Cocina) y se recalcula sola con cada plato. Lo único que
 * se DECIDE aquí es cuánto tiempo tienes, que cambia cada semana —por eso vive
 * en este menú y no en tu perfil—, y si quieres que el relleno arrime hacia
 * esas bases.
 *
 * Los minutos que se comparan son los ACTIVOS, no los de reloj: una olla de
 * legumbre son nueve horas de fuego y veinte minutos tuyos, y lo que decide si
 * el domingo sale es lo segundo.
 */
/**
 * El color de cada base, el de su grupo en el selector de tandas: sofritos y
 * salsas en rojo, lo del horno en naranja, ollas y cazuelas en teal.
 */
const COLOR_DE_BASE = (clave) => (
  ["sofrito", "salsa_tomate", "bechamel", "pesto"].includes(clave) ? "#c0392b"
    : ["verdura_asada", "patatas_asadas"].includes(clave) ? NARANJA
      : "#2e7d75"
);

/**
 * El Batch Cooking de la pizarra.
 *
 * Arriba el tiempo: cuánto tienes el día de la tanda (se arrastra) y cuánto
 * te lleva lo que sale del tablero (se lee). Debajo, las bases que salen de
 * los platos puestos, cada una con cuántos platos la usan (×2, ×3…). Nada se
 * pide aquí: las bases se deducen de lo que has puesto.
 */
function PanelTanda({ data, setData, sesion }) {
  const bases = sesion?.bases ?? [];
  return (
    <>
      <TiempoDeTanda
        presupuesto={minutosDeTanda(data)}
        invertido={sesion?.minutosActivosTotales ?? 0}
        onPresupuesto={setData ? (v) => setData((d) => ({ ...d, tandaMinutos: v })) : null}
      />
      <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, padding: "11px 12px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", letterSpacing: ".3px", marginBottom: 9 }}>
          DEJARÁS HECHO
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {bases.map((b) => {
            const clave = claveDeBase(b.base);
            const ui = BASES_UI[clave] ?? { etiqueta: b.base.name, foto: clave };
            const color = COLOR_DE_BASE(clave);
            const arte = ingredientThumbSrc(ui.foto);
            return (
              <span
                key={b.base.id}
                title={`${b.huecos.length} platos · ${enHoras(b.minutosActivos)}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 10px 4px 4px", borderRadius: 999,
                  background: `${color}12`, border: `1px solid ${color}2e`,
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 999, overflow: "hidden", flexShrink: 0,
                  background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {arte
                    ? <img src={arte} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <CookingPot size={14} color={color} />}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: INK, whiteSpace: "nowrap" }}>{ui.etiqueta}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color }}>×{b.huecos.length}</span>
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * Las seis de serie, con el icono de Núcleo que ya las representa en la app
 * (`REQUIRED_APPLIANCE_ICONS`, el de "¿Cómo se prepara?") y el color de su
 * método (`APPLIANCE_COLORS`). Solo estas seis: son las que el generador sabe
 * aprovechar, y lo que la casa tuviera en `customKitchenTools` se respeta sin
 * editarse aquí, igual que en el onboarding.
 *
 * La olla rápida va en verde y no en el gris de su método: en una rejilla de
 * colores, la única gris se leía como apagada antes de tocarla.
 */
const ELECTRODOMESTICOS = [
  { id: "Airfryer", color: APPLIANCE_COLORS.airfryer },
  { id: "Horno", color: APPLIANCE_COLORS.horno },
  { id: "Microondas", color: APPLIANCE_COLORS.microondas },
  { id: "Olla rápida", color: "#16a34a" },
  { id: "Thermomix", color: APPLIANCE_COLORS.thermomix },
  { id: "Vaporera", color: APPLIANCE_COLORS.vaporera },
];

/**
 * Qué hay en la cocina. Escribe en `data.kitchenTools`, lo mismo que el perfil
 * y el onboarding: con olla rápida la legumbre son 25 minutos y no 60, y eso
 * cambia la receta que ves y lo que dura el Batch.
 *
 * Iconos y no ilustraciones: seis fotos grandes hacían del paso una pantalla
 * entera, y aquí es una pregunta rápida dentro de un pop-up.
 */
function Electrodomesticos({ data, setData }) {
  const trastos = data?.kitchenTools ?? [];
  const alternar = (t) => setData?.((d) => ({
    ...d,
    kitchenTools: (d.kitchenTools ?? []).includes(t)
      ? (d.kitchenTools ?? []).filter((v) => v !== t)
      : [...(d.kitchenTools ?? []), t],
  }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
      {ELECTRODOMESTICOS.map((a, i) => {
        const sel = trastos.includes(a.id);
        const Icono = REQUIRED_APPLIANCE_ICONS[a.id] ?? CookingPot;
        return (
          <button
            key={a.id}
            type="button"
            className="mp-rise mp-press"
            onClick={() => alternar(a.id)}
            aria-pressed={sel}
            style={{
              "--d": `${i * 35}ms`,
              position: "relative",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7,
              height: 88, padding: "0 4px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
              border: `1.5px solid ${sel ? a.color : "#e3ebe6"}`,
              background: sel ? `${a.color}14` : "#fff",
              boxShadow: sel ? `0 6px 16px -8px ${a.color}88` : "0 1px 2px rgba(20,47,29,.04)",
              transition: "background .16s ease, border-color .16s ease, box-shadow .16s ease",
            }}
          >
            <span
              style={{
                width: 42, height: 42, borderRadius: 14,
                background: sel ? a.color : `${a.color}1c`,
                color: sel ? "#fff" : a.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .16s ease, color .16s ease",
              }}
            >
              <Icono size={21} strokeWidth={2.2} />
            </span>
            <span style={{
              fontSize: 11.5, fontWeight: 800, lineHeight: 1.1,
              color: sel ? INK : "#3a4a42", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
            }}>
              {a.id}
            </span>
            {sel && (
              <span
                style={{
                  position: "absolute", top: 6, right: 6,
                  width: 17, height: 17, borderRadius: "50%", background: a.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Check size={10} color="#fff" strokeWidth={3.2} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ¿Qué días pones? — semanas enteras arriba, calendario para afinar debajo.
 *
 * Vivía dentro de un panel lateral de la pizarra y ahora es lo PRIMERO que se
 * pregunta, en la hoja de arranque: no tiene sentido enseñar un tablero de
 * siete días para que luego te sobren cuatro. Sigue siendo un componente y no
 * una pantalla porque la respuesta se da tocando, no navegando.
 */
export function SelectorDeDias({ data, onAplicar }) {
  const todayIdx = useMemo(() => todayDayIdx(), []);
  const semanas = useMemo(() => buildCalendarWeeks(MAX_MENU_WEEKS), []);
  const allOffsets = useMemo(() => semanas.map((s) => s.offset), [semanas]);
  const opts = useMemo(() => ({ allOffsets, todayIdx }), [allOffsets, todayIdx]);
  const hoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ── El arrastre ─────────────────────────────────────────────────────────
  // Marcar cinco días a toques son cinco toques, y en un calendario lo natural
  // es barrerlos. Lo que se arrastra se guarda APARTE y se pinta desde ahí:
  // aplicar día a día mientras el dedo se mueve haría que cada `conDiaMarcado`
  // partiera del mismo `data` viejo —React no ha repintado todavía— y los
  // últimos se comerían a los primeros. Al levantar el dedo se pliegan todos
  // de una sobre el mismo objeto y se aplica una sola vez.
  const [pendientes, setPendientes] = useState(null);
  const arrastreRef = useRef(null);

  const clave = (offset, code) => `${offset}|${code}`;

  const pintar = (offset, code, estaMarcado) => {
    const a = arrastreRef.current;
    if (!a) return;
    const k = clave(offset, code);
    if (a.mapa.get(k) === a.modo) return;
    a.mapa.set(k, a.modo);
    void estaMarcado;
    setPendientes(new Map(a.mapa));
  };

  const empezarArrastre = (offset, code, estaMarcado) => {
    // El primer día decide si el barrido pone o quita: si arrancas sobre uno
    // puesto, arrastrar borra. Es lo que hace cualquier selector de rango.
    arrastreRef.current = { modo: !estaMarcado, mapa: new Map() };
    pintar(offset, code, estaMarcado);
  };

  const soltar = () => {
    const a = arrastreRef.current;
    arrastreRef.current = null;
    if (!a || a.mapa.size === 0) { setPendientes(null); return; }
    let next = data;
    for (const [k, on] of a.mapa) {
      const [off, code] = k.split("|");
      next = conDiaMarcado(next, Number(off), code, on, opts);
    }
    setPendientes(null);
    onAplicar(next);
  };

  // El dedo no dispara `pointerover` sobre los hermanos: hay que mirar qué hay
  // debajo en cada movimiento.
  const alMover = (e) => {
    if (!arrastreRef.current) return;
    const p = e.touches?.[0] ?? e;
    const el = document.elementFromPoint(p.clientX, p.clientY)?.closest?.("[data-dia]");
    if (!el || el.dataset.pasado === "1") return;
    pintar(Number(el.dataset.offset), el.dataset.dia, el.dataset.marcado === "1");
  };

  const diasDe = (offset) => diasDeSemana(data, offset, todayIdx);

  return (
    <>
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

        {/* El arrastre se escucha en la REJILLA, no en cada día: con el dedo,
            un botón no recibe el `pointerover` de sus hermanos, así que el
            movimiento hay que seguirlo desde arriba y preguntar qué hay
            debajo. `touch-action: none` para que el navegador no interprete el
            barrido como un scroll y se lleve el gesto. */}
        <div
          onPointerMove={alMover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onPointerLeave={soltar}
          style={{
            background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16,
            padding: "14px 10px 10px", touchAction: "none",
          }}
        >
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
                  const k = `${s.offset}|${code}`;
                  // Lo que se está arrastrando manda sobre lo guardado: así el
                  // dedo ve el resultado antes de levantarlo.
                  const marcado = pendientes?.has(k) ? pendientes.get(k) : puestos.has(code);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "center", height: 38 }}>
                      <button
                        type="button"
                        disabled={pasado}
                        data-dia={code}
                        data-offset={s.offset}
                        data-marcado={marcado ? "1" : "0"}
                        data-pasado={pasado ? "1" : "0"}
                        onPointerDown={pasado ? undefined : () => empezarArrastre(s.offset, code, marcado)}
                        style={{
                          width: 30, height: 30, borderRadius: 999, padding: 0, alignSelf: "center",
                          // Tres estados y tres colores, y ninguno se pisa con
                          // otro: lo pasado en gris hundido, hoy en ámbar, lo
                          // puesto en el teal de la casa.
                          border: marcado
                            ? `1.5px solid ${TEAL}`
                            : esHoy ? "1.5px solid #f59e0b" : "1.5px solid transparent",
                          background: pasado
                            ? "#eceff0"
                            : marcado ? `${TEAL}22` : esHoy ? "#fff7e8" : "transparent",
                          color: pasado
                            ? "#b8c4bd"
                            : marcado ? TEAL : esHoy ? "#b45309" : "#3a4a42",
                          // Hoy, además, lleva su anillo cuando está puesto:
                          // sin él, marcarlo lo volvía un día más.
                          boxShadow: esHoy && marcado ? "0 0 0 2px rgba(245,158,11,.45)" : "none",
                          fontSize: 13, fontWeight: esHoy || marcado ? 800 : 600,
                          fontFamily: "inherit",
                          cursor: pasado ? "default" : "pointer",
                          transition: "background .12s ease, color .12s ease, border-color .12s ease",
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
  );
}

/**
 * La hoja con la que arranca una pizarra: «¿qué días?» y un botón.
 *
 * ── Por qué una hoja y no una pantalla ────────────────────────────────────
 * Detrás ya está el tablero, vacío y quieto. Eso es deliberado: la pregunta
 * se hace CON lo que vas a montar delante, no antes de verlo, así que se
 * entiende para qué sirve contestarla. Una pantalla aparte lo habría tapado y
 * habría vuelto a ser el asistente de dos pasos que esto vino a sustituir.
 *
 * ── Y por qué el tablero llega desnudo ────────────────────────────────────
 * Sin avatares y sin baldosas: mientras esta hoja está delante no hay nada
 * que ajustar, y una fila de mandos detrás de un velo solo dice «hay cosas
 * que todavía no puedes tocar». Entran después, con el mismo gesto que cierra
 * la hoja.
 */
const PASOS_ARRANQUE = [
  { id: "dias", titulo: "¿Qué días quieres?" },
  { id: "cocina", titulo: "¿Qué tienes en la cocina?" },
];

export function ArranqueDePizarra({ data, setData, onAplicar, onEmpezar }) {
  // Dos pasos, deslizando: los días y luego los electrodomésticos, que
  // cambian las recetas y los minutos del Batch. Los dos pasos están siempre
  // montados y la hoja mide lo que el más alto —el calendario—: si cambiara
  // de tamaño al pasar de uno a otro, el salto se come el deslizamiento.
  const [paso, setPaso] = useState(0);
  const irA = (n) => setPaso(n);
  const ultimo = paso === PASOS_ARRANQUE.length - 1;
  const actual = PASOS_ARRANQUE[paso];
  // Tres momentos: la hoja, la hoja yéndose, y el montaje. El del medio existe
  // para que no se solapen —la franja entrando mientras la hoja aún está daba
  // un salto— y el tercero para que el hueco entre una cosa y otra no parezca
  // que se ha colgado.
  const [fase, setFase] = useState("hoja");
  const dias = useMemo(() => diasDeSemana(data, 0, todayDayIdx()).length, [data]);
  const saliendo = fase !== "hoja";

  const empezar = () => {
    if (saliendo) return;
    setFase("saliendo");
    // Anidados y no en paralelo: así el anillo se lleva SIEMPRE sus 1,15 s
    // completos desde que aparece. Con dos temporizadores sueltos desde el
    // mismo instante, cualquier retraso en el primero se comía el segundo y el
    // anillo se iba a mitad de llenarse. No es tiempo de carga —el tablero ya
    // está montado debajo— sino el corte entre la pregunta y la respuesta.
    setTimeout(() => {
      setFase("montando");
      setTimeout(onEmpezar, 1150);
    }, 240);
  };

  if (fase === "montando") {
    return (
      <div
        className="mp-arranque-velo"
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(20,47,29,.38)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {/* Un anillo que se llena, sin texto. Una frase pide leerse y esto
            dura poco más de un segundo: para cuando la has leído ya no está.
            El icono de dentro dice lo mismo sin pedir nada. */}
        <div
          style={{
            width: 64, height: 64, borderRadius: 999, background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 18px 44px -14px rgba(20,47,29,.45)",
            position: "relative",
          }}
        >
          <svg width="64" height="64" viewBox="0 0 40 40" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <circle cx="20" cy="20" r="16" fill="none" stroke="#e6efe9" strokeWidth="3" />
            <circle
              className="mp-anillo"
              cx="20" cy="20" r="16" fill="none"
              stroke={VERDE} strokeWidth="3" strokeLinecap="round"
              strokeDasharray="100.5"
            />
          </svg>
          <Sparkles size={22} color={VERDE} strokeWidth={2.4} style={{ position: "relative" }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={saliendo ? "mp-arranque-velo-out" : "mp-arranque-velo"}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(20,47,29,.38)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="¿Qué días pones?"
        className={saliendo ? "mp-arranque-out" : "mp-arranque-in"}
        style={{
          width: "min(340px, 100%)", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
          background: "#f4f8f5", borderRadius: 24, padding: 18,
          boxShadow: "0 28px 70px -20px rgba(20,47,29,.5)",
          boxSizing: "border-box",
        }}
      >
        {/* Sola y centrada. Debajo iba un «Luego rellenas los huecos a mano»
            que explicaba la pantalla siguiente a quien todavía no ha salido de
            esta. El título viaja con su paso (key) y entra deslizando igual. */}
        <div key={actual.id} className="mp-arranque-paso" style={{ textAlign: "center", margin: "0 0 14px" }}>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
            {actual.titulo}
          </p>
          {actual.detalle && (
            <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
              {actual.detalle}
            </p>
          )}
        </div>

        <div style={{ overflow: "hidden", margin: "0 -18px" }}>
          <div
            style={{
              display: "flex", width: `${PASOS_ARRANQUE.length * 100}%`, alignItems: "stretch",
              transform: `translateX(-${(paso * 100) / PASOS_ARRANQUE.length}%)`,
              transition: "transform .38s cubic-bezier(.22,1,.36,1)",
            }}
          >
            {[
              <SelectorDeDias key="dias" data={data} onAplicar={onAplicar} />,
              <Electrodomesticos key="cocina" data={data} setData={setData} />,
            ].map((contenido, i) => (
              <div
                key={PASOS_ARRANQUE[i].id}
                aria-hidden={paso !== i}
                inert={paso !== i}
                style={{
                  width: `${100 / PASOS_ARRANQUE.length}%`, boxSizing: "border-box",
                  paddingLeft: 18, paddingRight: 18,
                  // El paso más bajo se centra en el alto del calendario.
                  display: "flex", flexDirection: "column", justifyContent: "center",
                }}
              >
                {contenido}
              </div>
            ))}
          </div>
        </div>

        {/* Los botones a lo ancho: en el primer paso Siguiente ocupa la fila
            (y se apaga sin días: un tablero de cero huecos es una pantalla en
            blanco); en el segundo, Atrás vacío y Empezar lleno a partes iguales. */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {paso > 0 && (
            <button
              type="button"
              className="mp-press"
              onClick={() => irA(paso - 1)}
              style={{
                flex: 1, height: 46, borderRadius: 15, cursor: "pointer",
                background: "#fff", border: "1.5px solid #cfe0d6", color: VERDE,
                fontSize: 15, fontWeight: 900, fontFamily: "inherit",
              }}
            >
              Atrás
            </button>
          )}
          <button
            type="button"
            className="mp-press"
            disabled={dias === 0}
            onClick={() => (ultimo ? empezar() : irA(paso + 1))}
            style={{
              flex: 1, height: 46, borderRadius: 15,
              border: "none", cursor: dias === 0 ? "default" : "pointer",
              background: dias === 0 ? "#c8d9ce" : VERDE, color: "#fff",
              fontSize: 15, fontWeight: 900, fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {ultimo ? "Empezar" : "Siguiente"}
            {!ultimo && <ArrowRight size={17} strokeWidth={2.8} />}
          </button>
        </div>
      </div>
    </div>
  );
}

const TITULOS = {
  balance: "Cómo va la semana",
  despensa: "En casa",
  tanda: "Batch Cooking",
};

export function PizarraControles({
  data, setData, menuPlan, groups, onRellenar,
  despensa, onAddDespensa, onQuitarDespensa, onQtyDespensa,
  onNuevaPizarra, onVaciar, onFavorito, esFavorito = false,
  tema = "claro", onTema,
}) {
  const [abierto, setAbierto] = useState(null);
  // Qué cara de la fila se ve. Arranca en las ACCIONES porque «Rellenar»
  // vive ahí y es lo que más se toca en un tablero recién montado.
  const [cara, setCara] = useState("acciones");
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);
  const todayIdx = useMemo(() => todayDayIdx(), []);

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

  /**
   * La sesión del domingo, sacada del tablero tal y como está ahora mismo.
   *
   * Se recalcula con cada plato que pones: no hay nada que "guardar" ni que
   * confirmar, porque la tanda no es una decisión aparte sino una lectura de
   * lo que ya has elegido. Los días son los de la semana en curso, que es lo
   * que hace que una base sepa si cabe en la nevera o tiene que congelarse.
   */
  const sesion = useMemo(() => {
    const plan = {};
    for (const g of groups ?? []) {
      if (menuPlan?.[g.id]) plan[g.id] = menuPlan[g.id];
    }
    const opts = {
      dias: diasDe(0),
      comidas: getDayMeals(data),
      metodoDeBase: (b) => selectMethodForRecipe(b, data?.kitchenTools ?? []),
    };
    // Deducido del tablero: las bases que comparten dos platos y los platos
    // que se dejan hechos (ver `tandaDelMenu`). Nadie lo pide con deslizadores.
    return tandaDelMenu(plan, recipeCatalogById, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuPlan, groups, data]);

  // Las bases, que es lo que enseña el panel. Los platos que se dejan hechos
  // siguen contando para la ficha y el tablero, pero aquí no se listan.
  const piezasTanda = sesion.bases.length;
  const hayTanda = piezasTanda > 0;

  // Lo que hay guardado, para la chapa. Los platos cocinados no cuentan: son
  // raciones hechas, no ingredientes, y el panel tampoco los enseña.
  const enDespensa = (despensa ?? []).filter((i) => (i.itemType ?? "ingredient") !== "cooked_dish").length;


  return (
    <>
      <style>{`
        @keyframes mpPizarraPanel {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .mp-pizarra-panel { animation: mpPizarraPanel .24s cubic-bezier(.22,1,.36,1) both; }
        /* El input se queda en 16px —si baja, iOS hace zoom al enfocarlo—, así
           que el que se encoge es el texto de muestra, que a 16 gritaba. */
        .mp-despensa-input::placeholder { font-size: 13px; font-weight: 600; color: #9aa8a0; opacity: 1; }
      `}</style>

      {/* ── Dos caras de la misma fila ───────────────────────────────────
          Lo que HACES con el tablero (rellenar, empezar otro, vaciarlo,
          guardarlo) y lo que lo AJUSTA (balance, despensa, batch) nunca se
          necesitan a la vez: o estás montando la semana o estás haciendo algo
          con ella. Mismo gesto que la fila del menú generado (ControlRow): una
          pestaña fija a la izquierda, y al tocarla una cara se pliega mientras
          la otra crece. Se anima el reparto (`flex-grow`) y NO se desmonta
          ninguna: montarlas al vuelo daría el salto a mitad de animación. */}
      <div style={{ display: "flex", alignItems: "stretch", width: "100%", minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setCara((c) => (c === "acciones" ? "controles" : "acciones"))}
          aria-label={cara === "acciones" ? "Ver los ajustes" : "Ver las acciones"}
          style={{
            flexShrink: 0, width: 38, border: "none", padding: "0 6px", cursor: "pointer",
            background: "transparent", display: "flex", alignItems: "center",
            justifyContent: "center", fontFamily: "inherit",
          }}
        >
          <span
            style={{
              width: 24, height: 24, borderRadius: 999,
              background: "var(--pz-linea, rgba(45,90,61,.1))", color: "var(--pz-verde, #2d5a3d)",
              display: "flex", alignItems: "center", justifyContent: "center",
              // Gira al cambiar de cara: es la única pieza que se queda
              // quieta, así que es la que tiene que decir que hay otra.
              transform: cara === "acciones" ? "none" : "rotate(180deg)",
              transition: "transform .28s cubic-bezier(.2,.9,.3,1)",
            }}
          >
            <ChevronRight size={15} strokeWidth={2.8} />
          </span>
        </button>

        {/* Una ventana, y dentro un carril con las DOS caras puestas.
            Antes se cambiaba desmontando una y montando la otra: la que se iba
            desaparecía de golpe y la que llegaba entraba a saltos con su
            cascada de baldosas. Aquí ninguna se desmonta y lo único que se
            mueve es el carril, así que el cambio es un desplazamiento
            continuo — que además es lo que el chevron estaba prometiendo.

            `overflow: clip` y no `hidden`: hidden fuerza a que `overflow-y`
            compute como auto y eso convierte esto en contenedor de scroll (el
            mismo problema que el shell, documentado en index.css). */}
        <div style={{ flex: 1, minWidth: 0, overflow: "clip" }}>
          <div
            style={{
              display: "flex", width: "200%",
              transform: cara === "acciones" ? "translateX(0)" : "translateX(-50%)",
              transition: "transform .38s cubic-bezier(.22,1,.36,1)",
            }}
          >
            <div
              // La cara que no se ve no se puede tabular con el tabulador: si
              // no, el foco se va a baldosas que están fuera de la ventana.
              inert={cara === "acciones" ? undefined : ""}
              style={{
                width: "50%", flexShrink: 0, display: "flex", gap: 2,
                overflowX: "auto", padding: "8px 8px 6px",
                scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
              }}
            >
            <>
              {onRellenar && huecosVacios > 0 && (
                <BaldosaMando
                  Icon={Sparkles}
                  label="Rellenar"
                  orden={0}
                  color="#c98a1e"
                  tinte="#fff"
                  badge={huecosVacios}
                  onClick={() => onRellenar()}
                />
              )}
              {/* Aquí vivía una baldosa «Elegir» que ponía el tablero en modo
                  marcar. Sobraba: marcar es tocar un hueco, y un modo que hay
                  que encender antes convertía dos toques en tres. */}
              {onNuevaPizarra && (
                <BaldosaMando
                  Icon={Plus}
                  label="Nueva"
                  orden={1}
                  color={TEAL}
                  tinte="#fff"
                  onClick={onNuevaPizarra}
                />
              )}
              {onVaciar && (
                <BaldosaMando
                  Icon={Eraser}
                  label="Vaciar"
                  orden={2}
                  color="#b45309"
                  tinte="#fff"
                  onClick={() => setConfirmarVaciar(true)}
                />
              )}
              {onFavorito && (
                <BaldosaMando
                  Icon={Heart}
                  label={esFavorito ? "Guardada" : "Favorito"}
                  orden={3}
                  color="#e0405a"
                  tinte="#fff"
                  onClick={onFavorito}
                />
              )}
              {/* Claro y oscuro. Vive aquí y no en los ajustes de la app
                  porque solo viste el TABLERO: es una preferencia de esta
                  pizarra, no del producto, y el resto de pantallas siguen en
                  claro. El icono enseña adónde vas, no dónde estás. */}
              {onTema && (
                <BaldosaMando
                  Icon={tema === "oscuro" ? Sun : Moon}
                  label={tema === "oscuro" ? "Claro" : "Oscuro"}
                  orden={4}
                  color="#4b5d8f"
                  tinte="#fff"
                  onClick={onTema}
                />
              )}
            </>
            </div>
            <div
              inert={cara === "controles" ? undefined : ""}
              style={{
                width: "50%", flexShrink: 0, display: "flex", gap: 2,
                overflowX: "auto", padding: "8px 8px 6px",
                scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
              }}
            >
            <>
              <BaldosaMando
                Icon={BarChart3}
                label="Balance"
                orden={0}
                color="#7a5aa8"
                tinte="#fff"
                onClick={() => setAbierto("balance")}
              />
              {/* Lo que tienes en casa. Estuvo un rato saliendo solo al ir a
                  rellenar: era el único momento en que importaba, pero también
                  el peor, porque te paraba un gesto que ya habías empezado.
                  Aquí es un sitio al que vas cuando quieres, no un peaje. */}
              {onAddDespensa && (
                <BaldosaMando
                  Icon={Package}
                  label="En casa"
                  orden={1}
                  color="#3f9656"
                  tinte="#fff"
                  badge={enDespensa > 0 ? enDespensa : null}
                  onClick={() => setAbierto("despensa")}
                />
              )}
              {/* "Batch" y no "Batch Cooking": la etiqueta son 55px, y el
                  título entero está en el panel que abre. */}
              <BaldosaMando
                Icon={CookingPot}
                label="Batch"
                orden={2}
                color={NARANJA}
                tinte="#fff"
                apagada={!hayTanda}
                badge={hayTanda ? piezasTanda : null}
                onClick={() => hayTanda && setAbierto("tanda")}
              />
            </>
            </div>
          </div>
        </div>
      </div>

      {/* Vaciar sí pregunta: se lleva por delante todo lo que has puesto y no
          hay deshacer. Los huecos NO se tocan —el tablero que decidiste en el
          arranque se queda— así que lo que se confirma es solo perder los
          platos. */}
      {/* ── La despensa, al ir a rellenar ─────────────────────────────────
          Rellenar tira siempre de lo que tienes, así que antes de hacerlo se
          enseña: apuntas lo que falte y le das. Por portal, como los paneles
          (un ancestro animado atraparía el `fixed`). */}
      {confirmarVaciar && createPortal(
        <div
          onClick={() => setConfirmarVaciar(false)}
          className="mp-overlay-in"
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(20,47,29,.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(300px, 100%)", background: "#fff", borderRadius: 20,
              padding: 18, boxSizing: "border-box",
              boxShadow: "0 24px 60px -18px rgba(20,47,29,.45)",
            }}
          >
            <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 900, color: INK }}>
              ¿Vaciar la pizarra?
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, fontWeight: 600, color: "#7a9485", lineHeight: 1.45 }}>
              Se quitan los platos. Los huecos se quedan como están.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="mp-press"
                onClick={() => setConfirmarVaciar(false)}
                style={{
                  flex: 1, height: 40, borderRadius: 13, cursor: "pointer",
                  border: "1.5px solid #dbe7df", background: "#fff",
                  color: "#5a7066", fontSize: 13.5, fontWeight: 800, fontFamily: "inherit",
                }}
              >
                Déjalo
              </button>
              <button
                type="button"
                className="mp-press"
                onClick={() => { setConfirmarVaciar(false); onVaciar?.(); }}
                style={{
                  flex: 1, height: 40, borderRadius: 13, cursor: "pointer",
                  border: "none", background: "#b45309", color: "#fff",
                  fontSize: 13.5, fontWeight: 800, fontFamily: "inherit",
                }}
              >
                Vaciar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Por PORTAL, y no aquí dentro ──────────────────────────────────
          Estos paneles son `position: fixed` y viven dentro de la franja, que
          se anima al entrar. Un ancestro con `transform` —aunque sea el de una
          animación ya terminada— se convierte en el bloque contenedor de los
          fixed que lleva dentro: el panel dejaba de medir la ventana y medía
          los 78px de la franja, así que se abría y no se veía. Colgarlo del
          `body` lo saca de esa trampa para siempre, y de paso del contexto de
          apilamiento que crea la franja pegajosa. */}
      {abierto && createPortal(
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
                {TITULOS[abierto]}
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
              <PanelBalance menuPlan={menuPlan} groups={groups} members={data?.members ?? []} />
            ) : abierto === "despensa" ? (
              <PanelDespensa
                despensa={despensa}
                onAnadir={onAddDespensa}
                onQuitar={onQuitarDespensa}
                onQty={onQtyDespensa}
              />
            ) : abierto === "tanda" ? (
              <PanelTanda data={data} setData={setData} sesion={sesion} />
            ) : null}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
