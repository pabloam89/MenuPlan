#!/usr/bin/env node
/**
 * Los issues de MenuPlan, en tabla, para aprender de lo que falla.
 *
 *   npm run issues                    abiertos por tipo, lecciones por causa
 *                                     (cuántas, cuánto tardan en cerrarse y
 *                                     dónde quedó el arreglo) y lo mal
 *                                     clasificado
 *   npm run issues -- --ordenar       pone las etiquetas que se deducen de lo
 *                                     rellenado en un formulario
 *   npm run issues -- --etiquetas     crea o pone al día en GitHub las
 *                                     etiquetas de scripts/lib/issues.mjs
 *                                     (cambia ajustes del repo: OK de Pablo)
 *
 * La clasificación y su porqué, en scripts/lib/issues.mjs.
 */
import { execFileSync } from "node:child_process";
import { CONSULTA, etiquetas, etiquetasDeFormulario, leerIssue, porGrupo, resumen } from "./lib/issues.mjs";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });

/** Todos los issues, con sus PR, reaperturas y padre (una consulta por cada 100). */
function todos() {
  const out = [];
  let cursor = null;
  do {
    const args = ["api", "graphql", "-f", `query=${CONSULTA}`];
    if (cursor) args.push("-f", `cursor=${cursor}`);
    const pag = JSON.parse(gh(...args)).data.repository.issues;
    out.push(...pag.nodes.map(leerIssue));
    cursor = pag.pageInfo.hasNextPage ? pag.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

const args = process.argv.slice(2);

if (args.includes("--etiquetas")) {
  for (const e of etiquetas()) {
    gh("label", "create", e.name, "--color", e.color, "--description", e.description.slice(0, 100), "--force");
    console.log(`  ${e.name}`);
  }
  console.log(`${etiquetas().length} etiquetas al día.`);
} else if (args.includes("--ordenar")) {
  let n = 0;
  for (const i of todos()) {
    const tiene = new Set(i.labels.map((l) => l.name));
    const faltan = etiquetasDeFormulario(i.body).filter((e) => !tiene.has(e));
    if (!faltan.length) continue;
    try {
      gh("issue", "edit", String(i.number), "--add-label", faltan.join(","));
      console.log(`  #${i.number}: ${faltan.join(", ")}`);
      n++;
    } catch (e) {
      // Lo normal: la etiqueta aún no existe en GitHub (`--etiquetas`). Se sigue con los demás.
      console.log(`  #${i.number}: no pude poner ${faltan.join(", ")} (${String(e.stderr ?? e.message).trim().split("\n")[0]})`);
    }
  }
  console.log(n ? `${n} issues etiquetados.` : "Nada que ordenar.");
} else {
  const issues = todos();
  const r = resumen(issues);
  const abiertos = issues.filter((i) => i.state === "OPEN");

  console.log(`Abiertos: ${Object.entries(r.porTipo).map(([t, n]) => `${n} ${t}`).join(", ") || "ninguno clasificado"}\n`);

  for (const tipo of ["decision", "encargo", "leccion"]) {
    const de = abiertos.filter((i) => porGrupo(i.labels.map((l) => l.name)).tipo.has(tipo));
    if (!de.length) continue;
    console.log(`${tipo}:`);
    for (const i of de) {
      const g = porGrupo(i.labels.map((l) => l.name));
      const etiq = [...g.area, ...g.causa].join(", ");
      const extra = [i.reaperturas ? `reabierta ${i.reaperturas}×` : "", i.padre ? `sigue a #${i.padre}` : "", i.asignados.length ? `de ${i.asignados.join(", ")}` : ""].filter(Boolean).join(" · ");
      console.log(`  #${i.number}  ${i.createdAt.slice(0, 10)}  ${i.title}${etiq ? `  [${etiq}]` : ""}${extra ? `  (${extra})` : ""}`);
    }
    console.log("");
  }

  const causas = Object.entries(r.causas).sort((a, b) => b[1].total - a[1].total);
  if (causas.length) {
    console.log("Lecciones por causa:");
    console.log("  causa               total  abiertas  reabiertas  días hasta cerrar (mediana)  arreglo");
    for (const [c, f] of causas) {
      const arreglos = Object.entries(f.arreglos).map(([a, n]) => `${a} ${n}`).join(", ") || "—";
      const med = f.medianaDias == null ? "—" : f.medianaDias.toFixed(1);
      console.log(`  ${c.padEnd(18)}  ${String(f.total).padStart(5)}  ${String(f.abiertas).padStart(8)}  ${String(f.reaperturas).padStart(10)}  ${med.padStart(27)}  ${arreglos}`);
    }
    console.log("");
  }

  const agentes = Object.entries(r.agentes).sort((a, b) => b[1].arregladas - a[1].arregladas);
  if (agentes.length) {
    console.log("Lecciones por quién las arregló (línea «Agente:» del PR que las cierra):");
    console.log("  agente              arregladas  reabiertas  días hasta cerrar (mediana)");
    for (const [a, f] of agentes) {
      const med = f.medianaDias == null ? "—" : f.medianaDias.toFixed(1);
      console.log(`  ${a.padEnd(18)}  ${String(f.arregladas).padStart(10)}  ${String(f.reaperturas).padStart(10)}  ${med.padStart(27)}`);
    }
    console.log("");
  }

  if (r.malClasificados.length) {
    console.log("Mal clasificados o sin trazar (falta):");
    for (const m of r.malClasificados) console.log(`  #${m.number}  ${m.title}: ${m.faltan.join(", ")}`);
    console.log("Prueba `npm run issues -- --ordenar`, o ponlas con `gh issue edit <n> --add-label …`.");
  }
}
