/**
 * Pruebas de conversación de Chef Mateo: ¿llama a la herramienta que toca?
 *
 *   node scripts/bot-evals.mjs            → todos los casos
 *   node scripts/bot-evals.mjs alergia    → los que contengan «alergia»
 *
 * Usa el agente de verdad (mismo modelo, instrucciones y esquemas que en
 * Telegram, vía ejecutar()) pero con herramientas de mentira: no toca ninguna
 * casa ni la base de datos, y cada herramienta devuelve una respuesta fija de
 * una familia de ejemplo. Cuesta unos céntimos por pasada (ANTHROPIC_API_KEY
 * de .env.local). Los casos viven en scripts/bot-evals.json.
 */

import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const k of ["ANTHROPIC_API_KEY"]) {
  const v = env.match(new RegExp(`^${k}="?([^"\\r\\n]+)`, "m"))?.[1];
  if (v && !process.env[k]) process.env[k] = v.trim();
}
process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const { ejecutar, herramientas } = await import("../api/_bot/agente.js");
const { casos } = JSON.parse(fs.readFileSync(new URL("./bot-evals.json", import.meta.url), "utf8"));

const FAMILIA = "Casa de prueba: Ana (38 años), Pablo (40 años), Leo (6 años). Comida y cena todos los días. Sin alergias anotadas.";
const RESPUESTAS = {
  ver_casa: FAMILIA,
  ver_ajustes: "Estructura: primero y segundo. Esfuerzo normal. Trastos: Horno, Microondas. Gustos: nada anotado. Leo come en el cole de lunes a viernes.",
  ver_menu: "Menú activo del 2026-09-28 al 2026-10-04.\nMiércoles 30 · comida: Crema de calabaza · Pollo al horno con patatas · cena: Tortilla de calabacín\nJueves 1 · comida: Lentejas estofadas · cena: Merluza a la plancha con ensalada",
  ver_receta: "Tortilla de calabacín — 25 min, 4 raciones. Ingredientes: 6 huevos, 2 calabacines, 1 cebolla, aceite de oliva, sal. Pasos: 1. Pochar cebolla y calabacín. 2. Batir huevos y mezclar. 3. Cuajar por los dos lados.",
  ver_compra: "Frutas y verduras: calabacín 2 ud, cebolla 1 ud. Lácteos y huevos: huevos 12 ud. Quedan 3 por comprar.",
  ver_recordatorios: "No hay recordatorios pendientes en este chat.",
};

const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const contiene = (args, esperado) => Object.entries(esperado).every(([k, v]) => {
  if (k === "_todo") return normal(JSON.stringify(args)).includes(normal(v));
  if (typeof v === "boolean") return args?.[k] === v;
  return normal(args?.[k]).includes(normal(v));
});

const filtro = normal(process.argv[2] ?? "");
const elegidos = casos.filter((c) => !filtro || normal(c.nombre).includes(filtro));
const reales = await herramientas({ channel: "telegram", chatId: "0", householdId: "00000000-0000-0000-0000-000000000000", autor: null });

let bien = 0;
let coste = 0;
for (const caso of elegidos) {
  const llamadas = [];
  const tools = reales.map((t) => ({
    ...t,
    run: (args) => {
      llamadas.push({ nombre: t.name, args });
      return RESPUESTAS[t.name] ?? `Hecho (${t.name}).`;
    },
  }));
  let dicho = "";
  let fallos = [];
  try {
    const r = await ejecutar({ historia: caso.historia ?? [], entrada: caso.entrada, tools });
    dicho = r.dicho;
    coste += (r.uso.input_tokens * 3 + r.uso.output_tokens * 15 + r.uso.cache_read_input_tokens * 0.3 + r.uso.cache_creation_input_tokens * 3.75) / 1e6;
  } catch (e) {
    fallos.push(`error: ${e?.message}`);
  }
  const nombres = llamadas.map((l) => l.nombre);
  for (const n of caso.llama ?? []) if (!nombres.includes(n)) fallos.push(`no llamó a ${n}`);
  for (const n of caso.noLlama ?? []) if (nombres.includes(n)) fallos.push(`llamó a ${n} y no debía`);
  for (const [n, esperado] of Object.entries(caso.args ?? {})) {
    if (!llamadas.some((l) => l.nombre === n && contiene(l.args, esperado))) {
      fallos.push(`${n} sin ${JSON.stringify(esperado)} (llegó: ${JSON.stringify(llamadas.filter((l) => l.nombre === n).map((l) => l.args))})`);
    }
  }
  for (const [n, prohibido] of Object.entries(caso.noLlamaCon ?? {})) {
    if (llamadas.some((l) => l.nombre === n && contiene(l.args, prohibido))) fallos.push(`llamó a ${n} con ${JSON.stringify(prohibido)}`);
  }
  if (caso.texto && !new RegExp(caso.texto, "m").test(dicho)) fallos.push(`la respuesta no casa con /${caso.texto}/`);
  if (caso.sinTexto && new RegExp(caso.sinTexto, "m").test(dicho)) fallos.push(`la respuesta casa con /${caso.sinTexto}/ y no debía`);

  if (!fallos.length) bien++;
  console.log(`${fallos.length ? "✗" : "✓"} ${caso.nombre}  [${nombres.join(", ") || "sin herramientas"}]`);
  for (const f of fallos) console.log(`    ${f}`);
  if (fallos.length && process.env.VERBOSO) console.log(`    respuesta: ${dicho.replace(/\n/g, " ⏎ ").slice(0, 400)}`);
}
console.log(`\n${bien}/${elegidos.length} bien · ~$${coste.toFixed(3)}`);
process.exitCode = bien === elegidos.length ? 0 : 1;
