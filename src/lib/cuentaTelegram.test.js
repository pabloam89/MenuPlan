import { describe, it, expect } from "vitest";
import { resumenDeFormas, emailSintetico, esCuentaDeTelegram, tieneProveedor, formasDeEntrar, FORMA_DE_ENTRAR, avisoAlVolver, AVISOS_AL_VOLVER, NO_SE_PUDO_GOOGLE, urlEntrarConTelegram, DOMINIO_LOGIN_TELEGRAM, BOT_ID } from "./cuentaTelegram.js";
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

});

// «Formas de entrar» de Mi perfil (specs/auth.md §7, trozo 2): el estado real de cada una.
describe("formas de entrar de la cuenta", () => {
  const { TELEGRAM, GOOGLE, APPLE } = FORMA_DE_ENTRAR;
  const deTelegram = { email: emailSintetico(555), identities: [{ provider: "email" }] };

  it("nacida en Telegram, sin más: Telegram ✓ primero, y Google por añadir", () => {
    expect(formasDeEntrar(deTelegram, { conApple: false })).toEqual([
      { forma: TELEGRAM, tiene: true, apagable: false },
      { forma: GOOGLE, tiene: false, apagable: false },
    ]);
  });

  it("con Google ya añadido, Google ✓ (lo dice la cuenta, no la pantalla)", () => {
    const conGoogle = { ...deTelegram, identities: [...deTelegram.identities, { provider: "google" }] };
    expect(tieneProveedor(conGoogle, "google")).toBe(true);
    expect(formasDeEntrar(conGoogle, { conApple: false })).toContainEqual({ forma: GOOGLE, tiene: true, apagable: true });
  });

  it("Apple donde se ofrece, o si la cuenta ya entra con él", () => {
    const conApple = { ...deTelegram, identities: [...deTelegram.identities, { provider: "apple" }] };
    expect(formasDeEntrar(conApple, { conApple: true })).toContainEqual({ forma: APPLE, tiene: true, apagable: true });
    expect(formasDeEntrar(deTelegram, { conApple: true })).toContainEqual({ forma: APPLE, tiene: false, apagable: false });
    expect(formasDeEntrar(conApple, { conApple: false }).map((f) => f.forma)).toContain(APPLE);
    expect(formasDeEntrar(deTelegram, { conApple: false }).map((f) => f.forma)).not.toContain(APPLE);
  });

  it("una cuenta de Google no enseña Telegram: Telegram no la abre (trozo 3)", () => {
    const deGoogle = { email: "ana@gmail.com", identities: [{ provider: "google" }] };
    expect(formasDeEntrar(deGoogle, { conApple: false })).toEqual([{ forma: GOOGLE, tiene: true, apagable: false }]);
  });

  it("la última forma de entrar no se apaga: la cuenta se quedaría sin llave", () => {
    const dos = { email: "ana@gmail.com", identities: [{ provider: "google" }, { provider: "apple" }] };
    expect(formasDeEntrar(dos, { conApple: true }).every((f) => f.apagable)).toBe(true);
    const una = { email: "ana@gmail.com", identities: [{ provider: "apple" }] };
    expect(formasDeEntrar(una, { conApple: true }).find((f) => f.forma === APPLE).apagable).toBe(false);
  });

  it("la fila dice con qué se entra", () => {
    expect(resumenDeFormas([{ forma: GOOGLE, tiene: true }, { forma: APPLE, tiene: false }])).toBe("Entras con Google");
    expect(resumenDeFormas([{ forma: TELEGRAM, tiene: true }, { forma: GOOGLE, tiene: true }, { forma: APPLE, tiene: true }])).toBe("Entras con Telegram, Google y Apple");
  });
});

describe("al volver de añadir Google", () => {
  it("si ese Google ya es otra cuenta, dice qué hacer (venga en la query o en el hash)", () => {
    expect(avisoAlVolver("https://homenu.app/?error=server_error&error_code=identity_already_exists")).toBe(AVISOS_AL_VOLVER.identity_already_exists);
    expect(avisoAlVolver("https://homenu.app/#error=x&error_code=identity_already_exists")).toBe(AVISOS_AL_VOLVER.identity_already_exists);
  });

  it("cualquier otro error también se dice: cancelar en Google, un código sin aviso propio", () => {
    expect(avisoAlVolver("https://homenu.app/?error_code=otra_cosa")).toBe(NO_SE_PUDO_GOOGLE);
    expect(avisoAlVolver("https://homenu.app/#error=access_denied&error_description=cancelado")).toBe(NO_SE_PUDO_GOOGLE);
  });

  it("sin error o con una URL rota, nada", () => {
    expect(avisoAlVolver("https://homenu.app/")).toBeNull();
    expect(avisoAlVolver("https://homenu.app/?code=abc")).toBeNull();
    expect(avisoAlVolver("no es una url")).toBeNull();
  });
});

// «Entrar con Telegram» (specs/auth.md §7): el login oficial, solo en el dominio que el bot tiene en @BotFather.
describe("adónde lleva «Entrar con Telegram»", () => {
  const en = (host, ruta = "/", search = "") => ({ host, origin: `https://${host}`, pathname: ruta, search });

  it("en el dominio del bot, al login de Telegram de ese bot, volviendo a la misma página", () => {
    const url = new URL(urlEntrarConTelegram(en(DOMINIO_LOGIN_TELEGRAM, "/", "?ir=semana")));
    expect(url.origin).toBe("https://oauth.telegram.org");
    expect(url.searchParams.get("bot_id")).toBe(String(BOT_ID));
    expect(url.searchParams.get("origin")).toBe(`https://${DOMINIO_LOGIN_TELEGRAM}`);
    expect(url.searchParams.get("return_to")).toBe(`https://${DOMINIO_LOGIN_TELEGRAM}/?ir=semana`);
    expect(url.searchParams.get("request_access")).toBe("write");
  });

  it("fuera de él (local, previews, la app nativa), nada: Telegram lo rechazaría", () => {
    expect(urlEntrarConTelegram(en("localhost:5176"))).toBeNull();
    expect(urlEntrarConTelegram(en("homenu-git-rama.vercel.app"))).toBeNull();
    expect(urlEntrarConTelegram({ host: "localhost", origin: "capacitor://localhost", pathname: "/", search: "" })).toBeNull();
  });
});
