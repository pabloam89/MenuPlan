/**
 * El registro de normas (#296, fondo #185).
 *
 * Una norma es algo que el repo dice que «se cumple siempre». `ops/normas.json`
 * la escribe por campos (la plantilla de regla.mjs, #494) y apunta quién la hace
 * cumplir y cómo de dura es de verdad, en un vocabulario cerrado para poder contarlas. `ops/normas.test.js` falla cuando
 * una norma que se dice dura no lo es.
 *
 * El repo es público (#300): el registro dice QUÉ norma es, QUIÉN la hace
 * cumplir y su VEREDICTO. Nunca cómo se salta ni qué le falta exactamente;
 * eso va a Pablo en privado.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { VEREDICTOS } from "./escalas.mjs";
import { CONTROL_JUICIO, FUERZAS, fraseDeRegla, problemasDeRegla, problemasDeSujetos } from "./regla.mjs";

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

/** Cuánto duele que se incumpla. */
export const RIESGOS = {
  alto: "Dinero, producción, datos de familias o permisos",
  medio: "Rompe trabajo o deja un hueco que se nota tarde",
  bajo: "Molesta, se ve enseguida y se arregla",
};

/**
 * Cómo se comprueba una norma (#494). `prueba` dice si es una comprobación que falla sola: solo
 * una norma con control de esos tipos puede ser dura. El vocabulario sale de lo que había en el
 * viejo `test` (una ruta, `planos:…` o null), más el workflow y el script que de verdad vigilan
 * dos normas que decían «sin test».
 */
export const CONTROL_TIPOS = {
  test: { que: "Un test del repo que falla en el CI", prueba: true },
  planos: { que: "Un criterio de la medición semanal de ops/planos.json (con red, cada lunes)", prueba: true },
  workflow: { que: "Un paso de un workflow de GitHub Actions que falla el check", prueba: false },
  script: { que: "Un script del repo que comprueba y se lanza a mano o en el build", prueba: false },
  juicio: { que: "El juicio de una persona o de un LLM sobre sus casos: no hay nada que falle solo", prueba: false },
};

/** El fichero que cuenta como control de una norma de tipo `planos`. */
export const RUTA_PLANOS = "ops/planos.json";

/**
 * Campos de cada norma. Los de regla (`nombre`, `sujeto`, `fuerza`, `exigencia`, y `condicion` y
 * `nota` si hay) los comprueba `problemasDeRegla` (regla.mjs); aquí van los de dureza.
 */
export const CAMPOS = [
  "id", "nombre", "sujeto", "fuerza", "exigencia", "donde", "ejecutor", "alcance", "ante_fallo",
  "control", "control_tipo", "veredicto", "riesgo", "issue",
];
export const CAMPOS_OPCIONALES = ["condicion", "nota", "criterio_planos", "test_fallo", "desde"];

export const RUTA_REGISTRO = "ops/normas.json";
export const RUTA_MD = "docs/ops/NORMAS.md";

/** Lee el registro. */
export function leerRegistro(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_REGISTRO), "utf8"));
}

/** `test` de una obligación de flujo.json puede ser una ruta o una comprobación de planos: `planos:<regla>[:<rama>]`. */
export function esReferenciaPlanos(test) {
  return typeof test === "string" && test.startsWith("planos:");
}

/** ¿Hay en ops/planos.json un criterio `regla_github` como el que cita `planos:<regla>[:<rama>]`? */
export function existeEnPlanos(test, planos) {
  const [, regla, rama] = test.split(":");
  return planos.planos.some((p) => Object.values(p.niveles).flat()
    .some((c) => c.tipo === "regla_github" && c.regla === regla && (rama === undefined || c.rama === rama)));
}

/** El criterio de planos de una norma como `planos:<regla>[:<rama>]`, o null si no es de ese tipo. */
export const hechoDePlanos = (n) => (n.control_tipo === "planos" && typeof n.criterio_planos === "string" ? `planos:${n.criterio_planos}` : null);

/**
 * Errores del control de una regla (una norma, una obligación del flujo): `control` es la ruta de un fichero
 * o «juicio», y `control_tipo` cuenta lo mismo. No mira que `control_tipo` esté en el vocabulario: eso lo
 * hace quien llama. Lista vacía si está bien; `id` es cómo se nombra en el mensaje.
 */
export function problemasDeControl(n, id) {
  const malos = [];
  if (typeof n.control !== "string" || !n.control.trim()) malos.push(`${id}: «control» es la ruta de un fichero o «${CONTROL_JUICIO}»`);
  else if (n.control_tipo === "juicio" && n.control !== CONTROL_JUICIO) malos.push(`${id}: control_tipo «juicio» pide control «${CONTROL_JUICIO}», no «${n.control}»`);
  else if (n.control_tipo !== "juicio" && n.control === CONTROL_JUICIO) malos.push(`${id}: control «${CONTROL_JUICIO}» pide control_tipo «juicio», no «${n.control_tipo}»`);
  else if (n.control_tipo === "test" && !/\.test\.(js|jsx|mjs)$/.test(n.control)) malos.push(`${id}: control_tipo «test» pide un fichero *.test.js, no «${n.control}»`);
  else if (n.control_tipo === "planos" && n.control !== RUTA_PLANOS) malos.push(`${id}: control_tipo «planos» pide control «${RUTA_PLANOS}», no «${n.control}»`);
  if (n.control_tipo === "planos" && (typeof n.criterio_planos !== "string" || !n.criterio_planos)) malos.push(`${id}: control_tipo «planos» lleva «criterio_planos» (regla[:rama])`);
  if (n.control_tipo !== "planos" && "criterio_planos" in n) malos.push(`${id}: «criterio_planos» solo con control_tipo «planos»`);
  return malos;
}

/**
 * Errores de forma de una norma: los campos de regla (regla.mjs), los de dureza, el vocabulario y
 * que `control` y `control_tipo` cuenten lo mismo. Lista vacía si está bien. `sujetos`: el
 * vocabulario del registro.
 */
export function problemasDeForma(n, sujetos) {
  const malos = [];
  const id = n?.id ?? "(sin id)";
  for (const c of CAMPOS) if (!(c in n)) malos.push(`${id}: falta «${c}»`);
  for (const c of Object.keys(n)) if (!CAMPOS.includes(c) && !CAMPOS_OPCIONALES.includes(c)) malos.push(`${id}: campo desconocido «${c}»`);
  if (typeof n.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.id)) malos.push(`${id}: el id va en minúsculas con guiones`);
  malos.push(...problemasDeRegla(n, id, sujetos));
  if (!Array.isArray(n.donde) || !n.donde.length) malos.push(`${id}: «donde» es una lista de rutas`);
  const vocab = [["ejecutor", EJECUTORES], ["alcance", ALCANCES], ["ante_fallo", ANTE_FALLO], ["veredicto", VEREDICTOS], ["riesgo", RIESGOS], ["control_tipo", CONTROL_TIPOS]];
  for (const [campo, v] of vocab) if (!(n[campo] in v)) malos.push(`${id}: ${campo} «${n[campo]}» no está en el vocabulario (${Object.keys(v).join(", ")})`);
  malos.push(...problemasDeControl(n, id));
  if (n.issue !== null && !Number.isInteger(n.issue)) malos.push(`${id}: «issue» es un número o null`);
  if ("desde" in n && !Number.isInteger(n.desde)) malos.push(`${id}: «desde» es el número del issue o PR que la dejó así`);
  if (n.test_fallo !== undefined && (typeof n.test_fallo?.ruta !== "string" || typeof n.test_fallo?.caso !== "string")) {
    malos.push(`${id}: «test_fallo» lleva ruta y caso`);
  }
  return malos;
}

/**
 * ¿Existe lo que la norma da como control? Una ruta del repo, un criterio de ops/planos.json (lo
 * mide `planos-semanal.yml` con red cada lunes) o «juicio» (no hay nada que buscar).
 */
export function controlExiste(n, { raiz, planos }) {
  if (n.control_tipo === "juicio") return true;
  if (n.control_tipo === "planos") return typeof n.criterio_planos === "string" && existeEnPlanos(`planos:${n.criterio_planos}`, planos);
  return existsSync(join(raiz, n.control));
}

/**
 * `test` de una obligación de flujo.json (una ruta o `planos:…`): ¿existe? Lo usa ops/flujo.test.js.
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
 *    cerrado y un control que es una prueba (un test o un criterio de planos).
 * 2. Lo de riesgo alto o es dura o tiene su issue.
 * 3. El código en ejecución que falla cerrado tiene un test que inyecta el
 *    fallo del servicio: el registro lo declara en `test_fallo` y aquí se
 *    comprueba que el fichero existe y nombra el caso.
 * Y, para todas, que el control que se nombra exista.
 */
export function problemasDeDureza(n, ctx) {
  const malos = [];
  if (!controlExiste(n, ctx)) malos.push(`${n.id}: su control «${n.control}»${n.criterio_planos ? ` (${n.criterio_planos})` : ""} no existe`);
  if (n.veredicto === "dura") {
    if (!EJECUTORES_DEL_SISTEMA.includes(n.ejecutor)) malos.push(`${n.id}: dura, pero su ejecutor (${n.ejecutor}) no es del sistema`);
    if (n.alcance !== "todos") malos.push(`${n.id}: dura, pero solo alcanza a ${n.alcance}`);
    if (n.ante_fallo !== "cerrado") malos.push(`${n.id}: dura, pero ante un fallo queda ${n.ante_fallo}`);
    if (!CONTROL_TIPOS[n.control_tipo]?.prueba) malos.push(`${n.id}: dura, pero su control (${n.control_tipo}) no es una prueba que falle sola`);
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

/**
 * Reglas del registro entero (#351). Una comprobación de la medición de planos
 * (`criterio_planos`) es un hecho de GitHub concreto: si dos normas la
 * dan como control, son el mismo hecho dicho dos veces, y acaban con dos
 * veredictos distintos (pasó con «staging exige tests», tres normas). Un
 * fichero de test no cuenta: guardia.test.js vigila muchas normas distintas.
 */
export function problemasDeConjunto(normas) {
  const porHecho = new Map();
  for (const n of normas) {
    const hecho = hechoDePlanos(n);
    if (!hecho) continue;
    porHecho.set(hecho, [...(porHecho.get(hecho) ?? []), n.id]);
  }
  return [...porHecho].filter(([, ids]) => ids.length > 1)
    .map(([hecho, ids]) => `${ids.join(", ")}: el mismo hecho (${hecho}) en ${ids.length} normas; deja una sola, con un solo veredicto`);
}

/** Errores de los sujetos y de las normas de un registro leído: lo que comprueba el test sobre ops/normas.json. */
export function problemasDeRegistro(registro) {
  const malos = problemasDeSujetos(registro?.sujetos).map((x) => `sujetos: ${x}`);
  const ids = new Set();
  for (const n of registro?.normas ?? []) {
    malos.push(...problemasDeForma(n, registro.sujetos));
    if (ids.has(n.id)) malos.push(`${n.id}: id repetido`);
    ids.add(n.id);
  }
  const usados = new Set((registro?.normas ?? []).map((n) => n.sujeto));
  for (const s of Object.keys(registro?.sujetos ?? {})) if (!usados.has(s)) malos.push(`sujetos: «${s}» no lo usa ninguna norma: no se infla la lista`);
  return malos;
}

// ── Los avisos de la guardia (#494) ───────────────────────────────────────

/**
 * Errores de los avisos de la guardia (`AVISOS` de .claude/hooks/avisos-guardia.mjs): cada uno
 * lleva el `codigo` de una norma que existe y sus tres partes fijas (la cuarta, `quien`, es
 * opcional), sin punto final ni saltos de línea. `porCredencial` es `AVISO_POR_CREDENCIAL`.
 */
export function problemasDeAvisos(avisos, normas, porCredencial = {}) {
  const malos = [];
  const ids = new Set(normas.map((n) => n.id));
  for (const [id, a] of Object.entries(avisos ?? {})) {
    if (!/^[a-z]+(-[a-z]+)*$/.test(id)) malos.push(`aviso ${id}: el id va en minúsculas con guiones`);
    if (typeof a?.codigo !== "string" || !a.codigo) malos.push(`aviso ${id}: sin «codigo»: cada aviso apunta a una norma`);
    else if (!ids.has(a.codigo)) malos.push(`aviso ${id}: su codigo «${a.codigo}» no es una norma de ops/normas.json`);
    for (const p of ["que", "porque", "enSuLugar"]) {
      if (typeof a?.[p] !== "string" || a[p].trim().length < 8) malos.push(`aviso ${id}: falta «${p}»`);
    }
    for (const p of ["que", "porque", "enSuLugar", "quien"]) {
      const t = a?.[p];
      if (typeof t !== "string") continue;
      if (/\n/.test(t)) malos.push(`aviso ${id}: «${p}» va en una sola línea`);
      if (/[.;:]\s*$/.test(t)) malos.push(`aviso ${id}: «${p}» va sin punto final: lo pone el formateador`);
    }
    if ("quien" in (a ?? {}) && (typeof a.quien !== "string" || a.quien.trim().length < 3)) malos.push(`aviso ${id}: «quien» es opcional, pero si está dice a quién`);
    for (const k of Object.keys(a ?? {})) if (!["codigo", "que", "porque", "enSuLugar", "quien"].includes(k)) malos.push(`aviso ${id}: campo desconocido «${k}»`);
  }
  for (const [familia, aviso] of Object.entries(porCredencial)) if (!(aviso in (avisos ?? {}))) malos.push(`credencial ${familia}: su aviso «${aviso}» no existe`);
  return malos;
}

/**
 * Las llamadas a `deny(`, `ask(` y `avisa(` (#506) de un fichero de la guardia: { literales: [id…], otras: [texto…] }.
 * Un id literal es `deny("push-a-main")`; lo demás (un mensaje escrito a mano, una variable) va a
 * `otras`, salvo lo que se admite por nombre (`AVISO_POR_CREDENCIAL[cred]`, que se cruza con el mapa).
 */
export function llamadasDeAviso(fuente, { admitidas = [] } = {}) {
  const literales = [];
  const otras = [];
  for (const m of String(fuente).matchAll(/\b(deny|ask|avisa)\((?=([^\n]{0,90}))/g)) {
    const resto = m[2];
    const lit = /^"([a-z]+(?:-[a-z]+)*)"/.exec(resto);
    if (lit) literales.push(lit[1]);
    else if (!admitidas.some((x) => resto.startsWith(x))) otras.push(`${m[1]}(${resto.slice(0, 60)}`);
  }
  return { literales, otras };
}

// ── NORMAS.md, generado ───────────────────────────────────────────────────

const celda = (t) => String(t).replace(/\|/g, "\\|").replace(/\n/g, " ");

/**
 * El Markdown de docs/ops/NORMAS.md, que sale de ops/normas.json y de los avisos de la guardia.
 * `avisos`: AVISOS de .claude/hooks/avisos-guardia.mjs.
 */
export function generarMd(registro, avisos) {
  const normas = registro.normas;
  const sujetos = registro.sujetos;
  const porNorma = {};
  for (const [id, a] of Object.entries(avisos)) (porNorma[a.codigo] ??= []).push(id);
  const L = [
    "# Normas de HoMenu",
    "",
    `<!-- Generado desde ${RUTA_REGISTRO} y .claude/hooks/avisos-guardia.mjs con «npm run normas -- --escribir». No se edita a mano: ops/normas.test.js lo compara. -->`,
    "",
    "Una norma es algo que el repo dice que se cumple siempre. Cada una se escribe por campos (nombre, sujeto, fuerza, condición, exigencia, control; plantilla de `scripts/lib/regla.mjs`, guía en `docs/ops/REDACCION.md`) y su frase sale de ellos. La tabla dice también quién la hace cumplir, con qué se comprueba y qué avisos de la guardia la citan. Un aviso que salta dice, en este orden, qué se niega, por qué, qué hacer en su lugar y a quién pedirlo, y deja en el registro de eventos su id y el de su norma.",
    "",
    "## Normas",
    "",
    "| Norma | Sujeto | Fuerza | Frase | Quién la hace cumplir | Control | Avisos de la guardia |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const n of normas) {
    const frase = fraseDeRegla(n, sujetos).replace(/ Se comprueba con: .*$/, "");
    const control = n.control_tipo === "juicio" ? "juicio" : n.control_tipo === "planos" ? `planos: ${n.criterio_planos}` : `${n.control_tipo}: \`${n.control}\``;
    const quien = `${n.ejecutor} · ${n.veredicto}`;
    const av = (porNorma[n.id] ?? []).map((a) => `\`${a}\``).join(", ") || "—";
    L.push(`| \`${n.id}\` | ${n.sujeto} | ${FUERZAS[n.fuerza].palabra} | ${celda(frase)} | ${quien} | ${celda(control)} | ${av} |`);
  }
  const contar = (campo) => Object.entries(normas.reduce((a, n) => ({ ...a, [n[campo]]: (a[n[campo]] ?? 0) + 1 }), {}));
  L.push("", "## Sujetos", "", "| Sujeto | En la frase | Normas |", "|---|---|---|");
  for (const [id, s] of Object.entries(sujetos)) L.push(`| ${id} | ${s.legible} | ${normas.filter((n) => n.sujeto === id).length} |`);
  L.push("", "## Cómo se comprueban", "", "| Tipo de control | Qué es | Normas |", "|---|---|---|");
  for (const [id, t] of Object.entries(CONTROL_TIPOS)) L.push(`| ${id} | ${celda(t.que)} | ${normas.filter((n) => n.control_tipo === id).length} |`);
  L.push("", "## Avisos de la guardia", "", "| Aviso | Norma | Qué se niega |", "|---|---|---|");
  for (const [id, a] of Object.entries(avisos)) L.push(`| \`${id}\` | \`${a.codigo}\` | ${celda(a.que)} |`);
  const v = contar("veredicto").map(([k, n]) => `${k} ${n}`).join(", ");
  L.push("", `Total: ${normas.length} normas (${v}) y ${Object.keys(avisos).length} avisos de la guardia.`, "");
  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

// ── Frases normativas ─────────────────────────────────────────────────────

/**
 * Palabras fuertes, que suelen anunciar una norma. Cada una con su clave (sin
 * tildes ni plurales) para contarlas. «solo» no está: es demasiado común y
 * daba ruido en cada PR (revisión del PR #349).
 *
 * Dos usos:
 * - El CI (scripts/normas-pr.mjs) mira solo las líneas AÑADIDAS por un PR en
 *   los ficheros vigilados: cada palabra fuerte cita su norma
 *   (`<!-- norma:<id> -->`) o el PR dice «Normas: sin novedades — <motivo>».
 * - La medición semanal (`npm run planos`) cuenta las que quedan sin citar en
 *   todo el repo, como una cifra que solo debe bajar.
 */
export const PALABRAS_NORMATIVAS = [
  ["nunca", "nunca"],
  ["siempre", "siempre"],
  ["maximo", "m[aá]xim[oa]s?"],
  ["tope", "topes?"],
  ["obligatorio", "obligatori[oa]s?"],
  ["exige", "exigen?"],
  ["ok_de_pablo", "ok de pablo"],
];
const LETRA = "[\\p{L}\\p{N}_]";
const REGEX_PALABRAS = PALABRAS_NORMATIVAS.map(([clave, p]) => [clave, new RegExp(`(?<!${LETRA})(?:${p})(?!${LETRA})`, "giu")]);
const REGEX_CITA = /<!--\s*norma:([a-z0-9-]+)\s*-->/g;

/** ¿Vigila el trinquete esta ruta? La misma lista que recorre `ficherosNormativos`. */
export function esVigilado(ruta) {
  const r = String(ruta).replace(/\\/g, "/");
  if (r === "CLAUDE.md" || r === "docs/datos/PRINCIPIOS.md") return true;
  if (/^\.claude\/(rules|skills|agents|commands)\/.+\.md$/.test(r)) return true;
  return /^ops\/[^/]+\.md$/.test(r);
}

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
 * Las palabras fuertes de una línea que no cubre ninguna cita. Cada cita
 * válida cubre UNA palabra: la última sin cubrir antes de ella (o, si no hay,
 * la primera después). Así una cita al final de una línea con dos normas no
 * tapa la segunda. Las citas a un id que no está en el registro no cubren
 * nada y se devuelven aparte.
 * { sueltas: [clave, …], citasMalas: [id, …] }
 */
export function frasesDeLinea(linea, ids) {
  const palabras = REGEX_PALABRAS.flatMap(([clave, re]) => [...linea.matchAll(re)].map((m) => ({ clave, pos: m.index, cubierta: false })))
    .sort((a, b) => a.pos - b.pos);
  const citasMalas = [];
  for (const m of linea.matchAll(REGEX_CITA)) {
    if (!ids.has(m[1])) { citasMalas.push(m[1]); continue; }
    const antes = palabras.filter((p) => !p.cubierta && p.pos < m.index).at(-1);
    const objetivo = antes ?? palabras.find((p) => !p.cubierta && p.pos > m.index);
    if (objetivo) objetivo.cubierta = true;
  }
  return { sueltas: palabras.filter((p) => !p.cubierta).map((p) => p.clave), citasMalas };
}

/** Cuenta, por palabra, las apariciones que no cubre ninguna cita en un texto entero. */
export function contarFrases(texto, ids) {
  const cuenta = {};
  const citasMalas = [];
  for (const linea of texto.split("\n")) {
    const r = frasesDeLinea(linea, ids);
    for (const c of r.sueltas) cuenta[c] = (cuenta[c] ?? 0) + 1;
    citasMalas.push(...r.citasMalas);
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

/** Total de apariciones de { ruta: { palabra: n } }. */
export function totalFrases(medida) {
  return Object.values(medida).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0);
}

// ── El paso del CI: solo las líneas añadidas del PR ───────────────────────

/**
 * Las líneas añadidas de un diff unificado (`git diff -U0`), en los ficheros
 * vigilados: [{ ruta, linea, texto }]. Un fichero renombrado solo trae lo que
 * cambió, y una línea borrada no cuenta: nada que regenerar. «+++ » solo es
 * cabecera justo después de «--- »: dentro de un trozo es una línea añadida
 * que empieza por «++ » (#351).
 */
export function lineasAnadidas(diff) {
  const fuera = [];
  let ruta = null;
  let n = 0;
  let anterior = "";
  for (const l of String(diff ?? "").replace(/\r/g, "").split("\n")) {
    const tras = anterior;
    anterior = l;
    if (l.startsWith("+++ ") && tras.startsWith("--- ")) {
      const r = l.slice(4).trim();
      ruta = r === "/dev/null" ? null : r.replace(/^b\//, "");
      continue;
    }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { n = Number(h[1]); continue; }
    if (l.startsWith("+") && ruta && esVigilado(ruta)) fuera.push({ ruta, linea: n++, texto: l.slice(1) });
    else if (l.startsWith(" ")) n++;
  }
  return fuera;
}

const BOTS = new Set(["dependabot[bot]", "github-actions[bot]"]);

/**
 * La línea «Normas: sin novedades — <motivo>» del cuerpo del PR, sin contar
 * comentarios HTML ni bloques de código (la plantilla puede traer ejemplos).
 * { presente: false } | { presente: true, motivo } | { presente: true, error }.
 */
export function lineaNormas(cuerpo) {
  const texto = String(cuerpo ?? "")
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|$(?![\s\S]))/gm, "");
  const m = texto.match(/^[ \t>*-]*(?:\*\*)?Normas(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(.*)$/im);
  if (!m) return { presente: false };
  const v = m[1].trim().match(/^sin novedades\s*(?:—|–|-|:)\s*(.{3,})$/i);
  if (!v) return { presente: true, error: `«Normas: ${m[1].trim()}» no vale: tiene que ser «Normas: sin novedades — <motivo>».` };
  return { presente: true, motivo: v[1].trim() };
}

/**
 * Decide el paso del CI. `diff` es el de la base del PR a su cabeza; `ids`,
 * los de ops/normas.json. { ok, motivo, sueltas: [{ ruta, linea, palabras }] }.
 */
export function comprobarNormasPr({ diff, cuerpo = "", autor = "", ids }) {
  if (BOTS.has(String(autor).toLowerCase())) return { ok: true, motivo: "PR de un bot: exento.", sueltas: [] };
  const sueltas = [];
  const citasMalas = [];
  for (const a of lineasAnadidas(diff)) {
    const r = frasesDeLinea(a.texto, ids);
    if (r.sueltas.length) sueltas.push({ ruta: a.ruta, linea: a.linea, palabras: r.sueltas });
    for (const c of r.citasMalas) citasMalas.push(`${a.ruta}:${a.linea} norma:${c}`);
  }
  // Una cita a una norma que no existe falla siempre: «sin novedades» no la arregla.
  if (citasMalas.length) return { ok: false, motivo: `Cita a una norma que no está en ops/normas.json: ${citasMalas.join(", ")}.`, sueltas };
  if (!sueltas.length) return { ok: true, motivo: "Ninguna línea añadida con palabras fuertes sin citar.", sueltas };
  const l = lineaNormas(cuerpo);
  if (l.presente && l.motivo) return { ok: true, motivo: `Normas: sin novedades — ${l.motivo} (${sueltas.length} líneas)`, sueltas };
  const donde = sueltas.slice(0, 5).map((s) => `${s.ruta}:${s.linea} («${s.palabras.join("», «")}»)`).join("; ");
  const ayuda = "Cita la norma en la misma línea (<!-- norma:<id> -->, alta en ops/normas.json si no está) o, si no es una norma, pon en el cuerpo del PR «Normas: sin novedades — <motivo>».";
  return { ok: false, motivo: `${l.error ? `${l.error} ` : ""}${sueltas.length} líneas añadidas con palabras fuertes sin citar norma: ${donde}. ${ayuda}`, sueltas };
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

/** Cierres de GitHub (`stateReason`) que no son un arreglo: no se cuentan como fondos sin test. */
export const CIERRES_SIN_ARREGLO = ["NOT_PLANNED", "DUPLICATE"];

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
    fondos_cerrados_sin_test: fondos.filter((f) => !abierto(f) && !CIERRES_SIN_ARREGLO.includes(String(f.stateReason ?? "").toUpperCase())
      && !etiquetasDe(f).some((l) => ARREGLOS_CON_TEST.includes(l))).length,
  };
}

/** Recuento por veredicto, por riesgo y por tipo de control: las cifras de partida. */
export function recuento(normas) {
  const por = (campo, vocab) => Object.fromEntries(Object.keys(vocab).map((k) => [k, normas.filter((n) => n[campo] === k).length]));
  return { total: normas.length, veredicto: por("veredicto", VEREDICTOS), riesgo: por("riesgo", RIESGOS), control_tipo: por("control_tipo", CONTROL_TIPOS) };
}
