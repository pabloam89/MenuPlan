import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { construirIndice, escribirIndice } from "../../scripts/lib/buscarAntes.mjs";
import { procesar } from "./buscar-antes.mjs";

/**
 * El disparador de «esto ya está apuntado» (#384). Las señales son las REALES
 * del 9 oct 2026: la rama `ccr-…` en la carpeta principal (#348), el agente que
 * no carga, el rechazo de la guardia a un grep con la palabra pablo (#368) y la
 * guardia que toma 0093 por un issue (#376). Sobre un índice sintético, y el
 * hook de verdad por su entrada estándar.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK = join(AQUI, "buscar-antes.mjs");
const GUARDIA = join(AQUI, "guardia.mjs");

// El flag de Pablo, armado a trozos: la guardia lo niega hasta dentro de un fichero que lo cita (#368, #372).
const FLAG = ["-", "-", "pa", "blo"].join("");
const issue = (n, title, body, extra = {}) => ({ asociacion: "OWNER", number: n, title, state: "OPEN", body, labels: [{ name: "tipo:caso" }], asignados: [], marcas: [], prs: [], padre: null, hijos: [], ...extra });
const ISSUES = [
  issue(348, "[caso] La carpeta principal cambió de rama a mitad de sesión y los agentes dejaron de cargarse", "La rama `ccr-0df6959e-29yha0` en la carpeta principal; Agent type 'auditor-datos' not found.", { hijos: [{ number: 350, state: "OPEN", tipo: "encargo" }] }),
  issue(368, "[caso] La guardia bloquea acciones inofensivas por lo que dice el comando: grep con la palabra pablo", "El grep de la palabra pablo se negó por contener `" + FLAG + "` en el texto."),
  issue(376, "[caso] La guardia toma el numero de una migracion en el nombre de la rama por un issue y pide cerrarlo", "datos/0093-borrar se lee como el issue 93."),
  issue(100, "[encargo] Mercadona: emparejar precios por nombre", "mercadona.mjs falla con tildes."),
];
const INDICE = construirIndice(ISSUES);

const dirs = [];
const nuevoDir = () => {
  const d = mkdtempSync(join(tmpdir(), "buscar-hook-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const leer = () => ({ indice: INDICE, horas: 1, viejo: false });
const sinRama = () => ({ principal: false, rama: null });
const falla = (tool, error, command = "") => ({ tool_name: tool, tool_input: { command }, error, hook_event_name: "PostToolUseFailure", cwd: "/x" });

describe("procesar: las señales reales de hoy", () => {
  it("la rama ccr- en la carpeta principal trae #348 con su plan", () => {
    const r = procesar({ tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: "" }, cwd: "/p" }, { leer, rama: () => ({ principal: true, rama: "ccr-0df6959e-29yha0" }) });
    expect(r.textos).toHaveLength(1);
    expect(r.textos[0]).toMatch(/datos de GitHub .títulos escritos por personas/);
    expect(r.textos[0]).toMatch(/#348/);
    expect(r.textos[0]).toMatch(/pendientes #350/);
    expect(r.lineas).toEqual(["buscar-antes senal: rama-principal resultado: apuntado primero: #348"]);
  });

  it("«Agent type 'auditor-datos' not found» trae #348", () => {
    const r = procesar(falla("Agent", "Agent type 'auditor-datos' not found. Available agents: gobierno"), { leer, rama: sinRama });
    expect(r.textos[0]).toMatch(/#348/);
  });

  it("la guardia que niega un grep con la palabra pablo trae #368", () => {
    const r = procesar(falla("Bash", `[guardia] \`${FLAG}\` es solo de Pablo: borra algo con datos o cambia permisos (la orden era un grep pablo)`, "grep pablo x.mjs"), { leer, rama: sinRama });
    expect(r.textos[0]).toMatch(/#368/);
  });

  it("la guardia que toma 0093 por un issue trae #376", () => {
    const r = procesar(falla("Bash", "[guardia] La rama datos/0093-borrar lleva el número de un issue: cierra #93 con Closes", "gh pr create"), { leer, rama: sinRama });
    expect(r.textos[0]).toMatch(/#376/);
  });

  it("sin nada apuntado, una señal rara manda a buscar y a registrar; no lo da por misterio", () => {
    const r = procesar(falla("Agent", "Agent type 'inventado-xyz' not found"), { leer: () => ({ indice: construirIndice([ISSUES[3]]), horas: 1 }), rama: sinRama });
    expect(r.textos[0]).toMatch(/No hay nada apuntado/);
    expect(r.textos[0]).toMatch(/npm run buscar/);
    expect(r.textos[0]).toMatch(/npm run issues -- --nuevo/);
  });

  it("un test rojo o un error corriente sin nada apuntado se calla (es el trabajo de cada día)", () => {
    const vacio = () => ({ indice: construirIndice([ISSUES[3]]), horas: 1 });
    const r = procesar(falla("Bash", "Exit code 1\n FAIL  zzz.test.js > qqq\nAssertionError: wwww", "npm test"), { leer: vacio, rama: sinRama });
    expect(r.textos).toEqual([]);
    expect(r.lineas).toEqual(["buscar-antes senal: test-rojo resultado: nada-en-silencio"]);
  });

  it("no repite: una señal ya vista, ni un issue ya dicho", () => {
    const e = falla("Agent", "Agent type 'auditor-datos' not found");
    const primera = procesar(e, { leer, rama: sinRama });
    const vistas = new Set(primera.nuevas);
    expect(procesar(e, { vistas, leer, rama: sinRama }).textos).toEqual([]);
    // Otra señal que lleva al mismo #348: ya se le dijo.
    const otra = procesar(falla("Agent", "Agent type 'qa' not found"), { vistas, leer, rama: sinRama });
    expect(otra.textos).toEqual([]);
    expect(otra.lineas).toEqual(["buscar-antes senal: agente-no-existe resultado: repetido"]);
  });

  it("tampoco repite un «no hay nada apuntado» de la misma señal", () => {
    const vacio = () => ({ indice: construirIndice([ISSUES[3]]), horas: 1 });
    const e = falla("Agent", "Agent type 'inventado-xyz' not found");
    const primera = procesar(e, { leer: vacio, rama: sinRama });
    expect(primera.textos).toHaveLength(1);
    expect(procesar(e, { vistas: new Set(primera.nuevas), leer: vacio, rama: sinRama }).textos).toEqual([]);
  });

  it("sin índice, lo dice y da otra vía", () => {
    const r = procesar(falla("Agent", "Agent type 'x' not found"), { leer: () => ({ indice: null, motivo: "ausente" }), rama: sinRama });
    expect(r.textos[0]).toMatch(/no puedo buscar/);
    expect(r.textos[0]).toMatch(/--indexar/);
  });

  it("una llamada normal no dice nada", () => {
    expect(procesar({ tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: "a.txt" }, cwd: "/x" }, { leer, rama: sinRama }).textos).toEqual([]);
  });
});

describe("el hook de verdad", () => {
  const lanza = (entrada, dir, crudo = null) => spawnSync(process.execPath, [HOOK], {
    input: crudo ?? JSON.stringify(entrada), encoding: "utf8", timeout: 20000, env: { ...process.env, MENUPLAN_BUSCAR_DIR: dir },
  });
  const entrada = { session_id: "s1", ...falla("Agent", "Agent type 'auditor-datos' not found"), cwd: tmpdir() };

  it("pone el aviso en additionalContext, una sola vez por sesión, y deja una línea contable", () => {
    const dir = nuevoDir();
    escribirIndice(INDICE, join(dir, "indice.json"));
    const a = lanza(entrada, dir);
    expect(a.status).toBe(0);
    const out = JSON.parse(a.stdout).hookSpecificOutput;
    expect(out.hookEventName).toBe("PostToolUseFailure");
    expect(out.additionalContext).toMatch(/#348/);
    expect(lanza(entrada, dir).stdout).toBe("");
    expect(lanza({ ...entrada, session_id: "otra" }, dir).stdout).not.toBe("");
    expect(readFileSync(join(dir, "senales.log"), "utf8")).toMatch(/^buscar-antes senal: agente-no-existe resultado: apuntado primero: #348$/m);
  });

  it("falla abierto y con aviso: entrada rota o índice ilegible no paran nada", () => {
    const dir = nuevoDir();
    const rota = lanza(null, dir, "{no es json");
    expect(rota.status).toBe(0);
    expect(rota.stdout).toBe("");
    expect(rota.stderr).toMatch(/\[buscar-antes\]/);
    writeFileSync(join(dir, "indice.json"), "{roto");
    const sinIndice = lanza(entrada, dir);
    expect(sinIndice.status).toBe(0);
    expect(JSON.parse(sinIndice.stdout).hookSpecificOutput.additionalContext).toMatch(/no puedo buscar/);
  });

  it("es rápido con el índice presente (medido: ~100 ms; tope de la prueba 800 ms)", () => {
    const dir = nuevoDir();
    escribirIndice(INDICE, join(dir, "indice.json"));
    lanza(entrada, dir);
    const t0 = performance.now();
    lanza({ ...entrada, session_id: "tiempo" }, dir);
    expect(performance.now() - t0).toBeLessThan(800);
  });

  it("a una llamada normal no responde nada", () => {
    const dir = nuevoDir();
    const r = lanza({ session_id: "s", cwd: tmpdir(), tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: "ok" }, hook_event_name: "PostToolUse" }, dir);
    expect(r.stdout).toBe("");
    expect(existsSync(join(dir, "senales.log"))).toBe(false);
  });
});

describe("la guardia añade el «ya apuntado» a sus denegaciones (no llegan a PostToolUse)", () => {
  it("una denegación trae el issue parecido; sin índice, la denegación sale igual", () => {
    const dir = nuevoDir();
    const repo = nuevoDir();
    mkdirSync(join(repo, ".git"));
    const issues = [issue(401, "[caso] La guardia bloquea el push a main hecho por una sesión", "push a main negado por la guardia")];
    escribirIndice(construirIndice(issues), join(dir, "indice.json"));
    const orden = { session_id: "g1", cwd: repo, tool_name: "Bash", tool_input: { command: "git push origin main" } };
    const lanza = (d) => spawnSync(process.execPath, [GUARDIA], { input: JSON.stringify(orden), encoding: "utf8", timeout: 20000, env: { ...process.env, MENUPLAN_BUSCAR_DIR: d, CLAUDE_PROJECT_DIR: repo } });
    const con = JSON.parse(lanza(dir).stdout).hookSpecificOutput;
    expect(con.permissionDecision).toBe("deny");
    expect(con.permissionDecisionReason).toMatch(/^\[guardia\]/);
    expect(con.permissionDecisionReason).toMatch(/datos de GitHub.*#401/s);
    const sin = JSON.parse(lanza(nuevoDir()).stdout).hookSpecificOutput;
    expect(sin.permissionDecision).toBe("deny");
  });
});
