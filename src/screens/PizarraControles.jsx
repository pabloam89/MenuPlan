import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BarChart3, CalendarDays, Check, CookingPot, Package, Plus, Salad, Search, Sparkles, X,
} from "../components/icons.jsx";
import { ingredientThumbSrc } from "../lib/ingredientImages.js";
import { formatStockQty } from "../lib/kitchenUnits.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { recuentoDelMenu } from "../lib/menuRecuento.js";
import { DAYS, getDayMeals } from "../lib/planner.js";
import { MAX_MENU_WEEKS } from "../lib/menuArchive.js";
import { todayDayIdx } from "../lib/weekCalendar.js";
import { sesionDeBases } from "../lib/bases.js";
import { enHoras } from "../lib/cookTime.js";
import { KITCHEN_TOOLS, selectMethodForRecipe } from "../lib/applianceMethods.js";

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
function BaldosaMando({ Icon, label, color, tinte, onClick, badge = null, apagada = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={apagada}
      aria-disabled={apagada}
      className={apagada ? undefined : "mp-press"}
      style={{
        // Apagada se ve, pero en gris: que exista la baldosa dice que el
        // Batch está ahí para cuando pongas dos platos que compartan olla.
        opacity: apagada ? 0.42 : 1,
        filter: apagada ? "grayscale(1)" : "none",
        transition: "opacity .2s ease, filter .2s ease",
        // Se reparten el ancho en vez de medir 66 fijos: con cuatro baldosas
        // sobraba sitio y con cinco —la de "Rellenar", que es la que más se
        // usa— la última se quedaba medio fuera del móvil.
        flex: "1 1 0", minWidth: 0, maxWidth: 70,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        background: "none", border: "none", padding: 0,
        cursor: apagada ? "default" : "pointer", fontFamily: "inherit",
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
              border: "2px solid #f4f8f5",
            }}
          >
            {badge}
          </span>
        )}
      </span>
      <span style={{ fontSize: 10, fontWeight: 800, color: "#5a7066", letterSpacing: "-.1px" }}>
        {label}
      </span>
    </button>
  );
}

/**
 * Un interruptor de preferencia, de los que cambian lo que hará "Rellenar".
 *
 * Van dentro de los paneles y no en el botón porque el botón tiene que seguir
 * siendo un toque: quien no abre nada rellena como siempre, y quien entra a
 * mirar su despensa o su domingo deja ahí dicho cómo quiere que se rellene.
 */
function InterruptorPref({ activo, onChange, titulo, detalle }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!activo)}
      className="mp-press"
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
        padding: "11px 12px", borderRadius: 14, cursor: "pointer", textAlign: "left",
        background: activo ? "#eaf6ee" : "#fff",
        border: `1.5px solid ${activo ? "#bfe6cb" : "#e0eae3"}`,
        fontFamily: "inherit", marginTop: 12,
      }}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
          background: activo ? VERDE : "#fff",
          border: `1.5px solid ${activo ? VERDE : "#cdd8d0"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {activo && <Check size={14} color="#fff" strokeWidth={3} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: INK }}>{titulo}</span>
        {detalle && (
          <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#7a9485", lineHeight: 1.35, marginTop: 2 }}>
            {detalle}
          </span>
        )}
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
function Miniatura({ name, size = 38 }) {
  const [roto, setRoto] = useState(false);
  const src = ingredientThumbSrc(name);
  if (!src || roto) {
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
      onError={() => setRoto(true)}
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
function CantidadDeLinea({ item, onQty }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");

  const guardar = () => {
    setEditando(false);
    const n = Number(String(valor).replace(",", "."));
    if (n > 0 && n !== Number(item.qty)) onQty?.(item.id, n, item.unit ?? "ud");
  };

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => { setValor(String(item.qty ?? 1)); setEditando(true); }}
        aria-label={`Cambiar la cantidad de ${item.ingredientName ?? item.name}`}
        style={{
          flexShrink: 0, padding: "4px 9px", borderRadius: 999,
          background: "#f0f6f2", border: "1px solid #dfeae3", cursor: "pointer",
          fontSize: 11.5, fontWeight: 900, color: VERDE, fontFamily: "inherit",
          fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
        }}
      >
        {formatStockQty(item.qty ?? 1, item.unit ?? "ud")}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={valor}
      inputMode="decimal"
      aria-label="Cantidad"
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => { if (e.key === "Enter") guardar(); if (e.key === "Escape") setEditando(false); }}
      style={{ ...campoBase, width: 58, height: 28, flexShrink: 0, textAlign: "center", fontSize: 16, padding: "0 4px" }}
    />
  );
}

function PanelDespensa({ despensa, onAnadir, onQuitar, onQty, usarDespensa, onUsarDespensa }) {
  const [texto, setTexto] = useState("");
  const [qty, setQty] = useState("1");
  const [unidad, setUnidad] = useState("ud");
  const ingredientes = (despensa ?? []).filter((i) => (i.itemType ?? "ingredient") !== "cooked_dish");

  const enviar = (e) => {
    e?.preventDefault?.();
    const t = texto.trim();
    if (!t) return;
    onAnadir(t, Number(qty.replace(",", ".")) || 1, unidad);
    setTexto("");
    setQty("1");
    setUnidad("ud");
  };

  return (
    <>
      {/* El buscador y la cantidad, en la misma fila y en el mismo gesto: la
          cantidad es la mitad del dato —"tengo arroz" no dice si llega para un
          plato o para cinco— y preguntarla después obligaría a un segundo
          toque por ingrediente. */}
      <form onSubmit={enviar} style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, minWidth: 0,
            height: 42, padding: "0 12px", borderRadius: 12, marginBottom: 8,
            background: "#fff", border: "1.5px solid #dbe7df",
          }}
        >
          <Search size={16} color="#9ab0a1" />
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
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            aria-label="Cantidad"
            style={{ ...campoBase, width: 62, textAlign: "center", fontSize: 16, padding: "0 6px" }}
          />
          <select
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            aria-label="Unidad"
            style={{ ...campoBase, width: 72, fontSize: 16, padding: "0 6px", cursor: "pointer" }}
          >
            {UNIDADES.map((u) => <option key={u} value={u}>{u === "l" ? "L" : u}</option>)}
          </select>
          <button
            type="submit"
            className="mp-press"
            disabled={!texto.trim()}
            style={{
              flex: 1, height: 32, borderRadius: 10, padding: 0,
              border: "none", cursor: texto.trim() ? "pointer" : "default",
              background: texto.trim() ? VERDE : "#c8d9ce", color: "#fff",
              fontSize: 13, fontWeight: 800, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <Plus size={16} strokeWidth={3} />
            Añadir
          </button>
        </div>
      </form>

      {ingredientes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px" }}>
          <Package size={32} color="#cdd8d0" />
          <p style={{ margin: "8px 0 0", fontSize: 12.5, fontWeight: 700, color: "#9ab0a1" }}>
            Nada guardado todavía
          </p>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16, overflow: "hidden" }}>
          {ingredientes.map((i, n) => (
            <div
              key={i.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderBottom: n === ingredientes.length - 1 ? "none" : "1px solid #eef3f0",
              }}
            >
              <Miniatura name={i.ingredientName ?? i.name} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: INK, lineHeight: 1.25 }}>
                {i.ingredientName ?? i.name}
              </span>
              {/* La cantidad se corrige aquí mismo, en el sitio donde la lees:
                  cambiar "2 kg" por "500 g" no puede obligar a borrar la línea
                  y volver a escribirla. */}
              <CantidadDeLinea item={i} onQty={onQty} />
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

      <InterruptorPref
        activo={usarDespensa}
        onChange={onUsarDespensa}
        titulo="Usar lo que tengo al rellenar"
      />
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
 * El Batch Cooking de la pizarra: de consulta, y nada más.
 *
 * Antes era un panel de mandos —agrupar al rellenar, qué trastos tienes, qué
 * bases quieres dejar hechas— y se leía como una tarea más antes de poder
 * cocinar. Lo que la gente quiere saber es la respuesta: con lo que he puesto,
 * ¿qué dejo hecho el domingo y cuánto me lleva? Así que esto solo enseña el
 * inventario que sale del tablero. Los trastos se preguntan al empezar (ver
 * `PopupInicio`), que es cuando cambian los tiempos de todo.
 */
function PanelTanda({ sesion }) {
  const bases = sesion?.bases ?? [];
  const usados = sesion?.minutosActivosTotales ?? 0;
  const ahorro = sesion?.ahorroTotal ?? 0;

  return (
    <>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
        Sale solo de los platos que has puesto: lo que se cocina una vez y se come varias.
      </p>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 2px 9px" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", letterSpacing: ".3px" }}>
          {bases.length} {bases.length === 1 ? "BASE" : "BASES"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: NARANJA, fontVariantNumeric: "tabular-nums" }}>
          {enHoras(usados)}{ahorro > 0 ? ` · ahorras ${enHoras(ahorro)}` : ""}
        </span>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16, overflow: "hidden" }}>
        {bases.map((b, i) => (
          <BaseDeTanda key={b.base.id} entrada={b} ultima={i === bases.length - 1} />
        ))}
      </div>
    </>
  );
}

/** Una base de la sesión, con su foto — la misma que la pestaña de Cocina. */
function BaseDeTanda({ entrada, ultima }) {
  const [roto, setRoto] = useState(false);
  const foto = dishImageForRecipe(entrada.base);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
        borderBottom: ultima ? "none" : "1px solid #eef3f0",
      }}
    >
      <span
        style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0, overflow: "hidden",
          background: `${NARANJA}18`, color: NARANJA,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {foto && !roto
          ? <img src={foto} alt="" loading="lazy" onError={() => setRoto(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <CookingPot size={17} strokeWidth={2.2} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: INK, lineHeight: 1.25 }}>
          {entrada.base.name}
        </span>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9ab0a1", marginTop: 1 }}>
          {entrada.huecos.length} platos
        </span>
      </span>
      <span style={{
        flexShrink: 0, padding: "4px 9px", borderRadius: 999,
        background: `${NARANJA}12`, border: `1px solid ${NARANJA}2e`,
        fontSize: 11.5, fontWeight: 900, color: NARANJA, fontVariantNumeric: "tabular-nums",
      }}>
        {enHoras(entrada.minutosActivos)}
      </span>
    </div>
  );
}

const TITULOS = {
  balance: "Cómo va la semana",
  despensa: "Lo que tengo en casa",
  tanda: "Batch Cooking",
};

/**
 * Los días del menú: una semana entera de un toque, o día a día.
 *
 * Era el cuerpo del panel lateral de "Días"; ahora es el primer paso del
 * pop-up de inicio, y el mismo que abre la baldosa después.
 */
function CalendarioDias({ data, onAplicar }) {
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
      {/* Las cuatro en UNA fila: partidas en 3+1 se leían como dos grupos de
          semanas, que no significa nada. */}
      <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginBottom: 14 }}>
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

      <div style={{ background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16, padding: "12px 8px 6px" }}>
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
        {/* Las semanas, separadas de verdad: cuatro filas de números pegadas
            se leían como una tabla sin estructura, y lo que hay que ver de un
            vistazo es dónde empieza y acaba cada semana. */}
        {semanas.map((s, wi) => {
          const puestos = new Set(diasDe(s.offset));
          return (
            <div
              key={s.offset}
              style={{
                display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                marginTop: wi === 0 ? 4 : 6,
                paddingTop: wi === 0 ? 0 : 6,
                borderTop: wi === 0 ? "none" : "1px solid #f1f5f2",
              }}
            >
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
                        // Hoy se subraya, no se rellena: el relleno ya significa
                        // "marcado", y usándolo para las dos cosas hoy parecía
                        // puesto sin estarlo.
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
  );
}

/**
 * Qué hay en la cocina. Escribe en `data.kitchenTools`, lo mismo que el perfil
 * y el wizard: con olla rápida la legumbre son 25 minutos y no 60, y eso cambia
 * la receta que ves y lo que dura el Batch.
 */
function Electrodomesticos({ data, setData }) {
  const trastos = data?.kitchenTools ?? [];
  const todos = [...KITCHEN_TOOLS, ...(data?.customKitchenTools ?? [])];
  const alternar = (t) => setData?.((d) => ({
    ...d,
    kitchenTools: (d.kitchenTools ?? []).includes(t)
      ? (d.kitchenTools ?? []).filter((v) => v !== t)
      : [...(d.kitchenTools ?? []), t],
  }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
      {todos.map((t, i) => {
        const sel = trastos.includes(t);
        return (
          <button
            key={t}
            type="button"
            className="mp-rise mp-press"
            onClick={() => alternar(t)}
            aria-pressed={sel}
            style={{
              "--d": `${i * 40}ms`,
              height: 46, borderRadius: 14, padding: "0 12px",
              border: `1.5px solid ${sel ? VERDE : "#dde8e0"}`,
              background: sel ? VERDE : "#fff",
              color: sel ? "#fff" : "#3a4a42",
              fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
              transition: "background .15s ease, color .15s ease, border-color .15s ease",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</span>
            {sel && <Check size={15} strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * La tarjeta flotante centrada: el mismo molde para el inicio y la despensa.
 * Centrada y no en hoja inferior porque es una pregunta, no un sitio: se
 * contesta y desaparece, con el tablero visible detrás.
 */
function PopupCentrado({ children, onCerrar, etiqueta }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onCerrar?.(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCerrar]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
      style={{
        position: "fixed", inset: 0, zIndex: 170,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="mp-pizarra-velo"
        onClick={onCerrar}
        style={{ position: "absolute", inset: 0, background: "rgba(20,47,29,.34)", backdropFilter: "blur(2px)" }}
      />
      <div
        className="mp-pizarra-pop"
        style={{
          position: "relative", width: "min(380px, 100%)", maxHeight: "calc(100dvh - 32px)",
          boxSizing: "border-box", overflow: "hidden",
          background: "#fff", borderRadius: 26,
          boxShadow: "0 24px 60px -20px rgba(20,47,29,.55)",
          display: "flex", flexDirection: "column",
        }}
      >
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="mp-press"
            style={{
              position: "absolute", top: 14, right: 14, zIndex: 2,
              width: 34, height: 34, borderRadius: 999, padding: 0,
              background: "#f1f5f2", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} color={VERDE} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

const botonPrincipal = {
  height: 46, padding: "0 20px", borderRadius: 999, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg, #2d5a3d, #3f9656)", color: "#fff",
  fontSize: 14.5, fontWeight: 800, fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  boxShadow: "0 8px 18px -8px rgba(45,90,61,.7)",
};

const botonSecundario = {
  height: 46, padding: "0 14px", borderRadius: 999, border: "none", cursor: "pointer",
  background: "transparent", color: "#7a9485",
  fontSize: 14, fontWeight: 800, fontFamily: "inherit",
};

const PASOS_INICIO = [
  { id: "dias", titulo: "¿Qué días?", detalle: "Toca una semana entera, o afina día a día." },
  { id: "cocina", titulo: "¿Qué tienes en la cocina?", detalle: "Ajusta las recetas y lo que tarda el Batch." },
];

/**
 * El pop-up de inicio: días → electrodomésticos → Empezar.
 *
 * Sale al abrir una pizarra nueva, sobre el tablero ya dibujado: marcas un día
 * y la rejilla de detrás se reforma, que es cuando se puede juzgar si era eso.
 * Los pasos se deslizan en horizontal, uno detrás de otro, para que se lea
 * como un camino corto y no como dos preguntas sueltas.
 */
function PopupInicio({ data, setData, onAplicar, primeraVez, onTerminar }) {
  const [paso, setPaso] = useState(0);
  // Mientras desliza se ven los dos pasos; al terminar, el que se ha ido se
  // pliega para que la tarjeta mida lo que mide el paso que está delante.
  const [deslizando, setDeslizando] = useState(false);
  const irA = (n) => { setDeslizando(true); setPaso(n); };
  const ultimo = paso === PASOS_INICIO.length - 1;
  const actual = PASOS_INICIO[paso];

  return (
    <PopupCentrado onCerrar={onTerminar} etiqueta={actual.titulo}>
      <div style={{ padding: "22px 20px 0" }}>
        <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
          {PASOS_INICIO.map((p, i) => (
            <span
              key={p.id}
              style={{
                height: 6, borderRadius: 999,
                width: i === paso ? 22 : 6,
                background: i <= paso ? VERDE : "#dce7e0",
                transition: "width .25s cubic-bezier(.22,1,.36,1), background .25s ease",
              }}
            />
          ))}
        </div>
        {/* El título viaja con su paso (key), así entra deslizando igual. */}
        <div key={actual.id} className="mp-pizarra-paso" style={{ paddingRight: 36 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.4px" }}>
            {actual.titulo}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 600, color: "#5a7066", lineHeight: 1.4 }}>
            {actual.detalle}
          </p>
        </div>
      </div>

      <div style={{ overflowX: "hidden", overflowY: "auto", flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: "flex", width: `${PASOS_INICIO.length * 100}%`,
            transform: `translateX(-${(paso * 100) / PASOS_INICIO.length}%)`,
            transition: "transform .38s cubic-bezier(.22,1,.36,1)",
            alignItems: "flex-start",
          }}
          onTransitionEnd={(e) => { if (e.target === e.currentTarget) setDeslizando(false); }}
        >
          {[
            <CalendarioDias key="dias" data={data} onAplicar={onAplicar} />,
            <Electrodomesticos key="cocina" data={data} setData={setData} />,
          ].map((contenido, i) => (
            <div
              key={PASOS_INICIO[i].id}
              aria-hidden={paso !== i}
              style={{
                width: `${100 / PASOS_INICIO.length}%`, padding: "16px 20px 4px", boxSizing: "border-box",
                ...(paso !== i && !deslizando ? { height: 0, overflow: "hidden", paddingTop: 0, paddingBottom: 0 } : null),
              }}
            >
              {(paso === i || deslizando) && contenido}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 20px" }}>
        {paso > 0
          ? <button type="button" className="mp-press" style={botonSecundario} onClick={() => irA(paso - 1)}>Atrás</button>
          : <span />}
        <button
          type="button"
          className="mp-press"
          style={botonPrincipal}
          onClick={() => (ultimo ? onTerminar() : irA(paso + 1))}
        >
          {ultimo ? (primeraVez ? "Empezar" : "Hecho") : "Siguiente"}
          {!ultimo && <ArrowRight size={16} strokeWidth={2.6} />}
        </button>
      </div>
    </PopupCentrado>
  );
}

/**
 * La primera vez que tocas Rellenar: ¿cocinamos con lo que ya tienes?
 *
 * Se pregunta aquí y no al entrar porque es la única vez que importa: rellenar
 * a mano no mira la despensa. La respuesta se guarda en la pizarra y ya no
 * vuelve a salir; se cambia desde la baldosa de Despensa.
 */
function PopupDespensa({ enDespensa, onResponder, onCerrar }) {
  const hay = enDespensa > 0;
  return (
    <PopupCentrado onCerrar={onCerrar} etiqueta="Cocinar con lo que tienes">
      <div style={{ padding: "26px 22px 22px", textAlign: "center" }}>
        <span
          className="mp-rise"
          style={{
            width: 58, height: 58, borderRadius: 20, margin: "0 auto 14px",
            background: "#eaf6ee", color: "#3f9656",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Package size={28} strokeWidth={2.2} />
        </span>
        <p style={{ margin: 0, fontSize: 19, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
          ¿Cocinamos con lo que tienes?
        </p>
        <p style={{ margin: "6px 0 18px", fontSize: 13, fontWeight: 600, color: "#5a7066", lineHeight: 1.45 }}>
          {hay
            ? `Tienes ${enDespensa} ${enDespensa === 1 ? "cosa apuntada" : "cosas apuntadas"} en casa. Rellenamos tirando primero de ahí.`
            : "Apunta lo que tienes en casa y rellenamos tirando primero de ahí."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            className="mp-press"
            style={{ ...botonPrincipal, width: "100%" }}
            onClick={() => onResponder(hay ? "si" : "apuntar")}
          >
            {hay ? "Sí, con lo que tengo" : "Apuntar lo que tengo"}
          </button>
          <button type="button" className="mp-press" style={{ ...botonSecundario, width: "100%" }} onClick={() => onResponder("no")}>
            {hay ? "No, rellena sin mirar" : "Ahora no, rellena"}
          </button>
        </div>
      </div>
    </PopupCentrado>
  );
}

export function PizarraControles({
  data, setData, menuPlan, groups, onAplicar, onRellenar,
  despensa, onAddDespensa, onQuitarDespensa, onQtyDespensa, prefs, onPrefs,
}) {
  const [abierto, setAbierto] = useState(null);
  // "inicio" (el de días → cocina), "despensa" (antes del primer relleno), o nada.
  const [popup, setPopup] = useState(null);
  const todayIdx = useMemo(() => todayDayIdx(), []);

  // Una pizarra recién creada llega con `introPendiente`: el pop-up de inicio
  // sale solo, una vez. Las que ya existían no lo tienen y no lo ven.
  const introPendiente = Boolean(prefs?.introPendiente);
  const verInicio = popup === "inicio" || (introPendiente && popup == null);
  const terminarInicio = () => {
    setPopup(null);
    if (introPendiente) onPrefs?.({ introPendiente: false });
  };

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
   * Se recalcula con cada plato que pones: la tanda no es una decisión aparte
   * sino una lectura de lo que ya has elegido. Con los trastos de la casa,
   * como la pestaña de Cocina: son los que deciden los minutos.
   */
  const utensilios = data?.kitchenTools;
  const sesion = useMemo(() => {
    const plan = {};
    for (const g of groups ?? []) {
      if (menuPlan?.[g.id]) plan[g.id] = menuPlan[g.id];
    }
    return sesionDeBases(plan, recipeCatalogById, {
      dias: diasDeSemana(data, 0, todayIdx),
      comidas: getDayMeals(data),
      metodoDeBase: (b) => selectMethodForRecipe(b, utensilios ?? []),
    });
  }, [menuPlan, groups, data, todayIdx, utensilios]);
  const hayTanda = sesion.bases.length > 0;

  const enDespensa = (despensa ?? []).filter((i) => (i.itemType ?? "ingredient") !== "cooked_dish").length;

  const rellenar = () => {
    if (!prefs?.despensaPreguntada) { setPopup("despensa"); return; }
    onRellenar();
  };
  const responderDespensa = (r) => {
    setPopup(null);
    if (r === "apuntar") {
      onPrefs?.({ despensaPreguntada: true, usarDespensa: true });
      setAbierto("despensa");
      return;
    }
    const usar = r === "si";
    onPrefs?.({ despensaPreguntada: true, usarDespensa: usar });
    // Las preferencias recién escritas aún no han llegado al relleno: van
    // explícitas en esta primera vuelta.
    onRellenar(undefined, { usarDespensa: usar });
  };

  return (
    <>
      <style>{`
        @keyframes mpPizarraPanel {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes mpPizarraPop {
          from { opacity: 0; transform: translateY(14px) scale(.96); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes mpPizarraVelo { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mpPizarraPaso {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: none; }
        }
        .mp-pizarra-panel { animation: mpPizarraPanel .24s cubic-bezier(.22,1,.36,1) both; }
        .mp-pizarra-pop { animation: mpPizarraPop .32s cubic-bezier(.22,1,.36,1) both; }
        .mp-pizarra-velo { animation: mpPizarraVelo .2s ease both; }
        .mp-pizarra-paso { animation: mpPizarraPaso .38s cubic-bezier(.22,1,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .mp-pizarra-panel, .mp-pizarra-pop, .mp-pizarra-velo, .mp-pizarra-paso { animation: none; }
        }
        /* El input se queda en 16px —si baja, iOS hace zoom al enfocarlo—, así
           que el que se encoge es el texto de muestra, que a 16 gritaba. */
        .mp-despensa-input::placeholder { font-size: 13px; font-weight: 600; color: #9aa8a0; opacity: 1; }
      `}</style>

      <div
        style={{
          display: "flex", gap: 2, overflowX: "auto", width: "100%",
          padding: "8px 8px 6px",
          scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
        }}
      >
        <BaldosaMando
          Icon={CalendarDays}
          label="Días"
          color={TEAL}
          tinte="#fff"
          onClick={() => setPopup("inicio")}
        />
        <BaldosaMando
          Icon={BarChart3}
          label="Balance"
          color="#7a5aa8"
          tinte="#fff"
          onClick={() => setAbierto("balance")}
        />
        {onAddDespensa && (
          <BaldosaMando
            Icon={Package}
            label="Despensa"
            color="#3f9656"
            tinte="#fff"
            badge={enDespensa > 0 ? enDespensa : null}
            onClick={() => setAbierto("despensa")}
          />
        )}
        {/* De consulta: sin dos platos que compartan olla no hay nada que
            enseñar, y la baldosa se queda apagada en vez de abrir un vacío. */}
        <BaldosaMando
          Icon={CookingPot}
          label="Batch"
          color={NARANJA}
          tinte="#fff"
          apagada={!hayTanda}
          badge={hayTanda ? sesion.bases.length : null}
          onClick={() => hayTanda && setAbierto("tanda")}
        />
        {onRellenar && huecosVacios > 0 && (
          <BaldosaMando
            Icon={Sparkles}
            label="Rellenar"
            color="#c98a1e"
            tinte="#fff"
            badge={huecosVacios}
            onClick={rellenar}
          />
        )}
      </div>

      {verInicio && (
        <PopupInicio
          data={data}
          setData={setData}
          onAplicar={onAplicar}
          primeraVez={introPendiente}
          onTerminar={terminarInicio}
        />
      )}
      {popup === "despensa" && (
        <PopupDespensa
          enDespensa={enDespensa}
          onResponder={responderDespensa}
          onCerrar={() => setPopup(null)}
        />
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
              <PanelBalance menuPlan={menuPlan} groups={groups} />
            ) : abierto === "despensa" ? (
              <PanelDespensa
                despensa={despensa}
                onAnadir={onAddDespensa}
                onQuitar={onQuitarDespensa}
                onQty={onQtyDespensa}
                usarDespensa={prefs?.usarDespensa ?? false}
                onUsarDespensa={(v) => onPrefs?.({ usarDespensa: v, despensaPreguntada: true })}
              />
            ) : (
              <PanelTanda sesion={sesion} />
            )}
          </div>
        </>
      )}
    </>
  );
}
