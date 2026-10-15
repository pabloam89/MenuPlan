/**
 * Las plantillas de componente (#842, programa #774): una plantilla por tipo de elemento de interfaz de
 * `ops/diseno/taxonomia.json` (vocabulario `elemento`, los 50), en `ops/diseno/plantillas-componente.json`. Es el nivel
 * `template` de la entidad `component` (ops/entidades.json, `component-template`): dice cómo es cualquier componente de ese
 * tipo, en campos de vocabulario cerrado, y cada proyecto la rellena con su pieza concreta (la ficha del bloque D de
 * docs/diseno/META-DISENO.md, #830), poniendo los números con sus tokens.
 *
 * Cada plantilla lleva: `categoria` (las categorías de componente de ops/diseno/bloques.json), `interaccion`, `anatomia`
 * (partes obligatorias u opcionales), `forma` (atributos con su lista cerrada de valores y el de por defecto), `visual`
 * (propiedades de una parte que apuntan a un paso de una escala por su rol, nunca a un número: normas design-token-per-role y
 * design-token-layers), `estados` (los de ops/diseno/bloques.json, que cita la norma design-complete-states), `accesibilidad`
 * (rol ARIA, nombre accesible, objetivo táctil y teclado: normas design-touch-target y design-visible-focus). Sin fuentes
 * ni enlaces de inspiración (decisión de Pablo, #850): una plantilla es un molde de la casa, no una regla que se justifique.
 *
 * Nada se copia: los estados, las categorías, las variantes, los tamaños, las densidades y los tipos de token salen de
 * ops/diseno/bloques.json (`DE_BLOQUES`); la marca `not-applicable`, del vocabulario `marca` de ops/diseno/bibliotecas.json
 * (#802), y el sí/no de un atributo, de su vocabulario `declaracion` (definiciones neutras: el sentido lo da el atributo); la
 * plataforma de cada tipo, de la taxonomía. Los vocabularios propios viven una vez en el JSON, y el código lee exactamente los de
 * `VOCABULARIOS_DE_PLANTILLAS` (un vocabulario sin lector no entra, como en el pool). Cada valor de atributo, parte, rol ARIA,
 * nombre accesible y tecla lo usa al menos una plantilla.
 *
 * Lo leen `ops/diseno/plantillas-componente.test.js` (las reglas, con su autotest), `scripts/diseno/plantillas.mjs` (las
 * cifras) y `scripts/lib/vocabulariosVida.mjs` (el ciclo de vida de cada vocabulario, al pedir los textos). Puro: sin red.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NO_APLICA } from "./bibliotecasDiseno.mjs";

export const RUTA_PLANTILLAS = "ops/diseno/plantillas-componente.json";
export { NO_APLICA };

/** Los vocabularios propios del fichero, por su clave: el test exige que el JSON no tenga ni más ni menos. */
export const VOCABULARIOS_DE_PLANTILLAS = [
  "interaccion", "obligacion_de_parte", "parte", "rol_aria", "nombre_accesible", "objetivo_tactil", "teclado",
];
/**
 * Lo que se reutiliza de `vocabularios` de ops/diseno/bloques.json, por el nombre que tiene allí. `categoria` y `estado` los
 * usa la plantilla y `tipo_de_token` es el tipo de cada propiedad visual (`DE_BLOQUES_FIJOS`); `variantes`, `tamaños` y
 * `densidades` pueden ser los valores de un atributo (`valores_de`) o los pasos de una escala (`pasos_de`).
 */
const DE_BLOQUES_FIJOS = { categoria: "categorías de componente", estado: "estados", tipo_de_token: "tipos de token" };
const DE_BLOQUES_PARA_VALORES = { variantes: "variantes", tamaños: "tamaños", densidades: "densidades" };
export const DE_BLOQUES = { ...DE_BLOQUES_FIJOS, ...DE_BLOQUES_PARA_VALORES };
/** El sí/no de un atributo: el vocabulario `declaracion` del pool (ops/diseno/bibliotecas.json), no uno propio. Solo para atributos. */
export const SI_NO_DEL_POOL = "declaracion";
/** Los vocabularios que un atributo de forma puede reutilizar en vez de definir sus valores; una escala, solo los de bloques.json. */
export const REUTILIZABLES = [...Object.keys(DE_BLOQUES_PARA_VALORES), SI_NO_DEL_POOL];
export const CAMPOS_DE_PLANTILLA = ["elemento", "categoria", "interaccion", "anatomia", "forma", "visual", "estados", "accesibilidad"];
export const CAMPOS_DE_ACCESIBILIDAD = ["rol_aria", "nombre_accesible", "objetivo_tactil", "teclado"];
/**
 * El mínimo de estados de un elemento interactivo; `hover`, además, si su plataforma tiene puntero. Cada plantilla marca los
 * suyos y el componente los define (norma design-complete-states de ops/normas.json, que nombra este mínimo: el test compara
 * igual a igual la lista de su exigencia, leída con `estadosDeLaNorma`, y estas dos constantes).
 */
export const ESTADOS_DE_INTERACTIVO = ["reposo", "foco", "pulsado", "deshabilitado"];
export const ESTADO_DE_PUNTERO = "hover";
/**
 * Los estados que nombra la exigencia de la norma design-complete-states: la lista tras «como mínimo» y el de «…, y X con
 * puntero». Devuelve { minimo, puntero }, o null si la exigencia ya no tiene esa forma (y el test lo dice).
 */
export function estadosDeLaNorma(exigencia) {
  const m = /como mínimo (.+?), y (\S+) con puntero$/.exec(exigencia ?? "");
  return m ? { minimo: m[1].split(/, | y /).map((x) => x.trim()), puntero: m[2] } : null;
}
/** Los estados que un elemento estático no puede tener: no recibe foco ni responde. */
export const ESTADOS_SOLO_INTERACTIVOS = ["hover", "foco", "pulsado", "deshabilitado"];
/** La interacción de teclado que hace de un elemento una parada del foco: obligatoria si es interactivo, prohibida si es estático. */
export const PARADA_DE_FOCO = "tab-stop";
/** Plataformas de la taxonomía sin puntero (solo app): ahí `hover` no se exige. Cada id es de `plataformas` de la taxonomía. */
export const SIN_PUNTERO = ["app"];
/**
 * El tono de un mensaje comparte ids con los roles de color: cada valor del atributo `tone` es un paso de la escala
 * `color-role`, salvo `neutral`, que no pinta. Un solo nombre para «peligro»: `danger`.
 */
export const TONO = { atributo: "tone", escala: "color-role", sin_color: ["neutral"] };
/** Prefijos con que un sí/no diría «tiene la parte X»: `with-caption` es la parte `caption`. */
const PREFIJOS_DE_TENER = ["with-", "has-"];

const FORMA_ID = /^[a-z]+(-[a-z]+)*$/;
const texto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;
const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const repetidos = (lista) => lista.filter((x, i) => lista.indexOf(x) !== i);

export const leerPlantillas = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_PLANTILLAS), "utf8"));

/** Las claves de los vocabularios propios del fichero: salen de él, no se repiten a mano. */
export const clavesDeVocabulario = (datos) => Object.keys(datos?.vocabularios ?? {});

/** Los valores de un vocabulario reutilizable: de bloques.json, o el sí/no del pool. */
function valoresReutilizados(nombre, bloques, pool) {
  if (nombre === SI_NO_DEL_POOL) return Object.keys(pool?.vocabularios?.[SI_NO_DEL_POOL] ?? {});
  return Object.hasOwn(DE_BLOQUES_PARA_VALORES, nombre) ? bloques?.vocabularios?.[nombre] ?? [] : [];
}

/** Los valores posibles de un atributo de forma: los suyos o los del vocabulario que reutiliza (`pool` da el sí/no). */
export function valoresDeAtributo(datos, bloques, id, pool) {
  const a = datos?.atributos_de_forma?.[id];
  if (!a) return [];
  return a.valores_de ? valoresReutilizados(a.valores_de, bloques, pool) : Object.keys(a.valores ?? {});
}

/** Los pasos de una escala: los suyos o los de bloques.json que reutiliza. */
export function pasosDeEscala(datos, bloques, id) {
  const e = datos?.escalas?.[id];
  if (!e) return [];
  return e.pasos_de ? valoresReutilizados(e.pasos_de, bloques) : Object.keys(e.pasos ?? {});
}

/**
 * Las partes que repite un atributo sí/no (lista vacía si ninguna). Por el nombre: sin `with-` o `has-`, es una parte del
 * vocabulario; o, en la plantilla que lo usa, es o acaba en una de sus partes, o una de sus partes acaba en él (`thumb-icon`
 * con la parte `icon`, `with-action` con `primary-action`). Lo que la pieza tiene lo dice la parte opcional, una vez.
 */
export function partesQueRepite(id, partesDelVocabulario, partesDeLaPlantilla = []) {
  const n = PREFIJOS_DE_TENER.reduce((x, pre) => (x.startsWith(pre) ? x.slice(pre.length) : x), id);
  const repite = new Set(partesDelVocabulario.includes(n) ? [n] : []);
  for (const parte of partesDeLaPlantilla) if (parte === n || parte.endsWith(`-${n}`) || n.endsWith(`-${parte}`)) repite.add(parte);
  return [...repite];
}

/** Textos de cada vocabulario para el ciclo de vida (ops/vocabularios-vida.json): `diseno.plantilla_<clave>`. */
export function textosDePlantillas(datos, clave) {
  if (clave === "atributo_de_forma") return Object.fromEntries(Object.entries(datos?.atributos_de_forma ?? {}).map(([k, a]) => [k, a.que]));
  if (clave === "valor_de_forma") return Object.fromEntries(Object.entries(datos?.atributos_de_forma ?? {}).flatMap(([k, a]) => Object.entries(a.valores ?? {}).map(([v, d]) => [`${k}.${v}`, d])));
  if (clave === "escala") return Object.fromEntries(Object.entries(datos?.escalas ?? {}).map(([k, e]) => [k, e.que]));
  if (clave === "paso") return Object.fromEntries(Object.entries(datos?.escalas ?? {}).flatMap(([k, e]) => Object.entries(e.pasos ?? {}).map(([v, d]) => [`${k}.${v}`, d])));
  if (clave === "propiedad_visual") return Object.fromEntries(Object.entries(datos?.propiedades_visuales ?? {}).map(([k, p]) => [k, p.que]));
  return { ...(datos?.vocabularios?.[clave] ?? {}) };
}
/** Las claves que el ciclo de vida registra: los vocabularios propios y los cinco que viven en sus secciones. */
export const CLAVES_DE_VIDA = [...VOCABULARIOS_DE_PLANTILLAS, "atributo_de_forma", "valor_de_forma", "escala", "paso", "propiedad_visual"];

/** La firma de una plantilla (partes y atributos): dos tipos con la misma firma son una plantilla copiada. */
export const firmaDe = (t) => JSON.stringify([[...(t?.anatomia ?? []).map((a) => a.parte)].sort(), [...(t?.forma ?? []).map((f) => f.atributo)].sort()]);

/**
 * Los problemas de las plantillas contra la taxonomía, los bloques y el pool (lista de textos; vacía si está bien).
 * `taxonomia`: ops/diseno/taxonomia.json; `bloques`: ops/diseno/bloques.json; `pool`: ops/diseno/bibliotecas.json (su `marca` y su sí/no).
 */
export function problemasDePlantillas(datos, taxonomia, bloques, pool) {
  const p = [];
  const V = datos?.vocabularios ?? {};
  const B = bloques?.vocabularios ?? {};
  const en = (k, x) => Object.prototype.hasOwnProperty.call(V[k] ?? {}, x);
  const deBloques = (k, x) => (B[DE_BLOQUES[k]] ?? []).includes(x);

  // La marca es la del pool, una vez (#802): si cambia allí, esto lo nota.
  const marcas = Object.keys(pool?.vocabularios?.marca ?? {});
  if (!marcas.includes(NO_APLICA)) p.push(`marca: ${NO_APLICA} debe estar en el vocabulario marca de ops/diseno/bibliotecas.json`);
  for (const nombre of Object.values(DE_BLOQUES)) if (!Array.isArray(B[nombre]) || B[nombre].length === 0) p.push(`bloques.json: falta el vocabulario «${nombre}» que reutilizan las plantillas`);
  if (Object.keys(pool?.vocabularios?.[SI_NO_DEL_POOL] ?? {}).length < 2) p.push(`${SI_NO_DEL_POOL}: el sí/no de los atributos es el vocabulario ${SI_NO_DEL_POOL} de ops/diseno/bibliotecas.json, y falta`);
  for (const id of SIN_PUNTERO) if (!Object.hasOwn(taxonomia?.plataformas ?? {}, id)) p.push(`SIN_PUNTERO: «${id}» no es una plataforma de ops/diseno/taxonomia.json`);

  // Los vocabularios propios: los que lee el código, ni más ni menos, kebab y con definición, sin repetir una marca.
  const delCodigo = new Set(VOCABULARIOS_DE_PLANTILLAS);
  for (const k of clavesDeVocabulario(datos)) if (!delCodigo.has(k)) p.push(`vocabularios.${k}: no lo lee el código (VOCABULARIOS_DE_PLANTILLAS de scripts/lib/plantillasComponente.mjs)`);
  for (const k of VOCABULARIOS_DE_PLANTILLAS) {
    const v = V[k];
    if (!esObjeto(v) || Object.keys(v).length === 0) { p.push(`vocabularios.${k}: falta o está vacío (VOCABULARIOS_DE_PLANTILLAS lo lee)`); continue; }
    for (const [id, que] of Object.entries(v)) {
      if (!FORMA_ID.test(id)) p.push(`vocabularios.${k}.${id}: el id no es kebab en minúsculas`);
      if (!texto(que, 5)) p.push(`vocabularios.${k}.${id}: sin definición`);
      if (marcas.includes(id)) p.push(`vocabularios.${k}.${id}: es una marca y vive solo en el vocabulario marca de ops/diseno/bibliotecas.json`);
    }
  }

  // Atributos de forma: id kebab, qué es, y sus valores propios o los de un vocabulario reutilizable (no los dos).
  const atributos = datos?.atributos_de_forma ?? {};
  if (!esObjeto(atributos) || Object.keys(atributos).length === 0) p.push("atributos_de_forma: no hay ninguno");
  for (const [id, a] of Object.entries(atributos)) {
    const q = `atributos_de_forma.${id}`;
    if (!FORMA_ID.test(id)) p.push(`${q}: el id no es kebab en minúsculas`);
    if (!texto(a?.que, 10)) p.push(`${q}: falta qué es (que)`);
    const extra = Object.keys(a ?? {}).filter((c) => !["que", "valores", "valores_de"].includes(c));
    if (extra.length) p.push(`${q}: campo desconocido (${extra.join(", ")})`);
    if (Object.hasOwn(a ?? {}, "valores") === Object.hasOwn(a ?? {}, "valores_de")) { p.push(`${q}: lleva valores o valores_de, uno de los dos`); continue; }
    if (a.valores_de) {
      if (!REUTILIZABLES.includes(a.valores_de)) p.push(`${q}: valores_de «${a.valores_de}» no es uno de ${REUTILIZABLES.join(", ")}`);
      if (a.valores_de === SI_NO_DEL_POOL) for (const x of partesQueRepite(id, Object.keys(V.parte ?? {}))) p.push(`${q}: un sí/no que repite la parte «${x}»; lo dice la parte opcional de la anatomía`);
      continue;
    }
    if (!esObjeto(a.valores) || Object.keys(a.valores).length < 2) p.push(`${q}: un atributo tiene al menos dos valores`);
    for (const [v, d] of Object.entries(a.valores ?? {})) {
      if (!FORMA_ID.test(v)) p.push(`${q}.${v}: el valor no es kebab en minúsculas`);
      if (!texto(d, 5)) p.push(`${q}.${v}: sin definición`);
      if (marcas.includes(v)) p.push(`${q}.${v}: es una marca, no un valor`);
    }
  }

  // Escalas por rol: pasos propios o reutilizados; y propiedades visuales, cada una con su escala y su tipo de token.
  const escalas = datos?.escalas ?? {};
  for (const [id, e] of Object.entries(escalas)) {
    const q = `escalas.${id}`;
    if (!FORMA_ID.test(id)) p.push(`${q}: el id no es kebab en minúsculas`);
    if (!texto(e?.que, 10)) p.push(`${q}: falta qué es (que)`);
    if (Object.hasOwn(e ?? {}, "pasos") === Object.hasOwn(e ?? {}, "pasos_de")) { p.push(`${q}: lleva pasos o pasos_de, uno de los dos`); continue; }
    if (e.pasos_de) { if (!Object.hasOwn(DE_BLOQUES_PARA_VALORES, e.pasos_de)) p.push(`${q}: pasos_de «${e.pasos_de}» no es un vocabulario de bloques.json reutilizable`); continue; }
    if (!esObjeto(e.pasos) || Object.keys(e.pasos).length < 2) p.push(`${q}: una escala tiene al menos dos pasos`);
    for (const [v, d] of Object.entries(e.pasos ?? {})) {
      if (!FORMA_ID.test(v)) p.push(`${q}.${v}: el paso no es kebab en minúsculas`);
      if (!texto(d, 5)) p.push(`${q}.${v}: sin definición`);
    }
  }
  const props = datos?.propiedades_visuales ?? {};
  for (const [id, x] of Object.entries(props)) {
    const q = `propiedades_visuales.${id}`;
    if (!FORMA_ID.test(id)) p.push(`${q}: el id no es kebab en minúsculas`);
    if (!texto(x?.que, 10)) p.push(`${q}: falta qué es (que)`);
    if (!Object.hasOwn(escalas, x?.escala ?? "")) p.push(`${q}: escala «${x?.escala}» no está en escalas`);
    if (!deBloques("tipo_de_token", x?.tipo_de_token)) p.push(`${q}: tipo_de_token «${x?.tipo_de_token}» no es un tipo de token de ops/diseno/bloques.json`);
  }
  for (const id of Object.keys(escalas)) if (!Object.values(props).some((x) => x?.escala === id)) p.push(`escalas.${id}: ninguna propiedad visual la usa`);

  // El tono comparte ids con los roles de color: un solo nombre para cada significado.
  if (Object.hasOwn(atributos, TONO.atributo)) {
    const roles = pasosDeEscala(datos, bloques, TONO.escala);
    for (const v of valoresDeAtributo(datos, bloques, TONO.atributo, pool)) if (!TONO.sin_color.includes(v) && !roles.includes(v)) p.push(`atributos_de_forma.${TONO.atributo}.${v}: no es un paso de la escala ${TONO.escala}; el tono usa los ids de los roles de color`);
  }

  // Las plantillas: una por elemento de la taxonomía, ni más ni menos.
  const plantillas = datos?.plantillas ?? [];
  const tipos = new Map((taxonomia?.elemento ?? []).map((e) => [e.id, e]));
  if (!Array.isArray(plantillas) || plantillas.length === 0) { p.push("plantillas: no hay ninguna"); return p; }
  const vistos = new Set();
  for (const id of repetidos(plantillas.map((t) => t?.elemento))) p.push(`plantillas.${id}: repetida`);
  for (const id of tipos.keys()) if (!plantillas.some((t) => t?.elemento === id)) p.push(`plantillas: falta la del elemento «${id}» de ops/diseno/taxonomia.json`);
  const firmas = new Map();
  for (const t of plantillas) {
    const q = `plantillas.${t?.elemento}`;
    const extra = Object.keys(t ?? {}).filter((c) => !CAMPOS_DE_PLANTILLA.includes(c));
    const falta = CAMPOS_DE_PLANTILLA.filter((c) => !Object.hasOwn(t ?? {}, c));
    if (extra.length) p.push(`${q}: campo desconocido (${extra.join(", ")})`);
    if (falta.length) { p.push(`${q}: falta ${falta.join(", ")}`); continue; }
    const tipo = tipos.get(t.elemento);
    if (!tipo) { p.push(`${q}: no es un elemento de ops/diseno/taxonomia.json`); continue; }
    vistos.add(t.elemento);
    if (!deBloques("categoria", t.categoria)) p.push(`${q}: categoria «${t.categoria}» no es una categoría de componente de ops/diseno/bloques.json`);
    if (!en("interaccion", t.interaccion)) p.push(`${q}: interaccion «${t.interaccion}» fuera del vocabulario`);

    // Anatomía: partes del vocabulario, sin repetir, con su obligación; al menos una obligatoria.
    const partes = Array.isArray(t.anatomia) ? t.anatomia.map((a) => a?.parte) : [];
    if (!Array.isArray(t.anatomia) || t.anatomia.length === 0) p.push(`${q}: anatomia es una lista no vacía`);
    else {
      for (const a of t.anatomia) {
        if (Object.keys(a ?? {}).sort().join() !== "obligacion,parte") p.push(`${q}.anatomia.${a?.parte}: lleva parte y obligacion`);
        if (!en("parte", a?.parte)) p.push(`${q}.anatomia: parte «${a?.parte}» fuera del vocabulario`);
        if (!en("obligacion_de_parte", a?.obligacion)) p.push(`${q}.anatomia.${a?.parte}: obligacion «${a?.obligacion}» fuera del vocabulario`);
      }
      for (const x of repetidos(partes)) p.push(`${q}.anatomia: parte «${x}» repetida`);
      if (!t.anatomia.some((a) => a?.obligacion === "required")) p.push(`${q}.anatomia: ninguna parte obligatoria`);
    }

    // Forma: atributos del catálogo, cada uno con un subconjunto de al menos dos de sus valores y el de por defecto dentro.
    if (!Array.isArray(t.forma) || t.forma.length === 0) p.push(`${q}: forma es una lista no vacía`);
    else {
      for (const f of t.forma) {
        const qf = `${q}.forma.${f?.atributo}`;
        if (Object.keys(f ?? {}).sort().join() !== "atributo,por_defecto,valores") p.push(`${qf}: lleva atributo, valores y por_defecto`);
        if (!Object.hasOwn(atributos, f?.atributo ?? "")) { p.push(`${qf}: no es un atributo de atributos_de_forma`); continue; }
        const posibles = valoresDeAtributo(datos, bloques, f.atributo, pool);
        if (atributos[f.atributo].valores_de === SI_NO_DEL_POOL) for (const x of partesQueRepite(f.atributo, [], partes)) p.push(`${qf}: un sí/no que repite la parte «${x}» de su anatomía; lo dice la parte opcional`);
        if (!Array.isArray(f.valores) || f.valores.length < 2) p.push(`${qf}: al menos dos valores`);
        for (const v of f.valores ?? []) if (!posibles.includes(v)) p.push(`${qf}: valor «${v}» fuera de los del atributo`);
        for (const v of repetidos(f.valores ?? [])) p.push(`${qf}: valor «${v}» repetido`);
        if (!(f.valores ?? []).includes(f.por_defecto)) p.push(`${qf}: por_defecto «${f.por_defecto}» no está en sus valores`);
      }
      for (const x of repetidos(t.forma.map((f) => f?.atributo))) p.push(`${q}.forma: atributo «${x}» repetido`);
    }

    // Visual por rol: una propiedad de una parte de su anatomía, con un paso de su escala; nunca un número.
    if (!Array.isArray(t.visual) || t.visual.length === 0) p.push(`${q}: visual es una lista no vacía`);
    else {
      for (const v of t.visual) {
        const qv = `${q}.visual.${v?.propiedad}@${v?.parte}`;
        if (Object.keys(v ?? {}).sort().join() !== "parte,paso,propiedad") p.push(`${qv}: lleva propiedad, parte y paso`);
        if (!Object.hasOwn(props, v?.propiedad ?? "")) { p.push(`${qv}: no es una propiedad de propiedades_visuales`); continue; }
        if (!partes.includes(v.parte)) p.push(`${qv}: la parte no está en su anatomía`);
        if (typeof v.paso !== "string" || !pasosDeEscala(datos, bloques, props[v.propiedad].escala).includes(v.paso)) p.push(`${qv}: paso «${v.paso}» no es un paso de la escala ${props[v.propiedad].escala}`);
      }
      for (const x of repetidos(t.visual.map((v) => `${v?.propiedad}@${v?.parte}`))) p.push(`${q}.visual: «${x}» repetido`);
    }

    // Estados: los de bloques.json; el mínimo de la norma design-complete-states según la interacción.
    const estados = Array.isArray(t.estados) ? t.estados : [];
    if (!Array.isArray(t.estados) || !estados.includes("reposo")) p.push(`${q}: estados es una lista que incluye reposo`);
    for (const e of estados) if (!deBloques("estado", e)) p.push(`${q}: estado «${e}» no es un estado de ops/diseno/bloques.json`);
    for (const e of repetidos(estados)) p.push(`${q}: estado «${e}» repetido`);
    const a = t.accesibilidad ?? {};
    const teclas = Array.isArray(a.teclado) ? a.teclado : [];
    if (t.interaccion === "interactive") {
      const exigidos = [...ESTADOS_DE_INTERACTIVO, ...(SIN_PUNTERO.includes(tipo.plataforma) ? [] : [ESTADO_DE_PUNTERO])];
      for (const e of exigidos) if (!estados.includes(e)) p.push(`${q}: es interactivo y le falta el estado ${e} (norma design-complete-states)`);
      if (a.objetivo_tactil !== "required") p.push(`${q}: es interactivo y su objetivo_tactil es required (norma design-touch-target)`);
      if (!teclas.includes(PARADA_DE_FOCO)) p.push(`${q}: es interactivo y su teclado incluye ${PARADA_DE_FOCO} (norma design-visible-focus)`);
    }
    if (t.interaccion === "static") {
      for (const e of ESTADOS_SOLO_INTERACTIVOS) if (estados.includes(e)) p.push(`${q}: es estático y no puede tener el estado ${e}`);
      if (a.objetivo_tactil !== NO_APLICA) p.push(`${q}: es estático y su objetivo_tactil es ${NO_APLICA}`);
      if (teclas.includes(PARADA_DE_FOCO)) p.push(`${q}: es estático y no es una parada del foco (${PARADA_DE_FOCO})`);
    }
    if (t.interaccion === "container" && a.objetivo_tactil === NO_APLICA) p.push(`${q}: un contenedor tiene objetivo_tactil required o inherited, no ${NO_APLICA}`);

    // Accesibilidad mínima.
    if (Object.keys(a).sort().join() !== [...CAMPOS_DE_ACCESIBILIDAD].sort().join()) p.push(`${q}: accesibilidad lleva exactamente ${CAMPOS_DE_ACCESIBILIDAD.join(", ")}`);
    if (!Array.isArray(a.rol_aria) || a.rol_aria.length === 0) p.push(`${q}: rol_aria es una lista no vacía`);
    for (const r of a.rol_aria ?? []) if (!en("rol_aria", r)) p.push(`${q}: rol_aria «${r}» fuera del vocabulario`);
    for (const r of repetidos(a.rol_aria ?? [])) p.push(`${q}: rol_aria «${r}» repetido`);
    if (!en("nombre_accesible", a.nombre_accesible)) p.push(`${q}: nombre_accesible «${a.nombre_accesible}» fuera del vocabulario`);
    if (!(en("objetivo_tactil", a.objetivo_tactil) || a.objetivo_tactil === NO_APLICA)) p.push(`${q}: objetivo_tactil «${a.objetivo_tactil}» fuera del vocabulario`);
    if (!Array.isArray(a.teclado)) p.push(`${q}: teclado es una lista (vacía si no se maneja con teclado)`);
    for (const k of teclas) if (!en("teclado", k)) p.push(`${q}: teclado «${k}» fuera del vocabulario`);
    for (const k of repetidos(teclas)) p.push(`${q}: teclado «${k}» repetido`);

    // Una plantilla copiada: misma firma (partes y atributos) que otra.
    const firma = firmaDe(t);
    if (firmas.has(firma)) p.push(`${q}: mismas partes y atributos que ${firmas.get(firma)}: es una plantilla copiada`);
    else firmas.set(firma, t.elemento);
  }

  // Lectores: cada valor de un vocabulario propio, cada atributo, cada valor propio y cada propiedad, usado por alguna plantilla.
  const usados = (f) => new Set(plantillas.flatMap(f));
  const uso = {
    interaccion: usados((t) => [t?.interaccion]),
    obligacion_de_parte: usados((t) => (t?.anatomia ?? []).map((a) => a?.obligacion)),
    parte: usados((t) => (t?.anatomia ?? []).map((a) => a?.parte)),
    rol_aria: usados((t) => t?.accesibilidad?.rol_aria ?? []),
    nombre_accesible: usados((t) => [t?.accesibilidad?.nombre_accesible]),
    objetivo_tactil: usados((t) => [t?.accesibilidad?.objetivo_tactil]),
    teclado: usados((t) => t?.accesibilidad?.teclado ?? []),
  };
  for (const [k, s] of Object.entries(uso)) for (const v of Object.keys(V[k] ?? {})) if (!s.has(v)) p.push(`vocabularios.${k}.${v}: ninguna plantilla lo usa`);
  const formaUsada = plantillas.flatMap((t) => t?.forma ?? []);
  for (const [id, a] of Object.entries(atributos)) {
    const deEste = formaUsada.filter((f) => f?.atributo === id);
    if (deEste.length === 0) { p.push(`atributos_de_forma.${id}: ninguna plantilla lo usa`); continue; }
    for (const v of Object.keys(a?.valores ?? {})) if (!deEste.some((f) => (f.valores ?? []).includes(v))) p.push(`atributos_de_forma.${id}.${v}: ninguna plantilla lo usa`);
  }
  const propsUsadas = usados((t) => (t?.visual ?? []).map((v) => v?.propiedad));
  for (const id of Object.keys(props)) if (!propsUsadas.has(id)) p.push(`propiedades_visuales.${id}: ninguna plantilla la usa`);
  return p;
}

/**
 * Cifras para el informe: plantillas frente a elementos de la taxonomía; por plantilla, sus partes (y cuántas obligatorias),
 * atributos de forma, propiedades visuales y estados; plantillas por interacción y por categoría; y las firmas distintas (si
 * es igual al total, ninguna plantilla es copia de otra).
 */
export function cifrasDePlantillas(datos, taxonomia) {
  const ts = datos?.plantillas ?? [];
  const cuenta = (lista) => lista.reduce((o, k) => ({ ...o, [k]: (o[k] ?? 0) + 1 }), {});
  return {
    plantillas: ts.length,
    elementos: (taxonomia?.elemento ?? []).length,
    por_plantilla: Object.fromEntries(ts.map((t) => [t.elemento, {
      partes: (t.anatomia ?? []).length,
      obligatorias: (t.anatomia ?? []).filter((a) => a.obligacion === "required").length,
      atributos: (t.forma ?? []).length,
      visuales: (t.visual ?? []).length,
      estados: (t.estados ?? []).length,
    }])),
    por_interaccion: cuenta(ts.map((t) => t.interaccion)),
    por_categoria: cuenta(ts.map((t) => t.categoria)),
    firmas_distintas: new Set(ts.map(firmaDe)).size,
    atributos_de_forma: Object.keys(datos?.atributos_de_forma ?? {}).length,
    partes_del_vocabulario: Object.keys(datos?.vocabularios?.parte ?? {}).length,
  };
}
