/**
 * Buscar recetas por significado con vectores: la frase se vectoriza (una
 * llamada al AI Gateway, ~350 ms) y se compara en memoria con el índice del
 * Recetario Estrella (api/_bot/recetasVectores.json, scripts/build-vectores.mjs).
 * Lo mismo que hace significado.js con Haiku, en un tercio del tiempo.
 *
 * Igual que significado.js, nunca decide nada: devuelve ids del catálogo
 * estrella y quien llama filtra por carpeta, tiempo y alergias. Si falla, tarda
 * o no hay clave, [] y sigue el respaldo. Lo que un vector no entiende es el
 * «no» («que no sea pescado» queda CERCA de pescado): con negaciones, mejor
 * Haiku o los filtros (ver `tieneNegacion`).
 */

import { readFileSync } from "node:fs";

const ESPERA_MS = 1500;
const URL_GATEWAY = "https://ai-gateway.vercel.sh/v1/embeddings";

let indice = null;
function cargar() {
  if (indice) return indice;
  const j = JSON.parse(readFileSync(new URL("./recetasVectores.json", import.meta.url), "utf8"));
  const datos = Buffer.from(j.datos, "base64");
  indice = {
    ...j,
    filas: new Int8Array(datos.buffer, datos.byteOffset, datos.length),
    escalas: Float32Array.from(j.escalas),
  };
  return indice;
}

// Las mismas frases vuelven una y otra vez («algo ligero», «para cenar»): se
// recuerdan mientras viva la instancia.
const recordadas = new Map();
const MAX_RECORDADAS = 500;

async function vectorDe(frase, { modelo, dims, prefijoConsulta }) {
  const clave = frase.trim().toLowerCase();
  if (recordadas.has(clave)) return recordadas.get(clave);
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return null;
  const r = await fetch(URL_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, input: prefijoConsulta + frase }),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const v = (await r.json()).data[0].embedding.slice(0, dims);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const vector = Float32Array.from(v, (x) => x / n);
  if (recordadas.size >= MAX_RECORDADAS) recordadas.delete(recordadas.keys().next().value);
  recordadas.set(clave, vector);
  return vector;
}

/** ¿La frase pide quitar algo? Ahí el vector se equivoca a favor de lo que se quita. */
export function tieneNegacion(frase) {
  return /\b(no|sin|nada de|ni|menos|evitar|que no)\b/i.test(String(frase ?? ""));
}

/**
 * @param {string} consulta  lo que piden, tal cual
 * @param {{ n?: number }} [opciones]
 * @returns {Promise<string[]>} ids del catálogo estrella, de más a menos
 */
export async function porVectores(consulta, { n = 8 } = {}) {
  if (!String(consulta ?? "").trim()) return [];
  try {
    const ix = cargar();
    const q = await vectorDe(consulta, ix);
    if (!q) return [];
    const { dims, filas, escalas, ids } = ix;
    const notas = new Float32Array(ids.length);
    for (let i = 0; i < ids.length; i++) {
      let s = 0;
      const base = i * dims;
      for (let d = 0; d < dims; d++) s += q[d] * filas[base + d];
      notas[i] = s * escalas[i];
    }
    return [...notas.keys()].sort((a, b) => notas[b] - notas[a]).slice(0, n).map((i) => ids[i]);
  } catch (err) {
    console.error("[vectores]", String(err?.message ?? err).slice(0, 150));
    return [];
  }
}
