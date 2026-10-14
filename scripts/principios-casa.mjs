// principios-casa.mjs — la lista única de principios de la casa (#619).
//
//   npm run principios-casa                 cifras: principios por área, delegados y sin norma
//   npm run principios-casa -- <área>       los principios de un área, con sus normas
//   npm run principios-casa -- <id>         uno solo, entero, con las normas que lo citan
//   npm run principios-casa -- --proyecto <id>  los principios que valen para ese proyecto según sus dominios
//   npm run principios-casa -- --escribir   regenera docs/PRINCIPIOS.md
//
// El dato es ops/principios/ más los catálogos delegados (producto y redacción); lo leen
// scripts/lib/principios.mjs y lo vigilan ops/principios.test.js y ops/uniones.test.js. Solo
// lee, salvo --escribir. Los principios de producto con su detalle siguen en `npm run principios`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AMBITOS } from "./lib/ambitos.mjs";
import { leerRegistro } from "./lib/normas.mjs";
import { RUTA_MD, cifras, generarMd, leerPrincipiosCasa, lineaDe, normasPorPrincipio, principiosDeProyecto } from "./lib/principios.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerPrincipiosCasa(RAIZ);
const porPrincipio = normasPorPrincipio(leerRegistro(RAIZ).normas);

if (args.includes("--escribir")) {
  mkdirSync(dirname(join(RAIZ, RUTA_MD)), { recursive: true });
  writeFileSync(join(RAIZ, RUTA_MD), generarMd(datos));
  console.log(`${RUTA_MD} regenerado desde ops/principios/ y los catálogos delegados.`);
}

const iProy = args.indexOf("--proyecto");
if (iProy >= 0) {
  const proy = JSON.parse(readFileSync(join(RAIZ, "ops", "entidades.json"), "utf8")).projects.find((x) => x.id === args[iProy + 1]);
  if (!proy) {
    console.error(`«${args[iProy + 1]}» no es un proyecto de ops/entidades.json.`);
    process.exit(1);
  }
  const lista = principiosDeProyecto(datos.principios, proy.dominios ?? []);
  console.log(`${proy.id}: ${lista.length} de ${datos.principios.length} principios (dominios: ${(proy.dominios ?? []).join(", ") || "ninguno"})`);
  for (const p of lista) console.log(lineaDe(p));
  process.exit(0);
}

const pedido = args.find((a) => !a.startsWith("--") && a !== args[iProy + 1]);
if (pedido) {
  const porId = datos.principios.find((p) => p.id === pedido);
  const lista = porId ? [porId] : datos.principios.filter((p) => p.area === pedido);
  if (!lista.length) {
    console.error(`«${pedido}» no es un id ni un área. Áreas: ${Object.keys(AMBITOS).join(", ")}.`);
    process.exitCode = 1;
  }
  for (const p of lista) {
    console.log(lineaDe(p));
    if (porId) {
      if (p.porque) console.log(`  porqué: ${p.porque}`);
      console.log(`  fuentes: ${p.fuentes.map((f) => `[${f.marca}] ${f.url ?? f.ruta}`).join(" ; ")}`);
      if (p.puente) console.log(`  puente: ${p.puente}`);
      if (p.detalle.length) console.log(`  detalle: ${p.detalle.join(" ; ")}`);
      if (p.origen.length) console.log(`  origen: ${p.origen.join(", ")}`);
    }
    const ns = porPrincipio[p.id] ?? [];
    const motivo = datos.sin_norma[p.id] ?? "sin motivo";
    console.log(`  normas: ${ns.length ? ns.join(", ") : `ninguna (${motivo})`}`);
  }
} else {
  const filas = cifras(datos);
  const suma = (k) => filas.reduce((s, f) => s + f[k], 0);
  for (const f of [...filas, { area: "total", total: suma("total"), delegados: suma("delegados"), sinNorma: suma("sinNorma") }]) {
    console.log(`${f.area.padEnd(10)} ${f.total} principios, ${f.delegados} de un catálogo delegado, ${f.sinNorma} sin norma`);
  }
}
