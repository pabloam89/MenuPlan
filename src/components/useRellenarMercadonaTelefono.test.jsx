// @vitest-environment jsdom
// Trozo 17: guardar el teléfono distingue un número mal escrito de un fallo de la red o del servidor.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../lib/mercadonaApp.js", async (original) => ({
  ...(await original()),
  leerEstado: vi.fn(async () => ({ ok: true, disponible: true, clave_publica: "clave", cuenta: "conectada", encargo: null })),
  enviarTelefono: vi.fn(),
}));
vi.mock("../lib/mercadonaSello.js", async (original) => ({ ...(await original()), sellar: vi.fn(async () => "sellado") }));

const { useRellenarMercadona } = await import("./useRellenarMercadona.js");
const app = await import("../lib/mercadonaApp.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let raiz;
let m;
function Sonda() {
  m = useRellenarMercadona("c", { name: "Compra", products: [] });
  return null;
}
async function montar() {
  raiz = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => raiz.render(<Sonda />));
}

describe("guardarTelefono", () => {
  afterEach(() => act(() => raiz.unmount()));

  it("guardado: true, y la cuenta ya tiene teléfono", async () => {
    app.enviarTelefono.mockResolvedValueOnce({ ok: true, guardado: true });
    await montar();
    let r;
    await act(async () => (r = await m.guardarTelefono("600 11 22 33")));
    expect(r).toBe(true);
    expect(m.tiene_telefono).toBe(true);
    expect(m.aviso).toBeNull();
  });

  it("un número que no es un teléfono: false, sin llamar al servidor", async () => {
    app.enviarTelefono.mockClear();
    await montar();
    let r;
    await act(async () => (r = await m.guardarTelefono("hola")));
    expect(r).toBe(false);
    expect(app.enviarTelefono).not.toHaveBeenCalled();
  });

  it.each([
    ["el servidor dice que no", { ok: true, fallo: "sin_cuenta" }],
    ["sin red", { ok: false }],
  ])("%s: null y el aviso de que no se guardó, no que el número esté mal", async (_, respuesta) => {
    app.enviarTelefono.mockResolvedValueOnce(respuesta);
    await montar();
    let r;
    await act(async () => (r = await m.guardarTelefono("600 11 22 33")));
    expect(r).toBeNull();
    expect(m.aviso).toBe(app.TELEFONO.NO_GUARDADO);
  });
});
