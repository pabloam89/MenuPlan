import { describe, it, expect } from "vitest";
import { recipeCatalog } from "../../data/recipeCatalog.js";
import { composicionDe } from "./composicion.js";
import { cuotasDeFamilia, familiasDesdeCuotas, familiasDeReceta, FAMILIAS, UMBRAL } from "./familias.js";
import { ejeVerdura } from "./composicion.js";

const porNombre = (n) => recipeCatalog.find((r) => r.name === n);

describe("el plano de la verdura", () => {
  it("la hortaliza entra y el tubérculo no", () => {
    expect(ejeVerdura({ clase: "hortaliza", subclase: "verdura_hoja" })).toBe("verdura");
    expect(ejeVerdura({ clase: "hortaliza", subclase: "verdura_fruto" })).toBe("verdura");
    // La patata ya compite en el plano del hidrato: contarla aquí la metería
    // dos veces y volvería de verdura cualquier guiso con patatas.
    expect(ejeVerdura({ clase: "hortaliza", subclase: "tuberculo" })).toBeNull();
  });

  it("la seta cuenta como verdura y la carne no", () => {
    expect(ejeVerdura({ clase: "hongo", subclase: "seta" })).toBe("verdura");
    expect(ejeVerdura({ clase: "mamifero", subclase: "carne_roja" })).toBeNull();
    expect(ejeVerdura(null)).toBeNull();
  });
});

describe("la cuota manda, no el cajón", () => {
  it("el bacon al 12 % no convierte una pasta en carne", () => {
    const r = porNombre("Pasta con champiñones salteados y bacon");
    expect(r.mainProtein).toBe("cerdo");            // lo que decía la regla vieja
    const { familias, cuotas } = familiasDeReceta(r);
    expect(cuotas.carne).toBeLessThan(UMBRAL);
    expect(familias).toContain("pasta_arroz");
    expect(familias).not.toContain("carne");
  });

  it("pero el cerdo al 33 % sí, y son el mismo mainProtein", () => {
    const r = porNombre("Filetes empanados con patatas fritas");
    expect(r.mainProtein).toBe("cerdo");
    expect(familiasDeReceta(r).familias).toContain("carne");
  });

  it("un arroz a banda es arroz, aunque lleve pescado", () => {
    const r = porNombre("Arroz a banda");
    const { familias, cuotas } = familiasDeReceta(r);
    expect(cuotas.pescado).toBeLessThan(UMBRAL);
    expect(familias).toEqual(["pasta_arroz"]);
  });

  it("un cocido gasta las dos cuotas", () => {
    const { familias } = familiasDeReceta(porNombre("Cocido madrileño"));
    expect(familias).toContain("legumbres");
    expect(familias).toContain("carne");
  });
});

describe("la verdura es el residuo", () => {
  it("una crema de verdura sí lo es", () => {
    expect(familiasDeReceta(porNombre("Crema de calabacín")).familias).toEqual(["verdura"]);
  });

  it("una crema de lentejas es legumbre, no verdura: sopas_cremas es un FORMATO", () => {
    const r = porNombre("Crema de lentejas");
    expect(r.category).toBe("sopas_cremas");
    expect(familiasDeReceta(r).familias).toEqual(["legumbres"]);
  });

  it("si algo estructura el plato, la verdura no entra aunque pese", () => {
    // El sofrito de un guiso pesa: sin esta regla, media carta sería verdura.
    const cuotas = { carne: 0.30, verdura: 0.40 };
    expect(familiasDesdeCuotas(cuotas)).toEqual(["carne"]);
  });

  it("y si no estructura nadie, entra ella", () => {
    expect(familiasDesdeCuotas({ verdura: 0.40 })).toEqual(["verdura"]);
    expect(familiasDesdeCuotas({ verdura: 0.05 })).toEqual([]);
  });
});

describe("las cuotas", () => {
  it("se suman por FAMILIA, no por nodo", () => {
    // Rape 9 % y gambas 9 % no llegan por separado; juntos son pescado al 18 %.
    const vector = {
      masaTotal: 100,
      proteina: new Map([["pescado_blanco", 9], ["marisco", 9]]),
      hidrato: new Map(),
      verdura: new Map(),
    };
    expect(cuotasDeFamilia(vector).pescado).toBeCloseTo(0.18, 4);
    expect(familiasDesdeCuotas(cuotasDeFamilia(vector))).toEqual(["pescado"]);
  });

  it("la patata y el pan no producen familia", () => {
    const vector = {
      masaTotal: 100,
      proteina: new Map(),
      hidrato: new Map([["patatas", 50], ["pan", 20]]),
      verdura: new Map(),
    };
    expect(cuotasDeFamilia(vector)).toEqual({});
  });

  it("sin masa no se inventa nada", () => {
    expect(cuotasDeFamilia(null)).toEqual({});
    expect(cuotasDeFamilia({ masaTotal: 0 })).toEqual({});
    expect(familiasDeReceta({})).toEqual({ familias: [], cuotas: {} });
  });
});

describe("el catálogo entero", () => {
  it("todas las familias que salen están en el vocabulario", () => {
    for (const r of recipeCatalog) {
      for (const f of r.familias ?? []) expect(FAMILIAS).toContain(f);
    }
  });

  it("la tabla derivada está pegada al catálogo", () => {
    const conFamilias = recipeCatalog.filter((r) => Array.isArray(r.familias));
    expect(conFamilias.length).toBe(recipeCatalog.length);
  });

  it("nadie sale en la verdura Y en otra a la vez", () => {
    // Es lo que garantiza que «verdura» siga queriendo decir algo.
    const mixtas = recipeCatalog.filter((r) => (r.familias ?? []).includes("verdura") && r.familias.length > 1);
    expect(mixtas).toHaveLength(0);
  });

  it("la cuota publicada explica la familia", () => {
    const r = porNombre("Cocido madrileño");
    for (const f of r.familias) expect(r.familiaCuotas[f]).toBeGreaterThanOrEqual(UMBRAL);
  });

  it("y el vector del catálogo trae los tres planos", () => {
    const v = composicionDe(porNombre("Crema de calabacín"));
    expect(v.verdura).toBeInstanceOf(Map);
    expect([...v.verdura.keys()]).toEqual(["verdura"]);
  });
});
