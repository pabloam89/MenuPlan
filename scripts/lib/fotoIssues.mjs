/**
 * La foto publicada de los issues (fondo #326, cupo de GitHub): el estado de TODOS los
 * issues en un JSON que un workflow (`foto-issues.yml`) sube como asset de la release
 * `foto-issues` (prerelease, nunca «latest»), para que sesiones y agentes lo lean por
 * `github.com/…/releases/download/…` (repo público: 0 puntos de la App de las sesiones) en vez
 * de pedir ~450 puntos de GraphQL en cada lectura. Medido el 14 oct 2026: 414 issues, ~1,08
 * puntos por issue en la lectura completa; el coste de leer todo CRECE con el total de issues.
 *
 * Por qué una release y no una rama: un asset que se reemplaza (`--clobber`) no deja historia
 * (lo borrado desaparece de verdad; en una rama los commits viejos se siguen pudiendo leer por
 * SHA) y no hay push que dispare un despliegue de Vercel.
 *
 * Qué guarda: los nodos de GraphQL tal cual (CAMPOS_ISSUE de issues.mjs), de modo que quien
 * lee sigue usando `leerIssue(nodo)` sin cambiar nada. Una sola fuente de la forma: este
 * módulo escribe (`actualizarFoto`) y lee (`nodosDeFoto`), y el test los compara.
 *
 * Cómo se mantiene con poco gasto (el GITHUB_TOKEN del workflow tiene 1.000 puntos por hora y
 * repositorio). En cada pasada:
 *   1. el listado ligero de todos los issues (id, número, updatedAt, id del padre): 1 punto por
 *      cada 100. Da los nuevos, los cambiados (updatedAt distinto), los que cambiaron de padre
 *      (colgar un issue NO mueve updatedAt de hijo ni padre: medido con #768 y #176) y los
 *      borrados o trasladados (los que ya no salen se quitan, sin pedir ids muertos);
 *   2. esos por id (1 punto por id), más sus vecinos si cambió algo que el vecino copia
 *      (estado, etiquetas, padre), más una rotación de los de lectura más antigua;
 *   3. todo dentro del cupo que queda (menos RESERVA_PUNTOS): lo que no cabe se queda en
 *      `pendientes` y sigue en la pasada siguiente. Sin foto previa es el mismo camino (todos
 *      son «nuevos»), así que la primera foto también se hace a trozos si no cabe en una hora.
 *
 * Dos horas: `generado_en` es cuándo corrió la pasada (dice si el workflow está vivo) y `al_dia_desde`
 * cuándo acabó la última pasada SIN pendientes que ya estaban en la foto (desde ahí todo lo de la foto
 * está leído). Con pendientes viejos `al_dia_desde` no avanza, y el lector pide a la REST los cambios
 * desde `al_dia_desde`, no desde `generado_en`: si no, esos issues saldrían con sus datos viejos.
 *
 * La foto nunca se cree sin mirar: versión distinta, forma rota, `completa: false` (faltan
 * issues por leer) o `generado_en` más viejo de `MAX_MIN_FOTO` minutos y el lector vuelve a la
 * API; si no puede poner la foto al día por la REST, tampoco vale si `al_dia_desde` pasa de ese tope.
 * Y solo el asset que subió el workflow (`SUBIDOR_FOTO`), con el tamaño que dice la release. Quitar el workflow y la release deja a los lectores en modo API sin romper nada (el test
 * lo comprueba). Las escrituras que dependen del padre (`--colgar`, `--ordenar`) no la usan.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirCuota, registrarFoto } from "./cuotaGh.mjs";
import { CAMPOS_ISSUE } from "./issues.mjs";

/** Versión del formato. Si cambia la forma de la foto, sube: los lectores viejos vuelven a la API. */
export const FOTO_VERSION = 3;
export const REPO = "pabloam89/MenuPlan";
/** La release (y su tag) donde vive la foto. Solo la escribe el workflow: la guardia lo niega a las sesiones. */
export const TAG_FOTO = "foto-issues";
export const FICHERO_FOTO = "issues.json";
export const URL_FOTO = `https://github.com/${REPO}/releases/download/${TAG_FOTO}/${FICHERO_FOTO}`;
/** Pasado este tiempo desde `generado_en`, la foto no se usa. */
export const MAX_MIN_FOTO = 15;
/** Pasado este tiempo (o sin foto), `situacion` y el arranque lo dicen en una línea: el workflow no la está renovando. */
export const MAX_MIN_AVISO = 60;
/** Cuántos issues se refrescan por pasada aunque nadie los haya tocado (cura la deriva de los vecinos), si caben. */
export const ROTACION = 8;
/** Tope de ids por consulta (cuesta 1 punto por id). */
export const IDS_POR_LLAMADA = 40;
/** Issues por página del listado ligero (1 punto por página). */
export const POR_PAGINA_LISTADO = 100;
/** Puntos que se dejan sin gastar en cada pasada (el GITHUB_TOKEN tiene 1.000 por hora y repositorio). */
export const RESERVA_PUNTOS = 100;
/** Los campos de la foto: el escritor los pone todos y el lector exige todos. */
export const CAMPOS_FOTO = ["version", "generado_en", "al_dia_desde", "completa", "total", "refrescados", "pendientes", "nodos"];
/**
 * Quién sube el asset: el GITHUB_TOKEN del workflow sale como este usuario. Un asset subido por otro (la App de
 * las sesiones, una persona) no se usa: ni el lector ni la pasada siguiente del workflow se fían de él.
 */
export const SUBIDOR_FOTO = "github-actions[bot]";
/** Espera para bajar la foto desde el arranque, que tiene 10 s en total. */
export const MS_FOTO_ARRANQUE = 3000;
/** Margen con que se vuelve a mirar desde la foto anterior (relojes y retrasos de GitHub). */
export const MARGEN_SEGUNDOS = 120;
/** Las órdenes de `npm run issues` que no leen de la foto: las que escriben según el padre de un issue (la foto puede no tener el último) y `--fresco`. */
export const ORDENES_SIN_FOTO = ["--colgar", "--ordenar", "--fresco"];

const PROPIETARIO = REPO.split("/")[0];
const NOMBRE = REPO.split("/")[1];

/** El listado ligero de todos los issues (1 punto por página de 100): lo justo para saber qué releer. */
export const CONSULTA_LISTADO = `query($cursor: String) {
  rateLimit { cost remaining }
  repository(owner: "${PROPIETARIO}", name: "${NOMBRE}") {
    issues(first: ${POR_PAGINA_LISTADO}, after: $cursor, states: [OPEN, CLOSED], orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { id number updatedAt parent { id } }
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

// ── Forma y validación ────────────────────────────────────────────────────────

/** ¿Es una foto que este código sabe leer? Devuelve `{ ok, motivo }`. */
export function validarFoto(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return { ok: false, motivo: "no es un objeto" };
  if (f.version !== FOTO_VERSION) return { ok: false, motivo: `versión ${f.version} y se esperaba ${FOTO_VERSION}` };
  for (const c of CAMPOS_FOTO) if (!(c in f)) return { ok: false, motivo: `falta el campo ${c}` };
  if (Number.isNaN(Date.parse(f.generado_en))) return { ok: false, motivo: "generado_en no es una fecha" };
  if (Number.isNaN(Date.parse(f.al_dia_desde))) return { ok: false, motivo: "al_dia_desde no es una fecha" };
  if (Date.parse(f.al_dia_desde) > Date.parse(f.generado_en)) return { ok: false, motivo: "al_dia_desde es posterior a generado_en" };
  if (!Array.isArray(f.nodos)) return { ok: false, motivo: "nodos no es una lista" };
  if (!Array.isArray(f.pendientes)) return { ok: false, motivo: "pendientes no es una lista" };
  if (typeof f.completa !== "boolean") return { ok: false, motivo: "completa no es sí o no" };
  if (f.total !== f.nodos.length) return { ok: false, motivo: `total ${f.total} y hay ${f.nodos.length} nodos` };
  for (const n of f.nodos) {
    if (!n || !Number.isInteger(n.number) || typeof n.state !== "string") return { ok: false, motivo: "un nodo sin número o sin estado" };
  }
  return { ok: true, motivo: null };
}

/**
 * Lee el texto de una foto y dice si vale ahora. Devuelve `{ nodos, generado_en, edadMin }` o
 * `{ nodos: null, motivo, generado_en? }` (la fecha, si se pudo leer, para avisar de una foto
 * vieja). Un reloj adelantado más de 5 minutos tampoco vale, ni una foto a medias.
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
  const { generado_en, al_dia_desde } = f;
  if (!f.completa) return { nodos: null, generado_en, motivo: `a medias: faltan ${f.pendientes.length} issues por leer (se completa en las próximas pasadas)` };
  if (edadMin > maxMin) return { nodos: null, generado_en, motivo: `generada hace ${Math.round(edadMin)} min (tope ${maxMin})` };
  if (edadMin < -5) return { nodos: null, generado_en, motivo: "generada en el futuro" };
  return { nodos: f.nodos, generado_en, al_dia_desde, edadMin, pendientes: f.pendientes.length };
}

// ── Escritura: pasada incremental dentro del cupo ─────────────────────────────

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

/**
 * Los datos de una respuesta de GraphQL tal como la da `gh api graphql`. `gh` sale con 1 si la
 * respuesta trae `errors`, pero deja la respuesta en stdout: se lee de ahí. Un `NOT_FOUND` de un
 * nodo (`path: ["nodes", i]`: un id que ya no existe porque el issue se borró o se trasladó entre
 * el listado y la lectura) deja `null` en su sitio y no es un fallo; cualquier otro error, sí.
 *   pedir()  devuelve el texto de la respuesta, o lanza un error con `.stdout` (como execFileSync)
 */
export function datosDeGraphql(pedir) {
  let texto;
  let fallo = null;
  try {
    texto = pedir();
  } catch (e) {
    if (e?.stdout == null || String(e.stdout).trim() === "") throw e;
    fallo = e;
    texto = String(e.stdout);
  }
  let r;
  try {
    r = JSON.parse(String(texto));
  } catch {
    // a propósito: si stdout no es JSON, el error que cuenta es el de gh
    throw fallo ?? new Error("GraphQL: la respuesta no es JSON");
  }
  const graves = (r?.errors ?? []).filter((e) => !(e?.type === "NOT_FOUND" && Array.isArray(e.path) && e.path.length === 2 && e.path[0] === "nodes"));
  if (graves.length) throw new Error(`GraphQL: ${graves.map((e) => e?.message ?? "error").join("; ")}`);
  if (!r?.data) throw fallo ?? new Error("GraphQL sin datos");
  return r.data;
}

function contar(resumen, d) {
  resumen.puntos += Number(d?.rateLimit?.cost ?? 0);
  if (d?.rateLimit?.remaining != null) resumen.restantes = d.rateLimit.remaining;
}

/** El listado ligero de todos los issues, paginado. */
function leerListado(gh, resumen) {
  const out = [];
  let cursor = null;
  for (let pag = 0; pag < 200; pag++) {
    const d = datosDeGraphql(() => gh(CONSULTA_LISTADO, cursor ? { cursor } : {}));
    contar(resumen, d);
    const p = d?.repository?.issues;
    if (!p) throw new Error("GraphQL sin datos del listado");
    out.push(...p.nodes);
    if (!p.pageInfo?.hasNextPage) return out;
    cursor = p.pageInfo.endCursor;
  }
  throw new Error("más de 20.000 issues en el listado: paro");
}

/**
 * La foto nueva a partir de la anterior. `gh(consulta, variables)` devuelve el texto de la
 * respuesta de GraphQL (como `gh api graphql`), o lanza con `.stdout` si trae errores. Sin foto
 * anterior válida, todos los issues son «nuevos» y se leen por id dentro del cupo.
 * Devuelve `{ foto, resumen }` con el modo, cuántos se leyeron por cada motivo y los puntos gastados.
 */
export function actualizarFoto({ previa, gh, ahora = new Date(), rotacion = ROTACION, reserva = RESERVA_PUNTOS }) {
  const resumen = { modo: "incremental", listados: 0, nuevos: 0, cambiados: 0, de_padre: 0, vecinos: 0, rotados: 0, borrados: 0, pendientes: 0, puntos: 0, restantes: null };
  const inicio = ahora.toISOString();
  const valida = previa && validarFoto(previa).ok ? previa : null;
  if (!valida) resumen.modo = "desde-cero";

  // 1. El listado: quién existe, cuándo cambió y de quién cuelga.
  const listado = leerListado(gh, resumen);
  resumen.listados = listado.length;
  const vivos = new Map(listado.map((l) => [l.id, l]));
  const porId = new Map((valida?.nodos ?? []).filter((n) => vivos.has(n.id)).map((n) => [n.id, n]));
  resumen.borrados = (valida?.nodos ?? []).length - porId.size;
  // Una fecha de lectura que no es fecha o es del futuro (falsa) se corta a ahora: no debe esquivar la rotación.
  const refrescadosPrevios = {};
  for (const [k, v] of Object.entries(valida?.refrescados ?? {})) {
    const t = Date.parse(v);
    refrescadosPrevios[k] = Number.isNaN(t) ? "" : t > ahora.getTime() ? inicio : new Date(t).toISOString();
  }

  // 2. La cola, por prioridad: lo que quedó pendiente, lo nuevo, lo cambiado y lo que cambió de padre.
  const cola = [];
  const enCola = new Set();
  const encolar = (id, motivo) => {
    if (!vivos.has(id) || enCola.has(id)) return;
    enCola.add(id);
    cola.push(id);
    if (motivo) resumen[motivo] += 1;
  };
  for (const id of valida?.pendientes ?? []) encolar(id, null);
  for (const l of listado) if (!porId.has(l.id)) encolar(l.id, "nuevos");
  for (const l of listado) {
    const n = porId.get(l.id);
    if (n && n.updatedAt !== l.updatedAt) encolar(l.id, "cambiados");
  }
  for (const l of listado) {
    const n = porId.get(l.id);
    const antes = n?.parent?.id ?? null;
    const ahoraPadre = l.parent?.id ?? null;
    if (!n || antes === ahoraPadre) continue;
    // Colgar o descolgar no mueve updatedAt: se releen el hijo y los dos padres.
    encolar(l.id, "de_padre");
    if (antes) encolar(antes, null);
    if (ahoraPadre) encolar(ahoraPadre, null);
  }

  // 3. Leer por id dentro del cupo: lo que no cabe queda pendiente para la pasada siguiente.
  const disponible = () => (resumen.restantes == null ? Infinity : resumen.restantes - reserva);
  const leidos = new Map();
  const leer = (ids) => {
    for (let i = 0; i < ids.length;) {
      const cabe = Math.min(IDS_POR_LLAMADA, ids.length - i, Math.max(0, Math.floor(disponible())));
      if (cabe <= 0) return ids.slice(i);
      const lote = ids.slice(i, i + cabe);
      const d = datosDeGraphql(() => gh(CONSULTA_POR_IDS, { "ids[]": lote }));
      contar(resumen, d);
      lote.forEach((id, k) => leidos.set(id, d.nodes?.[k]?.number != null ? d.nodes[k] : null));
      i += cabe;
    }
    return [];
  };
  let sinLeer = leer(cola);

  // Los vecinos de lo que cambió de verdad.
  const vecinos = [];
  for (const [id, n] of leidos) {
    if (!n) continue;
    for (const v of vecinosAActualizar(porId.get(id), n)) {
      if (leidos.has(v) || enCola.has(v) || !vivos.has(v)) continue;
      enCola.add(v);
      vecinos.push(v);
    }
  }
  resumen.vecinos = vecinos.length;
  sinLeer = [...sinLeer, ...leer(vecinos)];

  // La rotación, solo si cabe: los de lectura más antigua que nadie ha tocado.
  if (!sinLeer.length) {
    const antiguos = [...porId.values()]
      .filter((n) => !enCola.has(n.id))
      .sort((a, b) => String(refrescadosPrevios[a.number] ?? "").localeCompare(String(refrescadosPrevios[b.number] ?? "")) || a.number - b.number)
      .slice(0, Math.max(0, Math.min(rotacion, Math.floor(disponible()))))
      .map((n) => n.id);
    resumen.rotados = antiguos.length - leer(antiguos).length;
  }

  // 4. Componer: lo leído encima de lo anterior; un id que ya no devuelve nada, fuera.
  const refrescados = {};
  for (const [id, n] of leidos) {
    if (n) {
      porId.set(id, n);
      refrescados[n.number] = inicio;
    } else {
      if (porId.delete(id)) resumen.borrados += 1;
      vivos.delete(id); // ya no existe: no falta en la foto
    }
  }
  for (const n of porId.values()) if (!(n.number in refrescados)) refrescados[n.number] = refrescadosPrevios[n.number] ?? "";
  const pendientes = sinLeer.filter((id) => vivos.has(id));
  resumen.pendientes = pendientes.length;
  const nodos = [...porId.values()].sort((a, b) => b.number - a.number);
  const completa = [...vivos.keys()].every((id) => porId.has(id));
  // Si queda pendiente alguno que ya está en la foto (con sus datos viejos), la foto no está al día desde esta
  // pasada: `al_dia_desde` se queda donde estaba y el lector pide a la REST desde ahí.
  const pendientesViejos = pendientes.filter((id) => porId.has(id));
  const previoAlDia = valida && !Number.isNaN(Date.parse(valida.al_dia_desde)) ? new Date(Math.min(Date.parse(valida.al_dia_desde), ahora.getTime())).toISOString() : inicio;
  const al_dia_desde = pendientesViejos.length ? previoAlDia : inicio;
  return {
    foto: { version: FOTO_VERSION, generado_en: inicio, al_dia_desde, completa, total: nodos.length, refrescados, pendientes, nodos },
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
      updatedAt: r.updated_at ?? base.updatedAt ?? null,
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
  // Sin la REST, la foto vale tal cual solo si está al día desde hace menos del tope (con pendientes viejos, no).
  const retrasoMin = (ahora.getTime() - Date.parse(f.al_dia_desde)) / 60_000;
  const sinPonerAlDia = (porque) => (retrasoMin > maxMin
    ? { nodos: null, generado_en: f.generado_en, motivo: `${f.pendientes} issues sin releer desde hace ${Math.round(retrasoMin)} min y ${porque}` }
    : { ...f, vivo: false });
  if (!traerCambios) return sinPonerAlDia("sin la REST");
  try {
    // Desde `al_dia_desde`, no desde `generado_en`: lo que siga pendiente de la foto lleva los datos de entonces.
    const desde = new Date(Date.parse(f.al_dia_desde) - MARGEN_SEGUNDOS * 1000).toISOString();
    return { ...f, nodos: aplicarCambiosRest(f.nodos, traerCambios(desde)), vivo: true };
  } catch (e) {
    const porque = `no pude poner la foto al día (${String(e?.message ?? e).split("\n")[0].slice(0, 80)})`;
    if (exigirVivo) return { nodos: null, generado_en: f.generado_en, motivo: porque };
    return sinPonerAlDia(porque);
  }
}

/**
 * Baja el texto de la foto de forma síncrona (un hijo de node con fetch, que sigue la redirección
 * al almacén de assets); lanza si falla. El `?c=<ms>` salta la caché de github.com: sin él, tras un
 * `--clobber` la URL siguió dando el asset anterior (medido el 14 oct 2026; con `?c=` dio el nuevo
 * al instante, en dos reemplazos). Poca espera: el arranque tiene 10 s.
 *
 * El hijo NO llama a `process.exit`: en Windows (Node 24), salir mientras se cierran las conexiones
 * HTTPS de fetch revienta con «Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)» y código 127,
 * DESPUÉS de escribir la foto entera; el lector lo tomaba por un fallo y nunca usaba la foto (visto el
 * 14 oct 2026 contra la release y contra raw.githubusercontent.com). Con `exitCode` sale solo y limpio.
 */
export const CODIGO_HIJO_FETCH = "(async()=>{const r=await fetch(process.argv[1],{signal:AbortSignal.timeout(Number(process.argv[2]))});"
  + "if(!r.ok){console.error('HTTP '+r.status);process.exitCode=3;return}"
  + "process.stdout.write(await r.text())})().catch((e)=>{console.error(String(e&&e.message||e));process.exitCode=4})";

/**
 * El asset de la foto de una release (lo que da `GET /repos/…/releases/tags/foto-issues`), si lo subió el
 * workflow (`SUBIDOR_FOTO`); lanza si no está o lo subió otro. La release viva la creó la App de las sesiones
 * con un marcador: hasta que el workflow suba la primera foto, el lector va a la API.
 */
export function assetDeConfianza(release) {
  const asset = (release?.assets ?? []).find((a) => a?.name === FICHERO_FOTO);
  if (!asset) throw new Error(`release ${TAG_FOTO} sin el asset ${FICHERO_FOTO}`);
  const quien = asset.uploader?.login ?? "nadie";
  if (quien !== SUBIDOR_FOTO) throw new Error(`no la subió el workflow, la subió ${quien}`);
  if (!Number.isInteger(asset.size)) throw new Error("el asset no dice su tamaño");
  return asset;
}

export function traerTextoSync(url = URL_FOTO, ms = 5000) {
  const codigo = CODIGO_HIJO_FETCH;
  const r = spawnSync(process.execPath, ["-e", codigo, `${url}?c=${Date.now()}`, String(ms)], { encoding: "utf8", maxBuffer: 100_000_000, timeout: ms + 3000, windowsHide: true });
  if (r.status !== 0) throw new Error(String(r.stderr ?? r.error?.message ?? "sin respuesta").trim().split("\n")[0] || "sin respuesta");
  return r.stdout;
}

// ── El aviso de foto vieja o ausente (situacion y arranque) ───────────────────

const FICHERO_ESTADO = "foto-estado.json";

/** Guarda cómo fue la última mirada a la foto (para avisar aunque la lectura salga de la caché). Nunca lanza. */
export function guardarEstadoFoto(estado, { dir = dirCuota() } = {}) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, FICHERO_ESTADO), JSON.stringify(estado));
  } catch {
    // a propósito: el aviso es una ayuda; sin disco la lectura sigue
  }
}

/** La última mirada a la foto, o null si nunca se miró (o no se lee). */
export function leerEstadoFoto({ dir = dirCuota() } = {}) {
  try {
    return JSON.parse(readFileSync(join(dir, FICHERO_ESTADO), "utf8"));
  } catch {
    // a propósito: sin estado no hay aviso que dar
    return null;
  }
}

/**
 * Una línea si la foto falta, está a medias o tiene más de MAX_MIN_AVISO minutos; null si está bien
 * o nunca se miró. Entre 15 y 60 min no avisa: los cron de GitHub se retrasan y el lector ya va a la API.
 */
export function lineaFoto(estado, { ahora = new Date() } = {}) {
  if (!estado) return null;
  const api = "las lecturas de issues van a la API (~1 punto por issue)";
  if (!estado.generado_en) return `Foto de los issues: no la hay (${estado.motivo ?? "sin motivo"}); ${api}. Cómo se pone en marcha: skill github, foto-issues.md.`;
  if (/a medias/.test(estado.motivo ?? "")) return `Foto de los issues: ${estado.motivo}; ${api}.`;
  // La edad que tenía al mirarla: si nadie la ha mirado desde hace rato, eso no dice que el workflow esté parado.
  const mirada = Date.parse(estado.mirada_en);
  const edadMin = ((Number.isNaN(mirada) ? ahora.getTime() : mirada) - Date.parse(estado.generado_en)) / 60_000;
  if (!(edadMin > MAX_MIN_AVISO)) return null;
  const hace = edadMin >= 120 ? `${Math.round(edadMin / 60)} h` : `${Math.round(edadMin)} min`;
  return `Foto de los issues: de hace ${hace} (el workflow foto-issues.yml no la renueva); ${api}.`;
}

/**
 * Lo que usan los lectores (issues, situacion): la foto puesta al día con los cambios de la REST, o null
 * si hay que ir a la API. Deja la línea contable con origen `foto` (ok) o el intento fallido (error), y
 * el estado de esta mirada para el aviso de `lineaFoto`.
 *   gh          (...args) → texto de `gh` (el envoltorio contado del lector; aquí solo se usa la REST)
 *   caller      quién pide, para la línea contable
 *   exigirVivo  para escribir sobre un issue: sin poner la foto al día, no vale
 *   ms          espera para bajar la foto (el arranque pide MS_FOTO_ARRANQUE)
 *   bajar       (url, ms) → texto; por defecto traerTextoSync (los tests lo cambian para ir sin red)
 * Antes de bajarla mira por la REST (0 puntos de GraphQL) quién subió el asset: solo vale el del workflow
 * (`assetDeConfianza`) y con el tamaño que dice la release (otro tamaño: la reemplazaron entre medias).
 * MENUPLAN_FOTO=0 la desactiva; MENUPLAN_FOTO_ARCHIVO lee la foto de un fichero (pruebas, sin red).
 */
export function nodosDeLaFoto({ gh, caller, exigirVivo = false, env = process.env, avisar = (m) => console.error(m), ahora = new Date(), ms = 5000, bajar = traerTextoSync }) {
  if (env.MENUPLAN_FOTO === "0") return null;
  const traerDeLaRelease = () => {
    const asset = assetDeConfianza(JSON.parse(gh("api", `repos/${REPO}/releases/tags/${TAG_FOTO}`)));
    const texto = bajar(URL_FOTO, ms);
    const bytes = Buffer.byteLength(String(texto), "utf8");
    if (bytes !== asset.size) throw new Error(`la foto bajada (${bytes} bytes) no es el asset comprobado (${asset.size} bytes)`);
    return texto;
  };
  const r = nodosDeFotoVivos({
    traerTexto: () => (env.MENUPLAN_FOTO_ARCHIVO ? readFileSync(env.MENUPLAN_FOTO_ARCHIVO, "utf8") : traerDeLaRelease()),
    traerCambios: (desde) => {
      const lista = JSON.parse(gh("api", `repos/${REPO}/issues?state=all&since=${desde}&per_page=100&sort=updated&direction=desc`));
      if (lista.length >= 100) throw new Error("más de 100 issues cambiados desde la foto");
      return lista;
    },
    exigirVivo,
    ahora,
  });
  registrarFoto(caller, r.nodos ? "ok" : "error");
  guardarEstadoFoto({ mirada_en: ahora.toISOString(), ok: Boolean(r.nodos), generado_en: r.generado_en ?? null, motivo: r.motivo ?? null });
  if (!r.nodos) avisar(`Issues: sin foto publicada (${r.motivo}); voy a la API.`);
  return r.nodos;
}

/** ¿Puede esta orden de `npm run issues` leer de la foto? No si escribe según el padre de un issue o pide `--fresco`. */
export function fotoPermitida(args) {
  return !args.some((a) => ORDENES_SIN_FOTO.includes(a));
}
