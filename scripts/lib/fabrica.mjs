/**
 * fabrica.mjs — qué cuesta la fábrica y si los presupuestos aciertan (#340,
 * fase F del plan #334). Lógica pura: sin red, sin leer ~/.claude (quien llama
 * le da las líneas de las transcripciones, los issues y el catálogo).
 *
 * Los usa scripts/fabrica.mjs (`npm run fabrica`). Hace tres cosas:
 *
 *  1. De las transcripciones locales de Claude Code (una línea JSON por
 *     evento, una carpeta por proyecto), saca por sesión y por número de issue
 *     tokens, coste estimado, minutos activos y agentes lanzados. Solo toca
 *     campos de estructura (tiempos, rama, modelo, `usage`, nombre del tipo de
 *     subagente): jamás copia texto de mensajes, prompts ni salidas de
 *     herramientas, que son privados. El resultado son números.
 *  2. Los une con los issues (encargo → fondo; ficha del fondo: alcance, tipo
 *     de causa, rondas, si aguantó).
 *  3. Compara por celda tipo_causa × alcance lo presupuestado
 *     (ops/presupuestos.json) con lo real y PROPONE subir o bajar un valor solo
 *     si hay datos de sobra. Nunca modifica el catálogo: lo aplica una persona
 *     en /revision-issues.
 *
 * Privacidad: el repo es público y el informe puede acabar en el panel. Por eso
 * la salida son agregados numéricos, números de issue y palabras de
 * vocabularios cerrados (modelo, tipo de agente, alcance, causa).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CAPAS_AGENTE, leerFicha } from "./fondos.mjs";
import { porGrupo } from "./issues.mjs";
import { numeroDeRama } from "./lleva.mjs";
import { ALCANCES, CATALOGO, CAUSAS, RANGOS, TOPE_RONDAS, celdas, presupuestoDe, problemas } from "./presupuestos.mjs";

// ── Constantes, cada una con su porqué ────────────────────────────────────────

/**
 * Minutos máximos entre dos eventos seguidos para contar ese hueco como tiempo
 * activo. Medido el 9 oct 2026 sobre 124.124 huecos de las transcripciones de
 * este repo: el 96 % dura menos de 1 min, el 99,2 % menos de 5 y el 99,6 %
 * menos de 10 (mediana 1 s). A 10 min caben las pausas de leer un resultado o
 * pensar; un hueco mayor es alguien que se ha ido, y contarlo inflaría el
 * tiempo de un encargo con comidas y noches.
 */
export const HUECO_ACTIVO_MIN = 10;

/**
 * Encargos medidos que hacen falta en UNA celda (tipo de causa × alcance) para
 * proponer un cambio. Con 3, la mediana ya no la decide un solo valor extremo;
 * con menos, una cifra suelta se tomaría por tendencia. El criterio de hecho
 * de #340 pide 10 encargos en total, repartidos en hasta 27 celdas, así que
 * solo se calibran las celdas donde se acumulan los datos: el resto dice
 * «datos insuficientes» y espera.
 */
export const MIN_ENCARGOS_CELDA = 3;

/** Fondos distintos en la celda: con un solo fondo, «la mediana» es ese fondo y no un patrón. */
export const MIN_FONDOS_CELDA = 2;

/** El criterio de hecho de #340: encargos medidos en total para dar el informe por bueno. */
export const MIN_ENCARGOS_INFORME = 10;

/**
 * Cuánto se tiene que apartar la mediana real de lo presupuestado para
 * proponer un cambio: más de una vez y media (o menos de dos tercios). Entre
 * medias, la diferencia es ruido de un presupuesto que ya es a ojo.
 */
export const RATIO_PROPUESTA = 1.5;

/** Los minutos se proponen de 5 en 5: no hay precisión que justifique más (los valores iniciales son a ojo). */
export const PASO_MINUTOS = 5;

/** Tipos de subagente que se nombran en el informe; cualquier otro sale como «otro» (el nombre lo escribe quien lanza el agente). */
export const TIPOS_AGENTE = [
  ...CAPAS_AGENTE.filter((c) => c !== "sesión"),
  "general-purpose", "Explore", "Plan", "claude-code-guide", "statusline-setup", "fork",
];

/** Los resultados de «aguantó» del arreglo de un fondo. */
export const AGUANTO = {
  si: "Ficha en cerrado-eficaz: la ventana pasó limpia",
  no: "Reabierto: ficha en reabierto, una reapertura o un caso «no aguantó»",
  "sin-reapertura": "Cerrado sin ficha y sin reaperturas: indicio débil, no cuenta como «aguantó»",
  "en-curso": "Abierto o en observación: todavía no se sabe",
};

const RUTA_PRECIOS = new URL("../../ops/precios-modelos.json", import.meta.url);
/** La tabla de precios tal como está en ops/precios-modelos.json. */
export const PRECIOS = JSON.parse(readFileSync(fileURLToPath(RUTA_PRECIOS), "utf8"));

// ── Leer una transcripción (solo estructura) ──────────────────────────────────

const natural = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const MODELO_OK = /^[\w.-]{1,40}$/;
const RAMA_OK = /^[\w./-]{1,120}$/;

/** Líneas JSON de una transcripción; una cortada o rota se salta. */
export function leerLineas(texto) {
  const out = [];
  for (const l of String(texto ?? "").split("\n")) {
    if (!l.trim()) continue;
    try {
      const o = JSON.parse(l);
      if (o && typeof o === "object" && !Array.isArray(o)) out.push(o);
    } catch {
      // a propósito: una línea cortada (la transcripción se escribe mientras se lee) no tumba la sesión entera
    }
  }
  return out;
}

/** El tipo de un subagente, solo si es de la lista; el resto, «otro» (o «sin-tipo» si no lo dice). */
export function tipoDeAgente(valor) {
  if (valor === undefined || valor === null || valor === "") return "sin-tipo";
  return TIPOS_AGENTE.includes(valor) ? valor : "otro";
}

/**
 * De las líneas de UNA transcripción saca, y solo esto:
 *   eventos   [{ t (ms), rama, id }] de los turnos del usuario y del asistente
 *   mensajes  Map<id, { modelo, entrada, salida, lectura, escritura_5m, escritura_1h, t, rama }>
 *             (Claude Code repite un mensaje por cada bloque: se queda con el mayor de cada cifra)
 *   agentes   [{ tipo, t, rama }] de las llamadas a la herramienta Agent
 *   sesion    el sessionId, si consta
 * `desde` (ms) descarta lo anterior. Nunca lee `content` más que para ver el
 * nombre y el tipo de las llamadas a Agent.
 */
export function extraer(lineas, { desde = 0 } = {}) {
  const eventos = [];
  const mensajes = new Map();
  const agentes = [];
  let rama = null;
  let sesion = null;
  let n = 0;
  for (const o of lineas) {
    if (typeof o.gitBranch === "string") rama = RAMA_OK.test(o.gitBranch) ? o.gitBranch : rama;
    if (!sesion && typeof o.sessionId === "string") sesion = o.sessionId;
    const t = Date.parse(o.timestamp);
    if (o.type !== "user" && o.type !== "assistant") continue;
    if (!Number.isFinite(t) || t < desde) continue;
    eventos.push({ t, rama, id: typeof o.uuid === "string" ? o.uuid : null });
    if (o.type !== "assistant") continue;
    const m = o.message;
    if (Array.isArray(m?.content)) {
      for (const c of m.content) {
        if (c?.type === "tool_use" && c.name === "Agent") agentes.push({ tipo: tipoDeAgente(c.input?.subagent_type), t, rama });
      }
    }
    const u = m?.usage;
    if (!u || typeof m.model !== "string" || m.model === "<synthetic>") continue;
    const cc = u.cache_creation;
    const e5 = cc ? natural(cc.ephemeral_5m_input_tokens) : natural(u.cache_creation_input_tokens);
    const e1 = cc ? natural(cc.ephemeral_1h_input_tokens) : 0;
    const dato = {
      modelo: MODELO_OK.test(m.model) ? m.model : "otro",
      entrada: natural(u.input_tokens), salida: natural(u.output_tokens), lectura: natural(u.cache_read_input_tokens),
      escritura_5m: e5, escritura_1h: e1, t, rama,
    };
    const clave = typeof m.id === "string" ? m.id : `sin-id-${n++}`;
    const previo = mensajes.get(clave);
    if (!previo) mensajes.set(clave, dato);
    else for (const k of ["entrada", "salida", "lectura", "escritura_5m", "escritura_1h"]) previo[k] = Math.max(previo[k], dato[k]);
  }
  return { eventos, mensajes, agentes, sesion };
}

// ── Coste ─────────────────────────────────────────────────────────────────────

/** La fila de precios de un modelo (sin el sufijo de fecha, `-20251001`), o null si no está: no se inventa. */
export function precioDe(modelo, precios = PRECIOS) {
  const id = String(modelo).replace(/-\d{8}$/, "");
  return Object.hasOwn(precios?.modelos ?? {}, id) ? precios.modelos[id] : null;
}

/** Coste estimado de un mensaje en USD, o null si el modelo no tiene precio. */
export function costeDeMensaje(m, precios = PRECIOS) {
  const p = precioDe(m.modelo, precios);
  if (!p) return null;
  const prompt = m.entrada + m.lectura + m.escritura_5m + m.escritura_1h;
  const t = p.prompt_largo && prompt > p.prompt_largo.desde_tokens ? p.prompt_largo : p;
  return (m.entrada * t.entrada + m.escritura_5m * t.escritura_5m + m.escritura_1h * t.escritura_1h + m.lectura * t.lectura + m.salida * t.salida) / 1e6;
}

/**
 * Las transcripciones de una carpeta de proyectos de Claude Code: una por
 * sesión (`<carpeta>/<id>.jsonl`) y las de sus subagentes
 * (`<carpeta>/<id>/subagents/*.jsonl`). Solo las carpetas cuyo nombre cumple
 * `prefijo` (por defecto, las de MenuPlan y sus worktrees).
 * → [{ principal, subagentes: [ruta] }]. Solo lista rutas; no lee contenido.
 */
export function listarTranscripciones(base, prefijo = /MenuPlan/i) {
  if (!existsSync(base)) return [];
  const out = [];
  for (const carpeta of readdirSync(base, { withFileTypes: true })) {
    if (!carpeta.isDirectory() || !prefijo.test(carpeta.name)) continue;
    const dir = join(base, carpeta.name);
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
      const id = f.name.slice(0, -6);
      const sub = join(dir, id, "subagents");
      const subagentes = existsSync(sub) ? readdirSync(sub).filter((x) => x.endsWith(".jsonl")).map((x) => join(sub, x)) : [];
      out.push({ principal: join(dir, f.name), subagentes });
    }
  }
  return out;
}

// ── Sesiones: tokens, minutos y agentes por issue ─────────────────────────────

/** Un cubo de medidas vacío. */
export const cubo = () => ({
  minutos: 0, mensajes: 0, sesiones: 0, subagentes: 0,
  tokens: { entrada: 0, salida: 0, cache_lectura: 0, cache_escritura: 0 },
  coste_usd: 0, sin_precio: 0, modelos: {}, agentes: {},
});

/** Suma `b` en `a` (cubos). */
export function sumar(a, b) {
  a.minutos += b.minutos; a.mensajes += b.mensajes; a.sesiones += b.sesiones; a.subagentes += b.subagentes;
  for (const k of Object.keys(a.tokens)) a.tokens[k] += b.tokens[k];
  a.coste_usd += b.coste_usd; a.sin_precio += b.sin_precio;
  for (const k of ["modelos", "agentes"]) for (const [x, v] of Object.entries(b[k])) a[k][x] = (a[k][x] ?? 0) + v;
  return a;
}

export const totalTokens = (c) => c.tokens.entrada + c.tokens.salida + c.tokens.cache_lectura + c.tokens.cache_escritura;

/**
 * Una sesión: lo extraído de su transcripción principal y de las de sus
 * subagentes (todas del mismo sessionId). → { sesion, porIssue: Map<number|null, cubo> }.
 * La rama de cada evento da su issue (numeroDeRama, la misma regla que
 * lleva.mjs y fondos-pr.mjs); lo que no tiene rama de issue va a `null`.
 * Los minutos son el reloj de pared de la sesión entera, subagentes incluidos:
 * se unen los eventos y se suman solo los huecos de menos de `huecoMin`.
 *
 * `vistos` (Set compartido entre sesiones) evita contar dos veces lo que Claude
 * Code copia a una sesión retomada o bifurcada: el historial de la sesión madre,
 * con los mismos ids de mensaje y de evento. Quien llama las pasa de la más
 * antigua a la más reciente (ordenarSesiones), y la copia no se lleva lo que ya
 * era de la original.
 */
export function resumirPartes(partes, { huecoMin = HUECO_ACTIVO_MIN, precios = PRECIOS, vistos = new Set() } = {}) {
  const sesion = partes.find((p) => p.sesion)?.sesion ?? null;
  const porIssue = new Map();
  const de = (rama) => {
    const issue = numeroDeRama(rama);
    if (!porIssue.has(issue)) porIssue.set(issue, cubo());
    return porIssue.get(issue);
  };
  const nuevoId = (id) => {
    if (id === null || id === undefined) return true;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  };
  const eventos = partes.flatMap((p) => p.eventos).filter((e) => nuevoId(e.id === null ? null : `e:${e.id}`)).sort((a, b) => a.t - b.t);
  for (let i = 1; i < eventos.length; i++) {
    const hueco = (eventos[i].t - eventos[i - 1].t) / 60_000;
    if (hueco < huecoMin) de(eventos[i].rama).minutos += hueco;
  }
  for (const p of partes) {
    for (const [id, m] of p.mensajes) {
      if (!nuevoId(id.startsWith("sin-id-") ? null : `m:${id}`)) continue;
      const c = de(m.rama);
      c.mensajes += 1;
      c.tokens.entrada += m.entrada; c.tokens.salida += m.salida; c.tokens.cache_lectura += m.lectura;
      c.tokens.cache_escritura += m.escritura_5m + m.escritura_1h;
      c.modelos[m.modelo] = (c.modelos[m.modelo] ?? 0) + 1;
      const coste = costeDeMensaje(m, precios);
      if (coste === null) c.sin_precio += 1;
      else c.coste_usd += coste;
    }
    for (const a of p.agentes) {
      const c = de(a.rama);
      c.agentes[a.tipo] = (c.agentes[a.tipo] ?? 0) + 1;
    }
  }
  for (const c of porIssue.values()) { c.subagentes = Object.values(c.agentes).reduce((x, y) => x + y, 0); c.sesiones = 1; }
  return { sesion, porIssue };
}

/** Atajo: lo mismo desde las líneas crudas de cada fichero de la sesión. */
export function resumirSesion(archivos, { desde = 0, ...resto } = {}) {
  return resumirPartes(archivos.map((lineas) => extraer(lineas, { desde })), resto);
}

/** Primer instante de una sesión ya extraída (ms; Infinity si no tiene eventos), para ordenarlas de la más antigua a la más reciente. */
export const inicioDe = (partes) => partes.reduce((min, p) => p.eventos.reduce((m, e) => (e.t < m ? e.t : m), min), Infinity);

/** Junta las sesiones: Map<number|null, cubo> con `sesiones` = en cuántas aparece ese issue. */
export function agregarPorIssue(sesiones) {
  const out = new Map();
  for (const s of sesiones) {
    for (const [issue, c] of s.porIssue) {
      if (!out.has(issue)) out.set(issue, cubo());
      sumar(out.get(issue), c);
    }
  }
  return out;
}

// ── Unir con los issues ───────────────────────────────────────────────────────

const nombres = (labels) => (labels ?? []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
const tipoDe = (issue) => [...porGrupo(nombres(issue.labels)).tipo][0] ?? null;
const causaDe = (issue) => [...porGrupo(nombres(issue.labels)).causa][0] ?? null;

/**
 * ¿Aguantó el arreglo de un fondo? Vocabulario AGUANTO. Solo `si` y `no` son
 * evidencia; «sin-reapertura» es un indicio (cerrado, sin ficha, nadie lo
 * reabrió) y no basta para bajar un presupuesto.
 */
export function aguantoDe(fondo, ficha) {
  const noAguanto = (fondo.hijos ?? []).filter((h) => [...porGrupo(nombres(h.labels)).analisis].some((a) => a.startsWith("no-aguanto"))).length;
  if (ficha?.estado === "cerrado-eficaz") return "si";
  if (ficha?.estado === "reabierto" || (fondo.reaperturas ?? 0) > 0 || noAguanto > 0) return "no";
  if (fondo.state === "CLOSED" && !ficha?.estado) return "sin-reapertura";
  return "en-curso";
}

const resumen = (c) => ({
  minutos: Math.round(c.minutos * 10) / 10,
  tokens: { ...c.tokens, total: totalTokens(c) },
  coste_usd: c.mensajes && c.sin_precio < c.mensajes ? Math.round(c.coste_usd * 100) / 100 : null,
  sin_precio: c.sin_precio, sesiones: c.sesiones, agentes: { ...c.agentes }, subagentes: c.subagentes, modelos: { ...c.modelos },
});

/**
 * Junta lo medido con los issues. `medidas` es el Map de agregarPorIssue; `issues`,
 * la lista de leerIssue() de scripts/lib/issues.mjs (con `padre` e `hijos`).
 *
 * → { encargos, fondos, otros, sinLocalizar, sinIssue }
 *   encargos[]  { issue, fondo, ...medidas, rondas, aguanto }   (rondas y aguantó, los del fondo)
 *   fondos[]    { issue, alcance, tipo_causa, estado, rondas, aguanto, encargos: [#], ...medidas sumadas }
 *   otros[]     números de issue medidos que no son ni encargo ni fondo (casos, decisiones…)
 *   sinLocalizar[] números de rama que no existen como issue (rama mal numerada)
 *   sinIssue    medidas de lo que no tiene rama de issue
 */
export function unirConGithub(medidas, issues) {
  const porNumero = new Map(issues.map((i) => [i.number, i]));
  const fondosMedidos = new Map();
  const encargos = [];
  const otros = [];
  const sinLocalizar = [];

  const fichaDe = (f) => {
    const { ficha } = leerFicha(f.body);
    return { alcance: ficha.alcance ?? null, tipo_causa: ficha.tipo_causa ?? causaDe(f), estado: ficha.estado ?? null, rondas: Number.isInteger(ficha.rondas) ? ficha.rondas : null, ficha };
  };
  const fondoRow = (f) => {
    if (!fondosMedidos.has(f.number)) {
      const d = fichaDe(f);
      fondosMedidos.set(f.number, { issue: f.number, alcance: d.alcance, tipo_causa: d.tipo_causa, estado: d.estado, rondas: d.rondas, aguanto: aguantoDe(f, d.ficha), encargos: [], propio: false, cubo: cubo() });
    }
    return fondosMedidos.get(f.number);
  };

  for (const [n, c] of medidas) {
    if (n === null) continue;
    const i = porNumero.get(n);
    if (!i) { sinLocalizar.push(n); continue; }
    const tipo = tipoDe(i);
    if (tipo === "fondo") {
      const f = fondoRow(i);
      f.propio = true;
      sumar(f.cubo, c);
    } else if (tipo === "encargo") {
      const padre = i.padre ? porNumero.get(i.padre.number) : null;
      const f = padre && tipoDe(padre) === "fondo" ? fondoRow(padre) : null;
      if (f) { f.encargos.push(n); sumar(f.cubo, c); }
      encargos.push({ issue: n, fondo: f?.issue ?? null, ...resumen(c), rondas: f?.rondas ?? null, aguanto: f?.aguanto ?? null });
    } else {
      otros.push(n);
    }
  }
  const fondos = [...fondosMedidos.values()]
    .map(({ cubo: c, ...f }) => ({ ...f, encargos: f.encargos.sort((a, b) => a - b), ...resumen(c) }))
    .sort((a, b) => a.issue - b.issue);
  return {
    encargos: encargos.sort((a, b) => a.issue - b.issue),
    fondos, otros: otros.sort((a, b) => a - b), sinLocalizar: sinLocalizar.sort((a, b) => a - b),
    sinIssue: medidas.has(null) ? resumen(medidas.get(null)) : null,
  };
}

// ── Recalibración ─────────────────────────────────────────────────────────────

export function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
const maximo = (xs) => (xs.length ? Math.max(...xs) : null);
const redondeo = (x, paso) => Math.round(x / paso) * paso;
const entre = (x, [min, max]) => Math.min(max, Math.max(min, x));
const dec = (x) => (x === null ? null : Math.round(x * 10) / 10);

/** Dónde vive en el catálogo un campo de una celda: la causa si lo sobrescribe, y si no, el alcance. */
export function destinoDe(alcance, causa, campo, catalogo = CATALOGO) {
  return Object.hasOwn(catalogo.por_causa ?? {}, causa) && campo in catalogo.por_causa[causa] ? `por_causa.${causa}.${campo}` : `por_alcance.${alcance}.${campo}`;
}

/** Una copia del catálogo con el valor propuesto puesto; sirve para ver si lo dejaría inválido. */
function conValor(catalogo, destino, valor) {
  const copia = JSON.parse(JSON.stringify(catalogo));
  const [bloque, clave, campo] = destino.split(".");
  copia[bloque][clave][campo] = valor;
  return copia;
}

/**
 * La decisión de un campo en una celda. → { campo, presupuestado, real,
 * decision, propuesto?, donde?, aplicable?, nota? }
 *   decision: datos-insuficientes | sin-medida | en-rango | subir | bajar | al-tope
 */
function decidirCampo(campo, c, p, catalogo) {
  const base = { campo, presupuestado: p[campo] };
  const suficiente = c.encargos >= MIN_ENCARGOS_CELDA && c.fondos.length >= MIN_FONDOS_CELDA;
  const valores = campo === "minutos_orientativos" ? c.fondos.map((f) => f.minutos) : c.fondos.map((f) => f.rondas).filter((r) => r !== null);
  if (!suficiente) return { ...base, real: null, decision: "datos-insuficientes", nota: `${c.encargos} encargos y ${c.fondos.length} fondos; hacen falta ${MIN_ENCARGOS_CELDA} y ${MIN_FONDOS_CELDA}` };
  if (!valores.length || (campo === "rondas_max" && valores.length < MIN_FONDOS_CELDA)) return { ...base, real: null, decision: "sin-medida", nota: "las fichas no traen rondas (o menos de las que hacen falta)" };
  const real = { mediana: dec(mediana(valores)), maximo: dec(maximo(valores)), fondos: valores.length };
  const todosAguantan = c.fondos.every((f) => f.aguanto === "si");
  let r;
  if (campo === "minutos_orientativos") {
    const ratio = real.mediana / p[campo];
    if (ratio > RATIO_PROPUESTA) r = { decision: "subir", propuesto: entre(redondeo(real.mediana, PASO_MINUTOS), RANGOS[campo]) };
    else if (ratio < 1 / RATIO_PROPUESTA) {
      r = todosAguantan
        ? { decision: "bajar", propuesto: entre(Math.max(PASO_MINUTOS, redondeo(real.mediana, PASO_MINUTOS)), RANGOS[campo]) }
        : { decision: "en-rango", nota: "gasta menos de lo presupuestado, pero no consta que todos aguantaran: no se baja" };
    } else r = { decision: "en-rango" };
  } else if (p[campo] >= TOPE_RONDAS && real.maximo >= p[campo]) {
    r = { decision: "al-tope", nota: `llegó al máximo de ${TOPE_RONDAS} rondas: el tope es duro y no se sube; si hace falta más, decide una persona` };
  } else if (real.maximo <= 1 && p[campo] > 1 && todosAguantan) {
    r = { decision: "bajar", propuesto: 1 };
  } else r = { decision: "en-rango" };
  if (r.propuesto !== undefined && r.propuesto === p[campo]) r = { decision: "en-rango" };
  if (r.propuesto !== undefined) {
    const donde = destinoDe(c.alcance, c.causa, campo, catalogo);
    const mal = problemas(conValor(catalogo, donde, r.propuesto));
    Object.assign(r, { donde, aplicable: mal.length === 0 });
    if (mal.length) r.nota = `dejaría el catálogo inválido (${mal[0].split(":")[0]}): no se propone tal cual`;
  }
  return { ...base, real, ...r };
}

/**
 * Por celda tipo_causa × alcance: presupuestado frente a real y qué se propone.
 * Solo entran fondos con alcance y tipo de causa de la ficha (o la etiqueta
 * `causa:`) y al menos un encargo medido, o el propio fondo medido.
 * → { filas, sinCelda, encargosEnCelda, fondosEnCelda }
 */
export function recalibrar(fondos, catalogo = CATALOGO) {
  const filas = [];
  let sinCelda = 0;
  const validos = fondos.filter((f) => ALCANCES.includes(f.alcance) && CAUSAS.includes(f.tipo_causa));
  sinCelda = fondos.length - validos.length;
  for (const { alcance, causa } of celdas()) {
    const fs = validos.filter((f) => f.alcance === alcance && f.tipo_causa === causa);
    if (!fs.length) continue;
    const c = { alcance, causa, fondos: fs, encargos: fs.reduce((n, f) => n + (f.encargos.length || (f.propio ? 1 : 0)), 0) };
    const p = presupuestoDe(alcance, causa, catalogo);
    const costes = fs.map((f) => f.coste_usd).filter((x) => x !== null);
    filas.push({
      alcance, causa, encargos: c.encargos, fondos: fs.map((f) => f.issue),
      aguantaron: fs.filter((f) => f.aguanto === "si").length, no_aguantaron: fs.filter((f) => f.aguanto === "no").length,
      coste_usd: costes.length ? { mediana: Math.round(mediana(costes) * 100) / 100, maximo: Math.round(maximo(costes) * 100) / 100 } : null,
      campos: [decidirCampo("rondas_max", c, p, catalogo), decidirCampo("minutos_orientativos", c, p, catalogo)],
    });
  }
  // Dos celdas que tocan el mismo valor del catálogo con propuestas distintas: no se resuelve solo.
  const propuestas = filas.flatMap((f) => f.campos.filter((c) => c.propuesto !== undefined));
  for (const c of propuestas) {
    const otras = propuestas.filter((o) => o.donde === c.donde && o.propuesto !== c.propuesto);
    if (otras.length) { c.aplicable = false; c.nota = `otra celda propone otro valor para ${c.donde}: decide una persona`; }
  }
  return {
    filas, sinCelda,
    encargosEnCelda: filas.reduce((n, f) => n + f.encargos, 0),
    fondosEnCelda: validos.length,
  };
}

// ── El informe (solo agregados) ───────────────────────────────────────────────

/** Cuántos encargos hay medidos en total y si el criterio de #340 (10) se alcanza. */
export function cobertura({ sesiones, union, recal }) {
  const encargosMedidos = union.encargos.length;
  return {
    sesiones,
    issues_medidos: union.encargos.length + union.fondos.filter((f) => f.propio).length + union.otros.length,
    encargos_medidos: encargosMedidos,
    fondos_medidos: union.fondos.length,
    fondos_en_celda: recal.fondosEnCelda,
    encargos_en_celda: recal.encargosEnCelda,
    fondos_sin_celda: recal.sinCelda,
    criterio: MIN_ENCARGOS_INFORME,
    criterio_alcanzado: recal.encargosEnCelda >= MIN_ENCARGOS_INFORME,
  };
}

const f1 = (x) => (x === null || x === undefined ? "—" : String(Math.round(x * 10) / 10).replace(".", ","));
const miles = (x) => Math.round(x).toLocaleString("es-ES");
const usd = (x) => (x === null ? "sin precio" : `${f1(x)} USD`);

/** El informe en texto. Solo números, números de issue y palabras de vocabularios cerrados. */
export function textoInforme({ cobertura: cob, union, recal, desde = null, huecoMin = HUECO_ACTIVO_MIN, precios = PRECIOS, recalibracion = false }) {
  const L = [];
  L.push("Informe de la fábrica (fase F, #340) — solo agregados; los costes son una estimación a precio de API.");
  L.push(`Desde: ${desde ?? "el principio de las transcripciones"}. Minutos activos: huecos de menos de ${huecoMin} min. Precios de ${precios.comprobado_el} (${precios.estimacion ? "estimación" : "oficial"}).`);
  L.push("");
  L.push("Cobertura");
  L.push(`  sesiones medidas: ${cob.sesiones}; fondos con medidas: ${cob.fondos_medidos}; encargos medidos: ${cob.encargos_medidos}`);
  L.push(`  en alguna celda (fondo con alcance y tipo de causa): ${cob.encargos_en_celda} encargos de ${cob.fondos_en_celda} fondos; ${cob.fondos_sin_celda} fondos sin alcance o sin causa en su ficha`);
  L.push(`  criterio de #340 (${cob.criterio} encargos con datos): ${cob.criterio_alcanzado ? "alcanzado" : "NO alcanzado todavía"}`);
  if (union.sinLocalizar.length) L.push(`  ramas con un número que no es ningún issue: ${union.sinLocalizar.map((n) => `#${n}`).join(", ")}`);
  if (union.sinIssue) L.push(`  sin rama de issue: ${f1(union.sinIssue.minutos)} min, ${miles(union.sinIssue.tokens.total)} tokens, ${usd(union.sinIssue.coste_usd)} (el trabajo que no cuelga de ningún encargo)`);
  L.push("");
  L.push("Por fondo (minutos, tokens, coste y agentes de sus encargos)");
  if (!union.fondos.length) L.push("  ningún fondo con medidas");
  for (const f of union.fondos) {
    const ag = Object.entries(f.agentes).map(([t, n]) => `${t}×${n}`).join(" ") || "ninguno";
    L.push(`  #${f.issue} [${f.alcance ?? "sin alcance"} · ${f.tipo_causa ?? "sin causa"}] encargos ${f.encargos.map((n) => `#${n}`).join(" ") || "—"} | rondas ${f.rondas ?? "—"} | ${f1(f.minutos)} min | ${miles(f.tokens.total)} tokens | ${usd(f.coste_usd)} | agentes ${ag} | aguantó: ${f.aguanto}`);
  }
  L.push("");
  L.push("Por encargo");
  if (!union.encargos.length) L.push("  ningún encargo con medidas");
  for (const e of union.encargos) {
    const ag = Object.entries(e.agentes).map(([t, n]) => `${t}×${n}`).join(" ") || "ninguno";
    L.push(`  #${e.issue} (fondo ${e.fondo ? `#${e.fondo}` : "—"}) | ${f1(e.minutos)} min | ${miles(e.tokens.total)} tokens (salida ${miles(e.tokens.salida)}) | ${usd(e.coste_usd)} | ${e.sesiones} sesiones | agentes ${ag}`);
  }
  if (!recalibracion) return `${L.join("\n")}\n`;
  L.push("");
  L.push("Recalibración: presupuestado frente a real, por tipo de causa × alcance");
  L.push(`  Solo se propone con al menos ${MIN_ENCARGOS_CELDA} encargos y ${MIN_FONDOS_CELDA} fondos en la celda; con menos, «datos insuficientes». Nada de esto toca ops/presupuestos.json: lo aplica una persona en /revision-issues.`);
  if (!recal.filas.length) L.push("  ninguna celda con datos todavía");
  for (const fila of recal.filas) {
    L.push(`  ${fila.alcance} × ${fila.causa}: ${fila.encargos} encargos en ${fila.fondos.length} fondos (${fila.fondos.map((n) => `#${n}`).join(" ")}), aguantaron ${fila.aguantaron}, no ${fila.no_aguantaron}${fila.coste_usd ? `, coste mediana ${f1(fila.coste_usd.mediana)} / máx ${f1(fila.coste_usd.maximo)} USD` : ""}`);
    for (const c of fila.campos) {
      const real = c.real ? `real mediana ${f1(c.real.mediana)} / máx ${f1(c.real.maximo)} (${c.real.fondos} fondos)` : "real —";
      const que = { "datos-insuficientes": "datos insuficientes", "sin-medida": "sin medida", "en-rango": "en rango", "al-tope": "al tope" }[c.decision]
        ?? `${c.decision.toUpperCase()} a ${c.propuesto} en ${c.donde}${c.aplicable ? "" : " (NO aplicable tal cual)"}`;
      L.push(`    ${c.campo}: presupuestado ${c.presupuestado}, ${real} → ${que}${c.nota ? ` — ${c.nota}` : ""}`);
    }
  }
  return `${L.join("\n")}\n`;
}
