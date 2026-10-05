import { describe, it, expect, vi, beforeEach } from "vitest";

const bloqueos = [];
vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla, filtro) => {
    if (tabla === "recipe_share_links") return [{ recipe_id: "u_rec1", owner_id: "duena" }];
    if (tabla === "user_recipes") return [{ id: "u_rec1", owner_id: "duena", name: "Tarta de Lucía", owner_snapshot: { name: "Lucía" } }];
    if (tabla === "blocked_users") {
      return bloqueos.filter(([a, b]) => filtro.includes(`blocker_id=eq.${a}`) && filtro.includes(`blocked_id=eq.${b}`))
        .map(([a, b]) => ({ blocker_id: a, blocked_id: b }));
    }
    return [];
  }),
  insert: vi.fn(async () => []),
  update: vi.fn(async () => []),
  rpc: vi.fn(async () => null),
  eq: (v) => `eq.${encodeURIComponent(v)}`,
}));

const { resolverInvitacion } = await import("./compartir.js");

describe("enlace ru_ por Telegram: el bloqueo corta, como en la web", () => {
  beforeEach(() => { bloqueos.length = 0; });

  it("sin bloqueo, la receta llega", async () => {
    const inv = await resolverInvitacion("ru_llave", { usuarios: ["bea"] });
    expect(inv?.receta?.name).toBe("Tarta de Lucía");
  });

  it("si la dueña bloqueó a quien abre el enlace, no llega", async () => {
    bloqueos.push(["duena", "bea"]);
    expect(await resolverInvitacion("ru_llave", { usuarios: ["bea"] })).toBeNull();
  });

  it("si quien abre bloqueó a la dueña, tampoco (en las dos direcciones)", async () => {
    bloqueos.push(["bea", "duena"]);
    expect(await resolverInvitacion("ru_llave", { usuarios: ["bea"] })).toBeNull();
  });
});
