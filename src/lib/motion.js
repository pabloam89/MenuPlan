// El orden define la direccion del slide entre pantallas: tiene que reflejar
// el orden VISUAL de la barra (Inicio - Recetas - Menu - Compra - Feed), o al
// saltar de tab la animacion empuja hacia el lado contrario del que tocaste.
// Las pantallas sin tab propio van junto a su tab de origen.
export const MAIN_TABS = ["dashboard", "profile", "recipes", "menus", "menu", "pantry", "shopping", "analytics", "feed"];

export function navDirection(from, to) {
  const a = MAIN_TABS.indexOf(from);
  const b = MAIN_TABS.indexOf(to);
  if (a === -1 || b === -1) return "forward";
  return b > a ? "forward" : "backward";
}

export function tabDirection(options, fromId, toId) {
  const a = options.findIndex((o) => o.id === fromId);
  const b = options.findIndex((o) => o.id === toId);
  if (a === -1 || b === -1 || a === b) return 0;
  return b > a ? 1 : -1;
}
