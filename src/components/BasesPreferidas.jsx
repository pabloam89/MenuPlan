import { MAX_POR_SEMANA, MIN_POR_SEMANA, clavesDeReceta, topeDeBase } from "../lib/bases.js";
import { weeklySlotBudget } from "../lib/planner.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { MAIN_BASES } from "../data/recipeSchema.js";
import { BASES_UI } from "../lib/basesUI.js";
import { ingredientThumbSrc } from "../lib/ingredientImages.js";
import { normalizar as normalizarLibreta, poner, proyectar, valorDe } from "../lib/notepad.js";
import { SliderEjes } from "./wizard/SliderEjes.jsx";

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

  // El presupuesto es de CADA semana, no del menú entero: si se generan cuatro
  // semanas, cada una tiene sus huecos y su propio cuarto del recetario.
  const semanas = Math.max(1, data?.menuWeekOffsets?.length ?? 1);
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

  const cambiar = (id, v) => {
    const n = v <= 0 ? 0 : Math.min(Math.max(v, MIN_POR_SEMANA), MAX_POR_SEMANA);
    setData((d) => {
      const actual = normalizarLibreta(d?.notepad);
      const siguiente = poner(actual, `tanda.${id}`, n, { origen: "pregunta" });
      const vista = proyectar(siguiente);
      return { ...d, notepad: siguiente, sesgos: vista.sesgos ?? {}, tanda: vista.tanda ?? {} };
    });
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: "#6b7d70", margin: "0 0 10px", lineHeight: 1.4 }}>
        Cuántos platos quieres de cada base a la semana. Desde {MIN_POR_SEMANA},
        que es lo mínimo para que merezca la pena cocinarla aparte.
        {pedidoTotal > 0 && (
          <>
            {" "}Llevas <strong style={{ color: "#2d5a3d" }}>{pedidoTotal} de {huecosSemana}</strong>{" "}
            huecos de la semana.
          </>
        )}
      </p>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} style={{ marginBottom: 14 }}>
          {/* Cabecera de bloque, el mismo patrón con el que la ficha del plato
              separa salsa y guarnición. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", whiteSpace: "nowrap", letterSpacing: ".2px" }}>
              {grupo.titulo}
            </span>
            <div style={{ flex: 1, borderTop: "1.5px dashed #dfeae2" }} />
          </div>

          <SliderEjes
            min={0}
            max={MAX_POR_SEMANA}
            step={1}
            ejes={grupo.claves.map((id) => {
              const ui = BASES_UI[id] ?? { etiqueta: id, foto: id };
              const n = vecesDe(id);
              // El tope es de esta fila y cambia con lo que pidan las demás.
              // Lo ya pedido AQUÍ no cuenta como ocupado, o el pulgar no podría
              // volver a subir una vez colocado.
              const tope = topeDeBase(PLATOS_POR_BASE[id] ?? 0, {
                semanas,
                huecosLibres: huecosSemana - (pedidoTotal - n),
                objetivos: objetivosDeLaCasa.map(([clave, tope]) => ({
                  tope,
                  sinContar: SIN_CONTAR_POR_BASE[id]?.[clave] ?? 0,
                })),
              });
              const sinSitio = tope < MIN_POR_SEMANA;
              return {
                id,
                arte: ingredientThumbSrc(ui.foto),
                etiqueta: ui.etiqueta,
                aria: `${ui.etiqueta}: platos por semana`,
                color: grupo.color,
                max: Math.max(tope, n),
                valor: n,
                resumen: n > 0 ? `${n}/sem` : (sinSitio ? "—" : "No"),
                // Lo que está a cero se apaga: es el estado de casi todas las
                // filas, y en color serían catorce etiquetas gritando que no.
                apagado: n === 0,
              };
            })}
            onChange={cambiar}
          />
        </div>
      ))}
    </div>
  );
}
