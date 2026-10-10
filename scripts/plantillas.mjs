// plantillas.mjs — la plantilla de cada tipo de skill, generada desde la forja (#495).
//
//   npm run plantillas                 dice qué moldes de .claude/plantillas-skill/ no están al día (sale con 1 si alguno)
//   npm run plantillas -- --escribir   los regenera desde ops/forja.json, las secciones de
//                                      scripts/lib/plantillasSkill.mjs y el estándar de .claude/PLANTILLA-SKILL.md,
//                                      y borra los de un tipo que ya no está en la forja
//
// Una línea por molde: `plantilla ruta: <ruta> estado: igual|distinto|falta|sobra`.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DIR_PLANTILLAS, estadoDePlantillas, problemasDePlantillas } from "./lib/plantillasSkill.mjs";
import { leerForja } from "./lib/forja.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const escribir = process.argv.includes("--escribir");

const problemas = problemasDePlantillas(leerForja(RAIZ));
if (problemas.length) {
  for (const p of problemas) console.error(`plantilla problema: ${p}`);
  process.exit(1);
}

const estados = estadoDePlantillas(RAIZ);
if (escribir) {
  mkdirSync(join(RAIZ, DIR_PLANTILLAS), { recursive: true });
  for (const e of estados) {
    if (e.estado === "sobra") rmSync(join(RAIZ, e.ruta));
    else if (e.estado !== "igual") writeFileSync(join(RAIZ, e.ruta), e.texto);
  }
}
for (const e of estados) console.log(`plantilla ruta: ${e.ruta} estado: ${escribir && e.estado !== "igual" ? (e.estado === "sobra" ? "borrada" : "escrita") : e.estado}`);
if (!escribir && estados.some((e) => e.estado !== "igual")) {
  console.error("Hay moldes que no están al día: npm run plantillas -- --escribir");
  process.exitCode = 1;
}
