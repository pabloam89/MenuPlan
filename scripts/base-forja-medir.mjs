#!/usr/bin/env node
/**
 * Mide, sin escribir nada, las cifras del diseño de la base común, la forja de estándares y el
 * glosario (docs/ops/BASE-FORJA.md, línea 2 del programa #652). Solo lee ficheros del repo: no usa la
 * red, ni claves, ni cambia ops/normas.json ni ops/glosario/. Cada cifra del documento sale de aquí.
 *
 *   node scripts/base-forja-medir.mjs                 todas las secciones
 *   node scripts/base-forja-medir.mjs glosario        una sola: glosario | dominios | mapeo | normas | reglas | tareas | conexion
 *
 * Es una herramienta de diseño: cuando el PR del glosario y de las normas se fusione y las cifras ya no
 * tengan sentido, se borra con el documento. Lo que cuenta del glosario usa el propio `medir` de
 * scripts/lib/glosario.mjs (la misma prosa que ve ops/glosario.test.js: sin código, sin «», sin historia).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { leerCatalogo } from "./lib/catalogos.mjs";
import { ficherosDe, leerGlosario, medir, patronDe, plano, prosaDeJson, prosaDeMarkdown } from "./lib/glosario.mjs";
import { leerRegistro } from "./lib/normas.mjs";
import { leerForja } from "./lib/forja.mjs";
import { leerEstandares, normasPorConsulta, reglasDelCatalogo, tareasDe } from "./lib/estandaresAgentes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECCIONES = ["glosario", "dominios", "mapeo", "normas", "reglas", "tareas", "conexion"];
const pedida = process.argv[2] ?? "todo";
const quiere = (s) => pedida === "todo" || pedida === s;
/** Los dos ficheros de esta propuesta: no se cuentan a sí mismos en ninguna cifra. */
export const PROPIOS = new Set(["docs/ops/BASE-FORJA.md", "scripts/base-forja-medir.mjs"]);
const linea = (c, v) => console.log(`${c}: ${v}`);
const tabla = (filas) => filas.forEach((f) => console.log(`  ${f.join(" | ")}`));
const cuenta = (xs, f) => xs.reduce((o, x) => ((o[f(x)] = (o[f(x)] ?? 0) + 1), o), Object.create(null));
const orden = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]));

const ficherosGit = () =>
  execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1e9 })
    .split("\n")
    .filter((f) => f && /\.(m?js|jsx|json|md|yml|yaml)$/.test(f) && !f.startsWith("src/data/") && !f.includes("package-lock") && !PROPIOS.has(f));
const texto = (f) => {
  try {
    return statSync(join(RAIZ, f)).size < 2e6 ? readFileSync(join(RAIZ, f), "utf8") : "";
  } catch {
    // a propósito: un fichero que no se lee cuenta como vacío en esta medición de diseño
    return "";
  }
};
const GENERADOS = new Set(["docs/PRINCIPIOS.md", "ops/normas.json", "docs/ops/NORMAS.md", "docs/ops/ESTANDARES.md", "ops/estandares-agentes.json"]);
const kebab = (s) => plano(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const zonaDe = (f) =>
  f.startsWith(".claude/hooks/") ? "hooks" : f.startsWith(".claude/skills/") ? "skills" : f.startsWith(".claude/agents/") ? "agentes" : f.startsWith(".claude/") || f === "CLAUDE.md" ? "reglas-y-claude" :
  f.startsWith(".github/") ? "workflows" : f.startsWith("scripts/") ? "scripts" : f.startsWith("ops/") ? "ops" : f.startsWith("docs/") ? "docs" : "otros";

// ── Glosario ───────────────────────────────────────────────────────────────

/**
 * Las frases con las que hoy se nombra, dentro del glosario, el estándar de un tipo de skill. Pasan a ser
 * sinónimos prohibidos de «plantilla» (la forja ya dice «plantilla por tipo»).
 */
export const FRASES_ESTANDAR_DE_TIPO = [
  "estándar de cada tipo", "estándar de un tipo", "estándar del tipo", "estándar de este tipo", "estándar por tipo",
  "estándares de los tipos", "estándar para cada tipo", "estándar de los tipos", "estándar por tipos",
];
/** Las frases del criterio de la forja que pasan a ser «norma». */
export const FRASES_CRITERIO = [
  "criterio de la forja", "criterios de la forja", "criterio de calidad", "criterios de calidad",
  "criterio de juicio", "criterios de juicio", "criterio de skill", "criterios de skill", "criterios de las skills",
  "criterio de la skill", "criterios de la skill",
];
/** Las frases con que se nombra «regla» para la unidad exigible de un estándar o de la casa. */
export const FRASES_REGLA = [
  "regla propia", "reglas propias", "regla de la casa", "reglas de la casa", "regla del estándar", "reglas del estándar",
  "regla de un estándar", "reglas de un estándar", "regla de la forja", "reglas de la forja",
];

/** Los sentidos de la palabra «estándar», por la línea donde sale (heurística, ver NO COMPROBADO del documento). */
export function sentidoDeEstandar(lineaPlana) {
  if (/(entrada|salida|error)\s+estandar/.test(lineaPlana)) return "entrada_salida";
  if (/estandar(es)?\s+(abierto|de\s+(1\.?024|la\s+industria|oficial))|estandares\s+abiertos/.test(lineaPlana)) return "externo";
  if (/estandares?\s+(de\s+cada|de\s+un|del|de\s+este|de\s+los|para\s+cada|por)\s+tipos?\b|estandar\s+por\s+tipo|artefacto\s+de\s+estandares|estandar\s+de\s+skill/.test(lineaPlana)) return "tipo_de_skill";
  if (/^s*(estandar|estandar.[a-z]+)s*$/.test(lineaPlana)) return "identificador";
  if (/tarea|estandares-agentes|npm run estandar|agente|brief|juez|norma|\bsu estandar\b/.test(lineaPlana)) return "tarea_de_agente";
  return "otro";
}

/** La prosa de todos los ficheros de las zonas del glosario: [{ ruta, lineas: [texto plano] }]. */
function prosaDeZonas(g) {
  const rutas = new Set();
  for (const pats of Object.values(g.zonas)) for (const p of pats) for (const r of ficherosDe(RAIZ, p)) rutas.add(r);
  const salida = [];
  for (const ruta of [...rutas].sort()) {
    if (PROPIOS.has(ruta)) continue;
    const t = texto(ruta);
    if (!t) continue;
    const trozos = ruta.endsWith(".json") ? prosaDeJson(t).map((x) => x.texto) : [prosaDeMarkdown(t)];
    salida.push({ ruta, lineas: trozos.flatMap((x) => x.split("\n").map(plano)) });
  }
  return salida;
}

function seccionGlosario() {
  const g = leerGlosario(RAIZ);
  const prosa = prosaDeZonas(g);
  console.log("## glosario");
  linea("terminos activos", g.terminos.filter((t) => t.estado !== "retirado").length);
  linea("ficheros de prosa en las zonas", prosa.length);

  // 1. la palabra «estándar» por sentido
  const sentidos = {};
  const porFicheroTipo = {};
  for (const { ruta, lineas } of prosa) {
    for (const l of lineas) {
      const n = (l.match(/\bestandar(es)?\b/g) ?? []).length;
      if (!n) continue;
      const s = sentidoDeEstandar(l);
      sentidos[s] = (sentidos[s] ?? 0) + n;
      if (s === "otro" && process.env.MUESTRA) console.log(`  [otro] ${ruta}: ${l.trim().slice(0, 140)}`);
      if (s === "tipo_de_skill") porFicheroTipo[ruta] = (porFicheroTipo[ruta] ?? 0) + n;
    }
  }
  console.log("estandar en prosa de las zonas, por sentido (heurística):");
  tabla(orden(sentidos));
  console.log("estandar con sentido «tipo de skill» por fichero:");
  tabla(orden(porFicheroTipo));

  // 2. cuántos usos tocaría cada cambio: se miden como sinónimos prohibidos hipotéticos con el `medir` del test
  const hipotetico = (nombre, frases) => ({ termino: `(hipótesis) ${nombre}`, estado: "activo", clase: "artefacto", definicion: "", sinonimos_prohibidos: frases, aplica_a: ["todas"] });
  const conjuntos = {
    "plantilla: prohibir «estándar de cada tipo» y sus variantes": FRASES_ESTANDAR_DE_TIPO,
    "norma: prohibir «criterio de la forja/calidad/juicio/skill»": FRASES_CRITERIO,
    "norma: prohibir «regla propia/de la casa/del estándar/de la forja»": FRASES_REGLA,
    "norma: retirar «criterio» entero (pasa_a norma)": ["criterio", "criterios"],
    "norma: retirar «regla» entera (pasa_a norma)": ["regla", "reglas"],
  };
  console.log("usos que tocaría cada cambio en las zonas del test (medidos con medir() de scripts/lib/glosario.mjs):");
  for (const [nombre, frases] of Object.entries(conjuntos)) {
    const { medida, detalle } = medir(RAIZ, { ...g, terminos: [hipotetico(nombre, frases)] }, { ficheros: (pat) => ficherosDe(RAIZ, pat).filter((f) => !PROPIOS.has(f)) });
    const total = detalle.length;
    const porFrase = cuenta(detalle, (d) => d.sinonimo);
    const ficheros = Object.keys(medida).length;
    console.log(`  ${nombre}: ${total} usos en ${ficheros} ficheros`);
    const top = orden(cuenta(detalle, (d) => d.ruta)).slice(0, 6);
    console.log(`    frases -> ${orden(porFrase).filter(([, n]) => n).map(([s, n]) => `${s}=${n}`).join(", ") || "(ninguna)"}`);
    console.log(`    ficheros con más: ${top.map(([r, n]) => `${r}=${n}`).join(", ") || "(ninguno)"}`);
  }

  // 3. fuera de las zonas del glosario (el test no los ve): mismas frases en el resto del repo
  const todas = ficherosGit();
  const enZonas = new Set(prosa.map((p) => p.ruta));
  const fuera = {};
  for (const [nombre, frases] of Object.entries({ "estándar de tipo": FRASES_ESTANDAR_DE_TIPO, "criterio (frases de la forja)": FRASES_CRITERIO, "regla (frases propias)": FRASES_REGLA })) {
    const res = frases.map((f) => patronDe(f));
    for (const f of todas) {
      if (enZonas.has(f)) continue;
      const t = plano(texto(f));
      const n = res.reduce((a, re) => a + (t.match(re) ?? []).length, 0);
      if (n) {
        fuera[nombre] ??= {};
        fuera[nombre][zonaDe(f)] = (fuera[nombre][zonaDe(f)] ?? 0) + n;
      }
    }
  }
  console.log("las mismas frases FUERA de las zonas (tests, scripts y docs que el test del glosario no lee):");
  for (const [n, z] of Object.entries(fuera)) console.log(`  ${n}: ${orden(z).map(([k, v]) => `${k}=${v}`).join(", ")}`);

  // 4. palabras sueltas: cuántas veces sale cada una en la prosa
  const palabras = ["criterio", "criterios", "regla", "reglas", "norma", "normas", "principio", "principios", "estandar", "estandares", "plantilla", "plantillas", "control", "controles", "meta", "metas"];
  const vistas = {};
  for (const { lineas } of prosa) for (const l of lineas) for (const p of palabras) { const n = (l.match(new RegExp(`(?<![a-z0-9_-])${p}(?![a-z0-9_-])`, "g")) ?? []).length; if (n) vistas[p] = (vistas[p] ?? 0) + n; }
  console.log("palabras en la prosa de las zonas:");
  tabla(orden(vistas));

  // 5. la palabra «nivel» (0/1/2) con dos sentidos
  const nivel = {};
  for (const { ruta, lineas } of prosa) for (const l of lineas) {
    const n = (l.match(/\bnivel(es)? [012]\b/g) ?? []).length;
    if (n) nivel[ruta] = (nivel[ruta] ?? 0) + n;
  }
  linea("nivel 0/1/2 en la prosa de las zonas", `${Object.values(nivel).reduce((a, b) => a + b, 0)} usos en ${Object.keys(nivel).length} ficheros`);
  tabla(orden(nivel).slice(0, 8));
}

// ── Normas, principios e ids ───────────────────────────────────────────────

function principiosDeTodos() {
  const propios = leerCatalogo(RAIZ, "ops/principios/");
  const producto = leerCatalogo(RAIZ, "ops/principios-producto/");
  const red = JSON.parse(readFileSync(join(RAIZ, "ops/redaccion.json"), "utf8"));
  const lista = (c) => c.principios ?? c.items ?? c.lista ?? [];
  return [
    ...lista(propios).map((p) => ({ ...p, catalogo: "propio" })),
    ...lista(producto).map((p) => ({ ...p, catalogo: "producto" })),
    ...red.principios.map((p) => ({ ...p, catalogo: "redaccion" })),
  ];
}

function seccionNormas() {
  const normas = leerRegistro(RAIZ).normas;
  const ps = principiosDeTodos();
  console.log("## normas");
  linea("normas", normas.length);
  linea("principios", `${ps.length} (${orden(cuenta(ps, (p) => p.catalogo)).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  const porPrincipio = cuenta(normas, (n) => n.principio);
  linea("principios citados por alguna norma", Object.keys(porPrincipio).length);
  linea("distribución de normas por principio", orden(cuenta(Object.entries(porPrincipio), ([, v]) => v)).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} norma: ${v} principios`).join("; "));
  const uno = ps.filter((p) => porPrincipio[p.id] === 1);
  linea("principios de UNA sola norma", `${uno.length} (${orden(cuenta(uno, (p) => p.catalogo)).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  linea("principios sin norma", ps.filter((p) => !porPrincipio[p.id]).map((p) => p.id).join(", "));
  linea("campo concepto explícito en normas", normas.filter((n) => n.concepto).length);
  linea("normas por ámbito", orden(cuenta(normas, (n) => n.ambito)).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("normas por ejecutor", orden(cuenta(normas, (n) => n.ejecutor)).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("normas con más de un ámbito", normas.filter((n) => Array.isArray(n.ambito)).length);

  // ¿quién cita los ids?
  const todas = ficherosGit();
  const textos = new Map(todas.filter((f) => !GENERADOS.has(f) && !f.startsWith("ops/principios/principios/") && !f.startsWith("ops/principios-producto/principios/")).map((f) => [f, texto(f)]));
  const citas = (id) => {
    const re = new RegExp(`(?<![\\w-])${id}(?![\\w-])`);
    return [...textos].filter(([, t]) => re.test(t)).map(([f]) => f);
  };
  const guardia = texto(".claude/hooks/avisos-guardia.mjs");
  const codigos = [...guardia.matchAll(/codigo:\s*"([^"]+)"/g)].map((m) => m[1]);
  linea("avisos de la guardia con código de norma", codigos.length);
  linea("normas distintas que cita la guardia", `${new Set(codigos).size} (existen todas: ${[...new Set(codigos)].every((c) => normas.some((n) => n.id === c))})`);
  const citadasNormas = normas.map((n) => ({ id: n.id, fs: citas(n.id) }));
  const porZona = {};
  for (const c of citadasNormas) for (const z of new Set(c.fs.map(zonaDe))) porZona[z] = (porZona[z] ?? 0) + 1;
  linea("normas citadas por id, por zona (nº de normas distintas)", orden(porZona).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("normas que ningún fichero fuera de los catálogos cita por id", citadasNormas.filter((c) => !c.fs.length).length);
  const idsNormas = new Set(normas.map((n) => n.id));
  const marcasTodas = [...textos].flatMap(([f, t]) => [...t.matchAll(/<!--\s*norma:([\w-]+)\s*-->/g)].map((m) => ({ f, id: m[1] })));
  const marcas = marcasTodas.filter((m) => idsNormas.has(m.id));
  linea("marcas <!-- norma:id --> de normas que existen", `${marcas.length} (${new Set(marcas.map((m) => m.id)).size} normas, en ${new Set(marcas.map((m) => m.f)).size} ficheros)`);
  linea("marcas descartadas por no ser el id de una norma (placeholders)", [...new Set(marcasTodas.filter((m) => !idsNormas.has(m.id)).map((m) => m.id))].join(", ") || "ninguna");
  linea("metadata.normas de las skills", `${new Set([...textos].filter(([f]) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f)).flatMap(([, t]) => (/normas:\s*\[?([^\n\]]*)/.exec(t)?.[1] ?? "").split(/[,\s]+/).filter(Boolean))).size} normas distintas`);
  const eventos = [...textos].filter(([f]) => f.startsWith(".claude/hooks/eventos")).length;
  linea("ficheros de eventos que escriben «norma: <id>»", eventos);

  // los 75 de una norma: quién los cita
  const citasUno = uno.map((p) => ({ id: p.id, catalogo: p.catalogo, norma: normas.find((n) => n.principio === p.id).id, fs: citas(p.id) }));
  linea("de los de una norma, citados por id fuera de su catálogo y de lo generado", `${citasUno.filter((c) => c.fs.length).length} de ${uno.length}`);
  linea("…por zona (nº de citas)", orden(cuenta(citasUno.flatMap((c) => c.fs), zonaDe)).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("…por catálogo y citados", orden(cuenta(citasUno.filter((c) => c.fs.length), (c) => c.catalogo)).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("…citados en un hook", citasUno.filter((c) => c.fs.some((f) => f.startsWith(".claude/hooks/"))).length);
  const skillProducto = citasUno.filter((c) => c.fs.some((f) => f.startsWith(".claude/skills/principios-de-producto/"))).length;
  linea("…citados por la skill principios-de-producto", skillProducto);
  console.log("los 75 (principio → norma → nº de ficheros que lo citan):");
  for (const c of citasUno) console.log(`  ${c.catalogo} | ${c.id} | ${c.norma} | ${c.fs.length}`);
  console.log("las normas que cita la guardia:");
  console.log(`  ${[...new Set(codigos)].sort().join(", ")}`);
}

// ── Criterios y reglas propias → normas ────────────────────────────────────

function seccionReglas() {
  const normas = leerRegistro(RAIZ).normas;
  const idsNorma = new Set(normas.map((n) => n.id));
  const forja = leerForja(RAIZ);
  const criterios = forja.criterios ?? [];
  const datos = leerEstandares(RAIZ);
  const reglas = reglasDelCatalogo(datos);
  console.log("## reglas");
  linea("criterios de la forja", criterios.length);
  linea("criterios por capa", orden(cuenta(criterios, (c) => c.capa)).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("criterios por aplica_a", orden(cuenta(criterios, (c) => [...c.aplica_a].sort().join("+"))).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("criterios con control juicio", criterios.filter((c) => c.control === "juicio").length);
  linea("criterios con el mismo id que una norma", criterios.filter((c) => idsNorma.has(c.id)).map((c) => c.id).join(", ") || "ninguno");
  linea("criterios que citan principio", criterios.filter((c) => c.principio).length);
  const ambitoNormaForja = normas.filter((n) => /^(skill|forja|plantilla)/.test(n.sujeto));
  linea("normas con sujeto skill/forja/plantilla y su ámbito", orden(cuenta(ambitoNormaForja, (n) => n.ambito)).map(([k, v]) => `${k} ${v}`).join(", ") || "ninguna");

  linea("tareas de agente", tareasDe(datos).length);
  const propias = reglas.filter((r) => !r.clave.startsWith("común "));
  const comunes = reglas.filter((r) => r.clave.startsWith("común "));
  linea("reglas propias de tareas", propias.length);
  linea("reglas de tareas comunes", comunes.length);
  linea("control de las reglas", orden(cuenta(reglas, (r) => (r.regla.control === "juicio" ? "juicio" : "fichero"))).map(([k, v]) => `${k} ${v}`).join(", "));

  // ids propuestos para las reglas: kebab(nombre); choques con normas, criterios y entre ellas
  const ids = reglas.map((r) => ({ ...r, id: kebab(r.regla.nombre) }));
  const idsCriterio = new Set(criterios.map((c) => c.id));
  const veces = cuenta(ids, (r) => r.id);
  linea("reglas cuyo id por nombre choca con una norma", ids.filter((r) => idsNorma.has(r.id)).length);
  linea("reglas cuyo id por nombre choca con un criterio", ids.filter((r) => idsCriterio.has(r.id)).length);
  linea("reglas cuyo id por nombre se repite entre reglas", `${ids.filter((r) => veces[r.id] > 1).length} reglas en ${Object.values(veces).filter((v) => v > 1).length} nombres`);
  linea("reglas con un nombre ya usado por otra de otro agente", Object.entries(veces).filter(([, v]) => v > 1).map(([k]) => k).slice(0, 10).join(", ") || "ninguna");

  // alcance: lo que cambia al pasar de «solo esta tarea» a «ámbito × acción»
  const tareas = tareasDe(datos).map(({ agente, tarea }) => ({ agente, ...tarea }));
  const llega = (ambito, accion, propia) => tareas.filter((t) => `${t.agente}/${t.id}` !== propia && normasPorConsulta([{ ambito, acciones: [accion] }], t.ambitos, t.accion).length).length;
  const filas = propias.map((r) => {
    const [agente, resto] = r.clave.split("/");
    const id = resto.split(" · ")[0];
    const t = tareas.find((x) => x.agente === agente && x.id === id);
    const alcances = t.ambitos.map((a) => llega(a, t.accion, `${agente}/${id}`));
    return { clave: r.clave, multi: t.ambitos.length > 1, min: Math.min(...alcances), max: Math.max(...alcances) };
  });
  linea("reglas propias en tareas de más de un ámbito (la norma tiene un solo ámbito)", filas.filter((f) => f.multi).length);
  linea("reglas propias que, hechas norma, no llegarían a ninguna otra tarea (ámbito más estrecho)", filas.filter((f) => f.min === 0).length);
  linea("reglas propias que llegarían a otras tareas en el ámbito más estrecho", `${filas.filter((f) => f.min > 0).length} (mediana ${filas.map((f) => f.min).sort((a, b) => a - b)[Math.floor(filas.length / 2)]}, máximo ${Math.max(...filas.map((f) => f.min))})`);
  linea("reglas propias que llegarían a otras tareas en el ámbito más ancho", `${filas.filter((f) => f.max > 0).length} (máximo ${Math.max(...filas.map((f) => f.max))})`);
  linea("tareas con más de un ámbito", `${tareas.filter((t) => t.ambitos.length > 1).length} de ${tareas.length}`);
  linea("normas que el catálogo llama «reglas_que_no_son_norma»", Object.keys(datos.reglas_que_no_son_norma ?? {}).length);
}

// ── Tareas y tipos de tarea ────────────────────────────────────────────────

function seccionTareas() {
  const datos = leerEstandares(RAIZ);
  const agentes = {};
  for (const f of readdirSync(join(RAIZ, ".claude/agents")).filter((x) => x.endsWith(".md"))) {
    agentes[f.replace(/\.md$/, "")] = /\bTipo:\s*(constructor|juez)/i.exec(texto(`.claude/agents/${f}`))?.[1]?.toLowerCase() ?? "?";
  }
  const tareas = tareasDe(datos).map(({ agente, tarea }) => ({ agente, tipoAgente: agentes[agente], ...tarea }));
  console.log("## tareas");
  linea("agentes por tipo", orden(cuenta(Object.values(agentes), (x) => x)).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("tareas por acción", orden(cuenta(tareas, (t) => t.accion)).map(([k, v]) => `${k} ${v}`).join(", "));
  console.log("acción × tipo de agente (tareas):");
  const cruce = cuenta(tareas, (t) => `${t.accion} | ${t.tipoAgente}`);
  tabla(orden(cruce));
  console.log("por acción: agentes distintos, reglas propias, fuentes distintas citadas y las 3 más citadas:");
  for (const accion of Object.keys(datos.acciones)) {
    const ts = tareas.filter((t) => t.accion === accion);
    const rs = ts.flatMap((t) => [...(t.reglas ?? []), ...(t.comunes ?? []).flatMap((c) => datos.comunes[c]?.reglas ?? [])]);
    const fu = cuenta(rs, (r) => r.fuente);
    console.log(`  ${accion} | tareas ${ts.length} | agentes ${new Set(ts.map((t) => t.agente)).size} | reglas ${rs.length} | fuentes ${Object.keys(fu).length} (externas ${Object.keys(fu).filter((k) => datos.fuentes[k]?.url).length}) | top: ${orden(fu).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  linea("fuentes del catálogo", `${Object.keys(datos.fuentes).length} (externas ${Object.values(datos.fuentes).filter((f) => f.url).length})`);
  linea("tareas que citan normas aparte", tareas.filter((t) => (t.normas ?? []).length).length);
  linea("tareas con rondas de investigación", tareas.filter((t) => (t.rondas ?? []).length).length);
  console.log("ejemplo de tres reglas de «construir» con fuente externa (nombre | fuente):");
  const construir = tareas.filter((t) => t.accion === "construir").flatMap((t) => (t.reglas ?? []).map((r) => ({ t, r }))).filter(({ r }) => datos.fuentes[r.fuente]?.url);
  for (const { t, r } of construir.slice(0, 3)) console.log(`  ${t.agente}/${t.id} | ${r.nombre} | ${r.fuente}`);
}

// ── Conexión con el glosario ───────────────────────────────────────────────

function seccionConexion() {
  const g = leerGlosario(RAIZ);
  const nombres = new Set(g.terminos.filter((t) => t.estado !== "retirado").map((t) => plano(t.termino).replace(/ /g, "_")));
  const sinTilde = (s) => plano(s).replace(/ /g, "_");
  console.log("## conexión con el glosario");
  const ent = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8")).entities;
  linea("entidades de ops/entidades.json", ent.length);
  linea("…con `term` que existe en el glosario (ya lo vigila ops/entidades.test.js)", ent.filter((e) => e.term && g.terminos.some((t) => t.termino === e.term && t.estado !== "retirado")).length);
  linea("…sin `term` (todas verticales)", ent.filter((e) => !e.term).map((e) => e.id).join(", "));
  const dir = join(RAIZ, "ops/forja/campos_ficha");
  let campos = 0;
  let conTermino = 0;
  const sin = [];
  for (const f of readdirSync(dir)) {
    const ficha = JSON.parse(readFileSync(join(dir, f), "utf8")).valor;
    for (const c of Object.keys(ficha.campos)) {
      campos += 1;
      if (nombres.has(sinTilde(c))) conTermino += 1;
      else sin.push(`${f.replace(".json", "")}.${c}`);
    }
  }
  linea("campos de las 5 fichas de la forja", campos);
  linea("…cuyo nombre es ya un término activo del glosario", conTermino);
  linea("…sin término del mismo nombre", sin.join(", "));
  const forja = leerForja(RAIZ);
  linea("artefactos de la forja (campos_ficha)", readdirSync(dir).length);
  linea("tipos de skill de la forja", (forja.tipos_skill ?? []).length);
}


// ── Dominios del glosario (propuesta) ──────────────────────────────────────

/** Propuesta de campo `dominio` (vocabulario cerrado) para cada término de hoy. base = lenguaje de la factoría que vale en cualquier proyecto. */
export const DOMINIO_PROPUESTO = {
  base: ["agente","juez","constructor","revisor","dueño","persona","sesión","orquestador","vigilante","comprobar","verificar","validar","probar","medir","registrar","revisar","juzgar","auditar","ensayar","aplicar","fusionar","podar","retirar","diagnosticar","norma","principio","criterio","regla","estándar","plantilla","vocabulario","ficha","control","test","evidencia","hallazgo","informe","métrica","evento","eval","entidad","eje","zona","módulo","falta","aviso","defecto","fallo","tarea de agente","skill","capa","caso de prueba","juicio de skill","hook","guardia","gateway","decisión","comprobación","proyecto"],
  ops: ["rama","pr","issue","caso","fondo","encargo","causa","causa de escape","clase","arreglo","aprendizaje","barrera","mecanismo","despliegue","entorno","producción","staging","servicio","bóveda","clave","identidad","carpeta de trabajo","carpeta principal","tarea","plano","recurso","repositorio","tipo de encargo","workflow"],
  datos: ["migración","tabla","fuente de datos"],
  producto: ["persona de la casa"],
  diseno: ["componente de diseño","patrón de diseño","perfil de diseño","sistema de diseño","token de diseño"],
};

function seccionDominios() {
  const g = leerGlosario(RAIZ);
  const activos = g.terminos.filter((t) => t.estado !== "retirado");
  const de = new Map(Object.entries(DOMINIO_PROPUESTO).flatMap(([d, ts]) => ts.map((t) => [t, d])));
  console.log("## dominios del glosario");
  linea("términos activos", activos.length);
  linea("todos con aplica_a [todas]", activos.every((t) => t.aplica_a.length === 1 && t.aplica_a[0] === "todas"));
  linea("términos sin dominio propuesto", activos.filter((t) => !de.has(t.termino)).map((t) => t.termino).join(", ") || "ninguno");
  linea("dominio propuesto que no es término", [...de.keys()].filter((k) => !activos.some((t) => t.termino === k)).join(", ") || "ninguno");
  linea("términos por dominio propuesto", orden(cuenta(activos, (t) => de.get(t.termino) ?? "(sin)")).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("términos por clase", orden(cuenta(activos, (t) => t.clase)).map(([k, v]) => `${k} ${v}`).join(", "));
  linea("términos con relaciones", activos.filter((t) => t.amplio || t.estrecho?.length || t.relacionado?.length).length);
  const rel = activos.flatMap((t) => [t.amplio, ...(t.estrecho ?? []), ...(t.relacionado ?? [])].filter(Boolean).map((o) => [t.termino, o]));
  linea("relaciones que cruzan de dominio (base↔ops…)", rel.filter(([a, b]) => de.get(a) !== de.get(b)).length + " de " + rel.length);
  linea("ficheros de término", readdirSync(join(RAIZ, "ops/glosario/terminos")).length);
}

// ── Mapeo término → entidad (propuesta) ────────────────────────────────────

/** La relación que la clase del término impone con la entidad que nombra (propuesta). */
export const RELACION_POR_CLASE = { artefacto: "denota", campo: "campo_de", estado: "valor_de", rol: "rol_de", accion: "accion_sobre", lugar: "ubicacion_de" };

function seccionMapeo() {
  const g = leerGlosario(RAIZ);
  const ent = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8")).entities;
  const usados = new Set(ent.map((e) => e.term).filter(Boolean));
  const activos = g.terminos.filter((t) => t.estado !== "retirado");
  console.log("## mapeo término → entidad");
  for (const [clase, rel] of Object.entries(RELACION_POR_CLASE)) {
    const ts = activos.filter((t) => t.clase === clase);
    console.log(`  ${clase} (${rel}) | términos ${ts.length} | los nombra una entidad en «term» ${ts.filter((t) => usados.has(t.termino)).length}`);
  }
  const sin = activos.filter((t) => t.clase === "artefacto" && !usados.has(t.termino)).map((t) => t.termino);
  linea("artefactos que ninguna entidad nombra", `${sin.length}: ${sin.join(", ")}`);
  linea("entidades sin término", ent.filter((e) => !e.term).map((e) => `${e.id}(${e.scope})`).join(", "));
}

const SECCION = { glosario: seccionGlosario, dominios: seccionDominios, mapeo: seccionMapeo, normas: seccionNormas, reglas: seccionReglas, tareas: seccionTareas, conexion: seccionConexion };

/** Solo corre como programa: importarlo (un test, otro script) no ejecuta nada. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (pedida !== "todo" && !SECCIONES.includes(pedida)) {
    console.error(`Uso: node scripts/base-forja-medir.mjs [${SECCIONES.join("|")}]
Sin argumento corre todas las secciones. «${pedida}» no es una sección.`);
    process.exit(2);
  }
  for (const nombre of SECCIONES) if (quiere(nombre)) SECCION[nombre]();
}
