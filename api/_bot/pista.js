/**
 * La pista del enrutador para Lola (BOT_PISTA, api/bot/telegram.js).
 *
 * Cuando un turno va a Lola, casi siempre hace DOS llamadas al modelo: la
 * primera solo elige la herramienta (ver_menu, proponer_platos…) y la segunda
 * escribe. Cada una son 2-3 s. Si el enrutador ya ha visto que es una LECTURA
 * con los datos completos («ideas para la cena de hoy», «qué me falta para el
 * cocido»), esa lectura se puede hacer antes, sin modelo, y dársela hecha:
 * Lola contesta en una sola llamada.
 *
 * Lo que pesa en el diseño es el orden: Lola arranca A LA VEZ que el enrutador
 * (Haiku, ~1-1,5 s) y no lo espera, porque esperarlo retrasaría todos los
 * turnos que no tienen nada que adelantar, que son la mayoría (en tráfico
 * real, casi todo lo que va a Lola sale del enrutador como «lola» sin datos).
 * Cuando llega la decisión, la lectura se hace mientras Lola sigue; si sale
 * bien (y en menos de PLAZO_ADELANTO_MS) y su primera llamada aún no ha hecho
 * nada (ni texto, ni herramienta, ni una vuelta acabada), se corta y se
 * vuelve a lanzar con la pista y lo leído. Si ya ha avanzado, o la lectura no
 * trae nada, sigue sin pista: cortarla tiraría trabajo hecho. Así, cuando no
 * hay nada que adelantar, no cuesta ni un milisegundo; cuando lo hay, se
 * ahorra una vuelta entera.
 *
 * Lo leído no cambia el turno por sí solo: sus fotos, lo pintado y el botón a
 * la app solo cuentan si Lola acepta la pista (agente.js adelantoDelTurno).
 *
 * Nunca se adelanta una escritura: solo lo que está en la tabla de abajo, que
 * son herramientas de SOLO_LECTURA (agente.js) o plantillas de plato.js que
 * no tocan nada.
 */

import { CUANDOS } from "./cuando.js";

/** Por debajo, la decisión es demasiado dudosa para gastar en adelantarla. */
export const UMBRAL_PISTA = 0.7;

// Hoy y mañana ya van en la ficha de la casa (ficha.js, «- Hoy:», «- Mañana:»):
// Lola los contesta sin herramienta, en una llamada. Cortarla para darle lo
// que ya tiene la retrasaría.
const EN_LA_FICHA = /^(hoy|mañana|manana)$/i;

// En varias cosas a la vez, adelantar solo compensa si la lectura es lo que
// hace falta para lo demás («qué me falta para el cocido Y apúntalo»: con lo
// que falta ya leído, apunta a la primera). En «qué cenamos hoy y apunta
// leche» la lectura no ahorra la llamada de apuntar y cortar costaría tiempo.
const VARIAS_QUE_DEPENDEN = new Set(["receta", "falta"]);

const PARA_DE_PROPONER = new Set(["mayores", "ninos", "bebe"]);

const solo = (x, claves) => Object.fromEntries(claves.filter((k) => x[k] != null && x[k] !== "" && !(Array.isArray(x[k]) && !x[k].length)).map((k) => [k, x[k]]));

/**
 * Qué se puede leer antes de que Lola lo pida, a partir de la decisión del
 * enrutador. Pura, para el test.
 * @returns {{ herramienta: string, args: object } | { plantilla: "receta"|"calorias"|"falta", datos: object } | null}
 */
// El enrutador solo saca `semana` en consulta y generar: en «ideas para el
// lunes de la semana que viene» el día llega sin semana y proponer_platos
// miraría el lunes de esta. Se deduce del texto; si no lo dice, como la
// herramienta (el próximo día con ese nombre).
const SEMANA_QUE_VIENE = /semana (que viene|pr[oó]xima|siguiente)|pr[oó]xima semana|siguiente semana/i;

/**
 * @param {{ umbral?: number, texto?: string }} [o]  texto: lo que escribió la persona
 */
export function planDeAdelanto(d, { umbral = UMBRAL_PISTA, texto = "" } = {}) {
  if (!d || d.error || !(Number(d.confianza) >= umbral)) return null;
  const x = d.datos ?? {};
  if (x.varias && !VARIAS_QUE_DEPENDEN.has(d.modo)) return null;
  switch (d.modo) {
    case "consulta": {
      if (x.que === "compra") return { herramienta: "ver_compra", args: {} };
      if (x.que !== "menu" || !CUANDOS.includes(x.cuando)) return null;
      if (x.cuando === "dia" && !x.dia) return null;
      if (x.cuando === "rango" && !(x.dia && x.hasta)) return null;
      if (EN_LA_FICHA.test(x.cuando) || (x.cuando === "dia" && EN_LA_FICHA.test(String(x.dia)))) return null;
      return { herramienta: "ver_menu", args: solo(x, ["cuando", "dia", "hasta", "comidas", "platos", "para", "semana"]) };
    }
    case "recomendar": {
      // El enrutador dice «para» con un grupo (mayores, ninos, bebe) o con un
      // nombre; proponer_platos los separa en para y grupo.
      const args = { ...solo(x, ["dia", "comida", "cual", "estilo", "rasgos", "semana"]), n: 3 };
      if (x.para) args[PARA_DE_PROPONER.has(x.para) ? "para" : "grupo"] = x.para;
      if (!args.semana && SEMANA_QUE_VIENE.test(String(texto))) args.semana = "siguiente";
      return { herramienta: "proponer_platos", args };
    }
    case "despensa": return { herramienta: "ver_despensa", args: {} };
    case "receta":
      if (x.plato) return { herramienta: "ver_receta", args: { nombre: x.plato } };
      return x.dia ? { plantilla: "receta", datos: x } : null;
    case "calorias":
    case "falta":
      return x.plato || x.dia ? { plantilla: d.modo, datos: x } : null;
    default: return null;
  }
}

const QUE_PIDE = {
  consulta: "quiere ver algo ya guardado (el menú o la compra)",
  recomendar: "pide ideas para un hueco del menú, sin cambiar nada todavía",
  receta: "quiere ver cómo se hace un plato",
  calorias: "pregunta las calorías de un plato",
  falta: "pregunta qué le falta de la despensa para un plato",
  despensa: "quiere ver lo que hay en la despensa",
};
const DATO = { dia: "día", comida: "comida", plato: "plato", para: "para", cuando: "cuándo", estilo: "estilo", que: "qué" };

/**
 * Lo que ve Lola, en un bloque aparte detrás del mensaje de la persona: fuera
 * de la caché (cambia en cada turno) y fuera de la memoria de la charla (no
 * se guarda: el turno siguiente no lo arrastra). Dicho como lo que es, una
 * deducción que puede fallar, para que mande lo que escribió la persona.
 * @param {{ fuente: string, texto: string }} adelanto
 */
export function textoPista(d, adelanto) {
  const x = d?.datos ?? {};
  const datos = Object.entries(DATO).filter(([k]) => x[k]).map(([k, et]) => `${et}: ${saneado(x[k])}`).join(", ");
  return [
    `[Pista del sistema, NO lo ha escrito la persona] Un clasificador automático cree que ${QUE_PIDE[d?.modo] ?? "pide una consulta"}${datos ? ` (${datos})` : ""}. Es una deducción y puede equivocarse: si no cuadra con lo que ha escrito, manda lo que ha escrito y usa tus herramientas como siempre.`,
    `Para ahorrarte una llamada ya está consultado ${saneado(adelanto.fuente, 300)}. Es lo guardado ahora mismo: no hace falta volver a pedirlo con lo mismo.`,
    String(adelanto.texto ?? "").slice(0, TOPE_LEIDO),
    "Contesta a la persona directamente, sin mencionar esta pista.",
  ].join("\n");
}

// Los datos del enrutador salen del texto de la persona («plato: …»): van en
// una línea, cortos y sin corchetes, para que nadie pueda escribir dentro de
// la pista algo que parezca otra instrucción del sistema.
const saneado = (v, max = 60) => String(typeof v === "object" ? JSON.stringify(v) : v ?? "")
  .replace(/[\p{Cc}[\]<>]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
// Lo leído es nuestro (herramientas y plantillas), pero un menú o una despensa
// enormes no tienen por qué ir enteros.
const TOPE_LEIDO = 4000;

/**
 * Una plantilla de la vía rápida (plato.js), como datos para Lola: sin HTML,
 * sin [[botones]] y sin ✅. Con «✅ Tienes:» copiado en un turno sin
 * escrituras, el control de «dijo que guardó sin guardar» (agente.js
 * DICE_QUE_GUARDO) saltaba: otra vuelta y un FALLO_SIN_GUARDAR falso. Pura.
 */
export function datosDePlantilla(texto) {
  return String(texto ?? "")
    .replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/^\s*\[\[[^\]\n]*\]\]\s*$/gm, "")
    .replace(/✅\s*/g, "")
    .trim();
}

/** Lo máximo que se espera a la lectura adelantada: más, y ya no compensa cortar a Lola. */
export const PLAZO_ADELANTO_MS = 1500;
const conPlazo = (p, ms) => Promise.race([p, new Promise((r) => { setTimeout(() => r(null), ms).unref?.(); })]);

/**
 * Lola sin esperar al enrutador, y con su pista si llega a tiempo.
 *
 * La lectura se hace MIENTRAS Lola sigue con lo suyo, y solo se la corta si
 * la lectura ha salido bien (una plantilla que pregunta «¿comida o cena?», un
 * plato que no está o un fallo devuelven null) y Lola aún no ha hecho nada.
 * Así nunca se tira su llamada a cambio de nada.
 *
 * @param {{
 *   pista: Promise<object|null> | null,
 *   texto?: string,
 *   adelantar: (plan: object, decision: object) => Promise<object|null>,
 *   lanzar: (decision: object|null, adelanto: object|null, signal: AbortSignal|null, o: { reinicio: boolean }) => Promise<any>,
 *   progreso: { vueltas: number, herramientas: number, texto: boolean },
 *   signal?: AbortSignal|null,
 *   alCortar?: (ms: number) => void,
 * }} p
 *   `adelantar` hace la lectura (con PLAZO_ADELANTO_MS); `lanzar`, el turno de
 *   Lola; `progreso` lo va rellenando Lola (agente.js ejecutar/unaVuelta).
 */
export async function conPista({ pista, texto = "", adelantar, lanzar, progreso, signal = null, alCortar = null }) {
  if (!pista) return lanzar(null, null, signal, { reinicio: false });
  const quieta = () => !progreso.vueltas && !progreso.herramientas && !progreso.texto;
  const leer = (d) => {
    const plan = planDeAdelanto(d, { texto });
    return plan ? conPlazo(Promise.resolve().then(() => adelantar(plan, d)).catch(() => null), PLAZO_ADELANTO_MS) : Promise.resolve(null);
  };
  let decision; // undefined: aún no ha llegado
  let lanzada = false;
  let leido = null;
  let reinicio = false;
  const corte = new AbortController();
  const t0 = Date.now();
  // Si la pista ya ha llegado al arrancar (rara vez: el enrutador suele tardar
  // más que preparar a Lola), la lectura se hace antes y va desde la primera
  // llamada. El `await` deja correr antes el `then` de una pista ya resuelta.
  pista.then((d) => { decision = d ?? null; }, () => { decision = null; });
  await null;
  if (decision !== undefined) {
    leido = decision ? await leer(decision) : null;
    return lanzar(decision, leido, signal, { reinicio: false });
  }
  pista.then(async (d) => {
    if (!d || !lanzada || !quieta() || signal?.aborted) return;
    const a = await leer(d);
    if (a && quieta() && !signal?.aborted) { leido = a; reinicio = true; alCortar?.(Date.now() - t0); corte.abort(); }
  }, () => {});
  lanzada = true;
  try {
    return await lanzar(null, null, signal ? AbortSignal.any([signal, corte.signal]) : corte.signal, { reinicio: false });
  } catch (err) {
    if (!reinicio || signal?.aborted) throw err;
    return lanzar(decision, leido, signal, { reinicio: true });
  }
}
