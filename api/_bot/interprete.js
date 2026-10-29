/**
 * El intérprete de Lola: lo que dice la gente, a valores ya resueltos (#958, raíz 3).
 *
 * Antes cada herramienta entendía el idioma por su cuenta: `diaDe` y
 * `resolverDia` en menu.js, `fechaDe` dentro de `apuntarAusencia`,
 * `diasDichos` y `lunesDe` en ajustes.js, `indiceDeNombre` en cuando.js, el
 * mapa de días de cole.js, y para las personas `buscarPersona` (ajustes.js),
 * `resolverPersona` (estadoCasa.js), dos `find` a mano en menu.js y la lista
 * de «todos/niños» de cole.js. Cada uno con su hueco: «el viernes de la semana
 * que viene» caía en este viernes, «el 15» no se entendía, «Nat» con Natalia
 * y Natxo cogía a la primera, «los peques» no era nadie, y «cambia el jueves»
 * un viernes sin menú siguiente cogía el jueves pasado.
 *
 * Aquí se entiende UNA vez, y sale:
 *   · fechas concretas «AAAA-MM-DD» con el día de España (src/lib/dias.js);
 *   · días de la semana («Lun»…«Dom») para lo que se repite cada semana;
 *   · personas por id (con «yo» = la persona que la cuenta marcó en la app,
 *     `accountMemberIdByUser`);
 *   · cantidades `{ op, n }` («menos de dos» → { op: "<", n: 2 }).
 *
 * Regla de todo el fichero: ante la duda, `{ duda }` con la pregunta que hay
 * que hacer. Nunca se adivina ni se cae a un día que ya pasó.
 *
 * Puro: recibe `hoy` (ISO) y los datos de la casa; sin base ni modelo. La
 * guardia (interprete.guard.test.js) impide volver a escribir estos
 * analizadores fuera de aquí.
 */

import { DIAS, NOMBRES_DIA, DIAS_LABORABLES, DIAS_FINDE, indiceDeISO, diaDeISO, isoDeCasa, DIA_LARGO_MINUSCULAS } from "../../src/lib/dias.js";
import { etapaDe, esMenor, esEtapaBebe, miembroDeCuentaId, findAccountMember } from "../../src/lib/stages.js";

/** Sin tildes ni mayúsculas, con los espacios juntos. La única copia en api/_bot (#967, C8). */
export const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Lo que escribe la gente, literal dentro de un regex. La única copia en api/_bot. */
export const escapar = (w) => String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const palabrasLargas = (s) => normal(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
/**
 * ¿Se ve lo dicho en el texto? La mitad o más de sus palabras de 4 letras o
 * más (las cortas son «con», «de», «al») están en él, con o sin la -s del
 * plural. Sin palabras largas, sí. Lo usan el menú del cole (un plato, en lo
 * que se mandó) y guardar_receta (el nombre aprobado, en el del borrador), #958.
 */
export function seVeEn(dicho, texto) {
  const ws = palabrasLargas(dicho);
  if (!ws.length) return true;
  const hay = new Set(palabrasLargas(texto));
  return ws.filter((w) => hay.has(w) || hay.has(w.replace(/s$/, "")) || hay.has(`${w}s`)).length * 2 >= ws.length;
}

// ── Fechas: aritmética ──────────────────────────────────────────────────────

export const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** El lunes de la semana de esa fecha. */
export const lunesDe = (iso) => sumarDias(iso, -indiceDeISO(iso));
/** El lunes de esta semana o de la siguiente («esta» / «siguiente»). */
export const lunesDeSemana = (cual, hoy = isoDeCasa()) => sumarDias(lunesDe(hoy), cual === "siguiente" ? 7 : 0);
/** «Jueves 6». */
export const fechaCorta = (iso) => `${DIA_LARGO_MINUSCULAS[diaDeISO(iso)]} ${Number(iso.slice(8, 10))}`;

const entre = (desde, hasta) => {
  const out = [];
  for (let d = desde; d <= hasta && out.length < 31; d = sumarDias(d, 1)) out.push(d);
  return out;
};

// ── Días de la semana ───────────────────────────────────────────────────────

const LARGOS = NOMBRES_DIA.map(normal);

/**
 * «martes», «mar», «Mar», «el martes», «martes 6», «mié.» → «Mar»; null si no
 * es un día. «marzo» no es martes (antes bastaban las tres letras).
 */
export function diaDeSemana(texto) {
  const t = normal(texto).replace(/^(el|los|la|las)\s+/, "").replace(/\.$/, "");
  if (!t) return null;
  const i = LARGOS.findIndex((d) => d === t || d.slice(0, 3) === t || new RegExp(`^${d}(\\s|$)`).test(t));
  return i < 0 ? null : DIAS[i];
}

const ES_LABORABLES = /^(entre ?semana|laborables|dias laborables|de lunes a viernes|lunes a viernes)$/;
const ES_FINDE = /^((el|los|este) )?(finde|findes|fin de semana|fines de semana)$/;
const ES_TODOS = /^(todos( los dias)?|toda la semana|cada dia|a diario|siempre)$/;
// «de lunes a jueves», «del lunes al jueves», «lunes a jueves», «lunes-jueves».
const RANGO_DIAS = /^(?:de |del )?(?:el |los )?([a-z]+)\s*(?:a|al|hasta(?: el)?|-)\s*(?:el |los )?([a-z]+)$/;

/**
 * Los días de la semana de algo que se REPITE («los lunes», «entre semana»,
 * «el finde», «de lunes a jueves»). Vacío = todos. Lo que no se entiende va en
 * `malos`, para preguntarlo, no se cae.
 * @param {string|string[]} dichos
 * @returns {{ dias: string[], malos: string[] }}
 */
export function diasDeLaSemana(dichos) {
  const lista = (Array.isArray(dichos) ? dichos : dichos == null || dichos === "" ? [] : [dichos]).flatMap((x) => String(x).split(/\s*(?:,|\by\b)\s*/)).filter((x) => normal(x));
  if (!lista.length) return { dias: [...DIAS], malos: [] };
  const sel = new Set();
  const malos = [];
  for (const x of lista) {
    const t = normal(x);
    if (ES_LABORABLES.test(t)) { DIAS_LABORABLES.forEach((d) => sel.add(d)); continue; }
    if (ES_FINDE.test(t)) { DIAS_FINDE.forEach((d) => sel.add(d)); continue; }
    if (ES_TODOS.test(t)) { DIAS.forEach((d) => sel.add(d)); continue; }
    const r = t.match(RANGO_DIAS);
    const a = r ? diaDeSemana(r[1]) : null;
    const b = r ? diaDeSemana(r[2]) : null;
    if (a && b) {
      for (let i = DIAS.indexOf(a), n = 0; n < 7; i = (i + 1) % 7, n++) { sel.add(DIAS[i]); if (DIAS[i] === b) break; }
      continue;
    }
    // «los sábados»: en lo que se repite, el plural es el día.
    const d = diaDeSemana(t) ?? diaDeSemana(t.replace(/s$/, ""));
    if (d) sel.add(d); else malos.push(String(x));
  }
  return { dias: DIAS.filter((d) => sel.has(d)), malos };
}

// ── Fechas concretas ────────────────────────────────────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesDe = (t) => {
  const x = normal(t);
  if (x === "setiembre") return 9;
  const i = MESES.findIndex((m) => m === x || (x.length >= 3 && m.startsWith(x)));
  return i < 0 ? null : i + 1;
};
const pad = (n) => String(n).padStart(2, "0");
const isoValido = (a, m, d) => {
  const iso = `${a}-${pad(m)}-${pad(d)}`;
  const f = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(f.getTime()) && f.toISOString().slice(0, 10) === iso ? iso : null;
};
/** El próximo día N del mes (este mes si aún no ha pasado, si no el siguiente). */
function proximoDiaDelMes(n, hoy) {
  let a = Number(hoy.slice(0, 4));
  let m = Number(hoy.slice(5, 7));
  if (n < Number(hoy.slice(8, 10))) { m += 1; if (m > 12) { m = 1; a += 1; } }
  return isoValido(a, m, n);
}

// Lo que mueve un día o un finde a la semana que viene.
const DE_LA_QUE_VIENE = /\s+(de|del|de la)\s+(la\s+)?(semana\s+que\s+viene|que\s+viene|proxima(\s+semana)?|semana\s+proxima|siguiente(\s+semana)?|semana\s+siguiente)$/;
const DE_ESTA = /\s+(de\s+)?esta(\s+semana)?$/;

/**
 * Una expresión de fecha → días ISO, con el día de España.
 *
 *   hoy, esta noche, mañana, pasado mañana     lo que dicen
 *   el jueves                                  el próximo jueves (hoy, si es jueves)
 *   el jueves que viene, el próximo jueves     el próximo, sin contar hoy
 *   este jueves                                el de esta semana; si ya pasó, duda
 *   el jueves de la (semana) que viene         el de la semana siguiente
 *   el 15, el día 15                           el próximo día 15
 *   el jueves 15                               el 15, si es jueves; si no, duda
 *   15 de noviembre, 15/11, 2026-11-15         esa fecha (la próxima)
 *   el finde (que viene / de la que viene)     sábado y domingo
 *   entre semana (de la que viene)             lunes a viernes, desde hoy
 *   esta semana, la semana que viene
 *   de lunes a jueves, del 3 al 7              el rango
 *
 * @param {string} texto
 * @param {{ hoy?: string, semana?: "esta"|"siguiente"|null }} [op]  semana:
 *   lo que el modelo ya sacó aparte («de la semana que viene»).
 * @returns {{ fechas: string[] } | { duda: string }}
 */
export function fechasDe(texto, { hoy = isoDeCasa(), semana = null } = {}) {
  // «fin de semana» se lee como «finde»: si no, su «de semana» parecía «de la semana que viene».
  let t = normal(texto).replace(/[¿?!.,]+$/g, "").replace(/\bfines? de semana\b/g, "finde").replace(/^(para|el dia|dia|el|la|los|las)\s+/, "");
  if (!t) return { duda: "¿Qué día?" };
  let sig = semana === "siguiente";
  let esta = semana === "esta";
  if (DE_LA_QUE_VIENE.test(t)) { sig = true; t = t.replace(DE_LA_QUE_VIENE, ""); }
  else if (DE_ESTA.test(t) && t !== "esta semana") { esta = true; t = t.replace(DE_ESTA, ""); }
  t = t.replace(/^(el|la|los|las)\s+/, "");
  const lunesSig = sumarDias(lunesDe(hoy), 7);
  const ya = (iso) => ({ fechas: [iso] });
  const pasado = (iso) => ({ duda: `El ${fechaCorta(iso)} ya ha pasado. ¿Te refieres al de la semana que viene (${fechaCorta(sumarDias(iso, 7))})?` });

  if (/^(hoy|esta noche|esta tarde|este mediodia|a mediodia|ahora)$/.test(t)) return ya(hoy);
  if (/^(manana|mañana)$/.test(t)) return ya(sumarDias(hoy, 1));
  if (t === "pasado manana") return ya(sumarDias(hoy, 2));

  // ISO tal cual.
  let r = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (r) {
    const iso = isoValido(+r[1], +r[2], +r[3]);
    if (!iso) return { duda: `«${texto}» no es una fecha.` };
    return iso < hoy ? { duda: `El ${fechaCorta(iso)} (${iso}) ya ha pasado. ¿Qué día quieres?` } : ya(iso);
  }
  // «del 3 al 7» (del mismo mes, o del siguiente si el 3 ya pasó).
  r = t.match(/^(?:del?\s+)?(\d{1,2})\s+(?:al?|hasta(?:\s+el)?)\s+(\d{1,2})$/);
  if (r) {
    const a = proximoDiaDelMes(+r[1], hoy);
    if (!a) return { duda: `«${texto}»: ¿qué días?` };
    let b = isoValido(+a.slice(0, 4), +a.slice(5, 7), +r[2]);
    if (b && b < a) b = proximoDiaDelMes(+r[2], sumarDias(a, 1));
    return b ? { fechas: entre(a, b) } : { duda: `«${texto}»: ¿qué días?` };
  }
  // «15 de noviembre», «15 noviembre», «15/11», «15-11».
  r = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)$/) ?? t.match(/^(\d{1,2})\s*[/-]\s*(\d{1,2})$/);
  if (r) {
    const d = +r[1];
    const m = /^\d+$/.test(r[2]) ? +r[2] : mesDe(r[2]);
    if (m && m >= 1 && m <= 12) {
      const a = Number(hoy.slice(0, 4));
      const iso = isoValido(a, m, d);
      if (!iso) return { duda: `«${texto}» no es una fecha.` };
      return ya(iso >= hoy ? iso : isoValido(a + 1, m, d) ?? iso);
    }
  }
  // «el 15», «el día 15».
  r = t.match(/^(?:dia\s+)?(\d{1,2})$/);
  if (r) {
    const iso = proximoDiaDelMes(+r[1], hoy);
    return iso ? ya(iso) : { duda: `¿Qué día es el «${r[1]}»?` };
  }
  // «jueves 15»: el 15, si cae en jueves.
  r = t.match(/^([a-z]+)\s+(?:dia\s+)?(\d{1,2})$/);
  if (r && diaDeSemana(r[1])) {
    const iso = proximoDiaDelMes(+r[2], hoy);
    if (!iso) return { duda: `¿Qué día es el «${texto}»?` };
    if (diaDeISO(iso) !== diaDeSemana(r[1])) return { duda: `El ${Number(iso.slice(8, 10))} es ${fechaCorta(iso).split(" ")[0]}, no ${DIA_LARGO_MINUSCULAS[diaDeSemana(r[1])]}. ¿Qué día quieres?` };
    return ya(iso);
  }
  // El finde.
  if (/^((este|el proximo|proximo) )?(finde|fin de semana)( que viene| proximo)?$/.test(t)) {
    const i = indiceDeISO(hoy);
    if (sig) return { fechas: [sumarDias(lunesSig, 5), sumarDias(lunesSig, 6)] };
    const queViene = /que viene|proximo/.test(t);
    if (queViene && i >= 5) return { fechas: [sumarDias(lunesSig, 5), sumarDias(lunesSig, 6)] };
    if (i === 6) return ya(hoy);
    if (i === 5) return { fechas: [hoy, sumarDias(hoy, 1)] };
    return { fechas: [sumarDias(lunesDe(hoy), 5), sumarDias(lunesDe(hoy), 6)] };
  }
  if (ES_LABORABLES.test(t)) {
    if (sig) return { fechas: entre(lunesSig, sumarDias(lunesSig, 4)) };
    const viernes = sumarDias(lunesDe(hoy), 4);
    return hoy <= viernes ? { fechas: entre(hoy, viernes) } : { duda: "Esta semana ya no quedan días entre semana. ¿Los de la semana que viene?" };
  }
  if (t === "esta semana") return { fechas: entre(hoy, sumarDias(lunesDe(hoy), 6)) };
  if (/^(semana que viene|proxima semana|semana proxima|semana siguiente|siguiente semana)$/.test(t)) return { fechas: entre(lunesSig, sumarDias(lunesSig, 6)) };
  // «de lunes a jueves».
  r = t.match(RANGO_DIAS);
  if (r && diaDeSemana(r[1]) && diaDeSemana(r[2])) {
    const i = DIAS.indexOf(diaDeSemana(r[1]));
    const j = DIAS.indexOf(diaDeSemana(r[2]));
    const desde = sig ? sumarDias(lunesSig, i) : esta ? sumarDias(lunesDe(hoy), i) : proximoDia(i, hoy);
    if (desde < hoy) return pasado(desde);
    return { fechas: entre(desde, sumarDias(desde, (j - i + 7) % 7)) };
  }
  // Un día de la semana, con o sin «que viene» / «próximo» / «este».
  r = t.match(/^(?:(este|el proximo|proximo)\s+)?([a-z]+)(?:\s+(que viene|proximo))?$/);
  const d = r ? diaDeSemana(r[2]) : null;
  if (d) {
    const i = DIAS.indexOf(d);
    if (sig) return ya(sumarDias(lunesSig, i));
    if (esta || r[1] === "este") {
      const iso = sumarDias(lunesDe(hoy), i);
      return iso < hoy ? pasado(iso) : ya(iso);
    }
    if (r[1] || r[3]) return ya(proximoDia(i, sumarDias(hoy, 1)));
    return ya(proximoDia(i, hoy));
  }
  return { duda: `No entiendo el día «${texto}». ¿Qué día es?` };
}

/** El próximo día con ese índice (0 = lunes), contando `desde`. */
function proximoDia(i, desde) {
  return sumarDias(desde, (i - indiceDeISO(desde) + 7) % 7);
}

/**
 * Varias expresiones a la vez («hoy», «el finde»): las fechas, en orden y sin
 * repetir, o la primera duda.
 * @returns {{ fechas: string[] } | { duda: string }}
 */
export function fechasDeLista(lista, op = {}) {
  const fechas = new Set();
  for (const x of (Array.isArray(lista) ? lista : [lista])) {
    const r = fechasDe(x, op);
    if (r.duda) return r;
    r.fechas.forEach((f) => fechas.add(f));
  }
  return fechas.size ? { fechas: [...fechas].sort() } : { duda: "¿Qué día?" };
}

/** Una sola fecha; varias es duda. */
export function fechaDe(texto, op = {}) {
  const r = fechasDe(texto, op);
  if (r.duda) return r;
  if (r.fechas.length > 1) return { duda: `«${texto}» son varios días (${r.fechas.map(fechaCorta).join(", ")}). ¿Cuál?` };
  return { fecha: r.fechas[0] };
}

/**
 * Un día dicho sin semana, cuando lo que importa es que haya menú: el próximo
 * que cae (hoy incluido). Si ese no tiene menú y el de esta semana, que ya
 * pasó, sí, NO se coge el pasado: se pregunta (#958: «cambia el jueves» un
 * viernes cambiaba el jueves de ayer).
 * @param {(iso: string) => boolean} tieneMenu
 * @returns {{ fecha: string } | { duda: string }}
 */
export function fechaConMenu(texto, tieneMenu, { hoy = isoDeCasa(), semana = null } = {}) {
  const r = fechaDe(texto, { hoy, semana });
  if (r.duda || tieneMenu(r.fecha) || semana) return r;
  const antes = sumarDias(r.fecha, -7);
  const esDiaSuelto = diaDeSemana(normal(texto).replace(/^(el|este)\s+/, "")) != null;
  if (esDiaSuelto && antes < hoy && antes >= lunesDe(hoy) && tieneMenu(antes)) {
    return { duda: `El ${fechaCorta(antes)} ya pasó y el ${fechaCorta(r.fecha)} aún no tiene menú. ¿Cuál de los dos? Si es el que viene, hay que generar esa semana primero.` };
  }
  return r;
}

// ── Personas ────────────────────────────────────────────────────────────────

/** Los grupos que se dicen con una palabra, en vocabulario cerrado. */
export const GRUPOS_DE_PERSONAS = Object.freeze({
  todos: /^(todos|todas|toda la casa|toda la familia|la familia|familia|todo el mundo|nosotros|nosotras|la casa)$/,
  ninos: /^(los |las )?(ninos|ninas|nenes|nenas|hijos|hijas|peques|pequenos|pequenas|crios|crias|chavales|enanos)$/,
  adultos: /^(los |las )?(adultos|adultas|mayores|padres|papas)$/,
  bebes: /^(el |la |los )?(bebe|bebes)$/,
});
const ES_YO = /^(yo|me|mi|a mi|para mi|conmigo)$/;
// «Con mi mujer», «para nosotros»: una comida de mayores (una cena de pareja no trae purés).
const ES_PAREJA = /^(con |para )?(nosotros|nosotras|nosotros dos|los dos|las dos|mi mujer|mi marido|mi pareja|mi novi[oa])$/;
export const esPareja = (texto) => ES_PAREJA.test(normal(texto));

/** ¿Qué grupo es esta palabra? «todos» | «ninos» | «adultos» | «bebes» | null. */
export function grupoDePersonas(texto) {
  const t = normal(texto);
  return Object.keys(GRUPOS_DE_PERSONAS).find((k) => GRUPOS_DE_PERSONAS[k].test(t)) ?? null;
}

/** Las personas de un grupo, con la definición de la app (stages.js). */
export function miembrosDeGrupo(miembros, grupo) {
  const ms = miembros ?? [];
  if (grupo === "todos") return [...ms];
  if (grupo === "ninos") return ms.filter((x) => esMenor(x));
  if (grupo === "adultos") return ms.filter((x) => !esMenor(x));
  if (grupo === "bebes") return ms.filter((x) => esEtapaBebe(x));
  return [];
}

/**
 * Una persona de la casa por cómo la nombran: exacto, primer nombre exacto,
 * prefijo. Con varias candidatas en un paso, NO elige: `candidatas` («Nat»
 * con Natalia y Natxo). «Yo» es quien escribe: la persona que esa cuenta
 * marcó en la app (`accountMemberIdByUser`), o, si no marcó, la única cuyo
 * nombre coincide con su nombre de Telegram; si no, se pregunta.
 * @param {object} data  household_state.data
 * @param {string} nombre
 * @param {{ userId?: string|null, autor?: string|null }} [quien]
 * @returns {{ persona: object|null, candidatas: object[], duda?: string }}
 */
export function buscarPersona(data, nombre, { userId = null, autor = null } = {}) {
  const q = normal(nombre).replace(/^(a|para|de)\s+/, "");
  // Sin nombre no hay nadie: un startsWith("") casaría con el primero de la casa.
  if (!q) return { persona: null, candidatas: [] };
  const miembros = data?.members ?? [];
  if (ES_YO.test(q)) {
    const id = miembroDeCuentaId(data, userId);
    const p = (id && miembros.find((x) => String(x.id) === String(id))) || (autor ? findAccountMember(miembros, autor) : null);
    return p ? { persona: p, candidatas: [] } : { persona: null, candidatas: [], duda: "¿Quién eres tú de la casa? Dímelo por tu nombre (o márcalo en la app, en Mi perfil)." };
  }
  const unica = (lista) => (lista.length === 1 ? { persona: lista[0], candidatas: [] } : lista.length > 1 ? { persona: null, candidatas: lista } : null);
  const primero = (x) => x.split(" ")[0];
  return unica(miembros.filter((p) => normal(p.name) === q))
    ?? unica(miembros.filter((p) => primero(normal(p.name)) === q))
    // «Leo García» cuando en la casa es «Leo».
    ?? unica(miembros.filter((p) => primero(normal(p.name)) === primero(q)))
    ?? unica(miembros.filter((p) => normal(p.name).startsWith(q)))
    ?? { persona: null, candidatas: [] };
}

/** La pregunta cuando `buscarPersona` no da a nadie: no está, hay varias, o ¿quién eres? */
export function dudaDePersona(data, nombre, quien = {}) {
  const r = buscarPersona(data, nombre, quien);
  if (r.duda) return r.duda;
  if (r.candidatas.length > 1) {
    const nombres = r.candidatas.map((p) => p.name);
    return `¿Te refieres a ${nombres.slice(0, -1).join(", ")} o a ${nombres.at(-1)}? No he cambiado nada: dime cuál.`;
  }
  return `No encuentro a ${nombre} en la casa.`;
}

/**
 * Varias personas o grupos («Leo y Nat», «los niños», «yo», «todos») → las
 * personas, sin repetir. Lo que no se resuelve va en `dudas` (la pregunta) y
 * no se cae: quien llama decide si sigue con el resto o pregunta.
 * @returns {{ personas: object[], dudas: string[], grupos: string[] }}
 */
export function personasDe(data, dichos, quien = {}) {
  const miembros = data?.members ?? [];
  const lista = (Array.isArray(dichos) ? dichos : dichos == null ? [] : [dichos])
    .flatMap((x) => String(x).split(/\s*(?:,|\by\b)\s*/)).filter((x) => normal(x));
  const sel = new Map();
  const dudas = [];
  const grupos = [];
  for (const x of lista) {
    const g = grupoDePersonas(x);
    if (g) { grupos.push(g); miembrosDeGrupo(miembros, g).forEach((p) => sel.set(p.id, p)); continue; }
    const r = buscarPersona(data, x, quien);
    if (r.persona) sel.set(r.persona.id, r.persona); else dudas.push(dudaDePersona(data, x, quien));
  }
  return { personas: [...sel.values()], dudas, grupos };
}

/** La primera persona de la casa nombrada (por su primer nombre) en un texto libre, o null. */
export function personaNombradaEn(data, texto) {
  const t = normal(texto);
  return (data?.members ?? []).find((m) => m?.name && new RegExp(`\\b${escapar(normal(m.name).split(" ")[0])}\\b`).test(t)) ?? null;
}

/** ¿Adulto? Con etapaDe (la definición de la app); sin edad ni papel, no se sabe. */
export const esAdultoSabido = (p) => etapaDe(p).etapa === "adulto";

// ── Cantidades ──────────────────────────────────────────────────────────────

const NUMEROS = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte"];
const numeroDe = (t) => {
  const x = normal(t);
  if (/^\d+$/.test(x)) return Number(x);
  if (x === "un" || x === "uno") return 1;
  if (x === "ninguna" || x === "ninguno" || x === "nada") return 0;
  const i = NUMEROS.indexOf(x);
  return i < 0 ? null : i;
};

/** Las operaciones de una cantidad, en vocabulario cerrado. */
export const OPS_CANTIDAD = Object.freeze(["<", "<=", "=", ">=", ">"]);

/**
 * «menos de dos» → { op: "<", n: 2 }; «como mucho 3», «no más de 3», «hasta
 * 3», «máximo 3» → «<=»; «al menos 2», «mínimo 2» → «>=»; «más de 2» → «>»;
 * «dos», «2 veces», «una vez» → «=»; «nunca», «ninguna» → { op: "=", n: 0 }.
 * @returns {{ op: string, n: number } | null}
 */
export function cantidadDe(texto) {
  const t = normal(texto).replace(/\s+(vez|veces|dias?|al dia|a la semana|por semana|cada semana|semanales?)\b.*$/, "").trim();
  if (!t) return null;
  if (/^(nunca|jamas|ninguna|ninguno|nada|cero)$/.test(t)) return { op: "=", n: 0 };
  const formas = [
    [/^(menos de|por debajo de)\s+(.+)$/, "<"],
    [/^(como mucho|como maximo|maximo|no mas de|hasta|a lo sumo)\s+(.+)$/, "<="],
    [/^(al menos|como minimo|minimo|por lo menos)\s+(.+)$/, ">="],
    [/^(mas de|por encima de)\s+(.+)$/, ">"],
    [/^(solo|solamente|exactamente)?\s*(.+)$/, "="],
  ];
  for (const [re, op] of formas) {
    const r = t.match(re);
    const n = r ? numeroDe(r[2]) : null;
    if (n != null) return { op, n };
  }
  return null;
}

/** Una cantidad a un número entero de veces dentro de [min, max]: «menos de 2» → 1. */
export function vecesDe(c, { min = 0, max = 7 } = {}) {
  if (!c || !OPS_CANTIDAD.includes(c.op)) return null;
  const n = c.op === "<" ? c.n - 1 : c.op === ">" ? c.n + 1 : c.n;
  return Math.max(min, Math.min(max, n));
}
