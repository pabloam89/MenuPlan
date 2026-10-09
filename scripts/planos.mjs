// npm run planos: el nivel de cada plano, calculado desde ops/planos.json (#248).
//
//   npm run planos                       sin red: lo de GitHub sale «sin comprobar»
//   npm run planos -- --red              también lo de GitHub (con la sesión de `gh`)
//   npm run planos -- --json             la medición entera, para máquinas
//   npm run planos -- --red --escribir   guarda la medición en ops/planos.json y
//                                        regenera la tabla de ops/PLANOS.md
//   npm run planos -- --tabla            solo regenera la tabla (tras editar nombres u objetivos)
//   npm run planos -- --red --issue <f>  escribe en <f> el cuerpo del issue si algo no
//                                        cuadra o hay juicios caducados (lo usa el workflow)
//
// Sin dependencias a propósito: el workflow semanal lo corre sin `npm ci`.

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { clienteGh, cuerpoIssue, faltaParaSiguiente, generarTabla, hoyMadrid, medir, sustituirTabla } from "./lib/planos.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const RUTA_JSON = join(RAIZ, "ops/planos.json");
const RUTA_MD = join(RAIZ, "ops/PLANOS.md");

const args = process.argv.slice(2);
const red = args.includes("--red");
const json = args.includes("--json");
const escribir = args.includes("--escribir");
const soloTabla = args.includes("--tabla");
const iIssue = args.indexOf("--issue");
const ficheroIssue = iIssue >= 0 ? args[iIssue + 1] : null;

const datos = JSON.parse(readFileSync(RUTA_JSON, "utf8"));

function escribirTabla(d) {
  const md = readFileSync(RUTA_MD, "utf8");
  writeFileSync(RUTA_MD, sustituirTabla(md, generarTabla(d)));
}

if (soloTabla) {
  escribirTabla(datos);
  console.log("Tabla de ops/PLANOS.md regenerada desde ops/planos.json.");
  process.exit(0);
}

const m = medir(datos, { raiz: RAIZ, gh: red ? clienteGh() : null, hoy: hoyMadrid() });

if (json) {
  console.log(JSON.stringify(m, null, 2));
} else {
  const ancho = Math.max(...m.planos.map((p) => p.nombre.length));
  console.log(`Planos medidos el ${m.fecha} ${red ? "con GitHub" : "sin red (lo de GitHub, «sin comprobar»; usa --red)"}`);
  console.log(`Guardado: ${datos.medicion.fecha}. Nivel = solo lo comprobado; techo = si lo no comprobado cumpliera.\n`);
  console.log(`${"#".padStart(2)}  ${"Plano".padEnd(ancho)}  nivel  techo  guardado  lanzar  escalar`);
  for (const p of m.planos) {
    const marca = p.cuadra ? "" : `  <- no cuadra (${p.techo < p.guardado ? "baja" : "sube"})`;
    console.log(`${String(p.id).padStart(2)}  ${p.nombre.padEnd(ancho)}  ${String(p.nivel).padStart(5)}  ${String(p.techo).padStart(5)}  ${String(p.guardado).padStart(8)}  ${String(p.lanzar).padStart(6)}  ${String(p.escalar).padStart(7)}${marca}`);
  }
  console.log("\nQué falta para el siguiente nivel:");
  for (const p of m.planos) {
    const falta = faltaParaSiguiente(p);
    if (p.nivel === 4) continue;
    console.log(`\n${p.id} · ${p.nombre} (de ${p.nivel} a ${p.nivel + 1})`);
    for (const c of falta) console.log(`  [${c.estado}] ${c.que} (${c.tipo}: ${c.detalle})`);
  }
  if (m.caducados.length) {
    console.log(`\nJuicios caducados (más de ${datos.caducidad_juicio_dias} días):`);
    for (const c of m.caducados) console.log(`  ${c.id} · ${c.nombre}: ${c.que} (${c.detalle})`);
  }
  console.log(`\nNo cuadran: ${m.desajustes.length}. Juicios caducados: ${m.caducados.length}.`);
}

if (ficheroIssue) {
  const cuerpo = cuerpoIssue(m);
  if (cuerpo) writeFileSync(ficheroIssue, `${cuerpo}\n`);
  else rmSync(ficheroIssue, { force: true });
  if (!json) console.log(cuerpo ? `Cuerpo del issue en ${ficheroIssue}.` : "Todo cuadra: sin issue.");
}

if (escribir) {
  const afectados = m.planos.filter((p) => p.nivel !== p.techo);
  if (afectados.length) {
    console.error(`\nNo escribo: en ${afectados.map((p) => p.id).join(", ")} el nivel depende de algo sin comprobar. Lánzalo con --red (y con la sesión de gh de un administrador).`);
    process.exit(1);
  }
  datos.medicion = {
    fecha: m.fecha,
    por: process.env.PLANOS_POR || "gobierno",
    red,
    niveles: Object.fromEntries(m.planos.map((p) => [String(p.id), p.nivel])),
  };
  writeFileSync(RUTA_JSON, `${JSON.stringify(datos, null, 2)}\n`);
  escribirTabla(datos);
  console.log("\nGuardada la medición en ops/planos.json y regenerada la tabla de ops/PLANOS.md.");
}
