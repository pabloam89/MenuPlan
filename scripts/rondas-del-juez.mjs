#!/usr/bin/env node
// Cuenta los «no» del juez del CI (workflow `revisor`) por criterio en los últimos N días, para
// saber qué clase de fallo repiten las sesiones al abrir un PR. La tabla ordena la skill `pr-con-juez`.
//
// Uso:   npm run rondas-juez [-- --dias 14] [--json]
// Lee:   gh run list --workflow revisor --created >=<fecha> --json databaseId,headBranch,conclusion,status
//        gh api repos/{owner}/{repo}/actions/runs/<id>/jobs y gh api …/actions/jobs/<job>/logs (de cada ejecución acabada)
// Token: desde Node, `gh` no pasa por el shim de las sesiones; lánzalo con
//        node scripts/token-sesion.mjs -- npm run rondas-juez   (una llamada de la cuota por ejecución)
//
// El veredicto sale de la línea `SALIDA: {...}` del log (el JSON del modelo: respuestas [{id, respuesta, prueba}]).
// Sin una SALIDA legible no se deduce nada: la ejecución cuenta como «sin veredicto», con su motivo
// del vocabulario MOTIVOS_SIN_VEREDICTO. Los tres primeros son fallos del propio juez.

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

// Tope de `gh run list`. Si llegan tantas, puede haber más y la cuenta saldría corta: el script para.
export const LIMITE_EJECUCIONES = 5000;
// Logs que se piden a la vez (la medida del PR que creó el script se hizo con 6).
const A_LA_VEZ = 6;
// Un log entero cabe; con el tope de 1 MiB de Node, uno largo haría fallar la ejecución entera.
const MAX_LOG = 256 * 1024 * 1024;

// Las ejecuciones acabadas de la lista; lanza si la lista llega al tope (habría más que no se ven).
export function acabadas(lista, limite = LIMITE_EJECUCIONES) {
  if (lista.length >= limite) throw new Error(`gh run list devolvió ${lista.length} ejecuciones, el tope: acorta --dias`);
  return lista.filter((r) => r.status === "completed");
}

// Motivo de una ejecución sin veredicto, en orden de prioridad: el primero cuya señal está en el log gana.
// `cancelada` y `sin-salida` no son culpa del juez (cancelada, o no llegó a juzgar).
// Las señales son copia de textos de otros: «exceeding…» lo escribe la acción de Claude, y «salida ilegible» y
// «: sin respuesta», `decidir` de .fabrica/scripts/veredicto.mjs (la Fábrica, fuera de este repo). Si cambian,
// esas ejecuciones caen en `sin-salida`, y la tabla lista sus ids para mirarlas: es la alarma de esta copia.
export const MOTIVOS_SIN_VEREDICTO = [
  { motivo: "tope-de-turnos", fallaElJuez: true, senal: "exceeding the configured maximum" },
  { motivo: "salida-ilegible", fallaElJuez: true, senal: "salida ilegible" },
  { motivo: "sin-respuesta", fallaElJuez: true, senal: ": sin respuesta" },
  { motivo: "cancelada", fallaElJuez: false, senal: null },
  { motivo: "sin-salida", fallaElJuez: false, senal: null },
];

// Cómo escribe el juez su log, copiado de la Fábrica (fuera de este repo): el job `juzgar` y las variables
// `SALIDA` y `PR` del paso del veredicto, en .fabrica/.github/workflows/revisor.yml. Si cambian, no habrá job
// ni SALIDA y la ejecución cae en `sin-salida` (la tabla lista sus ids), o clasificar lanza si ve un veredicto
// sin PR: son las alarmas de esta copia.
export const FORMA_DEL_LOG = { job: /(^|\/ )juzgar$/, salida: "SALIDA: ", pr: /\sPR: (\d+)\s*$/m };

// La línea `SALIDA: {...}` del log, ya leída como JSON; null si no hay o no es JSON con `respuestas`.
// Más de una es un log que no se entiende: lanza en vez de escoger una.
export function leerSalida(log) {
  const { salida } = FORMA_DEL_LOG;
  const lineas = String(log ?? "").split(/\r?\n/).filter((l) => l.includes(`${salida}{`));
  if (lineas.length > 1) throw new Error(`el log trae ${lineas.length} líneas ${salida.trim()}, y el juez escribe una`);
  const linea = lineas[0];
  if (!linea) return null;
  try {
    const datos = JSON.parse(linea.slice(linea.indexOf(salida) + salida.length).trim());
    return Array.isArray(datos?.respuestas) ? datos : null;
  } catch {
    return null; // una SALIDA cortada o ilegible no es un veredicto: la clasifica motivoSinVeredicto
  }
}

// El número de PR que juzgó, de las variables del paso del veredicto (`PR: 1066`).
export function leerPr(log) {
  const m = String(log ?? "").match(FORMA_DEL_LOG.pr);
  return m ? Number(m[1]) : null;
}

export function motivoSinVeredicto(log, conclusion) {
  const texto = String(log ?? "");
  for (const { motivo, senal } of MOTIVOS_SIN_VEREDICTO) if (senal && texto.includes(senal)) return motivo;
  return conclusion === "cancelled" ? "cancelada" : "sin-salida";
}

// Una ejecución: { id, rama, conclusion, log } → { id, rama, pr, veredicto: bool, noes: [ids], motivo }.
export function clasificar({ id, rama, conclusion, log }) {
  const pr = leerPr(log);
  const salida = leerSalida(log);
  if (!salida) return { id, rama, pr, veredicto: false, noes: [], motivo: motivoSinVeredicto(log, conclusion) };
  if (pr === null) throw new Error(`la ejecución ${id} trae veredicto y no «PR: n»: ¿cambió revisor.yml de la Fábrica?`);
  const noes = salida.respuestas
    .filter((r) => typeof r?.id === "string" && String(r.respuesta ?? "").trim().toLowerCase() === "no")
    .map((r) => r.id);
  return { id, rama, pr, veredicto: true, noes: [...new Set(noes)], motivo: null };
}

const numeroDe = (id) => Number(String(id).replace(/\D/g, "")) || 0;

// Suma las ejecuciones clasificadas: «no» por criterio (y en cuántos PR), y las sin veredicto por motivo.
export function contar(clasificadas) {
  const juzgadas = clasificadas.filter((c) => c.veredicto);
  const porId = new Map();
  for (const c of juzgadas) {
    for (const id of c.noes) {
      const fila = porId.get(id) ?? { id, no: 0, prs: new Set() };
      fila.no += 1;
      fila.prs.add(c.pr);
      porId.set(id, fila);
    }
  }
  const criterios = [...porId.values()]
    .map(({ id, no, prs }) => ({ id, no, prs: prs.size }))
    .sort((a, b) => b.no - a.no || numeroDe(a.id) - numeroDe(b.id));
  const sinVeredicto = MOTIVOS_SIN_VEREDICTO.map(({ motivo, fallaElJuez }) => ({
    motivo,
    fallaElJuez,
    ejecuciones: clasificadas.filter((c) => c.motivo === motivo).length,
    ids: clasificadas.filter((c) => c.motivo === motivo).map((c) => c.id),
  }));
  return {
    ejecuciones: clasificadas.length,
    juzgadas: juzgadas.length,
    conAlgunNo: juzgadas.filter((c) => c.noes.length).length,
    criterios,
    sinVeredicto,
  };
}

export function tabla(resumen, dias) {
  const fuera = [
    `Juez (revisor), últimos ${dias} días: ${resumen.ejecuciones} ejecuciones, ${resumen.juzgadas} con veredicto, ${resumen.conAlgunNo} con algún «no».`,
    "",
    "| Criterio | «no» | PR distintos |",
    "|---|---|---|",
    ...resumen.criterios.map((f) => `| ${f.id} | ${f.no} | ${f.prs} |`),
    "",
    "| Sin veredicto | Ejecuciones | ¿Falla el juez? |",
    "|---|---|---|",
    ...resumen.sinVeredicto.map((s) => `| ${s.motivo} | ${s.ejecuciones} | ${s.fallaElJuez ? "sí" : "no"} |`),
  ];
  const sinSalida = resumen.sinVeredicto.find((s) => s.motivo === "sin-salida")?.ids ?? [];
  if (sinSalida.length) fuera.push("", `sin-salida, mira su log (¿cambió una señal de MOTIVOS_SIN_VEREDICTO?): ${sinSalida.join(", ")}`);
  return fuera.join("\n");
}

async function gh(args) {
  try {
    const { stdout } = await ejecutar("gh", args, { maxBuffer: MAX_LOG, windowsHide: true });
    return stdout;
  } catch (e) {
    throw new Error(`gh ${args.join(" ")} falló: ${e.stderr || e.message}`, { cause: e });
  }
}

// El job que juzga («revisor / juzgar»), si llegó a correr (uno saltado no tiene log). null si no hay.
export function jobDelJuez(jobs) {
  return (jobs ?? []).find((j) => FORMA_DEL_LOG.job.test(j?.name ?? "") && j.conclusion !== "skipped") ?? null;
}

// Solo el log del job que juzga: dos peticiones por ejecución, la lista de jobs y su log. Solo la primera
// descuenta de la cuota de la App (5000 por hora, común a todas las sesiones): la descarga del log no la
// toca. `gh run view --log` gasta varias por ejecución y con él una medida de 14 días agotó la cuota. Sin job que juzgue, log vacío: clasificar la cuenta como sin veredicto.
// Un job cancelado antes de escribir nada no tiene log (404): también vacío. Cualquier otro fallo corta.
async function logDelJuez(id) {
  const { jobs } = JSON.parse(await gh(["api", `repos/{owner}/{repo}/actions/runs/${id}/jobs`]));
  const job = jobDelJuez(jobs);
  if (!job) return "";
  try {
    return await gh(["api", `repos/{owner}/{repo}/actions/jobs/${job.id}/logs`]);
  } catch (e) {
    if (job.conclusion === "cancelled" && /HTTP 404/.test(e.message)) return "";
    throw e;
  }
}

async function enParalelo(cosas, cuantas, fn) {
  const fuera = new Array(cosas.length);
  let siguiente = 0;
  const obrero = async () => {
    while (siguiente < cosas.length) {
      const i = siguiente++;
      fuera[i] = await fn(cosas[i]);
    }
  };
  await Promise.all(Array.from({ length: cuantas }, obrero));
  return fuera;
}

function leerArgs(argv) {
  const i = argv.indexOf("--dias");
  const dias = i >= 0 ? Number(argv[i + 1]) : 14;
  if (!Number.isInteger(dias) || dias <= 0) throw new Error(`--dias necesita un entero positivo (salió «${argv[i + 1]}»)`);
  return { dias, json: argv.includes("--json") };
}

async function main() {
  const { dias, json } = leerArgs(process.argv.slice(2));
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const lista = JSON.parse(
    await gh(["run", "list", "--workflow", "revisor", "--created", `>=${desde}`, "--limit", String(LIMITE_EJECUCIONES), "--json", "databaseId,headBranch,conclusion,status"]),
  );
  const terminadas = acabadas(lista);
  const clasificadas = await enParalelo(terminadas, A_LA_VEZ, async (r) =>
    clasificar({ id: r.databaseId, rama: r.headBranch, conclusion: r.conclusion, log: await logDelJuez(r.databaseId) }),
  );
  const resumen = { desde, dias, sinAcabar: lista.length - terminadas.length, ...contar(clasificadas) };
  console.log(json ? JSON.stringify(resumen, null, 2) : `${tabla(resumen, dias)}\n\nSin acabar (no contadas): ${resumen.sinAcabar}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`rondas-del-juez: ${e.message}`);
    process.exit(1);
  });
}
