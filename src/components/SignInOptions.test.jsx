// @vitest-environment jsdom
//
// «Continuar con Apple» solo sale en la app nativa de iOS. La Guideline 4.8 de
// App Store es de iOS, y en la web el proveedor Apple puede no estar habilitado
// en Supabase: el botón llevaría a un error. Mientras Pablo no confirme que lo
// está (issue #890), la web ofrece solo Google.
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
});

describe("SignInOptions", () => {
  it("en la web solo ofrece Google", async () => {
    const texto = await montar(false);
    expect(texto).toContain("Google");
    expect(texto).not.toContain("Apple");
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
});
