#!/usr/bin/env node
/**
 * El registro de normas y su trinquete (#296).
 *
 *   npm run normas                     recuento del registro y frases normativas
 *                                      que no citan norma ni están en la base
 *                                      (sale con 1 si hay alguna)
 *   npm run normas -- --fondo          las cifras del fondo (#185), con red
 *   npm run normas -- --base           reescribe ops/normas-base.json: solo baja
 *   npm run normas -- --base --subir   la deja en lo de hoy aunque suba (a
 *                                      propósito: se ve en el diff del PR y el
 *                                      umbral de ops/planos.json también hay
 *                                      que subirlo a mano)
 *
 * Una frase nueva con «nunca», «siempre», «solo», «máximo», «tope»,
 * «obligatorio», «exige» u «OK de Pablo» se arregla citando la norma que
 * enuncia (`<!-- norma:<id> -->` en la misma línea), dándola de alta en
 * ops/normas.json si no está, o reescribiéndola si no es una norma.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RUTA_BASE, leerRegistro, medirFondo, medirFrases, nuevaBase, recuento, subidas, totalBase } from "./lib/normas.mjs";
import { leerIssuesGh } from "./lib/planos.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const registro = leerRegistro(RAIZ);
const ids = new Set(registro.normas.map((n) => n.id));
const rutaBase = join(RAIZ, RUTA_BASE);
const base = existsSync(rutaBase) ? JSON.parse(readFileSync(rutaBase, "utf8")) : null;
const { actual, citasMalas } = medirFrases(RAIZ, ids);

if (args.includes("--fondo")) {
  // Las tres cifras del fondo, con red (las mismas que mide `npm run planos -- --red`).
  const m = medirFondo(leerIssuesGh());
  for (const [k, v] of Object.entries(m)) console.log(`fondo ${k}: ${v}`);
  process.exit(0);
}

if (args.includes("--base")) {
  // La primera vez no hay base: se toma la de hoy.
  const nueva = nuevaBase(actual, base ?? actual, { subir: args.includes("--subir") || !base });
  writeFileSync(rutaBase, `${JSON.stringify(nueva, null, 2)}\n`);
  console.log(`normas_base total: ${totalBase(nueva)} antes: ${base ? totalBase(base) : "-"} ficheros: ${Object.keys(nueva).length}`);
  process.exit(0);
}

const r = recuento(registro.normas);
console.log(`normas total: ${r.total} ${Object.entries(r.veredicto).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
console.log(`normas riesgo ${Object.entries(r.riesgo).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
const suben = subidas(actual, base ?? {});
console.log(`normas_frases base: ${base ? totalBase(base) : 0} hoy: ${totalBase(actual)} suben: ${suben.length} citas_malas: ${citasMalas.length}`);
for (const s of suben) console.log(`  sube ${s.ruta} «${s.palabra}»: ${s.base} -> ${s.actual}`);
for (const c of citasMalas) console.log(`  cita a una norma que no existe: ${c}`);
if (suben.length || citasMalas.length) {
  console.log("Cita la norma en la misma línea (<!-- norma:<id> -->), dala de alta en ops/normas.json o reescribe la frase si no es una norma.");
  process.exit(1);
}
