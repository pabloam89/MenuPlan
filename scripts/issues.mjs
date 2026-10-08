#!/usr/bin/env node
/**
 * Los issues de MenuPlan, en tabla, para aprender de lo que falla.
 *
 *   npm run issues                          problemas de fondo (por casos),
 *                                           encargos, decisiones, puntuales,
 *                                           cuentas por causa y por agente, y
 *                                           lo que está sin clasificar o trazar
 *   npm run issues -- --colgar <hijo> <fondo>
 *                                           cuelga un caso o un encargo de su
 *                                           problema de fondo; si el fondo
 *                                           estaba cerrado y el hijo es un
 *                                           caso, lo reabre: su arreglo no
 *                                           aguantó
 *   npm run issues -- --ordenar             etiquetas y padre que se deducen
 *                                           de lo rellenado en un formulario
 *   npm run issues -- --arranque            las líneas cortas del arranque
 *   npm run issues -- --etiquetas           crea o pone al día en GitHub las
 *                                           etiquetas de scripts/lib/issues.mjs
 *                                           y retira las que sobran (cambia
 *                                           ajustes del repo: OK de Pablo)
 *
 * La clasificación, el porqué y las cuatro respuestas del análisis, en
 * scripts/lib/issues.mjs; el procedimiento, en la skill `github`.
 */
import { execFileSync } from "node:child_process";
import {
  CONSULTA, avisoDeArranque, etiquetas, etiquetasDeFormulario, etiquetasSobrantes,
  fondoDeFormulario, leerIssue, porGrupo, resumen,
} from "./lib/issues.mjs";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
const motivo = (e) => String(e.stderr ?? e.message).trim().split("\n")[0];

/** Todos los issues, con PR, reaperturas, padre e hijos (una consulta por cada 100). */
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

/** Cuelga `hijo` de `fondo` y, si hace falta, reabre el fondo. */
function colgar(issues, hijoN, fondoN) {
  const hijo = issues.find((i) => i.number === hijoN);
  const fondo = issues.find((i) => i.number === fondoN);
  if (!hijo || !fondo) throw new Error(`No encuentro #${hijo ? fondoN : hijoN}`);
  if (!porGrupo(fondo.labels.map((l) => l.name)).tipo.has("fondo")) throw new Error(`#${fondoN} no es un problema de fondo (tipo:fondo)`);
  if (hijo.padre?.number === fondoN) {
    console.log(`#${hijoN} ya cuelga de #${fondoN}.`);
  } else {
    if (hijo.padre) {
      gh("api", "graphql", "-f", "query=mutation($i:ID!,$s:ID!){removeSubIssue(input:{issueId:$i,subIssueId:$s}){issue{number}}}",
        "-f", `i=${issues.find((i) => i.number === hijo.padre.number).id}`, "-f", `s=${hijo.id}`);
    }
    gh("api", "graphql", "-f", "query=mutation($i:ID!,$s:ID!){addSubIssue(input:{issueId:$i,subIssueId:$s}){issue{number}}}",
      "-f", `i=${fondo.id}`, "-f", `s=${hijo.id}`);
    console.log(`#${hijoN} cuelga ahora de #${fondoN}.`);
  }
  const esCaso = porGrupo(hijo.labels.map((l) => l.name)).tipo.has("caso");
  if (esCaso && fondo.state === "CLOSED") {
    const pr = fondo.prs.at(-1);
    gh("issue", "reopen", String(fondoN), "--comment",
      `Reabierto por #${hijoN}: el arreglo${pr ? ` del PR #${pr.number}` : ""} no aguantó. Analiza si se rompió (\`analisis:no-aguanto-roto\`) o se quedó corto (\`analisis:no-aguanto-corto\`) y pónselo a #${hijoN}.`);
    console.log(`#${fondoN} estaba cerrado: reabierto.`);
  }
}

const args = process.argv.slice(2);
const cuantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const med = (x) => (x == null ? "—" : x.toFixed(1));
const corto = (t) => t.replace(/^\[[^\]]+\]\s*/, "");

if (args.includes("--etiquetas")) {
  for (const e of etiquetas()) {
    gh("label", "create", e.name, "--color", e.color, "--description", e.description.slice(0, 100), "--force");
    console.log(`  ${e.name}`);
  }
  const hay = JSON.parse(gh("label", "list", "--limit", "300", "--json", "name")).map((l) => l.name);
  for (const s of etiquetasSobrantes(hay)) {
    // Solo si ya no la lleva ningún issue: quitarla borraría su clasificación.
    const usan = JSON.parse(gh("issue", "list", "--state", "all", "--label", s, "--limit", "200", "--json", "number")).map((i) => `#${i.number}`);
    if (usan.length) {
      console.log(`  sobra ${s}, pero la llevan ${usan.join(", ")}: reclasifícalos y vuelve a lanzar esto`);
      continue;
    }
    gh("label", "delete", s, "--yes");
    console.log(`  retirada ${s}`);
  }
  console.log(`${etiquetas().length} etiquetas al día.`);
} else if (args.includes("--colgar")) {
  const [hijo, fondo] = args.slice(args.indexOf("--colgar") + 1).map((x) => Number(String(x).replace("#", "")));
  if (!hijo || !fondo) throw new Error("Uso: npm run issues -- --colgar <caso o encargo> <problema de fondo>");
  colgar(todos(), hijo, fondo);
} else if (args.includes("--ordenar")) {
  const issues = todos();
  let n = 0;
  for (const i of issues) {
    const tiene = new Set(i.labels.map((l) => l.name));
    const faltan = etiquetasDeFormulario(i.body).filter((e) => !tiene.has(e));
    const fondo = fondoDeFormulario(i.body);
    try {
      if (faltan.length) {
        gh("issue", "edit", String(i.number), "--add-label", faltan.join(","));
        console.log(`  #${i.number}: ${faltan.join(", ")}`);
        n++;
      }
      if (fondo && i.padre?.number !== fondo) {
        colgar(issues, i.number, fondo);
        n++;
      }
    } catch (e) {
      // Lo normal: la etiqueta aún no existe en GitHub (`--etiquetas`) o el #n no es un fondo. Se sigue con los demás.
      console.log(`  #${i.number}: no pude ordenarlo (${motivo(e)})`);
    }
  }
  console.log(n ? `${n} cambios.` : "Nada que ordenar.");
} else if (args.includes("--arranque")) {
  for (const l of avisoDeArranque(todos())) console.log(l);
} else {
  const issues = todos();
  const r = resumen(issues);
  const abiertos = issues.filter((i) => i.state === "OPEN");
  const deTipo = (t) => abiertos.filter((i) => porGrupo(i.labels.map((l) => l.name)).tipo.has(t));

  console.log(`Abiertos: ${Object.entries(r.porTipo).map(([t, k]) => `${k} ${t}`).join(", ") || "ninguno clasificado"}\n`);

  for (const [t, titulo] of [["decision", "Decisiones"], ["encargo", "Encargos"]]) {
    const de = deTipo(t);
    if (!de.length) continue;
    console.log(`${titulo}:`);
    for (const i of de) {
      const extra = [i.padre ? `de #${i.padre.number}` : "", i.asignados.length ? `lo lleva ${i.asignados.join(", ")}` : ""].filter(Boolean).join(" · ");
      console.log(`  #${i.number}  ${corto(i.title)}${extra ? `  (${extra})` : ""}`);
    }
    console.log("");
  }

  if (r.fondos.length) {
    console.log("Problemas de fondo (los abiertos primero, por casos):");
    for (const f of r.fondos) {
      const partes = [
        cuantos(f.casos, "caso", "casos") + (f.casosAbiertos ? ` (${f.casosAbiertos} abiertos)` : ""),
        f.encargos ? `encargos ${f.encargosHechos}/${f.encargos}` : "sin encargos",
        f.reaperturas ? `reabierto ${f.reaperturas}× (no aguantó: roto ${f.noAguanto.roto}, corto ${f.noAguanto.corto})` : "",
        f.abierto ? "" : `cerrado${f.agente ? ` por ${f.agente}` : ""} en ${med(f.diasCierre)} días`,
      ].filter(Boolean).join(" · ");
      console.log(`  ${f.abierto ? "●" : "○"} #${f.number}  ${corto(f.title)}  [${f.causa ?? "sin causa"}, ${f.area ?? "sin área"}]`);
      console.log(`      ${partes}`);
    }
    console.log("");
  }

  if (r.puntuales.length) {
    console.log("Puntuales (la revisión semanal mira si tres parecidos son un patrón):");
    for (const p of r.puntuales.slice(0, 10)) console.log(`  #${p.number}  ${p.createdAt.slice(0, 10)}  ${corto(p.title)}  [${p.causa ?? "sin causa"}]`);
    console.log("");
  }

  const causas = Object.entries(r.causas).sort((a, b) => b[1].casos - a[1].casos);
  if (causas.length) {
    console.log("Por causa:");
    console.log("  causa               fondos  casos  puntuales  reaperturas  días hasta cerrar (mediana)  arreglo");
    for (const [c, f] of causas) {
      const arreglos = Object.entries(f.arreglos).map(([a, k]) => `${a} ${k}`).join(", ") || "—";
      console.log(`  ${c.padEnd(18)}  ${String(f.fondos).padStart(6)}  ${String(f.casos).padStart(5)}  ${String(f.puntuales).padStart(9)}  ${String(f.reaperturas).padStart(11)}  ${med(f.medianaDias).padStart(27)}  ${arreglos}`);
    }
    console.log("");
  }

  const agentes = Object.entries(r.agentes).sort((a, b) => b[1].fondos - a[1].fondos);
  if (agentes.length) {
    console.log("Por quién cerró el problema de fondo (línea «Agente:» del PR):");
    console.log("  agente              fondos  no aguantó: roto  corto  días hasta cerrar (mediana)");
    for (const [a, f] of agentes) {
      console.log(`  ${a.padEnd(18)}  ${String(f.fondos).padStart(6)}  ${String(f.roto).padStart(16)}  ${String(f.corto).padStart(5)}  ${med(f.medianaDias).padStart(27)}`);
    }
    console.log("");
  }

  if (r.malClasificados.length) {
    console.log("Sin clasificar o sin trazar (falta):");
    for (const m of r.malClasificados) console.log(`  #${m.number}  ${corto(m.title)}: ${m.faltan.join("; ")}`);
    console.log("Ver la skill github, «Issues».");
  }
}
