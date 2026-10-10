/**
 * La ficha de huecos de cada skill (#457, fondo #455): por cada criterio de
 * `ops/forja.json` que se aplica a la skill, un estado del vocabulario de la forja
 * (`ESTADOS_CRITERIO`: cumple, no_cumple, no_aplica, juicio) y, solo en el hueco,
 * una nota. Una skill es un continuo; la ficha la sistematiza con discretos, y
 * corregir es ver qué falla en qué hueco.
 *
 * Un dato en un solo sitio:
 *   - el estado de un criterio con control automático (un fichero en `control`) lo
 *     CALCULA su control cada vez, a partir de los códigos que emiten la higiene y el
 *     nivel 1, la caducidad, el estándar de cada tipo de la plantilla y el glosario.
 *     No se escribe en ningún sitio: escribirlo sería una segunda fuente que se pudre;
 *   - el de un criterio de juicio (`control: juicio`) lo escribe una persona o un
 *     agente en `ops/fichas-skills/<skill>.json`, con su evidencia (una ruta, un caso
 *     o un comando que existen) y, si no se cumple o está pendiente, su nota.
 * La ficha entera se GENERA juntando las dos cosas (`fichaDeSkill`); `npm run
 * higiene-skills` y el informe de cumplimiento la enseñan en líneas
 * `skill: x criterio: y estado: z` (`lineaDeFicha` de forja.mjs), que se pueden contar.
 *
 * Lo vigila `ops/criterios-skills.test.js`. Repo público: las notas dicen qué falla,
 * no cómo saltarse un control.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ESTADOS_CON_NOTA, ESTADOS_CRITERIO, JUICIO, criteriosDeTipo, leerForja, lineaDeFicha } from "./forja.mjs";
import { leerGlosario, medir } from "./glosario.mjs";
import { ctxHigiene, higieneDeSkill, scriptsDeNpm } from "./higieneSkills.mjs";
import { DIR_SKILLS, NIVEL_META, RAIZ, agentesYSkills, cargarSkill, nivelDe, nombresDeSkills, parsearSkill, tiposDeSkill } from "./skills.mjs";
import { faltasDeEstandares } from "./skillsForja.mjs";

export const DIR_FICHAS = "ops/fichas-skills";
export const RUTA_PLANTILLA = ".claude/PLANTILLA-SKILL.md";

/** De dónde sale el estado de una fila de la ficha (vocabulario cerrado). */
export const ORIGENES = {
  control: "Lo calcula el control del criterio (un fichero del repo); no se escribe a mano",
  juicio: "Lo escribe una persona o un agente en la ficha, con su evidencia",
};

/** Los campos de un juicio guardado. */
export const CAMPOS_JUICIO = ["estado", "evidencia", "nota", "fecha", "quien"];
/** En un criterio con control automático solo cabe un matiz (la nota del hueco que el control ya marcó), nunca un estado. */
export const CAMPOS_MATIZ = ["nota", "evidencia"];
/** La nota de un juicio que nadie ha hecho todavía: se cuenta. */
export const NOTA_SIN_EVALUAR = "sin evaluar";
export const MIN_NOTA = 8;
export const MAX_NOTA = 400;
/** Quién puede firmar un juicio, además de los agentes de .claude/agents/. */
export const FIRMANTES_EXTRA = ["sesión", "pablo"];

/** Prefijos de una evidencia que no es una ruta. */
export const PREFIJO_CASO = "caso:";
export const PREFIJO_NPM = "npm run ";

export const esAutomatico = (c) => c.control !== JUICIO;
const plana = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Los criterios que se aplican a una skill: los de su tipo; a la pieza meta (nivel 0), todos los de skill. */
export function criteriosDeSkill(datos, metadata) {
  if (nivelDe(metadata) === NIVEL_META) return datos.criterios.filter((c) => c.aplica_a.includes("skill"));
  return criteriosDeTipo(datos, metadata?.tipo);
}

// ── Lo que calculan los controles ─────────────────────────────────────────

/**
 * Los cálculos de los criterios automáticos que no emiten un código propio. Cada uno
 * recibe las señales de la skill y devuelve { estado, nota }. Un criterio automático
 * sin código y sin cálculo aquí es un hueco: `problemasDeControles` lo dice.
 */
export const CALCULOS_SIN_CODIGO = {
  "vocabulario-canonico": (s) => {
    const n = s.glosario.length;
    if (!n) return { estado: "cumple", nota: null };
    const sinonimos = [...new Set(s.glosario.map((d) => `${d.sinonimo}→${d.canonico}`))].join(", ");
    return { estado: "no_cumple", nota: `${n} sinónimo(s) prohibido(s) en la skill (${sinonimos}); admitidos en ops/glosario-excepciones.json` };
  },
};

/** Los criterios automáticos de skill que ningún cálculo cubre (deberían ser cero). */
export function problemasDeControles(datos) {
  return datos.criterios
    .filter((c) => c.aplica_a.includes("skill") && esAutomatico(c) && typeof c.codigo !== "string" && !(c.id in CALCULOS_SIN_CODIGO))
    .map((c) => `${c.id}: criterio con control ${c.control} y sin código ni cálculo en CALCULOS_SIN_CODIGO: la ficha no puede saber su estado`);
}

/**
 * El estado de un criterio automático para una skill, a partir de sus señales:
 * `defectos` (los de `higieneDeSkill`, que ya trae el nivel 1, la forja y la caducidad),
 * `estandar` (faltas del estándar de su tipo en la plantilla; null en la pieza meta, que
 * no tiene tipo) y `glosario` (sinónimos prohibidos en sus ficheros).
 */
export function estadoDeControl(c, s) {
  if (c.sujeto === "plantilla.tipo") {
    if (s.estandar === null) return { estado: "no_aplica", nota: null };
    const f = s.estandar.filter((x) => x.codigo === c.codigo);
    return f.length ? { estado: "no_cumple", nota: plana(f.map((x) => x.detalle).join("; ")) } : { estado: "cumple", nota: null };
  }
  if (typeof c.codigo === "string") {
    const f = s.defectos.filter((d) => d.codigo === c.codigo);
    return f.length ? { estado: "no_cumple", nota: plana(f.map((d) => d.detalle).join("; ")) } : { estado: "cumple", nota: null };
  }
  const calculo = CALCULOS_SIN_CODIGO[c.id];
  // Sin cálculo, el estado queda pendiente y lo dice; problemasDeControles lo convierte en un test en rojo.
  if (!calculo) return { estado: "juicio", nota: `sin cálculo del control ${c.control}: falta en CALCULOS_SIN_CODIGO` };
  return calculo(s);
}

/** Las señales de todas las skills del repo, de una vez: { nombre: { metadata, defectos, estandar, glosario } }. */
export function senalesDelRepo(raiz = RAIZ, hoy = new Date()) {
  const nombres = nombresDeSkills(raiz);
  const skills = nombres.map((n) => cargarSkill(n, raiz));
  const meta = Object.fromEntries(skills.map((s) => [s.nombre, parsearSkill(s.texto).meta?.metadata ?? {}]));
  const plantilla = readFileSync(join(raiz, RUTA_PLANTILLA), "utf8");
  const estandar = faltasDeEstandares(plantilla, tiposDeSkill(raiz), skills.map((s) => ({ nombre: s.nombre, tipo: meta[s.nombre].tipo, texto: s.texto })));
  const { detalle } = medir(raiz, leerGlosario(raiz));
  const fuera = {};
  for (const s of skills) {
    const m = meta[s.nombre];
    const dir = `${DIR_SKILLS}/${s.nombre}/`;
    fuera[s.nombre] = {
      metadata: m,
      defectos: higieneDeSkill(s, ctxHigiene(s.nombre, raiz, hoy)),
      estandar: nivelDe(m) === NIVEL_META ? null : estandar.filter((x) => x.tipo === m.tipo),
      glosario: detalle.filter((d) => d.ruta.startsWith(dir)),
    };
  }
  return fuera;
}

// ── Los juicios guardados ─────────────────────────────────────────────────

export function rutaDeFicha(nombre) {
  return `${DIR_FICHAS}/${nombre}.json`;
}

/** Las fichas guardadas: { skill: contenido } (las que no son JSON, con { error }). */
export function leerFichas(raiz = RAIZ) {
  const dir = join(raiz, DIR_FICHAS);
  if (!existsSync(dir)) return {};
  const fuera = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    try {
      fuera[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      // a propósito: un JSON roto se devuelve como error y problemasDeFichaGuardada lo dice; no se traga
      fuera[f.replace(/\.json$/, "")] = { error: e.message };
    }
  }
  return fuera;
}

/**
 * El contexto para validar evidencias: `existe(ruta)`, `leer(ruta)`, `casosDe(skill)`
 * (ids de sus casos), `scriptsNpm` y `firmantes`.
 */
export function ctxEvidencia(raiz = RAIZ) {
  const casos = {};
  return {
    existe: (r) => existsSync(join(raiz, r)),
    leer: (r) => readFileSync(join(raiz, r), "utf8"),
    casosDe: (s) => {
      if (!(s in casos)) {
        const ruta = join(raiz, DIR_SKILLS, s, "casos.json");
        casos[s] = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, "utf8")).casos ?? []).map((c) => c.id) : null;
      }
      return casos[s];
    },
    scriptsNpm: scriptsDeNpm(raiz),
    firmantes: [...Object.keys(agentesYSkills(raiz)), ...FIRMANTES_EXTRA],
  };
}

/**
 * Por qué una evidencia no vale (null si vale). Tres formas:
 *   - `caso:<skill>/<id>`: un caso de prueba de esa skill;
 *   - `npm run <script>`: un script de package.json;
 *   - una ruta del repo, con `#Título` opcional de una cabecera de ese Markdown.
 */
export function faltaDeEvidencia(ref, ctx) {
  if (typeof ref !== "string" || !ref.trim()) return "evidencia vacía";
  if (ref.startsWith(PREFIJO_CASO)) {
    const m = ref.slice(PREFIJO_CASO.length).match(/^([\w-]+)\/([\w-]+)$/);
    if (!m) return `«${ref}»: un caso se cita como caso:<skill>/<id>`;
    const ids = ctx.casosDe(m[1]);
    if (!ids) return `«${ref}»: la skill ${m[1]} no tiene casos.json`;
    return ids.includes(m[2]) ? null : `«${ref}»: ${m[1]} no tiene el caso ${m[2]}`;
  }
  if (ref.startsWith(PREFIJO_NPM)) {
    const n = ref.slice(PREFIJO_NPM.length).split(/\s/)[0];
    return ctx.scriptsNpm.includes(n) ? null : `«${ref}»: no hay npm run ${n} en package.json`;
  }
  const [ruta, titulo] = ref.split("#");
  if (/[\s<>*]/.test(ruta) || ruta.startsWith("/") || ruta.includes("..")) return `«${ref}»: no es ni una ruta del repo, ni caso:<skill>/<id>, ni npm run <script>`;
  if (!ctx.existe(ruta)) return `«${ref}»: ${ruta} no existe`;
  if (titulo === undefined) return null;
  const cabeceras = ctx.leer(ruta).replace(/\r\n/g, "\n").split("\n").filter((l) => /^#{1,4} /.test(l)).map((l) => l.replace(/^#+ /, "").trim());
  return cabeceras.includes(titulo.trim()) ? null : `«${ref}»: ${ruta} no tiene la cabecera «${titulo}»`;
}

/**
 * Los errores de la ficha guardada de una skill (lista vacía si está bien).
 * `guardada`: el contenido de ops/fichas-skills/<skill>.json (o undefined);
 * `metadata`: la de la skill; `ctx`: el de `ctxEvidencia` y `hoy`.
 */
export function problemasDeFichaGuardada(nombre, guardada, metadata, datos, ctx) {
  const ruta = rutaDeFicha(nombre);
  if (!guardada) return [`${nombre}: no tiene ficha (${ruta}); toda skill tiene la suya, aunque sea con sus juicios «${NOTA_SIN_EVALUAR}»`];
  if (guardada.error) return [`${ruta}: no es JSON (${guardada.error})`];
  const malos = [];
  for (const k of Object.keys(guardada)) if (!["skill", "juicios"].includes(k)) malos.push(`${ruta}: clave «${k}» no admitida (solo skill y juicios)`);
  if (guardada.skill !== nombre) malos.push(`${ruta}: «skill» es «${guardada.skill}», no ${nombre}`);
  const juicios = guardada.juicios;
  if (!juicios || typeof juicios !== "object" || Array.isArray(juicios)) return [...malos, `${ruta}: «juicios» es un objeto criterio → juicio`];
  const aplicables = criteriosDeSkill(datos, metadata);
  const porId = new Map(datos.criterios.map((c) => [c.id, c]));
  for (const c of aplicables.filter((x) => !esAutomatico(x))) {
    if (!(c.id in juicios)) malos.push(`${ruta}: falta el criterio de juicio «${c.id}»; si nadie lo ha juzgado, { "estado": "juicio", "nota": "${NOTA_SIN_EVALUAR}" }`);
  }
  for (const [id, j] of Object.entries(juicios)) {
    const d = `${ruta}: ${id}`;
    const c = porId.get(id);
    if (!c) { malos.push(`${d}: no es un criterio de ops/forja.json`); continue; }
    if (!aplicables.includes(c)) { malos.push(`${d}: no se aplica a esta skill (su tipo o su nivel)`); continue; }
    if (!j || typeof j !== "object" || Array.isArray(j)) { malos.push(`${d}: es un objeto`); continue; }
    if (esAutomatico(c)) {
      // El estado de un criterio automático lo da su control: escribirlo sería otra fuente, y podría contradecirle.
      if ("estado" in j) malos.push(`${d}: lo vigila ${c.control}; su estado lo calcula el control y no se escribe a mano`);
      for (const k of Object.keys(j)) if (!CAMPOS_MATIZ.includes(k) && k !== "estado") malos.push(`${d}: en un criterio automático solo cabe ${CAMPOS_MATIZ.join(" o ")} (un matiz del control)`);
      malos.push(...problemasDeNota(d, j.nota, false), ...problemasDeEvidencias(d, j.evidencia, ctx, false));
      continue;
    }
    for (const k of Object.keys(j)) if (!CAMPOS_JUICIO.includes(k)) malos.push(`${d}: campo «${k}» no admitido (${CAMPOS_JUICIO.join(", ")})`);
    if (!(j.estado in ESTADOS_CRITERIO)) { malos.push(`${d}: estado «${j.estado}» no está en el vocabulario de la forja (${Object.keys(ESTADOS_CRITERIO).join(", ")})`); continue; }
    const conNota = ESTADOS_CON_NOTA.includes(j.estado);
    if (conNota) malos.push(...problemasDeNota(d, j.nota, true));
    else if ("nota" in j) malos.push(`${d}: la nota solo va con ${ESTADOS_CON_NOTA.join(" o ")} (el hueco); con ${j.estado}, la evidencia basta`);
    // Lo juzgado (cumple, no_cumple, no_aplica) se apoya en algo que otro puede mirar; lo pendiente, no hace falta.
    malos.push(...problemasDeEvidencias(d, j.evidencia, ctx, j.estado !== "juicio"));
    if (j.estado !== "juicio" || "fecha" in j) {
      if (!FECHA.test(j.fecha ?? "") || Number.isNaN(Date.parse(`${j.fecha}T00:00:00Z`))) malos.push(`${d}: «fecha» AAAA-MM-DD del juicio`);
      else if (Date.parse(`${j.fecha}T00:00:00Z`) > (ctx.hoy ?? new Date()).getTime() + 86_400_000) malos.push(`${d}: la fecha ${j.fecha} es futura`);
    }
    if (j.estado !== "juicio" || "quien" in j) {
      if (!ctx.firmantes.includes(j.quien)) malos.push(`${d}: «quien» es un agente de .claude/agents/ o ${FIRMANTES_EXTRA.join(" o ")}, no «${j.quien}»`);
    }
  }
  return malos;
}

function problemasDeNota(d, nota, obligatoria) {
  if (nota === undefined) return obligatoria ? [`${d}: lleva «nota» (el hueco: qué falta o por qué no se cumple)`] : [];
  if (typeof nota !== "string" || plana(nota).length < MIN_NOTA) return [`${d}: la nota es un texto de ${MIN_NOTA} caracteres o más`];
  if (/\n/.test(nota) || nota.length > MAX_NOTA) return [`${d}: la nota es una línea de ${MAX_NOTA} caracteres como mucho`];
  return [];
}

function problemasDeEvidencias(d, ev, ctx, obligatoria) {
  if (ev === undefined) return obligatoria ? [`${d}: lleva «evidencia»: una lista con una ruta, un caso (caso:<skill>/<id>) o un comando (npm run …) que existen`] : [];
  if (!Array.isArray(ev) || !ev.length) return [`${d}: «evidencia» es una lista con al menos una referencia`];
  return ev.map((r) => faltaDeEvidencia(r, ctx)).filter(Boolean).map((m) => `${d}: ${m}`);
}

// ── La ficha generada ─────────────────────────────────────────────────────

/**
 * La ficha entera de una skill: una fila por criterio que se le aplica, en el orden del
 * catálogo: { criterio, capa, control, origen, estado, nota, evidencia }.
 */
export function fichaDeSkill(nombre, senales, guardada, datos) {
  const juicios = guardada?.juicios ?? {};
  return criteriosDeSkill(datos, senales.metadata).map((c) => {
    const j = juicios[c.id] ?? null;
    if (esAutomatico(c)) {
      const r = estadoDeControl(c, senales);
      const nota = r.estado === "no_cumple" ? [r.nota, j?.nota].filter(Boolean).join(" — matiz: ") || null : null;
      return { criterio: c.id, capa: c.capa, control: c.control, origen: "control", estado: r.estado, nota, evidencia: j?.evidencia ?? [] };
    }
    if (!j) return { criterio: c.id, capa: c.capa, control: c.control, origen: "juicio", estado: "juicio", nota: `sin ficha (${rutaDeFicha(nombre)})`, evidencia: [] };
    return { criterio: c.id, capa: c.capa, control: c.control, origen: "juicio", estado: j.estado, nota: j.nota ?? null, evidencia: j.evidencia ?? [] };
  });
}

/** Las líneas contables de una ficha: `skill: x criterio: y estado: z [nota: …]`. */
export function lineasDeFicha(nombre, filas, { estados } = {}) {
  return filas
    .filter((f) => !estados || estados.includes(f.estado))
    .map((f) => lineaDeFicha({ artefacto: "skill", nombre, criterio: f.criterio, estado: f.estado, nota: ESTADOS_CON_NOTA.includes(f.estado) ? plana(f.nota) : null }));
}

/** Cifras de una ficha: cuántos criterios, cuántos vigila un control y cuántos son de juicio, y cuántos en cada estado. */
export function cifrasDeFicha(filas) {
  const c = { criterios: filas.length, vigilados: 0, de_juicio: 0, juzgados: 0 };
  for (const e of Object.keys(ESTADOS_CRITERIO)) c[e] = 0;
  for (const f of filas) {
    c[f.origen === "control" ? "vigilados" : "de_juicio"]++;
    if (f.origen === "juicio" && f.estado !== "juicio") c.juzgados++;
    c[f.estado]++;
  }
  return c;
}

/** La línea de cifras de una skill, para contarla. */
export function lineaDeCifras(nombre, c) {
  return `fichas skill: ${nombre} criterios: ${c.criterios} vigilados: ${c.vigilados} de_juicio: ${c.de_juicio} juzgados: ${c.juzgados} cumple: ${c.cumple} no_cumple: ${c.no_cumple} no_aplica: ${c.no_aplica} juicio: ${c.juicio}`;
}

/** Suma las cifras de varias skills. */
export function sumarCifras(lista) {
  const t = {};
  for (const c of lista) for (const [k, v] of Object.entries(c)) t[k] = (t[k] ?? 0) + v;
  return t;
}

/** La frase del conjunto. */
export function lineaDelConjunto(n, t) {
  return `Fichas: ${n} skills, ${t.criterios ?? 0} criterios aplicados: ${t.vigilados ?? 0} vigilados por un control y ${t.de_juicio ?? 0} de juicio (${t.juzgados ?? 0} juzgados, ${t.juicio ?? 0} sin juzgar); cumple ${t.cumple ?? 0}, no_cumple ${t.no_cumple ?? 0}, no_aplica ${t.no_aplica ?? 0}.`;
}

/** Las fichas de todas las skills del repo: [{ nombre, filas, cifras }]. */
export function fichasDelRepo(raiz = RAIZ, hoy = new Date(), { senales = senalesDelRepo(raiz, hoy), guardadas = leerFichas(raiz), datos = leerForja(raiz) } = {}) {
  return Object.entries(senales).map(([nombre, s]) => {
    const filas = fichaDeSkill(nombre, s, guardadas[nombre], datos);
    return { nombre, filas, cifras: cifrasDeFicha(filas) };
  });
}
