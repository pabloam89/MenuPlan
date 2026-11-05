// @vitest-environment jsdom
// Añadir Google a la cuenta con sesión (#1238): linkIdentity con Google y vuelta a la app.
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  linkIdentity: vi.fn(async () => ({ data: { url: "https://google" }, error: null })),
  getUserIdentities: vi.fn(async () => ({ data: { identities: [{ id: "i1", provider: "google" }, { id: "i2", provider: "apple" }] }, error: null })),
  unlinkIdentity: vi.fn(async () => ({ data: {}, error: null })),
  refreshSession: vi.fn(async () => ({ data: {}, error: null })),
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
}));
vi.mock("./supabase.js", () => ({ supabase: { auth } }));
vi.mock("./analytics.js", () => ({ upsertUserProfile: vi.fn() }));
vi.mock("./appleTokens.js", () => ({ rememberAppleRefreshToken: vi.fn() }));
vi.mock("./apiUrl.js", () => ({ isNativeApp: false }));

const { useAuth } = await import("./useAuth.js");
const { AVISOS_AL_VOLVER } = await import("./cuentaTelegram.js");

describe("useAuth: añadir una forma de entrar", () => {
  it("pide a Supabase añadir ese proveedor (Google, Apple) a la cuenta, volviendo a la app", async () => {
    let api;
    function Prueba() { api = useAuth(); return null; }
    const raiz = createRoot(document.createElement("div"));
    await act(async () => { raiz.render(<Prueba />); });
    const r = await api.anadirFormaDeEntrar("google");
    expect(r.error).toBeNull();
    expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: window.location.origin } });
    await api.anadirFormaDeEntrar("apple");
    expect(auth.linkIdentity).toHaveBeenLastCalledWith({ provider: "apple", options: { redirectTo: window.location.origin } });
    act(() => raiz.unmount());
  });

  it("quitar una forma: suelta esa identidad y renueva la sesión para que la lista diga lo nuevo", async () => {
    let hook;
    function Sonda() { hook = useAuth(); return null; }
    const raiz = createRoot(document.createElement("div"));
    await act(async () => raiz.render(<Sonda />));
    await expect(hook.quitarFormaDeEntrar("apple")).resolves.toEqual({ error: null });
    expect(auth.unlinkIdentity).toHaveBeenCalledWith({ id: "i2", provider: "apple" });
    expect(auth.refreshSession).toHaveBeenCalled();
    raiz.unmount();
  });

  it("quitar una forma que no está, o que Supabase rechaza, da el error y no renueva", async () => {
    let hook;
    function Sonda() { hook = useAuth(); return null; }
    const raiz = createRoot(document.createElement("div"));
    await act(async () => raiz.render(<Sonda />));
    auth.refreshSession.mockClear();
    auth.unlinkIdentity.mockResolvedValueOnce({ data: null, error: new Error("single identity") });
    expect((await hook.quitarFormaDeEntrar("google")).error?.message).toBe("single identity");
    expect((await hook.quitarFormaDeEntrar("azure")).error?.message).toMatch(/Sin identidad/);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    raiz.unmount();
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
