/**
 * runbook-pr.mjs — comprueba la línea «Runbook:» de un PR (paso de tests.yml).
 *
 * Las skills (.claude/skills/) solo se rellenan si alguien se acuerda. Cada PR
 * que toca ficheros de un dominio con skill (el mapa:
 * .claude/dominios-skills.json) tiene que decir en su cuerpo una de dos:
 *
 *   Runbook: actualizado (skill <nombre>)   ← y el PR toca esa skill de verdad
 *   Runbook: sin novedades                  ← no ha aprendido nada; el revisor decide si es cierto
 *
 * Un PR que no toca ningún dominio no necesita la línea. Nunca fallan por esto:
 * los PR de Dependabot y de bots, ni (porque este paso solo corre en
 * pull_request) los push a staging como el del cron de Mercadona.
 *
 * Uso (lo lanza el CI):  PR_BODY=… PR_AUTOR=… PR_RAMA=… node scripts/runbook-pr.mjs <lista-de-ficheros>
 * La lista es un fichero con una ruta por línea; el cuerpo va por entorno y
 * nunca por la línea de comandos ni interpolado en el YAML (inyección).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { cargarMapa, ficherosDe, skillsDeFicheros } from "../.claude/hooks/dominios.mjs";

const BOTS = new Set(["dependabot[bot]", "github-actions[bot]"]);

/**
 * Las líneas «Runbook:» del cuerpo, todas. Antes de buscar se quitan los
 * comentarios HTML (la plantilla explica las dos respuestas) y los bloques de
 * código (``` o ~~~, aunque no se cierren): una línea de ejemplo no es la
 * respuesta. Y TODAS tienen que valer: con que una valga, otra rota o vacía
 * colaba.
 * {valida, valores:["sin novedades" | "actualizado:<skill>", …]} o {valida:false, motivo}.
 */
export function analizarRunbook(cuerpo) {
  const texto = String(cuerpo ?? "")
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|$(?![\s\S]))/gm, "");
  const lineas = [...texto.matchAll(/^[ \t>*-]*(?:\*\*)?Runbook(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(.*)$/gim)].map((m) => m[1].trim());
  if (!lineas.length) return { valida: false, motivo: "Falta la línea «Runbook:» en el cuerpo del PR." };
  const valores = [];
  for (const crudo of lineas) {
    if (!crudo) return { valida: false, motivo: "La línea «Runbook:» está vacía." };
    const v = crudo.replace(/\.$/, "").trim().toLowerCase();
    const act = v.match(/^actualizado\s*\(\s*skill\s+([\w-]+)\s*\)$/)?.[1];
    if (v === "sin novedades") valores.push("sin novedades");
    else if (act) valores.push(`actualizado:${act}`);
    else return { valida: false, motivo: `«Runbook: ${crudo}» no vale: tiene que ser «actualizado (skill <nombre>)» o «sin novedades».` };
  }
  return { valida: true, valores };
}

/** Lo mismo con un solo valor (el primero): {valida, valor} o {valida:false, motivo}. */
export function lineaRunbook(cuerpo) {
  const r = analizarRunbook(cuerpo);
  return r.valida ? { valida: true, valor: r.valores[0] } : r;
}

/**
 * Decide si el PR cumple. `mapa` null (no se pudo leer) deja pasar: un check
 * obligatorio que se rompe solo por no poder leer su configuración bloquearía
 * todos los PR.
 */
export function comprobar({ mapa, cuerpo, ficheros = [], autor = "", rama = "" }) {
  if (!mapa) return { ok: true, dominios: [], motivo: "Sin mapa de dominios: no se comprueba." };
  // Solo por el autor, que GitHub no deja falsear. La rama la pone quien abre
  // el PR: una rama «dependabot/…» de una persona no la exime.
  if (BOTS.has(String(autor).toLowerCase())) {
    return { ok: true, dominios: [], motivo: "PR de un bot: exento." };
  }
  const dominios = skillsDeFicheros(ficheros, mapa);
  if (!dominios.length) return { ok: true, dominios, motivo: "No toca ningún dominio con skill." };

  const donde = dominios
    .map((s) => `${s} (${ficherosDe(s, ficheros, mapa).slice(0, 3).join(", ")})`)
    .join("; ");
  const ayuda =
    "Añade al cuerpo del PR una línea «Runbook: actualizado (skill <nombre>)» si has actualizado el runbook " +
    "de `.claude/skills/<nombre>/`, o «Runbook: sin novedades» si no has aprendido nada nuevo.";
  const linea = analizarRunbook(cuerpo);
  if (!linea.valida) return { ok: false, dominios, motivo: `${linea.motivo} Este PR toca ${donde}. ${ayuda}` };

  for (const act of linea.valores.map((v) => v.match(/^actualizado:(.+)$/)?.[1]).filter(Boolean)) {
    const conocidas = new Set([...Object.keys(mapa.skills), ...Object.keys(mapa.exentas ?? {})]);
    if (!conocidas.has(act)) {
      return { ok: false, dominios, motivo: `«Runbook: actualizado (skill ${act})»: no existe esa skill (hay: ${[...conocidas].join(", ")}).` };
    }
    const tocada = ficheros.some((f) => String(f).replace(/\\/g, "/").startsWith(`.claude/skills/${act}/`));
    if (!tocada) {
      return {
        ok: false,
        dominios,
        motivo:
          `Dices «actualizado (skill ${act})», pero el PR no toca .claude/skills/${act}/. Este PR toca ${donde}. ` +
          "O actualiza el runbook en este mismo PR, o pon «Runbook: sin novedades».",
      };
    }
  }
  return { ok: true, dominios, motivo: `Runbook: ${linea.valores.join(", ")}` };
}

// ── Entrada desde el CI ────────────────────────────────────────────────────

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
  const lista = process.argv[2];
  const ficheros = lista ? readFileSync(lista, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  const r = comprobar({
    mapa: cargarMapa(raiz),
    cuerpo: process.env.PR_BODY ?? "",
    ficheros,
    autor: process.env.PR_AUTOR ?? "",
    rama: process.env.PR_RAMA ?? "",
  });
  if (r.ok) {
    console.log(`Runbook: ok. ${r.motivo}`);
  } else {
    // Una sola línea para la anotación de GitHub, y el detalle en el log.
    console.log(`::error title=Falta la línea «Runbook:» del PR::${r.motivo}`);
    console.error(`Runbook: FALLA. ${r.motivo}`);
    process.exit(1);
  }
}
