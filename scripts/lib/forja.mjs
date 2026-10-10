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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RUTA_FORJA = "ops/forja.json";
export const RUTA_CAPAS = "ops/forja-capas.json";
export const RUTA_MD = "docs/ops/FORJA.md";
export const RUTA_CAMPOS = "ops/forja-campos.json";

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
/**
 * Solo en la capa subjetiva: `casos_calibracion` (obligatorio, [{ texto, esperado }]
 * con la respuesta conocida), `medidas` ({ coincidencia, repeticiones } del juez
 * sobre esos casos) y `listo_para_subir`.
 */
export const CAMPOS_OPCIONALES = ["casos_calibracion", "medidas", "listo_para_subir"];
/**
 * Un criterio cuyo control lo da otro encargo y aún no existe: `control: "juicio"` provisional, `pendiente_de` (el issue)
 * y `control_pendiente` (el fichero que será su control). En cuanto ese fichero existe, el criterio tiene que pasar a usarlo.
 */
export const CAMPOS_PENDIENTE = ["pendiente_de", "control_pendiente"];
/** Lo que un caso de calibración puede esperar: una respuesta conocida, no un hueco. */
export const ESPERADOS_CALIBRACION = ["cumple", "no_cumple"];

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const FUENTE_F = /^\[F\] https:\/\/[^\s/]+\/\S*$/;
export const FUENTE_I = /^\[I\] (\S+)$/;
export const esTexto = (v, min) => typeof v === "string" && v.trim().length >= min;

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
  const malos = [...problemasDePromocion(datos?.promocion)];
  const umbral = datos?.promocion ?? {};
  const lista = Array.isArray(datos?.criterios) ? datos.criterios : [];
  if (!lista.length) malos.push("el catálogo no tiene criterios");
  const ids = new Set();
  const codigos = new Map();
  for (const c of lista) {
    const d = c?.id ?? "(sin id)";
    for (const k of Object.keys(c ?? {})) if (!CAMPOS.includes(k) && !CAMPOS_OPCIONALES.includes(k) && !CAMPOS_PENDIENTE.concat("tipos").includes(k)) malos.push(`${d}: campo «${k}» no admitido`);
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
    problemasDeTipos(c, d, datos, malos);
    if (!esTexto(c?.texto, 30)) malos.push(`${d}: «texto» dice qué pide, en una frase de treinta caracteres o más`);
    else if (/\n/.test(c.texto)) malos.push(`${d}: «texto» va en una sola línea`);
    if (c?.capa === "subjetiva" && esTexto(c?.texto, 1) && !(/Cumple si/.test(c.texto) && /No cumple si/.test(c.texto))) {
      malos.push(`${d}: un criterio subjetivo lleva su rúbrica: «Cumple si …» y «No cumple si …»`);
    }
    problemasDeCalibracion(c, d, umbral, malos);
    const f = typeof c?.fuente === "string" ? c.fuente : "";
    if (FUENTE_F.test(f)) { /* fuente externa con url */ } else if (FUENTE_I.test(f)) {
      const ruta = f.match(FUENTE_I)[1];
      if (!existe(ruta)) malos.push(`${d}: la fuente de la casa apunta a ${ruta}, que no existe en el repo`);
    } else malos.push(`${d}: «fuente» es «[F] https://…» (externa) o «[I] ruta/del/repo» (de la casa)`);
    problemasDePendiente(c, d, existe, malos);
    const pendiente = "pendiente_de" in (c ?? {});
    const ctl = c?.control;
    if (typeof ctl !== "string" || !ctl.trim()) malos.push(`${d}: sin control: un fichero que lo vigile o «${JUICIO}»`);
    else if (c?.capa === "subjetiva" && ctl !== JUICIO) malos.push(`${d}: un criterio subjetivo se vigila con «${JUICIO}», no con un fichero`);
    else if (c?.capa !== "subjetiva" && ctl === JUICIO && !pendiente) malos.push(`${d}: un criterio ${c?.capa} lo vigila un fichero, no «${JUICIO}» (si solo se puede juzgar, es subjetivo)`);
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

/** `pendiente_de` y `control_pendiente`: van juntos, solo con control «juicio», y caducan cuando el fichero existe. */
function problemasDePendiente(c, d, existe, malos) {
  const tiene = CAMPOS_PENDIENTE.filter((k) => k in (c ?? {}));
  if (!tiene.length) return;
  if (tiene.length !== 2) malos.push(`${d}: pendiente_de y control_pendiente van juntos`);
  if (c.control !== JUICIO) malos.push(`${d}: un criterio pendiente lleva control «${JUICIO}» hasta que exista su fichero`);
  if (c.capa === "subjetiva") malos.push(`${d}: pendiente_de es de un criterio formal o material cuyo control aún no existe`);
  if (typeof c.pendiente_de !== "string" || !/^#[1-9]\d{0,6}$/.test(c.pendiente_de)) malos.push(`${d}: pendiente_de es el issue que lo da (#n)`);
  if (typeof c.control_pendiente !== "string" || !c.control_pendiente.trim()) malos.push(`${d}: control_pendiente es la ruta del fichero que será su control`);
  else if (existe(c.control_pendiente)) malos.push(`${d}: ya existe ${c.control_pendiente}: pon ese fichero como «control» y quita pendiente_de y control_pendiente`);
}

/** El parámetro de promoción: valores de partida, fáciles de cambiar. */
export function problemasDePromocion(p) {
  const malos = [];
  if (!p || typeof p !== "object") return ["falta el bloque «promocion» (coincidencia_minima y repeticiones)"];
  if (typeof p.coincidencia_minima !== "number" || !(p.coincidencia_minima > 0 && p.coincidencia_minima <= 1)) malos.push("promocion.coincidencia_minima es un número mayor que 0 y como mucho 1");
  if (!Number.isInteger(p.repeticiones) || p.repeticiones < 1) malos.push("promocion.repeticiones es un entero de 1 o más");
  return malos;
}

/** Calibración y promoción de un criterio: solo la capa subjetiva las lleva. */
function problemasDeCalibracion(c, d, umbral, malos) {
  if (c?.capa !== "subjetiva") {
    for (const k of CAMPOS_OPCIONALES) if (k in (c ?? {})) malos.push(`${d}: «${k}» es solo de la capa subjetiva`);
    return;
  }
  const casos = c.casos_calibracion;
  if (!Array.isArray(casos) || !casos.length) malos.push(`${d}: un criterio subjetivo lleva al menos un caso de calibración (casos_calibracion: texto de ejemplo y estado esperado)`);
  else {
    for (const k of casos) {
      if (!esTexto(k?.texto, 20)) malos.push(`${d}: un caso de calibración lleva un «texto» de ejemplo de veinte caracteres o más`);
      if (!ESPERADOS_CALIBRACION.includes(k?.esperado)) malos.push(`${d}: el «esperado» de un caso de calibración es ${ESPERADOS_CALIBRACION.join(" o ")}`);
      for (const campo of Object.keys(k ?? {})) if (!["texto", "esperado", "frontera", "nota"].includes(campo)) malos.push(`${d}: un caso de calibración no admite el campo «${campo}»`);
      if ("frontera" in (k ?? {}) && k.frontera !== true) malos.push(`${d}: «frontera» de un caso de calibración es true o no se pone`);
      if (k?.frontera === true && !esTexto(k?.nota, 15)) malos.push(`${d}: un caso de frontera lleva en «nota» su porqué (15 caracteres o más)`);
    }
    if (!casos.some((k) => k?.frontera === true)) malos.push(`${d}: un criterio subjetivo lleva al menos un caso de frontera (frontera: true): dudoso, con respuesta definida y su porqué en la nota`);
  }
  if (!("listo_para_subir" in c)) return;
  if (typeof c.listo_para_subir !== "boolean") { malos.push(`${d}: listo_para_subir es verdadero o falso`); return; }
  if (!c.listo_para_subir) return;
  const m = c.medidas;
  if (!m || typeof m.coincidencia !== "number" || !Number.isInteger(m.repeticiones)) { malos.push(`${d}: listo_para_subir sin medidas válidas ({ coincidencia, repeticiones })`); return; }
  if (m.coincidencia < umbral.coincidencia_minima) malos.push(`${d}: listo_para_subir con coincidencia ${m.coincidencia}; la promoción pide ${umbral.coincidencia_minima}`);
  if (m.repeticiones < umbral.repeticiones) malos.push(`${d}: listo_para_subir con ${m.repeticiones} repeticiones; la promoción pide ${umbral.repeticiones}`);
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

/**
 * El trinquete contra una referencia de git (origin/staging): lo que ya estaba
 * anclado allí no puede desaparecer de las capas actuales ni bajar, salvo que
 * esté en «retirados» con motivo. Cierra el hueco de borrar un criterio del
 * catálogo y de ops/forja-capas.json a la vez. `ref` es el contenido de
 * ops/forja-capas.json en la referencia.
 */
export function problemasContraReferencia(actual, ref) {
  const malos = [];
  const capas = actual?.capas ?? {};
  const retirados = actual?.retirados ?? {};
  for (const [id, capaRef] of Object.entries(ref?.capas ?? {})) {
    if (id in capas) {
      if (rango(capas[id]) < rango(capaRef)) malos.push(`${id}: estaba en ${capaRef} en la referencia y ahora está anclado en ${capas[id]}`);
    } else if (!esTexto(retirados[id]?.motivo, 15)) malos.push(`${id}: estaba anclado en la referencia y ya no está ni en capas ni en «retirados» con motivo`);
  }
  return malos;
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

// ── Los tipos de skill (decisión de Pablo, 10 oct 2026) ───────────────────

/** El tipo cuando ninguna pregunta responde que sí. */
export const TIPO_POR_DEFECTO = "conocimiento";
export const TODOS = "todos";

let preguntasPorDefecto = null;
/** Las preguntas de ops/forja.json (la única fuente de su orden), leídas una vez. */
function leerPreguntas() {
  preguntasPorDefecto ??= leerForja(join(dirname(fileURLToPath(import.meta.url)), "..", "..")).preguntas_tipo;
  return preguntasPorDefecto;
}

/**
 * El tipo de una skill a partir de sus respuestas booleanas: el de la primera pregunta
 * (en el orden de `preguntas_tipo`) con `true`; si no hay ninguna, `conocimiento`.
 * `preguntas` se puede pasar para probar con otro orden.
 */
export function tipoDeSkill(respuestas, preguntas = leerPreguntas()) {
  for (const p of preguntas) if (respuestas?.[p.clave] === true) return p.tipo;
  return TIPO_POR_DEFECTO;
}

/** Si un criterio de skill vale para un tipo: «todos» o una lista que lo nombra. */
export function aplicaATipo(criterio, tipo) {
  if (!criterio.aplica_a.includes("skill")) return false;
  return criterio.tipos === TODOS || (Array.isArray(criterio.tipos) && criterio.tipos.includes(tipo));
}

/** La plantilla de un tipo: los criterios de la base que le tocan (esqueleto → plantilla por tipo → skill). */
export function criteriosDeTipo(datos, tipo) {
  return datos.criterios.filter((c) => aplicaATipo(c, tipo));
}

/** `tipos` de un criterio: obligatorio si se aplica a skills, y solo entonces. */
function problemasDeTipos(c, d, datos, malos) {
  const ids = (datos?.tipos_skill ?? []).map((t) => t.id);
  const aSkill = Array.isArray(c?.aplica_a) && c.aplica_a.includes("skill");
  if (!aSkill) { if ("tipos" in (c ?? {})) malos.push(`${d}: «tipos» es solo de los criterios que se aplican a skills`); return; }
  if (!("tipos" in c)) { malos.push(`${d}: falta «tipos» (${TODOS} o la lista de tipos de skill a los que se aplica)`); return; }
  if (c.tipos === TODOS) return;
  if (!Array.isArray(c.tipos) || !c.tipos.length) { malos.push(`${d}: «tipos» es «${TODOS}» o una lista con al menos un tipo`); return; }
  for (const t of c.tipos) if (!ids.includes(t)) malos.push(`${d}: tipos «${t}» no está en tipos_skill (${ids.join(", ")})`);
  if (new Set(c.tipos).size !== c.tipos.length) malos.push(`${d}: tipos repite un tipo`);
  if (c.tipos.length === ids.length) malos.push(`${d}: tipos lista todos los tipos: pon «${TODOS}»`);
}

/**
 * La taxonomía y la migración. `skills`: los nombres de las skills del repo;
 * `tiposActuales`: ids de ops/flujo.json (tipos_skill); `tipoActualDe`: skill → su metadata.tipo hoy.
 */
export function problemasDeTaxonomia(datos, { skills, tiposActuales, tipoActualDe = {} }) {
  const malos = [];
  const tipos = datos.tipos_skill ?? [];
  const ids = tipos.map((t) => t.id);
  const preguntas = datos.preguntas_tipo ?? [];
  const claves = preguntas.map((p) => p.clave);
  if (ids.length !== 8) malos.push(`tipos_skill tiene ${ids.length} tipos; la decisión de Pablo son 8`);
  if (new Set(ids).size !== ids.length) malos.push("tipos_skill repite un tipo");
  for (const t of tipos) {
    for (const k of ["id", "que", "entra", "sale", "prueba", "skills_hoy"]) if (!(k in t)) malos.push(`tipo ${t.id}: falta «${k}»`);
    if (!ID.test(t.id ?? "")) malos.push(`tipo ${t.id}: el id va en minúsculas con guiones`);
    if (!Array.isArray(t.skills_hoy)) malos.push(`tipo ${t.id}: skills_hoy es una lista`);
  }
  if (new Set(claves).size !== claves.length) malos.push("preguntas_tipo repite una clave");
  for (const p of preguntas) {
    if (!ids.includes(p.tipo)) malos.push(`pregunta ${p.clave}: el tipo «${p.tipo}» no está en tipos_skill`);
    if (!/^[a-z]+(_[a-z]+)*$/.test(p.clave ?? "")) malos.push(`pregunta ${p.clave}: la clave va en minúsculas con guion bajo`);
    if (!esTexto(p.pregunta, 8)) malos.push(`pregunta ${p.clave}: falta la pregunta`);
  }
  if (!ids.includes(TIPO_POR_DEFECTO)) malos.push(`el tipo por defecto «${TIPO_POR_DEFECTO}» no está en tipos_skill`);
  if (ids.filter((i) => i !== TIPO_POR_DEFECTO).some((i) => !preguntas.some((p) => p.tipo === i))) malos.push("hay un tipo (salvo el de por defecto) sin pregunta que lo asigne");
  for (const eje of ["libertad", "invocacion"]) {
    const v = datos[eje];
    if (!v || typeof v !== "object" || !Object.keys(v).length) malos.push(`${eje} es un vocabulario con valores y su explicación`);
  }
  const respuestas = datos.respuestas_tipo ?? {};
  const migracion = datos.migracion_tipos ?? {};
  const provisionales = datos.skills_provisionales ?? {};
  for (const s of skills) {
    const r = respuestas[s];
    if (!r) { malos.push(`${s}: faltan sus respuestas en respuestas_tipo (${claves.join(", ")})`); continue; }
    for (const k of claves) if (typeof r[k] !== "boolean") malos.push(`${s}: la respuesta «${k}» es verdadero o falso`);
    if ("nota" in r && !esTexto(r.nota, 30)) malos.push(`${s}: la nota de sus respuestas dice por qué (30 caracteres o más)`);
    for (const k of Object.keys(r)) if (k !== "nota" && !claves.includes(k)) malos.push(`${s}: respuesta «${k}» no es una pregunta de preguntas_tipo`);
    const derivado = tipoDeSkill(r, preguntas);
    if (migracion[s] !== derivado) malos.push(`${s}: migracion_tipos dice «${migracion[s]}» y sus respuestas dan «${derivado}»`);
    const actual = tipoActualDe[s];
    const destino = datos.destino_tipos_actuales?.[actual]?.destinos;
    if (actual && destino && !destino.includes(derivado)) malos.push(`${s}: era «${actual}» y pasa a «${derivado}», que no es un destino de «${actual}» (${destino.join(", ")})`);
  }
  for (const s of [...Object.keys(respuestas), ...Object.keys(migracion)]) if (!skills.includes(s)) malos.push(`${s}: está en respuestas_tipo o migracion_tipos y no es una skill del repo`);
  for (const [s, p] of Object.entries(provisionales)) {
    if (!skills.includes(s)) malos.push(`${s}: skill provisional que no existe`);
    if (!esTexto(p?.motivo, 30)) malos.push(`${s}: skills_provisionales lleva su motivo (30 caracteres o más)`);
    if (typeof p?.en_tabla !== "boolean") malos.push(`${s}: skills_provisionales dice en_tabla (true si la tabla de Pablo ya la pone en su tipo)`);
  }
  for (const t of tipos) {
    const hoy = skills.filter((s) => migracion[s] === t.id && (!(s in provisionales) || provisionales[s].en_tabla)).sort();
    if (JSON.stringify([...(t.skills_hoy ?? [])].sort()) !== JSON.stringify(hoy)) malos.push(`tipo ${t.id}: skills_hoy es [${(t.skills_hoy ?? []).join(", ")}] y la migración da [${hoy.join(", ")}]`);
  }
  for (const t of tiposActuales) {
    const d = datos.destino_tipos_actuales?.[t];
    if (!d) { malos.push(`el tipo actual «${t}» de ops/flujo.json no tiene destino en destino_tipos_actuales`); continue; }
    if (!Array.isArray(d.destinos) || !d.destinos.length) malos.push(`«${t}»: destinos es una lista con al menos un tipo`);
    for (const x of d.destinos ?? []) if (!ids.includes(x)) malos.push(`«${t}»: el destino «${x}» no está en tipos_skill`);
    if (!esTexto(d.nota, 15)) malos.push(`«${t}»: el destino lleva su nota (15 caracteres o más)`);
  }
  for (const t of Object.keys(datos.destino_tipos_actuales ?? {})) if (!tiposActuales.includes(t)) malos.push(`«${t}»: tiene destino y ya no es un tipo de ops/flujo.json`);
  return malos;
}

// ── Discreto y texto: los campos de cada ficha ─────────────────────────────

export const CLASES_CAMPO = {
  bool: "Verdadero o falso",
  enum: "Un valor de un vocabulario cerrado",
  ref: "Apunta a algo que existe: skill, agente, criterio, ruta, comando, issue o fuente",
  numero: "Un número",
  fecha: "Una fecha AAAA-MM-DD",
  texto: "Prosa: solo como hueco, con su motivo",
};
/** Lo que apunta una `ref`. `fuente` es el id del catálogo de fuentes de los estándares. */
export const REFS_CAMPO = ["skill", "agente", "criterio", "ruta", "comando", "issue", "fuente"];
/** Nivel de una clase para el trinquete: el texto es el hueco; todo lo demás es discreto. */
export const NIVELES_CAMPO = ["texto", "discreto"];
export const nivelDeClase = (clase) => (clase === "texto" ? "texto" : "discreto");
const rangoNivel = (n) => NIVELES_CAMPO.indexOf(n);
const MIN_CUBRE = 30;

/** Errores de la declaración de los campos de un artefacto (lista vacía si está bien). */
export function problemasDeDeclaracion(datos, artefacto, vocabularios = {}) {
  const decl = datos?.campos_ficha?.[artefacto];
  if (!decl?.campos || typeof decl.campos !== "object") return [`${artefacto}: no tiene campos_ficha`];
  const malos = [];
  for (const [nombre, c] of Object.entries(decl.campos)) {
    const d = `${artefacto}.${nombre}`;
    if (!(c?.clase in CLASES_CAMPO)) { malos.push(`${d}: clase «${c?.clase}» no está en el vocabulario (${Object.keys(CLASES_CAMPO).join(", ")})`); continue; }
    if (c.clase === "texto") {
      if (c.hueco !== true) malos.push(`${d}: un texto solo se admite como hueco (hueco: true) con lo que cubre y lo discreto no alcanza`);
      else if (!esTexto(c.cubre, MIN_CUBRE)) malos.push(`${d}: un hueco dice en «cubre» qué cubre que lo discreto no alcanza (${MIN_CUBRE} caracteres o más)`);
    } else if ("hueco" in c || "cubre" in c) malos.push(`${d}: «hueco» y «cubre» son solo de un texto`);
    if (c.clase === "enum" && !(c.vocab in vocabularios)) malos.push(`${d}: un enum lleva su vocab y «${c.vocab}» no existe (${Object.keys(vocabularios).join(", ")})`);
    if (c.clase !== "enum" && "vocab" in c) malos.push(`${d}: «vocab» es solo de un enum`);
    if (c.clase === "ref" && !REFS_CAMPO.includes(c.ref)) malos.push(`${d}: una ref dice a qué apunta (${REFS_CAMPO.join(", ")}), no «${c.ref}»`);
    if (c.clase !== "ref" && "ref" in c) malos.push(`${d}: «ref» es solo de una ref`);
    if ("lista" in c && c.lista !== true) malos.push(`${d}: «lista» es true o no se pone`);
    if (typeof c.obligatorio !== "boolean") malos.push(`${d}: «obligatorio» es verdadero o falso`);
  }
  return malos;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v) => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/**
 * Errores de una ficha de campos (frontmatter de una skill, tarea de un estándar…) contra
 * lo que declara `campos_ficha[artefacto]`. `ctx`: `vocabularios` (nombre → valores) y
 * `existe(tipo, valor)` para las refs a skill, agente, ruta y fuente (criterio se mira en el catálogo).
 * Falla con: un texto sin hueco, un enum fuera de vocabulario, una ref que no existe, un campo sin
 * declarar, uno obligatorio que falta o un valor de otra clase.
 */
export function problemasDeCampos(ficha, artefacto, datos, ctx = {}) {
  const decl = datos?.campos_ficha?.[artefacto];
  if (!decl?.campos) return [`${artefacto}: no tiene campos_ficha`];
  const malos = problemasDeDeclaracion(datos, artefacto, ctx.vocabularios ?? {});
  const clave = decl.clave;
  for (const k of Object.keys(ficha ?? {})) if (k !== clave && !(k in decl.campos)) malos.push(`${artefacto}.${k}: campo no declarado en campos_ficha`);
  for (const [nombre, c] of Object.entries(decl.campos)) {
    const d = `${artefacto}.${nombre}`;
    const v = ficha?.[nombre];
    if (v === undefined || v === null || v === "") { if (c.obligatorio) malos.push(`${d}: falta (es obligatorio)`); continue; }
    const valores = c.lista ? (Array.isArray(v) ? v : null) : [v];
    if (!valores) { malos.push(`${d}: es una lista`); continue; }
    if (c.lista && !valores.length) { malos.push(`${d}: la lista está vacía`); continue; }
    for (const x of valores) {
      const e = problemaDeValor(c, x, datos, ctx);
      if (e) malos.push(`${d}: ${e}`);
    }
  }
  return malos;
}

function problemaDeValor(c, x, datos, ctx) {
  switch (c.clase) {
    case "bool": return typeof x === "boolean" ? null : "no es verdadero o falso";
    case "numero": return typeof x === "number" && Number.isFinite(x) ? null : "no es un número";
    case "fecha": return fechaValida(x) ? null : `«${x}» no es una fecha AAAA-MM-DD válida`;
    case "texto": return c.hueco === true && typeof x === "string" && x.trim() ? null : "un texto sin hueco declarado";
    case "enum": {
      const voc = ctx.vocabularios?.[c.vocab];
      if (!voc) return `su vocabulario «${c.vocab}» no existe`;
      return voc.includes(x) ? null : `«${x}» no está en el vocabulario ${c.vocab} (${voc.join(", ")})`;
    }
    case "ref": {
      if (typeof x !== "string" && c.ref !== "issue") return "una ref es una cadena";
      if (c.ref === "criterio") return datos.criterios.some((k) => k.id === x) ? null : `el criterio «${x}» no existe`;
      if (c.ref === "comando") return /^(npm run [\w:-]+|node \S+\.mjs)( .*)?$/.test(x) ? null : `«${x}» no es un comando (npm run … o node …mjs)`;
      if (c.ref === "issue") return /^#?[1-9]\d{0,6}$/.test(String(x)) ? null : `«${x}» no es un issue (#n)`;
      if (!ctx.existe) return `no se puede comprobar que exista ${c.ref} «${x}»: falta ctx.existe`;
      return ctx.existe(c.ref, x) ? null : `${c.ref} «${x}» no existe`;
    }
    default: return `clase «${c.clase}» desconocida`;
  }
}

/** Campos discretos frente a huecos de texto, por artefacto. */
export function cifrasDeCampos(datos) {
  const r = {};
  for (const [a, decl] of Object.entries(datos.campos_ficha ?? {})) {
    const niveles = Object.values(decl.campos).map((c) => nivelDeClase(c.clase));
    r[a] = { discretos: niveles.filter((n) => n === "discreto").length, huecos: niveles.filter((n) => n === "texto").length, total: niveles.length };
  }
  return r;
}

/**
 * El trinquete de los campos: un campo solo pasa de texto a discreto, nunca al revés, y no desaparece
 * sin motivo. `guardado` es `ops/forja-campos.json`: `{ campos: { "artefacto.campo": "texto"|"discreto" }, retirados }`.
 */
export function problemasDeTrinqueteCampos(datos, guardado) {
  const malos = [];
  const actual = new Map();
  for (const [a, decl] of Object.entries(datos.campos_ficha ?? {})) for (const [n, c] of Object.entries(decl.campos ?? {})) actual.set(`${a}.${n}`, nivelDeClase(c?.clase));
  const campos = guardado?.campos ?? {};
  const retirados = guardado?.retirados ?? {};
  for (const [id, nivel] of Object.entries(campos)) {
    if (!NIVELES_CAMPO.includes(nivel)) { malos.push(`${id}: el nivel guardado «${nivel}» no es del vocabulario (${NIVELES_CAMPO.join(", ")})`); continue; }
    if (!actual.has(id)) { if (!esTexto(retirados[id]?.motivo, 15)) malos.push(`${id}: ha desaparecido de campos_ficha sin dejar su motivo en «retirados» de ${RUTA_CAMPOS} (15 caracteres o más)`); continue; }
    if (rangoNivel(actual.get(id)) < rangoNivel(nivel)) malos.push(`${id}: vuelve de discreto a texto; un campo solo pasa de texto a discreto`);
  }
  for (const [id, r] of Object.entries(retirados)) {
    if (actual.has(id)) malos.push(`${id}: está en «retirados» y sigue en campos_ficha`);
    if (!esTexto(r?.motivo, 15)) malos.push(`${id}: retirado sin motivo (15 caracteres o más)`);
  }
  for (const id of actual.keys()) if (!(id in campos)) malos.push(`${id}: campo sin anclar en ${RUTA_CAMPOS}; lanza «npm run forja -- --escribir» para guardar su nivel`);
  return malos;
}

/** Lo que guarda el trinquete de campos: añade los nuevos y sube de texto a discreto; no baja ni borra. */
export function anclarCampos(datos, guardado) {
  const campos = { ...(guardado?.campos ?? {}) };
  const cambios = [];
  for (const [a, decl] of Object.entries(datos.campos_ficha ?? {})) {
    for (const [n, c] of Object.entries(decl.campos)) {
      const id = `${a}.${n}`;
      const nivel = nivelDeClase(c.clase);
      if (!(id in campos)) { campos[id] = nivel; cambios.push(`${id}: nuevo como ${nivel}`); } else if (rangoNivel(nivel) > rangoNivel(campos[id])) { cambios.push(`${id}: sube de ${campos[id]} a ${nivel}`); campos[id] = nivel; }
    }
  }
  const ordenados = Object.fromEntries(Object.entries(campos).sort(([x], [y]) => x.localeCompare(y)));
  return { guardado: { ...guardado, campos: ordenados, retirados: guardado?.retirados ?? {} }, cambios };
}

export function leerCamposGuardados(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_CAMPOS), "utf8"));
}

// ── Cifras y vista ─────────────────────────────────────────────────────────

/** Criterios de skill por tipo y por capa: lo que pide la plantilla de cada tipo. */
export function cifrasPorTipo(datos) {
  return Object.fromEntries(datos.tipos_skill.map((t) => {
    const porCapa = Object.fromEntries(ORDEN_CAPAS.map((capa) => [capa, criteriosDeTipo(datos, t.id).filter((c) => c.capa === capa).length]));
    return [t.id, { ...porCapa, total: ORDEN_CAPAS.reduce((s, capa) => s + porCapa[capa], 0) }];
  }));
}

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

/** Tipos de skill, su orden de asignación, los ejes y los criterios que pide cada tipo. */
function mdTipos(datos) {
  const porTipo = cifrasPorTipo(datos);
  const capasAlReves = ORDEN_CAPAS.slice().reverse();
  const provisionales = Object.keys(datos.skills_provisionales ?? {}).map((s) => `\`${s}\``).join(", ") || "ninguna";
  return [
    "## Tipos de skill",
    "",
    `Taxonomía decidida por Pablo el 10 oct 2026. Un tipo existe solo si cambia qué entra y sale, cómo se prueba y cómo se corrige. **La fuente de los tipos pasa a ser \`${RUTA_FORJA}\`**; el cambio de la plantilla (\`.claude/PLANTILLA-SKILL.md\`), de \`ops/flujo.json\` y de las skills es del encargo de plantillas por tipo, y hasta entonces siguen los ocho tipos de hoy.`,
    "",
    "| Tipo | Qué hace | Entra → sale | Prueba | Skills de hoy |",
    "|---|---|---|---|---|",
    ...datos.tipos_skill.map((t) => `| ${t.id} | ${celda(t.que)} | ${celda(t.entra)} → ${celda(t.sale)} | ${celda(t.prueba)} | ${t.skills_hoy.length ? t.skills_hoy.join(", ") : "ninguna"} |`),
    "",
    `El tipo de una skill sale de \`tipoDeSkill(respuestas)\`: el de la primera pregunta con sí, en este orden; si ninguna, \`${TIPO_POR_DEFECTO}\`.`,
    "",
    "| # | Clave | Pregunta | Tipo |",
    "|---|---|---|---|",
    ...datos.preguntas_tipo.map((p, i) => `| ${i + 1} | ${p.clave} | ${celda(p.pregunta)} | ${p.tipo} |`),
    "",
    `Skills sin ningún sí (provisionales, con su motivo en \`skills_provisionales\`): ${provisionales}.`,
    "",
    "| Eje de la ficha de una skill | Valores |",
    "|---|---|",
    ...["libertad", "invocacion"].map((e) => `| ${e} | ${Object.keys(datos[e]).join(", ")} |`),
    "",
    "Los tipos de hoy (`ops/flujo.json`) y adónde van:",
    "",
    "| Tipo de hoy | Destino |",
    "|---|---|",
    ...Object.entries(datos.destino_tipos_actuales).map(([t, d]) => `| ${t} | ${d.destinos.join(", ")} |`),
    "",
    "Por skill (`migracion_tipos`, sacada de `tipoDeSkill` y comprobada por `ops/forja.test.js`):",
    "",
    "| Skill | Tipo |",
    "|---|---|",
    ...Object.entries(datos.migracion_tipos).map(([s, t]) => `| ${s} | ${t} |`),
    "",
    "Herencia: esqueleto común (la base) → plantilla por tipo (los criterios que le tocan, `tipos` de cada criterio) → cada skill. Criterios de skill por tipo y capa:",
    "",
    `| Tipo | ${capasAlReves.join(" | ")} | Criterios |`,
    `|${"---|".repeat(ORDEN_CAPAS.length + 2)}`,
    ...datos.tipos_skill.map((t) => `| ${t.id} | ${capasAlReves.map((capa) => porTipo[t.id][capa]).join(" | ")} | ${porTipo[t.id].total} |`),
    "",
  ];
}

/** Discreto y texto: los campos de cada ficha y sus huecos. */
function mdCampos(datos) {
  const k = cifrasDeCampos(datos);
  const L = [
    "## Discreto y texto: los campos de cada ficha",
    "",
    `Se sistematiza lo máximo posible con atributos discretos, aunque lo continuo nunca cabe entero en ellos. Un texto solo se admite como **hueco** (\`hueco: true\`) con una frase que diga qué cubre que lo discreto no alcanza; los textos que lee un LLM rellenan los huecos, y corregir es «qué falla en qué hueco». \`problemasDeCampos\` falla con un texto sin hueco, un enum fuera de vocabulario o una ref que no existe. El trinquete de campos (\`${RUTA_CAMPOS}\`) solo deja pasar un campo de texto a discreto, nunca al revés.`,
    "",
    "| Clase | Qué es |",
    "|---|---|",
    ...Object.entries(CLASES_CAMPO).map(([c, t]) => `| ${c} | ${celda(t)} |`),
    "",
    "| Artefacto | Campos discretos | Huecos de texto | Campos |",
    "|---|---|---|---|",
    ...Object.keys(k).map((a) => `| ${a} | ${k[a].discretos} | ${k[a].huecos} | ${k[a].total} |`),
    "",
  ];
  for (const [a, decl] of Object.entries(datos.campos_ficha)) {
    L.push(`### Campos de ${a}`, "", decl.fuente, "");
    for (const [n, c] of Object.entries(decl.campos)) {
      const que = c.clase === "enum" ? `enum (${c.vocab})` : c.clase === "ref" ? `ref a ${c.ref}` : c.clase;
      L.push(`- \`${n}\` — ${que}${c.lista ? ", lista" : ""}${c.obligatorio ? "" : ", opcional"}${c.hueco ? `. Hueco: ${c.cubre}` : ""}`);
    }
    L.push("");
  }
  return L;
}

/** La forma de cada práctica y el método de construcción: datos declarados, validados por forjaForma. */
function mdForma(datos) {
  const m = datos.metodo_construccion;
  return [
    "## La forma de una práctica",
    "",
    "Datos en `forma_practica` de `ops/forja.json`; se validan con `problemasDePractica` (`scripts/lib/forjaForma.mjs`). El número de bullets, su estructura y la fuente de cada uno son capa formal; la voz, el modo, el tiempo y la persona son capa material, una heurística sobre el texto que **es orientativa hasta que #454 la calibre con estándares reales** (la voz solo mira el verbo que abre la regla; el condicional y el -ó suelto no cuentan como otro tiempo). Aplicarlo a los estándares reales es de #454.",
    "",
    "| Artefacto | Bullets | Estructura de cada bullet | Fuente por bullet | Voz | Modo y tiempo | Persona |",
    "|---|---|---|---|---|---|---|",
    ...Object.entries(datos.forma_practica).map(([a, f]) => `| ${a} | de ${f.bullets.min} a ${f.bullets.max} | ${f.estructura.join(" · ")} | ${f.fuente_por_bullet ? "[F] o [I]" : "no"} | ${f.voz} | ${f.modo_tiempo} | ${f.persona} |`),
    "",
    "## Método de construcción",
    "",
    `Un estándar se escribe tras ${m.rondas_minimas} rondas de investigación o más (${m.fases.join(", ")}), cada una con ${m.fuentes_minimas_por_ronda} fuente o más. Cada ronda deja una línea \`${m.formato_ronda}\` en el campo \`${m.campo}\` de su ficha (clase texto, lista, hueco: el cambio no cabe en un vocabulario). Lo que hoy no lo cumple está en \`ops/forja-excepciones.json\`, que solo baja.`,
    "",
  ];
}

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
    ...mdTipos(datos),
    ...mdCampos(datos),
    ...mdForma(datos),
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
    "## Promoción de una rúbrica",
    "",
    `Un criterio subjetivo lleva casos de calibración (un texto de ejemplo y el estado que se espera, cumple o no_cumple) y solo puede marcarse \`listo_para_subir\` si sus medidas cumplen la promoción: coincidencia del juez con la respuesta conocida de al menos **${datos.promocion.coincidencia_minima}** en **${datos.promocion.repeticiones}** repeticiones.`,
    "",
    "**Estos valores son un primer tiro, pendientes de ajustar con datos.** Están en el bloque `promocion` de `ops/forja.json` y se cambian ahí; aún no hay juez montado ni medidas. Subir de capa sigue siendo editar el criterio; el trinquete (`ops/forja-capas.json`) impide bajar.",
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
        if (c.casos_calibracion) L.push(`  - Calibración: ${c.casos_calibracion.length} casos con respuesta conocida (${c.casos_calibracion.map((k) => k.esperado).join(", ")})${c.listo_para_subir ? ". Listo para subir." : "."}`);
        L.push(`  - Fuente: ${c.fuente}. Control: ${c.control === JUICIO ? "juicio" : `\`${c.control}\``}${c.pendiente_de ? ` (provisional: lo da ${c.pendiente_de} con \`${c.control_pendiente}\`)` : ""}.${c.codigo ? ` Código: \`${c.codigo}\`.` : ""}`);
      }
    }
  }
  return `${L.join("\n")}\n`;
}
