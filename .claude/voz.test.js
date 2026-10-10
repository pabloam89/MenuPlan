import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cargarContexto, cargarSkill, faltasDeSkill } from "../scripts/lib/skills.mjs";

/**
 * La voz con Pablo (10 oct 2026): una regla corta en CLAUDE.md, el detalle en la
 * skill `estilo-de-respuesta` y un resumen en la plantilla de agentes. Aquí se vigila
 * lo medible: que las tres piezas nombren las mismas cinco plantillas y la regla
 * de las tres opciones, que la skill pase el nivel 1 y que los ejemplos
 * canónicos (bloques `mensaje`) cumplan las reglas medibles de la propia voz.
 * Lo que no se mide (si el tono suena bien) lo mira el revisor.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8").replace(/\s+/g, " ");

export const PLANTILLAS = ["resultado", "decisión", "error", "concepto", "resumen"];
export const MAX_PALABRAS_FRASE = 25;
export const MAX_FRASES_PARRAFO = 5;
export const MAX_IDEAS = 4;
const PREAMBULO = /^\s*(claro|por supuesto|vale|perfecto|genial|desde luego)[,.!\s]/i;
const EMOJI = /\p{Extended_Pictographic}/u;

/** Las faltas de un mensaje a Pablo contra las reglas medibles de la voz. */
export function faltasDeMensaje(texto) {
  const f = [];
  const lineas = texto.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return ["mensaje vacío"];
  if (!/^\*\*[^*]+\*\*/.test(lineas[0])) f.push("la primera línea no es la idea raíz en negrita");
  if (PREAMBULO.test(lineas[0].replace(/\*/g, ""))) f.push("empieza con preámbulo");
  if (EMOJI.test(texto)) f.push("lleva emojis");
  if (lineas.length - 1 > MAX_IDEAS + 2) f.push("pasa de cuatro ideas");
  for (const l of lineas) {
    for (const frase of l.replace(/\*/g, "").split(/(?<=[.!?:;])\s+/)) {
      const n = frase.split(/\s+/).filter(Boolean).length;
      if (n >= MAX_PALABRAS_FRASE) f.push(`frase de ${n} palabras: «${frase.slice(0, 40)}…»`);
    }
    if (l.split(/(?<=[.!?])\s+/).length > MAX_FRASES_PARRAFO) f.push("párrafo de más de cinco frases");
  }
  return f;
}

/** Los bloques ```mensaje de un texto. */
export function bloquesMensaje(texto) {
  return [...texto.matchAll(/```mensaje\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** ¿El texto nombra las cinco plantillas en su línea de «plantillas fijas»? */
export function nombraPlantillas(texto) {
  const m = texto.match(/[Pp]lantillas fijas:([^.]*)\./);
  if (!m) return false;
  return PLANTILLAS.every((p) => m[1].includes(p));
}

describe("las tres piezas de la voz dicen lo mismo", () => {
  const claude = leer("CLAUDE.md");
  const skill = leer(".claude/skills/estilo-de-respuesta/SKILL.md");
  const plantillaAgente = leer(".claude/PLANTILLA-AGENTE.md");

  it("CLAUDE.md y la plantilla de agentes nombran las cinco plantillas", () => {
    expect(nombraPlantillas(claude), "CLAUDE.md").toBe(true);
    expect(nombraPlantillas(plantillaAgente), "PLANTILLA-AGENTE.md").toBe(true);
  });

  it("la skill describe las cinco plantillas con su fila de la tabla", () => {
    for (const p of PLANTILLAS) expect(skill, p).toMatch(new RegExp(`\\| ${p} \\|`));
  });

  it("las tres piezas piden tres opciones, la recomendada primero", () => {
    for (const [nombre, t] of [["CLAUDE.md", claude], ["PLANTILLA-AGENTE.md", plantillaAgente], ["SKILL.md", skill]]) {
      expect(t, nombre).toMatch(/tres opciones/);
      expect(t, nombre).toMatch(/recomendada primero/);
    }
  });

  it("CLAUDE.md y la plantilla de agentes apuntan a la skill, y la regla de CLAUDE.md está en su sitio", () => {
    expect(claude).toMatch(/skill `estilo-de-respuesta`/);
    expect(plantillaAgente).toMatch(/skill `estilo-de-respuesta`/);
    expect(claude).toMatch(/## Cómo se le habla a Pablo/);
    expect(claude).toMatch(/`estilo-de-respuesta`\s*\(cómo\s+se\s+escribe\s+a\s+Pablo/);
  });

  it("la skill pasa el nivel 1", () => {
    const ctx = cargarContexto(RAIZ);
    const s = cargarSkill("estilo-de-respuesta", RAIZ);
    expect(faltasDeSkill(s, ctx).map((x) => `${x.regla}: ${x.mensaje ?? x.texto ?? ""}`)).toEqual([]);
  });
});

describe("los ejemplos canónicos cumplen la voz", () => {
  const texto = readFileSync(join(RAIZ, ".claude/skills/estilo-de-respuesta/plantillas/plantillas.md"), "utf8");
  const bloques = bloquesMensaje(texto);

  it("hay un ejemplo por plantilla", () => expect(bloques.length).toBe(PLANTILLAS.length));

  it("cada ejemplo cumple las reglas medibles", () => {
    bloques.forEach((b, i) => expect(faltasDeMensaje(b), `ejemplo ${i + 1}`).toEqual([]));
  });

  it("la decisión da tres opciones A, B y C con la recomendada primero y cierra con la letra", () => {
    const d = bloques[PLANTILLAS.indexOf("decisión")];
    expect(d).toMatch(/^\*\*Necesito que decidas:/);
    expect(d).toMatch(/^A \(recomendada\):/m);
    expect(d).toMatch(/^B:/m);
    expect(d).toMatch(/^C:/m);
    expect(d.trim().split("\n").pop()).toBe("Respóndeme con la letra.");
  });

  it("cada plantilla usa sus etiquetas", () => {
    const etiquetas = {
      resultado: ["Qué cambia para ti:", "Siguiente paso:"],
      error: ["Qué pasa:", "Qué he probado:", "Qué hace falta y de quién:"],
      concepto: ["Para qué te sirve:", "Ejemplo:"],
      resumen: ["Lo único que te toca a ti:"],
    };
    for (const [p, es] of Object.entries(etiquetas)) for (const e of es) expect(bloques[PLANTILLAS.indexOf(p)], `${p}: ${e}`).toContain(e);
  });
});

describe("el medidor de la voz ve fallar lo que debe", () => {
  it("un mensaje largo, con preámbulo y sin idea raíz, falla", () => {
    const malo = "Claro, voy a contarte lo que he hecho en la rama y en el fichero que toca, que además tiene muchas cosas que contar y que sigue y sigue sin parar.";
    const faltas = faltasDeMensaje(malo);
    expect(faltas.join("|")).toMatch(/idea raíz/);
    expect(faltas.join("|")).toMatch(/preámbulo|frase de/);
  });

  it("un emoji y seis ideas fallan", () => {
    const m = "**Listo.**\na\nb\nc\nd\ne\nf\ng 🎉";
    const f = faltasDeMensaje(m).join("|");
    expect(f).toMatch(/emojis/);
    expect(f).toMatch(/cuatro ideas/);
  });

  it("una línea que no nombra las cinco plantillas no vale", () => {
    expect(nombraPlantillas("Plantillas fijas: resultado, decisión y error.")).toBe(false);
    expect(nombraPlantillas("Plantillas fijas: resultado, decisión, error, concepto y resumen (x).")).toBe(true);
  });
});
