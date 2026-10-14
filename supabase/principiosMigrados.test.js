import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ficherosNormativos } from "../scripts/lib/normas.mjs";
import { DOCUMENTOS_MIGRADOS_DE_PROYECTO, faltasDeMigracion, leerPrincipiosCasa, problemasDeEnunciadoUnico, seccionesNumeradas } from "../scripts/lib/principios.mjs";

/**
 * Lo que ops/principios.test.js vigilaba de docs/datos/PRINCIPIOS.md (un documento de HoMenu) y ya no puede,
 * porque un test de la casa no lee ficheros del proyecto (#710, PR 6): cada sección numerada de ese documento
 * la cita algún principio en su `detalle`, y la sección cita el id del principio, sin «Enunciado.» propio.
 * Los orígenes (C/I/N) y el N0 de entidades siguen en ops/principios.test.js.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerPrincipiosCasa(RAIZ);
const textos = Object.fromEntries(DOCUMENTOS_MIGRADOS_DE_PROYECTO.map((r) => [r, readFileSync(join(RAIZ, r), "utf8")]));
const DATOS = "docs/datos/PRINCIPIOS.md";

describe("docs/datos/PRINCIPIOS.md frente a la lista de principios de la casa", () => {
  it("las 21 secciones numeradas se leen", () => {
    expect(seccionesNumeradas(textos[DATOS]).length).toBeGreaterThanOrEqual(21);
  });

  it("ninguna sección queda sin citar en el `detalle` de algún principio", () => {
    expect(faltasDeMigracion(datos.principios, textos, { origenes: false })).toEqual([]);
  });

  it("cada sección cita el id de su principio y no lleva otro «Enunciado.»", () => {
    expect(problemasDeEnunciadoUnico(datos.principios, textos)).toEqual([]);
  });

  it("se ve fallar: quitar un principio deja su sección sin citar", () => {
    const sin = datos.principios.filter((p) => p.id !== "closed-vocabulary");
    expect(faltasDeMigracion(sin, textos, { origenes: false }).join("\n")).toMatch(/docs\/datos\/PRINCIPIOS\.md#4-vocabularios-cerrados: ningún principio la cita/);
  });

  it("se ve fallar: una sección sin la cita del principio o con «Enunciado.» propio", () => {
    const md = textos[DATOS];
    const sinCita = { [DATOS]: md.replace("`closed-vocabulary`", "`otro`") };
    expect(problemasDeEnunciadoUnico(datos.principios, sinCita).join("\n")).toMatch(/no cita el principio `closed-vocabulary`/);
    const conEnunciado = { [DATOS]: `${md}\n**Enunciado.** Otra frase.\n` };
    expect(problemasDeEnunciadoUnico(datos.principios, conEnunciado).join("\n")).toMatch(/lleva un «Enunciado\.» propio/);
  });

  it("la norma de frases normativas recorre el documento (ops/normas.test.js ya no lo nombra)", () => {
    expect(ficherosNormativos(RAIZ)).toContain(DATOS);
  });
});
