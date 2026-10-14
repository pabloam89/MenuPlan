/**
 * dimensionado-pr.mjs — el paso «Dimensionado del PR» de tests.yml (#642, fondo #639): todo PR declara `Tipo:` y
 * `Jueces:`, con los jueces que exige el dimensionado de su diff, y un `Agente:` que encaja con el tipo y no se juzga
 * a sí mismo. La lógica está en scripts/lib/dimensionadoPr.mjs; aquí solo se alimenta y se imprime.
 *
 * Sin red: no consulta la API. Una línea por norma (`norma: <id> resultado: … pr: <n> detalle: …`). Sale con 1 si
 * algo falla y el PR se creó desde FALLA_DESDE; uno creado antes solo avisa (transición). Un bot, exento. Si este
 * script se rompe por dentro, avisa y sale con 0 (`unchecked`): un fallo suyo no pone en rojo los PR de los demás.
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… PR_NUMBER=… PR_CREADO=… node scripts/dimensionado-pr.mjs <fichero-con-el-diff>
 * El diff es `git diff -U0` de la base del PR a su cabeza (el mismo fichero que «Normas del PR»).
 * El cuerpo va por entorno, nunca interpolado en el YAML (inyección).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { hoyUtc, leerDiff } from "./lib/avisosPr.mjs";
import { FALLA_DESDE, comprobarDimensionado, ficherosDeDiff } from "./lib/dimensionadoPr.mjs";
import { lineaDeNorma } from "./lib/medicionNormas.mjs";
import { leerRegistro } from "./lib/normas.mjs";

const RAIZ = resolve(fileURLToPath(import.meta.url), "..", "..");
const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  try {
    const { PR_BODY = "", PR_AUTOR = "", PR_NUMBER = "", PR_CREADO = "" } = process.env;
    const ruta = process.argv[2];
    const ficheros = ruta && existsSync(ruta) ? ficherosDeDiff(leerDiff(readFileSync(ruta, "utf8"))) : null;
    const hoy = /^\d{4}-\d{2}-\d{2}$/.test(process.env.HOY ?? "") ? process.env.HOY : hoyUtc();
    const r = comprobarDimensionado({ cuerpo: PR_BODY, autor: PR_AUTOR, ficheros, normas: leerRegistro(RAIZ).normas, hoy, creado: PR_CREADO || null });
    if (r.exento) {
      console.log("Dimensionado: PR de un bot, exento.");
      process.exit(0);
    }
    for (const m of r.medidas) console.log(lineaDeNorma(m.norma, m.resultado, { pr: PR_NUMBER, detalle: m.detalle }));
    if (r.plan) console.log(`Dimensionado: tipo ${r.plan.tipo} (${r.plan.subtipo}), alcance ${r.plan.alcance}, complejidad ${r.plan.complejidad}; jueces exigidos: ${r.plan.jueces.join(", ")}.`);
    for (const a of r.avisos) console.log(`::warning title=Dimensionado del PR (transición hasta ${FALLA_DESDE})::${a}. Este PR se creó antes de ${FALLA_DESDE} y solo avisa; añade «Tipo:» y «Jueces:» al cuerpo.`);
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
