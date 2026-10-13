/**
 * La precedencia entre conceptos (#621, fondo #618): qué gana cuando dos normas piden cosas incompatibles.
 *
 * Es un dato del catálogo de principios (`precedencia` de ops/principios/_catalogo.json), no una regla que cada
 * agente recuerda. Se ordena por CONCEPTO, no por ámbito: seguridad > datos de familias > coste > velocidad (ids
 * en inglés: security, family-data, cost, speed). Una norma de proceso puede proteger la seguridad y una de datos
 * puede ser de seguridad, así que el rango no sale del ámbito sino de lo que la norma defiende:
 *   - `concepts`: los conceptos, EN ORDEN de precedencia (el orden vive solo aquí), con su nombre legible y su porqué;
 *   - `default_concept`: el concepto que defiende por defecto cada ámbito de AMBITOS (total: todo ámbito, una vez);
 *   - `principles`: los principios de seguridad, de datos de familias y de coste; las normas que los citan defienden
 *     ese concepto (si su ámbito no lo da por defecto, la norma lo declara con su campo opcional `concepto`);
 *   - `clash`: qué hace el agente cuando dos normas chocan y cómo deja constancia (la excepción de la que cede).
 * Si las dos normas defienden el mismo concepto, la precedencia no decide: se para y se pone en las decisiones
 * pendientes.
 *
 * Lo lee `npm run estandar` (la imprime en el brief) y lo vigila ops/precedencia.test.js.
 */
import { AMBITOS } from "./ambitos.mjs";
import { leerCatalogo } from "./catalogos.mjs";

/**
 * Dónde vive el catálogo de principios. Es el mismo valor que RUTA_PRINCIPIOS de principios.mjs, pero no se importa
 * de allí: principios.mjs importa estandaresAgentes.mjs, que imprime la precedencia, y sería un ciclo (lo cruza el test).
 */
export const RUTA_CATALOGO = "ops/principios/";

/** La precedencia del repo, tal como está en el catálogo. */
export const leerPrecedencia = (raiz) => leerCatalogo(raiz, RUTA_CATALOGO).precedencia;

/** Los conceptos, de más a menos precedencia: las claves de `concepts` (el orden vive solo en el catálogo). */
export const conceptosDe = (tabla) => Object.keys(tabla?.concepts ?? {});

/** El puesto de un concepto (1 = el que gana), o null. */
export function rangoDe(tabla, concepto) {
  const i = conceptosDe(tabla).indexOf(concepto);
  return i < 0 ? null : i + 1;
}

/** El concepto que defiende una norma: el que declara o el de su ámbito; null si ninguno. */
export const conceptoDeNorma = (tabla, norma) => norma?.concepto ?? tabla?.default_concept?.[norma?.ambito] ?? null;

/**
 * Cuando dos normas chocan: { gana, cede } (ids), o { sinResolver: true, motivo } si defienden el mismo concepto
 * o alguna no tiene concepto. Acepta ids u objetos de norma; `normas` es la lista de ops/normas.json.
 */
export function resolverChoque(tabla, a, b, normas = []) {
  const norma = (x) => (typeof x === "string" ? normas.find((n) => n.id === x) : x);
  const na = norma(a);
  const nb = norma(b);
  if (!na || !nb) return { sinResolver: true, motivo: "una de las dos no es una norma del registro" };
  const ca = conceptoDeNorma(tabla, na);
  const cb = conceptoDeNorma(tabla, nb);
  const ra = rangoDe(tabla, ca);
  const rb = rangoDe(tabla, cb);
  if (ra === null || rb === null) return { sinResolver: true, motivo: "una de las dos defiende un concepto sin puesto en la precedencia" };
  if (ra === rb) return { sinResolver: true, motivo: `las dos defienden ${ca}: la precedencia no decide, se para y se pone en las decisiones pendientes` };
  const [gana, cede] = ra < rb ? [na, nb] : [nb, na];
  return { gana: gana.id, cede: cede.id };
}

/**
 * Errores de la tabla (lista vacía si está bien): cada concepto con su nombre y su porqué; todo ámbito de AMBITOS con
 * su concepto por defecto, una vez y de la lista (total); cada principio de `principles` existe (si se pasa
 * `principios`) y está en un solo concepto; la regla de choque y su constancia; y, con `normas`, que toda norma
 * defienda un concepto, que el que declara exista y no repita el de su ámbito, y que toda norma que cita un
 * principio de un concepto lo defienda. `ambitos`, `normas` y `principios` (ids) se inyectan para poder probar.
 */
export function problemasDePrecedencia(tabla, { ambitos = Object.keys(AMBITOS), normas = [], principios = null } = {}) {
  const malos = [];
  if (!tabla || typeof tabla !== "object") return ["precedencia: falta en ops/principios/_catalogo.json"];
  const conceptos = conceptosDe(tabla);
  if (!conceptos.length) malos.push("precedencia: «concepts» es el mapa de conceptos, de más a menos precedencia");
  for (const [c, d] of Object.entries(tabla.concepts ?? {})) {
    if (!/^[a-z]+(-[a-z]+)*$/.test(c)) malos.push(`precedencia: el concepto «${c}» va en minúsculas y con guiones, en inglés`);
    if (typeof d?.label !== "string" || d.label.trim().length < 3) malos.push(`precedencia: el concepto «${c}» lleva su nombre legible («label»)`);
    if (typeof d?.what !== "string" || d.what.trim().length < 20) malos.push(`precedencia: el concepto «${c}» lleva su porqué («what», 20 caracteres o más)`);
  }
  const por = tabla.default_concept ?? {};
  for (const a of ambitos) {
    if (!(a in por)) malos.push(`precedencia: el ámbito «${a}» no tiene concepto por defecto (la tabla es total)`);
    else if (!conceptos.includes(por[a])) malos.push(`precedencia: el ámbito «${a}» defiende «${por[a]}», que no es un concepto`);
  }
  for (const a of Object.keys(por)) if (!ambitos.includes(a)) malos.push(`precedencia: «${a}» no es un ámbito de AMBITOS`);
  const vistos = new Map();
  for (const [c, ids] of Object.entries(tabla.principles ?? {})) {
    if (!conceptos.includes(c)) malos.push(`precedencia: «principles» habla de «${c}», que no es un concepto`);
    if (!Array.isArray(ids) || !ids.length) malos.push(`precedencia: «principles.${c}» es una lista de principios`);
    for (const id of ids ?? []) {
      if (vistos.has(id)) malos.push(`precedencia: el principio «${id}» está en ${vistos.get(id)} y en ${c}; un principio defiende un solo concepto`);
      vistos.set(id, c);
      if (principios && !principios.includes(id)) malos.push(`precedencia: «${id}» no es un principio de la lista`);
    }
  }
  for (const n of normas) {
    if ("concepto" in n) {
      if (!conceptos.includes(n.concepto)) malos.push(`norma ${n.id}: declara el concepto «${n.concepto}», que no existe`);
      else if (n.concepto === por[n.ambito]) malos.push(`norma ${n.id}: declara «${n.concepto}», que ya es el de su ámbito ${n.ambito}; quita el campo`);
    }
    const c = conceptoDeNorma(tabla, n);
    if (rangoDe(tabla, c) === null) malos.push(`norma ${n.id}: no defiende ningún concepto de la precedencia`);
    const deseado = vistos.get(n.principio);
    if (deseado && c !== deseado) malos.push(`norma ${n.id}: cita el principio «${n.principio}», que defiende ${deseado}, y ella defiende ${c}; declara \`"concepto": "${deseado}"\``);
  }
  const ch = tabla.clash;
  if (typeof ch?.rule !== "string" || ch.rule.trim().length < 40) malos.push("precedencia: «clash.rule» dice qué hace el agente cuando dos normas chocan");
  if (typeof ch?.record !== "string" || !/^Excepci[oó]n: <[^>]+> — .+ — hasta AAAA-MM-DD$/.test(ch.record)) malos.push("precedencia: «clash.record» es la forma única de excepción de scripts/lib/excepciones.mjs");
  return malos;
}

/** El orden legible: «seguridad > datos de familias > coste > velocidad». */
export const ordenLegible = (tabla) => Object.values(tabla.concepts).map((c) => c.label).join(" > ");

/** La tabla en texto, para el brief de un agente (`npm run estandar`). */
export function textoDePrecedencia(tabla) {
  const L = [`Precedencia (si dos normas chocan, gana la que defiende el concepto de más arriba; ${ordenLegible(tabla)}):`];
  conceptosDe(tabla).forEach((c, i) => {
    const areas = Object.entries(tabla.default_concept).filter(([, x]) => x === c).map(([a]) => a);
    L.push(`  ${i + 1}. ${c} (${tabla.concepts[c].label}) — ámbitos por defecto: ${areas.join(", ") || "ninguno"}`);
  });
  L.push(`Si chocan: ${tabla.clash.rule}`, `Constancia: ${tabla.clash.record}`);
  return L.join("\n");
}
