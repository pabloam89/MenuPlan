import { describe, expect, it } from "vitest";

import { papelDe, puede } from "./papeles.js";
import { canShareHouseholdInvite, isHouseholdReadOnly, parseHouseholdMemberRow, parseHouseholdRow } from "./householdsSync.js";

// La matriz del apartado 2 de specs/roles-de-la-casa-propuesta.md, fila a fila.
const MATRIZ = [
  // acción, titular, cotitular, lector
  ["editar_casa", true, true, false],
  ["tachar", true, true, true],
  ["invitar_lector", true, true, false],
  ["invitar_cotitular", true, false, false],
  ["cambiar_papel", true, false, false],
  ["quitar:editor", true, false, false],
  ["quitar:viewer", true, true, false],
  ["salir", false, true, true],
  ["renombrar", true, true, false],
  ["borrar_casa", true, false, false],
  ["enlazar_grupo", true, true, false],
];

describe("quién puede qué", () => {
  for (const [accion, titular, cotitular, lector] of MATRIZ) {
    it(accion, () => {
      expect([puede("owner", accion), puede("editor", accion), puede("viewer", accion)]).toEqual([titular, cotitular, lector]);
    });
  }

  it("un papel desconocido es lector (lo seguro)", () => {
    expect(papelDe("admin")).toBe("viewer");
    expect(papelDe(undefined)).toBe("viewer");
    expect(puede("admin", "editar_casa")).toBe(false);
  });
});

describe("la casa del cotitular", () => {
  const casa = (role) => parseHouseholdRow({ id: "h", role, setupStatus: "active", inviteToken: "t", ownerUserId: "o", isOwn: role === "owner" });

  it("se lee como cotitular, no como lector", () => {
    expect(casa("editor").role).toBe("editor");
  });

  it("es editable para titular y cotitular, no para el lector", () => {
    expect(isHouseholdReadOnly(casa("owner"))).toBe(false);
    expect(isHouseholdReadOnly(casa("editor"))).toBe(false);
    expect(isHouseholdReadOnly(casa("viewer"))).toBe(true);
  });

  it("el cotitular puede compartir el enlace de lector", () => {
    expect(canShareHouseholdInvite(casa("editor"))).toBe(true);
    expect(canShareHouseholdInvite(casa("viewer"))).toBe(false);
  });

  it("en la lista de miembros, cada uno con su nombre de papel", () => {
    expect(parseHouseholdMemberRow({ userId: "u", role: "editor" }).roleLabel).toBe("Cotitular");
    expect(parseHouseholdMemberRow({ userId: "u", role: "viewer" }).roleLabel).toBe("Lector");
    expect(parseHouseholdMemberRow({ userId: "u", role: "owner" }).roleLabel).toBe("Titular");
  });
});
