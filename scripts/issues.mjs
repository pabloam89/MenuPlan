#!/usr/bin/env node
/**
 * Los issues de MenuPlan, en tabla, para aprender de lo que falla.
 *
 *   npm run issues                          problemas de fondo (por casos),
 *                                           encargos, decisiones, puntuales,
 *                                           cuentas por causa y por agente, y
 *                                           lo que está sin clasificar o trazar
 *   npm run issues -- --fresco              (con cualquier orden de lectura) salta la caché:
 *                                           el listado vale 10 min y el arranque 15 (#424,
 *                                           cuota GraphQL; lo que escribe va sin caché)
 *   npm run issues -- --colgar <hijo> <fondo>
 *                                           cuelga un caso o un encargo de su
 *                                           problema de fondo; si el fondo
 *                                           estaba cerrado y el hijo es un
 *                                           caso, lo reabre: su arreglo no
 *                                           aguantó
 *   npm run issues -- --nuevo "título" --tipo caso --area ops --cuerpo <f.md>
 *                                           crea un issue, pero antes enseña
 *                                           los parecidos y para si los hay
 *                                           (--crear-igual "<motivo>" para seguir); las
 *                                           decisiones se asignan a Pablo. La
 *                                           guardia niega `gh issue create`
 *   npm run issues -- --ordenar             etiquetas y padre que se deducen
 *                                           de lo rellenado en un formulario
 *   npm run issues -- --marcas-huerfanas    lista (sin borrar) las marcas «lo lleva»
 *                                           de ramas que ya no existen
 *   npm run issues -- --indexar             escribe el índice local para `npm run buscar` y el aviso
 *                                           automático (una consulta de issues, una de PR)
 *   npm run issues -- --arranque            las líneas cortas del arranque (y de paso el índice)
 *
 * El listado incluye el informe de fichas (#337): fondos sin ficha, sin
 * diagnóstico, con la ventana de observación vencida y los «matiz» repetidos.
 *
 * Cada encargo enseña quién lo lleva (rama, carpeta y antigüedad del último
 * commit; «posiblemente parada» pasadas 4 h) y, al final, las ramas sin número
 * de issue. `--nuevo` mira además carpetas y ramas vivas con palabras del título.
 *   npm run issues -- --etiquetas           crea o pone al día en GitHub las
 *                                           etiquetas de scripts/lib/issues.mjs
 *                                           y retira las que sobran (cambia
 *                                           ajustes del repo: OK de Pablo)
 *
 * La clasificación, el porqué y las cuatro respuestas del análisis, en
 * scripts/lib/issues.mjs; el procedimiento, en la skill `issues`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  CONSULTA, CONSULTA_PR, GRUPOS, PABLO, avisoDeArranque, etiquetas, etiquetasSobrantes,
  debeReabrir, etiquetasQueFaltan, fondoDeFormulario, leerIssue, medirCasos, parecidos, porGrupo, resumen,
} from "./lib/issues.mjs";
import {
  CONSULTA_PR_INDICE, TIMEOUT_PRS_ARRANQUE_MS, arrancar, construirIndice, contarParecidosIgnorados, escribirIndice, leerIndice, lineaParecidosIgnorados, motivoCrearIgual, rutaIndice,
} from "./lib/buscarAntes.mjs";
import { analizarCasos } from "../.claude/hooks/casos.mjs";
import { informeFichas } from "./lib/fondos.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { TTL_MIN, borrarCacheGh, conCache, registrarGh } from "./lib/cuotaGh.mjs";
import { cruce, leerInventario, marcasHuerfanas, leerMarcas, lineaParecida, lineasDeLleva, parecidosEnGit, sinNumero, textoDeRama } from "./lib/lleva.mjs";

// Cada llamada deja su línea `gh: caller=issues api=…` (scripts/lib/cuotaGh.mjs, #424).
const gh = (...args) => {
  registrarGh("issues", args);
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
};
const ghCorto = (ms, ...args) => {
  registrarGh("issues", args);
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: ms });
};
const motivo = (e) => String(e.stderr ?? e.message).trim().split("\n")[0];

/** Los nodos de GitHub de todos los issues (una consulta por cada 100, ~106 puntos cada una). */
function pedirNodos() {
  const nodos = [];
  let cursor = null;
  do {
    const args = ["api", "graphql", "-f", `query=${CONSULTA}`];
    if (cursor) args.push("-f", `cursor=${cursor}`);
    const pag = JSON.parse(gh(...args)).data.repository.issues;
    nodos.push(...pag.nodes);
    cursor = pag.pageInfo.hasNextPage ? pag.pageInfo.endCursor : null;
  } while (cursor);
  return nodos;
}

/**
 * Todos los issues, con PR, reaperturas, padre e hijos. Cuesta ~320 puntos de la
 * cuota GraphQL (#424), así que se guarda en una caché local: `ttlMin` dice cuántos
 * minutos vale (0 = sin caché, para lo que escribe) y con `viejoSiFalla` una
 * respuesta vieja sustituye a un error. Sin caché, se pide como antes.
 */
let minutosDeCacheVieja = null; // se rellena si el plan B sirvió una caché vieja (el arranque lo cuenta en stdout)
function todos({ ttlMin = 0, viejoSiFalla = false } = {}) {
  const fresco = args.includes("--fresco");
  const nodos = conCache("issues-nodos", {
    ttlMin: fresco ? 0 : ttlMin, viejoSiFalla, pedir: pedirNodos, aviso: (m, min) => { minutosDeCacheVieja = min; console.error(m); },
  });
  // Las marcas «lo lleva» (scripts/lib/lleva.mjs) salen de los comentarios.
  return nodos.map((n) => ({ ...leerIssue(n), marcas: leerMarcas(n.comments?.nodes, { soloCasa: true }) }));
}

/**
 * Escribe el índice local para `npm run buscar` y el aviso automático (#384) con
 * los issues ya leídos y los PR recientes (una consulta más). Si los PR no
 * llegan se guardan los del índice anterior, y se dice. Nunca rompe a quien
 * lo llama: devuelve la línea que contar.
 */
function indexar(issues, { reusarPrsMenosDeHoras = 0, restanteMs = Infinity } = {}) {
  let prs = null;
  let aviso = "";
  const previo = leerIndice();
  const viejo = previo.indice;
  // En el arranque (10 s de tope) no se pide lo que ya se pidió hace poco.
  // Sin tiempo en el arranque (tope de 10 s en total), tampoco se pide: quedan los PR del índice anterior.
  const pedir = !(viejo && previo.horas < reusarPrsMenosDeHoras) && restanteMs >= TIMEOUT_PRS_ARRANQUE_MS;
  if (!pedir && restanteMs < TIMEOUT_PRS_ARRANQUE_MS) aviso = " (sin tiempo para pedir los PR: quedan los del índice anterior)";
  if (pedir) {
    try {
      const tope = Number.isFinite(restanteMs) ? TIMEOUT_PRS_ARRANQUE_MS : 60_000;
      prs = JSON.parse(ghCorto(tope, "api", "graphql", "-f", `query=${CONSULTA_PR_INDICE}`)).data.repository.pullRequests.nodes;
    } catch (e) {
      aviso = ` (los PR no se han podido leer, ${motivo(e)}: quedan los del índice anterior)`;
    }
  }
  const indice = construirIndice(issues, prs ?? [], new Date());
  if (prs === null && viejo) indice.fichas.push(...viejo.fichas.filter((f) => f.clase === "pr"));
  escribirIndice(indice);
  return `Índice escrito en ${rutaIndice()}: ${issues.length} issues y ${indice.fichas.length - issues.length} PR${aviso}.`;
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
    borrarCacheGh("issues-nodos"); // el padre cambió: la próxima lectura va a GitHub
    console.log(`#${hijoN} cuelga ahora de #${fondoN}${hijo.padre ? ` (antes de #${hijo.padre.number})` : ""}.`);
  }
  if (debeReabrir(hijo, fondo)) {
    const pr = fondo.prs.at(-1);
    gh("issue", "reopen", String(fondoN), "--comment",
      `Reabierto por #${hijoN}: el arreglo${pr ? ` del PR #${pr.number}` : ""} no aguantó. Analiza si se rompió (\`analisis:no-aguanto-roto\`) o se quedó corto (\`analisis:no-aguanto-corto\`) y pónselo a #${hijoN}.`);
    borrarCacheGh("issues-nodos"); // el fondo cambió de estado
    console.log(`#${fondoN} estaba cerrado: reabierto.`);
  } else if (fondo.state === "CLOSED") {
    console.log(`#${fondoN} está cerrado y #${hijoN} es anterior a su cierre: no se reabre (es reordenar, no un fallo nuevo).`);
  }
}

/** Ramas y carpetas vivas; sin git o fuera del repo, vacío (el listado sigue, solo sin el cruce). */
function ramasVivas() {
  try {
    const comun = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }).trim();
    return leerInventario(dirname(comun));
  } catch {
    // a propósito: fuera de un repo (o con git roto) el listado sale sin el cruce de ramas; no es un fallo de los issues
    return [];
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
    + '       [--analisis abierto] [--causa entorno] [--padre <fondo>] [--asignar <login>] [--crear-igual "<motivo>"]';
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

  // --crear-igual ya no es un atajo mudo (#384): pide su motivo y queda escrito en el issue.
  const igual = motivoCrearIgual(args);
  if (igual.error) fallo(igual.error);
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
  // También lo que ya se está haciendo sin issue: carpetas y ramas de GitHub con palabras del título (#271).
  const enGit = parecidosEnGit(ramasVivas(), titulo);
  if ((hay.length || enGit.length) && !igual.dado) {
    console.log("Antes de crear: estos se parecen.\n");
    for (const p of hay) console.log(`  #${p.number}  ${p.state === "OPEN" ? "abierto" : "cerrado"}  ${p.title}`);
    if (enGit.length) {
      console.log(`${hay.length ? "\n" : ""}Y alguien ya trabaja en algo parecido (carpetas y ramas vivas):`);
      for (const p of enGit) console.log(lineaParecida(p));
    }
    console.log("\nSi es uno de estos, no abras otro: añade lo tuyo con `gh issue comment <n> --body-file <fichero>`"
      + " (si está cerrado y es un caso que vuelve, ábrelo como caso y cuélgalo con --padre: se reabre el fondo).\n"
      + 'Si no es ninguno, repite con --crear-igual "<por qué no lo son>": el motivo queda escrito en el issue y se cuenta.');
    process.exit(2);
  }
  const prefijo = { fondo: "fondo", caso: "caso", encargo: "encargo", decision: "decisión" }[tipo];
  const etiq = [`tipo:${tipo}`, `area:${area}`, ...extra.map(([g, v]) => `${g}:${v}`)];
  // Con parecidos ignorados, el cuerpo lleva la línea con quiénes eran y por qué no lo son.
  let ficheroCuerpo = cuerpo;
  if (igual.motivo && (hay.length || enGit.length)) {
    ficheroCuerpo = join(mkdtempSync(join(tmpdir(), "menuplan-issue-")), "cuerpo.md");
    writeFileSync(ficheroCuerpo, `${texto.replace(/\s+$/, "")}\n\n${lineaParecidosIgnorados(hay.map((p) => p.number), igual.motivo, enGit)}\n`);
  }
  const crear = ["issue", "create", "--title", titulo.startsWith("[") ? titulo : `[${prefijo}] ${titulo}`, "--label", etiq.join(","), "--body-file", ficheroCuerpo];
  // Las decisiones se asignan a Pablo: así le llegan por correo y en la app de GitHub.
  const asignar = valor("--asignar") ?? (tipo === "decision" ? PABLO : null);
  if (asignar) crear.push("--assignee", asignar);
  try {
    const url = gh(...crear).trim();
    borrarCacheGh("issues-nodos"); // hay un issue nuevo: la próxima lectura va a GitHub
    const n = Number(url.match(/(\d+)\s*$/)?.[1]);
    console.log(`Creado #${n}: ${url}`);
    if (padre) colgar(todos(), n, padre);
  } catch (e) {
    console.error(motivo(e));
    process.exitCode = 1;
  } finally {
    // El cuerpo temporal de --crear-igual no se queda en la carpeta temporal.
    if (ficheroCuerpo !== cuerpo) rmSync(dirname(ficheroCuerpo), { recursive: true, force: true });
  }
  if (process.exitCode) process.exit(process.exitCode);
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
  if (n) borrarCacheGh("issues-nodos");
  console.log(n ? `${n} cambios.` : "Nada que ordenar.");
} else if (args.includes("--marcas-huerfanas")) {
  // Solo lista: borrar comentarios de un issue es de quien lo pida (`gh api -X DELETE …/issues/comments/<id>`).
  const huerfanas = marcasHuerfanas(todos(), ramasVivas());
  for (const m of huerfanas) console.log(`  #${m.issue}  ${m.rama} (${m.carpeta}), marca de hace ${m.dias} días y sin rama`);
  console.log(huerfanas.length ? `${huerfanas.length} marcas huérfanas: son comentarios «Lo lleva» de issues; no se ha borrado nada.` : "Ninguna marca huérfana.");
} else if (args.includes("--indexar")) {
  // El índice para `npm run buscar` y el aviso automático (#384): una consulta paginada de issues y una de PR.
  try {
    console.log(indexar(todos({ ttlMin: TTL_MIN.listado, viejoSiFalla: true })));
  } catch (e) {
    const v = leerIndice();
    console.error(`No he podido leer GitHub (${motivo(e)}). ${v.indice ? `Queda el índice anterior, de hace ${Math.round(v.horas)} h.` : "Y no hay índice anterior."}`);
    process.exit(1);
  }
} else if (args.includes("--arranque")) {
  const desdeMs = Date.now();
  // El arranque de cada sesión: 15 min de caché y, si GitHub no contesta, lo último que se guardó (#424).
  const issues = todos({ ttlMin: TTL_MIN.arranque, viejoSiFalla: true });
  // Primero las líneas y después, de paso, el índice con lo ya leído: el arranque da 10 s en total y
  // una consulta lenta no puede costar el aviso de issues (ronda 2 de #384).
  arrancar({
    lineas: [...(minutosDeCacheVieja != null ? [`Issues (caché de hace ${minutosDeCacheVieja} min: GitHub no contesta o no hay cuota)`] : []), ...avisoDeArranque(issues), ...lineasDeLleva(issues, ramasVivas())],
    imprimir: (l) => console.log(l),
    indexar: ({ restanteMs }) => indexar(issues, { reusarPrsMenosDeHoras: 1, restanteMs }),
    avisar: (m) => console.error(m),
    desdeMs,
  });
} else {
  const issues = todos({ ttlMin: TTL_MIN.listado, viejoSiFalla: true });
  const r = resumen(issues);
  const abiertos = issues.filter((i) => i.state === "OPEN");
  const deTipo = (t) => abiertos.filter((i) => porGrupo(i.labels.map((l) => l.name)).tipo.has(t));

  console.log(`Abiertos: ${Object.entries(r.porTipo).map(([t, k]) => `${k} ${t}`).join(", ") || "ninguno clasificado"}`);
  // Los creados con `--crear-igual "<motivo>"` (#384): cada uno lleva su línea «Parecidos ignorados».
  console.log(`Creados saltándose parecidos (--crear-igual): ${contarParecidosIgnorados(issues)} de ${issues.length}.\n`);

  // Quién lleva qué: el cruce encargo → rama/carpeta → último commit (scripts/lib/lleva.mjs).
  const ramas = ramasVivas();
  const lleva = new Map(cruce(issues, ramas).map((f) => [f.number, f.ramas]));
  for (const [t, titulo] of [["decision", "Decisiones"], ["encargo", "Encargos"]]) {
    const de = deTipo(t);
    if (!de.length) continue;
    console.log(`${titulo}:`);
    for (const i of de) {
      const extra = [i.padre ? `de #${i.padre.number}` : "", i.asignados.length ? `lo lleva ${i.asignados.join(", ")}` : ""].filter(Boolean).join(" · ");
      console.log(`  #${i.number}  ${corto(i.title)}${extra ? `  (${extra})` : ""}`);
      for (const f of lleva.get(i.number) ?? []) console.log(`        lo lleva: ${textoDeRama(f)}`);
    }
    console.log("");
  }
  const sueltas = sinNumero(ramas);
  if (sueltas.length) {
    console.log("Ramas y carpetas sin número de issue (la excepción; toda rama no trivial lleva el suyo):");
    for (const r of sueltas) console.log(`  ${r.rama}${r.carpeta ? ` en ${r.carpeta}` : " (solo en GitHub)"}`);
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

  // La ficha de cada fondo (#337): quién no la tiene, quién no tiene diagnóstico, qué ventanas vencieron y qué «matiz» se repite.
  const fichas = informeFichas(issues, { hoy: diaMadrid() });
  if (fichas.total) {
    const lista = (ns) => ns.map((n) => `#${n}`).join(", ") || "ninguno";
    console.log(`Fichas de los problemas de fondo (skill issues): ${fichas.conFicha} de ${fichas.total} fondos con ficha.`);
    console.log(`  abiertos sin ficha: ${lista(fichas.sinFicha)}`);
    console.log(`  de esos, obligatorios (alta desde la ficha): ${lista(fichas.sinFichaObligatoria)}`);
    for (const a of fichas.autoaplicacion) console.log(`  autoaplicación (#${a.number}, el primero que debe pasar sus controles): ${a.conFicha ? "con ficha" : "SIN FICHA"}`);
    console.log(`  cerrados con ficha: ${fichas.cerradosConAprendizaje} con aprendizaje, sin él: ${lista(fichas.cerradosSinAprendizaje)}`);
    console.log(`  sin diagnóstico (mecanismo y causa_escape): ${lista(fichas.sinDiagnostico)}`);
    console.log(`  ventana de observación vencida: ${fichas.ventanaVencida.map((v) => `#${v.number} (hasta ${v.hasta})`).join(", ") || "ninguno"}`);
    if (fichas.matices.length) {
      console.log("  matices que se repiten (candidatos a valor nuevo del vocabulario):");
      for (const m of fichas.matices) console.log(`    «${m.matiz}» ×${m.veces} (${lista(m.issues)})`);
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

  // La línea «Casos:» de los últimos 50 PR fusionados (una consulta más).
  try {
    const prs = JSON.parse(gh("api", "graphql", "-f", `query=${CONSULTA_PR}`)).data.repository.pullRequests.nodes;
    const m = medirCasos(prs, analizarCasos);
    console.log(`Línea «Casos:» en los últimos ${m.total} PR fusionados: ${m.conCasos} con casos (${m.casosCitados} citados), ${m.ninguno} con «ninguno», ${m.sinLinea} sin la línea.
`);
  } catch (e) {
    console.warn(`Línea «Casos:» de los PR: no he podido medirla (${motivo(e)}).
`);
  }

  if (r.malClasificados.length) {
    console.log("Sin clasificar o sin trazar (falta):");
    for (const m of r.malClasificados) console.log(`  #${m.number}  ${corto(m.title)}: ${m.faltan.join("; ")}`);
    console.log("Ver la skill issues.");
  }
}
