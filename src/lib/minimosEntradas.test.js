// Ninguna entrada que genera un menú o una semana lo hace sin pasar por el
// mínimo para generar (#1072; trozo 2 de specs/plan-fichas-con-estado.md,
// decisión B de Pablo del 30 oct 2026: sin alergias confirmadas no se genera,
// se pregunta). La comprobación vive en un solo sitio, minimosQueFaltan
// (minimosParaGenerar.js); en la app la envuelve pararSiFaltanMinimos
// (App.jsx), que además abre la pantalla de alergias.
//
// La clase no se mantiene a mano: el test la saca del código de dos maneras.
//   1. Toda función de src/ o api/ que llama a una primitiva que crea una
//      semana (el motor, `generateMenuWithAI`, o un menú nuevo, `createMenuId`)
//      tiene que llamar antes a una puerta. Una entrada nueva que genere sin
//      ella hace fallar el test, se llame como se llame.
//   2. Toda capacidad con verbo «generar» (capacidades.js) tiene su función en
//      ENTRADAS y esa función pasa por la puerta: así entra también lo que
//      rellena una semana sin llamar a esas primitivas (rehacer un día).

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import * as espree from "espree";
import { describe, expect, it } from "vitest";

import { CAPACIDADES } from "./capacidades.js";

const RAIZ = join(import.meta.dirname, "..", "..");

/** Lo que crea una semana o un menú. */
const PRIMITIVAS = ["generateMenuWithAI", "createMenuId"];
/** Las puertas: la comprobación y su envoltorio de la app (que tiene que llamarla). */
const COMPROBACION = "minimosQueFaltan";
const PUERTAS = [COMPROBACION, "pararSiFaltanMinimos"];

/**
 * Capacidad con verbo «generar» → las funciones que la hacen («fichero:función»).
 * Lola: sus herramientas acaban todas en generarMenu (agente.js generar_menu y
 * la vía rápida de turno.js), que es la que lleva la puerta.
 */
const ENTRADAS = {
  generar_menu: ["src/App.jsx:regenerateMenu", "api/_bot/generar.js:generarMenu"],
  asistente_menu: ["src/App.jsx:regenerateMenu"],
  regenerar_dia: ["src/App.jsx:handleRegenerateDay", "api/_bot/generar.js:generarMenu"],
  pizarra: ["src/App.jsx:handleStartPizarra"],
};

/** Funciones con una primitiva que no generan, con su porqué. No se añade sin motivo. */
const EXENTAS = {
  // Al cargar datos de antes, archiva el menú que ya había en state.menuPlan: no elige platos ni crea semana nueva.
  "src/App.jsx:migrate": "archiva el menú que ya existía",
};

function ficheros(dir) {
  return readdirSync(join(RAIZ, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(m?js|jsx)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name))
    .map((e) => relative(RAIZ, join(e.parentPath, e.name)).replaceAll("\\", "/"));
}

const arbol = new Map();
function parsear(fichero) {
  if (!arbol.has(fichero)) {
    const codigo = readFileSync(join(RAIZ, fichero), "utf8");
    arbol.set(fichero, espree.parse(codigo, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true }));
  }
  return arbol.get(fichero);
}

const nombreLlamado = (n) => (n.callee.type === "Identifier" ? n.callee.name : n.callee.type === "MemberExpression" && !n.callee.computed ? n.callee.property.name : null);

/** El nombre si el nodo es una función con nombre: `function f`, `const f = () =>` o `const f = useCallback(() =>`. */
function nombreDeFuncion(n, padre) {
  if (n.type === "FunctionDeclaration") return n.id?.name ?? null;
  if (n.type !== "FunctionExpression" && n.type !== "ArrowFunctionExpression") return null;
  if (padre?.type === "VariableDeclarator") return padre.id.name;
  return null;
}

/** Recorre el árbol guardando la pila de funciones con nombre; `fn(nodo, funciones)`. */
function recorrer(n, fn, padre = null, pila = []) {
  if (!n || typeof n.type !== "string") return;
  let nombre = nombreDeFuncion(n, padre);
  // const f = useCallback(async () => …): el nombre es el de la variable.
  if (!nombre && (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression") && padre?.type === "CallExpression" && nombreLlamado(padre) === "useCallback" && padre.__declarada) nombre = padre.__declarada;
  if (n.type === "VariableDeclarator" && n.init?.type === "CallExpression" && nombreLlamado(n.init) === "useCallback") n.init.__declarada = n.id.name;
  const aqui = nombre ? [...pila, { nombre, nodo: n }] : pila;
  fn(n, aqui);
  for (const [k, v] of Object.entries(n)) {
    if (k === "parent" || k.startsWith("__")) continue;
    if (Array.isArray(v)) for (const h of v) recorrer(h, fn, n, aqui);
    else if (v && typeof v.type === "string") recorrer(v, fn, n, aqui);
  }
}

/** Las llamadas dentro de un nodo, con su posición. */
function llamadas(nodo) {
  const out = [];
  recorrer(nodo, (n) => {
    if (n.type === "CallExpression") out.push({ nombre: nombreLlamado(n), en: n.range[0] });
  });
  return out;
}

/** Todas las funciones con nombre de un fichero, por nombre (la de más fuera si se repite). */
function funciones(fichero) {
  const out = new Map();
  recorrer(parsear(fichero), (n, pila) => {
    const f = pila.at(-1);
    if (f?.nodo === n && !out.has(f.nombre)) out.set(f.nombre, n);
  });
  return out;
}

/** «fichero:función» → la primera llamada a una primitiva dentro de ella. */
function generadoras() {
  const out = new Map();
  for (const fichero of [...ficheros("src"), ...ficheros("api")]) {
    const codigo = readFileSync(join(RAIZ, fichero), "utf8");
    if (!PRIMITIVAS.some((p) => codigo.includes(`${p}(`))) continue;
    recorrer(parsear(fichero), (n, pila) => {
      if (n.type !== "CallExpression" || !PRIMITIVAS.includes(nombreLlamado(n))) return;
      // La función con nombre más cercana: un callback anónimo dentro de regenerateMenu es de regenerateMenu.
      const f = pila.at(-1);
      const clave = `${fichero}:${f?.nombre ?? "(fuera de una función)"}`;
      if (!out.has(clave) || out.get(clave).en > n.range[0]) out.set(clave, { en: n.range[0], nodo: f?.nodo });
    });
  }
  return out;
}

/** ¿La función llama a una puerta antes de la posición `antesDe` (o en algún sitio)? */
function pasaPorLaPuerta(nodo, antesDe = Infinity) {
  return llamadas(nodo).some((l) => PUERTAS.includes(l.nombre) && l.en < antesDe);
}

describe("el mínimo para generar en todas las entradas (#1072)", () => {
  const gen = generadoras();

  it("encuentra las primitivas (si no, el test no mira nada)", () => {
    expect([...gen.keys()]).toEqual(expect.arrayContaining(["src/App.jsx:regenerateMenu", "api/_bot/generar.js:generarMenu", "src/App.jsx:handleStartPizarra", "src/App.jsx:reuseMenu"]));
  });

  it("toda función que crea un menú o una semana pasa antes por la puerta", () => {
    const sinPuerta = [...gen].filter(([clave, { nodo, en }]) => !EXENTAS[clave] && !(nodo && pasaPorLaPuerta(nodo, en))).map(([clave]) => clave);
    expect(sinPuerta).toEqual([]);
  });

  it("toda capacidad que genera tiene sus funciones en ENTRADAS, y pasan por la puerta", () => {
    const generan = CAPACIDADES.filter((c) => c.verbo === "generar").map((c) => c.id);
    expect(Object.keys(ENTRADAS).sort()).toEqual(generan.sort());
    const sinPuerta = [];
    for (const lista of Object.values(ENTRADAS)) {
      for (const clave of lista) {
        const [fichero, nombre] = clave.split(":");
        const nodo = funciones(fichero).get(nombre);
        expect(nodo, `${clave} no existe`).toBeTruthy();
        if (!pasaPorLaPuerta(nodo)) sinPuerta.push(clave);
      }
    }
    expect([...new Set(sinPuerta)]).toEqual([]);
  });

  it("el envoltorio de la app llama a la comprobación, no la copia", () => {
    const nodo = funciones("src/App.jsx").get("pararSiFaltanMinimos");
    expect(nodo, "pararSiFaltanMinimos no existe en App.jsx").toBeTruthy();
    expect(llamadas(nodo).map((l) => l.nombre)).toContain(COMPROBACION);
  });

  it("las exentas siguen existiendo y siguen sin puerta (si no, sobran)", () => {
    for (const clave of Object.keys(EXENTAS)) {
      expect(gen.has(clave), `${clave} ya no crea menú: sobra en EXENTAS`).toBe(true);
      expect(pasaPorLaPuerta(gen.get(clave).nodo), `${clave} ya pasa por la puerta: sobra en EXENTAS`).toBe(false);
    }
  });
});
