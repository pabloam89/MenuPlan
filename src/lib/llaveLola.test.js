// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { traeLlaveDeLola, sacarLlaveDeLola } from "./llaveLola.js";

const ir = (q) => window.history.replaceState(null, "", `/${q}`);

describe("la llave con la que se llega desde Lola", () => {
  beforeEach(() => ir(""));

  it("código de un solo uso", () => {
    ir("?entrar=ABC&ir=semana");
    expect(traeLlaveDeLola()).toBe(true);
    expect(sacarLlaveDeLola()).toEqual({ codigo: "ABC" });
    // Se quita la llave; el destino se queda para destinoBot.js.
    expect(window.location.search).toBe("?ir=semana");
  });

  it("firma de un botón de login de Telegram", () => {
    ir("?ir=dia%3AMi%C3%A9&id=7&first_name=Ana&auth_date=1&hash=ff");
    expect(traeLlaveDeLola()).toBe(true);
    expect(sacarLlaveDeLola()).toEqual({ telegram: { id: "7", first_name: "Ana", auth_date: "1", hash: "ff" } });
    expect(window.location.search).toBe("?ir=dia%3AMi%C3%A9");
  });

  it("sin llave: nada, y la dirección no se toca", () => {
    ir("?ir=semana&id=7");
    expect(traeLlaveDeLola()).toBe(false);
    expect(sacarLlaveDeLola()).toBeNull();
    expect(window.location.search).toBe("?ir=semana&id=7");
  });

  // «Entrar con Telegram» (specs/auth.md §7): el login oficial vuelve con los mismos campos firmados, en el hash.
  const vuelta = (datos) => Buffer.from(JSON.stringify(datos)).toString("base64url");

  it("vuelta del login oficial de Telegram: la misma firma que el botón de Lola, y se quita del hash", () => {
    ir(`?ir=semana#tgAuthResult=${vuelta({ id: 7, first_name: "Ana", auth_date: 1, hash: "ff" })}`);
    expect(traeLlaveDeLola()).toBe(true);
    expect(sacarLlaveDeLola()).toEqual({ telegram: { id: "7", first_name: "Ana", auth_date: "1", hash: "ff" } });
    expect(window.location.search).toBe("?ir=semana");
    expect(window.location.hash).toBe("");
  });

  it("una vuelta ilegible no se calla: llega vacía y el servidor la rechaza", () => {
    // «no-json» en base64url: se lee como llave, pero sin campos.
    ir("#tgAuthResult=bm8tanNvbg");
    expect(traeLlaveDeLola()).toBe(true);
    expect(sacarLlaveDeLola()).toEqual({ telegram: {} });
    expect(window.location.hash).toBe("");
  });
});
