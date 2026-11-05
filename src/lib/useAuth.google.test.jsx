// @vitest-environment jsdom
// Añadir Google a la cuenta con sesión (#1238): linkIdentity con Google y vuelta a la app.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  linkIdentity: vi.fn(async () => ({ data: { url: "https://google" }, error: null })),
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  getUser: vi.fn(async () => ({ data: {}, error: null })),
  signOut: vi.fn(async () => ({ error: null })),
  // El último oyente de la sesión, para disparar SIGNED_IN como Supabase al volver de Google.
  onAuthStateChange: vi.fn((cb) => { auth.oyente = cb; return { data: { subscription: { unsubscribe: () => {} } } }; }),
}));
vi.mock("./supabase.js", () => ({ supabase: { auth } }));
vi.mock("./analytics.js", () => ({ upsertUserProfile: vi.fn() }));
vi.mock("./appleTokens.js", () => ({ rememberAppleRefreshToken: vi.fn() }));
vi.mock("./apiUrl.js", () => ({ isNativeApp: false, apiUrl: (ruta) => ruta }));
// jsdom sirve en localhost, fuera del dominio del bot: aquí el login de Telegram existe (la URL de verdad la prueba
// cuentaTelegram.test.js).
vi.mock("./cuentaTelegram.js", async (original) => ({ ...(await original()), urlEntrarConTelegram: () => "https://oauth.telegram.org/auth?bot_id=1" }));

const { useAuth } = await import("./useAuth.js");
const { AVISOS_AL_VOLVER, PREGUNTA_ALTA, emailSintetico } = await import("./cuentaTelegram.js");
const { upsertUserProfile } = await import("./analytics.js");

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

// Una persona, una cuenta (trozo 4 de specs/auth.md §7): la cuenta que nace al volver de Google no se da a la app
// hasta contestar «¿Ya hablas con Lola?».
describe("useAuth: «¿Ya hablas con Lola?» antes de crear una cuenta de Google", () => {
  const AHORA = Date.parse("2026-11-04T20:00:00Z");
  const sesion = (user) => ({ access_token: "tok", user });
  const deGoogle = (hace = 0) => ({ id: "g1", email: "ana@gmail.com", created_at: new Date(AHORA - hace).toISOString(), identities: [{ provider: "google" }] });

  let api;
  let raiz;
  async function monta(s) {
    auth.getSession.mockResolvedValueOnce({ data: { session: s }, error: null });
    function Prueba() { api = useAuth(); return null; }
    raiz = createRoot(document.createElement("div"));
    await act(async () => { raiz.render(<Prueba />); });
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
  });
  afterEach(() => { act(() => raiz?.unmount()); vi.useRealTimers(); });

  it("recién nacida en Google: pregunta antes de dar el usuario, y no escribe el perfil", async () => {
    await monta(sesion(deGoogle()));
    expect(api.altaPendiente).toBe(true);
    expect(api.user).toBeNull();
    await act(async () => { auth.oyente("SIGNED_IN", sesion(deGoogle())); });
    expect(upsertUserProfile).not.toHaveBeenCalled();
  });

  it("con la pregunta abierta, pasar la ventana no la contesta sola: la cuenta sigue sin darse a la app (juez C5)", async () => {
    await monta(sesion(deGoogle()));
    expect(api.altaPendiente).toBe(true);
    vi.setSystemTime(AHORA + 11 * 60 * 1000);
    await act(async () => { auth.oyente("TOKEN_REFRESHED", sesion(deGoogle())); });
    expect(api.altaPendiente).toBe(true);
    expect(api.user).toBeNull();
    expect(upsertUserProfile).not.toHaveBeenCalled();
  });

  it("«No, crear cuenta»: sigue como cualquier alta, y al recargar no vuelve a preguntar", async () => {
    await monta(sesion(deGoogle()));
    await act(async () => { api.crearCuentaNueva(); });
    expect(api.altaPendiente).toBe(false);
    expect(api.user.id).toBe("g1");
    expect(upsertUserProfile).toHaveBeenCalledTimes(1);
    act(() => raiz.unmount());
    await monta(sesion(deGoogle()));
    expect(api.altaPendiente).toBe(false);
  });

  it("«Sí, entrar con Telegram»: borra la cuenta vacía, cierra su sesión aquí y deja ofrecer este Google", async () => {
    await monta(sesion(deGoogle()));
    let r;
    await act(async () => { r = await api.entrarConTelegramEnVez(); });
    expect(r.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/delete-account", { method: "POST", headers: { Authorization: "Bearer tok" } });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(sessionStorage.getItem("homenu:ofrecer-anadir")).toBe("google");
  });

  it("si no se puede borrar, no cierra nada y lo dice", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    await monta(sesion(deGoogle()));
    let r;
    await act(async () => { r = await api.entrarConTelegramEnVez(); });
    expect(r.error.message).toBe(PREGUNTA_ALTA.noSePudo);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(api.altaPendiente).toBe(true);
  });

  it("una cuenta de Google de hace tiempo no pregunta", async () => {
    await monta(sesion(deGoogle(24 * 3600 * 1000)));
    expect(api.altaPendiente).toBe(false);
    expect(api.user.id).toBe("g1");
  });

  it("ya dentro con Telegram, ofrece añadir el Google del alta; «Añadir» lo añade y no vuelve a ofrecerlo", async () => {
    sessionStorage.setItem("homenu:ofrecer-anadir", "google");
    await monta(sesion({ id: "t1", email: emailSintetico(7), created_at: new Date(AHORA).toISOString(), identities: [{ provider: "email" }] }));
    expect(api.ofertaAnadir).toBe("google");
    await act(async () => { await api.responderOferta(true); });
    expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: window.location.origin } });
    expect(api.ofertaAnadir).toBeNull();
    expect(sessionStorage.getItem("homenu:ofrecer-anadir")).toBeNull();
  });
});
