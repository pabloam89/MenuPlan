import { describe, it, expect } from "vitest";
import { parseAuthCallback, NATIVE_REDIRECT_URL } from "./nativeAuth.js";

describe("parseAuthCallback", () => {
  it("saca el code del flujo PKCE", () => {
    expect(parseAuthCallback(`${NATIVE_REDIRECT_URL}?code=abc123`)).toEqual({ code: "abc123" });
  });

  it("saca los tokens del flujo implícito (vienen en el #)", () => {
    const url = `${NATIVE_REDIRECT_URL}#access_token=at-1&refresh_token=rt-1&token_type=bearer`;
    expect(parseAuthCallback(url)).toEqual({ accessToken: "at-1", refreshToken: "rt-1" });
  });

  it("ignora una URL del mismo esquema que no sea el callback del login", () => {
    // Un enlace compartido, por ejemplo: no es un login a medias, es otra cosa.
    expect(parseAuthCallback("com.homenu.app://menu/semana-42")).toBeNull();
  });

  it("no da por bueno un implícito al que le falta el refresh token", () => {
    expect(parseAuthCallback(`${NATIVE_REDIRECT_URL}#access_token=at-1`)).toBeNull();
  });

  it("devuelve null con basura en vez de lanzar", () => {
    expect(parseAuthCallback("no-es-una-url")).toBeNull();
    expect(parseAuthCallback("")).toBeNull();
    expect(parseAuthCallback(undefined)).toBeNull();
  });

  it("el code manda sobre el hash si por lo que sea vinieran los dos", () => {
    const url = `${NATIVE_REDIRECT_URL}?code=abc#access_token=at&refresh_token=rt`;
    expect(parseAuthCallback(url)).toEqual({ code: "abc" });
  });
});
