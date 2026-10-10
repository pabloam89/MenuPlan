/**
 * Ciclo de vida de los vocabularios cerrados de proceso (#481, fondo #479).
 *
 * Un valor de un vocabulario no se borra, no se reutiliza con otro significado y no
 * se redefine sin dejar rastro: si deja de usarse, se RETIRA y dice a cuál pasa; si
 * cambia su definición, se REGISTRA la redefinición con su motivo. Si no, los recuentos
 * viejos (etiquetas de issues, fichas de fondo, líneas `campo: valor`) dejan de
 * cuadrar con los nuevos sin que nadie se entere (como las convenciones de
 * OpenTelemetry: se depreca, no se reutiliza).
 *
 * Poner un estado a cada valor dentro de su constante sería invasivo (cambia la
 * forma de GRUPOS, que leen las etiquetas, los formularios y el CI). Por eso hay
 * un registro aparte, `ops/vocabularios-vida.json`:
 *   - `anclados`: { vocabulario: { valor: definición } } tal como está hoy en el código;
 *     lo escribe `npm run glosario -- --vocabularios --escribir` y no se edita a mano;
 *   - `retirados`: [{ vocabulario, valor, pasa_a, desde, motivo? }], que solo crece;
 *   - `redefiniciones`: [{ vocabulario, valor, desde, motivo }] o [{ termino, desde,
 *     motivo }] (un término del glosario), que solo crece;
 *   - `vocabularios_retirados`: [{ vocabulario, desde, motivo }], un vocabulario entero
 *     que deja de vigilarse.
 *
 * Comprobaciones (ops/vocabularios-vida.test.js y ops/glosario.test.js):
 *   1. local: lo anclado coincide con el código (valores y definiciones), y lo que
 *      falta del código está retirado;
 *   2. contra origin/staging: nada anclado o retirado allí desaparece sin quedar
 *      retirado (borrar a la vez del código y del anclaje falla aquí), y cada
 *      definición que cambia respecto a la referencia tiene una redefinición nueva;
 *   3. un valor retirado no vuelve a estar en el código.
 * Sin git o sin la referencia, la 2 se hace contra una copia fijada en el test (solo
 * los valores: las definiciones solo se comparan con una referencia de verdad).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESTADOS } from "./fondos.mjs";
import { ACTORES, ALCANCES_FALLO, DIAGNOSTICAN, ESTADOS_MEDIDA, PASOS } from "./flujo.mjs";
import { leerForja } from "./forja.mjs";
import { CLASES, ESTADOS_TERMINO, plano } from "./glosario.mjs";
import { GRUPOS, TIPOS_ACCION } from "./issues.mjs";

export const RUTA_VOCABULARIOS = "ops/vocabularios-vida.json";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const conTexto = (o) => () => ({ ...o });
/** Los vocabularios vigilados: id → { fichero, textos: () => { valor: definición } }. Los de más uso del proceso. */
export const VOCABULARIOS = {
  ...Object.fromEntries(Object.keys(GRUPOS).map((g) => [`issues.${g}`, { fichero: "scripts/lib/issues.mjs", textos: conTexto(GRUPOS[g].valores) }])),
  "issues.tipo_accion": { fichero: "scripts/lib/issues.mjs", textos: conTexto(TIPOS_ACCION) },
  "flujo.alcance_fallo": { fichero: "scripts/lib/flujo.mjs", textos: conTexto(ALCANCES_FALLO) },
  "flujo.diagnostican": { fichero: "scripts/lib/flujo.mjs", textos: conTexto(DIAGNOSTICAN) },
  "flujo.actores": { fichero: "scripts/lib/flujo.mjs", textos: conTexto(ACTORES) },
  "flujo.estado_medida": { fichero: "scripts/lib/flujo.mjs", textos: conTexto(ESTADOS_MEDIDA) },
  // Los pasos no llevan definición en el código (la tienen en ops/flujo.json): texto vacío.
  "flujo.pasos": { fichero: "scripts/lib/flujo.mjs", textos: () => Object.fromEntries(PASOS.map((p) => [p, ""])) },
  "fondos.estado": { fichero: "scripts/lib/fondos.mjs", textos: conTexto(ESTADOS) },
  "glosario.clase": { fichero: "scripts/lib/glosario.mjs", textos: conTexto(CLASES) },
  // Los tipos de skill: la única lista es tipos_skill de ops/forja.json (#495), que lee forja.mjs; su definición, «que».
  "forja.tipo_skill": { fichero: "scripts/lib/forja.mjs", textos: () => Object.fromEntries(leerForja(RAIZ).tipos_skill.map((x) => [x.id, x.que])) },
  "glosario.estado": { fichero: "scripts/lib/glosario.mjs", textos: conTexto(ESTADOS_TERMINO) },
};

/** Campos de un retiro. `motivo` solo hace falta si no hay a dónde pasar (pasa_a: null). */
export const CAMPOS_RETIRO = ["vocabulario", "valor", "pasa_a", "desde"];
export const CAMPOS_RETIRO_OPCIONALES = ["motivo"];
export const MIN_MOTIVO_RETIRO = 15;
/** Una redefinición: de un valor o de un término, con su motivo. */
export const CAMPOS_REDEFINICION = { valor: ["vocabulario", "valor", "desde", "motivo"], termino: ["termino", "desde", "motivo"] };
export const CAMPOS_VOCABULARIO_RETIRADO = ["vocabulario", "desde", "motivo"];

/** Los valores de hoy, del código, con su definición: { id: { valor: definición } }. */
export function valoresActuales(vocabularios = VOCABULARIOS) {
  return Object.fromEntries(Object.entries(vocabularios).map(([id, v]) => [id, v.textos()]));
}

export function leerRegistro(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_VOCABULARIOS), "utf8"));
}

/** Los valores de un vocabulario anclado o actual: admite la lista (copia fijada) o el objeto con definiciones. */
const valoresDe = (x) => (Array.isArray(x) ? x : Object.keys(x ?? {}));
/** La definición de un valor, o undefined si el anclaje no la guarda (lista). */
const textoDe = (x, v) => (Array.isArray(x) || !x ? undefined : x[v]);
const igual = (a, b) => plano(String(a ?? "")).replace(/\s+/g, " ").trim() === plano(String(b ?? "")).replace(/\s+/g, " ").trim();

/** El registro con lo anclado puesto al día con el código (los registros no se tocan). */
export function anclar(registro, actuales) {
  const anclados = Object.fromEntries(Object.keys(actuales).sort().map((id) => [id, Array.isArray(actuales[id]) ? [...actuales[id]] : { ...actuales[id] }]));
  return { ...registro, anclados };
}

const clave = (v, x) => `${v}: ${x}`;
const retiradosDe = (registro) => new Set((registro.retirados ?? []).map((r) => clave(r.vocabulario, r.valor)));
const vocabulariosRetiradosDe = (registro) => new Set((registro.vocabularios_retirados ?? []).map((r) => r.vocabulario));
const fecha = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x ?? ""));

/** Forma de los retiros, de las redefiniciones y de los vocabularios retirados. */
export function problemasDeRetiros(registro, actuales) {
  const p = [];
  const vistos = new Set();
  const vocRet = vocabulariosRetiradosDe(registro);
  for (const r of registro.retirados ?? []) {
    const id = clave(r.vocabulario, r.valor);
    for (const c of CAMPOS_RETIRO) if (!(c in r)) p.push(`${id}: falta ${c}`);
    for (const c of Object.keys(r)) if (![...CAMPOS_RETIRO, ...CAMPOS_RETIRO_OPCIONALES].includes(c)) p.push(`${id}: campo desconocido ${c}`);
    if (vistos.has(id)) p.push(`${id}: retirado dos veces`);
    vistos.add(id);
    if (!(r.vocabulario in actuales)) { if (!vocRet.has(r.vocabulario)) p.push(`${id}: el vocabulario «${r.vocabulario}» no está en VOCABULARIOS`); continue; }
    if (!fecha(r.desde)) p.push(`${id}: desde no es AAAA-MM-DD`);
    const vivos = valoresDe(actuales[r.vocabulario]);
    if (r.pasa_a === null) {
      if (String(r.motivo ?? "").trim().length < MIN_MOTIVO_RETIRO) p.push(`${id}: sin pasa_a hace falta un motivo de ${MIN_MOTIVO_RETIRO} caracteres o más`);
    } else if (!vivos.includes(r.pasa_a)) p.push(`${id}: pasa_a «${r.pasa_a}», que no es un valor vivo de ${r.vocabulario}`);
    if (vivos.includes(r.valor)) p.push(`${id}: está retirado y vuelve a estar en el código; un valor retirado no se reutiliza con otro significado (usa otro nombre)`);
  }
  for (const r of registro.redefiniciones ?? []) {
    const tipo = "termino" in r ? "termino" : "valor";
    const id = tipo === "termino" ? `término ${r.termino}` : clave(r.vocabulario, r.valor);
    for (const c of CAMPOS_REDEFINICION[tipo]) if (!(c in r)) p.push(`${id}: redefinición sin ${c}`);
    for (const c of Object.keys(r)) if (!CAMPOS_REDEFINICION[tipo].includes(c)) p.push(`${id}: redefinición con campo desconocido ${c}`);
    if (!fecha(r.desde)) p.push(`${id}: redefinición con desde que no es AAAA-MM-DD`);
    if (String(r.motivo ?? "").trim().length < MIN_MOTIVO_RETIRO) p.push(`${id}: el motivo de la redefinición tiene que tener ${MIN_MOTIVO_RETIRO} caracteres o más`);
    if (tipo === "valor" && !valoresDe(actuales[r.vocabulario]).includes(r.valor)) p.push(`${id}: redefinición de un valor que no está vivo`);
  }
  for (const r of registro.vocabularios_retirados ?? []) {
    for (const c of CAMPOS_VOCABULARIO_RETIRADO) if (!(c in r)) p.push(`vocabulario ${r.vocabulario}: retirado sin ${c}`);
    if (!fecha(r.desde)) p.push(`vocabulario ${r.vocabulario}: desde no es AAAA-MM-DD`);
    if (String(r.motivo ?? "").trim().length < MIN_MOTIVO_RETIRO) p.push(`vocabulario ${r.vocabulario}: el motivo tiene que tener ${MIN_MOTIVO_RETIRO} caracteres o más`);
    if (r.vocabulario in actuales) p.push(`vocabulario ${r.vocabulario}: está retirado y sigue en VOCABULARIOS`);
  }
  return p;
}

/** Local: lo anclado frente al código. Lo que falta del código tiene que estar retirado; lo nuevo o redefinido, anclado. */
export function problemasLocales(registro, actuales) {
  const p = [];
  const ret = retiradosDe(registro);
  const vocRet = vocabulariosRetiradosDe(registro);
  const anclados = registro.anclados ?? {};
  for (const [v, anc] of Object.entries(anclados)) {
    if (!(v in actuales)) { p.push(vocRet.has(v) ? `${v}: retirado y aún anclado (lanza «npm run glosario -- --vocabularios --escribir»)` : `${v}: está anclado y ya no está en VOCABULARIOS (retíralo en «vocabularios_retirados»)`); continue; }
    const vivos = valoresDe(actuales[v]);
    for (const x of valoresDe(anc)) {
      if (!vivos.includes(x)) p.push(ret.has(clave(v, x)) ? `${clave(v, x)}: retirado y aún anclado (lanza «npm run glosario -- --vocabularios --escribir»)` : `${clave(v, x)}: ha desaparecido del código sin retirarse (añádelo a «retirados» con su pasa_a)`);
      else if (textoDe(anc, x) !== undefined && textoDe(actuales[v], x) !== undefined && !igual(textoDe(anc, x), textoDe(actuales[v], x))) p.push(`${clave(v, x)}: su definición ha cambiado; si es otro significado, retíralo y usa otro valor; si no, registra la redefinición en «redefiniciones» y re-ancla`);
    }
  }
  for (const [v, act] of Object.entries(actuales)) {
    for (const x of valoresDe(act)) if (!valoresDe(anclados[v]).includes(x)) p.push(`${clave(v, x)}: valor nuevo sin anclar (lanza «npm run glosario -- --vocabularios --escribir»)`);
  }
  return p;
}

/** Cuántas redefiniciones tiene cada clave en un registro. */
const cuentaRedef = (reg) => {
  const m = new Map();
  for (const r of reg?.redefiniciones ?? []) {
    const k = "termino" in r ? `término ${plano(r.termino)}` : clave(r.vocabulario, r.valor);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

/**
 * Contra la referencia: lo anclado o retirado allí sigue vivo o retirado aquí, los
 * registros solo crecen, y una definición distinta de la de la referencia tiene una
 * redefinición nueva. `ref` es el registro de la referencia, o { anclados } de la copia fijada.
 */
export function problemasContraReferencia(registro, actuales, ref) {
  const p = [];
  const ret = retiradosDe(registro);
  const vocRet = vocabulariosRetiradosDe(registro);
  const ahora = cuentaRedef(registro);
  const antes = cuentaRedef(ref);
  for (const [v, anc] of Object.entries(ref.anclados ?? {})) {
    if (vocRet.has(v)) continue;
    const vivos = valoresDe(actuales[v]);
    for (const x of valoresDe(anc)) {
      if (!vivos.includes(x)) { if (!ret.has(clave(v, x))) p.push(`${clave(v, x)}: estaba en la referencia y ha desaparecido sin retirarse`); continue; }
      const t0 = textoDe(anc, x);
      const t1 = textoDe(actuales[v], x);
      if (t0 !== undefined && t1 !== undefined && !igual(t0, t1) && (ahora.get(clave(v, x)) ?? 0) <= (antes.get(clave(v, x)) ?? 0)) p.push(`${clave(v, x)}: su definición ha cambiado respecto a la referencia sin una redefinición registrada (o retíralo si es otro significado)`);
    }
  }
  for (const r of ref.retirados ?? []) if (!ret.has(clave(r.vocabulario, r.valor))) p.push(`${clave(r.vocabulario, r.valor)}: estaba retirado en la referencia y se ha quitado de «retirados» (solo crece)`);
  for (const [k, n] of antes) if ((ahora.get(k) ?? 0) < n) p.push(`${k}: tenía ${n} redefinición(es) en la referencia y ahora menos (solo crece)`);
  for (const r of ref.vocabularios_retirados ?? []) if (!vocRet.has(r.vocabulario)) p.push(`vocabulario ${r.vocabulario}: estaba retirado en la referencia y se ha quitado (solo crece)`);
  return p;
}

/**
 * El glosario contra la referencia: cada término cuya definición cambia lleva una
 * redefinición nueva (respecto a las de la referencia). `glosarioRef` es el glosario de
 * origin/staging; `registroRef`, su ops/vocabularios-vida.json (o null si aún no existe).
 */
export function redefinicionesDelGlosario(glosario, glosarioRef, registro, registroRef) {
  const p = [];
  const ahora = cuentaRedef(registro);
  const antes = cuentaRedef(registroRef);
  const viejos = new Map((glosarioRef.terminos ?? []).map((t) => [plano(t.termino), t.definicion]));
  for (const t of glosario.terminos ?? []) {
    const k = `término ${plano(t.termino)}`;
    if (!viejos.has(plano(t.termino)) || igual(viejos.get(plano(t.termino)), t.definicion)) continue;
    if ((ahora.get(k) ?? 0) <= (antes.get(k) ?? 0)) p.push(`${t.termino}: su definición ha cambiado respecto a la referencia sin una redefinición registrada en ${RUTA_VOCABULARIOS} (o retíralo si es otro significado)`);
  }
  for (const r of registro.redefiniciones ?? []) if ("termino" in r && !(glosario.terminos ?? []).some((t) => t.termino === r.termino)) p.push(`término ${r.termino}: redefinición de un término que no existe`);
  return p;
}
