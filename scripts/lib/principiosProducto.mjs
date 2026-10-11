/**
 * El catálogo de principios de producto (#606): qué hacen bien los mejores productos y chatbots,
 * con su fuente, para decidir, recomendar y diseñar con una base escrita en vez de una impresión.
 *
 * `ops/principios-producto/` es la única fuente (un fichero por principio, #505; se lee con
 * `leerCatalogo`). Cada principio es una regla con la plantilla de `regla.mjs` (nombre, sujeto,
 * fuerza, condicion, exigencia, control, nota) más lo propio del producto: `area` (vocabulario
 * cerrado del catálogo), `porque`, `ejemplo_bueno`, `ejemplo_malo` y `fuentes`, una lista de
 * { url, marca }: F si la fuente lo dice, I si es inferencia nuestra. La frase de cada principio se
 * genera con `fraseDeRegla`; no hay un campo de prosa libre con la regla.
 *
 * El control es un fichero que exista y de verdad vigile lo que dice el principio (un test, un
 * hook, un script o un workflow), o `juicio`. Un fichero que solo vigila una parte lo dice en la
 * `nota`; no se pone para quedar bien.
 *
 * Sale de aquí, y el test lo compara: `docs/producto/PRINCIPIOS.md` (`npm run principios -- --escribir`).
 * Repo público (#300): este catálogo dice QUÉ se pide, nunca cómo se salta un control.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { leerCatalogo } from "./catalogos.mjs";
import { CONTROL_JUICIO, fraseDeRegla, problemasDeRegla, problemasDeSujetos } from "./regla.mjs";

export const RUTA_PRINCIPIOS = "ops/principios-producto/";
export const RUTA_MD = "docs/producto/PRINCIPIOS.md";

/** Lo que lleva cada principio (los de regla más los propios) y lo que puede faltar. */
export const CAMPOS_PRINCIPIO = ["id", "nombre", "area", "sujeto", "fuerza", "exigencia", "control", "porque", "ejemplo_bueno", "ejemplo_malo", "fuentes"];
export const CAMPOS_OPCIONALES = ["condicion", "nota"];

/** Las marcas de una fuente: F la fuente lo dice, I es inferencia nuestra. */
export const MARCAS = { F: "la fuente lo dice", I: "inferencia nuestra, o fuente secundaria" };

/** Dominios admitidos para una fuente: documentación y estudios de referencia, no blogs al azar (taplytics es la excepción declarada, marcada I). */
export const DOMINIOS_FUENTE = [
  "api-security.owasp.org", "genai.owasp.org", "www.cisa.gov", "www.anthropic.com", "www.microsoft.com", "pair.withgoogle.com",
  "gdpr-info.eu", "www.nngroup.com", "www.intercom.com", "docs.stripe.com", "basecamp.com", "www.w3.org", "taplytics.com",
];

/** Un control que no es juicio ha de ser algo que se ejecuta, no un documento. */
const CONTROL_EJECUTABLE = /\.(m?js|jsx|cjs|ya?ml)$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Una cita literal entre comillas no pasa de estas palabras (derechos de autor y ruido). */
export const MAX_PALABRAS_CITA = 15;

const esTexto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;
const palabras = (t) => t.trim().split(/\s+/).length;

export const leerPrincipios = (raiz) => leerCatalogo(raiz, RUTA_PRINCIPIOS);

/** Las citas entre comillas («…», “…» o "…") de un texto. */
export function citasDe(texto) {
  const fuera = [];
  for (const re of [/«([^»]*)»/g, /“([^”]*)”/g, /"([^"]*)"/g]) for (const m of String(texto).matchAll(re)) fuera.push(m[1]);
  return fuera;
}

/** Todos los textos de un principio, para mirar citas. */
const textosDe = (p) => ["nombre", "condicion", "exigencia", "nota", "porque", "ejemplo_bueno", "ejemplo_malo"].map((c) => p?.[c]).filter((t) => typeof t === "string");

function problemasDeFuentes(fuentes, d) {
  if (!Array.isArray(fuentes) || !fuentes.length) return [`${d}: «fuentes» es una lista con una fuente como mínimo`];
  const malos = [];
  const vistas = new Set();
  fuentes.forEach((f, i) => {
    const donde = `${d} · fuente ${i + 1}`;
    for (const c of Object.keys(f ?? {})) if (!["url", "marca"].includes(c)) malos.push(`${donde}: campo «${c}» no admitido`);
    if (!(f?.marca in MARCAS)) malos.push(`${donde}: marca «${f?.marca}» fuera del vocabulario (${Object.keys(MARCAS).join(", ")})`);
    let url = null;
    try { url = new URL(f?.url); } catch {
      // a propósito: una dirección que no se puede leer es el propio defecto que se cuenta justo debajo
    }
    if (!url || url.protocol !== "https:") malos.push(`${donde}: «url» es una dirección https completa`);
    else if (!DOMINIOS_FUENTE.includes(url.hostname)) malos.push(`${donde}: el dominio ${url.hostname} no está en DOMINIOS_FUENTE (scripts/lib/principiosProducto.mjs)`);
    if (vistas.has(f?.url)) malos.push(`${donde}: fuente repetida en el mismo principio`);
    vistas.add(f?.url);
  });
  return malos;
}

/** Errores de un principio (lista vacía si está bien): la regla, el área, los ejemplos, las fuentes y el control. */
function problemasDePrincipio(p, d, datos, existe) {
  const malos = [];
  for (const c of Object.keys(p ?? {})) if (![...CAMPOS_PRINCIPIO, ...CAMPOS_OPCIONALES].includes(c)) malos.push(`${d}: campo desconocido «${c}»`);
  for (const c of CAMPOS_PRINCIPIO) if (!(c in (p ?? {}))) malos.push(`${d}: falta «${c}»`);
  malos.push(...problemasDeRegla(p, d, datos.sujetos));
  if (!ID.test(p?.id ?? "")) malos.push(`${d}: «id» va en minúsculas y con guiones, en inglés`);
  if (!(p?.area in (datos.areas ?? {}))) malos.push(`${d}: área «${p?.area}» fuera del vocabulario (${Object.keys(datos.areas ?? {}).join(", ")})`);
  if (!esTexto(p?.porque, 15) || /\n/.test(p.porque)) malos.push(`${d}: «porque» es una línea de 15 caracteres o más`);
  for (const c of ["ejemplo_bueno", "ejemplo_malo"]) {
    const e = p?.[c];
    if (!esTexto(e, 10) || /\n/.test(e)) malos.push(`${d}: falta «${c}» (una línea de 10 caracteres o más)`);
    else if (/[«»]/.test(e)) malos.push(`${d}: «${c}» va sin comillas angulares: el documento las pone`);
  }
  if (p?.ejemplo_bueno && p.ejemplo_bueno === p.ejemplo_malo) malos.push(`${d}: el ejemplo bueno y el malo son el mismo`);
  malos.push(...problemasDeFuentes(p?.fuentes, d));
  const c = p?.control;
  if (!esTexto(c)) malos.push(`${d}: falta «control»`);
  else if (c !== CONTROL_JUICIO) {
    if (!CONTROL_EJECUTABLE.test(c)) malos.push(`${d}: el control ${c} no es un test, un hook, un script ni un workflow; si lo vigila una persona, es «juicio»`);
    else if (!existe(c)) malos.push(`${d}: el control ${c} no existe en el repo`);
  }
  for (const t of textosDe(p)) {
    for (const q of citasDe(t)) if (palabras(q) > MAX_PALABRAS_CITA) malos.push(`${d}: una cita literal de ${palabras(q)} palabras (el máximo es ${MAX_PALABRAS_CITA}); parafrasea`);
  }
  return malos;
}

/**
 * Errores del catálogo entero (lista vacía si está bien). `existe(ruta)` se inyecta para poder
 * probar con datos de mentira.
 */
export function problemasDePrincipios(datos, { existe = () => true } = {}) {
  const malos = [];
  malos.push(...problemasDeSujetos(datos?.sujetos, datos?.artefactos ?? []).map((x) => `sujetos: ${x}`));
  const areas = datos?.areas;
  if (!areas || typeof areas !== "object" || !Object.keys(areas).length) malos.push("areas: el catálogo no declara su vocabulario de áreas");
  else {
    for (const [id, a] of Object.entries(areas)) {
      if (!ID.test(id)) malos.push(`área «${id}»: el id va en minúsculas y con guiones, en inglés`);
      if (!esTexto(a?.legible, 4) || !esTexto(a?.que, 15)) malos.push(`área «${id}»: lleva «legible» y «que» (una frase)`);
    }
  }
  const ps = datos?.principios;
  if (!Array.isArray(ps) || !ps.length) return [...malos, "principios: no es una lista con principios"];
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
  for (const a of Object.keys(areas ?? {})) if (!ps.some((p) => p?.area === a)) malos.push(`área «${a}»: ningún principio la usa; quítala o añade uno`);
  return malos;
}

/** Los principios de un área (o todos, sin área), en el orden del catálogo. */
export const principiosDe = (datos, area) => datos.principios.filter((p) => !area || p.area === area);

/** ¿Tiene un control de verdad (un fichero) y no solo juicio? */
export const tieneControl = (p) => p.control !== CONTROL_JUICIO;

/** Cuántos principios hay por área y cuántos con control de verdad: [{ area, total, conControl }]. */
export function cifras(datos) {
  return Object.keys(datos.areas).map((area) => {
    const ps = principiosDe(datos, area);
    return { area, total: ps.length, conControl: ps.filter(tieneControl).length };
  });
}

const fuentesLinea = (p) => p.fuentes.map((f) => `[${f.marca}] ${f.url}`).join("; ");
const celda = (t) => String(t).replace(/\|/g, "\\|");

/** Una línea para el terminal: id, área, la frase y el control. */
export const lineaDe = (p, datos) => `${p.id} (${p.area}): ${fraseDeRegla(p, datos.sujetos)}`;

const INTRO = [
  "Lo que hacen bien los mejores productos y chatbots, escrito como reglas con su fuente, para decidir, recomendar y diseñar HoMenu y Lola con una base y no con una impresión. Cada principio se cita por su id en la recomendación que manda; si dos chocan, se dice.",
  "",
  "Cada uno es una regla con la plantilla de `scripts/lib/regla.mjs`, más su porqué, un ejemplo bueno y uno malo aplicados al producto, y sus fuentes: **[F]** la fuente lo dice, **[I]** es inferencia nuestra o la fuente es secundaria. El control es el fichero que lo vigila de verdad, o el juicio de una persona. Para añadir uno nuevo, un fichero en `ops/principios-producto/principios/` y la skill `principios-de-producto`.",
];

function mdCifras(datos) {
  const filas = cifras(datos);
  const total = filas.reduce((s, f) => s + f.total, 0);
  const con = filas.reduce((s, f) => s + f.conControl, 0);
  return [
    "## Cifras",
    "",
    "| Área | Principios | Con control de verdad |",
    "|---|---|---|",
    ...filas.map((f) => `| ${celda(datos.areas[f.area].legible)} (\`${f.area}\`) | ${f.total} | ${f.conControl} |`),
    `| **Total** | **${total}** | **${con}** |`,
    "",
  ];
}

function mdArea(datos, area) {
  const a = datos.areas[area];
  const L = [`## ${a.legible[0].toUpperCase()}${a.legible.slice(1)} (\`${area}\`)`, "", `${a.que}.`, ""];
  for (const p of principiosDe(datos, area)) {
    L.push(`- \`${p.id}\` — ${fraseDeRegla(p, datos.sujetos)}`);
    L.push(`  - Porqué: ${p.porque}`);
    L.push(`  - Bueno: «${p.ejemplo_bueno}».`, `  - Malo: «${p.ejemplo_malo}».`);
    if (p.nota) L.push(`  - Nota: ${p.nota}`);
    L.push(`  - Fuentes: ${fuentesLinea(p)}.`);
  }
  return [...L, ""];
}

/** El Markdown completo de docs/producto/PRINCIPIOS.md. */
export function generarMd(datos) {
  return `${[
    "# Principios de producto",
    "",
    `<!-- Generado desde ${RUTA_PRINCIPIOS} con «npm run principios -- --escribir». No se edita a mano: ops/principios-producto.test.js lo compara. -->`,
    "",
    ...INTRO,
    "",
    ...mdCifras(datos),
    ...Object.keys(datos.areas).flatMap((a) => mdArea(datos, a)),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export const existeEn = (raiz) => (ruta) => existsSync(join(raiz, ruta));
