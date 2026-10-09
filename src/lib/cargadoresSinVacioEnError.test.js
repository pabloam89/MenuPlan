// Ningún cargador de src/lib/ que lea de Supabase devuelve en error lo mismo
// que en vacío.
//
// Encargo #317, caso #316, colgado del fondo #177 («errores que se tragan»).
// La forma de esta clase no es callarse el error: es CONVERTIRLO en un estado
// válido. Si la carga de recetas fallaba, `loadUserRecipes` devolvía `[]`,
// igual que «no tienes ninguna»; App.jsx veía todas las locales como «solo
// local» y las subía con un upsert por id que pisaba lo editado en otro
// dispositivo. Con los descartes, igual: un descarte «para siempre» de la casa
// pasaba a temporal y el dispositivo se marcaba como «ya subido».
//
// La norma: un cargador (función exportada load*/list*/count*/preview*/fetch*/
// get*) que ve un error devuelve algo que lo diga (`{ data: null, error }`),
// nunca `[]`, `{}`, `null`, `0` ni un objeto hecho solo de vacíos.
//
// CONOCIDOS solo puede bajar, como la línea base del lint: uno nuevo hace
// fallar el test, y uno arreglado también hasta que se quita de la lista. Los
// que quedan solo PINTAN (el feed, la ficha de una persona, la lista de
// miembros): con su resultado nadie sube ni borra nada en la nube.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as espree from "espree";
import { describe, expect, it } from "vitest";

const LIB = import.meta.dirname;

// fichero → funciones que aún devuelven vacío en error. No se añade nada.
// Qué ficheros se miran no va en lista: todo src/lib/ que importa el cliente
// (leeDeSupabase).
const CONOCIDOS = {
  "cookingsSync.js": [
    "loadRowCookings", // la fila del feed: solo se pinta
    "loadRecipeCookings", // la historia de una receta: solo se pinta
    "loadOwnerCookings", // el álbum de una persona: solo se pinta
    "countOwnerCookings", // un número en el perfil
  ],
  "householdsSync.js": [
    "loadHouseholdMembers", // la lista de miembros en Casas: solo se pinta
    "loadPendingInviteToken", // sin token no se hace nada (useHousehold)
  ],
  "householdState.js": [
    "loadHouseholdBotRev", // sondeo: con null no se recarga ni se escribe
  ],
  // Gente (apagada con el frontal de Lola, GENTE_ACTIVA): lecturas que pintan
  // el feed, perfiles, comentarios y seguidores. Repasadas por encima, no una
  // a una: ninguna lleva a una subida como las de #316, pero un botón
  // «Seguir» puede salir mal con la lectura caída. loadMyProfile sí escribía
  // (ensureSocialProfile) y ya está arreglado.
  "social.js": [
    "loadProfileById",
    "loadFollowing",
    "loadFollowRequests",
    "loadFollowers",
    "loadSentRequests",
    "loadMyRecipeStats",
    "loadCommentInbox",
    "loadComments",
    "loadCommentLikes",
    "loadSuggestedProfiles",
    "loadRecentProfiles",
    "loadFollowList",
    "loadProfileCounts",
    "loadRecipeStats",
    "loadBlockedIds",
    "loadSharedMenu",
    "loadMyPublishedMenus",
  ],
};

const ES_CARGADOR = /^(load|list|count|preview|fetch|get)[A-Z]/;

/**
 * El módulo habla con Supabase: importa el cliente (`./supabase.js`). Así entra
 * solo cualquier módulo nuevo de src/lib/ que lea de la base, sin lista a mano.
 */
function leeDeSupabase(src) {
  return /\bfrom\s+["']\.\/supabase(\.js)?["']/.test(src);
}

/** ¿El nodo menciona un error (`error`, `err`, `x.error`)? */
function mencionaError(nodo) {
  let si = false;
  const visitar = (n) => {
    if (si || !n || typeof n.type !== "string") return;
    if (n.type === "Identifier" && /^(error|err|\w+Error)$/.test(n.name)) { si = true; return; }
    if (n.type === "MemberExpression" && !n.computed && n.property.name === "error") { si = true; return; }
    for (const [k, v] of Object.entries(n)) {
      if (k === "parent") continue;
      if (Array.isArray(v)) v.forEach(visitar);
      else if (v && typeof v === "object") visitar(v);
    }
  };
  visitar(nodo);
  return si;
}

/** `[]`, `{}`, `null`, `0`, `false`, `""`, `undefined`, o un objeto hecho solo de eso. */
function esVacio(n) {
  if (!n) return true; // `return;`
  if (n.type === "Literal") return n.value === null || n.value === 0 || n.value === false || n.value === "";
  if (n.type === "Identifier") return n.name === "undefined";
  if (n.type === "ArrayExpression") return n.elements.length === 0;
  if (n.type === "ObjectExpression") return n.properties.every((p) => p.type === "Property" && esVacio(p.value));
  return false;
}

const ES_FUNCION = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/** Los `return <vacío>` dentro de `n`, sin entrar en funciones anidadas. */
function retornosVacios(n, out = []) {
  if (!n || typeof n.type !== "string" || ES_FUNCION.has(n.type)) return out;
  if (n.type === "ReturnStatement" && esVacio(n.argument)) out.push(n);
  for (const [k, v] of Object.entries(n)) {
    if (k === "parent") continue;
    if (Array.isArray(v)) v.forEach((x) => retornosVacios(x, out));
    else if (v && typeof v === "object" && typeof v.type === "string") retornosVacios(v, out);
  }
  return out;
}

/** Los `if (…error…) { … return <vacío> }` del cuerpo, sin entrar en funciones anidadas. */
function ifsDeError(n, out = []) {
  if (!n || typeof n.type !== "string") return out;
  if (n.type === "IfStatement" && mencionaError(n.test) && retornosVacios(n.consequent).length) out.push(n);
  for (const [k, v] of Object.entries(n)) {
    if (k === "parent") continue;
    const hijos = Array.isArray(v) ? v : [v];
    for (const h of hijos) {
      if (h && typeof h.type === "string" && !ES_FUNCION.has(h.type)) ifsDeError(h, out);
    }
  }
  return out;
}

/** ¿Es `console.warn(…)`, `console.error(…)` o `warn(…)` y menciona un error? */
function esAvisoDeError(st) {
  const c = st?.type === "ExpressionStatement" ? st.expression : null;
  if (c?.type !== "CallExpression") return false;
  const f = c.callee;
  const esAviso =
    (f.type === "MemberExpression" && f.object.name === "console" && /^(warn|error)$/.test(f.property.name))
    || (f.type === "Identifier" && f.name === "warn");
  return esAviso && c.arguments.some(mencionaError);
}

/**
 * Los `return <vacío>` que vienen DETRÁS de un aviso de error en el mismo
 * bloque (`console.error("…", lastError); return [];`): la forma de un cargador
 * con reintentos que, tras el bucle, se rinde con vacío (#317, loadPantry). Sin
 * entrar en funciones anidadas.
 */
function retornosTrasAviso(n, out = []) {
  if (!n || typeof n.type !== "string" || ES_FUNCION.has(n.type)) return out;
  const lista = n.type === "BlockStatement" ? n.body : n.type === "SwitchCase" ? n.consequent : null;
  if (lista) {
    let avisado = false;
    for (const st of lista) {
      if (esAvisoDeError(st)) avisado = true;
      else if (avisado && st.type === "ReturnStatement" && esVacio(st.argument)) out.push(st);
    }
  }
  for (const [k, v] of Object.entries(n)) {
    if (k === "parent") continue;
    if (Array.isArray(v)) v.forEach((x) => retornosTrasAviso(x, out));
    else if (v && typeof v === "object" && typeof v.type === "string") retornosTrasAviso(v, out);
  }
  return out;
}

/**
 * Los cargadores de un fuente que devuelven vacío en error. Dos formas:
 *   - `if (…error…) { … return <vacío> }`;
 *   - un aviso de error (`console.warn/error`, `warn`) y, detrás, en el mismo
 *     bloque, `return <vacío>`.
 * @returns {string[]} sus nombres (uno por cada `return` culpable)
 */
function cargadoresVaciosEnError(src) {
  const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module", loc: true });
  const out = [];
  for (const d of ast.body) {
    const f = d.type === "ExportNamedDeclaration" ? d.declaration : null;
    if (f?.type !== "FunctionDeclaration" || !ES_CARGADOR.test(f.id?.name ?? "")) continue;
    const culpables = new Set([
      ...ifsDeError(f.body).flatMap((i) => retornosVacios(i.consequent)),
      ...retornosTrasAviso(f.body),
    ]);
    out.push(...[...culpables].map(() => f.id.name));
  }
  return out;
}

const resta = (a, b) => {
  const quedan = [...b];
  return a.filter((x) => {
    const i = quedan.indexOf(x);
    if (i === -1) return true;
    quedan.splice(i, 1);
    return false;
  });
};

describe("src/lib/ (lo que lee de Supabase): ningún cargador devuelve vacío en error (#317)", () => {
  const fuentes = Object.fromEntries(
    readdirSync(LIB)
      .filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f))
      .map((f) => [f, readFileSync(join(LIB, f), "utf8")]),
  );
  const ficheros = Object.keys(fuentes).filter((f) => leeDeSupabase(fuentes[f]));
  const hoy = Object.fromEntries(ficheros.map((f) => [f, [...new Set(cargadoresVaciosEnError(fuentes[f]))]]));

  it("hay ficheros que mirar (si el criterio deja de casar, el test no vigila nada)", () => {
    // Los *Sync.js, recipeVotes.js y recipeCollections.js como mínimo.
    for (const f of ["userRecipesSync.js", "householdDiscardsSync.js", "menusSync.js", "recipeVotes.js", "recipeCollections.js"]) {
      expect(ficheros, f).toContain(f);
    }
  });

  it("no hay ninguno nuevo fuera de CONOCIDOS", () => {
    const nuevos = Object.entries(hoy).flatMap(([f, fs]) => resta(fs, CONOCIDOS[f] ?? []).map((n) => `${f} ${n}`));
    expect(
      nuevos,
      "Un cargador devuelve en error lo mismo que en vacío: quien lo llame subirá datos creyendo que no hay nada. " +
        "Devuelve `{ data: null, error }` y que el llamador no suba nada si hay error. CONOCIDOS no crece.",
    ).toEqual([]);
  });

  it("CONOCIDOS solo baja: lo arreglado se quita de la lista", () => {
    const sobran = Object.entries(CONOCIDOS).flatMap(([f, fs]) => resta(fs, hoy[f] ?? []).map((n) => `${f} ${n}`));
    expect(sobran, "Ya no devuelven vacío en error: bórralos de CONOCIDOS.").toEqual([]);
  });
});

describe("cargadoresVaciosEnError: qué cuenta", () => {
  const n = (src) => cargadoresVaciosEnError(src).length;
  const cargador = (cuerpoError) =>
    `export async function loadX() { const { data, error } = await q(); if (error) { ${cuerpoError} } return data; }`;

  it("devolver [] , {}, null, 0 o nada en error", () => {
    expect(n(cargador("return [];"))).toBe(1);
    expect(n(cargador("return {};"))).toBe(1);
    expect(n(cargador("return null;"))).toBe(1);
    expect(n(cargador("return 0;"))).toBe(1);
    expect(n(cargador("return;"))).toBe(1);
  });
  it("un objeto hecho solo de vacíos (la forma de los descartes)", () => {
    expect(n(cargador("console.warn('x'); return { forever: [], cooldownUntil: {} };"))).toBe(1);
  });
  it("el error en una llamada o en un miembro (cookingsSync, menusSync)", () => {
    expect(n("export async function loadX() { const { error } = await q(); if (warn('x', error)) return []; }")).toBe(1);
    expect(n("export async function loadX() { const r = await q(); if (r.error || !r.data) return null; }")).toBe(1);
  });
  it("no, si devuelve el error", () => {
    expect(n(cargador("return { data: null, error };"))).toBe(0);
    expect(n(cargador("return { state: null, error: true };"))).toBe(0);
    expect(n(cargador("return { status: 'error' };"))).toBe(0);
  });
  it("no, si no es un cargador o no está exportado", () => {
    expect(n(cargador("return [];").replace("loadX", "saveX"))).toBe(0);
    expect(n(cargador("return [];").replace("export ", ""))).toBe(0);
  });
  it("un aviso de error y, detrás, return vacío (reintentos que se rinden: loadPantry)", () => {
    const reintentos = (fin) =>
      `export async function loadX() { let lastError = null; for (const t of ts) { const { data, error } = await q(t); if (!error) return data; lastError = error; } ${fin} }`;
    expect(n(reintentos("console.error('x', lastError); return [];"))).toBe(1);
    expect(n(reintentos("warn('x', lastError); return null;"))).toBe(1);
    expect(n(reintentos("console.error('x', lastError); return { data: null, error: lastError };"))).toBe(0);
    // Sin aviso de error delante, un return vacío no basta: puede ser «no hay».
    expect(n(reintentos("console.log('x'); return [];"))).toBe(0);
    expect(n(reintentos("return [];"))).toBe(0);
  });
  it("no cuenta dos veces el mismo return (if de error con aviso dentro)", () => {
    expect(n(cargador("console.warn('x', error.message); return [];"))).toBe(1);
  });
  it("no, si el if no habla de un error, o el return está en una función anidada", () => {
    expect(n("export async function loadX(id) { if (!id) return []; return q(); }")).toBe(0);
    expect(n("export async function loadX() { const { error } = await q(); if (error) { xs.map(() => { return []; }); throw error; } }")).toBe(0);
  });
});
