/**
 * tiposDeEncargo.mjs — el lector único de los tipos de encargo (#640, fondo #639).
 *
 * `ops/tipos-de-encargo.json` es el dato: CINCO tipos (create, fix, improve, operate, audit), cada uno
 * con el esqueleto mínimo de pasos, y los 17 de siempre (más un `*-other` por tipo) como SUBTIPOS (`tipos` en el JSON, nombre histórico
 * que lee el panel de la factoría y no se renombra). Aquí viven la lectura, las reglas de forma
 * (`problemas`, con el nombre de la regla al principio de cada línea) y la tabla de `/orquestar`, que se
 * GENERA desde el JSON. Los agentes salen de `.claude/agents/` (agentes.mjs) y el presupuesto, de
 * `ops/presupuestos.json` (presupuestos.mjs): `encargoDe` los junta sin copiar nada.
 *
 * No calcula agentes desde el diff (eso es E2, #641): dado un subtipo, un alcance, una causa y una complejidad,
 * devuelve lo que dicen los dos catálogos.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENTES, CONSTRUCTORES, JUECES } from "./agentes.mjs";
import { CATALOGO as PRESUPUESTOS, COMPLEXITIES, PIPELINES, presupuestoDe } from "./presupuestos.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUTA_TIPOS = "ops/tipos-de-encargo.json";
export const RUTA_ORQUESTAR = ".claude/commands/orquestar.md";
export const MARCA_INICIO = "<!-- tipos:tabla:inicio -->";
export const MARCA_FIN = "<!-- tipos:tabla:fin -->";
export const MARCA_N1_TIPOS_INICIO = "<!-- n1:encargo:tipos:inicio -->";
export const MARCA_N1_TIPOS_FIN = "<!-- n1:encargo:tipos:fin -->";

export const leerTipos = (raiz = RAIZ) => JSON.parse(readFileSync(join(raiz, RUTA_TIPOS), "utf8"));
export const DATOS = leerTipos();

/** Los cinco tipos: { id: { what, skeleton } }. */
export const TYPES = DATOS.assignment_types;
/** Los subtipos (los 17 de siempre y uno `*-other` por tipo), en el orden del JSON, agrupados por tipo. */
export const SUBTYPES = DATOS.tipos;
/** Las banderas de una condición: { id: { si, what } }. */
export const FLAGS = DATOS.flags;
/** Los agentes que no son ficheros: sesion, constructor, constructores. */
export const ESPECIALES = Object.keys(DATOS.especiales);
export { COMPLEXITIES };

/** Definición de cada vocabulario, para anclarlo (vocabulariosVida.mjs). */
export const textosDeTipos = (d = DATOS) => Object.fromEntries(Object.entries(d.assignment_types).map(([k, t]) => [k, t.what]));
export const textosDeSubtipos = (d = DATOS) => Object.fromEntries(d.tipos.map((t) => [t.id, t.accion]));
export const textosDeBanderas = (d = DATOS) => Object.fromEntries(Object.entries(d.flags).map(([k, b]) => [k, b.what]));

const todosLosAgentes = (paso) => [...(paso.agentes ?? []), ...(paso.opcional ?? []).map((o) => o.agente)];
/** El tipo de un agente en su cabecera (`Tipo:` de .claude/agents/) y su rol en un paso. */
const ROL_DE_CABECERA = { constructor: "builder", juez: "judge" };
const CTX = { agentes: AGENTES, especiales: DATOS.special_roles };

/** El rol de un agente en un paso: builder, judge, planner (la sesión) o null. La sesión planifica; no construye por defecto. */
export function rolDe(agente, ctx = CTX) {
  if (Object.hasOwn(ctx.especiales ?? {}, agente)) return ctx.especiales[agente];
  return ROL_DE_CABECERA[ctx.agentes[agente]] ?? null;
}

/** Roles de los agentes fijos de un paso; el planner cuenta como builder si el subtipo dice que construye en la sesión. */
const rolesDelPaso = (paso, sub, ctx) => {
  const r = (paso.agentes ?? []).map((a) => rolDe(a, ctx));
  return sub.builds_in_session && r.includes("planner") ? [...r, "builder"] : r;
};

/**
 * ¿Un subtipo cumple el esqueleto de su tipo? Lista de problemas, cada uno con el nombre de su regla delante.
 * Reglas: tipo, roles (los pasos contienen, en orden, los roles del esqueleto), juez-siempre (algún juez entra
 * siempre, no solo como opcional), juez-despues, paralelo y solo-jueces (audit), cierre (operate), medida (improve).
 */
export function problemasDeEsqueleto(sub, tipos = TYPES, ctx = CTX) {
  const p = [];
  const tipo = tipos?.[sub.type];
  if (!tipo) return [`tipo: ${sub.id} cuelga de «${sub.type}», que no es un tipo (${Object.keys(tipos ?? {}).join(", ")})`];
  const esq = tipo.skeleton;
  const siempre = sub.pasos.map((paso) => rolesDelPaso(paso, sub, ctx));
  let i = 0;
  for (const roles of siempre) {
    if (i < esq.roles.length && roles.includes(esq.roles[i])) i++;
  }
  if (i < esq.roles.length) p.push(`roles: ${sub.id} (${sub.type}) tiene que llevar, en este orden, ${esq.roles.join(" → ")}; le falta «${esq.roles[i]}»`);
  if (!siempre.some((r) => r.includes("judge"))) p.push(`juez-siempre: ${sub.id} no tiene ningún juez que entre siempre (un juez solo opcional no vale): el juez mínimo es obligatorio`);
  const ultimo = siempre.at(-1) ?? [];
  if (sub.type !== "audit" && ultimo.includes("builder") && !ultimo.includes("judge")) p.push(`juez-despues: ${sub.id} termina en un constructor sin juez detrás`);
  if (esq.judges_only_in_parallel) {
    if (sub.pasos.length !== 1) p.push(`paralelo: ${sub.id} (${sub.type}) va en un solo paso con todos los jueces en paralelo y tiene ${sub.pasos.length}`);
    const permitidos = new Set([...JUECES, ...(sub.measured_with ?? [])]);
    for (const a of sub.pasos.flatMap(todosLosAgentes)) if (!permitidos.has(a)) p.push(`solo-jueces: ${sub.id} nombra «${a}», que no es juez; si solo mide, va en «measured_with»`);
    for (const a of sub.measured_with ?? []) if (!sub.pasos.flatMap(todosLosAgentes).includes(a)) p.push(`solo-jueces: ${sub.id} dice que mide con «${a}» y no aparece en sus pasos`);
  } else if (sub.measured_with) p.push(`solo-jueces: ${sub.id} (${sub.type}) lleva «measured_with», que es solo de audit`);
  if (esq.irreversible_needs_close) {
    if (typeof sub.irreversible !== "boolean") p.push(`cierre: ${sub.id} (${sub.type}) dice si es irreversible («irreversible»: verdadero o falso)`);
    else if (sub.irreversible && !sub.cierra_con) p.push(`cierre: ${sub.id} es irreversible y no cierra con el OK de una persona («cierra_con»)`);
  } else if ("irreversible" in sub) p.push(`cierre: ${sub.id} (${sub.type}) lleva «irreversible», que es solo de operate`);
  if (esq.measures_before_after) {
    if (typeof sub.measure !== "string" || sub.measure.length < 10) p.push(`medida: ${sub.id} (${sub.type}) dice qué se mide antes y después («measure»)`);
  } else if ("measure" in sub) p.push(`medida: ${sub.id} (${sub.type}) lleva «measure», que es solo de improve`);
  if (sub.builds_in_session && !sub.pasos.some((paso) => (paso.agentes ?? []).includes("sesion"))) p.push(`roles: ${sub.id} dice «builds_in_session» y no tiene un paso de la sesión`);
  return p;
}

/** Lo que está mal en el catálogo de tipos (lista vacía si está bien). Cada línea empieza por el nombre de su regla. */
export function problemas(d = DATOS, ctx = { agentes: AGENTES, especiales: d?.special_roles ?? {} }) {
  const p = [];
  const tipos = d?.assignment_types ?? {};
  const especiales = Object.keys(d?.especiales ?? {});
  const ids = (d?.tipos ?? []).map((t) => t.id);
  if (new Set(ids).size !== ids.length) p.push("id: hay subtipos con el mismo id");
  for (const e of especiales) if (!["planner", "builder"].includes(d.special_roles?.[e])) p.push(`especial: «${e}» lleva su rol en «special_roles» (planner o builder)`);
  for (const [k, t] of Object.entries(tipos)) {
    if (!/^[a-z]+$/.test(k)) p.push(`id: el tipo «${k}» es una palabra en minúsculas`);
    if (typeof t.what !== "string" || t.what.length < 10) p.push(`definicion: el tipo ${k} lleva su «what»`);
    const roles = t.skeleton?.roles;
    if (!Array.isArray(roles) || !roles.length || roles.some((r) => !["builder", "judge"].includes(r))) p.push(`esqueleto: el tipo ${k} lleva «roles» con builder y judge`);
    else if (!roles.includes("judge")) p.push(`juez: el tipo ${k} no tiene ningún juez en su esqueleto: ningún tipo se queda sin juez`);
    else if (k !== "audit" && !roles.includes("builder")) p.push(`esqueleto: el tipo ${k} no lleva constructor`);
    const otros = (d?.tipos ?? []).filter((s) => s.type === k && s.id === `${k}-other`);
    if (otros.length !== 1) p.push(`otro: el tipo ${k} tiene un subtipo «${k}-other» para lo que no encaja (N0 §3) y tiene ${otros.length}`);
  }
  // El orden del JSON: agrupado por tipo, en el orden de los tipos (así sale la tabla de /orquestar y lo ve el panel).
  const orden = (d?.tipos ?? []).map((s) => Object.keys(tipos).indexOf(s.type));
  if (orden.some((n, i) => i > 0 && n < orden[i - 1])) p.push(`orden: los subtipos van agrupados por tipo, en el orden ${Object.keys(tipos).join(", ")}`);
  const bandera = d?.flags ?? {};
  for (const [k, b] of Object.entries(bandera)) {
    if (!/^[a-z]+(_[a-z]+)*$/.test(k)) p.push(`bandera: «${k}» va en minúsculas y snake_case`);
    if (!b.si || !b.what) p.push(`bandera: ${k} lleva «si» (la condición corta) y «what»`);
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
        if (!(o.flag in bandera)) p.push(`bandera: ${sub.id}: la condición de «${o.agente}» (${o.si}) no tiene una bandera del vocabulario (${Object.keys(bandera).join(", ")})`);
        else if (bandera[o.flag].si !== o.si) p.push(`bandera: ${sub.id}: el texto «${o.si}» no es el de la bandera ${o.flag} («${bandera[o.flag].si}»)`);
      }
    }
  }
  return p;
}

// ── El lector común con el presupuesto ───────────────────────────────────────────────────────

const subtipoDe = (id) => SUBTYPES.find((s) => s.id === id) ?? null;

/** Los jueces de un subtipo: { always: [...], optional: [{ agente, flag }] }. */
export function juecesDe(sub) {
  const always = [...new Set(sub.pasos.flatMap((p) => p.agentes ?? []).filter((a) => JUECES.includes(a)))];
  const optional = sub.pasos.flatMap((p) => p.opcional ?? []).filter((o) => JUECES.includes(o.agente)).map((o) => ({ agente: o.agente, flag: o.flag }));
  return { always, optional };
}

/**
 * Los pasos mínimos de un subtipo: el primer paso que construye y el primero con juez a partir de él, enteros (con sus
 * condiciones opcionales y sus banderas: un esquema con RLS conserva a `seguridad`). La sesión que solo planifica no
 * cuenta como constructor. Sin constructor (audit), el primer paso con juez.
 */
export function pasosMinimos(sub, ctx = CTX) {
  const c = sub.pasos.findIndex((p) => rolesDelPaso(p, sub, ctx).includes("builder"));
  const j = sub.pasos.findIndex((p, n) => n >= Math.max(c, 0) && rolesDelPaso(p, sub, ctx).includes("judge"));
  return [c, j].filter((n, k, a) => n >= 0 && a.indexOf(n) === k).map((n) => JSON.parse(JSON.stringify(sub.pasos[n])));
}

/**
 * Lo que dicen los dos catálogos de un encargo: el subtipo (con su tipo y esqueleto) de ops/tipos-de-encargo.json, y el
 * presupuesto de ops/presupuestos.json para su alcance y causa (`presupuestoDe`, con `por_causa` y los jueces que exige la
 * causa) y su complejidad. null si algún valor no existe. No calcula nada del diff (E2, #641).
 * → { subtype, type, skeleton, scope, cause, complexity, pipeline, steps, close_with, judges: { always, optional },
 *     judges_min, judges_required, missing_judges, warnings, fund_rondas_max, fund_minutes }
 * `judges_min` es el mayor entre el del alcance y la causa y el de la complejidad. Los pasos son los del subtipo si el
 * pipeline es `complete` y los mínimos si es `minimal`. `warnings` dice si el subtipo no lleva los jueces que se piden.
 * Las rondas y los minutos son del FONDO (de su alcance y causa), no del encargo: salen como `fund_*`.
 */
export function encargoDe({ subtype, scope, cause, complexity }, presupuestos = PRESUPUESTOS) {
  const s = subtipoDe(subtype);
  const porComplejidad = presupuestos.by_complexity?.[complexity];
  const fondo = presupuestoDe(scope, cause, presupuestos);
  if (!s || !porComplejidad || !fondo) return null;
  const judges = juecesDe(s);
  const judgesMin = Math.max(fondo.jueces_min, porComplejidad.jueces_min);
  const enPipeline = porComplejidad.pipeline === "complete" ? s.pasos : pasosMinimos(s);
  const nombrados = new Set(enPipeline.flatMap(todosLosAgentes).filter((a) => JUECES.includes(a)));
  const missing = fondo.jueces_obligatorios.filter((j) => !nombrados.has(j));
  const warnings = [];
  if (nombrados.size < judgesMin) warnings.push(`el subtipo ${s.id} lleva ${nombrados.size} juez(ces) distintos y el presupuesto pide ${judgesMin}: añade ${judgesMin - nombrados.size} más del catálogo de /orquestar`);
  if (missing.length) warnings.push(`la causa ${cause} exige ${missing.join(", ")} y el subtipo ${s.id} no lo lleva`);
  return {
    subtype: s.id,
    type: s.type,
    skeleton: TYPES[s.type].skeleton,
    scope,
    cause,
    complexity,
    pipeline: porComplejidad.pipeline,
    steps: enPipeline,
    close_with: s.cierra_con ?? null,
    judges,
    judges_min: judgesMin,
    judges_required: fondo.jueces_obligatorios,
    missing_judges: missing,
    warnings,
    fund_rondas_max: fondo.rondas_max,
    fund_minutes: fondo.minutos_orientativos,
  };
}

export { PIPELINES };

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
  const paralelo = sub.type === "audit" && sub.pasos.length === 1 && (sub.pasos[0].agentes ?? []).length > 1 ? ", en paralelo" : "";
  return `| ${sub.type} | ${sub.accion} | ${sub.pasos.map(pasoMd).join(" → ")}${paralelo}${cierre} |`;
}

/** La tabla entera (cabecera y una fila por subtipo), sin las marcas. */
export function tablaPipelines(d = DATOS) {
  return ["| Tipo | Acción | Pipeline |", "|---|---|---|", ...d.tipos.map(filaMd)].join("\n");
}

const entre = (md, ini, fin, texto) => {
  const i = md.indexOf(ini);
  const f = md.indexOf(fin);
  if (i < 0 || f < i) throw new Error(`falta alguna de las marcas ${ini} y ${fin}`);
  return `${md.slice(0, i + ini.length)}\n${texto}\n${md.slice(f)}`;
};

/** Pone la tabla generada entre las marcas de un `orquestar.md`; si no están, lo dice. */
export const regenerarOrquestar = (md, d = DATOS) => entre(md, MARCA_INICIO, MARCA_FIN, tablaPipelines(d));

/** Los tipos y las banderas, como prosa del N1 (docs/entidades/N1-encargo.md, §4), generada del JSON. */
export function textoN1Tipos(d = DATOS) {
  const roles = (t) => t.skeleton.roles.join(" → ") + (t.skeleton.measures_before_after ? "; mide antes y después" : "") + (t.skeleton.irreversible_needs_close ? "; si es irreversible, cierra con el OK de una persona" : "") + (t.skeleton.judges_only_in_parallel ? "; solo jueces, en paralelo" : "");
  return [
    "| Tipo | Qué es | Esqueleto de pasos | Subtipos |",
    "|---|---|---|---|",
    ...Object.entries(d.assignment_types).map(([k, t]) => `| \`${k}\` | ${t.what} | ${roles(t)} | ${d.tipos.filter((s) => s.type === k).map((s) => `\`${s.id}\``).join(", ")} |`),
    "",
    "Banderas de una condición (`flags`):",
    "",
    ...Object.entries(d.flags).map(([k, b]) => `- \`${k}\`: ${b.what}.`),
  ].join("\n");
}

export const conTiposN1 = (md, d = DATOS) => entre(md, MARCA_N1_TIPOS_INICIO, MARCA_N1_TIPOS_FIN, textoN1Tipos(d));

export { CONSTRUCTORES };
