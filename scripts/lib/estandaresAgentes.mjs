/**
 * Un estándar por tarea de cada agente, escrito por campos (#413, fondo #416; #516, fondo #488).
 *
 * `ops/estandares-agentes.json` es la única fuente. Cada agente lista las tareas que
 * hace; cada tarea lleva su acción (vocabulario cerrado `acciones`) y sus reglas, y
 * cada regla sigue la plantilla de `regla.mjs` (nombre, sujeto, fuerza, condicion,
 * exigencia, nota) más lo que pide la forma de práctica de `ops/forja/`
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
 * `ops/forja/` como única fuente de cuántas reglas lleva una tarea.
 *
 * Las NORMAS no se reescriben aquí (#620, fondo #618): una tarea lleva sus `ambitos` (AMBITOS de
 * ambitos.mjs) y las normas de `ops/normas.json` le llegan por consulta, ámbito × acción, más las que
 * cite aparte por id (`normas`, solo las que la consulta no trae) y las de sus comunes. Construir y
 * juzgar son las dos caras de lo mismo: las dos consultan las normas de construir y de juzgar, así que el
 * constructor y el juez de un ámbito reciben la misma lista. Con `--ficheros`, los ámbitos de cada fichero
 * tocado (`ambitosDeFichero`) se suman a los de la tarea. Las `reglas` propias quedan para los pasos de la
 * tarea que no son norma; las uniones (norma que no existe, regla que reescribe una norma, norma a juicio
 * que ningún juez cita) las vigila ops/uniones.test.js.
 *
 * Salen de aquí, y el test las compara: la sección «Tareas y su estándar» de cada
 * `.claude/agents/<agente>.md` (`npm run estandar -- --escribir`) y la tabla
 * `docs/ops/ESTANDARES.md`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AMBITOS, ambitosDeFichero } from "./ambitos.mjs";
import { textoDePrecedencia } from "./precedencia.mjs";
import { CONTROL_JUICIO, fraseDeRegla, problemasDeRegla, problemasDeSujetos } from "./regla.mjs";
import { problemasDePractica } from "./forjaForma.mjs";
import { leerForja } from "./forja.mjs";

export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUTA_ESTANDARES = "ops/estandares-agentes.json";
/** El registro de normas: se lee aquí con JSON.parse para no traer normas.mjs (y su grafo) a este módulo. */
export const RUTA_NORMAS = "ops/normas.json";
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
export const CAMPOS_TAREA = ["id", "tarea", "accion", "origen", "ambitos", "comunes", "normas", "reglas", "no_hace", "rondas"];
export const CAMPOS_COMUN = ["tarea", "accion", "normas", "reglas", "rondas"];
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

// ── Las normas de una tarea: por consulta, ámbito × acción (#620) ──────────

/**
 * Las acciones de norma que consulta cada acción de tarea. Construir y juzgar son las dos caras de lo
 * mismo (quien construye lo hace contra las normas que el juez va a aplicar, y el juez juzga contra las
 * que el constructor tenía): las dos consultan las normas de construir y de juzgar. Las demás, la suya.
 */
export const ACCIONES_DE_CONSULTA = { construir: ["construir", "juzgar"], juzgar: ["construir", "juzgar"] };
export const accionesDeConsulta = (accion) => ACCIONES_DE_CONSULTA[accion] ?? [accion];

/** Las normas de un registro que tocan a unos ámbitos y una acción de tarea, en el orden del registro. */
export function normasPorConsulta(normas, ambitos, accion, deConsulta = accionesDeConsulta) {
  const acciones = deConsulta(accion);
  return (normas ?? []).filter((n) => ambitos.includes(n.ambito) && (n.acciones ?? []).some((a) => acciones.includes(a)));
}

/**
 * Las normas de una tarea: [{ norma, por }] sin repetir, con `por` = «consulta» (sus ámbitos × su
 * acción), «fichero» (el ámbito de un fichero tocado), «citada» (su lista `normas`) o «común <id>».
 * `normas`: la lista de ops/normas.json. Una norma citada que no existe sale con `norma: null`.
 */
export function normasDeTarea(t, datos, normas, { ficheros = [], deConsulta = accionesDeConsulta } = {}) {
  const porId = new Map((normas ?? []).map((n) => [n.id, n]));
  const fuera = new Map();
  const pon = (n, por) => { if (n && !fuera.has(n.id)) fuera.set(n.id, { norma: n, por }); };
  for (const n of normasPorConsulta(normas, t?.ambitos ?? [], t?.accion, deConsulta)) pon(n, "consulta");
  const deFicheros = [...new Set(ficheros.flatMap(ambitosDeFichero))].filter((a) => !(t?.ambitos ?? []).includes(a));
  for (const n of normasPorConsulta(normas, deFicheros, t?.accion, deConsulta)) pon(n, "fichero");
  for (const id of t?.normas ?? []) porId.has(id) ? pon(porId.get(id), "citada") : fuera.set(id, { norma: null, por: "citada", id });
  for (const c of t?.comunes ?? []) for (const id of datos?.comunes?.[c]?.normas ?? []) porId.has(id) ? pon(porId.get(id), `común ${c}`) : fuera.has(id) || fuera.set(id, { norma: null, por: `común ${c}`, id });
  return [...fuera.values()];
}

/**
 * Errores del emparejamiento (#620): para cada ámbito, el constructor y el juez que lo llevan reciben las mismas
 * normas de construir y juzgar de ese ámbito. `deConsulta` se inyecta para verlo fallar con otra consulta.
 */
export function problemasDeEmparejamiento(datos, normas, { deConsulta = accionesDeConsulta } = {}) {
  const malos = [];
  const tareas = tareasDe(datos);
  const deAmbito = (tarea, a) => normasDeTarea(tarea, datos, normas, { deConsulta }).filter((x) => x.norma?.ambito === a && x.norma.acciones.some((y) => ["construir", "juzgar"].includes(y))).map((x) => x.norma.id).sort().join(",");
  for (const a of Object.keys(AMBITOS)) {
    const constructores = tareas.filter((x) => x.tarea.accion === "construir" && (x.tarea.ambitos ?? []).includes(a));
    const jueces = tareas.filter((x) => x.tarea.accion === "juzgar" && (x.tarea.ambitos ?? []).includes(a));
    for (const c of constructores) for (const j of jueces) {
      if (deAmbito(c.tarea, a) !== deAmbito(j.tarea, a)) malos.push(`${a}: ${c.agente}/${c.tarea.id} y ${j.agente}/${j.tarea.id} no reciben las mismas normas de ese ámbito`);
    }
  }
  return malos;
}

/** Las tareas con su agente, en el orden del catálogo: [{ agente, tarea }]. */
export const tareasDe = (datos) => Object.entries(datos?.agentes ?? {}).flatMap(([agente, ag]) => (ag?.tareas ?? []).map((tarea) => ({ agente, tarea })));

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
export function problemasDeEstandares(datos, agentes, raiz = null, normas = null) {
  const malos = [];
  // Las normas del registro, para las uniones de cada tarea (#620); sin raíz ni normas, no se miran.
  const registro = normas ?? (raiz && existsSync(join(raiz, RUTA_NORMAS)) ? JSON.parse(readFileSync(join(raiz, RUTA_NORMAS), "utf8")).normas : null);
  const idsNormas = registro ? new Set(registro.map((n) => n.id)) : null;
  const citaNormas = (lista, d) => {
    if (lista === undefined) return;
    if (!Array.isArray(lista) || lista.some((x) => typeof x !== "string")) { malos.push(`${d}: «normas» es una lista de ids de ops/normas.json`); return; }
    if (new Set(lista).size !== lista.length) malos.push(`${d}: repite una norma en «normas»`);
    if (idsNormas) for (const id of lista) if (!idsNormas.has(id)) malos.push(`${d}: cita la norma «${id}», que no está en ${RUTA_NORMAS}`);
  };
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
    citaNormas(c?.normas, d);
    const reglasC = Array.isArray(c?.reglas) ? c.reglas : [];
    if ("reglas" in (c ?? {}) && !Array.isArray(c.reglas)) malos.push(`${d}: «reglas» es una lista`);
    // Una común es su estándar: sus reglas propias y las normas que cita, de min a max (las reglas, max como mucho).
    const enComun = reglasC.length + (c?.normas ?? []).length;
    if (!enComun) malos.push(`${d}: sin reglas ni normas`);
    else {
      if (reglasC.length > max) malos.push(`${d}: ${reglasC.length} reglas; la forma de práctica de la forja pide ${max} como mucho`);
      if (enComun < min) malos.push(`${d}: ${enComun} reglas y normas; la forma de práctica de la forja pide ${min} o más`);
      malos.push(...problemasDeReglas(reglasC, d, datos, contexto));
      for (const r of reglasC) usadas.add(r?.fuente);
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
      // Los ámbitos de la tarea: de ellos, con su acción, salen sus normas (#620).
      const ambitos = t?.ambitos;
      if (!Array.isArray(ambitos) || !ambitos.length) malos.push(`${donde}: «ambitos» es una lista de ámbitos (${Object.keys(AMBITOS).join(", ")}): de ella salen sus normas`);
      else {
        for (const a of ambitos) if (!(a in AMBITOS)) malos.push(`${donde}: ámbito «${a}» fuera del vocabulario (${Object.keys(AMBITOS).join(", ")})`);
        if (new Set(ambitos).size !== ambitos.length) malos.push(`${donde}: repite un ámbito`);
      }
      citaNormas(t?.normas, donde);
      // Una norma citada aparte que ya llega por la consulta sobra: se citaría dos veces.
      if (registro && Array.isArray(ambitos) && Array.isArray(t?.normas)) {
        const porConsulta = new Set(normasPorConsulta(registro, ambitos, t.accion).map((n) => n.id));
        for (const id of t.normas) if (porConsulta.has(id)) malos.push(`${donde}: cita aparte «${id}», que ya le llega por la consulta (${ambitos.join(", ")} × ${t.accion}); quítala de «normas»`);
      }
      if ("reglas" in (t ?? {}) && !Array.isArray(t.reglas)) malos.push(`${donde}: «reglas» es una lista`);
      const propias = Array.isArray(t?.reglas) ? t.reglas : [];
      // Sin reglas ni normas no hay estándar. Las reglas propias son los pasos que no son norma.
      const deNormas = registro ? normasDeTarea(t, datos, registro).filter((x) => x.norma).length : (t?.normas ?? []).length;
      if (!propias.length && !deNormas) { malos.push(`${donde}: sin estándar (ni reglas propias ni normas)`); continue; }
      if (propias.length > max) malos.push(`${donde}: ${propias.length} reglas propias; la forma de práctica de la forja pide ${max} como mucho`);
      const total = reglasDeTarea(t, datos).length + deNormas;
      if (total < min) malos.push(`${donde}: ${total} reglas y normas con las comunes; la forma de práctica de la forja pide ${min} o más`);
      malos.push(...problemasDeReglas(propias, donde, datos, contexto));
      for (const r of propias) usadas.add(r?.fuente);
    }
  }
  for (const c of Object.keys(comunes)) if (!comunesCitadas.has(c)) malos.push(`común ${c}: ninguna tarea la cita`);
  for (const f of Object.keys(fuentes)) if (!usadas.has(f)) malos.push(`fuente «${f}»: ninguna regla la cita`);
  return malos;
}

/**
 * Cifras: tareas, reglas (propias y de las comunes), tareas por acción y fuentes por tipo. Con `normas`
 * (la lista de ops/normas.json), también cuántas normas citan las tareas: por consulta y aparte.
 */
export function contar(datos, normas = null) {
  const porAgente = {};
  const porAccion = Object.fromEntries(Object.keys(datos.acciones).map((a) => [a, 0]));
  let tareas = 0;
  let reglas = 0;
  let conEstandar = 0;
  const conAlgo = (t) => (t.reglas?.length ?? 0) + (t.normas?.length ?? 0) + (t.comunes?.length ?? 0) + (normas ? normasPorConsulta(normas, t.ambitos ?? [], t.accion).length : 0) > 0;
  for (const [n, ag] of Object.entries(datos.agentes)) {
    const propias = ag.tareas.reduce((s, t) => s + (t.reglas?.length ?? 0), 0);
    porAgente[n] = { tareas: ag.tareas.length, conEstandar: ag.tareas.filter(conAlgo).length, reglas: propias };
    for (const t of ag.tareas) if (t.accion in porAccion) porAccion[t.accion] += 1;
    tareas += ag.tareas.length;
    conEstandar += porAgente[n].conEstandar;
    reglas += propias;
  }
  const reglasComunes = Object.values(datos.comunes).reduce((s, c) => s + (c.reglas?.length ?? 0), 0);
  const usadas = new Set([...Object.values(datos.agentes).flatMap((a) => a.tareas.flatMap((t) => t.reglas ?? [])), ...Object.values(datos.comunes).flatMap((c) => c.reglas ?? [])].map((r) => r.fuente));
  const externas = [...usadas].filter((f) => datos.fuentes[f]?.tipo !== "casa").length;
  const citadas = tareasDe(datos).reduce((s, { tarea }) => s + (tarea.normas?.length ?? 0), 0) + Object.values(datos.comunes).reduce((s, c) => s + (c.normas?.length ?? 0), 0);
  const fuera = {
    total: tareas, conEstandar, pendientes: tareas - conEstandar, porAgente, porAccion,
    reglas, comunes: Object.keys(datos.comunes).length, reglasComunes,
    fuentes: { externas, casa: usadas.size - externas },
    normasCitadas: citadas,
  };
  if (normas) {
    const distintas = new Set(tareasDe(datos).flatMap(({ tarea }) => normasDeTarea(tarea, datos, normas).filter((x) => x.norma).map((x) => x.norma.id)));
    fuera.normasDistintas = distintas.size;
    fuera.normasSinTarea = normas.filter((n) => !distintas.has(n.id)).length;
  }
  return fuera;
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

/** La línea de una norma para el brief: su id, su frase, su control y su principio, y por qué le llega. `sujetos`: los del registro. */
export function lineaDeNorma(n, sujetos, por) {
  const control = n.control_tipo === "planos" ? `planos ${n.criterio_planos}` : controlLinea(n.control);
  return `  - \`${n.id}\` — ${fraseDeRegla(n, sujetos, { conControl: false })} Control: ${control}. Principio: ${n.principio}. Por: ${por}.`;
}

/**
 * El estándar de una tarea en texto: lo que el brief de /orquestar pega para el agente. `registro`: ops/normas.json
 * leído ({ normas, sujetos }), para sus normas; `ficheros`, los tocados, que suman las normas de su ámbito.
 */
export function textoDeTarea(nombre, idTarea, datos, registro = null, { ficheros = [], precedencia = null } = {}) {
  const ag = datos.agentes[nombre];
  if (!ag) return null;
  const t = ag.tareas.find((x) => x.id === idTarea);
  if (!t) return null;
  const lista = (xs) => xs.map((x) => `  - ${x}`).join("\n");
  const partes = [
    `ESTÁNDAR A CUMPLIR: ${nombre}/${t.id}`,
    `Tarea: ${t.tarea}`,
    `Acción: ${t.accion}`,
    `Ámbitos: ${(t.ambitos ?? []).join(", ")}`,
  ];
  if (registro) {
    const ns = normasDeTarea(t, datos, registro.normas, { ficheros }).filter((x) => x.norma);
    const extra = [...new Set(ficheros.flatMap(ambitosDeFichero))].filter((a) => !(t.ambitos ?? []).includes(a));
    const cabeza = `Normas que tocan (${ns.length}; por consulta ${(t.ambitos ?? []).join(", ")} × ${accionesDeConsulta(t.accion).join(" y ")}${extra.length ? `, y ${extra.join(", ")} por los ficheros` : ""}; cada una con su frase, su control y su principio):`;
    partes.push(`${cabeza}\n${ns.map((x) => lineaDeNorma(x.norma, registro.sujetos, x.por)).join("\n")}`);
  }
  // Qué gana si dos normas chocan (#621): el dato es el de ops/principios/_catalogo.json, que lee precedencia.mjs.
  if (precedencia) partes.push(textoDePrecedencia(precedencia));
  if (t.reglas?.length) partes.push(`Reglas propias de la tarea (cada una con su control y su fuente):\n${t.reglas.map((r) => lineaDeRegla(r, datos)).join("\n")}`);
  for (const c of t.comunes ?? []) {
    const rs = datos.comunes[c].reglas ?? [];
    partes.push(`Común ${c} (${datos.comunes[c].tarea}):\n${[...rs.map((r) => lineaDeRegla(r, datos)), ...(datos.comunes[c].normas ?? []).map((id) => `  - norma \`${id}\` (arriba)`)].join("\n")}`);
  }
  partes.push(`No hace:\n${lista(t.no_hace)}`);
  return partes.join("\n");
}

/** El estándar de una tarea común en texto. */
export function textoDeComun(idComun, datos) {
  const c = datos.comunes[idComun];
  if (!c) return null;
  const partes = [`ESTÁNDAR COMÚN: ${idComun}`, `Tarea: ${c.tarea}`, `Acción: ${c.accion}`];
  if (c.normas?.length) partes.push(`Normas que cita: ${c.normas.map((id) => `\`${id}\``).join(", ")} (npm run normas -- <id>)`);
  if (c.reglas?.length) partes.push(`Reglas (cada una con su control y su fuente):\n${c.reglas.map((r) => lineaDeRegla(r, datos)).join("\n")}`);
  return partes.join("\n");
}

// ── La tabla docs/ops/ESTANDARES.md ────────────────────────────────────────

const celda = (t) => String(t).replace(/\|/g, "\\|").replace(/\n/g, " ");
const celdaFuente = (id, datos) => {
  const f = datos.fuentes[id];
  return f.tipo === "casa" ? `[I] \`${f.ruta}\`` : `[F] [${celda(f.nombre)}](${f.url})`;
};
const celdaControl = (c) => (c === CONTROL_JUICIO ? "juicio" : `${tipoDeControl(c)}: \`${c}\``);

/**
 * El markdown: una fila por regla propia (agente, tarea, acción, frase, control y fuente), las comunes y, con
 * `normas` (la lista de ops/normas.json), una fila por tarea con sus ámbitos y las normas que le tocan.
 */
export function generarMd(datos, normas = null) {
  const k = contar(datos, normas);
  const L = [
    "# Estándares de los agentes",
    "",
    `<!-- Generado desde ${RUTA_ESTANDARES} con «npm run estandar -- --escribir». No se edita a mano: ops/estandares-agentes.test.js lo compara. -->`,
    "",
    "Qué es hacer bien cada tarea de cada agente. Las normas no se reescriben aquí: cada tarea lleva sus ámbitos y le tocan las normas de `ops/normas.json` (`docs/ops/NORMAS.md`) de esos ámbitos y su acción (construir y juzgar consultan las dos, así que constructor y juez del mismo ámbito reciben las mismas), más las que cita aparte y las de sus comunes. Las reglas propias son los pasos de la tarea que no son norma, escritas por campos con la plantilla de `scripts/lib/regla.mjs` (guía en `docs/ops/REDACCION.md`) y la forma de práctica de `ops/forja/`: su frase sale de sus campos, su control es el test, el hook, el script o el workflow que la vigila (o `juicio`, si la vigila una persona o un LLM) y su fuente es externa ([F]) o de la casa ([I]). Lo que repiten varios agentes está una sola vez en las tareas comunes. En el brief de una tarea: `npm run estandar -- <agente> <tarea> [--ficheros a,b]`, que suma las normas del ámbito de cada fichero tocado.",
    "",
    `Hoy: ${k.total} tareas de ${Object.keys(datos.agentes).length} agentes, ${k.conEstandar} de ${k.total} con estándar; ${k.reglas} reglas propias; ${k.comunes} tareas comunes con ${k.reglasComunes} reglas; ${k.normasCitadas} normas citadas aparte${normas ? `; ${k.normasDistintas} normas distintas llegan a alguna tarea y ${k.normasSinTarea} a ninguna` : ""}; ${k.fuentes.externas} fuentes externas y ${k.fuentes.casa} de la casa.`,
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
      for (const r of t.reglas ?? []) L.push(`| ${n} | \`${t.id}\` | ${t.accion} | ${celda(fraseDeEstandar(r, datos.sujetos))} | ${celdaControl(r.control)} | ${celdaFuente(r.fuente, datos)} | ${comunes} |`);
    }
  }
  L.push("", "## Tareas comunes", "", "El estándar de lo que hacen varios agentes, escrito una vez. Cada tarea de la tabla de arriba que lo usa lo nombra en la última columna.", "",
    "| Común | Acción | Regla | Control | Fuente |", "|---|---|---|---|---|");
  for (const [id, c] of Object.entries(datos.comunes)) {
    for (const r of c.reglas ?? []) L.push(`| \`${id}\` | ${c.accion} | ${celda(fraseDeEstandar(r, datos.sujetos))} | ${celdaControl(r.control)} | ${celdaFuente(r.fuente, datos)} |`);
    if (c.normas?.length) L.push(`| \`${id}\` | ${c.accion} | cita las normas ${c.normas.map((x) => `\`${x}\``).join(", ")} | — | — |`);
  }
  if (normas) {
    L.push("", "## Normas de cada tarea", "", "Las normas que le tocan a cada tarea sin ficheros: por consulta (sus ámbitos × su acción) y las que cita aparte (las de sus comunes no se repiten). Con `--ficheros`, el brief suma las del ámbito de cada fichero tocado.", "",
      "| Tarea | Acción | Ámbitos | Por consulta | Citadas aparte |", "|---|---|---|---|---|");
    for (const { agente, tarea: t } of tareasDe(datos)) {
      const ns = normasDeTarea(t, datos, normas);
      const por = (p) => ns.filter((x) => x.por === p && x.norma).map((x) => `\`${x.norma.id}\``).join(", ") || "—";
      L.push(`| \`${agente}/${t.id}\` | ${t.accion} | ${(t.ambitos ?? []).join(", ")} | ${por("consulta")} | ${por("citada")} |`);
    }
  }
  L.push("");
  return L.join("\n");
}

/** Las normas de ops/normas.json de una raíz (la lista). */
export const leerNormasEn = (raiz) => JSON.parse(readFileSync(join(raiz, RUTA_NORMAS), "utf8"));

/** Escribe docs/ops/ESTANDARES.md; devuelve si cambió. */
export function escribirMd(raiz, datos) {
  const ruta = join(raiz, RUTA_MD);
  const nuevo = generarMd(datos, leerNormasEn(raiz).normas);
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
  ...Object.values(datos.comunes).flatMap((c) => c.reglas ?? []),
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

// ── Las uniones con las normas (#620, fondo #618): lo que vigila ops/uniones.test.js ──

/**
 * Cuánto se parecen dos frases, de 0 a 1: las palabras con contenido (sin tildes, sin las vacías, por
 * sus cinco primeras letras para juntar «fallar» y «fallo») que comparten, con el coeficiente de Dice
 * (dos veces las comunes sobre la suma de las dos). Es simétrico a propósito (#620, ronda 2): dividir solo
 * por la frase más corta hacía que una norma corta «se tragara» una regla más rica, con términos que la
 * norma no tiene. Es la capa material de la forja: una regla aproximada con su lista de excepciones, que
 * solo baja.
 */
const VACIAS = new Set("de la el los las un una unos unas y o a en con sin su sus que se por para del al lo es son no ni como mas cada antes despues solo ya le les esta este hay muy".split(" "));
export function palabrasClave(texto) {
  return new Set(String(texto ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !VACIAS.has(w)).map((w) => w.slice(0, 5)));
}
export function parecido(a, b) {
  const x = palabrasClave(a);
  const y = palabrasClave(b);
  if (!x.size || !y.size) return 0;
  return (2 * [...x].filter((w) => y.has(w)).length) / (x.size + y.size);
}

/** A partir de cuánto parecido una regla de estándar se toma por una norma reescrita (calibrado con el catálogo de #620). */
export const UMBRAL_REESCRITURA = 0.5;

/**
 * Techos de las dos listas de excepciones de ops/estandares-agentes.json. Solo bajan: el test los pide
 * iguales a la cifra de hoy, así que subirlos es un cambio de código que ve el revisor.
 *  - `reglas_que_no_son_norma`: reglas que se parecen a una norma y no la repiten («<donde> · <nombre>»: «<norma>: motivo»).
 *  - `normas_sin_juez`: normas vigiladas por juicio que ningún estándar de juez cita (id: motivo).
 */
export const TECHO_REGLAS_QUE_NO_SON_NORMA = 4;
export const TECHO_NORMAS_SIN_JUEZ = 5;

/** Todas las reglas del catálogo con la clave con la que se nombran en las excepciones: «agente/tarea · Nombre» o «común id · Nombre». */
export function reglasDelCatalogo(datos) {
  return [
    ...tareasDe(datos).flatMap(({ agente, tarea }) => (tarea.reglas ?? []).map((r) => ({ clave: `${agente}/${tarea.id} · ${r.nombre}`, regla: r }))),
    ...Object.entries(datos?.comunes ?? {}).flatMap(([id, c]) => (c.reglas ?? []).map((r) => ({ clave: `común ${id} · ${r.nombre}`, regla: r }))),
  ];
}

const textoDeRegla = (r) => `${r.condicion ?? ""} ${r.exigencia ?? ""}`;
/** Palabras con contenido que comparten dos frases: { comunes, a, b } (los tamaños de cada una). */
function solapa(x, y) {
  const a = palabrasClave(x);
  const b = palabrasClave(y);
  return { comunes: [...a].filter((w) => b.has(w)).length, a: a.size, b: b.size };
}

/**
 * Cómo de parecida es una regla a una norma, de 0 a 1, con tres señales (calibradas con CALIBRACION_REESCRITURA
 * de ops/uniones.test.js, parejas ya juzgadas a mano). Gana la mayor:
 *  1. el texto (condición y exigencia) por Dice, simétrico: una norma corta no se traga una regla más rica;
 *  2. los NOMBRES, si los dos tienen 2 palabras con contenido o más y comparten dos tercios de la más corta
 *     («Texto de usuario es dato» ↔ «Texto ajeno como dato»);
 *  3. una palabra del nombre en común y la regla cubre el 60 % o más de una norma de 3 palabras con contenido
 *     o más («Sin stash compartido» ↔ «Sin git stash»): la norma entera está dentro de la regla.
 * Es la capa material de la forja: una regla aproximada con su lista de excepciones, que solo baja.
 */
export function parecidoDeRegla(r, n) {
  const dice = parecido(textoDeRegla(r), textoDeRegla(n));
  const nom = solapa(r.nombre, n.nombre);
  const txt = solapa(textoDeRegla(r), textoDeRegla(n));
  const porNombre = Math.min(nom.a, nom.b) >= 2 && nom.comunes / Math.min(nom.a, nom.b) >= 2 / 3 ? 0.67 : 0;
  const normaDentro = nom.comunes >= 1 && Math.min(nom.a, nom.b) >= 2 && txt.b >= 3 && txt.comunes / txt.b >= 0.6 ? txt.comunes / txt.b : 0;
  return Math.max(dice, porNombre, normaDentro);
}

/** La norma más parecida a una regla, o null si ninguna llega al umbral. */
export function normaReescrita(r, normas, umbral = UMBRAL_REESCRITURA) {
  let mejor = null;
  for (const n of normas) {
    const p = parecidoDeRegla(r, n);
    if (p >= umbral && (!mejor || p > mejor.parecido)) mejor = { norma: n, parecido: p };
  }
  return mejor;
}

/** Las tareas de juez (acción «juzgar») y las normas que les tocan, sin ficheros: { id de norma: [agente/tarea, …] }. */
export function juecesPorNorma(datos, normas) {
  const fuera = {};
  for (const { agente, tarea } of tareasDe(datos)) {
    if (tarea.accion !== "juzgar") continue;
    for (const x of normasDeTarea(tarea, datos, normas)) if (x.norma) (fuera[x.norma.id] ??= []).push(`${agente}/${tarea.id}`);
  }
  return fuera;
}

/**
 * Errores de las uniones entre los estándares y las normas (lista vacía si está bien):
 *  1. una tarea o una común cita una norma que no existe;
 *  2. una regla reescribe una norma: se llama igual o se le parece desde `umbral`, y no está en
 *     `reglas_que_no_son_norma` con la norma y su motivo; una excepción que ya no hace falta, o cuya regla
 *     no existe, sobra; la lista no pasa de su techo;
 *  3. una norma vigilada por juicio no la cita ningún estándar de juez y no está en `normas_sin_juez` con su
 *     motivo; una de esa lista que ya tiene juez, o que no existe, sobra; la lista no pasa de su techo.
 */
export function problemasDeUnionesEstandar(datos, normas, { umbral = UMBRAL_REESCRITURA, techos = { reglas: TECHO_REGLAS_QUE_NO_SON_NORMA, juicio: TECHO_NORMAS_SIN_JUEZ } } = {}) {
  const malos = [];
  const ids = new Set(normas.map((n) => n.id));
  for (const { agente, tarea } of tareasDe(datos)) for (const id of tarea.normas ?? []) if (!ids.has(id)) malos.push(`${agente}/${tarea.id}: cita la norma «${id}», que no existe`);
  for (const [c, x] of Object.entries(datos?.comunes ?? {})) for (const id of x.normas ?? []) if (!ids.has(id)) malos.push(`común ${c}: cita la norma «${id}», que no existe`);

  const noNorma = datos?.reglas_que_no_son_norma ?? {};
  const claves = new Set();
  for (const { clave, regla } of reglasDelCatalogo(datos)) {
    claves.add(clave);
    const r = normaReescrita(regla, normas, umbral);
    const ex = noNorma[clave];
    if (r && !ex) malos.push(`${clave}: reescribe la norma «${r.norma.id}» (parecido ${r.parecido.toFixed(2)}); cítala por id en «normas» y quita la regla, o di en reglas_que_no_son_norma por qué no es ella`);
    if (ex !== undefined) {
      const m = /^([a-z0-9-]+): (.{15,})$/.exec(String(ex));
      if (!m) malos.push(`reglas_que_no_son_norma «${clave}»: el valor es «<norma>: motivo» (15 caracteres o más de motivo)`);
      else if (!r) malos.push(`reglas_que_no_son_norma «${clave}»: ya no se parece a ninguna norma; quítala de la lista y baja el techo`);
      else if (r.norma.id !== m[1] && !ids.has(m[1])) malos.push(`reglas_que_no_son_norma «${clave}»: la norma «${m[1]}» no existe`);
    }
  }
  for (const k of Object.keys(noNorma)) if (!claves.has(k)) malos.push(`reglas_que_no_son_norma «${k}»: no es una regla del catálogo`);
  if (Object.keys(noNorma).length > techos.reglas) malos.push(`reglas_que_no_son_norma: ${Object.keys(noNorma).length} y el techo es ${techos.reglas}; la lista solo baja`);

  const sinJuez = datos?.normas_sin_juez ?? {};
  const jueces = juecesPorNorma(datos, normas);
  for (const n of normas) {
    if (n.control !== CONTROL_JUICIO) continue;
    if (jueces[n.id]) { if (n.id in sinJuez) malos.push(`normas_sin_juez «${n.id}»: ya la cita ${jueces[n.id][0]}; quítala de la lista y baja el techo`); continue; }
    if (!(n.id in sinJuez)) malos.push(`norma ${n.id}: la vigila un juicio y ningún estándar de juez la cita; dale el ámbito y la acción a un juez, cítala en una tarea de juzgar o, con su motivo, ponla en normas_sin_juez`);
    else if (typeof sinJuez[n.id] !== "string" || sinJuez[n.id].trim().length < 20) malos.push(`normas_sin_juez «${n.id}»: lleva su motivo (20 caracteres o más)`);
  }
  for (const id of Object.keys(sinJuez)) {
    const n = normas.find((x) => x.id === id);
    if (!n) malos.push(`normas_sin_juez «${id}»: no es una norma de ops/normas.json`);
    else if (n.control !== CONTROL_JUICIO) malos.push(`normas_sin_juez «${id}»: no la vigila un juicio; quítala de la lista`);
  }
  if (Object.keys(sinJuez).length > techos.juicio) malos.push(`normas_sin_juez: ${Object.keys(sinJuez).length} y el techo es ${techos.juicio}; la lista solo baja`);
  return malos;
}
