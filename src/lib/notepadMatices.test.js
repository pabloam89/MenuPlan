import { describe, it, expect } from "vitest";
import { libretaVacia, poner, confirmar, proyectar, matizDe, vigente, normalizar, dependeDelDia } from "./notepad.js";
import { dataVigente } from "./libretaEnData.js";

const HOY = "2026-10-01";
const supuesto = (n, path, valor, extra = {}) => poner(n, path, valor, { origen: "texto", frase: "algo de pasada", fecha: HOY, fuente: "supuesto", ...extra });
const dicho = (n, path, valor, extra = {}) => poner(n, path, valor, { origen: "texto", frase: "lo dijo claro", fecha: HOY, fuente: "dicho", ...extra });

describe("matices: dicho, visto, supuesto", () => {
  it("lo de siempre (sin fuente) cuenta como dicho: a las casas de antes no les cambia nada", () => {
    const n = poner(libretaVacia(), "excluidos.cilantro", true, { origen: "texto", frase: "no me pongas cilantro", fecha: HOY });
    expect(matizDe(n.campos["excluidos.cilantro"])).toBe("dicho");
    expect(proyectar(n).excluidos).toEqual(["cilantro"]);
  });

  it("lo supuesto solo sesga: no excluye un ingrediente ni baja una familia a cero", () => {
    let n = supuesto(libretaVacia(), "excluidos.cerdo", true);
    n = supuesto(n, "freqs.pescado", 0);
    n = supuesto(n, "tecnica.horno", 1);
    const v = proyectar(n, { hoy: HOY });
    expect(v.excluidos).toEqual([]);
    expect(v.freqs.pescado).toBe(1);
    expect(v.sesgos.tecnica.horno).toBe(1);
  });

  it("lo dicho sí excluye; y confirmar un supuesto lo vuelve dicho", () => {
    expect(proyectar(dicho(libretaVacia(), "excluidos.cerdo", true)).excluidos).toEqual(["cerdo"]);
    const n = confirmar(supuesto(libretaVacia(), "excluidos.cerdo", true), "excluidos.cerdo");
    expect(matizDe(n.campos["excluidos.cerdo"])).toBe("dicho");
    expect(proyectar(n).excluidos).toEqual(["cerdo"]);
  });

  it("una suposición nunca pisa lo dicho (la familia corrigió a Lola)", () => {
    const n = dicho(libretaVacia(), "freqs.pescado", 3);
    const despues = supuesto(n, "freqs.pescado", 1);
    expect(despues.campos["freqs.pescado"].valor).toBe(3);
    // Pero lo dicho sí pisa lo supuesto.
    expect(dicho(supuesto(libretaVacia(), "freqs.pescado", 1), "freqs.pescado", 4).campos["freqs.pescado"].valor).toBe(4);
  });

  it("los matices sobreviven a normalizar (no los borra el esquema)", () => {
    const n = normalizar(supuesto(libretaVacia(), "freqs.pescado", 2, { desde: "2026-10-05", hasta: "2026-10-31" }));
    expect(n.campos["freqs.pescado"]).toMatchObject({ fuente: "supuesto", apuntado: HOY, desde: "2026-10-05", hasta: "2026-10-31" });
  });
});

describe("cuándo vale: desde, hasta y caducidad", () => {
  it("fuera de su ventana no se proyecta", () => {
    const n = dicho(libretaVacia(), "freqs.carne", 1, { desde: "2026-10-05", hasta: "2026-10-31" });
    expect(proyectar(n, { hoy: "2026-10-01" }).freqs.carne).toBeUndefined();
    expect(proyectar(n, { hoy: "2026-10-15" }).freqs.carne).toBe(1);
    expect(proyectar(n, { hoy: "2026-11-02" }).freqs.carne).toBeUndefined();
  });

  it("lo supuesto caduca a los 90 días; lo visto, a los 180; lo dicho, nunca", () => {
    const campo = (fuente) => ({ valor: 1, origen: "texto", fuente, apuntado: "2026-01-01" });
    expect(vigente(campo("supuesto"), "2026-03-15")).toBe(true);
    expect(vigente(campo("supuesto"), "2026-04-15")).toBe(false);
    expect(vigente(campo("visto"), "2026-04-15")).toBe(true);
    expect(vigente(campo("visto"), "2026-07-15")).toBe(false);
    expect(vigente(campo("dicho"), "2030-01-01")).toBe(true);
  });

  it("sin nada que dependa del día, la data no se toca; con algo, se recalcula para esa semana", () => {
    const fija = { notepad: dicho(libretaVacia(), "freqs.carne", 2) };
    expect(dependeDelDia(fija.notepad)).toBe(false);
    expect(dataVigente(fija, HOY)).toBe(fija);
    const temporal = { notepad: dicho(libretaVacia(), "excluidos.gluten", true, { hasta: "2026-10-31" }) };
    expect(dataVigente(temporal, "2026-10-20").excluidos).toEqual(["gluten"]);
    expect(dataVigente(temporal, "2026-11-03").excluidos).toEqual([]);
  });
});
