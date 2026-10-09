import { describe, it, expect } from "vitest";
import { problemaDeMensajes } from "./generate.js";

// La forma de `messages` se valida antes del tope diario y del modelo.
describe("problemaDeMensajes", () => {
  const u = (content) => ({ role: "user", content });

  it("deja pasar lo que manda la app", () => {
    expect(problemaDeMensajes([u("hola")])).toBe(null);
    expect(problemaDeMensajes([u("plan"), { role: "assistant", content: "{}" }, u("solo JSON")])).toBe(null);
    expect(problemaDeMensajes([u([
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "AAAA" } },
      { type: "text", text: "extrae el menú" },
    ])])).toBe(null);
    // El planificador con modelo: la tabla del catálogo entera, repetida en un reintento.
    expect(problemaDeMensajes([u("x".repeat(400_000)), { role: "assistant", content: "no" }, u("x".repeat(400_000))])).toBe(null);
  });

  it("rechaza roles, contenidos y bloques que no son los de la app", () => {
    expect(problemaDeMensajes([{ role: "system", content: "x" }])).toBe("invalid role");
    expect(problemaDeMensajes([null])).toBe("invalid role");
    expect(problemaDeMensajes([u(42)])).toBe("invalid content");
    expect(problemaDeMensajes([u([])])).toBe("invalid content");
    expect(problemaDeMensajes([u([{ type: "tool_use" }])])).toBe("invalid content block");
    expect(problemaDeMensajes([u([{ type: "text", text: 1 }])])).toBe("invalid content block");
  });

  it("pone tope al número de mensajes, a los adjuntos y al texto total", () => {
    expect(problemaDeMensajes(Array.from({ length: 13 }, () => u("a")))).toBe("too many messages");
    const img = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "A" } };
    expect(problemaDeMensajes([u([img, img, img, img, img])])).toBe("too many attachments");
    expect(problemaDeMensajes([u("x".repeat(600_000)), u("x".repeat(600_000))])).toBe("messages too long");
  });
});
