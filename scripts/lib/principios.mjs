/**
 * La lista única de principios de la casa (#619, fondo #618).
 *
 * Tres capas que no se repiten: el PRINCIPIO es el porqué (aquí); la NORMA es lo que debe ser
 * verdad, con su control, y cita su principio (`ops/normas.json`, campo `principio`); el ESTÁNDAR
 * de tarea cita normas (#620). Este módulo es el único lector de la lista.
 *
 * La lista sale de dos sitios, sin copiar nada:
 *  - `ops/principios/` (catálogo partido, #505): los principios propios, con forma fija (id, area,
 *    nombre, enunciado, porque, fuente y, si hay, detalle y origen). Aquí viven los que antes
 *    estaban en «Pensar en datos» de CLAUDE.md, en docs/datos/PRINCIPIOS.md, en
 *    docs/entidades/N0-principios.md y en la auditoría de agentes (C1…C12, I1…I10, N1…N7). Los
 *    documentos de datos y de entidades siguen siendo el detalle: `detalle` apunta a su sección.
 *  - los catálogos DELEGADOS, que ya tenían su test y su skill: los principios de producto
 *    (`ops/principios-producto/`) y la guía de redacción (`ops/redaccion.json`). Se leen de su
 *    sitio con su propio lector y su enunciado sale de su regla (`fraseDeRegla`): una sola
 *    fuente del texto. `anexos` les añade detalle u origen sin tocar su catálogo.
 *
 * Sale de aquí, y el test lo compara: docs/PRINCIPIOS.md (`npm run principios-casa -- --escribir`).
 * Las uniones con las normas (norma → principio, principio sin norma) las vigila ops/uniones.test.js.
 * Repo público (#300): un principio dice el porqué, nunca cómo se salta un control.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { leerCatalogo } from "./catalogos.mjs";
import { ACCIONES } from "./estandaresAgentes.mjs";
import { FUENTE_F, FUENTE_I } from "./forja.mjs";
import { leerPrincipios as leerProducto } from "./principiosProducto.mjs";
import { leerRedaccion } from "./redaccion.mjs";
import { fraseDeRegla, problemasDePrincipio } from "./regla.mjs";

export const RUTA_PRINCIPIOS = "ops/principios/";
export const RUTA_MD = "docs/PRINCIPIOS.md";

/** Lo que lleva cada principio propio, y lo que puede faltar. */
export const CAMPOS = ["id", "area", "nombre", "enunciado", "porque", "fuente"];
export const CAMPOS_OPCIONALES = ["detalle", "origen"];
/** Lo que puede llevar un anexo a un principio delegado. */
export const CAMPOS_ANEXO = ["detalle", "origen"];

/** Las listas de las que viene cada principio (`origen`): todas deben quedar migradas. */
export const ORIGENES = {
  agentes: [
    ...Array.from({ length: 12 }, (_, i) => `C${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `I${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `N${i + 1}`),
  ],
  // Los puntos de «Pensar en datos» de CLAUDE.md, tal como estaban el 11 oct 2026.
  claude: [
    "discreto-primero", "vocabulario-cerrado", "una-palabra-un-significado", "ninguna-cifra-sin-pregunta",
    "cada-cosa-deja-una-linea", "la-clase-no-el-caso", "la-cifra-antes-y-despues", "el-mecanismo-mas-alto",
    "tres-capas", "el-juez-llm", "ninguna-cifra-es-objetivo-sola", "de-arriba-abajo",
  ].map((x) => `claude:${x}`),
};
const TODOS_ORIGENES = [...ORIGENES.agentes, ...ORIGENES.claude];

/** Documentos cuyas secciones numeradas tienen que quedar citadas por algún `detalle` (las listas migradas). */
export const DOCUMENTOS_MIGRADOS = ["docs/datos/PRINCIPIOS.md", "docs/entidades/N0-principios.md"];

/**
 * Techo de principios sin ninguna norma (`principios_sin_norma` de `ops/principios/_catalogo.json`).
 * Solo baja: si un principio gana su norma, sale de la lista y este número baja con ella (el
 * test lo pide igual a la cifra, así que subirlo es un cambio de código que ve el revisor).
 */
export const TECHO_SIN_NORMA = 61;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ORIGEN = /^(C([1-9]|1[0-2])|I([1-9]|10)|N[1-7]|claude:[a-z0-9-]+)$/;
const esTexto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;

/** El ancla de un título de Markdown, como la pone GitHub: minúsculas, sin signos, espacios a guion. */
export function anclaDe(titulo) {
  return titulo.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}

/** Las anclas de todos los títulos de un Markdown. */
export const anclasDe = (md) => new Set([...String(md).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((m) => anclaDe(m[1])));

/** Las anclas de las secciones numeradas («## 4. …» o «### 4. …») de un Markdown. */
export const seccionesNumeradas = (md) => [...String(md).matchAll(/^#{2,3}\s+(\d+\.\s.+?)\s*$/gm)].map((m) => anclaDe(m[1]));

/** El catálogo propio, tal cual (sin los delegados). */
export const leerCatalogoPropio = (raiz) => leerCatalogo(raiz, RUTA_PRINCIPIOS);

const sinCabeza = (frase) => frase.replace(/^\*\*[^*]+\*\*\s+/, "");

/** Un principio de producto, con la forma de la lista. */
function deProducto(p, datos, delegado) {
  return {
    id: p.id, area: "producto", nombre: p.nombre, enunciado: sinCabeza(fraseDeRegla(p, datos.sujetos, { conControl: false })),
    porque: p.porque, fuente: `[${p.fuentes[0].marca}] ${p.fuentes[0].url}`, detalle: [delegado.detalle], origen: [], catalogo: delegado.catalogo,
  };
}

/** Un principio de redacción, con la forma de la lista (no lleva «porque»: es una regla de escritura; su nota, si hay). */
function deRedaccion(p, datos, delegado) {
  return {
    id: p.id, area: "redaccion", nombre: p.nombre, enunciado: sinCabeza(fraseDeRegla(p, datos.sujetos, { conControl: false })),
    porque: p.nota ?? null, fuente: p.fuente, detalle: [delegado.detalle], origen: [], catalogo: delegado.catalogo,
  };
}

/**
 * La lista entera, ya compuesta: { areas, delegados, anexos, sin_norma, principios: [{ id, area,
 * nombre, enunciado, porque, fuente, detalle, origen, catalogo }] }. `catalogo` es null en los
 * propios y la ruta de su catálogo en los delegados. `propio` se inyecta para poder probar.
 */
export function componerLista(propio, { producto = null, redaccion = null } = {}) {
  const delegados = propio.delegados ?? {};
  const fuera = (propio.principios ?? []).map((p) => ({ ...p, detalle: p.detalle ?? [], origen: p.origen ?? [], catalogo: null }));
  if (delegados.producto && producto) fuera.push(...producto.principios.map((p) => deProducto(p, producto, delegados.producto)));
  if (delegados.redaccion && redaccion) fuera.push(...redaccion.principios.map((p) => deRedaccion(p, redaccion, delegados.redaccion)));
  for (const p of fuera) {
    const a = propio.anexos?.[p.id];
    if (!a || !p.catalogo) continue;
    p.detalle = [...p.detalle, ...(a.detalle ?? [])];
    p.origen = [...p.origen, ...(a.origen ?? [])];
  }
  return { areas: propio.areas ?? {}, delegados, anexos: propio.anexos ?? {}, sin_norma: propio.principios_sin_norma ?? {}, principios: fuera };
}

/** La lista entera del repo: el catálogo propio más los delegados, cada uno leído con su lector de siempre. */
export function leerPrincipiosCasa(raiz) {
  const propio = leerCatalogoPropio(raiz);
  const d = propio.delegados ?? {};
  return componerLista(propio, { producto: d.producto ? leerProducto(raiz) : null, redaccion: d.redaccion ? leerRedaccion(raiz) : null });
}

function problemasDeDetalle(lista, d, { existe, leerTexto }) {
  const malos = [];
  if (!Array.isArray(lista) || !lista.length) return [`${d}: «detalle» es una lista de rutas (ruta o ruta#sección)`];
  for (const r of lista) {
    if (typeof r !== "string" || !r.trim()) { malos.push(`${d}: un «detalle» vacío`); continue; }
    const [ruta, ancla] = r.split("#");
    if (!existe(ruta)) { malos.push(`${d}: el detalle ${ruta} no existe en el repo`); continue; }
    if (ancla !== undefined && !anclasDe(leerTexto(ruta)).has(ancla)) malos.push(`${d}: ${ruta} no tiene la sección #${ancla}`);
  }
  if (new Set(lista).size !== lista.length) malos.push(`${d}: «detalle» repite una ruta`);
  return malos;
}

function problemasDeOrigen(lista, d) {
  if (!Array.isArray(lista) || !lista.length) return [`${d}: «origen» es una lista (C1…C12, I1…I10, N1…N7 o claude:<id>)`];
  const malos = [];
  for (const o of lista) {
    if (!ORIGEN.test(o ?? "")) malos.push(`${d}: origen «${o}» no tiene la forma C1…C12, I1…I10, N1…N7 o claude:<id>`);
    else if (!TODOS_ORIGENES.includes(o)) malos.push(`${d}: origen «${o}» no está en ORIGENES (scripts/lib/principios.mjs)`);
  }
  return malos;
}

/** Errores de un principio propio (lista vacía si está bien). */
function problemasDePropio(p, d, areas, ctx) {
  const malos = [];
  for (const c of Object.keys(p ?? {})) if (![...CAMPOS, ...CAMPOS_OPCIONALES].includes(c)) malos.push(`${d}: campo desconocido «${c}»`);
  for (const c of CAMPOS) if (!(c in (p ?? {}))) malos.push(`${d}: falta «${c}»`);
  if (!ID.test(p?.id ?? "")) malos.push(`${d}: «id» va en minúsculas y con guiones, en inglés`);
  if (!(p?.area in (areas ?? {}))) malos.push(`${d}: área «${p?.area}» fuera del vocabulario (${Object.keys(areas ?? {}).join(", ")})`);
  // La plantilla de principio (nombre, enunciado y porqué), la misma que pasa la guía de redacción.
  malos.push(...problemasDePrincipio(p, d));
  const f = typeof p?.fuente === "string" ? p.fuente : "";
  if (FUENTE_F.test(f)) { /* externa, con su dirección */ } else if (FUENTE_I.test(f)) {
    if (!ctx.existe(f.match(FUENTE_I)[1])) malos.push(`${d}: la fuente de la casa apunta a ${f.match(FUENTE_I)[1]}, que no existe en el repo`);
  } else malos.push(`${d}: «fuente» es «[F] https://…» (externa) o «[I] ruta/del/repo» (de la casa)`);
  if ("detalle" in (p ?? {})) malos.push(...problemasDeDetalle(p.detalle, d, ctx));
  if ("origen" in (p ?? {})) malos.push(...problemasDeOrigen(p.origen, d));
  return malos;
}

/**
 * Errores de la lista (lista vacía si está bien). `propio` es el catálogo de ops/principios/ tal
 * cual; `lista`, la de `componerLista` (con los delegados). `existe(ruta)` y `leerTexto(ruta)` se
 * inyectan para poder probar con datos de mentira.
 */
export function problemasDePrincipios(propio, lista, { existe = () => true, leerTexto = () => "" } = {}) {
  const malos = [];
  const areas = propio?.areas;
  if (!areas || typeof areas !== "object" || !Object.keys(areas).length) malos.push("areas: la lista no declara su vocabulario de áreas");
  for (const [id, a] of Object.entries(areas ?? {})) {
    if (!/^[a-z]+$/.test(id)) malos.push(`área «${id}»: el id va en minúsculas, una palabra`);
    if (!esTexto(a?.legible, 4) || !esTexto(a?.que, 15)) malos.push(`área «${id}»: lleva «legible» y «que» (una frase)`);
  }
  for (const [area, dl] of Object.entries(propio?.delegados ?? {})) {
    if (!(area in (areas ?? {}))) malos.push(`delegado «${area}»: no es un área`);
    if (!existe(dl?.catalogo ?? "")) malos.push(`delegado «${area}»: su catálogo ${dl?.catalogo} no existe`);
    if (!existe(dl?.detalle ?? "")) malos.push(`delegado «${area}»: su detalle ${dl?.detalle} no existe`);
  }
  const ps = propio?.principios;
  if (!Array.isArray(ps) || !ps.length) return [...malos, "principios: no es una lista con principios"];
  ps.forEach((p, i) => malos.push(...problemasDePropio(p, `principio ${p?.id ?? i + 1}`, areas, { existe, leerTexto })));
  // Ids y nombres únicos en toda la lista, contando los delegados.
  const ids = new Map();
  const nombres = new Map();
  for (const p of lista ?? []) {
    if (ids.has(p.id)) malos.push(`principio ${p.id}: id repetido (${ids.get(p.id)} y ${p.catalogo ?? RUTA_PRINCIPIOS})`);
    ids.set(p.id, p.catalogo ?? RUTA_PRINCIPIOS);
    const n = String(p.nombre).toLowerCase();
    if (nombres.has(n)) malos.push(`principio ${p.id}: nombre «${p.nombre}» repetido con ${nombres.get(n)}`);
    nombres.set(n, p.id);
  }
  for (const [id, a] of Object.entries(propio?.anexos ?? {})) {
    const p = (lista ?? []).find((x) => x.id === id);
    if (!p) malos.push(`anexo ${id}: no es un principio de la lista`);
    else if (!p.catalogo) malos.push(`anexo ${id}: es un principio propio; su detalle y su origen van en su fichero`);
    for (const c of Object.keys(a ?? {})) if (!CAMPOS_ANEXO.includes(c)) malos.push(`anexo ${id}: campo desconocido «${c}»`);
    if ("detalle" in (a ?? {})) malos.push(...problemasDeDetalle(a.detalle, `anexo ${id}`, { existe, leerTexto }));
    if ("origen" in (a ?? {})) malos.push(...problemasDeOrigen(a.origen, `anexo ${id}`));
  }
  for (const a of Object.keys(areas ?? {})) if (!(lista ?? []).some((p) => p.area === a)) malos.push(`área «${a}»: ningún principio la usa`);
  return malos;
}

/**
 * Lo que falta por migrar: orígenes (C/I/N y los puntos de «Pensar en datos») que ningún
 * principio declara, o que declaran dos, y secciones numeradas de los documentos migrados que
 * ningún `detalle` cita. `textos`: { ruta: markdown } de DOCUMENTOS_MIGRADOS.
 */
export function faltasDeMigracion(lista, textos) {
  const malos = [];
  const origenes = new Map();
  for (const p of lista) for (const o of p.origen ?? []) origenes.set(o, [...(origenes.get(o) ?? []), p.id]);
  for (const o of TODOS_ORIGENES) if (!origenes.has(o)) malos.push(`origen ${o}: ningún principio lo recoge`);
  for (const [o, ids] of origenes) if (ids.length > 1) malos.push(`origen ${o}: lo recogen ${ids.join(", ")}; un origen va a un solo principio`);
  const citadas = new Set(lista.flatMap((p) => p.detalle ?? []));
  for (const [ruta, md] of Object.entries(textos)) {
    for (const s of seccionesNumeradas(md)) if (!citadas.has(`${ruta}#${s}`)) malos.push(`${ruta}#${s}: ningún principio la cita en «detalle»`);
  }
  return malos;
}

/**
 * Las uniones entre normas y principios (lo que vigila ops/uniones.test.js):
 *  1. cada norma cita un principio que existe;
 *  2. cada principio tiene al menos una norma, o está en `sinNorma` con su motivo, y esa lista
 *     no pasa de `techo`;
 *  3. un principio de `sinNorma` que ya tiene norma sale de la lista (si no, la lista no baja);
 *  4. una norma con ejecutor «nada» lleva su issue;
 *  5. cada acción de una norma es una de las de ops/estandares-agentes.json (`acciones`).
 */
export function problemasDeUniones(lista, normas, sinNorma, { techo = TECHO_SIN_NORMA, acciones = ACCIONES } = {}) {
  const malos = [];
  const ids = new Set(lista.map((p) => p.id));
  const citados = new Map();
  for (const n of normas) {
    if (typeof n.principio !== "string" || !n.principio) malos.push(`norma ${n.id}: no cita ningún principio («principio»)`);
    else if (!ids.has(n.principio)) malos.push(`norma ${n.id}: cita el principio «${n.principio}», que no está en la lista`);
    else citados.set(n.principio, [...(citados.get(n.principio) ?? []), n.id]);
    if (n.ejecutor === "nada" && !Number.isInteger(n.issue)) malos.push(`norma ${n.id}: nadie la hace cumplir (ejecutor nada) y no tiene issue que lo lleve`);
    for (const a of n.acciones ?? []) if (!acciones.includes(a)) malos.push(`norma ${n.id}: la acción «${a}» no está en ops/estandares-agentes.json (${acciones.join(", ")})`);
  }
  for (const p of lista) {
    if (citados.has(p.id)) {
      if (p.id in sinNorma) malos.push(`principio ${p.id}: ya lo cita ${citados.get(p.id).join(", ")}; quítalo de principios_sin_norma y baja TECHO_SIN_NORMA`);
    } else if (!(p.id in sinNorma)) malos.push(`principio ${p.id}: ninguna norma lo cita; dale una norma o, con su motivo, ponlo en principios_sin_norma`);
  }
  for (const [id, motivo] of Object.entries(sinNorma)) {
    if (!ids.has(id)) malos.push(`principios_sin_norma: «${id}» no es un principio de la lista`);
    if (!esTexto(motivo, 20)) malos.push(`principios_sin_norma: «${id}» lleva su motivo (20 caracteres o más)`);
  }
  const n = Object.keys(sinNorma).length;
  if (n > techo) malos.push(`principios_sin_norma: ${n} principios sin norma y el techo es ${techo}; la lista solo baja`);
  return malos;
}

/** Las normas que citan cada principio: { id: [norma, …] }. */
export function normasPorPrincipio(normas) {
  const fuera = {};
  for (const n of normas) if (n.principio) (fuera[n.principio] ??= []).push(n.id);
  return fuera;
}

/** Cuántos principios hay por área, cuántos de un catálogo delegado y cuántos sin norma. */
export function cifras(datos) {
  return Object.keys(datos.areas).map((area) => {
    const ps = datos.principios.filter((p) => p.area === area);
    return { area, total: ps.length, delegados: ps.filter((p) => p.catalogo).length, sinNorma: ps.filter((p) => p.id in datos.sin_norma).length };
  });
}

const enlace = (r) => `\`${r}\``;

/** Una línea de un principio, para la terminal y el documento. */
export const lineaDe = (p) => `\`${p.id}\` — **${p.nombre}.** ${p.enunciado}`;

/** El Markdown completo de docs/PRINCIPIOS.md. */
export function generarMd(datos) {
  const L = [
    "# Principios de la casa",
    "",
    `<!-- Generado desde ${[RUTA_PRINCIPIOS, ...Object.values(datos.delegados).map((d) => d.catalogo)].join(", ")} con «npm run principios-casa -- --escribir». No se edita a mano: ops/principios.test.js lo compara. -->`,
    "",
    "La lista única de principios: el porqué de lo que se pide. Tres capas que no se repiten: un **principio** dice por qué; una **norma** (`ops/normas.json`, `docs/ops/NORMAS.md`) dice lo que debe ser verdad, con su control, y cita su principio; un **estándar** de tarea (`ops/estandares-agentes.json`) cita normas. Cada principio lleva su fuente (**[F]** externa, **[I]** de la casa, con la ruta donde está escrito) y, si hay, el detalle donde se desarrolla. Los de producto y redacción viven en su propio catálogo, con su test, y aquí se listan sin copiarse.",
    "",
    "Las normas de cada principio: `npm run principios-casa -- <id>`. Un principio que aún no cita ninguna norma está en `principios_sin_norma` de `ops/principios/_catalogo.json`, con su motivo; esa lista solo baja.",
    "",
    "## Cifras",
    "",
    "| Área | Principios | De un catálogo delegado | Sin norma |",
    "|---|---|---|---|",
  ];
  const filas = cifras(datos);
  for (const f of filas) L.push(`| ${datos.areas[f.area].legible} (\`${f.area}\`) | ${f.total} | ${f.delegados} | ${f.sinNorma} |`);
  const suma = (k) => filas.reduce((s, f) => s + f[k], 0);
  L.push(`| **Total** | **${suma("total")}** | **${suma("delegados")}** | **${suma("sinNorma")}** |`);
  for (const [area, a] of Object.entries(datos.areas)) {
    const ps = datos.principios.filter((p) => p.area === area);
    L.push("", `## ${a.legible.charAt(0).toUpperCase()}${a.legible.slice(1)} (\`${area}\`)`, "", `${a.que}.`);
    const dl = datos.delegados[area];
    if (dl) L.push("", `Catálogo delegado: ${enlace(dl.catalogo)} (detalle en ${enlace(dl.detalle)}). ${dl.que}.`);
    L.push("");
    for (const p of ps) {
      L.push(`- ${lineaDe(p)}`);
      if (p.porque) L.push(`  - Porqué: ${p.porque}`);
      L.push(`  - Fuente: ${p.fuente}`);
      const det = p.catalogo ? p.detalle.filter((r) => r !== dl?.detalle) : p.detalle;
      if (det.length) L.push(`  - Detalle: ${det.map(enlace).join(", ")}`);
      if (p.origen.length) L.push(`  - Viene de: ${p.origen.join(", ")}`);
      if (p.id in datos.sin_norma) L.push(`  - Sin norma: ${datos.sin_norma[p.id]}`);
    }
  }
  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** `existe` y `leerTexto` sobre el repo. */
export const existeEn = (raiz) => (ruta) => existsSync(join(raiz, ruta));
export const leerTextoEn = (raiz) => (ruta) => readFileSync(join(raiz, ruta), "utf8");
