import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
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

// El veredicto es la ÚLTIMA línea no vacía del informe, estricta: «Veredicto», un separador y la respuesta.
// Una forma que no cumple no se interpreta: sale sin_veredicto y el cierre la bloquea (fallar en alto).
const CUERPO = "Revisé 12 ficheros. Sin bloqueantes en seguridad, 0 bloqueantes en RLS.\n\n";
// [forma, plantilla ({r} = la respuesta, {R} con mayúscula), ¿la lee la regla estricta?]
const FORMAS = [
  ["encabezado y respuesta en la línea de abajo", "## Veredicto\n{r}", false],
  ["encabezado y respuesta en negrita", "## Veredicto\n\n**{R}**", false],
  ["raya larga", "Veredicto — {r}", true],
  ["numerada", "1. Veredicto: {r}", false],
  ["Veredicto final", "**Veredicto final:** {r}", false],
  ["Mi veredicto", "Mi veredicto: {r}", false],
  ["Veredicto (revisor)", "Veredicto (revisor): {r}", false],
  ["Veredicto global", "**Veredicto global:** {r}", false],
  ["línea entera entre comillas invertidas", "`Veredicto: {r}`", true],
  ["emoji delante", "✅ Veredicto: {r}", true],
  ["emoji y negrita", "🔴 **Veredicto:** {r}", true],
  ["encabezado con emoji", "## ❌ Veredicto: {r}", true],
];
const informe = (plantilla, r) => CUERPO + plantilla.replaceAll("{r}", r).replaceAll("{R}", r[0].toUpperCase() + r.slice(1));

describe("veredicto del juez: última línea estricta", () => {
  it.each(FORMAS)("forma «%s»: lo que dice la regla, con «no pasa» y con «pasa»", (_f, plantilla, legible) => {
    expect(veredictoDe(informe(plantilla, "no pasa"))).toBe(legible ? "no_pasa" : "sin_veredicto");
    expect(veredictoDe(informe(plantilla, "pasa"))).toBe(legible ? "pasa" : "sin_veredicto");
  });

  it.each([
    // lo válido; el resto de la línea se ignora
    ["Veredicto: pasa", "pasa"],
    ["Veredicto: no pasa", "no_pasa"],
    ["Veredicto: no sé, falta el caso", "no_se"],
    ["Veredicto: no se", "no_se"],
    ["| Veredicto | no pasa |", "no_pasa"],
    ["- Veredicto: PASA ✅", "pasa"],
    ["Veredicto: no pasa (B1: no se guarda el estado)", "no_pasa"],
    ["Veredicto: no pasa. No sé si el caso X es realista, pero B1 rompe", "no_pasa"],
    ["Veredicto: pasa con reservas, pero B1 rompe", "pasa"],
    // la última línea manda, también sobre una anterior legible
    ["Veredicto: pasa con reservas\nVeredicto: ⚠️ no pasa", "no_pasa"],
    ["Veredicto: no pasa\nVeredicto: ver arriba", "sin_veredicto"],
    ["Veredicto: pasa\nY algo más después", "sin_veredicto"],
    ["Veredicto: pasa\n\n---\n```\n", "pasa"], // solo decoración detrás
    // «no se» sin tilde solo si es todo el valor
    ["Veredicto: no se guarda nada", "sin_veredicto"],
    // el encargo, con cualquier separador o puntuación, no es un veredicto
    ["Veredicto: pasa | no pasa | no sé", "sin_veredicto"],
    ["Veredicto: pasa / no pasa / no sé", "sin_veredicto"],
    ["Veredicto: pasa, no pasa o no sé", "sin_veredicto"],
    ["Veredicto: «pasa», «no pasa» o «no sé»", "sin_veredicto"],
    ["Veredicto: **pasa** | **no pasa** | **no sé** (elige una)", "sin_veredicto"],
    ["Termina con «Veredicto: pasa | no pasa | no sé» (elige una).", "sin_veredicto"],
    ["Veredicto: pasa | no pasa | no sé (elige una)\n\nVeredicto: no pasa, hay un bloqueante", "no_pasa"],
    // sin sinónimos ni respaldo por «bloqueantes»: lo que no es una respuesta no se interpreta
    ["Veredicto: aprobado con 3 nit", "sin_veredicto"],
    ["12 ficheros leídos, 0 bloqueantes", "sin_veredicto"],
    ["", "sin_veredicto"],
    [null, "sin_veredicto"],
    // CRLF
    ["Veredicto: no pasa\r\n\r\n  \r\n", "no_pasa"],
    ["B1 rompe\r\nVeredicto: no pasa", "no_pasa"],
  ])("%j → %s", (texto, esperado) => expect(veredictoDe(texto)).toBe(esperado));
});

// Lo que llega de verdad cuando el juez va en segundo plano: el aviso de lanzamiento, que repite el encargo
const lanzamiento = (agente) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Agent",
  tool_input: { subagent_type: agente },
  tool_response: { isAsync: true, status: "async_launched", agentId: "agente-sintetico-1", description: "juzgar", resolvedModel: "modelo-x", prompt: "Acaba con «Veredicto: pasa | no pasa | no sé» (elige una).", outputFile: "/tmp/sintetico/salida.output" },
});

describe("qué apunta cada evento (apunteDe)", () => {
  const lanzado = lanzamiento("revisor");
  it("un juez lanzado en segundo plano queda «lanzado», no «pasa»", () => {
    const a = apunteDe(lanzado);
    expect(a.agente).toBe("revisor");
    expect(a.veredicto).toBe("lanzado");
  });
  it.each([["solo status", { status: "async_launched", agentId: "a" }], ["solo isAsync", { isAsync: true, agentId: "a" }]])("el aviso de segundo plano se reconoce con %s", (_, tool_response) => {
    const a = apunteDe({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_input: { subagent_type: "revisor" }, tool_response: { ...tool_response, prompt: "Veredicto: pasa" } });
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

describe("evaluar: dos jueces del mismo tipo sobre la misma versión", () => {
  const ev = (entradas) => evaluar({ requeridos: { revisor: ["src/a.js"] }, entradas, ultimaEdicion: { revisor: 200 } })[0].estado;
  it("«no pasa» domina a un «pasa» posterior", () => {
    expect(ev([{ ts: 400, agente: "revisor", veredicto: "no_pasa", agent_id: "a1" }, { ts: 500, agente: "revisor", veredicto: "pasa", agent_id: "a2" }])).toBe("no_pasa");
  });
  it("y a uno anterior; sin «no pasa», manda el último", () => {
    expect(ev([{ ts: 300, agente: "revisor", veredicto: "pasa" }, { ts: 400, agente: "revisor", veredicto: "no_pasa" }])).toBe("no_pasa");
    expect(ev([{ ts: 300, agente: "revisor", veredicto: "no_se" }, { ts: 400, agente: "revisor", veredicto: "pasa" }])).toBe("ok");
  });
  it("un «no pasa» de ANTES de la última edición ya no cuenta", () => {
    expect(ev([{ ts: 100, agente: "revisor", veredicto: "no_pasa" }, { ts: 300, agente: "revisor", veredicto: "pasa" }])).toBe("ok");
  });
});

describe("evaluar: el momento del juicio es el del lanzamiento", () => {
  const e = (ts, veredicto, agent_id) => ({ ts, agente: "revisor", veredicto, ...(agent_id ? { agent_id } : {}) });
  const estado = (entradas, edicion) => evaluar({ requeridos: { revisor: ["src/a.js"] }, entradas, ultimaEdicion: { revisor: edicion } })[0].estado;
  it("BLOQUEANTE 2: lanzado a t=100, edición a t=200, informe «pasa» a t=300 con el mismo agent_id → falta", () => {
    expect(estado([e(100, "lanzado", "a1"), e(300, "pasa", "a1")], 200)).toBe("falta");
  });
  it("lanzado a t=100, informe a t=300, edición a t=50: vale", () => {
    expect(estado([e(100, "lanzado", "a1"), e(300, "pasa", "a1")], 50)).toBe("ok");
  });
  it("un lanzado de OTRO agent_id no cambia el momento del informe", () => {
    expect(estado([e(100, "lanzado", "a2"), e(300, "pasa", "a1")], 200)).toBe("ok");
  });
  it("sin agent_id se conserva el comportamiento: cuenta el instante del informe", () => {
    expect(estado([e(100, "lanzado"), e(300, "pasa")], 200)).toBe("ok");
  });
  it("un informe sin línea de veredicto tras el «lanzado» NO deja el estado en «lanzado»: es ilegible y bloquea", () => {
    const entradas = [e(300, "lanzado", "a1"), e(310, "sin_veredicto", "a1")];
    expect(estado(entradas, 200)).toBe("ilegible");
    expect(bloqueantes(evaluar({ requeridos: { revisor: ["src/a.js"] }, entradas, ultimaEdicion: { revisor: 200 } }))).toHaveLength(1);
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

  it("el arranque dice que está activa y pide el veredicto en la última línea", () => {
    const r = JSON.parse(correr("arranque.mjs", {}).stdout);
    expect(r.systemMessage).toMatch(/Factoría de Álvaro activa/);
    expect(r.hookSpecificOutput.additionalContext).toMatch(/ÚLTIMA línea del informe, solo una de las tres opciones/);
    expect(r.hookSpecificOutput.additionalContext).toMatch(/TODAS sus objeciones en una sola pasada/);
    expect(r.hookSpecificOutput.additionalContext).toMatch(/solo verifica esas objeciones/);
    expect(r.hookSpecificOutput.additionalContext).toMatch(/los sitios a tocar y qué mirará el juez/);
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

  // La clase entera: un informe cuyo último renglón no se lee bloquea, con o sin «lanzado» previo.
  // Repo temporal con un scripts/x.mjs sin juzgar.
  const informar = (texto, conLanzado) => {
    rmSync(reg, { recursive: true, force: true });
    mkdirSync(join(repo, "scripts"), { recursive: true });
    writeFileSync(join(repo, "scripts", "x.mjs"), "export default 1");
    if (conLanzado) correr("registro.mjs", lanzamiento("revisor"));
    correr("registro.mjs", conLanzado
      ? { hook_event_name: "SubagentStop", agent_id: "agente-sintetico-1", agent_type: "revisor", last_assistant_message: texto }
      : { tool_name: "Agent", tool_input: { subagent_type: "revisor" }, tool_response: { content: [{ type: "text", text: texto }] } });
    return JSON.parse(correr("cierre.mjs", {}).stdout);
  };
  const DICE_NO_PASA = /revisor dice que no pasa/;
  const ILEGIBLE = /el informe del juez no acaba en una línea Veredicto: pasa \| no pasa \| no sé: pídele que lo repita en la última línea/;
  it.each(FORMAS)("forma «%s»: con «no pasa» real bloquea siempre; con «pasa», solo si no se lee", (_f, plantilla, legible) => {
    for (const conLanzado of [false, true]) {
      const no = informar(informe(plantilla, "no pasa"), conLanzado);
      expect([conLanzado, no.decision, no.reason]).toEqual([conLanzado, "block", expect.stringMatching(legible ? DICE_NO_PASA : ILEGIBLE)]);
      const si = informar(informe(plantilla, "pasa"), conLanzado);
      expect([conLanzado, si.decision]).toEqual([conLanzado, legible ? undefined : "block"]);
      if (!legible) expect(si.reason).toMatch(ILEGIBLE);
    }
  });
  it.each([
    ["sin etiqueta y con «sin bloqueantes»", "Hecho. Todo en orden, sin bloqueantes."],
    ["con la etiqueta que no es la última línea", "Veredicto: pasa\nGracias."],
  ])("informe %s: bloquea con el mensaje del informe ilegible, nunca con el de «lanzado»", (_n, texto) => {
    for (const conLanzado of [false, true]) {
      const r = informar(texto, conLanzado);
      expect([conLanzado, r.decision]).toEqual([conLanzado, "block"]);
      expect(r.reason).toMatch(ILEGIBLE);
      expect(r.reason).not.toMatch(/lanzado, sin informe/);
    }
  });
  it("«no sé» sigue sin bloquear (decisión documentada)", () => {
    const r = informar("Veredicto: no sé, falta el caso", false);
    expect(r.decision).toBeUndefined();
    expect(r.systemMessage).toMatch(/no sé/);
  });
  it("un informe ilegible bloquea una vez; en el segundo intento (stop_hook_active) deja salir", () => {
    informar("Hecho.", false);
    const r = JSON.parse(correr("cierre.mjs", { stop_hook_active: true }).stdout);
    expect(r.decision).toBeUndefined();
    expect(r.systemMessage).toMatch(/segundo aviso/);
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

// 20 oct 2026: una sesión sin cambios se vio bloqueada por apuntes de OTRA sesión y por la plantilla del encargo.
describe("el cierre solo mira lo de ESTA sesión", () => {
  let repo;
  let reg;
  const correr = (hook, entrada, extra = {}) =>
    spawnSync("node", [join(aqui, "hooks", hook)], { input: JSON.stringify({ cwd: repo, ...entrada }), encoding: "utf8", env: { ...process.env, FACTORIA_ALVARO_DIR: reg, ...extra } });
  const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });
  const transcript = (lineas) => {
    const f = join(reg, "transcript.jsonl");
    writeFileSync(f, lineas.map((l) => JSON.stringify(l)).join("\n") + "\n");
    return f;
  };
  const conEdit = (ts) => [{ type: "user", timestamp: new Date(ts).toISOString() }, { type: "assistant", timestamp: new Date(ts).toISOString(), message: { content: [{ type: "tool_use", name: "Edit", input: {} }] } }];
  const sinEdit = (ts) => [{ type: "user", timestamp: new Date(ts).toISOString() }, { type: "assistant", timestamp: new Date(ts).toISOString(), message: { content: [{ type: "tool_use", name: "Bash", input: { command: "git status" } }] } }];

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
    mkdirSync(join(repo, "scripts"), { recursive: true });
    writeFileSync(join(repo, "scripts", "x.mjs"), "export default 1"); // cambio de una sesión anterior
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(reg, { recursive: true, force: true });
  });

  it("(a) un «no pasa» apuntado por OTRA sesión no cuenta en esta", () => {
    correr("registro.mjs", { session_id: "otra", tool_name: "Agent", tool_input: { subagent_type: "revisor" }, tool_response: { content: [{ type: "text", text: "Veredicto: no pasa" }] } });
    correr("registro.mjs", { session_id: "esta", tool_name: "Agent", tool_input: { subagent_type: "revisor" }, tool_response: { content: [{ type: "text", text: "Veredicto: pasa" }] } });
    const r = JSON.parse(correr("cierre.mjs", { session_id: "esta" }).stdout);
    expect(r.decision).toBeUndefined();
    expect(r.systemMessage).toMatch(/revisor +✅/);
  });
  it("(b) la plantilla del encargo no se apunta como veredicto (ni «no pasa» ni ilegible)", () => {
    expect(apunteDe({ hook_event_name: "SubagentStop", agent_type: "revisor", last_assistant_message: "Acaba con «Veredicto: pasa | no pasa | no sé» (elige una)." })).toBeNull();
    expect(apunteDe({ hook_event_name: "SubagentStop", agent_type: "revisor", last_assistant_message: "Veredicto: pasa | no pasa | no sé" })).toBeNull();
  });
  it("(c) una sesión que no editó nada ni cambió ficheros no exige jueces", () => {
    const t = transcript(sinEdit(Date.now() + 60_000)); // la sesión empezó después del último cambio
    expect(correr("cierre.mjs", { session_id: "esta", transcript_path: t }).stdout).toBe("");
  });
  it("(c) pero si la sesión usó Edit/Write, sí los exige", () => {
    const t = transcript(conEdit(Date.now() + 60_000));
    expect(JSON.parse(correr("cierre.mjs", { session_id: "esta", transcript_path: t }).stdout).decision).toBe("block");
  });
  it("(c) y si un fichero cambió durante la sesión (p. ej. por terminal), también", () => {
    const t = transcript(sinEdit(Date.now() - 60_000));
    expect(JSON.parse(correr("cierre.mjs", { session_id: "esta", transcript_path: t }).stdout).decision).toBe("block");
  });
  it("(d) tras un veredicto válido, solo vuelve a exigir si hay cambios después", () => {
    const t = transcript(conEdit(Date.now() - 60_000));
    correr("registro.mjs", { session_id: "esta", tool_name: "Agent", tool_input: { subagent_type: "revisor" }, tool_response: { content: [{ type: "text", text: "Veredicto: pasa" }] } });
    expect(JSON.parse(correr("cierre.mjs", { session_id: "esta", transcript_path: t }).stdout).decision).toBeUndefined();
    const espera = Date.now() + 30;
    while (Date.now() < espera);
    writeFileSync(join(repo, "scripts", "x.mjs"), "export default 2");
    expect(JSON.parse(correr("cierre.mjs", { session_id: "esta", transcript_path: t }).stdout).decision).toBe("block");
  });
  const enStaging = () => {
    git("add", ".");
    git("commit", "-qm", "staging");
    git("update-ref", "refs/remotes/origin/staging", "HEAD");
    const viejo = new Date(Date.now() - 3_600_000);
    utimesSync(join(repo, "scripts", "x.mjs"), viejo, viejo);
    const espera = Date.now() + 30;
    while (Date.now() < espera);
    const t = transcript(sinEdit(Date.now()));
    const espera2 = Date.now() + 30;
    while (Date.now() < espera2);
    return t;
  };
  it("(f) borrar por Bash un fichero durante la sesión cuenta como cambio y bloquea", () => {
    const t = enStaging();
    rmSync(join(repo, "scripts", "x.mjs"));
    expect(JSON.parse(correr("cierre.mjs", { session_id: "esta", transcript_path: t }).stdout).decision).toBe("block");
  });
  it("(f) renombrar por Bash (conserva el mtime) durante la sesión cuenta como cambio y bloquea", () => {
    const t = enStaging();
    renameSync(join(repo, "scripts", "x.mjs"), join(repo, "scripts", "y.mjs"));
    expect(JSON.parse(correr("cierre.mjs", { session_id: "esta", transcript_path: t }).stdout).decision).toBe("block");
  });
  it("(e) un veredicto ilegible se informa como «ilegible», nunca como «no pasa»", () => {
    correr("registro.mjs", { session_id: "esta", tool_name: "Agent", tool_input: { subagent_type: "revisor" }, tool_response: { content: [{ type: "text", text: "Hecho, sin bloqueantes." }] } });
    const r = JSON.parse(correr("cierre.mjs", { session_id: "esta" }).stdout);
    expect(r.reason).toMatch(/ilegible|no acaba en una línea Veredicto/);
    expect(r.reason).not.toMatch(/dice que no pasa/);
  });
});
