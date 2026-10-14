/**
 * El pool de bibliotecas de interfaz (#780, línea 2 de #774): una ficha por biblioteca de terceros en
 * `ops/diseno/bibliotecas.json`, con los campos del bloque Q de `docs/diseno/META-DISENO.md` y lo que añade la línea
 * (requisitos de stack, accesibilidad declarada y qué elementos de `ops/diseno/taxonomia.json` cubre). Solo datos: no
 * instala nada. El detalle de cada campo y de cada vocabulario cerrado está en el `_` y en `vocabularios` del propio JSON.
 *
 * Todo vocabulario cerrado vive una vez, con su definición, en el JSON; las reglas de abajo son las que el test comprueba
 * sin lista de excepciones. La caducidad de `comprobada` (90 días, como las skills) se calcula (`caducidadDeFicha`) y se
 * cuenta en las cifras, pero no falla el test: el reloj no pone en rojo todos los PR (mismo criterio que las skills).
 *
 * Lo leen `ops/diseno/pool.test.js`, `scripts/diseno/bibliotecas.mjs` (las cifras) y `scripts/lib/vocabulariosVida.mjs`
 * (el ciclo de vida de cada vocabulario). Puro: sin red.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAZO_COMPROBADO_DIAS } from "./skills.mjs";

export const RUTA_BIBLIOTECAS = "ops/diseno/bibliotecas.json";
export const CAMPOS_DE_FICHA = [
  "id", "nombre", "rol", "vinculo", "mantenimiento", "ultimo_push", "estado_fuente", "licencia", "version", "peso", "importacion",
  "react", "requisitos", "movil", "accesibilidad", "cubre", "motivo_sin_cobertura", "alternativa", "retirada", "dueno", "comprobada",
];
export const CAMPOS_DE_LICENCIA = ["spdx", "alcance", "permite", "fuente", "fuente_url"];
export const CAMPOS_DE_ACCESIBILIDAD = ["aria", "teclado", "lectores", "wcag", "fuente_url"];
export const CAMPOS_DE_COBERTURA = ["elemento", "base", "acceso", "fuente_url"];
export const CAMPOS_DE_ALCANCE = ["elemento", "origen", "motivo_sin_candidata"];
/** Mantenimiento que una candidata no puede tener: pasa a `retired`. */
export const MANTENIMIENTO_DE_RETIRADA = ["unmaintained", "archived"];
export const VERSIONES_SIN_NUMERO = ["cli", "unread"];
const FORMA_ID = /^[a-z]+(-[a-z]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const VERSION_REACT = /^\d+(\.\d+)?$/;
const URL_HTTPS = /^https:\/\/[^\s]+$/;
const DIA_MS = 86_400_000;
const texto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;
const fechaValida = (v) => FECHA.test(v ?? "") && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const leerBibliotecas = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_BIBLIOTECAS), "utf8"));

/** Los vocabularios cerrados del fichero con su texto, para ops/vocabularios-vida.json: `diseno.biblioteca_<clave>`. */
export const textosDeBibliotecas = (datos, clave) => ({ ...(datos?.vocabularios?.[clave] ?? {}) });
export const CLAVES_DE_VOCABULARIO = [
  "rol", "vinculo", "mantenimiento", "fuente_de_dato", "licencia_alcance", "declaracion", "importacion", "react_estado", "requisito",
  "base_de_cobertura", "acceso", "origen_de_alcance",
];

/** Días desde `comprobada` hasta `hoy` y su estado, con el plazo de las skills (`vigente`, `caducada`). */
export function caducidadDeFicha(ficha, hoy = new Date()) {
  if (!fechaValida(ficha?.comprobada)) return { dias: null, estado: "sin_fecha" };
  const dias = Math.floor((hoy.getTime() - Date.parse(`${ficha.comprobada}T00:00:00Z`)) / DIA_MS);
  return { dias, estado: dias > PLAZO_COMPROBADO_DIAS ? "caducada" : "vigente" };
}

const versionDeReact = (v) => (VERSION_REACT.test(v ?? "") ? v.split(".").map(Number) : null);
const menorOIgual = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] ?? 0) <= (b[1] ?? 0));

/** ¿Declara la ficha un rango de React que incluye la versión base? null si no declara rango. */
export function cumpleReact(ficha, baseReact) {
  const r = ficha?.react;
  if (r?.estado !== "declared") return null;
  const base = versionDeReact(baseReact);
  const desde = versionDeReact(r.desde);
  const hasta = r.hasta === null ? null : versionDeReact(r.hasta);
  if (!base || !desde) return null;
  return menorOIgual(desde, base) && (hasta === null || base[0] <= hasta[0]);
}

/**
 * Los problemas del pool contra la taxonomía de diseño y los agentes (lista de textos; vacía si está bien).
 * `taxonomia`: ops/diseno/taxonomia.json; `agentes`: los nombres de .claude/agents/*.md.
 */
export function problemasDeBibliotecas(datos, taxonomia, agentes) {
  const p = [];
  const V = datos?.vocabularios ?? {};
  for (const k of CLAVES_DE_VOCABULARIO) {
    const v = V[k];
    if (!v || typeof v !== "object" || Object.keys(v).length === 0) { p.push(`vocabularios.${k}: no hay ninguno`); continue; }
    for (const [id, que] of Object.entries(v)) {
      if (!FORMA_ID.test(id) && !/^(GH|NPM|DOC)$/.test(id)) p.push(`vocabularios.${k}.${id}: el id no es kebab en inglés`);
      if (!texto(que, 5)) p.push(`vocabularios.${k}.${id}: sin definición`);
    }
  }
  const en = (k, x) => Object.keys(V[k] ?? {}).includes(x);
  const elementos = new Set((taxonomia?.elemento ?? []).map((e) => e.id));
  if (!fechaValida(datos?.lectura?.fecha)) p.push("lectura.fecha: falta o no es AAAA-MM-DD");
  if (!URL_HTTPS.test(datos?.lectura?.dossier ?? "")) p.push("lectura.dossier: falta la URL del dossier");
  for (const k of Object.keys(V.fuente_de_dato ?? {})) if (!texto(datos?.lectura?.fuentes?.[k], 5)) p.push(`lectura.fuentes.${k}: sin descripción`);
  if (!versionDeReact(datos?.base_react)) p.push("base_react: falta o no es versión (19.2)");
  if (JSON.stringify(datos?.decide_el_proyecto) !== JSON.stringify(["envoltorio", "reglas de uso"])) p.push("decide_el_proyecto: deben ser envoltorio y reglas de uso");

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
    for (const c of ["rol", "vinculo", "mantenimiento", "importacion"]) if (!en(c, f[c])) p.push(`${q}: ${c} «${f[c]}» fuera del vocabulario`);

    // Licencia con su prueba: una URL, salvo que la licencia misma esté sin comprobar.
    const l = f.licencia ?? {};
    if (Object.keys(l).some((c) => !CAMPOS_DE_LICENCIA.includes(c)) || CAMPOS_DE_LICENCIA.some((c) => !(c in l))) p.push(`${q}: licencia debe llevar exactamente ${CAMPOS_DE_LICENCIA.join(", ")}`);
    if (!texto(l.spdx)) p.push(`${q}: licencia.spdx vacío (unverified si no se leyó)`);
    if (!en("licencia_alcance", l.alcance)) p.push(`${q}: licencia.alcance «${l.alcance}» fuera del vocabulario`);
    if (!en("fuente_de_dato", l.fuente)) p.push(`${q}: licencia.fuente «${l.fuente}» fuera del vocabulario`);
    for (const c of ["comercial", "redistribuir"]) if (!en("declaracion", l.permite?.[c])) p.push(`${q}: licencia.permite.${c} fuera del vocabulario`);
    if (l.spdx === "unverified") {
      if (l.fuente_url !== null) p.push(`${q}: licencia sin comprobar no lleva URL (null)`);
      if (l.alcance !== "unverified" || l.permite?.comercial !== "unverified" || l.permite?.redistribuir !== "unverified") p.push(`${q}: licencia sin comprobar: alcance y permite también unverified`);
    } else if (!URL_HTTPS.test(l.fuente_url ?? "")) p.push(`${q}: licencia sin URL de su fuente`);
    else if (l.alcance === "unverified") p.push(`${q}: licencia comprobada con alcance unverified`);

    // Versión, peso y react.
    if (!(SEMVER.test(f.version ?? "") || VERSIONES_SIN_NUMERO.includes(f.version))) p.push(`${q}: version «${f.version}» no es x.y.z ni ${VERSIONES_SIN_NUMERO.join("/")}`);
    const d = f.peso?.dependencias;
    if (!(d === null || (Number.isInteger(d) && d >= 0))) p.push(`${q}: peso.dependencias es un entero o null`);
    if (!en("declaracion", f.peso?.podable)) p.push(`${q}: peso.podable fuera del vocabulario`);
    if (Object.keys(f.peso ?? {}).length !== 2) p.push(`${q}: peso lleva dependencias y podable`);
    if (!en("react_estado", f.react?.estado)) p.push(`${q}: react.estado fuera del vocabulario`);
    else if (f.react.estado === "declared") {
      if (!versionDeReact(f.react.desde)) p.push(`${q}: react.desde debe ser una versión`);
      if (f.react.hasta !== null && !versionDeReact(f.react.hasta)) p.push(`${q}: react.hasta es una versión o null (sin tope)`);
    } else if (f.react.desde !== null || f.react.hasta !== null) p.push(`${q}: react sin rango declarado lleva desde y hasta null`);
    if (!Array.isArray(f.requisitos) || f.requisitos.length === 0 || f.requisitos.some((r) => !en("requisito", r)) || new Set(f.requisitos).size !== f.requisitos.length) p.push(`${q}: requisitos es una lista no vacía, sin repetir, del vocabulario`);
    else {
      if (f.requisitos.includes("unverified") && f.requisitos.length > 1) p.push(`${q}: requisitos unverified va solo`);
      if (f.requisitos.includes("react") && f.react?.estado === "not-applicable") p.push(`${q}: exige react y su react es not-applicable`);
    }
    if (!en("declaracion", f.movil)) p.push(`${q}: movil fuera del vocabulario`);

    // Accesibilidad: lo que declara, con su fuente.
    const a = f.accesibilidad ?? {};
    if (Object.keys(a).some((c) => !CAMPOS_DE_ACCESIBILIDAD.includes(c)) || CAMPOS_DE_ACCESIBILIDAD.some((c) => !(c in a))) p.push(`${q}: accesibilidad debe llevar exactamente ${CAMPOS_DE_ACCESIBILIDAD.join(", ")}`);
    const declarados = ["aria", "teclado", "lectores", "wcag"].filter((c) => a[c] !== "unverified");
    for (const c of ["aria", "teclado", "lectores", "wcag"]) if (!en("declaracion", a[c])) p.push(`${q}: accesibilidad.${c} fuera del vocabulario`);
    if (declarados.length && !URL_HTTPS.test(a.fuente_url ?? "")) p.push(`${q}: accesibilidad declarada sin URL de su fuente`);
    if (!declarados.length && a.fuente_url !== null) p.push(`${q}: accesibilidad sin comprobar no lleva URL (null)`);

    // Mantenimiento y retirada.
    if (!(f.ultimo_push === null || (fechaValida(f.ultimo_push) && f.ultimo_push <= f.comprobada))) p.push(`${q}: ultimo_push es una fecha no posterior a comprobada, o null`);
    if (f.ultimo_push === null ? f.estado_fuente !== null : !en("fuente_de_dato", f.estado_fuente)) p.push(`${q}: estado_fuente va con ultimo_push (fuente si hay fecha, null si no)`);
    if (f.mantenimiento === "unverified" && f.ultimo_push !== null) p.push(`${q}: mantenimiento unverified con fecha de push`);
    if (MANTENIMIENTO_DE_RETIRADA.includes(f.mantenimiento) && f.vinculo !== "retired") p.push(`${q}: ${f.mantenimiento} no puede ser ${f.vinculo}: solo retired, con motivo y sucesora si la hay`);
    if (f.vinculo === "retired") {
      if (!texto(f.retirada?.motivo, 15)) p.push(`${q}: retirada sin motivo`);
      const s = f.retirada?.sucesora;
      if (s !== null && s !== undefined && (s === f.id || !fichas.some((o) => o.id === s && o.vinculo !== "retired"))) p.push(`${q}: la sucesora «${s}» debe ser otra ficha no retirada, o null`);
      if (!f.retirada || Object.keys(f.retirada).sort().join() !== "motivo,sucesora") p.push(`${q}: retirada lleva motivo y sucesora`);
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
  }

  // El alcance: cada elemento existe y tiene al menos una candidata con acceso libre, o un motivo escrito.
  const alc = datos?.alcance ?? [];
  if (!Array.isArray(alc) || alc.length === 0) p.push("alcance: no hay ningún elemento");
  const vistosAlc = new Set();
  for (const a of alc) {
    const q = `alcance.${a?.elemento}`;
    if (Object.keys(a ?? {}).some((k) => !CAMPOS_DE_ALCANCE.includes(k)) || CAMPOS_DE_ALCANCE.some((k) => !(k in (a ?? {})))) p.push(`${q}: debe llevar exactamente ${CAMPOS_DE_ALCANCE.join(", ")}`);
    if (!elementos.has(a?.elemento)) p.push(`${q}: no es un elemento de ops/diseno/taxonomia.json`);
    if (vistosAlc.has(a?.elemento)) p.push(`${q}: repetido`);
    vistosAlc.add(a?.elemento);
    if (!en("origen_de_alcance", a?.origen)) p.push(`${q}: origen fuera del vocabulario`);
    const candidatas = candidatasDe(datos, a?.elemento);
    if (candidatas.length === 0 && !texto(a?.motivo_sin_candidata, 10)) p.push(`${q}: sin ninguna candidata con acceso libre y sin motivo escrito`);
    if (candidatas.length > 0 && a?.motivo_sin_candidata !== null) p.push(`${q}: tiene candidata y lleva motivo_sin_candidata (null)`);
  }
  return p;
}

/** Las fichas candidatas (o en uso) que cubren un elemento sin pago: lo que de verdad se puede elegir. */
export function candidatasDe(datos, elemento) {
  return (datos?.bibliotecas ?? []).filter((f) => f.vinculo !== "retired" && (f.cubre ?? []).some((c) => c.elemento === elemento && c.acceso !== "paid"));
}

/**
 * Cifras para el informe: fichas por rol, por vínculo y por mantenimiento; por elemento del alcance, las candidatas y cuántas
 * lo cubren con fuente (`checked`) o por juicio; el stack que exigen; y las caducadas.
 */
export function cifrasDeBibliotecas(datos, hoy = new Date()) {
  const fichas = datos?.bibliotecas ?? [];
  const cuenta = (clave, valores) => Object.fromEntries(Object.keys(valores ?? {}).map((v) => [v, fichas.filter((f) => f[clave] === v).length]));
  const V = datos?.vocabularios ?? {};
  const por_elemento = Object.fromEntries((datos?.alcance ?? []).map((a) => {
    const cs = candidatasDe(datos, a.elemento);
    const tipo = (b) => cs.filter((f) => f.cubre.some((c) => c.elemento === a.elemento && c.base === b)).length;
    return [a.elemento, { candidatas: cs.length, comprobadas: tipo("checked"), juicio: tipo("judgement") }];
  }));
  const por_requisito = Object.fromEntries(Object.keys(V.requisito ?? {}).map((r) => [r, fichas.filter((f) => f.vinculo !== "retired" && f.requisitos.includes(r)).length]));
  const vivas = fichas.filter((f) => f.vinculo !== "retired");
  return {
    total: fichas.length,
    por_rol: cuenta("rol", V.rol),
    por_vinculo: cuenta("vinculo", V.vinculo),
    por_mantenimiento: cuenta("mantenimiento", V.mantenimiento),
    por_elemento,
    por_requisito,
    neutrales_de_framework: vivas.filter((f) => f.requisitos.every((r) => ["web-components", "css"].includes(r))).length,
    react_compatibles: vivas.filter((f) => cumpleReact(f, datos?.base_react) === true).length,
    caducadas: fichas.filter((f) => caducidadDeFicha(f, hoy).estado !== "vigente").length,
  };
}
