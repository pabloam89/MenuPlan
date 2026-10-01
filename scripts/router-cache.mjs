/**
 * ¿Cachea Haiku las instrucciones del enrutador? Cuenta los tokens de las
 * REGLAS (+ la herramienta) y hace dos llamadas iguales seguidas: si la
 * segunda lee de caché, `cache_read_input_tokens` > 0.
 *
 *   node --env-file=.env.local scripts/router-cache.mjs
 *
 * Coste: dos llamadas cortas a Haiku.
 */

import Anthropic from "@anthropic-ai/sdk";
const { REGLAS, ESQUEMA } = await import("../api/_bot/router.js");

const MODELO = process.env.BOT_ROUTER_MODELO || "claude-haiku-4-5-20251001";
const anthropic = new Anthropic();
const peticion = {
  model: MODELO,
  system: [{ type: "text", text: REGLAS, cache_control: { type: "ephemeral" } }],
  tools: [{ name: "enrutar", description: "Decide el modo del mensaje y saca sus datos.", input_schema: ESQUEMA }],
  tool_choice: { type: "tool", name: "enrutar" },
  messages: [{ role: "user", content: "Mensaje: «¿qué cenamos hoy?»" }],
};
const { input_tokens } = await anthropic.messages.countTokens(peticion);
console.log(`Instrucciones + herramienta + mensaje: ${input_tokens} tokens (Haiku 4.5 cachea a partir de 4096).`);
for (const vez of [1, 2]) {
  const t0 = Date.now();
  const r = await anthropic.messages.create({ ...peticion, max_tokens: 300, temperature: 0 });
  const u = r.usage;
  console.log(`llamada ${vez}: ${Date.now() - t0} ms · escrito en caché ${u.cache_creation_input_tokens ?? 0} · leído de caché ${u.cache_read_input_tokens ?? 0} · sin caché ${u.input_tokens} · salida ${u.output_tokens}`);
}

// Con y sin ejemplos, varias veces y alternando, para ver si la caché gana tiempo.
if (process.argv.includes("--comparar")) {
  const sinEjemplos = REGLAS.split("\n\nEJEMPLOS reales")[0];
  const frases = ["¿qué cenamos hoy?", "apunta leche y pan", "cambia la cena del jueves por pescado", "dame ideas para comer", "hazme el menú de la semana que viene", "ya compré los huevos"];
  const ms = { con: [], sin: [] };
  for (let i = 0; i < 12; i++) {
    for (const [k, texto] of [["con", REGLAS], ["sin", sinEjemplos]]) {
      const t0 = Date.now();
      await anthropic.messages.create({ ...peticion, system: [{ type: "text", text: texto, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: `Mensaje: «${frases[i % frases.length]}»` }], max_tokens: 300, temperature: 0 });
      ms[k].push(Date.now() - t0);
    }
  }
  const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  console.log(`mediana con ejemplos (caché): ${med(ms.con)} ms · sin ejemplos (sin caché): ${med(ms.sin)} ms`);
}
