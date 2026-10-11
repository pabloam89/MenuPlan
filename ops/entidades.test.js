import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerGlosario, plano, prohibidosDe } from "../scripts/lib/glosario.mjs";
import { REFERENCIA } from "../scripts/lib/forjaReferencia.mjs";
import { AXES, ID_FORMATS, REGISTRIES, RELATIONS, STATUSES, STORED_AS, SUBJECT_KINDS } from "../scripts/lib/entidades.mjs";
import { valoresActuales } from "../scripts/lib/vocabulariosVida.mjs";

/**
 * El registro de entidades (paso 1 de la normalización del lenguaje y los datos, #566).
 * Vigila ops/entidades.json, ops/entidades-sujetos.json y docs/entidades/MAPA.md:
 *
 *  1. vocabularios cerrados: eje, registro, formato de id, relación, cómo se guarda y estado;
 *  2. ids únicos y con forma válida (kebab, minúsculas, ASCII, en inglés);
 *  3. la definición NO está en el JSON: vive en el glosario (`term`), que guarda también la
 *     traducción (`en` de la ficha = id de la entidad). Los sinónimos prohibidos salen del glosario;
 *  4. relaciones que apuntan a entidades que existen, sin repetirse, y todas las entidades en alguna;
 *  5. fuentes que existen (contra `git ls-files`: Windows no distingue mayúsculas) y coherentes con el registro;
 *  6. ciclo de vida: una entidad no desaparece, se retira con `replaced_by` (contra origin/staging);
 *  7. los sujetos de ops/normas.json y de ops/estandares-agentes.json son una entidad, un tipo suyo o quedan fuera con motivo;
 *  8. MAPA.md y el JSON dicen lo mismo, en los dos sentidos (filas, flechas, recuentos y diagrama de puentes).
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const DATOS = JSON.parse(leer("ops/entidades.json"));
const SUJETOS = JSON.parse(leer("ops/entidades-sujetos.json"));
const MAPA = leer("docs/entidades/MAPA.md");
const copia = (x = DATOS) => JSON.parse(JSON.stringify(x));

// Las rutas del repo, tal como las conoce git (distingue mayúsculas aunque Windows no).
let TRACKED = null;
try {
  TRACKED = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean));
} catch {
  // a propósito: sin git no hay lista; se cae a existsSync (que en Windows no distingue mayúsculas)
  TRACKED = null;
}
const existe = (r) => (TRACKED ? TRACKED.has(r) || [...TRACKED].some((f) => f.startsWith(`${r}/`)) : existsSync(join(RAIZ, r)));

// Los vocabularios cerrados del registro viven en scripts/lib/entidades.mjs y están anclados en ops/vocabularios-vida.json.
const CENTINELAS = ["ninguno", "sin auditar", "none", "n/a"];
const AUTORREFERENCIAS = ["depends_on"];
// Lo que pidió Pablo el 11 oct 2026 y los puentes que se destacan.
export const PEDIDAS = ["session", "service", "environment", "deployment", "event", "norm", "learning", "mechanism", "metric", "eval", "judge", "team-member"];
export const PUENTES = ["event", "metric", "module", "eval", "judge", "data-source", "environment", "deployment", "migration", "table"];
// Pasará a scripts/lib/entidades.mjs, anclado en vocabularios-vida.json, cuando el N1 de Aprendizaje lo escriba en algún sitio.
export const RECORDED_IN_OF_LEARNING = ["test", "guard", "rule", "skill"];
// Los ids del nacimiento del registro (11 oct 2026). Plan B del ciclo de vida: no se edita; un id no se borra, se retira.
export const IDS_FIJADOS = [
  "session", "team-member", "identity", "service", "environment", "deployment", "event", "norm", "learning", "mechanism", "metric", "eval", "judge",
  "secret", "vault", "agent", "skill", "rule", "hook", "issue", "root-problem", "case", "assignment", "decision", "pull-request", "branch",
  "migration", "table", "data-source", "module", "vocabulary", "household", "person", "channel-identity", "recipe", "ingredient", "menu", "pantry",
  "shopping-list", "lola-conversation",
];
const REQUERIDOS = ["id", "name", "axis", "term", "source_of_truth", "id_format", "registry", "status"];
const OPCIONALES = ["role_in_axis", "note", "fields", "replaced_by"];
const FORMA_ID = /^[a-z]+(-[a-z]+)*$/;
const FORMA_CAMPO = /^[a-z]+(_[a-z]+)*$/;
const MAX_ROLE = 30;
const aId = (s) => plano(s).replace(/\s+/g, "-");
const G = leerGlosario(RAIZ);
const termino = (g, t) => g.terminos.find((x) => x.termino === t && x.estado !== "retirado");

/** Los sinónimos prohibidos de una entidad: salen del glosario, no se copian a mano. */
export function sinonimosDe(glosario, entidad) {
  const t = entidad.term ? termino(glosario, entidad.term) : null;
  return t ? prohibidosDe(t) : [];
}

export function problemas(datos, { existe: hay, glosario = null } = {}) {
  const p = [];
  const ents = datos.entities ?? [];
  const ids = ents.map((e) => e.id);
  const idsSet = new Set(ids);
  const vistos = new Set();
  for (const id of ids) {
    if (vistos.has(id)) p.push(`${id}: id repetido`);
    vistos.add(id);
  }
  const terminosUsados = new Map();
  for (const e of ents) {
    const q = `${e.id}`;
    if ("definition" in e || "definicion" in e) p.push(`${q}: la definición no va aquí: vive en el glosario (term)`);
    const extra = Object.keys(e).filter((c) => !REQUERIDOS.includes(c) && !OPCIONALES.includes(c) && c !== "definition" && c !== "definicion");
    if (extra.length) p.push(`${q}: campo desconocido ${extra.join(", ")}`);
    for (const c of REQUERIDOS) if (!(c in e)) p.push(`${q}: falta el campo ${c}`);
    if (typeof e.id !== "string" || !FORMA_ID.test(e.id)) p.push(`${q}: id sin la forma kebab en inglés (minúsculas ASCII y guiones)`);
    if (typeof e.name !== "string" || !e.name.trim()) p.push(`${q}: name vacío`);
    if (!(e.axis in AXES)) p.push(`${q}: axis «${e.axis}» fuera del vocabulario`);
    if (!(e.registry in REGISTRIES)) p.push(`${q}: registry «${e.registry}» fuera del vocabulario`);
    if (!(e.id_format in ID_FORMATS)) p.push(`${q}: id_format «${e.id_format}» fuera del vocabulario`);
    if (!(e.status in STATUSES)) p.push(`${q}: status «${e.status}» fuera del vocabulario`);
    if (e.status === "retired") {
      if (!e.replaced_by || !ents.some((x) => x.id === e.replaced_by && x.status === "active")) p.push(`${q}: retired sin replaced_by que sea una entidad activa`);
    } else if ("replaced_by" in e) p.push(`${q}: replaced_by solo va en una entidad retired`);
    if ("role_in_axis" in e) {
      if (e.axis !== "bridge") p.push(`${q}: role_in_axis solo va en un puente`);
      if (typeof e.role_in_axis !== "string" || !e.role_in_axis.trim() || e.role_in_axis.split(/\s+/).length > MAX_ROLE) p.push(`${q}: role_in_axis vacío o de más de ${MAX_ROLE} palabras`);
    } else if (e.axis === "bridge") p.push(`${q}: un puente dice su role_in_axis`);
    // La definición y la traducción viven en el glosario.
    if (e.term !== null && e.term !== undefined) {
      if (glosario) {
        const t = termino(glosario, e.term);
        if (!t) p.push(`${q}: term «${e.term}» no es un término activo del glosario`);
        else if (t.en !== e.id) p.push(`${q}: el glosario traduce «${e.term}» como «${t.en ?? "(sin en)"}», no como «${e.id}»`);
        if (terminosUsados.has(e.term)) p.push(`${q}: term «${e.term}» ya es el de ${terminosUsados.get(e.term)}`);
        terminosUsados.set(e.term, e.id);
        for (const s of sinonimosDe(glosario, e)) {
          if (idsSet.has(aId(s))) p.push(`${q}: el sinónimo prohibido «${s}» (del glosario) es el id de otra entidad`);
        }
      }
    } else if (e.axis !== "vertical") p.push(`${q}: solo una entidad vertical puede quedar sin term (su glosario es de proceso)`);
    const f = e.source_of_truth;
    if (typeof f !== "string" || !f.trim()) p.push(`${q}: source_of_truth vacía (di «none»)`);
    else if (f !== "none" && hay && !hay(f)) p.push(`${q}: la fuente «${f}» no existe en git`);
    if (e.registry === "with_registry" && f === "none") p.push(`${q}: with_registry pero sin fuente de verdad`);
    if (f === "none" && e.registry !== "without_registry") p.push(`${q}: sin fuente de verdad solo puede ser without_registry`);
    if ("fields" in e) {
      if (!Array.isArray(e.fields) || e.fields.length === 0) p.push(`${q}: fields vacío`);
      for (const c of e.fields ?? []) {
        if (!FORMA_CAMPO.test(c.name ?? "")) p.push(`${q}: campo declarado «${c.name}» sin la forma snake en inglés`);
        if (!Array.isArray(c.values) || c.values.length < 2 || new Set(c.values).size !== c.values.length || !c.values.every((v) => FORMA_CAMPO.test(v))) p.push(`${q}: el campo ${c.name} necesita un vocabulario cerrado de dos valores o más, sin repetir`);
        if (c.required_when) {
          if (!(c.values ?? []).includes(c.required_when.value)) p.push(`${q}: required_when nombra un valor que ${c.name} no tiene`);
          if (!FORMA_CAMPO.test(c.required_when.field ?? "")) p.push(`${q}: required_when sin campo válido`);
        }
      }
    }
  }
  if (glosario) {
    const canon = new Map();
    for (const t of glosario.terminos) for (const s of prohibidosDe(t)) canon.set(plano(s), t.termino);
    for (const e of ents) if (canon.has(plano(e.name ?? ""))) p.push(`${e.id}: el nombre «${e.name}» es un sinónimo que el glosario prohíbe (di «${canon.get(plano(e.name))}»)`);
  }
  const usadas = new Set();
  const dichas = new Set();
  for (const r of datos.relations ?? []) {
    const q = `relación ${r.from} ${r.relation} ${r.to}`;
    const extra = Object.keys(r).filter((c) => !["from", "relation", "to", "stored_as", "stored_in"].includes(c));
    if (extra.length) p.push(`${q}: campo desconocido ${extra.join(", ")}`);
    if (!idsSet.has(r.from)) p.push(`${q}: «${r.from}» no es una entidad`);
    if (!idsSet.has(r.to)) p.push(`${q}: «${r.to}» no es una entidad`);
    if (r.from === r.to && !AUTORREFERENCIAS.includes(r.relation)) p.push(`${q}: apunta a sí misma`);
    if (!(r.relation in RELATIONS)) p.push(`${q}: relación fuera del vocabulario`);
    if (!(r.stored_as in STORED_AS)) p.push(`${q}: stored_as «${r.stored_as}» fuera del vocabulario`);
    if (r.stored_as === "field" || r.stored_as === "file") {
      if (typeof r.stored_in !== "string" || !r.stored_in.trim()) p.push(`${q}: falta stored_in (obligatorio con ${r.stored_as})`);
    } else if ("stored_in" in r && (typeof r.stored_in !== "string" || !r.stored_in.trim())) p.push(`${q}: stored_in vacío (quítalo: es opcional con ${r.stored_as})`);
    if (CENTINELAS.includes(String(r.stored_in ?? "").trim().toLowerCase())) p.push(`${q}: stored_in «${r.stored_in}» es un centinela; con ${r.stored_as} se omite`);
    if (r.stored_as === "unaudited") {
      const vertical = (id) => ents.find((x) => x.id === id)?.axis === "vertical";
      if (!vertical(r.from) && !vertical(r.to)) p.push(`${q}: unaudited solo vale con una entidad vertical`);
    }
    const k = `${r.from}|${r.relation}|${r.to}`;
    if (dichas.has(k)) p.push(`${q}: repetida`);
    dichas.add(k);
    usadas.add(r.from);
    usadas.add(r.to);
  }
  for (const id of ids) if (!usadas.has(id)) p.push(`${id}: ninguna relación la nombra`);
  return p;
}

/** El ciclo de vida: ninguna entidad desaparece ni vuelve de retired. `ref` es una lista de {id, status}. */
export function problemasDeVida(actual, ref) {
  const p = [];
  const hoy = new Map((actual.entities ?? []).map((e) => [e.id, e]));
  for (const r of ref) {
    const e = hoy.get(r.id);
    if (!e) p.push(`${r.id}: estaba en el registro y ha desaparecido (retírala: status retired y replaced_by)`);
    else if (r.status === "retired" && e.status === "active") p.push(`${r.id}: estaba retired y vuelve a active (un id retirado no se reutiliza)`);
  }
  return p;
}

/** Los sujetos de normas y estándares: una entidad, un tipo suyo (N2) o fuera con motivo. */
export function problemasDeSujetos(doc, entidades, sujetosUsados) {
  const p = [];
  const ids = new Set(entidades.map((e) => e.id));
  const s = doc.sujetos ?? {};
  for (const k of sujetosUsados) if (!(k in s)) p.push(`${k}: sujeto sin clasificar en ops/entidades-sujetos.json`);
  for (const [k, v] of Object.entries(s)) {
    if (!sujetosUsados.includes(k)) p.push(`${k}: ya no es sujeto de ninguna norma ni estándar; quítalo`);
    if (!(v.kind in SUBJECT_KINDS)) { p.push(`${k}: kind «${v.kind}» fuera del vocabulario`); continue; }
    if (v.kind !== "outside" && !ids.has(v.entity)) p.push(`${k}: «${v.entity}» no es una entidad`);
    if (v.kind === "entity" && v.reason) p.push(`${k}: una entidad no lleva reason`);
    if (v.kind !== "entity" && (typeof v.reason !== "string" || v.reason.trim().length < 15)) p.push(`${k}: ${v.kind} sin motivo escrito (15 caracteres o más)`);
    if (v.kind === "outside" && v.entity) p.push(`${k}: outside no nombra entidad`);
  }
  return p;
}

const n = (id) => id.replaceAll("-", "_");
const bloquesMermaid = (mapa) => [...mapa.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
const flechasDe = (bloque) => [...bloque.matchAll(/^\s+(\w+) -->\|(\w+)\| (\w+)$/gm)].map((m) => ({ from: m[1], relation: m[2], to: m[3] }));

/** MAPA.md y el JSON dicen lo mismo, en los dos sentidos. */
export function problemasDeMapa(datos, mapa) {
  const p = [];
  const filas = mapa.split("\n").filter((l) => l.startsWith("| `"));
  const porId = new Map(datos.entities.map((e) => [e.id, e]));
  for (const e of datos.entities) {
    const fila = filas.find((l) => l.startsWith(`| \`${e.id}\` |`));
    if (!fila) { p.push(`${e.id}: no está en las tablas de MAPA.md`); continue; }
    const celdas = fila.split("|").map((c) => c.trim());
    if (celdas[3] !== e.axis) p.push(`${e.id}: MAPA.md dice eje «${celdas[3]}» y el JSON «${e.axis}»`);
    if (celdas[6] !== e.registry) p.push(`${e.id}: MAPA.md dice registro «${celdas[6]}» y el JSON «${e.registry}»`);
  }
  for (const f of filas) {
    const id = f.match(/^\| `([^`]+)` \|/)?.[1];
    if (id && !porId.has(id)) p.push(`${id}: MAPA.md lista una entidad que no está en el JSON`);
  }
  const bloques = bloquesMermaid(mapa);
  if (bloques.length !== 3) p.push(`MAPA.md debe tener 3 diagramas mermaid (horizontal, vertical y puentes) y tiene ${bloques.length}`);
  const deJson = new Set(datos.relations.map((r) => `${n(r.from)}|${r.relation}|${n(r.to)}`));
  const enMapa = bloques.flatMap(flechasDe);
  for (const r of datos.relations) if (!enMapa.some((f) => f.from === n(r.from) && f.relation === r.relation && f.to === n(r.to))) p.push(`${r.from} ${r.relation} ${r.to}: falta en los diagramas de MAPA.md`);
  for (const f of enMapa) if (!deJson.has(`${f.from}|${f.relation}|${f.to}`)) p.push(`${f.from} ${f.relation} ${f.to}: flecha de MAPA.md que no está en el JSON`);
  // Los recuentos de la cabecera.
  const cab = mapa.match(/Hoy hay (\d+) entidades: (\d+) horizontales, (\d+) verticales y (\d+) puentes/);
  const cuenta = (a) => datos.entities.filter((e) => e.axis === a).length;
  if (!cab) p.push("MAPA.md no tiene la línea «Hoy hay N entidades: …»");
  else {
    const esperado = [datos.entities.length, cuenta("horizontal"), cuenta("vertical"), cuenta("bridge")];
    if (cab.slice(1).map(Number).join() !== esperado.join()) p.push(`la cabecera de MAPA.md dice ${cab.slice(1).join(", ")} y el JSON ${esperado.join(", ")}`);
  }
  // El diagrama de puentes lleva toda relación que toca un puente o cruza de eje, y la clase `puente` es la de los ids bridge.
  const ultimo = bloques[bloques.length - 1] ?? "";
  const dePuentes = flechasDe(ultimo);
  for (const r of datos.relations) {
    const a = porId.get(r.from)?.axis;
    const b = porId.get(r.to)?.axis;
    if ((a === "bridge" || b === "bridge" || a !== b) && !dePuentes.some((f) => f.from === n(r.from) && f.relation === r.relation && f.to === n(r.to))) p.push(`${r.from} ${r.relation} ${r.to}: toca un puente o cruza de eje y falta en el diagrama de puentes`);
  }
  const nodos = new Set(dePuentes.flatMap((f) => [f.from, f.to]));
  const clase = (ultimo.match(/^\s+class (\S+) puente$/m)?.[1] ?? "").split(",").filter(Boolean).sort();
  const puentes = datos.entities.filter((e) => e.axis === "bridge" && nodos.has(n(e.id))).map((e) => n(e.id)).sort();
  if (clase.join() !== puentes.join()) p.push(`la clase puente del diagrama (${clase.join(", ")}) no es la de los ids bridge que salen (${puentes.join(", ")})`);
  return p;
}

// La referencia para el ciclo de vida: el registro en origin/staging, o los ids fijados si todavía no está.
function refDeStaging() {
  try {
    const t = execFileSync("git", ["show", `${REFERENCIA()}:ops/entidades.json`], { cwd: RAIZ, encoding: "utf8", windowsHide: true, stdio: "pipe" });
    const j = JSON.parse(t);
    return Array.isArray(j.entities) ? j.entities.map((e) => ({ id: e.id, status: e.status ?? "active" })) : null;
  } catch {
    // a propósito: sin git, sin la referencia o sin el fichero allí todavía, se compara con IDS_FIJADOS
    return null;
  }
}
const REF = refDeStaging();
const sujetosUsados = () => {
  const normas = JSON.parse(leer("ops/normas.json")).sujetos;
  const estandares = JSON.parse(leer("ops/estandares-agentes.json")).sujetos;
  return [...new Set([...Object.keys(normas), ...Object.keys(estandares)])].sort();
};

describe("el registro de entidades", () => {
  it("no tiene ningún problema", () => {
    expect(problemas(DATOS, { existe, glosario: G }), "Corrige ops/entidades.json").toEqual([]);
  });

  it("tiene las entidades que pidió Pablo y las que pidió el auditor de datos", () => {
    const ids = DATOS.entities.map((e) => e.id);
    for (const id of [...PEDIDAS, "identity", "secret", "vault", "agent", "skill", "rule", "hook", "issue", "root-problem", "case", "assignment", "decision", "pull-request", "branch", "migration", "data-source", "module", "table", "vocabulary"]) expect(ids, id).toContain(id);
    for (const id of ["household", "person", "recipe", "ingredient", "menu", "pantry", "shopping-list", "lola-conversation"]) expect(DATOS.entities.find((e) => e.id === id)?.axis, id).toBe("vertical");
  });

  it("los puentes acordados son puente", () => {
    for (const id of PUENTES) expect(DATOS.entities.find((e) => e.id === id)?.axis, id).toBe("bridge");
    expect(DATOS.entities.filter((e) => e.axis === "bridge").map((e) => e.id).sort()).toEqual([...PUENTES].sort());
  });

  it("los tres ejes tienen entidades", () => {
    for (const axis of Object.keys(AXES)) expect(DATOS.entities.filter((e) => e.axis === axis).length, axis).toBeGreaterThan(0);
  });

  it("la tabla es un puente que crea una migración y custodia un módulo; la fuente de datos no se cuelga de ellos", () => {
    const r = (f, rel, t) => DATOS.relations.some((x) => x.from === f && x.relation === rel && x.to === t);
    expect(r("migration", "creates", "table")).toBe(true);
    expect(r("table", "belongs_to", "module")).toBe(true);
    expect(r("module", "uses", "data-source")).toBe(false);
    expect(r("migration", "creates", "data-source")).toBe(false);
  });

  it("el evento dispara la revisión de una skill y produce un aprendizaje (propuesta de Pablo, #566)", () => {
    const r = (f, rel, t) => DATOS.relations.some((x) => x.from === f && x.relation === rel && x.to === t);
    expect(r("event", "triggers", "skill")).toBe(true);
    expect(r("event", "produces", "learning")).toBe(true);
  });

  it("el aprendizaje declara su campo recorded_in: test, guard, rule o skill, y con skill dice por qué no se automatizó", () => {
    const campo = DATOS.entities.find((e) => e.id === "learning").fields.find((c) => c.name === "recorded_in");
    expect(campo.values).toEqual(RECORDED_IN_OF_LEARNING);
    expect(campo.required_when).toEqual({ value: "skill", field: "reason_not_automated" });
    expect(DATOS.entities.find((e) => e.id === "learning").registry).toBe("without_registry");
  });

  it("el término del aprendizaje es «aprendizaje» y «lección» sale del glosario como sinónimo prohibido", () => {
    const l = DATOS.entities.find((e) => e.id === "learning");
    expect(l.term).toBe("aprendizaje");
    expect(sinonimosDe(G, l)).toContain("lección");
  });

  it("la norma no se cumple por id de mecanismo (EJECUTORES no es mecanismos.json), y el evento nombra skill y agente", () => {
    const x = (f, rel, t) => DATOS.relations.find((y) => y.from === f && y.relation === rel && y.to === t);
    expect(x("norm", "enforced_by", "mechanism").stored_as).toBe("none");
    expect(x("event", "refers_to", "skill").stored_in).toMatch(/skill_cargada/);
    expect(x("event", "refers_to", "agent").stored_in).toMatch(/agente_lanzado/);
    expect(x("event", "uses", "vocabulary").stored_as).toBe("file");
  });

  it("el glosario relaciona persona (equipo) con persona de la casa en los dos sentidos", () => {
    const t = (n) => G.terminos.find((y) => y.termino === n);
    expect(t("persona").relacionado).toContain("persona de la casa");
    expect(t("persona de la casa").relacionado).toContain("persona");
    expect(t("persona").nota).toMatch(/persona de la casa/);
  });

  it("la identidad es horizontal y la cuenta de canal de la casa es otra entidad, vertical", () => {
    expect(DATOS.entities.find((e) => e.id === "identity").axis).toBe("horizontal");
    expect(DATOS.entities.find((e) => e.id === "channel-identity").axis).toBe("vertical");
    expect(DATOS.entities.find((e) => e.id === "person").axis).toBe("vertical");
  });

  it("las fuentes citadas existen en git, con las mayúsculas exactas", () => {
    for (const e of DATOS.entities) if (e.source_of_truth !== "none") expect(existe(e.source_of_truth), e.source_of_truth).toBe(true);
    expect(existe("claude.md")).toBe(false);
  });

  it("MAPA.md y el JSON dicen lo mismo, en los dos sentidos", () => {
    expect(problemasDeMapa(DATOS, MAPA), "Regenera las tablas y los diagramas de docs/entidades/MAPA.md").toEqual([]);
  });
});

describe("ciclo de vida: una entidad se retira, no se borra", () => {
  it(`ninguna de ${REF ? REFERENCIA() : "los ids fijados"} desaparece ni vuelve de retired`, () => {
    expect(problemasDeVida(DATOS, REF ?? IDS_FIJADOS.map((id) => ({ id, status: "active" }))), "Un id no se borra: status retired y replaced_by").toEqual([]);
  });
  it("los ids fijados también se respetan aunque haya referencia", () => {
    expect(problemasDeVida(DATOS, IDS_FIJADOS.map((id) => ({ id, status: "active" })))).toEqual([]);
  });
});

describe("los sujetos de normas y estándares", () => {
  it("cada sujeto es una entidad, un tipo suyo o queda fuera con motivo", () => {
    expect(problemasDeSujetos(SUJETOS, DATOS.entities, sujetosUsados()), "Clasifica el sujeto en ops/entidades-sujetos.json").toEqual([]);
  });
});

describe("el glosario traduce a inglés", () => {
  it("cada término con en es único y cada entidad con term coincide con su en", () => {
    const ens = G.terminos.filter((t) => t.en).map((t) => t.en);
    expect(new Set(ens).size).toBe(ens.length);
    for (const e of DATOS.entities.filter((x) => x.term)) expect(termino(G, e.term)?.en, e.id).toBe(e.id);
  });
});

describe("autotest: cada regla falla con datos malos", () => {
  const con = (cambio) => { const d = copia(); cambio(d, d.entities[0]); return problemas(d, { existe, glosario: G }).join("\n"); };

  it("vocabularios cerrados", () => {
    expect(Object.keys(AXES)).toEqual(["horizontal", "vertical", "bridge"]);
    expect(Object.keys(REGISTRIES)).toEqual(["with_registry", "partial", "without_registry"]);
    expect(con((d, e) => { e.axis = "lateral"; })).toMatch(/axis «lateral» fuera del vocabulario/);
    expect(con((d, e) => { e.registry = "casi"; })).toMatch(/registry «casi» fuera del vocabulario/);
    expect(con((d, e) => { e.id_format = "raro"; })).toMatch(/id_format «raro» fuera del vocabulario/);
    expect(con((d, e) => { e.status = "viejo"; })).toMatch(/status «viejo» fuera del vocabulario/);
    expect(con((d) => { d.relations[0].relation = "adora"; })).toMatch(/relación fuera del vocabulario/);
    expect(con((d) => { d.relations[0].stored_as = "mágico"; })).toMatch(/stored_as «mágico» fuera del vocabulario/);
  });

  it("ids repetidos, con mala forma o en castellano con tildes", () => {
    expect(con((d) => { d.entities[1].id = d.entities[0].id; })).toMatch(/id repetido/);
    expect(con((d, e) => { e.id = "Sesión"; })).toMatch(/sin la forma kebab en inglés/);
    expect(con((d, e) => { e.id = "session_x"; })).toMatch(/sin la forma kebab/);
  });

  it("la definición no puede volver al JSON", () => {
    expect(con((d, e) => { e.definition = "Una conversación."; })).toMatch(/la definición no va aquí/);
    expect(con((d, e) => { e.definicion = "Una conversación."; })).toMatch(/la definición no va aquí/);
  });

  it("term: inexistente, sin traducción que coincida, repetido, o ausente fuera de lo vertical", () => {
    expect(con((d, e) => { e.term = "inventado"; })).toMatch(/no es un término activo del glosario/);
    expect(con((d, e) => { e.id = "sesion-x"; })).toMatch(/el glosario traduce «sesión» como «session», no como «sesion-x»/);
    expect(con((d) => { d.entities[1].term = d.entities[0].term; })).toMatch(/ya es el de session/);
    expect(con((d, e) => { e.term = null; })).toMatch(/solo una entidad vertical puede quedar sin term/);
  });

  it("role_in_axis solo en puentes y obligatorio en ellos", () => {
    expect(con((d, e) => { e.role_in_axis = "Algo."; })).toMatch(/role_in_axis solo va en un puente/);
    expect(con((d) => { delete d.entities.find((x) => x.axis === "bridge").role_in_axis; })).toMatch(/un puente dice su role_in_axis/);
    expect(con((d) => { d.entities.find((x) => x.axis === "bridge").role_in_axis = "palabra ".repeat(31); })).toMatch(/role_in_axis vacío o de más de 30 palabras/);
  });

  it("relaciones a una entidad que no existe, a sí mismas o repetidas", () => {
    expect(con((d) => { d.relations[0].to = "inventada"; })).toMatch(/«inventada» no es una entidad/);
    expect(con((d) => { d.relations[0].to = d.relations[0].from; })).toMatch(/apunta a sí misma/);
    expect(con((d) => { d.relations.push({ ...d.relations[0] }); })).toMatch(/repetida/);
    expect(con((d) => { d.relations[0].stored_in = ""; })).toMatch(/falta stored_in/);
    expect(con((d) => { delete d.relations[0].stored_in; })).toMatch(/falta stored_in \(obligatorio con field\)/);
    expect(con((d) => { const x = d.relations.find((y) => y.stored_as === "none"); x.stored_in = "ninguno"; })).toMatch(/centinela/);
    expect(con((d) => { const x = d.relations.find((y) => y.stored_as === "unaudited"); x.stored_in = "sin auditar"; })).toMatch(/centinela/);
    expect(con((d) => { const x = d.relations.find((y) => y.stored_as === "none"); x.stored_in = ""; })).toMatch(/stored_in vacío/);
    expect(con((d) => { d.relations[0].stored_as = "unaudited"; })).toMatch(/unaudited solo vale con una entidad vertical/);
  });

  it("una entidad sin ninguna relación", () => {
    expect(con((d) => { d.entities.push({ id: "loose", name: "Suelta", axis: "vertical", term: null, source_of_truth: "none", id_format: "none", registry: "without_registry", status: "active" }); })).toMatch(/loose: ninguna relación la nombra/);
  });

  it("el nombre de una entidad usa un sinónimo que el glosario prohíbe", () => {
    expect(con((d, e) => { e.name = "Lección"; })).toMatch(/el glosario prohíbe/);
  });

  it("un sinónimo prohibido del glosario que coincide con el id de otra entidad", () => {
    const g = JSON.parse(JSON.stringify(G));
    g.terminos.find((t) => t.termino === "sesión").sinonimos_prohibidos.push("pull request");
    expect(problemas(DATOS, { existe, glosario: g }).join()).toMatch(/el sinónimo prohibido «pull request» \(del glosario\) es el id de otra entidad/);
  });

  it("fuente de verdad: vacía, inexistente, con otras mayúsculas o incoherente con el registro", () => {
    expect(con((d, e) => { e.source_of_truth = ""; })).toMatch(/source_of_truth vacía/);
    expect(con((d, e) => { e.source_of_truth = "ops/no-existe.json"; })).toMatch(/no existe en git/);
    expect(con((d, e) => { e.source_of_truth = "claude.md"; })).toMatch(/no existe en git/);
    expect(con((d, e) => { e.registry = "with_registry"; })).toMatch(/with_registry pero sin fuente/);
    expect(con((d) => { d.entities.find((y) => y.id === "norm").source_of_truth = "none"; })).toMatch(/sin fuente de verdad solo puede ser without_registry/);
  });

  it("campos de más o de menos, y el campo declarado del aprendizaje", () => {
    expect(con((d, e) => { e.color = "rojo"; })).toMatch(/campo desconocido color/);
    expect(con((d, e) => { delete e.id_format; })).toMatch(/falta el campo id_format/);
    expect(con((d) => { d.entities.find((x) => x.id === "learning").fields[0].values = ["test"]; })).toMatch(/vocabulario cerrado de dos valores o más/);
    expect(con((d) => { d.entities.find((x) => x.id === "learning").fields[0].required_when.value = "otro"; })).toMatch(/required_when nombra un valor que recorded_in no tiene/);
    expect(con((d) => { d.entities.find((x) => x.id === "learning").fields[0].name = "Recorded_In"; })).toMatch(/sin la forma snake en inglés/);
  });

  it("ciclo de vida: retirar sin sustituto, volver a activo, borrar", () => {
    expect(con((d, e) => { e.status = "retired"; })).toMatch(/retired sin replaced_by/);
    expect(con((d, e) => { e.replaced_by = "skill"; })).toMatch(/replaced_by solo va en una entidad retired/);
    const d = copia();
    d.entities = d.entities.filter((e) => e.id !== "session");
    expect(problemasDeVida(d, [{ id: "session", status: "active" }]).join()).toMatch(/session: estaba en el registro y ha desaparecido/);
    expect(problemasDeVida(DATOS, [{ id: "session", status: "retired" }]).join()).toMatch(/session: estaba retired y vuelve a active/);
    const r = copia();
    Object.assign(r.entities.find((e) => e.id === "session"), { status: "retired", replaced_by: "skill" });
    expect(problemasDeVida(r, [{ id: "session", status: "active" }])).toEqual([]);
    expect(problemas(r, { existe, glosario: G }).filter((x) => /retired|replaced_by/.test(x))).toEqual([]);
  });
});

describe("los vocabularios del registro están anclados en ops/vocabularios-vida.json", () => {
  it("cada vocabulario de scripts/lib/entidades.mjs está anclado con sus valores", () => {
    const registro = JSON.parse(leer("ops/vocabularios-vida.json")).anclados;
    const actuales = valoresActuales();
    for (const id of ["axis", "registry", "status", "id_format", "stored_as", "relation", "subject_kind"]) {
      expect(Object.keys(registro[`entidades.${id}`] ?? {}).sort(), id).toEqual(Object.keys(actuales[`entidades.${id}`]).sort());
    }
  });
  it("los valores del JSON salen de esos vocabularios y los sujetos usan solo sus kinds", () => {
    for (const e of DATOS.entities) { expect(e.axis in AXES).toBe(true); expect(e.status in STATUSES).toBe(true); }
    for (const r of DATOS.relations) { expect(r.relation in RELATIONS).toBe(true); expect(r.stored_as in STORED_AS).toBe(true); }
    for (const v of Object.values(SUJETOS.sujetos)) expect(v.kind in SUBJECT_KINDS).toBe(true);
    expect(Object.keys(SUBJECT_KINDS)).toEqual(["entity", "type_of", "part_of", "instance_of", "produced_by", "outside"]);
  });
});

describe("autotest de los sujetos", () => {
  const ents = DATOS.entities;
  it("falla con un sujeto sin clasificar, uno que ya no existe, una entidad inventada o un motivo corto", () => {
    expect(problemasDeSujetos(SUJETOS, ents, [...sujetosUsados(), "nuevo"]).join()).toMatch(/nuevo: sujeto sin clasificar/);
    expect(problemasDeSujetos(SUJETOS, ents, sujetosUsados().slice(1)).join()).toMatch(/ya no es sujeto de ninguna norma/);
    const d = JSON.parse(JSON.stringify(SUJETOS));
    d.sujetos.agente.entity = "inventada";
    expect(problemasDeSujetos(d, ents, sujetosUsados()).join()).toMatch(/agente: «inventada» no es una entidad/);
    const e = JSON.parse(JSON.stringify(SUJETOS));
    e.sujetos.asset.reason = "corto";
    expect(problemasDeSujetos(e, ents, sujetosUsados()).join()).toMatch(/asset: outside sin motivo escrito/);
    const g = JSON.parse(JSON.stringify(SUJETOS));
    g.sujetos.diff.entity = "inventada";
    expect(problemasDeSujetos(g, ents, sujetosUsados()).join()).toMatch(/diff: «inventada» no es una entidad/);
    g.sujetos.diff.entity = "pull-request";
    g.sujetos.diff.reason = "";
    expect(problemasDeSujetos(g, ents, sujetosUsados()).join()).toMatch(/diff: part_of sin motivo escrito/);
    const f = JSON.parse(JSON.stringify(SUJETOS));
    f.sujetos.agente.kind = "casi";
    expect(problemasDeSujetos(f, ents, sujetosUsados()).join()).toMatch(/kind «casi» fuera del vocabulario/);
  });
});

describe("autotest de MAPA.md", () => {
  const flecha = (r) => `${n(r.from)} -->|${r.relation}| ${n(r.to)}`;
  const primera = DATOS.entities[0];
  it("falla si falta una entidad, si el eje o el registro no coinciden, o si sobra una fila", () => {
    const sinFila = MAPA.split("\n").filter((l) => !l.startsWith(`| \`${primera.id}\` |`)).join("\n");
    expect(problemasDeMapa(DATOS, sinFila).join()).toMatch(new RegExp(`${primera.id}: no está en las tablas`));
    const otroEje = MAPA.replace(new RegExp(`^(\\| \`${primera.id}\` \\| [^|]+\\| )${primera.axis}`, "m"), "$1vertical");
    expect(problemasDeMapa(DATOS, otroEje).join()).toMatch(/MAPA.md dice eje «vertical»/);
    const otroReg = MAPA.replace(new RegExp(`^(\\| \`${primera.id}\` \\|.*\\| )${primera.registry} \\|$`, "m"), "$1partial_x |");
    expect(problemasDeMapa(DATOS, otroReg).join()).toMatch(/MAPA.md dice registro «partial_x»/);
    const sobra = MAPA.replace(`| \`${primera.id}\` |`, "| `fantasma` | X | horizontal | ninguno | ninguna | partial |\n| `" + primera.id + "` |");
    expect(problemasDeMapa(DATOS, sobra).join()).toMatch(/fantasma: MAPA.md lista una entidad que no está en el JSON/);
  });
  it("falla si falta una flecha, si sobra una, o si la cabecera no cuadra", () => {
    const rel = DATOS.relations[0];
    expect(problemasDeMapa(DATOS, MAPA.replaceAll(flecha(rel), "x --> y")).join()).toMatch(/falta en los diagramas/);
    expect(problemasDeMapa(DATOS, MAPA.replace("```mermaid\nflowchart LR", "```mermaid\nflowchart LR\n    sesion_x -->|uses| skill")).join()).toMatch(/flecha de MAPA.md que no está en el JSON/);
    expect(problemasDeMapa(DATOS, MAPA.replace(/Hoy hay \d+ entidades/, "Hoy hay 99 entidades")).join()).toMatch(/la cabecera de MAPA.md dice 99/);
  });
  it("falla si al diagrama de puentes le falta una relación que toca un puente o la clase puente no cuadra", () => {
    const bloques = bloquesMermaid(MAPA);
    const ultimo = bloques[bloques.length - 1];
    const rel = DATOS.relations.find((r) => DATOS.entities.find((e) => e.id === r.from).axis === "bridge");
    const sinFlecha = ultimo.replace(`    ${flecha(rel)}\n`, "");
    expect(problemasDeMapa(DATOS, MAPA.replace(ultimo, sinFlecha)).join()).toMatch(/toca un puente o cruza de eje y falta en el diagrama de puentes/);
    const sinClase = ultimo.replace(/^\s+class \S+ puente$/m, "    class x puente");
    expect(problemasDeMapa(DATOS, MAPA.replace(ultimo, sinClase)).join()).toMatch(/la clase puente del diagrama/);
  });
});
