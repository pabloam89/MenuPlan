/**
 * principal.mjs — la carpeta principal, al día con origin/staging.
 *
 * Por qué (#179, encargo #192): los hooks se cargan de la carpeta de cada
 * sesión. En la principal nadie hace `git pull`, así que un arreglo de la
 * guardia ya fusionado no llegaba a quien trabajaba allí: el 8 oct 2026 tres
 * sesiones sufrieron un fallo ya arreglado y la del plan maestro tuvo que
 * adelantarla a mano dos veces. El arranque la adelanta al abrir sesión.
 *
 * Solo con `--ff-only` y solo si está limpia (lo no seguido no cuenta: git
 * para solo si fuera a pisarlo). La guardia ya deja ese merge en la principal.
 */

import { RAMA_SIMPLE, limpiarTexto } from "../../scripts/lib/textoExterno.mjs";

/**
 * Qué hacer con la carpeta al arrancar. Devuelve { adelantar: bool, aviso:
 * string|null }. `sucio`: salida de `git status --porcelain
 * --untracked-files=no` (null si no se pudo leer).
 */
export function planAdelantar({ esWorktree, rama, detras, sucio }) {
  const n = Number(detras);
  if (esWorktree || rama !== "staging" || !Number.isFinite(n) || n <= 0) return { adelantar: false, aviso: null };
  if (sucio === null) return { adelantar: false, aviso: `La carpeta principal va ${n} commits por detrás de origin/staging y no he podido ver si está limpia: no la adelanto. Los hooks que corren son los viejos.` };
  if (sucio.trim()) {
    return { adelantar: false, aviso: `AVISO: la carpeta principal va ${n} commits por detrás de origin/staging y tiene cambios sin guardar, así que no la adelanto: los hooks que corren son los viejos. Esos cambios no deberían estar ahí (en la principal no se trabaja); muévelos a una tarea.` };
  }
  return { adelantar: true, aviso: null };
}

/** El aviso tras adelantar: cuántos commits y si cambian los hooks o los permisos. */
export function avisoTrasAdelantar(n, cambiados) {
  const hooks = cambiados.filter((f) => /^\.claude\/(hooks\/|settings\.json$)/.test(f) && !/\.test\.js$/.test(f));
  let linea = `Carpeta principal adelantada ${n} commits hasta origin/staging.`;
  if (hooks.length) {
    linea += ` Cambian ${hooks.join(", ")}: los hooks ya corren con la versión nueva`
      + (hooks.includes(".claude/settings.json") ? "; los cambios de settings.json (hooks nuevos, permisos) se cargan al abrir la próxima sesión." : ".");
  }
  return linea;
}

/**
 * El reflog de HEAD resumido a los cambios de rama («staging → ccr-0df… hace
 * 2 h»). `texto`: `git reflog HEAD -n 30 --format=%gs|%cr`. Los más recientes
 * primero, tope de `max`.
 */
export function resumenReflog(texto, max = 4) {
  // Cada trozo sale por limpiarTexto: git admite `<>` en el nombre de una rama (ronda 3 de #384).
  const l = (x) => limpiarTexto(x, 60);
  return String(texto ?? "").split("\n")
    .map((l) => /^checkout: moving from (\S+) to (\S+)\|(.+)$/.exec(l.trim()))
    .filter(Boolean)
    .slice(0, max)
    .map((m) => `${l(m[1])} → ${l(m[2])} (${l(m[3])})`);
}

/**
 * Aviso si la carpeta principal no está en staging (#348, #384): el 9 oct 2026
 * una sesión de la nube dejó `ccr-…` puesta y los agentes dejaron de cargarse.
 * null si es un worktree, si está en staging o si no se sabe la rama.
 */
export function avisoRamaPrincipal({ esWorktree, rama, reflog }) {
  if (esWorktree || !rama || rama === "HEAD" || rama === "staging") return null;
  const cambios = resumenReflog(reflog);
  const pintable = RAMA_SIMPLE.test(rama) ? limpiarTexto(rama, 60) : "(nombre no válido)";
  return `AVISO: la carpeta principal está en la rama ${pintable}, no en staging (caso #348: otra sesión la cambió y los agentes pueden no cargar). `
    + (cambios.length ? `Últimos cambios de rama: ${cambios.join("; ")}. ` : "")
    + "Mira `npm run buscar -- \"carpeta principal rama\"` antes de investigarlo; para volver, desde una tarea y sin trabajo suelto en la principal: `git switch staging`.";
}
