import { describe, it, expect, vi } from "vitest";

vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  proponerPlatos: vi.fn(async () => {}),
  cambiarPlato: vi.fn(async () => {}),
}));

const { ESQUEMA } = await import("./router.js");
const { ESQUEMA_RASGOS, ESQUEMA_EJES, ESQUEMA_PERFIL, EJES, IDS_EJES, CAMPOS_SIN_NOMBRE } = await import("./esquemas.js");
const { NUTRIENTES } = await import("../../src/data/nutrientes.js");
const { IDS_PERFILES } = await import("../../src/lib/derive/perfiles.js");
const { proponerPlatos, cambiarPlato } = await import("./menu.js");
const { recomendar, cambiar } = await import("./turno.js");

const MAS_PROTEINA_MENOS_SAL = [{ cual: "proteina", direccion: "mas" }, { cual: "sodio", direccion: "menos" }];

describe("un solo esquema para el enrutador y Lola", () => {
  it("el enrutador usa los mismos rasgos, ejes y perfil que las herramientas", () => {
    expect(ESQUEMA.properties.rasgos).toBe(ESQUEMA_RASGOS);
    expect(ESQUEMA.properties.ejes).toBe(ESQUEMA_EJES);
    expect(ESQUEMA.properties.perfil).toBe(ESQUEMA_PERFIL);
    expect(ESQUEMA.properties.eje).toBeUndefined();
  });
  it("los ejes salen del registro de nutrientes: los 32, cada uno con su nombre, más los dos derivados", () => {
    expect(CAMPOS_SIN_NOMBRE).toEqual([]);
    const campos = Object.values(EJES).filter((e) => e.campo).map((e) => e.campo);
    expect(new Set(campos)).toEqual(new Set(Object.values(NUTRIENTES).map((n) => n.porRacion)));
    expect(IDS_EJES).toEqual(expect.arrayContaining(["proteina", "carbohidratos", "sodio", "hierro", "carga", "densidadNutricional"]));
    expect(new Set(IDS_EJES).size).toBe(IDS_EJES.length);
    expect(ESQUEMA_EJES.items.properties.cual.enum).toBe(IDS_EJES);
  });
  it("los perfiles del esquema son los de perfiles.js", () => {
    expect(ESQUEMA_PERFIL.enum).toEqual(IDS_PERFILES);
  });
});

describe("la vía rápida pasa ejes y perfil al motor", () => {
  it("recomendar: «menos sal y más proteína para el jueves»", async () => {
    await recomendar("casa", { dia: "jueves", ejes: MAS_PROTEINA_MENOS_SAL });
    expect(proponerPlatos).toHaveBeenLastCalledWith("casa", expect.objectContaining({ ejes: MAS_PROTEINA_MENOS_SAL }), expect.anything(), expect.anything());
  });
  it("recomendar: «algo más completo» → perfil", async () => {
    await recomendar("casa", { dia: "viernes", comida: "Cena", perfil: "equilibrado" });
    expect(proponerPlatos).toHaveBeenLastCalledWith("casa", expect.objectContaining({ perfil: "equilibrado" }), expect.anything(), expect.anything());
  });
  it("cambiar: «cámbiala por algo más completo y que no pique»", async () => {
    await cambiar("casa", { dia: "jueves", comida: "Cena", cualquiera: true, perfil: "equilibrado", ejes: MAS_PROTEINA_MENOS_SAL, rasgos: { picante: "sin" } });
    expect(cambiarPlato).toHaveBeenLastCalledWith("casa", expect.objectContaining({ perfil: "equilibrado", ejes: MAS_PROTEINA_MENOS_SAL, rasgos: { picante: "sin" } }), expect.anything(), expect.anything());
  });
});
