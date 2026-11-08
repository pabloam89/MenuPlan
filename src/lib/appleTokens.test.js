import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import { rememberAppleRefreshToken } from "./appleTokens.js";

// La función guardar_apple_refresh_token es lo único que este módulo llama, así
// que el doble solo necesita registrar con qué se le llamó.
let llamadas;
let respuesta;
beforeEach(() => {
  llamadas = [];
  respuesta = { error: null };
  supabase.rpc = (nombre, args) => {
    llamadas.push({ nombre, args });
    return Promise.resolve(respuesta);
  };
  // La tabla no se toca desde el cliente: si algo la usa, que el test lo cante.
  supabase.from = () => { throw new Error("apple_auth_tokens no se toca desde el cliente"); };
});

const session = (overrides = {}) => ({
  provider_refresh_token: "rt_123",
  user: { id: "u1", app_metadata: { provider: "apple" } },
  ...overrides,
});

describe("rememberAppleRefreshToken", () => {
  it("guarda el token de una sesión de Apple", async () => {
    await rememberAppleRefreshToken(session());
    // Sin user_id: la función lo saca de la sesión, y nadie puede guardar para otro.
    expect(llamadas).toEqual([
      { nombre: "guardar_apple_refresh_token", args: { p_token: "rt_123" } },
    ]);
  });

  it("ignora las sesiones que no son de Apple", async () => {
    await rememberAppleRefreshToken(
      session({ user: { id: "u1", app_metadata: { provider: "google" } } }),
    );
    expect(llamadas).toEqual([]);
  });

  // La razón de ser del guard: Apple solo manda refresh token en la primera
  // autorización. Si los logins siguientes escribieran, borrarían la única
  // credencial que permite revocar el acceso al borrar la cuenta.
  it("no escribe cuando la sesión viene sin refresh token", async () => {
    await rememberAppleRefreshToken(session({ provider_refresh_token: undefined }));
    expect(llamadas).toEqual([]);
  });

  it("no explota sin sesión", async () => {
    await rememberAppleRefreshToken(null);
    expect(llamadas).toEqual([]);
  });

  // Plan B de la 0099: mientras no esté aplicada, la función no existe y el
  // login no puede romperse por eso.
  it("si la función falla (o aún no existe), avisa por consola y no lanza", async () => {
    respuesta = { error: { message: "Could not find the function" } };
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(rememberAppleRefreshToken(session())).resolves.toBeUndefined();
    expect(aviso).toHaveBeenCalledWith("[auth] no se pudo guardar el token de Apple", "Could not find the function");
    aviso.mockRestore();
  });
});
