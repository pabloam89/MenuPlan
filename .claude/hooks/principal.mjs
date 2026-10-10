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
