import { describe, it, expect } from "vitest";
import { contar } from "./bot-dice-sin-hacer.mjs";

const SOLO = new Set(["ver_menu", "ver_compra"]);
const m = (chat, en, texto) => ({ chat, en, texto });
const r = (chat, en, o = {}) => ({ chat, en, rapida: false, modo: "lola", herramientas: [], guardados: null, recibo: null, ...o });

describe("bot-dice-sin-hacer: lo dicho contra lo hecho en el turno (#958)", () => {
  it("cuenta lo que dice que hizo sin haber guardado nada", () => {
    const c = contar(
      [m("1", 0, "✅ Apuntado: leche."), m("2", 0, "He cambiado la cena."), m("3", 0, "Esta noche, tortilla."), m("4", 0, "✅ Hecho.")],
      [r("1", 500, { herramientas: [["ver_menu", 10]] }), r("2", 500, { guardados: 1 }), r("3", 500), r("4", 500, { rapida: true, modo: "compra_anadir" })],
      SOLO,
    );
    expect(c).toMatchObject({ respuestas: 4, conTurno: 4, dicen: 3, diceSinHecho: 1 });
  });

  it("con recibo, lo que lo dice y dejó algo sin hacer se cuenta aparte", () => {
    const c = contar([m("1", 0, "✅ Todo apuntado.")], [r("1", 100, { guardados: 1, recibo: [["despensa", 38, 28]] })], SOLO);
    expect(c).toMatchObject({ dicen: 1, diceSinHecho: 0, diceConAlgoSinHacer: 1 });
  });

  it("un mensaje sin medida de su turno no se cuenta como fallo", () => {
    expect(contar([m("1", 0, "✅ Apuntado.")], [r("1", 999999)], SOLO)).toMatchObject({ sinTurno: 1, diceSinHecho: 0 });
  });
});
