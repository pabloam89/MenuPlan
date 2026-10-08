/**
 * Traducir lo que pinta el código (no Lola) para quien eligió inglés (0073):
 * el menú pintado debajo de su mensaje y los pies de las fotos. Lola ya
 * contesta en inglés por su cuenta; esto es lo que no pasa por ella.
 *
 * Un lote por mensaje, con un modelo pequeño, y caché por texto en
 * content_translations (0074) y en memoria: los menús se repiten. Si algo
 * falla o tarda, sale en castellano, como antes: nunca se queda sin contestar.
 */

import { seguirCon } from "./avisar.js";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { select, insert } from "./db.js";

const MODELO = process.env.BOT_TRADUCIR_MODELO || "claude-haiku-4-5-20251001";
const ESPERA_MS = 6000;

let cliente = null;
const anthropic = () => (cliente ??= new Anthropic());

const memoria = new Map();
export const hashDe = (texto) => crypto.createHash("sha256").update(String(texto)).digest("hex").slice(0, 40);

const INSTRUCCIONES = `Translate Spanish text from a family meal-planning app into natural British English. Each item is a piece of a Telegram message: keep EXACTLY the same HTML tags (<b>, <i>), emojis, line breaks, numbers and punctuation marks; translate only the words. Dish names: translate them naturally («Tortilla de patatas» → «Spanish potato omelette», «Lentejas estofadas» → «Braised lentils»; a «crema» of vegetables is a soup: «Crema de calabaza» → «Pumpkin soup»); keep proper names of people as they are. Dates: «Sábado 4 de octubre» → «Saturday 4 October». Return the same number of items, in the same order.`;

/** La llamada al modelo. Separada para el test. */
async function alModelo(textos) {
  const r = await anthropic().messages.create({
    model: MODELO,
    max_tokens: 4000,
    temperature: 0,
    system: INSTRUCCIONES,
    tools: [{
      name: "traducido",
      description: "The translated items, same order and count.",
      input_schema: { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"] },
    }],
    tool_choice: { type: "tool", name: "traducido" },
    messages: [{ role: "user", content: JSON.stringify(textos) }],
  }, { timeout: ESPERA_MS, maxRetries: 0 });
  const items = r.content.find((b) => b.type === "tool_use")?.input?.items;
  return Array.isArray(items) && items.length === textos.length ? items.map(String) : null;
}

/**
 * @param {string[]} textos
 * @param {'es'|'en'|null} idioma
 * @param {{ modelo?: (t: string[]) => Promise<string[]|null> }} [deps]
 * @returns {Promise<string[]>} en el mismo orden; lo que no se pudo, tal cual
 */
export async function traducir(textos, idioma, { modelo = alModelo } = {}) {
  if (idioma !== "en" || !textos?.length) return textos ?? [];
  const hashes = textos.map(hashDe);
  const sinMemoria = [...new Set(hashes.filter((h, i) => !memoria.has(h) && textos[i].trim()))];
  if (sinMemoria.length) {
    // a propósito: sin la memoria se traduce de nuevo
    const filas = await select("content_translations", `lang=eq.en&source_hash=in.(${sinMemoria.join(",")})`, "source_hash,texto").catch(seguirCon("traducir/memoria", []));
    for (const f of filas ?? []) memoria.set(f.source_hash, f.texto);
  }
  const faltan = [...new Set(textos.filter((t, i) => t.trim() && !memoria.has(hashes[i])))];
  if (faltan.length) {
    const hechos = await modelo(faltan).catch((e) => { console.error("[traducir]", e?.message); return null; });
    if (hechos) {
      const nuevas = faltan.map((t, i) => ({ source_hash: hashDe(t), lang: "en", texto: hechos[i] }));
      for (const n of nuevas) memoria.set(n.source_hash, n.texto);
      await insert("content_translations", nuevas, { upsert: true }).catch((e) => console.error("[traducir] caché", e?.message));
    }
  }
  return textos.map((t, i) => memoria.get(hashes[i]) ?? t);
}
