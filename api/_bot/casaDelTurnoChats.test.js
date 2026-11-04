/**
 * En qué casa trabaja Lola en cada mensaje (#1238): en privado, la casa activa de la cuenta (la misma que enseña la
 * app) si es miembro; en un grupo, la del grupo. Y lo dice cuando cambia.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const t = vi.hoisted(() => ({ base: {}, falla: false }));
const campo = (filtro, k) => decodeURIComponent(filtro.split("&").find((p) => p.startsWith(`${k}=eq.`))?.slice(k.length + 4) ?? "");
vi.mock("./db.js", () => ({
  eq: (v) => `eq.${encodeURIComponent(v)}`, update: vi.fn(), borrar: vi.fn(),
  select: vi.fn(async (tabla, filtro) => {
    if (t.falla && tabla !== "bot_chats") throw new Error("sin base");
    const filas = t.base[tabla] ?? [];
    return filas.filter((f) => ["chat_id", "external_id", "user_id", "household_id"].every((k) => !filtro.includes(`${k}=eq.`) || String(f[k]) === campo(filtro, k)));
  }),
}));
vi.mock("./telegram.js", () => ({ escaparHtml: (s) => s }));
vi.mock("./recordatorios.js", () => ({ descartarDelChat: vi.fn() }));

const { casaDelTurno, elegirCasa, avisoDeCambio } = await import("./chats.js");

const YO = "u1";
beforeEach(() => {
  t.falla = false;
  t.base = {
    bot_chats: [
      { chat_id: "555", household_id: "casaA", kind: "private", linked_by: YO },
      { chat_id: "-100", household_id: "casaA", kind: "group", linked_by: YO },
    ],
    bot_identities: [{ external_id: "555", user_id: YO }],
    user_profiles: [{ user_id: YO, active_household_id: "casaA" }],
    household_members: [{ household_id: "casaA", user_id: YO, role: "owner" }, { household_id: "casaB", user_id: YO, role: "editor" }],
  };
});

describe("la casa del turno sigue a la app (#1238)", () => {
  it("en privado, la casa activa de la cuenta si es miembro", async () => {
    t.base.user_profiles[0].active_household_id = "casaB";
    expect(await casaDelTurno("555")).toBe("casaB");
  });

  it("si ya no es miembro de su casa activa, la del chat", async () => {
    t.base.user_profiles[0].active_household_id = "casaC";
    expect(await casaDelTurno("555")).toBe("casaA");
  });

  it("un grupo es de su casa, aunque quien escribe tenga otra abierta", async () => {
    t.base.user_profiles[0].active_household_id = "casaB";
    expect(await casaDelTurno("-100")).toBe("casaA");
  });

  it("sin identidad (chats viejos), la cuenta es quien lo enlazó", async () => {
    t.base.bot_identities = [];
    t.base.user_profiles[0].active_household_id = "casaB";
    expect(await casaDelTurno("555")).toBe("casaB");
  });

  it("si no se puede leer la cuenta, falla en alto: no se adivina la casa", async () => {
    t.base.user_profiles[0].active_household_id = "casaB";
    t.falla = true;
    await expect(casaDelTurno("555")).rejects.toThrow(/sin base/);
  });

  it("un chat sin enlazar no tiene casa", async () => {
    expect(await casaDelTurno("999")).toBeNull();
  });

  it("elegirCasa, pura: grupo, sin activa, la misma o no miembro → la del chat", () => {
    const chat = { household_id: "casaA", kind: "private" };
    expect(elegirCasa({ chat, activa: "casaB", esMiembro: true })).toBe("casaB");
    expect(elegirCasa({ chat, activa: "casaB", esMiembro: false })).toBe("casaA");
    expect(elegirCasa({ chat, activa: null })).toBe("casaA");
    expect(elegirCasa({ chat: { ...chat, kind: "group" }, activa: "casaB", esMiembro: true })).toBe("casaA");
  });
});

describe("Lola dice cuando cambia de casa", () => {
  it("con el nombre de la casa nueva, solo si cambió", () => {
    expect(avisoDeCambio({ anterior: "casaA", actual: "casaB", nombre: "Casa de los abuelos" })).toMatch(/Ahora estoy con <b>Casa de los abuelos<\/b>/);
    expect(avisoDeCambio({ anterior: "casaA", actual: "casaA", nombre: "x" })).toBeNull();
    // Sin charla anterior no hay cambio que contar.
    expect(avisoDeCambio({ anterior: null, actual: "casaB", nombre: "x" })).toBeNull();
  });
});
