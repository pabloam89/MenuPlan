/**
 * Un estándar por tarea de cada agente (#413, fondo #416).
 *
 * `ops/estandares-agentes.json` es la única fuente: para cada agente, la lista
 * de tareas que hace y, por cada una, su estándar (qué es hacerla bien, qué
 * comprueba, qué no hace y qué buena práctica pública lo respalda). La sección
 * «Tareas y su estándar» de cada `.claude/agents/<agente>.md` se GENERA de aquí
 * (`npm run estandar -- --escribir`) y el test la compara: una lista copiada a
 * mano se separaría del fichero (misma lección que `dos-fuentes`).
 *
 * Los agentes con `estado: pendiente` tienen la lista de tareas y aún no el
 * estándar. Es una lista cerrada que SOLO baja (`PENDIENTES_ADMITIDOS`): un
 * agente nuevo nace con todos sus estándares o el test falla.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RUTA_ESTANDARES = "ops/estandares-agentes.json";

export const ESTADOS = {
  completo: "Cada tarea lleva su estándar, lo que comprueba, lo que no hace y su fuente",
  pendiente: "Solo la lista de tareas; el estándar de cada una está por escribir",
};

/** De qué sección del agente sale la tarea: las tareas no se inventan, salen de lo que el agente ya dice. */
export const ORIGENES = ["Misión y alcance", "Disparadores", "Método", "Entregables"];

/**
 * Agentes que aún no tienen sus estándares (#413). Solo baja: se quita de aquí
 * cuando se completa (el test lo exige) y no se añade ninguno, así un agente
 * nuevo tiene que nacer completo.
 */
export const PENDIENTES_ADMITIDOS = ["diseno", "lola", "qa", "evaluador", "auditor-datos"];

export const CAMPOS_TAREA = ["id", "tarea", "origen"];
export const CAMPOS_ESTANDAR = ["estandar", "comprueba", "no_hace", "fuentes"];

/** Dominios de las fuentes públicas admitidas: documentación oficial, no blogs. */
export const DOMINIOS_FUENTE = [
  "google.github.io", "sre.google", "owasp.org", "cheatsheetseries.owasp.org", "genai.owasp.org",
  "postgresql.org", "www.postgresql.org", "wiki.postgresql.org", "supabase.com", "docs.github.com",
  "git-scm.com", "vercel.com", "code.claude.com", "docs.anthropic.com",
];

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const esTexto = (v, min) => typeof v === "string" && v.trim().length >= min;
const esLista = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => esTexto(x, 12));

export function leerEstandares(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_ESTANDARES), "utf8"));
}

/** Los agentes que hay en `.claude/agents/`, por nombre. */
export function agentesEnDisco(raiz) {
  return readdirSync(join(raiz, ".claude", "agents")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort();
}

/**
 * Errores del catálogo, una línea cada uno (lista vacía si está bien).
 * `agentes`: nombres de los ficheros de `.claude/agents/`.
 */
export function problemasDeEstandares(datos, agentes) {
  const malos = [];
  const fuentes = datos?.fuentes ?? {};
  const usadas = new Set();

  for (const [id, f] of Object.entries(fuentes)) {
    if (!ID.test(id)) malos.push(`fuente «${id}»: el id va en minúsculas con guiones`);
    if (!esTexto(f?.nombre, 10)) malos.push(`fuente «${id}»: sin nombre`);
    let host = "";
    try { const u = new URL(f?.url); host = u.hostname; if (u.protocol !== "https:") malos.push(`fuente «${id}»: la url va en https`); } catch { malos.push(`fuente «${id}»: url no válida`); }
    if (host && !DOMINIOS_FUENTE.includes(host)) malos.push(`fuente «${id}»: ${host} no es una documentación admitida (DOMINIOS_FUENTE)`);
  }

  const catalogados = Object.keys(datos?.agentes ?? {});
  for (const a of agentes) if (!catalogados.includes(a)) malos.push(`${a}: el agente existe y no tiene su lista de tareas en ${RUTA_ESTANDARES}`);
  for (const a of catalogados) if (!agentes.includes(a)) malos.push(`${a}: está en ${RUTA_ESTANDARES} y no existe .claude/agents/${a}.md`);

  for (const [nombre, ag] of Object.entries(datos?.agentes ?? {})) {
    if (!(ag?.estado in ESTADOS)) { malos.push(`${nombre}: estado «${ag?.estado}» no está en el vocabulario`); continue; }
    const pendiente = ag.estado === "pendiente";
    if (pendiente && !PENDIENTES_ADMITIDOS.includes(nombre)) malos.push(`${nombre}: pendiente, y un agente nuevo nace con sus estándares completos (PENDIENTES_ADMITIDOS solo baja)`);
    if (!pendiente && PENDIENTES_ADMITIDOS.includes(nombre)) malos.push(`${nombre}: ya está completo; quítalo de PENDIENTES_ADMITIDOS para que no vuelva atrás`);
    const tareas = ag.tareas;
    if (!Array.isArray(tareas) || tareas.length < 3) { malos.push(`${nombre}: la lista de tareas tiene al menos tres`); continue; }
    const ids = new Set();
    for (const t of tareas) {
      const donde = `${nombre}/${t?.id ?? "(sin id)"}`;
      const permitidos = pendiente ? CAMPOS_TAREA : [...CAMPOS_TAREA, ...CAMPOS_ESTANDAR];
      for (const c of Object.keys(t ?? {})) if (!permitidos.includes(c)) malos.push(`${donde}: campo «${c}» no admitido${pendiente && CAMPOS_ESTANDAR.includes(c) ? " en un agente pendiente (o está completo, o no lleva estándar a medias)" : ""}`);
      if (typeof t?.id !== "string" || !ID.test(t.id)) malos.push(`${donde}: el id va en minúsculas con guiones`);
      else if (ids.has(t.id)) malos.push(`${donde}: id repetido`);
      else ids.add(t.id);
      if (!esTexto(t?.tarea, 20)) malos.push(`${donde}: «tarea» dice qué se hace, en una frase`);
      if (!ORIGENES.includes(t?.origen)) malos.push(`${donde}: origen «${t?.origen}» no es una sección del agente (${ORIGENES.join(", ")})`);
      if (pendiente) continue;
      if (!esTexto(t.estandar, 60)) malos.push(`${donde}: sin estándar (qué es hacerla bien, en una o dos frases)`);
      if (!esLista(t.comprueba)) malos.push(`${donde}: «comprueba» es una lista de comprobaciones`);
      if (!esLista(t.no_hace)) malos.push(`${donde}: «no_hace» es una lista de lo que queda fuera`);
      if (!Array.isArray(t.fuentes) || !t.fuentes.length) malos.push(`${donde}: sin fuente citada`);
      else for (const f of t.fuentes) {
        if (!(f in fuentes)) malos.push(`${donde}: la fuente «${f}» no está en el catálogo de fuentes`);
        usadas.add(f);
      }
    }
  }
  for (const f of Object.keys(fuentes)) if (!usadas.has(f)) malos.push(`fuente «${f}»: ninguna tarea la cita`);
  return malos;
}

/** Cifras: tareas totales y con estándar, por agente y en conjunto. */
export function contar(datos) {
  const porAgente = {};
  let total = 0;
  let conEstandar = 0;
  for (const [n, ag] of Object.entries(datos.agentes)) {
    const t = ag.tareas.length;
    const c = ag.estado === "completo" ? t : 0;
    porAgente[n] = { estado: ag.estado, tareas: t, conEstandar: c };
    total += t; conEstandar += c;
  }
  return { total, conEstandar, pendientes: total - conEstandar, porAgente };
}

const TITULO = "## Tareas y su estándar";

/** El texto de la sección que cada agente lleva, generado desde el catálogo. */
export function renderSeccion(nombre, datos) {
  const ag = datos.agentes[nombre];
  const lineas = [
    TITULO,
    "",
    `Fuente única: \`${RUTA_ESTANDARES}\`. Esta lista la genera \`npm run estandar -- --escribir\` y`,
    "`ops/estandares-agentes.test.js` la compara; no se edita a mano. El detalle de cada",
    `tarea (estándar, qué comprueba, qué no hace y su fuente): \`npm run estandar -- ${nombre} <tarea>\`.`,
    "",
  ];
  if (ag.estado === "pendiente") lineas.push("Estado: pendiente. Lista de tareas hecha; el estándar de cada una está por escribir (#413).", "");
  for (const t of ag.tareas) lineas.push(`- \`${t.id}\` — ${t.tarea}`);
  return lineas.join("\n");
}

/** La sección «Tareas y su estándar» que hay en el texto de un agente (hasta el final o la siguiente `## `). */
export function extraerSeccion(md) {
  const texto = md.replace(/\r\n/g, "\n");
  const i = texto.indexOf(`\n${TITULO}\n`);
  if (i === -1) return null;
  const resto = texto.slice(i + 1);
  const fin = resto.slice(TITULO.length).search(/\n## /);
  return (fin === -1 ? resto : resto.slice(0, TITULO.length + fin)).trimEnd();
}

/** Pone o sustituye la sección en el texto de un agente. */
export function conSeccion(md, seccion) {
  const texto = md.replace(/\r\n/g, "\n");
  const actual = extraerSeccion(texto);
  if (actual !== null) return texto.replace(actual, () => seccion);
  return `${texto.trimEnd()}\n\n${seccion}\n`;
}

/** Escribe la sección de cada agente. Devuelve los que cambió. */
export function escribirSecciones(raiz, datos) {
  const cambiados = [];
  for (const nombre of Object.keys(datos.agentes)) {
    const ruta = join(raiz, ".claude", "agents", `${nombre}.md`);
    if (!existsSync(ruta)) continue;
    const antes = readFileSync(ruta, "utf8");
    const despues = conSeccion(antes, renderSeccion(nombre, datos));
    if (despues !== antes.replace(/\r\n/g, "\n")) { writeFileSync(ruta, despues); cambiados.push(nombre); }
  }
  return cambiados;
}

/** El estándar de una tarea en texto, y la línea que el brief pasa al agente. */
export function textoDeTarea(nombre, idTarea, datos) {
  const ag = datos.agentes[nombre];
  if (!ag) return null;
  const t = ag.tareas.find((x) => x.id === idTarea);
  if (!t) return null;
  const linea = `ESTÁNDAR A CUMPLIR: ${nombre}/${t.id}`;
  if (ag.estado === "pendiente") return `${linea}\nTarea: ${t.tarea}\nEstándar: pendiente de escribir (#413). Dilo en el informe: «ESTÁNDAR: ${nombre}/${t.id} (pendiente)».`;
  const lista = (xs) => xs.map((x) => `  - ${x}`).join("\n");
  const fuentes = t.fuentes.map((f) => `  - ${datos.fuentes[f].nombre}: ${datos.fuentes[f].url}`).join("\n");
  return [linea, `Tarea: ${t.tarea}`, `Estándar: ${t.estandar}`, `Comprueba:\n${lista(t.comprueba)}`, `No hace:\n${lista(t.no_hace)}`, `Fuentes:\n${fuentes}`].join("\n");
}
