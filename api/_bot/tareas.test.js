import { describe, it, expect } from "vitest";
import { filtroDeLectura, bloqueDeTareas, validarNueva, LIMITE_ABIERTAS } from "./tareas.js";

const CASA = "11111111-1111-1111-1111-111111111111";
const YO = "22222222-2222-2222-2222-222222222222";

describe("filtroDeLectura: qué tareas ve quien escribe", () => {
  it("en grupo o sin privado, solo las de la casa", () => {
    const f = filtroDeLectura({ householdId: CASA, userId: YO, privado: false });
    expect(f).toContain("scope=eq.casa");
    expect(f).not.toContain("owner_user_id");
  });
  it("en privado, también las personales de quien escribe", () => {
    const f = filtroDeLectura({ householdId: CASA, userId: YO, privado: true });
    expect(f).toContain(`owner_user_id.eq.${YO}`);
  });
  it("siempre acota a la casa, a lo abierto y a un tope", () => {
    const f = filtroDeLectura({ householdId: CASA });
    expect(f).toContain(`household_id=eq.${CASA}`);
    expect(f).toContain("status=eq.abierta");
    expect(f).toContain(`limit=${LIMITE_ABIERTAS}`);
  });
});

describe("bloqueDeTareas", () => {
  it("sin tareas no añade nada", () => {
    expect(bloqueDeTareas([])).toBe("");
  });
  it("lista cada tarea con su id, tipo y lo que falta", () => {
    const b = bloqueDeTareas([
      { id: "t1", kind: "pregunta", texto: "Cova, 11 meses", falta: "cómo come", scope: "casa" },
      { id: "t2", kind: "seguimiento", texto: "ver si llegó el pedido", scope: "personal" },
    ]);
    expect(b).toContain("[t1] Falta saber: Cova, 11 meses (falta: cómo come)");
    expect(b).toContain("[t2] Seguimiento: ver si llegó el pedido (personal)");
    expect(b).toContain("cerrar_tarea");
  });
});

describe("validarNueva: nada se escribe sin el sí", () => {
  it("sin confirmado=true, no escribe", () => {
    expect(validarNueva({ texto: "dímelo", kind: "seguimiento", confirmado: false }).error).toBeTruthy();
    expect(validarNueva({ texto: "dímelo", kind: "seguimiento" }).error).toBeTruthy();
  });
  it("con el sí, valida texto y tipo", () => {
    expect(validarNueva({ texto: "  dímelo cuando lo sepas  ", kind: "seguimiento", confirmado: true }).valor.texto).toBe("dímelo cuando lo sepas");
    expect(validarNueva({ texto: "", kind: "seguimiento", confirmado: true }).error).toBeTruthy();
    expect(validarNueva({ texto: "algo", kind: "recordatorio", confirmado: true }).error).toBeTruthy();
  });
  it("el ámbito por defecto es la casa", () => {
    expect(validarNueva({ texto: "algo", kind: "pregunta", confirmado: true }).valor.scope).toBe("casa");
  });
});
