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
 *   npm run issues -- --nuevo "título" --tipo caso --area ops --cuerpo <f.md>
 *                                           crea un issue, pero antes enseña
 *                                           los parecidos y para si los hay
 *                                           (--crear-igual para seguir); las
 *                                           decisiones se asignan a Pablo. La
 *                                           guardia niega `gh issue create`
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
import { existsSync, readFileSync } from "node:fs";
import {
  CONSULTA, GRUPOS, PABLO, avisoDeArranque, etiquetas, etiquetasSobrantes,
  debeReabrir, etiquetasQueFaltan, fondoDeFormulario, leerIssue, parecidos, porGrupo, resumen,
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

/** Cuelga `hijo` de `fondo` y, si el caso prueba que su arreglo no aguantó, reabre el fondo. */
function colgar(issues, hijoN, fondoN) {
  const hijo = issues.find((i) => i.number === hijoN);
  const fondo = issues.find((i) => i.number === fondoN);
  if (!hijo || !fondo) throw new Error(`No encuentro #${hijo ? fondoN : hijoN}`);
  if (!porGrupo(fondo.labels.map((l) => l.name)).tipo.has("fondo")) throw new Error(`#${fondoN} no es un problema de fondo (tipo:fondo)`);
  const tipoHijo = porGrupo(hijo.labels.map((l) => l.name)).tipo;
  if (!tipoHijo.has("caso") && !tipoHijo.has("encargo")) throw new Error(`#${hijoN} no es un caso ni un encargo: de un fondo solo cuelgan esos`);
  if (hijo.padre?.number === fondoN) {
    console.log(`#${hijoN} ya cuelga de #${fondoN}.`);
  } else {
    // replaceParent: si ya colgaba de otro, lo mueve en un solo paso (no queda suelto a medias).
    gh("api", "graphql", "-f", "query=mutation($i:ID!,$s:ID!){addSubIssue(input:{issueId:$i,subIssueId:$s,replaceParent:true}){issue{number}}}",
      "-f", `i=${fondo.id}`, "-f", `s=${hijo.id}`);
    console.log(`#${hijoN} cuelga ahora de #${fondoN}${hijo.padre ? ` (antes de #${hijo.padre.number})` : ""}.`);
  }
  if (debeReabrir(hijo, fondo)) {
    const pr = fondo.prs.at(-1);
    gh("issue", "reopen", String(fondoN), "--comment",
      `Reabierto por #${hijoN}: el arreglo${pr ? ` del PR #${pr.number}` : ""} no aguantó. Analiza si se rompió (\`analisis:no-aguanto-roto\`) o se quedó corto (\`analisis:no-aguanto-corto\`) y pónselo a #${hijoN}.`);
    console.log(`#${fondoN} estaba cerrado: reabierto.`);
  } else if (fondo.state === "CLOSED") {
    console.log(`#${fondoN} está cerrado y #${hijoN} es anterior a su cierre: no se reabre (es reordenar, no un fallo nuevo).`);
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
  if (!hijo || !fondo) {
    console.error("Uso: npm run issues -- --colgar <caso o encargo> <problema de fondo>");
    process.exit(1);
  }
  try {
    colgar(todos(), hijo, fondo);
  } catch (e) {
    console.error(motivo(e));
    process.exit(1);
  }
} else if (args.includes("--nuevo")) {
  // Crear un issue, buscando antes los parecidos. La guardia niega `gh issue
  // create` a pelo: el 8 oct 2026 tres sesiones abrieron el mismo fallo.
  const valor = (op) => (args.indexOf(op) >= 0 ? args[args.indexOf(op) + 1] : undefined);
  const titulo = valor("--nuevo");
  const tipo = valor("--tipo");
  const area = valor("--area");
  const cuerpo = valor("--cuerpo");
  const uso = 'Uso: npm run issues -- --nuevo "título" --tipo caso|fondo|encargo|decision --area ops --cuerpo <fichero.md>\n'
    + "       [--analisis abierto] [--causa entorno] [--padre <fondo>] [--asignar <login>] [--crear-igual]";
  const fallo = (m) => {
    console.error(`${m}\n${uso}`);
    process.exit(1);
  };
  if (!titulo || titulo.startsWith("--")) fallo("Falta el título.");
  if (!GRUPOS.tipo.valores[tipo]) fallo(`--tipo tiene que ser uno de: ${Object.keys(GRUPOS.tipo.valores).join(", ")}.`);
  if (!GRUPOS.area.valores[area]) fallo(`--area tiene que ser una de: ${Object.keys(GRUPOS.area.valores).join(", ")}.`);
  if (!cuerpo || !existsSync(cuerpo)) fallo("Falta el cuerpo: escríbelo en un fichero (en el scratchpad) y pásalo con --cuerpo.");
  const extra = ["analisis", "causa"].map((g) => [g, valor(`--${g}`)]).filter(([, v]) => v);
  for (const [g, v] of extra) if (!GRUPOS[g].valores[v]) fallo(`--${g} tiene que ser uno de: ${Object.keys(GRUPOS[g].valores).join(", ")}.`);

  const issues = todos();
  // El padre se valida antes de crear: si no, el issue queda creado y suelto.
  const padre = Number(String(valor("--padre") ?? "").replace("#", ""));
  if (padre) {
    const f = issues.find((i) => i.number === padre);
    if (!f || !porGrupo(f.labels.map((l) => l.name)).tipo.has("fondo")) fallo(`#${padre} no es un problema de fondo (tipo:fondo).`);
    if (tipo !== "caso" && tipo !== "encargo") fallo("De un fondo solo cuelgan casos y encargos.");
  }
  const texto = readFileSync(cuerpo, "utf8");
  const hay = parecidos(issues, { titulo, cuerpo: texto });
  if (hay.length && !args.includes("--crear-igual")) {
    console.log("Antes de crear: estos se parecen.\n");
    for (const p of hay) console.log(`  #${p.number}  ${p.state === "OPEN" ? "abierto" : "cerrado"}  ${p.title}`);
    console.log("\nSi es uno de estos, no abras otro: añade lo tuyo con `gh issue comment <n> --body-file <fichero>`"
      + " (si está cerrado y es un caso que vuelve, ábrelo como caso y cuélgalo con --padre: se reabre el fondo).\n"
      + "Si no es ninguno, repite con --crear-igual.");
    process.exit(2);
  }
  const prefijo = { fondo: "fondo", caso: "caso", encargo: "encargo", decision: "decisión" }[tipo];
  const etiq = [`tipo:${tipo}`, `area:${area}`, ...extra.map(([g, v]) => `${g}:${v}`)];
  const crear = ["issue", "create", "--title", titulo.startsWith("[") ? titulo : `[${prefijo}] ${titulo}`, "--label", etiq.join(","), "--body-file", cuerpo];
  // Las decisiones se asignan a Pablo: así le llegan por correo y en la app de GitHub.
  const asignar = valor("--asignar") ?? (tipo === "decision" ? PABLO : null);
  if (asignar) crear.push("--assignee", asignar);
  try {
    const url = gh(...crear).trim();
    const n = Number(url.match(/(\d+)\s*$/)?.[1]);
    console.log(`Creado #${n}: ${url}`);
    if (padre) colgar(todos(), n, padre);
  } catch (e) {
    console.error(motivo(e));
    process.exit(1);
  }
} else if (args.includes("--ordenar")) {
  const issues = todos();
  let n = 0;
  for (const i of issues) {
    // Solo rellena lo que falta: lo que se cambió a mano después (otro análisis,
    // otro padre) manda sobre lo que se escribió en el formulario al abrirlo.
    const faltan = etiquetasQueFaltan(i);
    const fondo = i.padre ? null : fondoDeFormulario(i.body);
    try {
      if (faltan.length) {
        gh("issue", "edit", String(i.number), "--add-label", faltan.join(","));
        console.log(`  #${i.number}: ${faltan.join(", ")}`);
        n++;
      }
      if (fondo) {
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
