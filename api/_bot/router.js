/**
 * El enrutador de Lola: decide, antes que el modelo grande, si un mensaje es
 * de los que se resuelven al momento (ver el menú, recomendar, apuntar en la
 * compra, cambiar un plato concreto, generar la semana) o necesita a Lola
 * entera (configurar la casa, alergias, fotos, recetas, charla, lo ambiguo).
 *
 * Cascada, de lo barato a lo caro (Anthropic «routing», Sierra «constellation
 * of models», el consenso de 2026 para enrutadores de agentes):
 *
 *   0. Estado de la conversación (0 ms): si Lola acaba de dar opciones y le
 *      contestan con una, eso es elegir, no una pregunta nueva. Lo resuelve
 *      api/_bot/turno.js mirando el último mensaje de Lola, sin modelo.
 *   1. Este clasificador (Haiku, ~0,5 s): modo + confianza + los datos que
 *      hacen falta (día, comida, para quién, rasgos…), con formato cerrado.
 *   2. Lola (Sonnet con herramientas) para todo lo demás y para lo que aquí
 *      salga con poca confianza.
 *
 * Aquí solo se DECIDE; actuar lo hace api/_bot/turno.js.
 */

import { IDS_COMIDAS, COMIDAS_PRINCIPALES, IDS_PLATOS, COMIDAS as CATALOGO, comidasEnTexto } from "../../src/lib/comidas.js";
import { CUANDOS } from "./cuando.js";
import Anthropic from "@anthropic-ai/sdk";

export const MODELO_ROUTER = process.env.BOT_ROUTER_MODELO || "claude-haiku-4-5-20251001";
/** Por encima, se actúa sin Lola; por debajo, a Lola. */
// El umbral general ya no decide (cada modo tiene el suyo en POLITICA); se
// queda exportado para scripts/router-feedback.mjs, que lo usa de referencia.
export const UMBRAL = Number(process.env.BOT_ROUTER_UMBRAL) || 0.8;

// receta, calorias, falta y despensa: plantillas de lectura (api/_bot/plato.js).
// ausencia: «hoy cenamos fuera» (la plantilla la conecta otra sesión; mientras
// no está en POLITICA, va a Lola).
export const MODOS = ["consulta", "recomendar", "cambiar", "compra_anadir", "compra_marcar", "generar", "deshacer", "receta", "calorias", "falta", "despensa", "ausencia", "lola"];
const DIAS = ["hoy", "mañana", "pasado mañana", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
// Del catálogo de comidas (src/lib/comidas.js), aperitivo incluido aunque aún
// no se planifique: así se entiende y pintarMenu puede decir que no lo hay.
const COMIDAS = IDS_COMIDAS;

// PLANO a propósito: con objetos anidados (consulta/plato/compra/generar) el
// modelo pequeño acertaba el modo y se dejaba los datos sin rellenar (6 de 46
// en la primera pasada de scripts/router-evals.mjs).
const RASGOS = {
  type: "object",
  properties: {
    connotacion: { type: "string", enum: ["reconfortante", "fresco", "casero", "festivo"] },
    textura: { type: "string", enum: ["cuchara", "tenedor", "mano"] },
    picante: { type: "string", enum: ["sin", "con"] },
    sabor: { type: "string", enum: ["suave", "intenso", "especiado", "dulce", "acido", "ahumado"] },
    coste: { type: "string", enum: ["economico", "medio", "caro"] },
    calorias: { type: "string", enum: ["ligero", "medio", "contundente"] },
  },
  additionalProperties: false,
};
export const ESQUEMA = {
  type: "object",
  properties: {
    modo: { type: "string", enum: MODOS },
    varias: { type: "boolean", description: "true si el mensaje pide MÁS DE UNA cosa distinta (cambiar un plato Y apuntar algo, ver el menú Y configurar…)." },
    confianza: { type: "number", description: "0 a 1." },
    que: { type: "string", enum: ["menu", "compra"], description: "Solo en consulta: el menú o la compra." },
    cuando: { type: "string", enum: CUANDOS, description: "Solo en consulta del menú: qué días. dia = un día (va en dia); rango = de un día a otro (dia y hasta)." },
    dia: { type: "string", enum: DIAS, description: "consulta de un día (o el primero de un rango), recomendar o cambiar." },
    hasta: { type: "string", enum: DIAS, description: "Solo en consulta con cuando=rango: el último día." },
    comidas: { type: "array", items: { type: "string", enum: COMIDAS }, description: "Solo en consulta, si las dicen («solo cenas», «qué desayunamos»): qué comidas ver." },
    platos: { type: "array", items: { type: "string", enum: IDS_PLATOS }, description: "Solo en consulta, si lo dicen: primero («los primeros») o principal («los segundos»)." },
    comida: { type: "string", enum: COMIDAS, description: "recomendar o cambiar." },
    cual: { type: "string", enum: ["principal", "primero"] },
    para: { type: "string", description: "«mayores», «ninos» o «bebe»; o el nombre de una persona de la casa si la nombran («para Cova» → «Cova»)." },
    estilo: { type: "string", enum: ["ligero", "rapido"] },
    rasgos: RASGOS,
    receta: { type: "string", description: "cambiar: el plato que quieren poner, si lo nombran (ahora o en su mensaje anterior)." },
    plato: { type: "string", description: "receta, calorias o falta: el plato del que preguntan por su NOMBRE, si lo nombran («la tortilla», «las lentejas»). Si lo dicen por su hueco («la cena de hoy»), va en dia y comida." },
    cualquiera: { type: "boolean", description: "cambiar sin receta: true solo si piden otra cosa cualquiera («cámbiala», «otra cosa», «la que sea»)." },
    productos: { type: "array", items: { type: "string" }, description: "compra_anadir o compra_marcar: cada producto tal cual lo dicen." },
    semana: { type: "string", enum: ["esta", "siguiente"], description: "generar: OBLIGATORIO. En consulta con cuando=dia o rango, «siguiente» si dicen «de la semana que viene» («el jueves de la semana que viene»)." },
    fijos: {
      type: "array",
      items: { type: "object", properties: { nombre: { type: "string" }, comida: { type: "string", enum: COMIDAS_PRINCIPALES } }, required: ["nombre"], additionalProperties: false },
      description: "generar: platos que piden por su nombre para esa semana.",
    },
  },
  required: ["modo", "varias", "confianza"],
  additionalProperties: false,
};

export const REGLAS = `Eres el enrutador de Lola, la cocinera de casa de una app de menús familiares (HoMenu). No contestas al usuario: solo clasificas su mensaje y sacas los datos. Elige UN modo:

- consulta: quiere VER algo ya guardado. que=compra («¿qué falta por comprar?», «la lista»), o que=menu con cuando: hoy («¿qué comemos hoy?», «¿qué hay de cena?»), manana, pasado_manana, dia + el día («¿qué hay el jueves?»), finde («¿qué cenamos este finde?»), finde_que_viene, esta_semana («pásame el menú»), semana_que_viene («el menú de la semana que viene»), rango + dia + hasta («de lunes a miércoles»). Si dicen comidas, en comidas («solo cenas», «¿qué desayunamos?», «las meriendas»); si dicen platos, en platos («los primeros»); si es para alguien, en para («los niños» = ninos, «el bebé» = bebe, o el nombre).
- recomendar: pide ideas u opciones para UN hueco, sin cambiar nada todavía («¿qué me recomiendas para cenar?», «ideas para la comida del jueves», «algo ligero para esta noche», «¿qué le hago de cenar al bebé?», «¿qué le preparo a Leo?»). «Qué le hago / qué le preparo» es pedir ideas; «qué hay / qué toca / qué comemos» es consulta. Saca día, comida, para quién y rasgos solo si los dice ESTE mensaje o se deducen sin duda de él («con mi mujer», «para nosotros» = mayores; los niños = ninos; el bebé solo si lo nombran; una persona por su nombre, tal cual). «Para quién» no se arrastra de mensajes anteriores: si ahora no lo dice, va vacío. «Ligero» y «rápido» van en estilo. «Reconfortante», «de cuchara», «que no pique», «barato», «fresquito», «contundente» van en rasgos.
- cambiar: quiere cambiar YA un plato concreto del menú y dice qué día («cambia la cena del jueves», «pon lentejas el martes a mediodía», «el viernes cenamos pizza, cámbialo», «¿podemos hacer pizza casera el viernes?»). La comida (Comida o Cena) si la dice; si solo dice el día, déjala vacía: se pregunta después. receta = el plato nuevo si lo nombra, ahora o en su mensaje anterior (dijo «pizza congelada» y ahora contesta «el viernes de cena» → receta = pizza congelada), o un tipo de plato («la carne», «algo de pescado»). cualquiera = true solo si pide otra cosa sin importarle cuál («cámbiala por lo que sea», «otra cosa cualquiera»). Si no dice ni el día, es lola. Si es algo que se repite («los viernes», «todos los lunes», «siempre»), no es un cambio de una vez: es lola. Mover un plato de un día a otro («pon el arroz el domingo en vez del sábado») es lola. Si pregunta POR QUÉ se puso algo («¿xk tortilla esta noche?»), es lola.
- compra_anadir: apuntar cosas en la lista («apunta leche y pan», «añade pilas»). compra_marcar: tachar lo comprado («ya tengo los huevos», «compré la leche»).
- generar: pide un menú nuevo para esta semana o la que viene. Si nombra platos que quiere esa semana, en fijos.
- deshacer: «deshaz», «uy no, deja lo de antes», «vuelve a como estaba».
- receta: quiere ver CÓMO SE HACE un plato, entero («¿cómo se hace la tortilla del miércoles?», «pásame la receta de la cena de hoy»). El plato por su nombre en plato, o su hueco en dia y comida. Una pregunta concreta sobre el plato («¿lleva horno?», «¿se puede congelar?») es lola.
- calorias: cuántas calorías tiene un plato («¿cuántas calorías tiene la cena de hoy?», «¿engorda mucho la lasaña?»). plato o dia y comida, como en receta. Si pregunta si le conviene por salud, es lola.
- falta: qué le falta de la despensa para hacer un plato («¿qué me falta para las lentejas?», «¿tengo todo para la cena de mañana?»). plato o dia y comida.
- despensa: ver lo que hay en la despensa, la nevera o el congelador («¿qué tengo en la despensa?», «¿qué queda en el congelador?»). La lista de la COMPRA es consulta con que=compra; tirarla, vaciarla o borrarla («tiras lista compra») es lola.
- ausencia: alguien NO COME EN CASA una comida concreta, o no se cocina ese día («hoy cenamos fuera», «el jueves no como en casa», «q el jueves comida no xq no tengo tiempo, cámbialo»: eso NO es cambiar el plato). dia, comida y para quién (vacío = toda la casa). Si es todas las semanas («los jueves comemos fuera»), es lola. Si VIENE alguien de fuera («el miércoles viene mi suegra a cenar»), no es ausencia: es lola (invitados).
- lola: TODO lo demás, y siempre que dudes: configurar la casa (quién come, horarios, gustos, trastos), alergias, peso o altura, recetas (crearla, buscarlas; VER cómo se hace una es receta), fotos, recordatorios, compartir, preguntas de cocina o de «por qué», saludos y charla, varias peticiones mezcladas, y cualquier respuesta a una pregunta de Lola que no sea elegir un plato o un día.

Contexto: si Lola acaba de preguntar algo («¿para qué día?», «¿comida o cena?») y el mensaje es la respuesta, completa con él la petición que estaba en curso (la que dijo el usuario justo antes) (p. ej. Lola preguntó el día de una recomendación y dicen «para hoy» → recomendar con dia=hoy). No confundas esa respuesta con una consulta del menú.

Para saber de QUÉ COMIDA hablan (campos comida y comidas; el plato que quieren poner sigue yendo en receta, p. ej. «el viernes cenamos pizza» → comida Cena, receta pizza): ${CATALOGO.map((c) => `${c.id} = ${c.sinonimos.join(", ")}`).join("; ")}. «¿Qué comemos hoy?» o «¿qué hay mañana?» son el día entero: sin comidas.

Rellena SIEMPRE los campos que el modo necesita: que y cuando (consulta del menú), productos (compra), semana (generar), dia (cambiar; la comida si la dicen), plato o dia (receta, calorias, falta). Los días relativos déjalos como los dicen («hoy», «mañana»).

confianza: 0,9 o más solo si el modo es inequívoco y tienes los datos que ese modo necesita. En cambiar, receta y comida son opcionales (la comida se pregunta después): que no las digan no baja la confianza. Si falta algo obligatorio o dudas entre dos modos, baja de 0,8 o usa lola.`;
// Sin los ejemplos de api/_bot/routerEjemplos.js a propósito: en el examen
// cruzado no mejoraban el acierto (96/115 frente a 100/115) y, con 5.000 tokens
// de instrucciones, el enrutador pasaba de los 2 s de plazo en 8 de 170
// llamadas (antes, ninguna). Se quedan como banco de pruebas.

let cliente = null;
const anthropic = () => (cliente ??= new Anthropic());

/**
 * @param {{ texto: string, contexto: { ahora: string, personas?: string[], grupos?: string[], hayMenu?: boolean, ultimaDeLola?: string|null, anteriorDelUsuario?: string|null } }} p
 * @returns {Promise<{ modo: string, confianza: number, datos: object, ms: number, error?: string }>}
 */
export async function clasificar({ texto, contexto }, { signal, reglas = REGLAS } = {}) {
  const t0 = Date.now();
  const ctx = [
    `Ahora en España: ${contexto.ahora}.`,
    contexto.personas?.length ? `En casa: ${contexto.personas.join(", ")}.` : "",
    contexto.grupos?.length ? `Grupos de menú: ${contexto.grupos.join(", ")}.` : "",
    `¿Hay menú activo esta semana? ${contexto.hayMenu ? "sí" : "no"}.`,
    contexto.anteriorDelUsuario ? `Lo que dijo el usuario justo antes: «${String(contexto.anteriorDelUsuario).slice(0, 300)}»` : "",
    contexto.ultimaDeLola ? `Lo último que dijo Lola: «${String(contexto.ultimaDeLola).slice(0, 500)}»` : "",
  ].filter(Boolean).join("\n");
  try {
    const r = await anthropic().messages.create({
      model: MODELO_ROUTER,
      max_tokens: 500,
      temperature: 0,
      // `reglas` solo cambia en las pruebas (scripts/router-ejemplos-examen.mjs).
      system: [{ type: "text", text: reglas, cache_control: { type: "ephemeral" } }],
      tools: [{ name: "enrutar", description: "Decide el modo del mensaje y saca sus datos.", input_schema: ESQUEMA }],
      tool_choice: { type: "tool", name: "enrutar" },
      messages: [{ role: "user", content: `${ctx}\n\nMensaje: «${texto}»` }],
      // Corto y sin reintentos: si Haiku tarda o falla, contesta Lola (que ya
      // ha arrancado) y no se pierde nada; reintentar solo alargaría la espera.
    }, { signal, timeout: PLAZO_ROUTER_MS, maxRetries: 0 });
    const bloque = (r.content ?? []).find((b) => b.type === "tool_use");
    const x = bloque?.input ?? {};
    const modo = MODOS.includes(x.modo) ? x.modo : "lola";
    const confianza = Math.max(0, Math.min(1, Number(x.confianza) || 0));
    const { modo: _m, confianza: _c, ...datos } = x;
    // Red para las comidas de una consulta: si el modelo no las ha sacado,
    // se buscan en la frase con los sinónimos del catálogo («cenamos» → Cena,
    // «picoteo» → Aperitivo). Así una comida nueva en el catálogo se entiende
    // aunque el modelo pequeño no la recoja.
    if (modo === "consulta" && datos.que === "menu" && !datos.comidas?.length) {
      const vistas = comidasEnTexto(texto);
      if (vistas.length) datos.comidas = vistas;
    }
    return { modo, confianza, datos, ms: Date.now() - t0, uso: r.usage };
  } catch (err) {
    // Si el enrutador falla, Lola: nunca se queda un mensaje sin contestar.
    return { modo: "lola", confianza: 0, datos: {}, ms: Date.now() - t0, error: String(err?.message ?? err).slice(0, 200) };
  }
}

/** ¿Se actúa sin Lola? Solo por encima del umbral y con los datos que el modo necesita. */
/**
 * La política del enrutador, en UNA tabla: cada modo con su riesgo, el umbral
 * de confianza en un chat privado y si va por la vía rápida en un chat de
 * grupo de Telegram (y con qué condición). Se decide por la complejidad y el
 * riesgo de lo que se pide, no por el tipo de chat: en grupo solo se añade
 * algo donde hay riesgo real de malentendido.
 *
 *   una_persona  en grupo, solo si el turno es de UNA persona (si se juntan
 *                mensajes de varias, a Lola: no se sabe de quién es qué)
 *
 * Un modo que no está en la tabla va siempre a Lola (seguro por defecto). Los
 * umbrales son un punto de partida: se calibran con scripts/router-evals.mjs
 * y el modo sombra (BOT_ROUTER_GRUPOS).
 */
// Lo que se espera al enrutador. Lola arranca a la vez pero no entrega hasta
// que él decide: con 5 s, un Haiku colgado retenía una respuesta ya hecha.
// Mediana ~1,1 s y p90 ~1,6 s (router-evals): con 2 s, lo que tarde más va a Lola.
export const PLAZO_ROUTER_MS = 2000;

export const POLITICA = {
  consulta: { riesgo: "solo lee", umbral: 0.8, enGrupo: true, condicionGrupo: null, lector: true },
  recomendar: { riesgo: "solo lee, ofrece opciones", umbral: 0.8, enGrupo: true, condicionGrupo: "una_persona", lector: true },
  compra_anadir: { riesgo: "escribe, fácil de deshacer", umbral: 0.85, enGrupo: true, condicionGrupo: "una_persona", lector: false },
  compra_marcar: { riesgo: "escribe, fácil de deshacer", umbral: 0.85, enGrupo: true, condicionGrupo: "una_persona", lector: true },
  // En grupo hay que decir quién lo pidió y de quién era el plato: Lola.
  cambiar: { riesgo: "escribe en el menú", umbral: 0.9, enGrupo: false, condicionGrupo: null, lector: false },
  generar: { riesgo: "escribe la semana entera", umbral: 0.9, enGrupo: false, condicionGrupo: null, lector: false },
  // ¿El cambio de quién? En grupo, Lola.
  deshacer: { riesgo: "escribe", umbral: 0.9, enGrupo: false, condicionGrupo: null, lector: false },
  // Plantillas de lectura de un plato o de la despensa (api/_bot/plato.js).
  receta: { riesgo: "solo lee", umbral: 0.8, enGrupo: true, condicionGrupo: null, lector: true },
  calorias: { riesgo: "solo lee", umbral: 0.8, enGrupo: true, condicionGrupo: null, lector: true },
  falta: { riesgo: "solo lee", umbral: 0.8, enGrupo: true, condicionGrupo: null, lector: true },
  despensa: { riesgo: "solo lee", umbral: 0.8, enGrupo: true, condicionGrupo: null, lector: true },
  // «Hoy cenamos fuera»: escribe (una regla de un día y el hueco vaciado), con
  // deshacer. En grupo, ¿quién no viene? Lola.
  ausencia: { riesgo: "escribe, fácil de deshacer", umbral: 0.9, enGrupo: false, condicionGrupo: null, lector: false },
  // Paso 0 (elegir una de las opciones que acaba de dar Lola): no pasa por el
  // enrutador, pero se rige por esta misma fila (¿quién eligió?).
  eleccion: { riesgo: "escribe", umbral: null, enGrupo: false, condicionGrupo: null, lector: false },
};

/** ¿Se puede hacer por la vía rápida en este chat? Solo lo que dice la tabla. */
// `lector` (POLITICA): si lo puede pedir un lector de la casa por la vía
// rápida. Solo leer, y tachar la compra. Alguien sin cuenta («ajeno»), solo
// leer. Sin papel, como hasta ahora (lo pone siempre turno(), telegram.js).
export function permitidoEn(modo, { esGrupo = false, variosAutores = false, papel = "owner" } = {}) {
  const p = POLITICA[modo];
  if (!p) return false;
  if (papel === "viewer" && !p.lector) return false;
  if (papel === "ajeno" && (!p.lector || modo === "compra_marcar")) return false;
  if (!esGrupo) return true;
  if (!p.enGrupo) return false;
  return !(p.condicionGrupo === "una_persona" && variosAutores);
}

export function vaPorLaRapida(d, { esGrupo = false, variosAutores = false, papel = "owner" } = {}) {
  const p = d ? POLITICA[d.modo] : null;
  const x = d?.datos ?? {};
  // Un cambio sin comida no escribe nada todavía: primero pregunta «¿comida o
  // cena?». Hasta la respuesta es una lectura, y se le pide lo que a una.
  const preguntaPrimero = (d?.modo === "cambiar" || d?.modo === "ausencia") && !x.comida;
  const umbral = preguntaPrimero ? POLITICA.consulta.umbral : p?.umbral;
  if (!p || umbral == null || d.confianza < umbral) return false;
  if (!permitidoEn(d.modo, { esGrupo, variosAutores, papel })) return false;
  // Dos peticiones en un mensaje: la vía rápida haría una y perdería la otra.
  if (x.varias) return false;
  // Consulta: la compra, o el menú con días que se puedan resolver.
  if (d.modo === "consulta") {
    if (x.que === "compra") return true;
    if (x.que !== "menu" || !CUANDOS.includes(x.cuando)) return false;
    if (x.cuando === "dia") return Boolean(x.dia);
    if (x.cuando === "rango") return Boolean(x.dia && x.hasta);
    return true;
  }
  // Sin plato ni «otra cosa», la vía rápida no elige: ofrece tres opciones
  // (turno.js). Antes ponía una al azar (la pizza que salió fettuccine).
  // Sin comida ya no va a Lola: la vía rápida la pregunta con botones (plato.js).
  if (d.modo === "cambiar") return Boolean(x.dia);
  if (d.modo === "receta" || d.modo === "calorias" || d.modo === "falta") return Boolean(x.plato || x.dia);
  // «Cenamos fuera» sin día es hoy; sin comida, se pregunta.
  if (d.modo === "ausencia") return Boolean(x.dia || x.comida);
  if (d.modo === "compra_anadir" || d.modo === "compra_marcar") return (x.productos ?? []).length > 0;
  // Con platos pedidos, Lola: cuenta dónde han caído y qué no ha cabido. No
  // depende de la confianza, que con estas frases baila entre 0,85 y 0,95.
  if (d.modo === "generar") return Boolean(x.semana) && !(Array.isArray(x.fijos) ? x.fijos.length : String(x.fijos ?? "").trim());
  return true; // recomendar (todo opcional) y deshacer
}
