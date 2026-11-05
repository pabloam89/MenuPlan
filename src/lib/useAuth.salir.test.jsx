// @vitest-environment jsdom
// Cerrar sesión deja el dispositivo como recién llegado: sin la casa y en la portada.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: "cuenta-1" } } }, error: null })),
  getUser: vi.fn(async () => ({ data: { user: { id: "cuenta-1" } }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
  storageKey: "sb-prueba-auth-token",
}));
vi.mock("./supabase.js", () => ({ supabase: { auth } }));
vi.mock("./analytics.js", () => ({ upsertUserProfile: vi.fn() }));
vi.mock("./appleTokens.js", () => ({ rememberAppleRefreshToken: vi.fn() }));
vi.mock("./apiUrl.js", () => ({ isNativeApp: false }));

const { useAuth } = await import("./useAuth.js");
const { loadState } = await import("./storage.js");

async function cerrarSesion() {
  let hook;
  function Sonda() {
    hook = useAuth();
    return null;
  }
  const raiz = createRoot(document.createElement("div"));
  await act(async () => raiz.render(<Sonda />));
  await act(async () => { await hook.signOut(); });
  raiz.unmount();
}

describe("useAuth: cerrar sesión", () => {
  const replace = vi.fn();

  beforeEach(() => {
    replace.mockClear();
    auth.signOut.mockClear();
    vi.stubGlobal("location", { pathname: "/", search: "", hash: "", origin: "https://prueba", replace });
    localStorage.setItem("menuplan.state.v1", JSON.stringify({ data: { members: [{ id: "m1", name: "Ana" }] } }));
    localStorage.setItem("homenu:cuenta", "cuenta-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("borra la casa de este dispositivo y recarga, para volver a la portada", async () => {
    await cerrarSesion();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(loadState()).toBeNull();
    expect(localStorage.getItem("homenu:cuenta")).toBeNull();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("sin red, también: la sesión de este dispositivo se quita a mano", async () => {
    auth.signOut.mockResolvedValueOnce({ error: new Error("sin red") });
    localStorage.setItem(auth.storageKey, "sesion");
    await cerrarSesion();
    expect(localStorage.getItem(auth.storageKey)).toBeNull();
    expect(loadState()).toBeNull();
    expect(replace).toHaveBeenCalledOnce();
  });
});
