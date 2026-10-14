/**
 * La foto publicada de los issues (fondo #326, cupo de GitHub): el estado de TODOS los
 * issues en un JSON que un workflow (`.github/workflows/foto-issues.yml`) deja en la rama
 * `foto/issues`, para que sesiones y agentes lo lean por `raw.githubusercontent.com` (repo
 * público: 0 puntos de la App de las sesiones) en vez de pedir ~450 puntos de GraphQL en cada
 * lectura. Medido el 14 oct 2026: 414 issues, ~1,08 puntos por issue (una página de 50 = 54,
 * una consulta por ids = 1 punto por id, una consulta de cambios = 1): el coste de leer todo
 * CRECE con el total de issues.
 *
 * Qué guarda: los nodos de GraphQL tal cual (CAMPOS_ISSUE de issues.mjs), de modo que quien
 * lee sigue usando `leerIssue(nodo)` sin cambiar nada. Una sola fuente de la forma: este
 * módulo escribe (`actualizarFoto`) y lee (`nodosDeFoto`), y el test los compara.
 *
 * Cómo se mantiene con poco gasto (el GITHUB_TOKEN del workflow tiene 1.000 puntos por hora y
 * repositorio):
 *   - sin foto previa o ilegible: lectura completa (páginas de 50), una vez;
 *   - después, incremental: una consulta de 1 punto con los issues cambiados desde la última
 *     foto, solo esos por id, más sus vecinos si cambió algo que el vecino copia (estado,
 *     etiquetas, padre), más una rotación de los `ROTACION` más antiguos para curar lo que
 *     ninguna fecha delata (un padre cuyo hijo se cerró y no se refrescó).
 *
 * La foto nunca se cree sin mirar: versión distinta, forma rota o `generado_en` más viejo de
 * `MAX_MIN_FOTO` minutos y el lector vuelve a la API. Quitar el workflow y la rama deja a los
 * lectores en modo API sin romper nada (el test lo comprueba).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { registrarFoto } from "./cuotaGh.mjs";
import { CAMPOS_ISSUE } from "./issues.mjs";

/** Versión del formato. Si cambia la forma de la foto, sube: los lectores viejos vuelven a la API. */
export const FOTO_VERSION = 1;
export const REPO = "pabloam89/MenuPlan";
export const RAMA_FOTO = "foto/issues";
export const FICHERO_FOTO = "issues.json";
export const URL_FOTO = `https://raw.githubusercontent.com/${REPO}/${RAMA_FOTO}/${FICHERO_FOTO}`;
/** Pasado este tiempo desde `generado_en`, la foto no se usa. */
export const MAX_MIN_FOTO = 15;
/** Cuántos issues se refrescan por pasada aunque nadie los haya tocado (cura la deriva de los vecinos). */
export const ROTACION = 8;
/** Tope de ids por consulta (cuesta 1 punto por id). */
export const IDS_POR_LLAMADA = 40;
/** Los campos de la foto: el escritor los pone todos y el lector exige todos. */
export const CAMPOS_FOTO = ["version", "generado_en", "completa_en", "total", "refrescados", "nodos"];
/** Cupo que tiene que quedar para empezar una lectura completa (cuesta ~1,1 puntos por issue; el GITHUB_TOKEN tiene 1.000 por hora y repositorio). */
export const PUNTOS_MIN_COMPLETA = 600;
/** Margen con que se vuelve a mirar desde la foto anterior (relojes y retrasos de GitHub). */
export const MARGEN_SEGUNDOS = 120;

const PROPIETARIO = REPO.split("/")[0];
const NOMBRE = REPO.split("/")[1];

/** Los issues cambiados desde una fecha (1 punto): solo ids y números. */
export const CONSULTA_CAMBIOS = `query($since: DateTime!, $cursor: String) {
  rateLimit { cost remaining }
  repository(owner: "${PROPIETARIO}", name: "${NOMBRE}") {
    issues(first: 50, after: $cursor, filterBy: { since: $since }, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { id number updatedAt }
    }
  }
}`;

/** Issues concretos por id, con todos los campos (1 punto por id). */
export const CONSULTA_POR_IDS = `query($ids: [ID!]!) {
  rateLimit { cost remaining }
  nodes(ids: $ids) {
    ... on Issue {
${CAMPOS_ISSUE}
    }
  }
}`;

/** Lectura completa, páginas de 50 (54 puntos cada una; solo cuando no hay foto previa). */
export const CONSULTA_COMPLETA = `query($cursor: String) {
  rateLimit { cost remaining }
  repository(owner: "${PROPIETARIO}", name: "${NOMBRE}") {
    issues(first: 50, after: $cursor, states: [OPEN, CLOSED], orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
${CAMPOS_ISSUE}
      }
    }
  }
}`;

// ── Forma y validación ────────────────────────────────────────────────────────

/** ¿Es una foto que este código sabe leer? Devuelve `{ ok, motivo }`. */
export function validarFoto(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return { ok: false, motivo: "no es un objeto" };
  if (f.version !== FOTO_VERSION) return { ok: false, motivo: `versión ${f.version} y se esperaba ${FOTO_VERSION}` };
  for (const c of CAMPOS_FOTO) if (!(c in f)) return { ok: false, motivo: `falta el campo ${c}` };
  if (Number.isNaN(Date.parse(f.generado_en))) return { ok: false, motivo: "generado_en no es una fecha" };
  if (!Array.isArray(f.nodos)) return { ok: false, motivo: "nodos no es una lista" };
  if (f.total !== f.nodos.length) return { ok: false, motivo: `total ${f.total} y hay ${f.nodos.length} nodos` };
  for (const n of f.nodos) {
    if (!n || !Number.isInteger(n.number) || typeof n.state !== "string") return { ok: false, motivo: "un nodo sin número o sin estado" };
  }
  return { ok: true, motivo: null };
}

/**
 * Lee el texto de una foto y dice si vale ahora. Devuelve `{ nodos, generado_en, edadMin }` o
 * `{ nodos: null, motivo }`. Un reloj adelantado más de 5 minutos tampoco vale.
 */
export function nodosDeFoto(texto, { ahora = new Date(), maxMin = MAX_MIN_FOTO } = {}) {
  let f;
  try {
    f = JSON.parse(String(texto));
  } catch {
    // a propósito: un texto que no es JSON es «no hay foto», y se dice en `motivo`
    return { nodos: null, motivo: "no es JSON" };
  }
  const v = validarFoto(f);
  if (!v.ok) return { nodos: null, motivo: v.motivo };
  const edadMin = (ahora.getTime() - Date.parse(f.generado_en)) / 60_000;
  if (edadMin > maxMin) return { nodos: null, motivo: `generada hace ${Math.round(edadMin)} min (tope ${maxMin})` };
  if (edadMin < -5) return { nodos: null, motivo: "generada en el futuro" };
  return { nodos: f.nodos, generado_en: f.generado_en, edadMin };
}

// ── Escritura: lectura incremental ────────────────────────────────────────────

const etiquetasDe = (x) => (x?.labels?.nodes ?? []).map((l) => l.name).sort().join("|");
const iguales = (a, b) => a?.state === b?.state && etiquetasDe(a) === etiquetasDe(b);

/**
 * Ids de los vecinos que hay que refrescar porque el nodo cambió en algo que ellos copian.
 * `viejo` es el nodo de la foto anterior (o undefined si es nuevo) y `nuevo` el recién leído.
 */
export function vecinosAActualizar(viejo, nuevo) {
  const ids = new Set();
  // Su padre guarda su estado y sus etiquetas; si cambió de padre, los dos padres cambian de hijos.
  if (viejo?.parent?.id && viejo.parent.id !== nuevo.parent?.id) ids.add(viejo.parent.id);
  if (nuevo.parent?.id && (!viejo || viejo.parent?.id !== nuevo.parent.id || !iguales(viejo, nuevo))) ids.add(nuevo.parent.id);
  // Sus hijos guardan el estado y las etiquetas del padre.
  if (!viejo || !iguales(viejo, nuevo)) {
    for (const h of [...(viejo?.subIssues?.nodes ?? []), ...(nuevo.subIssues?.nodes ?? [])]) if (h.id) ids.add(h.id);
  }
  return ids;
}

function pedirNodosPorIds(gh, ids, resumen) {
  const nodos = [];
  const lista = [...ids];
  for (let i = 0; i < lista.length; i += IDS_POR_LLAMADA) {
    const r = gh(CONSULTA_POR_IDS, { "ids[]": lista.slice(i, i + IDS_POR_LLAMADA) });
    contar(resumen, r);
    nodos.push(...(r.nodes ?? []));
  }
  return nodos;
}

function contar(resumen, r) {
  resumen.puntos += Number(r?.rateLimit?.cost ?? 0);
  if (r?.rateLimit?.remaining != null) resumen.restantes = r.rateLimit.remaining;
}

/** Todos los issues, de 50 en 50. Solo para la primera foto. */
function leerCompleta(gh, resumen) {
  const nodos = [];
  let cursor = null;
  do {
    const r = gh(CONSULTA_COMPLETA, cursor ? { cursor } : {});
    contar(resumen, r);
    const pag = r?.repository?.issues;
    if (!pag) throw new Error("GraphQL sin datos de issues");
    nodos.push(...pag.nodes);
    cursor = pag.pageInfo?.hasNextPage ? pag.pageInfo.endCursor : null;
  } while (cursor);
  return nodos;
}

/** Los issues cambiados desde `desde` (ISO): ids y números. */
function leerCambios(gh, desde, resumen) {
  const out = [];
  let cursor = null;
  for (let pag = 0; pag < 20; pag++) {
    const r = gh(CONSULTA_CAMBIOS, { since: desde, ...(cursor ? { cursor } : {}) });
    contar(resumen, r);
    const p = r?.repository?.issues;
    if (!p) throw new Error("GraphQL sin datos de cambios");
    out.push(...p.nodes);
    if (!p.pageInfo?.hasNextPage) return out;
    cursor = p.pageInfo.endCursor;
  }
  throw new Error("más de 1.000 issues cambiados de una vez: paro para no agotar el límite");
}

/**
 * La foto nueva a partir de la anterior. `gh(consulta, variables)` devuelve el `data` de la
 * respuesta de GraphQL (lanza si hay errores). Sin foto anterior válida, lectura completa.
 * Devuelve `{ foto, resumen }` con el modo, cuántos se leyeron y los puntos gastados.
 */
export function actualizarFoto({ previa, gh, ahora = new Date(), rotacion = ROTACION }) {
  const resumen = { modo: "incremental", cambiados: 0, vecinos: 0, rotados: 0, borrados: 0, puntos: 0, restantes: null };
  const inicio = ahora.toISOString();
  const valida = previa && validarFoto(previa).ok ? previa : null;
  const refrescados = {};
  let nodos;
  let completa_en;

  if (!valida) {
    resumen.modo = "completa";
    const cupo = gh("query { rateLimit { remaining } }").rateLimit?.remaining;
    if (Number.isInteger(cupo) && cupo < PUNTOS_MIN_COMPLETA) throw new Error(`quedan ${cupo} puntos y la lectura completa necesita ${PUNTOS_MIN_COMPLETA}: espero a la próxima pasada`);
    nodos = leerCompleta(gh, resumen);
    resumen.cambiados = nodos.length;
    for (const n of nodos) refrescados[n.number] = inicio;
    completa_en = inicio;
  } else {
    completa_en = valida.completa_en;
    const porNumero = new Map(valida.nodos.map((n) => [n.number, n]));
    const desde = new Date(Date.parse(valida.generado_en) - MARGEN_SEGUNDOS * 1000).toISOString();
    const cambios = leerCambios(gh, desde, resumen);
    const ids = new Set(cambios.map((c) => c.id));
    resumen.cambiados = ids.size;

    // La rotación: los de lectura más antigua que nadie ha tocado.
    const antiguos = valida.nodos
      .filter((n) => !ids.has(n.id))
      .sort((a, b) => String(valida.refrescados?.[a.number] ?? "").localeCompare(String(valida.refrescados?.[b.number] ?? "")) || a.number - b.number)
      .slice(0, rotacion);
    for (const n of antiguos) ids.add(n.id);
    resumen.rotados = antiguos.length;

    const leidos = pedirNodosPorIds(gh, ids, resumen);
    const idsLeidos = new Set([...ids]);
    const nuevos = new Map();
    for (const n of leidos) if (n?.number != null) nuevos.set(n.number, n);
    // Un id que no devuelve nada ya no existe (borrado o transferido).
    const vistos = new Set([...nuevos.values()].map((n) => n.id));
    const borrados = [...idsLeidos].filter((id) => !vistos.has(id));

    // Los vecinos de lo que cambió de verdad (no de la rotación pura).
    const extra = new Set();
    for (const n of nuevos.values()) for (const id of vecinosAActualizar(porNumero.get(n.number), n)) if (!idsLeidos.has(id)) extra.add(id);
    const extraLeidos = pedirNodosPorIds(gh, [...extra].slice(0, IDS_POR_LLAMADA), resumen);
    resumen.vecinos = extraLeidos.length;
    for (const n of extraLeidos) if (n?.number != null) nuevos.set(n.number, n);

    for (const id of borrados) {
      const viejo = valida.nodos.find((n) => n.id === id);
      if (viejo) {
        porNumero.delete(viejo.number);
        resumen.borrados += 1;
      }
    }
    for (const [num, n] of nuevos) {
      porNumero.set(num, n);
      refrescados[num] = inicio;
    }
    for (const n of porNumero.values()) if (!(n.number in refrescados)) refrescados[n.number] = valida.refrescados?.[n.number] ?? "";
    nodos = [...porNumero.values()];
  }

  nodos.sort((a, b) => b.number - a.number);
  return {
    foto: { version: FOTO_VERSION, generado_en: inicio, completa_en, total: nodos.length, refrescados, nodos },
    resumen,
  };
}

// ── Lectura: la foto, puesta al día con lo último ─────────────────────────────

const estadoDe = (s) => (String(s).toLowerCase() === "closed" ? "CLOSED" : "OPEN");

/**
 * Pone encima de los nodos de la foto los issues que cambiaron después de generarla, tal como los
 * da la REST (`GET /issues?since=…`, que cuesta 0 puntos de GraphQL). Se cambia lo que la REST
 * trae (título, cuerpo, estado, etiquetas, asignados, fechas); lo demás (PR que lo cierran, padre,
 * hijos, comentarios) se queda como estaba hasta la próxima foto. Los PR (que la REST mezcla) se saltan.
 */
export function aplicarCambiosRest(nodos, cambios) {
  const porNumero = new Map(nodos.map((n) => [n.number, n]));
  for (const r of cambios ?? []) {
    if (!r || r.pull_request || !Number.isInteger(r.number)) continue;
    const base = porNumero.get(r.number) ?? {
      reaperturas: { totalCount: 0, nodes: [] }, closedByPullRequestsReferences: { nodes: [] },
      comments: { totalCount: 0, nodes: [] }, parent: null, subIssues: { nodes: [] },
    };
    porNumero.set(r.number, {
      ...base,
      id: base.id ?? r.node_id,
      number: r.number,
      title: r.title,
      state: estadoDe(r.state),
      createdAt: r.created_at,
      closedAt: r.closed_at ?? null,
      body: r.body ?? "",
      authorAssociation: r.author_association ?? null,
      labels: { nodes: (r.labels ?? []).map((l) => ({ name: typeof l === "string" ? l : l.name })) },
      assignees: { nodes: (r.assignees ?? []).map((a) => ({ login: a.login })) },
    });
  }
  return [...porNumero.values()].sort((a, b) => b.number - a.number);
}

/**
 * Los nodos para quien lee, desde la foto, o `null` si hay que ir a la API.
 *   traerTexto()        el texto de la foto (lanza si no hay)
 *   traerCambios(desde) los issues cambiados desde esa fecha (REST); lanza si no puede
 *   exigirVivo          para escribir sobre un issue: si no se pueden traer los cambios, no vale
 * Nunca lanza: cualquier fallo es «no hay foto» y quien llama usa la API. `motivo` dice por qué.
 */
export function nodosDeFotoVivos({ traerTexto, traerCambios, ahora = new Date(), maxMin = MAX_MIN_FOTO, exigirVivo = false }) {
  let texto;
  try {
    texto = traerTexto();
  } catch (e) {
    return { nodos: null, motivo: `sin foto (${String(e?.message ?? e).split("\n")[0].slice(0, 80)})` };
  }
  const f = nodosDeFoto(texto, { ahora, maxMin });
  if (!f.nodos) return f;
  if (!traerCambios) return f;
  try {
    const desde = new Date(Date.parse(f.generado_en) - MARGEN_SEGUNDOS * 1000).toISOString();
    return { ...f, nodos: aplicarCambiosRest(f.nodos, traerCambios(desde)), vivo: true };
  } catch (e) {
    if (exigirVivo) return { nodos: null, motivo: `no pude poner la foto al día (${String(e?.message ?? e).split("\n")[0].slice(0, 80)})` };
    return { ...f, vivo: false };
  }
}

/** Baja el texto de la foto de forma síncrona (un hijo de node con fetch); lanza si falla. Poca espera: el arranque tiene 10 s. */
export function traerTextoSync(url = URL_FOTO, ms = 5000) {
  const codigo = "(async()=>{const r=await fetch(process.argv[1],{signal:AbortSignal.timeout(Number(process.argv[2]))});"
    + "if(!r.ok){console.error('HTTP '+r.status);process.exit(3)}"
    + "const t=await r.text();process.stdout.write(t,()=>process.exit(0))})().catch((e)=>{console.error(String(e&&e.message||e));process.exit(4)})";
  const r = spawnSync(process.execPath, ["-e", codigo, `${url}?c=${Date.now()}`, String(ms)], { encoding: "utf8", maxBuffer: 100_000_000, timeout: ms + 3000, windowsHide: true });
  if (r.status !== 0) throw new Error(String(r.stderr ?? r.error?.message ?? "sin respuesta").trim().split("\n")[0] || "sin respuesta");
  return r.stdout;
}

/**
 * Lo que usan los lectores (issues, situacion): la foto puesta al día con los cambios de la REST, o null
 * si hay que ir a la API. Deja la línea contable con origen `foto` (ok) o el intento fallido (error).
 *   gh          (...args) → texto de `gh` (el envoltorio contado del lector; aquí solo se usa la REST)
 *   caller      quién pide, para la línea contable
 *   exigirVivo  para escribir sobre un issue: sin poner la foto al día, no vale
 * MENUPLAN_FOTO=0 la desactiva; MENUPLAN_FOTO_ARCHIVO lee la foto de un fichero (pruebas, sin red).
 */
export function nodosDeLaFoto({ gh, caller, exigirVivo = false, env = process.env, avisar = (m) => console.error(m) }) {
  if (env.MENUPLAN_FOTO === "0") return null;
  const r = nodosDeFotoVivos({
    traerTexto: () => (env.MENUPLAN_FOTO_ARCHIVO ? readFileSync(env.MENUPLAN_FOTO_ARCHIVO, "utf8") : traerTextoSync()),
    traerCambios: (desde) => {
      const lista = JSON.parse(gh("api", `repos/${REPO}/issues?state=all&since=${desde}&per_page=100&sort=updated&direction=desc`));
      if (lista.length >= 100) throw new Error("más de 100 issues cambiados desde la foto");
      return lista;
    },
    exigirVivo,
  });
  registrarFoto(caller, r.nodos ? "ok" : "error");
  if (!r.nodos) avisar(`Issues: sin foto publicada (${r.motivo}); voy a la API.`);
  return r.nodos;
}
