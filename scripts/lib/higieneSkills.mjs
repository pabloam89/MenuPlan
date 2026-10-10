/**
 * Higiene de UNA skill (#411, fondo #408): la lista de defectos de una skill
 * concreta, cada uno con su arreglo. No duplica nada: los controles de forma y de
 * forja son los de `skills.mjs` y `skillsForja.mjs` (aquí se llaman, sin la lista
 * de excepciones); lo que se añade es lo que el test de forma no ve, porque
 * depende del reloj o de lo que hay fuera de la skill: la fecha que caduca pronto,
 * el comando o la ruta citados que ya no existen, la skill citada que se borró, la
 * frontera vaga, el solape con cifra y los casos que se pisan con los de otra.
 *
 * Funciones puras: reciben la skill y un contexto (`ctxHigiene`), no leen disco.
 * Lo que no se puede mirar con una máquina (si cada párrafo justifica su coste, si
 * la libertad es la adecuada) sigue siendo del `revisor`; la lista lo dice al final.
 *
 * Cada defecto es { codigo, gravedad, detalle, arreglo }: `falta` es lo que el
 * nivel 1 ya negaría (o negaría sin la lista de excepciones); `aviso` es una
 * heurística nuestra, sin fuente, que pide mirar y no bloquea.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AVISO_ANTES_DIAS, DIR_SKILLS, MAX_LINEAS, PLAZO_COMPROBADO_DIAS, RAIZ,
  cargarContexto, cargarSkill, caducidad, faltasDeCopiado, faltasDeSkill, nombresDeSkills, parsearSkill,
} from "./skills.mjs";
import { MAX_SOLAPE, faltasDeSolape, solape } from "./skillsForja.mjs";

/** Vocabulario cerrado de los defectos propios de la higiene (los de la forja y del nivel 1 llevan los suyos). */
export const CODIGOS_HIGIENE = [
  "caduca-pronto", "comando-muerto", "ruta-muerta", "skill-muerta", "descripcion-sin-palabras",
  "frontera-vaga", "solape-cercano", "tamano-cerca", "caso-duplicado", "caso-en-frontera",
];

/** Días de margen: una skill que caduca en menos de esto se avisa (el CI solo avisa a los 14 de `AVISO_ANTES_DIAS`). */
export const AVISO_CADUCA_DIAS = 30;
/** A partir de qué parte de MAX_SOLAPE se enseña el solape como cercano (la cifra se enseña siempre). */
export const FRACCION_SOLAPE_CERCANO = 0.8;
/** A partir de qué parte de MAX_LINEAS se avisa de que la skill ya casi no cabe. */
export const FRACCION_TAMANO_CERCA = 0.85;
/** Parecido (Jaccard de raíces de 5 letras) a partir del cual dos peticiones son la misma. */
export const MAX_PARECIDO_CASOS = 0.6;
/** Raíces de una cláusula de «No para:» (que no son de la propia skill) a partir de las cuales una petición propia es de la otra. */
export const MAX_RAICES_EN_FRONTERA = 1;

/** Cómo se arregla cada defecto del nivel 1 y de la forja (por regla o código). */
export const ARREGLOS = {
  frontmatter: "arregla el frontmatter: name igual a la carpeta, «Úsala …», «No para:» y 81 a 600 caracteres",
  tipo: "pon en metadata.tipo uno de los ocho de ops/flujo.json",
  dueno: "pon un agente de .claude/agents/ que la cargue en su skills:",
  comprobado: "vuelve a comprobarla y pon la fecha de hoy con su línea «Comprobado el …: qué se comprobó»",
  secciones: "deja las secciones de su tipo, en orden y con contenido",
  formato: "ajusta la entrada al formato de la plantilla (fallo con fecha, causa y arreglo; registro fechado; última línea de comprobación)",
  tamano: "mueve el detalle a referencias/ y cítalo desde SKILL.md",
  secretos: "quita el valor de la clave: solo su nombre y dónde vive",
  rutas: "corrige o quita la ruta que ya no existe",
  estructura: "mueve el fichero a una capa permitida y cítalo desde SKILL.md con su ruta entera",
  copiado: "deja el párrafo en una sola skill y cita su nombre desde la otra",
  casos: "arregla casos.json (4 casos como mínimo, 3 propios con debe_salir de 10 caracteres o más)",
  solape: "separa las descripciones: una manda, la otra la nombra en su «No para:»",
  "casos-negativos": "añade casos de frontera: peticiones parecidas que son de otra skill o de ninguna, hasta tres",
  fechas: "mueve las fechas del cuerpo a «Lo que falló y por qué», «Registro de cambios» o «Comprobado el»",
  "sin-parada": "añade a «Método» cuándo se acaba y qué se ve cuando sale bien («Sale bien si …»)",
  ejemplos: "deja como mucho tres ejemplos, los canónicos",
  "comando-suelto": "pon el comando entre comillas invertidas o en un bloque",
  tabla: "iguala las columnas de la tabla y rellena las celdas vacías",
  cabeceras: "no saltes de nivel de cabecera (de ## a ###)",
  "caduca-pronto": "repásala con la realidad y pon la fecha nueva con su «Comprobado el …» antes de que caduque",
  "comando-muerto": "cambia el comando por el que existe hoy (npm run, package.json) o quita la mención",
  "ruta-muerta": "cambia la ruta por la que existe hoy o quita la mención",
  "skill-muerta": "cita una skill que exista, o quita la mención",
  "descripcion-sin-palabras": "pon entre «» dos o tres frases tal como las diría quien pide, antes del «No para:»",
  "frontera-vaga": "nombra en «No para:» la skill, el agente o el comando de lo que NO es suyo",
  "solape-cercano": "afila las dos descripciones antes de que pasen del límite: lo común se queda en una",
  "tamano-cerca": "parte ya: mueve un bloque largo a referencias/",
  "caso-duplicado": "cambia o quita el caso: dos peticiones iguales miden lo mismo dos veces",
  "caso-en-frontera": "el caso pide lo que su «No para:» deja a otra skill: cámbialo o mueve la petición a la otra",
};

const defecto = (codigo, gravedad, detalle) => ({ codigo, gravedad, detalle, arreglo: ARREGLOS[codigo] ?? "revisa el detalle" });

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Raíces de 5 letras de las palabras de 5 o más letras (rotar y rotación coinciden en «rota»; vale como heurística). */
const raices = (texto) => new Set((sinTildes(String(texto ?? "").toLowerCase()).match(/[a-z]{5,}/g) ?? []).map((w) => w.slice(0, 5)));
const parecido = (a, b) => {
  const comunes = [...a].filter((x) => b.has(x)).length;
  const union = a.size + b.size - comunes;
  return union === 0 ? 0 : comunes / union;
};

/** El texto de la skill sin sus secciones de historia (ahí un comando retirado es memoria, no una orden). */
function textoVivo(cuerpo) {
  const sin = cuerpo.split(/^(?=## )/m).filter((s) => !/^## (?:Lo que falló y por qué|Registro de cambios|Fuentes y comprobación)/.test(s)).join("");
  return sin;
}

const RUTA_LIBRE = /(?<![\w./-])((?:scripts|ops|docs|specs|src|api|supabase|\.claude|\.github)\/[\w./-]*[\w-]\.(?:md|mjs|jsx|json|yml|yaml|sql|sh|txt|js)(?!\w))/g;
const NPM_RUN = /\bnpm run ([\w:-]+)/g;
const SKILL_CITADA = /\bskills? `([\w-]+)`(?:(?:,| y| o) `([\w-]+)`)*/g;

/** Los nombres entre comillas invertidas que siguen a «skill» o «skills» (también «`a` y `b`»). */
function skillsCitadas(texto) {
  const fuera = new Set();
  for (const m of texto.matchAll(SKILL_CITADA)) for (const n of m[0].matchAll(/`([\w-]+)`/g)) fuera.add(n[1]);
  return [...fuera];
}

/**
 * Lo que cita el texto y ya no existe. `ctx.scriptsNpm` es la lista de `npm run`
 * del package.json; `ctx.existe(ruta)` mira el repo; `ctx.skills`, las carpetas.
 */
function referenciasMuertas(skill, cuerpo, ctx) {
  const vivo = [textoVivo(cuerpo), ...Object.entries(skill.extra ?? {}).map(([, t]) => t), skill.casos ? JSON.stringify(skill.casos) : ""].join("\n");
  const f = [];
  const npm = [...new Set([...vivo.matchAll(NPM_RUN)].map((m) => m[1]))].filter((n) => !ctx.scriptsNpm.includes(n));
  if (npm.length) f.push(defecto("comando-muerto", "falta", `cita npm run ${npm.join(", npm run ")}, que no está en package.json`));
  const rutas = [...new Set([...vivo.matchAll(RUTA_LIBRE)].map((m) => m[1]))].filter((r) => !r.includes("<") && !r.includes("*") && !ctx.existe(r));
  if (rutas.length) f.push(defecto("ruta-muerta", "falta", `cita ${rutas.join(", ")}, que no existe`));
  const skills = skillsCitadas(vivo).filter((n) => !ctx.skills.includes(n));
  if (skills.length) f.push(defecto("skill-muerta", "falta", `cita la skill ${skills.join(", ")}, que no existe`));
  return f;
}

/** Lo que dice la descripción: el disparador (antes de «No para:») y la frontera (después). */
function partesDeDescripcion(d) {
  const i = String(d ?? "").indexOf("No para:");
  return i === -1 ? { disparador: String(d ?? ""), frontera: "" } : { disparador: d.slice(0, i), frontera: d.slice(i + "No para:".length) };
}

function defectosDeDescripcion(meta, ctx) {
  const f = [];
  const { disparador, frontera } = partesDeDescripcion(meta?.description);
  if (disparador && !/«[^»]{3,}»/.test(disparador)) f.push(defecto("descripcion-sin-palabras", "aviso", "el disparador no trae ninguna frase entre «» con las palabras de quien pide"));
  if (frontera) {
    const nombra = ctx.skills.some((n) => new RegExp(`(?<![\\w-])${n}(?![\\w-])`).test(frontera)) || Object.keys(ctx.agentes).some((n) => new RegExp(`\\b${n}\\b`).test(frontera)) || /`[^`]+`|\([^)]{3,}\)|npm run/.test(frontera);
    if (!nombra) f.push(defecto("frontera-vaga", "aviso", "el «No para:» no nombra ninguna skill, agente, comando o fichero: no dice a dónde va lo que no es suyo"));
  }
  return f;
}

function defectosDeCasos(skill, ctx) {
  const f = [];
  const lista = Array.isArray(skill.casos?.casos) ? skill.casos.casos : [];
  const propios = lista.filter((c) => c?.skill === skill.nombre);
  const vistos = [];
  for (const c of lista) {
    const r = raices(c?.peticion);
    const igual = vistos.find((v) => parecido(v.r, r) >= MAX_PARECIDO_CASOS);
    if (igual) f.push(defecto("caso-duplicado", "aviso", `${c?.id} y ${igual.id} piden casi lo mismo (${parecido(igual.r, r).toFixed(2)})`));
    vistos.push({ id: c?.id, r });
    for (const otra of ctx.otrosCasos ?? []) {
      const p = parecido(r, raices(otra.peticion));
      if (p >= MAX_PARECIDO_CASOS) f.push(defecto("caso-duplicado", "aviso", `${c?.id} pide casi lo mismo que ${otra.skill}/${otra.id} (${p.toFixed(2)})`));
    }
  }
  // Una petición propia que usa palabras de lo que el «No para:» deja a otra skill y que no son de la propia.
  const { disparador, frontera } = partesDeDescripcion(ctx.descripcion);
  const mias = raices(disparador);
  for (const clausula of frontera.split(/(?<=\))[,;.]?\s*/).map((x) => x.trim()).filter(Boolean)) {
    const nombrada = ctx.skills.find((n) => n !== skill.nombre && new RegExp(`\\(${n}\\)`).test(clausula));
    if (!nombrada) continue;
    const rc = raices(clausula);
    const suyas = raices(nombrada);
    for (const c of propios) {
      const comunes = [...raices(c.peticion)].filter((x) => rc.has(x) && !mias.has(x) && !suyas.has(x));
      if (comunes.length >= MAX_RAICES_EN_FRONTERA) f.push(defecto("caso-en-frontera", "aviso", `${c.id} usa «${comunes.join("», «")}», palabras de lo que «No para:» deja a ${nombrada} («${clausula.slice(0, 60)}»)`));
    }
  }
  return f;
}

/**
 * Todos los defectos de una skill, de más grave a menos.
 * `skill`: { nombre, texto, ficheros, extra, casos } (de `cargarSkill`).
 * `ctx`: { hoy, tipos, agentes, skills, existe, scriptsNpm, catalogo, otrosCasos, otras }.
 *   `catalogo` [{ nombre, descripcion }] de todas; `otras` las demás cargadas
 *   (para el párrafo copiado); `otrosCasos` [{ skill, id, peticion }] de las otras.
 */
export function higieneDeSkill(skill, ctx) {
  const { meta, cuerpo, texto } = parsearSkill(skill.texto);
  const descripcion = typeof meta?.description === "string" ? meta.description : "";
  const c = { ...ctx, descripcion, excepcionesForja: {} };
  const f = faltasDeSkill(skill, c).map((x) => defecto(x.codigo ?? x.regla, "falta", x.detalle));

  for (const x of faltasDeCopiado([...(ctx.otras ?? []), skill]).filter((y) => y.skills.includes(skill.nombre))) f.push(defecto("copiado", "falta", x.detalle));
  for (const x of faltasDeSolape(ctx.catalogo ?? []).filter((y) => y.skills.includes(skill.nombre))) f.push(defecto("solape", "falta", x.detalle));

  const cad = caducidad(skill.texto, ctx.hoy);
  if (cad.estado === "caducada" || cad.estado === "sin_fecha") f.push(defecto("comprobado", "falta", `comprobada el ${cad.comprobado ?? "nunca"}${cad.dias == null ? "" : `, hace ${cad.dias} días (plazo ${PLAZO_COMPROBADO_DIAS})`}`));
  else if (cad.dias > PLAZO_COMPROBADO_DIAS - AVISO_CADUCA_DIAS) f.push(defecto("caduca-pronto", "aviso", `comprobada el ${cad.comprobado}: caduca en ${PLAZO_COMPROBADO_DIAS - cad.dias} días (aviso a los ${AVISO_CADUCA_DIAS}; el CI avisa a los ${AVISO_ANTES_DIAS})`));

  f.push(...referenciasMuertas(skill, cuerpo, c));
  f.push(...defectosDeDescripcion(meta, c));

  const lineas = texto.split("\n").length;
  if (lineas <= MAX_LINEAS && lineas > MAX_LINEAS * FRACCION_TAMANO_CERCA) f.push(defecto("tamano-cerca", "aviso", `${lineas} líneas de ${MAX_LINEAS}: la próxima entrada la desborda`));

  const otros = (ctx.catalogo ?? []).filter((s) => s.nombre !== skill.nombre).map((s) => ({ nombre: s.nombre, s: solape(descripcion, s.descripcion) })).sort((a, b) => b.s - a.s);
  if (otros[0] && otros[0].s >= MAX_SOLAPE * FRACCION_SOLAPE_CERCANO && otros[0].s <= MAX_SOLAPE) f.push(defecto("solape-cercano", "aviso", `solapa ${otros[0].s.toFixed(2)} con ${otros[0].nombre} (límite ${MAX_SOLAPE})`));

  f.push(...defectosDeCasos(skill, c));
  const orden = { falta: 0, aviso: 1 };
  return f.sort((a, b) => orden[a.gravedad] - orden[b.gravedad]);
}

/** La cifra de solape más alta de una skill con otra (se enseña siempre en el informe). */
export function solapeMaximo(skill, catalogo) {
  const d = parsearSkill(skill.texto).meta?.description ?? "";
  const otros = catalogo.filter((s) => s.nombre !== skill.nombre).map((s) => ({ con: s.nombre, solape: solape(d, s.descripcion) })).sort((a, b) => b.solape - a.solape);
  return otros[0] ?? { con: null, solape: 0 };
}

/** Lo que lee package.json en `scripts` (los `npm run`). */
export function scriptsDeNpm(raiz = RAIZ) {
  return Object.keys(JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).scripts ?? {});
}

/** El contexto de higiene de un repo: lo de `cargarContexto` y lo de las demás skills. */
export function ctxHigiene(nombre, raiz = RAIZ, hoy = new Date()) {
  const base = cargarContexto(raiz, hoy);
  const otras = base.skills.filter((n) => n !== nombre).map((n) => cargarSkill(n, raiz));
  const catalogo = base.skills.map((n) => ({ nombre: n, descripcion: parsearSkill(readFileSync(join(raiz, DIR_SKILLS, n, "SKILL.md"), "utf8")).meta?.description ?? "" }));
  const otrosCasos = otras.flatMap((s) => (s.casos?.casos ?? []).map((c) => ({ skill: s.nombre, id: c.id, peticion: c.peticion })));
  return { ...base, scriptsNpm: scriptsDeNpm(raiz), catalogo, otras, otrosCasos };
}

/** Higiene de una skill del repo por su nombre. */
export function higieneDelRepo(nombre, raiz = RAIZ, hoy = new Date()) {
  if (!nombresDeSkills(raiz).includes(nombre)) throw new Error(`No existe la skill ${nombre}`);
  return higieneDeSkill(cargarSkill(nombre, raiz), ctxHigiene(nombre, raiz, hoy));
}

/** La línea para contar (una por skill): `higiene skill: x faltas: a avisos: b solape: 0.12 con: y`. */
export function lineaDeResumen(nombre, defectos, solapeMax) {
  const faltas = defectos.filter((d) => d.gravedad === "falta").length;
  return `higiene skill: ${nombre} faltas: ${faltas} avisos: ${defectos.length - faltas} solape: ${solapeMax.solape.toFixed(2)} con: ${solapeMax.con ?? "-"}`;
}
