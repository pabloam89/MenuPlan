/**
 * normas-pr.mjs — las frases normativas nuevas de un PR (paso de tests.yml, #296).
 *
 * Mira solo las líneas AÑADIDAS por el PR en CLAUDE.md, .claude/{rules,skills,
 * agents,commands}, PRINCIPIOS y ops/*.md. Cada «nunca», «siempre», «tope»,
 * «máximo», «obligatorio», «exige» u «OK de Pablo» nuevo cita la norma que
 * enuncia (`<!-- norma:<id> -->`, de ops/normas.json) o el PR dice en su
 * cuerpo «Normas: sin novedades — <motivo>», que queda autodeclarado y se
 * puede contar. Borrar o mover frases no cuenta. Exentos los PR de bots.
 *
 * Uso (lo lanza el CI):  PR_BODY=… PR_AUTOR=… node scripts/normas-pr.mjs <fichero-con-el-diff>
 * El diff es `git diff -U0` de la base del PR a su cabeza. El cuerpo va por
 * entorno, nunca interpolado en el YAML (inyección).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comprobarNormasPr, leerRegistro } from "./lib/normas.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ids = new Set(leerRegistro(raiz).normas.map((n) => n.id));
const diff = process.argv[2] ? readFileSync(process.argv[2], "utf8") : "";
const r = comprobarNormasPr({ diff, cuerpo: process.env.PR_BODY ?? "", autor: process.env.PR_AUTOR ?? "", ids });
if (r.ok) {
  console.log(`Normas: ok. ${r.motivo}`);
} else {
  console.log(`::error title=Frase normativa sin norma::${r.motivo}`);
  for (const s of r.sueltas) console.error(`  ${s.ruta}:${s.linea} «${s.palabras.join("», «")}»`);
  console.error(`Normas: FALLA. ${r.motivo}`);
  process.exit(1);
}
