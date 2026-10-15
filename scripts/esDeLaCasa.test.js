import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CONSULTA_PR_INDICE, construirIndice, issueDeLaCasa } from "./lib/buscarAntes.mjs";
import { CONSULTA_FLUJO, desdeGraphql } from "./lib/cumplimiento.mjs";
import { esDeLaCasa, esDeLaCasaOSinDato } from "./lib/fondos.mjs";
import { aplicarCambiosRest } from "./lib/fotoIssues.mjs";
import { CAMPOS_ISSUE, leerIssue } from "./lib/issues.mjs";
import { cuerpoDeMarca, leerMarcas } from "./lib/lleva.mjs";
import { leerTodosLosIssues } from "./lib/situacion.mjs";
import * as hoja from "./lib/identidadSesiones.mjs";
import { BOT_ID, BOT_LOGIN } from "./lib/tokenSesion.mjs";

// La clase de #839 (caso #838, fondo #326): «de la casa» se decide en UN sitio, con la
// asociación o con el id del bot de las sesiones, y ningún lector repite la condición.

const RAIZ = resolve(import.meta.dirname, "..");

// Los tres formatos en que llega un issue o un comentario: REST, GraphQL y el nuestro (leerIssue, hijoDeRest).
const rest = (asociacion, user) => ({ author_association: asociacion, user });
const graphql = (asociacion, author) => ({ authorAssociation: asociacion, author });
const plano = (asociacion, autor) => ({ asociacion, autor });
const NUESTRO_REST = { login: BOT_LOGIN, type: "Bot", id: BOT_ID };
const NUESTRO_GQL = { __typename: "Bot", login: "homenu-sesiones", databaseId: BOT_ID };

describe("esDeLaCasa(issue): la asociación o el bot de las sesiones por su id, nada más", () => {
  it("el dueño, los miembros y los colaboradores entran, en los tres formatos", () => {
    for (const a of ["OWNER", "MEMBER", "COLLABORATOR", "owner"]) {
      expect(esDeLaCasa(rest(a, { login: "x", type: "User", id: 1 })), a).toBe(true);
      expect(esDeLaCasa(graphql(a, { __typename: "User", login: "x" })), a).toBe(true);
      expect(esDeLaCasa(plano(a, null)), a).toBe(true);
    }
  });

  it("nuestro bot entra aunque GitHub lo llame CONTRIBUTOR, en los tres formatos", () => {
    expect(esDeLaCasa(rest("CONTRIBUTOR", NUESTRO_REST))).toBe(true);
    expect(esDeLaCasa(graphql("CONTRIBUTOR", NUESTRO_GQL))).toBe(true);
    expect(esDeLaCasa(plano("CONTRIBUTOR", { tipo: "Bot", id: BOT_ID }))).toBe(true);
  });

  it("un CONTRIBUTOR humano queda fuera, aunque su login se parezca al del bot", () => {
    for (const login of ["alguien", BOT_LOGIN, "homenu-sesiones"]) {
      expect(esDeLaCasa(rest("CONTRIBUTOR", { login, type: "User", id: 999 })), login).toBe(false);
      expect(esDeLaCasa(graphql("CONTRIBUTOR", { __typename: "User", login })), login).toBe(false);
    }
    // Un humano con el mismo número de id que el bot no existe, pero si el tipo no es Bot no entra.
    expect(esDeLaCasa(rest("CONTRIBUTOR", { login: "x", type: "User", id: BOT_ID }))).toBe(false);
  });

  it("cualquier otro bot queda fuera: otro id, aunque su login acabe en [bot] o copie el nuestro", () => {
    for (const login of ["github-actions[bot]", "dependabot[bot]", BOT_LOGIN]) {
      expect(esDeLaCasa(rest("CONTRIBUTOR", { login, type: "Bot", id: 41898282 })), login).toBe(false);
      expect(esDeLaCasa(rest("NONE", { login, type: "Bot", id: 49699333 })), login).toBe(false);
      expect(esDeLaCasa(graphql("CONTRIBUTOR", { __typename: "Bot", login, databaseId: 41898282 })), login).toBe(false);
    }
    // El id como texto, ni la App por `performed_via_github_app`, cuentan.
    expect(esDeLaCasa(rest("CONTRIBUTOR", { login: BOT_LOGIN, type: "Bot", id: String(BOT_ID) }))).toBe(false);
    expect(esDeLaCasa({ author_association: "CONTRIBUTOR", user: { login: "x", type: "User", id: 3 }, performed_via_github_app: { id: 5260552, slug: "homenu-sesiones" } })).toBe(false);
  });

  it("las asociaciones de fuera, sin dato o sin objeto, no entran", () => {
    for (const a of ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "MANNEQUIN", "", null, undefined]) {
      expect(esDeLaCasa(plano(a, null)), String(a)).toBe(false);
    }
    // La asociación sola, sin el issue, ya no es la entrada: así no nace un lector que se salte el autor.
    for (const x of ["OWNER", null, undefined, 3]) expect(esDeLaCasa(x), String(x)).toBe(false);
  });

  it("esDeLaCasaOSinDato: sin asociación ni autor cuenta (informes); si hay dato, decide esDeLaCasa", () => {
    expect(esDeLaCasaOSinDato({ number: 1 })).toBe(true);
    expect(esDeLaCasaOSinDato(plano("NONE", null))).toBe(false);
    expect(esDeLaCasaOSinDato(rest("CONTRIBUTOR", NUESTRO_REST))).toBe(true);
    expect(esDeLaCasaOSinDato(rest("CONTRIBUTOR", { login: "x", type: "User", id: 9 }))).toBe(false);
    expect(esDeLaCasaOSinDato({ autor: { tipo: "Bot", id: 1 } })).toBe(false);
  });
});

describe("los lectores de GraphQL, la foto y la REST reconocen al bot de las sesiones", () => {
  // Un nodo como lo da CAMPOS_ISSUE, con un comentario de marca «lo lleva».
  const marca = cuerpoDeMarca({ rama: "ops/839-esdelacasa", carpeta: "MenuPlan-esdelacasa", desde: new Date("2026-10-14T10:00:00Z") });
  const nodo = (number, author, comentarioDe = author) => ({
    id: `I_${number}`, number, title: "[caso] algo", state: "OPEN", createdAt: "2026-10-14T00:00:00Z", body: "cuerpo",
    authorAssociation: "CONTRIBUTOR", author, labels: { nodes: [{ name: "tipo:caso" }] },
    comments: { totalCount: 1, nodes: [{ body: marca, authorAssociation: "CONTRIBUTOR", author: comentarioDe, createdAt: "2026-10-14T10:00:00Z" }] },
  });
  const OTRO_GQL = { __typename: "Bot", login: "homenu-sesiones", databaseId: 41898282 };

  it("CAMPOS_ISSUE y las consultas de buscar y cumplimiento piden el id del bot", () => {
    for (const q of [CAMPOS_ISSUE, CONSULTA_PR_INDICE, CONSULTA_FLUJO]) expect(q).toMatch(/author \{ __typename login \.\.\. on Bot \{ databaseId \} \}/);
    expect(CAMPOS_ISSUE.match(/on Bot \{ databaseId \}/g)).toHaveLength(2); // el issue y sus comentarios
  });

  it("npm run buscar: el índice guarda lo del bot y deja fuera a otro bot", () => {
    const issues = [nodo(1, NUESTRO_GQL), nodo(2, OTRO_GQL)].map(leerIssue);
    expect(construirIndice(issues).fichas.map((f) => f.numero)).toEqual([1]);
  });

  it("las marcas «lo lleva» y los comentarios de la casa cuentan los del bot, no los de otro", () => {
    expect(leerMarcas(nodo(1, NUESTRO_GQL).comments.nodes, { soloCasa: true })).toHaveLength(1);
    expect(leerMarcas(nodo(1, NUESTRO_GQL, OTRO_GQL).comments.nodes, { soloCasa: true })).toEqual([]);
    const [i] = leerTodosLosIssues(() => "", 1, () => [nodo(1, NUESTRO_GQL, OTRO_GQL)]);
    expect(i.comentariosCasa).toEqual([]);
    const [j] = leerTodosLosIssues(() => "", 1, () => [nodo(1, NUESTRO_GQL)]);
    expect(j.comentariosCasa).toEqual(["2026-10-14T10:00:00Z"]);
  });

  it("la foto puesta al día por la REST conserva el autor con la forma de GraphQL", () => {
    const [n] = aplicarCambiosRest([], [{ number: 5, node_id: "I_5", title: "t", state: "open", created_at: "2026-10-14T00:00:00Z", body: "", labels: [], assignees: [], author_association: "CONTRIBUTOR", user: NUESTRO_REST }]);
    expect(issueDeLaCasa(leerIssue(n))).toBe(true);
    const [m] = aplicarCambiosRest([], [{ number: 6, node_id: "I_6", title: "t", state: "open", created_at: "2026-10-14T00:00:00Z", body: "", labels: [], assignees: [], author_association: "CONTRIBUTOR", user: { login: BOT_LOGIN, type: "User", id: BOT_ID } }]);
    expect(issueDeLaCasa(leerIssue(m))).toBe(false);
  });

  it("cumplimiento cuenta los fondos del bot", () => {
    const f = desdeGraphql({ number: 9, state: "OPEN", body: "", authorAssociation: "CONTRIBUTOR", author: NUESTRO_GQL, labels: { nodes: [{ name: "tipo:fondo" }] } });
    expect(esDeLaCasa(f)).toBe(true);
    expect(esDeLaCasa(desdeGraphql({ number: 9, state: "OPEN", body: "", authorAssociation: "CONTRIBUTOR", author: OTRO_GQL }))).toBe(false);
  });
});

describe("el id del bot vive en un sitio y el workflow lo cruza", () => {
  const yaml = readFileSync(join(RAIZ, ".github/workflows/fondos.yml"), "utf8");
  const si = /\n {4}if: >-\n((?: {6}.*\n)+)/.exec(yaml)?.[1] ?? "";

  it("tokenSesion.mjs no lo repite: vuelve a exportar el de la hoja", () => {
    expect(BOT_ID).toBe(hoja.BOT_ID);
    expect(BOT_LOGIN).toBe(hoja.BOT_LOGIN);
    expect(readFileSync(join(RAIZ, "scripts/lib/tokenSesion.mjs"), "utf8")).not.toMatch(/\b\d{9}\b/);
  });

  it("el `if:` de fondos.yml reconoce al bot por tipo e id, y el id es el de identidadSesiones.mjs", () => {
    const ids = [...si.matchAll(/github\.event\.issue\.user\.id\s*==\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(ids, "el if: no reconoce al bot por su id").toHaveLength(1);
    expect(ids[0], "el id del YAML no es BOT_ID de scripts/lib/identidadSesiones.mjs").toBe(BOT_ID);
    expect(si).toMatch(/github\.event\.issue\.user\.type\s*==\s*'Bot'/);
    // Nunca por el login ni por la App.
    expect(si).not.toMatch(/user\.login|performed_via_github_app|\[bot\]|CONTRIBUTOR/);
  });

  it("el `if:` agrupa (asociación || bot) y luego exige las etiquetas: el bot no se salta el filtro de tipo", () => {
    // Con `asociación || (bot) && (etiquetas)` el && ata más fuerte: la asociación entraría sin
    // etiquetas. Las cadenas sueltas no lo ven; la forma entera, sí.
    const plano = si.replace(/\s+/g, " ").trim();
    const ASOC = String.raw`contains\(fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\), github\.event\.issue\.author_association\)`;
    const BOT = String.raw`\(github\.event\.issue\.user\.type == 'Bot' && github\.event\.issue\.user\.id == \d+\)`;
    const ETIQ = (t) => String.raw`contains\(github\.event\.issue\.labels\.\*\.name, 'tipo:${t}'\)`;
    const forma = new RegExp(String.raw`^github\.event_name != 'issues' \|\| \( \(${ASOC} \|\| ${BOT}\) && \(${ETIQ("fondo")} \|\| ${ETIQ("caso")} \|\| ${ETIQ("encargo")}\)\)$`);
    expect(plano, "el if: de fondos.yml no tiene la forma (asociación || bot) && (etiquetas)").toMatch(forma);
  });

  it("todo workflow que filtra por author_association reconoce también el id del bot", () => {
    const dir = join(RAIZ, ".github/workflows");
    for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
      const t = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
      if (!/author_association/.test(t)) continue;
      expect(t, `${f}: filtra por asociación sin el id del bot`).toMatch(new RegExp(`user\\.id\\s*==\\s*${BOT_ID}\\b`));
    }
  });
});

describe("ningún lector de scripts/ repite la condición", () => {
  const ficheros = [];
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", "fixtures"].includes(e.name)) recorrer(ruta);
      } else if (/\.mjs$/.test(e.name) && !/\.test\./.test(e.name)) ficheros.push(ruta);
    }
  };
  recorrer(join(RAIZ, "scripts"));
  recorrer(join(RAIZ, ".claude/hooks"));
  const DUENO = "scripts/lib/fondos.mjs";

  it("solo el dueño nombra las asociaciones de la casa", () => {
    expect(ficheros.length).toBeGreaterThan(50);
    const malos = ficheros
      .map((f) => relative(RAIZ, f).replace(/\\/g, "/"))
      .filter((r) => r !== DUENO)
      .filter((r) => /["'`]COLLABORATOR["'`]|ASOCIACIONES_DE_LA_CASA/.test(readFileSync(join(RAIZ, r), "utf8")));
    expect(malos).toEqual([]);
  });

  it("nadie compara la asociación con \"OWNER\" o \"MEMBER\" fuera del dueño", () => {
    const CAMPO = String.raw`\b(?:author_association|authorAssociation|asociacion)\b[\w.?()\[\]]*`;
    const VALOR = String.raw`["'\x60](?:OWNER|MEMBER)["'\x60]`;
    const comparacion = new RegExp(String.raw`${CAMPO}\s*[!=]==?\s*${VALOR}|${VALOR}\s*[!=]==?\s*[\w.?\[\]()]*${CAMPO}`);
    // La forma que caza, comprobada antes de buscarla.
    expect(comparacion.test(`if (i.author_association === "OWNER")`)).toBe(true);
    expect(comparacion.test(`c.authorAssociation?.toUpperCase() !== 'MEMBER'`)).toBe(true);
    expect(comparacion.test(`'OWNER' == x.asociacion`)).toBe(true);
    expect(comparacion.test(`esDeLaCasa(i) && i.asociacion`)).toBe(false);
    const malos = ficheros
      .map((f) => relative(RAIZ, f).replace(/\\/g, "/"))
      .filter((r) => r !== DUENO)
      .filter((r) => comparacion.test(readFileSync(join(RAIZ, r), "utf8")));
    expect(malos).toEqual([]);
  });

  it("nadie llama a esDeLaCasa con la asociación sola: se le pasa el issue o el comentario entero", () => {
    const malos = [];
    for (const f of ficheros) {
      const texto = readFileSync(f, "utf8");
      for (const m of texto.matchAll(/esDeLaCasa(?:OSinDato)?\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
        if (/asociacion|author_association|authorAssociation/.test(m[1])) malos.push(`${relative(RAIZ, f)}: ${m[0]}`);
      }
    }
    expect(malos).toEqual([]);
  });
});
