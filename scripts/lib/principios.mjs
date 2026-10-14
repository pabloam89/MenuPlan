/**
 * La lista única de principios de la casa (#619, fondo #618).
 *
 * Tres capas que no se repiten: el PRINCIPIO es el porqué (aquí); la NORMA es lo que debe ser
 * verdad, con su control, y cita su principio (`ops/normas.json`, campo `principio`); el ESTÁNDAR
 * de tarea cita normas (#620). Este módulo es el único lector de la lista.
 *
 * La lista sale de dos sitios, sin copiar nada:
 *  - `ops/principios/` (catálogo partido, #505): los principios propios, con la plantilla de
 *    principio de regla.mjs (nombre, enunciado y porqué de una frase) más id, area (AMBITOS de
 *    ambitos.mjs), fuentes y, si hay, detalle y origen. Aquí viven los que antes estaban en
 *    «Pensar en datos» de CLAUDE.md, en docs/datos/PRINCIPIOS.md, en
 *    docs/entidades/N0-principios.md y en la auditoría de agentes (C1…C12, I1…I10, N1…N7). Los
 *    documentos de datos y de entidades guardan el desarrollo: `detalle` apunta a su sección y
 *    la sección cita el id (un solo enunciado por principio).
 *  - los catálogos DELEGADOS, que ya tenían su test y su skill: los principios de producto
 *    (`ops/principios-producto/`) y la guía de redacción (`ops/redaccion.json`). Se leen de su
 *    sitio con su propio lector; desde #620 son principios sin fuerza con su propio enunciado
 *    (lo que pedían con DEBE es una norma de ops/normas.json que los cita): una sola
 *    fuente del texto. `anexos` les añade detalle, origen o su condición de puente entre ejes.
 *
 * Sale de aquí, y el test lo compara: docs/PRINCIPIOS.md (`npm run principios-casa -- --escribir`).
 * Las uniones con las normas (norma → principio, principio sin norma) las vigila ops/uniones.test.js.
 * Repo público (#300): un principio dice el porqué, nunca cómo se salta un control.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { AMBITOS, DOMINIOS_OPCIONALES } from "./ambitos.mjs";
import { esCatalogo, leerCatalogo } from "./catalogos.mjs";
import { conFuentesResueltas } from "./fuentesDoc.mjs";
import { ACCIONES, UMBRAL_REESCRITURA, leerEstandares, parecido } from "./estandaresAgentes.mjs";
import { leerForja } from "./forja.mjs";
import { leerPrincipios as leerProducto } from "./principiosProducto.mjs";
import { leerRedaccion } from "./redaccion.mjs";
import { ID_KEBAB, MARCAS_FUENTE, problemasDePrincipio } from "./regla.mjs";

export const RUTA_PRINCIPIOS = "ops/principios/";
export const RUTA_MD = "docs/PRINCIPIOS.md";
/** Los principios de un proyecto (#710): ops/proyectos/<id>/principios/, un catálogo partido con el mismo esquema y `project`. */
export const RUTA_PROYECTOS = "ops/proyectos";
export const rutaPrincipiosDeProyecto = (id) => `${RUTA_PROYECTOS}/${id}/principios/`;

/** Lo que lleva cada principio propio, y lo que puede faltar. */
export const CAMPOS = ["id", "area", "nombre", "enunciado", "porque", "fuentes"];
export const CAMPOS_OPCIONALES = ["detalle", "origen"];
/** Solo lo lleva un principio de proyecto: el id del proyecto (un id de PROYECTOS_CON_NORMAS, scripts/lib/zonasProyecto.mjs). */
export const CAMPO_PROYECTO = "project";
/** Lo que puede llevar un anexo a un principio delegado. */
export const CAMPOS_ANEXO = ["detalle", "origen", "puente"];

/** La marca de una fuente: la de regla.mjs, con un solo significado en todos los catálogos (#620). */
export { MARCAS_FUENTE };


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

/** Documentos de la casa cuyas secciones numeradas tienen que quedar citadas por algún `detalle` (las listas migradas). */
export const DOCUMENTOS_MIGRADOS = ["docs/entidades/N0-principios.md"];
/** Lo mismo para los documentos de un proyecto (HoMenu): los vigila un test de la zona del proyecto, no de la casa (#710, PR 6). */
export const DOCUMENTOS_MIGRADOS_DE_PROYECTO = ["docs/datos/PRINCIPIOS.md"];

/**
 * Techo de principios sin ninguna norma (`principios_sin_norma`), propios o de un catálogo
 * delegado: desde #620 los delegados ya no tienen techo aparte (todos tienen su norma). Solo baja:
 * si un principio gana su norma, sale de la lista y este número baja con ella (el test lo pide
 * igual a la cifra, así que subirlo es un cambio de código que ve el revisor).
 */
export const TECHO_SIN_NORMA = 3;

const ORIGEN = /^(C([1-9]|1[0-2])|I([1-9]|10)|N[1-7]|claude:[a-z0-9-]+)$/;
const esTexto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;

/** El ancla de un título de Markdown, como la pone GitHub: minúsculas, sin signos, espacios a guion. */
export function anclaDe(titulo) {
  return titulo.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}

const TITULO = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/** Las anclas de todos los títulos de un Markdown. */
export const anclasDe = (md) => new Set([...String(md).matchAll(new RegExp(TITULO.source, "gm"))].map((m) => anclaDe(m[2])));

/** Las anclas de las secciones numeradas («## 4. …» o «### 4. …») de un Markdown. */
export const seccionesNumeradas = (md) => [...String(md).matchAll(/^#{2,3}\s+(\d+\.\s.+?)\s*$/gm)].map((m) => anclaDe(m[1]));

/** El texto de una sección: desde su título hasta el siguiente del mismo nivel o más alto ("" si no está). */
export function seccionDe(md, ancla) {
  const lineas = String(md).split("\n");
  const i = lineas.findIndex((l) => TITULO.test(l) && anclaDe(TITULO.exec(l)[2]) === ancla);
  if (i < 0) return "";
  const nivel = TITULO.exec(lineas[i])[1].length;
  let j = i + 1;
  while (j < lineas.length && !(TITULO.test(lineas[j]) && TITULO.exec(lineas[j])[1].length <= nivel)) j++;
  return lineas.slice(i, j).join("\n");
}

/** El catálogo propio, tal cual (sin los delegados). */
export const leerCatalogoPropio = (raiz) => conFuentesResueltas(raiz, leerCatalogo(raiz, RUTA_PRINCIPIOS));

/** Los principios de cada proyecto, tal cual: { <id>: { project, principios: [...] } } ({} si ninguno tiene registro). */
export function leerPrincipiosDeProyecto(raiz) {
  const fuera = {};
  const dir = join(raiz, RUTA_PROYECTOS);
  if (!existsSync(dir)) return fuera;
  for (const id of readdirSync(dir).sort()) {
    if (esCatalogo(raiz, rutaPrincipiosDeProyecto(id))) fuera[id] = conFuentesResueltas(raiz, leerCatalogo(raiz, rutaPrincipiosDeProyecto(id)));
  }
  return fuera;
}

/** Una fuente «[F] url» o «[I] ruta» de la guía de redacción, con la forma de la lista. */
function deTextoDeFuente(t) {
  const m = /^\[(F|I)\] (\S+)$/.exec(String(t));
  if (!m) return { marca: "?", ruta: String(t) };
  if (/^https:\/\//.test(m[2])) return { marca: m[1], url: m[2] };
  return { marca: "I", ruta: m[2] };
}

/** Un principio de producto, con la forma de la lista: todas sus fuentes. */
function deProducto(p, datos, delegado) {
  return {
    id: p.id, area: "product", nombre: p.nombre, enunciado: p.enunciado,
    porque: p.porque, fuentes: p.fuentes.map((f) => ({ marca: f.marca, url: f.url })), detalle: [delegado.detalle], origen: [], catalogo: delegado.catalogo,
    ...(p.dominio ? { dominio: p.dominio } : {}),
  };
}

/** Un principio de redacción, con la forma de la lista. */
function deRedaccion(p, datos, delegado) {
  return {
    id: p.id, area: "writing", nombre: p.nombre, enunciado: p.enunciado,
    porque: p.porque, fuentes: [deTextoDeFuente(p.fuente)], detalle: [delegado.detalle], origen: [], catalogo: delegado.catalogo,
  };
}

/**
 * La lista entera, ya compuesta: { delegados, anexos, sin_norma, principios: [{ id, area,
 * nombre, enunciado, porque, fuentes, detalle, origen, puente, catalogo }] }. `catalogo` es null
 * en los propios y la ruta de su catálogo en los delegados. `propio` se inyecta para poder probar.
 */
export function componerLista(propio, { producto = null, redaccion = null, proyectos = {} } = {}) {
  const delegados = propio.delegados ?? {};
  const fuera = (propio.principios ?? []).map((p) => ({ ...p, detalle: p.detalle ?? [], origen: p.origen ?? [], puente: null, catalogo: null }));
  if (delegados.product && producto) fuera.push(...producto.principios.map((p) => ({ ...deProducto(p, producto, delegados.product), puente: null })));
  if (delegados.writing && redaccion) fuera.push(...redaccion.principios.map((p) => ({ ...deRedaccion(p, redaccion, delegados.writing), puente: null })));
  for (const cat of Object.values(proyectos)) {
    fuera.push(...(cat.principios ?? []).map((p) => ({ ...p, detalle: p.detalle ?? [], origen: p.origen ?? [], puente: null, catalogo: null })));
  }
  for (const p of fuera) {
    const a = propio.anexos?.[p.id];
    if (!a || !p.catalogo) continue;
    p.detalle = [...p.detalle, ...(a.detalle ?? [])];
    p.origen = [...p.origen, ...(a.origen ?? [])];
    p.puente = a.puente ?? null;
  }
  return { delegados, anexos: propio.anexos ?? {}, sin_norma: propio.principios_sin_norma ?? {}, precedencia: propio.precedencia ?? null, principios: fuera };
}

/** La lista entera del repo: el catálogo propio más los delegados, cada uno leído con su lector de siempre. */
export function leerPrincipiosCasa(raiz) {
  const propio = leerCatalogoPropio(raiz);
  const d = propio.delegados ?? {};
  return componerLista(propio, { producto: d.product ? leerProducto(raiz) : null, redaccion: d.writing ? leerRedaccion(raiz) : null, proyectos: leerPrincipiosDeProyecto(raiz) });
}

function problemasDeDetalle(lista, d, { existe, leerTexto }) {
  const malos = [];
  if (!Array.isArray(lista) || !lista.length) return [`${d}: «detalle» es una lista de rutas (ruta o ruta#sección)`];
  for (const r of lista) {
    if (typeof r !== "string" || !r.trim()) { malos.push(`${d}: un «detalle» vacío`); continue; }
    const [ruta, ancla] = r.split("#");
    if (ruta === "CLAUDE.md" && ancla === "pensar-en-datos") malos.push(`${d}: «Pensar en datos» de CLAUDE.md apunta a esta lista; como detalle sería circular`);
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

/** Errores de la lista de fuentes de un principio: { marca, url } con F o S; { marca: I, ruta } de la casa. */
export function problemasDeFuentes(fuentes, d, existe) {
  if (!Array.isArray(fuentes) || !fuentes.length) return [`${d}: «fuentes» es una lista con una fuente como mínimo`];
  const malos = [];
  fuentes.forEach((f, i) => {
    const q = `${d} · fuente ${i + 1}`;
    if (!(f?.marca in MARCAS_FUENTE)) { malos.push(`${q}: marca «${f?.marca}» fuera del vocabulario (${Object.keys(MARCAS_FUENTE).join(", ")})`); return; }
    const claves = Object.keys(f).sort().join();
    if (f.marca === "I") {
      if (claves !== "marca,ruta") malos.push(`${q}: una fuente de la casa (I) lleva solo «marca» y «ruta»; una inferencia con url es S`);
      else if (!existe(String(f.ruta).split("#")[0])) malos.push(`${q}: la ruta ${f.ruta} no existe en el repo`);
    } else if (claves !== "marca,url") malos.push(`${q}: una fuente ${f.marca} lleva solo «marca» y «url»; si es una ruta del repo, su marca es I`);
    else if (!/^https:\/\/[^\s/]+\/\S*$/.test(f.url)) malos.push(`${q}: «url» es una dirección https completa`);
  });
  if (new Set(fuentes.map((f) => f?.url ?? f?.ruta)).size !== fuentes.length) malos.push(`${d}: una fuente repetida`);
  return malos;
}

// ── Un solo significado de cada marca de fuente (#620) ─────────────────────

/** Una fuente escrita como texto («[F] https://…», «[I] ruta»), con la forma { marca, url | ruta }. */
function deTextoMarcado(t) {
  const m = /^\[([A-Z])\] (\S+)$/.exec(String(t ?? ""));
  if (!m) return { marca: "?", texto: String(t) };
  return /^https?:\/\//.test(m[2]) ? { marca: m[1], url: m[2] } : { marca: m[1], ruta: m[2] };
}

/**
 * Las fuentes de todos los catálogos que marcan sus fuentes, con la forma { catalogo, donde, marca,
 * url | ruta }: la lista de principios (con producto y redacción, que entran por ella), la forja y los
 * estándares de agente. Los catálogos se inyectan para poder probar.
 */
export function fuentesMarcadas({ lista = [], forja = null, estandares = null } = {}) {
  const fuera = [];
  for (const p of lista) for (const f of p.fuentes ?? []) fuera.push({ catalogo: p.catalogo ?? (p.project ? rutaPrincipiosDeProyecto(p.project) : RUTA_PRINCIPIOS), donde: p.id, ...f });
  for (const c of forja?.criterios ?? []) if (c?.fuente) fuera.push({ catalogo: "ops/forja/", donde: c.id, ...deTextoMarcado(c.fuente) });
  for (const [id, f] of Object.entries(estandares?.fuentes ?? {})) {
    fuera.push({ catalogo: "ops/estandares-agentes.json", donde: id, ...(f?.tipo === "casa" ? { marca: "I", ruta: f.ruta } : { marca: "F", url: f?.url }) });
  }
  return fuera;
}

/**
 * Errores de las marcas (lista vacía si está bien): cada marca es de MARCAS_FUENTE y significa lo
 * mismo en todos los catálogos; I lleva una ruta del repo y F y S, una url. Una I con url (el viejo
 * «inferencia») o una C (la vieja «casa») falla.
 */
export function problemasDeMarcas(fuentes) {
  const malos = [];
  for (const f of fuentes) {
    const d = `${f.catalogo} · ${f.donde}`;
    if (!(f.marca in MARCAS_FUENTE)) { malos.push(`${d}: marca «${f.marca}» fuera de MARCAS_FUENTE (${Object.keys(MARCAS_FUENTE).join(", ")})`); continue; }
    if (f.marca === "I" && (f.url || !f.ruta)) malos.push(`${d}: [I] es de la casa y lleva una ruta del repo; una inferencia con url es [S]`);
    if (f.marca !== "I" && (f.ruta || !f.url)) malos.push(`${d}: [${f.marca}] lleva una url; lo escrito en la casa es [I]`);
  }
  return malos;
}

/**
 * Las marcas en prosa (skills, plantillas y documentos, #620): un `[I]` va seguido de la ruta del repo donde
 * está escrito (que exista), un `[F]` no apunta a una ruta del repo (eso es [I]) y no queda ninguna `[C]`.
 * La inferencia se marca [S]. Devuelve una línea por fallo; `existe(ruta)` se inyecta.
 */
export function problemasDeMarcasEnTexto(ruta, texto, existe) {
  const malos = [];
  const tras = /^(?:\*\*)?\s*`?(\.?[\w.-]+(?:\/[\w.-]*)+|[\w.-]+\.(?:md|json|mjs|js))/;
  String(texto).split("\n").forEach((l, i) => {
    const d = `${ruta}:${i + 1}`;
    for (const m of l.matchAll(/\[([A-Z])\]/g)) {
      const resto = l.slice(m.index + 3);
      const r = tras.exec(resto);
      const rutaCitada = r ? r[1].replace(/[.,;:)]+$/, "") : null;
      // Una mención que define la marca («[I] es de la casa», «de la casa ([I])») vale; una que la define como inferencia, no.
      // Lo que dice de esta marca: hasta la siguiente marca, 45 caracteres como mucho.
      const suyo = resto.slice(0, 45).split(/\[[A-Z][\]:]/)[0];
      const cerca = `${l.slice(Math.max(0, m.index - 15), m.index)} ${suyo}`;
      const define = /casa|ruta/i.test(cerca) && !/inferencia/i.test(suyo);
      if (m[1] === "C") malos.push(`${d}: la marca [C] ya no existe; lo escrito en la casa es [I]`);
      else if (m[1] === "I" && /inferencia/i.test(suyo)) malos.push(`${d}: [I] no es inferencia: es lo escrito en la casa; la inferencia es [S]`);
      else if (m[1] === "I" && !define && (!rutaCitada || !existe(rutaCitada))) malos.push(`${d}: [I] es de la casa y va seguida de una ruta del repo que exista; una inferencia es [S]`);
      else if (m[1] === "F" && rutaCitada && /`/.test(resto.slice(0, 3)) && existe(rutaCitada)) malos.push(`${d}: [F] apunta a ${rutaCitada}, que es del repo: es [I]`);
    }
  });
  return malos;
}

/** Las fuentes marcadas del repo, leídas con el lector de cada catálogo. */
export const fuentesMarcadasDelRepo = (raiz) => fuentesMarcadas({ lista: leerPrincipiosCasa(raiz).principios, forja: leerForja(raiz), estandares: leerEstandares(raiz) });

/** Errores de un principio propio (lista vacía si está bien). */
function problemasDePropio(p, d, ctx) {
  const malos = [];
  const permitidos = [...CAMPOS, ...CAMPOS_OPCIONALES, ...(ctx.deProyecto ? [CAMPO_PROYECTO] : [])];
  for (const c of Object.keys(p ?? {})) {
    if (c === CAMPO_PROYECTO && !ctx.deProyecto) malos.push(`${d}: un principio horizontal no lleva «${CAMPO_PROYECTO}»; el de un proyecto va a ${RUTA_PROYECTOS}/<id>/principios/`);
    else if (!permitidos.includes(c)) malos.push(`${d}: campo desconocido «${c}»`);
  }
  for (const c of CAMPOS) if (!(c in (p ?? {}))) malos.push(`${d}: falta «${c}»`);
  if (!ID_KEBAB.test(p?.id ?? "")) malos.push(`${d}: «id» va en minúsculas y con guiones, en inglés`);
  if (!(p?.area in AMBITOS)) malos.push(`${d}: área «${p?.area}» fuera del vocabulario (${Object.keys(AMBITOS).join(", ")})`);
  // La plantilla de principio (nombre, enunciado y porqué), la misma que pasa la guía de redacción.
  malos.push(...problemasDePrincipio(p, d));
  malos.push(...problemasDeFuentes(p?.fuentes, d, ctx.existe));
  if ("detalle" in (p ?? {})) malos.push(...problemasDeDetalle(p.detalle, d, ctx));
  if ("origen" in (p ?? {})) malos.push(...problemasDeOrigen(p.origen, d));
  return malos;
}

/**
 * Errores de los registros de principios de proyecto (#710): cada carpeta es de un proyecto de `validos` (PROYECTOS_CON_NORMAS de
 * scripts/lib/zonasProyecto.mjs), su `project` y el de cada principio coinciden con la carpeta, y cada principio pasa lo mismo que
 * uno horizontal (plantilla, fuentes, detalle, origen). `proyectos`: lo que da leerPrincipiosDeProyecto.
 */
export function problemasDePrincipiosDeProyecto(proyectos, validos, ctx) {
  const malos = [];
  for (const [id, cat] of Object.entries(proyectos ?? {})) {
    const ruta = rutaPrincipiosDeProyecto(id);
    if (!validos.includes(id)) malos.push(`${ruta}: «${id}» no es un proyecto con normas de scripts/lib/zonasProyecto.mjs (${validos.join(", ")})`);
    if (cat?.project !== id) malos.push(`${ruta}: su «project» es «${cat?.project}» y la carpeta es «${id}»`);
    if (!Array.isArray(cat?.principios) || !cat.principios.length) { malos.push(`${ruta}: «principios» no es una lista con principios`); continue; }
    for (const [i, p] of cat.principios.entries()) {
      const d = `principio ${p?.id ?? i + 1}`;
      if (p?.project !== id) malos.push(`${d}: su «project» es «${p?.project}» y vive en el registro de «${id}»`);
      malos.push(...problemasDePropio(p, d, { ...ctx, deProyecto: true }));
    }
  }
  return malos;
}

/**
 * Errores de la lista (lista vacía si está bien). `propio` es el catálogo de ops/principios/ tal
 * cual; `lista`, la de `componerLista` (con los delegados). `existe(ruta)` y `leerTexto(ruta)` se
 * inyectan para poder probar con datos de mentira.
 */
export function problemasDePrincipios(propio, lista, { existe = () => true, leerTexto = () => "", proyectos = {}, validos = Object.keys(proyectos) } = {}) {
  const malos = problemasDePrincipiosDeProyecto(proyectos, validos, { existe, leerTexto });
  for (const [area, dl] of Object.entries(propio?.delegados ?? {})) {
    if (!(area in AMBITOS)) malos.push(`delegado «${area}»: no es un valor de AMBITOS`);
    if (!existe(dl?.catalogo ?? "")) malos.push(`delegado «${area}»: su catálogo ${dl?.catalogo} no existe`);
    if (!existe(dl?.detalle ?? "")) malos.push(`delegado «${area}»: su detalle ${dl?.detalle} no existe`);
    if ("sin_norma" in (dl ?? {})) malos.push(`delegado «${area}»: ya no lleva «sin_norma» (#620): cada principio delegado tiene su norma o va a principios_sin_norma con su motivo`);
  }
  const ps = propio?.principios;
  if (!Array.isArray(ps) || !ps.length) return [...malos, "principios: no es una lista con principios"];
  ps.forEach((p, i) => malos.push(...problemasDePropio(p, `principio ${p?.id ?? i + 1}`, { existe, leerTexto })));
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
    if ("puente" in (a ?? {}) && (!esTexto(a.puente, 20) || /\n/.test(a.puente))) malos.push(`anexo ${id}: «puente» dice en una línea por qué vale en los dos ejes`);
  }
  return malos;
}

/**
 * Lo que falta por migrar: orígenes (C/I/N y los puntos de «Pensar en datos») que ningún
 * principio declara, o que declaran dos, y secciones numeradas de los documentos migrados que
 * ningún `detalle` cita. `textos`: { ruta: markdown } de DOCUMENTOS_MIGRADOS o de DOCUMENTOS_MIGRADOS_DE_PROYECTO.
 * Con `origenes: false` solo mira las secciones (el test del proyecto no repite lo de los orígenes).
 */
export function faltasDeMigracion(lista, textos, { origenes: conOrigenes = true } = {}) {
  const malos = [];
  const origenes = new Map();
  for (const p of lista) for (const o of p.origen ?? []) origenes.set(o, [...(origenes.get(o) ?? []), p.id]);
  if (conOrigenes) {
    for (const o of TODOS_ORIGENES) if (!origenes.has(o)) malos.push(`origen ${o}: ningún principio lo recoge`);
    for (const [o, ids] of origenes) if (ids.length > 1) malos.push(`origen ${o}: lo recogen ${ids.join(", ")}; un origen va a un solo principio`);
  }
  const citadas = new Set(lista.flatMap((p) => p.detalle ?? []));
  for (const [ruta, md] of Object.entries(textos)) {
    for (const s of seccionesNumeradas(md)) if (!citadas.has(`${ruta}#${s}`)) malos.push(`${ruta}#${s}: ningún principio la cita en «detalle»`);
  }
  return malos;
}

/**
 * Un solo enunciado por principio: cada sección de un documento migrado que un principio da
 * como detalle cita su id (`` `id` ``) y guarda el desarrollo, sin otro «Enunciado.» propio.
 */
export function problemasDeEnunciadoUnico(lista, textos) {
  const malos = [];
  for (const p of lista) {
    for (const r of p.detalle ?? []) {
      const [ruta, ancla] = r.split("#");
      if (!(ruta in textos) || !ancla) continue;
      const s = seccionDe(textos[ruta], ancla);
      if (!s.includes(`\`${p.id}\``)) malos.push(`${ruta}#${ancla}: no cita el principio \`${p.id}\` (su enunciado vive en ${RUTA_MD})`);
    }
  }
  for (const [ruta, md] of Object.entries(textos)) if (/\*\*Enunciado\.\*\*/.test(md)) malos.push(`${ruta}: lleva un «Enunciado.» propio; el enunciado vive en ${RUTA_MD} y aquí, el desarrollo`);
  return malos;
}

/**
 * Las uniones entre normas y principios (lo que vigila ops/uniones.test.js):
 *  1. cada norma cita un principio que existe;
 *  2. cada principio, propio o delegado, tiene al menos una norma, o está en `sinNorma` con su
 *     motivo, y esa lista no pasa de `techo` (desde #620 los delegados no tienen techo aparte);
 *  3. un principio de `sinNorma` que ya tiene norma sale de la lista (si no, la lista no baja);
 *  4. una norma con ejecutor «nada» lleva su issue (un número; que sea un encargo o una decisión abiertos lo
 *     mira el CI con red, scripts/fondos-pr.mjs, #620);
 *  5. las acciones de una norma son de ops/estandares-agentes.json, en el orden de esa lista.
 */
export function problemasDeUniones(lista, normas, { sinNorma = {} } = {}, { techo = TECHO_SIN_NORMA, acciones = ACCIONES } = {}) {
  const malos = [];
  const ids = new Set(lista.map((p) => p.id));
  const citados = new Map();
  const dominios = new Map(lista.filter((p) => p.dominio).map((p) => [p.id, p.dominio]));
  for (const n of normas) {
    // Un principio de un paquete opcional (dominio) solo lo citan normas de ese ámbito: si no, un proyecto sin el paquete recibiría una norma suya.
    if (dominios.has(n.principio) && n.ambito !== dominios.get(n.principio)) malos.push(`norma ${n.id}: cita el principio «${n.principio}», del paquete opcional «${dominios.get(n.principio)}», y su ámbito es «${n.ambito}»: un proyecto sin el paquete la recibiría`);
    if (typeof n.principio !== "string" || !n.principio) malos.push(`norma ${n.id}: no cita ningún principio («principio»)`);
    else if (!ids.has(n.principio)) malos.push(`norma ${n.id}: cita el principio «${n.principio}», que no está en la lista`);
    else citados.set(n.principio, [...(citados.get(n.principio) ?? []), n.id]);
    if (n.ejecutor === "nada" && !Number.isInteger(n.issue)) malos.push(`norma ${n.id}: nadie la hace cumplir (ejecutor nada) y no tiene issue que lo lleve`);
    for (const a of n.acciones ?? []) if (!acciones.includes(a)) malos.push(`norma ${n.id}: la acción «${a}» no está en ops/estandares-agentes.json (${acciones.join(", ")})`);
    const orden = (n.acciones ?? []).map((a) => acciones.indexOf(a));
    if (orden.some((x, i) => i > 0 && x < orden[i - 1])) malos.push(`norma ${n.id}: «acciones» va en el orden de ops/estandares-agentes.json (${acciones.join(", ")})`);
  }
  for (const p of lista) {
    if (citados.has(p.id)) {
      if (p.id in sinNorma) malos.push(`principio ${p.id}: ya lo cita ${citados.get(p.id).join(", ")}; quítalo de principios_sin_norma y baja TECHO_SIN_NORMA`);
    } else if (!(p.id in sinNorma)) malos.push(`principio ${p.id}: ninguna norma lo cita; dale una norma o, con su motivo, ponlo en principios_sin_norma${p.catalogo ? ` (es de ${p.catalogo})` : ""}`);
  }
  for (const [id, motivo] of Object.entries(sinNorma)) {
    if (!ids.has(id)) malos.push(`principios_sin_norma: «${id}» no es un principio de la lista`);
    if (!esTexto(motivo, 20)) malos.push(`principios_sin_norma: «${id}» lleva su motivo (20 caracteres o más)`);
  }
  const n = Object.keys(sinNorma).length;
  if (n > techo) malos.push(`principios_sin_norma: ${n} principios sin norma y el techo es ${techo}; la lista solo baja`);
  return malos;
}

/**
 * Los principios que valen para un proyecto según sus `dominios` (ops/entidades.json, #710): los que no llevan `dominio` valen
 * siempre; uno con `dominio` solo si el proyecto lo declara. `dominios` null = sin filtrar (todos), como en normasDeTarea.
 */
export const principiosDeProyecto = (principios, dominios = null) =>
  principios.filter((p) => dominios === null || !DOMINIOS_OPCIONALES.includes(p.dominio) || dominios.includes(p.dominio));

/** Las normas que citan cada principio: { id: [norma, …] }. */
export function normasPorPrincipio(normas) {
  const fuera = {};
  for (const n of normas) if (n.principio) (fuera[n.principio] ??= []).push(n.id);
  return fuera;
}

/** Las áreas que usa la lista, en el orden de AMBITOS. */
const areasUsadas = (datos) => Object.keys(AMBITOS).filter((a) => datos.principios.some((p) => p.area === a));

/**
 * Principios que repiten la norma que los cita (#620, ronda 2): el enunciado de un principio dice el porqué y
 * la norma lo que debe ser verdad; si se parecen desde UMBRAL_REESCRITURA (el de las reglas de estándar, Dice
 * sobre palabras con contenido), el principio está reescribiendo su norma. [{ principio, norma, parecido }].
 */
export function principiosQueRepitenSuNorma(lista, normas, umbral = UMBRAL_REESCRITURA) {
  const fuera = [];
  for (const n of normas) {
    const p = lista.find((x) => x.id === n.principio);
    if (!p) continue;
    const v = parecido(p.enunciado, `${n.condicion ?? ""} ${n.exigencia ?? ""}`);
    if (v >= umbral) fuera.push({ principio: p.id, norma: n.id, parecido: v });
  }
  return fuera;
}

/**
 * Techo de parejas principio ↔ norma que se repiten. Solo baja: el test lo pide igual a la cifra de hoy, así que
 * reescribir un enunciado como porqué lo baja y uno nuevo que copie su norma lo rompe.
 */
export const TECHO_PRINCIPIOS_QUE_REPITEN = 20;

/** Cuántos principios hay por área, cuántos de un catálogo delegado y cuántos propios sin norma. */
export function cifras(datos) {
  return areasUsadas(datos).map((area) => {
    const ps = datos.principios.filter((p) => p.area === area);
    return { area, total: ps.length, delegados: ps.filter((p) => p.catalogo).length, sinNorma: ps.filter((p) => p.id in datos.sin_norma).length };
  });
}

const enlace = (r) => `\`${r}\``;
const textoDeFuente = (f) => (f.marca === "I" ? `[I] \`${f.ruta}\`` : `[${f.marca}] ${f.url}`);

/** Una línea de un principio, para la terminal y el documento. */
export const lineaDe = (p) => `\`${p.id}\` — **${p.nombre}.** ${p.enunciado}`;

/** El Markdown completo de docs/PRINCIPIOS.md. */
export function generarMd(datos) {
  const L = [
    "# Principios de la casa",
    "",
    `<!-- Generado desde ${[RUTA_PRINCIPIOS, ...Object.values(datos.delegados).map((d) => d.catalogo), `${RUTA_PROYECTOS}/<id>/principios/`].join(", ")} con «npm run principios-casa -- --escribir». No se edita a mano: ops/principios.test.js lo compara. -->`,
    "",
    "La lista única de principios: el porqué de lo que se pide. Tres capas que no se repiten: un **principio** dice por qué; una **norma** (`ops/normas.json`, `docs/ops/NORMAS.md`) dice lo que debe ser verdad, con su control, y cita su principio; un **estándar** de tarea (`ops/estandares-agentes.json`) cita normas. Cada principio lleva sus fuentes (**[F]** una fuente externa lo dice, **[I]** está escrito en la casa, **[S]** inferencia nuestra o fuente secundaria) y, si hay, el detalle donde se desarrolla. Los de producto y redacción viven en su propio catálogo, sin fuerza como todos, y aquí se listan sin copiarse; sus normas están en el mismo registro que las demás.",
    "",
    "Las normas de cada principio: `npm run principios-casa -- <id>`. Un principio que aún no cita ninguna norma está en `principios_sin_norma` de `ops/principios/_catalogo.json`, con su motivo; esa lista solo baja.",
    "",
    "## Cifras",
    "",
    "| Área | Principios | De un catálogo delegado | Propios sin norma |",
    "|---|---|---|---|",
  ];
  const filas = cifras(datos);
  for (const f of filas) L.push(`| ${AMBITOS[f.area].legible} (\`${f.area}\`) | ${f.total} | ${f.delegados} | ${f.sinNorma} |`);
  const suma = (k) => filas.reduce((s, f) => s + f[k], 0);
  L.push(`| **Total** | **${suma("total")}** | **${suma("delegados")}** | **${suma("sinNorma")}** |`);
  if (datos.precedencia) {
    // La precedencia (#621): el dato vive en `precedencia` de ops/principios/_catalogo.json; su lector, scripts/lib/precedencia.mjs
    // (no se importa: ese lector importa estandaresAgentes.mjs, y este módulo también).
    const pr = datos.precedencia;
    const conceptos = Object.entries(pr.concepts);
    const c = (x) => `\`${x}\``;
    L.push("", "## Precedencia", "", `Si dos normas piden cosas incompatibles, gana la que defiende el concepto de más arriba (${conceptos.map(([, x]) => x.label).join(" > ")}). Una norma defiende el concepto de su ámbito salvo que declare otro en su campo ${c("concepto")} de ${c("ops/normas.json")}. El dato vive en ${c("precedencia")} de ${c("ops/principios/_catalogo.json")} y se imprime en el brief con ${c("npm run estandar")}.`, "", "| Puesto | Concepto | Defiende | Ámbitos por defecto | Principios que lo defienden |", "|---|---|---|---|---|");
    conceptos.forEach(([id, x], i) => {
      const areas = Object.entries(pr.default_concept).filter(([, v]) => v === id).map(([a]) => c(a));
      const ps = (pr.principles[id] ?? []).map(c);
      L.push(`| ${i + 1} | ${c(id)} (${x.label}) | ${x.what} | ${areas.join(", ") || "—"} | ${ps.join(", ") || "—"} |`);
    });
    L.push("", `**Si chocan.** ${pr.clash.rule}`, "", `Constancia, en el cuerpo del PR: ${c(pr.clash.record)}`);
  }
  for (const area of areasUsadas(datos)) {
    const a = AMBITOS[area];
    L.push("", `## ${a.legible.charAt(0).toUpperCase()}${a.legible.slice(1)} (\`${area}\`)`, "", `${a.que}.`);
    const dl = datos.delegados[area];
    if (dl) L.push("", `Lo trae el catálogo delegado ${enlace(dl.catalogo)}, con su detalle en ${enlace(dl.detalle)}. ${dl.que}. Lo que piden con DEBE es una norma de \`ops/normas.json\` que los cita.`);
    L.push("");
    for (const p of datos.principios.filter((x) => x.area === area)) {
      L.push(`- ${lineaDe(p)}`);
      if (p.porque) L.push(`  - Porqué: ${p.porque}`);
      L.push(`  - Fuentes: ${p.fuentes.map(textoDeFuente).join(" ; ")}`);
      const det = p.catalogo ? p.detalle.filter((r) => r !== dl?.detalle) : p.detalle;
      if (det.length) L.push(`  - Detalle: ${det.map(enlace).join(", ")}`);
      if (p.origen.length) L.push(`  - Viene de: ${p.origen.join(", ")}`);
      if (p.puente) L.push(`  - Puente entre ejes: ${p.puente}`);
      if (p.dominio) L.push(`  - Paquete opcional: ${p.dominio} (solo vale en un proyecto que declara el dominio «${p.dominio}» en ops/entidades.json)`);
      if (p.project) L.push(`  - Proyecto: ${p.project} (solo vale aquí; vive en ${rutaPrincipiosDeProyecto(p.project)})`);
      if (p.id in datos.sin_norma) L.push(`  - Sin norma: ${datos.sin_norma[p.id]}`);
    }
  }
  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** `existe` y `leerTexto` sobre el repo. */
export const existeEn = (raiz) => (ruta) => existsSync(join(raiz, ruta));
export const leerTextoEn = (raiz) => (ruta) => readFileSync(join(raiz, ruta), "utf8");
