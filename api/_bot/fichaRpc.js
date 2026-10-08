/**
 * La ficha y las tareas abiertas de Lola en una ida: la RPC ficha_casa (0120),
 * detrás de BOT_FICHA_RPC.
 *
 * Sin ella, cada turno lee las tareas abiertas y las calladas en dos consultas
 * y monta la ficha entera del JSON de la casa. Con ella, de las tablas
 * (persona, persona_alergia, persona_estado…, bot_tareas) salen las personas,
 * sus alergias, intolerancias y estados, lo que falta saber, las tareas y lo
 * que no se repregunta. El resto de la ficha (horario, estructura, vetos,
 * reglas, menú y semana) sigue saliendo del JSON, como hoy (contrato v1).
 *
 * Producción y staging comparten base, y la 0120 (que pide la 0080) puede no
 * estar aplicada: si la RPC no existe, falla o contesta otra versión del
 * contrato, se lee como siempre y queda en el log. Nunca rompe el turno.
 *
 * Lo de aquí solo ADAPTA: lo que sale tiene la forma que ya leen ficha.js y
 * tareas.js, para que el texto que ve Lola salga de los mismos sitios.
 *
 * Mientras la copia a `persona` vaya por detrás del JSON (hoy la hace
 * scripts/backfill-personas.mjs, no cada guardado), las tablas pueden decir
 * otra cosa que la casa. El motor filtra con el JSON, así que en lo de
 * seguridad manda el JSON: si no coinciden, se usa el JSON y queda el desfase
 * en el log (`conLaFicha`).
 */

import { rpc } from "./db.js";
import { cargarCasa } from "./casa.js";
import { elegirParaLeer, visiblePara, LIMITE_ABIERTAS } from "./tareas.js";
import { estadoDeCampo } from "./estadoCasa.js";
import { alergiasRevisadas } from "./ficha.js";
import { etapaDe } from "../../src/lib/stages.js";
import { claveDeTarea, KIND_DE_TIPO } from "../../src/lib/registroTareas.js";

export const fichaRpc = () => /^(1|true|si|sí|on)$/i.test(String(process.env.BOT_FICHA_RPC ?? "").trim());

const VERSION = 1;
const ref = (id) => String(id ?? "").slice(0, 8);

// ── Lectura y caché ─────────────────────────────────────────────────────────
// Como cargarCasa (casa.js): unos segundos en esta instancia, por casa y por
// quien escribe (sus tareas personales son suyas). Solo vale si la casa sigue
// en la misma versión (bot_rev); responder() la olvida al acabar cada turno,
// que puede haber anotado o cerrado tareas sin tocar bot_rev.
const RECIENTE_MS = 8000;
const recientes = new Map();
const claveCache = (householdId, userId) => `${householdId}|${userId ?? ""}`;

export function olvidarFicha(householdId) {
  for (const k of recientes.keys()) if (k.startsWith(`${householdId}|`)) recientes.delete(k);
}

// La 0120 sin aplicar: PostgREST no encuentra la función (404 PGRST202) o Postgres no la tiene (42883).
const noExiste = (e) => /PGRST202|42883|\b404\b|could not find the function/i.test(String(e?.message ?? e));

/** Pura. ¿Es la ficha que sabemos leer? Lo que falta o tiene otra forma, no. */
function validar(f) {
  if (f?.v !== VERSION) return `v=${f?.v ?? "?"} (se espera v=${VERSION})`;
  if (!Number.isFinite(Number(f.casa?.rev))) return "sin casa.rev";
  for (const k of ["personas", "faltan", "tareas", "callados"]) if (!Array.isArray(f[k])) return `sin «${k}»`;
  return null;
}

/**
 * La ficha de la casa de la RPC, o null (y en el log por qué) si hay que leer
 * del JSON. Nunca lanza. La service role pasa quién escribe en p_usuario: es lo
 * que filtra sus tareas personales (0120).
 * @param {{ householdId: string, userId?: string|null, canal?: string|null }} ctx
 */
export async function leerFichaCasa({ householdId, userId = null, canal = null }) {
  if (!householdId) return null;
  const clave = claveCache(householdId, userId);
  const r = recientes.get(clave);
  if (r && Date.now() - r.t < RECIENTE_MS) {
    // La casa ya está leída en el turno (casa.js la recuerda): no es otra ida.
    const casa = await cargarCasa(householdId).catch(() => null);
    if (casa && Number(casa.botRev) === r.rev) return r.ficha;
  }
  let ficha;
  try {
    ficha = await rpc("ficha_casa", { p_casa: householdId, p_usuario: userId, p_canal: canal, p_max_tareas: LIMITE_ABIERTAS });
  } catch (e) {
    console.error(`[fichaRpc] ${noExiste(e) ? "no está la RPC (¿0120 sin aplicar?)" : "falló"}, se lee del JSON:`, String(e?.message ?? e).slice(0, 200));
    return null;
  }
  const mal = validar(ficha);
  if (mal) {
    console.error(`[fichaRpc] contrato desconocido, se lee del JSON: ${mal}`);
    return null;
  }
  recientes.set(clave, { t: Date.now(), rev: Number(ficha.casa.rev), ficha });
  return ficha;
}

// ── Adaptación (puras) ──────────────────────────────────────────────────────

/**
 * Pura. Las tareas de la RPC con las columnas que leen tareas.js y la ficha, y
 * recortadas como siempre (elegirParaLeer). La RPC ya filtra las personales de
 * otros; aquí, además, las personales solo en privado (visiblePara): en un
 * grupo, p_usuario es quien escribe y la RPC le traería las suyas.
 * Lo que la RPC no trae: chat_id (no se puede decir «se pidió en otro chat»)
 * y la clave de una tarea libre (solo se rehace la de un campo de la ficha).
 */
export function tareasDeFicha(ficha, { userId = null, privado = false, ahora = new Date() } = {}) {
  const tareas = (ficha?.tareas ?? []).map((t) => ({
    id: t.id,
    kind: KIND_DE_TIPO[t.tipo] ?? null,
    tipo: t.tipo ?? null,
    campo: t.campo ?? null,
    persona_id: t.persona_id ?? null,
    scope: t.scope,
    owner_user_id: t.owner_user_id ?? null,
    texto: t.texto,
    falta: t.falta ?? null,
    clave: t.campo ? claveDeTarea({ tipo: "falta_saber", campo: t.campo, personaId: t.persona_id }) : null,
    chat_id: null,
    // En una libre, la persona es su «para»; en una de un campo, de quién es el dato (no se escribe «para»).
    para_member: t.campo ? null : t.persona_id ?? null,
    asignado_member: t.encargado ?? null,
    vence: t.vence ?? null,
    caduca_at: t.caduca_at ?? null,
    created_at: t.created_at,
    status: t.status,
    vuelve_at: t.vuelve_at ?? null,
  }));
  return elegirParaLeer(tareas.filter((t) => visiblePara(t, { userId, privado })), ahora);
}

/** Pura. Las claves que no se preguntan ahora (lo que clavesCalladas da sin la RPC). */
export function calladasDeFicha(ficha, ahora = new Date()) {
  return new Set((ficha?.callados ?? [])
    .filter((c) => !c.hasta || Date.parse(c.hasta) > ahora.getTime())
    .map((c) => c.clave ?? claveDeTarea({ tipo: "falta_saber", campo: c.campo, personaId: c.persona_id }))
    .filter(Boolean));
}

/** Pura. Una persona de la RPC con los nombres de la app (lo que leen etapaDe y la ficha). */
const comoMiembro = (p) => ({
  id: p.id, name: p.nombre, age: p.edad ?? null, birthDate: p.fecha_nacimiento ?? null,
  useBirthDate: p.usa_fecha_nacimiento === true, notBaby: p.no_es_bebe === true, homeRole: p.rol_hogar ?? null,
});

/**
 * Pura. Lo que de verdad falta saber: «faltan» de la RPC sin lo que el estado
 * de la casa ya resolvió (alergias que ya tiene, la etapa del bebé si la casa
 * la sabe), sin lo callado y, si el campo es solo de bebés (aplica «bebe»),
 * solo para quien lo es según etapaDe: la RPC no calcula la etapa.
 * @returns {{ campo: string, personaId: string, nombre: string, politica: string, clave: string|null }[]}
 */
export function faltanDeFicha(ficha, data = {}, calladas = new Set()) {
  const personas = new Map((ficha?.personas ?? []).map((p) => [String(p.id), p]));
  return (ficha?.faltan ?? [])
    .filter((f) => f.sujeto?.tipo === "persona" && personas.has(String(f.sujeto.id)))
    .map((f) => ({ ...f, persona: personas.get(String(f.sujeto.id)) }))
    .filter((f) => f.aplica !== "bebe" || etapaDe(comoMiembro(f.persona)).etapa === "bebe")
    .filter((f) => estadoDeCampo(f.campo, String(f.persona.id), data) === "pendiente")
    .map((f) => ({
      campo: f.campo, personaId: String(f.persona.id), nombre: f.persona.nombre, politica: f.politica,
      clave: claveDeTarea({ tipo: "falta_saber", campo: f.campo, personaId: String(f.persona.id) }),
    }))
    .filter((f) => !calladas.has(f.clave));
}

const conjunto = (xs) => JSON.stringify([...new Set((xs ?? []).map((x) => String(x).trim()).filter(Boolean))].sort());

/**
 * Pura. Lo de seguridad en que las tablas y el JSON no coinciden, o [] si en
 * nada: quién hay, alergias, intolerancias, estados, si se revisaron sus
 * alergias y su etapa (bebé o no).
 */
export function desfaseDe(ficha, data = {}) {
  const json = new Map((data.members ?? []).map((m) => [String(m.id ?? m.name), m]));
  const tablas = new Map((ficha?.personas ?? []).map((p) => [String(p.id), p]));
  if (conjunto([...json.keys()]) !== conjunto([...tablas.keys()])) return ["personas"];
  const fuera = [];
  for (const [id, p] of tablas) {
    const m = json.get(id);
    const revisadas = p.alergias_revisadas === true || alergiasRevisadas(data, m);
    if (conjunto(p.alergias) !== conjunto(m.allergies)) fuera.push(`alergias:${ref(id)}`);
    if (conjunto(p.intolerancias) !== conjunto(m.intolerances)) fuera.push(`intolerancias:${ref(id)}`);
    if (conjunto((p.estados ?? []).map((e) => e.valor)) !== conjunto(m.dietaryStates)) fuera.push(`estados:${ref(id)}`);
    if (revisadas !== alergiasRevisadas(data, m)) fuera.push(`revisadas:${ref(id)}`);
    if (etapaDe(comoMiembro(p)).etapa !== etapaDe(m).etapa) fuera.push(`etapa:${ref(id)}`);
  }
  return fuera;
}

/**
 * Pura. La casa para montarFicha con lo de seguridad de las tablas (alergias,
 * intolerancias, estados con su «hasta», revisión), y lo que queda pendiente
 * de preguntar (la línea PENDIENTE). Las personas van en el orden del JSON y
 * conservan lo que las tablas no tienen (no le gusta, perfiles de salud…). Si las tablas no dicen lo mismo en lo de seguridad
 * (desfaseDe), la casa del JSON tal cual y pendientes undefined: la ficha
 * calcula lo pendiente del JSON, como siempre.
 * @returns {{ casa: object, pendientes?: { clave: string, nombre: string }[] }}
 */
export function conLaFicha(casa, ficha, calladas = new Set()) {
  const data = casa?.state?.data ?? {};
  const desfase = desfaseDe(ficha, data);
  if (desfase.length) {
    console.error(`[fichaRpc] desfase entre las tablas y el JSON de ${ref(casa?.householdId)} (manda el JSON): ${desfase.slice(0, 6).join(", ")}`);
    return { casa };
  }
  const tablas = new Map((ficha.personas ?? []).map((p) => [String(p.id), p]));
  const members = (data.members ?? []).map((m) => {
    const p = tablas.get(String(m.id ?? m.name));
    const meta = { ...(m.dietaryStatesMeta ?? {}) };
    for (const e of p.estados ?? []) meta[e.valor] = { ...(meta[e.valor] ?? {}), hasta: e.hasta ?? null };
    // Nombre, edad y fecha, del JSON: la tabla guarda la edad truncada (un bebé
    // de 0,5 sería «0 m») y la etapa ya se ha visto que coincide (desfaseDe).
    return {
      ...m,
      // La tabla no sabe «sin decir» (no hay revisión por persona): entonces vale lo de la casa, como en el JSON.
      alergiasRevisadas: p.alergias_revisadas === true ? true : m.alergiasRevisadas,
      allergies: [...(p.alergias ?? [])],
      intolerances: [...(p.intolerancias ?? [])],
      dietaryStates: (p.estados ?? []).map((e) => e.valor),
      dietaryStatesMeta: meta,
    };
  });
  const nueva = { ...data, members };
  // PENDIENTE solo lleva lo que se pregunta una vez sin esperar a usarlo
  // (política «una_vez»), y la ficha solo sabe preguntar las alergias.
  const orden = new Map(members.map((m, i) => [String(m.id ?? m.name), i]));
  const pendientes = faltanDeFicha(ficha, nueva, calladas)
    .filter((f) => f.politica === "una_vez" && f.campo === "alergias")
    .sort((a, b) => orden.get(a.personaId) - orden.get(b.personaId))
    .map((f) => ({ clave: f.clave, nombre: f.nombre }));
  return { casa: { ...casa, state: { ...casa.state, data: nueva } }, pendientes };
}
