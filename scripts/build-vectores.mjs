/**
 * El índice de vectores del Recetario Estrella → api/_bot/recetasVectores.json
 *
 *   node scripts/build-vectores.mjs            vectoriza lo que haya cambiado
 *   node scripts/build-vectores.mjs --comprobar  solo dice si está al día
 *
 * Se commitea, no se genera en el build: vectorizar cuesta (poco) y el
 * gateway tiene límite por minuto. Cada receta lleva el hash de su texto
 * (textoDeReceta): si el texto no cambia, se reutiliza su vector y no se paga.
 * Una receta que falte en el índice no rompe nada: la búsqueda por vectores no
 * la encuentra y sigue el respaldo (Haiku, palabras).
 *
 * Formato: vectores recortados a DIMS y normalizados, en int8 con una escala
 * por receta (≈380 KB para 743 recetas a 512 dims). El examen
 * (scripts/vectores-examen.mjs) dice que recortar a 512 no pierde acierto.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { textoDeReceta, normalizar } from "../src/lib/vectores.js";

export const MODELO = "voyage/voyage-4";
export const DIMS = 512;
// Voyage rinde más si sabe qué es pregunta y qué documento.
export const PREFIJO_CONSULTA = "Represent the query for retrieving supporting documents: ";
const PREFIJO_DOCUMENTO = "Represent the document for retrieval: ";
const SALIDA = "api/_bot/recetasVectores.json";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.VITE_SUPABASE_ANON_KEY ||= "x";
const { recipeCatalog } = await import("../api/_bot/core.mjs");

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const estrella = recipeCatalog.filter((r) => r.estrella).sort((a, b) => a.id.localeCompare(b.id));
const textos = Object.fromEntries(estrella.map((r) => [r.id, textoDeReceta(r)]));

const previo = fs.existsSync(SALIDA) ? JSON.parse(fs.readFileSync(SALIDA, "utf8")) : null;
const mismoModelo = previo?.modelo === MODELO && previo?.dims === DIMS;
const filasPrevias = new Map();
if (mismoModelo) {
  const datos = Buffer.from(previo.datos, "base64");
  previo.ids.forEach((id, i) => filasPrevias.set(id, {
    hash: previo.hashes[i], escala: previo.escalas[i], fila: datos.subarray(i * DIMS, (i + 1) * DIMS),
  }));
}
const faltan = estrella.filter((r) => filasPrevias.get(r.id)?.hash !== hash(textos[r.id]));

if (process.argv.includes("--comprobar")) {
  const sobran = mismoModelo ? previo.ids.filter((id) => !textos[id]).length : 0;
  console.log(faltan.length || sobran
    ? `vectores: ${faltan.length} recetas sin vector al día y ${sobran} que ya no están; corre node scripts/build-vectores.mjs`
    : `vectores: al día (${estrella.length} recetas)`);
  process.exit(0);
}

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, "").trim()]),
);
const CLAVE = process.env.AI_GATEWAY_API_KEY || env.AI_GATEWAY_API_KEY;
if (faltan.length && !CLAVE) { console.error("Falta AI_GATEWAY_API_KEY en .env.local"); process.exit(1); }

async function vectorizar(lote) {
  for (let intento = 0; intento < 8; intento++) {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, input: lote }),
    });
    const j = await r.json();
    if (r.status === 429) {
      const s = Number(String(j?.error?.message).match(/after (\d+)s/)?.[1] ?? 15);
      console.error(`límite por minuto, espero ${s + 1} s`);
      await new Promise((ok) => setTimeout(ok, (s + 1) * 1000));
      continue;
    }
    if (!j.data) throw new Error(JSON.stringify(j).slice(0, 200));
    return j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
  throw new Error("el gateway sigue limitando");
}

/** Recorta, normaliza y pasa a int8 con su escala. */
function cuantizar(v) {
  const n = normalizar(v.slice(0, DIMS));
  const max = Math.max(...n.map(Math.abs)) || 1;
  return { escala: max / 127, fila: Int8Array.from(n, (x) => Math.round((x / max) * 127)) };
}

const nuevas = new Map();
for (let i = 0; i < faltan.length; i += 96) {
  const lote = faltan.slice(i, i + 96);
  const vs = await vectorizar(lote.map((r) => PREFIJO_DOCUMENTO + textos[r.id]));
  lote.forEach((r, k) => nuevas.set(r.id, { hash: hash(textos[r.id]), ...cuantizar(vs[k]) }));
  console.error(`vectorizadas ${Math.min(i + 96, faltan.length)}/${faltan.length}`);
}

const filas = estrella.map((r) => nuevas.get(r.id) ?? filasPrevias.get(r.id));
const datos = Buffer.alloc(filas.length * DIMS);
filas.forEach((f, i) => Buffer.from(f.fila.buffer, f.fila.byteOffset, DIMS).copy(datos, i * DIMS));
fs.writeFileSync(SALIDA, JSON.stringify({
  modelo: MODELO, dims: DIMS, prefijoConsulta: PREFIJO_CONSULTA,
  ids: estrella.map((r) => r.id),
  hashes: filas.map((f) => f.hash),
  escalas: filas.map((f) => Number(f.escala.toPrecision(6))),
  datos: datos.toString("base64"),
}) + "\n");
console.log(`vectores → ${SALIDA}: ${estrella.length} recetas, ${faltan.length} vectorizadas ahora`);
