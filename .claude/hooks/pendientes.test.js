import { describe, expect, it } from "vitest";

import { leerTranscript, pendientesSinIssue } from "./pendientes.mjs";

const linea = (content) => JSON.stringify({ type: "assistant", message: { content } });

describe("pendientes al terminar (#207)", () => {
  it.each([
    "**Decisiones para Pablo:** cerrar el script de ids viejos",
    "Decisiones para Pablo:\n- rescatar el emparejador\n- probar Mercadona",
    "Queda pendiente decidir qué hacemos con la rama del iPhone.",
  ])("deja pendientes sin issue y no ha tocado ninguno: frena (%s)", (ultimo) =>
    expect(pendientesSinIssue({ ultimo, comandos: ["git status"] })).toBe(true));

  // Falsos positivos que vio el juez (8 oct): la cabecera fija del informe de
  // los agentes, las negaciones y los pendientes que ya tienen su issue.
  it.each([
    "DECISIONES PENDIENTES:\n- ninguna",
    "Sin pendientes: fusionado y retirado.",
    "Nada pendiente: PR #210 fusionado.",
    "Queda pendiente el #94",
    "Decisiones para Pablo:\n- #194 cerrar el script\n- #196 el emparejador",
    "No quedan pendientes.",
  ])("no frena: %s", (ultimo) => expect(pendientesSinIssue({ ultimo, comandos: [] })).toBe(false));
  it("si ya creó o comentó un issue en la sesión, no", () => {
    expect(pendientesSinIssue({ ultimo: "Queda pendiente el #94", comandos: ['npm run issues -- --nuevo "x" --tipo decision'] })).toBe(false);
    expect(pendientesSinIssue({ ultimo: "Queda pendiente el #94", comandos: ["gh issue comment 94 --body x"] })).toBe(false);
  });
  it("sin pendientes, no", () => expect(pendientesSinIssue({ ultimo: "Fusionado y retirado.", comandos: [] })).toBe(false));

  it("lee el último texto y los comandos del transcript", () => {
    const jsonl = [
      linea([{ type: "text", text: "primero" }, { type: "tool_use", name: "Bash", input: { command: "gh pr view 1" } }]),
      JSON.stringify({ type: "user", message: { content: "ok" } }),
      linea([{ type: "text", text: "Pendientes: el #94" }]),
      "no es json",
    ].join("\n");
    expect(leerTranscript(jsonl)).toEqual({ ultimo: "Pendientes: el #94", comandos: ["gh pr view 1"] });
  });
});
