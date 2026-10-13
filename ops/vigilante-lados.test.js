import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarNormas, problemasDeProyectos } from "../scripts/lib/normas.mjs";
import { calcular } from "../scripts/lib/inventarioVertical.mjs";
import { RUTA_TECHOS, citasAVertical, fallosDeSubida, fallosDeTechos, leerTechos, medir } from "../scripts/lib/vigilanteLados.mjs";

/**
 * El vigilante de lados (#710, programa #652, punto 7). Dos cosas, las dos con datos rotos probados abajo:
 *  - ninguna pieza horizontal cita una vertical (norma → principio, estándar → norma, lado/project de cada registro);
 *  - los techos de ops/techos-lados.json: las cifras del inventario vertical no suben, y al bajar hay que bajar el techo.
 * La clasificación es la de scripts/lib/inventarioVertical.mjs; las normas, las de ops/uniones.test.js (aquí se reutilizan).
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => JSON.parse(readFileSync(join(RAIZ, ruta), "utf8"));
const ent = leer("ops/entidades.json");
const carga = cargarNormas(RAIZ);
const inv = calcular(RAIZ);

describe("ninguna horizontal cita una vertical, sobre el repo de hoy", () => {
  it("cada registro de normas está en su lado: lado y project coinciden con el registro", () => {
    expect(problemasDeProyectos(carga, ent.projects.map((p) => p.id))).toEqual([]);
  });

  it("ninguna norma horizontal tiene como principio uno vertical", () => {
    const citas = citasAVertical({ principiosVerticales: inv.cifras.principiosVerticales, normasHorizontales: carga.horizontales, entidades: ent.entities, relaciones: [] });
    expect(citas.normaAPrincipio).toEqual([]);
  });

  it("las citas de entidades horizontales a verticales no suben del techo (hoy hay tres: repo y person, pendientes de Pablo)", () => {
    const citas = citasAVertical({ principiosVerticales: [], normasHorizontales: [], entidades: ent.entities, relaciones: ent.relations });
    expect(citas.entidadAEntidad.length).toBeLessThanOrEqual(leerTechos(RAIZ).citas_de_entidad_horizontal_a_vertical);
  });
});

// El mismo fichero en origin/staging, sin red; null si no se puede leer (rama sin la referencia o fichero nuevo).
const techosDeStaging = () => {
  try {
    return JSON.parse(execFileSync("git", ["show", `origin/staging:${RUTA_TECHOS}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).techos;
  } catch { return null; }
};

describe("los techos solo bajan", () => {
  it("los techos no suben respecto a origin/staging (si se puede leer sin red)", () => {
    expect(fallosDeSubida(leerTechos(RAIZ), techosDeStaging())).toEqual([]);
  });

  it("las cifras del inventario coinciden con ops/techos-lados.json (sube = fallo; baja = bajar el techo)", () => {
    expect(fallosDeTechos(medir(RAIZ), leerTechos(RAIZ))).toEqual([]);
  });
});

describe("con datos rotos (casos negativos)", () => {
  const datos = {
    principiosVerticales: ["pv"],
    normasHorizontales: [{ id: "n1", principio: "pv" }, { id: "n2", principio: "otro" }],
    entidades: [{ id: "a", scope: "horizontal" }, { id: "b", scope: "vertical" }, { id: "c", scope: "horizontal" }],
    relaciones: [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "a" }],
  };

  it("una norma horizontal con un principio vertical y una relación horizontal → vertical se detectan; lo demás, no", () => {
    expect(citasAVertical(datos)).toEqual({ normaAPrincipio: ["n1 → principio pv"], entidadAEntidad: ["a → b"] });
    expect(citasAVertical({ ...datos, normasHorizontales: [datos.normasHorizontales[1]], relaciones: [datos.relaciones[1], datos.relaciones[2]] }))
      .toEqual({ normaAPrincipio: [], entidadAEntidad: [] });
  });

  it("una norma vertical en el registro horizontal se detecta (por el comprobante común)", () => {
    const mala = { ...carga, horizontales: [{ ...carga.horizontales[0], lado: "vertical" }] };
    expect(problemasDeProyectos(mala, ["homenu"]).join("\n")).toMatch(/su lado es «vertical»/);
  });

  it("un techo que sube respecto a staging falla; uno que baja o igual, no; sin staging, no hay qué comparar", () => {
    expect(fallosDeSubida({ x: 3 }, { x: 2 })).toHaveLength(1);
    expect(fallosDeSubida({ x: 1 }, { x: 2 })).toEqual([]);
    expect(fallosDeSubida({ x: 2 }, { x: 2 })).toEqual([]);
    expect(fallosDeSubida({ x: 9 }, null)).toEqual([]);
  });

  it("subir una cifra, bajarla sin bajar el techo, medir algo sin techo o dejar un techo huérfano fallan; igual, no", () => {
    expect(fallosDeTechos({ x: 2 }, { x: 2 })).toEqual([]);
    expect(fallosDeTechos({ x: 3 }, { x: 2 }).join()).toMatch(/sube a 3/);
    expect(fallosDeTechos({ x: 1 }, { x: 2 }).join()).toMatch(/baja su techo de 2 a 1/);
    expect(fallosDeTechos({ x: 1, y: 0 }, { x: 1 }).join()).toMatch(/«y» \(0\) no tiene techo/);
    expect(fallosDeTechos({ x: 1 }, { x: 1, z: 4 }).join()).toMatch(/techo «z» ya no se mide/);
  });
});
