/**
 * Espera a que acabe el CI de un PR gastando REST, no GraphQL (#424).
 *
 *   npm run espera-ci -- <pr> [--cada 60] [--tope 20]
 *
 * `gh pr checks --watch` pide a GraphQL en cada vuelta, y el cupo GraphQL
 * (5.000 puntos por hora) NO sale en `gh api rate_limit`: se agotó el 10 oct 2026
 * con varias sesiones esperando a la vez. Aquí cada vuelta es una llamada REST
 * (cupo `core`, aparte) a los check-runs del último commit del PR.
 *
 * Sale con 0 si todo pasa, 1 si algo falla o se acaba el tope, 2 si el uso es malo.
 * Una línea por cambio de estado, sin ruido: `ci pr: N estado: pendiente|ok|falla`.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { registrarGh } from "./lib/cuotaGh.mjs";

/** Resume los check-runs de un commit: «falla» si alguno acabó mal, «pendiente» si queda alguno, si no «ok». */
export function resumirChecks(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return { estado: "pendiente", fallan: [], faltan: 0 };
  const malos = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"]);
  const fallan = runs.filter((r) => r.status === "completed" && malos.has(r.conclusion)).map((r) => r.name);
  const faltan = runs.filter((r) => r.status !== "completed").length;
  return { estado: fallan.length ? "falla" : faltan ? "pendiente" : "ok", fallan, faltan };
}

const rest = (...args) => {
  registrarGh("espera-ci", ["api", ...args]);
  return execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
};

async function main(argv) {
  const pr = Number(argv.find((a) => /^\d{1,8}$/.test(a)));
  const valor = (n, def) => {
    const i = argv.indexOf(n);
    return i >= 0 && /^\d+$/.test(argv[i + 1] ?? "") ? Number(argv[i + 1]) : def;
  };
  if (!pr) {
    console.error("Uso: npm run espera-ci -- <número de PR> [--cada 60] [--tope 20]");
    return 2;
  }
  const cada = Math.max(30, valor("--cada", 60)); // menos de 30 s no ahorra nada
  const tope = valor("--tope", 20) * 60_000;
  const inicio = Date.now();
  let ultimo = "";
  for (;;) {
    let r;
    try {
      // El commit puede cambiar (un push nuevo): se relee en cada vuelta, que sigue siendo REST.
      const sha = rest(`repos/pabloam89/MenuPlan/pulls/${pr}`, "--jq", ".head.sha").trim();
      r = resumirChecks(JSON.parse(rest(`repos/pabloam89/MenuPlan/commits/${sha}/check-runs?per_page=100`, "--jq", "[.check_runs[] | {name, status, conclusion}]")));
    } catch (e) {
      console.error(`ci pr: ${pr} estado: sin-respuesta (${String(e.stderr ?? e.message).trim().split("\n")[0]})`);
      return 1;
    }
    const linea = `ci pr: ${pr} estado: ${r.estado}${r.fallan.length ? ` fallan: ${r.fallan.join(",")}` : ""}${r.estado === "pendiente" ? ` en-curso: ${r.faltan}` : ""}`;
    if (linea !== ultimo) console.log(linea);
    ultimo = linea;
    if (r.estado !== "pendiente") return r.estado === "ok" ? 0 : 1;
    if (Date.now() - inicio + cada * 1000 > tope) {
      console.log(`ci pr: ${pr} estado: tope (${tope / 60_000} min sin acabar)`);
      return 1;
    }
    await new Promise((ok) => setTimeout(ok, cada * 1000));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
