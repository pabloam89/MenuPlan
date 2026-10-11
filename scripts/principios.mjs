// principios.mjs — los principios de producto con fuente (#606).
//
//   npm run principios                 cifras: principios por área y cuántos con control de verdad
//   npm run principios -- <área>       los principios de un área (frase, control y fuentes)
//   npm run principios -- <id>         uno solo, entero
//   npm run principios -- --escribir   regenera docs/producto/PRINCIPIOS.md desde ops/principios-producto/
//
// El dato es ops/principios-producto/; lo vigila ops/principios-producto.test.js. Solo lee, salvo --escribir.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_MD, cifras, generarMd, leerPrincipios, lineaDe, principiosDe } from "./lib/principiosProducto.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerPrincipios(RAIZ);

if (args.includes("--escribir")) {
  mkdirSync(dirname(join(RAIZ, RUTA_MD)), { recursive: true });
  writeFileSync(join(RAIZ, RUTA_MD), generarMd(datos));
  console.log(`${RUTA_MD} regenerado desde ops/principios-producto/.`);
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
    console.log(lineaDe(p, datos));
    if (porId) {
      console.log(`  porqué: ${p.porque}`);
      console.log(`  bueno: ${p.ejemplo_bueno}`);
      console.log(`  malo: ${p.ejemplo_malo}`);
      if (p.nota) console.log(`  nota: ${p.nota}`);
    }
    console.log(`  fuentes: ${p.fuentes.map((f) => `[${f.marca}] ${f.url}`).join(" ; ")}`);
  }
} else {
  const filas = cifras(datos);
  for (const f of filas) console.log(`${f.area.padEnd(18)} ${f.total} ${f.total === 1 ? "principio" : "principios"}, ${f.conControl} con control de verdad`);
  console.log(`${"total".padEnd(18)} ${filas.reduce((s, f) => s + f.total, 0)} principios, ${filas.reduce((s, f) => s + f.conControl, 0)} con control de verdad`);
}
