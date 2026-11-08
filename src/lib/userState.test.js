import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import { saveUserState } from "./userState.js";

// `saveUserState` solo hace un upsert: el doble devuelve lo que se le diga.
let respuesta;
beforeEach(() => {
  respuesta = { error: null };
  supabase.from = () => ({ upsert: async () => respuesta });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("saveUserState dice si el guardado entró (#1029: nada se da por guardado sin saberlo)", () => {
  it("con el upsert en orden devuelve ok", async () => {
    expect(await saveUserState("u1", { a: 1 })).toEqual({ ok: true });
  });

  it("si la base devuelve error, lo apunta y devuelve ok: false (no lanza)", async () => {
    respuesta = { error: { message: "permission denied" } };
    expect(await saveUserState("u1", { a: 1 })).toEqual({ ok: false });
    expect(console.warn).toHaveBeenCalledWith("[userState] save failed", "permission denied");
  });

  it("sin usuario no hay nada que guardar: ok: false, sin tocar la base", async () => {
    supabase.from = vi.fn();
    expect(await saveUserState(null, {})).toEqual({ ok: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
