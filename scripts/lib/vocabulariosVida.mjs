/**
 * Ciclo de vida de los vocabularios cerrados de proceso (#481, fondo #479).
 *
 * Un valor de un vocabulario no se borra ni se reutiliza con otro significado:
 * si deja de usarse, se RETIRA y dice a cuál pasa. Si no, los recuentos viejos
 * (etiquetas de issues, fichas de fondo, líneas `campo: valor`) dejan de
 * cuadrar con los nuevos sin que nadie se entere (como las convenciones de
 * OpenTelemetry: se depreca, no se reutiliza).
 *
 * Poner un estado a cada valor dentro de su constante sería invasivo (cambia la
 * forma de GRUPOS, que leen las etiquetas, los formularios y el CI). Por eso hay
 * un registro aparte, `ops/vocabularios-vida.json`:
 *   - `anclados`: los valores de cada vocabulario tal como están hoy; lo escribe
 *     `npm run glosario -- --vocabularios --escribir` y no se edita a mano;
 *   - `retirados`: [{ vocabulario, valor, pasa_a, desde, motivo? }], que solo crece.
 *
 * Tres comprobaciones (ops/vocabularios-vida.test.js):
 *   1. local: lo anclado coincide con el código, y lo que falta del código está
 *      retirado (quitar un valor del código sin retirarlo falla aquí);
 *   2. contra origin/staging: nada anclado o retirado allí desaparece sin quedar
 *      retirado (borrar a la vez del código y del anclaje falla aquí);
 *   3. un valor retirado no vuelve a estar en el código (reutilizarlo con otro
 *      significado falla aquí).
 * Sin git o sin la referencia, la 2 se hace contra una copia fijada en el test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ESTADOS } from "./fondos.mjs";
import { ACTORES, ALCANCES_FALLO, DIAGNOSTICAN, ESTADOS_MEDIDA, ESTADOS_TIPO_SKILL, PASOS } from "./flujo.mjs";
import { CLASES, ESTADOS_TERMINO } from "./glosario.mjs";
import { GRUPOS, TIPOS_ACCION } from "./issues.mjs";

export const RUTA_VOCABULARIOS = "ops/vocabularios-vida.json";

/** Los vocabularios vigilados: id → { fichero, valores }. Los de más uso del proceso. */
export const VOCABULARIOS = {
  ...Object.fromEntries(Object.keys(GRUPOS).map((g) => [`issues.${g}`, { fichero: "scripts/lib/issues.mjs", valores: () => Object.keys(GRUPOS[g].valores) }])),
  "issues.tipo_accion": { fichero: "scripts/lib/issues.mjs", valores: () => Object.keys(TIPOS_ACCION) },
  "flujo.alcance_fallo": { fichero: "scripts/lib/flujo.mjs", valores: () => Object.keys(ALCANCES_FALLO) },
  "flujo.diagnostican": { fichero: "scripts/lib/flujo.mjs", valores: () => Object.keys(DIAGNOSTICAN) },
  "flujo.actores": { fichero: "scripts/lib/flujo.mjs", valores: () => Object.keys(ACTORES) },
  "flujo.estado_medida": { fichero: "scripts/lib/flujo.mjs", valores: () => Object.keys(ESTADOS_MEDIDA) },
  "flujo.estado_tipo_skill": { fichero: "scripts/lib/flujo.mjs", valores: () => Object.keys(ESTADOS_TIPO_SKILL) },
  "flujo.pasos": { fichero: "scripts/lib/flujo.mjs", valores: () => [...PASOS] },
  "fondos.estado": { fichero: "scripts/lib/fondos.mjs", valores: () => Object.keys(ESTADOS) },
  "glosario.clase": { fichero: "scripts/lib/glosario.mjs", valores: () => Object.keys(CLASES) },
  "glosario.estado": { fichero: "scripts/lib/glosario.mjs", valores: () => Object.keys(ESTADOS_TERMINO) },
};

/** Campos de un retiro. `motivo` solo hace falta si no hay a dónde pasar (pasa_a: null). */
export const CAMPOS_RETIRO = ["vocabulario", "valor", "pasa_a", "desde"];
export const CAMPOS_RETIRO_OPCIONALES = ["motivo"];
export const MIN_MOTIVO_RETIRO = 15;

/** Los valores de hoy, del código: { id: [valores] }. */
export function valoresActuales(vocabularios = VOCABULARIOS) {
  return Object.fromEntries(Object.entries(vocabularios).map(([id, v]) => [id, v.valores()]));
}

export function leerRegistro(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_VOCABULARIOS), "utf8"));
}

/** El registro con lo anclado puesto al día con el código (los retirados no se tocan). */
export function anclar(registro, actuales) {
  const anclados = Object.fromEntries(Object.keys(actuales).sort().map((id) => [id, [...actuales[id]]]));
  return { ...registro, anclados };
}

const clave = (v, x) => `${v}: ${x}`;
const retiradosDe = (registro) => new Set((registro.retirados ?? []).map((r) => clave(r.vocabulario, r.valor)));

/** Forma de los retiros. */
export function problemasDeRetiros(registro, actuales) {
  const p = [];
  const vistos = new Set();
  for (const r of registro.retirados ?? []) {
    const id = clave(r.vocabulario, r.valor);
    for (const c of CAMPOS_RETIRO) if (!(c in r)) p.push(`${id}: falta ${c}`);
    for (const c of Object.keys(r)) if (![...CAMPOS_RETIRO, ...CAMPOS_RETIRO_OPCIONALES].includes(c)) p.push(`${id}: campo desconocido ${c}`);
    if (vistos.has(id)) p.push(`${id}: retirado dos veces`);
    vistos.add(id);
    if (!(r.vocabulario in actuales)) { p.push(`${id}: el vocabulario «${r.vocabulario}» no está en VOCABULARIOS`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.desde ?? ""))) p.push(`${id}: desde no es AAAA-MM-DD`);
    if (r.pasa_a === null) {
      if (String(r.motivo ?? "").trim().length < MIN_MOTIVO_RETIRO) p.push(`${id}: sin pasa_a hace falta un motivo de ${MIN_MOTIVO_RETIRO} caracteres o más`);
    } else if (!actuales[r.vocabulario].includes(r.pasa_a)) p.push(`${id}: pasa_a «${r.pasa_a}», que no es un valor vivo de ${r.vocabulario}`);
    if (actuales[r.vocabulario].includes(r.valor)) p.push(`${id}: está retirado y vuelve a estar en el código; un valor retirado no se reutiliza con otro significado (usa otro nombre)`);
  }
  return p;
}

/** Local: lo anclado frente al código. Lo que falta del código tiene que estar retirado; lo nuevo, anclado. */
export function problemasLocales(registro, actuales) {
  const p = [];
  const ret = retiradosDe(registro);
  const anclados = registro.anclados ?? {};
  for (const [v, valores] of Object.entries(anclados)) {
    if (!(v in actuales)) { p.push(`${v}: está anclado y ya no está en VOCABULARIOS`); continue; }
    for (const x of valores) if (!actuales[v].includes(x) && !ret.has(clave(v, x))) p.push(`${clave(v, x)}: ha desaparecido del código sin retirarse (añádelo a «retirados» con su pasa_a)`);
  }
  for (const [v, valores] of Object.entries(actuales)) {
    for (const x of valores) if (!(anclados[v] ?? []).includes(x)) p.push(`${clave(v, x)}: valor nuevo sin anclar (lanza «npm run glosario -- --vocabularios --escribir»)`);
  }
  for (const [v, valores] of Object.entries(anclados)) for (const x of valores) if (v in actuales && !actuales[v].includes(x) && ret.has(clave(v, x))) p.push(`${clave(v, x)}: retirado y aún anclado (lanza «npm run glosario -- --vocabularios --escribir»)`);
  return p;
}

/**
 * Contra la referencia: lo anclado o retirado allí sigue vivo o retirado aquí.
 * `ref` es el registro de la referencia, o { anclados } de la copia fijada.
 */
export function problemasContraReferencia(registro, actuales, ref) {
  const p = [];
  const ret = retiradosDe(registro);
  for (const [v, valores] of Object.entries(ref.anclados ?? {})) {
    for (const x of valores) if (!(actuales[v] ?? []).includes(x) && !ret.has(clave(v, x))) p.push(`${clave(v, x)}: estaba en la referencia y ha desaparecido sin retirarse`);
  }
  for (const r of ref.retirados ?? []) if (!ret.has(clave(r.vocabulario, r.valor))) p.push(`${clave(r.vocabulario, r.valor)}: estaba retirado en la referencia y se ha quitado de «retirados» (solo crece)`);
  return p;
}
