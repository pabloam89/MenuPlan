/**
 * La base común de toda forja (#652, docs/ops/BASE-FORJA.md §3 y §7.3, fase F2).
 *
 * Los datos viven en `base` de `ops/forja/` (un fichero por entrada: pasos, redacción, metas y la
 * obligación de fuente). Aquí solo se validan; los lee `scripts/lib/forja.mjs` para el
 * documento generado y los comprueba `ops/base.test.js`.
 *
 * Regla de herencia: cada paso declara de quién hereda y solo puede endurecer. La base
 * fija la voz, el modo, el tiempo y la persona de cada tipo de texto; una forja puede
 * ser más estricta, nunca más laxa (hoy: `forma_practica.estandar` frente al tipo «practica»).
 *
 * Las metas ya existentes (seguridad, datos de familias, coste y velocidad) viven con su
 * texto y su orden en `precedencia.concepts` de `ops/principios/_catalogo.json`: aquí no se copian.
 * Solo las dos nuevas traen su texto, hasta que la fase F3/F6 las pase a precedencia.
 */
import { FUENTE_F, PASOS, esTexto } from "./forja.mjs";
import { MODOS_TIEMPO, PERSONAS, VOCES } from "./forjaForma.mjs";

/** Los tipos de texto que la base redacta (espejo de las claves de `base.redaccion`). */
export const TIPOS_DE_TEXTO = ["norma", "principio", "practica", "skill", "respuesta"];
/** Las personas gramaticales de la base: las de la práctica más la primera (la respuesta a Pablo). */
export const PERSONAS_BASE = [...PERSONAS, "primera"];
/** Las seis metas (espejo de las claves de `base.metas`); las cuatro primeras ya son `concepts` de precedencia. */
export const METAS = ["security", "family-data", "cost", "human-intervention", "agent-ux", "speed"];
export const METAS_NUEVAS = ["human-intervention", "agent-ux"];

/**
 * Errores de la base. `ctx`: `conceptos` (las claves de `precedencia.concepts`), `fuentes` (las claves
 * de `fuentes` de ops/estandares-agentes.json) y `eventos` (EVENTOS de los hooks).
 */
export function problemasDeBase(base, ctx) {
  const malos = [];
  if (!base || typeof base !== "object") return ["falta la sección base de ops/forja/"];

  // Pasos: de arriba abajo, cada uno hereda del anterior y el primero de nada.
  const pasos = base.pasos ?? {};
  if (Object.keys(pasos).join() !== PASOS.join()) malos.push(`base.pasos: tiene que traer ${PASOS.join(", ")} en ese orden y trae ${Object.keys(pasos).join(", ")}`);
  PASOS.forEach((p, i) => {
    if (!pasos[p]) return;
    if (!esTexto(pasos[p].que, 20)) malos.push(`base.pasos.${p}: falta su explicación`);
    const debe = i === 0 ? null : PASOS[i - 1];
    if (pasos[p].hereda !== debe) malos.push(`base.pasos.${p}: hereda de «${pasos[p].hereda}» y tiene que ser ${debe === null ? "null (la base no hereda de nada)" : `«${debe}»`}`);
  });

  // Redacción: un bloque por tipo de texto, con vocabulario cerrado.
  const red = base.redaccion ?? {};
  if (Object.keys(red).join() !== TIPOS_DE_TEXTO.join()) malos.push(`base.redaccion: tiene que traer ${TIPOS_DE_TEXTO.join(", ")} en ese orden y trae ${Object.keys(red).join(", ")}`);
  for (const [t, r] of Object.entries(red)) {
    if (!VOCES.includes(r.voz)) malos.push(`base.redaccion.${t}: voz «${r.voz}» fuera de ${VOCES.join(", ")}`);
    if (!MODOS_TIEMPO.includes(r.modo_tiempo)) malos.push(`base.redaccion.${t}: modo_tiempo «${r.modo_tiempo}» fuera de ${MODOS_TIEMPO.join(", ")}`);
    if (!Array.isArray(r.persona) || !r.persona.length || r.persona.some((p) => !PERSONAS_BASE.includes(p))) malos.push(`base.redaccion.${t}: persona es una lista no vacía de ${PERSONAS_BASE.join(", ")}`);
    if (!esTexto(r.sintaxis, 10)) malos.push(`base.redaccion.${t}: falta su sintaxis`);
  }

  // Fuente de industria: la marca y el mínimo que exige a cada meta.
  const fuente = base.fuente ?? {};
  if (fuente.marca !== "F") malos.push(`base.fuente.marca: «${fuente.marca}» (la fuente de industria es la F de ops/forja/)`);
  if (!Number.isInteger(fuente.minimo) || fuente.minimo < 1) malos.push("base.fuente.minimo: es un entero de 1 o más");
  if (!esTexto(fuente.regla, 20)) malos.push("base.fuente.regla: falta su explicación");

  // Metas: seis, las cuatro de precedencia sin copiar su texto, las nuevas con él, todas con fuente [F].
  const metas = base.metas ?? {};
  if (Object.keys(metas).join() !== METAS.join()) malos.push(`base.metas: tiene que traer ${METAS.join(", ")} en ese orden y trae ${Object.keys(metas).join(", ")}`);
  for (const [m, d] of Object.entries(metas)) {
    const nueva = METAS_NUEVAS.includes(m);
    if (nueva && (!esTexto(d.label, 8) || !esTexto(d.what, 20))) malos.push(`base.metas.${m}: es nueva y trae su label y su what`);
    if (!nueva && ("label" in d || "what" in d)) malos.push(`base.metas.${m}: su texto vive en precedencia.concepts; no se copia`);
    if (nueva && ctx.conceptos.includes(m)) malos.push(`base.metas.${m}: ya está en precedencia.concepts; quita su texto de aquí`);
    if (!nueva && !ctx.conceptos.includes(m)) malos.push(`base.metas.${m}: no está en precedencia.concepts`);
    const fuentes = d.fuentes ?? [];
    let hay = 0;
    for (const f of fuentes) {
      if (FUENTE_F.test(f) || ctx.fuentes.includes(f)) hay += 1;
      else malos.push(`base.metas.${m}: la fuente «${f}» ni es «[F] https://…» ni está en las fuentes de ops/estandares-agentes.json`);
    }
    if (hay < (fuente.minimo ?? 1)) malos.push(`base.metas.${m}: necesita al menos ${fuente.minimo ?? 1} fuente de industria y trae ${hay}`);
    if (d.medida) {
      if (!ctx.eventos.includes(d.medida.evento)) malos.push(`base.metas.${m}: su medida usa el evento «${d.medida.evento}», que no existe en EVENTOS`);
      if (!esTexto(d.medida.campo, 3)) malos.push(`base.metas.${m}: su medida dice qué campo del evento cuenta`);
    }
  }
  const sinTexto = ctx.conceptos.filter((c) => !(c in metas));
  if (sinTexto.length) malos.push(`base.metas: faltan los conceptos de precedencia ${sinTexto.join(", ")}`);
  return malos;
}

/**
 * La herencia solo endurece: lo que la base fija para una práctica, la forja no lo relaja.
 * `propia`: voz, modo_tiempo y persona de la forma de la forja; `heredada`: el bloque de la base.
 */
export function relajaLaBase(propia, heredada) {
  const malos = [];
  if (propia?.voz !== heredada.voz) malos.push(`voz «${propia?.voz}» frente a «${heredada.voz}» de la base`);
  if (propia?.modo_tiempo !== heredada.modo_tiempo) malos.push(`modo_tiempo «${propia?.modo_tiempo}» frente a «${heredada.modo_tiempo}» de la base`);
  if (!heredada.persona.includes(propia?.persona)) malos.push(`persona «${propia?.persona}» fuera de ${heredada.persona.join(", ")} de la base`);
  return malos;
}
