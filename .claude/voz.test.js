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
  const cuerpo = lineas;
  if (!/^\*\*[^*]+\*\*/.test(cuerpo[0])) f.push("la primera línea no es la idea raíz en negrita");
  if (PREAMBULO.test(cuerpo[0].replace(/\*/g, ""))) f.push("empieza con preámbulo");
  if (EMOJI.test(texto)) f.push("lleva emojis");
  if (cuerpo.length - 1 > MAX_IDEAS) f.push("pasa de cuatro ideas");
  for (const l of lineas) {
    for (const frase of l.replace(/\*/g, "").split(/(?<=[.!?])\s+/)) {
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

/** Los bloques de un tipo (p. ej. `mensaje-corto`) de un texto. */
export function bloquesDe(texto, tipo) {
  return [...texto.matchAll(new RegExp("```" + tipo + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);
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

  it("el informe de agente: solo RESUMEN y DECISIONES PENDIENTES siguen la voz, y la decisión pide A/B/C con la recomendada", () => {
    for (const [nombre, t] of [["CLAUDE.md", claude], ["PLANTILLA-AGENTE.md", plantillaAgente], ["SKILL.md", skill]]) {
      expect(t, nombre).toMatch(/RESUMEN/);
      expect(t, nombre).toMatch(/DECISIONES PENDIENTES/);
    }
    expect(plantillaAgente).toMatch(/DECISIONES PENDIENTES: - Necesito que decidas: <pregunta> · A \(recomendada\), B y C/);
  });

  it("las tres piezas dicen que del informe de agente solo siguen la forma RESUMEN y DECISIONES PENDIENTES", () => {
    const frase = /solo el `?RESUMEN`? y las `?DECISIONES PENDIENTES`? siguen esta forma/i;
    for (const [nombre, t] of [["CLAUDE.md", claude], ["PLANTILLA-AGENTE.md", plantillaAgente], ["SKILL.md", skill]]) expect(t, nombre).toMatch(frase);
  });

  it("las tres piezas dan la misma excepción para ficheros y comandos", () => {
    for (const [nombre, t] of [["CLAUDE.md", claude], ["PLANTILLA-AGENTE.md", plantillaAgente], ["SKILL.md", skill]]) {
      expect(t, nombre).toMatch(/salvo que él los pida o los tenga que ejecutar/);
    }
  });

  it("la skill pasa el nivel 1", () => {
    const ctx = cargarContexto(RAIZ);
    const s = cargarSkill("estilo-de-respuesta", RAIZ);
    expect(faltasDeSkill(s, ctx).map((x) => `${x.regla}: ${x.mensaje ?? x.texto ?? ""}`)).toEqual([]);
  });
});

describe("las tres mejoras de calibración (10 oct) están en su sitio en las tres piezas", () => {
  // Cada pieza lo dice en SU sección, no en cualquier parte del fichero.
  const seccion = (ruta, titulo) => {
    const raw = readFileSync(join(RAIZ, ruta), "utf8");
    const ini = raw.indexOf("## " + titulo);
    expect(ini, ruta + ": falta la sección " + titulo).toBeGreaterThan(-1);
    const fin = raw.indexOf("\n## ", ini + 3);
    return raw.slice(ini, fin === -1 ? undefined : fin).replace(/\s+/g, " ");
  };
  const piezas = () => [
    ["CLAUDE.md", seccion("CLAUDE.md", "Cómo se le habla a Pablo")],
    ["PLANTILLA-AGENTE.md", seccion(".claude/PLANTILLA-AGENTE.md", "Cómo se le escribe a Pablo")],
    ["SKILL.md", seccion(".claude/skills/estilo-de-respuesta/SKILL.md", "Método")],
  ];
  const todas = (re) => piezas().forEach(([n, t]) => expect(t, n).toMatch(re));

  it("la forma es un techo, no un molde, y una pregunta corta se contesta con la idea raíz", () => {
    todas(/techo, no un molde/);
    todas(/idea raíz y, si hace falta, una línea/);
  });

  it("la certeza va en una línea «Certeza:» con las tres palabras: Comprobado, Creo y No sé", () => {
    todas(/«Certeza:»/);
    for (const w of ["«Comprobado»", "«Creo»", "«No sé»"]) todas(new RegExp(w));
  });

  it("un issue se nombra por su nombre y el número va solo entre paréntesis, detrás", () => {
    todas(/issue se nombra por su nombre; el número, si hace falta, va solo entre paréntesis, detrás/);
  });

  it("al retomar un tema, la idea raíz en negrita lo recuerda, sin línea aparte", () => {
    todas(/«\*\*Seguimos con X: falta Y\.\*\*»/);
    for (const [n, t] of piezas()) expect(t, n).not.toMatch(/Dónde estábamos/);
  });

  it("cada opción lleva su «Coste:» y «reversible» o «no se puede deshacer»", () => {
    todas(/«Coste:»/);
    todas(/«reversible»/);
    todas(/«no se puede deshacer»/);
  });

  it("la skill guarda la lección del «fusionado» dicho antes de tiempo", () => {
    expect(leer(".claude/skills/estilo-de-respuesta/SKILL.md")).toMatch(/dijo «fusionado».{0,200}guardia había frenado/);
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

  it("cada opción de la decisión lleva coste y reversibilidad en su línea", () => {
    const d = bloques[PLANTILLAS.indexOf("decisión")];
    const opciones = d.split("\n").filter((l) => /^[ABC]( \(recomendada\))?:/.test(l));
    expect(opciones.length).toBe(3);
    for (const o of opciones) {
      expect(o, o).toMatch(/Coste:/);
      expect(o, o).toMatch(/reversible|no se puede deshacer/i);
    }
  });

  it("una respuesta de una sola línea es válida (la forma es un techo)", () => {
    const cortos = bloquesDe(texto, "mensaje-corto");
    expect(cortos.length).toBeGreaterThanOrEqual(1);
    for (const c of cortos) {
      expect(c.trim().split("\n").filter(Boolean).length, c).toBeLessThanOrEqual(2);
      expect(faltasDeMensaje(c), c).toEqual([]);
    }
    expect(faltasDeMensaje("**Sí, está en staging.**")).toEqual([]);
  });

  it("el ejemplo de certeza usa «Certeza:» con las tres palabras, y «Creo» dice en qué se basa", () => {
    const [cert] = bloquesDe(texto, "mensaje-certeza");
    for (const w of ["Certeza: Comprobado", "Certeza: Creo que", "Certeza: No sé"]) expect(cert, w).toContain(w);
    expect(cert).toMatch(/Certeza: Creo que [^\n]*, porque /);
    expect(faltasDeMensaje(cert)).toEqual([]);
    for (const c of bloquesDe(texto, "mensaje-corto")) expect(c, "corto").toMatch(/Certeza: (Comprobado|Creo|No sé)/);
  });

  it("el ejemplo de retomar recuerda el tema dentro de la idea raíz, nombra el issue y fundamenta el «no se puede deshacer»", () => {
    const [retoma] = bloquesDe(texto, "mensaje-retoma");
    expect(retoma.trim().split("\n")[0]).toMatch(/^\*\*Seguimos con [^*]+\*\*$/);
    expect(faltasDeMensaje(retoma)).toEqual([]);
    expect(retoma).toMatch(/el vigilante de la voz \(#453\)/);
    for (const l of retoma.split("\n").filter((l) => /no se puede deshacer/i.test(l))) expect(l, l).toMatch(/Comprobado|Creo/);
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

const RAIZ_OK = "**Todo bien.**\n";

describe("el medidor de la voz ve fallar lo que debe", () => {
  it("una frase de 40 palabras, sin preámbulo, falla por larga", () => {
    const larga = Array.from({ length: 40 }, (_, i) => "palabra" + i).join(" ") + ".";
    const faltas = faltasDeMensaje(RAIZ_OK + larga);
    expect(faltas.join("|")).toMatch(/frase de 40/);
    expect(faltas.join("|")).not.toMatch(/preámbulo/);
  });

  it("el umbral es de verdad 25: 24 palabras pasan y 25 fallan", () => {
    const frase = (n) => Array.from({ length: n }, (_, i) => "w" + i).join(" ") + ".";
    expect(faltasDeMensaje(RAIZ_OK + frase(24))).toEqual([]);
    expect(faltasDeMensaje(RAIZ_OK + frase(25)).join("|")).toMatch(/frase de 25/);
  });

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

  it("sin excepción: un recordatorio en línea aparte antes de la idea raíz falla", () => {
    expect(faltasDeMensaje("**Seguimos con el test: falta una prueba.**")).toEqual([]);
    expect(faltasDeMensaje("Dónde estábamos: el test.\n**Listo.**").join("|")).toMatch(/idea raíz/);
  });

  it("una línea que no nombra las cinco plantillas no vale", () => {
    expect(nombraPlantillas("Plantillas fijas: resultado, decisión y error.")).toBe(false);
    expect(nombraPlantillas("Plantillas fijas: resultado, decisión, error, concepto y resumen (x).")).toBe(true);
  });
});
