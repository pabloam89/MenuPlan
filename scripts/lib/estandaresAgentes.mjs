/**
 * Un estándar por tarea de cada agente, escrito por campos (#413, fondo #416; #516, fondo #488).
 *
 * `ops/estandares-agentes.json` es la única fuente. Cada agente lista las tareas que
 * hace; cada tarea lleva su acción (vocabulario cerrado `acciones`) y sus reglas, y
 * cada regla sigue la plantilla de `regla.mjs` (nombre, sujeto, fuerza, condicion,
 * exigencia, nota) más lo que pide la forma de práctica de `ops/forja.json`
 * (`forma_practica.estandar`): porque, ejemplo bueno, ejemplo malo y fuente. La frase
 * de cada regla se genera; no hay un campo de prosa libre con el estándar.
 *
 * De arriba abajo, como en las skills (`plantillasSkill.mjs`):
 *   vocabularios del catálogo (acciones, origenes, sujetos) → comunes (el estándar de
 *   una tarea que hacen varios agentes, escrito una vez) → la tarea de cada agente.
 * Aquí no se reutiliza `plantillasSkill.mjs` ni `faltasDeNiveles`: generan un molde de
 * secciones por tipo de skill (el tipo está en `tipos_skill` de la forja) y una tarea de
 * agente no tiene tipo ni secciones, solo reglas. Lo que sí se comparte es lo de abajo
 * del patrón: `regla.mjs` para la regla, `forjaForma.mjs` para la forma de la práctica y
 * `ops/forja.json` como única fuente de cuántas reglas lleva una tarea.
 *
 * Salen de aquí, y el test las compara: la sección «Tareas y su estándar» de cada
 * `.claude/agents/<agente>.md` (`npm run estandar -- --escribir`) y la tabla
 * `docs/ops/ESTANDARES.md`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTROL_JUICIO, fraseDeRegla, problemasDeRegla, problemasDeSujetos } from "./regla.mjs";
import { problemasDePractica } from "./forjaForma.mjs";
import { leerForja } from "./forja.mjs";

export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUTA_ESTANDARES = "ops/estandares-agentes.json";
export const RUTA_MD = "docs/ops/ESTANDARES.md";

export const leerEstandares = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_ESTANDARES), "utf8"));
const DEL_REPO = leerEstandares(RAIZ_REPO);

/** Las acciones y los orígenes de una tarea: la única lista está en el JSON (`acciones` y `origenes`). */
export const ACCIONES = Object.keys(DEL_REPO.acciones ?? {});
export const ORIGENES = Object.keys(DEL_REPO.origenes ?? {});

/**
 * Agentes que aún no tienen sus estándares (#413). Está en cero desde #516: un agente
 * nuevo nace con todas sus tareas y reglas, o el test falla. No se añade ninguno.
 */
export const PENDIENTES_ADMITIDOS = [];

/** Lo que lleva una tarea, lo que lleva una común y lo que lleva cada regla (y cuáles son opcionales). */
export const CAMPOS_TAREA = ["id", "tarea", "accion", "origen", "comunes", "reglas", "no_hace", "rondas"];
export const CAMPOS_COMUN = ["tarea", "accion", "reglas", "rondas"];
export const CAMPOS_ESTANDAR = ["nombre", "sujeto", "fuerza", "condicion", "exigencia", "nota", "control", "fuente", "porque", "ejemplo_bueno", "ejemplo_malo"];
const OPCIONALES = ["condicion", "nota"];

/** Dominios de las fuentes externas admitidas: documentación oficial, no blogs. */
export const DOMINIOS_FUENTE = [
  "google.github.io", "sre.google", "owasp.org", "cheatsheetseries.owasp.org", "genai.owasp.org",
  "postgresql.org", "www.postgresql.org", "wiki.postgresql.org", "supabase.com", "docs.github.com",
  "git-scm.com", "vercel.com", "code.claude.com", "docs.anthropic.com",
  "platform.claude.com", "www.anthropic.com", "www.w3.org", "developer.mozilla.org", "web.dev",
  "playwright.dev", "developer.chrome.com", "learn.microsoft.com", "m3.material.io", "www.designtokens.org",
];

/** Extensiones de lo que puede vigilar una regla: un test, un hook, un script o un workflow, no un documento. */
const CONTROL_EJECUTABLE = /\.(m?js|jsx|cjs|ya?ml)$/;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const esTexto = (v, min) => typeof v === "string" && v.trim().length >= min;
const esLista = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => esTexto(x, 12));

/** Los agentes que hay en `.claude/agents/`, por nombre. */
export function agentesEnDisco(raiz) {
  return readdirSync(join(raiz, ".claude", "agents")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort();
}

/** La fuente en la forma de la forja: «[F] https://…» o «[I] ruta/del/repo». */
export function fuenteMarcada(fuentes, id) {
  const f = fuentes?.[id];
  if (!f) return null;
  return f.tipo === "casa" ? `[I] ${f.ruta}` : `[F] ${f.url}`;
}

/** La frase de una regla sin el «Se comprueba con»: el control va en su columna. */
export const fraseDeEstandar = (r, sujetos) => fraseDeRegla(r, sujetos).replace(/ Se comprueba con: .*$/, "");

/** Las reglas propias de una tarea y las de sus comunes, para contarlas. */
export const reglasDeTarea = (t, datos) => [...(t.reglas ?? []), ...(t.comunes ?? []).flatMap((c) => datos.comunes?.[c]?.reglas ?? [])];

/** Errores de una lista de reglas (propias o de una común): campos, plantilla, práctica, control y fuente. */
function problemasDeReglas(reglas, d, datos, { raiz, forja }) {
  const malos = [];
  const nombres = new Set();
  reglas.forEach((r, i) => {
    const donde = `${d} · regla ${r?.nombre ?? i + 1}`;
    for (const c of Object.keys(r ?? {})) if (!CAMPOS_ESTANDAR.includes(c)) malos.push(`${donde}: campo «${c}» no admitido`);
    for (const c of CAMPOS_ESTANDAR) if (!OPCIONALES.includes(c) && !(c in (r ?? {}))) malos.push(`${donde}: falta «${c}»`);
    malos.push(...problemasDeRegla(r, donde, datos.sujetos));
    if (nombres.has(r?.nombre)) malos.push(`${donde}: nombre repetido en la tarea`);
    nombres.add(r?.nombre);
    // El control: un fichero que exista y sea de verdad un mecanismo (test, hook, script o workflow), o juicio.
    const c = r?.control;
    if (!esTexto(c, 1)) malos.push(`${donde}: falta «control»`);
    else if (c !== CONTROL_JUICIO) {
      if (!CONTROL_EJECUTABLE.test(c)) malos.push(`${donde}: el control ${c} no es un test, un hook, un script ni un workflow; si lo vigila una persona, es «juicio»`);
      else if (raiz && !existsSync(join(raiz, c))) malos.push(`${donde}: el control ${c} no existe en el repo`);
    }
    if (!(r?.fuente in (datos.fuentes ?? {}))) malos.push(`${donde}: la fuente «${r?.fuente}» no está en el catálogo de fuentes`);
  });
  // La forma de práctica de la forja: estructura del bullet y fuente por bullet (la capa formal). El número de
  // bullets se mira aparte (las propias y las comunes cuentan distinto) y la voz, el modo y la persona (capa
  // material) no se aplican: la frase se genera en tercera persona normativa y la práctica pide imperativo en segunda.
  if (forja && reglas.every((r) => r && datos.sujetos?.[r.sujeto] && datos.fuentes?.[r.fuente] && r.fuerza in FUERZA_OK)) {
    const bullets = reglas.map((r) => ({ regla: fraseDeEstandar(r, datos.sujetos), porque: r.porque, ejemplo_bueno: r.ejemplo_bueno, ejemplo_malo: r.ejemplo_malo, fuente: fuenteMarcada(datos.fuentes, r.fuente) }));
    const existe = (ruta) => (raiz ? existsSync(join(raiz, ruta)) : true);
    for (const p of problemasDePractica({ bullets }, "estandar", forja, existe)) {
      if (p.criterio === "practica-numero-de-bullets" || p.capa !== "formal") continue;
      malos.push(`${d}: ${p.mensaje}`);
    }
  }
  return malos;
}
const FUERZA_OK = { debe: 1, no_debe: 1, conviene: 1 };

/**
 * Errores del catálogo, una línea cada uno (lista vacía si está bien).
 * `agentes`: nombres de los ficheros de `.claude/agents/`. `raiz`: la del repo, para comprobar rutas y secciones.
 */
export function problemasDeEstandares(datos, agentes, raiz = null) {
  const malos = [];
  const fuentes = datos?.fuentes ?? {};
  const usadas = new Set();
  const forja = raiz ? leerForja(raiz) : null;
  // Cuántas reglas lleva una tarea: la única fuente es la forma de práctica de la forja (2 a 5 hoy).
  const { min, max } = forja?.forma_practica?.estandar?.bullets ?? { min: 2, max: 5 };

  // Los vocabularios del catálogo.
  for (const v of ["acciones", "origenes"]) {
    const voc = datos?.[v];
    if (!voc || typeof voc !== "object" || !Object.keys(voc).length) { malos.push(`${v}: el catálogo declara su vocabulario cerrado`); continue; }
    for (const [id, def] of Object.entries(voc)) {
      if (!ID.test(id)) malos.push(`${v} «${id}»: el id va en minúsculas`);
      if (!esTexto(def, 5)) malos.push(`${v} «${id}»: sin definición`);
    }
  }
  malos.push(...problemasDeSujetos(datos?.sujetos, datos?.artefactos ?? []).map((x) => `sujetos: ${x}`));

  for (const [id, f] of Object.entries(fuentes)) {
    if (!ID.test(id)) malos.push(`fuente «${id}»: el id va en minúsculas con guiones`);
    if (!esTexto(f?.nombre, 10)) malos.push(`fuente «${id}»: sin nombre`);
    if (f?.tipo === "casa") {
      // Regla de la casa: criterio nuestro, con la ruta del repo donde está escrito.
      if (typeof f.ruta !== "string" || !f.ruta) malos.push(`fuente «${id}»: de la casa, sin ruta`);
      else if (raiz && !existsSync(join(raiz, f.ruta))) malos.push(`fuente «${id}»: la ruta ${f.ruta} no existe en el repo`);
      if (f.url) malos.push(`fuente «${id}»: una fuente de la casa lleva ruta y no url`);
      continue;
    }
    if (f?.tipo !== undefined && f.tipo !== "externa") malos.push(`fuente «${id}»: tipo «${f.tipo}» no es casa ni externa`);
    let host = "";
    try { const u = new URL(f?.url); host = u.hostname; if (u.protocol !== "https:") malos.push(`fuente «${id}»: la url va en https`); } catch { malos.push(`fuente «${id}»: url no válida`); }
    if (host && !DOMINIOS_FUENTE.includes(host)) malos.push(`fuente «${id}»: ${host} no es una documentación admitida (DOMINIOS_FUENTE)`);
  }

  const contexto = { raiz, forja };
  const accionOk = (a) => a in (datos?.acciones ?? {});

  // Las tareas comunes: el estándar de lo que hacen varios agentes, escrito una vez.
  const comunes = datos?.comunes ?? {};
  if (!Object.keys(comunes).length) malos.push("comunes: el catálogo trae las tareas compartidas por varios agentes");
  for (const [id, c] of Object.entries(comunes)) {
    const d = `común ${id}`;
    if (!ID.test(id)) malos.push(`${d}: el id va en minúsculas con guiones`);
    for (const k of Object.keys(c ?? {})) if (!CAMPOS_COMUN.includes(k)) malos.push(`${d}: campo «${k}» no admitido`);
    if (!esTexto(c?.tarea, 20)) malos.push(`${d}: «tarea» dice qué se hace, en una frase`);
    if (!accionOk(c?.accion)) malos.push(`${d}: acción «${c?.accion}» no está en el vocabulario (${Object.keys(datos?.acciones ?? {}).join(", ")})`);
    if (!Array.isArray(c?.reglas) || !c.reglas.length) malos.push(`${d}: sin reglas`);
    else {
      if (c.reglas.length > max) malos.push(`${d}: ${c.reglas.length} reglas; la forma de práctica de la forja pide ${max} como mucho`);
      if (c.reglas.length < min) malos.push(`${d}: ${c.reglas.length} reglas; la forma de práctica de la forja pide ${min} o más`);
      malos.push(...problemasDeReglas(c.reglas, d, datos, contexto));
      for (const r of c.reglas) usadas.add(r?.fuente);
    }
  }

  const catalogados = Object.keys(datos?.agentes ?? {});
  for (const a of agentes) if (!catalogados.includes(a)) malos.push(`${a}: el agente existe y no tiene su lista de tareas en ${RUTA_ESTANDARES}`);
  for (const a of catalogados) if (!agentes.includes(a)) malos.push(`${a}: está en ${RUTA_ESTANDARES} y no existe .claude/agents/${a}.md`);

  const comunesCitadas = new Set();
  for (const [nombre, ag] of Object.entries(datos?.agentes ?? {})) {
    for (const k of Object.keys(ag ?? {})) if (k !== "tareas") malos.push(`${nombre}: campo «${k}» no admitido (un agente solo lleva tareas; ya no hay estados ni pendientes)`);
    if (PENDIENTES_ADMITIDOS.includes(nombre)) malos.push(`${nombre}: sigue en PENDIENTES_ADMITIDOS, que está en cero desde #516`);
    const tareas = ag?.tareas;
    if (!Array.isArray(tareas) || tareas.length < 3) { malos.push(`${nombre}: la lista de tareas tiene al menos tres`); continue; }
    const rutaMd = raiz ? join(raiz, ".claude", "agents", `${nombre}.md`) : null;
    const md = rutaMd && existsSync(rutaMd) ? readFileSync(rutaMd, "utf8") : null;
    const ids = new Set();
    for (const t of tareas) {
      const donde = `${nombre}/${t?.id ?? "(sin id)"}`;
      for (const c of Object.keys(t ?? {})) if (!CAMPOS_TAREA.includes(c)) malos.push(`${donde}: campo «${c}» no admitido`);
      if (typeof t?.id !== "string" || !ID.test(t.id)) malos.push(`${donde}: el id va en minúsculas con guiones`);
      else if (ids.has(t.id)) malos.push(`${donde}: id repetido`);
      else ids.add(t.id);
      if (!esTexto(t?.tarea, 20)) malos.push(`${donde}: «tarea» dice qué se hace, en una frase`);
      if (!accionOk(t?.accion)) malos.push(`${donde}: acción «${t?.accion}» no está en el vocabulario (${Object.keys(datos?.acciones ?? {}).join(", ")})`);
      if (!(t?.origen in (datos?.origenes ?? {}))) malos.push(`${donde}: origen «${t?.origen}» no está en el vocabulario (${Object.keys(datos?.origenes ?? {}).join(", ")})`);
      else if (md && !new RegExp(`^## \\d+\\. ${datos.origenes[t.origen]}\\s*$`, "m").test(md)) malos.push(`${donde}: el agente no tiene la sección «${datos.origenes[t.origen]}» de la que sale la tarea`);
      if (!esLista(t?.no_hace)) malos.push(`${donde}: «no_hace» es una lista de lo que queda fuera`);
      if ("rondas" in (t ?? {}) && (!Array.isArray(t.rondas) || !t.rondas.length)) malos.push(`${donde}: «rondas» es una lista de rondas de investigación`);
      for (const c of t?.comunes ?? []) {
        if (!(c in comunes)) malos.push(`${donde}: la común «${c}» no existe en comunes`);
        comunesCitadas.add(c);
      }
      if (new Set(t?.comunes ?? []).size !== (t?.comunes ?? []).length) malos.push(`${donde}: repite una común`);
      // Sin reglas no hay estándar: una tarea sin ellas es una tarea sin estándar.
      if (!Array.isArray(t?.reglas) || !t.reglas.length) { malos.push(`${donde}: sin estándar (reglas por campos)`); continue; }
      if (t.reglas.length > max) malos.push(`${donde}: ${t.reglas.length} reglas propias; la forma de práctica de la forja pide ${max} como mucho`);
      const total = reglasDeTarea(t, datos).length;
      if (total < min) malos.push(`${donde}: ${total} reglas con las comunes; la forma de práctica de la forja pide ${min} o más`);
      malos.push(...problemasDeReglas(t.reglas, donde, datos, contexto));
      for (const r of t.reglas) usadas.add(r?.fuente);
    }
  }
  for (const c of Object.keys(comunes)) if (!comunesCitadas.has(c)) malos.push(`común ${c}: ninguna tarea la cita`);
  for (const f of Object.keys(fuentes)) if (!usadas.has(f)) malos.push(`fuente «${f}»: ninguna regla la cita`);
  return malos;
}

/** Cifras: tareas, reglas (propias y de las comunes), tareas por acción y fuentes por tipo. */
export function contar(datos) {
  const porAgente = {};
  const porAccion = Object.fromEntries(Object.keys(datos.acciones).map((a) => [a, 0]));
  let tareas = 0;
  let reglas = 0;
  let conEstandar = 0;
  for (const [n, ag] of Object.entries(datos.agentes)) {
    const propias = ag.tareas.reduce((s, t) => s + (t.reglas?.length ?? 0), 0);
    porAgente[n] = { tareas: ag.tareas.length, conEstandar: ag.tareas.filter((t) => t.reglas?.length).length, reglas: propias };
    for (const t of ag.tareas) if (t.accion in porAccion) porAccion[t.accion] += 1;
    tareas += ag.tareas.length;
    conEstandar += porAgente[n].conEstandar;
    reglas += propias;
  }
  const reglasComunes = Object.values(datos.comunes).reduce((s, c) => s + c.reglas.length, 0);
  const usadas = new Set([...Object.values(datos.agentes).flatMap((a) => a.tareas.flatMap((t) => t.reglas ?? [])), ...Object.values(datos.comunes).flatMap((c) => c.reglas)].map((r) => r.fuente));
  const externas = [...usadas].filter((f) => datos.fuentes[f]?.tipo !== "casa").length;
  return {
    total: tareas, conEstandar, pendientes: tareas - conEstandar, porAgente, porAccion,
    reglas, comunes: Object.keys(datos.comunes).length, reglasComunes,
    fuentes: { externas, casa: usadas.size - externas },
  };
}

// ── La sección que cada agente lleva ───────────────────────────────────────

const TITULO = "## Tareas y su estándar";

/** El texto de la sección que cada agente lleva, generado desde el catálogo. */
export function renderSeccion(nombre, datos) {
  const ag = datos.agentes[nombre];
  const lineas = [
    TITULO,
    "",
    `Fuente única: \`${RUTA_ESTANDARES}\`. Esta lista la genera \`npm run estandar -- --escribir\` y`,
    "`ops/estandares-agentes.test.js` la compara; no se edita a mano. El detalle de cada",
    `tarea (acción, reglas con su control y su fuente, y lo que no hace): \`npm run estandar -- ${nombre} <tarea>\`.`,
    `Todas las tareas de todos los agentes, en una tabla: \`${RUTA_MD}\`.`,
    "",
  ];
  for (const t of ag.tareas) lineas.push(`- \`${t.id}\` — ${t.tarea} (acción: ${t.accion})`);
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

// ── El estándar de una tarea, para el brief ────────────────────────────────

/** El tipo de control en una palabra, por su ruta: test, hook, workflow o script (o juicio). */
export function tipoDeControl(control) {
  if (control === CONTROL_JUICIO) return "juicio";
  if (/\.test\.(m?js|jsx)$/.test(control)) return "test";
  if (/^\.claude\/hooks\//.test(control)) return "hook";
  if (/^\.github\/workflows\//.test(control)) return "workflow";
  return "script";
}
const controlLinea = (c) => (c === CONTROL_JUICIO ? "juicio" : `${tipoDeControl(c)} ${c}`);

/** La línea de una regla para el brief: su frase, su control, su fuente y sus dos ejemplos. */
function lineaDeRegla(r, datos) {
  return `  - ${fraseDeEstandar(r, datos.sujetos)} Control: ${controlLinea(r.control)}. Fuente: ${fuenteMarcada(datos.fuentes, r.fuente)}. Bien: ${r.ejemplo_bueno}. Mal: ${r.ejemplo_malo}.`;
}

/** El estándar de una tarea en texto: lo que el brief de /orquestar pega para el agente. */
export function textoDeTarea(nombre, idTarea, datos) {
  const ag = datos.agentes[nombre];
  if (!ag) return null;
  const t = ag.tareas.find((x) => x.id === idTarea);
  if (!t) return null;
  const lista = (xs) => xs.map((x) => `  - ${x}`).join("\n");
  const partes = [
    `ESTÁNDAR A CUMPLIR: ${nombre}/${t.id}`,
    `Tarea: ${t.tarea}`,
    `Acción: ${t.accion}`,
    `Reglas (cada una con su control y su fuente):\n${t.reglas.map((r) => lineaDeRegla(r, datos)).join("\n")}`,
  ];
  for (const c of t.comunes ?? []) partes.push(`Común ${c} (${datos.comunes[c].tarea}):\n${datos.comunes[c].reglas.map((r) => lineaDeRegla(r, datos)).join("\n")}`);
  partes.push(`No hace:\n${lista(t.no_hace)}`);
  return partes.join("\n");
}

/** El estándar de una tarea común en texto. */
export function textoDeComun(idComun, datos) {
  const c = datos.comunes[idComun];
  if (!c) return null;
  return [`ESTÁNDAR COMÚN: ${idComun}`, `Tarea: ${c.tarea}`, `Acción: ${c.accion}`, `Reglas (cada una con su control y su fuente):\n${c.reglas.map((r) => lineaDeRegla(r, datos)).join("\n")}`].join("\n");
}

// ── La tabla docs/ops/ESTANDARES.md ────────────────────────────────────────

const celda = (t) => String(t).replace(/\|/g, "\\|").replace(/\n/g, " ");
const celdaFuente = (id, datos) => {
  const f = datos.fuentes[id];
  return f.tipo === "casa" ? `[I] \`${f.ruta}\`` : `[F] [${celda(f.nombre)}](${f.url})`;
};
const celdaControl = (c) => (c === CONTROL_JUICIO ? "juicio" : `${tipoDeControl(c)}: \`${c}\``);

/** El markdown de la tabla: una fila por regla, con agente, tarea, acción, frase, control y fuente. */
export function generarMd(datos) {
  const k = contar(datos);
  const L = [
    "# Estándares de los agentes",
    "",
    `<!-- Generado desde ${RUTA_ESTANDARES} con «npm run estandar -- --escribir». No se edita a mano: ops/estandares-agentes.test.js lo compara. -->`,
    "",
    "Qué es hacer bien cada tarea de cada agente, escrito por campos con la plantilla de `scripts/lib/regla.mjs` (guía en `docs/ops/REDACCION.md`) y la forma de práctica de `ops/forja.json`. Cada fila es una regla: su frase sale de sus campos, su control es el test, el hook, el script o el workflow que la vigila (o `juicio`, si la vigila una persona o un LLM) y su fuente es externa ([F]) o de la casa ([I]). Lo que repiten varios agentes está una sola vez en las tareas comunes, y la tarea que las usa las nombra. En el brief de una tarea: `npm run estandar -- <agente> <tarea>`.",
    "",
    `Hoy: ${k.total} tareas de ${Object.keys(datos.agentes).length} agentes, ${k.conEstandar} de ${k.total} con estándar; ${k.reglas} reglas propias; ${k.comunes} tareas comunes con ${k.reglasComunes} reglas; ${k.fuentes.externas} fuentes externas y ${k.fuentes.casa} de la casa.`,
    "",
    "## Acciones",
    "",
    "Lo que hace el agente en cada tarea (vocabulario cerrado, `acciones` del catálogo).",
    "",
    "| Acción | Qué es | Tareas |",
    "|---|---|---|",
    ...Object.entries(datos.acciones).map(([a, def]) => `| \`${a}\` | ${celda(def)} | ${k.porAccion[a]} |`),
    "",
    "## Tareas de cada agente",
    "",
    "| Agente | Tarea | Acción | Regla | Control | Fuente | Comunes |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const [n, ag] of Object.entries(datos.agentes)) {
    for (const t of ag.tareas) {
      const comunes = (t.comunes ?? []).length ? t.comunes.map((c) => `\`${c}\``).join(", ") : "—";
      for (const r of t.reglas) L.push(`| ${n} | \`${t.id}\` | ${t.accion} | ${celda(fraseDeEstandar(r, datos.sujetos))} | ${celdaControl(r.control)} | ${celdaFuente(r.fuente, datos)} | ${comunes} |`);
    }
  }
  L.push("", "## Tareas comunes", "", "El estándar de lo que hacen varios agentes, escrito una vez. Cada tarea de la tabla de arriba que lo usa lo nombra en la última columna.", "",
    "| Común | Acción | Regla | Control | Fuente |", "|---|---|---|---|---|");
  for (const [id, c] of Object.entries(datos.comunes)) {
    for (const r of c.reglas) L.push(`| \`${id}\` | ${c.accion} | ${celda(fraseDeEstandar(r, datos.sujetos))} | ${celdaControl(r.control)} | ${celdaFuente(r.fuente, datos)} |`);
  }
  L.push("");
  return L.join("\n");
}

/** Escribe docs/ops/ESTANDARES.md; devuelve si cambió. */
export function escribirMd(raiz, datos) {
  const ruta = join(raiz, RUTA_MD);
  const nuevo = generarMd(datos);
  const antes = existsSync(ruta) ? readFileSync(ruta, "utf8").replace(/\r\n/g, "\n") : null;
  if (antes === nuevo) return false;
  writeFileSync(ruta, nuevo);
  return true;
}

// ── El trinquete de las reglas a juicio (#527) ─────────────────────────────

export const RUTA_JUICIO = "ops/estandares-juicio.json";

/** Cuántas reglas (propias y de comunes) llevan control «juicio»: lo que hoy vigila una persona o un juez. */
export const contarJuicio = (datos) => [
  ...Object.values(datos.agentes).flatMap((a) => a.tareas.flatMap((t) => t.reglas ?? [])),
  ...Object.values(datos.comunes).flatMap((c) => c.reglas),
].filter((r) => r.control === CONTROL_JUICIO).length;

const numeroDe = (texto) => {
  try { const n = JSON.parse(texto)?.juicio_maximo; return Number.isInteger(n) && n >= 0 ? n : null; } catch { return null; /* a propósito: un JSON roto es «sin tope» y el trinquete lo cuenta como error */ }
};

/** El tope anclado en este árbol (null si falta o está roto). */
export const leerJuicioMaximo = (raiz) => (existsSync(join(raiz, RUTA_JUICIO)) ? numeroDe(readFileSync(join(raiz, RUTA_JUICIO), "utf8")) : null);

/** El tope anclado en origin/staging (null si el ref no está o el fichero aún no existe allí). */
export function juicioMaximoEnStaging(raiz, ejecutar = execFileSync) {
  try {
    return numeroDe(ejecutar("git", ["show", `origin/staging:${RUTA_JUICIO}`], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    console.error(`aviso: no se puede leer ${RUTA_JUICIO} en origin/staging; se salta la comparación con staging`);
    return null;
  }
}

/**
 * Errores del trinquete, una línea cada uno: el recuento de reglas a juicio es igual al ancla, el ancla solo baja y
 * no puede ser mayor que el de origin/staging (`enStaging`, null si no se puede leer).
 */
export function problemasDeJuicio(datos, anclado, enStaging = null) {
  const hoy = contarJuicio(datos);
  const malos = [];
  if (anclado === null) malos.push(`${RUTA_JUICIO}: falta o no trae «juicio_maximo» (entero)`);
  else {
    if (hoy > anclado) malos.push(`hay ${hoy} reglas con control «juicio» y el ancla es ${anclado}: una regla nueva lleva un control que falla si se incumple, y el ancla no sube`);
    if (hoy < anclado) malos.push(`hay ${hoy} reglas con control «juicio» y el ancla es ${anclado}: bájala con npm run estandar -- --escribir`);
    if (enStaging !== null && anclado > enStaging) malos.push(`${RUTA_JUICIO}: el ancla ${anclado} es mayor que el de origin/staging (${enStaging}); solo baja`);
  }
  return malos;
}

/** Baja el tope al recuento de hoy si es menor (nunca lo sube); devuelve el tope que queda. */
export function bajarJuicioMaximo(raiz, datos) {
  const hoy = contarJuicio(datos);
  const actual = leerJuicioMaximo(raiz);
  const nuevo = actual === null ? hoy : Math.min(actual, hoy);
  if (nuevo !== actual) {
    writeFileSync(join(raiz, RUTA_JUICIO), JSON.stringify({
      $comentario: "Ancla de reglas de ops/estandares-agentes.json con control «juicio» (#527): el recuento ha de ser igual y SOLO BAJA. ops/estandares-agentes.test.js falla si hay más, si hay menos (se baja con npm run estandar -- --escribir) o si el ancla sube respecto a origin/staging.",
      juicio_maximo: nuevo,
    }, null, 2) + "\n");
  }
  return nuevo;
}
