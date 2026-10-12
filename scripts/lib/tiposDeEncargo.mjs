/**
 * tiposDeEncargo.mjs — el lector único de los tipos de encargo (#640, fondo #639).
 *
 * `ops/tipos-de-encargo.json` es el dato: CINCO tipos (crear, arreglar, mejorar, operar, auditar), cada uno
 * con el esqueleto mínimo de pasos, y los 17 de siempre como SUBTIPOS (`tipos` en el JSON, nombre histórico
 * que lee el panel de la factoría y no se renombra). Aquí viven la lectura, las reglas de forma
 * (`problemas`, con el nombre de la regla al principio de cada línea) y la tabla de `/orquestar`, que se
 * GENERA desde el JSON. Los agentes salen de `.claude/agents/` (agentes.mjs) y el presupuesto, de
 * `ops/presupuestos.json` (presupuestos.mjs): `encargoDe` los junta sin copiar nada.
 *
 * No calcula agentes desde el diff (eso es E2, #641): dado un subtipo, un alcance y una complejidad,
 * devuelve lo que dicen los dos catálogos.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENTES, CONSTRUCTORES, JUECES } from "./agentes.mjs";
import { ALCANCES, CATALOGO as PRESUPUESTOS, COMPLEJIDADES, PIPELINES } from "./presupuestos.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUTA_TIPOS = "ops/tipos-de-encargo.json";
export const RUTA_ORQUESTAR = ".claude/commands/orquestar.md";
export const MARCA_INICIO = "<!-- tipos:tabla:inicio -->";
export const MARCA_FIN = "<!-- tipos:tabla:fin -->";

export const leerTipos = (raiz = RAIZ) => JSON.parse(readFileSync(join(raiz, RUTA_TIPOS), "utf8"));
export const DATOS = leerTipos();

/** Los cinco tipos: { id: { que, esqueleto, cuando } }. */
export const TIPOS = DATOS.tipos_de_encargo;
/** Los subtipos (los 17 de siempre), en el orden del JSON. */
export const SUBTIPOS = DATOS.tipos;
/** Las banderas de una condición: { id: { si, que } }. */
export const BANDERAS = DATOS.banderas;
/** Los agentes que no son ficheros: sesion, constructor, constructores. */
export const ESPECIALES = Object.keys(DATOS.especiales);
export { COMPLEJIDADES };

/** Definición de cada vocabulario, para anclarlo (vocabulariosVida.mjs). */
export const textosDeTipos = (d = DATOS) => Object.fromEntries(Object.entries(d.tipos_de_encargo).map(([k, t]) => [k, t.que]));
export const textosDeSubtipos = (d = DATOS) => Object.fromEntries(d.tipos.map((t) => [t.id, t.accion]));
export const textosDeBanderas = (d = DATOS) => Object.fromEntries(Object.entries(d.banderas).map(([k, b]) => [k, b.que]));

const todosLosAgentes = (paso) => [...(paso.agentes ?? []), ...(paso.opcional ?? []).map((o) => o.agente)];

/** El rol de un agente en un paso: constructor (un constructor, o el especial que construye), juez, o null. */
export function rolDe(agente, ctx = { agentes: AGENTES }) {
  if (["sesion", "constructor", "constructores"].includes(agente)) return "constructor";
  return ctx.agentes[agente] ?? null;
}

/**
 * ¿Un subtipo cumple el esqueleto de su tipo? Lista de problemas, cada uno con el nombre de su regla delante.
 * Reglas: roles (los pasos contienen, en orden, los roles del esqueleto), juez-siempre (algún juez entra
 * siempre, no solo como opcional), solo-jueces (auditar), cierre (operar irreversible cierra con persona),
 * medida (mejorar dice qué mide antes y después).
 */
export function problemasDeEsqueleto(sub, tipos = TIPOS, ctx = { agentes: AGENTES }) {
  const p = [];
  const tipo = tipos?.[sub.tipo];
  if (!tipo) return [`tipo: ${sub.id} cuelga de «${sub.tipo}», que no es un tipo (${Object.keys(tipos ?? {}).join(", ")})`];
  const esq = tipo.esqueleto;
  const siempre = sub.pasos.map((paso) => (paso.agentes ?? []).map((a) => rolDe(a, ctx)));
  // roles: subsecuencia de pasos. Un paso aporta su rol si alguno de sus agentes fijos lo tiene.
  let i = 0;
  for (const paso of siempre) {
    if (i < esq.roles.length && paso.includes(esq.roles[i])) i++;
  }
  if (i < esq.roles.length) p.push(`roles: ${sub.id} (${sub.tipo}) tiene que llevar, en este orden, ${esq.roles.join(" → ")}; le falta «${esq.roles[i]}»`);
  if (!siempre.some((r) => r.includes("juez"))) p.push(`juez-siempre: ${sub.id} no tiene ningún juez que entre siempre (un juez solo opcional no vale): el juez mínimo es obligatorio`);
  // Quien construye no juzga: el primer paso con constructor no puede ser también el único con juez.
  sub.pasos.forEach((paso, n) => {
    const rs = (paso.agentes ?? []).map((a) => rolDe(a, ctx));
    if (rs.includes("constructor") && !rs.includes("juez") && n === sub.pasos.length - 1 && sub.tipo !== "auditar") p.push(`juez-despues: ${sub.id} termina en un constructor sin juez detrás`);
  });
  if (esq.solo_jueces_en_paralelo) {
    if (sub.pasos.length !== 1) p.push(`paralelo: ${sub.id} (${sub.tipo}) va en un solo paso con todos los jueces en paralelo y tiene ${sub.pasos.length}`);
    const permitidos = new Set([...JUECES, ...(sub.mide_con ?? [])]);
    for (const a of sub.pasos.flatMap(todosLosAgentes)) if (!permitidos.has(a)) p.push(`solo-jueces: ${sub.id} nombra «${a}», que no es juez; si solo mide, va en «mide_con»`);
    for (const a of sub.mide_con ?? []) if (!sub.pasos.flatMap(todosLosAgentes).includes(a)) p.push(`solo-jueces: ${sub.id} dice que mide con «${a}» y no aparece en sus pasos`);
  } else if (sub.mide_con) p.push(`solo-jueces: ${sub.id} (${sub.tipo}) lleva «mide_con», que es solo de auditar`);
  if (esq.irreversible_con_cierre) {
    if (typeof sub.irreversible !== "boolean") p.push(`cierre: ${sub.id} (${sub.tipo}) dice si es irreversible («irreversible»: verdadero o falso)`);
    else if (sub.irreversible && !sub.cierra_con) p.push(`cierre: ${sub.id} es irreversible y no cierra con el OK de una persona («cierra_con»)`);
  } else if ("irreversible" in sub) p.push(`cierre: ${sub.id} (${sub.tipo}) lleva «irreversible», que es solo de operar`);
  if (esq.mide_antes_y_despues) {
    if (typeof sub.medida !== "string" || sub.medida.length < 10) p.push(`medida: ${sub.id} (${sub.tipo}) dice qué se mide antes y después («medida»)`);
  } else if ("medida" in sub) p.push(`medida: ${sub.id} (${sub.tipo}) lleva «medida», que es solo de mejorar`);
  return p;
}

/** Lo que está mal en el catálogo de tipos (lista vacía si está bien). Cada línea empieza por el nombre de su regla. */
export function problemas(d = DATOS, ctx = { agentes: AGENTES }) {
  const p = [];
  const tipos = d?.tipos_de_encargo ?? {};
  const especiales = Object.keys(d?.especiales ?? {});
  const ids = (d?.tipos ?? []).map((t) => t.id);
  if (new Set(ids).size !== ids.length) p.push("id: hay subtipos con el mismo id");
  for (const [k, t] of Object.entries(tipos)) {
    if (!/^[a-z]+$/.test(k)) p.push(`id: el tipo «${k}» es una palabra en minúsculas`);
    if (typeof t.que !== "string" || t.que.length < 10) p.push(`definicion: el tipo ${k} lleva su «que»`);
    if (!Array.isArray(t.esqueleto?.roles) || !t.esqueleto.roles.length || t.esqueleto.roles.some((r) => !["constructor", "juez"].includes(r))) p.push(`esqueleto: el tipo ${k} lleva «roles» con constructor y juez`);
    else if (!t.esqueleto.roles.includes("juez")) p.push(`juez: el tipo ${k} no tiene ningún juez en su esqueleto: ningún tipo se queda sin juez`);
    else if (k !== "auditar" && !t.esqueleto.roles.includes("constructor")) p.push(`esqueleto: el tipo ${k} no lleva constructor`);
  }
  const bandera = d?.banderas ?? {};
  for (const [k, b] of Object.entries(bandera)) {
    if (!/^[a-z]+(_[a-z]+)*$/.test(k)) p.push(`bandera: «${k}» va en minúsculas y snake_case`);
    if (!b.si || !b.que) p.push(`bandera: ${k} lleva «si» (la condición corta) y «que»`);
  }
  for (const sub of d?.tipos ?? []) {
    if (!/^[a-z]+(-[a-z]+)*$/.test(sub.id)) p.push(`id: ${sub.id} va en minúsculas con guiones`);
    if (!sub.accion || sub.accion.length < 3) p.push(`campo: ${sub.id} lleva su «accion»`);
    if (!sub.pasos?.length) {
      p.push(`campo: ${sub.id} lleva pasos`);
      continue;
    }
    p.push(...problemasDeEsqueleto(sub, tipos, ctx));
    for (const paso of sub.pasos) {
      if (todosLosAgentes(paso).length === 0) p.push(`paso: ${sub.id} tiene un paso vacío`);
      for (const a of todosLosAgentes(paso)) if (!especiales.includes(a) && !(a in ctx.agentes)) p.push(`agente: ${sub.id} nombra «${a}», que no existe en .claude/agents ni es especial`);
      for (const o of paso.opcional ?? []) {
        if (!(o.bandera in bandera)) p.push(`bandera: ${sub.id}: la condición de «${o.agente}» (${o.si}) no tiene una bandera del vocabulario (${Object.keys(bandera).join(", ")})`);
        else if (bandera[o.bandera].si !== o.si) p.push(`bandera: ${sub.id}: el texto «${o.si}» no es el de la bandera ${o.bandera} («${bandera[o.bandera].si}»)`);
      }
    }
  }
  return p;
}

// ── El lector común con el presupuesto ───────────────────────────────────────────────────────

const subtipoDe = (id) => SUBTIPOS.find((s) => s.id === id) ?? null;

/** Los jueces de un subtipo: { siempre: [...], opcionales: [{ agente, bandera }] }. */
export function juecesDe(sub) {
  const siempre = [...new Set(sub.pasos.flatMap((p) => p.agentes ?? []).filter((a) => JUECES.includes(a)))];
  const opcionales = sub.pasos.flatMap((p) => p.opcional ?? []).filter((o) => JUECES.includes(o.agente)).map((o) => ({ agente: o.agente, bandera: o.bandera }));
  return { siempre, opcionales };
}

/**
 * Lo que dicen los dos catálogos de un encargo: el subtipo (con su tipo y esqueleto) de ops/tipos-de-encargo.json, y
 * el alcance y la complejidad de ops/presupuestos.json. null si algún valor no existe. No calcula nada del diff (E2).
 * → { subtipo, tipo, esqueleto, pasos, cierra_con, jueces: { siempre, opcionales }, jueces_min, pipeline,
 *     rondas_max, minutos_orientativos, alcance, complejidad }
 * `jueces_min` es el mayor entre el del alcance y el de la complejidad; los pasos son los del subtipo si el pipeline
 * es «completo», solo el esqueleto mínimo si es «minimo» y ninguno si es «ninguno».
 */
export function encargoDe({ subtipo, alcance, complejidad }, presupuestos = PRESUPUESTOS) {
  const s = subtipoDe(subtipo);
  const porAlcance = presupuestos.por_alcance?.[alcance];
  const porComplejidad = presupuestos.por_complejidad?.[complejidad];
  if (!s || !porAlcance || !porComplejidad) return null;
  const todos = juecesDe(s);
  return {
    subtipo: s.id,
    tipo: s.tipo,
    esqueleto: TIPOS[s.tipo].esqueleto,
    alcance,
    complejidad,
    pipeline: porComplejidad.pipeline,
    pasos: porComplejidad.pipeline === "completo" ? s.pasos : porComplejidad.pipeline === "minimo" ? pasosMinimos(s) : [],
    cierra_con: s.cierra_con ?? null,
    jueces: todos,
    jueces_min: Math.max(porAlcance.jueces_min, porComplejidad.jueces_min),
    rondas_max: porAlcance.rondas_max,
    minutos_orientativos: porAlcance.minutos_orientativos,
  };
}

/** Los pasos mínimos de un subtipo: el primer paso con constructor y el primero con juez detrás, sin opcionales. */
export function pasosMinimos(sub, ctx = { agentes: AGENTES }) {
  const rol = (paso) => (paso.agentes ?? []).map((a) => rolDe(a, ctx));
  const c = sub.pasos.findIndex((p) => rol(p).includes("constructor"));
  const j = sub.pasos.findIndex((p, n) => n >= Math.max(c, 0) && rol(p).includes("juez"));
  return [c, j].filter((n, k, a) => n >= 0 && a.indexOf(n) === k).map((n) => {
    const { opcional: _opcional, ...fijo } = sub.pasos[n];
    return fijo;
  });
}

export { ALCANCES, PIPELINES };

// ── La tabla de /orquestar, generada ────────────────────────────────────────────────────────

const TEXTO_ESPECIAL = { sesion: "sesión principal", constructor: "constructor del dominio", constructores: "constructores por dominio" };
const agenteMd = (a) => TEXTO_ESPECIAL[a] ?? `\`${a}\``;

/** Un paso como texto: agentes con `+`, el opcional entre corchetes y la nota entre paréntesis. */
function pasoMd(paso) {
  const fijos = (paso.agentes ?? []).map(agenteMd);
  const opcionales = (paso.opcional ?? []).map((o) => `[\`${o.agente}\` si ${o.si}]`);
  const texto = [...fijos, ...opcionales].join(" + ");
  return paso.nota ? `${texto} (${paso.nota})` : texto;
}

/** La fila de un subtipo: tipo, acción y pipeline. */
export function filaMd(sub) {
  const cierre = sub.cierra_con ? ` → *${sub.cierra_con}*` : "";
  const paralelo = sub.pasos.length === 1 && (sub.pasos[0].agentes ?? []).length > 1 ? ", en paralelo" : "";
  return `| ${sub.tipo} | ${sub.accion} | ${sub.pasos.map(pasoMd).join(" → ")}${paralelo}${cierre} |`;
}

/** La tabla entera (cabecera y una fila por subtipo), sin las marcas. */
export function tablaPipelines(d = DATOS) {
  return ["| Tipo | Acción | Pipeline |", "|---|---|---|", ...d.tipos.map(filaMd)].join("\n");
}

/** Pone la tabla generada entre las marcas de un `orquestar.md`; si no están, lo dice. */
export function regenerarOrquestar(md, d = DATOS) {
  const i = md.indexOf(MARCA_INICIO);
  const f = md.indexOf(MARCA_FIN);
  if (i < 0 || f < i) throw new Error(`orquestar.md no tiene las marcas ${MARCA_INICIO} y ${MARCA_FIN}`);
  return `${md.slice(0, i + MARCA_INICIO.length)}\n${tablaPipelines(d)}\n${md.slice(f)}`;
}

export { CONSTRUCTORES };
