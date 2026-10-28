/**
 * Inventario del diccionario (#939, fase 1): todos los vocabularios cerrados
 * del dominio, de los ocho sitios donde viven hoy, agrupados por concepto,
 * con lo que no cuadra. No cambia nada: mide. De aquí salen las decisiones de
 * la fase 2 (el diccionario único) y la cifra de antes y después.
 *
 * Un CONCEPTO es una idea (el picante, la proteína, la comida del día). Una
 * APARICIÓN es una lista de valores de ese concepto en un sitio concreto. Hoy
 * un concepto aparece en varios sitios, y eso solo vale si dicen lo mismo.
 *
 * Fallos que cuenta, en vocabulario cerrado (FALLOS):
 *   discrepancia     una aparición con valores que su dueño no tiene (el dueño
 *                    es la fuente que va antes en DUENO). Si solo le faltan
 *                    valores, es un RECORTE (lo pedible, a propósito): se lista
 *                    y no cuenta
 *   campo_sin_eje    un campo cerrado de la receta que el registro de ejes
 *                    (src/data/axisRegistry.js) no declara
 *   eje_sin_campo    un eje que dice vivir en un campo de la receta que no existe
 *   copia_literal    un vocabulario del dominio escrito a mano en otro fichero
 *
 * Las apariciones de SISTEMA (motivos de fallo, canario, canales…) no son del
 * dominio de comida y nutrición: se listan aparte y no cuentan.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const FALLOS = ["discrepancia", "campo_sin_eje", "eje_sin_campo", "copia_literal"];

/** De dónde sale cada aparición. Vocabulario cerrado: el informe y el test lo leen. */
export const FUENTES = {
  receta: "src/data/recipeSchema.js",
  ejes: "src/data/axisRegistry.js",
  pedible: "api/_bot/esquemas.js",
  clasificador: "api/_bot/router.js",
  vocabularios: "src/lib/vocabularios.js",
  ficha: "src/lib/registroCampos.js",
  comidas: "src/lib/comidas.js",
  nutrientes: "src/data/nutrientes.js",
  familias: "src/lib/notepadFields.js",
};

/** Quién manda en un concepto, de más a menos: la primera fuente que lo tiene. */
export const DUENO = ["receta", "comidas", "nutrientes", "vocabularios", "ficha", "ejes", "pedible", "clasificador", "familias"];

// Vocabularios de vocabularios.js que son del sistema, no de la comida.
const DE_SISTEMA = new Set([
  "canales", "idiomas", "origen_dato", "ref_tipo", "canales_dato", "motivos_fallo", "sitios_fallo",
  "tipos_aviso_vigia", "chequeos_canario", "motivos_canario", "acciones_alergias", "grados_desarrollo",
  "ambitos_modulo", "estados_metrica", "motivos_sin_puerta", "motivos_tope_diario", "acciones_escritura",
]);
// Campos del clasificador que son de control, no de la comida.
const CONTROL_CLASIFICADOR = new Set(["modo", "varias", "confianza", "sobra", "que", "cuando"]);

// Mismo concepto con otro nombre: clave normalizada → concepto. Solo las que
// se ven hoy; una nueva sale como concepto aparte y se ve en el informe.
const ALIAS = {
  // La etapa de la persona (cremas, mixto, sólidos) no es la de la receta
  // (cremas, sólidos): «mixto» abre las dos (src/lib/babyStage.js).
  etapa_bebe: "etapaBebePersona", etapabebe: "etapaBebe",
  categoria: "category", base: "mainBase", mainbase: "mainBase", proteina: "mainProtein",
  ids_comidas: "comidas", comida: "comidas", comidas: "comidas",
  // «hoy», «el lunes»: cómo se pide un día; el día guardado es «Lun» (src/lib/dias.js).
  dias: "dias", dia: "diaPedido",
  // Los aparatos que declara la casa («Horno») no son los que exige la receta
  // («horno», «gofrera»): src/data/aparatos.test.js vigila que cuadren.
  aparatos: "aparatosDeCasa", requiredappliance: "equipamiento",
  estructura_platos: "mealStructure",
};

/** Tablas «forma de pedir → niveles guardados», y el campo cuyos niveles agrupan. */
const AGRUPA = { PICANTE_PEDIDO: "picante" };
// En lo pedible, esos campos son la forma de pedir, no el nivel.
for (const campo of Object.values(AGRUPA)) ALIAS[`rasgos.${campo}`] = `${campo}Pedido`;

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const conceptoDe = (clave) => ALIAS[norm(clave)] ?? clave;

/** Desenvuelve un tipo de zod (v4): opcional, nulo o por defecto; y las listas. */
function tipoZod(z) {
  let x = z;
  let lista = false;
  for (let i = 0; i < 6; i++) {
    const d = x?._zod?.def ?? x?._def;
    if (!d) return null;
    if (["optional", "nullable", "default"].includes(d.type)) { x = d.innerType; continue; }
    if (d.type === "array") { lista = true; x = d.element; continue; }
    if (d.type === "enum") return { tipo: lista ? "tags" : "enum", valores: Object.values(d.entries) };
    if (d.type === "boolean") return { tipo: "booleano", valores: [] };
    if (d.type === "number") return { tipo: "numerico", valores: [] };
    return { tipo: "abierto", valores: [] };
  }
  return { tipo: "abierto", valores: [] };
}

/** Las enumeraciones de un esquema JSON (las herramientas y el clasificador). */
function enumsDeEsquema(props, prefijo = "") {
  const out = [];
  for (const [k, v] of Object.entries(props ?? {})) {
    const e = v?.enum ?? v?.items?.enum;
    if (Array.isArray(e)) out.push({ clave: prefijo + k, valores: e });
    if (v?.properties) out.push(...enumsDeEsquema(v.properties, `${prefijo}${k}.`));
    if (v?.items?.properties) out.push(...enumsDeEsquema(v.items.properties, `${prefijo}${k}.`));
  }
  return out;
}

/**
 * Todas las apariciones, de los ocho sitios. Recibe los módulos ya importados
 * (así el test y la orden usan lo mismo, y el test puede pasar casos a mano).
 * @returns {Array<{ fuente: string, clave: string, concepto: string, tipo: string, valores: Array<string|number>, sistema?: boolean }>}
 */
export function apariciones(m) {
  const out = [];
  const poner = (fuente, clave, tipo, valores, extra = {}) =>
    out.push({ fuente, clave, tipo, valores: [...valores], ...extra, concepto: conceptoDe(extra.concepto ?? clave) });

  // 1. La receta: cada campo cerrado del esquema de zod.
  const forma = m.receta.RecipeSchema?.shape ?? {};
  for (const [k, z] of Object.entries(forma)) {
    const t = tipoZod(z);
    poner("receta", k, t.tipo, t.valores);
  }
  // Los campos que se añaden al cargar (coste, calorías) también son de la receta.
  for (const k of Object.keys(m.receta.CAMPOS_AL_CARGAR ?? {})) poner("receta", k, "abierto", [], { alCargar: true });
  // 2. El registro de ejes: el vocabulario que declara cada eje.
  for (const e of m.ejes.EJES ?? []) {
    poner("ejes", e.id, e.tipo, Array.isArray(e.vocabulario) ? e.vocabulario : [], { concepto: e.campo || e.id, eje: e, campo: e.campo ?? null });
  }
  // 2b. Las formas de pedir que agrupan niveles guardados (PICANTE_PEDIDO):
  // son su propio concepto, y si no cubren todos los niveles, discrepan.
  for (const [nombre, campo] of Object.entries(AGRUPA)) {
    const tabla = m.receta[nombre];
    if (!tabla) continue;
    const cubiertos = new Set(Object.values(tabla).flat());
    const nivel = out.find((a) => a.fuente === "receta" && a.clave === campo);
    poner("receta", nombre, "enum", Object.keys(tabla), { concepto: `${campo}Pedido`, agrupa: campo, sinCubrir: (nivel?.valores ?? []).filter((v) => !cubiertos.has(v)) });
  }
  // 3. Lo que se puede pedir de un plato.
  for (const { clave, valores } of enumsDeEsquema({ rasgos: m.pedible.ESQUEMA_RASGOS })) {
    poner("pedible", clave, "enum", valores, { concepto: ALIAS[clave] ?? clave.split(".").pop() });
  }
  if (m.pedible.ESQUEMA_BASE) poner("pedible", "base", "enum", m.pedible.ESQUEMA_BASE.enum.filter((v) => v !== m.pedible.OTRA));
  if (m.pedible.ESQUEMA_CATEGORIA) poner("pedible", "categoria", "enum", m.pedible.ESQUEMA_CATEGORIA.enum.filter((v) => v !== m.pedible.OTRA));
  // 4. El formulario del clasificador (sin lo que ya sale de esquemas.js).
  for (const { clave, valores } of enumsDeEsquema(m.clasificador.ESQUEMA?.properties)) {
    const raiz = clave.split(".")[0];
    if (CONTROL_CLASIFICADOR.has(raiz) || ["rasgos", "ejes", "perfil", "base", "categoria"].includes(raiz)) continue;
    poner("clasificador", clave, "enum", valores, { concepto: clave.split(".").pop() });
  }
  // 5. Los vocabularios de la base.
  for (const [k, valores] of Object.entries(m.vocabularios.VOCABULARIOS ?? {})) {
    poner("vocabularios", k, "enum", valores, DE_SISTEMA.has(k) ? { sistema: true } : {});
  }
  // 6. La ficha de la casa y la persona: el campo y el nombre del vocabulario que usa.
  for (const [k, c] of Object.entries(m.ficha.REGISTRO_CAMPOS ?? {})) {
    const voc = c.vocabulario ? m.vocabularios.VOCABULARIOS?.[c.vocabulario] ?? null : null;
    poner("ficha", k, c.tipo, voc ?? [], { concepto: c.vocabulario ?? k, vocabulario: c.vocabulario ?? null, sinLista: Boolean(c.vocabulario && !voc) });
  }
  // 7. Las comidas del día.
  if (m.comidas.IDS_COMIDAS) poner("comidas", "ids_comidas", "enum", m.comidas.IDS_COMIDAS);
  // 9. Las familias del reparto semanal (las claves de freqs).
  if (m.familias?.FAMILIAS) poner("familias", "familias", "enum", m.familias.FAMILIAS);
  // 8. Los nutrientes: un concepto, sus campos por ración.
  if (m.nutrientes.NUTRIENTES) poner("nutrientes", "nutrientes", "numerico", Object.values(m.nutrientes.NUTRIENTES).map((n) => n.porRacion));
  return out;
}

const igual = (a, b) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Agrupa por concepto y saca los fallos. Pura. */
export function inventario(aps) {
  // Los campos abiertos de la receta (texto, listas libres) solo sirven para
  // saber qué campos existen; no son vocabulario.
  const dominio = aps.filter((a) => !a.sistema && a.tipo !== "abierto");
  const porConcepto = new Map();
  for (const a of dominio) porConcepto.set(a.concepto, [...(porConcepto.get(a.concepto) ?? []), a]);

  const fallos = [];
  const recortes = [];
  for (const a of dominio.filter((x) => x.sinCubrir?.length)) {
    fallos.push({ fallo: "discrepancia", concepto: a.concepto, dueno: `receta.${a.agrupa}`, copia: `receta.${a.clave}`, sobran: [], faltan: a.sinCubrir, detalle: `receta.${a.clave} no cubre ${a.sinCubrir.join(", ")}` });
  }
  // Cada aparición contra el dueño de su concepto (solo listas con valores).
  for (const [concepto, lista] of porConcepto) {
    const conValores = lista.filter((a) => a.valores.length && ["enum", "tags"].includes(a.tipo))
      .sort((a, b) => DUENO.indexOf(a.fuente) - DUENO.indexOf(b.fuente));
    const [dueno, ...resto] = conValores;
    for (const b of resto) {
      if (igual(dueno.valores, b.valores)) continue;
      const sobran = b.valores.filter((v) => !dueno.valores.includes(v));
      const faltan = dueno.valores.filter((v) => !b.valores.includes(v));
      const fila = { concepto, dueno: `${dueno.fuente}.${dueno.clave}`, copia: `${b.fuente}.${b.clave}`, sobran, faltan };
      if (sobran.length) fallos.push({ fallo: "discrepancia", ...fila, detalle: `${fila.copia} ≠ ${fila.dueno}` });
      else recortes.push(fila);
    }
  }
  // Campos cerrados de la receta que el registro de ejes no declara. Los
  // nutrientes no cuentan: su registro es nutrientes.js.
  const camposEje = new Set(aps.filter((a) => a.fuente === "ejes" && a.campo).map((a) => String(a.campo).split(/[.[]/)[0]));
  const deNutrientes = new Set(aps.filter((a) => a.fuente === "nutrientes").flatMap((a) => a.valores));
  for (const a of dominio.filter((x) => x.fuente === "receta" && !x.agrupa)) {
    if (!camposEje.has(a.clave) && !deNutrientes.has(a.clave)) fallos.push({ fallo: "campo_sin_eje", concepto: a.concepto, detalle: `receta.${a.clave} (${a.tipo})` });
  }
  // Ejes que dicen vivir en un campo de la receta que no existe.
  const camposReceta = new Set(aps.filter((a) => a.fuente === "receta").map((a) => a.clave));
  for (const a of aps.filter((x) => x.fuente === "ejes" && x.campo && x.eje?.ambito === "receta")) {
    const raiz = String(a.campo).split(/[.[]/)[0];
    if (!camposReceta.has(raiz)) fallos.push({ fallo: "eje_sin_campo", concepto: a.concepto, detalle: `eje ${a.clave} → receta.${a.campo}` });
  }
  return {
    conceptos: [...porConcepto.entries()].map(([concepto, lista]) => ({ concepto, fuentes: [...new Set(lista.map((a) => a.fuente))], apariciones: lista.map((a) => `${a.fuente}.${a.clave}`) }))
      .sort((a, b) => b.fuentes.length - a.fuentes.length || a.concepto.localeCompare(b.concepto)),
    recortes,
    sistema: aps.filter((a) => a.sistema).map((a) => `${a.fuente}.${a.clave}`),
    fallos,
  };
}

/**
 * Copias literales: un vocabulario del dominio (3+ valores) escrito entero a
 * mano en un fichero que no es su dueño. Cuenta toda lista entre corchetes,
 * solo de textos entre comillas, que contenga todos sus valores, en cualquier
 * orden. Un subconjunto (los valores que usa una regla) no es copia. Tests y
 * JSON no cuentan; las listas de la base (CHECK) se comprueban en su test.
 * @param {string} raiz  carpeta del repo
 */
export function copiasLiterales(aps, raiz, carpetas = ["src", "api", "scripts"]) {
  const vocab = aps.filter((a) => ["receta", "vocabularios", "comidas", "familias"].includes(a.fuente) && !a.sistema
    && ["enum", "tags"].includes(a.tipo) && a.valores.length >= 3);
  const ficheros = [];
  const recorrer = (dir) => {
    for (const n of readdirSync(dir)) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.(m?js|jsx)$/.test(n) && !/\.test\./.test(n)) ficheros.push(p);
    }
  };
  for (const c of carpetas) recorrer(join(raiz, c));
  const out = [];
  for (const f of ficheros) {
    const rel = relative(raiz, f).replace(/\\/g, "/");
    const listas = listasLiterales(readFileSync(f, "utf8"));
    for (const a of vocab) {
      if (rel === (DUENO_DE[`${a.fuente}.${a.clave}`] ?? FUENTES[a.fuente])) continue;
      if (listas.some((l) => esCopia(l, a.valores))) {
        out.push({ fallo: "copia_literal", concepto: a.concepto, detalle: `${rel} copia ${a.fuente}.${a.clave}` });
      }
    }
  }
  return out;
}

// Lo que una copia puede añadir sin dejar de ser copia: el plan B de una
// pregunta cerrada. Otro valor de más ya es otro concepto (aporte = familias + patata).
const DE_RESERVA = new Set(["otra", "otro", "ninguna", "ninguno", "no_lo_dice", "cualquiera"]);

/** ¿La lista tiene todos los valores del vocabulario y, de más, solo los de reserva? */
export const esCopia = (lista, valores) =>
  valores.every((v) => lista.has(String(v))) && [...lista].every((v) => valores.includes(v) || DE_RESERVA.has(v));

/** Vocabularios que su fuente importa de otro fichero: ese otro es el dueño. */
const DUENO_DE = {
  "vocabularios.aparatos": "src/lib/electrodomesticos.js",
  "receta.healthFlags": "src/lib/healthFlags.js",
};

/**
 * Las listas entre corchetes hechas solo de textos entre comillas. No cuentan
 * un orden pasado a enOrden() (los valores salen del dueño) ni una lista con
 * repetidos (son pesos de un sorteo, no un vocabulario).
 */
export function listasLiterales(texto) {
  const out = [];
  for (const m of texto.matchAll(/\[([^[\]]*)\]/g)) {
    const dentro = m[1];
    if (!/^\s*(["'][^"'\n]*["']\s*,?\s*)+$/.test(dentro)) continue;
    if (/enOrden\([^()]*,\s*$/.test(texto.slice(Math.max(0, m.index - 80), m.index))) continue;
    const valores = [...dentro.matchAll(/["']([^"'\n]*)["']/g)].map((x) => x[1]);
    const set = new Set(valores);
    if (set.size < valores.length) continue;
    out.push(set);
  }
  return out;
}

/** Cuántos fallos de cada clase. */
export const cifras = (fallos) => Object.fromEntries(FALLOS.map((f) => [f, fallos.filter((x) => x.fallo === f).length]));
