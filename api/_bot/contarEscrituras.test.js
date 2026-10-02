/**
 * db.js cuenta lo que de verdad llegó a la base mientras corre una herramienta:
 * es lo que dice si Lola GUARDÓ, no si lo intentó.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { contandoEscrituras, rpc, insert, update, select } = await import("./db.js");

let contesta;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(contesta) })));
});

describe("¿guardó algo?", () => {
  it("un guardado de la casa que chocó (bot_save_casa → ok:false) no cuenta", async () => {
    contesta = { ok: false, bot_rev: 7 };
    const { escribio } = await contandoEscrituras(() => rpc("bot_save_casa", {}));
    expect(escribio).toBe(false);
  });

  it("el que entró, sí", async () => {
    contesta = { ok: true, bot_rev: 8 };
    const { escribio } = await contandoEscrituras(() => rpc("bot_save_casa", {}));
    expect(escribio).toBe(true);
  });

  it("leer, apuntar en la memoria del chat o en los eventos no es guardar", async () => {
    contesta = [{ id: 1 }];
    const { escribio } = await contandoEscrituras(async () => {
      await select("user_pantry", "");
      await insert("bot_messages", [{}]);
      await insert("user_events", [{}]);
    });
    expect(escribio).toBe(false);
  });

  it("un PATCH que no tocó ninguna fila no cuenta; uno que sí, cuenta", async () => {
    contesta = [];
    expect((await contandoEscrituras(() => update("bot_reminders", "id=eq.1", {}))).escribio).toBe(false);
    contesta = [{ id: 1 }];
    expect((await contandoEscrituras(() => update("bot_reminders", "id=eq.1", {}))).escribio).toBe(true);
  });

  it("dos herramientas a la vez no se mezclan la cuenta", async () => {
    contesta = { ok: true };
    const [a, b] = await Promise.all([
      contandoEscrituras(async () => { await new Promise((r) => setTimeout(r, 10)); return rpc("bot_save_casa", {}); }),
      contandoEscrituras(() => select("user_pantry", "")),
    ]);
    expect(a.escribio).toBe(true);
    expect(b.escribio).toBe(false);
  });
});
