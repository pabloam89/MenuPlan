/**
 * Pruebas de conversación de Lola: ¿llama a la herramienta que toca?
 *
 *   node scripts/bot-evals.mjs            → todos los casos
 *   node scripts/bot-evals.mjs alergia    → los que contengan «alergia»
 *   node scripts/bot-evals.mjs --reserva  → con el modelo del plan B (agente.js MODELO_RESERVA)
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

const { ejecutar, herramientas, MODELO, MODELO_RESERVA } = await import("../api/_bot/agente.js");
// Un solo modelo por pasada: sin esto, un fallo de la API caería al plan B en
// silencio y la medida mezclaría dos modelos.
const RESERVA = process.argv.includes("--reserva");
const MEDIDO = RESERVA ? MODELO_RESERVA : MODELO;
// $/M tokens: entrada, salida, leída de caché, escrita en caché.
const PRECIO = /haiku/.test(MEDIDO) ? [1, 5, 0.1, 1.25] : /opus/.test(MEDIDO) ? [5, 25, 0.5, 6.25] : [3, 15, 0.3, 3.75];
const { casos } = JSON.parse(fs.readFileSync(new URL("./bot-evals.json", import.meta.url), "utf8"));

const FAMILIA = "Casa de prueba: Ana (38 años), Pablo (40 años), Leo (6 años). Comida y cena todos los días. Sin alergias anotadas.";
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
const contiene = (args, esperado) => Object.entries(esperado).every(([k, v]) => {
  if (k === "_todo") return normal(JSON.stringify(args)).includes(normal(v));
  if (typeof v === "boolean") return args?.[k] === v;
  return normal(args?.[k]).includes(normal(v));
});

const filtro = normal(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "");
const elegidos = casos.filter((c) => !filtro || normal(c.nombre).includes(filtro));
const reales = await herramientas({ channel: "telegram", chatId: "0", householdId: "00000000-0000-0000-0000-000000000000", autor: null });

let bien = 0;
let coste = 0;
// Lo que tarda cada turno, para comparar modelos y esfuerzos (BOT_MODELO,
// BOT_EFFORT): la velocidad es lo que nota quien espera en el chat.
const tiempos = [];
for (const caso of elegidos) {
  const t0 = Date.now();
  const llamadas = [];
  const tools = reales.map((t) => ({
    ...t,
    run: (args) => {
      llamadas.push({ nombre: t.name, args });
      const r = RESPUESTAS[t.name];
      return typeof r === "function" ? r(args) : r ?? `Hecho (${t.name}).`;
    },
  }));
  let dicho = "";
  let fallos = [];
  try {
    const adjunto = caso.foto ? await fotoDe(caso.foto) : null;
    const r = await ejecutar({ historia: caso.historia ?? [], entrada: caso.entrada, tools, adjunto, modelos: [MEDIDO] });
    dicho = r.dicho;
    coste += (r.uso.input_tokens * PRECIO[0] + r.uso.output_tokens * PRECIO[1] + r.uso.cache_read_input_tokens * PRECIO[2] + r.uso.cache_creation_input_tokens * PRECIO[3]) / 1e6;
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
  // Tope de vueltas: cada herramienta es una llamada más al modelo, y en el
  // chat eso son segundos (llegó a 56 s repitiendo ver_menu tras cada cambio).
  if (caso.maxLlamadas && llamadas.length > caso.maxLlamadas) fallos.push(`${llamadas.length} llamadas (máx ${caso.maxLlamadas})`);
  if (caso.texto && !new RegExp(caso.texto, "mi").test(dicho)) fallos.push(`la respuesta no casa con /${caso.texto}/`);
  if (caso.sinTexto && new RegExp(caso.sinTexto, "mi").test(dicho)) fallos.push(`la respuesta casa con /${caso.sinTexto}/ y no debía`);

  if (!fallos.length) bien++;
  const s = (Date.now() - t0) / 1000;
  tiempos.push(s);
  console.log(`${fallos.length ? "✗" : "✓"} ${caso.nombre}  [${nombres.join(", ") || "sin herramientas"}]  ${s.toFixed(1)} s`);
  for (const f of fallos) console.log(`    ${f}`);
  if (fallos.length && process.env.VERBOSO) console.log(`    respuesta: ${dicho.replace(/\n/g, " ⏎ ").slice(0, 400)}`);
}
const orden = [...tiempos].sort((a, b) => a - b);
const mediana = orden.length ? orden[Math.floor(orden.length / 2)] : 0;
console.log(`\n${bien}/${elegidos.length} bien · ~$${coste.toFixed(3)} · mediana ${mediana.toFixed(1)} s, máx ${(orden.at(-1) ?? 0).toFixed(1)} s · ${MEDIDO}, esfuerzo ${/haiku/.test(MEDIDO) ? "—" : process.env.BOT_EFFORT || "por defecto"}`);
process.exitCode = bien === elegidos.length ? 0 : 1;
