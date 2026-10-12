import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Los bloques de N1 (A a Q) como dato: `ops/diseno/bloques.json` contra las tablas de
 * `docs/diseno/META-DISENO.md` (#591, paso 2 del orden). El documento explica y el
 * JSON es lo que lee la skill `revision-de-diseno`; si uno cambia sin el otro, falla.
 * Cada regla se ve fallar abajo, con un dato roto a propósito.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC = readFileSync(join(RAIZ, "docs", "diseno", "META-DISENO.md"), "utf8").replace(/\r\n/g, "\n");
const DATOS = JSON.parse(readFileSync(join(RAIZ, "ops", "diseno", "bloques.json"), "utf8"));

const MARCA = { "●": "obligatorio", "○": "opcional", "–": "no_aplica" };
const IDS = "ABCDEFGHIJKLMNOPQ".split("");

/** El texto de un bloque N1: desde «### X. Nombre» hasta el siguiente «###» o «##». */
function seccionDeBloque(doc, id) {
  const m = doc.match(new RegExp(`^### ${id}\\. (.+)$`, "m"));
  if (!m) return null;
  const desde = m.index + m[0].length;
  const resto = doc.slice(desde);
  const fin = resto.search(/^##+ /m);
  return { nombre: m[1].replace(/\s*\(.*\)\s*$/, "").trim(), texto: fin < 0 ? resto : resto.slice(0, fin) };
}

/** Las celdas de la primera columna de las tablas de un texto, sin la cabecera ni el separador. */
function primeraColumna(texto) {
  return texto
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[\s-|]+\|$/.test(l))
    .slice(1)
    .map((l) => l.split("|")[1].trim());
}

const entreAcentos = (celda) => [...celda.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** La matriz «qué bloques obligan en cada perfil» del documento: id → { P1…P6 }. */
function matrizDelDoc(doc) {
  const i = doc.indexOf("### Qué bloques de N1 obligan en cada perfil");
  const filas = doc.slice(i).split("\n").filter((l) => /^\| [A-Q]\. /.test(l));
  const out = {};
  for (const f of filas) {
    const c = f.split("|").map((x) => x.trim()).filter((x) => x !== "");
    const [, id, nombre] = c[0].match(/^([A-Q])\. (.+)$/);
    out[id] = { nombre, ...Object.fromEntries(c.slice(1).map((x, k) => [`P${k + 1}`, MARCA[x]])) };
  }
  return out;
}

/** Los vocabularios cerrados del documento: «**nombre** (a, b, c)». */
function vocabulariosDelDoc(doc) {
  const i = doc.indexOf("### Vocabularios cerrados de N1");
  const fin = doc.indexOf("\n## 4.", i);
  const texto = doc.slice(i, fin).replace(/\n/g, " ");
  return Object.fromEntries([...texto.matchAll(/\*\*([^*]+)\*\* \(([^)]*)\)/g)].map((m) => [m[1], m[2].split(",").map((x) => x.trim())]));
}

/** Compara el dato con el documento y devuelve los problemas (vacío = bien). */
export function problemas(datos, doc) {
  const malos = [];
  const matriz = matrizDelDoc(doc);
  const ids = datos.bloques.map((b) => b.id);
  if (ids.join("") !== IDS.join("")) malos.push(`los bloques son ${ids.join("")} y deben ser ${IDS.join("")}, en orden`);
  const perfiles = Object.keys(datos.perfiles);
  for (const b of datos.bloques) {
    const sec = seccionDeBloque(doc, b.id);
    if (!sec) { malos.push(`${b.id}: no hay «### ${b.id}.» en META-DISENO.md`); continue; }
    if (sec.nombre !== b.nombre) malos.push(`${b.id}: se llama «${b.nombre}» y el documento dice «${sec.nombre}»`);
    if (!Array.isArray(b.elementos) || b.elementos.length === 0) malos.push(`${b.id}: sin elementos`);
    for (const p of perfiles) {
      if (!datos.obligaciones.includes(b.obligacion?.[p])) malos.push(`${b.id}/${p}: obligación «${b.obligacion?.[p]}» fuera del vocabulario`);
      else if (matriz[b.id]?.[p] !== b.obligacion[p]) malos.push(`${b.id}/${p}: dice ${b.obligacion[p]} y la matriz del documento ${matriz[b.id]?.[p]}`);
    }
    if (matriz[b.id] && !b.nombre.startsWith(matriz[b.id].nombre)) malos.push(`${b.id}: la matriz lo llama «${matriz[b.id].nombre}», que no es el principio de «${b.nombre}»`);
    // Ficha, donde el documento la da.
    let esperada = null;
    if (b.id === "C") esperada = entreAcentos(sec.texto.split("\n").find((l) => l.startsWith("**Ficha de token:**")) ?? "");
    if (b.id === "D" || b.id === "Q") esperada = primeraColumna(sec.texto).flatMap(entreAcentos);
    if (b.id === "E") esperada = (sec.texto.replace(/\n/g, " ").match(/Cada patrón lleva: ([^.]+)\./)?.[1] ?? "").split(",").map((x) => x.trim());
    if (esperada) {
      if (JSON.stringify(b.ficha) !== JSON.stringify(esperada)) malos.push(`${b.id}: la ficha es ${JSON.stringify(b.ficha)} y el documento pide ${JSON.stringify(esperada)}`);
    } else if (b.ficha !== undefined) malos.push(`${b.id}: lleva ficha y el documento no la define`);
    // Elementos, donde el documento los da en una tabla (A en texto plano, B en negrita).
    if (b.id === "A" || b.id === "B") {
      const del = primeraColumna(sec.texto).map((c) => c.replace(/\*\*/g, ""));
      if (JSON.stringify(b.elementos) !== JSON.stringify(del)) malos.push(`${b.id}: los elementos son ${JSON.stringify(b.elementos)} y la tabla del documento ${JSON.stringify(del)}`);
    }
  }
  for (const id of Object.keys(matriz)) if (!ids.includes(id)) malos.push(`${id}: está en la matriz del documento y no en el dato`);
  // Vocabularios cerrados.
  const delDoc = vocabulariosDelDoc(doc);
  const tiposToken = entreAcentos(primeraColumnaYSegunda(doc, "Tipos"));
  for (const [nombre, valores] of Object.entries(datos.vocabularios)) {
    const ref = nombre === "tipos de token" ? tiposToken : delDoc[nombre];
    if (!ref) malos.push(`vocabulario «${nombre}»: no está en el documento`);
    else if (JSON.stringify(valores) !== JSON.stringify(ref)) malos.push(`vocabulario «${nombre}»: ${JSON.stringify(valores)} y el documento ${JSON.stringify(ref)}`);
    if (new Set(valores).size !== valores.length) malos.push(`vocabulario «${nombre}»: valores repetidos`);
  }
  for (const nombre of Object.keys(delDoc)) if (!(nombre in datos.vocabularios)) malos.push(`vocabulario «${nombre}»: está en el documento y no en el dato`);
  return malos;
}

/** La segunda columna de la fila `| Tipos | … |` del bloque C (los tipos de token del DTCG). */
function primeraColumnaYSegunda(doc, fila) {
  const sec = seccionDeBloque(doc, "C");
  const l = sec.texto.split("\n").find((x) => x.startsWith(`| ${fila} |`)) ?? "";
  return l.split("|")[2] ?? "";
}

const copia = (x) => JSON.parse(JSON.stringify(x));

describe("ops/diseno/bloques.json contra META-DISENO.md", () => {
  it("el dato y el documento dicen lo mismo", () => {
    expect(problemas(DATOS, DOC)).toEqual([]);
  });

  it("hay 17 bloques, de la A a la Q, y seis perfiles", () => {
    expect(DATOS.bloques.map((b) => b.id).join("")).toBe(IDS.join(""));
    expect(Object.keys(DATOS.perfiles)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6"]);
  });

  it("todo bloque obligatorio para un perfil tiene elementos que cubrir", () => {
    for (const b of DATOS.bloques) expect(b.elementos.length, b.id).toBeGreaterThan(0);
  });
});

describe("el test de los bloques se ve fallar", () => {
  it("un perfil cambiado en el dato se nota", () => {
    const d = copia(DATOS);
    d.bloques[0].obligacion.P5 = "obligatorio";
    expect(problemas(d, DOC).join("\n")).toMatch(/A\/P5: dice obligatorio y la matriz del documento opcional/);
  });

  it("un bloque que falta se nota", () => {
    const d = copia(DATOS);
    d.bloques.pop();
    expect(problemas(d, DOC).join("\n")).toMatch(/los bloques son ABCDEFGHIJKLMNOP/);
  });

  it("un campo de la ficha de componente cambiado se nota", () => {
    const d = copia(DATOS);
    d.bloques.find((b) => b.id === "D").ficha.pop();
    expect(problemas(d, DOC).join("\n")).toMatch(/D: la ficha es/);
  });

  it("un valor nuevo en un vocabulario sin tocar el documento se nota", () => {
    const d = copia(DATOS);
    d.vocabularios.temas.push("sepia");
    expect(problemas(d, DOC).join("\n")).toMatch(/vocabulario «temas»/);
  });

  it("un vocabulario que el documento añade y el dato no, se nota", () => {
    const doc = DOC.replace(/\*\*superficies\*\* \(app, web,\s+bot, correo, impreso\)/, "**superficies** (app, web, bot, correo, impreso); **ritmos** (lento, rápido)");
    expect(problemas(DATOS, doc).join("\n")).toMatch(/«ritmos»: está en el documento y no en el dato/);
  });

  it("una obligación fuera del vocabulario se nota", () => {
    const d = copia(DATOS);
    d.bloques[3].obligacion.P1 = "quizá";
    expect(problemas(d, DOC).join("\n")).toMatch(/D\/P1: obligación «quizá» fuera del vocabulario/);
  });
});
