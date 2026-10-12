import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerGlosario, plano, prohibidosDe } from "../scripts/lib/glosario.mjs";
import { REFERENCIA } from "../scripts/lib/forjaReferencia.mjs";
import {
  BECOMES, CARDINALITIES, CREATORS, FAMILIES, ID_FORMATS, LEVELS, PARENT_KINDS, REGISTRIES, RELATION_CLASSES, RELATIONS, SCOPES, STATUSES, STORED_AS,
  SUBJECT_KINDS, VERBOS_DE_CLASE, esPuente,
} from "../scripts/lib/entidades.mjs";
import { TIPOS as TIPOS_DE_RECURSO } from "../scripts/lib/recursos.mjs";
import { valoresActuales } from "../scripts/lib/vocabulariosVida.mjs";
import { bloque, mapa } from "../scripts/mapa-entidades.mjs";

/**
 * El registro de entidades (paso 1 de la normalización del lenguaje y los datos, #566; segunda versión, #652).
 * Vigila ops/entidades.json, ops/entidades-sujetos.json y las dos vistas generadas (MAPA.md y SUPER-TABLA.md):
 *
 *  1. vocabularios cerrados: alcance, nivel, familia, quién crea, clase y cardinalidad de una relación, registro, formato de id,
 *     verbo, cómo se guarda, estado y en qué se convierte lo retirado;
 *  2. ids únicos y con forma válida (kebab, minúsculas, ASCII, en inglés);
 *  3. la definición NO está en el JSON: vive en el glosario (`term`), que guarda también la traducción (`en` de la ficha = id de la
 *     entidad). Los sinónimos prohibidos salen del glosario;
 *  4. relaciones tipadas: a entidades activas que existen, con clase, cardinalidad y verbo que casan, sin repetirse; el fondo dice si
 *     su hijo es evidencia o remedio; la contención (part_of) no da vueltas; toda entidad activa está en alguna;
 *  5. ninguna entidad sin lector, salvo una lista que solo baja; fuentes y lectores que existen (contra `git ls-files`);
 *  6. ciclo de vida: una entidad no desaparece, se retira con `replaced_by` y `becomes` (contra origin/staging);
 *  7. los sujetos de ops/normas.json y de ops/estandares-agentes.json son una entidad, un tipo suyo o quedan fuera con motivo;
 *  8. MAPA.md y el bloque de SUPER-TABLA.md son los generados del JSON (scripts/mapa-entidades.mjs).
 *
 * Abajo, un autotest: cada regla falla con datos malos. Sin red.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const DATOS = JSON.parse(leer("ops/entidades.json"));
const SUJETOS = JSON.parse(leer("ops/entidades-sujetos.json"));
const MAPA = leer("docs/entidades/MAPA.md");
const SUPER = leer("docs/entidades/SUPER-TABLA.md");
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
export const PEDIDAS = ["session", "service", "environment", "event", "norm", "mechanism", "metric", "eval", "team-member"];
/**
 * Las entidades activas sin lector, con su motivo. SOLO BAJA (#652, «ninguna entidad sin lector»): el test falla si una de la
 * lista ya tiene lector (quítala) y si una que no está en la lista no lo tiene. Subir TOPE_SIN_LECTOR es romper el trinquete.
 */
export const SIN_LECTOR = {
  "team-member": "Pablo, Álvaro y Manu solo constan en prosa (CLAUDE.md); nada por máquina los lee: decision.assigned_to los nombra en GitHub",
};
/** Los tipos de evento sin lector, con su motivo. SOLO BAJA, igual que SIN_LECTOR. */
export const TIPOS_DE_EVENTO_SIN_LECTOR = {
  human_intervention: "ningún hook lo escribe todavía (propuesta de Pablo, #568); sin él no se cuenta la intervención humana",
};
export const TOPE_SIN_LECTOR = 2;
// Los ids del nacimiento del registro (11 oct 2026). Plan B del ciclo de vida: no se edita; un id no se borra, se retira.
export const IDS_FIJADOS = [
  "session", "team-member", "identity", "service", "environment", "deployment", "event", "norm", "learning", "mechanism", "metric", "eval", "judge",
  "secret", "vault", "agent", "skill", "rule", "hook", "issue", "root-problem", "case", "assignment", "decision", "pull-request", "branch",
  "migration", "table", "data-source", "module", "vocabulary", "household", "person", "channel-identity", "recipe", "ingredient", "menu", "pantry",
  "shopping-list", "lola-conversation",
];
const REQUERIDOS = ["id", "name", "scope", "level", "family", "term", "source_of_truth", "id_format", "registry", "status", "created_by", "readers"];
const OPCIONALES = ["role_by_scope", "note", "fields", "types", "replaced_by", "becomes", "becomes_in", "becomes_types"];
const CAMPOS_RELACION = ["from", "relation", "to", "class", "cardinality", "parent_kind", "stored_as", "stored_in"];
const FORMA_ID = /^[a-z]+(-[a-z]+)*$/;
const FORMA_CAMPO = /^[a-z]+(_[a-z]+)*$/;
const FORMA_TIPO = /^[a-z]+(-[a-z]+)*$/;
const MAX_ROLE = 30;
const aId = (s) => plano(s).replace(/\s+/g, "-");
const G = leerGlosario(RAIZ);
const termino = (g, t) => g.terminos.find((x) => x.termino === t && x.estado !== "retirado");
/** Un lector que parece una ruta (sin espacios ni paréntesis) tiene que existir; el resto es texto («Claude Code (…)»). */
const esRuta = (s) => /^[\w./-]+\.\w+$/.test(s) || /^[\w.-]+(\/[\w.-]+)+$/.test(s);

/** Los sinónimos prohibidos de una entidad: salen del glosario, no se copian a mano. */
export function sinonimosDe(glosario, entidad) {
  const t = entidad.term ? termino(glosario, entidad.term) : null;
  return t ? prohibidosDe(t) : [];
}

function problemasDeCampos(q, fields, p) {
  if (!Array.isArray(fields) || fields.length === 0) p.push(`${q}: fields vacío`);
  for (const c of fields ?? []) {
    if (!FORMA_CAMPO.test(c.name ?? "")) p.push(`${q}: campo declarado «${c.name}» sin la forma snake en inglés`);
    if (!Array.isArray(c.values) || c.values.length < 2 || new Set(c.values).size !== c.values.length || !c.values.every((v) => FORMA_CAMPO.test(v))) p.push(`${q}: el campo ${c.name} necesita un vocabulario cerrado de dos valores o más, sin repetir`);
    if (c.required_when) {
      if (!(c.values ?? []).includes(c.required_when.value)) p.push(`${q}: required_when nombra un valor que ${c.name} no tiene`);
      if (!FORMA_CAMPO.test(c.required_when.field ?? "")) p.push(`${q}: required_when sin campo válido`);
    }
  }
}

export function problemas(datos, { existe: hay, glosario = null, sinLector = SIN_LECTOR, tiposSinLector = TIPOS_DE_EVENTO_SIN_LECTOR } = {}) {
  const p = [];
  const ents = datos.entities ?? [];
  const ids = ents.map((e) => e.id);
  const idsSet = new Set(ids);
  const activas = new Set(ents.filter((e) => e.status === "active").map((e) => e.id));
  const porId = new Map(ents.map((e) => [e.id, e]));
  const vistos = new Set();
  for (const id of ids) {
    if (vistos.has(id)) p.push(`${id}: id repetido`);
    vistos.add(id);
  }
  const terminosUsados = new Map();
  for (const e of ents) {
    const q = `${e.id}`;
    const act = e.status === "active";
    if ("definition" in e || "definicion" in e) p.push(`${q}: la definición no va aquí: vive en el glosario (term)`);
    const extra = Object.keys(e).filter((c) => !REQUERIDOS.includes(c) && !OPCIONALES.includes(c) && c !== "definition" && c !== "definicion");
    if (extra.length) p.push(`${q}: campo desconocido ${extra.join(", ")}`);
    for (const c of REQUERIDOS) if (!(c in e)) p.push(`${q}: falta el campo ${c}`);
    if (typeof e.id !== "string" || !FORMA_ID.test(e.id)) p.push(`${q}: id sin la forma kebab en inglés (minúsculas ASCII y guiones)`);
    if (typeof e.name !== "string" || !e.name.trim()) p.push(`${q}: name vacío`);
    if (!(e.scope in SCOPES)) p.push(`${q}: scope «${e.scope}» fuera del vocabulario`);
    if (!(e.level in LEVELS)) p.push(`${q}: level «${e.level}» fuera del vocabulario`);
    if (!(e.family in FAMILIES)) p.push(`${q}: family «${e.family}» fuera del vocabulario`);
    if (!(e.registry in REGISTRIES)) p.push(`${q}: registry «${e.registry}» fuera del vocabulario`);
    if (!(e.id_format in ID_FORMATS)) p.push(`${q}: id_format «${e.id_format}» fuera del vocabulario`);
    if (!(e.status in STATUSES)) p.push(`${q}: status «${e.status}» fuera del vocabulario`);
    // Un meta o una plantilla no es de un proyecto: sería una extensión que cita su meta horizontal (N0, reglas 1 a 4).
    if (e.level !== "piece" && e.scope === "vertical") p.push(`${q}: un ${e.level} no puede ser vertical (sería una extensión: di both y cita su meta horizontal)`);
    if (!Array.isArray(e.created_by) || e.created_by.length === 0 || new Set(e.created_by).size !== e.created_by.length || !e.created_by.every((c) => c in CREATORS)) p.push(`${q}: created_by necesita uno o más valores de CREATORS, sin repetir`);
    if (!Array.isArray(e.readers) || !e.readers.every((r) => typeof r === "string" && r.trim())) p.push(`${q}: readers tiene que ser una lista de textos`);
    else {
      for (const r of e.readers) if (hay && esRuta(r) && !hay(r)) p.push(`${q}: el lector «${r}» no existe en git`);
      if (act && e.readers.length === 0 && !(q in sinLector)) p.push(`${q}: ninguna entidad sin lector (dile quién la lee, o añádela a SIN_LECTOR con su motivo)`);
      if (act && e.readers.length > 0 && q in sinLector) p.push(`${q}: ya tiene lector; quítala de SIN_LECTOR (la lista solo baja)`);
      if (!act && e.readers.length > 0) p.push(`${q}: una entidad retirada no lleva lectores`);
    }
    if (e.status === "retired") {
      if (!e.replaced_by || !ents.some((x) => x.id === e.replaced_by && x.status === "active")) p.push(`${q}: retired sin replaced_by que sea una entidad activa`);
      if (!(e.becomes in BECOMES)) p.push(`${q}: becomes «${e.becomes}» fuera del vocabulario (en qué se convierte lo retirado)`);
      if (typeof e.becomes_in !== "string" || !e.becomes_in.trim()) p.push(`${q}: retired sin becomes_in (dónde queda)`);
      if (e.becomes === "type") {
        const tipos = porId.get(e.replaced_by)?.types ?? [];
        if (!Array.isArray(e.becomes_types) || e.becomes_types.length === 0 || !e.becomes_types.every((t) => tipos.includes(t))) p.push(`${q}: becomes type necesita becomes_types, y todos tipos de ${e.replaced_by}`);
      } else if ("becomes_types" in e) p.push(`${q}: becomes_types solo va con becomes type`);
    } else for (const c of ["replaced_by", "becomes", "becomes_in", "becomes_types"]) if (c in e) p.push(`${q}: ${c} solo va en una entidad retired`);
    // both no es un cajón (hallazgo del revisor de #654): quien sirve a los dos lados dice qué es a cada uno.
    if (e.scope === "both" && act && !("role_by_scope" in e)) p.push(`${q}: una entidad both dice su role_by_scope (qué es a cada lado); si no sirve a los dos, es horizontal o vertical`);
    if ("role_by_scope" in e) {
      if (e.scope !== "both") p.push(`${q}: role_by_scope solo va en una entidad both`);
      if (typeof e.role_by_scope !== "string" || !e.role_by_scope.trim() || e.role_by_scope.split(/\s+/).length > MAX_ROLE) p.push(`${q}: role_by_scope vacío o de más de ${MAX_ROLE} palabras`);
    }
    if ("types" in e) {
      if (!Array.isArray(e.types) || e.types.length === 0 || new Set(e.types).size !== e.types.length || !e.types.every((t) => FORMA_TIPO.test(t))) p.push(`${q}: types necesita ids kebab sin repetir`);
    }
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
    } else if (e.scope !== "vertical") p.push(`${q}: solo una entidad vertical puede quedar sin term (su glosario es de proceso)`);
    const f = e.source_of_truth;
    if (typeof f !== "string" || !f.trim()) p.push(`${q}: source_of_truth vacía (di «none»)`);
    else if (f !== "none" && hay && !hay(f)) p.push(`${q}: la fuente «${f}» no existe en git`);
    if (e.registry === "with_registry" && f === "none") p.push(`${q}: with_registry pero sin fuente de verdad`);
    if (f === "none" && e.registry !== "without_registry") p.push(`${q}: sin fuente de verdad solo puede ser without_registry`);
    if ("fields" in e) problemasDeCampos(q, e.fields, p);
  }
  if (glosario) {
    const canon = new Map();
    for (const t of glosario.terminos) for (const s of prohibidosDe(t)) canon.set(plano(s), t.termino);
    for (const e of ents) if (canon.has(plano(e.name ?? ""))) p.push(`${e.id}: el nombre «${e.name}» es un sinónimo que el glosario prohíbe (di «${canon.get(plano(e.name))}»)`);
  }
  // Proyectos: las instancias de la entidad project.
  const proyectos = new Set();
  for (const pr of datos.projects ?? []) {
    if (!FORMA_ID.test(pr.id ?? "")) p.push(`proyecto ${pr.id}: id sin la forma kebab`);
    if (proyectos.has(pr.id)) p.push(`proyecto ${pr.id}: repetido`);
    proyectos.add(pr.id);
    if (!Array.isArray(pr.repos) || pr.repos.length === 0 || !pr.repos.every((r) => /^[\w.-]+\/[\w.-]+$/.test(r))) p.push(`proyecto ${pr.id}: repos necesita nombres propietario/repo`);
    if (typeof pr.name !== "string" || !pr.name.trim()) p.push(`proyecto ${pr.id}: name vacío`);
  }
  if (proyectos.size < 2) p.push("proyectos: hoy hay dos (homenu y panel)");
  // Tipos de evento.
  const tipos = new Set();
  for (const t of datos.event_types ?? []) {
    const q = `tipo de evento ${t.id}`;
    if (!FORMA_CAMPO.test(t.id ?? "")) p.push(`${q}: id sin la forma snake en inglés`);
    if (tipos.has(t.id)) p.push(`${q}: repetido`);
    tipos.add(t.id);
    if (!activas.has(t.of)) p.push(`${q}: of «${t.of}» no es una entidad activa`);
    if (typeof t.name !== "string" || !t.name.trim()) p.push(`${q}: name vacío`);
    problemasDeCampos(q, t.fields, p);
    if (!Array.isArray(t.readers)) p.push(`${q}: readers tiene que ser una lista`);
    else {
      for (const r of t.readers) if (hay && esRuta(r) && !hay(r)) p.push(`${q}: el lector «${r}» no existe en git`);
      if (t.readers.length === 0 && !(t.id in tiposSinLector)) p.push(`${q}: ninguna cosa sin lector (dile quién lo lee, o añádelo a TIPOS_DE_EVENTO_SIN_LECTOR con su motivo)`);
      if (t.readers.length > 0 && t.id in tiposSinLector) p.push(`${q}: ya tiene lector; quítalo de TIPOS_DE_EVENTO_SIN_LECTOR (la lista solo baja)`);
    }
  }
  const usadas = new Set();
  const dichas = new Set();
  for (const r of datos.relations ?? []) {
    const q = `relación ${r.from} ${r.relation} ${r.to}`;
    const extra = Object.keys(r).filter((c) => !CAMPOS_RELACION.includes(c));
    if (extra.length) p.push(`${q}: campo desconocido ${extra.join(", ")}`);
    if (!idsSet.has(r.from)) p.push(`${q}: «${r.from}» no es una entidad`);
    else if (!activas.has(r.from)) p.push(`${q}: «${r.from}» está retirada y no entra en relaciones`);
    if (!idsSet.has(r.to)) p.push(`${q}: «${r.to}» no es una entidad`);
    else if (!activas.has(r.to)) p.push(`${q}: «${r.to}» está retirada y no entra en relaciones`);
    if (!(r.relation in RELATIONS)) p.push(`${q}: relación fuera del vocabulario`);
    if (!(r.class in RELATION_CLASSES)) p.push(`${q}: class «${r.class}» fuera del vocabulario`);
    else if (r.class in VERBOS_DE_CLASE) {
      if (!VERBOS_DE_CLASE[r.class].includes(r.relation)) p.push(`${q}: la clase ${r.class} solo admite los verbos ${VERBOS_DE_CLASE[r.class].join(", ")}`);
    } else if (Object.values(VERBOS_DE_CLASE).some((v) => v.includes(r.relation)) && r.class === "reference") {
      const dueno = Object.entries(VERBOS_DE_CLASE).find(([, v]) => v.includes(r.relation))[0];
      if (dueno !== "part_of") p.push(`${q}: el verbo ${r.relation} es de la clase ${dueno}`);
    }
    if (!(r.cardinality in CARDINALITIES)) p.push(`${q}: cardinality «${r.cardinality}» fuera del vocabulario`);
    // El hijo de un fondo es evidencia (casos) o remedio (encargos); ningún otro hijo lleva clase.
    if (r.class === "parent_of" && r.to === "root-problem") {
      if (!(r.parent_kind in PARENT_KINDS)) p.push(`${q}: el hijo de un fondo dice su parent_kind (evidence o remedy)`);
    } else if ("parent_kind" in r) p.push(`${q}: parent_kind solo va en un hijo de root-problem`);
    if (r.from === r.to && !["part_of", "parent_of"].includes(r.class) && r.relation !== "depends_on") p.push(`${q}: apunta a sí misma`);
    if (!(r.stored_as in STORED_AS)) p.push(`${q}: stored_as «${r.stored_as}» fuera del vocabulario`);
    if (r.stored_as === "field" || r.stored_as === "file") {
      if (typeof r.stored_in !== "string" || !r.stored_in.trim()) p.push(`${q}: falta stored_in (obligatorio con ${r.stored_as})`);
    } else if ("stored_in" in r && (typeof r.stored_in !== "string" || !r.stored_in.trim())) p.push(`${q}: stored_in vacío (quítalo: es opcional con ${r.stored_as})`);
    if (CENTINELAS.includes(String(r.stored_in ?? "").trim().toLowerCase())) p.push(`${q}: stored_in «${r.stored_in}» es un centinela; con ${r.stored_as} se omite`);
    if (r.stored_as === "unaudited") {
      const vertical = (id) => porId.get(id)?.scope === "vertical";
      if (!vertical(r.from) && !vertical(r.to)) p.push(`${q}: unaudited solo vale con una entidad vertical`);
    }
    const k = `${r.from}|${r.relation}|${r.to}`;
    if (dichas.has(k)) p.push(`${q}: repetida`);
    dichas.add(k);
    usadas.add(r.from);
    usadas.add(r.to);
  }
  for (const id of ids) if (activas.has(id) && !usadas.has(id)) p.push(`${id}: ninguna relación la nombra`);
  // La contención no da vueltas: lo que es parte de algo no puede contenerse a sí mismo por el camino.
  const hacia = new Map();
  for (const r of datos.relations ?? []) if (["part_of", "parent_of"].includes(r.class) && r.from !== r.to) hacia.set(r.from, [...(hacia.get(r.from) ?? []), r.to]);
  const enCamino = new Set();
  const hecho = new Set();
  const visita = (id) => {
    if (hecho.has(id)) return false;
    if (enCamino.has(id)) return true;
    enCamino.add(id);
    const vuelta = (hacia.get(id) ?? []).some(visita);
    enCamino.delete(id);
    hecho.add(id);
    return vuelta;
  };
  for (const id of hacia.keys()) if (visita(id)) { p.push(`contención: ${id} está dentro de sí misma por part_of y parent_of`); break; }
  return p;
}

/** El ciclo de vida: ninguna entidad desaparece ni vuelve de retired. `ref` es una lista de {id, status}. */
export function problemasDeVida(actual, ref) {
  const p = [];
  const hoy = new Map((actual.entities ?? []).map((e) => [e.id, e]));
  for (const r of ref) {
    const e = hoy.get(r.id);
    if (!e) p.push(`${r.id}: estaba en el registro y ha desaparecido (retírala: status retired, replaced_by y becomes)`);
    else if (r.status === "retired" && e.status === "active") p.push(`${r.id}: estaba retired y vuelve a active (un id retirado no se reutiliza)`);
  }
  return p;
}

/** Los sujetos de normas y estándares: una entidad, un tipo suyo (N2) o fuera con motivo. */
export function problemasDeSujetos(doc, entidades, sujetosUsados) {
  const p = [];
  const activas = new Set(entidades.filter((e) => e.status === "active").map((e) => e.id));
  const s = doc.sujetos ?? {};
  for (const k of sujetosUsados) if (!(k in s)) p.push(`${k}: sujeto sin clasificar en ops/entidades-sujetos.json`);
  for (const [k, v] of Object.entries(s)) {
    if (!sujetosUsados.includes(k)) p.push(`${k}: ya no es sujeto de ninguna norma ni estándar; quítalo`);
    if (!(v.kind in SUBJECT_KINDS)) { p.push(`${k}: kind «${v.kind}» fuera del vocabulario`); continue; }
    if (v.kind !== "outside" && !activas.has(v.entity)) p.push(`${k}: «${v.entity}» no es una entidad activa`);
    if (v.kind === "entity" && v.reason) p.push(`${k}: una entidad no lleva reason`);
    if (v.kind !== "entity" && (typeof v.reason !== "string" || v.reason.trim().length < 15)) p.push(`${k}: ${v.kind} sin motivo escrito (15 caracteres o más)`);
    if (v.kind === "outside" && v.entity) p.push(`${k}: outside no nombra entidad`);
  }
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
const E = (id, d = DATOS) => d.entities.find((e) => e.id === id);
const hay = (f, rel, t, d = DATOS) => d.relations.some((x) => x.from === f && x.relation === rel && x.to === t);

describe("el registro de entidades", () => {
  it("no tiene ningún problema", () => {
    expect(problemas(DATOS, { existe, glosario: G }), "Corrige ops/entidades.json").toEqual([]);
  });

  it("tiene las entidades que pidió Pablo, las del auditor de datos y las nuevas de #652", () => {
    const activas = DATOS.entities.filter((e) => e.status === "active").map((e) => e.id);
    for (const id of [...PEDIDAS, "identity", "agent", "skill", "hook", "issue", "root-problem", "case", "assignment", "decision", "pull-request", "branch", "migration", "data-source", "module", "table", "vocabulary"]) expect(activas, id).toContain(id);
    for (const id of ["project", "repo", "resource", "agent-task", "standard", "workflow", "plane", "assignment-type", "criterion", "verification"]) expect(activas, id).toContain(id);
    for (const id of ["design-system", "design-profile", "token", "component", "pattern"]) expect(activas, id).toContain(id);
    for (const id of ["household", "person", "recipe", "ingredient", "menu", "pantry", "shopping-list", "lola-conversation", "account", "menu-week", "group", "chat"]) expect(E(id)?.scope, id).toBe("vertical");
  });

  it("cada alcance tiene entidades y «puente» es el alcance both, calculado, no un valor", () => {
    for (const s of Object.keys(SCOPES)) expect(DATOS.entities.filter((e) => e.status === "active" && e.scope === s).length, s).toBeGreaterThan(0);
    expect(Object.keys(SCOPES)).toEqual(["horizontal", "vertical", "both"]);
    expect(Object.keys(SCOPES)).not.toContain("bridge");
    expect(esPuente({ scope: "both" })).toBe(true);
    expect(esPuente({ scope: "vertical" })).toBe(false);
    // los antiguos puentes que siguen siéndolo
    for (const id of ["environment", "event", "metric", "eval"]) expect(esPuente(E(id)), id).toBe(true);
    // los que los datos mandaron al lado vertical (SUPER-TABLA, sección 9)
    for (const id of ["migration", "table", "data-source", "module"]) expect(E(id).scope, id).toBe("vertical");
  });

  it("both no es un cajón: las 10 que quedan explican su doble lado, y las del proceso son horizontales", () => {
    const both = DATOS.entities.filter((e) => e.status === "active" && e.scope === "both").map((e) => e.id).sort();
    expect(both).toEqual(["environment", "eval", "event", "metric", "norm", "principle", "resource", "verification", "vocabulary", "workflow"]);
    for (const id of both) expect(E(id).role_by_scope, id).toMatch(/Proceso: .*Producto: |Proceso: .*Producto:/);
    for (const id of ["issue", "case", "root-problem", "assignment", "decision", "pull-request", "branch", "agent", "agent-task", "skill", "standard", "service"]) expect(E(id).scope, id).toBe("horizontal");
    expect(E("repo").scope).toBe("vertical");
  });

  it("la escala de nivel es una sola: meta, template y piece; los meta y las plantillas nunca son verticales", () => {
    expect(Object.keys(LEVELS)).toEqual(["meta", "template", "piece"]);
    for (const e of DATOS.entities) expect(e.level in LEVELS, e.id).toBe(true);
    for (const id of ["principle", "norm", "criterion", "plane"]) expect(E(id).level, id).toBe("meta");
    for (const id of ["mechanism", "assignment-type", "resource", "design-profile"]) expect(E(id).level, id).toBe("template");
    expect(DATOS.entities.filter((e) => e.level !== "piece" && e.scope === "vertical")).toEqual([]);
  });

  it("la contención es factoría > proyecto > entorno, con part_of; la factoría es la raíz implícita", () => {
    expect(DATOS.projects.map((p) => p.id)).toEqual(["homenu", "panel"]);
    for (const id of ["environment", "repo", "resource", "design-system", "module"]) expect(hay(id, "belongs_to", "project"), id).toBe(true);
    expect(E("project").scope).toBe("horizontal");
    expect(DATOS.entities.find((e) => e.id === "factory")).toBeUndefined();
    expect(DATOS.relations.filter((r) => r.to === "project").every((r) => r.class === "part_of")).toBe(true);
  });

  it("las relaciones de un fondo con sus hijos son parent_of y de dos clases: evidencia (casos) y remedio (encargos)", () => {
    const x = (f) => DATOS.relations.find((r) => r.from === f && r.to === "root-problem");
    expect(x("case")).toMatchObject({ relation: "hangs_from", class: "parent_of", parent_kind: "evidence", cardinality: "many_to_one" });
    expect(x("assignment")).toMatchObject({ relation: "hangs_from", class: "parent_of", parent_kind: "remedy", cardinality: "many_to_one" });
    expect(Object.keys(PARENT_KINDS)).toEqual(["evidence", "remedy"]);
    for (const t of ["root-problem", "case", "assignment", "decision"]) expect(DATOS.relations.find((r) => r.from === t && r.to === "issue")).toMatchObject({ class: "is_a" });
  });

  it("toda relación tiene clase y cardinalidad, y hay de las cuatro clases", () => {
    for (const r of DATOS.relations) { expect(r.class in RELATION_CLASSES, `${r.from} ${r.relation} ${r.to}`).toBe(true); expect(r.cardinality in CARDINALITIES).toBe(true); }
    for (const c of Object.keys(RELATION_CLASSES)) expect(DATOS.relations.filter((r) => r.class === c).length, c).toBeGreaterThan(0);
  });

  it("intervención humana y despliegue son tipos de evento, no entidades", () => {
    const t = (id) => DATOS.event_types.find((x) => x.id === id);
    expect(t("human_intervention").of).toBe("event");
    expect(t("human_intervention").fields.find((c) => c.name === "reason").values).toEqual(["gateway", "permission", "decision", "tool_failure", "clarification", "manual_fix"]);
    expect(t("human_intervention").fields.find((c) => c.name === "avoidable").values).toEqual(["yes", "no"]);
    expect(E("human-intervention")).toBeUndefined();
    expect(t("deployment").of).toBe("event");
    expect(E("deployment")).toMatchObject({ status: "retired", replaced_by: "event", becomes: "event_type" });
  });

  it("lo retirado dice a qué pasa: juez es un valor del agente, regla un campo de la norma, aprendizaje un campo del fondo, secreto y bóveda tipos de recurso", () => {
    expect(E("judge")).toMatchObject({ status: "retired", replaced_by: "agent", becomes: "value" });
    expect(E("rule")).toMatchObject({ status: "retired", replaced_by: "norm", becomes: "field" });
    expect(E("learning")).toMatchObject({ status: "retired", replaced_by: "root-problem", becomes: "field" });
    expect(E("secret")).toMatchObject({ status: "retired", replaced_by: "resource", becomes: "type", becomes_types: ["clave", "token", "deploy-key"] });
    expect(E("vault")).toMatchObject({ status: "retired", replaced_by: "resource", becomes: "type", becomes_types: ["boveda"] });
    expect(DATOS.relations.filter((r) => ["judge", "rule", "learning", "deployment", "secret", "vault"].some((id) => r.from === id || r.to === id))).toEqual([]);
  });

  it("los tipos de recurso son los de scripts/lib/recursos.mjs", () => {
    expect(E("resource").types).toEqual(Object.keys(TIPOS_DE_RECURSO));
  });

  it("el fondo declara su campo learning_recorded_in: test, guard, rule o skill, y con skill dice por qué no se automatizó", () => {
    const campo = E("root-problem").fields.find((c) => c.name === "learning_recorded_in");
    expect(campo.values).toEqual(["test", "guard", "rule", "skill"]);
    expect(campo.required_when).toEqual({ value: "skill", field: "reason_not_automated" });
  });

  it("el término del aprendizaje sigue siendo «aprendizaje» y «lección» sale del glosario como sinónimo prohibido", () => {
    const l = E("learning");
    expect(l.term).toBe("aprendizaje");
    expect(sinonimosDe(G, l)).toContain("lección");
  });

  it("la verificación (comprobación) es la entidad del fichero que vigila una norma; «control» queda para el glosario", () => {
    expect(E("verification").term).toBe("comprobación");
    expect(E("verification").name).toBe("Comprobación");
    expect(DATOS.entities.find((e) => e.id === "control")).toBeUndefined();
    expect(termino(G, "control").en).toBeUndefined();
    expect(hay("norm", "enforced_by", "verification")).toBe(true);
  });

  it("la norma no se cumple por id de mecanismo (EJECUTORES no es mecanismos.json), y el evento nombra skill y agente", () => {
    const x = (f, rel, t) => DATOS.relations.find((y) => y.from === f && y.relation === rel && y.to === t);
    expect(x("norm", "enforced_by", "mechanism").stored_as).toBe("none");
    expect(x("event", "refers_to", "skill").stored_in).toMatch(/skill_cargada/);
    expect(x("event", "refers_to", "agent").stored_in).toMatch(/agente_lanzado/);
    expect(x("event", "uses", "vocabulary").stored_as).toBe("file");
  });

  it("el evento dispara la revisión de una skill y apunta al fondo cuando se registra un aprendizaje (propuesta de Pablo, #566)", () => {
    expect(hay("event", "triggers", "skill")).toBe(true);
    expect(hay("event", "refers_to", "root-problem")).toBe(true);
  });

  it("el glosario relaciona persona (equipo) con persona de la casa en los dos sentidos", () => {
    const t = (n) => G.terminos.find((y) => y.termino === n);
    expect(t("persona").relacionado).toContain("persona de la casa");
    expect(t("persona de la casa").relacionado).toContain("persona");
    expect(t("persona").nota).toMatch(/persona de la casa/);
  });

  it("la identidad es horizontal y la cuenta de canal de la casa depende de la cuenta (account), no de una persona", () => {
    expect(E("identity").scope).toBe("horizontal");
    expect(E("channel-identity").scope).toBe("vertical");
    expect(E("person").scope).toBe("vertical");
    expect(hay("channel-identity", "belongs_to", "account")).toBe(true);
    expect(hay("channel-identity", "belongs_to", "person")).toBe(false);
  });

  it("el módulo y el submódulo, y el vocabulario, llevan cifras reales y no las viejas", () => {
    expect(E("module").note).toMatch(/23 valores distintos de dueño/);
    expect(E("module").note).toMatch(/submódulos/);
    const anclados = JSON.parse(leer("ops/vocabularios-vida.json")).anclados;
    const nVoc = Object.keys(anclados).length;
    const nVal = Object.values(anclados).reduce((a, v) => a + (Array.isArray(v) ? v.length : Object.keys(v).length), 0);
    expect(E("vocabulary").note, "Cambia las cifras de la nota de vocabulary").toContain(`${nVoc} vocabularios y ${nVal} valores anclados`);
    expect(E("vocabulary").note).not.toMatch(/56 vocabularios/);
  });

  it("las fuentes citadas existen en git, con las mayúsculas exactas", () => {
    for (const e of DATOS.entities) if (e.source_of_truth !== "none") expect(existe(e.source_of_truth), e.source_of_truth).toBe(true);
    expect(existe("claude.md")).toBe(false);
  });

  it("MAPA.md y el bloque de SUPER-TABLA.md son los generados del JSON (node scripts/mapa-entidades.mjs --escribir)", () => {
    expect(MAPA, "Regenera docs/entidades/MAPA.md").toBe(mapa(DATOS));
    const i = SUPER.indexOf("<!-- super-tabla:inicio -->");
    const f = SUPER.indexOf("<!-- super-tabla:fin -->");
    expect(i).toBeGreaterThan(-1);
    expect(SUPER.slice(i + "<!-- super-tabla:inicio -->".length, f).trim(), "Regenera el bloque de SUPER-TABLA.md").toBe(bloque(DATOS).trim());
  });

  it("SUPER-TABLA.md ya no aplaza el sistema de diseño por tener una sola instancia", () => {
    expect(SUPER).not.toMatch(/META-DISENO ya los propone y hoy hay una sola instancia/);
    expect(SUPER).not.toMatch(/el panel será la segunda y entonces se pueden contrastar/);
  });
});

describe("ninguna entidad sin lector", () => {
  it("la lista de excepciones es verdad y no puede subir", () => {
    const sin = DATOS.entities.filter((e) => e.status === "active" && e.readers.length === 0).map((e) => e.id).sort();
    expect(sin).toEqual(Object.keys(SIN_LECTOR).sort());
    expect(Object.keys(SIN_LECTOR).length).toBeLessThanOrEqual(TOPE_SIN_LECTOR);
    expect(DATOS.event_types.filter((t) => t.readers.length === 0).map((t) => t.id).sort()).toEqual(Object.keys(TIPOS_DE_EVENTO_SIN_LECTOR).sort());
  });
});

describe("ciclo de vida: una entidad se retira, no se borra", () => {
  it(`ninguna de ${REF ? REFERENCIA() : "los ids fijados"} desaparece ni vuelve de retired`, () => {
    expect(problemasDeVida(DATOS, REF ?? IDS_FIJADOS.map((id) => ({ id, status: "active" }))), "Un id no se borra: status retired, replaced_by y becomes").toEqual([]);
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

/**
 * Términos del glosario de clase artefacto con traducción (`en`) que aún no son entidad, con su motivo.
 * Solo baja (#619): un artefacto con nombre inglés es una cosa con id estable y va al registro.
 */
export const ARTEFACTOS_SIN_ENTIDAD = {
  entity: "la entidad es la unidad del propio registro, no una entidad registrada en él",
};

/** Los términos de clase artefacto con `en` que no tienen su entidad ni están en `fuera`. */
export function artefactosSinEntidad(g, datos, fuera = ARTEFACTOS_SIN_ENTIDAD) {
  const ids = new Set(datos.entities.map((e) => e.id));
  return g.terminos.filter((t) => t.estado !== "retirado" && t.clase === "artefacto" && t.en && !ids.has(t.en) && !(t.en in fuera)).map((t) => t.en);
}

describe("cada artefacto del glosario con traducción es una entidad (#619)", () => {
  it("ninguno se queda sin entidad, salvo los de ARTEFACTOS_SIN_ENTIDAD, y esa lista es verdad", () => {
    expect(artefactosSinEntidad(G, DATOS)).toEqual([]);
    const ids = new Set(DATOS.entities.map((e) => e.id));
    expect(Object.keys(ARTEFACTOS_SIN_ENTIDAD).filter((en) => ids.has(en))).toEqual([]);
  });
  it("se ve fallar: quitar la entidad principle la deja sin entidad", () => {
    const sin = { ...DATOS, entities: DATOS.entities.filter((e) => e.id !== "principle") };
    expect(artefactosSinEntidad(G, sin)).toEqual(["principle"]);
  });
});

describe("autotest: cada regla falla con datos malos", () => {
  const con = (cambio) => { const d = copia(); cambio(d, d.entities[0]); return problemas(d, { existe, glosario: G }).join("\n"); };
  const rel = (d, f, v, t) => d.relations.find((x) => x.from === f && x.relation === v && x.to === t);

  it("vocabularios cerrados", () => {
    expect(Object.keys(REGISTRIES)).toEqual(["with_registry", "partial", "without_registry"]);
    expect(Object.keys(RELATION_CLASSES)).toEqual(["is_a", "part_of", "parent_of", "reference"]);
    expect(Object.keys(CARDINALITIES)).toEqual(["one_to_one", "one_to_many", "many_to_one", "many_to_many"]);
    expect(con((d, e) => { e.scope = "bridge"; })).toMatch(/scope «bridge» fuera del vocabulario/);
    expect(con((d, e) => { e.level = "N2"; })).toMatch(/level «N2» fuera del vocabulario/);
    expect(con((d, e) => { e.family = "otra"; })).toMatch(/family «otra» fuera del vocabulario/);
    expect(con((d, e) => { e.registry = "casi"; })).toMatch(/registry «casi» fuera del vocabulario/);
    expect(con((d, e) => { e.id_format = "raro"; })).toMatch(/id_format «raro» fuera del vocabulario/);
    expect(con((d, e) => { e.status = "viejo"; })).toMatch(/status «viejo» fuera del vocabulario/);
    expect(con((d, e) => { e.created_by = ["bot"]; })).toMatch(/created_by necesita/);
    expect(con((d, e) => { delete e.level; })).toMatch(/falta el campo level/);
    expect(con((d) => { d.relations[0].relation = "adora"; })).toMatch(/relación fuera del vocabulario/);
    expect(con((d) => { d.relations[0].stored_as = "mágico"; })).toMatch(/stored_as «mágico» fuera del vocabulario/);
    expect(con((d) => { d.relations[0].class = "hermana"; })).toMatch(/class «hermana» fuera del vocabulario/);
    expect(con((d) => { d.relations[0].cardinality = "2:3"; })).toMatch(/cardinality «2:3» fuera del vocabulario/);
    expect(con((d) => { delete d.relations[0].class; })).toMatch(/class «undefined» fuera del vocabulario/);
  });

  it("un meta o una plantilla vertical es una extensión que hay que decir", () => {
    expect(con((d) => { d.entities.find((e) => e.id === "principle").scope = "vertical"; })).toMatch(/principle: un meta no puede ser vertical/);
    expect(con((d) => { d.entities.find((e) => e.id === "mechanism").scope = "vertical"; })).toMatch(/mechanism: un template no puede ser vertical/);
  });

  it("la clase y el verbo tienen que casar, y el hijo de un fondo dice su clase", () => {
    expect(con((d) => { rel(d, "case", "hangs_from", "root-problem").class = "reference"; })).toMatch(/el verbo hangs_from es de la clase parent_of/);
    expect(con((d) => { rel(d, "case", "is_a", "issue").class = "part_of"; })).toMatch(/la clase part_of solo admite los verbos belongs_to, has/);
    expect(con((d) => { rel(d, "norm", "cites", "principle").class = "is_a"; })).toMatch(/la clase is_a solo admite los verbos is_a/);
    expect(con((d) => { delete rel(d, "case", "hangs_from", "root-problem").parent_kind; })).toMatch(/el hijo de un fondo dice su parent_kind/);
    expect(con((d) => { rel(d, "case", "hangs_from", "root-problem").parent_kind = "causa"; })).toMatch(/el hijo de un fondo dice su parent_kind/);
    expect(con((d) => { rel(d, "agent-task", "hangs_from", "agent").parent_kind = "evidence"; })).toMatch(/parent_kind solo va en un hijo de root-problem/);
  });

  it("la contención no da vueltas", () => {
    expect(con((d) => { d.relations.push({ from: "project", relation: "belongs_to", to: "environment", class: "part_of", cardinality: "many_to_one", stored_as: "none" }); })).toMatch(/contención: .* está dentro de sí misma/);
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

  it("role_by_scope solo en las que son de los dos lados", () => {
    expect(con((d, e) => { e.role_by_scope = "Algo."; })).toMatch(/role_by_scope solo va en una entidad both/);
    expect(con((d) => { delete d.entities.find((x) => x.id === "norm").role_by_scope; })).toMatch(/norm: una entidad both dice su role_by_scope/);
    expect(con((d) => { d.entities.find((x) => x.id === "issue").scope = "both"; })).toMatch(/issue: una entidad both dice su role_by_scope/);
    expect(con((d) => { d.entities.find((x) => x.id === "event").role_by_scope = "palabra ".repeat(31); })).toMatch(/role_by_scope vacío o de más de 30 palabras/);
  });

  it("relaciones a una entidad que no existe, retirada, a sí mismas o repetidas", () => {
    expect(con((d) => { d.relations[0].to = "inventada"; })).toMatch(/«inventada» no es una entidad/);
    expect(con((d) => { d.relations[0].to = "judge"; })).toMatch(/«judge» está retirada y no entra en relaciones/);
    expect(con((d) => { d.relations[0].to = d.relations[0].from; })).toMatch(/apunta a sí misma/);
    expect(con((d) => { d.relations.push({ ...d.relations[0] }); })).toMatch(/repetida/);
    expect(con((d) => { d.relations[0].stored_in = ""; })).toMatch(/falta stored_in/);
    expect(con((d) => { delete d.relations[0].stored_in; })).toMatch(/falta stored_in \(obligatorio con field\)/);
    expect(con((d) => { d.relations[0].color = "rojo"; })).toMatch(/campo desconocido color/);
    expect(con((d) => { const x = d.relations.find((y) => y.stored_as === "none"); x.stored_in = "ninguno"; })).toMatch(/centinela/);
    expect(con((d) => { const x = d.relations.find((y) => y.stored_as === "none"); x.stored_in = ""; })).toMatch(/stored_in vacío/);
    expect(con((d) => { d.relations[0].stored_as = "unaudited"; })).toMatch(/unaudited solo vale con una entidad vertical/);
    expect(con((d) => { d.relations.push({ from: "pantry", relation: "uses", to: "recipe", class: "reference", cardinality: "many_to_many", stored_as: "unaudited", stored_in: "sin auditar" }); })).toMatch(/centinela/);
  });

  it("una entidad sin ninguna relación, y una sin lector", () => {
    expect(con((d) => { d.entities.push({ id: "loose", name: "Suelta", scope: "vertical", level: "piece", family: "home", term: null, source_of_truth: "none", id_format: "none", registry: "without_registry", status: "active", created_by: ["human"], readers: ["ops/entidades.json"] }); })).toMatch(/loose: ninguna relación la nombra/);
    expect(con((d, e) => { e.readers = []; })).toMatch(/session: ninguna entidad sin lector/);
    expect(con((d) => { d.entities.find((x) => x.id === "team-member").readers = ["ops/entidades.json"]; })).toMatch(/team-member: ya tiene lector; quítala de SIN_LECTOR/);
    expect(con((d, e) => { e.readers = ["ops/no-existe.mjs"]; })).toMatch(/el lector «ops\/no-existe.mjs» no existe en git/);
    expect(con((d) => { d.event_types[0].readers = ["ops/entidades.json"]; })).toMatch(/ya tiene lector; quítalo de TIPOS_DE_EVENTO_SIN_LECTOR/);
    expect(con((d) => { d.event_types[1].readers = []; })).toMatch(/ninguna cosa sin lector/);
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

  it("campos de más o de menos, y el campo declarado del fondo", () => {
    expect(con((d, e) => { e.color = "rojo"; })).toMatch(/campo desconocido color/);
    expect(con((d, e) => { delete e.id_format; })).toMatch(/falta el campo id_format/);
    expect(con((d) => { d.entities.find((x) => x.id === "root-problem").fields[0].values = ["test"]; })).toMatch(/vocabulario cerrado de dos valores o más/);
    expect(con((d) => { d.entities.find((x) => x.id === "root-problem").fields[0].required_when.value = "otro"; })).toMatch(/required_when nombra un valor que learning_recorded_in no tiene/);
    expect(con((d) => { d.entities.find((x) => x.id === "root-problem").fields[0].name = "Recorded_In"; })).toMatch(/sin la forma snake en inglés/);
  });

  it("ciclo de vida: retirar sin sustituto ni destino, volver a activo, borrar", () => {
    expect(con((d, e) => { e.status = "retired"; })).toMatch(/retired sin replaced_by/);
    expect(con((d, e) => { e.replaced_by = "skill"; })).toMatch(/replaced_by solo va en una entidad retired/);
    expect(con((d) => { d.entities.find((x) => x.id === "judge").becomes = "cosa"; })).toMatch(/becomes «cosa» fuera del vocabulario/);
    expect(con((d) => { delete d.entities.find((x) => x.id === "judge").becomes_in; })).toMatch(/retired sin becomes_in/);
    expect(con((d) => { d.entities.find((x) => x.id === "secret").becomes_types = ["inventado"]; })).toMatch(/becomes type necesita becomes_types/);
    expect(con((d) => { d.entities.find((x) => x.id === "judge").becomes_types = ["clave"]; })).toMatch(/becomes_types solo va con becomes type/);
    expect(con((d) => { d.entities.find((x) => x.id === "judge").readers = ["ops/entidades.json"]; })).toMatch(/una entidad retirada no lleva lectores/);
    expect(Object.keys(BECOMES)).toEqual(["value", "field", "event_type", "type"]);
    const d = copia();
    d.entities = d.entities.filter((e) => e.id !== "session");
    expect(problemasDeVida(d, [{ id: "session", status: "active" }]).join()).toMatch(/session: estaba en el registro y ha desaparecido/);
    expect(problemasDeVida(DATOS, [{ id: "judge", status: "retired" }])).toEqual([]);
    expect(problemasDeVida(DATOS, [{ id: "session", status: "retired" }]).join()).toMatch(/session: estaba retired y vuelve a active/);
  });

  it("proyectos y tipos de evento mal formados", () => {
    expect(con((d) => { d.projects.pop(); })).toMatch(/hoy hay dos/);
    expect(con((d) => { d.projects[0].repos = ["sin-barra"]; })).toMatch(/repos necesita nombres propietario\/repo/);
    expect(con((d) => { d.event_types[0].of = "judge"; })).toMatch(/of «judge» no es una entidad activa/);
    expect(con((d) => { d.event_types[0].fields[0].values = ["uno"]; })).toMatch(/vocabulario cerrado de dos valores o más/);
  });

  it("los tipos de recurso no son libres", () => {
    expect(con((d) => { d.entities.find((x) => x.id === "resource").types = ["clave", "clave"]; })).toMatch(/types necesita ids kebab sin repetir/);
  });
});

describe("los vocabularios del registro están anclados en ops/vocabularios-vida.json", () => {
  it("cada vocabulario de scripts/lib/entidades.mjs está anclado con sus valores", () => {
    const registro = JSON.parse(leer("ops/vocabularios-vida.json")).anclados;
    const actuales = valoresActuales();
    for (const id of ["scope", "level", "family", "creator", "relation_class", "parent_kind", "cardinality", "becomes", "registry", "status", "id_format", "stored_as", "relation", "subject_kind"]) {
      expect(Object.keys(registro[`entidades.${id}`] ?? {}).sort(), id).toEqual(Object.keys(actuales[`entidades.${id}`]).sort());
    }
  });
  it("el eje se retiró entero y su nombre en el glosario es scope", () => {
    const reg = JSON.parse(leer("ops/vocabularios-vida.json"));
    expect(reg.vocabularios_retirados.map((r) => r.vocabulario)).toContain("entidades.axis");
    expect(reg.anclados["entidades.axis"]).toBeUndefined();
    expect(termino(G, "eje").en).toBe("scope");
  });
  it("los valores del JSON salen de esos vocabularios y los sujetos usan solo sus kinds", () => {
    for (const e of DATOS.entities) { expect(e.scope in SCOPES).toBe(true); expect(e.status in STATUSES).toBe(true); expect(e.created_by.every((c) => c in CREATORS)).toBe(true); }
    for (const r of DATOS.relations) { expect(r.relation in RELATIONS).toBe(true); expect(r.stored_as in STORED_AS).toBe(true); }
    for (const v of Object.values(SUJETOS.sujetos)) expect(v.kind in SUBJECT_KINDS).toBe(true);
    expect(Object.keys(SUBJECT_KINDS)).toEqual(["entity", "type_of", "part_of", "instance_of", "produced_by", "outside"]);
  });
});

describe("autotest de los sujetos", () => {
  const ents = DATOS.entities;
  it("falla con un sujeto sin clasificar, uno que ya no existe, una entidad inventada o retirada, o un motivo corto", () => {
    expect(problemasDeSujetos(SUJETOS, ents, [...sujetosUsados(), "nuevo"]).join()).toMatch(/nuevo: sujeto sin clasificar/);
    expect(problemasDeSujetos(SUJETOS, ents, sujetosUsados().slice(1)).join()).toMatch(/ya no es sujeto de ninguna norma/);
    const d = JSON.parse(JSON.stringify(SUJETOS));
    d.sujetos.agente.entity = "inventada";
    expect(problemasDeSujetos(d, ents, sujetosUsados()).join()).toMatch(/agente: «inventada» no es una entidad activa/);
    d.sujetos.agente.entity = "judge";
    expect(problemasDeSujetos(d, ents, sujetosUsados()).join()).toMatch(/agente: «judge» no es una entidad activa/);
    const e = JSON.parse(JSON.stringify(SUJETOS));
    e.sujetos.asset.reason = "corto";
    expect(problemasDeSujetos(e, ents, sujetosUsados()).join()).toMatch(/asset: outside sin motivo escrito/);
    const g = JSON.parse(JSON.stringify(SUJETOS));
    g.sujetos.diff.entity = "pull-request";
    g.sujetos.diff.reason = "";
    expect(problemasDeSujetos(g, ents, sujetosUsados()).join()).toMatch(/diff: part_of sin motivo escrito/);
    const f = JSON.parse(JSON.stringify(SUJETOS));
    f.sujetos.agente.kind = "casi";
    expect(problemasDeSujetos(f, ents, sujetosUsados()).join()).toMatch(/kind «casi» fuera del vocabulario/);
  });
});

describe("autotest de las vistas generadas", () => {
  it("MAPA.md falla si el JSON cambia sin regenerarlo, y la cabecera lleva las cifras", () => {
    const d = copia();
    d.entities.find((e) => e.id === "session").name = "Sesión cambiada";
    expect(mapa(d)).not.toBe(MAPA);
    const d2 = copia();
    d2.relations.pop();
    expect(mapa(d2)).not.toBe(MAPA);
    const act = DATOS.entities.filter((e) => e.status === "active").length;
    expect(MAPA).toContain(`Hoy hay ${act} entidades activas`);
  });
  it("el bloque de SUPER-TABLA.md falla si cambia una entidad", () => {
    const d = copia();
    d.entities.find((e) => e.id === "session").level = "meta";
    expect(bloque(d)).not.toBe(bloque(DATOS));
    expect(bloque(DATOS)).toContain("| `token` | design | piece | vertical | no |");
  });
});
