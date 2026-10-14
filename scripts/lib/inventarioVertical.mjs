/**
 * inventarioVertical.mjs — cuánto hay de cada lado (horizontal: vale para cualquier proyecto; vertical: solo para
 * HoMenu) en cada capa del repo, y cuáles dudan (#710, primera fase del programa #652). Solo mide: no mueve nada.
 *
 * Las fuentes de datos, por capa (todas del propio repo, sin red):
 *  - principios: ops/principios/ y los catálogos delegados (ops/principios-producto/, ops/redaccion.json), con los
 *    registros de fuentes de ops/fuentes-documentales/ y las zonas de ops/zonas.json;
 *  - fuentes: ops/fuentes-documentales/ (la ruta de una fuente de la casa cae en una zona);
 *  - normas: ops/normas.json (horizontales) y ops/proyectos/<id>/normas.json (verticales), por el cargador común;
 *  - glosario y entidades: ops/glosario/terminos/ y ops/entidades.json (su campo `scope`);
 *  - skills, reglas, comandos, agentes, specs y docs: ops/zonas.json (factoría / producto / mixto, por ruta);
 *  - controles: los tests de git, según la zona de su carpeta y los ficheros de producto que nombran.
 * Lo que no se deduce, a mano, en ops/inventario-vertical.json.
 *
 * Una zona no es un lado: `producto` es «dónde vive el fichero», y aquí se usa como pista, no como veredicto. Por eso
 * `duda` existe. Puro: nada de red; lee ficheros del repo que le pasa `raiz`.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { ficherosDeGit } from "../../ops/ficherosGit.js";
import { cargarNormas } from "./normas.mjs";
import { ladoDeFuente } from "./fuentesDoc.mjs";
import { clasificar, compilar, leerZonas } from "./zonasProyecto.mjs";

export const RUTA_DECISIONES = "ops/inventario-vertical.json";
export const RUTA_DOC = "docs/ops/INVENTARIO-VERTICAL.md";
/** Los ficheros de esta herramienta no cuentan en sus propias cifras (si no, cada PR los movería). */
export const PROPIOS = [RUTA_DOC, RUTA_DECISIONES, "ops/inventario-vertical.test.js", "scripts/inventario-vertical.mjs", "scripts/lib/inventarioVertical.mjs"];

const leerJson = (raiz, ruta) => JSON.parse(readFileSync(join(raiz, ruta), "utf8"));
const jsonsDe = (raiz, dir) => readdirSync(join(raiz, dir)).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort().map((f) => leerJson(raiz, `${dir}/${f}`));

/** Palabras que nombran el proyecto de verdad (sin «casa», «bot» ni «familia», que son castellano corriente). */
const PROYECTO = /\b(HoMenu|MenuPlan|Lola|homenu)\b/i;
/** Servicios que usa el proyecto (no son la factoría): citarlos ata la pieza a este proyecto. Mayúsculas da igual. */
const SERVICIOS = /\b(Vercel|Supabase|Telegram|WhatsApp|Gemini|Anthropic|Mercadona)\b|C:\\dev/i;
/** Las direcciones web de las fuentes no cuentan: citar la documentación de un proveedor no ata la pieza a este proyecto. */
export const sinUrls = (t) => String(t).replace(/https?:\/\/\S+/g, " ");
export const nombraProyecto = (texto) => PROYECTO.test(sinUrls(texto));
export const nombraServicio = (texto) => SERVICIOS.test(sinUrls(texto));
/** Campos de un registro que son ids, rutas o enlaces y no prosa: no cuentan como texto. */
export const NO_ES_PROSA = ["id", "control", "donde", "principio", "ambito", "lado", "project", "normas", "agente", "ruta", "url"];
/** Todos los textos de un valor: cadenas sueltas, listas y objetos anidados (recursivo). */
export const textos = (v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(textos) : v && typeof v === "object" ? Object.values(v).flatMap(textos) : []);
/** Todo el texto de un registro (norma, tarea o regla de estándar), menos los campos que son ids o rutas de control. */
export const textoDe = (o, salvo = NO_ES_PROSA) => Object.entries(o ?? {}).filter(([k]) => !salvo.includes(k)).flatMap(([, v]) => textos(v)).join(" ");
/** Dos razones distintas: nombrar el proyecto y nombrar un servicio del proyecto. */
export const razonesDeNombre = (texto) => [
  ...(nombraProyecto(texto) ? ["su texto nombra el proyecto"] : []),
  ...(nombraServicio(texto) ? ["su texto nombra un servicio del proyecto"] : []),
];
/** Prefijos de fichero que son de HoMenu y no de la factoría. */
const FICHEROS_DE_PRODUCTO = /^(api\/|src\/|supabase\/|specs\/|docs\/datos\/|docs\/producto\/|DESIGN_SYSTEM\.md|public\/)/;

/** Ficheros que los tests de la casa nombran como texto de ejemplo, no porque los vigilen. */
const EJEMPLOS = new Set(["src/App.jsx"]);

const fila = (unidad, total, horizontal, vertical, duda) => ({ unidad, total, horizontal, vertical, duda });
const porZona = (z) => (z === "factoria" ? "horizontal" : z === "producto" ? "vertical" : "duda");

/** Cuenta una lista de { lado } en una fila. */
function contar(unidad, items) {
  const n = { horizontal: 0, vertical: 0, duda: 0 };
  for (const i of items) n[i.lado] += 1;
  return fila(unidad, items.length, n.horizontal, n.vertical, n.duda);
}

export function calcular(raiz) {
  const decisiones = leerJson(raiz, RUTA_DECISIONES);
  const zonas = compilar(leerZonas(raiz));
  const zonaDe = (ruta) => clasificar(ruta, zonas).zona;
  const ficheros = ficherosDeGit(raiz).filter((f) => !PROPIOS.includes(f));
  const filas = [];
  const dudosos = [];
  const duda = (capa, id, razon) => dudosos.push({ capa, id, razon });

  // ---- 1. Principios -------------------------------------------------------------------------------------------
  const fuentes = new Map(jsonsDe(raiz, "ops/fuentes-documentales/fuentes").map((f) => [f.id, f]));
  const casa = jsonsDe(raiz, "ops/principios/principios").map((p) => {
    // Un principio con `project` es de un proyecto: si sigue en ops/principios/ está mal puesto (vertical sin registro propio).
    if (p.project) return { id: p.id, lado: "vertical", razon: `lleva project «${p.project}» y vive en el registro horizontal` };
    if (!(p.fuentes ?? []).length) return { id: p.id, lado: "duda", razon: "no registra ninguna fuente: sin origen no se puede decidir su lado" };
    const externas = (p.fuentes ?? []).filter((s) => fuentes.get(s.fuente)?.tipo === "externa");
    const rutas = (p.fuentes ?? []).map((s) => fuentes.get(s.fuente)).filter((f) => f?.tipo === "casa").map((f) => f.ruta);
    if (externas.length) return { id: p.id, lado: "horizontal" };
    const enProducto = rutas.filter((r) => zonaDe(r) === "producto");
    if (rutas.length && enProducto.length === rutas.length) {
      return { id: p.id, lado: "duda", razon: `sin fuente externa y su único origen es ${enProducto[0]} (zona producto): ¿regla general nacida en HoMenu o regla de HoMenu?` };
    }
    return { id: p.id, lado: "horizontal" };
  });
  for (const p of casa) if (p.lado === "duda") duda("principios", p.id, p.razon);
  filas.push(contar("principios de la casa (ops/principios/)", casa));

  // Los principios de cada proyecto (#710): su registro propio, ops/proyectos/<id>/principios/. Son verticales por vivir ahí.
  const delProyecto = existsSync(join(raiz, "ops/proyectos")) ? readdirSync(join(raiz, "ops/proyectos")).sort().flatMap((id) => {
    const dir = `ops/proyectos/${id}/principios/principios`;
    return existsSync(join(raiz, dir)) ? jsonsDe(raiz, dir).map((p) => ({ id: p.id, lado: "vertical" })) : [];
  }) : [];
  filas.push(contar("principios del proyecto (ops/proyectos/<id>/principios/)", delProyecto));

  const producto = jsonsDe(raiz, "ops/principios-producto/principios").map((p) => {
    if (!(p.fuentes ?? []).length) return { id: p.id, lado: "duda", razon: "no registra ninguna fuente: sin origen no se puede decidir su lado" };
    const todasExternas = (p.fuentes ?? []).every((s) => fuentes.get(s.fuente)?.tipo === "externa");
    // Un principio con `dominio` es del paquete opcional de ese dominio (decisión 2B de Pablo, #710): sigue siendo horizontal, con su literatura.
    if (p.area === "conversational-ai" && !p.dominio) {
      return { id: p.id, lado: "duda", razon: "tiene fuente externa (literatura), pero solo vale para un proyecto con bot conversacional y no declara su paquete («dominio»)" };
    }
    return { id: p.id, lado: todasExternas ? "horizontal" : "duda", razon: "tiene una fuente de la casa" };
  });
  for (const p of producto) if (p.lado === "duda") duda("principios", p.id, p.razon);
  filas.push(contar("principios de producto (delegado: ops/principios-producto/)", producto));

  const redaccion = leerJson(raiz, "ops/redaccion.json").principios.map((p) => ({ id: p.id, lado: "horizontal" }));
  filas.push(contar("guía de redacción (delegado: ops/redaccion.json)", redaccion));

  // ---- 2. Fuentes ---------------------------------------------------------------------------------------------
  // Cada fuente es de un lado: el campo `project` la hace vertical y sin él vale lo que obliga su ruta (agente o factoría:
  // horizontal; producto: vertical). Una externa o una ruta de zona mixta sin `project` es horizontal. Ya no hay dudas (#710, PR 4).
  const fu = [...fuentes.values()].map((f) => {
    const lado = ladoDeFuente(f, zonaDe);
    return { id: f.id, lado, sinMarcar: lado === "vertical" && !f.project };
  });
  const fuentesSinMarcar = fu.filter((f) => f.sinMarcar).length;
  filas.push(contar("fuentes documentales (ops/fuentes-documentales/)", fu));
  const externas = [...fuentes.values()].filter((f) => f.tipo === "externa").length;
  const notaFuentes = `${externas} externas (literatura) y ${fuentes.size - externas} de la casa (una ruta del repo).`;

  // ---- 3. Normas ----------------------------------------------------------------------------------------------
  const carga = cargarNormas(raiz);
  const horizontales = carga.horizontales.map((n) => {
    const razones = razonesDeNormaHorizontal(n);
    return razones.length ? { id: n.id, lado: "duda", razon: razones.join("; ") } : { id: n.id, lado: "horizontal" };
  });
  for (const n of horizontales) if (n.lado === "duda") duda("normas", n.id, n.razon);
  const verticales = Object.values(carga.delProyecto).flat().map((n) => ({ id: n.id, lado: "vertical" }));
  filas.push(contar("normas horizontales (ops/normas.json)", horizontales));
  filas.push(contar("normas verticales (ops/proyectos/<id>/normas.json)", verticales));
  const nDiseno = carga.horizontales.filter((n) => n.ambito === "diseno").length;
  const controlEnProducto = carga.horizontales.filter((n) => typeof n.control === "string" && n.control.includes("/") && zonaDe(n.control) === "producto").length;
  const controlJuicio = carga.horizontales.filter((n) => n.control === "juicio").length;
  const verticalesEnFactoria = Object.values(carga.delProyecto).flat().filter((n) => typeof n.control === "string" && n.control.includes("/") && zonaDe(n.control) === "factoria").length;

  // ---- 4. Entidades y glosario --------------------------------------------------------------------------------
  const ent = leerJson(raiz, "ops/entidades.json").entities;
  const scopeDe = new Map(ent.map((e) => [e.id, e]));
  const entidades = ent.filter((e) => e.status !== "retired").map((e) => {
    if (e.scope !== "horizontal" && e.scope !== "vertical") return { id: e.id, lado: "duda", razon: `sin lado válido («${e.scope}»): una entidad es de un lado` };
    if (e.scope === "vertical" && Object.hasOwn(decisiones.entidades_verticales_genericas, e.id)) return { id: e.id, lado: "duda", razon: decisiones.entidades_verticales_genericas[e.id] };
    return { id: e.id, lado: e.scope };
  });
  for (const e of entidades) if (e.lado === "duda") duda("entidades", e.id, e.razon);
  const retiradas = ent.length - entidades.length;
  filas.push(contar("entidades activas (ops/entidades.json)", entidades));

  // Su lado es el campo `scope` de cada término (#710, PR 7): la carpeta de la casa y la del proyecto lo comprueban en
  // ops/glosario-scope.test.js. Aquí solo hay duda si el campo falta o no es válido, si choca con el de las entidades
  // que nombra, o si un término horizontal nombra el proyecto o un servicio suyo.
  const dirProyectos = join(raiz, "ops/proyectos");
  const terminosDeProyecto = existsSync(dirProyectos) ? readdirSync(dirProyectos).filter((p) => existsSync(join(raiz, `ops/proyectos/${p}/glosario/terminos`))).flatMap((p) => jsonsDe(raiz, `ops/proyectos/${p}/glosario/terminos`)) : [];
  const terminos = [...jsonsDe(raiz, "ops/glosario/terminos"), ...terminosDeProyecto].filter((t) => t.estado === "activo").map((t) => {
    const ligadas = (t.entidades ?? []).map((x) => scopeDe.get(x.entidad)).filter((e) => e && e.status !== "retired");
    const scopes = new Set(ligadas.map((e) => e.scope));
    let lado = t.scope;
    let razon = "";
    if (lado !== "horizontal" && lado !== "vertical") { lado = "duda"; razon = `sin scope válido («${t.scope}»): un término es de un lado`; }
    else if (scopes.size && (scopes.size > 1 || !scopes.has(lado))) { lado = "duda"; razon = `su scope («${t.scope}») choca con el de sus entidades (${[...scopes].join(", ")})`; }
    const textoT = `${t.termino} ${t.definicion}`;
    if (lado === "horizontal" && (nombraProyecto(textoT) || nombraServicio(textoT))) {
      lado = "duda";
      razon = [nombraProyecto(textoT) && `la definición nombra el proyecto («${sinUrls(textoT).match(PROYECTO)[0]}»)`, nombraServicio(textoT) && `la definición nombra un servicio del proyecto («${sinUrls(textoT).match(SERVICIOS)[0]}»)`].filter(Boolean).join("; ");
    }
    if (lado === "vertical" && Object.hasOwn(decisiones.entidades_verticales_genericas, ligadas[0]?.id ?? "")) { lado = "duda"; razon = `su entidad ${ligadas[0].id} es un concepto general marcado vertical`; }
    return { id: t.termino, lado, razon };
  });
  for (const t of terminos) if (t.lado === "duda") duda("glosario", t.id, t.razon);
  filas.push(contar("términos activos del glosario (ops/glosario/terminos/)", terminos));

  // ---- 5. Skills, reglas, comandos, agentes, specs, docs ------------------------------------------------------
  const deZona = (rutas, extra) => rutas.map((r) => {
    const base = porZona(zonaDe(r));
    const e = extra?.(r, base);
    return e ?? { id: r, lado: base, razon: base === "duda" ? "zona mixta en ops/zonas.json" : "" };
  });
  const skills = ficheros.filter((f) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f));
  const skillsLados = deZona(skills, (r, base) => {
    const tipo = readFileSync(join(raiz, r), "utf8").match(/^\s{2}tipo:\s*(\w+)/m)?.[1];
    if (base === "horizontal" && tipo === "servicio") return { id: r, lado: "duda", razon: "skill de un servicio: el método es general, pero lleva los ids, las bóvedas y el repo de HoMenu" };
    return null;
  });
  const reglas = deZona(ficheros.filter((f) => /^\.claude\/rules\/[^/]+\.md$/.test(f)));
  const comandos = deZona(ficheros.filter((f) => /^\.claude\/commands\/[^/]+\.md$/.test(f)));
  const agentesDudosos = decisiones.agentes_dudosos;
  const agentes = ficheros.filter((f) => /^\.claude\/agents\/[^/]+\.md$/.test(f)).map((r) => {
    const id = r.match(/agents\/([\w-]+)\.md$/)[1];
    return Object.hasOwn(agentesDudosos, id) ? { id: r, lado: "duda", razon: agentesDudosos[id] } : { id: r, lado: "horizontal", razon: "" };
  });
  const specs = deZona(ficheros.filter((f) => f.startsWith("specs/") && f.endsWith(".md")));
  const raizMd = ficheros.filter((f) => !f.includes("/") && f.endsWith(".md"));
  const docs = deZona([...ficheros.filter((f) => f.startsWith("docs/") && f.endsWith(".md")), ...raizMd]);
  for (const [capa, lista] of [["skills", skillsLados], ["reglas", reglas], ["comandos", comandos], ["agentes", agentes], ["specs", specs], ["docs", docs]]) {
    for (const x of lista) if (x.lado === "duda") duda(capa, x.id, x.razon);
  }
  filas.push(contar("skills (.claude/skills/)", skillsLados));
  filas.push(contar("reglas por carpeta (.claude/rules/)", reglas));
  filas.push(contar("comandos (.claude/commands/)", comandos));
  filas.push(contar("agentes (.claude/agents/; por regla de Pablo, horizontales)", agentes));
  filas.push(contar("specs (specs/*.md)", specs));
  filas.push(contar("documentos (docs/**/*.md y los .md de la raíz)", docs));

  // ---- 6. Controles y tests -----------------------------------------------------------------------------------
  const existentes = new Set(ficheros);
  const tests = ficheros.filter((f) => /\.test\.(js|jsx|mjs)$/.test(f));
  const lista = tests.map((f) => {
    const z = zonaDe(f);
    if (z === "producto") return { id: f, lado: "vertical", refs: 0 };
    const t = readFileSync(join(raiz, f), "utf8");
    const refs = new Set();
    for (const m of t.matchAll(/["'`]((?:\.\.?\/)*[\w@.\-/]+?\.(?:js|jsx|mjs|json|md|sql|css|html|sh))["'`]/g)) {
      const trozos = `${f.split("/").slice(0, -1).join("/")}/${m[1]}`.split("/");
      const out = [];
      for (const s of trozos) { if (s === "..") out.pop(); else if (s !== "." && s !== "") out.push(s); }
      for (const q of [m[1].replace(/^(\.\.?\/)+/, ""), out.join("/")]) {
        if (existentes.has(q) && FICHEROS_DE_PRODUCTO.test(q) && !EJEMPLOS.has(q)) { refs.add(q); break; }
      }
    }
    if (refs.size >= 3) return { id: f, lado: "vertical", refs: refs.size, razon: `vive en la casa (${z}) pero lee ${refs.size} ficheros de HoMenu (p. ej. ${[...refs][0]})` };
    if (refs.size) return { id: f, lado: "duda", refs: refs.size, razon: `vive en la casa (${z}) y nombra ${[...refs].join(", ")}: ¿vigila el fichero o lo usa de ejemplo?` };
    return { id: f, lado: "horizontal", refs: 0 };
  });
  for (const t of lista) if (t.lado === "duda") duda("tests", t.id, t.razon);
  filas.push(contar("tests (*.test.{js,jsx,mjs})", lista));
  const dentroDeLaCasa = lista.filter((t) => zonaDe(t.id) !== "producto");
  const vigilanVertical = lista.filter((t) => t.lado === "vertical" && zonaDe(t.id) !== "producto").length;

  return {
    filas,
    dudosos,
    cifras: {
      fuentesNota: notaFuentes,
      fuentesSinMarcar,
      entidadesRetiradas: retiradas,
      normasDiseno: nDiseno,
      controlEnProducto,
      controlJuicio,
      verticalesEnFactoria,
      testsEnCasa: dentroDeLaCasa.length,
      vigilanVertical,
      testsEnProducto: lista.length - dentroDeLaCasa.length,
      principiosVerticales: [...casa, ...delProyecto].filter((p) => p.lado === "vertical").map((p) => p.id),
    },
  };
}

// ---- Comprobaciones (puras, para que el test las pruebe con datos buenos y con datos rotos) ------------------------

/** En cada capa, horizontal + vertical + duda tienen que sumar el total. Devuelve los fallos (vacío = bien). */
export function fallosDeCuentas(filas) {
  return filas.filter((f) => f.horizontal + f.vertical + f.duda !== f.total).map((f) => `${f.unidad}: ${f.horizontal}+${f.vertical}+${f.duda} no suman ${f.total}`);
}

/**
 * Por qué una norma horizontal duda: lee TODOS sus campos de prosa (nombre, exigencia, condición, porque, nota,
 * ejemplos…, también dentro de listas) sin distinguir mayúsculas, con una razón para el proyecto y otra para sus servicios.
 */
export function razonesDeNormaHorizontal(n) {
  const razones = razonesDeNombre(textoDe(n));
  if (["bot", "product", "catalog"].includes(n.ambito)) razones.push(`ámbito «${n.ambito}» (conducta de un producto con bot, catálogo o familias)`);
  else if (n.ambito !== "diseno") {
    const nombradas = [n.control, ...(n.donde ?? [])].filter((s) => typeof s === "string" && FICHEROS_DE_PRODUCTO.test(s));
    if (nombradas.length) razones.push(`depende de un fichero de HoMenu (${nombradas[0]})`);
  }
  return razones;
}

/** Las normas verticales son todas verticales y las horizontales ninguna (el cargador común ya las separa). */
export function fallosDeNormas(filas) {
  const h = filas.find((f) => f.unidad.startsWith("normas horizontales"));
  const v = filas.find((f) => f.unidad.startsWith("normas verticales"));
  if (!h || !v) return ["falta la fila de normas horizontales o verticales"];
  const fallos = [];
  if (h.vertical !== 0) fallos.push(`hay ${h.vertical} normas verticales en el registro horizontal`);
  if (v.vertical !== v.total) fallos.push(`solo ${v.vertical} de ${v.total} normas del registro vertical cuentan como verticales`);
  return fallos;
}

/** Cada duda lleva capa, id y una razón con sentido. Cero dudas es un resultado válido (es el objetivo del programa). */
export function fallosDeDudas(dudosos) {
  const fallos = [];
  for (const x of dudosos) {
    if (!x.capa || !x.id) fallos.push(`duda sin capa o sin id: ${JSON.stringify(x)}`);
    else if (String(x.razon ?? "").length <= 15) fallos.push(`${x.capa}/${x.id}: sin razón`);
  }
  return fallos;
}

/**
 * Las decisiones a mano apuntan a piezas que existen. `existe(ruta)` dice si un fichero del repo existe y `entidades`
 * son los ids de ops/entidades.json (inyectables para poder probar el caso roto).
 */
export function fallosDeDecisiones(decisiones, { existe, entidades }) {
  const fallos = [];
  for (const id of Object.keys(decisiones.entidades_verticales_genericas ?? {})) if (!entidades.includes(id)) fallos.push(`entidad ${id}`);
  for (const id of Object.keys(decisiones.agentes_dudosos ?? {})) if (!existe(`.claude/agents/${id}.md`)) fallos.push(`agente ${id}`);
  return fallos;
}

const sumar = (filas, campo) => filas.reduce((a, f) => a + f[campo], 0);
const lineaTabla = (f) => `| ${f.unidad} | ${f.total} | ${f.horizontal} | ${f.vertical} | ${f.duda} |`;
const TITULOS_DE_CAPA = {
  principios: "1. Principios", fuentes: "2. Fuentes", normas: "3. Normas", entidades: "4a. Entidades", glosario: "4b. Glosario",
  skills: "5a. Skills", reglas: "5b. Reglas por carpeta", comandos: "5c. Comandos", agentes: "5d. Agentes", specs: "5e. Specs", docs: "5f. Documentos",
  tests: "6. Tests",
};

/** Las cifras de partida de cada fila por nombre (para la propuesta de PR). */
const buscar = (filas, empieza) => filas.find((f) => f.unidad.startsWith(empieza));

export function documento(d, fecha) {
  const { filas, dudosos, cifras } = d;
  const L = [];
  const f = (e) => buscar(filas, e);
  L.push("# Inventario vertical y horizontal");
  L.push("");
  L.push(`<!-- Instantánea del ${fecha} que escribe \`npm run inventario-vertical -- --escribir\` (scripts/inventario-vertical.mjs). Las cifras cambian con cada PR ajeno, así que NINGÚN test las compara con el repo de hoy: se regenera al empezar cada PR de #710 y se pone al lado la cifra de después. -->`);
  L.push("");
  L.push("Primera fase de #710 (programa #652): solo mide, no mueve nada. **Horizontal** es lo que vale para cualquier proyecto; **vertical**, lo que solo vale para HoMenu; **duda**, lo que no se puede decidir con los datos y se enseña con su razón. La regla de Pablo (13 oct 2026): ningún registro mezcla los dos lados, y los agentes (horizontales) reciben lo vertical por referencia (`--proyecto homenu`).");
  L.push("");
  L.push("## Cómo se ha medido");
  L.push("");
  L.push("Es un **inventario de partida, no un registro de lados**: el lado todavía no es un campo de cada pieza (salvo en normas y entidades), así que se deduce. Las fuentes de datos, todas del propio repo y sin red:");
  L.push("");
  L.push("| Capa | De dónde sale el lado |");
  L.push("|---|---|");
  L.push("| Principios | `ops/principios/`, `ops/principios-producto/` y `ops/redaccion.json`, con las fuentes de `ops/fuentes-documentales/` y las zonas de `ops/zonas.json`. Vertical: los de `ops/proyectos/<id>/principios/` (el campo `project`). Duda: sin fuente externa y su único origen está en un fichero de zona producto; o un principio de producto del área `conversational-ai` |");
  L.push("| Fuentes | El campo `project` la hace vertical. Sin él: la ruta de un agente o de zona factoría, horizontal; de zona producto, vertical (y debe llevarlo); zona mixta o externa, horizontal |");
  L.push("| Normas | El registro en que viven. Duda de una horizontal: su texto nombra HoMenu/Lola/MenuPlan, o su ámbito es `bot`/`product`/`catalog`, o su control o `donde` apunta a `api/`, `src/`, `supabase/`, `docs/datos/`, `docs/producto/`, `specs/` o `DESIGN_SYSTEM.md` (las " + cifras.normasDiseno + " de ámbito `diseno` no cuentan: Pablo decidió el 13 oct que son horizontales) |");
  L.push("| Entidades | Su campo `scope` (`horizontal` o `vertical`, uno solo: la clase es horizontal y sus ejemplares son del registro del proyecto); duda: un valor que no sea ninguno de los dos y las vertical que son un concepto general (lista a mano, hoy vacía) |");
  L.push("| Glosario | Su campo `scope` (`horizontal` en ops/glosario/terminos/, `vertical` en ops/proyectos/<id>/glosario/); duda si falta, si choca con el de las entidades que nombra, o si un término horizontal nombra el proyecto o un servicio suyo |");
  L.push("| Skills, reglas, comandos, specs, documentos | La zona de `ops/zonas.json` (factoría = horizontal, producto = vertical, mixto = duda); una skill `tipo: servicio` de factoría = duda |");
  L.push("| Agentes | Horizontales por la regla de Pablo; los tres que trabajan sobre datos de HoMenu, duda (lista a mano) |");
  L.push("| Tests | Zona de su carpeta. En la casa: vertical si lee 3 ficheros de HoMenu o más (existentes, no de ejemplo), duda si lee 1 o 2 |");
  L.push("");
  L.push("Límites: «casa» y «bot» son castellano corriente en la factoría, así que no cuentan como pista de proyecto. La zona de `ops/zonas.json` se decidió por nombre de carpeta, no pieza a pieza. Un test que nombra `src/App.jsx` como texto de un ejemplo puede salir como duda sin serlo.");
  L.push("");
  L.push("## Resumen por capa");
  L.push("");
  L.push("| Capa | Total | Horizontal | Vertical | Duda |");
  L.push("|---|---:|---:|---:|---:|");
  for (const x of filas) L.push(lineaTabla(x));
  L.push("");
  L.push(`Principios, las cuatro filas juntas: ${sumar(filas.slice(0, 4), "total")} en total, ${sumar(filas.slice(0, 4), "horizontal")} horizontales, ${sumar(filas.slice(0, 4), "vertical")} verticales y ${sumar(filas.slice(0, 4), "duda")} en duda.`);
  L.push("");
  L.push("## Lo que cuenta cada capa");
  L.push("");
  L.push(`- **Principios.** Los ${f("principios del proyecto").total} de HoMenu (${cifras.principiosVerticales.map((i) => `\`${i}\``).join(" y ")}) viven en su registro, \`ops/proyectos/homenu/principios/\`, con el campo \`project\`: origen una decisión de producto, sin fuente externa. Los ${f("principios de la casa").total} de la casa son horizontales salvo los que dudan: la mayoría no tiene fuente externa, pero eso no los hace verticales, son del método de trabajo. Los de base de datos que solo tenían como origen \`docs/datos/PRINCIPIOS.md\` son horizontales por decisión de Pablo (13 oct): llevan fuente externa (PostgreSQL, Fowler) y \`docs/datos/\` es el cómo los aplica HoMenu; el que no la tiene verificable sigue en duda. Los ${f("principios de producto").total} de producto tienen literatura detrás y son horizontales; los del área \`conversational-ai\` forman el paquete de bots (\`dominio: bot\`), opcional por proyecto, y también son horizontales.`);
  L.push(`- **Fuentes.** ${cifras.fuentesNota}`);
  L.push(`- **Normas.** El registro vertical ya está separado (${f("normas verticales").total}). En el horizontal hay ${f("normas horizontales").duda} que dudan (lista abajo). De las ${f("normas horizontales").total}, ${cifras.controlJuicio} tienen como control «juicio» y ${cifras.controlEnProducto} acaban en un fichero de zona producto. De las ${f("normas verticales").total} verticales, ${cifras.verticalesEnFactoria} tienen su control en una carpeta de la factoría.`);
  L.push(`- **Entidades y glosario.** Entidades retiradas (no cuentan): ${cifras.entidadesRetiradas}. Cada término lleva su \`scope\` (PR 7); los verticales viven en el glosario de su proyecto, aparte de los de la casa, y un término horizontal no nombra una entidad vertical (techo 0).`);
  L.push(`- **Tests.** ${cifras.testsEnCasa} tests viven en carpetas de la casa; ${cifras.vigilanVertical} de ellos leen tres ficheros de HoMenu o más (sin contar \`src/App.jsx\`, el ejemplo de casi todos). ${cifras.testsEnProducto} viven en carpetas de producto, coherentes con lo que vigilan.`);
  L.push("");
  L.push("## Los dudosos, con su razón");
  L.push("");
  const capas = [...new Set(dudosos.map((x) => x.capa))];
  for (const capa of capas) {
    const lista = dudosos.filter((x) => x.capa === capa);
    L.push(`### ${TITULOS_DE_CAPA[capa] ?? capa} (${lista.length})`);
    L.push("");
    // Los que comparten razón van en una línea: 25 principios con la misma duda no son 25 dudas distintas.
    const grupos = new Map();
    for (const x of lista) grupos.set(x.razon, [...(grupos.get(x.razon) ?? []), x.id]);
    for (const [razon, ids] of grupos) L.push(`- ${ids.map((i) => `\`${i}\``).join(", ")}: ${razon}${ids.length > 1 ? ` (${ids.length})` : ""}`);
    L.push("");
  }
  L.push("## Propuesta de orden de PR, con cifra de antes y de después");
  L.push("");
  L.push("El orden sigue la dependencia (lo que es registro se separa antes de lo que lo cita) y empieza por el vigilante, para que ninguna cifra suba mientras se trabaja. Cada PR cierra con `Parte de #710`, la cifra de esta tabla recalculada y su juez.");
  L.push("");
  const dudaDe = (c) => dudosos.filter((x) => x.capa === c).length;
  const pr = [
    ["PR 1", "El vigilante primero (punto 7 de #710): test que lee `lado`/`project` de cada registro y falla si una horizontal cita una vertical; techos que solo bajan", "tests de vigilancia de lados = 0", "1 (con los techos de esta tabla)"],
    ["PR 2", "Entidades: cada una de un lado (sin `both`); las vertical genéricas pasan a horizontal; el glosario hereda el lado de su entidad (en el PR 7 pasa a ser un campo propio de cada término)", `entidades en duda = ${dudaDe("entidades")}`, "0"],
    ["PR 3", "Principios: campo `project` y registro `ops/proyectos/homenu/principios/`; mover los verticales y resolver los de base de datos", `verticales fuera de su registro = ${f("principios de la casa").vertical}; en duda = ${f("principios de la casa").duda + f("principios de producto").duda}`, "verticales en su registro = todos; en duda = 0"],
    ["PR 4", "Fuentes: campo `project` en las de la casa que son de HoMenu y origen (decisión o fallo) en vez de fuente externa para los principios de proyecto", `fuentes verticales sin marcar = ${f("fuentes").vertical}; en duda = ${f("fuentes").duda}`, "marcadas = todas; en duda = 0"],
    ["PR 5", "Normas dudosas: mover al registro de HoMenu las que sean suyas, o reescribir (sin nombrar el proyecto) las que sean generales", `normas horizontales en duda = ${f("normas horizontales").duda}`, "0 (cada una, horizontal limpia o vertical)"],
    ["PR 6", "Controles: tests de la casa que leen ficheros de HoMenu pasan a recibirlos por referencia (`--proyecto`) o se mueven (el techo `verticales_sin_salida` ya se retiró, #710)", `tests de la casa que leen HoMenu = ${cifras.vigilanVertical}; en duda = ${f("tests").duda}`, "0 y 0"],
    ["PR 7", "Glosario: campo `scope` propio en cada término, exigido por test; los de proyecto aparte de los de la casa y ningún horizontal nombra una entidad vertical", `términos en duda = ${f("términos").duda}; verticales dentro de la carpeta de la casa = 0`, "0 y 0"],
    ["PR 8", "Skills, reglas, comandos, specs y docs: marcar el lado de cada una y separar los skills de servicio en método (casa) y datos (proyecto)", `en duda = skills ${f("skills").duda}, documentos ${f("documentos").duda}; verticales sin marca = ${f("reglas").vertical + f("specs").vertical + f("skills").vertical}`, "en duda = 0; todas marcadas"],
    ["PR 9", "Factoría frente a HoMenu (#690): CLAUDE.md como índice corto con dos partes; `docs/` y `ops/` separados", `documentos en duda = ${f("documentos").duda}`, "0"],
  ];
  L.push("| PR | Qué hace | Cifra de antes | Cifra objetivo |");
  L.push("|---|---|---|---|");
  for (const p of pr) L.push(`| ${p.join(" | ")} |`);
  L.push("");
  L.push("Los PR 2 a 8 son independientes entre sí salvo por el 1; el 3 y el 4 van seguidos (una fuente de proyecto la cita un principio de proyecto). El 6 depende de #704 (ya fusionado).");
  L.push("");
  L.push("## Dudas de clasificación que solo puede resolver Pablo");
  L.push("");
  L.push("Cada una, con la opción recomendada primero; la respuesta decide cuántos de los dudosos de arriba pasan a un lado u otro.");
  L.push("");
  L.push("1. **Principios de base de datos con origen solo en `docs/datos/PRINCIPIOS.md`. Resuelta por Pablo el 14 oct (opción A):** horizontales, con fuente externa verificada (PostgreSQL, Fowler, Google, HashiCorp…); `docs/datos/` queda como «cómo los aplica HoMenu». Un principio sin fuente que se pueda verificar sigue en duda, dicho.");
  L.push("2. **Lo que solo vale con un bot conversacional. Resuelta por Pablo el 14 oct (opción B):** forma el «paquete de bots», opcional por proyecto (dominio `bot` de `DOMINIOS_OPCIONALES`, `scripts/lib/ambitos.mjs`); sin tercer lado. Un principio del paquete lleva `dominio: bot` y solo lo cita una norma de ámbito `bot`.");
  L.push("3. **Entidades marcadas `both`. Resuelta por Pablo el 14 oct (opción A):** cada entidad es de un lado; la clase es horizontal y sus ejemplares son del proyecto. `both` ya no existe y un test lo rechaza.");
  L.push("4. **Skills de servicio** (hoy en duda: 1password, github, hetzner y tailscale, que están en zona factoría; vercel y supabase ya están en zona producto y cuentan como verticales, pero mezclan igual método y datos del proyecto). A (recomendada): partir cada una en método (casa) y datos del proyecto (ids, bóvedas, repo), que el agente recibe por referencia. B: dejarlos enteros en la casa. C: marcarlos verticales.");
  L.push("5. **Las zonas de `ops/zonas.json` contradicen la regla de los agentes**: `evaluador`, `qa` y `auditor-datos` están en producto. A (recomendada): moverlos a factoría y que lo vertical llegue por referencia. B: dejar la zona y marcar los tres como duda. C: moverlos a un paquete opcional.");
  L.push("");
  L.push("## Qué no mide");
  L.push("");
  L.push("- Las reglas de estándar de cada tarea (`ops/estandares-agentes.json`): son de la línea 1 de #652 (estándares asépticos), con su propia cifra (28 de 162 con lenguaje de proyecto, según el comentario del 13 oct).");
  L.push("- El contenido de dentro de cada skill y documento: se clasifica el fichero entero, no sus párrafos. Una skill de servicio mezcla método y datos del proyecto.");
  L.push("- Ficheros de código (`scripts/`, `.claude/hooks/`, `.github/`): solo cuentan como controles de las normas y como tests.");
  L.push("");
  return L.join("\n");
}
