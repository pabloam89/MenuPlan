export const MAIN_TABS = ["dashboard", "recipes", "menus", "pantry", "menu", "shopping", "analytics", "profile"];

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
