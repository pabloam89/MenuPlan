import { describe, it, expect } from "vitest";
import { parseHouseholdRow, esTitular, casaPropia, resolveActiveHousehold } from "./householdsSync.js";
import { miembroDeCuentaId, conMiembroDeCuenta, resolveAccountMember } from "./stages.js";

const casa = (o) => parseHouseholdRow({ setupStatus: "active", ...o });

describe("esTitular: un solo criterio (households.owner_user_id, que llega como isOwn)", () => {
  it("titular de su casa", () => {
    expect(esTitular(casa({ id: "a", role: "owner", isOwn: true }))).toBe(true);
  });
  it("cotitular y lector, no", () => {
    expect(esTitular(casa({ id: "a", role: "editor", isOwn: false }))).toBe(false);
    expect(esTitular(casa({ id: "a", role: "viewer", isOwn: false }))).toBe(false);
  });
  it("sin casa, no", () => {
    expect(esTitular(null)).toBe(false);
  });
});

describe("casaPropia: tras heredar, la que le nació, no la más antigua", () => {
  // La heredada es más antigua (la creó el titular anterior) y llega primero.
  const heredada = casa({ id: "heredada", role: "owner", isOwn: true, propia: false, createdAt: "2025-01-01" });
  const suya = casa({ id: "suya", role: "owner", isOwn: true, propia: true, createdAt: "2026-05-01" });
  const ajena = casa({ id: "ajena", role: "viewer", isOwn: false });

  it("con `propia` informado, elige la propia", () => {
    expect(casaPropia([heredada, suya, ajena])?.id).toBe("suya");
  });
  it("sin `propia` (ensure_* viejo), la primera de las suyas, como antes", () => {
    const sinCampo = [casa({ id: "x", role: "owner", isOwn: true }), ajena];
    expect(casaPropia(sinCampo)?.id).toBe("x");
  });
  it("resolveActiveHousehold sin id cae en la propia", () => {
    expect(resolveActiveHousehold([heredada, suya, ajena], null)?.id).toBe("suya");
  });
});

describe("quién soy en la familia: por usuario, no compartido en la casa", () => {
  const members = [{ id: "m-pablo", name: "Pablo" }, { id: "m-isa", name: "Isa" }];

  it("titular y cotitular marcan cada uno el suyo sin pisarse", () => {
    let data = { members };
    data = conMiembroDeCuenta(data, "u-pablo", "m-pablo");
    data = conMiembroDeCuenta(data, "u-isa", "m-isa");
    expect(miembroDeCuentaId(data, "u-pablo")).toBe("m-pablo");
    expect(miembroDeCuentaId(data, "u-isa")).toBe("m-isa");
  });

  it("el valor viejo compartido vale de respaldo para el titular, no para el cotitular", () => {
    const data = { members, accountMemberId: "m-pablo" };
    expect(miembroDeCuentaId(data, "u-pablo", { esTitular: true })).toBe("m-pablo");
    expect(miembroDeCuentaId(data, "u-isa", { esTitular: false })).toBeNull();
    // Y entonces la cotitular cae en la adivinanza por nombre, no en Pablo.
    expect(resolveAccountMember(members, miembroDeCuentaId(data, "u-isa", { esTitular: false }), "Isa")?.id).toBe("m-isa");
  });

  it("desmarcar (null) es una elección: no vuelve al valor compartido", () => {
    const data = conMiembroDeCuenta({ members, accountMemberId: "m-pablo" }, "u-pablo", null);
    expect(miembroDeCuentaId(data, "u-pablo", { esTitular: true })).toBeNull();
  });

  it("sin sesión (invitado) se guarda donde siempre", () => {
    const data = conMiembroDeCuenta({ members }, null, "m-isa");
    expect(data.accountMemberId).toBe("m-isa");
    expect(miembroDeCuentaId(data, null)).toBe("m-isa");
  });
});
