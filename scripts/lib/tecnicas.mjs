/**
 * tecnicas.mjs — el catálogo de técnicas de diagnóstico (#338, fase C del plan
 * #334). Lógica pura sobre `ops/tecnicas.json`, que es el dato y la única
 * fuente: aquí viven el vocabulario (qué produce cada técnica y los criterios
 * de parada), la elección por tipo de causa y las reglas que vigila
 * `ops/tecnicas.test.js`.
 *
 * Lo usan:
 *   scripts/oficio.mjs                      `npm run tecnica -- <tipo_causa>`
 *   .claude/skills/causa-raiz/SKILL.md      cita el catálogo, no lo copia
 *
 * Las causas son las de `causa:` de issues.mjs (el mismo `tipo_causa` de la
 * ficha del fondo): no se copian, y el test exige que cada una tenga técnica.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { GRUPOS } from "./issues.mjs";

/** Las causas de `causa:` (issues.mjs), sin copiarlas. */
export const CAUSAS = Object.keys(GRUPOS.causa.valores);

/** Qué deja escrito cada técnica (vocabulario cerrado: se puede contar cuál se usó). */
export const PRODUCTOS = {
  cadena_causal: "Una cadena de porqués, cada eslabón con su evidencia",
  tabla_es_no_es: "La tabla ES / NO ES (qué, dónde, cuándo, cuánto) y lo que distingue los dos lados",
  mapa_de_factores: "Los factores posibles por familia, marcados como comprobados o no",
  arbol_de_condiciones: "Las condiciones unidas por Y u O hasta hechos comprobados",
  cronologia: "La línea de tiempo con hora, fuente, actor y factores causales",
  hipotesis_ponderadas: "La matriz hipótesis × evidencia y las que quedan vivas, con cómo confirmarlas",
};

/**
 * Cuándo se deja de preguntar «¿por qué?» (docs/ops/FLUJO.md, «Proporcionalidad»).
 * El diagnóstico dice cuál de las tres le hizo parar.
 */
export const PARADAS = {
  mecanismo_cambiable: "Se llega a algo que se puede cambiar con un mecanismo del catálogo (ops/mecanismos.json)",
  fuera_de_control: "Se llega a algo fuera de nuestro control (un proveedor, una persona de fuera): se pone una barrera de nuestro lado",
  sin_evidencia: "Se acaba la evidencia: lo que queda sale como hipótesis, con la observación que la confirmaría",
};

export const CAMPOS_TECNICA = ["id", "nombre", "cuando", "no_cuando", "produce", "pasos", "paradas", "fuente"];
export const CAMPOS_POR_CAUSA = ["principal", "apoyo", "porque"];

const RUTA = new URL("../../ops/tecnicas.json", import.meta.url);
/** El catálogo tal como está en ops/tecnicas.json. */
export const CATALOGO = JSON.parse(readFileSync(fileURLToPath(RUTA), "utf8"));

/**
 * Lo que está mal en el catálogo. Lista vacía si está bien. Cada problema
 * empieza por el nombre de su regla («causa-sin-tecnica: …»), que es lo que
 * mira el autotest de ops/tecnicas.test.js.
 */
export function problemas(cat) {
  const p = [];
  const tecnicas = Array.isArray(cat?.tecnicas) ? cat.tecnicas : [];
  if (!tecnicas.length) p.push("forma: falta la lista «tecnicas»");
  const ids = new Set();
  for (const t of tecnicas) {
    const id = t?.id ?? "(sin id)";
    if (!/^[a-z]+(_[a-z]+)*$/.test(t?.id ?? "")) p.push(`forma: ${id}: el id va en minúsculas con guiones bajos`);
    if (ids.has(id)) p.push(`forma: ${id} repetido`);
    ids.add(id);
    for (const c of CAMPOS_TECNICA) if (!(c in (t ?? {}))) p.push(`forma: ${id} sin «${c}»`);
    for (const c of Object.keys(t ?? {})) if (!CAMPOS_TECNICA.includes(c)) p.push(`forma: ${id} con un campo desconocido «${c}»`);
    for (const c of ["cuando", "no_cuando"]) if (!(typeof t?.[c] === "string" && t[c].length >= 40)) p.push(`texto: ${id}: «${c}» de 40 caracteres o más`);
    if (!(t?.produce in PRODUCTOS)) p.push(`produce: ${id} produce «${t?.produce}», fuera de ${Object.keys(PRODUCTOS).join(", ")}`);
    if (!Array.isArray(t?.pasos) || t.pasos.length < 3 || t.pasos.some((x) => typeof x !== "string" || x.length < 15)) p.push(`pasos: ${id}: al menos tres pasos con texto`);
    if (!Array.isArray(t?.paradas) || !t.paradas.length || t.paradas.some((x) => !(x in PARADAS))) p.push(`parada: ${id}: «paradas» es una lista de ${Object.keys(PARADAS).join(", ")}`);
    // Toda técnica puede acabar sin evidencia: si no lo admite, empuja a inventar la cadena.
    else if (!t.paradas.includes("sin_evidencia")) p.push(`parada: ${id}: tiene que admitir «sin_evidencia» (lo que no se comprueba sale como hipótesis)`);
    if (!(typeof t?.fuente === "string" && t.fuente.length >= 10)) p.push(`forma: ${id} sin «fuente»`);
  }

  const porCausa = cat?.por_causa ?? {};
  for (const causa of CAUSAS) {
    const e = porCausa[causa];
    if (!e) { p.push(`causa-sin-tecnica: «${causa}» no tiene técnica en por_causa`); continue; }
    for (const c of Object.keys(e)) if (!CAMPOS_POR_CAUSA.includes(c)) p.push(`forma: por_causa.${causa} con un campo desconocido «${c}»`);
    if (!ids.has(e.principal)) p.push(`tecnica-desconocida: por_causa.${causa}.principal «${e.principal}» no es una técnica del catálogo`);
    if (!Array.isArray(e.apoyo)) p.push(`forma: por_causa.${causa}.apoyo es una lista`);
    for (const a of e.apoyo ?? []) {
      if (!ids.has(a)) p.push(`tecnica-desconocida: por_causa.${causa}.apoyo «${a}» no es una técnica del catálogo`);
      if (a === e.principal) p.push(`forma: por_causa.${causa}: «${a}» es principal y apoyo a la vez`);
    }
    if (!(typeof e.porque === "string" && e.porque.length >= 30)) p.push(`texto: por_causa.${causa}: «porque» de 30 caracteres o más`);
  }
  for (const causa of Object.keys(porCausa)) if (!CAUSAS.includes(causa)) p.push(`causa-desconocida: por_causa nombra «${causa}», que no está en causa: de issues.mjs`);

  // Regla de parada de FLUJO.md: una técnica que ninguna causa usa no se mantiene.
  const usadas = new Set(Object.values(porCausa).flatMap((e) => [e?.principal, ...(e?.apoyo ?? [])]));
  for (const id of ids) if (!usadas.has(id)) p.push(`tecnica-sin-uso: ${id} no es principal ni apoyo de ninguna causa`);
  return p;
}

/** La técnica de un id, o null. */
export function tecnica(id, cat = CATALOGO) {
  return cat.tecnicas.find((t) => t.id === id) ?? null;
}

/**
 * Qué técnica usar para un tipo de causa: { causa, principal, apoyo, porque }
 * con las técnicas enteras. Lanza un error con la lista buena si la causa no
 * existe: no se inventa una técnica.
 */
export function tecnicasPara(causa, cat = CATALOGO) {
  if (!CAUSAS.includes(causa)) throw new Error(`«${causa}» no es un tipo de causa. Valen: ${CAUSAS.join(", ")}`);
  const e = cat.por_causa[causa];
  return { causa, principal: tecnica(e.principal, cat), apoyo: e.apoyo.map((a) => tecnica(a, cat)), porque: e.porque };
}

/** El texto que imprime `npm run tecnica -- <causa>`. */
export function textoTecnicas(r) {
  const out = [`Tipo de causa: ${r.causa}`, `Por qué esta técnica: ${r.porque}`, ""];
  const una = (t, rol) => [
    `${rol}: ${t.nombre} (${t.id}) → produce ${t.produce}`,
    `  Cuándo: ${t.cuando}`,
    `  No cuando: ${t.no_cuando}`,
    ...t.pasos.map((x, i) => `  ${i + 1}. ${x}`),
    `  Para cuando: ${t.paradas.join(", ")}`,
    "",
  ];
  out.push(...una(r.principal, "Principal"));
  for (const a of r.apoyo) out.push(...una(a, "Apoyo"));
  out.push("Criterios de parada:", ...Object.entries(PARADAS).map(([k, v]) => `  ${k}: ${v}`));
  return out.join("\n");
}
