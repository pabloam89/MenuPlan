/**
 * El registro de ensayos de la vuelta atrás (#589, norma `rollback-ensayado`):
 * `ops/ensayos-rollback.json`. Lo escribe una persona tras ensayar el rollback en el panel
 * de Vercel; este lector comprueba la forma y dice cuándo fue el último ensayo bueno.
 *
 * Campos de cada ensayo (vocabularios cerrados; el repo es público: sin enlaces ni ids de despliegue):
 *   fecha       AAAA-MM-DD, no futura respecto a `hoy` cuando se da
 *   quien       pablo | alvaro
 *   metodo      panel | conector
 *   entorno     produccion | staging
 *   resultado   ok | fallo
 *   minutos     entero de 0 a 240: de pulsar a ver el despliegue anterior sirviendo
 *   comprobado  lista (sin repetir) de pagina | funcion | canario; un ensayo ok lleva al menos pagina y funcion
 *   issue       número del issue que lo lleva
 *
 * Lectores: `ops/ensayos-rollback.test.js` (la forma) y `ultimoEnsayoBueno` / `diasDesde`, que usa
 * el aviso de la skill `vercel` y, cuando se quiera, el informe semanal. Sin lector no hay campo.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RUTA_ENSAYOS = "ops/ensayos-rollback.json";
export const QUIENES = ["pablo", "alvaro"];
export const METODOS = ["panel", "conector"];
export const ENTORNOS = ["produccion", "staging"];
export const RESULTADOS = ["ok", "fallo"];
export const COMPROBADOS = ["pagina", "funcion", "canario"];
const CAMPOS = ["fecha", "quien", "metodo", "entorno", "resultado", "minutos", "comprobado", "issue"];
const DIA_MS = 24 * 60 * 60 * 1000;

/** Lee el registro. Un fichero que falta o roto se lanza: no se confunde con «sin ensayos». */
export function leerEnsayos(raiz) {
  const ruta = join(raiz, RUTA_ENSAYOS);
  if (!existsSync(ruta)) throw new Error(`falta ${RUTA_ENSAYOS}`);
  return JSON.parse(readFileSync(ruta, "utf8"));
}

const esFecha = (f) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f;

/** Las faltas de forma del registro. `hoy` (AAAA-MM-DD) activa la regla de «no futura». Lista vacía si está bien. */
export function faltasDeEnsayos(datos, { hoy = null } = {}) {
  const f = [];
  if (!datos || typeof datos !== "object" || datos.version !== 1) return ["version debe ser 1"];
  if (!Array.isArray(datos.ensayos)) return ["ensayos debe ser una lista"];
  datos.ensayos.forEach((e, i) => {
    const d = `ensayo ${i + 1}`;
    if (!e || typeof e !== "object") { f.push(`${d}: no es un objeto`); return; }
    for (const k of Object.keys(e)) if (!CAMPOS.includes(k)) f.push(`${d}: campo «${k}» fuera del vocabulario`);
    for (const k of CAMPOS) if (!(k in e)) f.push(`${d}: falta «${k}»`);
    if ("fecha" in e && !esFecha(e.fecha)) f.push(`${d}: fecha «${e.fecha}» no es AAAA-MM-DD`);
    else if (hoy && e.fecha > hoy) f.push(`${d}: fecha ${e.fecha} en el futuro`);
    if ("quien" in e && !QUIENES.includes(e.quien)) f.push(`${d}: quien «${e.quien}» no es de ${QUIENES.join("|")}`);
    if ("metodo" in e && !METODOS.includes(e.metodo)) f.push(`${d}: metodo «${e.metodo}» no es de ${METODOS.join("|")}`);
    if ("entorno" in e && !ENTORNOS.includes(e.entorno)) f.push(`${d}: entorno «${e.entorno}» no es de ${ENTORNOS.join("|")}`);
    if ("resultado" in e && !RESULTADOS.includes(e.resultado)) f.push(`${d}: resultado «${e.resultado}» no es de ${RESULTADOS.join("|")}`);
    if ("minutos" in e && !(Number.isInteger(e.minutos) && e.minutos >= 0 && e.minutos <= 240)) f.push(`${d}: minutos debe ser un entero de 0 a 240`);
    if ("issue" in e && !(Number.isInteger(e.issue) && e.issue > 0)) f.push(`${d}: issue debe ser un número`);
    if ("comprobado" in e) {
      const c = e.comprobado;
      if (!Array.isArray(c) || c.some((x) => !COMPROBADOS.includes(x)) || new Set(c).size !== c.length) f.push(`${d}: comprobado debe ser una lista sin repetir de ${COMPROBADOS.join("|")}`);
      else if (e.resultado === "ok" && !(c.includes("pagina") && c.includes("funcion"))) f.push(`${d}: un ensayo ok comprueba al menos pagina y funcion`);
    }
  });
  return f;
}

/** El ensayo bueno (resultado ok) más reciente, o null. */
export function ultimoEnsayoBueno(datos) {
  const buenos = (datos?.ensayos ?? []).filter((e) => e.resultado === "ok" && esFecha(e.fecha));
  return buenos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0] ?? null;
}

/** Días desde el último ensayo bueno hasta `hoy` (AAAA-MM-DD), o null si no hay ninguno. */
export function diasDesde(datos, hoy) {
  const e = ultimoEnsayoBueno(datos);
  if (!e || !esFecha(hoy)) return null;
  return Math.floor((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${e.fecha}T00:00:00Z`)) / DIA_MS);
}
