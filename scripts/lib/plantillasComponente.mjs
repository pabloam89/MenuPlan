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
 * (rol ARIA, nombre accesible, objetivo táctil y teclado: normas design-touch-target y design-visible-focus) y `fuentes`
 * (sistema de referencia, URL marcada como en la forja y fecha de comprobación, o `unverified`).
 *
 * Nada se copia: los estados, las categorías, las variantes, los tamaños, las densidades y los tipos de token salen de
 * ops/diseno/bloques.json (`DE_BLOQUES`); las dos marcas (`unverified`, `not-applicable`), del vocabulario `marca` de
 * ops/diseno/bibliotecas.json (#802); las marcas de fuente, de MARCAS_FUENTE de scripts/lib/regla.mjs; la plataforma de cada
 * tipo, de la taxonomía. Los vocabularios propios viven una vez en el JSON, y el código lee exactamente los de
 * `VOCABULARIOS_DE_PLANTILLAS` (un vocabulario sin lector no entra, como en el pool). Cada valor de atributo, parte, rol ARIA,
 * nombre accesible, tecla y sistema de referencia lo usa al menos una plantilla.
 *
 * Lo leen `ops/diseno/plantillas-componente.test.js` (las reglas, con su autotest), `scripts/diseno/plantillas.mjs` (las
 * cifras) y `scripts/lib/vocabulariosVida.mjs` (el ciclo de vida de cada vocabulario, al pedir los textos). Puro: sin red.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NO_APLICA, SIN_COMPROBAR } from "./bibliotecasDiseno.mjs";
import { MARCAS_FUENTE } from "./regla.mjs";

export const RUTA_PLANTILLAS = "ops/diseno/plantillas-componente.json";
export { NO_APLICA, SIN_COMPROBAR };

/** Los vocabularios propios del fichero, por su clave: el test exige que el JSON no tenga ni más ni menos. */
export const VOCABULARIOS_DE_PLANTILLAS = [
  "interaccion", "obligacion_de_parte", "parte", "binario", "rol_aria", "nombre_accesible", "objetivo_tactil", "teclado",
  "sistema_de_referencia", "alcance_de_url",
];
/**
 * Lo que se reutiliza de `vocabularios` de ops/diseno/bloques.json, por el nombre que tiene allí. `categoria` y `estado` los
 * usa la plantilla; `variantes`, `tamaños` y `densidades` pueden ser los valores de un atributo (`valores_de`) o los pasos de
 * una escala (`pasos_de`); `tipo_de_token` es el tipo de cada propiedad visual.
 */
export const DE_BLOQUES = {
  categoria: "categorías de componente",
  estado: "estados",
  tipo_de_token: "tipos de token",
  variantes: "variantes",
  tamaños: "tamaños",
  densidades: "densidades",
};
/** Los vocabularios que un atributo de forma o una escala pueden reutilizar en vez de definir sus valores. */
export const REUTILIZABLES = ["variantes", "tamaños", "densidades", "binario"];
export const CAMPOS_DE_PLANTILLA = ["elemento", "categoria", "interaccion", "anatomia", "forma", "visual", "estados", "accesibilidad", "fuentes"];
export const CAMPOS_DE_ACCESIBILIDAD = ["rol_aria", "nombre_accesible", "objetivo_tactil", "teclado"];
export const CAMPOS_DE_FUENTE = ["sistema", "alcance_url", "fuente", "comprobada"];
/** Lo mínimo de un elemento interactivo (norma design-complete-states); `hover`, además, si su plataforma tiene puntero. */
export const ESTADOS_DE_INTERACTIVO = ["reposo", "foco", "pulsado", "deshabilitado"];
export const ESTADO_DE_PUNTERO = "hover";
/** Los estados que un elemento estático no puede tener: no recibe foco ni responde. */
export const ESTADOS_SOLO_INTERACTIVOS = ["hover", "foco", "pulsado", "deshabilitado"];
/** La interacción de teclado que hace de un elemento una parada del foco: obligatoria si es interactivo, prohibida si es estático. */
export const PARADA_DE_FOCO = "tab-stop";
/** Plataformas de la taxonomía sin puntero (solo app): ahí `hover` no se exige. */
export const SIN_PUNTERO = ["app"];

const FORMA_ID = /^[a-z]+(-[a-z]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FUENTE = new RegExp(`^\\[(${Object.keys(MARCAS_FUENTE).filter((m) => m !== "I").join("|")})\\] (https://\\S+)$`);
const texto = (v, min = 1) => typeof v === "string" && v.trim().length >= min;
const fechaValida = (v) => FECHA.test(v ?? "") && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const repetidos = (lista) => lista.filter((x, i) => lista.indexOf(x) !== i);

export const leerPlantillas = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_PLANTILLAS), "utf8"));

/** Las claves de los vocabularios propios del fichero: salen de él, no se repiten a mano. */
export const clavesDeVocabulario = (datos) => Object.keys(datos?.vocabularios ?? {});

/** Los valores de un vocabulario reutilizable: de bloques.json, o el `binario` propio. */
function valoresReutilizados(nombre, datos, bloques) {
  if (nombre === "binario") return Object.keys(datos?.vocabularios?.binario ?? {});
  return REUTILIZABLES.includes(nombre) ? bloques?.vocabularios?.[nombre] ?? [] : [];
}

/** Los valores posibles de un atributo de forma: los suyos o los del vocabulario que reutiliza. */
export function valoresDeAtributo(datos, bloques, id) {
  const a = datos?.atributos_de_forma?.[id];
  if (!a) return [];
  return a.valores_de ? valoresReutilizados(a.valores_de, datos, bloques) : Object.keys(a.valores ?? {});
}

/** Los pasos de una escala: los suyos o los del vocabulario que reutiliza. */
export function pasosDeEscala(datos, bloques, id) {
  const e = datos?.escalas?.[id];
  if (!e) return [];
  return e.pasos_de ? valoresReutilizados(e.pasos_de, datos, bloques) : Object.keys(e.pasos ?? {});
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
 * `taxonomia`: ops/diseno/taxonomia.json; `bloques`: ops/diseno/bloques.json; `pool`: ops/diseno/bibliotecas.json (su `marca`).
 */
export function problemasDePlantillas(datos, taxonomia, bloques, pool) {
  const p = [];
  const V = datos?.vocabularios ?? {};
  const B = bloques?.vocabularios ?? {};
  const en = (k, x) => Object.prototype.hasOwnProperty.call(V[k] ?? {}, x);
  const deBloques = (k, x) => (B[DE_BLOQUES[k]] ?? []).includes(x);

  // Las marcas son las del pool, una vez (#802): si cambian allí, esto lo nota.
  const marcas = Object.keys(pool?.vocabularios?.marca ?? {});
  if (!marcas.includes(SIN_COMPROBAR) || !marcas.includes(NO_APLICA)) p.push(`marca: ${SIN_COMPROBAR} y ${NO_APLICA} deben estar en el vocabulario marca de ops/diseno/bibliotecas.json`);
  for (const nombre of Object.values(DE_BLOQUES)) if (!Array.isArray(B[nombre]) || B[nombre].length === 0) p.push(`bloques.json: falta el vocabulario «${nombre}» que reutilizan las plantillas`);

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
  if (!fechaValida(datos?.lectura?.fecha)) p.push("lectura.fecha: falta o no es AAAA-MM-DD");
  if (!texto(datos?.lectura?.base, 20)) p.push("lectura.base: falta decir de dónde sale lo escrito y qué está sin comprobar");

  // Raíz de cada sistema de referencia: una por sistema, https y terminada en /.
  const raices = datos?.raiz_de_sistema ?? {};
  for (const s of Object.keys(V.sistema_de_referencia ?? {})) if (!/^https:\/\/\S+\/$/.test(raices[s] ?? "")) p.push(`raiz_de_sistema.${s}: falta la URL raíz (https, acabada en /)`);
  for (const s of Object.keys(raices)) if (!en("sistema_de_referencia", s)) p.push(`raiz_de_sistema.${s}: no es un sistema de sistema_de_referencia`);

  // Atributos de forma: id kebab, qué es, y sus valores propios o los de un vocabulario reutilizable (no los dos).
  const atributos = datos?.atributos_de_forma ?? {};
  if (!esObjeto(atributos) || Object.keys(atributos).length === 0) p.push("atributos_de_forma: no hay ninguno");
  for (const [id, a] of Object.entries(atributos)) {
    const q = `atributos_de_forma.${id}`;
    if (!FORMA_ID.test(id)) p.push(`${q}: el id no es kebab en minúsculas`);
    if (!texto(a?.que, 10)) p.push(`${q}: falta qué es (que)`);
    const extra = Object.keys(a ?? {}).filter((c) => !["que", "valores", "valores_de"].includes(c));
    if (extra.length) p.push(`${q}: campo desconocido (${extra.join(", ")})`);
    if (("valores" in (a ?? {})) === ("valores_de" in (a ?? {}))) { p.push(`${q}: lleva valores o valores_de, uno de los dos`); continue; }
    if (a.valores_de) { if (!REUTILIZABLES.includes(a.valores_de)) p.push(`${q}: valores_de «${a.valores_de}» no es uno de ${REUTILIZABLES.join(", ")}`); continue; }
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
    if (("pasos" in (e ?? {})) === ("pasos_de" in (e ?? {}))) { p.push(`${q}: lleva pasos o pasos_de, uno de los dos`); continue; }
    if (e.pasos_de) { if (!REUTILIZABLES.includes(e.pasos_de) || e.pasos_de === "binario") p.push(`${q}: pasos_de «${e.pasos_de}» no es un vocabulario de bloques.json reutilizable`); continue; }
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
    if (!(x?.escala in escalas)) p.push(`${q}: escala «${x?.escala}» no está en escalas`);
    if (!deBloques("tipo_de_token", x?.tipo_de_token)) p.push(`${q}: tipo_de_token «${x?.tipo_de_token}» no es un tipo de token de ops/diseno/bloques.json`);
  }
  for (const id of Object.keys(escalas)) if (!Object.values(props).some((x) => x?.escala === id)) p.push(`escalas.${id}: ninguna propiedad visual la usa`);

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
    const falta = CAMPOS_DE_PLANTILLA.filter((c) => !(c in (t ?? {})));
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
        if (!(f?.atributo in atributos)) { p.push(`${qf}: no es un atributo de atributos_de_forma`); continue; }
        const posibles = valoresDeAtributo(datos, bloques, f.atributo);
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
        if (!(v?.propiedad in props)) { p.push(`${qv}: no es una propiedad de propiedades_visuales`); continue; }
        if (!partes.includes(v.parte)) p.push(`${qv}: la parte no está en su anatomía`);
        if (typeof v.paso !== "string" || !pasosDeEscala(datos, bloques, props[v.propiedad].escala).includes(v.paso)) p.push(`${qv}: paso «${v.paso}» no es un paso de la escala ${props[v.propiedad].escala}`);
      }
      for (const x of repetidos(t.visual.map((v) => `${v?.propiedad}@${v?.parte}`))) p.push(`${q}.visual: «${x}» repetido`);
    }

    // Estados: los de bloques.json; reglas de la norma design-complete-states según la interacción.
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

    // Fuentes: al menos una; un sistema una vez; URL marcada [F] o [S] bajo la raíz del sistema; comprobada o unverified.
    if (!Array.isArray(t.fuentes) || t.fuentes.length === 0) p.push(`${q}: fuentes es una lista no vacía`);
    for (const f of t.fuentes ?? []) {
      const qf = `${q}.fuentes.${f?.sistema}`;
      if (Object.keys(f ?? {}).sort().join() !== [...CAMPOS_DE_FUENTE].sort().join()) p.push(`${qf}: lleva exactamente ${CAMPOS_DE_FUENTE.join(", ")}`);
      if (!en("sistema_de_referencia", f?.sistema)) { p.push(`${qf}: sistema fuera del vocabulario`); continue; }
      if (!en("alcance_de_url", f.alcance_url)) p.push(`${qf}: alcance_url «${f.alcance_url}» fuera del vocabulario`);
      const m = FUENTE.exec(f.fuente ?? "");
      if (!m) { p.push(`${qf}: fuente es «[F] https://…» o «[S] https://…» (MARCAS_FUENTE de scripts/lib/regla.mjs)`); continue; }
      const raiz = raices[f.sistema] ?? "";
      if (!m[2].startsWith(raiz)) p.push(`${qf}: la URL no cuelga de la raíz del sistema (${raiz})`);
      if (f.alcance_url === "system" && m[2] !== raiz) p.push(`${qf}: alcance system es la raíz del sistema, sin página`);
      if (f.alcance_url === "page" && m[2] === raiz) p.push(`${qf}: alcance page es una página, no la raíz del sistema`);
      if (!(f.comprobada === SIN_COMPROBAR || (fechaValida(f.comprobada) && f.comprobada >= (datos?.lectura?.fecha ?? "9")))) p.push(`${qf}: comprobada es ${SIN_COMPROBAR} o una fecha AAAA-MM-DD no anterior a la lectura`);
    }
    for (const s of repetidos((t.fuentes ?? []).map((f) => f?.sistema))) p.push(`${q}.fuentes: sistema «${s}» repetido`);

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
    sistema_de_referencia: usados((t) => (t?.fuentes ?? []).map((f) => f?.sistema)),
    alcance_de_url: usados((t) => (t?.fuentes ?? []).map((f) => f?.alcance_url)),
    binario: new Set(Object.entries(atributos).filter(([, a]) => a?.valores_de === "binario").length ? Object.keys(V.binario ?? {}) : []),
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
 * atributos de forma, propiedades visuales, estados y fuentes; plantillas por interacción y por categoría; fuentes por
 * sistema, por alcance de la URL y comprobadas frente a `unverified`; plantillas con alguna fuente comprobada; y las firmas
 * distintas (si es igual al total, ninguna plantilla es copia de otra).
 */
export function cifrasDePlantillas(datos, taxonomia) {
  const ts = datos?.plantillas ?? [];
  const fuentes = ts.flatMap((t) => t.fuentes ?? []);
  const cuenta = (lista) => lista.reduce((o, k) => ({ ...o, [k]: (o[k] ?? 0) + 1 }), {});
  const comprobada = (f) => f.comprobada !== SIN_COMPROBAR;
  return {
    plantillas: ts.length,
    elementos: (taxonomia?.elemento ?? []).length,
    por_plantilla: Object.fromEntries(ts.map((t) => [t.elemento, {
      partes: (t.anatomia ?? []).length,
      obligatorias: (t.anatomia ?? []).filter((a) => a.obligacion === "required").length,
      atributos: (t.forma ?? []).length,
      visuales: (t.visual ?? []).length,
      estados: (t.estados ?? []).length,
      fuentes: (t.fuentes ?? []).length,
    }])),
    por_interaccion: cuenta(ts.map((t) => t.interaccion)),
    por_categoria: cuenta(ts.map((t) => t.categoria)),
    fuentes: fuentes.length,
    fuentes_por_sistema: cuenta(fuentes.map((f) => f.sistema)),
    fuentes_por_alcance: cuenta(fuentes.map((f) => f.alcance_url)),
    fuentes_comprobadas: fuentes.filter(comprobada).length,
    fuentes_sin_comprobar: fuentes.filter((f) => !comprobada(f)).length,
    plantillas_con_fuente_comprobada: ts.filter((t) => (t.fuentes ?? []).some(comprobada)).length,
    firmas_distintas: new Set(ts.map(firmaDe)).size,
    atributos_de_forma: Object.keys(datos?.atributos_de_forma ?? {}).length,
    partes_del_vocabulario: Object.keys(datos?.vocabularios?.parte ?? {}).length,
  };
}
