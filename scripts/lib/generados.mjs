/**
 * Documentos y anclas que se generan y se guardan en el repo, y cómo se fusionan sin chocar
 * (#551, fondo #504).
 *
 * Con los catálogos ya partidos en un fichero por entrada (#505), lo que seguía chocando entre
 * dos ramas que añaden una entrada cada una era lo que se genera de ellos: FORJA.md, los moldes
 * de `.claude/plantillas-skill/` y las anclas como `ops/forja-capas.json`. Cada rama lo
 * regenera entero y git choca en las líneas vecinas, aunque el arreglo sea mecánico.
 *
 * Dos clases, cada una con su forma de fusionar (`.gitattributes`, atributo `merge=`):
 *   - `documento`: el fichero entero sale de una función de lo que hay en el repo (lo dice su
 *     cabecera «No se edita a mano»). Al fusionar, el driver `generado` se queda con la versión
 *     de HEAD (en un merge, la tuya; en un rebase o un cherry-pick, la de la otra rama) y no para
 *     la fusión; el documento puede quedar desfasado, y lo dice su test «está al día» (en local y
 *     en el CI). Se arregla con `node scripts/generados.mjs --escribir`.
 *   - `ancla`: un JSON por claves que un script mantiene (trinquetes, mapas). El driver
 *     `json-claves` fusiona clave a clave contra la base común: lo que cambia un solo lado entra,
 *     y si los dos cambian la misma clave de forma distinta, choca con las marcas de git.
 *
 * Los drivers son configuración local de git (`merge.<driver>.driver`): `npm run tarea` los
 * instala en la carpeta principal, cuya configuración comparten todas sus carpetas de trabajo.
 * El comando lleva rutas absolutas y fijas, calculadas al instalar: el `node` que instala
 * (`process.execPath`) y el `scripts/merge-driver.mjs` de la carpeta principal del clon (la que
 * contiene el directorio común de git), que solo avanza con `pull --ff-only` desde staging; así
 * una rama no puede cambiar el código que corre al fusionar. Si ese script no existe, no se
 * instala. Y si al fusionar no se puede lanzar (node o el script ya no están), el comando cae a
 * `git merge-file`: marcas de conflicto, nunca una versión sin marcas que parezca resuelta.
 *
 * Sin la configuración (otro clon, una sesión en la nube, GitHub al fusionar o con
 * `gh pr update-branch`), git fusiona como antes: o choca y se fusiona en local, o sale limpia y
 * el test «está al día» del CI dice si el documento quedó desfasado. Ese test es la red; el
 * driver solo ahorra el choque.
 *
 * Lo que solo es en parte generado (las tablas de FLUJO.md y PLANOS.md, la sección de estándares
 * de cada agente) no entra: quedarse con una versión perdería lo escrito a mano en la otra rama.
 * Tampoco `supabase/cableado.json`: su `--escribir` acepta cualquier cableado nuevo, y su test
 * está para que eso se decida a mano (es de `datos`).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** El script de los drivers, relativo a la raíz del clon. */
export const SCRIPT_DRIVER = "scripts/merge-driver.mjs";

export const DRIVERS = {
  generado: "documento generado: se queda con la versión de HEAD; su test «está al día» dice si hay que regenerar",
  "json-claves": "ancla JSON: fusiona clave a clave contra la base común; choca si los dos cambian la misma clave",
};

export const CLASES = { documento: "generado", ancla: "json-claves" };

/**
 * El registro. `ruta` es una ruta o un patrón de `.gitattributes` (solo `*` dentro de una
 * carpeta). `regenera`, el script que lo escribe (con `--escribir`); `test`, el que lo vigila.
 *
 * Orden en las anclas: `mezclarJson` ordena las claves de un objeto y una lista de valores
 * sueltos si tu versión ya iba ordenada (por `localeCompare` o por código), y si no, deja tu
 * orden y añade detrás lo de la otra rama. Ninguna ancla de aquí depende de otro orden: las de
 * la forja se escriben ordenadas por `localeCompare` y `pendientes` de la redacción es un
 * conjunto. Un ancla nueva cuyo orden signifique algo (una lista de pasos) no va aquí.
 */
export const GENERADOS = [
  { ruta: "docs/ops/FORJA.md", clase: "documento", regenera: "scripts/forja.mjs", test: "ops/forja.test.js" },
  { ruta: ".claude/plantillas-skill/*.md", clase: "documento", regenera: "scripts/plantillas.mjs", test: ".claude/plantillas-skill.test.js" },
  { ruta: "docs/ops/REDACCION.md", clase: "documento", regenera: "scripts/redaccion.mjs", test: "ops/redaccion.test.js" },
  { ruta: "docs/ops/NORMAS.md", clase: "documento", regenera: "scripts/normas.mjs", test: "ops/normas.test.js" },
  { ruta: "docs/ops/ESTANDARES.md", clase: "documento", regenera: "scripts/estandares-agentes.mjs", test: "ops/estandares-agentes.test.js" },
  { ruta: "docs/ops/ENCARGO.md", clase: "documento", regenera: "scripts/flujo.mjs", test: "scripts/encargo.test.js" },
  { ruta: "ops/forja-capas.json", clase: "ancla", regenera: "scripts/forja.mjs", test: "ops/forja.test.js" },
  { ruta: "ops/forja-campos.json", clase: "ancla", regenera: "scripts/forja.mjs", test: "ops/forja.test.js" },
  { ruta: "ops/forja-excepciones.json", clase: "ancla", regenera: "scripts/forja.mjs", test: "ops/forja-forma.test.js" },
  { ruta: "ops/redaccion-pendientes.json", clase: "ancla", regenera: "scripts/redaccion.mjs", test: "ops/redaccion.test.js" },
];

/** Las líneas de `.gitattributes` que pide el registro, en su orden. */
export const lineasGitattributes = (generados = GENERADOS) => generados.map((g) => `${g.ruta} merge=${CLASES[g.clase]}`);

/** Los scripts que regeneran todo, sin repetir y en el orden del registro. */
export const comandosDeEscribir = (generados = GENERADOS) => [...new Set(generados.map((g) => g.regenera))];

/** ¿Casa una ruta con un patrón del registro? (`*` no cruza carpetas, como en `.gitattributes`). */
export function casaRuta(patron, ruta) {
  const re = new RegExp(`^${patron.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
  return re.test(ruta);
}

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const conBarras = (r) => r.replace(/\\/g, "/");

/** La carpeta principal del clon de `dir`: la que contiene el directorio común de git. */
export function carpetaPrincipal(dir) {
  const comun = git(dir, ["rev-parse", "--git-common-dir"]);
  return dirname(isAbsolute(comun) ? comun : resolve(dir, comun));
}

/**
 * La configuración de git de cada driver (clave → valor). `node` y `script`, rutas absolutas.
 * Si no se puede lanzar (`||`), `git merge-file` deja las marcas de conflicto de siempre.
 */
export function configDrivers({ node, script }) {
  const c = {};
  for (const [id, nombre] of Object.entries(DRIVERS)) {
    c[`merge.${id}.name`] = nombre;
    c[`merge.${id}.driver`] = `"${conBarras(node)}" "${conBarras(script)}" ${id} %O %A %B "%P" || git merge-file -L HEAD -L base -L otra %A %O %B`;
  }
  return c;
}

/** Lo que se instalaría desde `dir`: { node, script, principal } o { motivo } si no se puede. */
export function destinoDrivers(dir, { node = process.execPath } = {}) {
  const principal = carpetaPrincipal(dir);
  const script = join(principal, SCRIPT_DRIVER);
  if (!existsSync(script)) return { motivo: `no existe ${conBarras(script)} (la carpeta principal no tiene aún los drivers: pull --ff-only desde staging)` };
  if (!existsSync(node)) return { motivo: `no existe ${conBarras(node)}` };
  return { node, script, principal };
}

const leerClave = (dir, clave) => {
  try { return git(dir, ["config", "--get", clave]); } catch {
    // a propósito: `git config --get` sale con 1 si la clave no existe
    return null;
  }
};
/** ¿Lo puso este script? (un driver ajeno con el mismo nombre no se pisa). */
const esNuestro = (valor) => valor === null || valor.includes(SCRIPT_DRIVER) || Object.values(DRIVERS).includes(valor);

/** Qué claves faltan o están distintas en la configuración de git de `dir`. */
export function driversQueFaltan(dir, opciones = {}) {
  const d = destinoDrivers(dir, opciones);
  if (d.motivo) return Object.keys(configDrivers({ node: "-", script: "-" }));
  return Object.entries(configDrivers(d)).filter(([clave, valor]) => leerClave(dir, clave) !== valor).map(([clave]) => clave);
}

/**
 * Escribe los drivers en la configuración de git de `dir` (la común a sus carpetas de trabajo).
 * Idempotente. Devuelve { puestos, ajenos, motivo }: `ajenos`, las claves con un driver que no
 * es nuestro (no se pisan); `motivo`, por qué no se instala nada.
 */
export function instalarDrivers(dir, opciones = {}) {
  const d = destinoDrivers(dir, opciones);
  if (d.motivo) return { puestos: [], ajenos: [], motivo: d.motivo };
  const puestos = [];
  const ajenos = [];
  for (const [clave, valor] of Object.entries(configDrivers(d))) {
    const actual = leerClave(dir, clave);
    if (actual === valor) continue;
    if (!esNuestro(actual)) { ajenos.push(clave); continue; }
    git(dir, ["config", clave, valor]);
    puestos.push(clave);
  }
  return { puestos, ajenos, motivo: null };
}

/** Quita los drivers nuestros de la configuración de git de `dir`. Devuelve las claves quitadas. */
export function desinstalarDrivers(dir) {
  const quitadas = [];
  for (const id of Object.keys(DRIVERS)) {
    for (const campo of ["name", "driver"]) {
      const clave = `merge.${id}.${campo}`;
      const actual = leerClave(dir, clave);
      if (actual === null || !esNuestro(actual)) continue;
      git(dir, ["config", "--unset", clave]);
      quitadas.push(clave);
    }
  }
  return quitadas;
}

// ---------- fusión de un JSON por claves ----------

const CHOQUE = Symbol("choque");
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const esLista = (v) => Array.isArray(v) && v.every((x) => x === null || typeof x !== "object");

const ordenadaCon = (claves, cmp) => claves.every((k, i) => i === 0 || cmp(claves[i - 1], k) <= 0);
const CMP_LOCALE = (a, b) => a.localeCompare(b);
const CMP_CODIGO = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Fusión a tres de un valor; devuelve CHOQUE si los dos lados lo cambian de forma distinta. */
function mezclar(base, nuestro, suyo, ruta, choques) {
  if (igual(nuestro, suyo)) return nuestro;
  if (igual(base, nuestro)) return suyo;
  if (igual(base, suyo)) return nuestro;
  if (esObjeto(nuestro) && esObjeto(suyo)) {
    const b = esObjeto(base) ? base : {};
    const claves = [...Object.keys(nuestro)];
    for (const k of Object.keys(suyo)) if (!claves.includes(k)) claves.push(k);
    // Si tus claves iban en orden, el resultado también: las anclas se escriben ordenadas.
    const propias = Object.keys(nuestro);
    if (propias.length > 1 && ordenadaCon(propias, CMP_LOCALE)) claves.sort(CMP_LOCALE);
    else if (propias.length > 1 && ordenadaCon(propias, CMP_CODIGO)) claves.sort(CMP_CODIGO);
    const salida = {};
    for (const k of claves) {
      const v = mezclar(b[k], nuestro[k], suyo[k], `${ruta}.${k}`, choques);
      if (v !== undefined) salida[k] = v;
    }
    return salida;
  }
  if (esLista(nuestro) && esLista(suyo) && (base === undefined || esLista(base))) {
    // Listas de valores sueltos, como conjuntos: entra lo que añade cada lado y sale lo que quita cada uno.
    const b = base ?? [];
    const quitados = new Set([...b.filter((x) => !nuestro.includes(x)), ...b.filter((x) => !suyo.includes(x))]);
    const salida = nuestro.filter((x) => !quitados.has(x));
    for (const x of suyo) if (!quitados.has(x) && !salida.includes(x)) salida.push(x);
    const cad = nuestro.every((x) => typeof x === "string");
    if (cad && nuestro.length > 1 && ordenadaCon(nuestro, CMP_LOCALE)) salida.sort(CMP_LOCALE);
    else if (cad && nuestro.length > 1 && ordenadaCon(nuestro, CMP_CODIGO)) salida.sort(CMP_CODIGO);
    return salida;
  }
  choques.push(ruta || "(raíz)");
  return CHOQUE;
}

/**
 * Fusiona tres textos JSON (base común, tu versión y la suya) clave a clave.
 * Devuelve `{ texto }` con el JSON fusionado (2 espacios y salto final, como lo escriben los
 * scripts), o `{ choques }` con las rutas de las claves que los dos lados cambian de forma
 * distinta (o `{ error }` si alguno no es JSON): entonces el driver sale con 1 y su comando cae a `git merge-file`, con marcas.
 */
export function mezclarJson(textoBase, textoNuestro, textoSuyo) {
  let base;
  let nuestro;
  let suyo;
  try {
    base = textoBase.trim() ? JSON.parse(textoBase) : undefined;
    nuestro = JSON.parse(textoNuestro);
    suyo = JSON.parse(textoSuyo);
  } catch (e) {
    return { error: `no es JSON: ${e.message}` };
  }
  const choques = [];
  const v = mezclar(base, nuestro, suyo, "", choques);
  if (choques.length) return { choques };
  return { texto: `${JSON.stringify(v, null, 2)}\n` };
}
