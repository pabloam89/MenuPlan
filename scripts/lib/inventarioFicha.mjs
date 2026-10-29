/**
 * Inventario de la ficha de la casa y de la persona (#939, fase 4): cruza lo
 * que se guarda de una casa con el registro (src/lib/registroFicha.js) y con
 * el código que lo lee. No cambia nada: mide. De aquí salen la cifra de antes
 * y después de cada arreglo.
 *
 * De dónde salen las claves:
 *  - declaradas: INITIAL_DATA de src/App.jsx (la forma de una casa nueva) y
 *    CAMPOS_CON_COLUMNA de personasTabla.js (lo que la tabla persona copia).
 *  - guardadas: solo con `--base` (lectura de producción); el test no las ve.
 *
 * Fallos que cuenta, en vocabulario cerrado (FALLOS):
 *   sin_registro          una clave declarada o guardada que el registro no tiene
 *   sin_lector            un dato activo que ningún fichero lee (fuera de los
 *                         valores por defecto y la migración de App.jsx)
 *   de_roto               `de` u `otros` que apunta a un dato que no existe
 *   sin_declarar          un dato del registro que la forma de una casa nueva
 *                         (INITIAL_DATA) no trae, o una clave de la persona sin
 *                         columna en la tabla persona (va a `resto`)
 *   enum_sin_vocabulario  un enum o lista_enum sin su lista en vocabularios.js
 *   copia                 un dato que se deriva de otro y se guarda aparte
 *   legado                un dato sustituido que sigue guardado
 *   lola_no_lo_ve         un hecho activo de la casa que Lola (api/) no nombra:
 *                         no puede contarlo ni cambiarlo al hablar
 *   app_no_lo_ve          un hecho activo que ninguna pantalla de la app nombra
 *                         (src/screens, src/components, App.jsx)
 *   sin_tabular           un objeto, mapa o lista abierta (no se puede contar)
 *
 * Los tres primeros son errores del registro y deben ser 0. Los demás son
 * la deuda del modelo: se anclan en inventarioFicha.base.json y
 * solo pueden bajar.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const FALLOS = ["sin_registro", "sin_lector", "de_roto", "sin_declarar", "enum_sin_vocabulario", "copia", "legado", "lola_no_lo_ve", "app_no_lo_ve", "sin_tabular"];
export const ERRORES = FALLOS.slice(0, 3);
export const DEUDA = FALLOS.slice(3);

// Escriben datos de prueba o el propio registro: nombrar una clave no es leerla.
const NO_LEEN = new Set(["src/lib/registroFicha.js", "src/lib/casasAleatorias.js"]);

/** Las claves de un objeto literal de primer nivel (`  clave:`), entre dos marcas del texto. */
function clavesDeBloque(texto, desde, hasta = "\n};") {
  const i = texto.indexOf(desde);
  if (i < 0) throw new Error(`no encuentro «${desde}»`);
  const j = texto.indexOf(hasta, i);
  return { claves: [...texto.slice(i, j).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]), i, j };
}

/** App.jsx sin INITIAL_DATA ni migrate(): ahí se nombran todas las claves para darles su valor por defecto. */
function appSinDefectos(texto) {
  const a = clavesDeBloque(texto, "const INITIAL_DATA = {");
  let s = texto.slice(0, a.i) + texto.slice(a.j);
  const m = s.indexOf("function migrate(state)");
  if (m >= 0) s = s.slice(0, m) + s.slice(s.indexOf("\n}\n", m));
  return s;
}

function ficheros(raiz, dir) {
  const out = [];
  (function andar(d) {
    for (const f of readdirSync(d)) {
      if (f === "node_modules" || f.startsWith(".")) continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) andar(p);
      else if (/\.(m?js|jsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
    }
  })(join(raiz, dir));
  return out.map((p) => relative(raiz, p).replaceAll("\\", "/"));
}

// Los nombres con que el código de Lola (api/_bot) tiene en la mano el `data` de
// una casa: `{ ...data, clave }`, `{ ...d, clave }` (ajustes.js va pasando
// `d`), `{ ...casa.state.data, clave }`. Cada clave que se escribe así es una
// clave guardada, aunque INITIAL_DATA no la traiga.
const SPREAD_DE_DATA = /\{\s*\.\.\.(?:data|d|datos|dataNueva|(?:\w+\.)?state\.data)\s*,/g;

/**
 * Las claves de primer nivel que el texto escribe en un `data` de casa con
 * `{ ...data, clave: valor, otra }` (#958: diaTanda se escribía y se leía y el
 * inventario no la veía, porque solo miraba INITIAL_DATA y la base). Un lector
 * sencillo: cuenta llaves, corchetes y paréntesis, y se salta cadenas y
 * plantillas, para quedarse con lo que está justo dentro del objeto.
 */
export function clavesEscritas(texto) {
  const claves = new Set();
  for (const m of texto.matchAll(SPREAD_DE_DATA)) {
    let nivel = 0;
    let trozo = "";
    const trozos = [];
    for (let i = m.index + m[0].length; i < texto.length; i++) {
      const c = texto[i];
      if (c === "'" || c === '"' || c === "`") {
        // Hasta la comilla que la cierra (en una plantilla, sin mirar dentro de ${}).
        let j = i + 1;
        while (j < texto.length && texto[j] !== c) j += texto[j] === "\\" ? 2 : 1;
        trozo += "0";
        i = j;
        continue;
      }
      if ("{[(".includes(c)) nivel++;
      if ("}])".includes(c)) {
        if (nivel === 0) { trozos.push(trozo); break; }
        nivel--;
      }
      if (c === "," && nivel === 0) { trozos.push(trozo); trozo = ""; continue; }
      if (nivel === 0) trozo += c;
    }
    for (const t of trozos) {
      const k = t.trim().match(/^(\w+)\s*(?::|$)/)?.[1];
      if (k) claves.add(k);
    }
  }
  return claves;
}

const nombra = (k) => new RegExp(String.raw`(\.|\?\.|\[["'])${k}\b|\b${k}\s*[:=]|\{[^}]*\b${k}\b[^}]*\}\s*=`);

/**
 * El inventario. `guardadas` (opcional): { casa: Set, persona: Set } con las
 * claves que hay en la base.
 */
export async function inventario(raiz, { guardadas = null } = {}) {
  const url = (f) => new URL(`file:///${join(raiz, f).replaceAll("\\", "/")}`).href;
  const { DATOS_CASA, DATOS_PERSONA, TIPOS, SIN_TABULAR, moduloDe } = await import(url("src/lib/registroFicha.js"));
  const { VOCABULARIOS } = await import(url("src/lib/vocabularios.js"));
  const { CAMPOS_CON_COLUMNA } = await import(url("src/lib/personasTabla.js"));

  const app = readFileSync(join(raiz, "src/App.jsx"), "utf8");
  const declaradas = { casa: new Set(clavesDeBloque(app, "const INITIAL_DATA = {").claves), persona: new Set(CAMPOS_CON_COLUMNA) };
  const codigo = [...ficheros(raiz, "src"), ...ficheros(raiz, "api")]
    .filter((f) => !NO_LEEN.has(f))
    .map((f) => [f, f === "src/App.jsx" ? appSinDefectos(app) : readFileSync(join(raiz, f), "utf8")]);
  // Lo que escribe Lola en data (api/_bot), además de lo declarado y lo guardado.
  const escritas = { casa: new Set(codigo.filter(([f]) => f.startsWith("api/_bot/")).flatMap(([, t]) => [...clavesEscritas(t)])), persona: new Set() };

  const fallos = Object.fromEntries(FALLOS.map((f) => [f, []]));
  const filas = [];
  for (const [ambito, registro] of [["casa", DATOS_CASA], ["persona", DATOS_PERSONA]]) {
    const conocidas = new Set([...declaradas[ambito], ...escritas[ambito], ...(guardadas?.[ambito] ?? [])]);
    for (const k of conocidas) if (!registro[k]) fallos.sin_registro.push(`${ambito}.${k}`);
    for (const [k, d] of Object.entries(registro)) {
      const id = `${ambito}.${k}`;
      // Lo que vive en su tabla tiene allí su forma y sus lectores.
      const enData = d.vive === "data";
      if (enData && !declaradas[ambito].has(k)) fallos.sin_declarar.push(id);
      if (!TIPOS.includes(d.tipo)) throw new Error(`${id}: tipo «${d.tipo}» fuera de TIPOS`);
      const re = nombra(k);
      const lectores = codigo.filter(([, t]) => re.test(t)).map(([f]) => f);
      const lola = lectores.filter((f) => f.startsWith("api/"));
      const enApp = lectores.filter((f) => /^src\/(screens|components)\/|^src\/App\.jsx$/.test(f));
      if (enData && d.estado === "activo" && lectores.length === 0) fallos.sin_lector.push(id);
      for (const ref of [d.de, d.otros].filter(Boolean)) {
        // «members.x» es un dato de la persona; lo demás, de su ámbito o de la casa.
        const [r, sub] = ref.split(".");
        if (!(sub ? r === "members" && DATOS_PERSONA[sub] : registro[r] ?? DATOS_CASA[r])) fallos.de_roto.push(`${id} → ${ref}`);
      }
      if (["enum", "lista_enum"].includes(d.tipo) && !(d.vocabulario && VOCABULARIOS[d.vocabulario]) && d.estado !== "legado") fallos.enum_sin_vocabulario.push(id);
      if (d.estado === "copia") fallos.copia.push(`${id} ← ${d.de}`);
      if (d.estado === "legado") fallos.legado.push(id);
      if (enData && d.estado === "activo" && lola.length === 0) fallos.lola_no_lo_ve.push(id);
      if (enData && d.estado === "activo" && enApp.length === 0) fallos.app_no_lo_ve.push(id);
      if (SIN_TABULAR.includes(d.tipo) && d.estado !== "legado") fallos.sin_tabular.push(id);
      filas.push({ id, ...d, modulo: moduloDe(d), lectores: lectores.length, lola: lola.length, app: enApp.length });
    }
  }
  const cifras = Object.fromEntries(FALLOS.map((f) => [f, fallos[f].length]));
  return { fallos, cifras, filas };
}
