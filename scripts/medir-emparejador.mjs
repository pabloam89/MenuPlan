/**
 * Mide qué cambia el emparejador de Mercadona entre una referencia de git
 * (por defecto origin/staging) y la copia de trabajo.
 *
 *   node scripts/medir-emparejador.mjs [ref] [--json salida.json] [--muestra N]
 *
 * Empaqueta dos veces el cálculo de coste (src/lib/coste.js, el mismo que usa
 * build-coste.mjs): una con src/lib/productMatcher.js y
 * src/data/productoBuscado.json sacados de `ref`, y otra con los de la copia de
 * trabajo. Lo demás (recetas, precios, gramos) es el mismo en las dos.
 *
 * Saca:
 *   - para cada ingrediente distinto que usan las recetas, el producto elegido
 *     antes y después, clasificado en igual / cambió / perdió / ganó;
 *   - la cobertura (recetas estrella con nivel de coste) antes y después, y
 *     qué línea hace que cada receta estrella gane o pierda el nivel;
 *   - las recetas cuyo € por ración cambia más de un 30 %, con las líneas que
 *     explican el salto.
 *   - la lista de la compra: el producto que elige matchProductForIngredient con
 *     el nombre crudo de la línea y confianza ≥ 0,7, como listPricing.js.
 *
 * No escribe nada en el repo: los paquetes van a la carpeta temporal.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opcion = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const ref = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "origin/staging";
const salidaJson = opcion("--json");
const muestra = Number(opcion("--muestra") ?? 15);

function deGit(rel) {
  return execFileSync("git", ["show", `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
}

const ENTRADA = `
export { recipeCatalog } from "./src/data/recipeCatalog.js";
export { costeReceta } from "./src/lib/coste.js";
export { costeDeLinea } from "./src/lib/derive/coste.js";
export { matchProductForIngredient } from "./src/lib/productMatcher.js";
`;

async function empaquetar(nombre, conRef) {
  const outfile = path.join(os.tmpdir(), `medir-emparejador-${process.pid}-${nombre}.mjs`);
  const plugins = conRef
    ? [
        {
          name: "desde-ref",
          setup(b) {
            b.onLoad({ filter: /src[\\/]lib[\\/]productMatcher\.js$/ }, () => ({
              contents: deGit("src/lib/productMatcher.js"),
              loader: "js",
              resolveDir: path.join(ROOT, "src/lib"),
            }));
            b.onLoad({ filter: /src[\\/]data[\\/]productoBuscado\.json$/ }, () => ({
              contents: deGit("src/data/productoBuscado.json"),
              loader: "json",
            }));
          },
        },
      ]
    : [];
  // El paquete se borra pase lo que pase: si el import falla no queda basura.
  try {
    await build({
      stdin: { contents: ENTRADA, resolveDir: ROOT, loader: "js" },
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      logLevel: "error",
      jsx: "automatic",
      external: ["@supabase/*"],
      define: {
        "import.meta.env.VITE_MOTOR": '"solver"',
        "import.meta.env.DEV": "false",
        "import.meta.env.PROD": "true",
        "import.meta.env.VITE_SUPABASE_URL": '""',
        "import.meta.env.VITE_SUPABASE_ANON_KEY": '""',
      },
      plugins,
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
}

// La lista de la compra (listPricing.js) empareja el nombre CRUDO de la línea,
// sin la cadena de nombres de costeDeLinea, y solo se fía desde MATCH_HIGH.
const MATCH_HIGH = 0.7;
function productoDeLista(m, nombre) {
  const r = m.matchProductForIngredient(nombre, productos);
  return r?.product && r.confidence >= MATCH_HIGH
    ? {
        nombre: r.product.name,
        confianza: +r.confidence.toFixed(2),
        via: r.via,
      }
    : null;
}

const productos = JSON.parse(fs.readFileSync(path.join(ROOT, "public/store/mercadona.json"), "utf8")).products;

/** Producto elegido para un nombre de línea, con la misma cadena de nombres que costeDeLinea. */
function productoDe(m, nombre) {
  let elegido = null;
  m.costeDeLinea({ name: nombre, amount: 100, unit: "g" }, productos, (n, ps, o) => {
    const r = m.matchProductForIngredient(n, ps, o);
    if (!elegido && r?.product)
      elegido = {
        nombre: r.product.name,
        confianza: +r.confidence.toFixed(2),
        via: r.via,
      };
    return r;
  });
  return elegido;
}

async function medir(nombre, conRef) {
  const m = await empaquetar(nombre, conRef);
  const recetas = {};
  for (const r of m.recipeCatalog) {
    const c = m.costeReceta(r, { modo: "granel", precios: productos });
    recetas[r.id] = {
      porRacion: c?.porRacion ?? null,
      cobertura: c?.cobertura ?? 0,
      nivel: c?.nivel ?? null,
      estrella: !!r.estrella,
    };
  }
  const nombres = [
    ...new Set(m.recipeCatalog.flatMap((r) => (r.ingredients ?? []).map((l) => l.name)).filter(Boolean)),
  ];
  const pares = {};
  const lista = {};
  for (const n of nombres) {
    pares[n] = productoDe(m, n);
    lista[n] = productoDeLista(m, n);
  }
  const lineas = Object.fromEntries(m.recipeCatalog.map((r) => [r.id, (r.ingredients ?? []).map((l) => l.name)]));
  // Qué líneas de cada receta tienen precio (producto emparejado Y gramos).
  const conPrecio = Object.fromEntries(
    m.recipeCatalog.map((r) => [
      r.id,
      Object.fromEntries((r.ingredients ?? []).map((l) => [l.name, !!m.costeDeLinea(l, productos)])),
    ]),
  );
  return { recetas, pares, lista, lineas, conPrecio };
}

const antes = await medir("antes", true);
const despues = await medir("despues", false);

// Ingredientes: cuántas recetas los usan, para ordenar por peso.
const uso = {};
for (const ls of Object.values(despues.lineas)) for (const n of new Set(ls)) uso[n] = (uso[n] ?? 0) + 1;

function agrupar(clave) {
  const g = { igual: [], cambio: [], perdio: [], gano: [], nunca: [] };
  for (const n of Object.keys(despues[clave])) {
    const a = antes[clave][n];
    const d = despues[clave][n];
    const fila = { ingrediente: n, recetas: uso[n] ?? 0, antes: a, despues: d };
    if (!a && !d) g.nunca.push(fila);
    else if (a && !d) g.perdio.push(fila);
    else if (!a && d) g.gano.push(fila);
    else if (a.nombre === d.nombre) g.igual.push(fila);
    else g.cambio.push(fila);
  }
  for (const filas of Object.values(g)) filas.sort((x, y) => y.recetas - x.recetas);
  return g;
}
const grupos = agrupar("pares");
const gruposLista = agrupar("lista");

const estrellaConNivel = (rs) => Object.values(rs).filter((r) => r.estrella && r.nivel).length;
const totalEstrella = Object.values(despues.recetas).filter((r) => r.estrella).length;

const saltos = [];
let cambiadas = 0;
for (const [id, d] of Object.entries(despues.recetas)) {
  const a = antes.recetas[id];
  if (a.porRacion !== d.porRacion) cambiadas++;
  if (a.porRacion == null || d.porRacion == null) continue;
  const rel = Math.abs(d.porRacion - a.porRacion) / a.porRacion;
  if (rel <= 0.3) continue;
  const culpables = [...new Set(despues.lineas[id])]
    .filter((n) => (antes.pares[n]?.nombre ?? null) !== (despues.pares[n]?.nombre ?? null))
    .map((n) => `${n}: ${antes.pares[n]?.nombre ?? "—"} → ${despues.pares[n]?.nombre ?? "—"}`);
  saltos.push({
    id,
    antes: a.porRacion,
    despues: d.porRacion,
    rel: +rel.toFixed(2),
    culpables,
  });
}
saltos.sort((x, y) => y.rel - x.rel);

// Recetas estrella que ganan o pierden el nivel de coste, y qué línea lo explica.
const nivel = { pierden: [], ganan: [] };
for (const [id, d] of Object.entries(despues.recetas)) {
  const a = antes.recetas[id];
  if (!d.estrella || !!a.nivel === !!d.nivel) continue;
  const lineasQueCambian = Object.keys(despues.conPrecio[id])
    .filter((n) => antes.conPrecio[id][n] !== despues.conPrecio[id][n])
    .map(
      (n) =>
        `${n} [${antes.conPrecio[id][n] ? "con" : "sin"} → ${despues.conPrecio[id][n] ? "con" : "sin"} precio]: ${antes.pares[n]?.nombre ?? "—"} → ${despues.pares[n]?.nombre ?? "—"}`,
    );
  (d.nivel ? nivel.ganan : nivel.pierden).push({
    id,
    cobertura: `${a.cobertura} → ${d.cobertura}`,
    lineas: lineasQueCambian,
  });
}

const fmt = (p) => (p ? `${p.nombre} (${p.confianza})` : "—");
console.log(`Referencia: ${ref} → copia de trabajo`);
console.log(`Ingredientes distintos: ${Object.keys(despues.pares).length}`);
for (const [g, filas] of Object.entries(grupos)) console.log(`  ${g}: ${filas.length}`);
console.log(
  `Estrella con nivel: ${estrellaConNivel(antes.recetas)} → ${estrellaConNivel(despues.recetas)} (de ${totalEstrella})`,
);
console.log(`Recetas con otro € por ración: ${cambiadas}; más de un 30 %: ${saltos.length}`);
for (const g of ["perdio", "cambio", "gano"]) {
  console.log(`\n== ${g} (${grupos[g].length}) ==`);
  for (const f of grupos[g].slice(0, muestra))
    console.log(`  [${f.recetas}] ${f.ingrediente}: ${fmt(f.antes)} → ${fmt(f.despues)}`);
}
console.log(`\n== LISTA DE LA COMPRA (nombre crudo, confianza ≥ ${MATCH_HIGH}) ==`);
for (const [g, filas] of Object.entries(gruposLista)) console.log(`  ${g}: ${filas.length}`);
for (const g of ["perdio", "cambio", "gano"]) {
  console.log(`\n== lista: ${g} (${gruposLista[g].length}) ==`);
  for (const f of gruposLista[g].slice(0, muestra))
    console.log(`  [${f.recetas}] ${f.ingrediente}: ${fmt(f.antes)} → ${fmt(f.despues)}`);
}
for (const [k, filas] of Object.entries(nivel)) {
  console.log(`\n== estrella que ${k} el nivel (${filas.length}) ==`);
  for (const f of filas) {
    console.log(`  ${f.id} (cobertura ${f.cobertura})`);
    for (const l of f.lineas) console.log(`      ${l}`);
  }
}
console.log(`\n== saltos > 30 % (${saltos.length}) ==`);
for (const s of saltos.slice(0, muestra)) {
  console.log(`  ${s.id}: ${s.antes} → ${s.despues} (${Math.round(s.rel * 100)} %)`);
  for (const c of s.culpables) console.log(`      ${c}`);
}

if (salidaJson) {
  fs.writeFileSync(
    salidaJson,
    JSON.stringify(
      {
        ref,
        grupos,
        gruposLista,
        saltos,
        nivel,
        cobertura: {
          antes: estrellaConNivel(antes.recetas),
          despues: estrellaConNivel(despues.recetas),
          totalEstrella,
        },
      },
      null,
      2,
    ),
  );
  console.log(`\nDetalle en ${salidaJson}`);
}
