import { describe, expect, it, vi } from "vitest";
import { estadoDeMarcador, MENSAJE_LISTA, marcador, ORIGEN_TIENDA, vieneDelMarcador } from "./mercadonaConectar.js";

const ORIGEN = "https://homenu.test";
const MO = JSON.stringify({ token: "t", uuid: "u" });

/** Corre el marcador con un navegador de mentira y devuelve qué hizo. */
function correr({ origen = ORIGEN_TIENDA, mo = MO } = {}) {
  const escuchas = [];
  const w = { postMessage: vi.fn() };
  const open = vi.fn(() => w);
  const alert = vi.fn();
  const codigo = decodeURIComponent(marcador(ORIGEN).slice("javascript:".length));
  new Function("location", "localStorage", "window", "alert", "document", "addEventListener", "removeEventListener", codigo)(
    { origin: origen },
    { getItem: () => mo },
    { open },
    alert,
    { cookie: "__mo_da=x" },
    (_t, f) => escuchas.push(f),
    () => escuchas.pop(),
  );
  return { escuchas, w, open, alert };
}

describe("marcador", () => {
  it("es un enlace sin saltos de línea", () => {
    expect(marcador(ORIGEN)).toMatch(/^javascript:[^\n]+$/);
  });

  it("abre HoMenu y no manda nada hasta que HoMenu avisa", () => {
    const { open, w } = correr();
    expect(open).toHaveBeenCalledWith(`${ORIGEN}/?mercadona=conectar`, "_blank");
    expect(w.postMessage).not.toHaveBeenCalled();
  });

  it("manda la sesión solo a HoMenu, y una vez", () => {
    const { escuchas, w } = correr();
    escuchas[0]({ origin: ORIGEN, data: MENSAJE_LISTA });
    expect(w.postMessage).toHaveBeenCalledWith({ mo: MO, cookies: "__mo_da=x" }, ORIGEN);
    expect(escuchas).toHaveLength(0);
  });

  it("no hace caso a otra web", () => {
    const { escuchas, w } = correr();
    escuchas[0]({ origin: "https://mala.test", data: MENSAJE_LISTA });
    expect(w.postMessage).not.toHaveBeenCalled();
  });

  it("fuera de Mercadona, avisa y no lee nada", () => {
    const { alert, open } = correr({ origen: "https://otra.test" });
    expect(alert).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("sin haber entrado, avisa", () => {
    const { alert, open } = correr({ mo: "{}" });
    expect(alert).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("los enlaces", () => {
  it("la pestaña que abre el marcador se reconoce", () => {
    expect(vieneDelMarcador("?mercadona=conectar")).toBe(true);
    expect(vieneDelMarcador("?otra=1")).toBe(false);
  });
});

describe("estadoDeMarcador", () => {
  it("arma cookies y sesión en la forma del navegador", () => {
    const e = JSON.parse(estadoDeMarcador({ mo: MO, cookies: "a=1; b=c=2" }));
    expect(e.cookies.map((c) => [c.name, c.value, c.domain])).toEqual([
      ["a", "1", "tienda.mercadona.es"],
      ["b", "c=2", "tienda.mercadona.es"],
    ]);
    expect(e.origins[0]).toEqual({ origin: ORIGEN_TIENDA, localStorage: [{ name: "MO-user", value: MO }] });
  });

  it("sin sesión lanza", () => {
    expect(() => estadoDeMarcador({ mo: "{}", cookies: "" })).toThrow("sin sesión");
  });
});
