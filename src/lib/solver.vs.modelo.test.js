import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { SYSTEM_PROMPTS } from "../../api/_prompts.js";
import { casaAleatoria } from "./casasAleatorias.js";
import { medirUnidad, resumir } from "./solver.stress.test.js";

/**
 * El modelo contra el solver sobre LAS MISMAS casas. Llama a Anthropic de
 * verdad (cuesta dinero: ~0,15–0,30 € por casa con Sonnet), así que solo bajo
 * demanda y con pocas casas:
 *
 *   MODELO=1 VS_N=12 npx vitest run src/lib/solver.vs.modelo
 *
 * Lee ANTHROPIC_API_KEY de .env.local y desvía el fetch a /api/generate al
 * endpoint real con el mismo cuerpo que construye api/generate.js (system
 * desde el `task`), sin pasar por el guard de cuota.
 */
const N = Number(process.env.VS_N ?? 12);
const SALIDA = process.env.VS_OUT ?? "vs-modelo.json";

function apiKey() {
  const env = fs.readFileSync(".env.local", "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY="?([^"\r\n]+)"?/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY no está en .env.local");
  return m[1];
}

function desviarFetch(key) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url !== "/api/generate") return real(url, init);
    const body = JSON.parse(init.body);
    const system = body.task != null ? SYSTEM_PROMPTS[body.task] : undefined;
    return real("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: body.model, max_tokens: body.max_tokens, ...(system ? { system } : {}), messages: body.messages }),
      signal: init.signal,
    });
  };
  return () => { globalThis.fetch = real; };
}

describe.skipIf(!process.env.MODELO)("modelo contra solver, mismas casas", () => {
  it(`${N} casas, los dos motores`, async () => {
    const restaurar = desviarFetch(apiKey());
    let motor = "solver";
    globalThis.localStorage = { getItem: (k) => (k === "mp_motor" ? motor : null) };
    const porMotor = { solver: [], modelo: [] };
    try {
      for (let i = 0; i < N; i++) {
        // Solo dureza 0 y 1: casas normales, que es lo que hay en producción.
        const data = casaAleatoria(9000 + i, { nivel: i % 3 === 2 ? 1 : 0 });
        const group = data.groups[0];
        for (motor of ["solver", "modelo"]) {
          const fila = await medirUnidad(data, group, null);
          porMotor[motor].push({ i, ...fila });
          console.log(`[${motor}] casa ${i}: ${fila.error ? "ERROR " + fila.error : `${fila.asignados}/${fila.slots} huecos=${fila.huecos} otras=${fila.otras} wall=${fila.wallMs}ms llm=${fila.llmCalls ?? 0} calls fallback=${fila.fallbackUsed ?? 0}`}`);
        }
      }
    } finally {
      restaurar();
    }
    const resumen = { solver: resumir(porMotor.solver), modelo: resumir(porMotor.modelo) };
    fs.writeFileSync(SALIDA, JSON.stringify({ resumen, porMotor }, null, 1));
    console.log("RESUMEN " + JSON.stringify(resumen, null, 1));
    expect(porMotor.solver.length).toBe(N);
  }, 2 * 3_600_000);
});
