/**
 * zonasProyecto.mjs — a qué zona pertenece cada fichero del repo (#652, línea 3 del
 * programa factoría/proyecto): `factoria` (el proceso), `producto` (HoMenu) o `mixto` (sirve
 * a los dos o es la puerta entre ambos). Las reglas viven en `ops/zonas.json`; esto solo las
 * aplica. No confundir con `zonas.mjs` (#506), que dice qué RAMAS vivas llevan qué ficheros.
 *
 * Resolución, de más a menos fuerte: 1) `excepciones` (ruta exacta), 2) `patrones` (la primera
 * expresión regular que casa), 3) `prefijos` (el más largo). Sin regla, la zona es null y
 * `ops/zonas.test.js` falla: un fichero nuevo obliga a decidir su zona.
 *
 * Puro: las rutas entran por argumento. La lectura de git la hace quien llama
 * (`ficherosDeGit` de ops/ficherosGit.js).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const RUTA_ZONAS = "ops/zonas.json";
/** Las zonas, con lo que significa cada una (vocabulario cerrado; ops/vocabularios-vida.json la vigila). */
export const DEF_ZONAS = {
  factoria: "el proceso de trabajo: hooks, guardia de proceso, skills de oficio, normas, scripts de flujo y su documentación",
  producto: "HoMenu: la app, el bot Lola, el catálogo, la base de datos, las imágenes y sus scripts",
  mixto: "sirve a los dos o es la puerta entre ambos (CLAUDE.md, package.json, la guardia, el CI de tests); lo que aún no se ha separado",
};
export const ZONAS = Object.keys(DEF_ZONAS);

/** Los proyectos que la factoría atiende (#652), con lo que es cada uno. Un valor no se borra ni se reutiliza. */
export const DEF_PROYECTOS = {
  homenu: "HoMenu / MenuPlan: la app, Lola y su base; este repo",
  panel: "el panel de la factoría (repo homenu-panel, en el servidor): un visor de lo que mide la factoría",
  factoria: "la propia factoría: el trabajo sobre el proceso, no sobre un producto",
};
export const PROYECTOS = Object.keys(DEF_PROYECTOS);
export const PROYECTO_POR_DEFECTO = "homenu";

export function leerZonas(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_ZONAS), "utf8"));
}

/** Compila las expresiones una vez. */
export function compilar(datos) {
  return { ...datos, _patrones: (datos.patrones ?? []).map((p) => ({ ...p, _re: new RegExp(p.re) })) };
}

/**
 * La zona de una ruta (con «/»), o null si ninguna regla la cubre.
 * `por` dice qué regla decidió: { tipo: "excepcion"|"patron"|"prefijo", regla }.
 */
export function clasificar(ruta, c) {
  const ex = c.excepciones?.[ruta];
  if (ex) return { zona: ex, por: { tipo: "excepcion", regla: ruta } };
  for (const p of c._patrones) if (p._re.test(ruta)) return { zona: p.zona, por: { tipo: "patron", regla: p.re } };
  let mejor = null;
  for (const p of c.prefijos ?? []) if (ruta.startsWith(p.prefijo) && (!mejor || p.prefijo.length > mejor.prefijo.length)) mejor = p;
  return mejor ? { zona: mejor.zona, por: { tipo: "prefijo", regla: mejor.prefijo } } : { zona: null, por: null };
}

/** { zona → n, sin_zona: n, total: n, reglas: Set de las reglas que decidieron algo }. */
export function contarPorZona(rutas, c) {
  const r = { factoria: 0, producto: 0, mixto: 0, sin_zona: 0, total: 0, usadas: new Set(), sin: [] };
  for (const ruta of rutas) {
    const { zona, por } = clasificar(ruta, c);
    r.total += 1;
    if (!zona) { r.sin_zona += 1; r.sin.push(ruta); continue; }
    r[zona] += 1;
    r.usadas.add(`${por.tipo}:${por.regla}`);
  }
  return r;
}

/** Los problemas del propio fichero de reglas (forma, vocabulario, expresiones). Lista vacía si está bien. */
export function problemasDeReglas(datos) {
  const p = [];
  const zonas = datos.zonas ?? [];
  if (JSON.stringify(zonas) !== JSON.stringify(ZONAS)) p.push(`«zonas» tiene que ser ${JSON.stringify(ZONAS)}`);
  if (!Number.isInteger(datos.tope_mixto) || datos.tope_mixto < 0) p.push("«tope_mixto» es un número entero de ficheros");
  for (const x of datos.prefijos ?? []) {
    if (typeof x.prefijo !== "string" || !x.prefijo || x.prefijo.includes("\\")) p.push(`prefijo «${x.prefijo}»: una ruta con «/», sin barras invertidas`);
    if (!ZONAS.includes(x.zona)) p.push(`prefijo «${x.prefijo}»: la zona «${x.zona}» no es de ${ZONAS.join(", ")}`);
  }
  for (const x of datos.patrones ?? []) {
    try { new RegExp(x.re); } catch { p.push(`patrón «${x.re}»: no es una expresión regular`); }
    if (!ZONAS.includes(x.zona)) p.push(`patrón «${x.re}»: la zona «${x.zona}» no es de ${ZONAS.join(", ")}`);
  }
  for (const [ruta, zona] of Object.entries(datos.excepciones ?? {})) {
    if (!ZONAS.includes(zona)) p.push(`excepción «${ruta}»: la zona «${zona}» no es de ${ZONAS.join(", ")}`);
  }
  for (const m of datos.medidas ?? []) {
    const suma = ZONAS.reduce((s, z) => s + (m[z] ?? 0), 0) + (m.sin_zona ?? 0);
    if (!m.fecha || !m.origen || suma !== m.total) p.push(`medida «${m.fecha}»: lleva fecha, origen y las zonas suman el total`);
  }
  return p;
}

/** Las líneas `campo: valor` de la cifra «ficheros por zona»: una por zona y la del total. */
export function lineasDeZonas(r) {
  return [
    ...ZONAS.map((z) => `zonas-proyecto zona: ${z} ficheros: ${r[z]}`),
    `zonas-proyecto total: ${r.total} sin_zona: ${r.sin_zona}`,
  ];
}
