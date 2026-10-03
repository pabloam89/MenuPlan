import { describe, it, expect, vi } from "vitest";

vi.mock("./menu.js", async (original) => ({
  ...(await original()),
  proponerPlatos: vi.fn(async () => {}),
  cambiarPlato: vi.fn(async () => {}),
}));

const { ESQUEMA } = await import("./router.js");
const { ESQUEMA_RASGOS, ESQUEMA_EJE, IDS_EJES } = await import("./esquemas.js");
const { EJES_NUMERICOS, proponerPlatos, cambiarPlato } = await import("./menu.js");
const { recomendar, cambiar } = await import("./turno.js");

const MAS_CARBOS = { cual: "carbohidratos", direccion: "mas" };

describe("un solo esquema para el enrutador y Lola", () => {
  it("el enrutador usa los mismos rasgos y el mismo eje que las herramientas", () => {
    expect(ESQUEMA.properties.rasgos).toBe(ESQUEMA_RASGOS);
    expect(ESQUEMA.properties.eje).toBe(ESQUEMA_EJE);
  });
  it("los ejes del esquema son los que el motor sabe leer", () => {
    expect(IDS_EJES).toEqual(Object.keys(EJES_NUMERICOS));
  });
});

describe("la vía rápida pasa el eje al motor", () => {
  it("recomendar: «más carbos para el jueves»", async () => {
    await recomendar("casa", { dia: "jueves", eje: MAS_CARBOS });
    expect(proponerPlatos).toHaveBeenLastCalledWith("casa", expect.objectContaining({ eje: MAS_CARBOS }), expect.anything(), expect.anything());
  });
  it("cambiar: «cámbiala por algo con más carbos»", async () => {
    await cambiar("casa", { dia: "jueves", comida: "Cena", cualquiera: true, eje: MAS_CARBOS, rasgos: { picante: "sin" } });
    expect(cambiarPlato).toHaveBeenLastCalledWith("casa", expect.objectContaining({ eje: MAS_CARBOS, rasgos: { picante: "sin" } }), expect.anything(), expect.anything());
  });
});
