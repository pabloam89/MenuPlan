/**
 * Punto de "hay algo nuevo" del tab Feed.
 *
 * Cada pantalla monta su propio <BottomNav>, así que pasar el aviso por props
 * serían diez callsites tocados para un booleano. Esto es un store mínimo
 * (valor + suscriptores) que BottomNav lee con useSyncExternalStore; lo
 * escriben App (al cargar la sesión) y FeedScreen (al abrir la campana).
 *
 * A propósito es un booleano y no un número: el número vive en la campana,
 * donde vas a actuar; el tab solo necesita decir "pásate cuando quieras".
 */
let hasNews = false;
const subs = new Set();

export function setFeedBadge(on) {
  const next = Boolean(on);
  if (next === hasNews) return;
  hasNews = next;
  for (const fn of subs) fn();
}

export function subscribeFeedBadge(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function readFeedBadge() {
  return hasNews;
}
