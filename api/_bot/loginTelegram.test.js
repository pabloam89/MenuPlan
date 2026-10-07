import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import { verificarLogin, VIGENCIA_S } from "./loginTelegram.js";

/** Firma como lo hace Telegram (core.telegram.org/widgets/login). */
function firmar(datos, token) {
  const linea = Object.keys(datos).sort().map((k) => `${k}=${datos[k]}`).join("\n");
  const clave = crypto.createHash("sha256").update(token).digest();
  return crypto.createHmac("sha256", clave).update(linea).digest("hex");
}

const TOKEN = "123:abc";
const AHORA = 1_791_350_000;
const datos = { id: "491628449", first_name: "Pablo", username: "pablo", auth_date: String(AHORA - 10) };
const firmado = { ...datos, hash: firmar(datos, TOKEN) };

describe("verificarLogin: el botón de login de Telegram", () => {
  it("una firma buena y reciente: entra ese Telegram", () => {
    expect(verificarLogin(firmado, TOKEN, AHORA)).toEqual({ ok: true, telegramId: "491628449" });
  });

  it("cambiar el id (hacerse pasar por otro) rompe la firma", () => {
    expect(verificarLogin({ ...firmado, id: "1" }, TOKEN, AHORA)).toEqual({ ok: false, motivo: "firma" });
  });

  it("firmada con otro token (otro bot): no", () => {
    expect(verificarLogin(firmado, "999:zzz", AHORA).motivo).toBe("firma");
  });

  it("pasada la vigencia, ya no abre sesión", () => {
    expect(verificarLogin(firmado, TOKEN, AHORA + VIGENCIA_S + 60).motivo).toBe("caducada");
  });

  it("los campos que no firma Telegram (ir…) no cuentan", () => {
    expect(verificarLogin({ ...firmado, ir: "dia:Mié" }, TOKEN, AHORA).ok).toBe(true);
  });

  it("sin hash o sin token: no", () => {
    expect(verificarLogin(datos, TOKEN, AHORA).motivo).toBe("incompleta");
    expect(verificarLogin(firmado, "", AHORA).motivo).toBe("incompleta");
  });
});

describe("el botón de login en el mensaje de Telegram", async () => {
  const { botonTelegram } = await import("./telegram.js");
  it("`login` sale como login_url, sin pedir permiso para escribir", () => {
    expect(botonTelegram({ texto: "Ver", login: "https://homenu-staging.vercel.app/?ir=semana" }))
      .toEqual({ text: "Ver", login_url: { url: "https://homenu-staging.vercel.app/?ir=semana", request_write_access: false } });
  });
  it("los de siempre no cambian", () => {
    expect(botonTelegram({ texto: "A", url: "https://x" })).toEqual({ text: "A", url: "https://x" });
    expect(botonTelegram({ texto: "B", dato: "t:hola" })).toEqual({ text: "B", callback_data: "t:hola" });
  });
});
