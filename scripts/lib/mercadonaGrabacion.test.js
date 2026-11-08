import { describe, expect, it } from "vitest";
import { ES_API, limpiarRuta, limpiarValor, llamadaLimpia } from "./mercadonaGrabacion.mjs";

// Una respuesta como la de una dirección guardada y sus franjas, inventada.
const DIRECCION = {
  id: 1234567,
  address: "Calle Falsa 123",
  postal_code: "28001",
  phone: "600111222",
  email: "alguien@example.com",
  comments: "Llamar al timbre",
  is_default: true,
  slots: [{ start: "2026-11-10T19:00:00Z", end: "2026-11-10T20:00:00Z", available: true, price: 7.21, status: "open" }],
};

describe("limpiarValor: la forma sin los datos de la persona", () => {
  it("quita dirección, teléfono, correo, comentarios y el id de la clave personal", () => {
    const r = limpiarValor(DIRECCION);
    expect(r.address).toBe("«string»");
    expect(r.postal_code).toBe("«string»");
    expect(r.phone).toBe("«string»");
    expect(r.email).toBe("«string»");
    expect(r.comments).toBe("«string»");
    expect(JSON.stringify(r)).not.toMatch(/Falsa|28001|600111222|example\.com|timbre/);
  });

  it("deja lo que dice cómo funciona: franjas, precios, booleanos y palabras de vocabulario", () => {
    const [franja] = limpiarValor(DIRECCION).slots;
    expect(franja).toEqual({ start: "2026-11-10T19:00:00Z", end: "2026-11-10T20:00:00Z", available: true, price: 7.21, status: "open" });
    expect(limpiarValor(DIRECCION).is_default).toBe(true);
  });

  it("un token o una tarjeta nunca pasan, ni como número ni como texto suelto", () => {
    expect(limpiarValor({ access_token: "eyJhbGciOi.x.y", card: { pan: 4111111111111111, holder: "Ana" } })).toEqual({
      access_token: "«string»",
      card: { pan: "«number»", holder: "«string»" },
    });
    expect(limpiarValor({ nota: "Ana Pérez, 4º B" })).toEqual({ nota: "«texto»" });
  });

  it("de una lista larga, los cinco primeros y cuántos más", () => {
    expect(limpiarValor([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5, "«2 más»"]);
  });
});

describe("limpiarRuta", () => {
  it("el uuid de la persona y los ids largos pasan a :id, y la consulta pierde sus valores", () => {
    expect(limpiarRuta("https://tienda.mercadona.es/api/customers/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0/addresses/1234567/slots/?lang=es&wh=mad1"))
      .toBe("/api/customers/:id/addresses/:id/slots/?lang=…&wh=…");
  });
});

describe("llamadaLimpia", () => {
  it("una llamada del pedido guarda su forma; una del catálogo, sin cuerpo", () => {
    const pedido = llamadaLimpia({ metodo: "POST", url: "https://tienda.mercadona.es/api/customers/abcdefabcdefabcdefabcdef/checkouts/", status: 201, pide: '{"cart":{"id":"x"}}', responde: '{"id":98765,"status":"draft"}' });
    expect(pedido).toEqual({ metodo: "POST", ruta: "/api/customers/:id/checkouts/", status: 201, pide: { cart: { id: "x" } }, responde: { id: 98765, status: "draft" } });
    expect(llamadaLimpia({ metodo: "GET", url: "https://tienda.mercadona.es/api/categories/112/", status: 200, responde: '{"name":"Aceite"}' }).responde).toBeNull();
  });

  it("solo se graba la API de la tienda", () => {
    expect(ES_API.test("https://tienda.mercadona.es/api/customers/x/cart/")).toBe(true);
    expect(ES_API.test("https://www.google.com/recaptcha/api2/")).toBe(false);
  });
});
