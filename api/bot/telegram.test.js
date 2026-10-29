import { describe, it, expect } from "vitest";
import { meHablan, datoDeBoton, medida } from "./telegram.js";

describe("bot_route guarda lo guardado de verdad y el recibo (#958)", () => {
  it("lola.guardados y lola.recibo pasan tal cual; sin ellos, null", () => {
    const con = medida({ lola: { herramientas: [], guardados: 2, recibo: [["despensa", 38, 28]] } }, {}, 0).lola;
    expect(con).toMatchObject({ guardados: 2, recibo: [["despensa", 38, 28]] });
    const sin = medida({ lola: { herramientas: [] } }, {}, 0).lola;
    expect(sin).toMatchObject({ guardados: null, recibo: null });
    // Cero es un dato (no se guardó nada), no «sin medida».
    expect(medida({ lola: { herramientas: [], guardados: 0, recibo: [] } }, {}, 0).lola).toMatchObject({ guardados: 0, recibo: [] });
  });
});

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
  it("un comando para OTRO bot del grupo no es para Lola (#958); uno suelto, sí", () => {
    expect(meHablan({ text: "/menu@OtroBot" }, YO)).toBe(false);
    expect(meHablan({ text: "/start@otro_bot abc" }, YO)).toBe(false);
    expect(meHablan({ text: "/menu" }, YO)).toBe(true);
    expect(meHablan({ text: "/menu@HOMENUERS_BOT" }, YO)).toBe(true);
  });
});

describe("conLoginDeTelegram: el botón de login solo en el dominio de @BotFather", async () => {
  const { conLoginDeTelegram } = await import("./telegram.js");
  it("staging, que es el dominio del bot: sí", () => {
    expect(conLoginDeTelegram("https://homenu-staging.vercel.app")).toBe(true);
  });
  it("otro despliegue (una preview, producción): no, la llave de antes", () => {
    expect(conLoginDeTelegram("https://homenu.app")).toBe(false);
    expect(conLoginDeTelegram("https://homenu-git-rama.vercel.app")).toBe(false);
    expect(conLoginDeTelegram(null)).toBe(false);
  });
});

// [[No es así]] pulsado es deshacer, también si Lola lo escribió en inglés (#958).
describe("datoDeBoton: el botón de deshacer, en los dos idiomas", () => {
  it("«No es así» y «That's not right» deshacen; otro botón va tal cual", () => {
    expect(datoDeBoton("No es así")).toBe("t:Deshaz lo último que has cambiado");
    expect(datoDeBoton("That's not right")).toBe("t:Deshaz lo último que has cambiado");
    expect(datoDeBoton("Lentejas")).toBe("t:Lentejas");
  });
});
