// Qué se le pregunta al dueño del proyecto, como dato (#690): el registro de cada proyecto es válido, la sección de
// CLAUDE.md es la generada y el orquestador lee el registro sin copiar la lista.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { cargarNormas } from "../scripts/lib/normas.mjs";
import {
  RUTA_CLAUDE, TIPOS_DE_ENTRADA, conSeccion, extraerSeccion, leerPreguntas, problemasDePreguntas, renderSeccion, rutaPreguntas,
} from "../scripts/lib/preguntas.mjs";
import { PROYECTO_POR_DEFECTO } from "../scripts/lib/zonasProyecto.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const normas = new Set(cargarNormas(RAIZ).todas.map((n) => n.id));
const conRegistro = readdirSync(join(RAIZ, "ops/proyectos")).filter((id) => leerPreguntas(RAIZ, id));
const datos = leerPreguntas(RAIZ, PROYECTO_POR_DEFECTO);
const claude = readFileSync(join(RAIZ, RUTA_CLAUDE), "utf8");
const orquestador = readFileSync(join(RAIZ, ".claude/agents/orquestador.md"), "utf8");

describe("registro de preguntas del proyecto", () => {
  it("el proyecto de esta carpeta tiene su registro", () => {
    expect(datos, `falta ${rutaPreguntas(PROYECTO_POR_DEFECTO)}`).not.toBeNull();
  });

  it.each(conRegistro)("%s: campos, vocabulario cerrado de tipo y normas que existen", (id) => {
    expect(problemasDePreguntas(leerPreguntas(RAIZ, id), id, normas)).toEqual([]);
  });

  it("el validador caza un tipo fuera del vocabulario, una norma que no existe y un campo sin lector", () => {
    const malo = {
      ...datos,
      entradas: [...datos.entradas, { id: "x-y", tipo: "a-veces", texto: "Algo.", norma: "no-existe", nota: "?" }],
    };
    const p = problemasDePreguntas(malo, PROYECTO_POR_DEFECTO, normas).join("\n");
    expect(p).toMatch(/tipo «a-veces»/);
    expect(p).toMatch(/norma «no-existe» no existe/);
    expect(p).toMatch(/campos que nadie lee: nota/);
  });
});

describe("la sección de CLAUDE.md sale del registro", () => {
  it("es la generada: se cambia el registro y `npm run preguntas -- --escribir`, nunca CLAUDE.md a mano", () => {
    expect(extraerSeccion(claude), "CLAUDE.md sin la sección").not.toBeNull();
    expect(extraerSeccion(claude)).toBe(renderSeccion(datos, PROYECTO_POR_DEFECTO));
  });

  it("cada entrada sale una vez, bajo el rótulo de su tipo", () => {
    const seccion = extraerSeccion(claude);
    const lineas = seccion.split("\n");
    for (const e of datos.entradas) expect(lineas.filter((l) => l === `- ${e.texto}`).length, e.id).toBe(1);
    const orden = Object.values(TIPOS_DE_ENTRADA).map((r) => seccion.indexOf(r));
    expect(orden.every((x, i) => x > (orden[i - 1] ?? -1))).toBe(true);
  });

  it("sustituir la sección no toca el resto de CLAUDE.md", () => {
    const md = "# T\n\n## Antes\n\nuno\n\n## Qué se le pregunta a X, y qué no\n\nviejo\n\n## Después\n\ndos\n";
    expect(conSeccion(md, "## Qué se le pregunta a X, y qué no\n\nnuevo")).toBe(
      "# T\n\n## Antes\n\nuno\n\n## Qué se le pregunta a X, y qué no\n\nnuevo\n\n## Después\n\ndos\n",
    );
    expect(conSeccion("# T\n\n## Otra\n", "x")).toBeNull();
  });
});

describe("el orquestador lee el registro, no una copia", () => {
  it("apunta al registro y a `npm run preguntas`, y no remite a la sección de CLAUDE.md", () => {
    expect(orquestador).toMatch(/ops\/proyectos\/<proyecto>\/preguntas\.json/);
    expect(orquestador).toMatch(/npm run preguntas/);
    expect(orquestador).not.toMatch(/CLAUDE\.md, «Qué se le pregunta/);
  });

  it("no copia ninguna entrada del registro", () => {
    for (const e of datos.entradas) expect(orquestador.includes(e.texto), e.id).toBe(false);
    // La lista de gateways que llevaba §7 a mano, en corto.
    expect(orquestador).not.toMatch(/subir o fusionar a `main`, borrar o reescribir datos de familias/);
  });
});
