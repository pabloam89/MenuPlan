import { useState } from "react";
import { BASES, MAX_POR_SEMANA, MIN_POR_SEMANA, clavesDeReceta, tiempoDeBase, topeDeBase } from "../lib/bases.js";
import { selectMethodForRecipe } from "../lib/applianceMethods.js";
import { TANDA_MAX, TANDA_MIN, TANDA_PASO, aLoGrueso, abrirFindeParaTanda, enHoras, hayTandasPedidas, minutosDeTanda } from "../lib/cookTime.js";
import { weeklySlotBudget } from "../lib/planner.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { MAIN_BASES } from "../data/recipeSchema.js";
import { BASES_UI } from "../lib/basesUI.js";
import { ingredientThumbSrc } from "../lib/ingredientImages.js";
import { normalizar as normalizarLibreta, poner, proyectar, valorDe } from "../lib/notepad.js";
import { SliderEjes } from "./wizard/SliderEjes.jsx";

import { CookingPot, RollingPin, Soup } from "./icons.jsx";
import { familiasCocinado, familiasPlato, familiasSemi, manosDeTanda } from "../lib/tandaFamilias.js";

/**
 * Qué bases te gusta tener hechas — el detalle del modo "cocino en tanda".
 *
 * ── La fila es la de "¿Cómo os gusta comer?" ──────────────────────────────
 * La misma `SliderEjes` que las cocinas y el reparto, y por el mismo motivo:
 * es la misma pregunta —cuántas veces por semana quiero esto— y verla con otra
 * forma en otro sitio se lee como otra cosa.
 *
 * Nació como una rejilla de fichas que se tocaban para ciclar 0-2-3-4-0, y era
 * un mando inventado: para apagar había que dar tres toques adivinando cuándo
 * daba la vuelta, y no se podía arrastrar.
 *
 * ── Dónde se guarda, y por qué no en un campo nuevo ────────────────────────
 * En la LIBRETA, en el eje `base`, que es el que ya existe para "más pasta" /
 * "menos patatas" y que `lib/sesgos.js` ya lee. Un `data.basesPreferidas`
 * habría sido otro campo sin lector, y además una segunda verdad sobre lo
 * mismo: si aquí dices "arroz" y en el panel dices "menos arroz", ¿cuál gana?
 *
 * ── De preferencia a petición ─────────────────────────────────────────────
 * El valor no es un sí/no sino CUÁNTOS platos de esa base quieres en la semana.
 * Un sí/no dejaba la pregunta a medias: no decía si quieres sofrito dos veces o
 * cinco, así que el generador no tenía nada concreto que cumplir y solo podía
 * empujar. Con el número, la regla 11b de validateMenu lo coloca — o avisa de
 * que esta semana no cabe.
 *
 * `sesgos.js` sigue funcionando igual porque lee el SIGNO, no el número.
 *
 * ── La proyección ─────────────────────────────────────────────────────────
 * `data.sesgos` es la proyección de la libreta, no un sitio donde escribir. Se
 * recalcula aquí en el mismo gesto (igual que hace useWizardMenu al guardar)
 * para que el cambio surta efecto sin esperar a que el usuario pase por la fila
 * de mandos. La libreta sigue siendo la única fuente.
 */

// El deslizador del presupuesto. Misma pista de 7px y mismo pulgar de 20 que
// SliderEjes, y por lo mismo: el pulgar visible es un div con su transición y
// el input nativo va encima transparente, que es lo único que hace bien —
// recoger el arrastre y el toque en cualquier punto de la barra.
const CSS_TIEMPO = `
  .sl-tiempo { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; padding: 0; touch-action: none; }
  .sl-tiempo::-webkit-slider-runnable-track { background: transparent; height: 7px; }
  .sl-tiempo::-moz-range-track { background: transparent; height: 7px; border: none; }
  .sl-tiempo::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: transparent; border: none; margin-top: -7px; }
  .sl-tiempo::-moz-range-thumb { width: 20px; height: 20px; border: none; border-radius: 50%; background: transparent; }
  .sl-tiempo:focus-visible { outline: 2px solid #2d5a3d; outline-offset: 2px; border-radius: 4px; }
`;

/**
 * Los bloques, y por qué estos tres.
 *
 * Catorce filas seguidas se leen como una lista sin gramática. Se agrupan por
 * el GESTO de cocinarlas, que es lo que el usuario reconoce: una sartén, una
 * bandeja o una olla.
 *
 * "Del horno" no es "verduras": la patata asada en dados especiados es fécula,
 * no verdura, y ocupa otro sitio en la cena y en el reparto de hidratos. Lo que
 * la junta con la bandeja de verdura es que las dos son una bandeja, una vez, y
 * de ahí toda la semana.
 *
 * Boniato, cuscús y quinoa se quedan aunque el catálogo solo tenga cinco, seis
 * y siete platos de cada una —o sea que casi nunca juntarán dos en la misma
 * semana— porque la decisión es de quien cocina, no nuestra.
 *
 * Las que no son fécula no están en MAIN_BASES: viven en `basesAparte`, y
 * `sesgos.js` casa por los dos sitios.
 */
const GRUPOS = [
  { titulo: "Sofritos y salsas", color: "#c0392b", claves: ["sofrito", "salsa_tomate", "bechamel", "pesto"] },
  { titulo: "Del horno", color: "#b2622f", claves: ["verdura_asada", "patatas_asadas"] },
  { titulo: "Ollas y cazuelas", color: "#2e7d75", claves: ["caldo", ...MAIN_BASES] },
];

/**
 * Los bloques de las otras dos patas, por el MISMO criterio que las bases: el
 * gesto. Aquí el gesto es el del día de la tanda, que es lo que estás pagando
 * con el presupuesto de arriba — formar y rebozar, montar una bandeja, rellenar
 * y cerrar. No el de rematarlas, que es trabajo de otro día.
 *
 * "A medias" son doce familias, o sea la misma lista sin gramática que ya se
 * arregló en las bases; y agrupar una pata sí y otra no hacía que la pantalla
 * cambiara de forma al cambiar de pestaña.
 *
 * Los cocinados se parten en dos por la única diferencia que se nota al
 * comerlos: si se recalienta o se saca de la nevera y ya. Hoy el bloque frío
 * tiene una sola fila —y está bien: es un bloque que crecerá, y en el otro
 * grupo el gazpacho se leía como algo que se calienta.
 *
 * Lo que no esté aquí NO se pierde: `bloquesDePlato` recoge las familias
 * sueltas en un último bloque. Una familia nueva en `tandaFamiliasDefs.js` sale
 * en pantalla aunque nadie se acuerde de clasificarla.
 */
const GRUPOS_PLATO = {
  semi: [
    { titulo: "Formados y rebozados", claves: ["croquetas-crudas", "bunuelos-masa", "falafel-crudo", "carne-empanada"] },
    { titulo: "Montados en bandeja", claves: ["empanada-montada", "lasana-montada", "quiche-sin-hornear", "pastel-al-horno"] },
    { titulo: "Rellenos y cerrados", claves: ["empanadillas-cerradas", "ravioli-cortados", "huevos-rellenos", "verduras-rellenas"] },
  ],
  cocinado: [
    { titulo: "De olla", claves: ["caldo-casero", "crema", "sopa"] },
    { titulo: "De nevera", claves: ["gazpacho"] },
  ],
};

/**
 * Las tres patas de la sesión, y por qué son tres y no una lista larga.
 *
 * Cada una contesta una pregunta distinta y se paga distinto:
 *
 *   bases     qué INGREDIENTE dejo hecho. Sirve para varios platos.
 *   semi      qué PLATO dejo a medio hacer. Se remata el día que toca.
 *   cocinado  qué OLLA dejo hecha del todo. Dura varias noches.
 *
 * Juntas en una sola lista, "croquetas" y "arroz" parecían lo mismo y no lo
 * son: el arroz lo repartes entre platos distintos y las croquetas son EL
 * plato. El rodillo de los semi dice justo eso —el trabajo de ese día es dar
 * forma, no cocinar— y la olla de los cocinados, lo contrario.
 */
/**
 * El dibujo de cada pata enseña lo que la define: tres tarros con el sofrito,
 * el cuscús y las lentejas ya hechos; una bandeja de croquetas empanadas SIN
 * freír; y una olla de crema con su cucharón.
 *
 * Van con su fondo y recortadas por encuadre, como las cards del asistente, y
 * no como recortes con alfa: el fondo de estos renders es un degradado crema y
 * el relleno por inundación de `cutout-illustrations.mjs` o se queda corto o se
 * cuela por el cristal de los tarros y los vacía por dentro. Dentro de una card
 * no hace falta que el objeto flote.
 */
const PESTANAS = [
  { id: "bases", label: "Bases", Icon: CookingPot, arte: "/avatares/cards/tandas/bases.jpg" },
  { id: "semi", label: "A medias", Icon: RollingPin, arte: "/avatares/cards/tandas/semi.jpg" },
  { id: "cocinado", label: "Cocinados", Icon: Soup, arte: "/avatares/cards/tandas/cocinado.jpg" },
];

/**
 * Las tres patas como cards ilustradas, no como pestañas de texto.
 *
 * Un `SegmentedControl` de tres palabras —"Bases · A medias · Cocinados"— pide
 * saber de antemano qué significa cada una, y no lo sabe nadie la primera vez:
 * "a medias" no dice croquetas formadas hasta que ves las croquetas. El dibujo
 * lo dice antes de leer, que es lo que hacían las tres tarjetas de la antigua
 * pestaña de En casa.
 *
 * Si el dibujo no carga cae al icono de la pata, que es lo que había antes: una
 * card con un hueco blanco no dice ni lo que decía la palabra.
 */
function PatasDeLaSesion({ valor, onChange, cuentas }) {
  const [rotas, setRotas] = useState({});
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
      {PESTANAS.map((p) => {
        const sel = p.id === valor;
        const color = p.id === "bases" ? "#2e7d75" : COLOR_PATA[p.id];
        const n = cuentas[p.id] ?? 0;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={sel}
            style={{
              position: "relative", display: "flex", flexDirection: "column",
              alignItems: "stretch", padding: 0, overflow: "hidden", borderRadius: 14,
              border: sel ? "2px solid #0f766e" : "1.5px solid #e2eae5",
              background: "#fff",
              boxShadow: sel ? "0 5px 14px rgba(15,118,110,.2)" : "0 1px 3px rgba(20,47,29,.05)",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              transition: "all .16s cubic-bezier(.4,0,.2,1)",
            }}
          >
            {/* Lo pedido de esa pata, en la esquina. Es la razón de que el
                inventario de arriba no tenga que estar abierto para saber si
                ya tocaste "A medias": la card lo lleva escrito. */}
            {n > 0 && (
              <span style={{
                position: "absolute", top: 5, right: 5, zIndex: 2, minWidth: 17, height: 17,
                padding: "0 4px", borderRadius: 999, background: color, color: "#fff",
                fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1.5px solid #fff",
              }}>
                {n}
              </span>
            )}
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              aspectRatio: "5 / 4", background: `${color}10`, overflow: "hidden",
            }}>
              {rotas[p.id] ? (
                <p.Icon size={26} strokeWidth={2} color={color} />
              ) : (
                <img
                  src={p.arte}
                  alt=""
                  onError={() => setRotas((r) => ({ ...r, [p.id]: true }))}
                  // Ya vienen a 5:4 y con el objeto centrado, así que `cover`
                  // solo absorbe el redondeo del ancho de la columna.
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
                />
              )}
            </span>
            {/* Solo el nombre. Debajo iba una línea explicando la pata ("Un
                ingrediente hecho"…) y en la más larga se partía en dos, así que
                una franja quedaba más alta que las otras dos y la fila de tres
                se torcía. Lo que explica la pata es el párrafo de abajo, que ya
                cambia al elegirla — decirlo dos veces costaba el alto.

                `flex: 1` para que la franja se estire hasta el fondo de la
                card: las tres miden lo mismo porque el grid las iguala, pero el
                texto no llenaba ese alto y asomaba un filo blanco bajo el teal
                de la elegida. */}
            <span style={{
              flex: 1, display: "flex", alignItems: "center",
              padding: "8px 8px 9px", background: sel ? "#0f766e" : "#fff",
            }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: sel ? "#fff" : "#142f1d" }}>
                {p.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** El color de cada pata cuando no es una base. El de sopas y cremas es el de
 *  su categoría (DESIGN_SYSTEM §1.6), que es literalmente lo que son. */
const COLOR_PATA = { semi: "#cf7833", cocinado: "#8a6cc4" };

/**
 * Lo que vas a dejar hecho, en fichas — el resumen de la sesión.
 *
 * Es el inventario de En casa, con su misma gramática (miniatura redonda,
 * nombre corto, cuenta), y a propósito: es el mismo tipo de objeto —tarros,
 * ollas, túpers— y reconocerlo de una pantalla a otra es la mitad del trabajo.
 *
 * Pero dice OTRA cosa, y por eso el encabezado va en futuro: En casa cuenta lo
 * que TIENES y esto lo que VAS A DEJAR HECHO el día que te pongas. Con el mismo
 * título se leería como una nevera llena de cosas que no ha cocinado nadie.
 *
 * Solo aparece cuando hay algo: en vacío sería una caja gris explicando que no
 * has contestado la pregunta que tienes justo debajo.
 */
function InventarioDeTanda({ items }) {
  if (!items.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, padding: "11px 12px 12px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", letterSpacing: ".3px" }}>
          DEJARÁS HECHO
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#9ab0a1" }}>
          {items.length} {items.length === 1 ? "tanda" : "tandas"}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map((it) => (
          <span
            key={it.id}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 9px 4px 4px", borderRadius: 999,
              background: `${it.color}12`, border: `1px solid ${it.color}2e`,
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 999, overflow: "hidden", flexShrink: 0,
              background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img src={it.arte} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#142f1d", whiteSpace: "nowrap" }}>
              {it.etiqueta}
            </span>
            <span style={{ fontSize: 11, fontWeight: 900, color: it.color }}>×{it.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Las familias se piden, no se guardan en un const de módulo: el cálculo lee
// el catálogo y el empaquetador no garantiza que ya exista cuando este fichero
// se evalúa. Ver la cabecera de lib/tandaFamilias.js.
const FAMILIAS_DE = (pata) => (pata === "semi" ? familiasSemi() : familiasCocinado());

/** Tope de una familia de plato: el mismo rango que declara la libreta. */
const MAX_PLATOS_SEMANA = 4;

/**
 * Cuántos platos del recetario lleva cada base. Se calcula una vez: el
 * catálogo no cambia mientras la app está abierta.
 *
 * Solo el pool que el generador puede usar de verdad —estrella, sin bases ni
 * salsas— porque prometer sobre platos que nunca se van a proponer es prometer
 * sobre nada.
 */
const PLATOS_POR_BASE = (() => {
  const n = {};
  for (const r of recipeCatalog) {
    if (!r.estrella || r.type === "base" || r.type === "salsa") continue;
    for (const c of clavesDeReceta(r)) n[c] = (n[c] ?? 0) + 1;
  }
  return n;
})();

/**
 * De los platos de cada base, cuántos NO cuentan para cada objetivo semanal.
 *
 * Es lo que permite saber cuánto se puede pedir de una base sin chocar con su
 * tope: de los 31 platos de legumbre, solo 2 no cuentan para `legumbres`, así
 * que con ese objetivo en 2 el límite real son 4 y no cinco.
 */
const SIN_CONTAR_POR_BASE = (() => {
  const n = {};
  for (const r of recipeCatalog) {
    if (!r.estrella || r.type === "base" || r.type === "salsa") continue;
    for (const c of clavesDeReceta(r)) {
      n[c] ??= {};
      for (const [clave, casa] of Object.entries(FREQ_KEY_MATCHERS)) {
        if (!casa(r)) n[c][clave] = (n[c][clave] ?? 0) + 1;
      }
    }
  }
  return n;
})();

export function BasesPreferidas({ data, setData }) {
  const libreta = normalizarLibreta(data?.notepad);
  const [pestana, setPestana] = useState("bases");

  // El presupuesto es de CADA semana, no del menú entero: si se generan cuatro
  // semanas, cada una tiene sus huecos y su propio cuarto del recetario.
  const semanas = Math.max(1, data?.menuWeekOffsets?.length ?? 1);
  const herramientas = [...(data?.kitchenTools ?? []), ...(data?.customKitchenTools ?? [])];
  // Los huecos REALES de la semana, no siete días por la cara.
  //
  // Esto era `DAYS.length * comidas`, o sea siempre 7 días. En una semana
  // partida —tres días de esta y cuatro de la siguiente, que el selector de
  // semanas deja elegir— el deslizador creía tener el doble de sitio del que
  // hay y dejaba pedir tandas que no caben: `basesAlcanzables` las tiraba
  // después con un aviso, así que pedías cinco de sofrito y no salía ninguno.
  //
  // `weeklySlotBudget` es el mismo número que usa el motor al generar
  // (`ctx.slots.length`): cuenta el horario, los días activos y el plato único.
  const huecosSemana = weeklySlotBudget(data).total;
  // Los objetivos semanales de la casa, que son MÁXIMOS y por tanto topan lo
  // que se puede pedir de las bases que los consumen.
  const objetivosDeLaCasa = Object.entries(data?.freqs ?? {})
    .filter(([clave, tope]) => FREQ_KEY_MATCHERS[clave] && tope >= 0);

  const vecesDe = (id) => {
    const n = Math.round(valorDe(libreta, `tanda.${id}`) ?? 0);
    if (n <= 0) return 0;
    // Un 1 guardado por la versión anterior del selector se lee como el mínimo
    // que de verdad sirve, en vez de dejar el pulgar en una posición inválida.
    return Math.min(Math.max(n, MIN_POR_SEMANA), MAX_POR_SEMANA);
  };

  /**
   * Lo pedido de una familia de plato. Vive en `tandaPlatos`, no en `tanda`:
   * aquel cuenta ollas de base y este cuenta platos.
   *
   * Va PEGADO a `vecesDe` y no junto a los otros escritores, que es donde
   * estaba: las manos de la tanda se suman unas lineas mas abajo y llamaban a
   * esto antes de que existiera. En fuente es una zona muerta de manual y en
   * produccion es "Cannot access before initialization" nada mas abrir la
   * pantalla. Lo que se LEE va arriba; lo que ESCRIBE, abajo.
   */
  const vecesDePlato = (id) => {
    const n = Math.round(valorDe(libreta, `tandaPlatos.${id}`) ?? 0);
    return n <= 0 ? 0 : Math.min(n, MAX_PLATOS_SEMANA);
  };

  /**
   * Cero apaga la base; cualquier otra cosa entra al mínimo que hace tanda.
   *
   * El uno no existe como opción y por eso se sube a dos en vez de rechazarse:
   * un plato suelto lo cocinas ese día y no hay nada que partir, así que quien
   * arrastra hasta el 1 está pidiendo la base, no está pidiendo uno.
   */
  // Lo pedido entre todas. Es el límite COMPARTIDO: los huecos de la semana son
  // los que son, y lo que ocupa una base deja de estar libre para las demás.
  //
  // Sumar sobrestima, porque un mismo plato puede servir a dos bases a la vez
  // (una pasta con verduras asadas cuenta para las dos). Se acepta quedarse
  // corto: pasarse significa prometer una tanda que luego se cae con un aviso.
  const pedidoTotal = GRUPOS
    .flatMap((g) => g.claves)
    .reduce((suma, id) => suma + vecesDe(id), 0);

  // ── Cuánto domingo llevas pedido ──────────────────────────────────────────
  // En MANOS, no en reloj, y esa es toda la diferencia: mientras el caldo
  // hierve cuarenta minutos puedes estar picando otra cosa, así que el tiempo
  // muerto se solapa gratis y lo que de verdad se acumula es estar delante. Un
  // presupuesto de reloj diría que dos guisos te comen la mañana cuando en
  // realidad estás leyendo.
  //
  // Sale del aparato que la casa dijo tener en el paso de electrodomésticos:
  // `selectMethodForRecipe` elige el mejor de los suyos para cada base, y con
  // él salen las tandas (una Thermomix hace el caldo en tres vasos) y las
  // manos (una Thermomix también pica, así que el pesto le cuesta menos).
  const comensales = Math.max(1, (data?.members ?? []).length);
  const manosDeBase = (id, veces) => {
    if (veces <= 0) return 0;
    const base = BASES.find((b) => (b.baseKey ?? b.mainBase) === id);
    if (!base) return 0;
    // Un plato de esa base por cada vez pedida, cada uno para toda la casa.
    const raciones = Array.from({ length: veces }, () => comensales);
    const metodo = selectMethodForRecipe(base, herramientas);
    return tiempoDeBase(base, raciones, metodo).minutosActivos ?? 0;
  };
  const manosPedidas = GRUPOS.flatMap((g) => g.claves)
    .reduce((suma, id) => suma + manosDeBase(id, vecesDe(id)), 0);
  // Y lo que cuesta dejar hechos los PLATOS, que se paga igual de caro: una
  // tanda de croquetas son casi sesenta minutos de manos, mas que cualquier
  // base. Contarlo aparte habria dado dos presupuestos para una sola manana.
  const manosDePlatos = familiasPlato()
    .reduce((suma, f) => suma + manosDeTanda(f.id, vecesDePlato(f.id)), 0);
  const manosTotales = manosPedidas + manosDePlatos;
  const presupuesto = minutosDeTanda(data);
  const pasado = manosTotales > presupuesto;

  /**
   * Hasta dónde puede subir una fila sin pasarse del tiempo que has dicho tener.
   *
   * Esto sustituye al aviso de "se pasa de lo que dijiste", que llegaba tarde:
   * te dejaba pedir cuatro horas de domingo y luego te regañaba, y la regañina
   * no decía qué quitar. El deslizador que no sube lo dice en el sitio y en el
   * momento — y la barra de arriba, ya llena, dice por qué.
   *
   * Se descuenta lo que cuesta ESTA fila y se prueba subiendo: el coste no es
   * lineal (una olla de arroz para dos tandas no cuesta el doble que para una),
   * así que no vale dividir el tiempo que queda entre lo que vale una vez.
   *
   * `minimoUtil` es para las bases: arrastrar al 1 guarda un 2 —un plato suelto
   * no es una tanda—, así que lo que hay que ver si cabe es el 2.
   */
  const topePorTiempo = (costeDe, valorActual, topeActual, minimoUtil = 0) => {
    const resto = manosTotales - costeDe(valorActual);
    let alcanzable = valorActual;
    for (let v = valorActual + 1; v <= topeActual; v++) {
      if (resto + costeDe(Math.max(v, minimoUtil)) > presupuesto) break;
      alcanzable = v;
    }
    return alcanzable;
  };

  // ── Lo pedido, de las tres patas juntas ───────────────────────────────────
  // Se arma UNA vez y sirve para dos cosas: las fichas del inventario y la
  // cuenta que lleva cada card de pata. Recorre las mismas fuentes que pintan
  // los deslizadores —los grupos de bases y las familias de plato— y coge de
  // cada una el mismo arte y la misma etiqueta, para que la ficha de arriba y
  // la fila de abajo sean reconociblemente la misma cosa.
  const loPedido = [
    ...GRUPOS.flatMap((g) =>
      g.claves
        .map((id) => ({ id, n: vecesDe(id), grupo: g }))
        .filter((x) => x.n > 0)
        .map(({ id, n, grupo }) => {
          const ui = BASES_UI[id] ?? { etiqueta: id, foto: id };
          return { id: `base:${id}`, pata: "bases", arte: ingredientThumbSrc(ui.foto), etiqueta: ui.etiqueta, color: grupo.color, n };
        })
    ),
    ...["semi", "cocinado"].flatMap((pata) =>
      FAMILIAS_DE(pata)
        .map((f) => ({ f, n: vecesDePlato(f.id) }))
        .filter((x) => x.n > 0)
        .map(({ f, n }) => ({ id: `${pata}:${f.id}`, pata, arte: ingredientThumbSrc(f.id), etiqueta: f.etiqueta, color: COLOR_PATA[pata], n }))
    ),
  ];
  const cuentasPorPata = loPedido.reduce((acc, it) => ({ ...acc, [it.pata]: (acc[it.pata] ?? 0) + 1 }), {});

  // ── Los bloques que se pintan, según la pata abierta ──────────────────────
  const ejeDeBase = (id, color) => {
    const ui = BASES_UI[id] ?? { etiqueta: id, foto: id };
    const n = vecesDe(id);
    // El tope es de esta fila y cambia con lo que pidan las demás. Lo ya pedido
    // AQUÍ no cuenta como ocupado, o el pulgar no podría volver a subir una vez
    // colocado.
    const tope = topeDeBase(PLATOS_POR_BASE[id] ?? 0, {
      semanas,
      huecosLibres: huecosSemana - (pedidoTotal - n),
      objetivos: objetivosDeLaCasa.map(([clave, tope]) => ({
        tope,
        sinContar: SIN_CONTAR_POR_BASE[id]?.[clave] ?? 0,
      })),
    });
    // Dos techos distintos y manda el más bajo: los platos que hay en el
    // recetario para esa base, y el rato que has dicho tener el día de la tanda.
    const conTiempo = topePorTiempo((v) => manosDeBase(id, v), n, tope, MIN_POR_SEMANA);
    const sinSitio = tope < MIN_POR_SEMANA;
    const sinTiempo = conTiempo < MIN_POR_SEMANA && n === 0;
    return {
      id,
      arte: ingredientThumbSrc(ui.foto),
      etiqueta: ui.etiqueta,
      aria: `${ui.etiqueta}: platos por semana`,
      color,
      max: Math.max(conTiempo, n),
      valor: n,
      resumen: n > 0 ? `${n}/sem` : (sinSitio || sinTiempo ? "—" : "No"),
      // Lo que está a cero se apaga: es el estado de casi todas las filas, y en
      // color serían catorce etiquetas gritando que no.
      apagado: n === 0,
      bloqueado: sinTiempo,
    };
  };

  const ejeDePlato = (f) => {
    const n = vecesDePlato(f.id);
    const conTiempo = topePorTiempo((v) => manosDeTanda(f.id, v), n, MAX_PLATOS_SEMANA);
    return {
      id: f.id,
      // La misma ilustración que las bases y por el mismo resolvedor: el id de
      // la familia ES el nombre del dibujo.
      arte: ingredientThumbSrc(f.id),
      etiqueta: f.etiqueta,
      aria: `${f.etiqueta}: veces por semana`,
      color: COLOR_PATA[pestana],
      max: Math.max(conTiempo, n),
      valor: n,
      // Solo las veces, igual que las bases. El resumen llevaba detrás los
      // minutos ("2/sem · 1 h 20") y en 62px de columna se apretaba contra el
      // deslizador; además hacía que dos filas de la misma pantalla se leyeran
      // con gramáticas distintas. Lo que cuesta ya lo dice la barra de arriba.
      resumen: n > 0 ? `${n}/sem` : (conTiempo < 1 ? "—" : "No"),
      apagado: n === 0,
      bloqueado: conTiempo < 1 && n === 0,
    };
  };

  // Las familias sin bloque van a uno propio al final en vez de desaparecer:
  // la pertenencia a una familia se deriva del catálogo, así que una receta
  // nueva puede estrenar familia sin que nadie toque `GRUPOS_PLATO`.
  const bloquesDePlato = (pata) => {
    const familias = FAMILIAS_DE(pata);
    const porId = new Map(familias.map((f) => [f.id, f]));
    const bloques = (GRUPOS_PLATO[pata] ?? []).map((g) => ({
      titulo: g.titulo,
      ejes: g.claves.map((id) => porId.get(id)).filter(Boolean).map(ejeDePlato),
    }));
    const clasificadas = new Set((GRUPOS_PLATO[pata] ?? []).flatMap((g) => g.claves));
    const sueltas = familias.filter((f) => !clasificadas.has(f.id));
    if (sueltas.length) bloques.push({ titulo: "Otros", ejes: sueltas.map(ejeDePlato) });
    return bloques.filter((b) => b.ejes.length);
  };

  const bloques = pestana === "bases"
    ? GRUPOS.map((g) => ({ titulo: g.titulo, ejes: g.claves.map((id) => ejeDeBase(id, g.color)) }))
    : bloquesDePlato(pestana);

  /**
   * Dónde cae un número de minutos en la barra. La MISMA para las dos, y ese
   * es el arreglo: la de arriba iba por el recorrido del deslizador y la de
   * abajo por el máximo, así que con hora y media disponible y media hora
   * gastada, lo gastado se pintaba más largo que lo que tenías.
   */
  const posicion = (min) => Math.max(0, Math.min(1, (min - TANDA_MIN) / (TANDA_MAX - TANDA_MIN)));
  // Y topada en el pulgar: lo invertido no puede dibujarse más allá de lo
  // disponible. Que te hayas pasado lo dice el color y el aviso, no una barra
  // que se sale, porque una barra que se sale no dice cuánto te has pasado.
  const gastado = Math.min(posicion(manosTotales), posicion(presupuesto));

  const escribir = (ruta, n) => setData((d) => {
    const actual = normalizarLibreta(d?.notepad);
    const siguiente = poner(actual, ruta, n, { origen: "pregunta" });
    const vista = proyectar(siguiente);
    const conLibreta = {
      ...d,
      notepad: siguiente,
      sesgos: vista.sesgos ?? {},
      tanda: vista.tanda ?? {},
      tandaPlatos: vista.tandaPlatos ?? {},
    };
    // El día de la tanda necesita sitio, y pedir la primera es lo que lo pide.
    // Lo hacía la card "Batch cooking" que vivía en la pantalla de tiempos; sin
    // ella, el gesto que lo dice es éste. Solo se toca el finde cuando CAMBIA
    // el sí/no —de ninguna tanda a alguna, o al revés— para no reescribir a
    // cada arrastre un tiempo que a lo mejor el usuario ajustó a mano.
    const antes = hayTandasPedidas(d);
    const ahora = hayTandasPedidas(conLibreta);
    return antes === ahora ? conLibreta : abrirFindeParaTanda(conLibreta, ahora);
  });

  const cambiarPlato = (id, v) => escribir(`tandaPlatos.${id}`, Math.max(0, Math.min(v, MAX_PLATOS_SEMANA)));

  const cambiar = (id, v) => {
    const n = v <= 0 ? 0 : Math.min(Math.max(v, MIN_POR_SEMANA), MAX_POR_SEMANA);
    escribir(`tanda.${id}`, n);
  };

  return (
    <div>
      {/* Lo pedido, arriba del todo: es el resultado de la pantalla, y verlo
          crecer es lo que convierte tres pestañas de deslizadores en una sola
          sesión con forma. */}
      <InventarioDeTanda items={loPedido} />

      {/* ── Cuánto quieres cocinar ese día, y cuánto llevas ─────────────────
          El presupuesto va ARRIBA porque es la pregunta que ordena el resto:
          sin él, los deslizadores de abajo son una lista de deseos.

          Dos barras en la MISMA escala y pegadas, que es lo que hace que se
          lean de un vistazo: la de arriba se arrastra y dice lo que tienes, la
          de abajo no se toca y dice lo que llevas gastado. Un segundo
          deslizador para lo gastado habría invitado a arrastrarlo, y eso es
          una salida, no una decisión.

          Lo que se cuenta son MANOS, no reloj. El domingo se solapa —mientras
          el caldo hierve estás picando otra cosa— así que sumar relojes diría
          que dos guisos te comen la mañana cuando en realidad estás leyendo. */}
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
            onChange={(e) => setData((d) => ({ ...d, tandaMinutos: Number(e.target.value) }))}
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
            {manosTotales === 0 ? "nada todavía" : enHoras(aLoGrueso(manosTotales))}
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

      {/* Las tres patas de la sesión. Van DEBAJO del tiempo porque el tiempo
          manda sobre las tres: primero dices cuánto tienes y luego en qué te lo
          gastas. Al revés, cada pata parecía un presupuesto suyo y se podía
          pedir tres veces la misma mañana. */}
      <PatasDeLaSesion valor={pestana} onChange={setPestana} cuentas={cuentasPorPata} />

      {/* Qué es lo que estás pidiendo en esta pata. Vivía arriba del todo, por
          encima del presupuesto, explicando unos deslizadores que quedaban dos
          pantallazos más abajo. */}
      <p style={{ fontSize: 12, color: "#6b7d70", margin: "0 0 10px", lineHeight: 1.4 }}>
        {pestana === "bases" ? (
          <>
            Cuántos platos quieres de cada base a la semana. Desde {MIN_POR_SEMANA},
            que es lo mínimo para que merezca la pena cocinarla aparte.
            {pedidoTotal > 0 && (
              <>
                {" "}Llevas <strong style={{ color: "#2d5a3d" }}>{pedidoTotal} de {huecosSemana}</strong>{" "}
                huecos de la semana.
              </>
            )}
          </>
        ) : pestana === "semi" ? (
          <>El día de la tanda los dejas formados y listos; el día que toca solo se fríen o van al horno.</>
        ) : (
          <>Una olla que se hace entera y da para varias noches de la semana.</>
        )}
      </p>

      {/* Las tres patas se pintan IGUAL: bloque con cabecera de gesto y sus
          filas. Antes solo las bases tenían esa gramática y las otras dos eran
          una lista seguida —doce filas en "A medias"—, así que la misma
          pantalla cambiaba de forma según la pestaña y las doce se leían como
          un montón sin orden. Lo único que cambia entre patas es qué se cuenta
          (platos de esa base / veces de esa familia), no cómo se enseña. */}
      {bloques.map((bloque) => (
        <div key={bloque.titulo} style={{ marginBottom: 14 }}>
          {/* Cabecera de bloque, el mismo patrón con el que la ficha del plato
              separa salsa y guarnición. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", whiteSpace: "nowrap", letterSpacing: ".2px" }}>
              {bloque.titulo}
            </span>
            <div style={{ flex: 1, borderTop: "1.5px dashed #dfeae2" }} />
          </div>

          <SliderEjes
            min={0}
            max={pestana === "bases" ? MAX_POR_SEMANA : MAX_PLATOS_SEMANA}
            step={1}
            ejes={bloque.ejes}
            onChange={pestana === "bases" ? cambiar : cambiarPlato}
          />
        </div>
      ))}
    </div>
  );
}
