/**
 * La precedencia entre áreas (#621, fondo #618): qué gana cuando dos normas piden cosas incompatibles.
 *
 * Es un dato del catálogo de principios (`precedencia` de ops/principios/_catalogo.json), no una regla
 * que cada agente recuerda: seguridad > datos de familias > coste > velocidad. Los cuatro conceptos son
 * un vocabulario cerrado (`conceptos`, con su definición; ids en inglés) y cada ÁMBITO de AMBITOS
 * (el área de un principio y el ámbito de una norma: un solo vocabulario) tiene un puesto en `orden`,
 * de mayor a menor precedencia, con el concepto que defiende. La tabla es TOTAL (todo ámbito sale una
 * vez) y SIN EMPATES (el puesto es la posición en la lista); los conceptos van en el orden de su lista.
 *
 * Una norma hereda el rango de su ámbito (`ambito` de ops/normas.json). Qué hace un agente cuando
 * dos normas chocan (`choque`): aplica la del ámbito de menor rango; si son del mismo ámbito, no se
 * resuelve por precedencia y se pone en las decisiones pendientes; y deja constancia con una excepción
 * de la norma que cede, en la forma única de scripts/lib/excepciones.mjs.
 *
 * Lo lee `npm run estandar` (la imprime en el brief) y lo vigila ops/precedencia.test.js.
 */
import { AMBITOS } from "./ambitos.mjs";
import { leerCatalogo } from "./catalogos.mjs";

/** Los conceptos, en el orden de la precedencia (ids en inglés): un cambio aquí es un cambio de vocabulario. */
export const CONCEPTOS = ["security", "family-data", "cost", "speed"];

/**
 * Dónde vive el catálogo de principios. Es el mismo valor que RUTA_PRINCIPIOS de principios.mjs, pero no se importa
 * de allí: principios.mjs importa estandaresAgentes.mjs, que imprime la precedencia, y sería un ciclo (lo cruza el test).
 */
export const RUTA_CATALOGO = "ops/principios/";

/** La precedencia del repo, tal como está en el catálogo. */
export const leerPrecedencia = (raiz) => leerCatalogo(raiz, RUTA_CATALOGO).precedencia;

/** El puesto de un ámbito (1 = el que gana), o null si no está en la tabla. */
export function rangoDe(tabla, ambito) {
  const i = (tabla?.orden ?? []).findIndex((x) => x.area === ambito);
  return i < 0 ? null : i + 1;
}

/** El concepto que defiende un ámbito, o null. */
export const conceptoDe = (tabla, ambito) => (tabla?.orden ?? []).find((x) => x.area === ambito)?.concepto ?? null;

/**
 * Cuando dos normas chocan: { gana, cede } (ids), o { sinResolver: true, motivo } si son del mismo ámbito
 * o alguna no tiene rango. Acepta ids u objetos de norma; `normas` es la lista de ops/normas.json.
 */
export function resolverChoque(tabla, a, b, normas = []) {
  const norma = (x) => (typeof x === "string" ? normas.find((n) => n.id === x) : x);
  const na = norma(a);
  const nb = norma(b);
  if (!na || !nb) return { sinResolver: true, motivo: "una de las dos no es una norma del registro" };
  const ra = rangoDe(tabla, na.ambito);
  const rb = rangoDe(tabla, nb.ambito);
  if (ra === null || rb === null) return { sinResolver: true, motivo: "una de las dos es de un ámbito sin rango" };
  if (ra === rb) return { sinResolver: true, motivo: `las dos son del ámbito ${na.ambito}: no se resuelve por precedencia, se pone en las decisiones pendientes` };
  const [gana, cede] = ra < rb ? [na, nb] : [nb, na];
  return { gana: gana.id, cede: cede.id };
}

/**
 * Errores de la tabla (lista vacía si está bien): conceptos exactamente los de CONCEPTOS, cada uno con su
 * definición; cada ámbito de AMBITOS una sola vez y ninguno de más (total y sin empates); el concepto de cada
 * puesto es de la lista y no vuelve a un concepto más alto (el orden de los conceptos manda); y la regla de
 * choque y su constancia están. `ambitos` y `normas` se inyectan para poder probar.
 */
export function problemasDePrecedencia(tabla, { ambitos = Object.keys(AMBITOS), normas = [] } = {}) {
  const malos = [];
  if (!tabla || typeof tabla !== "object") return ["precedencia: falta en ops/principios/_catalogo.json"];
  const claves = Object.keys(tabla.conceptos ?? {});
  if (claves.join() !== CONCEPTOS.join()) malos.push(`precedencia: los conceptos son ${CONCEPTOS.join(", ")}, en ese orden (están ${claves.join(", ") || "vacíos"})`);
  for (const [c, d] of Object.entries(tabla.conceptos ?? {})) if (typeof d !== "string" || d.trim().length < 20) malos.push(`precedencia: el concepto «${c}» lleva su definición (20 caracteres o más)`);
  const orden = tabla.orden;
  if (!Array.isArray(orden) || !orden.length) return [...malos, "precedencia: «orden» es una lista de { area, concepto }"];
  const vistos = new Set();
  let techo = -1;
  orden.forEach((x, i) => {
    if (Object.keys(x ?? {}).sort().join() !== "area,concepto") malos.push(`precedencia: el puesto ${i + 1} lleva solo «area» y «concepto»`);
    if (vistos.has(x?.area)) malos.push(`precedencia: el ámbito «${x.area}» sale dos veces (un empate no se resuelve)`);
    vistos.add(x?.area);
    if (!ambitos.includes(x?.area)) malos.push(`precedencia: «${x?.area}» no es un ámbito de AMBITOS`);
    const k = CONCEPTOS.indexOf(x?.concepto);
    if (k < 0) malos.push(`precedencia: el puesto ${i + 1} (${x?.area}) defiende «${x?.concepto}», que no es un concepto`);
    else if (k < techo) malos.push(`precedencia: «${x.area}» defiende ${x.concepto}, que va antes que el concepto del puesto anterior; el orden de los conceptos manda`);
    else techo = k;
  });
  for (const a of ambitos) if (!vistos.has(a)) malos.push(`precedencia: el ámbito «${a}» no tiene puesto (la tabla es total)`);
  for (const c of CONCEPTOS) if (!orden.some((x) => x.concepto === c)) malos.push(`precedencia: ningún ámbito defiende «${c}»`);
  for (const n of normas) if (rangoDe(tabla, n.ambito) === null) malos.push(`norma ${n.id}: su ámbito «${n.ambito}» no tiene rango en la precedencia`);
  const ch = tabla.choque;
  if (typeof ch?.regla !== "string" || ch.regla.trim().length < 40) malos.push("precedencia: «choque.regla» dice qué hace el agente cuando dos normas chocan");
  if (typeof ch?.constancia !== "string" || !/^Excepci[oó]n: <[^>]+> — .+ — hasta AAAA-MM-DD$/.test(ch.constancia)) malos.push("precedencia: «choque.constancia» es la forma única de excepción de scripts/lib/excepciones.mjs");
  return malos;
}

/** La tabla en texto, para el brief de un agente (`npm run estandar`) y el documento de principios. */
export function textoDePrecedencia(tabla) {
  const L = [`Precedencia entre áreas (si dos normas chocan gana la de arriba; ${tabla.orden.map((x) => AMBITOS[x.area]?.legible ?? x.area).join(" > ")}):`];
  tabla.orden.forEach((x, i) => L.push(`  ${i + 1}. ${x.area} (${AMBITOS[x.area]?.legible ?? x.area}) — ${x.concepto}`));
  L.push(`Si chocan: ${tabla.choque.regla}`, `Constancia: ${tabla.choque.constancia}`);
  return L.join("\n");
}
