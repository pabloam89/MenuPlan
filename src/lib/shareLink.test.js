// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { buildShareUrl, readIncomingLink } from "./shareLink.js";

function goTo(path) {
  window.history.replaceState({}, "", path);
}

describe("buildShareUrl", () => {
  it("una receta va por ruta, y con llave si la hay", () => {
    expect(buildShareUrl("recipe", "user_abc")).toBe(`${window.location.origin}/r/user_abc`);
    expect(buildShareUrl("recipe", "user_abc", { token: "0123456789abcdef0123456789abcdef" })).toBe(
      `${window.location.origin}/r/user_abc?t=0123456789abcdef0123456789abcdef`,
    );
  });

  it("un perfil sigue yendo por parámetro y sin la arroba", () => {
    expect(buildShareUrl("user", "@ana")).toBe(`${window.location.origin}/?u=ana`);
  });

  it("sin valor no hay enlace", () => {
    expect(buildShareUrl("recipe", "")).toBeNull();
    expect(buildShareUrl("nada", "x")).toBeNull();
  });
});

describe("readIncomingLink", () => {
  beforeEach(() => goTo("/"));

  it("lee /r/<id>?t=<llave> y deja la barra limpia", () => {
    goTo("/r/user_abc?t=0123456789abcdef0123456789abcdef&demo=1");
    expect(readIncomingLink()).toEqual({ kind: "recipe", id: "user_abc", token: "0123456789abcdef0123456789abcdef" });
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?demo=1");
  });

  it("sigue entendiendo la forma antigua ?r=", () => {
    goTo("/?r=carnes_001");
    expect(readIncomingLink()).toEqual({ kind: "recipe", id: "carnes_001", token: null });
    expect(window.location.search).toBe("");
  });

  it("un perfil", () => {
    goTo("/?u=ana");
    expect(readIncomingLink()).toEqual({ kind: "user", username: "ana" });
  });

  it("sin enlace, null y sin tocar la URL", () => {
    goTo("/?tour=1");
    expect(readIncomingLink()).toBeNull();
    expect(window.location.search).toBe("?tour=1");
  });
});
