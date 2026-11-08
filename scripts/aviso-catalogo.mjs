/**
 * Avisa al grupo de avisos si el catálogo de Mercadona no se ha actualizado:
 * el cron del lunes ha fallado, o su PR sigue sin entrar al día siguiente.
 * El 2 nov un PR en rojo se quedó parado cuatro días sin que nadie lo viera.
 *
 * Lo lanza el job `avisar` de .github/workflows/mercadona-sync.yml.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { enviarAviso } from "./vigia.mjs";

/** Con este prefijo abre el cron su rama; un test lo ata al workflow. */
export const PREFIJO_RAMA = "datos/mercadona-semanal";

/**
 * @param {{ resultado: string, atascados: { number: number, url: string }[], urlRun: string }} d
 *   `resultado`, el del job `sync`; `skipped` es la pasada del martes.
 * @returns {string|null} el texto del aviso, o null si no hay nada que decir
 */
export function textoDeAviso({ resultado, atascados, urlRun }) {
  if (resultado === "failure" || resultado === "cancelled") {
    return `Catálogo de Mercadona: el cron no ha terminado (${resultado}). Los precios siguen siendo los de antes. ${urlRun}`;
  }
  if (resultado === "skipped" && atascados.length) {
    return `Catálogo de Mercadona: su PR sigue sin entrar. ${atascados.map((p) => p.url).join(" ")}`;
  }
  return null;
}

function prsAtascados() {
  const salida = execFileSync(
    "gh",
    ["pr", "list", "--state", "open", "--base", "staging", "--search", `head:${PREFIJO_RAMA}`, "--json", "number,url"],
    { encoding: "utf8" },
  );
  return JSON.parse(salida);
}

async function main() {
  const resultado = process.env.RESULTADO_SYNC;
  if (!resultado) throw new Error("falta RESULTADO_SYNC");
  const atascados = resultado === "skipped" ? prsAtascados() : [];
  const texto = textoDeAviso({ resultado, atascados, urlRun: process.env.RUN_URL ?? "" });
  if (!texto) {
    console.log(`aviso-catalogo: nada que avisar (${resultado})`);
    return;
  }
  console.log(texto);
  const r = await enviarAviso(texto, {
    token: process.env.AVISOS_TELEGRAM_TOKEN,
    chat: process.env.AVISOS_TELEGRAM_CHAT,
  });
  if (!r.enviado) throw new Error(`aviso sin entregar: ${r.motivo}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(`aviso-catalogo: ${e.message}`);
    process.exitCode = 1;
  });
}
