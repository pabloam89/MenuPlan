/**
 * El registro de normas (#296, fondo #185).
 *
 * Una norma es algo que el repo dice que «se cumple siempre». `ops/normas.json`
 * apunta cada una con quién la hace cumplir y cómo de dura es de verdad, en un
 * vocabulario cerrado para poder contarlas. `ops/normas.test.js` falla cuando
 * una norma que se dice dura no lo es.
 *
 * El repo es público (#300): el registro dice QUÉ norma es, QUIÉN la hace
 * cumplir y su VEREDICTO. Nunca cómo se salta ni qué le falta exactamente;
 * eso va a Pablo en privado.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Quién hace cumplir la norma. Los cinco primeros son «del sistema»: no dependen de que alguien se acuerde. */
export const EJECUTORES = {
  github_regla: "Un ajuste de GitHub (protección de rama, ruleset, environment, seguridad del repo)",
  ci: "Un paso del CI que falla el check obligatorio",
  base_datos: "La propia base: un rol, un CHECK, una RLS, un permiso",
  codigo_en_ejecucion: "El código desplegado lo comprueba en cada petición",
  proveedor: "Un servicio de fuera (GitHub, Vercel, Supabase, Anthropic) lo impone",
  guardia: "Un hook de Claude Code (guardia, pendientes, arranque): solo ve a las sesiones de Claude",
  clasificador: "El clasificador del modo auto de Claude Code",
  script_propio: "Un script del repo, solo si se usa ese script",
  persona: "Alguien que se acuerda (Pablo, Álvaro, un agente juez)",
  nada: "Nada: solo está escrita",
};

/** Los ejecutores que no dependen de que una sesión o una persona coopere. */
export const EJECUTORES_DEL_SISTEMA = ["github_regla", "ci", "base_datos", "codigo_en_ejecucion", "proveedor"];

/** A quién alcanza el ejecutor. */
export const ALCANCES = {
  todos: "A cualquiera: Pablo, Álvaro, una sesión, un workflow o la terminal",
  solo_claude: "Solo a las sesiones de Claude Code",
  solo_script: "Solo a quien usa el script del repo",
  nadie: "No alcanza a nadie: no hay ejecutor",
};

/** Qué pasa si el ejecutor falla (se cae, no puede leer, se pasa de tiempo). */
export const ANTE_FALLO = {
  cerrado: "Si el ejecutor falla, no deja pasar",
  abierto: "Si el ejecutor falla, deja pasar",
  no_aplica: "No hay ejecutor que pueda fallar",
};

/** Cómo de dura es la norma hoy. */
export const VEREDICTOS = {
  dura: "Ejecutor del sistema, para todos, falla cerrado y con un test que lo vigila",
  semidura: "Tiene ejecutor, pero no alcanza a todos, falla abierto o no hay test",
  blanda: "Solo texto o una persona que se acuerda",
  rota: "Se dice que hay ejecutor y hoy no funciona",
};

/** Cuánto duele que se incumpla. */
export const RIESGOS = {
  alto: "Dinero, producción, datos de familias o permisos",
  medio: "Rompe trabajo o deja un hueco que se nota tarde",
  bajo: "Molesta, se ve enseguida y se arregla",
};

/** Campos de cada norma. `nota` es opcional y neutra: nunca cómo se salta. */
export const CAMPOS = ["id", "texto", "donde", "ejecutor", "alcance", "ante_fallo", "test", "veredicto", "riesgo", "issue"];
export const CAMPOS_OPCIONALES = ["nota", "test_fallo"];

export const RUTA_REGISTRO = "ops/normas.json";

/** Lee el registro. */
export function leerRegistro(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_REGISTRO), "utf8"));
}

/** `test` puede ser una ruta o una comprobación de la medición semanal de planos: `planos:<regla>[:<rama>]`. */
export function esReferenciaPlanos(test) {
  return typeof test === "string" && test.startsWith("planos:");
}

/** ¿Hay en ops/planos.json un criterio `regla_github` como el que cita `planos:<regla>[:<rama>]`? */
export function existeEnPlanos(test, planos) {
  const [, regla, rama] = test.split(":");
  return planos.planos.some((p) => Object.values(p.niveles).flat()
    .some((c) => c.tipo === "regla_github" && c.regla === regla && (rama === undefined || c.rama === rama)));
}

/** Errores de forma de una norma: campos, vocabulario y tipos. Lista vacía si está bien. */
export function problemasDeForma(n) {
  const malos = [];
  const id = n?.id ?? "(sin id)";
  for (const c of CAMPOS) if (!(c in n)) malos.push(`${id}: falta «${c}»`);
  for (const c of Object.keys(n)) if (!CAMPOS.includes(c) && !CAMPOS_OPCIONALES.includes(c)) malos.push(`${id}: campo desconocido «${c}»`);
  if (typeof n.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.id)) malos.push(`${id}: el id va en minúsculas con guiones`);
  if (typeof n.texto !== "string" || !n.texto.trim()) malos.push(`${id}: sin texto`);
  if (!Array.isArray(n.donde) || !n.donde.length) malos.push(`${id}: «donde» es una lista de rutas`);
  const vocab = [["ejecutor", EJECUTORES], ["alcance", ALCANCES], ["ante_fallo", ANTE_FALLO], ["veredicto", VEREDICTOS], ["riesgo", RIESGOS]];
  for (const [campo, v] of vocab) if (!(n[campo] in v)) malos.push(`${id}: ${campo} «${n[campo]}» no está en el vocabulario`);
  if (n.test !== null && typeof n.test !== "string") malos.push(`${id}: «test» es una ruta, «planos:…» o null`);
  if (n.issue !== null && !Number.isInteger(n.issue)) malos.push(`${id}: «issue» es un número o null`);
  if (n.test_fallo !== undefined && (typeof n.test_fallo?.ruta !== "string" || typeof n.test_fallo?.caso !== "string")) {
    malos.push(`${id}: «test_fallo» lleva ruta y caso`);
  }
  return malos;
}

/**
 * ¿Existe lo que la norma da como test? Una ruta del repo, o un criterio de
 * ops/planos.json (lo mide `planos-semanal.yml` con red cada lunes).
 */
export function testExiste(test, { raiz, planos }) {
  if (test === null) return false;
  if (esReferenciaPlanos(test)) return existeEnPlanos(test, planos);
  return existsSync(join(raiz, test));
}

/**
 * Las reglas de dureza. Cada problema es una línea con el id de la norma.
 * `ctx`: { raiz, planos } (planos = ops/planos.json leído).
 *
 * 1. Lo que se dice dura lo es: ejecutor del sistema, para todos, falla
 *    cerrado y un test que existe.
 * 2. Lo de riesgo alto o es dura o tiene su issue.
 * 3. El código en ejecución que falla cerrado tiene un test que inyecta el
 *    fallo del servicio: el registro lo declara en `test_fallo` y aquí se
 *    comprueba que el fichero existe y nombra el caso.
 * Y, para todas, que el test que se nombra exista.
 */
export function problemasDeDureza(n, ctx) {
  const malos = [];
  if (n.test !== null && !testExiste(n.test, ctx)) malos.push(`${n.id}: su test «${n.test}» no existe`);
  if (n.veredicto === "dura") {
    if (!EJECUTORES_DEL_SISTEMA.includes(n.ejecutor)) malos.push(`${n.id}: dura, pero su ejecutor (${n.ejecutor}) no es del sistema`);
    if (n.alcance !== "todos") malos.push(`${n.id}: dura, pero solo alcanza a ${n.alcance}`);
    if (n.ante_fallo !== "cerrado") malos.push(`${n.id}: dura, pero ante un fallo queda ${n.ante_fallo}`);
    if (n.test === null) malos.push(`${n.id}: dura, pero sin test`);
  }
  if (n.riesgo === "alto" && n.veredicto !== "dura" && !Number.isInteger(n.issue)) {
    malos.push(`${n.id}: riesgo alto, ${n.veredicto} y sin issue que lo lleve`);
  }
  if (n.ejecutor === "codigo_en_ejecucion" && n.ante_fallo === "cerrado") {
    const f = n.test_fallo;
    if (!f) malos.push(`${n.id}: falla cerrado en ejecución, pero no declara el test que inyecta el fallo (test_fallo)`);
    else if (!existsSync(join(ctx.raiz, f.ruta))) malos.push(`${n.id}: su test_fallo «${f.ruta}» no existe`);
    else if (!readFileSync(join(ctx.raiz, f.ruta), "utf8").includes(f.caso)) malos.push(`${n.id}: ${f.ruta} no nombra el caso «${f.caso}»`);
  }
  return malos;
}

// ── El trinquete de frases normativas ─────────────────────────────────────

/**
 * Palabras que suelen anunciar una norma. Cada una con su clave (sin tildes ni
 * plurales) para contarlas. Una aparición pasa si su línea cita una norma del
 * registro (`<!-- norma:<id> -->`) o si está en la línea base, que solo baja.
 */
export const PALABRAS_NORMATIVAS = [
  ["nunca", "nunca"],
  ["siempre", "siempre"],
  ["solo", "s[oó]lo"],
  ["maximo", "m[aá]xim[oa]s?"],
  ["tope", "topes?"],
  ["obligatorio", "obligatori[oa]s?"],
  ["exige", "exigen?"],
  ["ok_de_pablo", "ok de pablo"],
];
const LETRA = "[\\p{L}\\p{N}_]";
const REGEX_PALABRAS = PALABRAS_NORMATIVAS.map(([clave, p]) => [clave, new RegExp(`(?<!${LETRA})(?:${p})(?!${LETRA})`, "giu")]);
const REGEX_CITA = /<!--\s*norma:([a-z0-9-]+)\s*-->/g;

export const RUTA_BASE = "ops/normas-base.json";

/** Ficheros donde se buscan frases normativas, relativos a la raíz y con «/». */
export function ficherosNormativos(raiz) {
  const fuera = [];
  const mds = (dir, recursivo) => {
    const abs = join(raiz, dir);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const ruta = `${dir}/${e.name}`;
      if (e.isDirectory() && recursivo) mds(ruta, true);
      else if (e.isFile() && e.name.endsWith(".md")) fuera.push(ruta);
    }
  };
  for (const f of ["CLAUDE.md", "docs/datos/PRINCIPIOS.md"]) if (existsSync(join(raiz, f))) fuera.push(f);
  for (const d of [".claude/rules", ".claude/skills", ".claude/agents", ".claude/commands"]) mds(d, true);
  mds("ops", false);
  return fuera.sort();
}

/**
 * Cuenta las apariciones que no citan una norma, por palabra. Las citas a un
 * id que no está en el registro no valen y se devuelven aparte.
 */
export function contarFrases(texto, ids) {
  const cuenta = {};
  const citasMalas = [];
  for (const linea of texto.split("\n")) {
    const citas = [...linea.matchAll(REGEX_CITA)].map((m) => m[1]);
    for (const c of citas) if (!ids.has(c)) citasMalas.push(c);
    const citada = citas.some((c) => ids.has(c));
    if (citada) continue;
    for (const [clave, re] of REGEX_PALABRAS) {
      const n = (linea.match(re) ?? []).length;
      if (n) cuenta[clave] = (cuenta[clave] ?? 0) + n;
    }
  }
  return { cuenta, citasMalas };
}

/** { ruta: { palabra: n } } de todo el repo, y las citas a ids que no existen. */
export function medirFrases(raiz, ids) {
  const actual = {};
  const citasMalas = [];
  for (const ruta of ficherosNormativos(raiz)) {
    const r = contarFrases(readFileSync(join(raiz, ruta), "utf8"), ids);
    if (Object.keys(r.cuenta).length) actual[ruta] = r.cuenta;
    for (const c of r.citasMalas) citasMalas.push(`${ruta}: norma:${c}`);
  }
  return { actual, citasMalas };
}

/** Lo que sube respecto a la base: [{ ruta, palabra, actual, base }]. */
export function subidas(actual, base) {
  const fuera = [];
  for (const [ruta, cuenta] of Object.entries(actual)) {
    for (const [palabra, n] of Object.entries(cuenta)) {
      const b = base[ruta]?.[palabra] ?? 0;
      if (n > b) fuera.push({ ruta, palabra, actual: n, base: b });
    }
  }
  return fuera;
}

/**
 * La base nueva. Sin `subir`, cada cifra es la menor entre la de hoy y la
 * guardada: solo baja. Con `subir` (a propósito, se ve en el diff del PR),
 * la de hoy.
 */
export function nuevaBase(actual, base, { subir = false } = {}) {
  const fuera = {};
  for (const ruta of Object.keys(actual).sort()) {
    for (const palabra of Object.keys(actual[ruta]).sort()) {
      const n = actual[ruta][palabra];
      const b = base[ruta]?.[palabra] ?? 0;
      const v = subir ? n : Math.min(n, b);
      if (v > 0) (fuera[ruta] ??= {})[palabra] = v;
    }
  }
  return fuera;
}

/** Total de apariciones de una base. */
export function totalBase(base) {
  return Object.values(base).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0);
}

// ── La medición del fondo (#185) ──────────────────────────────────────────

/**
 * Cifras de si la norma «Cuando algo falla: hasta el problema de fondo» se
 * cumple, sacadas de las etiquetas y del padre/hijos de GitHub. La línea
 * «Casos:» de los PR la mide otra pieza (rama ops/casos-obligatorios); esto
 * mide lo que queda colgando después. Solo cuentas: nada de detalle.
 */
export const CIFRAS_FONDO = {
  casos_sin_fondo: "Casos abiertos que no son puntuales y no cuelgan de un problema de fondo",
  fondos_sin_encargo: "Problemas de fondo abiertos sin ningún encargo colgando",
  fondos_cerrados_sin_test: "Problemas de fondo cerrados sin la etiqueta arreglo:test ni arreglo:guardia (las reglas de la guardia van con su test); es la etiqueta, no el test: un aproximado",
};

/** Lo que cubre la clase al cerrar un fondo: un test, o una regla de la guardia con el suyo. */
export const ARREGLOS_CON_TEST = ["arreglo:test", "arreglo:guardia"];

const etiquetasDe = (i) => (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const tipoDeIssue = (i) => i.tipo ?? etiquetasDe(i).find((l) => l.startsWith("tipo:"))?.slice(5) ?? null;
const abierto = (i) => String(i.state).toUpperCase() === "OPEN";

/** Las tres cifras, de issues con la forma de `leerIssue` (scripts/lib/issues.mjs). */
export function medirFondo(issues) {
  const casos = issues.filter((i) => abierto(i) && tipoDeIssue(i) === "caso");
  const fondos = issues.filter((i) => tipoDeIssue(i) === "fondo");
  return {
    casos_sin_fondo: casos.filter((i) => !etiquetasDe(i).includes("analisis:puntual") && tipoDeIssue(i.padre ?? {}) !== "fondo").length,
    fondos_sin_encargo: fondos.filter((f) => abierto(f) && !(f.hijos ?? []).some((h) => tipoDeIssue(h) === "encargo")).length,
    fondos_cerrados_sin_test: fondos.filter((f) => !abierto(f) && !etiquetasDe(f).some((l) => ARREGLOS_CON_TEST.includes(l))).length,
  };
}

/** Recuento por veredicto y por riesgo: las cifras de partida. */
export function recuento(normas) {
  const por = (campo, vocab) => Object.fromEntries(Object.keys(vocab).map((k) => [k, normas.filter((n) => n[campo] === k).length]));
  return { total: normas.length, veredicto: por("veredicto", VEREDICTOS), riesgo: por("riesgo", RIESGOS) };
}
