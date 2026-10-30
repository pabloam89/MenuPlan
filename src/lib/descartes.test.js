import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
vi.mock("./supabase.js", () => ({ supabase: { from: (...a) => from(...a) } }));
vi.mock("./analytics.js", () => ({ getAnonId: () => "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c" }));

import { filasDeDescartes, recetasDelPlan, registrarDescartes } from "./descartes.js";
import { MAX_DESCARTES, RECETA_ID_MAX, RECETA_ID_RE } from "./descartesForma.js";
import { ALCANCES_DESCARTE, ALCANCE_DESCARTE } from "./vocabularios.js";

describe("filasDeDescartes", () => {
  it("quita el prefijo de grupo, los repetidos y lo que no es un id", () => {
    const filas = filasDeDescartes(["g1__carnes_146", "carnes_146", " pescados_7 ", "", null, undefined, 5], ALCANCE_DESCARTE.DIA);
    expect(filas).toEqual([
      { receta_id: "carnes_146", alcance: "dia" },
      { receta_id: "pescados_7", alcance: "dia" },
    ]);
  });

  it("pone tope por llamada", () => {
    const muchos = Array.from({ length: MAX_DESCARTES + 20 }, (_, i) => `r_${i}`);
    expect(filasDeDescartes(muchos, ALCANCE_DESCARTE.MENU)).toHaveLength(MAX_DESCARTES);
  });

  it("rechaza un alcance fuera del vocabulario, como lo haría el CHECK", () => {
    expect(() => filasDeDescartes(["carnes_146"], "semana")).toThrow();
  });

  it("deja fuera los ids que el servidor no aceptaría (un solo criterio en cliente y servidor)", () => {
    const largo = "a".repeat(RECETA_ID_MAX + 1);
    expect(RECETA_ID_RE.test("a".repeat(RECETA_ID_MAX))).toBe(true);
    expect(RECETA_ID_RE.test(largo)).toBe(false);
    expect(filasDeDescartes(["carnes_146", largo, "con espacio", "con/barra"], ALCANCE_DESCARTE.PLATO)).toEqual([
      { receta_id: "carnes_146", alcance: "plato" },
    ]);
  });

  it("los alcances con nombre son los del vocabulario", () => {
    expect(Object.values(ALCANCE_DESCARTE)).toEqual(ALCANCES_DESCARTE);
  });
});

describe("recetasDelPlan", () => {
  it("junta primer y segundo plato de todos los grupos y salta los huecos vaciados", () => {
    const plan = {
      g1: {
        "Lun-Comida": { firstRecipeId: "a_1", recipeId: "b_2" },
        "Lun-Cena": { recipeId: "c_3", cleared: true },
      },
      g2: { "Mar-Comida": { recipeId: "d_4" } },
    };
    expect(recetasDelPlan(plan)).toEqual(["a_1", "b_2", "d_4"]);
    expect(recetasDelPlan(undefined)).toEqual([]);
  });
});

describe("registrarDescartes", () => {
  beforeEach(() => {
    insert.mockReset();
    from.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("con cuenta: inserta en receta_descartes con su usuario y su casa", async () => {
    insert.mockResolvedValue({ error: null });
    const n = await registrarDescartes({ user: { id: "u-1" }, householdId: "h-1", recetaIds: ["g1__carnes_146"], ambito: "plato" });
    expect(n).toBe(1);
    expect(from).toHaveBeenCalledWith("receta_descartes");
    expect(insert).toHaveBeenCalledWith([{ receta_id: "carnes_146", alcance: "plato", user_id: "u-1", household_id: "h-1" }]);
  });

  it("sin casa: household_id va a null", async () => {
    insert.mockResolvedValue({ error: null });
    await registrarDescartes({ user: { id: "u-1" }, recetaIds: ["carnes_146"], ambito: "menu" });
    expect(insert.mock.calls[0][0][0].household_id).toBeNull();
  });

  it("plan B: si la tabla no existe devuelve 0 y no lanza", async () => {
    insert.mockResolvedValue({ error: { message: 'relation "receta_descartes" does not exist' } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(registrarDescartes({ user: { id: "u-1" }, recetaIds: ["carnes_146"], ambito: "plato" })).resolves.toBe(0);
  });

  it("sin nada que apuntar no toca la red ni la base", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await registrarDescartes({ user: { id: "u-1" }, recetaIds: [null], ambito: "plato" })).toBe(0);
    expect(await registrarDescartes({ user: null, recetaIds: [], ambito: "plato" })).toBe(0);
    expect(insert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invitado: manda los descartes a /api/track con su anonId y sin usuario", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const n = await registrarDescartes({ user: null, recetaIds: ["carnes_146", "pescados_7"], ambito: "dia" });
    expect(n).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/track");
    expect(JSON.parse(init.body)).toEqual({
      anonId: "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c",
      descartes: [
        { receta_id: "carnes_146", alcance: "dia" },
        { receta_id: "pescados_7", alcance: "dia" },
      ],
    });
  });

  it("invitado: si /api/track responde con error (404, 500) no cuenta lo que no se guardó", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(registrarDescartes({ user: null, recetaIds: ["carnes_146"], ambito: "plato" })).resolves.toBe(0);
  });

  it("invitado sin red: devuelve 0 y no lanza", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(registrarDescartes({ user: null, recetaIds: ["carnes_146"], ambito: "plato" })).resolves.toBe(0);
  });
});
