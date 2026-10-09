/**
 * fondos-evento.mjs — los controles del problema de fondo, sobre eventos de
 * GitHub (workflow fondos.yml, #337). Antes `faltas()` y `debeReabrir()` solo
 * corrían al lanzar `npm run issues`; ahora reaccionan a cualquier vía de
 * entrada (CLI, MCP, web) y a un pase diario para las ventanas de observación.
 *
 * Qué hace con UN issue (evento `issues`):
 *   - fondo → valida su ficha (scripts/lib/fondos.mjs), deja UN comentario con
 *     la marca `<!-- menuplan:fondo … -->` (lo actualiza, no apila), pone
 *     `control:ok` o `control:falla`, y ejecuta lo que la ficha manda: reabrir
 *     (un fondo cerrado sin aprendizaje, o con un caso que no aguantó), subir
 *     un nivel de alcance, cerrar como cerrado-eficaz.
 *   - caso o encargo → mira que cuelgue de un fondo y revalida el fondo.
 * Con `schedule` (o `workflow_dispatch` sin issue): el pase de las ventanas.
 *
 * Seguridad: el cuerpo de un issue es entrada no confiable (repo público). Se
 * lee con el parser acotado de fondos.mjs, nada se ejecuta ni se interpola, y
 * lo que escribe el autor no se copia a los comentarios. Solo se tocan
 * comentarios del propio bot (marca Y autor). Todo llega por entorno.
 *
 * Si la API no responde, FALLA con la causa (tras reintentar) y sin culpar a
 * quien editó el issue: se relanza el run. No deja pasar en silencio.
 *
 * Uso (lo lanza el workflow): GITHUB_TOKEN=… GITHUB_REPOSITORY=… GITHUB_EVENT_NAME=… ISSUE_NUMBER=… EVENT_ACTION=… node scripts/fondos-evento.mjs
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { MAX_NUMERO } from "../.claude/hooks/casos.mjs";
import { falloDeCaso } from "./casos-pr.mjs";
import { ErrorDeApi, pedir, pedirPaginas } from "./lib/ghApi.mjs";
import {
  MARCA, MARCA_HIJO, comentario, esComentarioNuestro, falla, fijarCampos, fondoDeRest, leerFicha, limpio, leerSubidos, validarFicha, validarHijo,
} from "./lib/fondos.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { porGrupo } from "./lib/issues.mjs";

const nombres = (i) => (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const tipoDe = (i) => [...porGrupo(nombres(i)).tipo][0] ?? null;

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
    fondosAbiertos: () => pedirPaginas({ ...base, ruta: "/issues?state=open&labels=tipo%3Afondo" }, { maxPaginas: 3 }),
    // ¿Está el fichero en origin/staging? Cada tramo de la ruta, codificado.
    existeEnStaging: async (ruta) => {
      const r = await pedir({ ...base, ruta: `/contents/${ruta.split("/").map(encodeURIComponent).join("/")}?ref=staging` });
      return r !== null;
    },
  };
}

/** Crea o actualiza (no apila) el comentario del bot con esa marca. */
async function upsert(api, n, texto, marca) {
  const propio = (await api.comentarios(n)).find((c) => esComentarioNuestro(c, marca));
  if (propio) {
    if (propio.body !== texto) await api.editarComentario(propio.id, texto);
    return propio;
  }
  await api.crearComentario(n, texto);
  return null;
}

/** Valida un fondo y ejecuta lo que manda. → una línea contable: { issue, control, hallazgos, acciones }. */
export async function procesarFondo(api, fondoRest, { hoy, evento = "" }) {
  const n = fondoRest.number;
  const hijos = await api.hijos(n);
  const fondo = fondoDeRest(fondoRest, hijos);
  const propio = (await api.comentarios(n)).find((c) => esComentarioNuestro(c, MARCA));
  const subidos = leerSubidos(propio?.body);

  // La verificación se comprueba en origin/staging solo cuando hace falta (observación o cierre).
  const lectura = leerFicha(fondo.body);
  const ruta = lectura.ficha.verificacion;
  const existe = ruta && ["en-observacion", "cerrado-eficaz"].includes(lectura.ficha.estado) ? await api.existeEnStaging(ruta) : false;

  const res = validarFicha(fondo, { existeEnStaging: () => existe, hoy, subidos });
  // Reabrir a mano un fondo que estaba observándose o cerrado: queda constancia en la ficha.
  if (evento === "reopened" && lectura.presente && ["en-observacion", "cerrado-eficaz"].includes(lectura.ficha.estado)) {
    res.acciones.push({ tipo: "fijar", campos: { estado: "reabierto" } });
  }

  // 1. La ficha: estado y alcance nuevos (todas las acciones `fijar`, la última gana).
  const campos = Object.assign({}, ...res.acciones.filter((a) => a.tipo === "fijar").map((a) => a.campos));
  if (Object.keys(campos).length) {
    const nuevo = fijarCampos(fondo.body, campos);
    if (nuevo !== null && nuevo !== fondo.body) await api.editarIssue(n, { body: nuevo });
  }
  // 2. El estado del issue.
  if (res.acciones.some((a) => a.tipo === "reabrir") && fondo.state === "CLOSED") await api.editarIssue(n, { state: "open" });
  const cierre = res.acciones.find((a) => a.tipo === "cerrar");
  if (cierre && fondo.state === "OPEN") {
    if (cierre.arreglo && !nombres(fondoRest).includes(`arreglo:${cierre.arreglo}`)) await api.ponerEtiquetas(n, [`arreglo:${cierre.arreglo}`]);
    await api.editarIssue(n, { state: "closed", state_reason: "completed" });
  }
  // 3. La etiqueta de control y el comentario.
  const control = falla(res) ? "falla" : "ok";
  const quiere = `control:${control}`;
  const hay = nombres(fondoRest);
  if (!hay.includes(quiere)) await api.ponerEtiquetas(n, [quiere]);
  const otra = `control:${control === "ok" ? "falla" : "ok"}`;
  if (hay.includes(otra)) await api.quitarEtiqueta(n, otra);
  await upsert(api, n, comentario(res, { subidos: res.subidos }), MARCA);

  return { issue: n, control, errores: res.hallazgos.filter((h) => h.gravedad === "error").length, avisos: res.hallazgos.filter((h) => h.gravedad === "aviso").length, acciones: res.acciones.map((a) => a.tipo) };
}

/** Un caso o encargo: ¿cuelga de un fondo? Y revalida el fondo, que acaba de cambiar de hijos. */
export async function procesarHijo(api, hijoRest, { hoy, evento }) {
  const padreRest = await api.padre(hijoRest.number);
  const padre = padreRest ? { number: padreRest.number, labels: nombres(padreRest).map((name) => ({ name })) } : null;
  const hallazgos = validarHijo({ number: hijoRest.number, labels: nombres(hijoRest).map((name) => ({ name })) }, padre);
  // Un caso lleva su análisis (la misma comprobación que la línea «Casos:» de los PR).
  if (tipoDe(hijoRest) === "caso") {
    const sinAnalisis = falloDeCaso(hijoRest.number, hijoRest);
    if (sinAnalisis) hallazgos.push({ regla: "caso-sin-analisis", gravedad: "error", mensaje: limpio(sinAnalisis, 200) });
  }
  const sal = [];
  if (hallazgos.length) {
    const res = { hallazgos, acciones: [] };
    await upsert(api, hijoRest.number, comentario(res, { marca: MARCA_HIJO, titulo: "Control del caso o encargo", pie: "Lo escribe el workflow `fondos` y se actualiza solo." }), MARCA_HIJO);
  } else {
    // Si antes avisó y ya está bien, el comentario se pone al día en vez de quedarse mintiendo.
    const previo = (await api.comentarios(hijoRest.number)).find((c) => esComentarioNuestro(c, MARCA_HIJO));
    if (previo) await upsert(api, hijoRest.number, comentario({ hallazgos: [], acciones: [] }, { marca: MARCA_HIJO, titulo: "Control del caso o encargo", pie: "Lo escribe el workflow `fondos` y se actualiza solo." }), MARCA_HIJO);
  }
  sal.push({ issue: hijoRest.number, control: hallazgos.some((h) => h.gravedad === "error") ? "falla" : "ok", errores: hallazgos.filter((h) => h.gravedad === "error").length, avisos: hallazgos.filter((h) => h.gravedad === "aviso").length, acciones: [] });
  if (padre && tipoDe(padreRest) === "fondo") sal.push(await procesarFondo(api, padreRest, { hoy, evento }));
  return sal;
}

/** El pase diario: las ventanas de observación de los fondos abiertos con ficha. */
export async function pasadaDiaria(api, { hoy }) {
  const sal = [];
  const fallos = [];
  for (const f of await api.fondosAbiertos()) {
    if (f.pull_request) continue;
    const { presente, ficha } = leerFicha(f.body);
    if (!presente || ficha.estado !== "en-observacion") continue;
    try {
      sal.push(await procesarFondo(api, f, { hoy, evento: "schedule" }));
    } catch (e) {
      if (!(e instanceof ErrorDeApi)) throw e;
      fallos.push(`#${f.number}: ${e.message}`);
    }
  }
  return { sal, fallos };
}

/** El punto de entrada, sin tocar `process`: devuelve las líneas, y lanza ErrorDeApi si la API falla. */
export async function ejecutar({ api, evento, accion = "", issue, hoy }) {
  if (!issue) {
    const { sal, fallos } = await pasadaDiaria(api, { hoy });
    if (fallos.length) throw new ErrorDeApi(`la pasada diaria no pudo con ${fallos.length} fondo(s): ${fallos.join("; ")}`);
    return sal;
  }
  const n = /^\d{1,8}$/.test(String(issue)) ? Number(issue) : 0;
  if (n < 1 || n > MAX_NUMERO) throw new Error(`ISSUE_NUMBER no es un número de issue: «${String(issue).slice(0, 20)}»`);
  const rest = await api.issue(n);
  if (!rest) return [];
  if (rest.pull_request) return [];
  const tipo = tipoDe(rest);
  if (tipo === "fondo") return [await procesarFondo(api, rest, { hoy, evento: accion })];
  if (tipo === "caso" || tipo === "encargo") return procesarHijo(api, rest, { hoy, evento: accion });
  return [];
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const { GITHUB_TOKEN = "", GITHUB_REPOSITORY = "pabloam89/MenuPlan", GITHUB_EVENT_NAME = "", EVENT_ACTION = "", ISSUE_NUMBER = "" } = process.env;
  try {
    const lineas = await ejecutar({
      api: apiReal({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY }),
      evento: GITHUB_EVENT_NAME,
      accion: EVENT_ACTION,
      issue: ISSUE_NUMBER,
      hoy: diaMadrid(),
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
