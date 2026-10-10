/**
 * medirTiempo.mjs — cómo mide tiempo un test sin dar rojos falsos bajo carga (#499, fondo #176).
 *
 * La clase: todo test que compara una duración con un tope fijo sin 20× de
 * margen sobre lo que tarda suelto, o con una sola medida, falla cuando varias
 * sesiones corren tests a la vez (#407: una razón con umbral 8× falló cuatro
 * veces; #499: el mejor de tres dio 4 s frente a un tope de 800 ms medido en
 * ~100 ms, así que la carga duró las tres medidas). La regla está en
 * `.claude/rules/tests.md`; la hace cumplir `ops/testsDeTiempo.test.js`
 * (vigilante de ops/vigilantes.json) con el escáner de abajo.
 *
 * Los caminos que acepta el vigilante:
 *  1. La utilidad: `expect(medianaMs(fn)).toBeLessThan(topeMs(suelto))`. La
 *     mediana de varias repeticiones aguanta un pico de carga suelto, y
 *     `topeMs` pone el tope a MARGEN veces lo medido suelto (con un suelo). Lo
 *     que no se puede repetir (deja procesos hijos vivos) va con `{ n: 1 }`.
 *     Lo que lanza procesos sufre una carga que dura toda la tanda: su tope
 *     se calibra con un testigo medido justo antes (`topeConTestigo`), y así
 *     crece con la carga de la máquina pero no con la lentitud propia del código.
 *  2. Una medida a mano que no cabe en la utilidad, con la marca en las líneas de antes:
 *     `// tiempo: margen 25x medido 2026-10-10 (suelto ~160 ms, tope 4000 ms)`.
 *     El número es la razón tope / suelto, y no baja de MARGEN.
 *  3. En la misma línea o en la de antes, y solo ahí:
 *     - `// tiempo: sin tope — <por qué>`: se mide para informar (un banco de
 *       resistencia) o para una razón entre dos medidas, no contra un tope;
 *     - `// tiempo: relación — <por qué>`: se compara con otra medida de la misma
 *       ejecución (el primer texto antes que el turno entero), no con un número.
 *
 * Con `MENUPLAN_TIEMPOS=1` (a la consola) o `MENUPLAN_TIEMPOS=<fichero>` (se
 * añade ahí), cada medida con etiqueta deja una línea contable
 * (`tiempo etiqueta: … mediana_ms: … n: …`) para volver a medir lo suelto.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

/** El margen mínimo entre el tope y lo que tarda suelto. */
export const MARGEN = 20;
/** Repeticiones por defecto de una mediana: un pico de carga no la mueve. */
export const REPETICIONES = 5;
/**
 * Ningún tope por debajo de esto: por debajo, una pausa del recolector o del
 * planificador pesa más que lo medido (medido el 2026-10-10 con otras sesiones:
 * operaciones de 1 a 3 ms con medianas de hasta 12 ms). Un ReDoS o una espera
 * de más tardan segundos: 100 ms los sigue cazando.
 */
export const SUELO_MS = 100;
/**
 * Lo que tarda suelto el testigo (`node -e ""`, mediana de 9: 56 ms, medido el
 * 2026-10-10 en el PC de Pablo). En una máquina más rápida (el CI) la razón
 * sale por debajo de 1 y no cuenta: el tope nunca baja de MARGEN × suelto.
 */
export const TESTIGO_SUELTO_MS = 56;

const ahora = () => performance.now();

/** La mediana de una lista de números. */
export function mediana(valores) {
  const s = [...valores].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Deja una línea contable por el canal de MENUPLAN_TIEMPOS (consola con «1», o el fichero que nombra). */
function emitir(linea) {
  const destino = process.env.MENUPLAN_TIEMPOS;
  if (!destino) return;
  // El informe de vitest de este repo no enseña la consola de los tests: con una ruta, la línea va a ese fichero.
  if (destino === "1") console.log(linea);
  else appendFileSync(destino, `${linea}\n`);
}

function anotar(etiqueta, ms, n) {
  if (etiqueta) emitir(`tiempo etiqueta: ${etiqueta} mediana_ms: ${ms.toFixed(1)} n: ${n}`);
}

/** Mediana, en ms, de `n` ejecuciones de `fn` (síncrona). */
export function medianaMs(fn, { n = REPETICIONES, etiqueta } = {}) {
  const t = [];
  for (let i = 0; i < n; i++) {
    const t0 = ahora();
    fn(i);
    t.push(ahora() - t0);
  }
  const ms = mediana(t);
  anotar(etiqueta, ms, n);
  return ms;
}

/** Mediana, en ms, de `n` ejecuciones de `fn` (asíncrona), una detrás de otra. */
export async function medianaMsAsync(fn, { n = REPETICIONES, etiqueta } = {}) {
  const t = [];
  for (let i = 0; i < n; i++) {
    const t0 = ahora();
    await fn(i);
    t.push(ahora() - t0);
  }
  const ms = mediana(t);
  anotar(etiqueta, ms, n);
  return ms;
}

/**
 * El tope para algo que tarda `sueltoMs` sin carga: MARGEN veces más, y nunca
 * menos de SUELO_MS. Si lo medido incluye una espera a propósito que la carga
 * no alarga (el tope de un proceso hijo, un temporizador), esa espera va en
 * `fijoMs` y `sueltoMs` es solo lo que varía (lo medido menos la espera): el
 * margen se aplica a lo que la carga sí alarga, no a la espera.
 */
export function topeMs(sueltoMs, { fijoMs = 0 } = {}) {
  if (!(Number(sueltoMs) > 0)) throw new Error(`topeMs: lo medido suelto tiene que ser un número positivo de ms (llegó ${sueltoMs})`);
  if (!(Number(fijoMs) >= 0)) throw new Error(`topeMs: la espera fija tiene que ser un número de ms (llegó ${fijoMs})`);
  return fijoMs + Math.max(MARGEN * sueltoMs, SUELO_MS);
}

/** Mediana, en ms, de arrancar un `node -e ""` vacío: cuánto pesa ahora arrancar un proceso. */
export function testigoMs({ n = 3, etiqueta = "testigo-node" } = {}) {
  return medianaMs(() => spawnSync(process.execPath, ["-e", ""], { windowsHide: true, stdio: "ignore" }), { n, etiqueta });
}

/**
 * El tope de algo que lanza procesos, calibrado con el testigo de la misma
 * tanda: MARGEN × suelto × max(1, testigoAhora / testigoSuelto), más la espera
 * fija. Si la máquina va el triple de lenta (el testigo tarda el triple), el
 * tope crece el triple; si es el código el que se vuelve lento con la máquina
 * libre, el testigo no se mueve y el tope de siempre lo caza.
 */
export function topeConTestigo(sueltoMs, { testigoAhoraMs, testigoSueltoMs = TESTIGO_SUELTO_MS, fijoMs = 0 } = {}) {
  if (!(Number(testigoAhoraMs) > 0) || !(Number(testigoSueltoMs) > 0)) throw new Error(`topeConTestigo: hace falta el testigo de ahora y el suelto, en ms (llegaron ${testigoAhoraMs} y ${testigoSueltoMs})`);
  return topeMs(sueltoMs * cargaDelTestigo(testigoAhoraMs, testigoSueltoMs), { fijoMs });
}

/**
 * A partir de esta carga (el testigo tarda SATURACION veces lo suelto), la
 * máquina está saturada y una medida no dice nada del código: en #499 la carga
 * fue de ~44× y los tests caían por el tiempo máximo de vitest o por los topes
 * internos del código (el aviso de la guardia, 1500 ms), no por el suyo.
 */
export const SATURACION = 10;

/**
 * ¿Está saturada la máquina según el testigo de la misma tanda? Si lo está, deja
 * la línea `tiempo: maquina-saturada testigo_ms: … factor: … etiqueta: …` por el
 * canal de MENUPLAN_TIEMPOS, y el test no compara el tiempo (sigue comprobando
 * lo funcional): `if (!maquinaSaturada(testigo, { etiqueta })) expect(ms).toBeLessThan(tope);`.
 */
export function maquinaSaturada(testigoAhoraMs, { testigoSueltoMs = TESTIGO_SUELTO_MS, etiqueta = "-" } = {}) {
  if (!(Number(testigoAhoraMs) > 0) || !(Number(testigoSueltoMs) > 0)) throw new Error(`maquinaSaturada: hace falta el testigo de ahora y el suelto, en ms (llegaron ${testigoAhoraMs} y ${testigoSueltoMs})`);
  const factor = testigoAhoraMs / testigoSueltoMs;
  if (factor <= SATURACION) return false;
  emitir(`tiempo: maquina-saturada testigo_ms: ${testigoAhoraMs.toFixed(1)} factor: ${factor.toFixed(1)} etiqueta: ${etiqueta}`);
  return true;
}

/** Cuánto va más lenta la máquina que el día de la medida, según el testigo (nunca menos de 1). */
export function cargaDelTestigo(testigoAhoraMs, testigoSueltoMs = TESTIGO_SUELTO_MS) {
  return Math.max(1, testigoAhoraMs / testigoSueltoMs);
}

// ── El escáner del vigilante ────────────────────────────────────────────────

/**
 * Ficheros de test que el vigilante deja pasar sin cumplir: { ruta, motivo }.
 * Solo baja: ops/testsDeTiempo.test.js exige que esté vacía (0 el 10 oct 2026).
 * Una medida nueva se arregla con la utilidad, no se añade aquí.
 */
export const EXCEPCIONES_TIEMPO = [];

/** Cuántas líneas antes de la medida puede estar su marca de margen. */
export const LINEAS_MARCA = 12;

const ID = String.raw`[A-Za-z_$][\w$]*`;
/** Una lectura del reloj. */
const RELOJ = String.raw`(?:performance\.now\(\)|Date\.now\(\)|new Date\(\))`;
/**
 * Una medida de duración a mano: un reloj menos un nombre (no una cuenta de
 * fechas como `Date.now() - 8 * 86400000`), o `process.hrtime`.
 */
const MEDIDA = new RegExp(String.raw`${RELOJ}\s*-\s*${ID}(?:\.${ID})*(?!\s*[*/(\w$.])|process\.hrtime`);
const MARCA_MARGEN = /\/\/\s*tiempo:\s*margen\s+(\d+(?:[.,]\d+)?)x\s+medido\s+(\d{4}-\d{2}-\d{2})/;
const MARCA_CERCA = /\/\/\s*tiempo:\s*(sin tope|relaci[oó]n)\b/;
/** Un nombre de duración: `ms`, `…Ms` o `…_ms`, solo o como propiedad. */
const NOMBRE_DURACION = /(?:^|[.\s(])(?:ms|\w*Ms|\w*_ms)\s*$/;

const fechaReal = (f) => {
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
};

/** Los nombres a los que se asigna lo que devuelve alguna de `funciones` (`const x = await medianaMs(…)`). */
function nombresDe(texto, patron) {
  const r = new RegExp(String.raw`(?:(?:const|let|var)\s+)?(${ID})\s*=\s*(?:await\s+)?(?:${patron})`, "g");
  return new Set([...texto.matchAll(r)].map((m) => m[1]));
}

/** El texto dentro de los paréntesis que abren en `desde`, y dónde acaba. */
function entreParentesis(texto, desde) {
  let nivel = 0;
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")" && --nivel === 0) return { dentro: texto.slice(desde + 1, i), fin: i + 1 };
  }
  return { dentro: texto.slice(desde + 1), fin: texto.length };
}

/** El primer argumento (hasta la primera coma de nivel 0). */
function primerArgumento(s) {
  let nivel = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ("([{".includes(c)) nivel++;
    else if (")]}".includes(c)) nivel--;
    else if (c === "," && nivel === 0) return s.slice(0, i);
  }
  return s;
}

const LLAMADA_TOPE = /^(?:topeMs|topeConTestigo)\s*\(/;

/** ¿El texto es entero una llamada a topeMs o topeConTestigo (nada antes ni después)? */
function esLlamadaEntera(texto) {
  const t = String(texto).trim();
  const m = t.match(LLAMADA_TOPE);
  if (!m) return false;
  return entreParentesis(t, m[0].length - 1).fin === t.length;
}

/** Los nombres que reciben entera una llamada a topeMs o topeConTestigo (`const tope = topeConTestigo(…);`). */
function nombresDeTopeEntero(codigo) {
  const nombres = new Set();
  for (const m of codigo.matchAll(new RegExp(String.raw`(?:(?:const|let|var)\s+)?(${ID})\s*=\s*(?=(?:topeMs|topeConTestigo)\s*\()`, "g"))) {
    const desde = m.index + m[0].length;
    const llamada = codigo.slice(desde).match(LLAMADA_TOPE);
    const { fin } = entreParentesis(codigo, desde + llamada[0].length - 1);
    // Tras la llamada solo puede venir el final de la sentencia.
    if (/^[ \t]*(?:;|\n|,|\)|$)/.test(codigo.slice(fin))) nombres.add(m[1]);
  }
  return nombres;
}

/** ¿Hay algún nombre o propiedad en la expresión, quitados los números? */
const tieneNombre = (expr) => /[A-Za-z_$]/.test(String(expr).replace(/\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, ""));

/**
 * Deja solo el código: comentarios y contenido de cadenas en blanco, con las
 * mismas posiciones y saltos de línea. Un recorrido carácter a carácter, para
 * que un `//` dentro de una URL no se tome por comentario ni una comilla de
 * un comentario abra una cadena. Lo de dentro de `${…}` de una plantilla es
 * código y se mira. Las expresiones regulares no se reconocen (lo peor que
 * pasa es dejar de ver una medida en esa línea, no inventarla).
 */
function sinCadenas(texto) {
  const s = texto.split("");
  let estado = "codigo";
  // Por cada `${` abierto, cuántas llaves de código hay abiertas dentro.
  const plantillas = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const sig = s[i + 1];
    if (estado === "codigo") {
      if (c === "/" && sig === "/") { estado = "linea"; s[i] = " "; }
      else if (c === "/" && sig === "*") { estado = "bloque"; s[i] = " "; }
      else if (c === '"' || c === "'" || c === "`") estado = c;
      else if (plantillas.length && c === "{") plantillas[plantillas.length - 1]++;
      else if (plantillas.length && c === "}") {
        if (plantillas[plantillas.length - 1] === 0) { plantillas.pop(); estado = "`"; }
        else plantillas[plantillas.length - 1]--;
      }
      continue;
    }
    if (estado === "`" && c === "$" && sig === "{") { plantillas.push(0); estado = "codigo"; i++; continue; }
    if (estado === "linea") {
      if (c === "\n") estado = "codigo";
      else s[i] = " ";
      continue;
    }
    if (estado === "bloque") {
      if (c === "*" && sig === "/") { s[i] = " "; s[i + 1] = " "; i++; estado = "codigo"; }
      else if (c !== "\n") s[i] = " ";
      continue;
    }
    // Dentro de una cadena.
    if (c === "\\") { s[i] = " "; if (s[i + 1] !== "\n" && i + 1 < s.length) s[i + 1] = " "; i++; continue; }
    if (c === estado) { estado = "codigo"; continue; }
    if (c === "\n" && estado !== "`") { estado = "codigo"; continue; }
    if (c !== "\n") s[i] = " ";
  }
  return s.join("");
}

const lineaDe = (texto, i) => texto.slice(0, i).split("\n").length;

/**
 * Las medidas de tiempo de un test que no siguen la regla: [{ linea, motivo, texto }].
 *  - `sin-marca`: una medida a mano (reloj menos un nombre, dos lecturas del reloj
 *    restadas, `process.hrtime`) sin marca de margen en las LINEAS_MARCA de antes,
 *    ni «sin tope»/«relación» en la misma línea o la anterior;
 *  - `margen-corto`: la marca dice menos de MARGEN;
 *  - `fecha-mala`: la fecha de la marca no existe;
 *  - `tope-sin-margen`: un `toBeLessThan(OrEqual)` sobre una duración (lo que
 *    devuelve `medianaMs`, una medida a mano o un nombre acabado en `ms`, `Ms` o
 *    `_ms`) cuyo tope no sale de `topeMs`/`topeConTestigo` ni lleva marca.
 *    El `expect` puede estar partido en varias líneas.
 */
export function medidasSinMargen(texto) {
  const original = String(texto).replace(/\r\n/g, "\n");
  const codigo = sinCadenas(original);
  const lineas = original.split("\n");
  const lineasCodigo = codigo.split("\n");
  const malas = [];
  const relojes = nombresDe(codigo, RELOJ);
  const medianas = nombresDe(codigo, "medianaMs(?:Async)?\\(");
  const topes = nombresDeTopeEntero(codigo);
  const restaRelojes = relojes.size ? new RegExp(String.raw`(?<![\w$.])(${[...relojes].join("|")})\s*-\s*(${[...relojes].join("|")})(?![\w$])`) : null;
  const esMedida = (s) => MEDIDA.test(s) || (restaRelojes?.test(s) ?? false);
  // Los nombres que reciben una medida a mano (`const d = Date.now() - t0`, `mejor = Math.min(mejor, … - t0)`).
  const duraciones = new Set();
  for (const l of lineasCodigo) {
    const a = l.match(new RegExp(String.raw`(${ID})\s*=(?![=>])\s*(.*)$`));
    if (a && esMedida(a[2])) duraciones.add(a[1]);
  }

  // «sin tope» cubre una medida que no se compara; «relación», también una comparación entre medidas.
  const marcaCerca = (n, valen) => [n - 1, n - 2].some((j) => j >= 0 && valen.includes(((lineas[j] ?? "").match(MARCA_CERCA)?.[1] ?? "").replace("ó", "o")));
  const marcaMargen = (n) => {
    for (let j = n - 1; j >= Math.max(0, n - 1 - LINEAS_MARCA); j--) {
      const m = (lineas[j] ?? "").match(MARCA_MARGEN);
      if (m) return m;
    }
    return null;
  };
  /** ¿La línea n (desde 1) está cubierta? null si sí; si no, el motivo. */
  const cubierta = (n, valen = ["sin tope", "relacion"]) => {
    if (marcaCerca(n, valen)) return null;
    const m = marcaMargen(n);
    if (!m) return "sin-marca";
    if (Number(m[1].replace(",", ".")) < MARGEN) return "margen-corto";
    if (!fechaReal(m[2])) return "fecha-mala";
    return null;
  };

  // 1. Medidas a mano: reloj menos un nombre, o dos lecturas del reloj restadas.
  lineasCodigo.forEach((l, i) => {
    if (!esMedida(l)) return;
    const motivo = cubierta(i + 1);
    if (motivo) malas.push({ linea: i + 1, motivo, texto: lineas[i].trim().slice(0, 120) });
  });

  // 2. Comparaciones de una duración con un tope, aunque el expect ocupe varias líneas.
  for (const m of codigo.matchAll(/\bexpect\s*\(/g)) {
    const abre = m.index + m[0].length - 1;
    const { dentro, fin } = entreParentesis(codigo, abre);
    const tras = codigo.slice(fin).match(/^\s*\.\s*(toBeLessThan(?:OrEqual)?)\s*\(/);
    if (!tras) continue;
    const sujeto = primerArgumento(dentro).trim();
    const esNombreDe = (s, conjunto) => conjunto.has(s.replace(/^await\s+/, "").trim());
    const esDuracion = /medianaMs(?:Async)?\s*\(/.test(sujeto) || esNombreDe(sujeto, medianas) || esNombreDe(sujeto, duraciones)
      || esMedida(sujeto) || NOMBRE_DURACION.test(sujeto);
    if (!esDuracion) continue;
    const { dentro: topeBruto } = entreParentesis(codigo, fin + tras[0].length - 1);
    const tope = topeBruto.trim().replace(/,$/, "").trim();
    // El tope es la llamada entera (sin `* k` ni Math.min alrededor) o un nombre que la recibió entera.
    if (esLlamadaEntera(tope) || esNombreDe(tope, topes)) continue;
    const n = lineaDe(codigo, m.index);
    const nFin = lineaDe(codigo, fin);
    const texto = original.slice(m.index, fin + tras[0].length + topeBruto.length + 1).replace(/\s+/g, " ").slice(0, 120);
    // Una marca vale si está encima del expect o de la línea del toBeLessThan.
    const relacion = marcaCerca(n, ["relacion"]) || marcaCerca(nFin, ["relacion"]);
    // «relación» es entre dos medidas: el otro lado no puede ser solo un número.
    if (relacion && !tieneNombre(tope)) { malas.push({ linea: n, motivo: "relacion-con-numero", texto }); continue; }
    if (relacion || [n, nFin].some((x) => marcaMargen(x) && cubierta(x, []) === null)) continue;
    malas.push({ linea: n, motivo: "tope-sin-margen", texto });
  }
  return malas.sort((a, b) => a.linea - b.linea);
}
