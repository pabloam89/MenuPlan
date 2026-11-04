import { describe, it, expect } from "vitest";
import { emailSintetico, esCuentaDeTelegram, tieneProveedor, ofrecerGoogle, avisoAlVolver, AVISOS_AL_VOLVER } from "./cuentaTelegram.js";
import { emailSintetico as delBot } from "../../api/_bot/cuentas.js";

// Las cuentas nacidas en Telegram y «Entrar también con Google» (#1238).
describe("cuenta nacida en Telegram", () => {
  const deTelegram = { email: emailSintetico(555), identities: [{ provider: "email" }] };

  it("el email sintético no cambia: las cuentas que ya hay se reconocen por él, y Lola lo usa de aquí", () => {
    expect(emailSintetico(555)).toBe("tg555@usuarios.menuplanai.com");
    expect(delBot).toBe(emailSintetico);
  });

  it("se reconoce por su email; una de Google, no", () => {
    expect(esCuentaDeTelegram(deTelegram)).toBe(true);
    expect(esCuentaDeTelegram({ email: "ana@gmail.com" })).toBe(false);
    expect(esCuentaDeTelegram(null)).toBe(false);
  });

  it("se le ofrece Google solo si no lo tiene ya", () => {
    expect(ofrecerGoogle(deTelegram)).toBe(true);
    const conGoogle = { ...deTelegram, identities: [...deTelegram.identities, { provider: "google" }] };
    expect(tieneProveedor(conGoogle, "google")).toBe(true);
    expect(ofrecerGoogle(conGoogle)).toBe(false);
    expect(ofrecerGoogle({ email: "ana@gmail.com", identities: [{ provider: "google" }] })).toBe(false);
  });
});

describe("al volver de añadir Google", () => {
  it("si ese Google ya es otra cuenta, dice qué hacer (venga en la query o en el hash)", () => {
    expect(avisoAlVolver("https://homenu.app/?error=server_error&error_code=identity_already_exists")).toBe(AVISOS_AL_VOLVER.identity_already_exists);
    expect(avisoAlVolver("https://homenu.app/#error=x&error_code=identity_already_exists")).toBe(AVISOS_AL_VOLVER.identity_already_exists);
  });

  it("sin error, con otro error o con una URL rota, nada", () => {
    expect(avisoAlVolver("https://homenu.app/")).toBeNull();
    expect(avisoAlVolver("https://homenu.app/?error_code=otra_cosa")).toBeNull();
    expect(avisoAlVolver("no es una url")).toBeNull();
  });
});
