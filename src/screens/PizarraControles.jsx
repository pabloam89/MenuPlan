import { lazy, Suspense, useMemo, useState } from "react";
import {
  BarChart3, CalendarDays, Check, CookingPot, Package, Plus, Salad, Search, Sparkles, X,
} from "../components/icons.jsx";
import { ingredientImageSrc, ingredientThumbSrc } from "../lib/ingredientImages.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { formatStockQty } from "../lib/kitchenUnits.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { recuentoDelMenu } from "../lib/menuRecuento.js";
import { DAYS, getDayMeals } from "../lib/planner.js";
import { MAX_MENU_WEEKS } from "../lib/menuArchive.js";
import { todayDayIdx } from "../lib/weekCalendar.js";
import { sesionDeBases } from "../lib/bases.js";
import { enHoras, minutosDeTanda } from "../lib/cookTime.js";
import { KITCHEN_TOOLS } from "../lib/applianceMethods.js";

/**
 * El selector de tandas del wizard, tal cual. Va en diferido porque arrastra
 * el catálogo entero para repartir las recetas por familia, y la mayoría de
 * quien abre la pizarra no llega a abrir esta baldosa.
 */
const BasesPreferidas = lazy(() =>
  import("../components/BasesPreferidas.jsx").then((m) => ({ default: m.BasesPreferidas })),
);
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
function BaldosaMando({ Icon, label, color, tinte, onClick, badge = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mp-press"
      style={{
        // Se reparten el ancho en vez de medir 66 fijos: con cuatro baldosas
        // sobraba sitio y con cinco —la de "Rellenar", que es la que más se
        // usa— la última se quedaba medio fuera del móvil.
        flex: "1 1 0", minWidth: 0, maxWidth: 70,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        background: "none", border: "none", padding: 0,
        cursor: "pointer", fontFamily: "inherit",
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

/**
 * Lo que casi todo el mundo tiene en casa, para no tener que escribirlo.
 *
 * Una despensa vacía pide quince gestos antes de servir para nada, y los
 * quince son los mismos en todas las casas: cebolla, ajo, patatas, arroz,
 * leche. Con el pool son quince TOQUES, y cada uno se lleva su cantidad
 * razonable puesta — un paquete de arroz son 500 g, un brick de leche un
 * litro— que luego se corrige en la línea si hace falta.
 *
 * Las cantidades van escritas aquí y no salen de `defaultPackFor` porque esto
 * son quince nombres elegidos a mano: para la cebolla, que no viene en envase,
 * la función no tiene nada que decir, y "2 unidades" es una decisión, no un
 * valor por defecto que se pueda deducir.
 */
const POOL = [
  { nombre: "Cebolla", qty: 2, unidad: "ud" },
  { nombre: "Ajo", qty: 1, unidad: "ud" },
  { nombre: "Patata", qty: 1, unidad: "kg" },
  { nombre: "Tomate", qty: 4, unidad: "ud" },
  { nombre: "Zanahoria", qty: 3, unidad: "ud" },
  { nombre: "Limón", qty: 2, unidad: "ud" },
  { nombre: "Huevos", qty: 6, unidad: "ud" },
  { nombre: "Leche", qty: 1, unidad: "l" },
  { nombre: "Arroz", qty: 500, unidad: "g" },
  { nombre: "Macarrones", qty: 500, unidad: "g" },
  { nombre: "Lentejas", qty: 500, unidad: "g" },
  { nombre: "Aceite de oliva", qty: 1, unidad: "l" },
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

function PanelDespensa({ despensa, onAnadir, onQuitar, onQty, usarDespensa, onUsarDespensa }) {
  const [texto, setTexto] = useState("");
  const [qty, setQty] = useState("1");
  const [unidad, setUnidad] = useState("ud");
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

        {/* La cantidad solo cuando hay algo que contar. En blanco eran dos
            campos pidiendo un dato sobre nada, y encima los primeros que veías
            al abrir el panel. */}
        {escribiendo && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              aria-label="Cantidad"
              style={{ ...campoBase, width: 48, textAlign: "center", padding: "0 4px" }}
            />
            <select
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              aria-label="Unidad"
              style={{ ...campoBase, width: 58, padding: "0 4px", cursor: "pointer" }}
            >
              {UNIDADES.map((u) => <option key={u} value={u}>{u === "l" ? "L" : u}</option>)}
            </select>
            <button
              type="submit"
              className="mp-press"
              style={{
                flex: 1, height: 30, borderRadius: 9, padding: 0,
                border: "none", cursor: "pointer", background: VERDE, color: "#fff",
                fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
            >
              <Plus size={15} strokeWidth={3} />
              Añadir
            </button>
          </div>
        )}
      </form>

      {/* El pool. Desaparece mientras escribes —entonces la respuesta está en
          la barra, no aquí— y también cuando ya lo tienes todo puesto. */}
      {!escribiendo && pool.length > 0 && (
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
                onClick={() => onAnadir(p.nombre, p.qty, p.unidad)}
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
/** Un rótulo de sección. Tres palabras en mayúscula, sin párrafo debajo. */
function Rotulo({ children, top = 18 }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", letterSpacing: ".3px", margin: `${top}px 2px 9px` }}>
      {children}
    </div>
  );
}

function PanelTanda({
  data, setData, sesion, minutos, agrupar, onAgrupar, onRellenar, huecosVacios,
}) {
  const bases = sesion?.bases ?? [];
  const usados = sesion?.minutosActivosTotales ?? 0;
  const pasa = usados > minutos;
  const trastos = data?.kitchenTools ?? [];
  const todosLosTrastos = [...KITCHEN_TOOLS, ...(data?.customKitchenTools ?? [])];

  const alternarTrasto = (t) => setData?.((d) => ({
    ...d,
    kitchenTools: (d.kitchenTools ?? []).includes(t)
      ? (d.kitchenTools ?? []).filter((v) => v !== t)
      : [...(d.kitchenTools ?? []), t],
  }));

  return (
    <>
      {/* Lo que sale va PRIMERO: es la respuesta, y los mandos de abajo son
          lo que la cambia. Al revés, el panel abría pidiendo decisiones antes
          de enseñar qué producen. */}
      <Rotulo top={0}>ESTA SEMANA SALE</Rotulo>
      {bases.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 20px" }}>
          <CookingPot size={32} color="#cdd8d0" />
          <p style={{ margin: "8px 0 0", fontSize: 12.5, fontWeight: 700, color: "#9ab0a1", lineHeight: 1.4 }}>
            Sin dos platos que compartan olla<br />no hay tanda
          </p>
        </div>
      ) : (
        <>
          {/* Cuando se pasa del rato que has dicho tener, el número avisa en
              vez de callarse: es el dato que decide si el domingo sale. */}
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "-4px 2px 9px" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: pasa ? "#b45309" : "#9ab0a1", fontVariantNumeric: "tabular-nums" }}>
              {enHoras(usados)} de {enHoras(minutos)}
            </span>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e3ebe6", borderRadius: 16, overflow: "hidden" }}>
            {bases.map((b, i) => (
              <BaseDeTanda key={b.base.id} entrada={b} ultima={i === bases.length - 1} />
            ))}
          </div>
        </>
      )}

      <InterruptorPref
        activo={agrupar}
        onChange={onAgrupar}
        titulo="Agrupar al rellenar"
      />

      {/* El atajo: rellenar sin cerrar el panel y buscar la baldosa. Solo
          cuando queda algo — un botón que no hace nada es peor que ninguno. */}
      {onRellenar && huecosVacios > 0 && (
        <button
          type="button"
          className="mp-press"
          onClick={onRellenar}
          style={{
            marginTop: 10, width: "100%", padding: "12px 16px", borderRadius: 14,
            border: `1.5px solid ${NARANJA}55`, background: "#fff", cursor: "pointer",
            color: NARANJA, fontSize: 13.5, fontWeight: 800, fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Sparkles size={15} strokeWidth={2.6} />
          Completar la tanda
        </button>
      )}

      {/* Los trastos no son decoración: la bechamel son 25 minutos removiendo
          o 12 sin tocarla, y la legumbre 60 o 25. Cambian los minutos de la
          sesión de arriba, que es lo que decide si el domingo sale. */}
      {setData && (
        <>
          <Rotulo>QUÉ TIENES EN LA COCINA</Rotulo>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            {todosLosTrastos.map((t) => {
              const sel = trastos.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => alternarTrasto(t)}
                  aria-pressed={sel}
                  style={{
                    height: 30, borderRadius: 8, padding: "0 4px",
                    border: `1.5px solid ${sel ? VERDE : "#dde8e0"}`,
                    background: sel ? VERDE : "#fff",
                    color: sel ? "#fff" : "#526057",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* El inventario, tal cual se pregunta en el wizard: las tres patas
              ilustradas y un deslizador por familia. Es el MISMO componente,
              y trae SU deslizador de tiempo — el de `data.tandaMinutos`, que
              es el que lee `minutosDeTanda`—. Por eso arriba ya no hay otro:
              dos deslizadores para la misma pregunta acaban discrepando, y no
              hay forma de saber cuál manda.

              Ojo: esto escribe en la libreta de la casa, no en esta semana.
              Lo que pidas aquí vale también para los menús que generes. */}
          <Rotulo>QUÉ QUIERES DEJAR HECHO</Rotulo>
          <Suspense fallback={null}>
            <BasesPreferidas data={data} setData={setData} />
          </Suspense>
        </>
      )}
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
  dias: "¿Qué días?",
  balance: "Cómo va la semana",
  despensa: "Lo que tengo en casa",
  tanda: "Batch Cooking",
};

export function PizarraControles({
  data, setData, menuPlan, groups, onAplicar, onRellenar,
  despensa, onAddDespensa, onQuitarDespensa, onQtyDespensa, prefs, onPrefs,
}) {
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
    return sesionDeBases(plan, recipeCatalogById, {
      dias: diasDe(0),
      comidas: getDayMeals(data),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuPlan, groups, data]);

  // El tiempo del domingo lo manda `data.tandaMinutos`, que es donde escribe el
  // deslizador del inventario. No hay copia por semana: la hubo, y eran dos
  // respuestas a la misma pregunta sin nadie que arbitrara cuál valía.
  const minutos = minutosDeTanda(data);
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
          onClick={() => setAbierto("dias")}
        />
        <BaldosaMando
          Icon={BarChart3}
          label="Balance"
          color="#7a5aa8"
          tinte="#fff"
          onClick={() => setAbierto("balance")}
        />
        {/* Las dos que dan de comer al relleno: lo que ya tienes y el tiempo
            que vas a tener. La chapa cuenta lo que hay dentro, para que se vea
            que no están vacías sin abrirlas. */}
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
        {/* "Batch" y no "Batch Cooking": la etiqueta de baldosa son 55px, y
            el título entero está en el panel que abre. */}
        <BaldosaMando
          Icon={CookingPot}
          label="Batch"
          color={NARANJA}
          tinte="#fff"
          badge={sesion.bases.length > 0 ? sesion.bases.length : null}
          onClick={() => setAbierto("tanda")}
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
                onUsarDespensa={(v) => onPrefs?.({ usarDespensa: v })}
              />
            ) : abierto === "tanda" ? (
              <PanelTanda
                data={data}
                setData={setData}
                sesion={sesion}
                minutos={minutos}
                agrupar={prefs?.agrupar ?? false}
                onAgrupar={(v) => onPrefs?.({ agrupar: v })}
                onRellenar={onRellenar ? () => { setAbierto(null); onRellenar(); } : null}
                huecosVacios={huecosVacios}
              />
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
