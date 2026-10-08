import { describe, expect, it } from "vitest";

import { leerTranscript, pendientesSinIssue } from "./pendientes.mjs";

const linea = (content) => JSON.stringify({ type: "assistant", message: { content } });

describe("pendientes al terminar (#207)", () => {
  it("deja decisiones y no ha tocado ningún issue: frena", () =>
    expect(pendientesSinIssue({ ultimo: "**Decisiones para Pablo:** cerrar el #94", comandos: ["git status"] })).toBe(true));
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
