import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { atender, esperaTrasFallos, resultadoDeEncargo, unaVuelta } from "./mercadonaTrabajador.mjs";
import { FALLOS_ENCARGO_MERCADONA } from "../../src/lib/vocabularios.js";

const lista = { name: "Compra", products: [{ merca_code: "1", quantity: 2 }, { merca_code: "2", quantity: 1 }] };
const siguiente = { encargo: { id: "e1", lista }, sesion_cifrada: "sellada" };

function paginaCon({ portada = 200, sesion = true, crear = { paso: "leer", status: 200, id: 7, guardada: { products: [{ id: "1" }, { id: "2" }] } } } = {}) {
  return {
    goto: vi.fn(async () => ({ status: () => portada })),
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async (_f, l) => (l ? crear : sesion)),
  };
}

let cerrar;
const dep = (pagina) => ({
  abrirSesion: async () => '{"cookies":[]}',
  abrirNavegador: async () => ({ pagina, cerrar }),
});

beforeEach(() => {
  cerrar = vi.fn(async () => {});
});

describe("resultadoDeEncargo", () => {
  it.each([
    [{ resultado: "productos_completos", id: 7, entraron: 2, faltan: [] }, { lista_xid: "7", entraron: 2, faltan: [] }],
    [{ resultado: "faltan_productos", id: 7, entraron: 1, faltan: ["2"] }, { lista_xid: "7", entraron: 1, faltan: ["2"] }],
    [{ resultado: "lista_sin_releer", id: 7, status: 500 }, { lista_xid: "7", entraron: null, faltan: null }],
    [{ resultado: "bloqueado_portada", status: 403 }, { fallo: "bloqueado" }],
    [{ resultado: "sin_sesion" }, { fallo: "sesion_caducada" }],
    [{ resultado: "fallo_sesion", status: 0 }, { fallo: "sesion_caducada" }],
    [{ resultado: "fallo_crear", status: 401 }, { fallo: "sesion_caducada" }],
    [{ resultado: "fallo_crear", status: 403 }, { fallo: "bloqueado" }],
    [{ resultado: "fallo_crear", status: 429 }, { fallo: "bloqueado" }],
    [{ resultado: "fallo_crear", status: 500 }, { fallo: "error" }],
    [{ resultado: "lo_que_sea" }, { fallo: "error" }],
  ])("%j", (r, esperado) => {
    expect(resultadoDeEncargo(r)).toEqual(esperado);
  });
});

describe("el vocabulario de fallos", () => {
  it("todo lo que el trabajador cuenta es un fallo que la API acepta", () => {
    const salen = ["bloqueado_portada", "sin_sesion", "fallo_sesion", "lo_que_sea"].map((resultado) => resultadoDeEncargo({ resultado }).fallo);
    salen.push(...[401, 403, 429, 500].map((status) => resultadoDeEncargo({ resultado: "fallo_crear", status }).fallo));
    expect(salen.filter((f) => !FALLOS_ENCARGO_MERCADONA.includes(f))).toEqual([]);
  });
});

describe("atender", () => {
  it("crea la lista y cierra el navegador", async () => {
    expect(await atender(siguiente, dep(paginaCon()))).toEqual({ lista_xid: "7", entraron: 2, faltan: [] });
    expect(cerrar).toHaveBeenCalledOnce();
  });

  it("si la portada bloquea, no intenta crear", async () => {
    const p = paginaCon({ portada: 403 });
    expect(await atender(siguiente, dep(p))).toEqual({ fallo: "bloqueado" });
    expect(p.evaluate).not.toHaveBeenCalled();
  });

  it("sin sesión en la página, caducada, y no crea", async () => {
    const p = paginaCon({ sesion: false });
    expect(await atender(siguiente, dep(p))).toEqual({ fallo: "sesion_caducada" });
    expect(p.evaluate).toHaveBeenCalledOnce();
  });

  it("un sello que no se abre pide volver a conectar, sin abrir navegador", async () => {
    const abrirNavegador = vi.fn();
    const log = vi.fn();
    const r = await atender(siguiente, { abrirSesion: async () => { throw new TypeError("Bearer secreto"); }, abrirNavegador, log });
    expect(r).toEqual({ fallo: "sesion_caducada" });
    expect(abrirNavegador).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("sesión sin abrir: TypeError");
  });

  it("una lista mala no abre ni la sesión", async () => {
    const abrirSesion = vi.fn();
    const r = await atender({ ...siguiente, encargo: { id: "e1", lista: { name: "x", products: [] } } }, { abrirSesion });
    expect(r).toEqual({ fallo: "lista_no_valida" });
    expect(abrirSesion).not.toHaveBeenCalled();
  });

  it("si la página revienta, el navegador se cierra igual", async () => {
    const p = paginaCon();
    p.goto.mockRejectedValueOnce(new Error("red"));
    await expect(atender(siguiente, dep(p))).rejects.toThrow("red");
    expect(cerrar).toHaveBeenCalledOnce();
  });
});

describe("unaVuelta", () => {
  const api = (s) => ({ tomar: vi.fn(async () => s), cerrar: vi.fn(async () => {}) });

  it("sin trabajo no hace nada", async () => {
    const a = api(null);
    expect(await unaVuelta({ api: a, log: () => {}, ...dep(paginaCon()) })).toBe(false);
    expect(a.cerrar).not.toHaveBeenCalled();
  });

  it("cierra lo hecho", async () => {
    const a = api(siguiente);
    expect(await unaVuelta({ api: a, log: () => {}, ...dep(paginaCon()) })).toBe(true);
    expect(a.cerrar).toHaveBeenCalledWith("e1", { lista_xid: "7", entraron: 2, faltan: [] });
  });

  it("un fallo nuestro se cierra como error, y no se queda en marcha", async () => {
    const a = api(siguiente);
    const p = paginaCon();
    p.goto.mockRejectedValueOnce(new Error("red"));
    await unaVuelta({ api: a, log: () => {}, ...dep(p) });
    expect(a.cerrar).toHaveBeenCalledWith("e1", { fallo: "error" });
  });

  it("el log no lleva ni la sesión ni el mensaje del error", async () => {
    const lineas = [];
    const p = paginaCon();
    p.goto.mockRejectedValueOnce(new Error("Bearer secreto"));
    await unaVuelta({ api: api(siguiente), log: (t) => lineas.push(t), ...dep(p) });
    expect(lineas.join(" ")).not.toMatch(/secreto|sellada/);
  });
});

describe("el tope y los reintentos", () => {
  it("un encargo colgado se da por fallido y el navegador se cierra", async () => {
    const p = paginaCon();
    p.goto.mockReturnValueOnce(new Promise(() => {}));
    await expect(atender(siguiente, { ...dep(p), topeMs: 5 })).rejects.toThrow("tope del encargo");
    expect(cerrar).toHaveBeenCalledOnce();
  });

  it("repite el cierre tras un corte", async () => {
    const a = { tomar: vi.fn(async () => siguiente), cerrar: vi.fn() };
    a.cerrar.mockRejectedValueOnce(new Error("api")).mockResolvedValueOnce({});
    expect(await unaVuelta({ api: a, log: () => {}, dormir: async () => {}, ...dep(paginaCon()) })).toBe(true);
    expect(a.cerrar).toHaveBeenCalledTimes(2);
  });

  it("si no puede cerrar, lo dice", async () => {
    const a = { tomar: vi.fn(async () => siguiente), cerrar: vi.fn().mockRejectedValue(new Error("api")) };
    await expect(unaVuelta({ api: a, log: () => {}, dormir: async () => {}, ...dep(paginaCon()) })).rejects.toThrow("api");
    expect(a.cerrar).toHaveBeenCalledTimes(3);
  });
});

describe("esperaTrasFallos", () => {
  it("crece hasta el tope", () => {
    expect([0, 1, 2, 9].map((n) => esperaTrasFallos(n, 20, 300))).toEqual([20, 40, 80, 300]);
  });
});

describe("la imagen del trabajador", () => {
  const RAIZ = join(import.meta.dirname, "..", "..");
  const dockerfile = readFileSync(join(RAIZ, "ops/mercadona-trabajador/Dockerfile"), "utf8");

  /** Los ficheros propios a los que llega el trabajador, siguiendo sus imports. */
  function alcanzables(fichero, vistos = new Set()) {
    vistos.add(fichero);
    const codigo = readFileSync(join(RAIZ, fichero), "utf8");
    for (const [, ruta] of codigo.matchAll(/from "(\.[^"]+)"/g)) {
      const siguiente = join(dirname(fichero), ruta).replaceAll("\\", "/");
      if (!vistos.has(siguiente)) alcanzables(siguiente, vistos);
    }
    return [...vistos];
  }

  it("copia todo lo que el trabajador importa", () => {
    const faltan = alcanzables("scripts/mercadona-trabajador.mjs").filter((f) => !dockerfile.includes(f.split("/").pop()));
    expect(faltan).toEqual([]);
  });

  it("va con la misma versión de Playwright que el repo", () => {
    const { version } = JSON.parse(readFileSync(join(RAIZ, "node_modules/@playwright/test/package.json"), "utf8"));
    expect(dockerfile).toContain(`playwright:v${version}-`);
    expect(dockerfile).toContain(`@playwright/test@${version}`);
  });
});
