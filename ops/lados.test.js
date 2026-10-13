import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_TECHOS, fallosDeSubida, fallosDeTechos, medirLados } from "../scripts/lib/lados.mjs";
import { cargarNormas, problemasDeProyectos } from "../scripts/lib/normas.mjs";

/**
 * El vigilante de lados (#710, parte de #652). Una pieza horizontal (vale para cualquier proyecto) no cita una vertical
 * (solo vale para un proyecto): ni un estándar nombra el proyecto o recibe una norma suya, ni una norma horizontal cita
 * un principio vertical, ni un principio cita como fuente una ruta de producto. Las piezas que no se saben asignar
 * (dudas) también cuentan. Todas las cifras tienen un techo en ops/lados-techos.json que solo baja. Cada comprobación
 * es una función pura y se prueba con datos buenos y con datos rotos (un test que nunca ha fallado no demuestra nada).
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const techos = JSON.parse(readFileSync(join(RAIZ, RUTA_TECHOS), "utf8"));
const medida = medirLados(RAIZ);

// El mismo fichero en origin/staging, sin red; null si no se puede leer (rama sin la referencia o fichero nuevo).
const deStaging = () => {
  try {
    return JSON.parse(execFileSync("git", ["show", `origin/staging:${RUTA_TECHOS}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch { return null; }
};

describe("los lados de cada registro, sobre el repo de hoy", () => {
  it("cada cifra de dudas y de citas está en su techo, sin holgura (si baja, se baja el techo)", () => {
    const detalle = Object.entries(medida.detalle).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.slice(0, 5).join("; ")}`);
    expect(fallosDeTechos(medida, techos), `Citas de hoy:\n${detalle.join("\n")}`).toEqual([]);
  });

  it("las citas duras de un id vertical desde una horizontal son cero", () => {
    expect(medida.citas.estandar_recibe_norma_vertical).toBe(0);
    expect(medida.citas.norma_cita_principio_vertical).toBe(0);
  });

  it("cada norma está en el registro de su lado y su project es un proyecto que existe", () => {
    const proyectos = JSON.parse(readFileSync(join(RAIZ, "ops/entidades.json"), "utf8")).projects.map((p) => p.id);
    expect(problemasDeProyectos(cargarNormas(RAIZ), proyectos)).toEqual([]);
  });

  it("los techos no suben respecto a origin/staging (si se puede leer sin red)", () => {
    expect(fallosDeSubida(techos, deStaging())).toEqual([]);
  });
});

describe("las comprobaciones, con datos rotos (casos negativos)", () => {
  const m = { dudas: { normas: 2 }, citas: { estandar_nombra_proyecto: 1 } };
  const t = { dudas: { normas: 2 }, citas: { estandar_nombra_proyecto: 1 } };

  it("datos buenos: sin fallos", () => expect(fallosDeTechos(m, t)).toEqual([]));

  it("una cita nueva pasa del techo", () => {
    expect(fallosDeTechos({ ...m, citas: { estandar_nombra_proyecto: 2 } }, t)).toEqual(["citas.estandar_nombra_proyecto: 2 pasa del techo 1"]);
  });

  it("una cita de un tipo sin techo falla, también si vale 0 en el techo", () => {
    expect(fallosDeTechos({ ...m, citas: { ...m.citas, estandar_recibe_norma_vertical: 1 } }, t)).toEqual(["citas.estandar_recibe_norma_vertical: hay 1 y no tiene techo en ops/lados-techos.json"]);
    expect(fallosDeTechos({ ...m, citas: { ...m.citas, x: 1 } }, { ...t, citas: { ...t.citas, x: 0 } })).toEqual(["citas.x: 1 pasa del techo 0"]);
  });

  it("una duda nueva en una capa pasa del techo", () => {
    expect(fallosDeTechos({ ...m, dudas: { normas: 3 } }, t)).toHaveLength(1);
  });

  it("un techo con holgura (la cifra bajó) pide bajarlo", () => {
    expect(fallosDeTechos({ ...m, dudas: { normas: 1 } }, t)).toEqual(["dudas.normas: hay 1 y el techo es 2; bájalo a 1"]);
  });

  it("una capa que ya no tiene dudas puede dejar el techo en 0, pero no sin techo", () => {
    expect(fallosDeTechos({ dudas: {}, citas: {} }, { dudas: { normas: 0 }, citas: {} })).toEqual([]);
    expect(fallosDeTechos({ dudas: {}, citas: {} }, { dudas: { normas: 1 }, citas: {} })).toHaveLength(1);
  });

  it("un techo que sube respecto a staging falla; uno que baja o igual, no; sin staging, no hay qué comparar", () => {
    expect(fallosDeSubida({ dudas: { normas: 3 }, citas: {} }, { dudas: { normas: 2 }, citas: {} })).toHaveLength(1);
    expect(fallosDeSubida({ dudas: { normas: 1 }, citas: {} }, { dudas: { normas: 2 }, citas: {} })).toEqual([]);
    expect(fallosDeSubida(t, null)).toEqual([]);
  });

  it("una norma horizontal marcada vertical, o una vertical con un project que no existe, se denuncia", () => {
    const carga = { horizontales: [{ id: "a", lado: "vertical" }], ficheros: { x: { project: "x", normas: [{ id: "b", lado: "vertical", project: "x" }] } } };
    expect(problemasDeProyectos(carga, ["p"])).toHaveLength(3);
  });
});
