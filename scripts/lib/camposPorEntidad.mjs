/**
 * camposPorEntidad.mjs — entidad × tipo de campo (#711, continúa #706). Puro: no lee ficheros
 * ni toca la base; quien llama le pasa los registros, las cabeceras o las columnas ya leídas.
 *
 * Lo usa scripts/campos-por-entidad.mjs y su test. Repite a mano lo que se hizo con un script
 * de usar y tirar en el comentario «Inventario de texto libre frente a campo cerrado, por
 * entidad» de #706: cada campo de una entidad cae en UNO de nueve tipos (TIPOS_CAMPO), y los
 * dos que importan para cerrar vocabularios son `texto_unico` (texto de verdad, no se toca) y
 * `texto_repetido` (mismos valores una y otra vez: candidato a cerrado o a derivado).
 *
 * La clasificación es una REGLA, no un juicio a ojo: el comentario de #706 reclasificó a mano
 * y declaró que «reclasificar un campo cambia el total». Aquí el mismo campo da siempre el
 * mismo tipo, y se puede discutir la regla (CLASIFICADOR) en vez de cada caso.
 */

/** Los nueve tipos de campo, en el orden de las columnas del comentario de #706. */
export const TIPOS_CAMPO = Object.freeze({
  cerrado: "Pocos valores distintos que se repiten (vocabulario, o CHECK, o enum de la base)",
  booleano: "Verdadero o falso",
  numero: "Un número",
  fecha: "Una fecha o una hora",
  lista: "Una lista de valores",
  identificador: "Un id, una ruta, una url o una referencia a otra cosa (uuid, id, ruta)",
  texto_unico: "Texto libre que casi nunca se repite: nombres, exigencias, porqués, mensajes",
  texto_repetido: "Texto libre cuyos valores se repiten una y otra vez: candidato a cerrado o a derivado",
  objeto: "Un objeto o un JSON anidado, sin abrir",
});
export const ORDEN_TIPOS = Object.freeze(Object.keys(TIPOS_CAMPO));

/** Las columnas de la base que están fuera de la medida a propósito (clase `excluded`). */
export const TIPO_EXCLUIDO = "excluido";

/**
 * El umbral y su porqué. Veinte distintos: el mismo que scripts/lib/pocosValores.mjs
 * (MAX_DISTINTOS) y el que usó el inventario de #706. Repetido a partir del 20 % de las
 * filas: por debajo, un valor que sale dos veces entre cien es una coincidencia (dos personas
 * con el mismo nombre), no una clase; 205 normas con 65 valores de `control` repiten el 68 %.
 */
export const CLASIFICADOR = Object.freeze({ maxDistintos: 20, minRepetido: 0.2 });

// Claves que son ids o referencias por su nombre; las demás se miran por la forma del valor.
const CLAVE_ID = /^(id|ids|uuid|ruta|rutas|url|fichero|archivo|commit|sha|hash|.*_id|.*_ids|.*Id|.*Ids)$/;
const FORMA_ID = /^[a-z0-9]+(?:[._/:-][a-z0-9]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?$/;

const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Los n valores más frecuentes: [[valor, veces], …], de más a menos y, a igualdad, por valor. */
export function masFrecuentes(valores, n = 3) {
  const cuenta = new Map();
  for (const v of valores) cuenta.set(String(v), (cuenta.get(String(v)) ?? 0) + 1);
  return [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/**
 * El tipo de un campo a partir de TODOS los valores que tiene en los registros (los nulos no
 * cuentan). Devuelve { tipo, filas, distintos, frecuencias }; `tipo: null` si nunca tiene valor.
 */
export function tipoDeCampo(clave, valores, { maxDistintos, minRepetido } = CLASIFICADOR) {
  const v = valores.filter((x) => x !== null && x !== undefined);
  const base = { filas: v.length, distintos: 0, frecuencias: [] };
  if (!v.length) return { ...base, tipo: null };
  const dist = new Set(v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))));
  const datos = { filas: v.length, distintos: dist.size, frecuencias: masFrecuentes(v.map((x) => (typeof x === "object" ? JSON.stringify(x) : x))) };
  if (v.some(esObjeto)) return { ...datos, tipo: "objeto" };
  if (v.some(Array.isArray)) return { ...datos, tipo: "lista" };
  if (v.every((x) => typeof x === "boolean")) return { ...datos, tipo: "booleano" };
  if (v.every((x) => typeof x === "number")) return { ...datos, tipo: "numero" };
  const s = v.map(String);
  if (s.every((x) => FECHA.test(x))) return { ...datos, tipo: "fecha" };
  if (CLAVE_ID.test(clave)) return { ...datos, tipo: "identificador" };
  if (dist.size <= maxDistintos && dist.size < v.length) return { ...datos, tipo: "cerrado" };
  const repetido = (v.length - dist.size) / v.length;
  if (dist.size === v.length) {
    // todo distinto: o un id (una sola palabra en minúsculas, sin espacios) o texto
    return { ...datos, tipo: s.every((x) => FORMA_ID.test(x)) ? "identificador" : "texto_unico" };
  }
  return { ...datos, tipo: repetido >= minRepetido ? "texto_repetido" : "texto_unico" };
}

/** Los campos de una lista de registros (objetos): Map clave → resultado de tipoDeCampo. */
export function camposDeRegistros(registros, opciones) {
  const valores = new Map();
  for (const r of registros) {
    if (!esObjeto(r)) continue;
    for (const [k, x] of Object.entries(r)) {
      if (!valores.has(k)) valores.set(k, []);
      valores.get(k).push(x);
    }
  }
  const campos = new Map();
  for (const [k, vs] of [...valores].sort(([a], [b]) => a.localeCompare(b))) campos.set(k, { clave: k, ...tipoDeCampo(k, vs, opciones) });
  return campos;
}

/**
 * Los registros que cuelgan de un camino de un JSON: «normas», «agentes.*.tareas»,
 * «tablas» (un objeto cuyos valores son los registros). `*` recorre los elementos de una
 * lista o los valores de un objeto. Un camino que no existe LANZA un error: una fuente
 * cambiada de sitio no puede contar cero en silencio.
 */
export function registrosDe(json, camino) {
  let nivel = [json];
  for (const paso of camino.split(".")) {
    const sig = [];
    for (const n of nivel) {
      if (paso === "*") {
        if (Array.isArray(n)) sig.push(...n);
        else if (esObjeto(n)) sig.push(...Object.values(n));
      } else if (esObjeto(n) && paso in n) sig.push(n[paso]);
    }
    if (!sig.length) throw new Error(`el camino «${camino}» no existe en el JSON (falla en «${paso}»)`);
    nivel = sig;
  }
  const fuera = [];
  for (const n of nivel) {
    if (Array.isArray(n)) fuera.push(...n);
    else if (esObjeto(n) && Object.values(n).every(esObjeto)) fuera.push(...Object.values(n));
    else fuera.push(n);
  }
  return fuera;
}

/**
 * La cabecera de un .md (entre `---`) como un registro plano: `clave: valor`, y las claves
 * de un bloque sangrado (`metadata:`) suben al mismo nivel. `true`/`false` son booleanos,
 * `[a, b]` listas y los números, números. Sin cabecera: null.
 */
export function cabeceraMd(texto) {
  const m = String(texto).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!m) return null;
  const r = {};
  for (const linea of m[1].split("\n")) {
    const c = linea.match(/^\s*([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!c) continue;
    const valor = c[2].trim();
    if (valor === "") continue; // abre un bloque sangrado: sus claves suben
    r[c[1]] = valorDeCabecera(valor);
  }
  return r;
}

function valorDeCabecera(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean);
  return v.replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * En la base, un texto libre es «repetido» si la mitad de sus valores o más son copias de otro
 * (35 casas llamadas «Mi casa» son un 97 %; 16 recetas con 10 nombres, un 37 %: una tabla pequeña
 * repite por azar). Sin mínimo de filas, a propósito: el inventario de #706 contó a mano las de
 * menos de 50 filas (households.name, grupo.nombre, bot_chats.lang) y esta regla las coge igual.
 */
export const REPETIDO_EN_BASE = 0.5;

/**
 * El tipo de una columna de la base.
 *   - `sql`: { tipo (data_type de information_schema), udt }
 *   - `clase`: la de ops/columnas-texto.json (free_text, identifier, excluded) o undefined
 *   - `medida`: { conValor, distintos } de la columna (solo hace falta para free_text)
 * Un `text` sin clase es vocabulario con CHECK (si no, supabase/columnasTexto.test.js falla) y
 * un enum de Postgres (USER-DEFINED) es cerrado. Un array sin clase es una lista; con clase manda
 * la clase, como en ops/columnas-texto.json (un `text[]` de texto libre se mide por elemento).
 */
export function tipoDeColumna({ sql, clase, medida }) {
  const t = String(sql?.tipo ?? "").toLowerCase();
  if (clase === "excluded") return TIPO_EXCLUIDO;
  if (clase === "identifier") return "identificador";
  if (clase === "free_text") {
    const { conValor = 0, distintos = 0 } = medida ?? {};
    if (conValor < 2) return "texto_unico";
    const repetido = (conValor - distintos) / conValor;
    return repetido >= REPETIDO_EN_BASE ? "texto_repetido" : "texto_unico";
  }
  if (t === "array") return "lista"; // un array sin clase (los text[] con clase se miden por elemento, arriba)
  if (t === "boolean") return "booleano";
  if (["integer", "bigint", "smallint", "numeric", "real", "double precision"].includes(t)) return "numero";
  if (t === "date" || t.startsWith("timestamp") || t.startsWith("time") || t === "interval") return "fecha";
  if (t === "uuid") return "identificador";
  if (t === "json" || t === "jsonb") return "objeto";
  return "cerrado"; // text/varchar con CHECK, o USER-DEFINED (enum)
}

/** Cuántos campos hay de cada tipo: { cerrado: n, … } con los nueve (y `excluido` si lo hay). */
export function cuentaPorTipo(tipos) {
  const c = Object.fromEntries(ORDEN_TIPOS.map((t) => [t, 0]));
  for (const t of tipos) {
    if (t === null || t === undefined) continue;
    c[t] = (c[t] ?? 0) + 1;
  }
  return c;
}

/** Suma de varios recuentos. */
export function sumaCuentas(cuentas) {
  const s = cuentaPorTipo([]);
  for (const c of cuentas) for (const [t, n] of Object.entries(c)) s[t] = (s[t] ?? 0) + n;
  return s;
}

const corto = (x, n = 40) => (String(x).length > n ? `${String(x).slice(0, n - 1)}…` : String(x)).replace(/[\s=:,]+/g, "_");

/** `cerrado=17 booleano=0 … total=31`: una línea `campo: valor` contable. */
export function textoCuenta(c) {
  const claves = [...ORDEN_TIPOS, ...Object.keys(c).filter((k) => !ORDEN_TIPOS.includes(k))];
  const total = claves.reduce((a, k) => a + (c[k] ?? 0), 0);
  return `${claves.map((k) => `${k}=${c[k] ?? 0}`).join(" ")} total=${total}`;
}

/** Las frecuencias de un campo como `valor:veces,valor:veces`; el valor no lleva espacios, «=», «:» ni «,» (se vuelven «_»), así que se parte sin ambigüedad por «,» y por el último «:». */
export function textoFrecuencias(frecuencias) {
  return frecuencias.map(([v, n]) => `${corto(v)}:${n}`).join(",");
}
