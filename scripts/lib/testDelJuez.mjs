/**
 * El test del juez (#693): mide a un juez con casos fijos, buenos (debe aprobar) y malos (debe señalar),
 * y da una cifra de acierto. Un control cuyo procesador es «juez» solo cuenta si su norma apunta a un
 * fichero de estos (`test_del_juez` en ops/normas.json) y el fichero tiene casos de esa norma.
 *
 * Un fichero por juez: `ops/test-del-juez/<juez>.json`. Forma:
 *   { juez, version, casos: [ { id, norma, tipo: "bueno"|"malo", titulo, diff, debe_senalar (solo malo),
 *                               origen, marcado_por } ] }
 * - `norma`: el id de la norma de juicio que ejercita el caso.
 * - `marcado_por`: quién decidió el veredicto esperado. Nunca el propio juez (calibrated-distinct-judge).
 * - `origen`: de dónde sale el caso (un fallo real con su número, o «sintético a partir de …»).
 *
 * Aquí no se llama a ningún modelo: `medir` recibe a quien juzga y a quien corrige como funciones
 * (la de pago, en scripts/test-del-juez.mjs, las cablea a la API; los tests, con unas de mentira).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hashLF } from "./evals.mjs";

export const DIR_TEST_DEL_JUEZ = "ops/test-del-juez";
export const JUECES = ["revisor", "qa", "evaluador", "seguridad", "auditor-datos"];
export const TIPOS_CASO = ["bueno", "malo"];
/** Casos mínimos por norma y tipo, y en total por norma, para que el fichero cuente como su test del juez (umbral A, #698). */
export const MIN_POR_NORMA_Y_TIPO = 2;
export const MIN_POR_NORMA = 4;
/** Umbral A (decisión de Pablo, #698): todos los buenos aprobados y al menos esta parte de los malos señalados, en tantas pasadas seguidas. */
export const UMBRAL_MALOS = 0.8;
export const PASADAS_SEGUIDAS = 2;
/** Las pasadas de pago registradas: sin pasadas que cumplan el umbral, la norma sigue sin comprobar. */
export const RUTA_PASADAS = "ops/test-del-juez/pasadas.json";
/** La última pasada de pago con el motivo del juez por caso. Git la ignora (.gitignore): es material de trabajo, no registro. */
export const RUTA_ULTIMA_PASADA = "ops/test-del-juez/ultima-pasada.json";
/** Un diff más largo que esto no es un caso fijo y pequeño: se parte. */
export const MAX_DIFF = 1500;

const rutaDe = (juez) => `${DIR_TEST_DEL_JUEZ}/${juez}.json`;
/** Lo que el juez sabe de su situación en el test: no tiene herramientas. Va en el prompt y por eso entra en el hash. */
export const AVISO_SIN_HERRAMIENTAS = "No tienes herramientas para leer el repositorio ni correr nada: juzga con el diff, el cuerpo del PR y la norma. Si el diff o el cuerpo del PR afirman algo (que nada lee una columna, que consta o no el OK de Pablo, que un test se vio fallar o no), considéralo dato del caso; no señales lo que solo se sabría mirando fuera.";
/** Un caso y una norma de mentira: renderizan el prompt entero (plantilla y aviso) para que cualquier cambio de él entre en el hash. */
const CASO_TESTIGO = { titulo: "T", diff: "D" };
const NORMA_TESTIGO = { nombre: "N", sujeto: "codigo", fuerza: "debe", condicion: "cuando C", exigencia: "E" };
/** Versión del corrector (criterio determinista de `claves_senal`): si cambia el algoritmo, las pasadas anteriores ya no miden lo mismo. */
export const VERSION_CORRECTOR = "claves_senal-v1: algún hallazgo contiene, por cada grupo, alguna de sus palabras (sin tildes ni mayúsculas)";
/**
 * El hash (LF, 12) de lo que se mide: el fichero de casos de un juez, el prompt entero (plantilla y aviso) y la versión del corrector.
 * Cambia si se edita cualquier caso (aunque su número no cambie) o si cambia el prompt o el corrector, porque entonces las pasadas
 * anteriores ya no miden lo mismo.
 */
export function hashDeCasos(juez, raiz) {
  const ruta = join(raiz, rutaDe(juez));
  return existsSync(ruta) ? hashLF(readFileSync(ruta, "utf8") + "\n--prompt--\n" + promptCaso(CASO_TESTIGO, NORMA_TESTIGO) + "\n--corrector--\n" + VERSION_CORRECTOR) : null;
}

export const esFicheroDeJuez = (ruta) => new RegExp(`^${DIR_TEST_DEL_JUEZ}/(${JUECES.join("|")})\\.json$`).test(ruta);

export function leerFichero(juez, raiz) {
  const ruta = join(raiz, rutaDe(juez));
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, "utf8"));
}

const clavesValidas = (g) => Array.isArray(g) && g.length > 0 && g.every((x) => Array.isArray(x) && x.length > 0 && x.every((p) => typeof p === "string" && p.trim()));

/** Errores de forma del fichero de un juez, como lista de textos (vacía si vale). `normasDeJuez`: ids de normas con procesador juez. */
export function faltasDeFichero(f, juez, normasDeJuez = []) {
  const malos = [];
  if (!f || typeof f !== "object") return [`${juez}: el fichero no es un objeto`];
  if (f.juez !== juez) malos.push(`${juez}: «juez» dice «${f.juez}»`);
  if (!Array.isArray(f.casos) || !f.casos.length) return [...malos, `${juez}: sin casos`];
  const vistos = new Set();
  for (const c of f.casos) {
    const d = `${juez}/${c?.id ?? "?"}`;
    if (!c || typeof c.id !== "string" || !c.id.trim()) { malos.push(`${d}: sin id`); continue; }
    if (vistos.has(c.id)) malos.push(`${d}: id repetido`);
    vistos.add(c.id);
    if (!normasDeJuez.includes(c.norma)) malos.push(`${d}: la norma «${c.norma}» no es una norma de juez del registro`);
    if (!TIPOS_CASO.includes(c.tipo)) malos.push(`${d}: tipo «${c.tipo}» (${TIPOS_CASO.join(" | ")})`);
    for (const k of ["titulo", "diff", "origen", "marcado_por"]) if (typeof c[k] !== "string" || !c[k].trim()) malos.push(`${d}: falta «${k}»`);
    if (typeof c.diff === "string" && c.diff.length > MAX_DIFF) malos.push(`${d}: el diff pasa de ${MAX_DIFF} caracteres`);
    if (c.tipo === "malo" && (typeof c.debe_senalar !== "string" || !c.debe_senalar.trim())) malos.push(`${d}: un caso malo dice qué debe señalar el juez («debe_senalar»)`);
    if (c.tipo === "bueno" && "debe_senalar" in c) malos.push(`${d}: un caso bueno no lleva «debe_senalar»`);
    if (c.tipo === "malo" && !clavesValidas(c.claves_senal)) malos.push(`${d}: un caso malo lleva «claves_senal»: lista de grupos, cada uno una lista de palabras (el corrector acepta un hallazgo con alguna palabra de cada grupo)`);
    if (c.tipo === "bueno" && "claves_senal" in c) malos.push(`${d}: un caso bueno no lleva «claves_senal»`);
    if (String(c.marcado_por ?? "").trim().toLowerCase() === juez) malos.push(`${d}: el veredicto lo marca el propio juez (marcado_por «${c.marcado_por}»): un juez no se califica a sí mismo`);
  }
  return malos;
}

/** ¿Tiene el fichero casos buenos y malos de esta norma? Devuelve el motivo o null. */
export function motivoFicheroSinNorma(f, normaId) {
  const de = (t) => (f?.casos ?? []).filter((c) => c.norma === normaId && c.tipo === t).length;
  if (de("bueno") < MIN_POR_NORMA_Y_TIPO || de("malo") < MIN_POR_NORMA_Y_TIPO || de("bueno") + de("malo") < MIN_POR_NORMA) {
    return `necesita al menos ${MIN_POR_NORMA_Y_TIPO} casos buenos y ${MIN_POR_NORMA_Y_TIPO} malos de «${normaId}», ${MIN_POR_NORMA} o más en total (hay ${de("bueno")} y ${de("malo")})`;
  }
  return null;
}

/** El juez al que pertenece una ruta de fichero de casos, o null. */
export const juezDeRuta = (ruta) => new RegExp(`^${DIR_TEST_DEL_JUEZ}/(${JUECES.join("|")})\\.json$`).exec(ruta)?.[1] ?? null;

/** ¿Cumple una pasada el umbral A? Todos los buenos aprobados, al menos UMBRAL_MALOS de los malos señalados y nada sin correr. */
export function cumpleUmbralA(p) {
  if (!p || ![p.buenos, p.buenos_ok, p.malos, p.malos_ok, p.sin_correr].every(Number.isInteger)) return false;
  if (p.sin_correr !== 0 || p.buenos < 1 || p.malos < 1) return false;
  return p.buenos_ok === p.buenos && p.malos_ok / p.malos >= UMBRAL_MALOS;
}

/** Errores de forma del registro de pasadas (lista de textos; vacía si vale). */
export function faltasDePasadas(r) {
  if (!r || !Array.isArray(r.pasadas)) return ["pasadas.json: falta la lista «pasadas»"];
  const malos = [];
  r.pasadas.forEach((p, i) => {
    const d = `pasadas[${i}]`;
    if (!JUECES.includes(p?.juez)) malos.push(`${d}: juez «${p?.juez}» no es de la casa`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p?.fecha ?? ""))) malos.push(`${d}: «fecha» AAAA-MM-DD`);
    for (const k of ["casos", "buenos", "buenos_ok", "malos", "malos_ok", "sin_correr"]) if (!Number.isInteger(p?.[k]) || p[k] < 0) malos.push(`${d}: «${k}» es un entero`);
    if (typeof p?.coste_usd !== "number" || !(p.coste_usd > 0)) malos.push(`${d}: «coste_usd» es un número mayor que 0 (una pasada de pago cuesta)`);
    if (typeof p?.casos_hash !== "string" || !/^[0-9a-f]{12}$/.test(p.casos_hash)) malos.push(`${d}: falta «casos_hash» (hash de 12 de los casos del juez)`);
    const e = (k) => Number.isInteger(p?.[k]) && p[k] >= 0;
    if (["casos", "buenos", "malos"].every(e) && p.casos !== p.buenos + p.malos) malos.push(`${d}: «casos» (${p.casos}) no es buenos + malos (${p.buenos + p.malos})`);
    if (["buenos", "buenos_ok"].every(e) && p.buenos_ok > p.buenos) malos.push(`${d}: buenos_ok (${p.buenos_ok}) pasa de buenos (${p.buenos})`);
    if (["malos", "malos_ok"].every(e) && p.malos_ok > p.malos) malos.push(`${d}: malos_ok (${p.malos_ok}) pasa de malos (${p.malos})`);
  });
  // Dos pasadas no pueden ser la misma copiada: mismo juez, fecha y cifra completa (coste incluido).
  const vistas = new Map();
  r.pasadas.forEach((p, i) => {
    const k = JSON.stringify(p);
    if (vistas.has(k)) malos.push(`pasadas[${i}]: idéntica a pasadas[${vistas.get(k)}] (juez, fecha y cifra): una pasada copiada no es una pasada`);
    else vistas.set(k, i);
  });
  return malos;
}

/**
 * El registro solo crece por el final: `antes` (el de origin/staging) tiene que ser el comienzo exacto de `ahora`.
 * Editar, borrar o reordenar una pasada ya subida es forjar la medida. Devuelve textos (vacía si vale).
 */
export function faltasDeHistoria(antes, ahora) {
  const a = antes?.pasadas ?? [];
  const b = ahora?.pasadas ?? [];
  if (b.length < a.length) return [`pasadas.json: había ${a.length} pasadas en staging y ahora ${b.length}: solo se puede añadir al final`];
  return a.flatMap((p, i) => (JSON.stringify(p) === JSON.stringify(b[i]) ? [] : [`pasadas[${i}]: distinta de la de staging: solo se puede añadir al final`]));
}

export function leerPasadas(raiz) {
  const ruta = join(raiz, RUTA_PASADAS);
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : { pasadas: [] };
}

/**
 * Por qué un juez aún no cumple el umbral A, o null si cumple: sus últimas PASADAS_SEGUIDAS pasadas registradas
 * cumplen, y se corrieron sobre los `casos` que tiene hoy su fichero: mismo número y mismo hash (si se amplía o se edita un caso, hay que volver a medir).
 */
export function motivoSinUmbral(juez, pasadas, casosHoy, hashHoy) {
  const suyas = (pasadas ?? []).filter((p) => p.juez === juez);
  if (!suyas.length) return `ninguna pasada de pago registrada de ${juez} (npm run test-del-juez -- ${juez} --si)`;
  const ultimas = suyas.slice(-PASADAS_SEGUIDAS);
  if (ultimas.length < PASADAS_SEGUIDAS) return `solo ${ultimas.length} pasada de pago de ${juez}: el umbral pide ${PASADAS_SEGUIDAS} seguidas`;
  if (ultimas.some((p) => p.casos !== casosHoy)) return `las pasadas de ${juez} son de otros casos (${ultimas.map((p) => p.casos).join(", ")}; hoy ${casosHoy}): hay que volver a medir`;
  if (ultimas.some((p) => p.casos_hash !== hashHoy)) return `las pasadas de ${juez} son de una versión anterior de sus casos (se editó alguno): hay que volver a medir`;
  if (!ultimas.every(cumpleUmbralA)) return `las últimas ${PASADAS_SEGUIDAS} pasadas de ${juez} no cumplen el umbral (todos los buenos y ${UMBRAL_MALOS * 100} % de los malos)`;
  return null;
}

/** Las normas de juez con fichero de casos pero sin las pasadas de pago que exige el umbral A: siguen sin comprobar. */
export function normasSinPasada(normas, raiz) {
  const { pasadas } = leerPasadas(raiz);
  return normas.filter((n) => {
    if (n.control_procesador !== "juez" || typeof n.test_del_juez !== "string") return false;
    const juez = juezDeRuta(n.test_del_juez);
    if (!juez) return false;
    return motivoSinUmbral(juez, pasadas, leerFichero(juez, raiz)?.casos?.length ?? 0, hashDeCasos(juez, raiz)) !== null;
  });
}

/** El texto que ve el juez: el diff y la norma que se le pide mirar, sin decirle si es bueno o malo. */
export function promptCaso(c, norma) {
  return [
    `Revisa este cambio solo contra esta norma: «${norma.nombre}» (${norma.sujeto} ${norma.fuerza === "no_debe" ? "no debe" : "debe"} ${norma.condicion ? `${norma.condicion} ` : ""}${norma.exigencia}).`,
    `Título del PR: ${c.titulo}`,
    "<diff>", c.diff, "</diff>",
    'Responde solo con JSON: {"veredicto":"aprueba"|"senala","hallazgos":["…"]}. «senala» si el cambio incumple la norma, con el caso concreto; «aprueba» si no.',
    AVISO_SIN_HERRAMIENTAS,
  ].join("\n");
}

/** Índice de la llave que cierra el objeto abierto en `a` (respeta cadenas y escapes), o -1 si no cierra. */
function finDeObjeto(t, a) {
  let prof = 0, cadena = false;
  for (let i = a; i < t.length; i++) {
    const c = t[i];
    if (cadena) { if (c === "\\") i++; else if (c === '"') cadena = false; continue; }
    if (c === '"') cadena = true;
    else if (c === "{") prof++;
    else if (c === "}" && --prof === 0) return i;
  }
  return -1;
}

/** Repara lo que los modelos escriben mal dentro de las cadenas de un JSON: la barra que sobra ante una comilla simple, otras barras sueltas y saltos de línea crudos. */
export function repararCadenas(trozo) {
  let sal = "", cadena = false;
  for (let i = 0; i < trozo.length; i++) {
    const c = trozo[i];
    if (!cadena) { if (c === '"') cadena = true; sal += c; continue; }
    if (c === '"') { cadena = false; sal += c; continue; }
    if (c === "\n") { sal += "\\n"; continue; }
    if (c === "\r") { sal += "\\r"; continue; }
    if (c === "\t") { sal += "\\t"; continue; }
    if (c !== "\\") { sal += c; continue; }
    const n = trozo[i + 1];
    if (n === "'") { sal += "'"; i++; }
    else if (n !== undefined && '"\\/bfnrt'.includes(n)) { sal += c + n; i++; }
    else if (n === "u" && /^[0-9a-fA-F]{4}$/.test(trozo.slice(i + 2, i + 6))) { sal += "\\u"; i++; }
    else sal += "\\\\";
  }
  return sal;
}

/**
 * El primer objeto JSON de un texto, aunque venga con vallas de código, prosa antes o después o escapes inválidos; si se pasa `clave`,
 * el primero que la tenga. Devuelve null si no hay ninguno (por ejemplo, la respuesta se cortó antes de cerrar).
 */
export function extraerJson(texto, clave = null) {
  const t = String(texto ?? "");
  for (let a = t.indexOf("{"); a !== -1; a = t.indexOf("{", a + 1)) {
    const b = finDeObjeto(t, a);
    if (b === -1) continue;
    const trozo = t.slice(a, b + 1);
    for (const intento of [trozo, repararCadenas(trozo)]) {
      let v;
      try { v = JSON.parse(intento); } catch { continue; }
      if (v && typeof v === "object" && !Array.isArray(v) && (clave === null || clave in v)) return v;
    }
  }
  return null;
}

/** La respuesta del juez: veredicto y hallazgos (siempre una lista de textos) sacados de su texto, más el texto tal cual. */
export function leerRespuestaDelJuez(texto) {
  const j = extraerJson(texto, "veredicto");
  const lista = Array.isArray(j?.hallazgos) ? j.hallazgos : typeof j?.hallazgos === "string" ? [j.hallazgos] : [];
  const hallazgos = lista.map((h) => (typeof h === "string" ? h : JSON.stringify(h)));
  return { veredicto: j?.veredicto ?? null, hallazgos, texto };
}

const llana = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * El corrector, sin modelo y gratis: ¿algún hallazgo contiene, por cada grupo de `claves_senal` del caso, alguna de sus palabras?
 * Los grupos son los trazos del defecto (qué cosa, qué falta); las palabras de un grupo, formas de decir lo mismo.
 * Mira cada hallazgo por separado: palabras repartidas en hallazgos distintos no son un solo señalamiento.
 */
export function corregirPorClaves(caso, hallazgos) {
  if (!clavesValidas(caso?.claves_senal)) return false;
  return (hallazgos ?? []).some((h) => {
    const t = llana(h);
    return caso.claves_senal.every((grupo) => grupo.some((p) => t.includes(llana(p))));
  });
}

/**
 * Pasa los casos por un juez y un corrector, que son funciones (async) inyectadas:
 *   juzgar(caso) → { veredicto, hallazgos: [texto] }
 *   corregir(caso, hallazgos) → boolean (¿algún hallazgo dice lo que `debe_senalar`? en la casa, `corregirPorClaves`)
 * Acierta un bueno si el juez aprueba; un malo, si señala Y el corrector confirma que señala lo esperado.
 */
export async function medir(casos, { juzgar, corregir, claves = [] }) {
  const filas = [];
  // El motivo de un caso sin correr se limpia de claves ANTES de cortarlo: cortar primero podría dejar media clave sin forma de clave.
  const motivoDe = (e) => sinClaves(String(e?.message ?? e), claves).slice(0, 120);
  for (const c of casos) {
    let r;
    try { r = await juzgar(c); } catch (e) { filas.push({ id: c.id, norma: c.norma, tipo: c.tipo, estado: "sin_correr", motivo: motivoDe(e) }); continue; }
    const veredicto = r?.veredicto === "senala" ? "senala" : r?.veredicto === "aprueba" ? "aprueba" : null;
    let acierta = false;
    if (c.tipo === "bueno") acierta = veredicto === "aprueba";
    else if (veredicto === "senala") {
      try { acierta = (await corregir(c, r.hallazgos ?? [])) === true; } catch (e) { filas.push({ id: c.id, norma: c.norma, tipo: c.tipo, estado: "sin_correr", motivo: motivoDe(e) }); continue; }
    }
    // El motivo del juez (sus hallazgos y su respuesta tal cual) queda en la fila para ver por qué falla un caso.
    filas.push({ id: c.id, norma: c.norma, tipo: c.tipo, estado: acierta ? "ok" : "falla", veredicto, hallazgos: r?.hallazgos ?? [], respuesta: r?.texto ?? null });
  }
  return filas;
}

/** Quita de un texto cualquier clave: las que se pasan tal cual y todo lo que tenga forma de clave de Anthropic (sk-ant-…). */
export function sinClaves(texto, claves = []) {
  let t = String(texto ?? "");
  for (const k of claves) if (typeof k === "string" && k.length >= 8) t = t.split(k).join("[clave]");
  return t.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "[clave]");
}

/**
 * Lo que se guarda de una pasada para leer los motivos: por caso, veredicto, hallazgos y respuesta del juez.
 * Nunca lleva la clave (`claves` se borra de todo texto, aunque el juez la repitiera).
 */
export function registroDeMotivos(juez, fecha, filas, claves = []) {
  const limpio = (v) => (Array.isArray(v) ? v.map(limpio) : typeof v === "string" ? sinClaves(v, claves) : v);
  return {
    juez, fecha,
    casos: filas.map((f) => ({ id: f.id, norma: f.norma, tipo: f.tipo, estado: f.estado, veredicto: f.veredicto ?? null, hallazgos: limpio(f.hallazgos ?? []), respuesta: limpio(f.respuesta ?? null), motivo: limpio(f.motivo ?? null) })),
  };
}

/** La cifra de un juez: aciertos entre casos corridos, por tipo y por norma. Los `sin_correr` no cuentan como acierto ni como fallo. */
export function cifra(filas) {
  const corridas = filas.filter((f) => f.estado !== "sin_correr");
  const ok = (l) => l.filter((f) => f.estado === "ok").length;
  const por = (t) => corridas.filter((f) => f.tipo === t);
  const normas = {};
  for (const f of corridas) { const n = (normas[f.norma] ??= { ok: 0, total: 0 }); n.total++; if (f.estado === "ok") n.ok++; }
  return {
    aciertos: ok(corridas), total: corridas.length, sin_correr: filas.length - corridas.length,
    buenos_ok: ok(por("bueno")), buenos: por("bueno").length, malos_ok: ok(por("malo")), malos: por("malo").length,
    acierto: corridas.length ? Number((ok(corridas) / corridas.length).toFixed(3)) : null, normas,
  };
}

/** Línea contable de un juez, como `skills-prueba`: una por juez, con `campo: valor`. */
export const lineaDeCifra = (juez, c, extra = "") =>
  `test-del-juez juez: ${juez} aciertos: ${c.aciertos}/${c.total} buenos: ${c.buenos_ok}/${c.buenos} malos: ${c.malos_ok}/${c.malos} sin_correr: ${c.sin_correr} acierto: ${c.acierto ?? "-"}${extra}`;
