import { describe, it, expect } from "vitest";
import { meHablan } from "./telegram.js";

const YO = "homenuers_bot";
describe("meHablan: en un grupo, ¿es para Lola?", () => {
  it("empieza por Lola", () => {
    expect(meHablan({ text: "Lola, ¿qué cenamos?" }, YO)).toBe(true);
    expect(meHablan({ text: "lola apunta leche" }, YO)).toBe(true);
  });
  it("una charla normal del grupo, no", () => {
    expect(meHablan({ text: "¿Quién recoge a Leo?" }, YO)).toBe(false);
    expect(meHablan({ text: "Lolailo" }, YO)).toBe(false);
    expect(meHablan({ text: "he visto a Lola en el súper" }, YO)).toBe(false);
  });
  it("mención, comando o respuesta a un mensaje suyo", () => {
    expect(meHablan({ text: "oye @HoMenuers_bot qué hay hoy" }, YO)).toBe(true);
    expect(meHablan({ text: "/menu@homenuers_bot" }, YO)).toBe(true);
    expect(meHablan({ text: "vale", reply_to_message: { from: { is_bot: true, username: "homenuers_bot" } } }, YO)).toBe(true);
    expect(meHablan({ text: "vale", reply_to_message: { from: { is_bot: false, username: "ana" } } }, YO)).toBe(false);
  });
  it("una foto con pie que empieza por Lola", () => {
    expect(meHablan({ caption: "Lola, el ticket de hoy", photo: [{}] }, YO)).toBe(true);
  });
});
