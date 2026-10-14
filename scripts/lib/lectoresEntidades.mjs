/**
 * lectoresEntidades.mjs — el criterio de «lector» del registro de entidades (#748, E5, D5).
 *
 * Un lector es una RUTA de fichero que existe en git. Y nombra la entidad si su texto contiene, por LÍMITE DE
 * PALABRA (no por subcadena: `hook` no está en «hooks» ni `module` en «modules»), su `id`, su `term`, su
 * `name` o lo que declara en `source_of_truth`:
 *   - con sufijo `fichero#SIMBOLO` (un módulo: `scripts/lib/zonasProyecto.mjs#PROYECTOS`; una tabla de un fichero de
 *     datos: `ops/MODULOS.json#bot_identities`): ese símbolo o tabla;
 *   - un fichero o carpeta de datos sin sufijo (`ops/tipos-de-encargo.json`): su nombre de fichero;
 *   - un módulo (`.js`/`.mjs`) sin sufijo: nada. Se casa por el símbolo, nunca por el nombre del fichero: importar
 *     el módulo para usar otra cosa (`ZONAS`) no es leer la entidad;
 *   - un `.md` o `none`: nada (un documento general nombra de todo).
 * Los generadores del registro no cuentan como lector: lo recorren entero.
 *
 * Sin imports: lo usa `ops/entidades.test.js` y cualquier script que quiera medir el criterio.
 */

/** Los ficheros que generan o vigilan el registro entero: nombran todas las entidades porque las recorren. */
export const GENERADORES = ["docs/entidades/MAPA.md", "docs/entidades/SUPER-TABLA.md", "ops/entidades.test.js", "ops/entidades.json", "scripts/mapa-entidades.mjs"];

const esModulo = (f) => /\.(m?js)$/.test(f);
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Parte `fichero#SIMBOLO`: { fichero, simbolo|null }. */
export function partirFuente(sot) {
  const i = typeof sot === "string" ? sot.indexOf("#") : -1;
  return i < 0 ? { fichero: sot, simbolo: null } : { fichero: sot.slice(0, i), simbolo: sot.slice(i + 1) };
}

/** Las palabras que, por límite de palabra, delatan que un fichero habla de la entidad. */
export function palabrasDeLaEntidad(e) {
  const p = [e.id, e.term, e.name].filter((x) => typeof x === "string" && x.trim());
  const { fichero, simbolo } = partirFuente(e.source_of_truth);
  if (typeof fichero === "string" && fichero !== "none" && !/\.md$/i.test(fichero)) {
    if (simbolo) p.push(simbolo);
    else if (!esModulo(fichero)) p.push(fichero.split("/").pop());
  }
  return p;
}

/** ¿El texto contiene la palabra entera? Límite de palabra con letras y números Unicode (el `\b` de JS solo conoce ASCII), sin mayúsculas. */
export function contienePalabra(palabra, texto) {
  return new RegExp(String.raw`(?<![\p{L}\p{N}_])${escapar(palabra)}(?![\p{L}\p{N}_])`, "iu").test(texto);
}

/** ¿El texto de un lector nombra la entidad, por límite de palabra? */
export function nombraLaEntidad(e, texto) {
  return palabrasDeLaEntidad(e).some((w) => contienePalabra(w, texto));
}

/** Los lectores de la entidad que la nombran (sin los generadores). `leer(ruta)` da el texto o null si no se puede. */
export function lectoresQueNombran(e, leer, generadores = GENERADORES) {
  return (e.readers ?? []).filter((r) => {
    if (generadores.includes(r)) return false;
    const t = leer(r);
    return typeof t === "string" && nombraLaEntidad(e, t);
  });
}
