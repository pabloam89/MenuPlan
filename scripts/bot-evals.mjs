/**
 * Pruebas de conversación de Lola: ¿llama a la herramienta que toca?
 *
 *   node scripts/bot-evals.mjs                     → todos los casos (nivel completo), ~3,5 $
 *   node scripts/bot-evals.mjs --nivel=pr          → el núcleo N1 (24 casos), ~0,6-0,8 $
 *   node scripts/bot-evals.mjs --nivel=seguridad   → los 32 de seguridad; alergias y salud k=5, el resto k=3; un fallo bloquea, ~3,2-3,4 $
 *   node scripts/bot-evals.mjs alergia             → los que contengan «alergia» en el nombre o el id
 *   node scripts/bot-evals.mjs --reserva           → con el modelo del plan B (agente.js MODELO_RESERVA)
 *
 * Opciones:
 *   --tope=USD      para antes de pasarse (por defecto TOPE_PASADA_USD, nunca más
 *                   de lo que queda del presupuesto del mes) y sale con código 3.
 *                   --tope=0: solo lo que ya está en memoria, sin llamar al modelo.
 *   --k=N           cada caso tiene que pasar N veces (pass^k).
 *   --reintentos=N  un caso que falla con k=1 se repite N veces; si uno pasa, «inestable».
 *   --sin-memo      no reutiliza resultados guardados.
 *   --referencia=ID compara con esa pasada (por defecto, la última del mismo
 *                   modelo con otra versión de prompt o código): lo que pasaba y
 *                   ahora es inestable o fallido es una regresión y bloquea.
 *   --simulado      sin modelo ni red: un modelo de mentira que contesta siempre lo
 *                   mismo, para probar el script (tope, memoria, JSONL) gratis.
 *
 * Usa el agente de verdad (mismo modelo, instrucciones y esquemas que en
 * Telegram, vía ejecutar()) pero con herramientas de mentira: no toca ninguna
 * casa ni la base de datos, y cada herramienta devuelve una respuesta fija de
 * una familia de ejemplo (ANTHROPIC_API_KEY de .env.local). Los casos viven en
 * scripts/bot-evals.json; vocabularios, precios, niveles y hashes, en
 * scripts/lib/evals.mjs.
 *
 * Cada intento deja una línea en .evals-out/bot-evals.jsonl (fuera de git). Un
 * caso con el mismo caso_hash, prompt_hash, codigo_hash, modelo y esfuerzo que
 * uno ya guardado (y el mismo día, si lleva "dependeDeFecha") no vuelve a
 * llamar al modelo: se reutiliza lo guardado. El resumen de cada pasada (el
 * estado de cada caso) va a .evals-out/pasadas.jsonl, para compararlas.
 */

import fs from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cargarEnv, RAIZ } from "./lib/env.mjs";
import {
  CORRECTORES, NIVELES, REINTENTOS_POR_NIVEL, SALIDA, VERSION_ESQUEMA, baseMemo, bloquea, cabeOtro, casosDelNivel, compararEstados, elegirReferencia, ficherosDelCodigo,
  casosVersion, claveMemo, codigoHash, costeUsd, erroresDeCasos, esEstricto, estadoDe, estimadoSiguiente,
  kDe, leerJsonl, memoria, opcion, opcionEntero, opcionNumero, otroIntento, promptHash, tokensDe, topeDePasada,
} from "./lib/evals.mjs";

const ARGV = process.argv.slice(2);
const SIMULADO = ARGV.includes("--simulado");
const { casos } = JSON.parse(fs.readFileSync(new URL("./bot-evals.json", import.meta.url), "utf8"));

let NIVEL, K, REINTENTOS, TOPE;
try {
  NIVEL = opcion(ARGV, "nivel") ?? "completo";
  if (!NIVELES.includes(NIVEL)) throw new Error(`--nivel: ${NIVEL} no existe (${NIVELES.join(", ")})`);
  K = opcionEntero(ARGV, "k");
  REINTENTOS = opcionEntero(ARGV, "reintentos", 0) ?? REINTENTOS_POR_NIVEL[NIVEL];
  TOPE = topeDePasada(opcionNumero(ARGV, "tope"));
} catch (e) {
  // Un --tope mal escrito no puede correr sin tope: no se corre nada.
  console.error(e.message);
  process.exit(SALIDA.entrada);
}
const SIN_MEMO = ARGV.includes("--sin-memo");
const REFERENCIA = opcion(ARGV, "referencia");

const malEtiquetados = erroresDeCasos(casos);
if (malEtiquetados.length) {
  console.error(`bot-evals.json tiene casos mal etiquetados:\n  ${malEtiquetados.join("\n  ")}`);
  process.exit(SALIDA.entrada);
}

if (SIMULADO) process.env.ANTHROPIC_API_KEY ||= "simulado";
else cargarEnv(["ANTHROPIC_API_KEY"]);
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const { ejecutar, herramientas, conQuienEscribe, MODELO, MODELO_RESERVA } = await import("../api/_bot/agente.js");
const { bloqueDe } = await import("../api/_bot/pendientes.js");
const { bloqueDeTareas } = await import("../api/_bot/tareas.js");
const { supervisar } = await import("../api/_bot/supervisor.js");
// La pista del enrutador (BOT_PISTA), con el mismo texto que en Telegram: un
// caso con "pista" { decision, adelanto } mide si Lola la usa sin fiarse de más.
const { textoPista } = await import("../api/_bot/pista.js");
// Un solo modelo por pasada: sin esto, un fallo de la API caería al plan B en
// silencio y la medida mezclaría dos modelos.
const RESERVA = ARGV.includes("--reserva");
const MEDIDO = SIMULADO ? "simulado" : RESERVA ? MODELO_RESERVA : MODELO;
const ESFUERZO = /haiku/.test(MEDIDO) ? "ninguno" : process.env.BOT_EFFORT || "por_defecto";

const FAMILIA = "Casa de prueba: Ana (38 años), Pablo (40 años), Leo (6 años). Comida y cena todos los días. Sin alergias anotadas.";
function hoyEnMadrid() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const corta = (iso) => `${Number(iso.slice(8, 10))} ${MES_CORTO[Number(iso.slice(5, 7)) - 1]}`;
function cabeceraDe(hoy) {
  return `${DIA_CORTO[new Date(`${hoy}T12:00:00Z`).getUTCDay()]} ${corta(hoy)} (${hoy})`;
}
function rangoDeLaSemana(hoy) {
  const d = new Date(`${hoy}T12:00:00Z`);
  const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000);
  const domingo = new Date(lunes.getTime() + 6 * 86400000);
  return `${corta(lunes.toISOString().slice(0, 10))}–${corta(domingo.toISOString().slice(0, 10))}`;
}

// La misma casa, como la monta api/_bot/ficha.js.
const fichaDel = (hoy) => ({
  estable: [
    "SEGURIDAD", "- Ana, Pablo, Leo: ninguna.",
    "CASA", "- Ana 38 · Pablo 40 · Leo 6.", "- Todos comen lo mismo.", "- Leo: cole L–V a mediodía.",
    "COCINA", "- Comida: primero y segundo. Cena: plato único.", "- Horno, microondas.",
  ].join("\n"),
  // Con la fecha de HOY, como en producción: con una fija, «Ahora mismo en
  // España» y la ficha se contradecían y Lola, con razón, iba a mirar el menú.
  delDia: [
    cabeceraDe(hoy), `MENÚ ${rangoDeLaSemana(hoy)} (no hay semana siguiente)`,
    "- Hoy: crema de calabaza + pollo al horno con patatas; cena tortilla de calabacín.",
    "- Mañana: lentejas estofadas; cena merluza a la plancha con ensalada.",
  ].join("\n"),
});
const FICHA = fichaDel(hoyEnMadrid());
const RESPUESTAS = {
  ver_casa: FAMILIA,
  ver_ajustes: "Estructura: primero y segundo. Esfuerzo normal. Trastos: Horno, Microondas. Gustos: nada anotado. Leo come en el cole de lunes a viernes.",
  ver_menu: "Menú activo del 2026-09-28 al 2026-10-04.\nmiércoles:\n  Comida: primero Crema de calabaza; segundo Pollo al horno con patatas\n  Cena: Tortilla de calabacín\njueves:\n  Comida: Lentejas estofadas\n  Cena: Merluza a la plancha con ensalada",
  ver_receta: "Tortilla de calabacín (25 min, 4 raciones)\n\nIngredientes:\n• huevos — 6 ud\n• calabacín — 2 ud\n• cebolla — 1 ud\n\nPasos:\n1. Pochar cebolla y calabacín.\n2. Batir huevos y mezclar.\n3. Cuajar por los dos lados.",
  // Como las de verdad: generar devuelve la semana que queda y cambiar dice qué
  // ha cambiado. Con un «Hecho» a secas el modelo iba a comprobarlo con ver_menu.
  // La semana ENTERA, como describirMenu: con solo tres días el modelo iba a
  // ver_menu a buscar el resto, y eso medía un fallo de la prueba, no de Lola.
  // El pollo al horno ya está (martes): pedido el salmón, basta un cambio.
  generar_menu: (a) => `Menú nuevo generado y activado: del ${a.semana === "siguiente" ? "2026-10-05 al 2026-10-11" : "2026-09-30 al 2026-10-04"}, 14 huecos con plato.`
    + ((a.fijos ?? []).length ? `\nLo que pidieron, ya puesto (no hace falta cambiar_plato):\n${a.fijos.map((f, i) => `«${f.nombre}» → ${f.nombre} (${["lunes", "martes", "jueves"][i % 3]}, ${String(f.comida ?? "comida").toLowerCase()})`).join("\n")}` : "")
    + `\n\nAsí queda (no hace falta ver_menu):\nSemana del 5 oct al 11 oct.\n\nlunes:\n  Comida: primero Crema de calabaza; segundo Merluza en salsa verde\n  Cena: Tortilla francesa con ensalada\nmartes:\n  Comida: Lentejas estofadas\n  Cena: Pollo al horno con patatas\nmiércoles:\n  Comida: Arroz con verduras\n  Cena: Sopa de fideos\njueves:\n  Comida: primero Ensalada mixta; segundo Albóndigas en salsa\n  Cena: Revuelto de setas\nviernes:\n  Comida: Paella de verduras\n  Cena: Pizza casera de jamón y queso\nsábado:\n  Comida: Garbanzos con espinacas\n  Cena: Hamburguesa de ternera\ndomingo:\n  Comida: Lasaña de carne\n  Cena: Crema de puerros`,
  cambiar_plato: (a) => `Cambiado (${a.dia ?? "?"}, ${a.comida ?? "?"}): Tortilla francesa con ensalada → ${a.receta ?? "Merluza en salsa verde"}.\n\nAsí queda ese día (es lo guardado, no hace falta ver_menu):\nSemana del 5 oct al 11 oct.\n\n${a.dia ?? "lunes"}:\n  Comida: primero Crema de calabaza; segundo Merluza en salsa verde\n  ${a.comida ?? "Cena"}: ${a.receta ?? "Merluza en salsa verde"}`,
  buscar_recetas: "40 receta(s) en Sólidos de bebé. Las primeras 6:\n1. Albóndigas de pavo y manzana al horno (30 min)\n2. Albóndigas de salmón y patata (35 min)\n3. Bastones de boniato al horno (30 min)\n4. Tortitas de avena y plátano (15 min)\n5. Croquetas de brócoli (40 min)\n6. Palitos de calabacín rebozados (25 min)\nHay 34 más: se pueden pedir o verlas todas en la app.",
  preparar_receta: "Receta preparada, SIN guardar todavía. Enséñasela y pregunta si la guardo:\nNombre: Tortilla de patatas de la abuela\nRaciones: 4; tiempo: 35 min; dificultad: normal\nCuándo: cena\nAlérgenos: huevos\nIngredientes: huevos 6 ud; patatas 600 g; cebolla 1 ud; aceite de oliva 150 ml; sal\nPasos: 8\nFoto: sin foto; visibilidad: solo para la casa",
  proponer_platos: "Opciones para el jueves, cena. Ahora mismo: Merluza a la plancha con ensalada.\n1. Garbanzos especiados con espinacas y piñones (25 min, facil)\n2. Tortilla de patata y cebolla (30 min, facil)\n3. Crema de puerros con picatostes (30 min, facil)\nNada está cambiado aún: para poner una, cambiar_plato con receta = su nombre.",
  ver_compra: "Frutas y verduras: calabacín 2 ud, cebolla 1 ud. Lácteos y huevos: huevos 12 ud. Quedan 3 por comprar.",
  ver_recordatorios: "No hay recordatorios pendientes en este chat.",
};

// Una «foto» de prueba: líneas de texto pintadas en un PNG (sharp), sin
// guardar imágenes en el repo.
async function fotoDe(lineas) {
  const { default: sharp } = await import("sharp");
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const alto = 60 + lineas.length * 34;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${alto}"><rect width="100%" height="100%" fill="white"/>${
    lineas.map((l, i) => `<text x="30" y="${50 + i * 34}" font-family="monospace" font-size="24" fill="black">${esc(l)}</text>`).join("")}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { tipo: "image", mediaType: "image/png", base64: png.toString("base64") };
}

const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
// Si el caso espera un día de la semana y la prueba corre ese mismo día, Lola
// acierta igual diciendo «hoy» o la fecha de hoy (pasó un jueves con «la cena
// del jueves»): la prueba no puede depender del día en que se ejecuta.
const HOY_MADRID = hoyEnMadrid();
const DIA_DE_HOY = normal(new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "Europe/Madrid" }).format(new Date()));
const contiene = (args, esperado) => Object.entries(esperado).every(([k, v]) => {
  if (k === "_todo") return normal(JSON.stringify(args)).includes(normal(v));
  if (typeof v === "boolean") return args?.[k] === v;
  const dado = normal(args?.[k]);
  if ((k === "dia" || k === "dias") && normal(v) === DIA_DE_HOY && (dado.includes("hoy") || dado.includes(HOY_MADRID))) return true;
  return dado.includes(normal(v));
});

const filtro = normal(ARGV.find((a) => !a.startsWith("--")) ?? "");
const elegidos = casosDelNivel(casos, NIVEL).filter((c) => !filtro || normal(c.nombre).includes(filtro) || c.id.includes(filtro));
// `"papel"` en un caso (owner | editor | viewer | ajeno; por defecto titular)
// y `"esGrupo"`: las herramientas que ve Lola y la línea de la ficha salen
// como en el bot de verdad (api/_bot/papel.js, herramientaPermitida).
const realesDe = (caso) => herramientas({ channel: "telegram", chatId: "0", householdId: "00000000-0000-0000-0000-000000000000", autor: null, papel: caso.papel ?? "owner", esGrupo: Boolean(caso.esGrupo) });

// ── Versiones: lo que lee Lola, el código que corre y los casos ──────────────
// prompt_hash: las instrucciones (SISTEMA es conocimiento.md tal cual,
// agente.js), las herramientas del titular y la ficha base con una fecha fija
// (la de hoy cambiaría el hash cada día sin cambiar nada de Lola).
const PROMPT_HASH = promptHash({
  sistema: fs.readFileSync(join(RAIZ, "api/_bot/conocimiento.md"), "utf8").replace(/\r\n/g, "\n"),
  herramientas: (await realesDe({})).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
  ficha: fichaDel("2026-01-05"),
});
// codigo_hash: lo que corre en la prueba además del prompt (el turno, el
// supervisor, la pista, las tareas…) y este script con sus respuestas de
// mentira. Sin core.mjs: es el motor empaquetado y aquí las herramientas son falsas.
const CODIGO_HASH = codigoHash(RAIZ, ficherosDelCodigo(RAIZ));
// El commit con el que se midió (y si había cambios sin guardar): para volver a él.
function gitSha() {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: RAIZ, encoding: "utf8" }).trim();
    const sucio = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: RAIZ, encoding: "utf8" }).trim();
    return sucio ? `${sha}+cambios` : sha;
  } catch (e) {
    console.warn(`[bot-evals] sin git_sha: ${e.message}`);
    return null;
  }
}
const GIT_SHA = gitSha();
const CASOS_VERSION = casosVersion(casos);

const SALIDA_DIR = join(RAIZ, ".evals-out");
const JSONL = join(SALIDA_DIR, SIMULADO ? "bot-evals-simulado.jsonl" : "bot-evals.jsonl");
const MEMORIA = SIN_MEMO ? new Map() : memoria(leerJsonl(JSONL));
const PASADAS = join(SALIDA_DIR, SIMULADO ? "pasadas-simulado.jsonl" : "pasadas.jsonl");
const PASADA = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomUUID().slice(0, 6)}`;
fs.mkdirSync(SALIDA_DIR, { recursive: true });

// Un modelo de mentira (--simulado): contesta siempre lo mismo, sin herramientas
// y con un gasto inventado del tamaño de un caso real con caché, para que el
// tope se pueda probar sin pagar.
const vueltaSimulada = async () => ({
  dicho: "Respuesta simulada.",
  uso: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 36000, cache_creation_input_tokens: 0 },
  vueltas: 1, primera: null, llamadas: [],
});

const CAMPOS_ESPERADO = ["llama", "llamaAlguna", "noLlama", "antes", "args", "noLlamaCon", "maxLlamadas", "texto", "sinTexto"];

/** Un intento de un caso: llama a Lola y corrige con las reglas del caso. */
async function intentar(caso) {
  const t0 = Date.now();
  const llamadas = [];
  // Lo que escribió la persona y lo último que dijo Lola: el supervisor de lo
  // delicado (api/_bot/supervisor.js) los mira igual que en el bot de verdad.
  // Sin esto, al poner herramientas de mentira, el supervisor no actuaba y
  // las pruebas de alergias no medían lo que pasa en Telegram.
  const anterior = [...(caso.historia ?? [])].reverse().find((h) => h.role === "assistant")?.content ?? "";
  const tools = (await realesDe(caso)).map((t) => ({
    ...t,
    run: (args) => {
      const freno = supervisar(t.name, args, caso.entrada, { anterior });
      if (freno) { llamadas.push({ nombre: `${t.name} (frenada)`, args }); return freno; }
      // `"respuestas": { herramienta: "texto" | ["1.ª", "2.ª", …] }` en un caso
      // pisa la de siempre; con una lista, cada llamada recibe la suya (la
      // última se repite): así se prueba qué dice Lola cuando algo falla.
      const propia = caso.respuestas?.[t.name];
      const vez = llamadas.filter((l) => l.nombre === t.name).length;
      llamadas.push({ nombre: t.name, args });
      if (propia != null) return Array.isArray(propia) ? propia[Math.min(vez, propia.length - 1)] : propia;
      const r = RESPUESTAS[t.name];
      return typeof r === "function" ? r(args) : r ?? `Hecho (${t.name}).`;
    },
  }));
  let dicho = "";
  let uso = {};
  let vueltas = 0;
  const fallos = [];
  const falla = (motivo, detalle) => fallos.push({ motivo, detalle });
  try {
    const adjunto = caso.foto ? await fotoDe(caso.foto) : null;
    // Lola recibe la ficha de la casa en cada mensaje (api/_bot/ficha.js): sin
    // ella, las pruebas medían a una Lola que no sabe nada de la familia.
    // `"ficha": null` en un caso la quita; `"ficha": {…}` pone otra.
    const ficha = conQuienEscribe(caso.ficha === undefined ? FICHA : caso.ficha, caso.papel ?? "owner", caso.idioma ?? null);
    const pista = caso.pista ? textoPista(caso.pista.decision, caso.pista.adelanto) : null;
    // `pendientes`: las tareas abiertas que el código adjuntaría (api/_bot/pendientes.js).
    // `tareas`: las de la tabla bot_tareas, como las monta el turno real.
    const entrada = [bloqueDeTareas(caso.tareas ?? [], { data: { members: caso.miembros ?? [] }, chatId: "0" }), bloqueDe(caso.pendientes ?? []), caso.entrada].filter(Boolean).join("\n\n");
    const r = await ejecutar({ historia: caso.historia ?? [], entrada, tools, adjunto, modelos: [MEDIDO], ficha, pista, ...(SIMULADO ? { vuelta: vueltaSimulada } : {}) });
    dicho = r.dicho;
    uso = r.uso;
    vueltas = r.vueltas ?? 0;
  } catch (e) {
    falla("error", String(e?.message ?? e).slice(0, 300));
  }
  const nombres = llamadas.map((l) => l.nombre);
  for (const n of caso.llama ?? []) if (!nombres.includes(n)) falla("no_llamo", `no llamó a ${n}`);
  // Alguna de estas (cuando hay más de una forma correcta de guardarlo).
  if (caso.llamaAlguna && !caso.llamaAlguna.some((n) => nombres.includes(n))) falla("no_llamo_ninguna", `no llamó a ninguna de ${caso.llamaAlguna.join(", ")}`);
  for (const n of caso.noLlama ?? []) if (nombres.includes(n)) falla("llamo_prohibida", `llamó a ${n} y no debía`);
  // `"antes": [["a", "b"]]`: la primera vez que llama a «a» va antes que la
  // primera de «b» (apuntar las condiciones y después generar).
  for (const [a, b] of caso.antes ?? []) {
    const ia = nombres.indexOf(a);
    const ib = nombres.indexOf(b);
    if (ia >= 0 && ib >= 0 && ia > ib) falla("orden", `llamó a ${b} antes que a ${a}`);
  }
  for (const [n, esperado] of Object.entries(caso.args ?? {})) {
    if (!llamadas.some((l) => l.nombre === n && contiene(l.args, esperado))) {
      falla("sin_args", `${n} sin ${JSON.stringify(esperado)} (llegó: ${JSON.stringify(llamadas.filter((l) => l.nombre === n).map((l) => l.args))})`);
    }
  }
  for (const [n, prohibido] of Object.entries(caso.noLlamaCon ?? {})) {
    if (llamadas.some((l) => l.nombre === n && contiene(l.args, prohibido))) falla("con_args_prohibidos", `llamó a ${n} con ${JSON.stringify(prohibido)}`);
  }
  // Tope de vueltas: cada herramienta es una llamada más al modelo, y en el
  // chat eso son segundos (llegó a 56 s repitiendo ver_menu tras cada cambio).
  if (caso.maxLlamadas && llamadas.length > caso.maxLlamadas) falla("demasiadas_llamadas", `${llamadas.length} llamadas (máx ${caso.maxLlamadas})`);
  if (caso.texto && !new RegExp(caso.texto, "mi").test(dicho)) falla("texto_no_casa", `la respuesta no casa con /${caso.texto}/`);
  if (caso.sinTexto && new RegExp(caso.sinTexto, "mi").test(dicho)) falla("texto_prohibido", `la respuesta casa con /${caso.sinTexto}/ y no debía`);
  return { aprobado: !fallos.length, fallos, nombres, dicho, uso, vueltas, ms: Date.now() - t0, coste: costeUsd(uso, MEDIDO) };
}

const k1 = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
let gastado = 0;
let pagados = 0;
let paradoPorTope = false;
const tiempos = [];
const estados = {};
let bloqueos = 0;
const porCaso = {};
const inestables = [];
let deMemoria = 0;
const suma = { entrada: 0, salida: 0, cache_leida: 0, cache_escrita: 0, vueltas: 0 };

// La referencia se elige ANTES de gastar: una --referencia que no existe no corre nada.
let referencia = null;
try {
  referencia = elegirReferencia(leerJsonl(PASADAS), { pedida: REFERENCIA, actual: { modelo: MEDIDO, esfuerzo: ESFUERZO, prompt_hash: PROMPT_HASH, codigo_hash: CODIGO_HASH } });
} catch (e) {
  console.error(e.message);
  process.exit(SALIDA.entrada);
}

console.log(`Nivel ${NIVEL} · ${elegidos.length} casos · ${MEDIDO} · tope $${TOPE.toFixed(2)} · prompt ${PROMPT_HASH} · código ${CODIGO_HASH} · casos ${CASOS_VERSION}${SIN_MEMO ? " · sin memoria" : ""}\n`);
for (const caso of elegidos) {
  const k = kDe(caso, NIVEL, K);
  const estricto = esEstricto(caso, NIVEL);
  const base = baseMemo(caso, { prompt_hash: PROMPT_HASH, codigo_hash: CODIGO_HASH, modelo: MEDIDO, esfuerzo: ESFUERZO, hoy: HOY_MADRID });
  const previos = MEMORIA.get(claveMemo(base)) ?? [];
  const nuevos = [];
  const resultados = () => [...previos, ...nuevos.map((n) => n.aprobado)];
  while (otroIntento(resultados(), { k, reintentos: REINTENTOS, estricto })) {
    if (!cabeOtro(gastado, TOPE, estimadoSiguiente(gastado, pagados))) { paradoPorTope = true; break; }
    const r = await intentar(caso);
    gastado += r.coste;
    pagados++;
    nuevos.push(r);
    tiempos.push(r.ms / 1000);
    const t = tokensDe(r.uso);
    for (const c of Object.keys(t)) suma[c] += t[c];
    suma.vueltas += r.vueltas;
    const fila = {
      v: VERSION_ESQUEMA, pasada_id: PASADA, fecha: new Date().toISOString(), script: "bot-evals", nivel: NIVEL,
      caso_id: caso.id, tipo: caso.tipo, dominio: caso.dominio, origen: caso.origen, ...base,
      casos_version: CASOS_VERSION, git_sha: GIT_SHA, intento: previos.length + nuevos.length, k, corrector: CORRECTORES[0],
      aprobado: r.aprobado, puntuacion: r.aprobado ? 1 : 0,
      motivos: [...new Set(r.fallos.map((f) => f.motivo))], fallos: r.fallos.map((f) => f.detalle),
      esperado: Object.fromEntries(CAMPOS_ESPERADO.filter((c) => caso[c] !== undefined).map((c) => [c, caso[c]])),
      obtenido: { herramientas: r.nombres, respuesta: r.dicho.slice(0, 800) },
      tokens: t, vueltas: r.vueltas, llamadas_herramienta: r.nombres.length,
      coste_usd: Number(r.coste.toFixed(6)), latencia_ms: r.ms,
    };
    fs.appendFileSync(JSONL, `${JSON.stringify(fila)}\n`);
  }
  const todos = resultados();
  const estado = estadoDe(todos, k);
  estados[estado] = (estados[estado] ?? 0) + 1;
  porCaso[caso.id] = estado;
  if (estado === "inestable") inestables.push(caso.id);
  if (bloquea(estado, estricto)) bloqueos++;
  if (!nuevos.length && previos.length) deMemoria++;

  const marca = { aprobado: "✓", inestable: "~", fallido: "✗", incompleto: "…", sin_correr: "·" }[estado];
  const ultimo = nuevos.at(-1);
  const tCaso = nuevos.reduce((o, n) => { const t = tokensDe(n.uso); return { tok: o.tok + t.entrada + t.salida + t.cache_leida + t.cache_escrita, cache: o.cache + t.cache_leida + t.cache_escrita, v: o.v + n.vueltas, c: o.c + n.coste }; }, { tok: 0, cache: 0, v: 0, c: 0 });
  const medida = nuevos.length
    ? `${(ultimo.ms / 1000).toFixed(1)} s · ${(tCaso.v / nuevos.length).toFixed(1)} vueltas · ${k1(Math.round(tCaso.tok / nuevos.length))} tok (${k1(Math.round(tCaso.cache / nuevos.length))} caché) · $${tCaso.c.toFixed(4)}`
    : previos.length ? "de memoria, sin llamar" : "sin correr (tope)";
  const pk = `pass^${k} ${todos.filter(Boolean).length}/${todos.length}${previos.length && nuevos.length ? ` (${previos.length} de memoria)` : ""}`;
  console.log(`${marca} ${caso.nombre}  [${ultimo ? ultimo.nombres.join(", ") || "sin herramientas" : "—"}]  ${medida} · ${pk}${estado === "inestable" ? " · INESTABLE" : ""}`);
  for (const n of nuevos.filter((x) => !x.aprobado)) for (const f of n.fallos) console.log(`    ${f.detalle}`);
  if (ultimo && (!ultimo.aprobado || process.env.VERBOSO === "todo") && process.env.VERBOSO) console.log(`    respuesta: ${ultimo.dicho.replace(/\n/g, " ⏎ ").slice(0, 400)}`);
}
const orden = [...tiempos].sort((a, b) => a - b);
const mediana = orden.length ? orden[Math.floor(orden.length / 2)] : 0;
const media = (x) => (pagados ? Math.round(x / pagados) : 0);
// La primera línea la lee scripts/modelos-evals.mjs: no cambies su forma.
console.log(`\n${estados.aprobado ?? 0}/${elegidos.length} bien · ~$${gastado.toFixed(3)} · mediana ${mediana.toFixed(1)} s, máx ${(orden.at(-1) ?? 0).toFixed(1)} s · ${MEDIDO}, esfuerzo ${ESFUERZO}`);
console.log(`Estados: ${Object.entries(estados).map(([e, n]) => `${e} ${n}`).join(" · ")} · de memoria ${deMemoria} · intentos pagados ${pagados}`);
if (pagados) console.log(`Por intento: ${media(suma.entrada)} entrada · ${media(suma.salida)} salida · ${media(suma.cache_leida)} caché leída · ${media(suma.cache_escrita)} caché escrita · ${(suma.vueltas / pagados).toFixed(2)} vueltas · $${(gastado / pagados).toFixed(4)}`);
console.log(`Resultados en ${JSONL.replace(RAIZ, ".").replace(/\\/g, "/")} (pasada ${PASADA})`);

// Los «~» aparte: fuera de seguridad un inestable suelto no bloquea, pero no
// se puede perder entre 135 líneas.
console.log(inestables.length ? `Inestables (${inestables.length}): ${inestables.join(", ")}` : "Inestables: ninguno");

// Comparar con la referencia: lo que pasaba y ahora no, bloquea.
const resumen = {
  v: VERSION_ESQUEMA, pasada_id: PASADA, fecha: new Date().toISOString(), fecha_madrid: HOY_MADRID, nivel: NIVEL,
  modelo: MEDIDO, esfuerzo: ESFUERZO, prompt_hash: PROMPT_HASH, codigo_hash: CODIGO_HASH, casos_version: CASOS_VERSION,
  git_sha: GIT_SHA, coste_usd: Number(gastado.toFixed(6)), parado_por_tope: paradoPorTope, estados: porCaso,
};
let regresiones = [];
if (!referencia) {
  console.log("Sin referencia: no hay pasada guardada de otra versión con este modelo; los inestables no se pueden juzgar como regresión.");
} else {
  const c = compararEstados(referencia.estados ?? {}, porCaso);
  regresiones = c.regresiones;
  console.log(`Referencia ${referencia.pasada_id} (prompt ${referencia.prompt_hash} · código ${referencia.codigo_hash} · ${referencia.git_sha ?? "sin sha"}): ${regresiones.length} regresiones, ${c.mejoras.length} mejoras`);
  for (const x of regresiones) console.log(`    REGRESIÓN ${x.caso_id}: ${x.antes} → ${x.ahora}`);
  for (const x of c.mejoras) console.log(`    mejora ${x.caso_id}: ${x.antes} → ${x.ahora}`);
}
fs.appendFileSync(PASADAS, `${JSON.stringify(resumen)}\n`);

if (paradoPorTope) {
  console.log(`\nPARADO POR EL TOPE: gastado $${gastado.toFixed(3)} de $${TOPE.toFixed(2)}. Faltan casos por correr (salida ${SALIDA.tope}).`);
  process.exitCode = SALIDA.tope;
} else {
  process.exitCode = bloqueos || regresiones.length ? SALIDA.fallos : SALIDA.bien;
}
