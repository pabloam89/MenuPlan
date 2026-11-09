// @vitest-environment jsdom
// Trozo 20 de #1407: la hora de entrega en la hoja de Comprar. Las horas libres en tarjetas; al tocar una se marca, las
// demás se apagan y se reserva; reservada, se dice cuándo llega y hasta cuándo se cambia (0134).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../lib/mercadonaApp.js", async (original) => ({
  ...(await original()),
  leerEstado: vi.fn(),
  elegirHora: vi.fn(),
}));

const { RellenarMercadona: Hoja } = await import("./ComprarMercadona.jsx");
const { pasoDeComprar, useRellenarMercadona } = await import("./useRellenarMercadona.js");
const app = await import("../lib/mercadonaApp.js");
const { HORA_ENTREGA } = app;
const { TEXTO_NO_ELEGIDA } = await import("../lib/mercadonaHoraEntrega.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ID = "0b1c2d3e-4f50-4172-8394-a5b6c7d8e9f0";
// Como las da Mercadona, en UTC; el 12 nov de 2026 Madrid va en UTC+1. Datos inventados.
const H1 = { id: "f1", start: "2026-11-12T14:00:00Z", end: "2026-11-12T15:00:00Z", price: "7.21", available: true };
const H2 = { id: "f2", start: "2026-11-12T16:00:00Z", end: "2026-11-12T17:00:00Z", price: "0", available: true };
const BASE = { ok: true, disponible: true, clave_publica: "clave", cuenta: "conectada" };
const ELIGIENDO = { id: ID, status: "eligiendo", lista_xid: "77", total: 64.1, horas_entrega: [H1, H2] };
let root;
let contenedor;
let paso;

function Pantalla() {
  const m = useRellenarMercadona("casa", { name: "Compra", products: [] });
  paso = pasoDeComprar(m);
  return <Hoja m={m} />;
}

async function pintar(estado) {
  app.leerEstado.mockResolvedValue({ ...BASE, encargo: estado });
  contenedor = document.body.appendChild(document.createElement("div"));
  root = createRoot(contenedor);
  await act(async () => root.render(<Pantalla />));
}
const horas = () => [...contenedor.querySelectorAll('[role="radio"]')];
const pulsar = (b) => act(async () => b.click());

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe("elegir la hora de entrega", () => {
  it("pregunta y enseña cada hora en la hora de Madrid, con su precio", async () => {
    await pintar(ELIGIENDO);
    expect(contenedor.textContent).toContain(HORA_ENTREGA.PREGUNTA);
    expect(horas().map((b) => b.textContent)).toEqual(["jueves 12 nov15:00–16:007,21 €", "jueves 12 nov17:00–18:00gratis"]);
    expect(horas().every((b) => b.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("entran en cascada: cada una un poco después que la anterior", async () => {
    await pintar(ELIGIENDO);
    expect(horas().map((b) => b.style.animationDelay)).toEqual(["0ms", "60ms"]);
    expect(horas().every((b) => b.className.includes("mp-hora-entra"))).toBe(true);
  });

  it("el botón de comprar pasa a elegir la hora y abre la hoja", async () => {
    await pintar(ELIGIENDO);
    expect(paso).toMatchObject({ texto: app.PASO_COMPRAR.ELEGIR, abrirHoja: true });
  });

  it("al tocar una: se marca, las demás se apagan, y se pide esa", async () => {
    let soltar;
    app.elegirHora.mockReturnValue(new Promise((r) => (soltar = r)));
    await pintar(ELIGIENDO);
    await pulsar(horas()[1]);
    expect(app.elegirHora).toHaveBeenCalledWith("casa", ID, "f2");
    const [primera, segunda] = horas();
    expect(segunda.getAttribute("aria-checked")).toBe("true");
    expect(primera.disabled).toBe(true);
    expect(primera.style.opacity).toBe("0.4");
    expect(contenedor.textContent).toContain(HORA_ENTREGA.RESERVANDO);
    // Un segundo toque mientras se pide no pide otra.
    await pulsar(segunda);
    expect(app.elegirHora).toHaveBeenCalledTimes(1);
    await act(async () => soltar({ ok: true, encargo: { id: ID, status: "reservando", hora_entrega: H2 } }));
    expect(horas()).toHaveLength(1);
    expect(paso.texto).toBe(app.PASO_COMPRAR.RESERVANDO);
  });

  it("si ya no vale, lo dice y vuelve a mirar", async () => {
    app.elegirHora.mockResolvedValue({ ok: true, fallo: "sin_elegir" });
    await pintar(ELIGIENDO);
    await pulsar(horas()[0]);
    expect(contenedor.textContent).toContain(TEXTO_NO_ELEGIDA.sin_elegir);
    expect(app.leerEstado).toHaveBeenCalledTimes(2);
  });
});

describe("reservada", () => {
  it("cuándo llega y hasta cuándo se cambia, en la hora de Madrid, y quién paga", async () => {
    await pintar({ id: ID, status: "hecho", lista_xid: "77", hora_entrega: H1, cambiable_hasta: "2026-11-11T18:59:00Z" });
    const aviso = contenedor.querySelector('[role="status"]');
    expect(aviso.className).toContain("mp-hora-reservada");
    expect(aviso.textContent).toBe("Te lo llevanjueves 12 nov, 15:00–16:00Puedes cambiar el pedido hasta el miércoles 11 a las 19:59.");
    expect(contenedor.textContent).toContain(HORA_ENTREGA.PAGAR);
    expect(contenedor.querySelector("a").href).toContain("/shopping-lists/77");
  });
});

describe("tras la lista", () => {
  it("si no se pudo reservar, la lista está y se dice por qué", async () => {
    await pintar({ id: ID, status: "fallido", fallo: "sin_horas", lista_xid: "77", entraron: 3, faltan: [] });
    expect(contenedor.textContent).toContain("Tu lista ya está en Mercadona, pero ahora no hay horas de entrega libres.");
    expect(horas()).toHaveLength(0);
  });
});
