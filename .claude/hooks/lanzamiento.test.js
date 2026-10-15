// El hook sobre el lanzamiento de un agente (#642): niega un brief sin el estándar de ese agente o sin las normas.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HERRAMIENTAS, MARCA_NORMAS, NORMA, decidirLanzamiento, excepcionDelBrief, leerEstandaresDe, salidaDeLanzamiento } from "./lanzamiento.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ESTANDARES = leerEstandaresDe(RAIZ);
const HOY = "2026-10-14";
const BUENO = `BRIEF DE revisor\n8. Estándar de la tarea:\nESTÁNDAR A CUMPLIR: revisor/revisar-diff\nTarea: x\n${MARCA_NORMAS}3; …):\n  - norma`;
const lanza = (prompt, subagent_type = "revisor", tool_name = "Agent") => decidirLanzamiento({ tool_name, tool_input: { subagent_type, prompt } }, ESTANDARES, HOY);

describe("decidirLanzamiento", () => {
  it("el brief del dimensionado pasa", () => expect(lanza(BUENO)).toBe(null));
  it("también con el nombre de antes de la herramienta (Task)", () => {
    expect(HERRAMIENTAS).toEqual(["Agent", "Task"]);
    expect(lanza("hazlo", "revisor", "Task")?.decision).toBe("deny");
  });
  it.each([
    ["sin la línea del estándar", "Revisa el PR #12, por favor", /no trae la línea «ESTÁNDAR A CUMPLIR: revisor/],
    ["con el estándar de otro agente", BUENO.replace("revisor/revisar-diff", "seguridad/revisar-diff"), /es de seguridad, no de revisor/],
    ["con una tarea que no existe", BUENO.replace("revisar-diff", "inventada"), /no es una tarea de revisor/],
    ["sin las normas del dimensionado", BUENO.replace(MARCA_NORMAS, "Normas:"), /no trae las normas del dimensionado/],
  ])("%s, niega", (_, prompt, motivo) => {
    const r = lanza(prompt);
    expect(r?.decision).toBe("deny");
    expect(r.motivo).toMatch(motivo);
    expect(r.motivo).toMatch(/npm run dimensionar/);
  });
  it("busca la línea del agente que se lanza, no la primera: un brief que cita antes la de otro pasa; uno solo con la de otro, no", () => {
    const conCita = `Contexto: el constructor trabajó con\nESTÁNDAR A CUMPLIR: constructor/permisos-y-hooks\n\n${BUENO}`;
    expect(lanza(conCita)).toBe(null);
    expect(lanza(BUENO.replace("revisor/revisar-diff", "constructor/permisos-y-hooks"))?.motivo).toMatch(/es de constructor, no de revisor/);
  });
  it("el motivo de la negativa dice cómo sacar el brief de un agente que no está en el plan (--tarea)", () => {
    expect(lanza("diagnostica esto", "analista")?.motivo).toMatch(/no está en el plan[\s\S]*--tarea <una tarea suya>/);
  });
  it("los agentes que no son del repo pasan (Explore, general-purpose)", () => {
    expect(lanza("busca x", "Explore")).toBe(null);
    expect(lanza("busca x", "general-purpose")).toBe(null);
  });
  it("otras herramientas no las mira", () => expect(decidirLanzamiento({ tool_name: "Bash", tool_input: { command: "ls" } }, ESTANDARES, HOY)).toBe(null));
  it("sin estándares legibles, avisa y deja pasar (falla abierta)", () => {
    expect(decidirLanzamiento({ tool_name: "Agent", tool_input: { subagent_type: "revisor", prompt: "x" } }, null, HOY)?.decision).toBe("aviso");
  });
  it("cada agente de .claude/agents/ tiene estándares: ninguno se escapa por no estar en el catálogo", () => {
    const agentes = readFileSync(join(RAIZ, "ops", "estandares-agentes.json"), "utf8");
    for (const a of ["constructor", "revisor", "seguridad", "qa", "evaluador", "auditor-datos", "analista"]) expect(agentes, a).toContain(`"${a}"`);
    for (const a of Object.keys(ESTANDARES.agentes)) expect(lanza("sin brief", a)?.decision, a).toBe("deny");
  });
});

describe("la excepción con la forma única", () => {
  const exc = (hasta) => `Excepción: ${NORMA} — ningún estándar encaja con esta tarea — hasta ${hasta}`;
  it("vigente, deja pasar con un aviso", () => {
    const r = lanza(`haz x\n${exc("2026-10-20")}`);
    expect(r?.decision).toBe("aviso");
    expect(r.motivo).toMatch(/excepción de brief-con-estandar hasta 2026-10-20/);
  });
  it("citada (con > delante) no cuenta: una cita es texto de otro", () => {
    expect(excepcionDelBrief(`> ${exc("2026-10-20")}`, HOY)).toBe(null);
    expect(excepcionDelBrief(` >> ${exc("2026-10-20")}`, HOY)).toBe(null);
    expect(lanza(`haz x\n> ${exc("2026-10-20")}`)?.decision).toBe("deny");
    // En una lista sí: es la línea de quien escribe el brief.
    expect(excepcionDelBrief(`- ${exc("2026-10-20")}`, HOY)?.hasta).toBe("2026-10-20");
  });
  it("caducada, a más de 90 días, de otra norma o sin motivo, no cuenta", () => {
    expect(excepcionDelBrief(exc("2026-10-01"), HOY)).toBe(null);
    expect(excepcionDelBrief(exc("2027-03-01"), HOY)).toBe(null);
    expect(excepcionDelBrief(exc("2026-10-20").replace(NORMA, "otra-norma"), HOY)).toBe(null);
    expect(excepcionDelBrief(`Excepción: ${NORMA} — corto — hasta 2026-10-20`, HOY)).toBe(null);
    expect(lanza(`haz x\n${exc("2026-10-01")}`)?.decision).toBe("deny");
  });
});

describe("la salida y el proceso", () => {
  it("la negativa sale como permissionDecision deny; el aviso, como contexto", () => {
    expect(salidaDeLanzamiento({ decision: "deny", motivo: "m" })).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "m" } });
    expect(salidaDeLanzamiento({ decision: "aviso", motivo: "m" }).hookSpecificOutput.additionalContext).toBe("m");
    expect(salidaDeLanzamiento(null)).toBe(null);
  });
  const corre = (entrada) =>
    spawnSync(process.execPath, [join(RAIZ, ".claude", "hooks", "lanzamiento.mjs")], {
      input: JSON.stringify(entrada), encoding: "utf8", env: { ...process.env, MENUPLAN_FABRICA_DIR: join(tmpdir(), "menuplan-lanzamiento-test") },
    });
  it("lanzado como hook, niega un brief sin estándar y deja pasar el del dimensionado", () => {
    const no = corre({ tool_name: "Agent", tool_input: { subagent_type: "revisor", prompt: "revisa" }, cwd: RAIZ });
    expect(no.status).toBe(0);
    expect(JSON.parse(no.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    const si = corre({ tool_name: "Agent", tool_input: { subagent_type: "revisor", prompt: BUENO }, cwd: RAIZ });
    expect(si.status).toBe(0);
    expect(si.stdout).toBe("");
  });
  it("con una entrada ilegible no bloquea", () => {
    const r = spawnSync(process.execPath, [join(RAIZ, ".claude", "hooks", "lanzamiento.mjs")], { input: "no es json", encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBeUndefined();
  });
});

describe("cableado en .claude/settings.json", () => {
  it("un PreToolUse con matcher Agent|Task lanza este hook", () => {
    const s = JSON.parse(readFileSync(join(RAIZ, ".claude", "settings.json"), "utf8"));
    const entrada = (s.hooks?.PreToolUse ?? []).find((h) => h.hooks.some((x) => x.command.includes(".claude/hooks/lanzamiento.mjs")));
    expect(entrada, "falta el hook en settings.json").toBeTruthy();
    expect(entrada.matcher.split("|").sort()).toEqual([...HERRAMIENTAS].sort());
  });
});
