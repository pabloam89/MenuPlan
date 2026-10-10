/**
 * La base común de la forja (#458, fondo #455): una sola fuente de criterios de
 * calidad para skills, estándares de agente y lo que venga.
 *
 * `ops/forja.json` apunta cada criterio con su capa, a qué se aplica, de dónde
 * sale, quién lo vigila y qué código emite el script que lo detecta. Tres capas,
 * porque convertir algo continuo en atributos discretos nunca cubre todo:
 *   - formal: esquema y forma, determinista, test del CI;
 *   - material: heurística automática con lista de excepciones que solo baja;
 *   - subjetiva: una rúbrica escrita que un LLM puntúa sobre casos (los huecos).
 * `docs/ops/FORJA.md` se GENERA de aquí (`npm run forja -- --escribir`) y
 * `ops/forja.test.js` lo compara. La capa de cada criterio queda anclada en
 * `ops/forja-capas.json`: solo sube (subjetiva, material, formal); un criterio
 * no desaparece sin dejar su motivo.
 *
 * El repo es público (#300): este fichero dice QUÉ se pide y QUIÉN lo vigila,
 * nunca cómo se salta un control.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const RUTA_FORJA = "ops/forja.json";
export const RUTA_CAPAS = "ops/forja-capas.json";
export const RUTA_MD = "docs/ops/FORJA.md";

/** Las capas, de más blanda a más dura: el orden es el del trinquete (solo se sube). */
export const ORDEN_CAPAS = ["subjetiva", "material", "formal"];

export const CAPAS_CRITERIO = {
  formal: "Esquema y forma: determinista, lo vigila un test del CI",
  material: "Heurística automática; lo que hoy incumple va a una lista de excepciones que solo baja",
  subjetiva: "Una rúbrica escrita que un LLM puntúa sobre casos; para lo que no se puede discretizar",
};

/** A qué se aplica un criterio. */
export const ARTEFACTOS = {
  skill: "Una skill de .claude/skills/",
  estandar: "El estándar de una tarea de un agente (ops/estandares-agentes.json)",
  agente: "Un agente de .claude/agents/",
};

/**
 * El estado de un criterio sobre un artefacto concreto. Es el vocabulario de las
 * fichas `skill: x criterio: y estado: z` que escribe la forja de skills (#457).
 */
export const ESTADOS_CRITERIO = {
  cumple: "Lo comprobó un control o un juicio y se cumple",
  no_cumple: "Lo comprobó un control o un juicio y no se cumple",
  no_aplica: "El criterio no se aplica a este artefacto",
  juicio: "Pendiente de juicio: lo puntúa un LLM o una persona y aún no se ha hecho",
};
/** Solo el hueco lleva nota de texto: lo que no se cumple o lo que falta por juzgar. */
export const ESTADOS_CON_NOTA = ["no_cumple", "juicio"];

/** El valor de `control` de un criterio de la capa subjetiva. */
export const JUICIO = "juicio";

export const CAMPOS = ["id", "capa", "aplica_a", "texto", "fuente", "control", "codigo"];

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FUENTE_F = /^\[F\] https:\/\/[^\s/]+\/\S*$/;
const FUENTE_I = /^\[I\] (\S+)$/;
const esTexto = (v, min) => typeof v === "string" && v.trim().length >= min;

export function leerForja(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_FORJA), "utf8"));
}

export function leerCapas(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_CAPAS), "utf8"));
}

/**
 * Errores del catálogo, una línea cada uno (lista vacía si está bien).
 * `existe(ruta)` dice si una ruta del repo existe.
 */
export function problemasDeForja(datos, existe) {
  const malos = [];
  const lista = Array.isArray(datos?.criterios) ? datos.criterios : [];
  if (!lista.length) malos.push("el catálogo no tiene criterios");
  const ids = new Set();
  const codigos = new Map();
  for (const c of lista) {
    const d = c?.id ?? "(sin id)";
    for (const k of Object.keys(c ?? {})) if (!CAMPOS.includes(k)) malos.push(`${d}: campo «${k}» no admitido`);
    for (const k of CAMPOS) if (!(k in (c ?? {}))) malos.push(`${d}: falta el campo «${k}»`);
    if (typeof c?.id !== "string" || !ID.test(c.id)) malos.push(`${d}: el id va en minúsculas con guiones`);
    else if (ids.has(c.id)) malos.push(`${d}: id repetido`);
    else ids.add(c.id);
    if (!ORDEN_CAPAS.includes(c?.capa)) malos.push(`${d}: capa «${c?.capa}» no está en el vocabulario (${ORDEN_CAPAS.join(", ")})`);
    const ap = c?.aplica_a;
    if (!Array.isArray(ap) || !ap.length) malos.push(`${d}: aplica_a es una lista con al menos un artefacto`);
    else {
      for (const a of ap) if (!(a in ARTEFACTOS)) malos.push(`${d}: aplica_a «${a}» no está en el vocabulario (${Object.keys(ARTEFACTOS).join(", ")})`);
      if (new Set(ap).size !== ap.length) malos.push(`${d}: aplica_a repite un artefacto`);
    }
    if (!esTexto(c?.texto, 30)) malos.push(`${d}: «texto» dice qué pide, en una frase de treinta caracteres o más`);
    else if (/\n/.test(c.texto)) malos.push(`${d}: «texto» va en una sola línea`);
    if (c?.capa === "subjetiva" && esTexto(c?.texto, 1) && !(/Cumple si/.test(c.texto) && /No cumple si/.test(c.texto))) {
      malos.push(`${d}: un criterio subjetivo lleva su rúbrica: «Cumple si …» y «No cumple si …»`);
    }
    const f = typeof c?.fuente === "string" ? c.fuente : "";
    if (FUENTE_F.test(f)) { /* fuente externa con url */ } else if (FUENTE_I.test(f)) {
      const ruta = f.match(FUENTE_I)[1];
      if (!existe(ruta)) malos.push(`${d}: la fuente de la casa apunta a ${ruta}, que no existe en el repo`);
    } else malos.push(`${d}: «fuente» es «[F] https://…» (externa) o «[I] ruta/del/repo» (de la casa)`);
    const ctl = c?.control;
    if (typeof ctl !== "string" || !ctl.trim()) malos.push(`${d}: sin control: un fichero que lo vigile o «${JUICIO}»`);
    else if (c?.capa === "subjetiva" && ctl !== JUICIO) malos.push(`${d}: un criterio subjetivo se vigila con «${JUICIO}», no con un fichero`);
    else if (c?.capa !== "subjetiva" && ctl === JUICIO) malos.push(`${d}: un criterio ${c?.capa} lo vigila un fichero, no «${JUICIO}» (si solo se puede juzgar, es subjetivo)`);
    else if (ctl !== JUICIO && !existe(ctl)) malos.push(`${d}: su control ${ctl} no existe en el repo`);
    const cod = c?.codigo;
    if (cod !== null && (typeof cod !== "string" || !ID.test(cod))) malos.push(`${d}: «codigo» es null o un código en minúsculas con guiones`);
    else if (typeof cod === "string") {
      if (c?.capa === "subjetiva") malos.push(`${d}: un criterio subjetivo no lo emite ningún script: sin código`);
      if (codigos.has(cod)) malos.push(`${d}: el código «${cod}» ya es de ${codigos.get(cod)}`);
      else codigos.set(cod, d);
    }
  }
  return malos;
}

// ── Los códigos que emiten los scripts ─────────────────────────────────────

/** Los códigos literales que un fuente emite con `falta("x"`, `faltaEstandar("x"` o `defecto("x"`. */
export function codigosDeFuente(texto) {
  return [...String(texto).matchAll(/\b(?:falta|faltaEstandar|defecto)\(\s*"([a-z][\w-]*)"/g)].map((m) => m[1]);
}

/**
 * Los códigos que emiten `skillsForja.mjs` y `higieneSkills.mjs`, sacados del
 * propio código (sus constantes exportadas y los literales de sus llamadas),
 * más las reglas del nivel 1 que ya viven en `ARREGLOS`. `fuentes`: los textos
 * de los dos ficheros. Devuelve Map código → de dónde sale.
 */
export function codigosEmitidos({ CODIGOS_FORJA, CODIGOS_ESTANDAR, CODIGOS_HIGIENE, ARREGLOS, REGLAS }, fuentes) {
  const m = new Map();
  const poner = (codigos, origen) => { for (const c of codigos) if (!m.has(c)) m.set(c, origen); };
  poner(CODIGOS_FORJA, "CODIGOS_FORJA");
  poner(CODIGOS_ESTANDAR, "CODIGOS_ESTANDAR");
  poner(CODIGOS_HIGIENE, "CODIGOS_HIGIENE");
  poner(Object.keys(ARREGLOS), "ARREGLOS");
  // «forja» es el nombre de la regla que agrupa los códigos de la forja, no un código.
  poner(Object.keys(REGLAS).filter((r) => r !== "forja"), "REGLAS");
  for (const [donde, texto] of Object.entries(fuentes)) poner(codigosDeFuente(texto), donde);
  return m;
}

/** Códigos emitidos sin criterio, y criterios con un código que ya nadie emite. */
export function problemasDeCodigos(datos, emitidos) {
  const malos = [];
  const delCatalogo = new Map((datos.criterios ?? []).filter((c) => typeof c.codigo === "string").map((c) => [c.codigo, c.id]));
  for (const [codigo, origen] of emitidos) {
    if (!delCatalogo.has(codigo)) malos.push(`el código «${codigo}» (${origen}) no apunta a ningún criterio de ${RUTA_FORJA}: da de alta su criterio con codigo: "${codigo}"`);
  }
  for (const [codigo, id] of delCatalogo) {
    if (!emitidos.has(codigo)) malos.push(`${id}: su código «${codigo}» ya no lo emite ningún script: ponlo a null o retira el criterio con su motivo`);
  }
  return malos;
}

// ── El trinquete de promoción ──────────────────────────────────────────────

const rango = (capa) => ORDEN_CAPAS.indexOf(capa);

/**
 * El trinquete: la capa de un criterio solo sube (subjetiva, material, formal)
 * y un criterio no desaparece sin su motivo. `guardado` es `ops/forja-capas.json`:
 * `{ capas: { id: capa }, retirados: { id: { motivo } } }`.
 */
export function problemasDeTrinquete(datos, guardado) {
  const malos = [];
  const actual = new Map((datos.criterios ?? []).map((c) => [c.id, c.capa]));
  const capas = guardado?.capas ?? {};
  const retirados = guardado?.retirados ?? {};
  for (const [id, capa] of Object.entries(capas)) {
    if (!ORDEN_CAPAS.includes(capa)) { malos.push(`${id}: la capa guardada «${capa}» no es del vocabulario`); continue; }
    if (!actual.has(id)) {
      if (!esTexto(retirados[id]?.motivo, 15)) malos.push(`${id}: ha desaparecido del catálogo sin dejar su motivo en «retirados» de ${RUTA_CAPAS} (15 caracteres o más)`);
      continue;
    }
    if (rango(actual.get(id)) < rango(capa)) malos.push(`${id}: baja de ${capa} a ${actual.get(id)}; la capa solo sube (subjetiva, material, formal)`);
  }
  for (const [id, r] of Object.entries(retirados)) {
    if (actual.has(id)) malos.push(`${id}: está en «retirados» y sigue en el catálogo`);
    if (!esTexto(r?.motivo, 15)) malos.push(`${id}: retirado sin motivo (15 caracteres o más)`);
  }
  for (const id of actual.keys()) {
    if (!(id in capas)) malos.push(`${id}: criterio sin anclar en ${RUTA_CAPAS}; lanza «npm run forja -- --escribir» para guardar su capa`);
  }
  return malos;
}

/**
 * Lo que guarda el trinquete tras mirar el catálogo: añade los criterios nuevos y
 * sube las capas que han subido. No baja nada ni borra nada: eso es una edición a
 * mano y se ve en el diff. Devuelve { guardado, cambios }.
 */
export function anclarCapas(datos, guardado) {
  const capas = { ...(guardado?.capas ?? {}) };
  const cambios = [];
  for (const c of datos.criterios) {
    if (!(c.id in capas)) { capas[c.id] = c.capa; cambios.push(`${c.id}: nuevo en ${c.capa}`); } else if (rango(c.capa) > rango(capas[c.id])) {
      cambios.push(`${c.id}: sube de ${capas[c.id]} a ${c.capa}`);
      capas[c.id] = c.capa;
    }
  }
  const ordenadas = Object.fromEntries(Object.entries(capas).sort(([a], [b]) => a.localeCompare(b)));
  return { guardado: { ...guardado, capas: ordenadas, retirados: guardado?.retirados ?? {} }, cambios };
}

// ── Las fichas: `skill: x criterio: y estado: z` ───────────────────────────

/** La línea estructurada de una ficha, para que un script la cuente. */
export function lineaDeFicha({ artefacto, nombre, criterio, estado, nota }) {
  return `${artefacto}: ${nombre} criterio: ${criterio} estado: ${estado}${nota ? ` nota: ${nota}` : ""}`;
}

/** Lee una línea de ficha; null si no tiene la forma. */
export function leerFicha(linea) {
  const m = String(linea).match(/^(\S+): (\S+) criterio: (\S+) estado: (\S+)(?: nota: (.+))?$/);
  return m ? { artefacto: m[1], nombre: m[2], criterio: m[3], estado: m[4], nota: m[5] ?? null } : null;
}

/** Errores de una ficha contra el catálogo (lista vacía si está bien). */
export function problemasDeFicha(ficha, datos) {
  if (!ficha) return ["la ficha no tiene la forma «<artefacto>: <nombre> criterio: <id> estado: <estado>»"];
  const malos = [];
  const c = (datos.criterios ?? []).find((x) => x.id === ficha.criterio);
  if (!(ficha.artefacto in ARTEFACTOS)) malos.push(`artefacto «${ficha.artefacto}» no está en el vocabulario`);
  if (!c) malos.push(`el criterio «${ficha.criterio}» no existe en el catálogo`);
  if (!(ficha.estado in ESTADOS_CRITERIO)) malos.push(`estado «${ficha.estado}» no está en el vocabulario (${Object.keys(ESTADOS_CRITERIO).join(", ")})`);
  if (c && ficha.estado !== "no_aplica" && !c.aplica_a.includes(ficha.artefacto)) malos.push(`el criterio «${c.id}» no se aplica a ${ficha.artefacto}: o es «no_aplica» o es otro criterio`);
  if (ficha.nota && !ESTADOS_CON_NOTA.includes(ficha.estado)) malos.push(`la nota solo va con ${ESTADOS_CON_NOTA.join(" o ")}: es para el hueco`);
  return malos;
}

// ── Cifras y vista ─────────────────────────────────────────────────────────

/** Criterios por capa y por artefacto. `total` cuenta cada criterio una vez. */
export function cifras(datos) {
  const porCapa = Object.fromEntries(ORDEN_CAPAS.map((k) => [k, 0]));
  const porCapaYArtefacto = Object.fromEntries(ORDEN_CAPAS.map((k) => [k, Object.fromEntries(Object.keys(ARTEFACTOS).map((a) => [a, 0]))]));
  for (const c of datos.criterios) {
    porCapa[c.capa] += 1;
    for (const a of c.aplica_a) porCapaYArtefacto[c.capa][a] += 1;
  }
  return { total: datos.criterios.length, porCapa, porCapaYArtefacto };
}

const celda = (t) => String(t).replace(/\|/g, "\\|");

/** El contenido entero de docs/ops/FORJA.md, generado del catálogo. */
export function generarMd(datos) {
  const k = cifras(datos);
  const L = [
    "# Forja: criterios de calidad",
    "",
    `<!-- Generado desde ${RUTA_FORJA} con «npm run forja -- --escribir». No se edita a mano: ops/forja.test.js lo compara. -->`,
    "",
    `La única fuente de lo que se le pide a una skill, a un estándar de agente y a lo que venga es \`${RUTA_FORJA}\`. Tres capas, porque convertir algo continuo en atributos discretos nunca cubre todo; para los huecos están los textos que juzga un LLM. La capa de cada criterio solo sube (\`${RUTA_CAPAS}\`).`,
    "",
    "## Cifras",
    "",
    `| Capa | ${Object.keys(ARTEFACTOS).join(" | ")} | Criterios |`,
    `|${"---|".repeat(Object.keys(ARTEFACTOS).length + 2)}`,
    ...ORDEN_CAPAS.slice().reverse().map((capa) => `| ${capa} | ${Object.keys(ARTEFACTOS).map((a) => k.porCapaYArtefacto[capa][a]).join(" | ")} | ${k.porCapa[capa]} |`),
    `| total | ${Object.keys(ARTEFACTOS).map((a) => ORDEN_CAPAS.reduce((s, capa) => s + k.porCapaYArtefacto[capa][a], 0)).join(" | ")} | ${k.total} |`,
    "",
    "Un criterio que se aplica a dos artefactos cuenta en las dos columnas y una vez en el total.",
    "",
    "## Vocabularios",
    "",
    "| Capa | Qué es |",
    "|---|---|",
    ...ORDEN_CAPAS.slice().reverse().map((capa) => `| ${capa} | ${celda(CAPAS_CRITERIO[capa])} |`),
    "",
    "| Estado de una ficha | Qué quiere decir |",
    "|---|---|",
    ...Object.entries(ESTADOS_CRITERIO).map(([e, t]) => `| ${e} | ${celda(t)} |`),
    "",
    `Una ficha es una línea \`<artefacto>: <nombre> criterio: <id> estado: <estado>\`; solo ${ESTADOS_CON_NOTA.join(" y ")} llevan \`nota:\` (el hueco).`,
    "",
    "Marca de la fuente: **[F]** está en una fuente externa (con su URL); **[I]** es de la casa (con la ruta del repo donde está escrito).",
  ];
  for (const capa of ORDEN_CAPAS.slice().reverse()) {
    L.push("", `## Capa ${capa}`, "", CAPAS_CRITERIO[capa] + ".");
    for (const a of Object.keys(ARTEFACTOS)) {
      const de = datos.criterios.filter((c) => c.capa === capa && c.aplica_a.includes(a));
      L.push("", `### ${capa} · ${a} (${de.length})`, "");
      if (!de.length) { L.push("Ninguno todavía."); continue; }
      for (const c of de) {
        L.push(`- \`${c.id}\` — ${c.texto}`);
        L.push(`  - Fuente: ${c.fuente}. Control: ${c.control === JUICIO ? "juicio" : `\`${c.control}\``}.${c.codigo ? ` Código: \`${c.codigo}\`.` : ""}`);
      }
    }
  }
  return `${L.join("\n")}\n`;
}
