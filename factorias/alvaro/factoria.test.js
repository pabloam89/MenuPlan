import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { apunteDe, bloqueantes, cuadro, evaluar, juecesRequeridos, veredictoDe } from "./lib/reglas.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));

describe("qué jueces tocan según los ficheros", () => {
  it("una pantalla pide qa y revisor", () => {
    expect(Object.keys(juecesRequeridos(["src/zz-ejemplo/Pantalla.jsx"])).sort()).toEqual(["qa", "revisor"]);
  });
  it("Lola pide evaluador y revisor, también su carpeta de entrada", () => {
    expect(Object.keys(juecesRequeridos(["api/_bot/zz-ejemplo.js"])).sort()).toEqual(["evaluador", "revisor"]);
    expect(Object.keys(juecesRequeridos(["api/bot/zz-otro.js"]))).toContain("evaluador");
  });
  it("un test o un snapshot de Lola no pide evaluador, pero sí revisor", () => {
    expect(Object.keys(juecesRequeridos(["api/_bot/zz-ejemplo.test.js", "api/_bot/__snapshots__/zz-ejemplo.test.js.snap"]))).toEqual(["revisor"]);
  });
  it("docs y datos sueltos no piden nada", () => {
    expect(juecesRequeridos(["docs/ops/NORMAS.md", "ops/normas.json", "README.md"])).toEqual({});
  });
});

describe("veredicto del juez", () => {
  it.each([
    ["Veredicto: pasa", "pasa"],
    ["**Veredicto:** aprobado con 3 nit", "pasa"],
    ["Veredicto: no pasa, hay un bloqueante", "no_pasa"],
    ["Veredicto: no sé, falta el caso", "no_se"],
    ["12 ficheros leídos, 0 bloqueantes", "pasa"],
    ["Todo parece bien", "sin_veredicto"],
    // la línea del encargo, con las tres opciones, NO es un veredicto
    ["Termina con «Veredicto: pasa | no pasa | no sé» (elige una).", "sin_veredicto"],
    ["Veredicto: pasa | no pasa | no sé", "sin_veredicto"],
    // si el informe cita el encargo y luego da el suyo, vale el suyo (el último con una sola opción)
    ["Veredicto: pasa | no pasa | no sé (elige una)\n\nVeredicto: no pasa, hay un bloqueante", "no_pasa"],
  ])("%s → %s", (texto, esperado) => expect(veredictoDe(texto)).toBe(esperado));
});

describe("qué apunta cada evento (apunteDe)", () => {
  const lanzado = {
    hook_event_name: "PostToolUse",
    tool_name: "Agent",
    tool_input: { subagent_type: "revisor", prompt: "Termina con «Veredicto: pasa | no pasa | no sé» (elige una)." },
    tool_response: { isAsync: true, status: "async_launched", agentId: "agente-sintetico-1", description: "juzgar", resolvedModel: "modelo-x", prompt: "Termina con «Veredicto: pasa | no pasa | no sé» (elige una).", outputFile: "/tmp/sintetico/salida.output" },
  };
  it("un juez lanzado en segundo plano queda «lanzado», no «pasa»", () => {
    const a = apunteDe(lanzado);
    expect(a.agente).toBe("revisor");
    expect(a.veredicto).toBe("lanzado");
  });
  it("un juez en primer plano con texto se lee como siempre", () => {
    const a = apunteDe({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_input: { subagent_type: "qa" }, tool_response: { status: "completed", content: [{ type: "text", text: "Veredicto: pasa" }] } });
    expect([a.agente, a.veredicto]).toEqual(["qa", "pasa"]);
  });
  it("SubagentStop: el informe es last_assistant_message", () => {
    const a = apunteDe({ hook_event_name: "SubagentStop", agent_id: "agente-sintetico-1", agent_type: "evaluador", last_assistant_message: "Casos: 12/12.\nVeredicto: no pasa, falla un caso" });
    expect([a.agente, a.veredicto]).toEqual(["evaluador", "no_pasa"]);
  });
  it("SubagentHandback: el informe es tool_input.message", () => {
    const a = apunteDe({ hook_event_name: "PostToolUse", tool_name: "SubagentHandback", agent_type: "revisor", tool_input: { message: "Veredicto: pasa" } });
    expect([a.agente, a.veredicto]).toEqual(["revisor", "pasa"]);
  });
  it("lo que no es un juez, o llega sin nombre, no se apunta", () => {
    expect(apunteDe({ hook_event_name: "SubagentStop", agent_type: "constructor", last_assistant_message: "Veredicto: pasa" })).toBeNull();
    expect(apunteDe({ hook_event_name: "SubagentStop", agent_type: "", last_assistant_message: "Veredicto: pasa" })).toBeNull();
    expect(apunteDe({ hook_event_name: "PostToolUse", tool_name: "SubagentHandback", tool_input: { message: "Veredicto: pasa" } })).toBeNull();
  });
});

describe("evaluar", () => {
  const requeridos = { revisor: ["src/a.js"], qa: ["src/a.js"] };
  it("un juez que corrió ANTES del último cambio no vale", () => {
    const filas = evaluar({ requeridos, entradas: [{ ts: 100, agente: "revisor", veredicto: "pasa" }], ultimaEdicion: { revisor: 200, qa: 200 } });
    expect(filas.map((f) => f.estado)).toEqual(["falta", "falta"]);
  });
  it("uno posterior vale; «no pasa» bloquea; «no sé» solo avisa", () => {
    const filas = evaluar({
      requeridos,
      entradas: [{ ts: 300, agente: "revisor", veredicto: "no_pasa", resumen: "x" }, { ts: 300, agente: "qa", veredicto: "no_se" }],
      ultimaEdicion: { revisor: 200, qa: 200 },
    });
    expect(filas.map((f) => f.estado)).toEqual(["no_pasa", "dudoso"]);
    expect(bloqueantes(filas).map((f) => f.juez)).toEqual(["revisor"]);
    expect(cuadro(filas)).toMatch(/revisor +❌/);
  });
  it("un juez solo «lanzado» aún no ha informado: bloquea y lo dice", () => {
    const filas = evaluar({ requeridos: { revisor: ["src/a.js"] }, entradas: [{ ts: 300, agente: "revisor", veredicto: "lanzado" }], ultimaEdicion: { revisor: 200 } });
    expect(filas[0].estado).toBe("lanzado");
    expect(filas[0].nota).toMatch(/lanzado, sin informe/);
    expect(bloqueantes(filas).map((f) => f.juez)).toEqual(["revisor"]);
  });
  it("el informe del juez gana al «lanzado» anterior y a un «sin veredicto» posterior", () => {
    const filas = evaluar({
      requeridos: { revisor: ["src/a.js"] },
      entradas: [{ ts: 300, agente: "revisor", veredicto: "lanzado" }, { ts: 310, agente: "revisor", veredicto: "pasa" }, { ts: 320, agente: "revisor", veredicto: "sin_veredicto" }],
      ultimaEdicion: { revisor: 200 },
    });
    expect(filas[0].estado).toBe("ok");
  });
});

describe("los hooks de punta a punta (prueba de fallo)", () => {
  let repo;
  let reg;
  const correr = (hook, entrada, extra = {}) =>
    spawnSync("node", [join(aqui, "hooks", hook)], { input: JSON.stringify({ cwd: repo, ...entrada }), encoding: "utf8", env: { ...process.env, FACTORIA_ALVARO_DIR: reg, ...extra } });
  const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "fa-repo-"));
    reg = mkdtempSync(join(tmpdir(), "fa-reg-"));
    git("init", "-q", "-b", "prueba");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    writeFileSync(join(repo, "README.md"), "x");
    git("add", ".");
    git("commit", "-qm", "base");
    git("update-ref", "refs/remotes/origin/staging", "HEAD");
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(reg, { recursive: true, force: true });
  });

  const tocarPantalla = () => {
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "App.jsx"), "export default 1");
  };

  it("el arranque dice que está activa", () => {
    expect(JSON.parse(correr("arranque.mjs", {}).stdout).systemMessage).toMatch(/Factoría de Álvaro activa/);
  });
  it("sin cambios que juzgar, deja cerrar sin decir nada", () => {
    expect(correr("cierre.mjs", {}).stdout).toBe("");
  });
  it("FALLA A PROPÓSITO: se toca una pantalla sin jueces y el cierre bloquea", () => {
    tocarPantalla();
    const r = JSON.parse(correr("cierre.mjs", {}).stdout);
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/qa/);
    expect(r.reason).toMatch(/revisor/);
  });
  it("con los jueces apuntados tras el cambio, deja cerrar y enseña el cuadro", () => {
    tocarPantalla();
    for (const agente of ["revisor", "qa"]) {
      correr("registro.mjs", { tool_name: "Agent", tool_input: { subagent_type: agente }, tool_response: { content: [{ type: "text", text: "Veredicto: pasa" }] } });
    }
    const r = JSON.parse(correr("cierre.mjs", {}).stdout);
    expect(r.decision).toBeUndefined();
    expect(r.systemMessage).toMatch(/revisor +✅/);
    expect(r.systemMessage).toMatch(/qa +✅/);
  });
  // Lo que llega de verdad cuando el juez va en segundo plano: el aviso de lanzamiento, que repite el encargo
  const lanzamiento = (agente) => ({
    hook_event_name: "PostToolUse",
    tool_name: "Agent",
    tool_input: { subagent_type: agente },
    tool_response: { isAsync: true, status: "async_launched", agentId: "agente-sintetico-1", description: "juzgar", resolvedModel: "modelo-x", prompt: "Acaba con «Veredicto: pasa | no pasa | no sé» (elige una).", outputFile: "/tmp/sintetico/salida.output" },
  });
  it("CASO REAL: con un «async_launched» como único apunte del juez, el cierre bloquea", () => {
    tocarPantalla();
    for (const agente of ["revisor", "qa"]) correr("registro.mjs", lanzamiento(agente));
    const r = JSON.parse(correr("cierre.mjs", {}).stdout);
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/lanzado, sin informe/);
    expect(r.reason).not.toMatch(/✅/);
  });
  it("lanzado y luego informa por SubagentStop: el cierre deja cerrar", () => {
    tocarPantalla();
    for (const agente of ["revisor", "qa"]) {
      correr("registro.mjs", lanzamiento(agente));
      correr("registro.mjs", { hook_event_name: "SubagentStop", agent_id: "agente-sintetico-1", agent_type: agente, last_assistant_message: "Todo en orden.\nVeredicto: pasa" });
    }
    const r = JSON.parse(correr("cierre.mjs", {}).stdout);
    expect(r.decision).toBeUndefined();
    expect(r.systemMessage).toMatch(/revisor +✅/);
  });
  it("lanzado y luego informa por SubagentHandback: el cierre deja cerrar", () => {
    tocarPantalla();
    for (const agente of ["revisor", "qa"]) {
      correr("registro.mjs", lanzamiento(agente));
      correr("registro.mjs", { hook_event_name: "PostToolUse", tool_name: "SubagentHandback", agent_id: "agente-sintetico-1", agent_type: agente, tool_input: { message: "Veredicto: pasa" } });
    }
    const r = JSON.parse(correr("cierre.mjs", {}).stdout);
    expect(r.decision).toBeUndefined();
    expect(r.systemMessage).toMatch(/qa +✅/);
  });
  it("no atrapa la sesión: con stop_hook_active avisa pero deja cerrar", () => {
    tocarPantalla();
    const r = JSON.parse(correr("cierre.mjs", { stop_hook_active: true }).stdout);
    expect(r.decision).toBeUndefined();
    expect(r.systemMessage).toMatch(/segundo aviso/);
  });
  it("FACTORIA_ALVARO_OFF=1 lo apaga y lo dice", () => {
    tocarPantalla();
    expect(JSON.parse(correr("cierre.mjs", {}, { FACTORIA_ALVARO_OFF: "1" }).stdout).systemMessage).toMatch(/APAGADA/);
  });
});
