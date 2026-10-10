/**
 * La guía única de redacción de reglas (#493, fondo #488). `ops/redaccion.json` guarda
 * los principios de cómo se escribe cualquier regla de la casa (criterios, normas, avisos
 * de la guardia, obligaciones del proceso, estándares de agente). Cada principio es una
 * regla con la plantilla de `regla.mjs`, más su ejemplo bueno, su ejemplo malo y su fuente.
 * `docs/ops/REDACCION.md` se GENERA de aquí (`npm run redaccion -- --escribir`) y
 * `ops/redaccion.test.js` lo compara.
 *
 * `catalogos` lista los ficheros que deben seguir la guía. Uno `cumple` si cada entrada
 * pasa `problemasDeRegla`; uno `pendiente` lleva el encargo que lo pone al día, y esa lista
 * solo baja (`ops/redaccion-pendientes.json`, el trinquete).
 *
 * El repo es público (#300): este fichero dice QUÉ se pide, nunca cómo se salta un control.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { FUENTE_F, FUENTE_I } from "./forja.mjs";
import { CONTROL_JUICIO, FUERZAS, LIMITES_REGLA, fraseDeRegla, problemasDeRegla, problemasDeSujetos } from "./regla.mjs";

export const RUTA_REDACCION = "ops/redaccion.json";
export const RUTA_PENDIENTES = "ops/redaccion-pendientes.json";
export const RUTA_MD = "docs/ops/REDACCION.md";

export const MIN_PRINCIPIOS = 10;
export const MAX_PRINCIPIOS = 16;

/** El estado de un catálogo ante la guía. */
export const ESTADOS_CATALOGO = {
  cumple: "Cada entrada pasa las comprobaciones de regla.mjs",
  pendiente: "Aún no sigue la guía; lleva el encargo que lo pone al día y la lista solo baja",
};

/** Los campos de un principio: los de regla.mjs más los propios de la guía. */
export const CAMPOS_PRINCIPIO = ["id", "nombre", "sujeto", "fuerza", "exigencia", "control", "fuente", "ejemplo_bueno", "ejemplo_malo"];
export const CAMPOS_PRINCIPIO_OPCIONALES = ["condicion", "nota"];

const ID_PRINCIPIO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ENCARGO = /^(#\d+|en cola #\d+)$/;

export const leerRedaccion = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_REDACCION), "utf8"));

export function leerPendientes(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_PENDIENTES), "utf8")).pendientes;
}

const esTexto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;

const esRuta = (v) => esTexto(v) || (Array.isArray(v) && v.length > 0 && v.every((x) => esTexto(x)));

/** Errores de un principio, además de los de regla (lista vacía si está bien). */
function problemasDePrincipio(p, d, datos, existe) {
  const malos = [];
  for (const c of Object.keys(p ?? {})) if (![...CAMPOS_PRINCIPIO, ...CAMPOS_PRINCIPIO_OPCIONALES].includes(c)) malos.push(`${d}: campo desconocido «${c}»`);
  for (const c of CAMPOS_PRINCIPIO) if (!(c in (p ?? {}))) malos.push(`${d}: falta «${c}»`);
  malos.push(...problemasDeRegla(p, d, datos.sujetos));
  if (!ID_PRINCIPIO.test(p?.id ?? "")) malos.push(`${d}: «id» va en minúsculas y con guiones`);
  for (const c of ["ejemplo_bueno", "ejemplo_malo"]) {
    const e = p?.[c];
    if (!esTexto(e, 5) || /\n/.test(e)) malos.push(`${d}: falta «${c}» (una línea de 5 caracteres o más)`);
    else if (/[«»]/.test(e)) malos.push(`${d}: «${c}» va sin comillas angulares: la guía las pone`);
  }
  if (p?.ejemplo_bueno && p.ejemplo_bueno === p.ejemplo_malo) malos.push(`${d}: el ejemplo bueno y el malo son el mismo`);
  const f = p?.fuente;
  if (!esTexto(f)) malos.push(`${d}: falta «fuente»`);
  else if (!FUENTE_F.test(f)) {
    const m = FUENTE_I.exec(f);
    if (!m) malos.push(`${d}: «fuente» empieza por [F] con una dirección web o por [I] con una ruta del repo`);
    else if (!existe(m[1])) malos.push(`${d}: la fuente [I] apunta a ${m[1]}, que no existe`);
  }
  const c = p?.control;
  if (!esTexto(c)) malos.push(`${d}: falta «control»`);
  else if (c !== CONTROL_JUICIO && !existe(c)) malos.push(`${d}: el control ${c} no existe`);
  return malos;
}

/**
 * Las reglas de un catálogo según su `clave_reglas`: una clave de primer nivel (`normas`) o una ruta con
 * puntos que atraviesa listas (`pasos.obligaciones`: las obligaciones de cada paso, en orden). Una entrada
 * que lleva `norma` REMITE a una norma de otro catálogo y no es una regla de este: su frase la escribe la
 * norma, y ese catálogo ya se comprueba aparte. Devuelve { reglas, remisiones }, o null si la ruta no existe.
 */
export function reglasDe(json, clave) {
  // Una clave, un camino con puntos (con `*` para recorrer objetos, #516) o una lista de caminos.
  const todas = [];
  for (const camino of [clave].flat()) {
    let nivel = [json];
    for (const parte of String(camino).split(".")) {
      nivel = nivel.flatMap((x) => (Array.isArray(x) ? x : [x])).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        if (parte === "*") return Object.values(x);
        return parte in x ? [x[parte]] : [];
      });
      if (!nivel.length) break;
    }
    todas.push(...nivel.flatMap((x) => (Array.isArray(x) ? x : [x])));
  }
  if (!todas.length) return null;
  return { reglas: todas.filter((r) => !(r && typeof r === "object" && "norma" in r)), remisiones: todas.filter((r) => r && typeof r === "object" && "norma" in r) };
}

/** Las reglas de un catálogo (sin las remisiones a norma); lista vacía si el camino no existe. */
export const reglasEn = (json, ruta) => reglasDe(json, ruta)?.reglas ?? [];

/** Los sujetos de un catálogo: los suyos más los de los catálogos de los que hereda (`sujetos_de`, una lista de ficheros). */
export function sujetosDe(k, json, leerJson) {
  const heredados = (k.sujetos_de ?? []).map((f) => leerJson(f)?.sujetos ?? {});
  return Object.assign({}, ...heredados, json?.[k.clave_sujetos] ?? {});
}

/** Errores de la entrada de un catálogo en la lista de `catalogos`. */
function problemasDeCatalogo(k, d, { existe, leerJson }) {
  const malos = [];
  if (!esTexto(k?.fichero) || !existe(k.fichero)) malos.push(`${d}: el fichero «${k?.fichero}» no existe`);
  if (!(k?.estado in ESTADOS_CATALOGO)) return [...malos, `${d}: estado «${k?.estado}» fuera del vocabulario (${Object.keys(ESTADOS_CATALOGO).join(", ")})`];
  if (k.estado === "pendiente") {
    if (!ENCARGO.test(k.encargo ?? "")) malos.push(`${d}: un catálogo pendiente lleva su encargo («#494» o «en cola #488»)`);
    return malos;
  }
  if (!esRuta(k.clave_reglas) || !esTexto(k.clave_sujetos)) return [...malos, `${d}: un catálogo que cumple dice «clave_reglas» y «clave_sujetos»`];
  if (malos.length) return malos;
  const json = leerJson(k.fichero);
  const de = reglasDe(json, k.clave_reglas);
  if (!de || !de.reglas.length) return [...malos, `${d}: «${k.clave_reglas}» no es una lista de reglas`];
  for (const f of k.sujetos_de ?? []) if (!existe(f)) malos.push(`${d}: sujetos_de cita ${f}, que no existe`);
  if (malos.length) return malos;
  const sujetos = sujetosDe(k, json, leerJson);
  malos.push(...problemasDeSujetos(json[k.clave_sujetos]).map((x) => `${d}: ${x}`));
  de.reglas.forEach((r, i) => malos.push(...problemasDeRegla(r, `${d} · ${r?.id ?? `entrada ${i + 1}`}`, sujetos)));
  return malos;
}

/**
 * Errores de ops/redaccion.json (lista vacía si está bien). `existe(ruta)` y `leerJson(ruta)`
 * se inyectan para poder probar con datos de mentira.
 */
export function problemasDeRedaccion(datos, { existe = () => true, leerJson = () => ({}) } = {}) {
  const malos = [];
  malos.push(...problemasDeSujetos(datos?.sujetos, datos?.artefactos ?? []).map((x) => `sujetos: ${x}`));
  const ps = datos?.principios;
  if (!Array.isArray(ps)) return [...malos, "principios: no es una lista"];
  if (ps.length < MIN_PRINCIPIOS || ps.length > MAX_PRINCIPIOS) malos.push(`principios: hay ${ps.length}, de ${MIN_PRINCIPIOS} a ${MAX_PRINCIPIOS}`);
  const ids = new Set();
  const nombres = new Set();
  ps.forEach((p, i) => {
    const d = `principio ${p?.id ?? i + 1}`;
    malos.push(...problemasDePrincipio(p, d, datos, existe));
    if (ids.has(p?.id)) malos.push(`${d}: id repetido`);
    ids.add(p?.id);
    if (nombres.has(p?.nombre)) malos.push(`${d}: nombre repetido`);
    nombres.add(p?.nombre);
  });
  const cs = datos?.catalogos;
  if (!Array.isArray(cs) || !cs.length) return [...malos, "catalogos: no hay ninguno"];
  const ficheros = new Set();
  cs.forEach((k) => {
    malos.push(...problemasDeCatalogo(k, `catálogo ${k?.fichero}`, { existe, leerJson }));
    if (ficheros.has(k?.fichero)) malos.push(`catálogo ${k?.fichero}: repetido`);
    ficheros.add(k?.fichero);
  });
  return malos;
}

/** Los catálogos pendientes, en orden. */
export const pendientesDe = (datos) => datos.catalogos.filter((k) => k.estado === "pendiente").map((k) => k.fichero);

/**
 * El trinquete: la lista de pendientes solo baja. `guardado` es lo anclado en
 * ops/redaccion-pendientes.json.
 */
export function problemasDeTrinquete(datos, guardado) {
  const hoy = pendientesDe(datos);
  const malos = hoy.filter((f) => !guardado.includes(f)).map((f) => `«${f}» está pendiente y no figuraba: la lista de pendientes solo baja`);
  for (const f of guardado) if (!hoy.includes(f)) malos.push(`«${f}» ya no está pendiente: lanza «npm run redaccion -- --escribir» para bajarlo del ancla`);
  return malos;
}

/**
 * Contra la referencia (origin/staging): el trinquete local se esquiva borrando a la vez el
 * catálogo y su ancla. `refRedaccion` y `refPendientes` son los dos JSON tal como están en la
 * referencia. Falla si hoy hay un pendiente (o un ancla) que la referencia no tenía, o si falta
 * un catálogo que la referencia sí tenía.
 */
export function problemasContraReferencia(datos, guardado, refRedaccion, refPendientes) {
  const malos = [];
  const refAncla = refPendientes?.pendientes ?? [];
  const refCatalogos = (refRedaccion?.catalogos ?? []).map((k) => k.fichero);
  const hoy = datos.catalogos.map((k) => k.fichero);
  const refPend = new Set([...refAncla, ...(refRedaccion?.catalogos ?? []).filter((k) => k.estado === "pendiente").map((k) => k.fichero)]);
  for (const f of pendientesDe(datos)) if (!refPend.has(f)) malos.push(`«${f}» está pendiente y la referencia no lo tenía así: un catálogo nuevo nace cumpliendo la guía`);
  for (const f of guardado) if (!refAncla.includes(f)) malos.push(`«${f}» está en el ancla y la referencia no lo tenía: el ancla solo baja`);
  for (const f of refCatalogos) if (!hoy.includes(f)) malos.push(`falta el catálogo «${f}», que la referencia sí tenía`);
  return malos;
}

/** ¿Hay en este JSON, a cualquier profundidad, entradas con `sujeto`, `fuerza` y `exigencia`? */
export function tieneReglas(json) {
  if (Array.isArray(json)) return json.some(tieneReglas);
  if (json && typeof json === "object") {
    if ("sujeto" in json && "fuerza" in json && "exigencia" in json) return true;
    return Object.values(json).some(tieneReglas);
  }
  return false;
}

/** El ancla nueva: lo anclado que sigue pendiente (y, la primera vez, todo lo pendiente). */
export function anclarPendientes(datos, guardado, { sembrar = false } = {}) {
  const hoy = pendientesDe(datos);
  return sembrar ? hoy : hoy.filter((f) => guardado.includes(f));
}

const celda = (t) => String(t).replace(/\|/g, "\\|");

/** Lo escrito a mano: breve, y lo único del fichero que no sale del JSON. */
const INTRO = [
  "Esta guía dice cómo se escribe cualquier regla de la casa: un criterio de la forja, una norma, un aviso de la guardia, una obligación del proceso o el estándar de una tarea de agente. Es una sola, para que todas se lean igual y se puedan contar.",
  "",
  "Se apoya en tres ideas. La forma sale de EARS (Mavin et al., 2009) y la fuerza de RFC 2119: la regla se escribe por campos y su frase se genera, sin prosa libre. El idioma es el castellano y cada concepto tiene un solo término, el del glosario. Y lo que se vaya a contar va en un campo de vocabulario cerrado, con el texto libre solo en un hueco declarado.",
  "",
  "Cada principio de abajo se escribe él mismo como regla, con su control, su ejemplo bueno, su ejemplo malo y su fuente. Para una regla nueva, se empieza por `scripts/lib/regla.mjs` y por esta lista.",
];

function mdPrincipios(datos) {
  const L = ["## Principios", ""];
  for (const p of datos.principios) {
    L.push(`- \`${p.id}\` — ${fraseDeRegla(p, datos.sujetos)}`);
    L.push(`  - Bueno: «${p.ejemplo_bueno}».`, `  - Malo: «${p.ejemplo_malo}».`);
    if (p.nota) L.push(`  - Nota: ${p.nota}.`);
    L.push(`  - Fuente: ${p.fuente}.`);
  }
  return [...L, ""];
}

function mdVocabularios(datos) {
  const L = LIMITES_REGLA;
  const usos = Object.fromEntries(Object.keys(datos.sujetos).map((s) => [s, datos.principios.filter((p) => p.sujeto === s).length]));
  return [
    "## Vocabularios y topes",
    "",
    "La frase de una regla es: **Nombre.** [Condición,] sujeto DEBE | NO DEBE exigencia. Se comprueba con: control. Con `conviene`: [Condición, para] sujeto, CONVIENE exigencia.",
    "",
    "| Fuerza | Palabra | Qué quiere decir |",
    "|---|---|---|",
    ...Object.entries(FUERZAS).map(([f, x]) => `| ${f} | ${x.palabra} | ${celda(x.que)} |`),
    "",
    "| Sujeto | En la frase | Se aplica a | Principios |",
    "|---|---|---|---|",
    ...Object.entries(datos.sujetos).map(([s, x]) => `| ${s} | ${x.legible} | ${x.aplica_a.join(", ")} | ${usos[s]} |`),
    "",
    "| Campo | Tope |",
    "|---|---|",
    `| nombre | de ${L.nombre.palabras_min} a ${L.nombre.palabras_max} palabras |`,
    `| condicion | de ${L.condicion.min} a ${L.condicion.max} caracteres |`,
    `| exigencia | de ${L.exigencia.min} a ${L.exigencia.max} caracteres |`,
    `| nota | de ${L.nota.min} a ${L.nota.max} caracteres |`,
    `| rúbrica (cumple, no_cumple) | ${L.rubrica.min} caracteres o más |`,
    "",
    "Marca de la fuente: **[F]** está en una fuente externa (con su URL); **[I]** es de la casa (con la ruta del repo donde está escrito).",
    "",
  ];
}

function mdCatalogos(datos, leerJson) {
  const L = ["## Catálogos que siguen la guía", "", "| Catálogo | Estado | Reglas | Encargo |", "|---|---|---|---|"];
  for (const k of datos.catalogos) {
    const de = k.estado === "cumple" ? reglasDe(leerJson(k.fichero), k.clave_reglas) : null;
    const n = de ? String(de.reglas.length + de.remisiones.length) : "-";
    L.push(`| \`${k.fichero}\` | ${k.estado} | ${n} | ${k.encargo ?? "-"} |`);
  }
  const pend = pendientesDe(datos).length;
  L.push("", ...Object.entries(ESTADOS_CATALOGO).map(([e, t]) => `- ${e}: ${t}.`), "", `Pendientes hoy: ${pend}. La lista solo baja (\`${RUTA_PENDIENTES}\`).`, "");
  return L;
}

/** El Markdown completo de docs/ops/REDACCION.md. */
export function generarMd(datos, leerJson) {
  return `${[
    "# Redacción de reglas",
    "",
    `<!-- Generado desde ${RUTA_REDACCION} con «npm run redaccion -- --escribir». No se edita a mano: ops/redaccion.test.js lo compara. -->`,
    "",
    ...INTRO,
    "",
    ...mdPrincipios(datos),
    ...mdVocabularios(datos),
    ...mdCatalogos(datos, leerJson),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export const existeEn = (raiz) => (ruta) => existsSync(join(raiz, ruta));
export const leerJsonEn = (raiz) => (ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));
