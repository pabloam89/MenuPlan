/**
 * El mismo update_id de Telegram se atiende una sola vez (0088), y sin la
 * tabla todo sigue como antes. La base es un array en memoria.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let filas = [];
let falla = null;

vi.mock("./db.js", () => ({
  insert: vi.fn(async (tabla, nuevas) => {
    if (falla) throw new Error(falla);
    for (const n of nuevas) {
      if (filas.some((r) => r.proveedor === n.proveedor && r.entrada_xid === n.entrada_xid)) {
        throw new Error(`POST /rest/v1/${tabla} → 409 {"code":"23505","message":"duplicate key value"}`);
      }
      filas.push(n);
    }
    return nuevas;
  }),
}));

const { primeraVez } = await import("./entradas.js");

beforeEach(() => {
  filas = [];
  falla = null;
});

describe("primeraVez", () => {
  it("la primera vez sí; el reintento con el mismo update_id, no", async () => {
    expect(await primeraVez("telegram", 812345)).toBe(true);
    expect(await primeraVez("telegram", 812345)).toBe(false);
    expect(filas).toEqual([{ proveedor: "telegram", entrada_xid: "812345" }]);
  });

  it("otro id, u otro proveedor con el mismo id, son otra entrada", async () => {
    await primeraVez("telegram", 1);
    expect(await primeraVez("telegram", 2)).toBe(true);
    expect(await primeraVez("whatsapp", 1)).toBe(true);
  });

  it("sin id no hay nada que comparar: se atiende y no se apunta", async () => {
    expect(await primeraVez("telegram", undefined)).toBe(true);
    expect(await primeraVez("telegram", "  ")).toBe(true);
    expect(filas).toEqual([]);
  });

  it("sin la 0088 aplicada (o con la base caída) se atiende como antes", async () => {
    falla = 'POST /rest/v1/bot_entradas → 404 {"code":"42P01","message":"relation does not exist"}';
    expect(await primeraVez("telegram", 5)).toBe(true);
    expect(await primeraVez("telegram", 5)).toBe(true);
  });
});
