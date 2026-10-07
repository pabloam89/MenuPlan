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
});
