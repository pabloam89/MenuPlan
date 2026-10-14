import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarNormas, problemasDeProyectos } from "../scripts/lib/normas.mjs";
import { calcular } from "../scripts/lib/inventarioVertical.mjs";
import { RUTA_TECHOS, citasAVertical, declaracionesCaducadas, fallosDeSubida, fallosDeTechos, leerDeclaradas, leerTechos, medir } from "../scripts/lib/vigilanteLados.mjs";

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
const ficheroDeStaging = () => {
  try {
    return JSON.parse(execFileSync("git", ["show", `origin/staging:${RUTA_TECHOS}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch { return null; }
};
const techosDeStaging = () => ficheroDeStaging()?.techos ?? null;
const declaradasDeStaging = () => ficheroDeStaging()?.subida_declarada ?? {};

describe("los techos solo bajan", () => {
  it("los techos no suben respecto a origin/staging (si se puede leer sin red)", () => {
    expect(fallosDeSubida(leerTechos(RAIZ), techosDeStaging(), medir(RAIZ), leerDeclaradas(RAIZ), declaradasDeStaging())).toEqual([]);
  });

  it("las declaraciones nuevas de este PR no sobran: staging aún no alcanza su tope", () => {
    expect(declaracionesCaducadas(leerDeclaradas(RAIZ), techosDeStaging(), declaradasDeStaging())).toEqual([]);
  });

  // En el CI la referencia se trae a propósito (tests.yml, «Traer staging para los trinquetes»): si falta, el trinquete
  // no puede quedarse mudo y verde. En local, sin red, se salta.
  it.skipIf(!process.env.CI)("en el CI, origin/staging existe y se puede leer (si no, el trinquete no comprobaría nada)", () => {
    expect(techosDeStaging(), "falta origin/staging o ops/techos-lados.json en él: revisa el paso «Traer staging» de tests.yml").not.toBeNull();
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

  it("una clave nueva con techo sin declarar, o con techo mayor que su medida, falla; con medida igual y declarada, no", () => {
    const st = { x: 2 };
    expect(fallosDeSubida({ x: 2, y: 4 }, st, { x: 2, y: 4 }).join()).toMatch(/«y»: clave nueva con techo 4, sube desde 0/);
    expect(fallosDeSubida({ x: 2, y: 0 }, st, { x: 2, y: 0 })).toEqual([]);
    expect(fallosDeSubida({ x: 2, y: 5 }, st, { x: 2, y: 4 }, { y: { hasta: 5, razon: "una razón de al menos veinte letras (#710)" } }).join()).toMatch(/mayor que la medida 4/);
    expect(fallosDeSubida({ x: 2, y: 4 }, st, { x: 2, y: 4 }, { y: { hasta: 4, razon: "una razón de al menos veinte letras (#710)" } })).toEqual([]);
  });

  it("una subida declarada solo vale con razón, dentro de su tope y mientras staging esté por debajo", () => {
    const razon = "el detector pasó a leer todo el texto (#710)";
    expect(fallosDeSubida({ x: 6 }, { x: 4 }, null, { x: { hasta: 6, razon } })).toEqual([]);
    expect(fallosDeSubida({ x: 7 }, { x: 4 }, null, { x: { hasta: 6, razon } })).toHaveLength(1);
    expect(fallosDeSubida({ x: 6 }, { x: 4 }, null, { x: { hasta: 6, razon: "corta" } })).toHaveLength(1);
    expect(fallosDeSubida({ x: 6 }, { x: 4 }, null, { otra: { hasta: 6, razon } })).toHaveLength(1);
    // ya fusionada: staging tiene el 6; subir a 7 no está declarado
    expect(fallosDeSubida({ x: 6 }, { x: 6 }, null, { x: { hasta: 6, razon } })).toEqual([]);
    expect(fallosDeSubida({ x: 7 }, { x: 6 }, null, { x: { hasta: 6, razon } })).toHaveLength(1);
  });

  it("una declaración que staging ya tenía no ampara una subida posterior (techo bajado a 40 y vuelto a subir a 46)", () => {
    const d = { x: { hasta: 46, razon: "el detector pasó a leer todo el texto (#710)" } };
    // staging: techo 40, con la declaración vieja todavía en el fichero; otro PR sube a 46 amparándose en ella
    expect(fallosDeSubida({ x: 46 }, { x: 40 }, { x: 46 }, d, d)).toHaveLength(1);
    // la misma declaración, pero añadida por este PR (staging no la tiene), sí vale
    expect(fallosDeSubida({ x: 46 }, { x: 40 }, { x: 46 }, d, {})).toEqual([]);
  });

  it("una subida declarada sin issue, o con tope mayor que la medida, no vale (entrada de 20 letras colada al subir)", () => {
    const sinIssue = { x: { hasta: 46, razon: "una razón de veinte letras" } };
    expect(fallosDeSubida({ x: 46 }, { x: 40 }, { x: 46 }, sinIssue, {})).toHaveLength(1);
    const holgura = { x: { hasta: 46, razon: "sube por el detector nuevo (#710)" } };
    expect(fallosDeSubida({ x: 46 }, { x: 40 }, { x: 42 }, holgura, {})).toHaveLength(1);
    expect(fallosDeSubida({ x: 42 }, { x: 40 }, { x: 42 }, { x: { ...holgura.x, hasta: 42 } }, {})).toEqual([]);
  });

  it("una declaración nueva con staging ya en su tope sobra; una vieja de staging no se juzga", () => {
    const d = { x: { hasta: 46, razon: "sube por el detector nuevo (#710)" } };
    expect(declaracionesCaducadas(d, { x: 46 }, {})).toHaveLength(1);
    expect(declaracionesCaducadas(d, { x: 40 }, {})).toEqual([]);
    expect(declaracionesCaducadas(d, { x: 46 }, d)).toEqual([]);
  });

  it("subir una cifra, bajarla sin bajar el techo, medir algo sin techo o dejar un techo huérfano fallan; igual, no", () => {
    expect(fallosDeTechos({ x: 2 }, { x: 2 })).toEqual([]);
    expect(fallosDeTechos({ x: 3 }, { x: 2 }).join()).toMatch(/sube a 3/);
    expect(fallosDeTechos({ x: 1 }, { x: 2 }).join()).toMatch(/baja su techo de 2 a 1/);
    expect(fallosDeTechos({ x: 1, y: 0 }, { x: 1 }).join()).toMatch(/«y» \(0\) no tiene techo/);
    expect(fallosDeTechos({ x: 1 }, { x: 1, z: 4 }).join()).toMatch(/techo «z» ya no se mide/);
  });
});
