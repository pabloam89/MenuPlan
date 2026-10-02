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

export const NOMBRE_PAPEL = {
  es: { owner: "Titular", editor: "Cotitular", viewer: "Lector" },
  en: { owner: "Owner", editor: "Co-owner", viewer: "Viewer" },
};
