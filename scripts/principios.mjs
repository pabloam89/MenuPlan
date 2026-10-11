// principios.mjs — los principios de producto con fuente (#606) y sus normas (#620).
//
//   npm run principios                 cifras: principios por área, cuántos con norma y cuántos con control de verdad
//   npm run principios -- <área>       los principios de un área (enunciado y normas)
//   npm run principios -- <id>         uno solo, entero (con sus normas, ejemplos y fuentes)
//   npm run principios -- --escribir   regenera docs/producto/PRINCIPIOS.md desde ops/principios-producto/ y ops/normas.json
//
// El dato es ops/principios-producto/ (el porqué) y ops/normas.json (la norma que lo cita); lo vigila
// ops/principios-producto.test.js. Solo lee, salvo --escribir.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerRegistro } from "./lib/normas.mjs";
import { RUTA_MD, cifras, generarMd, leerPrincipios, lineaDe, lineaDeNorma, normasDe, principiosDe } from "./lib/principiosProducto.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerPrincipios(RAIZ);
const registro = leerRegistro(RAIZ);

if (args.includes("--escribir")) {
  mkdirSync(dirname(join(RAIZ, RUTA_MD)), { recursive: true });
  writeFileSync(join(RAIZ, RUTA_MD), generarMd(datos, registro));
  console.log(`${RUTA_MD} regenerado desde ops/principios-producto/ y ops/normas.json.`);
}

const pedido = args.find((a) => !a.startsWith("--"));
if (pedido) {
  const porId = datos.principios.find((p) => p.id === pedido);
  const lista = porId ? [porId] : principiosDe(datos, pedido);
  if (!lista.length) {
    console.error(`«${pedido}» no es un id ni un área. Áreas: ${Object.keys(datos.areas).join(", ")}.`);
    process.exitCode = 1;
  }
  for (const p of lista) {
    console.log(lineaDe(p));
    for (const n of normasDe(registro.normas, p.id)) console.log(`  norma: ${lineaDeNorma(n, registro)}`);
    if (porId) {
      console.log(`  porqué: ${p.porque}`);
      console.log(`  bueno: ${p.ejemplo_bueno}`);
      console.log(`  malo: ${p.ejemplo_malo}`);
    }
    console.log(`  fuentes: ${p.fuentes.map((f) => `[${f.marca}] ${f.url}`).join(" ; ")}`);
  }
} else {
  const filas = cifras(datos, registro.normas);
  for (const f of filas) console.log(`${f.area.padEnd(18)} ${f.total} ${f.total === 1 ? "principio" : "principios"}, ${f.conNorma} con norma, ${f.conControl} con control de verdad`);
  const suma = (k) => filas.reduce((s, f) => s + f[k], 0);
  console.log(`${"total".padEnd(18)} ${suma("total")} principios, ${suma("conNorma")} con norma, ${suma("conControl")} con control de verdad`);
}
