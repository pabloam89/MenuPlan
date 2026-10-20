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
  it("editar estos mismos hooks pide revisor", () => {
    expect(Object.keys(juecesRequeridos(["factorias/alvaro/hooks/registro.mjs"]))).toEqual(["revisor"]);
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
    // BLOQUEANTE 1: una sola opción con «|» en la explicación o en una tabla sigue siendo un veredicto
    ["Veredicto: no pasa | 2 bloqueantes", "no_pasa"],
    ["**Veredicto:** no pasa | ver B1 y B2", "no_pasa"],
    ["| Veredicto | no pasa |", "no_pasa"],
    ["| Veredicto | pasa |", "pasa"],
    // varias opciones (aunque falte alguna): es el encargo
    ["Veredicto: pasa | no pasa", "sin_veredicto"],
    ["Veredicto: no pasa | no sé", "sin_veredicto"],
    // MEDIO 4a: manda la ÚLTIMA línea que EMPIEZA por «Veredicto:»; una cita en medio de una frase no cuenta
    ["Veredicto: no pasa\n…el brief pedía «Veredicto: pasa»", "no_pasa"],
    ["Veredicto: pasa\nY recuerda que Veredicto: no pasa si hay bloqueantes", "pasa"],
    ["Veredicto: pasa\n\n> Veredicto: no pasa", "no_pasa"],
    // MEDIO 4b: «0 bloqueantes» con \b delante
    ["Hallazgos: 20 bloqueantes", "sin_veredicto"],
    ["Hallazgos: 10 bloqueantes y 2 medios", "sin_veredicto"],
    ["Hallazgos: 0 bloqueantes y 2 medios", "pasa"],
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
  it("cada apunte lleva el agent_id que trae su evento", () => {
    expect(apunteDe(lanzado).agent_id).toBe("agente-sintetico-1");
    expect(apunteDe({ hook_event_name: "SubagentStop", agent_id: "agente-sintetico-2", agent_type: "qa", last_assistant_message: "Veredicto: pasa" }).agent_id).toBe("agente-sintetico-2");
    expect(apunteDe({ hook_event_name: "PostToolUse", tool_name: "SubagentHandback", agent_id: "agente-sintetico-3", agent_type: "qa", tool_input: { message: "Veredicto: pasa" } }).agent_id).toBe("agente-sintetico-3");
    expect(apunteDe({ hook_event_name: "SubagentStop", agent_type: "qa", last_assistant_message: "Veredicto: pasa" })).not.toHaveProperty("agent_id");
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

describe("evaluar: el momento del juicio es el del lanzamiento", () => {
  const req = { revisor: ["src/a.js"] };
  it("BLOQUEANTE 2: lanzado a t=100, edición a t=200, informe «pasa» a t=300 con el mismo agent_id → falta", () => {
    const filas = evaluar({
      requeridos: req,
      entradas: [{ ts: 100, agente: "revisor", veredicto: "lanzado", agent_id: "a1" }, { ts: 300, agente: "revisor", veredicto: "pasa", agent_id: "a1" }],
      ultimaEdicion: { revisor: 200 },
    });
    expect(filas[0].estado).toBe("falta");
  });
  it("lanzado a t=100, informe a t=300, edición a t=50: vale", () => {
    const filas = evaluar({
      requeridos: req,
      entradas: [{ ts: 100, agente: "revisor", veredicto: "lanzado", agent_id: "a1" }, { ts: 300, agente: "revisor", veredicto: "pasa", agent_id: "a1" }],
      ultimaEdicion: { revisor: 50 },
    });
    expect(filas[0].estado).toBe("ok");
  });
  it("un lanzado de OTRO agent_id no cambia el momento del informe", () => {
    const filas = evaluar({
      requeridos: req,
      entradas: [{ ts: 100, agente: "revisor", veredicto: "lanzado", agent_id: "a2" }, { ts: 300, agente: "revisor", veredicto: "pasa", agent_id: "a1" }],
      ultimaEdicion: { revisor: 200 },
    });
    expect(filas[0].estado).toBe("ok");
  });
  it("sin agent_id se conserva el comportamiento: cuenta el instante del informe", () => {
    const filas = evaluar({
      requeridos: req,
      entradas: [{ ts: 100, agente: "revisor", veredicto: "lanzado" }, { ts: 300, agente: "revisor", veredicto: "pasa" }],
      ultimaEdicion: { revisor: 200 },
    });
    expect(filas[0].estado).toBe("ok");
  });
  it("MEDIO 3: un «sin veredicto» posterior no sustituye al «lanzado»: sigue lanzado y bloquea", () => {
    const filas = evaluar({
      requeridos: req,
      entradas: [{ ts: 300, agente: "revisor", veredicto: "lanzado", agent_id: "a1" }, { ts: 310, agente: "revisor", veredicto: "sin_veredicto", resumen: "Hecho.", agent_id: "a1" }],
      ultimaEdicion: { revisor: 200 },
    });
    expect(filas[0].estado).toBe("lanzado");
    expect(bloqueantes(filas)).toHaveLength(1);
  });
  it("un «sin veredicto» sin lanzamiento previo sigue siendo dudoso (avisa, no bloquea)", () => {
    const filas = evaluar({ requeridos: req, entradas: [{ ts: 300, agente: "revisor", veredicto: "sin_veredicto" }], ultimaEdicion: { revisor: 200 } });
    expect(filas[0].estado).toBe("dudoso");
    expect(bloqueantes(filas)).toHaveLength(0);
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
  it("PUNTA A PUNTA: juez lanzado, se edita el código, informa «pasa» → el cierre sigue pidiéndolo", () => {
    tocarPantalla();
    correr("registro.mjs", lanzamiento("revisor"));
    correr("registro.mjs", lanzamiento("qa"));
    const espera = Date.now() + 30;
    while (Date.now() < espera); // la edición ha de ser posterior al lanzamiento
    writeFileSync(join(repo, "src", "App.jsx"), "export default 2");
    for (const agente of ["revisor", "qa"]) correr("registro.mjs", { hook_event_name: "SubagentStop", agent_id: "agente-sintetico-1", agent_type: agente, last_assistant_message: "Veredicto: pasa" });
    const r = JSON.parse(correr("cierre.mjs", {}).stdout);
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/lanza el agente revisor/);
  });
  it("NIT: una entrada JSON «null» sale limpia (sin excepción) en registro y cierre", () => {
    for (const hook of ["registro.mjs", "cierre.mjs"]) {
      const r = spawnSync("node", [join(aqui, "hooks", hook)], { input: "null", encoding: "utf8", env: { ...process.env, FACTORIA_ALVARO_DIR: reg } });
      expect([hook, r.status, r.stderr]).toEqual([hook, 0, ""]);
      expect(r.stdout).toBe("");
    }
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
