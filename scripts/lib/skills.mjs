/**
 * Las skills de `.claude/skills/` y sus dos niveles de prueba (#336).
 *
 * Nivel 1 (gratis, en el CI: `.claude/skills.test.js`): la forma. Tipo de un
 * vocabulario cerrado, dueño, fecha de «comprobado» bien puesta, secciones de
 * su tipo, tamaño, rutas citadas que existen, nada copiado entre skills y sus
 * casos de prueba. Cada regla es una función pura que devuelve faltas con un
 * nombre de `REGLAS`: el test las ve fallar una a una con skills de mentira.
 *
 * Nivel 2 (cuesta tokens, `npm run skills-prueba -- <skill>`): ejecuta los
 * casos y el test de disparo. Lo que no necesita la API (prompts, lectura de
 * respuestas, comparación con la pasada anterior) vive aquí, con su test en
 * `scripts/skills-prueba.test.js`.
 *
 * La plantilla que explica todo esto a una persona: `.claude/PLANTILLA-SKILL.md`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DIR_SKILLS = ".claude/skills";

// ── Vocabulario ───────────────────────────────────────────────────────────

/**
 * Los ocho tipos salen de `ops/flujo.json` (`tipos_skill`), que es el catálogo
 * del flujo: una sola fuente. Aquí solo se leen.
 */
export function tiposDeFlujo(raiz = RAIZ) {
  const datos = JSON.parse(readFileSync(join(raiz, "ops/flujo.json"), "utf8"));
  return datos.tipos_skill.map((t) => t.id);
}

/** Las siete de siempre: el tipo herramienta no cambia (compatibilidad con las skills de antes de #336). */
export const SECCIONES_HERRAMIENTA = [
  "Qué es y dónde",
  "Claves y accesos",
  "Operaciones habituales",
  "Lo que falló y por qué",
  "Qué requiere el OK de Pablo",
  "Coste y límites",
  "Fuentes y comprobación",
];

/** Lo común a los tipos nuevos: cabeza y cola. En medio, lo de cada tipo. */
const CABEZA = ["Cuándo y para qué", "Método"];
const COLA = ["Lo que falló y por qué", "Registro de cambios", "Fuentes y comprobación"];

/** Secciones obligatorias, en orden, de cada tipo. Las claves tienen que ser las de `ops/flujo.json`. */
export const SECCIONES_POR_TIPO = {
  herramienta: SECCIONES_HERRAMIENTA,
  oficio: [...CABEZA, "Técnicas", "Ejemplo resuelto", ...COLA],
  dominio: [...CABEZA, "Lo que hay que saber", "Dónde vive el dato", ...COLA],
  estandar: [...CABEZA, "La norma", "Bien y mal", ...COLA],
  receta_cambio: [...CABEZA, "Antes de empezar", "Cómo se comprueba", "Qué requiere el OK de Pablo", ...COLA],
  rubrica_juez: [...CABEZA, "Qué mira", "Cómo puntúa", "Ejemplos calibrados", ...COLA],
  investigacion: [...CABEZA, "Pregunta y alcance", "Dónde buscar", "Cómo se destila", ...COLA],
  meta: [...CABEZA, "Cómo se prueba", "Cuándo se poda", ...COLA],
};

/** Las reglas del nivel 1. Cada falta lleva una de estas claves: se pueden contar. */
export const REGLAS = {
  frontmatter: "name igual a la carpeta, description que enruta («Úsala …», «No para:»), y solo name, description y metadata",
  tipo: "metadata.tipo es uno de los ocho de ops/flujo.json",
  dueno: "metadata.dueno es un agente de .claude/agents/ que la carga en su `skills:`",
  comprobado: "metadata.comprobado es una fecha AAAA-MM-DD, no futura, y el texto dice qué se comprobó ese día",
  caducada: "una skill que toca el PR no tiene su comprobado de hace más de PLAZO_COMPROBADO_DIAS (lo mira scripts/skills-pr.mjs, no npm test)",
  secciones: "las secciones de su tipo, en orden y ninguna vacía",
  formato: "tabla de operaciones, fallos con fecha, causa y arreglo, registro de cambios fechado y última línea de comprobación",
  tamano: "SKILL.md de MAX_LINEAS líneas como mucho; el detalle va a ficheros aparte",
  secretos: "ningún patrón de clave ni cadena de conexión con contraseña",
  rutas: "todo fichero citado (del repo o de la carpeta de la skill) existe",
  estructura: "en la carpeta solo SKILL.md, casos.json y las subcarpetas de capas, y todo fichero de capa citado desde SKILL.md",
  copiado: "ningún párrafo largo idéntico en dos skills: el saber vive en una y la otra la cita",
  casos: "casos.json válido, con al menos MIN_CASOS casos: MIN_PROPIOS que cargan esta skill y MIN_FRONTERA que cargan otra o ninguna",
};

export const CABECERA_OPERACIONES = "| Qué | Comando | Debe salir |";
export const MAX_DESCRIPCION = 600;

/**
 * Tope de líneas de SKILL.md (carga por capas: lo que se lee siempre, corto; el
 * detalle, en `referencias/`, `tecnicas/`, `scripts/` o `plantillas/`). 220 es
 * el tope que ya tenían los runbooks (#219); con las capas, `hetzner` deja de
 * necesitar su excepción de 260. No se sube: se parte.
 */
export const MAX_LINEAS = 220;

/**
 * Plazo de la fecha de «comprobado»: 90 días. Por qué ese número:
 * - es la ventana máxima de observación de un fondo (#337): un trimestre es lo
 *   que esta casa ya da por bueno para decir «sigue funcionando»;
 * - es la vida de los tokens que caducan antes (Vercel Vigía, a 90 días);
 * - y los proveedores cambian más deprisa que eso de vez en cuando (Hetzner
 *   subió precios en abril y en junio de 2026): con 180 días una skill podría
 *   haberse perdido dos cambios sin que nada avisara.
 * Volver a comprobar no exige reescribir: se repasa, se prueba lo que se pueda
 * y se pone la fecha con su línea «Comprobado el …».
 *
 * La caducidad NO va en `npm test`: una regla de reloj pondría en rojo todos los
 * PR a la vez, también los que no tocan ninguna skill, y una regla que bloquea
 * lo que no tiene que ver acaba saltándose. Va en tres sitios:
 * - `scripts/skills-pr.mjs`, paso «Skills del PR» del CI: falla solo si el PR
 *   toca una skill caducada (quien la toca la vuelve a comprobar);
 * - el test del nivel 1 y `node scripts/skills-pr.mjs` sin lista: avisan, no fallan;
 * - la medición semanal (`npm run planos`, medidor `skills_caducadas_o_proximas`):
 *   las caducadas y las que caducan en AVISO_ANTES_DIAS, para verlas venir.
 */
export const PLAZO_COMPROBADO_DIAS = 90;
export const AVISO_ANTES_DIAS = 14;
/** Estados de caducidad (vocabulario cerrado). */
export const ESTADOS_CADUCIDAD = ["vigente", "proxima", "caducada", "sin_fecha"];

export const MIN_CASOS = 4;
export const MIN_PROPIOS = 3;
export const MIN_FRONTERA = 1;
/** Un caso de frontera que no debe cargar ninguna skill. */
export const NINGUNA = "ninguna";

/**
 * Un párrafo de este tamaño o más (unas dos líneas), idéntico en dos skills, es
 * saber copiado. Medido el 9 oct 2026: con las ocho skills, ningún par repetido
 * ni bajando a 60; lo más corto (un comando, una frase que cita otra skill) sí
 * puede repetirse.
 */
export const MIN_PARRAFO_COPIADO = 120;

/** Subcarpetas de la carga por capas (la estructura común de la plantilla). */
export const CAPAS = ["referencias", "tecnicas", "scripts", "plantillas"];
export const FICHEROS_FIJOS = ["SKILL.md", "casos.json"];

// Patrones de secretos que no deben aparecer nunca en una skill.
export const SECRETOS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\./,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@]{3,}@/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Rutas del repo citadas entre comillas invertidas. */
const RUTA_CITADA = /`((?:\.claude|\.github|ops|supabase|docs|specs|src|scripts|api)\/[\w./-]+\.(?:md|js|mjs|jsx|json|yml|yaml|sql|sh|txt))`/g;

// ── Lectura ───────────────────────────────────────────────────────────────

/**
 * Frontmatter de una skill: claves de primer nivel y, debajo de `metadata:`,
 * las suyas con dos espacios. No es YAML entero a propósito: lo que no casa
 * con esta forma no se lee, y el test lo da por ausente.
 */
// Un valor YAML entre comillas ("2026-10-09") es la misma cadena sin ellas.
const sinComillas = (v) => v.replace(/^(["'])(.*)\1$/, "$2");

export function parsearSkill(texto) {
  const t = String(texto).replace(/\r\n/g, "\n");
  const m = t.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: null, cuerpo: t, texto: t };
  const meta = {};
  let dentro = null;
  for (const linea of m[1].split("\n")) {
    const hijo = linea.match(/^ {2}(\w+):\s*(.*)$/);
    if (hijo && dentro) { meta[dentro][hijo[1]] = sinComillas(hijo[2].trim()); continue; }
    const top = linea.match(/^(\w+):\s*(.*)$/);
    if (!top) { dentro = null; continue; }
    if (top[2].trim() === "") { meta[top[1]] = {}; dentro = top[1]; } else { meta[top[1]] = top[2].trim(); dentro = null; }
  }
  return { meta, cuerpo: m[2], texto: t };
}

/** El texto de una sección `## Título`, hasta la siguiente. */
export function seccion(cuerpo, titulo) {
  const partes = cuerpo.split(/^## (.+)$/m);
  const i = partes.findIndex((p, n) => n % 2 === 1 && p.trim() === titulo);
  return i === -1 ? "" : partes[i + 1];
}

/** Las entradas `- ...` de una lista, cada una con sus líneas de continuación. */
export function entradas(texto) {
  return texto.split(/^(?=- )/m).filter((e) => e.startsWith("- "));
}

/** Todos los ficheros de una carpeta, relativos a ella y con «/». */
function ficherosDe(dir, base = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const abs = join(dir, n);
    const rel = base ? `${base}/${n}` : n;
    return statSync(abs).isDirectory() ? ficherosDe(abs, rel) : [rel];
  });
}

/** Una skill tal como la ve el nivel 1: { nombre, texto, ficheros, extra: {ruta: texto}, casos }. */
export function cargarSkill(nombre, raiz = RAIZ) {
  const dir = join(raiz, DIR_SKILLS, nombre);
  const ficheros = ficherosDe(dir);
  const texto = existsSync(join(dir, "SKILL.md")) ? readFileSync(join(dir, "SKILL.md"), "utf8") : "";
  const extra = {};
  for (const f of ficheros) if (f !== "SKILL.md" && f.endsWith(".md")) extra[f] = readFileSync(join(dir, f), "utf8");
  let casos = null;
  if (existsSync(join(dir, "casos.json"))) {
    try { casos = JSON.parse(readFileSync(join(dir, "casos.json"), "utf8")); } catch (e) { casos = { error: e.message }; }
  }
  return { nombre, texto, ficheros, extra, casos };
}

export function nombresDeSkills(raiz = RAIZ) {
  const dir = join(raiz, DIR_SKILLS);
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

/** { agente: [skills que carga] } de `.claude/agents/*.md`. */
export function agentesYSkills(raiz = RAIZ) {
  const dir = join(raiz, ".claude/agents");
  const fuera = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const t = readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n");
    const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const nombre = fm.match(/^name:\s*(\S+)/m)?.[1] ?? f.replace(/\.md$/, "");
    const lista = fm.match(/^skills:\s*\[([^\]]*)\]/m)?.[1] ?? "";
    fuera[nombre] = lista.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return fuera;
}

/** Todo lo que el nivel 1 necesita saber del repo, de una vez. */
export function cargarContexto(raiz = RAIZ, hoy = new Date()) {
  const nombres = nombresDeSkills(raiz);
  return {
    hoy,
    tipos: tiposDeFlujo(raiz),
    agentes: agentesYSkills(raiz),
    skills: nombres,
    existe: (ruta) => existsSync(join(raiz, ruta)),
  };
}

// ── Nivel 1: las reglas ──────────────────────────────────────────────────

const falta = (regla, detalle) => ({ regla, detalle });
const DIA_MS = 86_400_000;

function reglaFrontmatter(nombre, meta) {
  if (!meta) return [falta("frontmatter", "sin frontmatter entre ---")];
  const f = [];
  const sobran = Object.keys(meta).filter((k) => !["name", "description", "metadata"].includes(k));
  if (sobran.length) f.push(falta("frontmatter", `claves que no van: ${sobran.join(", ")}`));
  if (meta.name !== nombre) f.push(falta("frontmatter", `name «${meta.name}» no es el de la carpeta (${nombre})`));
  const d = typeof meta.description === "string" ? meta.description : "";
  if (!/^Úsala /.test(d)) f.push(falta("frontmatter", "la descripción no empieza por «Úsala »"));
  if (!/No para:/.test(d)) f.push(falta("frontmatter", "la descripción no dice «No para:»"));
  if (d.length <= 80 || d.length > MAX_DESCRIPCION) f.push(falta("frontmatter", `la descripción tiene ${d.length} caracteres (entre 81 y ${MAX_DESCRIPCION})`));
  if (typeof meta.metadata !== "object") f.push(falta("frontmatter", "falta el bloque metadata (tipo, dueno, comprobado)"));
  return f;
}

function reglaTipo(m, ctx) {
  if (!m.tipo) return [falta("tipo", "falta metadata.tipo")];
  if (!ctx.tipos.includes(m.tipo) || !(m.tipo in SECCIONES_POR_TIPO)) return [falta("tipo", `«${m.tipo}» no es ninguno de: ${ctx.tipos.join(", ")}`)];
  return [];
}

function reglaDueno(nombre, m, ctx) {
  if (!m.dueno) return [falta("dueno", "falta metadata.dueno")];
  if (!(m.dueno in ctx.agentes)) return [falta("dueno", `«${m.dueno}» no es un agente de .claude/agents/`)];
  if (!ctx.agentes[m.dueno].includes(nombre)) return [falta("dueno", `${m.dueno} no la carga en su «skills:»`)];
  return [];
}

function reglaComprobado(m, texto, ctx) {
  const c = m.comprobado;
  if (!c) return [falta("comprobado", "falta metadata.comprobado")];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c) || Number.isNaN(Date.parse(`${c}T00:00:00Z`))) return [falta("comprobado", `«${c}» no es una fecha AAAA-MM-DD`)];
  const dias = Math.floor((ctx.hoy.getTime() - Date.parse(`${c}T00:00:00Z`)) / DIA_MS);
  const f = [];
  if (dias < -1) f.push(falta("comprobado", `${c} es futura`));
  if (!texto.includes(`Comprobado el ${c}`)) f.push(falta("comprobado", `el texto no dice «Comprobado el ${c}: …» (qué se comprobó ese día)`));
  return f;
}

function reglaSecciones(cuerpo, tipo) {
  const quiero = SECCIONES_POR_TIPO[tipo];
  if (!quiero) return [];
  const f = [];
  if (!/^# \S.*$/m.test(cuerpo)) f.push(falta("secciones", "falta el título «# …»"));
  const titulos = [...cuerpo.matchAll(/^## (.+)$/gm)].map((x) => x[1].trim());
  if (JSON.stringify(titulos) !== JSON.stringify(quiero)) f.push(falta("secciones", `secciones [${titulos.join(" · ")}]; su tipo pide [${quiero.join(" · ")}]`));
  for (const s of quiero) if (seccion(cuerpo, s).trim().length <= 30) f.push(falta("secciones", `«${s}» vacía o casi`));
  return f;
}

function reglaFormato(cuerpo, texto, tipo) {
  const f = [];
  if (tipo === "herramienta") {
    const op = seccion(cuerpo, "Operaciones habituales");
    if (!op.includes(CABECERA_OPERACIONES)) f.push(falta("formato", `«Operaciones habituales» sin la tabla ${CABECERA_OPERACIONES}`));
    const filas = op.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|---") && l !== CABECERA_OPERACIONES);
    if (!filas.length) f.push(falta("formato", "la tabla de operaciones no tiene filas"));
    for (const fila of filas) {
      // Una celda vacía en «Debe salir» es una operación sin comprobación.
      const celdas = fila.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
      if (celdas.length !== 3 || !celdas.every(Boolean)) f.push(falta("formato", `fila de operación incompleta: ${fila.slice(0, 60)}`));
    }
    if (!entradas(seccion(cuerpo, "Qué requiere el OK de Pablo")).length) f.push(falta("formato", "«Qué requiere el OK de Pablo» sin ninguna entrada"));
  }
  const fallos = entradas(seccion(cuerpo, "Lo que falló y por qué"));
  // Una herramienta estrena su runbook con su primera lección; los demás tipos pueden empezar sin.
  if (tipo === "herramienta" && !fallos.length) f.push(falta("formato", "«Lo que falló y por qué» sin ninguna entrada"));
  for (const e of fallos) {
    const ok = /^- \*\*\d{4}-\d{2}(?:-\d{2})? · [^*]+\*\*/.test(e) && /Causa:/.test(e) && /Arreglo:/.test(e);
    if (!ok) f.push(falta("formato", `fallo sin «**AAAA-MM-DD · síntoma**», «Causa:» o «Arreglo:»: ${e.slice(0, 60)}`));
  }
  if (SECCIONES_POR_TIPO[tipo]?.includes("Registro de cambios")) {
    const cambios = entradas(seccion(cuerpo, "Registro de cambios"));
    if (!cambios.length) f.push(falta("formato", "«Registro de cambios» sin ninguna entrada"));
    for (const e of cambios) if (!/^- \*\*\d{4}-\d{2}-\d{2}\*\* · \S/.test(e)) f.push(falta("formato", `cambio sin «**AAAA-MM-DD** · qué»: ${e.slice(0, 60)}`));
  }
  const ultima = texto.trim().split("\n").pop();
  if (!/^(Comprobado el \d{4}-\d{2}-\d{2}|Sin comprobar): \S/.test(ultima)) f.push(falta("formato", "la última línea no es «Comprobado el AAAA-MM-DD: …» ni «Sin comprobar: …»"));
  return f;
}

/** Las rutas citadas en un texto (de cualquier fichero de la skill). */
export function rutasCitadas(texto) {
  return [...new Set([...String(texto).matchAll(RUTA_CITADA)].map((x) => x[1]))];
}

function reglaRutasYEstructura(skill, ctx) {
  const f = [];
  const textos = [skill.texto, ...Object.values(skill.extra ?? {})];
  for (const r of new Set(textos.flatMap(rutasCitadas))) if (!ctx.existe(r)) f.push(falta("rutas", `cita ${r}, que no existe`));
  const base = `${DIR_SKILLS}/${skill.nombre}/`;
  const citadasEnSkill = rutasCitadas(skill.texto);
  for (const fichero of skill.ficheros ?? []) {
    if (FICHEROS_FIJOS.includes(fichero)) continue;
    const capa = fichero.split("/")[0];
    if (!fichero.includes("/") || !CAPAS.includes(capa)) {
      f.push(falta("estructura", `${fichero}: fuera de sitio (solo ${FICHEROS_FIJOS.join(", ")} y ${CAPAS.map((c) => `${c}/`).join(", ")})`));
      continue;
    }
    // Una capa que SKILL.md no cita no la abre nadie.
    if (!citadasEnSkill.includes(base + fichero)) f.push(falta("estructura", `${fichero}: SKILL.md no lo cita como \`${base}${fichero}\``));
  }
  return f;
}

/** Errores de forma de un casos.json; lista vacía si está bien. */
export function faltasDeCasos(casos, nombre, skillsConocidas) {
  if (casos == null) return [falta("casos", "falta casos.json")];
  if (casos.error) return [falta("casos", `casos.json no es JSON: ${casos.error}`)];
  const f = [];
  if (casos.skill !== nombre) f.push(falta("casos", `«skill» del fichero es «${casos.skill}», no ${nombre}`));
  const lista = Array.isArray(casos.casos) ? casos.casos : [];
  if (!Array.isArray(casos.casos)) f.push(falta("casos", "falta la lista «casos»"));
  const ids = new Set();
  for (const c of lista) {
    const id = c?.id ?? "(sin id)";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c?.id ?? "")) f.push(falta("casos", `${id}: id en minúsculas con guiones`));
    if (ids.has(id)) f.push(falta("casos", `${id}: id repetido`));
    ids.add(id);
    const sobran = Object.keys(c ?? {}).filter((k) => !["id", "peticion", "skill", "debe_salir", "nota"].includes(k));
    if (sobran.length) f.push(falta("casos", `${id}: campos que no van: ${sobran.join(", ")}`));
    if (typeof c?.peticion !== "string" || c.peticion.trim().length < 15) f.push(falta("casos", `${id}: «peticion» de 15 caracteres o más`));
    if (c?.skill !== NINGUNA && !skillsConocidas.includes(c?.skill)) f.push(falta("casos", `${id}: skill «${c?.skill}» no existe (o «${NINGUNA}»)`));
    if (c?.skill === nombre) {
      const d = c.debe_salir;
      if (!Array.isArray(d) || !d.length || !d.every((x) => typeof x === "string" && x.trim().length >= 10)) f.push(falta("casos", `${id}: «debe_salir», una lista de comprobaciones de 10 caracteres o más`));
    } else if (c?.debe_salir !== undefined && !Array.isArray(c.debe_salir)) f.push(falta("casos", `${id}: «debe_salir» es una lista`));
  }
  const propios = lista.filter((c) => c?.skill === nombre).length;
  const frontera = lista.length - propios;
  if (lista.length < MIN_CASOS) f.push(falta("casos", `${lista.length} casos; hacen falta ${MIN_CASOS}`));
  if (propios < MIN_PROPIOS) f.push(falta("casos", `${propios} casos que cargan ${nombre}; hacen falta ${MIN_PROPIOS}`));
  if (frontera < MIN_FRONTERA) f.push(falta("casos", `${frontera} de frontera (cargan otra skill o «${NINGUNA}»); hace falta ${MIN_FRONTERA}`));
  return f;
}

/** Las faltas de una skill sola (todo menos «copiado», que mira el conjunto). */
export function faltasDeSkill(skill, ctx) {
  const { meta, cuerpo, texto } = parsearSkill(skill.texto);
  const f = [...reglaFrontmatter(skill.nombre, meta)];
  const m = typeof meta?.metadata === "object" ? meta.metadata : {};
  f.push(...reglaTipo(m, ctx), ...reglaDueno(skill.nombre, m, ctx), ...reglaComprobado(m, texto, ctx));
  const tipo = m.tipo in SECCIONES_POR_TIPO ? m.tipo : "herramienta";
  f.push(...reglaSecciones(cuerpo, tipo), ...reglaFormato(cuerpo, texto, tipo));
  const lineas = texto.split("\n").length;
  if (lineas > MAX_LINEAS) f.push(falta("tamano", `${lineas} líneas; el tope es ${MAX_LINEAS}: mueve el detalle a referencias/`));
  for (const t of [texto, ...Object.values(skill.extra ?? {})]) for (const p of SECRETOS) if (p.test(t)) f.push(falta("secretos", String(p)));
  f.push(...reglaRutasYEstructura(skill, ctx));
  f.push(...faltasDeCasos(skill.casos, skill.nombre, ctx.skills));
  return f;
}

/** Párrafos (bloques separados por una línea en blanco, o entradas de lista), normalizados. */
export function parrafos(texto) {
  return String(texto).replace(/\r\n/g, "\n").split(/\n\s*\n|\n(?=- )/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= MIN_PARRAFO_COPIADO);
}

/** Párrafos largos idénticos en dos skills distintas: [{ regla, detalle, skills: [a, b] }]. */
export function faltasDeCopiado(skills) {
  const visto = new Map();
  const f = [];
  for (const s of skills) {
    const propios = new Set([s.texto, ...Object.values(s.extra ?? {})].flatMap(parrafos));
    for (const p of propios) {
      const otra = visto.get(p);
      if (otra && otra !== s.nombre) f.push({ ...falta("copiado", `${otra} y ${s.nombre} repiten: «${p.slice(0, 70)}…»`), skills: [otra, s.nombre] });
      else visto.set(p, s.nombre);
    }
  }
  return f;
}

/** El nivel 1 entero sobre el repo: { nombre: [faltas] }. */
export function nivel1(raiz = RAIZ, hoy = new Date()) {
  const ctx = cargarContexto(raiz, hoy);
  const skills = ctx.skills.map((n) => cargarSkill(n, raiz));
  const fuera = Object.fromEntries(skills.map((s) => [s.nombre, faltasDeSkill(s, ctx)]));
  for (const c of faltasDeCopiado(skills)) for (const n of c.skills) fuera[n].push(c);
  return fuera;
}

// ── Caducidad: en el PR que toca la skill y en la medición semanal ───────

/** { comprobado, dias, estado } de un texto de SKILL.md a una fecha. */
export function caducidad(textoSkill, hoy = new Date()) {
  const c = parsearSkill(textoSkill).meta?.metadata?.comprobado;
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(c ?? "") ? Date.parse(`${c}T00:00:00Z`) : NaN;
  if (Number.isNaN(ms)) return { comprobado: c ?? null, dias: null, estado: "sin_fecha" };
  const dias = Math.floor((hoy.getTime() - ms) / DIA_MS);
  const estado = dias > PLAZO_COMPROBADO_DIAS ? "caducada" : dias > PLAZO_COMPROBADO_DIAS - AVISO_ANTES_DIAS ? "proxima" : "vigente";
  return { comprobado: c, dias, estado };
}

/** La caducidad de todas las skills del repo: [{ nombre, comprobado, dias, estado }]. */
export function caducidades(raiz = RAIZ, hoy = new Date()) {
  return nombresDeSkills(raiz).map((nombre) => ({ nombre, ...caducidad(readFileSync(join(raiz, DIR_SKILLS, nombre, "SKILL.md"), "utf8"), hoy) }));
}

/** Las skills cuya carpeta toca una lista de ficheros cambiados. */
export function skillsTocadas(ficheros) {
  const fuera = new Set();
  for (const f of ficheros) {
    const m = String(f).trim().replace(/\\/g, "/").match(/^\.claude\/skills\/([^/]+)\//);
    if (m) fuera.add(m[1]);
  }
  return [...fuera].sort();
}

/**
 * El paso «Skills del PR»: falla (regla `caducada`) solo si el PR toca una
 * skill caducada o sin fecha. Las que no toca no cuentan: no son suyas.
 * { ok, tocadas, faltas: [{ regla, detalle }] }
 */
export function comprobarSkillsPr(ficheros, estados) {
  const tocadas = skillsTocadas(ficheros);
  const porNombre = new Map(estados.map((e) => [e.nombre, e]));
  const faltas = [];
  for (const n of tocadas) {
    const e = porNombre.get(n);
    if (!e) continue; // la carpeta se borra en el PR: no hay nada que comprobar
    if (e.estado === "caducada") faltas.push(falta("caducada", `${n}: comprobada el ${e.comprobado}, hace ${e.dias} días (plazo ${PLAZO_COMPROBADO_DIAS}). Vuelve a comprobarla y pon la fecha nueva en metadata.comprobado con su línea «Comprobado el …»`));
    if (e.estado === "sin_fecha") faltas.push(falta("caducada", `${n}: sin metadata.comprobado válida`));
  }
  return { ok: faltas.length === 0, tocadas, faltas };
}

// ── Nivel 2: lo que no necesita la API ───────────────────────────────────

/** Tope propio de una pasada de skills-prueba, si no se pide otro: bajo a propósito (dos skills cuestan ~0,2 $). */
export const TOPE_SKILLS_USD = 1;
/** Modelos: el que ejecuta el caso (el de las sesiones de texto) y el que elige skill y corrige (barato). */
export const MODELO_EJECUTA = "claude-sonnet-5";
export const MODELO_BARATO = "claude-haiku-4-5";
/** Lo estimado de cada llamada antes de saber cuánto cuesta de verdad. */
export const ESTIMADO_LLAMADA = { primero: 0.05, minimo: 0.005 };

/** Estados de un caso en el nivel 2 (vocabulario cerrado, para contarlos). */
export const ESTADOS_PRUEBA = ["ok", "falla", "sin_correr"];

/** El catálogo de skills tal como lo ve quien elige: nombre y descripción. */
export function catalogoParaDisparo(raiz = RAIZ) {
  return nombresDeSkills(raiz).map((n) => {
    const { meta } = parsearSkill(readFileSync(join(raiz, DIR_SKILLS, n, "SKILL.md"), "utf8"));
    return { nombre: n, descripcion: meta?.description ?? "" };
  });
}

export function promptDisparo(catalogo) {
  const lista = catalogo.map((s) => `- ${s.nombre}: ${s.descripcion}`).join("\n");
  return [
    "Eres una sesión de Claude Code en el repo MenuPlan. Antes de actuar decides si abrir una de estas skills (runbooks), solo por su descripción:",
    lista,
    `Si ninguna encaja, la respuesta es «${NINGUNA}». Contesta SOLO con JSON: {"skill": "<nombre>"}.`,
  ].join("\n\n");
}

export function promptEjecuta(textoSkill) {
  return [
    "Eres una sesión de Claude Code en el repo MenuPlan y acabas de abrir esta skill. No puedes ejecutar nada: di qué harías, en orden, con los comandos exactos y lo que esperas ver, y qué no harías sin el OK de Pablo. Breve.",
    "<skill>",
    textoSkill,
    "</skill>",
  ].join("\n");
}

export function promptCorrige() {
  return "Corriges la respuesta de una sesión frente a una lista de comprobaciones. Para cada una, ¿la respuesta la cumple? Sé estricto: si no lo dice, no cumple. Contesta SOLO con JSON: {\"comprobaciones\": [{\"texto\": \"<la comprobación tal cual>\", \"cumple\": true|false, \"evidencia\": \"<cita corta de la respuesta, o vacío>\"}]}";
}

/**
 * Ejecución sin razonamiento extendido y con sitio para contestar (#338): el
 * modelo de las sesiones razona por defecto, y con 1200 tokens el razonamiento
 * se los comía todos (medido el 10 oct 2026 con causa-raiz y plan-de-arreglo:
 * 2 de 8 respuestas vacías y 6 de 27 comprobaciones; una sonda dio
 * stop_reason max_tokens con los 1200 tokens en razonamiento). Una respuesta
 * vacía o cortada no es una skill que falla: es una pasada sin correr.
 */
export const OPCIONES_EJECUTA = { maxTokens: 2500, thinking: { type: "disabled" } };

/** Motivos de una respuesta que no se puede corregir (vocabulario cerrado). */
export const MOTIVOS_SIN_RESPUESTA = ["vacia", "cortada"];

/**
 * El texto de una respuesta de la API y si vale para corregir:
 * { texto, motivo } con motivo null si vale, o uno de MOTIVOS_SIN_RESPUESTA.
 */
export function leerRespuesta(data) {
  const texto = (data?.content ?? []).filter((b) => b?.type === "text").map((b) => b.text ?? "").join("");
  if (data?.stop_reason === "max_tokens") return { texto, motivo: "cortada" };
  if (!texto.trim()) return { texto, motivo: "vacia" };
  return { texto, motivo: null };
}

/** El primer objeto JSON de un texto de modelo, o null. */
export function jsonDeTexto(texto) {
  const t = String(texto ?? "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch (e) {
    console.warn(`[skills] respuesta sin JSON válido: ${e.message}`);
    return null;
  }
}

/** Resumen de una pasada: aciertos de disparo y comprobaciones cumplidas. */
export function resumen(res) {
  const d = res.disparo ?? [];
  const e = res.ejecucion ?? [];
  const comps = e.flatMap((c) => c.comprobaciones ?? []);
  return {
    disparo_ok: d.filter((c) => c.estado === "ok").length,
    disparo_total: d.length,
    comprobaciones_ok: comps.filter((c) => c.cumple).length,
    comprobaciones_total: comps.length,
    sin_correr: [...d, ...e].filter((c) => c.estado === "sin_correr").length,
  };
}

/**
 * Compara una pasada con la anterior, caso a caso: [{ id, parte, antes, ahora, cambio }]
 * con cambio «mejora», «empeora», «igual» o «nuevo». Lo que no corrió no compara.
 */
export function comparar(anterior, actual) {
  const fuera = [];
  for (const parte of ["disparo", "ejecucion"]) {
    const antes = new Map((anterior?.[parte] ?? []).map((c) => [c.id, c.estado]));
    for (const c of actual?.[parte] ?? []) {
      if (c.estado === "sin_correr") continue;
      const a = antes.get(c.id);
      const cambio = a == null || a === "sin_correr" ? "nuevo" : a === c.estado ? "igual" : c.estado === "ok" ? "mejora" : "empeora";
      fuera.push({ id: c.id, parte, antes: a ?? null, ahora: c.estado, cambio });
    }
  }
  return fuera;
}
