// Un fallo de GoTrue al crear la cuenta o el enlace no mete en el error el
// cuerpo de la respuesta: con el motivo «otro», el texto va al log (#211) y
// podría llevar el id y el email sintético de la persona.
import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sin-clave";

const { crearCuentaTelegram, tokenHashDe } = await import("./cuentas.js");

const CUERPO = { id: "1b2c3d4e-0000-0000-0000-00000000abcd", email: "tg123456@telegram.homenu.invalid", error_code: "unexpected_failure", msg: "Database error creating new user" };
const responde = (status, json) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(json), { status }));

afterEach(() => vi.restoreAllMocks());

describe("errores de GoTrue sin datos de la persona", () => {
  it("crear usuario: el código y el mensaje, no el cuerpo", async () => {
    responde(500, CUERPO);
    const e = await crearCuentaTelegram({ telegramId: 123456, nombre: "Ana" }).catch((x) => x);
    expect(e.message).toContain("unexpected_failure");
    expect(e.message).not.toContain(CUERPO.id);
    expect(e.message).not.toContain("tg123456");
    expect(e.status).toBe(500);
  });

  it("generate_link: igual", async () => {
    responde(422, CUERPO);
    const e = await tokenHashDe("tg123456@telegram.homenu.invalid").catch((x) => x);
    expect(e.message).toContain("Database error creating new user");
    expect(e.message).not.toContain(CUERPO.id);
    expect(e.message).not.toContain("tg123456");
  });
});
