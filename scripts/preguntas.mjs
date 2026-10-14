// preguntas.mjs — qué se le pregunta al dueño del proyecto y qué queda autorizado (#690).
//
//   npm run preguntas                       la lista del proyecto, con la norma que hace cumplir cada entrada
//   npm run preguntas -- --proyecto <id>    la de otro proyecto (por defecto, el de esta carpeta)
//   npm run preguntas -- --json             lo mismo para máquinas
//   npm run preguntas -- --escribir         regenera la sección «Qué se le pregunta a …» de CLAUDE.md
//
// Fuente única: ops/proyectos/<id>/preguntas.json. ops/preguntas.test.js comprueba el registro y la sección.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarNormas } from "./lib/normas.mjs";
import { TIPOS_DE_ENTRADA, escribirSeccion, leerPreguntas, problemasDePreguntas, rutaPreguntas } from "./lib/preguntas.mjs";
import { PROYECTO_POR_DEFECTO } from "./lib/zonasProyecto.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const i = args.indexOf("--proyecto");
const id = i >= 0 ? args[i + 1] : PROYECTO_POR_DEFECTO;

const datos = leerPreguntas(RAIZ, id);
if (!datos) {
  console.error(`El proyecto «${id}» no tiene ${rutaPreguntas(id)}.`);
  process.exit(1);
}
const problemas = problemasDePreguntas(datos, id, new Set(cargarNormas(RAIZ).todas.map((n) => n.id)));
if (problemas.length) {
  console.error(`${rutaPreguntas(id)} tiene ${problemas.length} problema(s):\n${problemas.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

if (args.includes("--escribir")) {
  if (id !== PROYECTO_POR_DEFECTO) {
    console.error(`CLAUDE.md es del proyecto «${PROYECTO_POR_DEFECTO}»: --escribir no va con --proyecto ${id}.`);
    process.exit(1);
  }
  console.log(escribirSeccion(RAIZ, datos) ? "Sección de CLAUDE.md regenerada." : "CLAUDE.md ya estaba al día.");
} else if (args.includes("--json")) {
  console.log(JSON.stringify(datos.entradas, null, 2));
} else {
  console.log(`A ${datos.pregunta_a} (${rutaPreguntas(id)}):\n`);
  for (const tipo of Object.keys(TIPOS_DE_ENTRADA)) {
    console.log(`${tipo}:`);
    for (const e of datos.entradas.filter((x) => x.tipo === tipo)) {
      console.log(`  ${e.id.padEnd(30)} ${e.norma ?? "(sin norma)"}`);
    }
  }
}
