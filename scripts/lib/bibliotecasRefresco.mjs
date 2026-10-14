/**
 * Refresco de los datos medibles del pool de bibliotecas (#792, línea 2 de #774): relee GitHub y npm de cada ficha de
 * `ops/diseno/bibliotecas.json` y calcula qué cambió. Solo toca lo que esas APIs miden y que la ficha ya traía medido:
 *
 *   npm     version, licencia.spdx (si su fuente es npm), peso.dependencias, react (desde y hasta, de peerDependencies.react)
 *   GitHub  ultimo_push, licencia.spdx (si su fuente es github)
 *   avisos  archivada, sin push en un año, licencia o React que cambian: se cuentan pero no se escriben (mantenimiento y
 *           vinculo son un juicio; el test del pool exige que una archivada sea `retired`)
 *
 * Nunca pisa lo que no se mide ahí (accesibilidad, cobertura, nivel gratuito, alcance, permite, podable, plataforma, rol,
 * vínculo, mantenimiento) ni rellena un `unverified`: descubrir un dato nuevo es investigación con fuente, no refresco.
 * De dónde se lee cada ficha sale de ella misma: el paquete, de `licencia.fuente_url` cuando es un registro de npm; el
 * repositorio, de esa URL si es de GitHub o, si no, del `repository` que declara el paquete en npm. Una ficha sin ninguna
 * de las dos no tiene nada que refrescar. Una ficha con cambios lleva `medida` = hoy; `comprobada` es la fecha de lo
 * investigado a mano y su caducidad de 90 días no se renueva por medir (#814).
 *
 * Puro salvo `refrescarPool`, que recibe la función que lee (`leer(url) -> objeto JSON`): el test le pasa muestras
 * guardadas y no usa red. Lo lanza `scripts/diseno/bibliotecas-refresco.mjs`.
 */
import { SIN_COMPROBAR, NO_APLICA } from "./bibliotecasDiseno.mjs";

const DIA_MS = 86_400_000;
export const DIAS_SIN_PUSH = 365;
const SEMVER = /^\d+\.\d+\.\d+$/;
const esDato = (v) => v !== SIN_COMPROBAR && v !== NO_APLICA && v !== null && v !== undefined;

/** La parte de la URL tras el patrón de una fuente (`lectura.patron_de_url`), o null si la URL no es de esa fuente. */
function restoDe(url, patron) {
  const prefijo = patron.split("<")[0];
  const sufijo = patron.split(">")[1] ?? "";
  if (typeof url !== "string" || !url.startsWith(prefijo)) return null;
  const resto = url.slice(prefijo.length);
  return sufijo && resto.endsWith(sufijo) ? resto.slice(0, -sufijo.length) : resto;
}

/** De dónde leer una ficha: `{ paquete, repo }` (cada uno o null). Si no hay `repo`, puede salir del `repository` de npm (`repoDeNpm`). */
export function origenesDe(ficha, patrones) {
  const url = ficha?.licencia?.fuente_url;
  const paquete = restoDe(url, patrones.npm);
  const repo = restoDe(url, patrones.github);
  return { paquete: paquete ? decodeURIComponent(paquete) : null, repo };
}

/** `owner/repo` del campo `repository` de un paquete de npm (cadena o `{url}`), o null si no es de GitHub. */
export function repoDeNpm(npm) {
  const r = typeof npm?.repository === "string" ? npm.repository : npm?.repository?.url;
  const m = /github(?:\.com)?[:/]([^/\s]+)\/([^/\s#]+?)(?:\.git)?(?:#.*)?$/.exec(r ?? "");
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Del rango de `peerDependencies.react` a `{ desde, hasta }` con la forma de la ficha (x o x.y; `hasta` null si no hay tope).
 * `desde` es la cota más baja de las alternativas; `hasta`, el mayor mayor de ^ y ~, o null si alguna es abierta (>=, >, *).
 * Null si no hay rango o no se entiende (no se mide: se deja la ficha como está). Un tope con `<`, un intervalo con guion
 * (`16.8.0 - 18`) o una alternativa con varios comparadores (`>=16 <19`) no se traduce: null, y `compararFicha` avisa de
 * revisar a mano (#814). El guion pegado de una versión previa (`^18.0.0-rc.0`) no es un intervalo.
 */
export function rangoDeReact(rango) {
  if (typeof rango !== "string" || !rango.trim()) return null;
  if (rango.includes("<")) return null;
  const cotas = [];
  let abierto = false;
  for (const alt of rango.split("||")) {
    // El espacio entre comparador y versión (`>= 18`) no es otro comparador; lo que quede separado por espacios, sí.
    const partes = alt.replace(/(\^|~|>=|>|=)\s+/g, "$1").trim().split(/\s+/).filter(Boolean);
    if (partes.length > 1) return null;
    const m = /^\s*(\^|~|>=|>)?\s*v?(\d+)(?:\.(\d+))?/.exec(alt);
    if (!m) { if (/^\s*\*\s*$/.test(alt)) abierto = true; continue; }
    cotas.push([Number(m[2]), Number(m[3] ?? 0)]);
    if (m[1] === ">=" || m[1] === ">") abierto = true;
  }
  if (cotas.length === 0) return null;
  cotas.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const [major, minor] = cotas[0];
  const mayor = Math.max(...cotas.map((c) => c[0]));
  return { desde: minor ? `${major}.${minor}` : `${major}`, hasta: abierto ? null : `${mayor}` };
}

/** Lo que mide una respuesta de `registry.npmjs.org/<paquete>/latest`. */
export function medirNpm(r) {
  const lic = typeof r?.license === "string" ? r.license : r?.license?.type;
  return {
    version: SEMVER.test(r?.version ?? "") ? r.version : null,
    spdx: typeof lic === "string" && lic ? lic : null,
    dependencias: Object.keys(r?.dependencies ?? {}).length,
    react: rangoDeReact(r?.peerDependencies?.react),
    // El rango tal cual: si hay rango y no se tradujo, el aviso lo cita (#814).
    react_rango: typeof r?.peerDependencies?.react === "string" && r.peerDependencies.react.trim() ? r.peerDependencies.react : null,
    repo: repoDeNpm(r),
  };
}

/** Lo que mide una respuesta de `api.github.com/repos/<repo>`. */
export function medirGithub(r) {
  const spdx = r?.license?.spdx_id;
  return {
    archivada: r?.archived === true,
    ultimo_push: /^\d{4}-\d{2}-\d{2}/.test(r?.pushed_at ?? "") ? r.pushed_at.slice(0, 10) : null,
    spdx: typeof spdx === "string" && spdx && spdx !== "NOASSERTION" ? spdx : null,
  };
}

/**
 * Compara una ficha con lo medido y devuelve `{ cambios, avisos }`; no modifica la ficha.
 * `cambios`: `{campo, ruta, antes, despues}` (ruta: dónde se escribe, como lista); `avisos`: textos que piden mirar la ficha.
 */
export function compararFicha(ficha, npm, github, hoy = new Date()) {
  const cambios = [];
  const avisos = [];
  const cambia = (campo, ruta, antes, despues) => { if (JSON.stringify(antes) !== JSON.stringify(despues)) cambios.push({ campo, ruta, antes, despues }); };

  if (npm) {
    if (esDato(ficha.version) && npm.version) cambia("version", ["version"], ficha.version, npm.version);
    if (esDato(ficha.peso?.dependencias)) cambia("peso.dependencias", ["peso", "dependencias"], ficha.peso.dependencias, npm.dependencias);
    if (ficha.licencia?.fuente === "npm" && esDato(ficha.licencia.spdx) && npm.spdx && ficha.licencia.spdx !== npm.spdx) {
      cambia("licencia.spdx", ["licencia", "spdx"], ficha.licencia.spdx, npm.spdx);
      avisos.push(`licencia cambia de ${ficha.licencia.spdx} a ${npm.spdx} en npm: revisar alcance y permite a mano`);
    }
    const r = ficha.react;
    if (!npm.react && npm.react_rango && ["declared", "undeclared"].includes(r?.estado)) {
      avisos.push(`rango de React «${npm.react_rango}» en npm sin traducir: revisar react a mano`);
    } else if (r?.estado === "declared") {
      if (npm.react) {
        cambia("react.desde", ["react", "desde"], r.desde, npm.react.desde);
        cambia("react.hasta", ["react", "hasta"], r.hasta, npm.react.hasta);
      } else avisos.push("npm ya no declara peerDependencies de React y la ficha sí: revisar react a mano");
    } else if (r?.estado === "undeclared" && npm.react) {
      cambia("react", ["react"], r, { estado: "declared", ...npm.react });
    }
  }
  if (github) {
    if (esDato(ficha.ultimo_push) && github.ultimo_push) cambia("ultimo_push", ["ultimo_push"], ficha.ultimo_push, github.ultimo_push);
    if (ficha.licencia?.fuente === "github" && esDato(ficha.licencia.spdx) && github.spdx && ficha.licencia.spdx !== github.spdx) {
      cambia("licencia.spdx", ["licencia", "spdx"], ficha.licencia.spdx, github.spdx);
      avisos.push(`licencia cambia de ${ficha.licencia.spdx} a ${github.spdx} en GitHub: revisar alcance y permite a mano`);
    }
    if (github.archivada && ficha.mantenimiento !== "archived") avisos.push("archivada en GitHub y la ficha no lo dice: pasar a retired con mantenimiento archived");
    const push = github.ultimo_push ?? ficha.ultimo_push;
    if (esDato(push) && !github.archivada && ["active", "slow"].includes(ficha.mantenimiento)) {
      const dias = Math.floor((hoy.getTime() - Date.parse(`${push}T00:00:00Z`)) / DIA_MS);
      if (dias > DIAS_SIN_PUSH) avisos.push(`sin push en ${dias} días y la ficha dice ${ficha.mantenimiento}: valorar idle`);
    }
  }
  return { cambios, avisos };
}

/** Cuántos campos de la ficha puede refrescar el script (la cifra «después» del encargo): los que ya traen dato y tienen de dónde leerse. */
export function camposRefrescables(ficha, patrones) {
  const { paquete, repo } = origenesDe(ficha, patrones);
  let n = 0;
  if (paquete) {
    if (esDato(ficha.version)) n++;
    if (esDato(ficha.peso?.dependencias)) n++;
    if (ficha.licencia?.fuente === "npm" && esDato(ficha.licencia.spdx)) n++;
    if (ficha.react?.estado === "declared") n += 2;
  }
  // El repositorio de una ficha con paquete sale de npm; se cuenta si hay de dónde leerlo.
  if (paquete || repo) {
    if (esDato(ficha.ultimo_push)) n++;
    if (ficha.licencia?.fuente === "github" && esDato(ficha.licencia.spdx)) n++;
  }
  return n;
}

/**
 * Relee todas las fichas con `leer(url)` y devuelve `{ datos, informe }`: `datos` es una copia del pool con los cambios
 * aplicados (y `medida` = hoy en las fichas que cambiaron); `informe`, una entrada por ficha con `cambios`, `avisos`
 * y `errores` (lectura que falló: esa parte queda como estaba). No escribe nada.
 */
export async function refrescarPool(datos, leer, hoy = new Date()) {
  const patrones = datos.lectura.patron_de_url;
  const fecha = hoy.toISOString().slice(0, 10);
  const copia = structuredClone(datos);
  const informe = [];
  for (const ficha of copia.bibliotecas) {
    const entrada = { id: ficha.id, refrescables: camposRefrescables(ficha, patrones), cambios: [], avisos: [], errores: [] };
    informe.push(entrada);
    const { paquete, repo: repoDirecto } = origenesDe(ficha, patrones);
    let npm = null;
    let github = null;
    if (paquete) {
      try { npm = medirNpm(await leer(patrones.npm.replace("<paquete>", paquete))); } catch (e) { entrada.errores.push(`npm ${paquete}: ${e.message}`); }
    }
    const repo = repoDirecto ?? npm?.repo ?? null;
    if (repo) {
      try { github = medirGithub(await leer(patrones.github.replace("<repo>", repo))); } catch (e) { entrada.errores.push(`github ${repo}: ${e.message}`); }
    }
    const { cambios, avisos } = compararFicha(ficha, npm, github, hoy);
    entrada.cambios = cambios.map(({ campo, antes, despues }) => ({ campo, antes, despues }));
    entrada.avisos = avisos;
    for (const c of cambios) {
      let o = ficha;
      for (const k of c.ruta.slice(0, -1)) o = o[k];
      o[c.ruta.at(-1)] = c.despues;
    }
    // La fecha de la medida, no la de lo investigado: `comprobada` y su caducidad no se tocan (#814).
    if (cambios.length) ficha.medida = fecha;
  }
  return { datos: copia, informe };
}

/**
 * Una respuesta que no es 2xx, a `{ limite, mensaje }`. Un 403 o 429 con `x-ratelimit-remaining: 0` o con `retry-after` es
 * el límite de tasa (GitHub da 403 también por otras causas, y entonces no lo es); el resto, su código y su texto (#814).
 */
export function errorDeLectura(estado, texto, cabeceras) {
  const quedan = cabeceras?.get?.("x-ratelimit-remaining");
  const espera = cabeceras?.get?.("retry-after");
  if ((estado === 403 || estado === 429) && (quedan === "0" || espera)) {
    return { limite: true, mensaje: `límite de tasa: ${estado} ${quedan === "0" ? "x-ratelimit-remaining 0" : `retry-after ${espera}`}` };
  }
  return { limite: false, mensaje: texto ? `${estado} ${texto}` : `${estado}` };
}

/** El informe en líneas `campo: valor`, una por cambio, aviso o error, y el resumen al final. */
export function lineasDeInforme(informe) {
  const l = [];
  for (const e of informe) {
    for (const c of e.cambios) l.push(`cambio: ${e.id} campo: ${c.campo} antes: ${JSON.stringify(c.antes)} despues: ${JSON.stringify(c.despues)}`);
    for (const a of e.avisos) l.push(`aviso: ${e.id} ${a}`);
    for (const x of e.errores) l.push(`error: ${e.id} ${x}`);
  }
  l.push(`fichas: ${informe.length}`);
  l.push(`campos_refrescables: ${informe.reduce((s, e) => s + e.refrescables, 0)}`);
  l.push(`fichas_con_cambios: ${informe.filter((e) => e.cambios.length).length}`);
  l.push(`cambios: ${informe.reduce((s, e) => s + e.cambios.length, 0)}`);
  l.push(`avisos: ${informe.reduce((s, e) => s + e.avisos.length, 0)}`);
  l.push(`errores: ${informe.reduce((s, e) => s + e.errores.length, 0)}`);
  return l;
}
