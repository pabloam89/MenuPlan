/**
 * Los dominios del glosario (F1 de #652, docs/ops/BASE-FORJA.md §9.2): dos pisos, no tres. El piso 1 es
 * la base (qué es un término, la forma «un X que Y», estado y retirada); el piso 2, cada dominio, que
 * **solo añade o estrecha, nunca redefine** uno de la base. Un proyecto (HoMenu, el panel) sería un valor
 * más de `dominio`.
 *
 * El invariante, con los códigos de la skill `higiene-de-vocabulario`:
 *  - `dominio-redefine-base` (formal): un término de dominio no lleva el nombre de uno de la base ni el
 *    de un sinónimo prohibido suyo, no prohíbe el nombre de un término de la base ni repite uno de sus
 *    sinónimos, y la base no cuelga de un dominio (su `amplio` es de la base). Sí puede estrechar con
 *    `amplio` hacia la base.
 *  - `definicion-choca-con-base` (material): una definición de dominio casi igual a la de un término de la
 *    base (mismas palabras de contenido) con otro nombre es una segunda definición del mismo concepto.
 *  - `equivoco-entre-dominios` (material): el mismo nombre en dos dominios con definiciones distintas.
 *
 * Se aplica al glosario de hoy (un solo catálogo con el campo `dominio`) y valdrá igual para el glosario de
 * otro proyecto con su repo: `problemasDeDominios(base, dominio)` recibe dos listas de términos.
 */
import { plano, prohibidosDe } from "./glosario.mjs";

/** Parecido máximo entre dos definiciones antes de decir que chocan (Jaccard de palabras de más de 3 letras). */
export const MAX_PARECIDO = 0.7;

const palabras = (s) => new Set(plano(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
/** Parecido de dos textos: palabras de contenido en común sobre las que suman entre las dos. */
export function parecido(a, b) {
  const A = palabras(a);
  const B = palabras(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes += 1;
  return comunes / (A.size + B.size - comunes);
}

/** Un texto de problema con su código delante: `código: términos…`. */
const con = (codigo, texto) => `${codigo}: ${texto}`;
const limpia = (s) => plano(s).replace(/\s+/g, " ").trim();

/** Los problemas de un glosario de dominio frente a la base (listas de términos). */
export function problemasDeDominios(base, dominio) {
  const out = [];
  const nombresBase = new Map(base.map((t) => [plano(t.termino), t]));
  const prohibidosBase = new Map();
  for (const t of base) for (const s of prohibidosDe(t)) prohibidosBase.set(plano(s), t.termino);
  for (const t of dominio) {
    const n = plano(t.termino);
    if (nombresBase.has(n)) out.push(con("dominio-redefine-base", `${t.termino} (${t.dominio ?? "dominio"}) lleva el nombre de un término de la base`));
    else if (prohibidosBase.has(n)) out.push(con("dominio-redefine-base", `${t.termino} (${t.dominio ?? "dominio"}) lleva un nombre que la base prohíbe (di «${prohibidosBase.get(n)}»)`));
    for (const s of t.sinonimos_prohibidos ?? []) {
      const ps = plano(s);
      if (nombresBase.has(ps)) out.push(con("dominio-redefine-base", `${t.termino} prohíbe «${s}», que es un término de la base`));
      else if (prohibidosBase.has(ps)) out.push(con("dominio-redefine-base", `${t.termino} prohíbe «${s}», que ya es sinónimo prohibido de ${prohibidosBase.get(ps)} en la base`));
    }
    if (t.estado === "retirado") continue;
    for (const b of base) {
      if (b.estado === "retirado" || plano(t.termino) === plano(b.termino)) continue;
      const q = parecido(t.definicion, b.definicion);
      if (q >= MAX_PARECIDO) out.push(con("definicion-choca-con-base", `${t.termino} y ${b.termino} se definen casi igual (parecido ${q.toFixed(2)})`));
    }
  }
  const nombresDominio = new Set(dominio.map((t) => plano(t.termino)));
  for (const b of base) {
    if (typeof b.amplio === "string" && nombresDominio.has(plano(b.amplio)) && !nombresBase.has(plano(b.amplio))) {
      out.push(con("dominio-redefine-base", `${b.termino} (base) tiene por amplio a ${b.amplio}, de un dominio: la base no cuelga de un dominio`));
    }
  }
  return out;
}

/** El mismo nombre en dos dominios con definiciones distintas: { dominio: [términos] }. */
export function equivocosEntreDominios(porDominio) {
  const out = [];
  const visto = new Map();
  for (const [d, ts] of Object.entries(porDominio)) {
    for (const t of ts) {
      const n = plano(t.termino);
      const antes = visto.get(n);
      if (antes && antes.dominio !== d && limpia(antes.definicion) !== limpia(t.definicion)) {
        out.push(con("equivoco-entre-dominios", `${t.termino} está en ${antes.dominio} y en ${d} con definiciones distintas`));
      }
      if (!antes) visto.set(n, { dominio: d, definicion: t.definicion });
    }
  }
  return out;
}

/** El glosario de hoy, partido por su campo `dominio`: { base: [...], <dominio>: [...] }. */
export function porDominio(glosario) {
  const r = {};
  for (const t of glosario.terminos) (r[t.dominio] ??= []).push(t);
  return r;
}

/** Todo junto sobre el glosario de hoy: cada dominio que no es la base frente a la base. */
export function problemasDeDominiosDelGlosario(glosario) {
  const por = porDominio(glosario);
  const base = por.base ?? [];
  const resto = Object.entries(por).filter(([d]) => d !== "base");
  return [...resto.flatMap(([, ts]) => problemasDeDominios(base, ts)), ...equivocosEntreDominios(por)];
}

/** Cifras: términos activos por dominio. */
export function cifrasDeDominios(glosario) {
  const r = {};
  for (const t of glosario.terminos) if (t.estado !== "retirado") r[t.dominio] = (r[t.dominio] ?? 0) + 1;
  return r;
}
