// El canario no escribe en producción (#267, revisor del PR #276): con la
// herramienta de verdad (buscar_recetas, que apunta `bot_busqueda` en
// user_events sin esperar) y la base de verdad de db.js, con solo un fetch de
// mentira debajo. Fuera de enSoloLectura la búsqueda escribe (el control);
// dentro, el registro se calla y no sale ninguna escritura.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sin-clave";

vi.mock("../_bot/ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
// El motor viene empaquetado en el build (core.mjs): aquí, un catálogo vacío.
vi.mock("../_bot/menu.js", async (original) => ({ ...(await original()), motor: async () => ({ recipeCatalog: [], RECIPES_BY_ID: {} }), prepararRecetas: async () => {} }));

const { enSoloLectura, insert, rpc } = await import("../_bot/db.js");
const { preparar } = await import("./canario.js");

let escrituras;
beforeEach(() => {
  escrituras = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url, o = {}) => {
    const ruta = new URL(url).pathname;
    if ((o.method ?? "GET") !== "GET") escrituras.push(`${o.method} ${ruta}`);
    const filas = ruta.endsWith("/household_state") ? [{ state: { data: {} }, bot_rev: 0, updated_at: null }] : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(filas) };
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const esperarSueltas = () => new Promise((r) => setTimeout(r, 50));

async function buscar() {
  const { tools } = await preparar("casa-canario", "¿Qué comemos hoy?");
  const t = tools.find((x) => x.name === "buscar_recetas");
  expect(t, "buscar_recetas entre las herramientas del canario").toBeTruthy();
  await t.run({ consulta: "x" }, { toolUse: { id: "1" } });
  await esperarSueltas();
}

describe("canario en solo lectura", () => {
  it("control: fuera de solo lectura, buscar_recetas escribe su evento", async () => {
    await buscar();
    expect(escrituras).toContain("POST /rest/v1/user_events");
  });

  it("dentro, la misma búsqueda no escribe nada y el registro se calla", async () => {
    const { negadas, calladas } = await enSoloLectura(buscar);
    expect(escrituras).toEqual([]);
    expect(negadas).toEqual([]);
    expect(calladas).toBeGreaterThanOrEqual(1);
  });

  it("una escritura de verdad se niega y se apunta; las funciones que solo leen pasan", async () => {
    const { negadas } = await enSoloLectura(async () => {
      await expect(insert("household_state", [{}])).rejects.toMatchObject({ soloLectura: true });
      await expect(rpc("bot_save_casa", {})).rejects.toMatchObject({ soloLectura: true });
      await rpc("ficha_casa", {});
    });
    expect(negadas).toEqual(["household_state", "bot_save_casa"]);
    expect(escrituras).toEqual(["POST /rest/v1/rpc/ficha_casa"]);
  });
});
