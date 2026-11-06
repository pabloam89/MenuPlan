// Quién puede qué en una casa: titular (owner), cotitular (editor) y lector
// (viewer). Un solo sitio para la app, Lola y las pruebas
// (specs/roles-de-la-casa-propuesta.md, apartado 2). La base lo vuelve a
// comprobar (0071): esto decide qué se enseña y qué se ofrece, no es la
// frontera de seguridad.
//
// Decidido por Pablo (1 oct 2026): solo el titular nombra cotitulares y
// cambia papeles; el cotitular invita y quita lectores; el lector lo ve todo
// (alergias y salud incluidas) y solo tacha la compra.

export const PAPELES = ["owner", "editor", "viewer"];
/** Cada papel por su nombre (PAPEL.OWNER), para no escribir el texto a mano. */
export const PAPEL = Object.freeze(Object.fromEntries(PAPELES.map((p) => [p.toUpperCase(), p])));

/** Lo que llega de la base, a uno de los tres. Lo desconocido, lector: lo seguro. */
export function papelDe(valor) {
  return valor === "owner" || valor === "editor" ? valor : "viewer";
}

const MATRIZ = {
  editar_casa: ["owner", "editor"],
  tachar: ["owner", "editor", "viewer"],
  invitar_lector: ["owner", "editor"],
  invitar_cotitular: ["owner"],
  cambiar_papel: ["owner"],
  "quitar:editor": ["owner"],
  "quitar:viewer": ["owner", "editor"],
  salir: ["editor", "viewer"],
  renombrar: ["owner", "editor"],
  borrar_casa: ["owner"],
  enlazar_grupo: ["owner", "editor"],
};

/** @param {string} papel  @param {keyof typeof MATRIZ} accion */
export function puede(papel, accion) {
  return (MATRIZ[accion] ?? []).includes(papelDe(papel));
}

// ── Lola (api/_bot/agente.js) ───────────────────────────────────────────────
// Cada herramienta declara en su ficha `lector`: true (la usa un lector),
// "privado" (solo en su chat privado: recordatorios, su memoria) o false.
// «ajeno» es alguien del grupo sin cuenta enlazada: solo consulta el menú,
// las recetas y la compra; ni tacha ni ve la familia (salud, alergias: M-4).
const PARA_AJENOS = new Set(["ver_menu", "ver_receta", "consultar", "proponer_platos", "buscar_recetas"]);
// `consultar` es una herramienta con varias consultas: la lista de lo que ve un ajeno va por consulta.
const CONSULTAS_DE_AJENOS = new Set(["compra", "cole"]);

/**
 * @param {'owner'|'editor'|'viewer'|'ajeno'|undefined} papel  sin papel: ajeno (falla cerrado)
 * @param {{ name: string, lector: boolean|'privado' }} herramienta
 * @param {boolean} esGrupo
 */
export function herramientaPermitida(papel, { name, lector }, esGrupo) {
  if (papel === "owner" || papel === "editor") return true;
  if (papel === "viewer") return lector === true || (lector === "privado" && !esGrupo);
  return lector === true && PARA_AJENOS.has(name);
}

/**
 * Si este papel puede hacer esta consulta de `consultar` (agente.js).
 * @param {'owner'|'editor'|'viewer'|'ajeno'|undefined} papel  sin papel: ajeno (falla cerrado)
 * @param {string} que
 * @param {boolean|'privado'} lector
 * @param {boolean} esGrupo
 */
export function consultaPermitida(papel, que, lector, esGrupo) {
  if (papel === "owner" || papel === "editor" || papel === "viewer") return herramientaPermitida(papel, { name: "consultar", lector }, esGrupo);
  return lector === true && CONSULTAS_DE_AJENOS.has(que);
}

export const NOMBRE_PAPEL = {
  es: { owner: "Titular", editor: "Cotitular", viewer: "Lector" },
  en: { owner: "Owner", editor: "Co-owner", viewer: "Viewer" },
};
