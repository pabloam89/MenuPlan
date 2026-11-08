/**
 * Quién habla en el turno y lo que Lola tiene que decir tras una herramienta (operacion.js): la familia se firma
 * con una persona de la casa (escribir_persona, 0108), y lo que no se guardó tal cual se dice en el chat.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { conOperacion, ponerAutor, autorDelTurno, avisarEnElChat, tomarAvisos } from "./operacion.js";

afterEach(() => vi.restoreAllMocks());

describe("el autor del turno", () => {
  it("dentro de un turno, el que se puso; antes de saberlo, null", () => {
    conOperacion({ chat: 1 }, () => {
      expect(autorDelTurno()).toBeNull();
      ponerAutor({ userId: "u1", papel: "owner", canal: "telegram" });
      expect(autorDelTurno()).toEqual({ user_id: "u1", papel: "owner", canal: "telegram" });
    });
  });

  it("fuera de un turno no hay autor, y ponerlo no hace nada", () => {
    ponerAutor({ userId: "u1", papel: "owner", canal: "telegram" });
    expect(autorDelTurno()).toBeNull();
  });

  it("cada turno lleva el suyo", async () => {
    const autores = await Promise.all(["a", "b"].map((u) => conOperacion({ chat: u }, async () => {
      ponerAutor({ userId: u });
      await new Promise((r) => setTimeout(r, 1));
      return autorDelTurno().user_id;
    })));
    expect(autores).toEqual(["a", "b"]);
  });
});

describe("lo que hay que decir en el chat", () => {
  it("se toma una vez, en orden, y la lista queda vacía", () => {
    conOperacion({ chat: 1 }, () => {
      expect(tomarAvisos()).toEqual([]);
      avisarEnElChat("uno");
      avisarEnElChat("dos");
      expect(tomarAvisos()).toEqual(["uno", "dos"]);
      expect(tomarAvisos()).toEqual([]);
    });
  });

  it("fuera de un turno no se pierde: va al log", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    avisarEnElChat("tres");
    expect(tomarAvisos()).toEqual([]);
    expect(JSON.parse(aviso.mock.calls[0][0])).toEqual({ evento: "aviso_sin_chat", texto: "tres" });
  });
});
