import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const insert = vi.fn();
// La lectura: select(...).eq(...).gte(...).order(...).limit(...) → { data, error }.
const lectura = vi.fn();
const llamadasEq = [];
const cadena = {
  eq: (...a) => (llamadasEq.push(a), cadena),
  gte: () => cadena,
  order: () => cadena,
  limit: () => lectura(),
};
const from = vi.fn(() => ({ insert, select: () => cadena }));
vi.mock("./supabase.js", () => ({ supabase: { from: (...a) => from(...a) } }));
vi.mock("./analytics.js", () => ({ getAnonId: () => "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c" }));

import { filasDeDescartes, recetasDelPlan, refrescarDescartadas, registrarDescartes } from "./descartes.js";
import { descartadasVigentes, fijarDescartadas } from "./descartesPrioridad.js";
import { MAX_DESCARTES, RECETA_ID_MAX, RECETA_ID_RE } from "./descartesForma.js";
import { ALCANCES_DESCARTE, ALCANCE_DESCARTE } from "./vocabularios.js";

// Lo que la base (0102) y el código dicen de un descarte tiene que ser lo mismo: el largo del
// id y los alcances del CHECK. Este test lee la migración, así que si uno cambia sin el otro falla.
describe("receta_descartes: el código y la migración 0102 dicen lo mismo", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0102_receta_descartes.sql", import.meta.url), "utf8");

  it("el largo máximo del id de receta del CHECK es RECETA_ID_MAX", () => {
    expect(sql).toContain(`char_length(receta_id) <= ${RECETA_ID_MAX}`);
  });

  it("el CHECK de alcance admite exactamente ALCANCES_DESCARTE", () => {
    const lista = ALCANCES_DESCARTE.map((a) => `'${a}'`).join(", ");
    expect(sql).toContain(`check (alcance in (${lista}))`);
  });

  it("un id que el cliente deja pasar cumple también la limpieza del CHECK (sin espacios ni vacío)", () => {
    for (const id of ["carnes_146", "a".repeat(RECETA_ID_MAX), "x"]) {
      expect(RECETA_ID_RE.test(id)).toBe(true);
      expect(id).toBe(id.trim());
      expect(id).not.toBe("");
    }
  });
});

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

describe("refrescarDescartadas: la cuenta de la casa", () => {
  const hace = (dias) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    lectura.mockReset();
    llamadasEq.length = 0;
    insert.mockReset();
    from.mockClear();
    vi.restoreAllMocks();
    fijarDescartadas([]);
  });

  it("lee por casa y deja fijados los platos que pasan el umbral", async () => {
    lectura.mockResolvedValue({
      data: [
        { receta_id: "carnes_146", alcance: "plato", created_at: hace(1) },
        { receta_id: "carnes_146", alcance: "plato", created_at: hace(5) },
        { receta_id: "pescados_7", alcance: "plato", created_at: hace(2) },
      ],
      error: null,
    });
    const n = await refrescarDescartadas({ user: { id: "u-1" }, householdId: "h-1" });
    expect(n).toBe(1);
    expect(llamadasEq).toEqual([["household_id", "h-1"]]);
    expect([...descartadasVigentes()]).toEqual(["carnes_146"]);
  });

  it("sin casa lee los de la propia persona", async () => {
    lectura.mockResolvedValue({ data: [], error: null });
    await refrescarDescartadas({ user: { id: "u-1" }, householdId: null });
    expect(llamadasEq).toEqual([["user_id", "u-1"]]);
  });

  it("plan B: sin sesión, sin tabla o con un fallo la cuenta queda vacía y no lanza", async () => {
    fijarDescartadas(["a_1"]);
    expect(await refrescarDescartadas({ user: null })).toBe(0);
    expect(descartadasVigentes().size).toBe(0);

    fijarDescartadas(["a_1"]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    lectura.mockResolvedValue({ data: null, error: { message: 'relation "receta_descartes" does not exist' } });
    expect(await refrescarDescartadas({ user: { id: "u-1" }, householdId: "h-1" })).toBe(0);
    expect(descartadasVigentes().size).toBe(0);

    fijarDescartadas(["a_1"]);
    lectura.mockRejectedValue(new Error("offline"));
    await expect(refrescarDescartadas({ user: { id: "u-1" }, householdId: "h-1" })).resolves.toBe(0);
    expect(descartadasVigentes().size).toBe(0);
  });

  it("si la lectura llega al tope de filas, lo dice en el log y no la trunca en silencio", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filas = Array.from({ length: 2000 }, (_, i) => ({ receta_id: `r_${i % 7}`, alcance: "menu", created_at: hace(1) }));
    lectura.mockResolvedValue({ data: filas, error: null });
    await refrescarDescartadas({ user: { id: "u-1" }, householdId: "h-1" });
    expect(aviso).toHaveBeenCalledWith("[descartes] lectura truncada al tope de", 2000);
    aviso.mockClear();
    lectura.mockResolvedValue({ data: filas.slice(0, 5), error: null });
    await refrescarDescartadas({ user: { id: "u-1" }, householdId: "h-1" });
    expect(aviso).not.toHaveBeenCalled();
  });

  it("tras apuntar un descarte con cuenta, la cuenta se vuelve a leer", async () => {
    insert.mockResolvedValue({ error: null });
    lectura.mockResolvedValue({ data: [], error: null });
    await registrarDescartes({ user: { id: "u-1" }, householdId: "h-1", recetaIds: ["carnes_146"], ambito: "plato" });
    expect(lectura).toHaveBeenCalledTimes(1);
  });

  it("carrera: si se cambia de casa mientras una lectura sigue en vuelo, la vieja no pisa a la nueva", async () => {
    const dosPlatos = (id) => [
      { receta_id: id, alcance: "plato", created_at: hace(1) },
      { receta_id: id, alcance: "plato", created_at: hace(2) },
    ];
    let soltarLaVieja;
    lectura
      .mockImplementationOnce(() => new Promise((res) => { soltarLaVieja = () => res({ data: dosPlatos("casa_a_1"), error: null }); }))
      .mockImplementationOnce(() => Promise.resolve({ data: dosPlatos("casa_b_2"), error: null }));

    const vieja = refrescarDescartadas({ user: { id: "u-1" }, householdId: "casa-a" });
    await refrescarDescartadas({ user: { id: "u-1" }, householdId: "casa-b" });
    expect([...descartadasVigentes()]).toEqual(["casa_b_2"]);

    soltarLaVieja();
    await vieja;
    expect([...descartadasVigentes()]).toEqual(["casa_b_2"]);
  });

  it("al cambiar de casa la cuenta de la anterior se vacía ya, sin esperar a la lectura nueva", async () => {
    fijarDescartadas(["de_la_casa_anterior"]);
    await refrescarDescartadas({ user: { id: "u-2" }, householdId: "otra-casa" }).catch(() => {});
    let soltar;
    lectura.mockImplementationOnce(() => new Promise((res) => { soltar = () => res({ data: [], error: null }); }));
    fijarDescartadas(["de_la_casa_anterior"]);
    const lee = refrescarDescartadas({ user: { id: "u-2" }, householdId: "una-tercera" });
    expect(descartadasVigentes().size).toBe(0);
    soltar();
    await lee;
  });
});
