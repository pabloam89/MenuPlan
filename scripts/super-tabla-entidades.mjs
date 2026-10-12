/**
 * Genera la tabla de docs/entidades/SUPER-TABLA.md (entre los marcadores `super-tabla:inicio` y
 * `super-tabla:fin`) a partir de ops/entidades.json y de la propuesta de abajo.
 *
 * Qué es de dónde: id, nombre, eje de hoy, fuente y registro salen de ops/entidades.json; «depende
 * de» sale de sus relaciones. Lo que el registro aún no guarda (familia, nivel, ámbito propuesto,
 * quién la crea, quién la lee) es PROPUESTA y vive aquí, en `PROPUESTA`, hasta que Pablo decida
 * (docs/entidades/SUPER-TABLA.md, decisiones). Si se aprueba, pasa a ops/entidades.json y esta
 * constante desaparece.
 *
 * Uso: node scripts/super-tabla-entidades.mjs           -> imprime el bloque
 *      node scripts/super-tabla-entidades.mjs --escribir -> lo pone en el .md
 * Lo vigila ops/super-tabla.test.js (el .md no se edita a mano en ese bloque).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Nivel de las PIEZAS de una familia: meta (N0), template (N1), piece (N2). */
export const LEVELS = {
  meta: "N0: lo que hace buena una pieza de la familia (leyes, principios, forja)",
  template: "N1: plantilla por tipo o estilo, de la que salen las piezas",
  piece: "N2: la pieza concreta",
};
/** Contención propuesta: horizontal (sus piezas nunca llevan proyecto), vertical (siempre) o both (opcional: cada pieza declara su `project` o ninguno). */
export const SCOPES = {
  horizontal: "Factoría: sus piezas no cuelgan de ningún proyecto",
  vertical: "Sus piezas cuelgan siempre de un proyecto (HoMenu hoy)",
  both: "Hay piezas de factoría y de proyecto; cada pieza declara su project o ninguna",
};
export const FAMILIES = {
  work: "Cómo se trabaja: sesión, rama, PR, issues, fondos, encargos",
  access: "Quién y con qué cuenta: equipo, identidad, servicios, claves, bóvedas",
  rules: "Lo que hace buena una pieza: principios, normas, reglas, mecanismos, vocabularios",
  agents: "Quién hace y quién juzga: agentes, jueces, skills, hooks",
  measure: "Lo que se mide: eventos, métricas, evals",
  delivery: "Cómo llega el código a producción: entornos, despliegues, migraciones",
  data: "Cómo se ordenan los datos del producto: tablas, fuentes, módulos",
  home: "La casa y su gente",
  food: "Comida: recetas, ingredientes, menús, despensa, compra",
  lola: "La conversación con Lola",
};

/** [id, familia, nivel, ámbito propuesto, quién la crea, quién la lee]. Creador y lector: «Creo» salvo que la fuente lo diga. */
const PROPUESTA = [
  ["session", "work", "piece", "horizontal", "npm run tarea y el arranque", "guardia, avisos, eventos.jsonl"],
  ["team-member", "access", "piece", "horizontal", "Pablo (a mano, en prosa)", "nadie por máquina: decision.assigned_to lo nombra en GitHub"],
  ["identity", "access", "piece", "horizontal", "Pablo (alta de App o cuenta)", "scripts/lib/tokenSesion.mjs, arranque"],
  ["service", "access", "piece", "both", "Pablo (alta de cuenta)", "ops/INVENTARIO.md, skills de servicio"],
  ["environment", "delivery", "piece", "both", "gobierno / Vercel", "salud-despliegue, apply-migration"],
  ["deployment", "delivery", "piece", "vertical", "Vercel al empujar una rama", "salud-despliegue, qa"],
  ["event", "measure", "piece", "both", "hooks y scripts (proceso); la app y Lola (producto, user_events)", "metricas.json (proceso); embudo y evals (producto)"],
  ["norm", "rules", "meta", "both", "gobierno, con juez", "ops/normas.test.js, estándares, revisor"],
  ["learning", "work", "piece", "horizontal", "quien cierra el fondo (a mano)", "nadie: recorded_in no se escribe en ningún sitio"],
  ["mechanism", "rules", "template", "horizontal", "gobierno", "plan-de-arreglo, encargo.mecanismo, escalas.mjs; ninguna norma lo cita por id (usa ejecutor)"],
  ["metric", "measure", "piece", "both", "gobierno (proceso); cada módulo (producto)", "cumplimiento.mjs, informe semanal; MODULOS.json"],
  ["eval", "measure", "piece", "both", "lola y evaluador (Lola); forja (skills)", "bot-evals.mjs, skills-prueba"],
  ["judge", "agents", "piece", "horizontal", "gobierno (ficha en .claude/agents)", "orquestar, presupuestos, flujo"],
  ["secret", "access", "piece", "both", "Pablo (alta-de-secreto)", "ops/recursos.json, scripts/lib/env.mjs"],
  ["vault", "access", "piece", "horizontal", "Pablo", "ops/recursos.json, ops/env.1password"],
  ["agent", "agents", "piece", "both", "gobierno", "agentes.test.js, orquestar"],
  ["skill", "agents", "piece", "both", "forja-de-skills", "skills.test.js, hooks de skill"],
  ["rule", "rules", "meta", "both", "gobierno", "Claude Code (reglas por carpeta)"],
  ["hook", "agents", "piece", "horizontal", "gobierno", "Claude Code (settings.json)"],
  ["issue", "work", "piece", "both", "npm run issues -- --nuevo", "issues.mjs, arranque, informes"],
  ["root-problem", "work", "piece", "both", "quien diagnostica el caso", "fondos.mjs, workflow fondos"],
  ["case", "work", "piece", "both", "quien detecta el fallo", "PR (Casos:), fondos.mjs"],
  ["assignment", "work", "piece", "both", "plan-de-arreglo / orquestar", "tipos-de-encargo, panel"],
  ["decision", "work", "piece", "both", "cualquier sesión (issue); Pablo (DECISIONES.md)", "pendientes.mjs, Pablo"],
  ["pull-request", "work", "piece", "both", "la sesión", "guardia, CI, revisor"],
  ["branch", "work", "piece", "both", "npm run tarea", "guardia, deployment"],
  ["migration", "delivery", "piece", "vertical", "datos", "apply-migration, verificar-estado, ESTADO.md"],
  ["table", "data", "piece", "vertical", "una migración", "MODULOS.json, cableado.test.js, el código del módulo dueño"],
  ["data-source", "data", "piece", "vertical", "datos / catálogo", "src/data/model.js, fuentes.test.js, la app"],
  ["module", "data", "piece", "vertical", "datos (MODULOS.json)", "modulos.test.js, panel"],
  ["vocabulary", "rules", "piece", "both", "quien crea el CHECK o la constante", "vocabularios-vida.test.js, el código que valida"],
  ["principle", "rules", "meta", "both", "gobierno (proceso); producto (principios de producto)", "normas, skill principios-de-producto"],
  ["household", "home", "piece", "vertical", "la app al registrarse", "toda tabla con household_id"],
  ["person", "home", "piece", "vertical", "la familia", "menús, alergias, Lola"],
  ["channel-identity", "home", "piece", "vertical", "el enlace con Telegram", "api/bot"],
  ["recipe", "food", "piece", "vertical", "catálogo JSON o la familia", "menús, Lola"],
  ["ingredient", "food", "piece", "vertical", "catálogo JSON", "recetas, despensa, lista"],
  ["menu", "food", "piece", "vertical", "el generador o la familia", "lista de la compra, Lola"],
  ["pantry", "food", "piece", "vertical", "la familia", "lista de la compra, menús"],
  ["shopping-list", "food", "piece", "vertical", "se calcula del menú", "la familia, Lola"],
  ["lola-conversation", "lola", "piece", "vertical", "Lola", "bot-evals, retención"],
];

const DEP = ["belongs_to", "is_a", "hangs_from", "depends_on", "lives_in", "comes_from", "works_in", "happens_in", "applied_in"];

export function cargar() {
  const datos = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8"));
  return datos;
}
export const PROPUESTA_IDS = PROPUESTA.map((p) => p[0]);
export const PROPUESTA_FILAS = PROPUESTA;

export function bloque(datos = cargar()) {
  const por = new Map(datos.entities.map((e) => [e.id, e]));
  const filas = [
    "| id | familia | nivel | eje hoy | contención propuesta | quién la crea | dónde vive (registro) | quién la lee | depende de |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const [id, fam, nivel, ambito, crea, lee] of PROPUESTA) {
    const e = por.get(id);
    if (!e) continue;
    const deps = datos.relations.filter((r) => r.from === id && DEP.includes(r.relation)).map((r) => `${r.to}`);
    const vive = e.source_of_truth === "none" ? `ninguno (${e.registry})` : `\`${e.source_of_truth}\` (${e.registry})`;
    filas.push(`| \`${id}\` | ${fam} | ${nivel} | ${e.axis} | ${ambito} | ${crea} | ${vive} | ${lee} | ${deps.length ? deps.join(", ") : "—"} |`);
  }
  const cuenta = (campo, i) => {
    const c = {};
    for (const p of PROPUESTA) c[p[i]] = (c[p[i]] || 0) + 1;
    return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(", ");
  };
  filas.push("", `Cifras: ${PROPUESTA.length} entidades. Nivel: ${cuenta("nivel", 2)}. Contención propuesta: ${cuenta("ambito", 3)}. Familias: ${cuenta("familia", 1)}.`);
  return filas.join("\n");
}

export const INICIO = "<!-- super-tabla:inicio -->";
export const FIN = "<!-- super-tabla:fin -->";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const b = bloque();
  if (process.argv.includes("--escribir")) {
    const ruta = join(RAIZ, "docs/entidades/SUPER-TABLA.md");
    const md = readFileSync(ruta, "utf8");
    const i = md.indexOf(INICIO);
    const f = md.indexOf(FIN);
    if (i < 0 || f < 0) throw new Error("faltan los marcadores super-tabla en SUPER-TABLA.md");
    writeFileSync(ruta, `${md.slice(0, i + INICIO.length)}\n${b}\n${md.slice(f)}`);
    console.log("SUPER-TABLA.md al día");
  } else console.log(b);
}
