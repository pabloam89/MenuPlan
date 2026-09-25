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

describe("el enlace de una semana", () => {
  it("va por ruta, como el de la receta", () => {
    const base = window.location.origin;
    expect(buildShareUrl("menu", "9f1c2b3a", { token: "abc" })).toBe(`${base}/m/9f1c2b3a?t=abc`);
    expect(buildShareUrl("menu", "9f1c2b3a")).toBe(`${base}/m/9f1c2b3a`);
  });

  it("y se lee al arrancar, con llave y sin ella", () => {
    window.history.replaceState({}, "", "/m/9f1c2b3a?t=abc");
    expect(readIncomingLink()).toEqual({ kind: "menu", id: "9f1c2b3a", token: "abc" });
    window.history.replaceState({}, "", "/?m=9f1c2b3a");
    expect(readIncomingLink()).toEqual({ kind: "menu", id: "9f1c2b3a", token: null });
  });

  it("si vienen los dos, manda la receta: es la forma que ya funcionaba", () => {
    window.history.replaceState({}, "", "/?r=rec_1&m=9f1c2b3a&t=abc");
    expect(readIncomingLink()).toEqual({ kind: "recipe", id: "rec_1", token: "abc" });
  });

  it("y la barra se limpia igual que con una receta", () => {
    window.history.replaceState({}, "", "/m/9f1c2b3a?t=abc&otro=1");
    readIncomingLink();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?otro=1");
  });
});
