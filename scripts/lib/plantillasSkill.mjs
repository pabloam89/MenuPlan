/**
 * La plantilla de cada tipo de skill (#495, fondo #488), generada desde la forja.
 *
 * De arriba abajo: la forja (`ops/forja.json`: qué tipos existen, cómo se asigna
 * el tipo con `preguntas_tipo` y qué criterios se aplican a cada uno con `tipos`)
 * → la plantilla de un tipo (generada aquí: las secciones obligatorias en orden,
 * los campos de la ficha con su clase, cómo se prueba y su ejemplo mínimo) →
 * cada skill. La única lista de tipos es `tipos_skill` de `ops/forja.json`: aquí
 * no se escribe ningún tipo que no esté allí, y el test lo comprueba.
 *
 * Las secciones de cada tipo son el campo `secciones` de su tipo en la forja.
 *
 * Por qué ficheros generados (`.claude/plantillas-skill/<tipo>.md`) y no una
 * sección dentro de `.claude/PLANTILLA-SKILL.md`: cada uno es el molde que se
 * copia al crear una skill de ese tipo, entero y sin tener que saltarse lo de los
 * otros siete; y la plantilla común pasaría de 460 líneas a más del doble con
 * ocho moldes que casi solo cambian en tres secciones. `npm run plantillas`
 * dice si están al día y `npm run plantillas -- --escribir` los regenera;
 * `.claude/plantillas-skill.test.js` falla si no coinciden con lo generado.
 *
 * Lo que aún es texto (el estándar de cada tipo: qué lo hace bueno, sus errores
 * típicos y su ejemplo mínimo) se escribe una vez en `.claude/PLANTILLA-SKILL.md`
 * («El estándar de cada tipo») y de ahí se copia al molde al generarlo.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ORDEN_CAPAS, RUTA_FORJA, TIPO_POR_DEFECTO, criteriosDeTipo, leerForja } from "./forja.mjs";

export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DIR_PLANTILLAS = ".claude/plantillas-skill";
export const RUTA_PLANTILLA_COMUN = ".claude/PLANTILLA-SKILL.md";
export const SECCION_ESTANDARES = "El estándar de cada tipo";

/** Los tipos de skill, en el orden de `ops/forja.json`: la única lista. */
export const tiposDeForja = (datos) => (datos?.tipos_skill ?? []).map((t) => t.id);

/** Las secciones obligatorias, en orden, de cada tipo: `secciones` de cada tipo en `ops/forja.json` (#495). */
export const seccionesDeForja = (datos) =>
  Object.fromEntries((datos?.tipos_skill ?? []).filter((t) => Array.isArray(t.secciones)).map((t) => [t.id, t.secciones]));

/**
 * Las de la forja del repo, leídas una vez: { tipo: [secciones] }. No es otra lista
 * de tipos: sale de `tipos_skill` y cambia con ella.
 */
export const SECCIONES_POR_TIPO = seccionesDeForja(leerForja(RAIZ_REPO));
/** Las del servicio (el runbook de siempre). */
export const SECCIONES_SERVICIO = SECCIONES_POR_TIPO.servicio ?? [];

/** Lo común a los tipos que no son servicio, para escribir una excepción sin copiar nombres. */
export const CABEZA = ["Cuándo y para qué", "Método"];
export const COLA = ["Lo que falló y por qué", "Registro de cambios", "Fuentes y comprobación"];

/**
 * Las skills que hoy no pueden seguir el molde de su tipo sin escribir contenido
 * nuevo, con las secciones que llevan mientras tanto (skill → { secciones,
 * motivo, hasta }). SOLO PUEDE BAJAR, como EXCEPCIONES_FORJA: el test falla con
 * una skill nueva aquí, y con una que ya cumple su molde hasta que se quita. Al
 * migrar los tipos (#495) se quedaron las dos que necesitan secciones que no
 * tienen; renombrar o reordenar no bastaba.
 */
export const EXCEPCIONES_PLANTILLA = {
  issues: {
    secciones: SECCIONES_SERVICIO,
    motivo: "Hoy opera los issues de GitHub como un runbook de servicio; encadenará etapas (Método, Etapas, Registro de cambios) con #414, que es lo que la pone en flujo",
    hasta: "#414",
  },
  "estilo-de-respuesta": {
    secciones: [...CABEZA, "La norma", "Bien y mal", ...COLA],
    motivo: "Es un estándar, no una skill: se muda al artefacto de estándares cuando exista; mientras, cae en conocimiento y no tiene «Lo que hay que saber» ni «Dónde vive el dato»",
    hasta: "el artefacto de estándares",
  },
};
/** Cuántas había al migrar los tipos (10 oct 2026). El test no deja que suba. */
export const EXCEPCIONES_PLANTILLA_INICIALES = 2;

/** Qué va en cada sección: una línea, para el esqueleto del molde. Una por sección que pida algún tipo. */
export const PISTAS = {
  "Qué es y dónde": "Qué es, para qué lo usamos, de quién es y su estado real; **Pendiente:** lo que falta, sin disimular.",
  "Claves y accesos": "Nombres (nunca valores) de claves y accesos y dónde viven; el detalle manda en `ops/INVENTARIO.md`.",
  "Operaciones habituales": "Tabla `| Qué | Comando | Debe salir |`, de más a menos frecuente; lo que pide el OK de Pablo, con «(OK)».",
  "Lo que falló y por qué": "`- **AAAA-MM-DD · síntoma.** Causa: … Arreglo: …`, lo más reciente arriba.",
  "Qué requiere el OK de Pablo": "Una lista de lo que nunca se hace sin su sí explícito.",
  "Coste y límites": "Cuánto cuesta, qué tope muerde y qué lo dispara; «Sin coste propio» si no lo hay.",
  "Fuentes y comprobación": "Enlaces y, en la última línea del fichero, «Comprobado el AAAA-MM-DD: …» o «Sin comprobar: …».",
  "Cuándo y para qué": "El problema que resuelve, qué entra y qué sale, y «No es para:» con la skill vecina.",
  "Método": "Pasos numerados, cada uno con lo que sale, y cuándo se acaba («Sale bien si …»).",
  "Técnicas": "Las técnicas, elegidas por un dato del problema; el detalle de cada una, en `tecnicas/`.",
  "Ejemplo resuelto": "Un caso abstracto y canónico, de punta a punta, que sigue la propia norma de la skill.",
  "Antes de empezar": "Lo que se comprueba antes del primer paso, con lo que debe salir.",
  "Cómo se comprueba": "Cómo se confirma el resultado sin enseñar nada sensible.",
  "Etapas": "Cada etapa con la skill o el agente que la lleva y su puerta: lo que la hace cumplir.",
  "Qué mira": "Cada criterio o código que mira, con su señal observable y el catálogo del que sale (se cita, no se copia), y la pieza mala a propósito que los da todos.",
  "Cómo puntúa": "La gravedad de cada hallazgo (qué bloquea y qué solo avisa), la cifra que sale y qué la hace subir o bajar.",
  "Lo que hay que saber": "Hechos que el modelo no tiene, cada uno con su fuente.",
  "Dónde vive el dato": "Qué dato, su fuente de verdad y cómo se lee; el dato no se copia aquí.",
  "Registro de cambios": "`- **AAAA-MM-DD** · qué cambió (#issue)`, lo más reciente arriba; al menos la primera versión.",
};

/** Errores de la tabla de secciones contra la forja (lista vacía si está bien). */
export function problemasDePlantillas(datos, secciones = seccionesDeForja(datos), pistas = PISTAS) {
  const malos = [];
  const ids = tiposDeForja(datos);
  for (const t of ids) if (!(t in secciones)) malos.push(`tipo ${t}: está en tipos_skill de ${RUTA_FORJA} y no tiene secciones`);
  for (const t of Object.keys(secciones)) if (!ids.includes(t)) malos.push(`tipo ${t}: tiene secciones y no está en tipos_skill de ${RUTA_FORJA} (la única lista de tipos)`);
  for (const [t, ss] of Object.entries(secciones)) {
    if (!Array.isArray(ss) || !ss.length) { malos.push(`tipo ${t}: sus secciones son una lista no vacía`); continue; }
    if (new Set(ss).size !== ss.length) malos.push(`tipo ${t}: repite una sección`);
    if (ss.at(-1) !== "Fuentes y comprobación") malos.push(`tipo ${t}: la última sección es «Fuentes y comprobación» (la de la línea de comprobación)`);
    for (const s of ss) if (!(s in pistas)) malos.push(`tipo ${t}: la sección «${s}» no tiene pista en PISTAS`);
  }
  const usadas = new Set(Object.values(secciones).flat());
  for (const s of Object.keys(pistas)) if (!usadas.has(s)) malos.push(`la pista de «${s}» no es de ninguna sección`);
  return malos;
}

// ── El estándar de cada tipo, leído de la plantilla común ─────────────────

/** Trozos de un texto que empiezan en una cabecera con ese prefijo, sin mirar dentro de los bloques de código. */
function partir(texto, prefijo) {
  const trozos = [];
  let dentro = false;
  for (const l of String(texto).replace(/\r\n/g, "\n").split("\n")) {
    if (/^[ \t]*```/.test(l)) dentro = !dentro;
    if (!dentro && l.startsWith(prefijo)) trozos.push({ titulo: l.slice(prefijo.length).replace(/`/g, "").trim(), texto: "" });
    else if (trozos.length) trozos[trozos.length - 1].texto += `${l}\n`;
  }
  return trozos;
}

/**
 * El estándar de un tipo tal como está en «El estándar de cada tipo» de la
 * plantilla común, con sus cabeceras subidas un nivel (de #### a ###) para el
 * molde; null si no está.
 */
export function estandarDeTipo(plantillaComun, tipo) {
  const seccion = partir(plantillaComun, "## ").find((b) => b.titulo === SECCION_ESTANDARES)?.texto;
  if (seccion === undefined) return null;
  const bloque = partir(seccion, "### ").find((b) => b.titulo === tipo)?.texto;
  if (bloque === undefined) return null;
  let dentro = false;
  return bloque.split("\n").map((l) => {
    if (/^[ \t]*```/.test(l)) dentro = !dentro;
    return !dentro && l.startsWith("#### ") ? l.slice(1) : l;
  }).join("\n").trim();
}

// ── El molde de un tipo ──────────────────────────────────────────────────

const celda = (t) => String(t).replace(/\|/g, "\\|");

/** Cómo llega una skill a este tipo, con las preguntas de la forja y su orden. */
function comoSeLlega(datos, tipo) {
  const preguntas = datos.preguntas_tipo ?? [];
  const i = preguntas.findIndex((p) => p.tipo === tipo);
  const lista = preguntas.map((p, n) => `${n + 1}. \`${p.clave}\` — ${p.pregunta} → \`${p.tipo}\``);
  const regla = i === -1
    ? `Es \`${tipo}\` la skill que responde que no a las ${preguntas.length} preguntas (el tipo por defecto, \`${TIPO_POR_DEFECTO}\`).`
    : `Es \`${tipo}\` la skill que responde que sí a la pregunta ${i + 1} (\`${preguntas[i].clave}\`)${i ? ` y que no a las ${i} anteriores` : ""}.`;
  return [regla, "", "Las preguntas, en el orden en que se hacen; manda la primera con sí:", "", ...lista];
}

/** Los campos de la ficha de una skill, con su clase, de `campos_ficha.skill`. */
function campos(datos, tipo) {
  const decl = datos.campos_ficha?.skill?.campos ?? {};
  const valores = (n, c) => {
    if (n === "tipo") return `\`${tipo}\``;
    if (c.clase === "enum" && datos[c.vocab] && typeof datos[c.vocab] === "object" && !Array.isArray(datos[c.vocab])) return Object.keys(datos[c.vocab]).map((v) => `\`${v}\``).join(", ");
    if (c.clase === "ref") return `${["agente", "criterio", "issue", "comando"].includes(c.ref) ? "un" : "una"} ${c.ref} que existe`;
    if (c.clase === "fecha") return "AAAA-MM-DD";
    if (c.clase === "bool") return "`true` o `false`";
    if (c.clase === "texto") return "hueco de texto";
    return "—";
  };
  return [
    "| Campo | Clase | Obligatorio | Valores |",
    "|---|---|---|---|",
    ...Object.entries(decl).map(([n, c]) => `| \`${n}\` | ${c.clase} | ${c.obligatorio ? "sí" : "no"} | ${celda(valores(n, c))} |`),
  ];
}

/** Los criterios de la forja que le tocan a este tipo, por capa. */
function criterios(datos, tipo) {
  const de = criteriosDeTipo(datos, tipo);
  const L = [`${de.length} criterios de la forja se aplican a este tipo (los que dicen \`tipos: "todos"\` o lo nombran). La frase entera de cada uno, en \`docs/ops/FORJA.md\`.`];
  for (const capa of ORDEN_CAPAS.slice().reverse()) {
    const c = de.filter((x) => x.capa === capa);
    if (!c.length) continue;
    L.push("", `- **${capa}** (${c.length}): ${c.map((x) => `\`${x.id}\``).join(", ")}.`);
  }
  const fuera = datos.criterios.filter((c) => c.aplica_a.includes("skill") && !de.includes(c));
  L.push("", fuera.length ? `No se le aplican: ${fuera.map((x) => `\`${x.id}\``).join(", ")}.` : "No hay criterio de skill que no se le aplique.");
  return L;
}

/** El esqueleto: el frontmatter y las secciones en orden, con lo que va en cada una. */
function esqueleto(datos, tipo, secciones) {
  const cuerpo = secciones.flatMap((s) => [`## ${s}`, "", PISTAS[s] ?? "", ""]);
  // Las respuestas que dan este tipo: sí a su pregunta, no a las demás (conocimiento: no a todas).
  const respuestas = (datos.preguntas_tipo ?? []).map((p) => `  ${p.clave}: ${p.tipo === tipo}`);
  return [
    "```markdown",
    "---",
    "name: <igual que la carpeta>",
    "description: Úsala <cuándo, con las palabras de quien pide>. No para: <lo que es de otra skill, regla o agente>.",
    "metadata:",
    `  tipo: ${tipo}`,
    ...respuestas,
    "  dueno: <agente de .claude/agents/ que la carga en su skills:>",
    "  comprobado: AAAA-MM-DD",
    "---",
    "",
    "# <Nombre>",
    "",
    ...cuerpo,
    "Comprobado el AAAA-MM-DD: <cómo se comprobó, y qué no>.",
    "```",
  ];
}

/**
 * El molde entero de un tipo. `estandar`: el texto de su estándar (de
 * `estandarDeTipo`), o null si la plantilla común aún no lo tiene.
 */
export function generarPlantilla(datos, tipo, { secciones = seccionesDeForja(datos), estandar = null } = {}) {
  const t = (datos.tipos_skill ?? []).find((x) => x.id === tipo);
  if (!t) throw new Error(`el tipo «${tipo}» no está en tipos_skill de ${RUTA_FORJA}`);
  const ss = secciones[tipo];
  if (!ss) throw new Error(`el tipo «${tipo}» no tiene secciones`);
  const L = [
    `# Plantilla de skill: ${tipo}`,
    "",
    `<!-- Generado desde ${RUTA_FORJA} (tipos_skill con sus secciones, preguntas_tipo, campos_ficha y criterios) y el estándar de ${RUTA_PLANTILLA_COMUN}, con «npm run plantillas -- --escribir». No se edita a mano: .claude/plantillas-skill.test.js lo compara. -->`,
    "",
    `El molde de una skill de tipo \`${tipo}\`: se copia el esqueleto y se rellena. Lo que vale para todos los tipos (claves, capas, casos de prueba, tamaño, caducidad) está en \`${RUTA_PLANTILLA_COMUN}\`.`,
    "",
    "| Qué hace | Entra | Sale | Cómo se prueba | Skills de hoy |",
    "|---|---|---|---|---|",
    `| ${celda(t.que)} | ${celda(t.entra)} | ${celda(t.sale)} | ${celda(t.prueba)} | ${t.skills_hoy.length ? t.skills_hoy.map((s) => `\`${s}\``).join(", ") : "ninguna"} |`,
    "",
    "## Cómo se llega a este tipo",
    "",
    ...comoSeLlega(datos, tipo),
    "",
    `Cada skill declara sus respuestas (\`true\` o \`false\` a cada pregunta) en su frontmatter, junto a su \`tipo\`; \`tipoDeSkill\` las convierte en el tipo, y el nivel 1 (\`.claude/skills.test.js\`) falla si el \`tipo\` no es ese. Si una respuesta no es evidente, \`porque_tipo\` dice por qué.`,
    "",
    "## Secciones obligatorias, en orden",
    "",
    ...ss.map((s, i) => `${i + 1}. **${s}**: ${PISTAS[s] ?? ""}`),
    "",
    "Ni una más ni una menos, y ninguna vacía: lo comprueba la regla `secciones` del nivel 1.",
    "",
    "## Esqueleto",
    "",
    ...esqueleto(datos, tipo, ss),
    "",
    "## Campos de la ficha",
    "",
    `Los de \`campos_ficha.skill\` de \`${RUTA_FORJA}\`; lo que no está declarado no va en el frontmatter.`,
    "",
    ...campos(datos, tipo),
    "",
    "## Cómo se prueba",
    "",
    `Lo que pide este tipo: ${t.prueba}. Lo comprueban el nivel 1 (\`npx vitest run .claude/skills.test.js\`, gratis, en el CI) y el nivel 2 (\`npm run skills-prueba -- <skill>\`, cuesta tokens).`,
    "",
    ...criterios(datos, tipo),
    "",
    "## El estándar de este tipo",
    "",
    estandar ?? `Aún no está escrito en «${SECCION_ESTANDARES}» de \`${RUTA_PLANTILLA_COMUN}\`.`,
  ];
  return `${L.join("\n")}\n`;
}

/** Los moldes de todos los tipos: { tipo: texto }. */
export function generarPlantillas(datos, plantillaComun, secciones = seccionesDeForja(datos)) {
  return Object.fromEntries(tiposDeForja(datos).map((t) => [t, generarPlantilla(datos, t, { secciones, estandar: estandarDeTipo(plantillaComun, t) })]));
}

export const rutaPlantilla = (tipo) => `${DIR_PLANTILLAS}/${tipo}.md`;

// ── Una sola lista de tipos ──────────────────────────────────────────────

/**
 * Los literales `[…]` y `{…}` de un fuente JS, a cualquier profundidad, con lo que
 * tienen en su primer nivel: las cadenas sueltas de un array y las claves de un
 * objeto. Lectura aproximada a propósito (no es un parser): salta comentarios y
 * el texto de las cadenas; lo que no entiende lo deja pasar. [{ linea, ids }].
 */
export function contenedoresJs(texto) {
  const t = String(texto);
  const fuera = [];
  const pila = [];
  let linea = 1;
  let i = 0;
  const leerCadena = (q) => {
    let s = "";
    for (i += 1; i < t.length && t[i] !== q; i += 1) {
      if (t[i] === "\\") { s += t[i + 1] ?? ""; i += 1; continue; }
      if (t[i] === "\n") linea += 1;
      s += t[i];
    }
    return s;
  };
  for (; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === "\n") { linea += 1; continue; }
    if (ch === "/" && t[i + 1] === "/") { while (i < t.length && t[i] !== "\n") i += 1; linea += 1; continue; }
    if (ch === "/" && t[i + 1] === "*") { const fin = t.indexOf("*/", i + 2); const trozo = t.slice(i, fin === -1 ? t.length : fin); linea += trozo.split("\n").length - 1; i = fin === -1 ? t.length : fin + 1; continue; }
    const arriba = pila.at(-1);
    if (ch === "\"" || ch === "'" || ch === "`") {
      const s = leerCadena(ch);
      if (!arriba || !/^[\w-]+$/.test(s)) continue;
      const sigue = t.slice(i + 1).match(/^\s*:/);
      if (arriba.tipo === "obj" && sigue) arriba.ids.push(s);
      else if (arriba.tipo === "arr") arriba.ids.push(s);
      continue;
    }
    if (ch === "{" || ch === "[") { pila.push({ tipo: ch === "{" ? "obj" : "arr", ids: [], linea }); continue; }
    if (ch === "}" || ch === "]") { const c = pila.pop(); if (c) fuera.push({ linea: c.linea, ids: c.ids }); continue; }
    if (arriba?.tipo === "obj" && /[A-Za-z_]/.test(ch) && /[{,\s]/.test(t[i - 1] ?? " ")) {
      const m = t.slice(i).match(/^([A-Za-z_][\w]*)\s*:/);
      if (m) { arriba.ids.push(m[1]); i += m[1].length - 1; }
    }
  }
  return fuera;
}

/** A partir de cuántos ids de un vocabulario juntos se considera que hay una lista de tipos. */
export const MIN_IDS_LISTA = 3;

/**
 * Los sitios de un fichero donde se escriben a mano varios tipos de skill juntos
 * (`vocabularios`: { nombre: [ids] }, p. ej. los vigentes y los retirados).
 * Una lista es: en JSON, un array de cadenas, las claves de un objeto o los `id`
 * de un array de objetos; en JS, un literal `[…]` o `{…}` sin anidar (sus cadenas
 * y sus claves); en Markdown, las cabeceras `### \`id\`` y la primera celda de
 * las filas de una tabla. Devuelve [{ ruta, donde, vocabulario, ids }] con las de
 * MIN_IDS_LISTA ids o más de un mismo vocabulario.
 */
export function listasDeTipos(texto, ruta, vocabularios) {
  const fuera = [];
  const mirar = (candidatos, donde) => {
    for (const [nombre, ids] of Object.entries(vocabularios)) {
      const hay = [...new Set(candidatos.filter((c) => ids.includes(c)))];
      if (hay.length >= MIN_IDS_LISTA) fuera.push({ ruta, donde, vocabulario: nombre, ids: hay.sort() });
    }
  };
  const t = String(texto).replace(/\r\n/g, "\n");
  if (ruta.endsWith(".json")) {
    let datos;
    try { datos = JSON.parse(t); } catch (e) {
      // a propósito: un JSON roto no es una lista de tipos; se dice dónde, y el test lo enseña
      return [{ ruta, donde: `no es JSON: ${e.message}`, vocabulario: "-", ids: [] }]; }
    const andar = (v, camino) => {
      if (Array.isArray(v)) {
        mirar(v.filter((x) => typeof x === "string"), camino);
        for (const k of ["id", "tipo"]) mirar(v.map((x) => (x && typeof x === "object" ? x[k] : null)).filter((x) => typeof x === "string"), `${camino}[].${k}`);
        v.forEach((x, i) => andar(x, `${camino}[${i}]`));
      } else if (v && typeof v === "object") {
        mirar(Object.keys(v), `${camino}{}`);
        for (const [k, x] of Object.entries(v)) andar(x, `${camino}.${k}`);
      }
    };
    andar(datos, "$");
  } else if (/\.(m?js|jsx)$/.test(ruta)) {
    for (const c of contenedoresJs(t)) mirar(c.ids, `línea ${c.linea}`);
  } else if (ruta.endsWith(".md")) {
    const cabeceras = [...t.matchAll(/^#{2,4} `?([\w-]+)`?\s*$/gm)].map((x) => x[1]);
    mirar(cabeceras, "cabeceras");
    let tabla = [];
    let inicio = 0;
    t.split("\n").forEach((l, i) => {
      const c = l.match(/^\|\s*(?:\*\*|`)?([\w-]+)(?:\*\*|`)?\s*\|/);
      if (c) { if (!tabla.length) inicio = i + 1; tabla.push(c[1]); return; }
      if (tabla.length) mirar(tabla, `tabla de la línea ${inicio}`);
      tabla = [];
    });
    if (tabla.length) mirar(tabla, `tabla de la línea ${inicio}`);
    // Listas con guiones: los elementos seguidos (con sus líneas de continuación sangradas) son un contenedor.
    let lista = [];
    let desde = 0;
    t.split("\n").forEach((l, i) => {
      const e = l.match(/^[ \t]*[-*][ \t]+(?:\*\*|`)*([\w-]+)(?:\*\*|`)*(?=[\s:.,;)]|$)/);
      if (e) { if (!lista.length) desde = i + 1; lista.push(e[1]); return; }
      if (lista.length && /^[ \t]+\S/.test(l)) return;
      if (lista.length) mirar(lista, `lista de la línea ${desde}`);
      lista = [];
    });
    if (lista.length) mirar(lista, `lista de la línea ${desde}`);
  }
  return fuera;
}

/** Lo que hay en disco frente a lo generado: [{ ruta, estado: igual | distinto | falta | sobra }]. */
export function estadoDePlantillas(raiz = RAIZ_REPO) {
  const datos = leerForja(raiz);
  const comun = readFileSync(join(raiz, RUTA_PLANTILLA_COMUN), "utf8");
  const generadas = generarPlantillas(datos, comun);
  const fuera = Object.entries(generadas).map(([t, texto]) => {
    const abs = join(raiz, rutaPlantilla(t));
    if (!existsSync(abs)) return { ruta: rutaPlantilla(t), estado: "falta", texto };
    return { ruta: rutaPlantilla(t), estado: readFileSync(abs, "utf8") === texto ? "igual" : "distinto", texto };
  });
  const dir = join(raiz, DIR_PLANTILLAS);
  const sobran = existsSync(dir) ? readdirSync(dir).filter((f) => !(f.replace(/\.md$/, "") in generadas)) : [];
  return [...fuera, ...sobran.map((f) => ({ ruta: `${DIR_PLANTILLAS}/${f}`, estado: "sobra", texto: null }))];
}
