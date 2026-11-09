// @vitest-environment jsdom
// La hoja de la primera vez (trozo 6): al pulsar Comprar sin cuenta, los permisos (los mismos interruptores de Ajustes,
// «Rellenar la lista» ya encendido) y cómo entrar en Mercadona.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const nativa = vi.hoisted(() => ({ valor: false }));
vi.mock("../lib/apiUrl.js", async (original) => ({
  ...(await original()),
  get isNativeApp() { return nativa.valor; },
}));

const { RellenarMercadona } = await import("./ComprarMercadona.jsx");
const { AJUSTE_MERCADONA } = await import("../lib/mercadonaApp.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let contenedor;

const SIN_CUENTA = { servicio: true, conectada: false, caducada: false, aviso: null, encargo: null, esperando: false, desconectar: vi.fn() };

async function pintar(m) {
  contenedor = document.body.appendChild(document.createElement("div"));
  root = createRoot(contenedor);
  await act(async () => root.render(<RellenarMercadona m={{ ...SIN_CUENTA, ...m }} />));
}
const interruptor = (nombre) => contenedor.querySelector(`[role="switch"][aria-label="${nombre}"]`);

beforeEach(() => {
  nativa.valor = false;
  window.matchMedia = vi.fn(() => ({ matches: false }));
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("la hoja de la primera vez", () => {
  it("sin cuenta enseña los dos permisos: la lista encendida y pagar apagado, que no se enciende", async () => {
    await pintar();
    expect(interruptor(AJUSTE_MERCADONA.LISTA).getAttribute("aria-checked")).toBe("true");
    const pagar = interruptor(AJUSTE_MERCADONA.PAGAR);
    expect(pagar.getAttribute("aria-checked")).toBe("false");
    expect(pagar.disabled).toBe(true);
    expect(contenedor.textContent).toContain(AJUSTE_MERCADONA.PRONTO);
  });

  it("dice que es solo esta vez y, en la web del móvil, manda a la app; sin marcador", async () => {
    await pintar();
    expect(contenedor.textContent).toContain("Solo te lo pido esta vez");
    expect(contenedor.textContent).toContain("abre la app de HoMenu");
    expect(contenedor.querySelector("a")).toBeNull();
  });

  it("en la app dice que HoMenu no ve ni guarda la contraseña, sin marcador ni mandar a la app", async () => {
    nativa.valor = true;
    await pintar();
    expect(contenedor.textContent).toContain("HoMenu no ve ni guarda tu contraseña");
    expect(contenedor.textContent).not.toContain("abre la app de HoMenu");
    expect(contenedor.querySelector("a")).toBeNull();
  });

  it("con la sesión caducada pide volver a entrar", async () => {
    await pintar({ caducada: true });
    expect(contenedor.textContent).toContain("Vuelve a entrar en Mercadona");
  });

  it("apagar «Rellenar la lista» quita la forma de entrar y no desconecta nada", async () => {
    const desconectar = vi.fn();
    await pintar({ desconectar });
    await act(async () => interruptor(AJUSTE_MERCADONA.LISTA).click());
    expect(interruptor(AJUSTE_MERCADONA.LISTA).getAttribute("aria-checked")).toBe("false");
    expect(contenedor.textContent).not.toContain("Solo te lo pido esta vez");
    expect(desconectar).not.toHaveBeenCalled();
  });
});
