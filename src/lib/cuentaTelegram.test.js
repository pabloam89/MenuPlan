import { describe, it, expect } from "vitest";
import { emailSintetico, esCuentaDeTelegram, tieneProveedor, formasDeEntrar, FORMA_DE_ENTRAR, avisoAlVolver, AVISOS_AL_VOLVER, NO_SE_PUDO_GOOGLE, urlEntrarConTelegram, DOMINIO_LOGIN_TELEGRAM, BOT_ID, esAltaNueva, VENTANA_ALTA_NUEVA_MS, proveedorDeAlta, OFERTA_ANADIR } from "./cuentaTelegram.js";
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
      { forma: TELEGRAM, tiene: true },
      { forma: GOOGLE, tiene: false },
    ]);
  });

  it("con Google ya añadido, Google ✓ (lo dice la cuenta, no la pantalla)", () => {
    const conGoogle = { ...deTelegram, identities: [...deTelegram.identities, { provider: "google" }] };
    expect(tieneProveedor(conGoogle, "google")).toBe(true);
    expect(formasDeEntrar(conGoogle, { conApple: false })).toContainEqual({ forma: GOOGLE, tiene: true });
  });

  it("Apple solo donde se ofrece, con su estado", () => {
    const conApple = { ...deTelegram, identities: [...deTelegram.identities, { provider: "apple" }] };
    expect(formasDeEntrar(conApple, { conApple: true })).toContainEqual({ forma: APPLE, tiene: true });
    expect(formasDeEntrar(deTelegram, { conApple: true })).toContainEqual({ forma: APPLE, tiene: false });
    expect(formasDeEntrar(conApple, { conApple: false }).map((f) => f.forma)).not.toContain(APPLE);
  });

  it("una cuenta de Google no enseña Telegram: Telegram no la abre (trozo 3)", () => {
    const deGoogle = { email: "ana@gmail.com", identities: [{ provider: "google" }] };
    expect(formasDeEntrar(deGoogle, { conApple: false })).toEqual([{ forma: GOOGLE, tiene: true }]);
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

// «¿Ya hablas con Lola?» (trozo 4 de specs/auth.md §7): a quién se pregunta antes de crear la cuenta.
describe("esAltaNueva: la cuenta de Google o Apple que acaba de nacer", () => {
  const AHORA = Date.parse("2026-11-04T20:00:00Z");
  const cuenta = (proveedores, haceMs = 0, extra = {}) => ({
    id: "u", email: "ana@gmail.com", created_at: new Date(AHORA - haceMs).toISOString(),
    identities: proveedores.map((provider) => ({ provider })), ...extra,
  });

  it("recién nacida en Google o en Apple: sí", () => {
    expect(esAltaNueva(cuenta(["google"]), AHORA)).toBe(true);
    expect(esAltaNueva(cuenta(["apple"], VENTANA_ALTA_NUEVA_MS - 1000), AHORA)).toBe(true);
  });

  it("pasada la ventana, ya es una cuenta que se usa: no", () => {
    expect(esAltaNueva(cuenta(["google"], VENTANA_ALTA_NUEVA_MS + 1000), AHORA)).toBe(false);
  });

  it("nacida en Telegram, o con otra forma de entrar además de Google: no", () => {
    expect(esAltaNueva(cuenta(["email"], 0, { email: emailSintetico(7) }), AHORA)).toBe(false);
    expect(esAltaNueva(cuenta(["google", "email"]), AHORA)).toBe(false);
  });

  it("sin sesión o sin fecha: no", () => {
    expect(esAltaNueva(null, AHORA)).toBe(false);
    expect(esAltaNueva({ identities: [{ provider: "google" }] }, AHORA)).toBe(false);
  });

  it("lo que se ofrece añadir tras entrar con Telegram es el proveedor con el que nació", () => {
    expect(proveedorDeAlta(cuenta(["apple"]))).toBe("apple");
    expect(OFERTA_ANADIR.titulo("google")).toBe("¿Añades este Google a tu cuenta?");
  });
});
