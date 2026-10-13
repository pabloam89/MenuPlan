/**
 * El catálogo de principios de producto (#606): qué hacen bien los mejores productos y chatbots,
 * con su fuente, para decidir, recomendar y diseñar con una base escrita en vez de una impresión.
 *
 * `ops/principios-producto/` es la única fuente de cada principio (un fichero por principio, #505;
 * se lee con `leerCatalogo`). Desde #620 un principio es el PORQUÉ, sin fuerza: la plantilla de
 * principio de `regla.mjs` (nombre, enunciado y porqué de una frase, sin «debe») más lo propio del
 * producto: `area` (vocabulario cerrado del catálogo), `ejemplo_bueno`, `ejemplo_malo` y `fuentes`,
 * una lista de { url, marca }: F si la fuente lo dice, S si es inferencia nuestra o fuente secundaria
 * (la marca I es de la casa, con ruta, y aquí no se usa: MARCAS_FUENTE de regla.mjs).
 *
 * Lo que el principio pedía con DEBE es una NORMA de `ops/normas.json` que lo cita (`principio`), con
 * su control, su ejecutor y su veredicto: el texto no se copia en dos sitios. El documento junta las
 * dos capas: cada principio con las normas que lo citan.
 *
 * Sale de aquí, y el test lo compara: `docs/producto/PRINCIPIOS.md` (`npm run principios -- --escribir`).
 * Repo público (#300): este catálogo dice QUÉ se pide, nunca cómo se salta un control.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { leerCatalogo } from "./catalogos.mjs";
import { CONTROL_JUICIO, MARCAS_FUENTE, fraseDeRegla, problemasDePrincipio as problemasDeForma } from "./regla.mjs";

export const RUTA_PRINCIPIOS = "ops/principios-producto/";
export const RUTA_MD = "docs/producto/PRINCIPIOS.md";

/** Lo que lleva cada principio: la plantilla de principio de regla.mjs más lo propio del producto. Sin fuerza ni control: eso es de su norma. */
export const CAMPOS_PRINCIPIO = ["id", "nombre", "area", "enunciado", "porque", "ejemplo_bueno", "ejemplo_malo", "fuentes"];
export const CAMPOS_OPCIONALES = [];

/** Las marcas de una fuente con url (las de MARCAS_FUENTE de regla.mjs sin I, que lleva ruta): F la fuente lo dice, S es inferencia nuestra. */
export const MARCAS = { F: MARCAS_FUENTE.F, S: MARCAS_FUENTE.S };

/** Dominios admitidos para una fuente: documentación y estudios de referencia, no blogs al azar (taplytics es la excepción declarada, marcada S). */
export const DOMINIOS_FUENTE = [
  "api-security.owasp.org", "genai.owasp.org", "www.cisa.gov", "www.anthropic.com", "www.microsoft.com", "pair.withgoogle.com",
  "gdpr-info.eu", "www.nngroup.com", "www.intercom.com", "docs.stripe.com", "basecamp.com", "www.w3.org", "taplytics.com",
];

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
const textosDe = (p) => ["nombre", "enunciado", "porque", "ejemplo_bueno", "ejemplo_malo"].map((c) => p?.[c]).filter((t) => typeof t === "string");

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

/** Errores de un principio (lista vacía si está bien): la plantilla de principio, el área, los ejemplos y las fuentes. */
function problemasDePrincipio(p, d, datos) {
  const malos = [];
  for (const c of Object.keys(p ?? {})) if (![...CAMPOS_PRINCIPIO, ...CAMPOS_OPCIONALES].includes(c)) malos.push(`${d}: campo desconocido «${c}»${["sujeto", "fuerza", "condicion", "exigencia", "control", "nota"].includes(c) ? " (la obligación es de su norma en ops/normas.json, #620)" : ""}`);
  for (const c of CAMPOS_PRINCIPIO) if (!(c in (p ?? {}))) malos.push(`${d}: falta «${c}»`);
  malos.push(...problemasDeForma(p, d));
  if (!ID.test(p?.id ?? "")) malos.push(`${d}: «id» va en minúsculas y con guiones, en inglés`);
  if (!(p?.area in (datos.areas ?? {}))) malos.push(`${d}: área «${p?.area}» fuera del vocabulario (${Object.keys(datos.areas ?? {}).join(", ")})`);
  for (const c of ["ejemplo_bueno", "ejemplo_malo"]) {
    const e = p?.[c];
    if (!esTexto(e, 10) || /\n/.test(e)) malos.push(`${d}: falta «${c}» (una línea de 10 caracteres o más)`);
    else if (/[«»]/.test(e)) malos.push(`${d}: «${c}» va sin comillas angulares: el documento las pone`);
  }
  if (p?.ejemplo_bueno && p.ejemplo_bueno === p.ejemplo_malo) malos.push(`${d}: el ejemplo bueno y el malo son el mismo`);
  malos.push(...problemasDeFuentes(p?.fuentes, d));
  for (const t of textosDe(p)) {
    for (const q of citasDe(t)) if (palabras(q) > MAX_PALABRAS_CITA) malos.push(`${d}: una cita literal de ${palabras(q)} palabras (el máximo es ${MAX_PALABRAS_CITA}); parafrasea`);
  }
  return malos;
}

/**
 * Errores del catálogo entero (lista vacía si está bien). Que cada principio tenga su norma lo
 * mira ops/uniones.test.js, que lee la lista única y el registro de normas.
 */
export function problemasDePrincipios(datos) {
  const malos = [];
  for (const k of ["sujetos", "artefactos"]) if (k in (datos ?? {})) malos.push(`${k}: un catálogo de principios no lleva «${k}»: los sujetos son de sus normas (ops/normas.json, #620)`);
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
    malos.push(...problemasDePrincipio(p, d, datos));
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

/** Las normas de ops/normas.json que citan cada principio: { id: [norma, …] }. `normas`: la lista del registro. */
export const normasDe = (normas, id) => (normas ?? []).filter((n) => n.principio === id);

/** ¿Lo vigila un control de verdad (alguna de sus normas tiene un fichero y no solo juicio)? */
export const tieneControl = (p, normas) => normasDe(normas, p.id).some((n) => n.control !== CONTROL_JUICIO);

/** Cuántos principios hay por área, cuántos con norma y cuántos con control de verdad: [{ area, total, conNorma, conControl }]. */
export function cifras(datos, normas) {
  return Object.keys(datos.areas).map((area) => {
    const ps = principiosDe(datos, area);
    return { area, total: ps.length, conNorma: ps.filter((p) => normasDe(normas, p.id).length).length, conControl: ps.filter((p) => tieneControl(p, normas)).length };
  });
}

const fuentesLinea = (p) => p.fuentes.map((f) => `[${f.marca}] ${f.url}`).join("; ");
const celda = (t) => String(t).replace(/\|/g, "\\|");
const controlCorto = (n) => (n.control === CONTROL_JUICIO ? "juicio" : `\`${n.control}\``);

/** Una línea para el terminal: id, área y el enunciado. */
export const lineaDe = (p) => `${p.id} (${p.area}): **${p.nombre}.** ${p.enunciado}`;

/** La línea de una norma que cita el principio: su id, su frase (sin el control) y su control. `registro`: ops/normas.json leído. */
export const lineaDeNorma = (n, registro) => `\`${n.id}\` — ${fraseDeRegla(n, registro.sujetos, { conControl: false })} Control: ${controlCorto(n)} (${n.veredicto}).`;

const INTRO = [
  "Lo que hacen bien los mejores productos y chatbots, con su fuente, para decidir, recomendar y diseñar HoMenu y Lola con una base y no con una impresión. Cada principio se cita por su id en la recomendación que manda; si dos chocan, se dice.",
  "",
  "Cada principio es el porqué, sin fuerza: su enunciado, su porqué, un ejemplo bueno y uno malo aplicados al producto, y sus fuentes (**[F]** la fuente lo dice, **[S]** es inferencia nuestra o la fuente es secundaria). Lo que obliga es su **norma**, en `ops/normas.json` (`docs/ops/NORMAS.md`): la frase con DEBE, el control que la vigila (un fichero, o el juicio de una persona) y su veredicto. Para añadir uno nuevo, un fichero en `ops/principios-producto/principios/`, su norma en `ops/normas.json` y la skill `principios-de-producto`.",
];

function mdCifras(datos, normas) {
  const filas = cifras(datos, normas);
  const suma = (k) => filas.reduce((s, f) => s + f[k], 0);
  return [
    "## Cifras",
    "",
    "| Área | Principios | Con norma | Con control de verdad |",
    "|---|---|---|---|",
    ...filas.map((f) => `| ${celda(datos.areas[f.area].legible)} (\`${f.area}\`) | ${f.total} | ${f.conNorma} | ${f.conControl} |`),
    `| **Total** | **${suma("total")}** | **${suma("conNorma")}** | **${suma("conControl")}** |`,
    "",
  ];
}

function mdArea(datos, area, registro) {
  const a = datos.areas[area];
  const L = [`## ${a.legible[0].toUpperCase()}${a.legible.slice(1)} (\`${area}\`)`, "", `${a.que}.`, ""];
  for (const p of principiosDe(datos, area)) {
    L.push(`- \`${p.id}\` — **${p.nombre}.** ${p.enunciado}`);
    L.push(`  - Porqué: ${p.porque}`);
    for (const n of normasDe(registro.normas, p.id)) L.push(`  - Norma: ${celda(lineaDeNorma(n, registro))}`);
    L.push(`  - Bueno: «${p.ejemplo_bueno}».`, `  - Malo: «${p.ejemplo_malo}».`);
    L.push(`  - Fuentes: ${fuentesLinea(p)}.`);
  }
  return [...L, ""];
}

/** El Markdown completo de docs/producto/PRINCIPIOS.md. `registro`: ops/normas.json leído (las normas de cada principio). */
export function generarMd(datos, registro) {
  return `${[
    "# Principios de producto",
    "",
    `<!-- Generado desde ${RUTA_PRINCIPIOS} y ops/normas.json con «npm run principios -- --escribir». No se edita a mano: ops/principios-producto.test.js lo compara. -->`,
    "",
    ...INTRO,
    "",
    ...mdCifras(datos, registro.normas),
    ...Object.keys(datos.areas).flatMap((a) => mdArea(datos, a, registro)),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export const existeEn = (raiz) => (ruta) => existsSync(join(raiz, ruta));
