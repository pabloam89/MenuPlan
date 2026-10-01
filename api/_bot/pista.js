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
 * Si la decisión llega mientras su primera llamada aún no ha hecho nada
 * (ni texto, ni herramienta, ni una vuelta acabada), se corta y se vuelve a
 * lanzar con la pista y la lectura hecha. Si ya ha avanzado, sigue sin pista:
 * cortarla tiraría trabajo hecho. Así, cuando no hay nada que adelantar, no
 * cuesta ni un milisegundo; cuando lo hay, se ahorra una vuelta entera.
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
export function planDeAdelanto(d, { umbral = UMBRAL_PISTA } = {}) {
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
      const args = { ...solo(x, ["dia", "comida", "cual", "estilo", "rasgos"]), n: 3 };
      if (x.para) args[PARA_DE_PROPONER.has(x.para) ? "para" : "grupo"] = x.para;
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
  const datos = Object.entries(DATO).filter(([k]) => x[k]).map(([k, et]) => `${et}: ${x[k]}`).join(", ");
  return [
    `[Pista del sistema, NO lo ha escrito la persona] Un clasificador automático cree que ${QUE_PIDE[d?.modo] ?? "pide una consulta"}${datos ? ` (${datos})` : ""}. Es una deducción y puede equivocarse: si no cuadra con lo que ha escrito, manda lo que ha escrito y usa tus herramientas como siempre.`,
    `Para ahorrarte una llamada ya está consultado ${adelanto.fuente}. Es lo guardado ahora mismo: no hace falta volver a pedirlo con lo mismo.`,
    adelanto.texto,
    "Contesta a la persona directamente, sin mencionar esta pista.",
  ].join("\n");
}

/**
 * Lola sin esperar al enrutador, y con su pista si llega a tiempo.
 *
 * @param {{
 *   pista: Promise<object|null> | null,
 *   lanzar: (decision: object|null, signal: AbortSignal|null, o: { reinicio: boolean }) => Promise<any>,
 *   progreso: { vueltas: number, herramientas: number, texto: boolean },
 *   signal?: AbortSignal|null,
 * }} p
 *   `lanzar` hace el turno de Lola (adelanta la lectura si la decisión trae
 *   plan); `progreso` lo va rellenando Lola (agente.js ejecutar/unaVuelta).
 */
export async function conPista({ pista, lanzar, progreso, signal = null }) {
  if (!pista) return lanzar(null, signal, { reinicio: false });
  let decision; // undefined: aún no ha llegado
  let lanzada = false;
  let reinicio = false;
  const corte = new AbortController();
  pista.then((d) => {
    decision = d ?? null;
    const quieta = !progreso.vueltas && !progreso.herramientas && !progreso.texto;
    if (lanzada && quieta && planDeAdelanto(decision)) { reinicio = true; corte.abort(); }
  }, () => { decision = null; });
  // Si ya ha llegado (rara vez: el enrutador suele tardar más que preparar a
  // Lola), va puesta desde la primera llamada y no hay nada que cortar. El
  // `await` deja correr antes el `then` de una pista ya resuelta.
  await null;
  lanzada = true;
  try {
    return await lanzar(decision ?? null, signal ? AbortSignal.any([signal, corte.signal]) : corte.signal, { reinicio: false });
  } catch (err) {
    if (!reinicio || signal?.aborted) throw err;
    return lanzar(decision, signal, { reinicio: true });
  }
}
