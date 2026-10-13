/**
 * Genera, de ops/entidades.json, las dos vistas del registro de entidades (#652):
 *   - docs/entidades/MAPA.md entero;
 *   - la tabla de docs/entidades/SUPER-TABLA.md (entre los marcadores `super-tabla:inicio` y `super-tabla:fin`).
 * Ninguna se edita a mano: lo comprueba ops/entidades.test.js. Antes la propuesta de familia, nivel, ámbito,
 * quién crea y quién lee vivía en un script (super-tabla-entidades.mjs); ahora es dato del registro.
 *
 * Uso: node scripts/mapa-entidades.mjs            -> enseña las cifras
 *      node scripts/mapa-entidades.mjs --escribir -> reescribe MAPA.md y el bloque de SUPER-TABLA.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { esPuente } from "./lib/entidades.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const INICIO = "<!-- super-tabla:inicio -->";
export const FIN = "<!-- super-tabla:fin -->";

export function cargar(raiz = RAIZ) {
  return JSON.parse(readFileSync(join(raiz, "ops/entidades.json"), "utf8"));
}

const activas = (d) => d.entities.filter((e) => e.status === "active");
const cuenta = (lista, f) => {
  const c = {};
  for (const x of lista) c[f(x)] = (c[f(x)] || 0) + 1;
  return c;
};
const texto = (c) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(", ");
const vive = (e) => (e.source_of_truth === "none" ? `ninguno (${e.registry})` : `\`${e.source_of_truth}\` (${e.registry})`);
const n = (id) => id.replaceAll("-", "_");
/** Las entidades de las que depende una entidad: sus destinos part_of, is_a y parent_of (el hijo apunta al padre). */
const dependeDe = (d, id) => d.relations.filter((r) => r.from === id && r.class !== "reference" && r.to !== id).map((r) => r.to);

/** La línea de cifras: la misma en MAPA.md y en SUPER-TABLA.md, y la que lee el test. */
export function cifras(d) {
  const a = activas(d);
  const c = cuenta(a, (e) => e.scope);
  return {
    total: a.length,
    horizontal: c.horizontal ?? 0,
    vertical: c.vertical ?? 0,
    both: c.both ?? 0,
    niveles: texto(cuenta(a, (e) => e.level)),
    familias: texto(cuenta(a, (e) => e.family)),
    clases: texto(cuenta(d.relations, (r) => r.class)),
    relaciones: d.relations.length,
  };
}

export function bloque(d = cargar()) {
  const f = [
    "| id | familia | nivel | alcance | puente | quién la crea | dónde vive (registro) | quién la lee | parte de, tipo de o hijo de |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const e of activas(d)) {
    const deps = dependeDe(d, e.id);
    f.push(`| \`${e.id}\` | ${e.family} | ${e.level} | ${e.scope} | ${esPuente(e) ? "sí" : "no"} | ${e.created_by.join(", ")} | ${vive(e)} | ${e.readers.length ? e.readers.join(", ") : "nadie"} | ${deps.length ? [...new Set(deps)].join(", ") : "—"} |`);
  }
  const k = cifras(d);
  f.push("", `Cifras: ${k.total} entidades. Alcance: horizontal ${k.horizontal}, vertical ${k.vertical}, both ${k.both}. Nivel: ${k.niveles}. Familias: ${k.familias}. Relaciones: ${k.relaciones} (${k.clases}).`);
  return f.join("\n");
}

const celda = (s) => String(s ?? "").replaceAll("|", "\\|");

function tablaDeEntidades(lista) {
  const f = ["| id | Nombre | Alcance | Nivel | Familia | Término del glosario | Fuente hoy | Registro |", "|---|---|---|---|---|---|---|---|"];
  for (const e of lista) f.push(`| \`${e.id}\` | ${e.name} | ${e.scope} | ${e.level} | ${e.family} | ${e.term ?? "—"} | ${e.source_of_truth === "none" ? "ninguna" : `\`${e.source_of_truth}\``} | ${e.registry} |`);
  return f.join("\n");
}

export function mapa(d = cargar()) {
  const a = activas(d);
  const k = cifras(d);
  const L = [];
  L.push(
    "# Mapa de entidades",
    "",
    "Este mapa lo **genera** `node scripts/mapa-entidades.mjs --escribir` de `ops/entidades.json`; no se edita a mano y",
    "`ops/entidades.test.js` falla si no coincide con el dato. Los principios que rigen el registro, en",
    "[N0-principios.md](N0-principios.md); el análisis que lo sostiene, en [SUPER-TABLA.md](SUPER-TABLA.md). La definición de cada",
    "entidad no está aquí: vive en el glosario (`ops/glosario/terminos/`), en la ficha del término de la columna «Término del glosario».",
    "",
    "Una **entidad** es una cosa con id estable y definición propia. Cada una dice tres cosas de sus piezas:",
    "",
    "- **alcance** (`scope`): `horizontal` si sus piezas son de la factoría (cómo trabajamos), `vertical` si cuelgan siempre de un proyecto",
    "  (el producto HoMenu hoy) y `both` si las hay de las dos clases, y cada pieza declara su proyecto o ninguno;",
    "- **nivel** (`level`): `meta` (lo que hace buena una pieza de la familia), `template` (la plantilla de la que salen) o `piece` (la pieza);",
    "- **familia** (`family`): para agrupar al leer; no es un eje.",
    "",
    "Un **puente** ya no es un valor: es una entidad de alcance `both`, y se calcula. Las relaciones llevan clase (`is_a`, `part_of`,",
    "`parent_of` o `reference`) y cardinalidad. La contención va de la factoría al proyecto y de este al entorno (`part_of`).",
    "Los ids van en inglés (decisión de Pablo del 11 oct 2026); los nombres y las notas, en castellano.",
    "",
    `Hoy hay ${k.total} entidades activas: ${k.horizontal} horizontales, ${k.vertical} verticales y ${k.both} de los dos lados (puentes).`,
    `Las relaciones son ${k.relaciones}: ${k.clases}.`,
    "",
  );
  for (const [titulo, scope, intro] of [
    ["Horizontales: la factoría", "horizontal", "Sus piezas no cuelgan de ningún proyecto."],
    ["Verticales: el producto", "vertical", "Sus piezas cuelgan siempre de un proyecto. Las de la familia `home`, `food` y `lola` están solo en el registro: no tienen más migraciones ni datos de familias que los que ya existen."],
    ["Puentes: de los dos lados", "both", "Sirven a la factoría y a un proyecto, y cada una dice qué es a cada lado. El alcance se decide por a quién sirve la pieza, no por dónde está el fichero: que todo viva hoy en el repo de HoMenu no hace a nadie both."],
  ]) {
    L.push(`## ${titulo}`, "", intro, "", tablaDeEntidades(a.filter((e) => e.scope === scope)), "");
    if (scope === "both") {
      const conRol = a.filter((e) => e.scope === "both");
      L.push("Qué es cada puente a cada lado:", "", ...conRol.map((e) => `- **${e.id}**: ${e.role_by_scope}`), "");
    }
  }
  L.push("## Proyectos", "", "La factoría es la raíz implícita: una pieza sin proyecto cuelga de ella.", "", "| id | Nombre | Repositorios | Nota |", "|---|---|---|---|");
  for (const p of d.projects) L.push(`| \`${p.id}\` | ${p.name} | ${p.repos.map((r) => `\`${r}\``).join(", ")} | ${celda(p.note)} |`);
  L.push("");
  const estructurales = d.relations.filter((r) => r.class !== "reference");
  L.push("## Estructura: tipo de, parte de, hijo de", "", "Las flechas van de la pieza al todo, al tipo o al padre (el hijo apunta a su padre).", "", "```mermaid", "flowchart LR");
  for (const r of estructurales) L.push(`    ${n(r.from)} -->|${r.class}${r.parent_kind ? `:${r.parent_kind}` : ""}| ${n(r.to)}`);
  L.push("```", "");
  for (const cls of ["is_a", "part_of", "parent_of", "reference"]) {
    const rs = d.relations.filter((r) => r.class === cls);
    L.push(`## Relaciones ${cls} (${rs.length})`, "", "| de | verbo | a | cardinalidad | cómo se guarda |", "|---|---|---|---|---|");
    for (const r of rs) {
      const como = r.stored_as === "none" ? `ningún campo${r.stored_in ? `: ${r.stored_in}` : ""}` : r.stored_as === "unaudited" ? "sin auditar" : `${r.stored_as}: ${r.stored_in}`;
      L.push(`| \`${r.from}\` | ${r.relation}${r.parent_kind ? ` (${r.parent_kind})` : ""} | \`${r.to}\` | ${r.cardinality} | ${celda(como)} |`);
    }
    L.push("");
  }
  L.push("## Tipos de evento", "", "Lo que antes era una entidad o un hueco y es un tipo de `event`, con su motivo cerrado.", "", "| id | de | campos | quién lo lee |", "|---|---|---|---|");
  for (const t of d.event_types) L.push(`| \`${t.id}\` | \`${t.of}\` | ${t.fields.map((c) => `${c.name} (${c.values.join(", ")})`).join("; ")} | ${t.readers.length ? t.readers.join(", ") : "nadie"} |`);
  L.push("");
  return L.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const d = cargar();
  if (process.argv.includes("--escribir")) {
    writeFileSync(join(RAIZ, "docs/entidades/MAPA.md"), mapa(d));
    const ruta = join(RAIZ, "docs/entidades/SUPER-TABLA.md");
    const md = readFileSync(ruta, "utf8");
    const i = md.indexOf(INICIO);
    const f = md.indexOf(FIN);
    if (i < 0 || f < 0) throw new Error("faltan los marcadores super-tabla en SUPER-TABLA.md");
    writeFileSync(ruta, `${md.slice(0, i + INICIO.length)}\n${bloque(d)}\n${md.slice(f)}`);
    console.log("MAPA.md y SUPER-TABLA.md al día");
  } else console.log(cifras(d));
}
