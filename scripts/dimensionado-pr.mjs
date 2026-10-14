/**
 * dimensionado-pr.mjs — el paso «Dimensionado del PR» de tests.yml (#642, fondo #639): todo PR declara `Tipo:` y
 * `Jueces:`, con los jueces que exige el dimensionado de su diff, y un `Agente:` que encaja con el tipo y no se juzga
 * a sí mismo. La lógica está en scripts/lib/dimensionadoPr.mjs; aquí solo se alimenta y se imprime.
 *
 * Sin red: no consulta la API. Una línea por norma (`norma: <id> resultado: … pr: <n> detalle: …`). Sale con 1 si
 * algo falla y el PR se creó desde FALLA_DESDE; uno creado antes solo avisa (transición) hasta FIN_TRANSICION. Un bot o un PR a main, exentos. Si este
 * script se rompe por dentro, avisa y sale con 0 (`unchecked`): un fallo suyo no pone en rojo los PR de los demás.
 *
 * Alcance: control contra errores y olvidos; el blindaje frente a un PR que cambie el propio control queda para un workflow con
 * el código de la base (pendiente). Este paso ejecuta el código del PR: lo que lee de la base evita equivocarse, no que se esquive.
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… PR_BASE=… PR_NUMBER=… PR_CREADO=… TIPOS_BASE=… NORMAS_BASE=… node scripts/dimensionado-pr.mjs <fichero-con-el-diff>
 * El diff es `git diff -U0` de la base del PR a su cabeza (el mismo fichero que «Normas del PR»).
 * TIPOS_BASE: el fichero con ops/tipos-de-encargo.json de la BASE del PR (`git show HEAD^1:…`). Las banderas de rutas (qué
 * ficheros piden a seguridad o al evaluador) salen de ahí y no del JSON del propio PR: si no, un PR se quitaría su exigencia
 * cambiándolas. Plan B, si no se puede leer: las del PR y, falla cerrado, se exige ADEMÁS a seguridad (JUEZ_SIN_BASE), con un
 * aviso y la línea «salen de este PR (plan B)». Una bandera que la base aún no trae con rutas (base anterior a #642) se queda con
 * la del PR (flagsDeRutasConBase).
 * NORMAS_BASE: el fichero con ops/normas.json de la base. Si una norma admite excepción (`admite_excepcion`) sale de ahí, no del
 * normas.json del PR; si no se puede leer, falla cerrado: ninguna norma del paso admite excepción.
 * El cuerpo va por entorno, nunca interpolado en el YAML (inyección).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { hoyUtc, leerDiff } from "./lib/avisosPr.mjs";
import { FALLA_DESDE, FIN_TRANSICION, comprobarDimensionado, ficherosDeDiff } from "./lib/dimensionadoPr.mjs";
import { lineaDeNorma } from "./lib/medicionNormas.mjs";
import { leerRegistro } from "./lib/normas.mjs";
import { FLAGS, flagsDeRutasConBase } from "./lib/tiposDeEncargo.mjs";

const RAIZ = resolve(fileURLToPath(import.meta.url), "..", "..");
const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

/** Las banderas de la base del PR (el JSON de TIPOS_BASE) o null si no se puede leer: entonces manda el plan B. */
export function flagsDeLaBase(ruta) {
  if (!ruta || !existsSync(ruta)) return null;
  try {
    const flags = JSON.parse(readFileSync(ruta, "utf8"))?.flags;
    return flags && typeof flags === "object" ? flags : null;
  } catch {
    return null; // a propósito: una base ilegible es el plan B (las banderas del PR, con aviso), no un fallo del script
  }
}

/** Las normas de la base del PR (el JSON de NORMAS_BASE) o null si no se puede leer: entonces ninguna admite excepción. */
export function normasDeLaBase(ruta) {
  if (!ruta || !existsSync(ruta)) return null;
  try {
    const normas = JSON.parse(readFileSync(ruta, "utf8"))?.normas;
    return Array.isArray(normas) ? normas : null;
  } catch {
    return null; // a propósito: una base ilegible falla cerrado (ninguna excepción cuenta), no es un fallo del script
  }
}

if (esPrincipal) {
  try {
    const { PR_BODY = "", PR_AUTOR = "", PR_BASE = "", PR_NUMBER = "", PR_CREADO = "" } = process.env;
    const ruta = process.argv[2];
    const ficheros = ruta && existsSync(ruta) ? ficherosDeDiff(leerDiff(readFileSync(ruta, "utf8"))) : null;
    const hoy = /^\d{4}-\d{2}-\d{2}$/.test(process.env.HOY ?? "") ? process.env.HOY : hoyUtc();
    const base = flagsDeLaBase(process.env.TIPOS_BASE);
    const { flags: flagsRutas, deLaBase } = flagsDeRutasConBase(base, FLAGS);
    const normasBase = normasDeLaBase(process.env.NORMAS_BASE);
    const r = comprobarDimensionado({ cuerpo: PR_BODY, autor: PR_AUTOR, base: PR_BASE, ficheros, normas: leerRegistro(RAIZ).normas, hoy, creado: PR_CREADO || null, flagsRutas, baseLegible: Boolean(base), normasBase });
    if (r.exento) {
      console.log(r.porque === "main" ? "Dimensionado: PR a main, exento (lo que lleva ya se juzgó en staging)." : "Dimensionado: PR de un bot, exento.");
      process.exit(0);
    }
    if (!base) console.log("::warning title=Banderas de rutas del propio PR::No he podido leer ops/tipos-de-encargo.json de la base (TIPOS_BASE); las rutas que piden jueces salen del JSON de este PR y se exige además a seguridad (falla cerrado). No es culpa del PR: regístralo como caso del fondo #639.");
    if (!normasBase) console.log("::warning title=Normas de la base ilegibles::No he podido leer ops/normas.json de la base (NORMAS_BASE); ninguna norma del paso admite excepción (falla cerrado). Regístralo como caso del fondo #639.");
    console.log(base ? `Dimensionado: las banderas de rutas salen de la base del PR (${deLaBase.join(", ") || "ninguna con rutas en la base"}).` : "Dimensionado: las banderas de rutas salen de este PR (plan B).");
    for (const m of r.medidas) console.log(lineaDeNorma(m.norma, m.resultado, { pr: PR_NUMBER, detalle: m.detalle }));
    if (r.plan) console.log(`Dimensionado: tipo ${r.plan.tipo} (${r.plan.subtipo}), alcance ${r.plan.alcance}, complejidad ${r.plan.complejidad}; jueces exigidos: ${r.plan.jueces.join(", ")}${r.plan.banderas_de_rutas?.length ? ` (por las rutas, ${r.plan.banderas_de_rutas.join(", ")})` : ""}.`);
    for (const a of r.avisos) console.log(`::warning title=Dimensionado del PR (transición hasta ${FIN_TRANSICION})::${a}. Este PR se creó antes de ${FALLA_DESDE} y solo avisa hasta el ${FIN_TRANSICION}; añade «Tipo:» y «Jueces:» al cuerpo.`);
    if (r.fallos.length) {
      console.log(`::error title=Falla el dimensionado del PR::${r.fallos.join("; ")}.`);
      console.error(`Dimensionado: FALLA. ${r.fallos.join("; ")}. Cómo: «Tipo: <tipo o subtipo>» y «Jueces: <los de npm run dimensionar -- --diff --tipo <tipo>>», ninguno el de «Agente:».`);
      process.exit(1);
    }
    console.log(`Dimensionado: ok${r.avisos.length ? " (con avisos de la transición)" : ""}.`);
  } catch (e) {
    // A propósito: falla abierta. Un fallo de aquí dentro (un catálogo de staging que el dimensionador no entiende)
    // pondría en rojo el check obligatorio de TODOS los PR; se ve como aviso y su línea sale `unchecked`.
    console.log(`::warning title=No he podido comprobar el dimensionado::${String(e?.message ?? e).split("\n")[0]}. No es culpa del PR: regístralo como caso del fondo #639.`);
    console.log(lineaDeNorma("pr-tipo-y-jueces-exigidos", "unchecked", { pr: process.env.PR_NUMBER, detalle: "error-del-script" }));
    process.exit(0);
  }
}
