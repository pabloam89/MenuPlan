/**
 * ver_casa (describirCasa): un «ninguna» por silencio (#229) no se cuenta como
 * confirmado. Es lo que Lola lee si le preguntan qué alergias hay apuntadas.
 */
import { describe, it, expect } from "vitest";
import { describirCasa } from "./menu.js";

describe("describirCasa y las alergias por silencio", () => {
  it("dice que no lo confirmaron; lo dicho, como siempre", () => {
    const casa = { state: { data: { members: [
      { id: "a", name: "Ana", age: 38, allergies: [], alergiasRevisadas: true, alergiasOrigen: "por_silencio" },
      { id: "b", name: "Leo", age: 6, allergies: ["Huevos"], alergiasRevisadas: true },
      { id: "c", name: "Pablo", age: 40, allergies: [], alergiasRevisadas: true },
    ] } } };
    const t = describirCasa(casa);
    expect(t).toMatch(/Ana, 38 años — alergias: ninguna por silencio \(no lo confirmaron\)/);
    expect(t).toMatch(/Leo, 6 años — alergias\/intolerancias: Huevos/);
    expect(t).not.toMatch(/Pablo[^\n]*silencio/);
  });
});
