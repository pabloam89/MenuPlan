// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { buildShareUrl, buildShareImageUrl, readIncomingLink, shareOut } from "./shareLink.js";

afterEach(() => vi.unstubAllGlobals());

describe("buildShareImageUrl", () => {
  it("la miniatura va por ruta, sin ampersand aunque lleve llave", () => {
    expect(buildShareImageUrl("user_abc")).toBe(`${window.location.origin}/r/user_abc/img`);
    expect(buildShareImageUrl("user_abc", { token: "abc" })).toBe(`${window.location.origin}/r/user_abc/img?t=abc`);
    expect(buildShareImageUrl("")).toBeNull();
  });
});

describe("shareOut", () => {
  it("calienta la miniatura antes de abrir la hoja, sin esperar a que llegue", async () => {
    const fetchSpy = vi.fn(() => new Promise(() => {})); // nunca resuelve: no debe bloquear
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
    const res = await shareOut({ kind: "recipe", value: "user_abc", token: "abc", title: "X", text: "y" });
    expect(res).toBe("copied");
    expect(fetchSpy).toHaveBeenCalledWith(`${window.location.origin}/r/user_abc/img?t=abc`, { mode: "no-cors" });
  });

  it("un perfil no calienta nada", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
    await shareOut({ kind: "user", value: "ana", title: "X", text: "y" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

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
