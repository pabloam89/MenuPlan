import { describe, expect, it } from "vitest";
import { telefonoDe, textoParaSellar } from "./mercadonaTelefono.js";

const BIEN = { phone_country_code: "34", phone_national_number: "600112233" };

describe("telefonoDe", () => {
  it.each(["600112233", "600 11 22 33", "+34 600 11 22 33", "0034600112233", "34600112233", "600-11-22-33", "(+34) 600.11.22.33"])("%s", (t) => {
    expect(telefonoDe(t)).toEqual(BIEN);
  });

  it("un fijo también vale", () => {
    expect(telefonoDe("912 345 678")?.phone_national_number).toBe("912345678");
  });

  it.each(["", "12345", "500112233", "6001122334", "+44 7700 900123", "llámame al 600112233", null, 600112233])("%j no", (t) => {
    expect(telefonoDe(t)).toBeNull();
  });
});

describe("textoParaSellar", () => {
  it("con los campos de Mercadona y nada más", () => {
    expect(JSON.parse(textoParaSellar({ ...BIEN, otra: 1 }))).toEqual(BIEN);
  });
});
