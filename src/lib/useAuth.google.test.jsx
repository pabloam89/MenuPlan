// @vitest-environment jsdom
// Añadir Google a la cuenta con sesión (#1238): linkIdentity con Google y vuelta a la app.
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  linkIdentity: vi.fn(async () => ({ data: { url: "https://google" }, error: null })),
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
}));
vi.mock("./supabase.js", () => ({ supabase: { auth } }));
vi.mock("./analytics.js", () => ({ upsertUserProfile: vi.fn() }));
vi.mock("./appleTokens.js", () => ({ rememberAppleRefreshToken: vi.fn() }));
vi.mock("./apiUrl.js", () => ({ isNativeApp: false }));

const { useAuth } = await import("./useAuth.js");
const { AVISOS_AL_VOLVER } = await import("./cuentaTelegram.js");

describe("useAuth: entrar también con Google", () => {
  it("pide a Supabase añadir Google a la cuenta, volviendo a la app", async () => {
    let api;
    function Prueba() { api = useAuth(); return null; }
    const raiz = createRoot(document.createElement("div"));
    await act(async () => { raiz.render(<Prueba />); });
    const r = await api.linkWithGoogle();
    expect(r.error).toBeNull();
    expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: window.location.origin } });
    act(() => raiz.unmount());
  });

  it("si la vuelta de Google trae un error, lo da para avisar; olvidado, ya no", async () => {
    window.history.replaceState(null, "", "/?error=server_error&error_code=identity_already_exists");
    let api;
    function Prueba() { api = useAuth(); return null; }
    const raiz = createRoot(document.createElement("div"));
    await act(async () => { raiz.render(<Prueba />); });
    expect(api.avisoAlEntrar).toBe(AVISOS_AL_VOLVER.identity_already_exists);
    await act(async () => { api.olvidarAvisoAlEntrar(); });
    expect(api.avisoAlEntrar).toBeNull();
    act(() => raiz.unmount());
    window.history.replaceState(null, "", "/");
  });
});
