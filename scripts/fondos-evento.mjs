/**
 * fondos-evento.mjs — los controles del problema de fondo, sobre eventos de
 * GitHub (workflow fondos.yml, #337). Antes `faltas()` y `debeReabrir()` solo
 * corrían al lanzar `npm run issues`; ahora reaccionan a los eventos de issues
 * (alta, edición, etiqueta, cierre, reapertura) venga el cambio de la CLI, el
 * MCP o la web, y a un pase diario.
 *
 * Qué hace con UN issue (evento `issues`):
 *   - fondo → valida su ficha (scripts/lib/fondos.mjs), deja UN comentario con
 *     la marca `<!-- menuplan:fondo … -->` (lo actualiza, no apila), pone
 *     `control:ok` o `control:falla`, y ejecuta lo que la ficha manda: reabrir
 *     (un fondo cerrado sin aprendizaje, o con un caso que no aguantó), subir
 *     un nivel de alcance, cerrar como cerrado-eficaz.
 *   - caso o encargo → mira que cuelgue de un fondo y revalida el fondo.
 * Con `schedule` (o `workflow_dispatch` sin issue): el pase diario. Es lo que
 * cubre colgar un hijo de un fondo, que NO lanza ningún workflow (no hay
 * disparador de Actions para sub-issues): como mucho 24 h después se revalidan
 * los fondos abiertos con ficha y los cerrados con un caso que no aguantó.
 *
 * Seguridad: el cuerpo de un issue es entrada no confiable (repo público). Se
 * lee con el parser acotado de fondos.mjs, nada se ejecuta ni se interpola, y
 * lo que escribe el autor no se copia a los comentarios. Solo se actúa sobre
 * issues de la casa (OWNER, MEMBER, COLLABORATOR) con etiqueta tipo:fondo,
 * caso o encargo, y solo se tocan comentarios del propio bot con la marca Y el
 * run de este workflow. Todo llega por entorno.
 *
 * Si la API no responde, FALLA con la causa (tras reintentar) y sin culpar a
 * quien editó el issue: se relanza el run. No deja pasar en silencio.
 *
 * Uso (lo lanza el workflow): GITHUB_TOKEN=… GITHUB_REPOSITORY=… GITHUB_EVENT_NAME=… GITHUB_RUN_ID=… ISSUE_NUMBER=… EVENT_ACTION=… node scripts/fondos-evento.mjs
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { MAX_NUMERO } from "../.claude/hooks/casos.mjs";
import { falloDeCaso } from "./casos-pr.mjs";
import { ErrorDeApi, pedir, pedirPaginas } from "./lib/ghApi.mjs";
import {
  MARCA, MARCA_HIJO, comentario, esComentarioNuestro, esDeLaCasa, falla, fijarCampos, fondoDeRest, leerFicha, leerRun, leerSubidos, limpio, validarFicha, validarHijo,
} from "./lib/fondos.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { porGrupo } from "./lib/issues.mjs";

const nombres = (i) => (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const tipoDe = (i) => [...porGrupo(nombres(i)).tipo][0] ?? null;
const TIPOS_QUE_SE_MIRAN = ["fondo", "caso", "encargo"];
/** Solo se actúa sobre issues de la casa y de los tipos que se vigilan: el repo es público y cualquiera abre issues. */
const seMira = (i) => esDeLaCasa(i?.author_association) && TIPOS_QUE_SE_MIRAN.includes(tipoDe(i));
const RUTA_DEL_WORKFLOW = ".github/workflows/fondos.yml";

/** La API real: lo que necesitan los controles, con el cliente común (reintentos en lecturas, un intento en el POST de comentarios). */
export function apiReal({ token, repo, ...resto }) {
  const base = { token, repo, ...resto };
  return {
    issue: (n) => pedir({ ...base, ruta: `/issues/${n}` }),
    hijos: (n) => pedirPaginas({ ...base, ruta: `/issues/${n}/sub_issues` }, { maxPaginas: 2 }),
    padre: (n) => pedir({ ...base, ruta: `/issues/${n}/parent` }),
    comentarios: (n) => pedirPaginas({ ...base, ruta: `/issues/${n}/comments` }, { maxPaginas: 5 }),
    crearComentario: (n, body) => pedir({ ...base, ruta: `/issues/${n}/comments`, metodo: "POST", cuerpo: { body } }),
    editarComentario: (id, body) => pedir({ ...base, ruta: `/issues/comments/${id}`, metodo: "PATCH", cuerpo: { body }, intentos: 3 }),
    editarIssue: (n, cambios) => pedir({ ...base, ruta: `/issues/${n}`, metodo: "PATCH", cuerpo: cambios, intentos: 3 }),
    ponerEtiquetas: (n, etiquetas) => pedir({ ...base, ruta: `/issues/${n}/labels`, metodo: "POST", cuerpo: { labels: etiquetas }, intentos: 3 }),
    quitarEtiqueta: (n, etiqueta) => pedir({ ...base, ruta: `/issues/${n}/labels/${encodeURIComponent(etiqueta)}`, metodo: "DELETE", intentos: 3 }),
    // Todos los fondos, abiertos y cerrados: el pase diario revalida también los cerrados con hijos nuevos.
    fondos: () => pedirPaginas({ ...base, ruta: "/issues?state=all&labels=tipo%3Afondo" }, { maxPaginas: 3 }),
    // ¿Ese run de Actions es de nuestro workflow? Otro workflow con el mismo bot no puede falsificar la marca.
    // true / false, o null si el run ya no existe (404: caducó con la retención de GitHub, ver propioDe).
    runEsNuestro: async (id) => {
      const r = await pedir({ ...base, ruta: `/actions/runs/${Number(id)}` });
      return r === null ? null : r?.path === RUTA_DEL_WORKFLOW;
    },
    // ¿Es un FICHERO en origin/staging? Un directorio también da 200, pero devuelve una lista.
    existeEnStaging: async (ruta) => {
      const r = await pedir({ ...base, ruta: `/contents/${ruta.split("/").map(encodeURIComponent).join("/")}?ref=staging` });
      return r !== null && !Array.isArray(r) && r.type === "file";
    },
  };
}

/**
 * Los runs de Actions se borran a los 90 días (#381, M1): un comentario cuyo run
 * ya no existe (404) sigue siendo nuestro si es ANTIGUO. Uno recién escrito con
 * un run inexistente es una falsificación (otro workflow con el mismo bot), no
 * un run caducado: no vale. El margen deja sitio a una retención algo menor.
 */
export const DIAS_RUN_CADUCADO = 85;
const caducado = (c, ahora = Date.now()) => {
  const t = Date.parse(c?.created_at ?? "");
  return Number.isFinite(t) && ahora - t >= DIAS_RUN_CADUCADO * 86_400_000;
};

/** Nuestro comentario con esa marca: del bot Y de un run de fondos.yml (se prueba del más nuevo al más viejo). */
export async function propioDe(api, n, marca, comentarios, ahora = Date.now()) {
  const candidatos = (comentarios ?? await api.comentarios(n)).filter((c) => esComentarioNuestro(c, marca)).reverse();
  for (const c of candidatos) {
    const run = leerRun(c.body);
    if (!run) continue;
    const esNuestro = await api.runEsNuestro(run);
    if (esNuestro === true || (esNuestro === null && caducado(c, ahora))) return c;
  }
  return null;
}

/** El comentario sin su `run=` (#381, N3): lo único que cambia en cada pasada y no es contenido. */
export const sinRun = (texto) => String(texto ?? "").replace(/^(<!-- menuplan:fondo[^>\n]{0,200}?) run=\d{1,15}/, "$1");

/**
 * Crea o actualiza (no apila) el comentario propio. `ya` = { propio } si quien
 * llama ya lo buscó (cada búsqueda cuesta una petición por candidato, N3).
 */
async function upsert(api, n, texto, marca, comentarios, ya = null) {
  const propio = ya ? ya.propio : await propioDe(api, n, marca, comentarios);
  if (propio) {
    // Sin el run: si solo cambia el run, no se edita (el comentario se reescribía cada día sin cambios).
    if (sinRun(propio.body) !== sinRun(texto)) await api.editarComentario(propio.id, texto);
    return propio;
  }
  await api.crearComentario(n, texto);
  return null;
}

/**
 * Valida un fondo y ejecuta lo que manda. → una línea contable.
 * El orden importa: primero el comentario con la marca (lo decidido, `subidos`),
 * luego los cambios del issue. Si se corta entre medias, el siguiente run no
 * repite un «subir alcance» ya anotado (se pierde como mucho una subida, y el
 * run falla a la vista).
 */
export async function procesarFondo(api, fondoRest, { hoy, evento = "", run = null, hijosRest = null }) {
  const n = fondoRest.number;
  const hijos = hijosRest ?? await api.hijos(n);
  const fondo = fondoDeRest(fondoRest, hijos);
  const comentarios = await api.comentarios(n);
  const propio = await propioDe(api, n, MARCA, comentarios);
  const subidos = leerSubidos(propio?.body);

  // Reabrir a mano un fondo en observación o cerrado queda en la ficha ANTES de validar: el comentario no cuenta el estado viejo.
  const previa = leerFicha(fondo.body);
  if (evento === "reopened" && previa.presente && ["en-observacion", "cerrado-eficaz"].includes(previa.ficha.estado)) {
    const nuevo = fijarCampos(fondo.body, { estado: "reabierto" });
    if (nuevo !== null) {
      await api.editarIssue(n, { body: nuevo });
      fondo.body = nuevo;
    }
  }

  // La verificación se comprueba en origin/staging solo cuando hace falta (observación o cierre).
  const lectura = leerFicha(fondo.body);
  const ruta = lectura.ficha.verificacion;
  const existe = ruta && ["en-observacion", "cerrado-eficaz"].includes(lectura.ficha.estado) ? await api.existeEnStaging(ruta) : false;

  const res = validarFicha(fondo, { existeEnStaging: () => existe, hoy, subidos });
  const control = falla(res) ? "falla" : "ok";

  // 1. La intención, anotada.
  await upsert(api, n, comentario(res, { subidos: res.subidos, run }), MARCA, comentarios, { propio });
  // 2. La ficha: estado y alcance nuevos.
  const campos = Object.assign({}, ...res.acciones.filter((a) => a.tipo === "fijar").map((a) => a.campos));
  if (Object.keys(campos).length) {
    const nuevo = fijarCampos(fondo.body, campos);
    if (nuevo !== null && nuevo !== fondo.body) await api.editarIssue(n, { body: nuevo });
  }
  // 3. El estado del issue.
  if (res.acciones.some((a) => a.tipo === "reabrir") && fondo.state === "CLOSED") await api.editarIssue(n, { state: "open" });
  const cierre = res.acciones.find((a) => a.tipo === "cerrar");
  if (cierre && fondo.state === "OPEN") {
    if (cierre.arreglo && !nombres(fondoRest).includes(`arreglo:${cierre.arreglo}`)) await api.ponerEtiquetas(n, [`arreglo:${cierre.arreglo}`]);
    await api.editarIssue(n, { state: "closed", state_reason: "completed" });
  }
  // 4. La etiqueta de control.
  const hay = nombres(fondoRest);
  if (!hay.includes(`control:${control}`)) await api.ponerEtiquetas(n, [`control:${control}`]);
  const otra = `control:${control === "ok" ? "falla" : "ok"}`;
  if (hay.includes(otra)) await api.quitarEtiqueta(n, otra);

  return { issue: n, control, errores: res.hallazgos.filter((h) => h.gravedad === "error").length, avisos: res.hallazgos.filter((h) => h.gravedad === "aviso").length, acciones: res.acciones.map((a) => a.tipo) };
}

/** Un caso o encargo: ¿cuelga de un fondo? Y revalida el fondo, que acaba de cambiar de hijos. */
export async function procesarHijo(api, hijoRest, { hoy, evento, run }) {
  const padreRest = await api.padre(hijoRest.number);
  const padre = padreRest ? { number: padreRest.number, labels: nombres(padreRest).map((name) => ({ name })) } : null;
  const hallazgos = validarHijo({ number: hijoRest.number, labels: nombres(hijoRest).map((name) => ({ name })) }, padre);
  // Un caso lleva su análisis (la misma comprobación que la línea «Casos:» de los PR).
  if (tipoDe(hijoRest) === "caso") {
    const sinAnalisis = falloDeCaso(hijoRest.number, hijoRest);
    if (sinAnalisis) hallazgos.push({ regla: "caso-sin-analisis", gravedad: "error", mensaje: limpio(sinAnalisis, 200) });
  }
  const sal = [];
  const opciones = { marca: MARCA_HIJO, titulo: "Control del caso o encargo", pie: "Lo escribe el workflow `fondos` y se actualiza solo.", run };
  const previo = await propioDe(api, hijoRest.number, MARCA_HIJO);
  if (hallazgos.length || previo) {
    // Si antes avisó y ya está bien, el comentario se pone al día en vez de quedarse mintiendo.
    await upsert(api, hijoRest.number, comentario({ hallazgos, acciones: [] }, opciones), MARCA_HIJO, undefined, { propio: previo });
  }
  sal.push({ issue: hijoRest.number, control: hallazgos.some((h) => h.gravedad === "error") ? "falla" : "ok", errores: hallazgos.filter((h) => h.gravedad === "error").length, avisos: hallazgos.filter((h) => h.gravedad === "aviso").length, acciones: [] });
  if (padre && tipoDe(padreRest) === "fondo" && esDeLaCasa(padreRest.author_association)) sal.push(await procesarFondo(api, padreRest, { hoy, evento, run }));
  return sal;
}

/**
 * El pase diario (cubre lo que ningún evento avisa: colgar un hijo no lanza
 * workflow). Revalida, como mucho 24 h después:
 *  - los fondos abiertos con ficha (ventanas de observación vencidas, hijos nuevos);
 *  - los CERRADOS con un hijo caso que no aguantó o posterior al cierre (se reabren).
 */
export async function pasadaDiaria(api, { hoy, run }) {
  const sal = [];
  const fallos = [];
  for (const f of await api.fondos()) {
    if (f.pull_request || !seMira(f)) continue;
    try {
      const hijos = await api.hijos(f.number);
      const cerrado = String(f.state).toLowerCase() === "closed";
      const { presente } = leerFicha(f.body);
      const cierre = f.closed_at ? Date.parse(f.closed_at) : null;
      const huboCaso = hijos.some((h) => {
        const g = porGrupo(nombres(h));
        return g.tipo.has("caso") && ([...g.analisis].some((a) => a.startsWith("no-aguanto")) || (cierre && Date.parse(h.created_at) > cierre));
      });
      if (cerrado ? !huboCaso : !presente) continue;
      sal.push(await procesarFondo(api, f, { hoy, evento: "schedule", run, hijosRest: hijos }));
    } catch (e) {
      if (!(e instanceof ErrorDeApi)) throw e;
      fallos.push(`#${f.number}: ${e.message}`);
    }
  }
  return { sal, fallos };
}

/** El punto de entrada, sin tocar `process`: devuelve las líneas, y lanza ErrorDeApi si la API falla. */
export async function ejecutar({ api, evento, accion = "", issue, hoy, run = null }) {
  if (!issue) {
    const { sal, fallos } = await pasadaDiaria(api, { hoy, run });
    if (fallos.length) throw new ErrorDeApi(`la pasada diaria no pudo con ${fallos.length} fondo(s): ${fallos.join("; ")}`);
    return sal;
  }
  const n = /^\d{1,8}$/.test(String(issue)) ? Number(issue) : 0;
  if (n < 1 || n > MAX_NUMERO) throw new Error(`ISSUE_NUMBER no es un número de issue: «${String(issue).slice(0, 20)}»`);
  const rest = await api.issue(n);
  if (!rest || rest.pull_request || !seMira(rest)) return [];
  const tipo = tipoDe(rest);
  if (tipo === "fondo") return [await procesarFondo(api, rest, { hoy, evento: accion, run })];
  return procesarHijo(api, rest, { hoy, evento: accion, run });
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const { GITHUB_TOKEN = "", GITHUB_REPOSITORY = "pabloam89/MenuPlan", GITHUB_EVENT_NAME = "", GITHUB_RUN_ID = "", EVENT_ACTION = "", ISSUE_NUMBER = "" } = process.env;
  try {
    const lineas = await ejecutar({
      api: apiReal({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY }),
      evento: GITHUB_EVENT_NAME,
      accion: EVENT_ACTION,
      issue: ISSUE_NUMBER,
      hoy: diaMadrid(),
      run: GITHUB_RUN_ID,
    });
    if (!lineas.length) console.log(`fondos: evento: ${GITHUB_EVENT_NAME} accion: ${EVENT_ACTION || "-"} nada que controlar`);
    for (const l of lineas) console.log(`fondos: issue: #${l.issue} control: ${l.control} errores: ${l.errores} avisos: ${l.avisos} acciones: ${l.acciones.join(",") || "-"}`);
  } catch (e) {
    if (e instanceof ErrorDeApi) {
      // La causa es la API, no el autor del issue: se relanza el run.
      const consejo = e.permisos ? "el token del workflow no vale (revisa «permissions: issues: write» y que el workflow siga activo)" : "relanza el run; si se repite, mira el estado de GitHub";
      console.log(`::error title=No he podido comprobar el fondo::${e.message}. No es culpa de quien editó el issue: ${consejo}.`);
      console.error(`fondos: FALLA por la API. ${e.message}`);
    } else {
      console.log(`::error title=Fallo del control de fondos::${String(e?.message ?? e).slice(0, 300)}`);
      console.error(e);
    }
    process.exit(1);
  }
}
