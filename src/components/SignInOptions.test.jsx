// @vitest-environment jsdom
//
// «Continuar con Apple» sale en la app nativa de iOS (Guideline 4.8) y en la web
// solo con la bandera VITE_APPLE_WEB, encendida en `staging` para probarlo. La
// web de producción sigue ofreciendo solo Google hasta cerrar el issue #890.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

let container = null;
let root = null;

// `isNativeApp` se fija al cargar apiUrl.js (Capacitor.isNativePlatform()), así
// que cada caso carga el módulo de nuevo con el Capacitor que toca.
async function montar(nativa, props = {}) {
  vi.resetModules();
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => nativa } }));
  const { SignInOptions } = await import("./ui.jsx");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<SignInOptions onGoogle={() => {}} onApple={() => {}} {...props} />);
  });
  return container.textContent;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = root = null;
  vi.doUnmock("@capacitor/core");
  vi.unstubAllEnvs();
});

describe("SignInOptions", () => {
  it("en la web solo ofrece Google", async () => {
    vi.stubEnv("VITE_APPLE_WEB", "");
    const texto = await montar(false);
    expect(texto).toContain("Google");
    expect(texto).not.toContain("Apple");
  });

  it("en la web ofrece Apple con la bandera de staging", async () => {
    vi.stubEnv("VITE_APPLE_WEB", "on");
    const texto = await montar(false);
    expect(texto).toContain("Continuar con Apple");
    expect(texto).toContain("Google");
  });

  it("con la bandera apagada, la web sigue solo con Google", async () => {
    vi.stubEnv("VITE_APPLE_WEB", "off");
    expect(await montar(false)).not.toContain("Apple");
  });

  it("en la app nativa ofrece Apple y Google (Guideline 4.8)", async () => {
    const texto = await montar(true);
    expect(texto).toContain("Continuar con Apple");
    expect(texto).toContain("Google");
  });

  it("`conApple` manda sobre el entorno (para abrirlo en la web más adelante)", async () => {
    expect(await montar(false, { conApple: true })).toContain("Continuar con Apple");
    act(() => root.unmount());
    container.remove();
    expect(await montar(true, { conApple: false })).not.toContain("Apple");
  });

  // «Entrar con Telegram» va primero (specs/auth.md §7), donde funciona el login de Telegram.
  it("con el login de Telegram, «Entrar con Telegram» es el primer botón", async () => {
    vi.stubEnv("VITE_APPLE_WEB", "on");
    await montar(false, { urlTelegram: "https://oauth.telegram.org/auth?bot_id=1" });
    const botones = [...container.querySelectorAll("button")].map((b) => b.textContent);
    expect(botones).toEqual(["Entrar con Telegram", "Continuar con Apple", "Continuar con Google"]);
  });

  it("fuera del dominio del bot (aquí, localhost), no sale", async () => {
    expect(await montar(false)).not.toContain("Telegram");
  });
});

// «¿Ya hablas con Lola?» (trozo 4 de specs/auth.md §7): la pregunta antes de crear una cuenta de Google o Apple.
describe("PreguntaDeCuenta: «¿Ya hablas con Lola?»", () => {
  async function pregunta(props) {
    vi.resetModules();
    const { PreguntaDeCuenta } = await import("./ui.jsx");
    const { PREGUNTA_ALTA } = await import("../lib/cuentaTelegram.js");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<PreguntaDeCuenta titulo={PREGUNTA_ALTA.titulo} principal={PREGUNTA_ALTA.telegram} secundario={PREGUNTA_ALTA.crear} conTelegram {...props} />);
    });
    return PREGUNTA_ALTA;
  }
  const boton = (texto) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(texto));

  it("pregunta «¿Ya hablas con Lola?» con dos salidas: Telegram y crear la cuenta", async () => {
    const onPrincipal = vi.fn(async () => ({ error: null }));
    const onSecundario = vi.fn();
    const P = await pregunta({ onPrincipal, onSecundario });
    expect(container.textContent).toContain("¿Ya hablas con Lola?");
    await act(async () => { boton(P.telegram).click(); });
    expect(onPrincipal).toHaveBeenCalledTimes(1);
    act(() => { boton(P.crear).click(); });
    expect(onSecundario).toHaveBeenCalledTimes(1);
  });

  it("si entrar con Telegram falla, lo dice y la pregunta sigue", async () => {
    const P = await pregunta({ onPrincipal: async () => ({ error: new Error("No se pudo. Inténtalo de nuevo.") }), onSecundario: () => {} });
    await act(async () => { boton(P.telegram).click(); });
    expect(container.querySelector("[role=alert]")?.textContent).toBe(P.noSePudo);
    expect(container.textContent).toContain(P.crear);
  });
});
