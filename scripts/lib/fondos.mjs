/**
 * fondos.mjs — la ficha de un problema de fondo y sus controles (#337, fase B
 * del plan #334). Lógica pura: sin red ni ficheros de datos (salvo leer una vez
 * la escalera de ops/flujo.json). Los usan:
 *
 *   scripts/fondos-evento.mjs   el workflow sobre eventos de issues (fondos.yml)
 *   scripts/fondos-pr.mjs       el paso «Fondos del PR» de tests.yml
 *   scripts/issues.mjs          el informe de fichas de `npm run issues`
 *
 * La ficha es un bloque de código `fondo` en el cuerpo del issue, de líneas
 * `clave: valor` (listas separadas por coma, issues como `#n`). Se lee A MANO,
 * sin YAML ni dependencias ni ejecutar nada: el repo es público y el cuerpo de
 * un issue lo escribe cualquiera (entrada no confiable). Por eso:
 *   - tope de tamaño del cuerpo, del bloque, de líneas, de cada valor y de listas;
 *   - claves de una lista cerrada, sin repetir; valores de vocabularios cerrados;
 *   - lo que escribe el autor NO se copia a los comentarios (solo vocabulario,
 *     números y mensajes nuestros): ni Markdown, ni HTML, ni @menciones.
 *
 * Cada control tiene un nombre de regla («sin-diagnostico: …»): es lo que
 * cuentan los tests y lo que ve quien edita el issue.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MAX_NUMERO, MIN_MOTIVO } from "../../.claude/hooks/casos.mjs";
import { ALCANCES_FALLO } from "./flujo.mjs";
import { CAMPOS_ENCARGO, ESCALONES_AUTOMATICOS, GRUPOS, MAX_ENCARGOS_POR_FONDO, TIPOS_ACCION, debeReabrir, faltas, porGrupo } from "./issues.mjs";
import { CATALOGO as MECANISMOS } from "./mecanismos.mjs";
import { RIESGOS } from "./normas.mjs";
import { CATALOGO, TOPE_RONDAS, presupuestoDe } from "./presupuestos.mjs";

// ── Vocabularios cerrados ─────────────────────────────────────────────────────

/** Tipo de causa: las del grupo `causa:` de issues.mjs (no se copian). */
export const TIPOS_CAUSA = Object.keys(GRUPOS.causa.valores);
/** Alcance del fallo, de menor a mayor (ALCANCES_FALLO de flujo.mjs). */
export const ALCANCES = Object.keys(ALCANCES_FALLO);
/** Severidad: la misma escala de riesgo del registro de normas. */
export const SEVERIDADES = Object.keys(RIESGOS);

/** Estados de un fondo en la ficha, en el orden del camino (reabierto, aparte). */
export const ESTADOS = {
  abierto: "Registrado; aún sin diagnóstico",
  diagnosticado: "Mecanismo y causa de escape escritos",
  plan: "Encargos colgados del fondo",
  "en-curso": "Algún encargo en marcha",
  "en-observacion": "Arreglo fusionado; ventana sin casos nuevos corriendo",
  "cerrado-eficaz": "La ventana pasó limpia y el aprendizaje está registrado",
  reabierto: "Un caso nuevo o un «no aguantó» lo reabrió",
};
/** Los estados que ya exigen diagnóstico (todos salvo abierto y reabierto). */
const ESTADOS_CON_DIAGNOSTICO = ["diagnosticado", "plan", "en-curso", "en-observacion", "cerrado-eficaz"];

/**
 * Quién construye el arreglo: los agentes de .claude/agents/ y la sesión
 * principal. Un test (fondos.test.js) lo cruza con la carpeta: si nace un agente
 * y no se añade aquí, falla.
 */
export const CAPAS_AGENTE = ["auditor-datos", "datos", "diseno", "evaluador", "gobierno", "lola", "qa", "revisor", "seguridad", "sesión"];

const FLUJO = JSON.parse(readFileSync(fileURLToPath(new URL("../../ops/flujo.json", import.meta.url)), "utf8"));
/** Barrera = escalón de la escalera de durabilidad (ops/flujo.json), del más al menos duradero. */
export const BARRERAS = FLUJO.escalera.map((e) => e.id);

/**
 * Qué fichero vale como `verificacion` según la barrera: un test (test_ci), un
 * hook, workflow o migración (bloqueo), un script, una skill o un texto. Un
 * directorio, o un fichero de otra clase, no vigila nada.
 */
export const VERIFICACION_POR_BARRERA = {
  bloqueo: /^(\.claude\/hooks\/|\.github\/|supabase\/migrations\/)[\w./@-]+$/,
  test_ci: /\.test\.(js|mjs|jsx)$/,
  script: /^scripts\/[\w./@-]+\.mjs$/,
  skill: /^\.claude\/skills\/[\w./@-]+\/SKILL\.md$/,
  texto: /\.md$/,
};

/** Quién es «de la casa»: solo se actúa sobre issues suyos (el repo es público y cualquiera abre issues). */
export const ASOCIACIONES_DE_LA_CASA = ["OWNER", "MEMBER", "COLLABORATOR"];
export const esDeLaCasa = (asociacion) => ASOCIACIONES_DE_LA_CASA.includes(String(asociacion ?? "").toUpperCase());
/** Los fondos del propio plan #334: los primeros en pasar sus controles. */
export const FONDOS_AUTOAPLICACION = [334];

/** La etiqueta `arreglo:` que corresponde a una barrera (su primer valor en la escalera), o null. */
export function arregloDeBarrera(barrera) {
  return FLUJO.escalera.find((e) => e.id === barrera)?.arreglo[0] ?? null;
}

/** Alcance un nivel más alto (tope: transversal). Uno desconocido no cambia. */
export function subirAlcance(alcance) {
  const i = ALCANCES.indexOf(alcance);
  return i < 0 ? alcance : ALCANCES[Math.min(i + 1, ALCANCES.length - 1)];
}

// ── Topes (entrada no confiable) ──────────────────────────────────────────────

export const MAX_CUERPO = 70_000; // GitHub corta los cuerpos en 65.536
export const MAX_BLOQUE = 4_000;
export const MAX_LINEAS = 30;
export const MAX_LINEA = 600;
export const MAX_TEXTO = 400;
export const MAX_LISTA = 30;
export const MAX_VENTANA_DIAS = 90;
/** Fondos abiertos desde este día (Madrid) deben llevar ficha; los anteriores, sin ella, solo avisan. */
export const FICHA_DESDE = "2026-10-10";

/** Campos de la ficha: tipo de valor y, si es vocabulario, sus valores. Un solo sitio. */
export const CAMPOS_FICHA = {
  tipo_causa: { tipo: "vocab", valores: TIPOS_CAUSA },
  alcance: { tipo: "vocab", valores: ALCANCES },
  severidad: { tipo: "vocab", valores: SEVERIDADES },
  estado: { tipo: "vocab", valores: Object.keys(ESTADOS) },
  capa_agente: { tipo: "vocab", valores: CAPAS_AGENTE },
  barrera: { tipo: "vocab", valores: BARRERAS },
  casos: { tipo: "lista" },
  encargos: { tipo: "lista" },
  rondas: { tipo: "entero" },
  verificacion: { tipo: "ruta" },
  ventana_desde: { tipo: "fecha" },
  ventana_hasta: { tipo: "fecha" },
  mecanismo: { tipo: "texto" },
  causa_escape: { tipo: "texto" },
  clase: { tipo: "texto" },
  barrido: { tipo: "texto" },
  solucion_temporal: { tipo: "texto" },
  matiz: { tipo: "texto" },
  aprendizaje: { tipo: "texto" },
};

/** Un trozo de texto ajeno, seguro para enseñarlo: sin Markdown, HTML ni menciones, y corto. */
export function limpio(valor, max = 40) {
  return String(valor ?? "").slice(0, max).replace(/[^\p{L}\p{N}_ .,:;#()«»/\-—]/gu, "?")
    // Ni «http://…» ni «www.…»: GitHub los convertiría en enlaces dentro de un comentario del bot.
    .replace(/:\/+/g, "?").replace(/www\./gi, "www?")
    // Ni «dueño/repo#12»: una referencia a otro repo también enlaza (la de este repo, «#12», no).
    .replace(/(?<=[\w/])#/g, "?");
}

/**
 * Cómo se lee cada clave del bloque `encargo`. Las CLAVES salen de CAMPOS_ENCARGO
 * (issues.mjs, la fuente del formato): aquí solo el tipo de valor. Un test falla
 * si nace una clave sin tipo.
 */
export const TIPOS_CAMPO_ENCARGO = {
  fondo: { tipo: "lista", una: true },
  tipo_accion: { tipo: "vocab", valores: Object.keys(TIPOS_ACCION) },
  mecanismo: { tipo: "vocab", valores: MECANISMOS.mecanismos.map((m) => m.id) },
  por_que_no_mas_alto: { tipo: "texto" },
  clase: { tipo: "texto" },
  depende_de: { tipo: "lista" },
  constructor: { tipo: "vocab", valores: CAPAS_AGENTE },
  juez: { tipo: "vocab", valores: CAPAS_AGENTE },
  verificacion: { tipo: "ruta" },
  hecho_cuando: { tipo: "texto" },
  ficheros: { tipo: "texto" },
};

// ── Leer la ficha ─────────────────────────────────────────────────────────────

const abreDe = (nombre) => new RegExp("^ {0,3}```" + nombre + "[ \t]*$");
const CIERRA = /^ {0,3}```[ \t]*$/;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/** Dónde está el bloque: { ini, fin, repetido } con índices de línea, o null si no hay. */
export function ubicarBloque(lineas, nombre = "fondo") {
  const ABRE = abreDe(nombre);
  const abre = lineas.map((l, i) => (ABRE.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!abre.length) return null;
  const ini = abre[0];
  let fin = -1;
  for (let i = ini + 1; i < lineas.length; i++) {
    if (CIERRA.test(lineas[i])) {
      fin = i;
      break;
    }
  }
  return { ini, fin, repetido: abre.length > 1 };
}

const lineasDe = (body) => String(body ?? "").slice(0, MAX_CUERPO).replace(/\r/g, "").split("\n");

function fechaValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function leerValor(clave, def, valor) {
  switch (def.tipo) {
    case "texto":
      return valor.length > MAX_TEXTO ? { error: `«${clave}» pasa de ${MAX_TEXTO} caracteres: resúmelo y deja el detalle en el cuerpo del issue` } : { valor };
    case "vocab":
      return def.valores.includes(valor) ? { valor } : { error: `«${clave}: ${limpio(valor)}» no es de la lista (${def.valores.join(", ")})` };
    case "lista": {
      if (def.una && !/^#[0-9]{1,8}$/.test(valor)) return { error: `«${clave}» tiene que ser un solo «#n»` };
      if (/^ninguno[s]?$/i.test(valor)) return { valor: [] };
      const trozos = valor.split(",").map((t) => t.trim());
      if (trozos.length > MAX_LISTA) return { error: `«${clave}» tiene más de ${MAX_LISTA} elementos` };
      const malo = trozos.find((t) => !/^#\d{1,8}$/.test(t) || Number(t.slice(1)) > MAX_NUMERO || Number(t.slice(1)) < 1);
      if (malo !== undefined) return { error: `«${clave}» tiene que ser «#n, #m» con números de issue (o «ninguno»); no vale «${limpio(malo, 12)}»` };
      return { valor: [...new Set(trozos.map((t) => Number(t.slice(1))))] };
    }
    case "ruta":
      return /^[A-Za-z0-9_./@-]{1,200}$/.test(valor) && !valor.includes("..") && !valor.startsWith("/") && !valor.endsWith("/")
        ? { valor }
        : { error: `«${clave}» tiene que ser una ruta del repo (letras, números y _ . / @ -), sin «..»` };
    case "entero":
      // Rondas de constructor y juez ya gastadas: de 0 a 99, sin signo ni decimales.
      return /^\d{1,2}$/.test(valor) ? { valor: Number(valor) } : { error: `«${clave}» tiene que ser un número entero de 0 a 99` };
    case "fecha":
      return fechaValida(valor) ? { valor } : { error: `«${clave}» tiene que ser una fecha AAAA-MM-DD real` };
    default:
      return { error: `«${clave}» tiene un tipo desconocido` };
  }
}

/**
 * Lee la ficha del cuerpo de un issue. → { presente, ficha, errores }.
 * `errores`: [{ regla: "ficha-bloque" | "ficha-vocabulario", mensaje }]. Nunca lanza.
 * Un valor vacío (`clave:`) es «sin rellenar», no un error: la plantilla trae todas las claves.
 */
export function leerFicha(body) {
  return leerBloque(body, "fondo", CAMPOS_FICHA, "ficha");
}

/**
 * Lee un bloque de código `nombre` de líneas `clave: valor`, con los topes de
 * siempre: la ficha del fondo y el bloque `encargo` comparten lector.
 * Reglas de error: `<prefijo>-bloque` y `<prefijo>-vocabulario`.
 */
function leerBloque(body, nombre, campos, prefijo) {
  const lineas = lineasDe(body);
  const sitio = ubicarBloque(lineas, nombre);
  if (!sitio) return { presente: false, ficha: {}, errores: [] };
  const errores = [];
  const malo = (regla, mensaje) => errores.push({ regla, mensaje });
  if (sitio.repetido) malo(`${prefijo}-bloque`, `hay más de un bloque «${nombre}»; deja uno solo`);
  if (sitio.fin < 0) {
    malo(`${prefijo}-bloque`, String(body).length > MAX_CUERPO
      ? `el bloque «${nombre}» es demasiado grande (el cuerpo pasa de ${MAX_CUERPO} caracteres)`
      : `el bloque «${nombre}» no está cerrado (falta la línea de cierre del bloque de código)`);
    return { presente: true, ficha: {}, errores };
  }
  const dentro = lineas.slice(sitio.ini + 1, sitio.fin);
  if (dentro.length > MAX_LINEAS || dentro.join("\n").length > MAX_BLOQUE) {
    malo(`${prefijo}-bloque`, `el bloque es demasiado grande (máximo ${MAX_LINEAS} líneas y ${MAX_BLOQUE} caracteres): resume y deja el detalle fuera`);
    return { presente: true, ficha: {}, errores };
  }
  const ficha = {};
  const vistas = new Set();
  dentro.forEach((cruda, i) => {
    const n = i + 1;
    if (!cruda.trim()) return;
    if (cruda.length > MAX_LINEA) return malo(`${prefijo}-bloque`, `línea ${n}: pasa de ${MAX_LINEA} caracteres`);
    if (CONTROL.test(cruda)) return malo(`${prefijo}-bloque`, `línea ${n}: lleva caracteres de control`);
    const m = /^([a-z_]+):[ \t]*(.*)$/.exec(cruda);
    if (!m) return malo(`${prefijo}-bloque`, `línea ${n}: tiene que ser «clave: valor»`);
    const [, clave, crudo] = m;
    const def = Object.hasOwn(campos, clave) ? campos[clave] : undefined;
    if (!def) return malo(`${prefijo}-bloque`, `línea ${n}: la clave «${limpio(clave, 30)}» no existe en el bloque «${nombre}» (${Object.keys(campos).join(", ")})`);
    if (vistas.has(clave)) return malo(`${prefijo}-bloque`, `la clave «${clave}» está repetida`);
    vistas.add(clave);
    const valor = crudo.trim();
    if (!valor) return;
    const r = leerValor(clave, def, valor);
    if (r.error) {
      malo(`${prefijo}-vocabulario`, r.error);
      return;
    }
    ficha[clave] = r.valor;
  });
  return { presente: true, ficha, errores };
}

/**
 * Cambia (o añade) líneas `clave: valor` dentro del bloque de la ficha y
 * devuelve el cuerpo nuevo, o null si no hay un bloque cerrado donde escribir.
 * Los valores son de nuestros vocabularios, nunca texto del autor.
 */
export function fijarCampos(body, campos) {
  const lineas = String(body ?? "").replace(/\r/g, "").split("\n");
  const sitio = ubicarBloque(lineas);
  if (!sitio || sitio.fin < 0) return null;
  const dentro = lineas.slice(sitio.ini + 1, sitio.fin);
  for (const [clave, valor] of Object.entries(campos)) {
    if (!(clave in CAMPOS_FICHA) || /[\r\n]/.test(String(valor))) throw new Error(`fijarCampos: campo no válido «${clave}»`);
    const i = dentro.findIndex((l) => l.startsWith(`${clave}:`));
    if (i >= 0) dentro[i] = `${clave}: ${valor}`;
    else dentro.push(`${clave}: ${valor}`);
  }
  return [...lineas.slice(0, sitio.ini + 1), ...dentro, ...lineas.slice(sitio.fin)].join("\n");
}

// ── El aprendizaje ────────────────────────────────────────────────────────────

/**
 * ¿Vale el aprendizaje? Algo concreto (skill, técnica, catálogo o test tocado) o
 * «ninguno — <motivo>» con el mismo mínimo que `Casos: ninguno` (casos.mjs).
 */
export function aprendizajeValido(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  const ning = /^ninguno\b\s*(?:[—–:;,-]+\s*)?(.*)$/i.exec(t);
  if (ning) {
    const porque = ning[1].trim();
    return porque.length >= MIN_MOTIVO && porque.split(/\s+/).length >= 4;
  }
  return t.length >= 10;
}

// ── Adaptar un issue de la API REST a la forma de issues.mjs ──────────────────

const nombresDe = (labels) => (labels ?? []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
const tipoDe = (labels) => [...porGrupo(nombresDe(labels)).tipo][0] ?? null;

/** Un hijo (sub-issue) de la REST con la forma de `leerIssue().hijos` (con su cuerpo: el bloque `encargo` está ahí). */
export function hijoDeRest(h) {
  return {
    body: String(h.body ?? ""),
    number: h.number,
    state: String(h.state).toUpperCase(),
    createdAt: h.created_at ?? h.createdAt ?? null,
    labels: nombresDe(h.labels).map((name) => ({ name })),
    tipo: tipoDe(h.labels),
  };
}

/** El issue de la REST con la forma de `leerIssue` (lo que esperan faltas() y debeReabrir()). */
export function fondoDeRest(i, hijos = []) {
  return {
    number: i.number,
    title: String(i.title ?? ""),
    state: String(i.state).toUpperCase(),
    stateReason: i.state_reason ? String(i.state_reason).toUpperCase() : null,
    createdAt: i.created_at ?? i.createdAt ?? null,
    closedAt: i.closed_at ?? i.closedAt ?? null,
    body: String(i.body ?? ""),
    labels: nombresDe(i.labels).map((name) => ({ name })),
    hijos: hijos.map(hijoDeRest),
  };
}

// ── La marca del comentario (una por issue, lo actualiza, no apila) ───────────

export const MARCA = "<!-- menuplan:fondo ";
export const MARCA_HIJO = "<!-- menuplan:fondo-hijo ";
export const BOT = "github-actions[bot]";

/** ¿Es un comentario nuestro? Marca al principio Y escrito por el bot: otra cuenta no puede hacerse pasar. */
export function esComentarioNuestro(c, marca = MARCA) {
  return String(c?.body ?? "").startsWith(marca) && c?.user?.login === BOT;
}

/** Los issues cuyo alcance ya subimos, de la marca de nuestro comentario. */
export function leerSubidos(body) {
  const m = /^<!-- menuplan:fondo [^>\n]{0,200}?subidos=([\d,]{0,300})/.exec(String(body ?? ""));
  return new Set((m?.[1] ?? "").split(",").filter(Boolean).map(Number).filter((n) => n > 0 && n <= MAX_NUMERO).slice(0, 200));
}

/** El run del workflow que escribió el comentario (para comprobar que fue el nuestro y no otro workflow con el mismo bot). */
export function leerRun(body) {
  return /^<!-- menuplan:fondo[^>\n]{0,200}? run=(\d{1,15})/.exec(String(body ?? ""))?.[1] ?? null;
}

// ── Los controles ─────────────────────────────────────────────────────────────

const esNoAguanto = (h) => [...porGrupo(nombresDe(h.labels)).analisis].some((a) => a.startsWith("no-aguanto"));
const posteriorAlCierre = (h, f) => Boolean(f.closedAt && h.createdAt && new Date(h.createdAt) > new Date(f.closedAt));
const dias = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000);
const lista = (ns) => ns.map((n) => `#${n}`).join(", ");

/** ¿Es una ficha obligatoria? Los fondos anteriores a FICHA_DESDE (día de Madrid del alta) solo avisan. */
export function fichaObligatoria(fondo) {
  if (!fondo.createdAt) return true;
  return String(fondo.createdAt).slice(0, 10) >= FICHA_DESDE;
}

/**
 * Todos los controles de un fondo. Puro: lo que necesita de fuera entra por
 * argumento.
 *
 *   fondo            forma de fondoDeRest()/leerIssue(): labels, body, state, hijos…
 *   existeEnStaging  (ruta) → boolean: ¿está ese fichero en origin/staging?
 *   hoy              «AAAA-MM-DD» (día de Madrid)
 *   subidos          Set de casos `no-aguanto-*` cuyo alcance ya se subió
 *
 * → { hallazgos:[{regla, gravedad:"error"|"aviso", mensaje}], acciones:[…], subidos:Set, ficha }
 *   Acciones: { tipo:"fijar", campos }, { tipo:"reabrir", porque }, { tipo:"cerrar", arreglo }.
 */
export function validarFicha(fondo, { existeEnStaging = () => false, hoy, subidos = new Set(), presupuestos = CATALOGO } = {}) {
  const hallazgos = [];
  const acciones = [];
  const nuevosSubidos = new Set(subidos);
  const error = (regla, mensaje) => hallazgos.push({ regla, gravedad: "error", mensaje });
  const aviso = (regla, mensaje) => hallazgos.push({ regla, gravedad: "aviso", mensaje });

  const lectura = leerFicha(fondo.body);
  const f = lectura.ficha;
  const g = porGrupo(nombresDe(fondo.labels));
  const hijos = fondo.hijos ?? [];
  const casos = hijos.filter((h) => h.tipo === "caso");
  const encargos = hijos.filter((h) => h.tipo === "encargo");
  const cerrado = fondo.state === "CLOSED";
  const sinArreglo = ["NOT_PLANNED", "DUPLICATE"].includes(fondo.stateReason ?? "");
  const obligatoria = fichaObligatoria(fondo);

  // 1. La ficha existe y se lee.
  if (!lectura.presente) {
    (obligatoria ? error : aviso)("ficha-ausente",
      `el fondo no tiene su ficha: añade el bloque de código «fondo» con las claves de la plantilla${obligatoria ? "" : " (es anterior a la ficha: no es urgente)"}`);
  }
  for (const e of lectura.errores) error(e.regla, e.mensaje);

  // 2. La clasificación de siempre (faltas() de issues.mjs): etiquetas, arreglo general, encargos abiertos al cerrar.
  for (const falta of faltas(fondo)) aviso("clasificacion", `falta o falla: ${limpio(falta, 160)}`);

  if (lectura.presente && !lectura.errores.length) {
    // 3. Lo mínimo de toda ficha, y que no contradiga a la etiqueta de causa (una sola verdad).
    for (const c of ["estado", "tipo_causa", "alcance", "severidad"]) {
      if (f[c] === undefined) error("ficha-incompleta", `falta «${c}» en la ficha`);
    }
    if (f.tipo_causa && g.causa.size && !g.causa.has(f.tipo_causa)) {
      error("causa-distinta", `la ficha dice tipo_causa «${f.tipo_causa}» y la etiqueta es «${[...g.causa].map((c) => limpio(c)).join(", ")}»: una de las dos sobra`);
    }

    // 4. Sin diagnóstico no hay encargos (ni plan, ni observación).
    const sinDiagnostico = !f.mecanismo || !f.causa_escape;
    const faltan = ["mecanismo", "causa_escape"].filter((c) => !f[c]);
    if (sinDiagnostico && (encargos.length || f.encargos?.length || ESTADOS_CON_DIAGNOSTICO.includes(f.estado))) {
      error("sin-diagnostico", `hay ${encargos.length || f.encargos?.length ? "encargos" : `estado «${f.estado}»`} y falta ${faltan.map((c) => `«${c}»`).join(" y ")}: primero el diagnóstico (qué mecanismo falla y qué control debía pararlo y por qué no)`);
    }
    // 4b. Tope duro de rondas (#339): el conteo vive en la ficha del fondo y el máximo, en ops/presupuestos.json.
    if (f.rondas !== undefined) {
      const tope = presupuestoDe(f.alcance, f.tipo_causa ?? [...g.causa][0], presupuestos)?.rondas_max ?? TOPE_RONDAS;
      if (f.rondas > tope) {
        error("rondas-excedidas", `el fondo lleva ${f.rondas} rondas de constructor y juez y su presupuesto (alcance ${limpio(f.alcance ?? "sin fijar")}, causa ${limpio(f.tipo_causa ?? [...g.causa][0] ?? "sin fijar")}) permite ${tope} como mucho: no hay otra vuelta. Abre un issue tipo decision asignado a Pablo (npm run issues -- --nuevo "…" --tipo decision --area … --cuerpo <fichero>) con lo que el juez sigue bloqueando; decide una persona y, al decidir, ajusta «rondas» en la ficha`);
      }
    }
    // 4c. Los encargos (#396, P06.2 y P06.4): bloque `encargo` válido, como mucho tres, y uno preventivo y automático.
    // Los fondos de antes de la ficha solo avisan; los nuevos fallan (cerrado).
    for (const h of validarEncargos(encargos, f.estado)) (obligatoria ? error : aviso)(h.regla, h.mensaje);

    // 5. Observación: la verificación existe de verdad en origin/staging.
    if (f.estado === "en-observacion" || f.estado === "cerrado-eficaz") {
      if (!f.barrera) error("ficha-incompleta", `en «${f.estado}» falta «barrera» (escalón de la escalera: ${BARRERAS.join(", ")})`);
      if (!f.verificacion) error("observacion-sin-verificacion", `en «${f.estado}» falta «verificacion»: el test o hook que vigila la clase`);
      else if (f.barrera && !VERIFICACION_POR_BARRERA[f.barrera].test(f.verificacion)) error("verificacion-no-vale", `«verificacion: ${limpio(f.verificacion, 100)}» no es un fichero de la barrera «${f.barrera}» (un test para test_ci, un hook, workflow o migración para bloqueo, un script, una skill o un texto): un directorio o un fichero cualquiera no vigila la clase`);
      else if (!existeEnStaging(f.verificacion)) error("verificacion-no-existe", `«verificacion: ${limpio(f.verificacion, 100)}» no está en origin/staging: no se pasa a observación con un test que aún no ha entrado`);
    }
    if (f.estado === "en-observacion") {
      if (!f.ventana_hasta || !f.ventana_desde) error("observacion-sin-ventana", "en «en-observacion» faltan «ventana_desde» y «ventana_hasta» (AAAA-MM-DD): sin el inicio no se sabe qué casos son posteriores al arreglo");
      else if (f.ventana_desde > f.ventana_hasta) error("observacion-sin-ventana", "«ventana_desde» es posterior a «ventana_hasta»");
      else if (hoy && dias(hoy, f.ventana_hasta) > MAX_VENTANA_DIAS) error("ventana-excesiva", `«ventana_hasta» está a más de ${MAX_VENTANA_DIAS} días: una observación eterna no observa nada`);
    }

    // 6. Sin aprendizaje no se cierra.
    const cierreReal = cerrado && !sinArreglo;
    if ((cierreReal || f.estado === "cerrado-eficaz") && !aprendizajeValido(f.aprendizaje)) {
      error("cierre-sin-aprendizaje", "un fondo no se cierra sin «aprendizaje»: qué skill, técnica, catálogo o test se tocó, o «ninguno — <motivo de al menos 25 caracteres>»");
      if (cierreReal) acciones.push({ tipo: "reabrir", porque: "cierre-sin-aprendizaje" });
    }
    if (f.estado === "cerrado-eficaz" && !cerrado) {
      aviso("estado-incoherente", "el estado dice «cerrado-eficaz» y el issue sigue abierto");
      // Si el pase diario cambió la ficha y se cortó antes de cerrar, el siguiente run termina el cierre.
      if (aprendizajeValido(f.aprendizaje) && f.verificacion && existeEnStaging(f.verificacion)) acciones.push({ tipo: "cerrar", arreglo: arregloDeBarrera(f.barrera) });
    }
    if (cerrado && !sinArreglo && ["abierto", "diagnosticado", "plan", "en-curso"].includes(f.estado)) {
      aviso("cierre-anticipado", `se cerró en estado «${f.estado}», sin pasar por «en-observacion»: nadie ha mirado si aguanta`);
    }

    // 7. Un caso que no aguantó sube un nivel de alcance (una vez por caso: la marca lo recuerda).
    const nuevos = casos.filter((h) => esNoAguanto(h) && !nuevosSubidos.has(h.number));
    if (nuevos.length) {
      let alcance = f.alcance;
      for (const h of nuevos) {
        alcance = subirAlcance(alcance);
        nuevosSubidos.add(h.number);
      }
      aviso("no-aguanto", `${lista(nuevos.map((h) => h.number))} no aguantó: alcance ${limpio(f.alcance)} → ${alcance}`);
      acciones.push({ tipo: "fijar", campos: { ...(alcance === undefined ? {} : { alcance }), estado: "reabierto" } });
    }

    // 8. La ventana de observación vencida: o limpia (se cierra) o con casos nuevos (se reabre).
    if (f.estado === "en-observacion" && f.ventana_hasta && hoy && f.ventana_hasta < hoy && !cerrado) {
      const conocidos = new Set(f.casos ?? []);
      // Nuevo = no listado en «casos» O creado desde que empezó la ventana: la lista es editable y no puede esconder un caso.
      // `ventana_desde` es un DÍA (00:00 UTC) y vale el día de la fusión (N1, #381): un caso creado ese mismo día, aunque
      // sea el de origen, cuenta como nuevo. Por eso la skill `issues` pide ponerla el día siguiente al del caso de origen.
      const desde = f.ventana_desde ? Date.parse(`${f.ventana_desde}T00:00:00Z`) : null;
      const nuevosCasos = casos.filter((h) => !conocidos.has(h.number) || (desde !== null && h.createdAt && Date.parse(h.createdAt) >= desde));
      // N2 (#381): solo bloquea un no-aguanto de ESTA ventana. Uno anterior es el que motivó el arreglo nuevo, y ya
      // se contó (subió el alcance); si no, bloquearía el cierre eficaz para siempre.
      const delaVentana = (h) => desde === null || !h.createdAt || Date.parse(h.createdAt) >= desde;
      const yaDecidido = acciones.some((a) => a.tipo === "fijar" || a.tipo === "reabrir") || casos.some((h) => esNoAguanto(h) && delaVentana(h));
      if (yaDecidido && !nuevosCasos.length) {
        aviso("ventana", `la ventana venció el ${f.ventana_hasta}, pero hay un caso que no aguantó: no se cierra como eficaz`);
      } else if (nuevosCasos.length) {
        aviso("ventana", `la ventana venció el ${f.ventana_hasta} con ${lista(nuevosCasos.map((h) => h.number))} sin listar en «casos»: se reabre`);
        if (!acciones.some((a) => a.tipo === "fijar")) acciones.push({ tipo: "fijar", campos: { estado: "reabierto" } });
      } else if (hallazgos.some((h) => h.gravedad === "error")) {
        aviso("ventana", `la ventana venció el ${f.ventana_hasta} sin casos nuevos, pero la ficha tiene errores: no se cierra`);
      } else if (!aprendizajeValido(f.aprendizaje)) {
        error("cierre-sin-aprendizaje", `la ventana venció el ${f.ventana_hasta} sin casos nuevos, pero falta «aprendizaje»: sin él no se cierra`);
      } else {
        aviso("ventana", `la ventana venció el ${f.ventana_hasta} sin casos nuevos: cerrado-eficaz`);
        acciones.push({ tipo: "fijar", campos: { estado: "cerrado-eficaz" } });
        acciones.push({ tipo: "cerrar", arreglo: arregloDeBarrera(f.barrera) });
      }
    }

    // 9. La ficha al día: casos y encargos que cuelgan y no están listados.
    const sinListar = (hs, lis) => hs.filter((h) => !(lis ?? []).includes(h.number));
    if (sinListar(casos, f.casos).length) aviso("ficha-desactualizada", `casos colgados que no están en «casos»: ${lista(sinListar(casos, f.casos).map((h) => h.number))}`);
    if (sinListar(encargos, f.encargos).length) aviso("ficha-desactualizada", `encargos colgados que no están en «encargos»: ${lista(sinListar(encargos, f.encargos).map((h) => h.number))}`);
  }

  // 10. Un fondo cerrado con un caso posterior (o ya analizado como «no aguantó») se reabre: debeReabrir() de siempre.
  if (cerrado) {
    const reabre = casos.filter((h) => debeReabrir(h, fondo) && !(esNoAguanto(h) && subidos.has(h.number) && !posteriorAlCierre(h, fondo)));
    // Los `no-aguanto-*` ya contados (marca del comentario) no vuelven a reabrir cada vez que alguien cierra a mano.
    if (reabre.length && !acciones.some((a) => a.tipo === "reabrir")) {
      aviso("no-aguanto", `${lista(reabre.map((h) => h.number))} prueba${reabre.length > 1 ? "n" : ""} que el arreglo no aguantó: se reabre`);
      acciones.push({ tipo: "reabrir", porque: "no-aguanto" });
      // Se anotan como contados: sin esto, cada cierre a mano vuelve a reabrir (fondos sin ficha o con la ficha rota).
      for (const h of reabre.filter(esNoAguanto)) nuevosSubidos.add(h.number);
      if (lectura.presente && !lectura.errores.length && !acciones.some((a) => a.tipo === "fijar")) acciones.push({ tipo: "fijar", campos: { estado: "reabierto" } });
    }
  }

  // Reabrir gana a cerrar: ninguna combinación de pasos deja cerrar un fondo al que se acaba de reabrir.
  const reabre = acciones.some((x) => x.tipo === "reabrir" || (x.tipo === "fijar" && x.campos.estado === "reabierto"));
  const final = reabre
    ? acciones.filter((x) => x.tipo !== "cerrar").map((x) => (x.tipo === "fijar" && x.campos.estado ? { ...x, campos: { ...x.campos, estado: "reabierto" } } : x))
    : acciones;
  return { hallazgos, acciones: final, subidos: nuevosSubidos, ficha: f, presente: lectura.presente };
}

/** ¿Falla el control? Solo los errores; los avisos informan. */
export const falla = (resultado) => resultado.hallazgos.some((h) => h.gravedad === "error");

// ── Los encargos de un fondo (#396) ────────────────────────────────────────────

/** Los estados del fondo en que ya tiene que haber un plan completo (con su preventivo automático). */
const ESTADOS_CON_PLAN = ["plan", "en-curso", "en-observacion", "cerrado-eficaz"];
const CLAVES_ENCARGO = CAMPOS_ENCARGO.map((c) => c.clave);
const escalonDe = (id) => MECANISMOS.mecanismos.find((m) => m.id === id)?.escalon ?? null;

/** Lee el bloque `encargo` de un cuerpo. → { presente, ficha, errores } (reglas encargo-bloque y encargo-vocabulario). */
export function leerEncargo(body) {
  const campos = Object.fromEntries(CLAVES_ENCARGO.map((c) => [c, TIPOS_CAMPO_ENCARGO[c]]));
  return leerBloque(body, "encargo", campos, "encargo");
}

/**
 * Los controles de los encargos de un fondo. Puro. `encargos`: los hijos de tipo
 * encargo CON su cuerpo (abiertos y cerrados: un preventivo ya hecho cuenta).
 *   - plan-grande       más de MAX_ENCARGOS_POR_FONDO (en cualquier estado);
 *   - desde «plan»: encargo-sin-bloque / encargo-bloque / encargo-vocabulario / encargo-incompleto /
 *     encargo-juez: el bloque está, se lee y trae lo obligatorio;
 *   - sin-preventivo-automatico: con el fondo ya en «plan» o después, ninguno es
 *     preventivo con un mecanismo de escalón automático (bloqueo o test_ci).
 * Devuelve [{ regla, mensaje }]; quien llama decide si es error o aviso. Los
 * mensajes llevan solo números y vocabulario nuestro, nunca texto del autor.
 */
export function validarEncargos(encargos, estado) {
  const sal = [];
  const dice = (regla, mensaje) => sal.push({ regla, mensaje });
  if (encargos.length > MAX_ENCARGOS_POR_FONDO) {
    dice("plan-grande", `cuelgan ${encargos.length} encargos y el flujo pide como mucho ${MAX_ENCARGOS_POR_FONDO}: ${lista(encargos.map((h) => h.number))}. Une los que sean una misma pieza o cuelga el resto de otro fondo`);
  }
  // El plan se exige cuando el fondo dice que ya lo tiene: antes, los encargos se van colgando.
  if (!ESTADOS_CON_PLAN.includes(estado)) return sal;
  let hayPreventivo = false;
  let todosLeidos = true;
  for (const h of encargos) {
    const n = h.number;
    const l = leerEncargo(h.body);
    if (!l.presente) {
      todosLeidos = false;
      dice("encargo-sin-bloque", `#${n} no trae el bloque «encargo» (plantilla en docs/ops/ENCARGO.md)`);
      continue;
    }
    for (const e of l.errores) dice(e.regla, `#${n}: ${e.mensaje}`);
    if (l.errores.length) {
      todosLeidos = false;
      continue;
    }
    const e = l.ficha;
    const escalon = escalonDe(e.mecanismo);
    const faltan = CAMPOS_ENCARGO.filter((c) => {
      if (c.clave === "por_que_no_mas_alto") return escalon !== null && escalon !== BARRERAS[0] && e[c.clave] === undefined;
      return c.obligatorio === true && e[c.clave] === undefined;
    }).map((c) => c.clave);
    if (faltan.length) {
      todosLeidos = false;
      dice("encargo-incompleto", `#${n} no rellena: ${faltan.join(", ")}`);
    }
    if (e.juez !== undefined && e.juez === (Object.hasOwn(e, "constructor") ? e["constructor"] : undefined)) dice("encargo-juez", `#${n}: quien construye no juzga (constructor y juez son el mismo)`);
    if (e.tipo_accion === "preventivo" && ESCALONES_AUTOMATICOS.includes(escalon)) hayPreventivo = true;
  }
  // Solo se exige cuando el plan ya está hecho y todos los bloques se leen: si no, el motivo es el de arriba.
  if (encargos.length && todosLeidos && !hayPreventivo && ESTADOS_CON_PLAN.includes(estado)) {
    dice("sin-preventivo-automatico", `ningún encargo es «preventivo» con un mecanismo de escalón ${ESCALONES_AUTOMATICOS.join(" o ")}: el fondo no se cierra solo con arreglos que dependen de que alguien se acuerde`);
  }
  return sal;
}

// ── Hijos: todo caso y todo encargo cuelga de un fondo ────────────────────────

/** Controles de un caso o encargo respecto a su padre. `padre`: el issue padre adaptado, o null. */
export function validarHijo(hijo, padre) {
  const g = porGrupo(nombresDe(hijo.labels));
  const hallazgos = [];
  if (padre && tipoDe(padre.labels) !== "fondo") {
    hallazgos.push({ regla: "sin-fondo", gravedad: "error", mensaje: `cuelga de #${padre.number}, que no es un problema de fondo (tipo:fondo)` });
  }
  if (!padre) {
    if (g.tipo.has("caso") && !g.analisis.has("puntual") && g.analisis.size) {
      hallazgos.push({ regla: "sin-fondo", gravedad: "error", mensaje: "un caso analizado que no es puntual tiene que colgar de su problema de fondo (`npm run issues -- --colgar <caso> <fondo>`)" });
    } else if (g.tipo.has("encargo")) {
      hallazgos.push({ regla: "sin-fondo", gravedad: "aviso", mensaje: "este encargo no cuelga de ningún fondo; si es parte de un arreglo, cuélgalo (`npm run issues -- --colgar`)" });
    }
  }
  return hallazgos;
}

// ── El comentario ─────────────────────────────────────────────────────────────

export const AYUDA_FICHA = "La ficha y sus estados están explicados en la skill `issues` (sección «La ficha del fondo»). Este comentario lo escribe el workflow `fondos` y se actualiza solo; no lo borres.";

/** El texto del comentario (marca primero). Solo lleva mensajes nuestros, números y vocabulario. */
export function comentario(resultado, { subidos = new Set(), pie = AYUDA_FICHA, marca: marcaBase = MARCA, run = null, titulo = "Control de la ficha del fondo" } = {}) {
  const errores = resultado.hallazgos.filter((h) => h.gravedad === "error");
  const avisos = resultado.hallazgos.filter((h) => h.gravedad === "aviso");
  const estado = errores.length ? "falla" : "ok";
  const marca = `${marcaBase}estado=${estado}${subidos.size ? ` subidos=${[...subidos].sort((a, b) => a - b).join(",")}` : ""}${/^\d{1,15}$/.test(String(run ?? "")) ? ` run=${run}` : ""} -->`;
  const cuenta = `${errores.length} ${errores.length === 1 ? "error" : "errores"}, ${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"}`;
  const cuerpo = [
    marca,
    `**${titulo}: ${estado === "ok" ? "bien" : "falla"}** (${cuenta})`,
    "",
    ...resultado.hallazgos.map((h) => `- ${h.gravedad === "error" ? "**error**" : "aviso"} \`${h.regla}\`: ${h.mensaje}`),
    ...(resultado.hallazgos.length ? [""] : []),
    ...(resultado.acciones ?? []).filter((a) => a.tipo !== "fijar").map((a) => `Acción automática: ${a.tipo === "reabrir" ? `se reabre el issue (${a.porque})` : "se cierra como cerrado-eficaz"}.`),
    pie,
  ].join("\n");
  return cuerpo.slice(0, 6000);
}

// ── Informe para `npm run issues` ─────────────────────────────────────────────

const normaliza = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * El informe de fichas: fondos sin ficha, sin diagnóstico, con la ventana
 * vencida, y los `matiz` que se repiten (candidatos a valor nuevo del
 * vocabulario: si dos fondos distintos necesitan el mismo matiz, falta un valor).
 * `issues`: la forma de `leerIssue` (issues.mjs) con sus hijos.
 */
export function informeFichas(issues, { hoy } = {}) {
  // Solo los de la casa: el informe no cuenta lo que abre un desconocido (si no se sabe quién lo abrió, cuenta).
  const fondos = issues.filter((i) => porGrupo(nombresDe(i.labels)).tipo.has("fondo") && (!i.asociacion || esDeLaCasa(i.asociacion)));
  const abiertos = fondos.filter((i) => String(i.state).toUpperCase() === "OPEN");
  const r = { sinFicha: [], sinDiagnostico: [], ventanaVencida: [], cerradosSinAprendizaje: [], cerradosConAprendizaje: 0, sinFichaObligatoria: [], autoaplicacion: [], matices: [], total: fondos.length, conFicha: 0 };
  const matices = new Map();
  for (const f of fondos) {
    const lectura = leerFicha(f.body);
    if (lectura.presente) r.conFicha++;
    if (String(f.state).toUpperCase() === "CLOSED" && lectura.presente) {
      if (aprendizajeValido(lectura.ficha.aprendizaje)) r.cerradosConAprendizaje++;
      else r.cerradosSinAprendizaje.push(f.number);
    }
    if (lectura.ficha.matiz) {
      const k = normaliza(lectura.ficha.matiz);
      if (k) matices.set(k, [...(matices.get(k) ?? []), f.number]);
    }
  }
  for (const f of abiertos) {
    const { ficha, presente } = leerFicha(f.body);
    if (!presente) {
      r.sinFicha.push(f.number);
      if (fichaObligatoria(f)) r.sinFichaObligatoria.push(f.number);
      continue;
    }
    const encargos = (f.hijos ?? []).filter((h) => h.tipo === "encargo");
    if ((!ficha.mecanismo || !ficha.causa_escape) && (encargos.length || ESTADOS_CON_DIAGNOSTICO.includes(ficha.estado))) r.sinDiagnostico.push(f.number);
    if (hoy && ficha.estado === "en-observacion" && ficha.ventana_hasta && ficha.ventana_hasta < hoy) r.ventanaVencida.push({ number: f.number, hasta: ficha.ventana_hasta });
  }
  for (const n of FONDOS_AUTOAPLICACION) {
    const f = fondos.find((x) => x.number === n);
    if (f) r.autoaplicacion.push({ number: n, conFicha: leerFicha(f.body).presente });
  }
  r.matices = [...matices].filter(([, ns]) => ns.length >= 2).map(([matiz, ns]) => ({ matiz, veces: ns.length, issues: ns })).sort((a, b) => b.veces - a.veces);
  return r;
}
