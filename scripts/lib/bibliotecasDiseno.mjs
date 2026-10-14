/**
 * El pool de bibliotecas de interfaz (#780, línea 2 de #774): una ficha por biblioteca de terceros en
 * `ops/diseno/bibliotecas.json`, con los campos del bloque Q de `docs/diseno/META-DISENO.md` y lo que añade la línea
 * (requisitos de stack, accesibilidad declarada y qué elementos de `ops/diseno/taxonomia.json` cubre). Solo datos: no
 * instala nada. El detalle de cada campo y de cada vocabulario cerrado está en el `_` y en `vocabularios` del propio JSON.
 *
 * Todo vocabulario cerrado vive una vez, con su definición, en el JSON; las reglas de abajo son las que el test comprueba
 * sin lista de excepciones. La caducidad de `comprobada` (90 días, como las skills) se calcula (`caducidadDeFicha`) y se
 * cuenta en las cifras, pero no falla el test: el reloj no pone en rojo todos los PR (mismo criterio que las skills). La
 * fecha del último cambio que aplicó el refresco (scripts/lib/bibliotecasRefresco.mjs) va aparte, en `medida` (#814), y no la renueva.
 *
 * Lo leen `ops/diseno/pool.test.js`, `scripts/diseno/bibliotecas.mjs` (las cifras) y `scripts/lib/vocabulariosVida.mjs`
 * (el ciclo de vida de cada vocabulario). Puro: sin red.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAZO_COMPROBADO_DIAS } from "./skills.mjs";

export const RUTA_BIBLIOTECAS = "ops/diseno/bibliotecas.json";
export const CAMPOS_DE_FICHA = [
  "id", "nombre", "rol", "vinculo", "mantenimiento", "mantenimiento_fuente", "ultimo_push", "ultimo_push_fuente", "licencia", "version", "peso",
  "react", "requisitos", "plataforma", "accesibilidad", "cubre", "motivo_sin_cobertura", "alternativa", "retirada", "dueno", "comprobada",
  "medida",
];
/** Los campos del bloque Q de ops/diseno/bloques.json que se llaman distinto en la ficha (sin tilde): el resto coincide por nombre. */
export const CORRESPONDENCIA_DE_Q = { "dueño": "dueno" };
/**
 * Las dos marcas: «sin comprobar» y «no corresponde a esta biblioteca». Viven una vez, con su definición, en el vocabulario
 * `marca` del JSON (#802), y ningún otro vocabulario las repite; cada campo dice aquí cuál admite.
 */
export const SIN_COMPROBAR = "unverified";
export const NO_APLICA = "not-applicable";
/**
 * Los vocabularios cerrados del fichero, por su clave: son los que este módulo lee, y el test exige que el JSON no tenga ni más
 * ni menos (un vocabulario sin lector no entra). El ciclo de vida (scripts/lib/vocabulariosVida.mjs) registra estos sin leer el
 * JSON al importarse: lo lee al pedir los textos (#802).
 */
export const VOCABULARIOS_DEL_POOL = [
  "rol", "vinculo", "mantenimiento", "fuente_de_dato", "licencia_alcance", "declaracion", "react_estado", "requisito", "base_de_cobertura",
  "acceso", "origen_de_alcance", "marca",
];
export const CAMPOS_DE_PLATAFORMA = ["vale_en", "fuente_url"];
export const CAMPOS_DE_LICENCIA = ["spdx", "alcance", "permite", "fuente", "fuente_url"];
export const CAMPOS_DE_RETIRADA = ["motivo", "sucesora", "fuente_url"];
export const TOP_DE_RECUENTO = 15;
export const CAMPOS_DE_ACCESIBILIDAD = ["aria", "teclado", "lectores", "wcag", "fuente_url"];
export const CAMPOS_DE_COBERTURA = ["elemento", "base", "acceso", "fuente_url"];
export const CAMPOS_DE_ALCANCE = ["elemento", "origen", "motivo_sin_candidata"];
/** Mantenimiento que una candidata no puede tener: pasa a `retired`. */
export const MANTENIMIENTO_DE_RETIRADA = ["unmaintained", "archived"];
const FORMA_ID = /^[a-z]+(-[a-z]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const VERSION_REACT = /^\d+(\.\d+)?$/;
const URL_HTTPS = /^https:\/\/[^\s]+$/;
const DIA_MS = 86_400_000;
const texto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;
const fechaValida = (v) => FECHA.test(v ?? "") && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const leerBibliotecas = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_BIBLIOTECAS), "utf8"));
/** Los bloques N1 (A a Q): el Q lista los campos de la ficha que el pool cruza con los suyos. */
export const leerBloques = (raiz) => JSON.parse(readFileSync(join(raiz, "ops/diseno/bloques.json"), "utf8"));

/** La versión de React que pide `--react`: x.y, con x e y enteros. Lanza si falta o no tiene esa forma. */
export function validarReact(valor) {
  if (typeof valor !== "string" || !/^\d+\.\d+$/.test(valor)) throw new Error(`--react necesita una versión x.y (por ejemplo 19.2), y llegó ${valor === undefined ? "nada" : `«${valor}»`}`);
  return valor;
}

/** La versión de React (x.y) que usa el proyecto de `raiz`, leída de su package.json en el momento de pintar la cifra; null si no usa React. */
export function reactDePackage(raiz) {
  const pkg = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
  const m = /(\d+)\.(\d+)/.exec(pkg.dependencies?.react ?? pkg.devDependencies?.react ?? "");
  return m ? `${m[1]}.${m[2]}` : null;
}

/** Los vocabularios cerrados del fichero con su texto, para ops/vocabularios-vida.json: `diseno.biblioteca_<clave>`. */
export const textosDeBibliotecas = (datos, clave) => ({ ...(datos?.vocabularios?.[clave] ?? {}) });
/** Las claves de los vocabularios del fichero: salen de él, no se repiten a mano. */
export const clavesDeVocabulario = (datos) => Object.keys(datos?.vocabularios ?? {});

/** Días desde `comprobada` hasta `hoy` y su estado, con el plazo de las skills (`vigente`, `caducada`). */
export function caducidadDeFicha(ficha, hoy = new Date()) {
  if (!fechaValida(ficha?.comprobada)) return { dias: null, estado: "sin_fecha" };
  const dias = Math.floor((hoy.getTime() - Date.parse(`${ficha.comprobada}T00:00:00Z`)) / DIA_MS);
  return { dias, estado: dias > PLAZO_COMPROBADO_DIAS ? "caducada" : "vigente" };
}

const versionDeReact = (v) => (VERSION_REACT.test(v ?? "") ? v.split(".").map(Number) : null);
const menorOIgual = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] ?? 0) <= (b[1] ?? 0));

/** ¿Declara la ficha un rango de React que incluye la versión dada (la de un proyecto)? null si no declara rango. */
export function cumpleReact(ficha, versionReact) {
  const r = ficha?.react;
  if (r?.estado !== "declared") return null;
  const base = versionDeReact(versionReact);
  const desde = versionDeReact(r.desde);
  const hasta = r.hasta === null ? null : versionDeReact(r.hasta);
  if (!base || !desde) return null;
  return menorOIgual(desde, base) && (hasta === null || base[0] <= hasta[0]);
}

/**
 * Los problemas del pool contra la taxonomía de diseño y los agentes (lista de textos; vacía si está bien).
 * `taxonomia`: ops/diseno/taxonomia.json; `agentes`: los nombres de .claude/agents/*.md; `bloques`: ops/diseno/bloques.json.
 */
export function problemasDeBibliotecas(datos, taxonomia, agentes, bloques) {
  const p = [];
  const V = datos?.vocabularios ?? {};
  // Las claves salen del propio fichero; las que el código lee y faltan se notan abajo, en el primer valor «fuera del vocabulario».
  for (const k of clavesDeVocabulario(datos)) {
    const v = V[k];
    if (!v || typeof v !== "object" || Object.keys(v).length === 0) { p.push(`vocabularios.${k}: no hay ninguno`); continue; }
    for (const [id, que] of Object.entries(v)) {
      if (!FORMA_ID.test(id)) p.push(`vocabularios.${k}.${id}: el id no es kebab en minúsculas`);
      if (!texto(que, 5)) p.push(`vocabularios.${k}.${id}: sin definición`);
    }
  }
  const delPool = new Set(VOCABULARIOS_DEL_POOL);
  for (const k of clavesDeVocabulario(datos)) if (!delPool.has(k)) p.push(`vocabularios.${k}: no lo lee el código (VOCABULARIOS_DEL_POOL de scripts/lib/bibliotecasDiseno.mjs)`);
  for (const k of VOCABULARIOS_DEL_POOL) if (!(k in V)) p.push(`vocabularios.${k}: falta (VOCABULARIOS_DEL_POOL lo lee)`);
  // Las marcas, una vez: en `marca`, con las dos del código, y en ningún otro vocabulario.
  const marcas = Object.keys(V.marca ?? {});
  if (marcas.join() !== [SIN_COMPROBAR, NO_APLICA].join()) p.push(`vocabularios.marca: lleva exactamente ${SIN_COMPROBAR} y ${NO_APLICA}`);
  for (const k of clavesDeVocabulario(datos)) if (k !== "marca") for (const x of marcas) if (x in (V[k] ?? {})) p.push(`vocabularios.${k}.${x}: es una marca y vive solo en vocabularios.marca`);
  const en = (k, x) => Object.keys(V[k] ?? {}).includes(x);
  /** Un valor del vocabulario `k`, o una marca del vocabulario `marca` cuando el campo la admite (no todos: un `vinculo` siempre se sabe). */
  const valor = (k, x, ...admitidas) => en(k, x) || (admitidas.includes(x) && en("marca", x));
  const elementos = new Set((taxonomia?.elemento ?? []).map((e) => e.id));
  if (!fechaValida(datos?.lectura?.fecha)) p.push("lectura.fecha: falta o no es AAAA-MM-DD");
  if (!URL_HTTPS.test(datos?.lectura?.dossier ?? "")) p.push("lectura.dossier: falta la URL del dossier");
  // El patrón de URL de cada fuente que se lee por una dirección fija: una sola definición de la fuente (el vocabulario) y su patrón aparte.
  const patrones = datos?.lectura?.patron_de_url ?? {};
  for (const [k, u] of Object.entries(patrones)) {
    if (!en("fuente_de_dato", k)) p.push(`lectura.patron_de_url.${k}: no es una fuente de fuente_de_dato`);
    if (!/^https:\/\/[^\s<]+<[a-z-]+>/.test(u ?? "")) p.push(`lectura.patron_de_url.${k}: es una URL https con un hueco <nombre>`);
  }
  const empiezaPorPatron = (url, k) => typeof url === "string" && typeof patrones[k] === "string" && url.startsWith(patrones[k].split("<")[0]);
  if ("lectura" in (datos ?? {}) && "fuentes" in (datos.lectura ?? {})) p.push("lectura.fuentes: la definición de cada fuente vive en vocabularios.fuente_de_dato; el patrón, en lectura.patron_de_url");
  if ("base_react" in (datos ?? {})) p.push("base_react: el pool no guarda la versión de React de ningún proyecto (se lee de package.json al pintar la cifra)");
  // Un valor de rol dice qué piezas da; lo que exige tiene su campo y ningún valor de rol se repite en él.
  for (const x of Object.keys(V.rol ?? {})) if (x in (V.requisito ?? {})) p.push(`vocabularios.rol.${x}: se repite en requisito`);
  // Los campos del bloque Q de bloques.json son de la ficha (con su nombre, o el de CORRESPONDENCIA_DE_Q) o de decide_el_proyecto, y no de los dos.
  const decide = datos?.decide_el_proyecto;
  const camposQ = bloques?.bloques?.find((b) => b.id === "Q")?.ficha;
  if (!Array.isArray(decide) || decide.length === 0) p.push("decide_el_proyecto: lista de campos del bloque Q que decide cada proyecto");
  else if (!Array.isArray(camposQ)) p.push("bloques.json: falta la ficha del bloque Q");
  else {
    const deLaFicha = new Set(CAMPOS_DE_FICHA);
    for (const c of camposQ) {
      const enFicha = deLaFicha.has(CORRESPONDENCIA_DE_Q[c] ?? c);
      const enProyecto = decide.includes(c);
      if (enFicha && enProyecto) p.push(`bloque Q «${c}»: es de la ficha y de decide_el_proyecto a la vez`);
      if (!enFicha && !enProyecto) p.push(`bloque Q «${c}»: ni es un campo de la ficha ni está en decide_el_proyecto`);
    }
    for (const c of decide) if (!camposQ.includes(c)) p.push(`decide_el_proyecto «${c}»: no es un campo de la ficha del bloque Q de ops/diseno/bloques.json`);
    for (const [deQ, f] of Object.entries(CORRESPONDENCIA_DE_Q)) if (!camposQ.includes(deQ) || !deLaFicha.has(f)) p.push(`CORRESPONDENCIA_DE_Q «${deQ}» → «${f}»: no existe en el bloque Q o en la ficha`);
  }

  const fichas = datos?.bibliotecas ?? [];
  if (!Array.isArray(fichas) || fichas.length === 0) { p.push("bibliotecas: no hay ninguna ficha"); return p; }
  const ids = new Set();
  for (const f of fichas) {
    const q = `bibliotecas.${f?.id}`;
    const extra = Object.keys(f ?? {}).filter((c) => !CAMPOS_DE_FICHA.includes(c));
    const falta = CAMPOS_DE_FICHA.filter((c) => !(c in (f ?? {})));
    if (extra.length) p.push(`${q}: campo desconocido (${extra.join(", ")})`);
    if (falta.length) { p.push(`${q}: falta ${falta.join(", ")}`); continue; }
    if (typeof f.id !== "string" || !FORMA_ID.test(f.id)) { p.push(`${q}: el id no es kebab en minúsculas ASCII`); continue; }
    if (ids.has(f.id)) p.push(`${q}: id repetido`);
    ids.add(f.id);
    if (!texto(f.nombre)) p.push(`${q}: sin nombre`);
    for (const c of ["rol", "vinculo", "mantenimiento"]) if (!valor(c, f[c], ...(c === "vinculo" ? [] : [SIN_COMPROBAR]))) p.push(`${q}: ${c} «${f[c]}» fuera del vocabulario`);

    // Licencia con su prueba: una URL, salvo que la licencia misma esté sin comprobar.
    const l = f.licencia ?? {};
    if (Object.keys(l).some((c) => !CAMPOS_DE_LICENCIA.includes(c)) || CAMPOS_DE_LICENCIA.some((c) => !(c in l))) p.push(`${q}: licencia debe llevar exactamente ${CAMPOS_DE_LICENCIA.join(", ")}`);
    if (!texto(l.spdx)) p.push(`${q}: licencia.spdx vacío (${SIN_COMPROBAR} si no se leyó)`);
    if (!valor("licencia_alcance", l.alcance, SIN_COMPROBAR)) p.push(`${q}: licencia.alcance «${l.alcance}» fuera del vocabulario`);
    if (l.spdx === SIN_COMPROBAR ? l.fuente !== null : !en("fuente_de_dato", l.fuente)) p.push(l.spdx === SIN_COMPROBAR ? `${q}: licencia sin comprobar no lleva fuente (null)` : `${q}: licencia.fuente «${l.fuente}» fuera del vocabulario`);
    for (const c of ["comercial", "redistribuir"]) if (!valor("declaracion", l.permite?.[c], SIN_COMPROBAR)) p.push(`${q}: licencia.permite.${c} fuera del vocabulario`);
    if (l.spdx === SIN_COMPROBAR) {
      if (l.fuente_url !== null) p.push(`${q}: licencia sin comprobar no lleva URL (null)`);
      if ([l.alcance, l.permite?.comercial, l.permite?.redistribuir].some((x) => x !== SIN_COMPROBAR)) p.push(`${q}: licencia sin comprobar: alcance y permite también ${SIN_COMPROBAR}`);
    } else if (!URL_HTTPS.test(l.fuente_url ?? "")) p.push(`${q}: licencia sin URL de su fuente`);
    else if (l.alcance === SIN_COMPROBAR) p.push(`${q}: licencia comprobada con alcance ${SIN_COMPROBAR}`);
    if (l.spdx !== SIN_COMPROBAR && l.fuente in patrones && !empiezaPorPatron(l.fuente_url, l.fuente)) p.push(`${q}: licencia.fuente_url no sigue el patrón de ${l.fuente} (lectura.patron_de_url)`);

    // Versión, peso y react.
    if (!(SEMVER.test(f.version ?? "") || [SIN_COMPROBAR, NO_APLICA].includes(f.version))) p.push(`${q}: version «${f.version}» no es x.y.z, ${SIN_COMPROBAR} ni ${NO_APLICA}`);
    const d = f.peso?.dependencias;
    if (!((Number.isInteger(d) && d >= 0) || [SIN_COMPROBAR, NO_APLICA].includes(d))) p.push(`${q}: peso.dependencias es un entero, ${SIN_COMPROBAR} o ${NO_APLICA}`);
    // Sin paquete que versionar no hay dependencias que contar, y si no se leyó la versión tampoco se leyeron: la misma clase de valor.
    const clase = (x) => (SEMVER.test(x ?? "") || Number.isInteger(x) ? "dato" : x);
    if (clase(f.version) !== clase(d)) p.push(`${q}: version «${f.version}» y peso.dependencias «${d}» deben ser a la vez un dato, ${SIN_COMPROBAR} o ${NO_APLICA}`);
    if (!valor("declaracion", f.peso?.podable, SIN_COMPROBAR)) p.push(`${q}: peso.podable fuera del vocabulario`);
    if (Object.keys(f.peso ?? {}).length !== 2) p.push(`${q}: peso lleva dependencias y podable`);
    if (!valor("react_estado", f.react?.estado, SIN_COMPROBAR, NO_APLICA)) p.push(`${q}: react.estado fuera del vocabulario`);
    else if (f.react.estado === "declared") {
      if (!versionDeReact(f.react.desde)) p.push(`${q}: react.desde debe ser una versión`);
      if (f.react.hasta !== null && !versionDeReact(f.react.hasta)) p.push(`${q}: react.hasta es una versión o null (sin tope)`);
    } else if (f.react.desde !== null || f.react.hasta !== null) p.push(`${q}: react sin rango declarado lleva desde y hasta null`);
    // Solo lo que exige: la lista vacía es «no exige nada»; «sin comprobar» va solo.
    if (!Array.isArray(f.requisitos) || f.requisitos.some((r) => !valor("requisito", r, SIN_COMPROBAR)) || new Set(f.requisitos).size !== f.requisitos.length) p.push(`${q}: requisitos es una lista, sin repetir, del vocabulario (vacía si no exige nada)`);
    else {
      if (f.requisitos.includes(SIN_COMPROBAR) && f.requisitos.length > 1) p.push(`${q}: requisitos ${SIN_COMPROBAR} va solo`);
      if (f.requisitos.includes("react") && f.react?.estado === NO_APLICA) p.push(`${q}: exige react y su react es ${NO_APLICA}`);
    }

    // Plataforma: los valores de la taxonomía (app, web, both) o sin comprobar, con su fuente.
    const pl = f.plataforma ?? {};
    if (Object.keys(pl).some((c) => !CAMPOS_DE_PLATAFORMA.includes(c)) || CAMPOS_DE_PLATAFORMA.some((c) => !(c in pl))) p.push(`${q}: plataforma debe llevar exactamente ${CAMPOS_DE_PLATAFORMA.join(", ")}`);
    else if (!(pl.vale_en === SIN_COMPROBAR || Object.keys(taxonomia?.plataformas ?? {}).includes(pl.vale_en))) p.push(`${q}: plataforma.vale_en «${pl.vale_en}» no es ${SIN_COMPROBAR} ni una plataforma de ops/diseno/taxonomia.json`);
    else if (pl.vale_en === SIN_COMPROBAR ? pl.fuente_url !== null : !URL_HTTPS.test(pl.fuente_url ?? "")) p.push(pl.vale_en === SIN_COMPROBAR ? `${q}: plataforma sin comprobar no lleva URL (null)` : `${q}: plataforma declarada sin URL de su fuente`);

    // Accesibilidad: lo que declara, con su fuente.
    const a = f.accesibilidad ?? {};
    if (Object.keys(a).some((c) => !CAMPOS_DE_ACCESIBILIDAD.includes(c)) || CAMPOS_DE_ACCESIBILIDAD.some((c) => !(c in a))) p.push(`${q}: accesibilidad debe llevar exactamente ${CAMPOS_DE_ACCESIBILIDAD.join(", ")}`);
    const declarados = ["aria", "teclado", "lectores", "wcag"].filter((c) => a[c] !== SIN_COMPROBAR);
    for (const c of ["aria", "teclado", "lectores", "wcag"]) if (!valor("declaracion", a[c], SIN_COMPROBAR)) p.push(`${q}: accesibilidad.${c} fuera del vocabulario`);
    if (declarados.length && !URL_HTTPS.test(a.fuente_url ?? "")) p.push(`${q}: accesibilidad declarada sin URL de su fuente`);
    if (!declarados.length && a.fuente_url !== null) p.push(`${q}: accesibilidad sin comprobar no lleva URL (null)`);

    // Mantenimiento y retirada.
    // Cada hecho lleva su fuente: la fecha del último push y el estado de mantenimiento se leen aparte (la fecha, de la API; el estado, del README).
    // Una fuente que pide URL propia (doc) no cabe aquí: estos campos no la llevan.
    // El push lo lee la investigación (comprobada) o el refresco (medida, #814): no puede ser posterior a la más reciente de las dos.
    const leida = fechaValida(f.medida) && f.medida > f.comprobada ? f.medida : f.comprobada;
    if (!(f.ultimo_push === SIN_COMPROBAR || (fechaValida(f.ultimo_push) && f.ultimo_push <= leida))) p.push(`${q}: ultimo_push es una fecha no posterior a comprobada ni a medida, o ${SIN_COMPROBAR}`);
    for (const [hecho, fuente, sinLeer] of [["ultimo_push", "ultimo_push_fuente", f.ultimo_push === SIN_COMPROBAR], ["mantenimiento", "mantenimiento_fuente", f.mantenimiento === SIN_COMPROBAR]]) {
      if (sinLeer ? f[fuente] !== null : !(f[fuente] in patrones)) p.push(`${q}: ${fuente} va con ${hecho} (una fuente de lectura.patron_de_url si se comprobó, null si no)`);
    }
    if (f.mantenimiento === SIN_COMPROBAR && f.ultimo_push !== SIN_COMPROBAR) p.push(`${q}: mantenimiento ${SIN_COMPROBAR} con fecha de push`);
    if (MANTENIMIENTO_DE_RETIRADA.includes(f.mantenimiento) && f.vinculo !== "retired") p.push(`${q}: ${f.mantenimiento} no puede ser ${f.vinculo}: solo retired, con motivo y sucesora si la hay`);
    if (f.vinculo === "retired") {
      if (!texto(f.retirada?.motivo, 15)) p.push(`${q}: retirada sin motivo`);
      const s = f.retirada?.sucesora;
      if (s !== null && s !== undefined && (s === f.id || !fichas.some((o) => o.id === s && o.vinculo !== "retired"))) p.push(`${q}: la sucesora «${s}» debe ser otra ficha no retirada, o null`);
      if (!f.retirada || Object.keys(f.retirada).sort().join() !== [...CAMPOS_DE_RETIRADA].sort().join()) p.push(`${q}: retirada lleva ${CAMPOS_DE_RETIRADA.join(", ")}`);
      else if (s) { if (!URL_HTTPS.test(f.retirada.fuente_url ?? "")) p.push(`${q}: sucesora sin URL de su fuente`); }
      else if (f.retirada.fuente_url !== null) p.push(`${q}: retirada con fuente_url sin sucesora (null)`);
    } else if (f.retirada !== null) p.push(`${q}: solo una ficha retired lleva retirada`);

    // Cobertura: elementos de la taxonomía, con su base.
    if (!Array.isArray(f.cubre)) { p.push(`${q}: cubre es una lista`); continue; }
    const vistosEl = new Set();
    for (const c of f.cubre) {
      const qc = `${q}.cubre.${c?.elemento}`;
      if (Object.keys(c ?? {}).some((k) => !CAMPOS_DE_COBERTURA.includes(k)) || CAMPOS_DE_COBERTURA.some((k) => !(k in (c ?? {})))) p.push(`${qc}: debe llevar exactamente ${CAMPOS_DE_COBERTURA.join(", ")}`);
      if (!elementos.has(c?.elemento)) p.push(`${qc}: no es un elemento de ops/diseno/taxonomia.json`);
      if (vistosEl.has(c?.elemento)) p.push(`${qc}: repetido`);
      vistosEl.add(c?.elemento);
      if (!en("base_de_cobertura", c?.base)) p.push(`${qc}: base fuera del vocabulario`);
      if (!en("acceso", c?.acceso)) p.push(`${qc}: acceso fuera del vocabulario`);
      if (c?.base === "checked" && !URL_HTTPS.test(c.fuente_url ?? "")) p.push(`${qc}: cobertura comprobada sin URL de su fuente`);
      if (c?.base === "judgement" && c.fuente_url !== null) p.push(`${qc}: un juicio no lleva fuente (null)`);
      if (c?.acceso === "free" && l.spdx === SIN_COMPROBAR) p.push(`${qc}: acceso free con licencia sin comprobar`);
    }
    if (f.cubre.length === 0 ? !texto(f.motivo_sin_cobertura, 10) : f.motivo_sin_cobertura !== null) p.push(`${q}: motivo_sin_cobertura va si y solo si cubre está vacío`);

    // Alternativas: otras fichas vivas que cubren algo igual (juicio).
    if (!Array.isArray(f.alternativa)) p.push(`${q}: alternativa es una lista`);
    else for (const id of f.alternativa) {
      const o = fichas.find((x) => x.id === id);
      if (!o || id === f.id) p.push(`${q}: alternativa «${id}» no es otra ficha`);
      else {
        if (o.vinculo === "retired") p.push(`${q}: alternativa «${id}» está retirada`);
        if (!o.cubre.some((c) => f.cubre.some((d) => d.elemento === c.elemento))) p.push(`${q}: alternativa «${id}» no comparte ningún elemento`);
      }
    }
    if (!texto(f.dueno) || !(agentes ?? []).includes(f.dueno)) p.push(`${q}: dueño «${f.dueno}» no es un agente de .claude/agents/`);
    if (!fechaValida(f.comprobada) || f.comprobada < (datos?.lectura?.fecha ?? "9")) p.push(`${q}: comprobada falta, no es AAAA-MM-DD o es anterior a la lectura del dossier`);
    // La fecha del refresco (#814): null si el script aún no ha medido la ficha; si no, una fecha no anterior a la lectura.
    if (!(f.medida === null || (fechaValida(f.medida) && f.medida >= (datos?.lectura?.fecha ?? "9")))) p.push(`${q}: medida es null o una fecha AAAA-MM-DD no anterior a la lectura del dossier`);
  }

  // El alcance: cada elemento existe y tiene al menos una candidata con acceso libre, o un motivo escrito.
  const alc = datos?.alcance ?? [];
  const ejemplos = (taxonomia?.elemento ?? []).filter((e) => e.grupo !== "imagery").map((e) => [e.id, e.ejemplos_mobile ?? 0]);
  const puesto = new Map(ejemplos.map(([id, n]) => [id, 1 + ejemplos.filter(([, m]) => m > n).length]));
  if (!Array.isArray(alc) || alc.length === 0) p.push("alcance: no hay ningún elemento");
  const vistosAlc = new Set();
  for (const a of alc) {
    const q = `alcance.${a?.elemento}`;
    if (Object.keys(a ?? {}).some((k) => !CAMPOS_DE_ALCANCE.includes(k)) || CAMPOS_DE_ALCANCE.some((k) => !(k in (a ?? {})))) p.push(`${q}: debe llevar exactamente ${CAMPOS_DE_ALCANCE.join(", ")}`);
    if (!elementos.has(a?.elemento)) p.push(`${q}: no es un elemento de ops/diseno/taxonomia.json`);
    if (vistosAlc.has(a?.elemento)) p.push(`${q}: repetido`);
    vistosAlc.add(a?.elemento);
    if (!en("origen_de_alcance", a?.origen)) p.push(`${q}: origen fuera del vocabulario`);
    if (a?.origen === "mobbin-count" && !(puesto.get(a?.elemento) <= TOP_DE_RECUENTO)) p.push(`${q}: origen mobbin-count y el elemento está fuera del top ${TOP_DE_RECUENTO} del recuento de la taxonomía sin contar las imágenes (puesto ${puesto.get(a?.elemento) ?? "ninguno"}): origen encargo`);
    if (a?.origen === "encargo" && puesto.get(a?.elemento) <= TOP_DE_RECUENTO) p.push(`${q}: origen encargo y el elemento está dentro del top ${TOP_DE_RECUENTO} del recuento (puesto ${puesto.get(a?.elemento)}): origen mobbin-count`);
    const candidatas = candidatasDe(datos, a?.elemento);
    if (candidatas.length === 0 && !texto(a?.motivo_sin_candidata, 10)) p.push(`${q}: sin ninguna candidata con acceso libre y sin motivo escrito`);
    if (candidatas.length > 0 && a?.motivo_sin_candidata !== null) p.push(`${q}: tiene candidata y lleva motivo_sin_candidata (null)`);
  }
  return p;
}

/** Las fichas candidatas que cubren un elemento con acceso libre comprobado (ni de pago ni sin comprobar): lo que de verdad se puede elegir. */
export function candidatasDe(datos, elemento) {
  return (datos?.bibliotecas ?? []).filter((f) => f.vinculo !== "retired" && (f.cubre ?? []).some((c) => c.elemento === elemento && c.acceso === "free"));
}

/**
 * Cifras para el informe: fichas por rol, por vínculo y por mantenimiento; por elemento del alcance, las candidatas y cuántas
 * lo cubren con fuente (`checked`) o por juicio; el stack que exigen; las caducadas (por `comprobada`) y la última
 * fecha del último cambio que aplicó el refresco a alguna ficha (`ultima_medida`, #814; null si nunca). No dice si el refresco
 * está corriendo: una pasada sin cambios no la mueve; eso lo dirán las ejecuciones del workflow semanal.
 */
export function cifrasDeBibliotecas(datos, hoy = new Date(), react = null) {
  const fichas = datos?.bibliotecas ?? [];
  const V = datos?.vocabularios ?? {};
  const cuenta = (clave, valores, ...admitidas) => Object.fromEntries([...Object.keys(valores ?? {}), ...admitidas].map((v) => [v, fichas.filter((f) => f[clave] === v).length]));
  const por_elemento = Object.fromEntries((datos?.alcance ?? []).map((a) => {
    const cs = candidatasDe(datos, a.elemento);
    const tipo = (b) => cs.filter((f) => f.cubre.some((c) => c.elemento === a.elemento && c.base === b)).length;
    return [a.elemento, { candidatas: cs.length, comprobadas: tipo("checked"), juicio: tipo("judgement") }];
  }));
  const por_requisito = Object.fromEntries([...Object.keys(V.requisito ?? {}), SIN_COMPROBAR].map((r) => [r, fichas.filter((f) => f.vinculo !== "retired" && f.requisitos.includes(r)).length]));
  const vivas = fichas.filter((f) => f.vinculo !== "retired");
  return {
    total: fichas.length,
    por_rol: cuenta("rol", V.rol, SIN_COMPROBAR),
    por_vinculo: cuenta("vinculo", V.vinculo),
    por_mantenimiento: cuenta("mantenimiento", V.mantenimiento, SIN_COMPROBAR),
    por_elemento,
    por_requisito,
    neutrales_de_framework: vivas.filter((f) => f.requisitos.length === 0).length,
    react,
    react_compatibles: react ? vivas.filter((f) => cumpleReact(f, react) === true).length : null,
    caducadas: fichas.filter((f) => caducidadDeFicha(f, hoy).estado !== "vigente").length,
    ultima_medida: fichas.map((f) => f.medida).filter(fechaValida).sort().at(-1) ?? null,
  };
}
