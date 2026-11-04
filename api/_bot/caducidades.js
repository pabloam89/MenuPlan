/**
 * Las cosas que caducan, con dueño (#958, raíz 4).
 *
 * Antes nadie caducaba nada: un embarazo «hasta el 30-sep» seguía filtrando en
 * noviembre, un «¿comida o cena?» contestado al día siguiente ejecutaba el
 * cambio que quedó pendiente, y los mensajes que se quedaban en la cola cuando
 * moría el turno que los tenía no los recogía nadie hasta que alguien volvía a
 * escribir (y entonces se mezclaban con lo nuevo).
 *
 * Todo lo que caduca está en COSAS_QUE_CADUCAN, una lista cerrada (test en
 * caducidades.test.js). Cada cosa dice quién la caduca:
 *   · «lectura»: quien la lee la ignora pasada su vida (vigente()). Es lo que
 *     vive dentro de un mensaje guardado y no merece una escritura.
 *   · «barrido»: la pasada del cron (barrer(), desde /api/bot/recordatorios,
 *     con la cadencia de cadencia.js) hace lo que diga su `efecto`.
 * Un tipo nuevo (la dieta blanda, #959) se añade aquí y, si es de barrido, con
 * su función en BARRIDOS: el test exige que cada una tenga la suya.
 *
 * Los datos de salud NO se borran solos: pasada la fecha, se abre una pregunta
 * para que Lola la haga (bot_tareas) y la persona decida.
 */

import { select, insert, update, eq } from "./db.js";
import { esDuplicado } from "./entradas.js";
import { claveDeTarea } from "../../src/lib/registroTareas.js";
import { INTOLERANCE_RULES } from "../../src/lib/intolerances.js";
import { isoDeCasa } from "../../src/lib/dias.js";
import { CANAL, paraEscribir } from "../../src/lib/vocabularios.js";
import { avisarFallo } from "./avisar.js";
import { DURACION_CANDADO_S } from "./candado.js";
import { cerrarResueltas, filtroVivas, SIN_RECORDATORIOS } from "./tareas.js";
import { referenciasRotas, correccionesDeRotas } from "../../src/lib/referenciasRotas.js";
import { EJE_POR_ID } from "../../src/data/axisRegistry.js";
import { ESTADO_TAREA } from "../../src/lib/vocabularios.js";

const MIN = 60000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Qué se hace al caducar. Vocabulario cerrado. */
export const EFECTOS = ["ignorar", "preguntar", "avisar", "corregir"];
/** Quién lo caduca. Vocabulario cerrado. */
export const QUIENES = ["lectura", "barrido"];

export const CADUCA = {
  /** dietaryStatesMeta[estado].hasta de una persona (ajustar_salud). */
  ESTADO_SALUD: "estado_salud",
  /** La propuesta del último mensaje de Lola («¿comida o cena?», «¿lo apunto?», opciones). */
  PROPUESTA: "propuesta",
  /** Las tareas abiertas que viajan en el último mensaje de Lola (pendientes.js). */
  TAREAS_DEL_MENSAJE: "tareas_del_mensaje",
  /** Un mensaje en bot_cola que nadie tomó (murió el turno que tenía el candado). */
  COLA: "cola",
  /** Una tarea o una preferencia que apunta a algo que ya no existe (src/lib/referenciasRotas.js, trozo 35). */
  REFERENCIA_ROTA: "referencia_rota",
};

/**
 * @type {Record<string, { quien: string, efecto: string, vidaMs?: number, que: string }>}
 * `vidaMs`: cuánto vale desde que se creó. ESTADO_SALUD no lo lleva: caduca
 * en su propia fecha («hasta»).
 */
export const COSAS_QUE_CADUCAN = {
  [CADUCA.ESTADO_SALUD]: { quien: "barrido", efecto: "preguntar", que: "un estado de salud con fecha de fin (embarazo, lactancia…)" },
  // Tres horas: «¿comida o cena?» se contesta en el momento; un «la cena» de la
  // noche siguiente ya es otra conversación.
  [CADUCA.PROPUESTA]: { quien: "lectura", efecto: "ignorar", vidaMs: 3 * HORA, que: "la pregunta o las opciones del último mensaje de Lola" },
  [CADUCA.TAREAS_DEL_MENSAJE]: { quien: "lectura", efecto: "ignorar", vidaMs: 12 * HORA, que: "lo que Lola dejó a medias en su último mensaje" },
  // Cuatro veces el candado (turnos.js, que ya es más que un turno entero): si
  // sigue sin tomar, el turno que lo tenía murió.
  [CADUCA.COLA]: { quien: "barrido", efecto: "avisar", vidaMs: 4 * DURACION_CANDADO_S * 1000, que: "un mensaje que se quedó sin contestar en la cola" },
  // Lo obvio se corrige solo y lo dudoso se pregunta (Pablo, 4 nov 2026): cada rota dice cuál (ACCION_DE_ROTA).
  [CADUCA.REFERENCIA_ROTA]: { quien: "barrido", efecto: "corregir", que: "una tarea o una preferencia que apunta a una persona, un campo o un valor que ya no existe" },
};

/**
 * Pura. Las cosas de barrido que no tienen función en `barridos`, y las
 * funciones que sobran (de algo que no es de barrido o no está en la lista).
 * El test la usa con la lista de verdad y con una mala, para ver que salta.
 */
export function barridosQueFaltan(cosas = COSAS_QUE_CADUCAN, barridos = BARRIDOS) {
  const deBarrido = Object.keys(cosas).filter((k) => cosas[k].quien === "barrido");
  return {
    faltan: deBarrido.filter((k) => typeof barridos[k] !== "function"),
    sobran: Object.keys(barridos).filter((k) => !deBarrido.includes(k)),
  };
}

/**
 * ¿Sigue valiendo algo de tipo `cosa` creado en `creadoAt`? Sin fecha, sí
 * (las filas de bot_messages siempre la traen; sin ella es un objeto de
 * prueba). Con una que no se puede leer, LANZA (#974, C5): darla por vigente o por
 * caducada sería inventarse la respuesta. created_at sale de la base, así
 * que ilegible es un fallo de verdad y tiene que verse.
 */
export function vigente(cosa, creadoAt, ahoraMs = Date.now()) {
  const def = COSAS_QUE_CADUCAN[cosa];
  if (!def) throw new Error(`no sé cómo caduca «${cosa}»`);
  if (!def.vidaMs || !creadoAt) return true;
  const t = Date.parse(creadoAt);
  if (Number.isNaN(t)) throw new Error(`caducidades: fecha ilegible en ${cosa} («${String(creadoAt).slice(0, 40)}»)`);
  return ahoraMs - t < def.vidaMs;
}

// ── Preguntas que abre el barrido ────────────────────────────────────────────

/** Cuánto vive una pregunta que abre el barrido (estados vencidos, referencias rotas). */
export const VIDA_PREGUNTA_MS = 14 * DIA;

/** El chat donde se pregunta: el privado antes que el grupo (puede ser salud). */
export const chatParaPreguntar = (chats = []) => chats.find((x) => x.kind === "private") ?? chats[0] ?? null;

/**
 * Abre una pregunta para Lola una sola vez por casa y clave: si ya se preguntó (abierta o cerrada), no se repite.
 * Devuelve si la abrió. El índice único (casa, clave) para una pasada solapada no es un fallo; lo demás se lanza.
 */
async function abrirPreguntaUnaVez({ householdId, chat, clave, texto, ahoraMs }) {
  const ya = await select("bot_tareas", `household_id=${eq(householdId)}&clave=${eq(clave)}&limit=1`, "id");
  if (ya.length) return false;
  try {
    await insert("bot_tareas", [{
      household_id: householdId, channel: paraEscribir("canales", chat.channel ?? CANAL.TELEGRAM), chat_id: String(chat.chat_id),
      kind: "pregunta", scope: "casa", texto, clave,
      caduca_at: new Date(ahoraMs + VIDA_PREGUNTA_MS).toISOString(),
    }]);
    return true;
  } catch (e) {
    if (!esDuplicado(e)) throw e;
    return false;
  }
}

// ── Estados de salud con fecha ──────────────────────────────────────────────

/** La clave de la pregunta de un estado vencido: una por persona, estado y fecha. */
export const claveDeEstadoVencido = (personaId, estado, hasta) =>
  claveDeTarea({ tipo: "falta_saber", personaId, palabras: ["caduca", estado, hasta] });

/** El patrón (PostgREST `like`) de todas las claves de claveDeEstadoVencido: sale de la misma función. */
export const PATRON_VENCIDO = claveDeTarea({ tipo: "falta_saber", personaId: "*", palabras: ["caduca", "*"] });

/**
 * Los estados de salud de la casa cuya fecha «hasta» ya pasó (hoy en Madrid).
 * Solo los que la persona sigue teniendo puestos. Una lista de personas que
 * no es una lista (sin personas es null o falta) se avisa y devuelve null,
 * NO una lista vacía: «no he podido leerla» no es «no hay nada», y con una
 * vacía el barrido cerraría las preguntas abiertas de esa casa (#974, C5).
 * @returns {null | { personaId: string, nombre: string, estado: string, hasta: string, clave: string, texto: string }[]}
 */
export function estadosVencidos(members = [], hoy = isoDeCasa()) {
  const out = [];
  if (members != null && !Array.isArray(members)) {
    avisarFallo("caducidades_personas_ilegibles", new Error(`members es ${typeof members}`), { grave: false });
    return null;
  }
  for (const m of members ?? []) {
    if (!m?.id) continue;
    const meta = m.dietaryStatesMeta && typeof m.dietaryStatesMeta === "object" ? m.dietaryStatesMeta : {};
    for (const estado of m.dietaryStates ?? []) {
      const hasta = meta[estado]?.hasta;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hasta ?? "")) || hasta >= hoy) continue;
      const etiqueta = String(INTOLERANCE_RULES[estado]?.label ?? estado).toLowerCase();
      out.push({
        personaId: String(m.id), nombre: m.name ?? "", estado, hasta,
        clave: claveDeEstadoVencido(String(m.id), estado, hasta),
        texto: `Preguntar si ${m.name ?? "esta persona"} sigue con ${etiqueta}: estaba apuntado hasta el ${hasta}. Si ya no, quitarlo con ajustar_salud (quitar); si sigue, ponerle fecha nueva. Mientras, el menú lo sigue teniendo en cuenta.`,
      });
    }
  }
  return out;
}

/**
 * Pura. Las filas de persona_estado con fecha (y el nombre de su persona) como comensales por casa, la forma que
 * lee estadosVencidos. Desde el trozo 10 la familia vive en sus filas, no en household_state.
 */
export function casasDeEstados(filas = []) {
  const casas = new Map();
  for (const f of filas) {
    if (!casas.has(f.household_id)) casas.set(f.household_id, new Map());
    const personas = casas.get(f.household_id);
    const id = String(f.persona_id);
    if (!personas.has(id)) personas.set(id, { id, name: f.persona?.nombre ?? "", dietaryStates: [], dietaryStatesMeta: {} });
    const m = personas.get(id);
    m.dietaryStates.push(f.estado);
    if (f.hasta) m.dietaryStatesMeta[f.estado] = { hasta: f.hasta };
  }
  return [...casas].map(([household_id, personas]) => ({ household_id, members: [...personas.values()] }));
}

async function barrerEstados({ ahoraMs, hoy }) {
  // Solo los estados con fecha: los demás no vencen. Una casa sin ninguno no sale, y lo que tuviera abierto se cierra.
  const casas = casasDeEstados(await select("persona_estado", "hasta=not.is.null", "household_id,persona_id,estado,hasta,persona(nombre)"));
  const vivas = new Set();
  // Las casas que no se han podido leer: sus preguntas abiertas no se tocan.
  const sinLeer = new Set();
  let abiertas = 0;
  for (const c of casas) {
    const vencidos = estadosVencidos(c.members, hoy);
    if (vencidos === null) {
      sinLeer.add(c.household_id);
      continue;
    }
    if (!vencidos.length) continue;
    // Vivas antes de buscar el chat: sin chat no se abre nada, pero lo abierto sigue valiendo.
    for (const v of vencidos) vivas.add(`${c.household_id}|${v.clave}`);
    const chats = await select("bot_chats", `household_id=${eq(c.household_id)}&order=created_at.asc`, "channel,chat_id,kind");
    const chat = chatParaPreguntar(chats);
    if (!chat) continue;
    // Una vez por estado y fecha.
    for (const v of vencidos) {
      if (await abrirPreguntaUnaVez({ householdId: c.household_id, chat, clave: v.clave, texto: v.texto, ahoraMs })) abiertas++;
    }
  }
  // Las que ya no hacen falta (la quitaron o le dieron fecha nueva): cerradas.
  const abiertasAntes = await select("bot_tareas", `clave=like.${encodeURIComponent(PATRON_VENCIDO)}&status=eq.abierta`, "id,household_id,clave");
  const sobran = abiertasAntes.filter((t) => !sinLeer.has(t.household_id) && !vivas.has(`${t.household_id}|${t.clave}`));
  if (sobran.length) {
    const ahora = new Date(ahoraMs).toISOString();
    await update("bot_tareas", `id=in.(${sobran.map((t) => t.id).join(",")})&status=eq.abierta`, { status: "hecha", closed_at: ahora, updated_at: ahora });
  }
  return { abiertas, cerradas: sobran.length, sinLeer: sinLeer.size };
}

// ── Referencias rotas ───────────────────────────────────────────────────────

/** Más correcciones que esto en una casa y una pasada no se hacen solas: algo raro pasa (se avisa y se deja). */
export const TOPE_CORRECCIONES_POR_CASA = 5;

/** La clave de la pregunta por una preferencia rota: una por persona, eje y valor, para no repetirla nunca. */
export const claveDeRota = ({ personaId, eje, valor }) =>
  claveDeTarea({ tipo: "falta_saber", personaId, palabras: ["rota", eje, String(valor).toLowerCase().replace(/[^a-z0-9_]+/g, "_")] });

/** Pura. Lo que Lola tiene que preguntar por una preferencia rota. */
export function textoDeRota({ eje, valor, personaId }, members = []) {
  const nombre = (members ?? []).find((m) => String(m?.id) === String(personaId))?.name;
  const que = EJE_POR_ID.get(eje)?.nombre ?? eje;
  return `Preguntar qué quería decir con «${valor}» en «${que}»${nombre ? ` (de ${nombre})` : ""}: ya no es una de las opciones. Si ya no vale, quitar esa preferencia; si sí, cambiarla por la opción que más se parezca.`;
}

const COLUMNAS_ROTAS = "id,kind,clave,tipo,campo,persona_id,para_member,asignado_member";

async function barrerReferencias({ ahoraMs }) {
  // Las casas con chat: sin chat no hay a quién preguntar, y Lola es quien usa sus tareas.
  const chats = await select("bot_chats", "household_id=not.is.null&order=created_at.asc", "household_id,channel,chat_id,kind");
  const porCasa = new Map();
  for (const c of chats) {
    if (!porCasa.has(c.household_id)) porCasa.set(c.household_id, []);
    porCasa.get(c.household_id).push(c);
  }
  const { cargarCasa } = await import("./casa.js");
  const ahora = new Date(ahoraMs).toISOString();
  const out = { casas: 0, sinLeer: 0, descartadas: 0, sinEncargado: 0, preguntas: 0, frenadas: 0 };
  for (const [householdId, suyos] of porCasa) {
    let casa;
    try {
      casa = await cargarCasa(householdId, { fresca: true });
    } catch (e) {
      // Sin la casa entera no se corrige nada: con una familia a medias, saldrían rotas tareas que no lo están.
      console.error("[caducidades] referencias: casa sin leer", e?.message);
      out.sinLeer++;
      continue;
    }
    if (!casa) continue;
    out.casas++;
    const members = Array.isArray(casa.state?.members) ? casa.state.members : null;
    const ids = (members ?? []).map((m) => m?.id).filter(Boolean);
    const tareas = await select("bot_tareas", `household_id=${eq(householdId)}&${filtroVivas()}&${SIN_RECORDATORIOS}`, COLUMNAS_ROTAS);
    // Sin nadie leído en la familia no se mira la persona (saldrían todas rotas), solo el campo.
    const rotas = referenciasRotas({ preferencias: casa.preferencias ?? [], tareas, personas: ids.length ? ids : null });
    if (!rotas.length) continue;
    const { descartar, sinEncargado, preguntar } = correccionesDeRotas(rotas, casa.preferencias ?? []);
    if (descartar.length + sinEncargado.length > TOPE_CORRECCIONES_POR_CASA) {
      avisarFallo("caducidades_rotas_demasiadas", new Error(`${descartar.length + sinEncargado.length} correcciones en una casa`), { grave: false });
      out.frenadas++;
      continue;
    }
    // Lo obvio, solo y dicho (cerrarResueltas apunta cada cierre): las tareas de alguien que ya no está o de un campo que ya no existe.
    const porId = new Map(tareas.map((t) => [t.id, t]));
    await cerrarResueltas(descartar.map((id) => porId.get(id)).filter(Boolean), { householdId }, ESTADO_TAREA.DESCARTADA);
    out.descartadas += descartar.length;
    if (sinEncargado.length) {
      await update("bot_tareas", `household_id=${eq(householdId)}&id=in.(${sinEncargado.join(",")})&${filtroVivas()}`, { asignado_member: null, updated_at: ahora });
      out.sinEncargado += sinEncargado.length;
    }
    // Lo dudoso, a la familia: una pregunta por preferencia, una sola vez (abierta o cerrada, no se repite).
    const chat = chatParaPreguntar(suyos);
    for (const p of preguntar) {
      const clave = claveDeRota(p);
      if (!clave) continue;
      if (await abrirPreguntaUnaVez({ householdId, chat, clave, texto: textoDeRota(p, members), ahoraMs })) out.preguntas++;
    }
  }
  return out;
}

// ── La cola sin dueño ───────────────────────────────────────────────────────

/** Lo que se le dice al chat por lo que se quedó sin contestar. Pura. */
export function avisoDeCola(items = []) {
  const textos = items.map((i) => String(i?.texto ?? "").trim()).filter(Boolean);
  if (!textos.length) return null;
  const ultimo = textos.at(-1);
  const corto = ultimo.length > 80 ? `${ultimo.slice(0, 80)}…` : ultimo;
  return `Perdona, se me quedó sin contestar lo que me escribiste («${corto}»). ¿Me lo dices otra vez?`;
}

async function barrerCola({ ahoraMs, enviar }) {
  const limite = new Date(ahoraMs - COSAS_QUE_CADUCAN[CADUCA.COLA].vidaMs).toISOString();
  const filas = await select("bot_cola", `tomado_at=is.null&created_at=lt.${encodeURIComponent(limite)}&order=id.asc&limit=200`, "id");
  if (!filas.length) return { tomados: 0, avisados: 0 };
  // Tomados por el barrido, con la misma condición que sacarCola: si un turno
  // vivo los coge a la vez, se los queda él.
  const tomados = await update("bot_cola", `id=in.(${filas.map((f) => f.id).join(",")})&tomado_at=is.null`, { tomado_at: new Date(ahoraMs).toISOString() });
  const porChat = new Map();
  for (const f of tomados ?? []) {
    // Lo de hace más de un día no se recuerda: a destiempo confunde más que ayuda.
    if (f.channel !== CANAL.TELEGRAM || ahoraMs - Date.parse(f.created_at) > DIA) continue;
    if (!porChat.has(f.chat_id)) porChat.set(f.chat_id, []);
    porChat.get(f.chat_id).push(f);
  }
  let avisados = 0;
  for (const [chatId, lista] of porChat) {
    const aviso = avisoDeCola(lista.sort((a, b) => a.id - b.id).map((f) => f.item));
    if (!aviso || !enviar) continue;
    try {
      const responderA = lista.at(-1)?.item?.responderA;
      await enviar(chatId, aviso, responderA ? { responderA } : {});
      avisados++;
    } catch (e) {
      console.error("[caducidades] aviso de cola", e?.message);
    }
  }
  return { tomados: tomados?.length ?? 0, avisados };
}

/**
 * Lo que hace el barrido por cada cosa de quien = «barrido». Un tipo de
 * barrido sin función aquí no pasa el test.
 */
export const BARRIDOS = {
  [CADUCA.ESTADO_SALUD]: barrerEstados,
  [CADUCA.COLA]: barrerCola,
  [CADUCA.REFERENCIA_ROTA]: barrerReferencias,
};

// Lo que no hace falta mirar en cada pasada: una vez por hora basta.
const CADA = { [CADUCA.ESTADO_SALUD]: HORA, [CADUCA.COLA]: 0, [CADUCA.REFERENCIA_ROTA]: HORA };

/**
 * La pasada del cron. Cada cosa por su cuenta: si una falla, las demás siguen.
 * `cadaMs`: cada cuánto llama el cron. Lo dice quien lo llama
 * (api/bot/recordatorios.js), que es donde vive esa cifra.
 * @param {{ ahoraMs?: number, cadaMs: number, enviar?: (chatId: string, texto: string, opts?: object) => Promise<any> }} o
 * @returns {Promise<Record<string, object>>} lo hecho por cada cosa (o su error)
 */
export async function barrer({ ahoraMs = Date.now(), cadaMs, enviar = null } = {}) {
  if (!(cadaMs > 0)) throw new Error("barrer necesita cadaMs: cada cuánto pasa el cron");
  const hoy = isoDeCasa({ ahora: new Date(ahoraMs) });
  const out = {};
  for (const [cosa, fn] of Object.entries(BARRIDOS)) {
    // Solo la pasada que cae al empezar su intervalo (la primera de cada hora).
    if (CADA[cosa] && ahoraMs % CADA[cosa] >= cadaMs) continue;
    try {
      out[cosa] = await fn({ ahoraMs, hoy, enviar });
    } catch (e) {
      console.error("[caducidades]", cosa, e?.message);
      out[cosa] = { error: String(e?.message ?? e).slice(0, 200) };
    }
  }
  return out;
}
