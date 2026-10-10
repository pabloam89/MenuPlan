/**
 * mecanismos.mjs — el catálogo de mecanismos (#338, fase C del plan #334):
 * con qué se hace cumplir una norma o el arreglo de un fondo. Lógica pura sobre
 * `ops/mecanismos.json`, que es el dato.
 *
 * Dos vocabularios que ya existían, sin copiarlos:
 *   - el escalón, de la escalera de durabilidad de `ops/flujo.json` (la misma
 *     `barrera` de la ficha del fondo);
 *   - el ejecutor, del registro de normas (`EJECUTORES` de normas.mjs).
 * El puente entre los dos es ESCALON_DE_EJECUTOR: el test exige que tenga
 * exactamente los ejecutores del registro, así que un ejecutor nuevo no entra
 * sin decir en qué escalón cae, y que cada mecanismo diga lo mismo que el puente.
 * `veredicto_max` sigue las reglas de dureza de normas.mjs: un mecanismo que
 * no puede dar una norma dura no se anuncia como duro.
 *
 * Lo usan:
 *   scripts/oficio.mjs                         `npm run mecanismos`
 *   .claude/skills/plan-de-arreglo/SKILL.md    elegir el escalón más alto
 *   .claude/skills/causa-raiz/SKILL.md         el criterio de parada «mecanismo_cambiable»
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ALCANCES, EJECUTORES, EJECUTORES_DEL_SISTEMA, VEREDICTOS } from "./normas.mjs";

const FLUJO = JSON.parse(readFileSync(fileURLToPath(new URL("../../ops/flujo.json", import.meta.url)), "utf8"));
/** Los escalones, del más al menos duradero (ops/flujo.json). */
export const ESCALONES = FLUJO.escalera.map((e) => e.id);

/**
 * En qué escalón cae cada ejecutor del registro de normas. `null`: el ejecutor
 * existe pero no es algo que pongamos como arreglo (va en
 * `ejecutores_sin_mecanismo` del JSON, con su porqué).
 */
export const ESCALON_DE_EJECUTOR = {
  github_regla: "bloqueo",
  ci: "test_ci",
  base_datos: "bloqueo",
  codigo_en_ejecucion: "bloqueo",
  proveedor: "bloqueo",
  guardia: "bloqueo",
  clasificador: null,
  script_propio: "script",
  persona: "skill",
  nada: "texto",
};

/** Los mecanismos que el plan #334 pide nombrar (#338); el catálogo puede tener más. */
export const MECANISMOS_PEDIDOS = ["regla_github", "ci", "restriccion_bd", "hook", "entorno_aprobador", "permisos_identidad", "eval", "skill", "texto"];

export const CAMPOS = ["id", "nombre", "escalon", "ejecutor", "alcance", "veredicto_max", "cuando", "cuesta", "ejemplo"];
export const CAMPOS_OPCIONALES = ["nota"];

const RUTA = new URL("../../ops/mecanismos.json", import.meta.url);
/** El catálogo tal como está en ops/mecanismos.json. */
export const CATALOGO = JSON.parse(readFileSync(fileURLToPath(RUTA), "utf8"));

/** El veredicto más alto que puede dar un ejecutor con un alcance (las reglas de dureza de normas.mjs). */
export function veredictoPosible(ejecutor, alcance) {
  if (EJECUTORES_DEL_SISTEMA.includes(ejecutor) && alcance === "todos") return "dura";
  if (["nada", "persona"].includes(ejecutor)) return "blanda";
  return "semidura";
}

/**
 * Lo que está mal en el catálogo. Lista vacía si está bien. Cada problema
 * empieza por el nombre de su regla. `existe(ruta)`: ¿está ese fichero en el repo?
 */
export function problemas(cat, { existe = () => true } = {}) {
  const p = [];
  const lista = Array.isArray(cat?.mecanismos) ? cat.mecanismos : [];
  if (!lista.length) p.push("forma: falta la lista «mecanismos»");

  // El puente: exactamente los ejecutores del registro, ni uno más ni uno menos.
  const enPuente = Object.keys(ESCALON_DE_EJECUTOR).sort();
  const enRegistro = Object.keys(EJECUTORES).sort();
  if (JSON.stringify(enPuente) !== JSON.stringify(enRegistro)) p.push(`puente: ESCALON_DE_EJECUTOR cubre [${enPuente}] y el registro de normas tiene [${enRegistro}]`);
  for (const [ej, esc] of Object.entries(ESCALON_DE_EJECUTOR)) if (esc !== null && !ESCALONES.includes(esc)) p.push(`puente: ${ej} → «${esc}», que no es un escalón de ops/flujo.json`);

  const ids = new Set();
  for (const m of lista) {
    const id = m?.id ?? "(sin id)";
    if (!/^[a-z]+(_[a-z]+)*$/.test(m?.id ?? "")) p.push(`forma: ${id}: el id va en minúsculas con guiones bajos`);
    if (ids.has(id)) p.push(`forma: ${id} repetido`);
    ids.add(id);
    for (const c of CAMPOS) if (!(c in (m ?? {}))) p.push(`forma: ${id} sin «${c}»`);
    for (const c of Object.keys(m ?? {})) if (!CAMPOS.includes(c) && !CAMPOS_OPCIONALES.includes(c)) p.push(`forma: ${id} con un campo desconocido «${c}»`);
    if (!ESCALONES.includes(m?.escalon)) p.push(`escalon: ${id} → «${m?.escalon}» no es un escalón de ops/flujo.json (${ESCALONES.join(", ")})`);
    if (!(m?.ejecutor in EJECUTORES)) p.push(`ejecutor: ${id} → «${m?.ejecutor}» no está en EJECUTORES de normas.mjs`);
    else if (ESCALONES.includes(m.escalon) && ESCALON_DE_EJECUTOR[m.ejecutor] !== m.escalon) p.push(`escalon-distinto: ${id} dice «${m.escalon}» y su ejecutor ${m.ejecutor} cae en «${ESCALON_DE_EJECUTOR[m.ejecutor]}»`);
    if (!(m?.alcance in ALCANCES)) p.push(`alcance: ${id} → «${m?.alcance}» no está en ALCANCES de normas.mjs`);
    if (!(m?.veredicto_max in VEREDICTOS)) p.push(`veredicto: ${id} → «${m?.veredicto_max}» no es un veredicto`);
    else if (m.ejecutor in EJECUTORES && veredictoPosible(m.ejecutor, m.alcance) !== m.veredicto_max) {
      p.push(`veredicto-distinto: ${id} se anuncia «${m.veredicto_max}» y con ${m.ejecutor} para ${m.alcance} llega como mucho a «${veredictoPosible(m.ejecutor, m.alcance)}»`);
    }
    for (const c of ["cuando", "cuesta"]) if (!(typeof m?.[c] === "string" && m[c].length >= 20)) p.push(`texto: ${id}: «${c}» de 20 caracteres o más`);
    if (m?.ejemplo != null && !existe(m.ejemplo)) p.push(`ejemplo: ${id} cita ${m.ejemplo}, que no existe`);
  }

  for (const id of MECANISMOS_PEDIDOS) if (!ids.has(id)) p.push(`falta-mecanismo: «${id}» no está en el catálogo`);
  // Cada escalón tiene al menos un mecanismo, y cada ejecutor con escalón, también.
  for (const e of ESCALONES) if (!lista.some((m) => m?.escalon === e)) p.push(`escalon-vacio: ningún mecanismo en el escalón «${e}»`);
  const sinMec = cat?.ejecutores_sin_mecanismo ?? {};
  for (const [ej, esc] of Object.entries(ESCALON_DE_EJECUTOR)) {
    const usado = lista.some((m) => m?.ejecutor === ej);
    if (esc === null && !(typeof sinMec[ej] === "string" && sinMec[ej].length >= 20)) p.push(`ejecutor-sin-mecanismo: ${ej} no tiene escalón y no dice por qué en ejecutores_sin_mecanismo`);
    if (esc !== null && !usado) p.push(`ejecutor-sin-mecanismo: ningún mecanismo usa el ejecutor ${ej}`);
    if (esc === null && usado) p.push(`puente: ${ej} no tiene escalón y un mecanismo lo usa`);
  }
  for (const ej of Object.keys(sinMec)) if (ESCALON_DE_EJECUTOR[ej] !== null) p.push(`puente: ejecutores_sin_mecanismo nombra «${ej}», que sí tiene escalón (o no existe)`);
  return p;
}

/** El mecanismo de un id, o null. */
export function mecanismo(id, cat = CATALOGO) {
  return cat.mecanismos.find((m) => m.id === id) ?? null;
}

/** Posición en la escalera (0 = el más duradero). Desconocido: Infinity. */
export function rango(id, cat = CATALOGO) {
  const m = mecanismo(id, cat);
  return m ? ESCALONES.indexOf(m.escalon) : Infinity;
}

/** De una lista de ids, el del escalón más alto (el primero, a igualdad), o null. */
export function masAlto(ids, cat = CATALOGO) {
  const validos = ids.filter((id) => mecanismo(id, cat));
  return validos.reduce((mejor, id) => (mejor === null || rango(id, cat) < rango(mejor, cat) ? id : mejor), null);
}

/** Los mecanismos ordenados por escalón: lo que imprime `npm run mecanismos`. */
export function textoMecanismos(cat = CATALOGO) {
  const out = ["Mecanismos, del más al menos duradero (ops/mecanismos.json):", ""];
  ESCALONES.forEach((e, i) => {
    out.push(`${i + 1} · ${e}`);
    for (const m of cat.mecanismos.filter((x) => x.escalon === e)) {
      out.push(`  ${m.id} — ${m.nombre} · ejecutor ${m.ejecutor} · alcanza a ${m.alcance} · como mucho ${m.veredicto_max}`);
      out.push(`    Cuándo: ${m.cuando}`);
      out.push(`    Cuesta: ${m.cuesta}`);
      if (m.ejemplo) out.push(`    Ejemplo: ${m.ejemplo}`);
      if (m.nota) out.push(`    Nota: ${m.nota}`);
    }
    out.push("");
  });
  return out.join("\n");
}
