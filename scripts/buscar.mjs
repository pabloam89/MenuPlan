#!/usr/bin/env node
/**
 * Busca en lo ya apuntado, sin red (#384):
 *
 *   npm run buscar -- "el síntoma, el error o la ruta"
 *   npm run buscar -- --max 10 "texto"
 *
 * Lee el índice local que escribe `npm run issues -- --indexar` (y el arranque
 * de cada sesión) y enseña los issues y PR que se parecen, con su estado, quién
 * los lleva y su plan (encargos pendientes y hechos). Es lo primero que se hace
 * ante algo que no encaja: se asume que ya hay un issue y un plan que lo
 * arregla. Si no sale nada, se busca con otras palabras; solo entonces es nuevo
 * y se registra con `npm run issues -- --nuevo`.
 *
 * Si no hay índice, o es viejo, lo dice (no calla): con el viejo busca igual.
 */
import { avisoDeIndice, buscar, hace, leerIndice, lineaDeResultado } from "./lib/buscarAntes.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--max");
const max = i >= 0 ? Number(args.splice(i, 2)[1]) || 8 : 8;
const consulta = args.join(" ").trim();

if (!consulta) {
  console.error('Uso: npm run buscar -- "<síntoma, error o ruta>"   (índice: npm run issues -- --indexar)');
  process.exit(1);
}

const lectura = leerIndice();
const aviso = avisoDeIndice(lectura);
if (!lectura.indice) {
  console.error(aviso);
  process.exit(1);
}
if (aviso) console.error(aviso);

const resultados = buscar(lectura.indice, consulta, { max });
console.log(`Índice ${hace(lectura.horas)}, ${lectura.indice.fichas.length} fichas. Buscando: ${consulta.slice(0, 120)}`);
if (!resultados.length) {
  console.log("Nada se parece. Prueba con otras palabras (el nombre de un fichero, un trozo del error, la rama) antes de darlo por nuevo.");
} else {
  for (const r of resultados) console.log(`  ${String(Math.round(r.parecido * 100)).padStart(3)} %  ${lineaDeResultado(r)}`);
  console.log("\nLee el que encaje (`gh issue view <n>`) antes de investigar. Si lo tuyo es un caso nuevo de ese fondo, regístralo con `npm run issues -- --nuevo … --padre <fondo>`.");
}
