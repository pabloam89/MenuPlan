// Trozo 16: el trabajador mira si la cuenta de Mercadona tiene dirección y medio de pago, y solo eso viaja y se apunta.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { atender } from "./lib/mercadonaTrabajador.mjs";
import { enPaginaRevisar, revisionDe } from "./lib/mercadonaPagina.mjs";
import { esRevision } from "../src/lib/mercadonaLlegaHasta.js";

const lista = { name: "Compra", products: [{ merca_code: "1", quantity: 2 }] };
const siguiente = { encargo: { id: "e1", lista }, sesion_cifrada: "sellada" };
const CREADA = { paso: "leer", status: 200, id: 7, guardada: { products: [{ id: "1" }] } };

/** Una página falsa: la portada abre, hay sesión, y la revisión contesta `revision`. */
function pagina(revision) {
  return {
    goto: vi.fn(async () => ({ status: () => 200 })),
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async (f, l) => (f === enPaginaRevisar ? revision : l ? CREADA : true)),
  };
}
const dep = (p, log = vi.fn()) => ({ abrirSesion: async () => "{}", abrirNavegador: async () => ({ pagina: p, cerrar: async () => {} }), log });

describe("la revisión de la cuenta", () => {
  it("viaja con el cierre: dos booleanos y nada más", async () => {
    const r = await atender(siguiente, dep(pagina({ tiene_direccion: true, tiene_pago: false })));
    expect(r).toEqual({ lista_xid: "7", entraron: 1, faltan: [], revision: { tiene_direccion: true, tiene_pago: false } });
    expect(esRevision(r.revision)).toBe(true);
  });

  it("si no se pudo mirar, la lista se rellena igual, sin revisión, y queda en el log", async () => {
    const log = vi.fn();
    const r = await atender(siguiente, dep(pagina({ paso: "perfil", status: 500 }), log));
    expect(r).toEqual({ lista_xid: "7", entraron: 1, faltan: [] });
    expect(log).toHaveBeenCalledWith("revisión sin hacer: perfil 500");
  });

  it("si la página lanza (sin red, una respuesta que no es JSON), la lista se rellena igual y queda en el log", async () => {
    const log = vi.fn();
    const p = pagina(null);
    p.evaluate = vi.fn(async (f, l) => {
      if (f === enPaginaRevisar) throw new SyntaxError("Unexpected token < in JSON");
      return l ? CREADA : true;
    });
    const r = await atender(siguiente, dep(p, log));
    expect(r).toEqual({ lista_xid: "7", entraron: 1, faltan: [] });
    expect(log).toHaveBeenCalledWith("revisión sin hacer: lanzo SyntaxError");
  });

  it("de la página solo se quedan los dos booleanos", () => {
    expect(revisionDe({ tiene_direccion: true, tiene_pago: true, direccion: "Calle Mayor 1" })).toEqual({ tiene_direccion: true, tiene_pago: true });
    expect(revisionDe({ tiene_direccion: "sí", tiene_pago: true })).toBeNull();
    expect(revisionDe(null)).toBeNull();
  });
});

describe("dentro de la página", () => {
  const respuesta = (ok, cuerpo, status = 200) => ({ ok, status, json: async () => cuerpo });
  beforeEach(() => {
    globalThis.localStorage = { getItem: () => JSON.stringify({ token: "t", uuid: "u" }) };
  });

  it("dirección es tener alguna; pago, has_active_billing", async () => {
    globalThis.fetch = vi.fn(async (url) => (url.includes("addresses") ? respuesta(true, { count: 2, results: [{}, {}] }) : respuesta(true, { has_active_billing: false })));
    expect(await enPaginaRevisar()).toEqual({ tiene_direccion: true, tiene_pago: false });
    expect(globalThis.fetch.mock.calls.map((c) => c[0])).toEqual(["/api/customers/u/addresses/?lang=es", "/api/customers/u/?lang=es"]);
  });

  it("sin direcciones, false; y si una llamada falla, dice cuál", async () => {
    globalThis.fetch = vi.fn(async (url) => (url.includes("addresses") ? respuesta(true, { count: 0 }) : respuesta(false, null, 401)));
    expect(await enPaginaRevisar()).toEqual({ paso: "perfil", status: 401 });
  });
});
