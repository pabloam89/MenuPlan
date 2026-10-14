import { describe, it, expect } from "vitest";
import { motivoParaNoLeer, avisosDeRetiradas } from "../../scripts/lib/consulta.mjs";
import { TABLAS } from "./model.js";

// Los avisos de `npm run consulta` contra el registro real de fuentes de HoMenu (TABLAS). Vive aquí y no en
// scripts/consulta.test.js porque lee el modelo del proyecto (#710, PR 6).
// Los nombres van sueltos y la SQL se arma con estos ayudantes: ops/lecturasRetiradas.test.js
// busca lecturas de fuentes retiradas y un ejemplo escrito entero lo tomaría por una.
const sel = (t) => ["select *", "from", t].join(" ");
// Los nombres salen del registro (y no se escriben aquí) por la misma razón.
const de = (id) => TABLAS.find((t) => t.id === id);
const R = de("copiaRecetasSupabase").tablas[0];
const RI = de("copiaRecetasSupabase").tablas[1];
const FOTOS = de("copiaFotosSupabase").tablas[0];
const ING = de("copiaIngredientesSupabase").tablas[0];

describe("npm run consulta avisa de las copias retiradas, sin negarlas (#292)", () => {
  it("una tabla retirada avisa y nombra la fuente que la sustituye", () => {
    const a = avisosDeRetiradas(sel(R) + " limit 1");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(new RegExp("^La tabla " + R + " es una copia retirada"));
    expect(a[0]).toMatch(/borrada en la 0093/);
    expect(a[0]).toMatch(/sustituye es recetas/);
    expect(avisosDeRetiradas(sel("x") + " join " + FOTOS + " d on true")[0]).toMatch(/fotosPlatos/);
    expect(avisosDeRetiradas("insert into " + ING + " select 1")[0]).toMatch(/ingredientes/); // INTO
  });

  it("una vista retirada también avisa", () => {
    expect(avisosDeRetiradas(sel(de("copiaAlergenosSupabase").vistas[0]))[0]).toMatch(/^La vista /);
  });

  it("una tabla viva no avisa", () => {
    expect(avisosDeRetiradas(sel("households"))).toEqual([]);
    expect(avisosDeRetiradas(sel(R + "_extra"))).toEqual([]); // otro nombre, no el mismo
  });

  it("mayúsculas, minúsculas, esquema y alias", () => {
    expect(avisosDeRetiradas(sel(R.toUpperCase() + " r").toUpperCase())).toHaveLength(1);
    expect(avisosDeRetiradas(sel("public." + R + " r"))).toHaveLength(1);
    expect(avisosDeRetiradas(sel("public." + R + " r join public." + RI + " i on true"))).toHaveLength(2);
  });

  it("solo en un comentario o en una cadena no avisa", () => {
    expect(avisosDeRetiradas("select 1 -- " + sel(R) + "\nselect 2")).toEqual([]);
    expect(avisosDeRetiradas("select 1 /* " + sel(R) + " */")).toEqual([]);
    expect(avisosDeRetiradas("select '" + sel(R) + "' as t")).toEqual([]);
  });

  it("listas con coma, table y nombres entre comillas dobles", () => {
    expect(avisosDeRetiradas(sel("households h, " + R + " r"))).toHaveLength(1);
    expect(avisosDeRetiradas(sel("households, public." + R))).toHaveLength(1);
    expect(avisosDeRetiradas("table " + R)).toHaveLength(1);
    expect(avisosDeRetiradas(sel('"' + R + '"'))).toHaveLength(1);
    expect(avisosDeRetiradas(sel('public."' + R + '" r'))).toHaveLength(1);
    // una coma de lista de columnas no es una tabla
    expect(avisosDeRetiradas("select a, " + R + " from households")).toEqual([]);
    expect(avisosDeRetiradas(sel("households where x in (1, 2) and y = 3, " + R))).toEqual([]);
  });

  it("avisar no es negar: motivoParaNoLeer sigue dejando pasar la lectura", () => {
    expect(motivoParaNoLeer(sel(R))).toBe(null);
  });

  it("lee el registro: toda tabla de una fuente retirada avisa", () => {
    const retiradas = TABLAS.filter((t) => t.estado === "retirado" || t.rol === "copia_retirada");
    const nombres = retiradas.flatMap((t) => [...t.tablas, ...t.vistas]);
    expect(nombres.length).toBeGreaterThan(0);
    for (const n of nombres) expect(avisosDeRetiradas(sel(n)), n).toHaveLength(1);
  });
});
