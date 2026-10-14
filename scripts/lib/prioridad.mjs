/**
 * prioridad.mjs — los trabajos pesados en local corren con prioridad baja (#284, paso 3).
 *
 * Varias sesiones lanzando tests y builds a la vez dejaban el PC de Pablo sin
 * respuesta (y la conexión SSH a la devbox a tirones, caso #283). Con prioridad
 * BELOW_NORMAL, Windows sigue dando la CPU a lo que Pablo tiene delante y los
 * tests usan lo que sobra: tardan lo mismo con la máquina libre y ceden cuando
 * no lo está.
 *
 * Dónde se engancha: en `vite.config.js`, que cargan `vitest` (por cualquier
 * camino: `npm test`, `npx vitest run`, `npm run vecinos`) y `vite build`
 * (`npm run build`), antes de lanzar sus procesos hijos. En Windows un proceso
 * hijo HEREDA la clase BELOW_NORMAL del padre (CreateProcess sin clase
 * explícita), y en Linux o macOS el nice también se hereda: los workers de
 * vitest (pool `forks`) quedan bajos sin tocarlos. Lo comprueba
 * `scripts/lib/prioridad.test.js` desde dentro de un worker.
 *
 * No hace nada en el CI (`CI`) ni en Vercel (`VERCEL`): allí la máquina es
 * solo para eso. Solo baja, nunca sube: si ya está más baja, no la toca.
 */
import os from "node:os";

/** La prioridad que se pone: BELOW_NORMAL (10 en la escala de nice de Node). */
export const PRIORIDAD_BAJA = os.constants.priority.PRIORITY_BELOW_NORMAL;

/**
 * Baja la prioridad del proceso actual (pid 0). Devuelve qué ha hecho, sin
 * lanzar nunca: un fallo aquí no puede parar un test ni un build.
 * `{ hecho: bool, motivo: "ci"|"ya-baja"|"bajada"|"error", antes, despues }`.
 */
export function bajarPrioridad({ env = process.env, sistema = os, pid = 0 } = {}) {
  if (env.CI || env.VERCEL) return { hecho: false, motivo: "ci" };
  try {
    const antes = sistema.getPriority(pid);
    if (antes >= PRIORIDAD_BAJA) return { hecho: false, motivo: "ya-baja", antes, despues: antes };
    sistema.setPriority(pid, PRIORIDAD_BAJA);
    return { hecho: true, motivo: "bajada", antes, despues: sistema.getPriority(pid) };
  } catch (e) {
    // a propósito: sin permiso o en un sistema raro se sigue a prioridad normal; es una ayuda, no un requisito
    return { hecho: false, motivo: "error", error: String(e?.message ?? e) };
  }
}
