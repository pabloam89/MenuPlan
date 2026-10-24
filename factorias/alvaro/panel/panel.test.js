// Tests del panel local de la factoría. Todo es SINTÉTICO: ninguna transcripción real, y un
// marcador secreto sembrado en el contenido de los mensajes que NUNCA debe salir por /datos.json.
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, mkdirSync, readFileSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { agregar, compararCopias, leerDeclarados, nombreCorto, normalizarComando, nuevoResumen, parsearRegistro, procesarLinea } from "./lib/leer.mjs";
import { crearRecolector, crearServidor } from "./servir.mjs";

const SERVIR = join(dirname(fileURLToPath(import.meta.url)), "servir.mjs");
const MARCADOR = "SECRETO-PANEL-7f3a9c";
const DIA = 864e5;
const AHORA = Date.parse("2026-10-24T10:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const L = (o) => JSON.stringify(o) + "\n";
const base = (extra = {}) => ({ sessionId: "ses-aaaa1111", cwd: "/zz/carpeta-zz", gitBranch: "ops/zz", isSidechain: false, ...extra });
const resumenDe = (...objs) => {
  const r = nuevoResumen();
  for (const o of objs) procesarLinea(r, typeof o === "string" ? o : JSON.stringify(o));
  return r;
};

let contador = 0;
const cierre = (extra) => ({ type: "system", subtype: "stop_hook_summary", uuid: "u-" + ++contador, timestamp: iso(AHORA - 1000), ...base(), ...extra });
const copiaOk = { ok: true, difieren: [], faltanInstalada: [], sobranInstalada: [] };
const entradaBase = (extra = {}) => ({ ahora: AHORA, dias: 7, ficheros: [], registros: [], declarados: [], copia: copiaOk, home: "/h", errores: [], ...extra });

describe("parseo de líneas de transcripción", () => {
  it("un resumen de cierre cuenta una activación por hook, con su duración", () => {
    const r = resumenDe(cierre({ hookCount: 2, hookInfos: [{ command: 'node "$HOME/.claude/factoria/hooks/cierre.mjs"', durationMs: 120 }, { command: "callback", durationMs: 5 }], hookErrors: ["motivo"], preventedContinuation: true }));
    expect([...r.hooks.values()].map((h) => [h.evento, h.ms])).toEqual([["Stop", 120], ["Stop", 5]]);
    expect([...r.cierres.values()][0]).toMatchObject({ errores: 1, impidio: true });
  });

  it("hook_success de otro evento cuenta; el de Stop no (ya está en el resumen: no se cuenta dos veces)", () => {
    const att = (hookEvent) => ({ type: "attachment", uuid: "a-" + hookEvent, timestamp: iso(AHORA), ...base(), attachment: { type: "hook_success", hookEvent, hookName: hookEvent, command: "node x.mjs", durationMs: 40 } });
    const r = resumenDe(att("PostToolUse"), att("Stop"));
    expect([...r.hooks.values()].map((h) => h.evento)).toEqual(["PostToolUse"]);
  });

  it("hook_blocking_error se guarda con su comando y su texto", () => {
    const r = resumenDe({ type: "attachment", uuid: "b1", timestamp: iso(AHORA), ...base(), attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: { command: "node cierre.mjs", blockingError: "falta qa" } } });
    expect([...r.bloqueos.values()]).toEqual([expect.objectContaining({ evento: "Stop", comando: "node cierre.mjs", texto: "falta qa" })]);
  });

  it("cost-state: gana el último de la sesión", () => {
    const c = (n) => ({ type: "cost-state", sessionId: "ses-aaaa1111", totalCostUSD: n, totalDuration: n * 1000, totalAPIDuration: n * 100, totalToolDuration: n * 10 });
    const r = resumenDe(c(1), c(3), c(2));
    expect(r.costes.get("ses-aaaa1111")).toMatchObject({ costeUSD: 2, totalMs: 2000, apiMs: 200, herramientasMs: 20 });
  });

  it("assistant: los tokens se cuentan una vez por message.id aunque la línea se repita, y se separa el subagente", () => {
    const a = (id, out, lado) => ({ type: "assistant", uuid: "x" + out, timestamp: iso(AHORA), ...base({ isSidechain: lado }), message: { id, model: "modelo-zz", usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 }, content: [] } });
    const r = resumenDe(a("m1", 3, false), a("m1", 9, false), a("m2", 4, true));
    expect(r.msgs.size).toBe(2);
    expect(r.msgs.get("m1")).toMatchObject({ entrada: 10, salida: 9, cacheLeida: 5, cacheCreada: 2, lado: false });
    expect(r.msgs.get("m2").lado).toBe(true);
  });

  it("tool_use Agent cuenta por tipo (también un tipo con nombre raro y los sin tipo); otras herramientas no", () => {
    const tu = (id, name, input) => ({ type: "tool_use", id, name, input });
    const r = resumenDe({ type: "assistant", uuid: "q", timestamp: iso(AHORA), ...base(), message: { id: "m", model: "m", usage: {}, content: [tu("t1", "Agent", { subagent_type: "revisor" }), tu("t2", "Agent", { subagent_type: "constructor" }), tu("t3", "Agent", {}), tu("t4", "Bash", { command: "ls" })] } });
    expect([...r.agentes.values()].map((a) => a.tipo)).toEqual(["revisor", "constructor", null]);
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: r }] }));
    expect(d.ineficiencias.subagentes).toEqual(expect.arrayContaining([{ tipo: "constructor", n: 1 }, { tipo: null, n: 1 }]));
  });

  it("una línea rota o que no es un objeto se salta y se cuenta; una vacía ni cuenta", () => {
    const r = resumenDe("{no es json", "[1,2]", "42", "", JSON.stringify({ type: "mode", ...base() }));
    expect(r.rotas).toBe(3);
    expect(r.lineas).toBe(1);
  });
});

describe("ventana de días, hooks declarados y vistos", () => {
  const hookEn = (ts, comando, ms = 10, extra = {}) => cierre({ timestamp: iso(ts), hookInfos: [{ command: comando, durationMs: ms }], hookErrors: [], ...extra });

  it("los eventos fuera de la ventana no cuentan, y la sesión antigua no sale en el estado", () => {
    const viejo = resumenDe(hookEn(AHORA - 9 * DIA, "node a.mjs"));
    const nuevo = resumenDe(hookEn(AHORA - DIA, "node a.mjs", 30, { sessionId: "ses-bbbb2222" }));
    const d = agregar(entradaBase({ ficheros: [{ ruta: "v", mtimeMs: AHORA, resumen: viejo }, { ruta: "n", mtimeMs: AHORA, resumen: nuevo }] }));
    expect(d.hooks).toHaveLength(1);
    expect(d.hooks[0]).toMatchObject({ evento: "Stop", nombre: "a.mjs", veces: 1, mediaMs: 30, maxMs: 30 });
    expect(d.estado.sesiones).toBe(1);
  });

  it("un evento repetido en dos ficheros (sesión reanudada) cuenta una vez", () => {
    const l = hookEn(AHORA - 1000, "node a.mjs");
    const d = agregar(entradaBase({ ficheros: [{ ruta: "1", mtimeMs: AHORA, resumen: resumenDe(l) }, { ruta: "2", mtimeMs: AHORA, resumen: resumenDe(l) }] }));
    expect(d.hooks[0].veces).toBe(1);
  });

  it("un hook declarado sin activaciones sale «no visto»; uno visto sin declarar, no", () => {
    const r = resumenDe(hookEn(AHORA, 'node "$HOME/.claude/factoria/hooks/cierre.mjs"'), hookEn(AHORA, 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/otro.mjs"'));
    const declarados = [
      { evento: "Stop", comando: 'node "$HOME/.claude/factoria/hooks/cierre.mjs"' },
      { evento: "PostToolUse", comando: 'node "$HOME/.claude/factoria/hooks/registro.mjs"' },
    ];
    const d = agregar(entradaBase({ declarados, ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: r }] }));
    const fila = (n) => d.hooks.find((h) => h.nombre === n);
    expect(fila("cierre.mjs")).toMatchObject({ declarado: true, veces: 1, noVisto: false });
    expect(fila("registro.mjs")).toMatchObject({ declarado: true, veces: 0, noVisto: true });
    expect(fila("otro.mjs")).toMatchObject({ declarado: false, veces: 1, noVisto: false });
  });

  it("normaliza $HOME, ${CLAUDE_PROJECT_DIR} y barras para comparar", () => {
    expect(normalizarComando('node "${HOME}/.claude/x.mjs"', "C:\\Users\\yo")).toBe(normalizarComando('node "C:/Users/yo/.claude/x.mjs"', "C:\\Users\\yo"));
    expect(normalizarComando("node $CLAUDE_PROJECT_DIR/a.mjs", "/h")).toBe(normalizarComando("node ${CLAUDE_PROJECT_DIR}/a.mjs", "/h"));
    expect(nombreCorto(normalizarComando('node "$HOME/.claude/factoria/hooks/cierre.mjs"', "/h"))).toBe("cierre.mjs");
    expect(nombreCorto("callback")).toMatch(/callback/);
  });

  it("leerDeclarados solo saca eventos y comandos, nunca otras claves", () => {
    const txt = JSON.stringify({ permissions: { allow: [MARCADOR] }, env: { K: MARCADOR }, hooks: { Stop: [{ hooks: [{ type: "command", command: "node c.mjs" }] }] } });
    const d = leerDeclarados(txt);
    expect(d).toEqual([{ evento: "Stop", comando: "node c.mjs" }]);
    expect(JSON.stringify(d)).not.toContain(MARCADOR);
    expect(() => leerDeclarados("{roto")).toThrow();
  });

  it("los bloqueos se atribuyen a su hook, con los 3 motivos más repetidos cortados a 80 caracteres", () => {
    const bl = (i, texto) => ({ type: "attachment", uuid: "b" + i, timestamp: iso(AHORA), ...base(), attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: { command: "node c.mjs", blockingError: texto } } });
    const largo = "A".repeat(80) + "RESTO-QUE-NO-SALE";
    const r = resumenDe(bl(1, largo), bl(2, largo), bl(3, "otro motivo"), bl(4, "tercero"), bl(5, "cuarto"));
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: r }] }));
    const f = d.ineficiencias.bloqueos[0];
    expect(f).toMatchObject({ nombre: "c.mjs", n: 5 });
    expect(f.motivos).toHaveLength(3);
    expect(f.motivos[0]).toEqual({ texto: "A".repeat(80), n: 2 });
    expect(JSON.stringify(d)).not.toContain("RESTO-QUE-NO-SALE");
  });
});

describe("la página", () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "panel.html"), "utf8");
  it("no usa recursos externos ni innerHTML, y su script es sintácticamente válido", () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(html).toMatch(/prefers-color-scheme: dark/);
    const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("copia instalada contra el repo", () => {
  const h = (s) => createHash("sha256").update(s).digest("hex");
  it("igual", () => expect(compararCopias({ "hooks/a.mjs": h("1") }, { "hooks/a.mjs": h("1") })).toMatchObject({ ok: true, difieren: [] }));
  it("distinto", () => expect(compararCopias({ "hooks/a.mjs": h("1") }, { "hooks/a.mjs": h("2") })).toMatchObject({ ok: false, difieren: ["hooks/a.mjs"] }));
  it("falta en la instalada, o sobra", () => {
    const c = compararCopias({ "hooks/a.mjs": h("1") }, { "hooks/a.mjs": h("1"), "lib/b.mjs": h("2") });
    expect(c).toMatchObject({ ok: false, faltanInstalada: ["lib/b.mjs"] });
    expect(compararCopias({ "x.mjs": h("1") }, {})).toMatchObject({ ok: false, sobranInstalada: ["x.mjs"] });
  });
});

describe("tiempos", () => {
  const ev = (s) => ({ type: "mode", timestamp: iso(AHORA - 1000), ...base({ sessionId: s }) });

  it("espera = total − API − herramientas, y puede salir negativa (se muestra tal cual)", () => {
    const r = resumenDe(ev("s1"), ev("s2"), { type: "cost-state", sessionId: "s1", totalCostUSD: 2, totalDuration: 10000, totalAPIDuration: 3000, totalToolDuration: 2000 }, { type: "cost-state", sessionId: "s2", totalCostUSD: 1, totalDuration: 1000, totalAPIDuration: 900, totalToolDuration: 500 });
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: r }] }));
    expect(d.tiempos.find((t) => t.sesion.startsWith("s1")).esperaMs).toBe(5000);
    expect(d.tiempos.find((t) => t.sesion.startsWith("s2")).esperaMs).toBe(-400);
  });

  it("una sesión sin cost-state da null, no 0", () => {
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(ev("s3")) }] }));
    expect(d.tiempos[0]).toMatchObject({ totalMs: null, apiMs: null, esperaMs: null, costeUSD: null });
  });

  it("solo salen las 15 últimas sesiones, la más reciente primero", () => {
    const lineas = Array.from({ length: 20 }, (_, i) => ({ type: "mode", timestamp: iso(AHORA - (20 - i) * 1000), ...base({ sessionId: "sesion-" + String(i).padStart(2, "0") }) }));
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(...lineas) }] }));
    expect(d.tiempos).toHaveLength(15);
    expect(d.tiempos[0].sesion).toMatch(/^sesion-1/);
    expect(d.estado.sesiones).toBe(20);
  });

  it("suma la duración de los hooks de cada sesión", () => {
    const r = resumenDe(cierre({ sessionId: "s4", hookInfos: [{ command: "a", durationMs: 100 }, { command: "b", durationMs: 50 }], hookErrors: [] }));
    expect(agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: r }] })).tiempos[0].hooksMs).toBe(150);
  });
});

describe("registro de jueces", () => {
  const e = (extra) => ({ ts: AHORA - 5000, sesion: "x", agente: "revisor", veredicto: "pasa", resumen: MARCADOR, ...extra });

  it("parsearRegistro salta y cuenta las líneas rotas", () => {
    expect(parsearRegistro(JSON.stringify(e()) + "\n{roto\n\n")).toMatchObject({ rotas: 1, entradas: [expect.any(Object)] });
  });

  it("juez relanzado: más de un informe distinto de «lanzado» en la misma rama", () => {
    const d = agregar(entradaBase({ registros: [{ rama: "ops_zz", rotas: 0, entradas: [e({ agent_id: "a1" }), e({ agent_id: "a2", veredicto: "no_pasa" }), e({ agente: "qa", agent_id: "a3" }), e({ agent_id: "a2", veredicto: "no_pasa" })] }] }));
    expect(d.ineficiencias.relanzados).toEqual([expect.objectContaining({ rama: "ops_zz", agente: "revisor", informes: 2 })]);
    // un agente que no es juez (el registro viejo apunta también a constructores) no cuenta
    const c = agregar(entradaBase({ registros: [{ rama: "r", rotas: 0, entradas: [e({ agente: "constructor", agent_id: "c1" }), e({ agente: "constructor", agent_id: "c2" })] }] }));
    expect(c.ineficiencias.relanzados).toEqual([]);
  });

  it("tiempo entre «lanzado» e informe con el mismo agent_id", () => {
    const d = agregar(entradaBase({ registros: [{ rama: "r", rotas: 0, entradas: [e({ ts: AHORA - 100000, agent_id: "a1", veredicto: "lanzado" }), e({ ts: AHORA - 40000, agent_id: "a1" })] }] }));
    expect(d.jueces.tiempos).toEqual([expect.objectContaining({ agente: "revisor", ms: 60000 })]);
  });

  it("apuntes sin agent_id o de agentes que no son jueces avisan de registro antiguo", () => {
    const d = agregar(entradaBase({ registros: [{ rama: "r", rotas: 0, entradas: [e({ agente: "constructor" }), e()] }] }));
    expect(d.estado.registroAntiguo).toMatchObject({ sinAgentId: 2, noJueces: 1, aviso: true });
  });

  it("el resumen del juez no sale en los datos", () => {
    const d = agregar(entradaBase({ registros: [{ rama: "r", rotas: 0, entradas: [e()] }] }));
    expect(JSON.stringify(d)).not.toContain(MARCADOR);
  });
});

// ---- Servidor y lectura de ficheros de verdad, sobre un «home» sintético ----
let dir;
let home;
let alvaro;
const escribir = (ruta, texto) => {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, texto);
};
const fSesion = () => join(home, ".claude", "projects", "p1", "ses-aaaa1111.jsonl");

function montar() {
  home = join(dir, "home");
  alvaro = join(dir, "repo", "factorias", "alvaro");
  escribir(join(alvaro, "hooks", "c.mjs"), "x = 1\n");
  escribir(join(alvaro, "lib", "r.mjs"), "x = 1\n");
  escribir(join(home, ".claude", "factoria", "hooks", "c.mjs"), "x = 1\n");
  escribir(join(home, ".claude", "factoria", "lib", "r.mjs"), "x = 1\n");
  escribir(join(home, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: [MARCADOR] }, hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "$HOME/.claude/factoria/hooks/c.mjs"' }] }] } }));
  const t = Date.now();
  const sesion = [
    { type: "user", uuid: "u1", timestamp: iso(t - 5000), ...base(), message: { role: "user", content: "hola " + MARCADOR } },
    { type: "assistant", uuid: "u2", timestamp: iso(t - 4000), ...base(), message: { id: "m1", model: "modelo-zz", usage: { input_tokens: 7, output_tokens: 3 }, content: [{ type: "text", text: MARCADOR }, { type: "thinking", thinking: MARCADOR }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "echo " + MARCADOR } }, { type: "tool_use", id: "t2", name: "Agent", input: { subagent_type: "revisor", prompt: MARCADOR } }] } },
    { type: "ai-title", aiTitle: MARCADOR, sessionId: "ses-aaaa1111" },
    { type: "attachment", uuid: "u3", timestamp: iso(t - 3000), ...base(), attachment: { type: "hook_success", hookEvent: "SessionStart", command: "node arranque.mjs", durationMs: 12, stdout: MARCADOR, content: MARCADOR } },
    { type: "attachment", uuid: "u4", timestamp: iso(t - 2000), ...base(), attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: { command: 'node "$HOME/.claude/factoria/hooks/c.mjs"', blockingError: "x".repeat(80) + MARCADOR } } },
    cierre({ hookInfos: [{ command: 'node "$HOME/.claude/factoria/hooks/c.mjs"', durationMs: 90 }], hookErrors: [MARCADOR], timestamp: iso(t - 1500) }),
    { type: "cost-state", sessionId: "ses-aaaa1111", totalCostUSD: 1.5, totalDuration: 9000, totalAPIDuration: 4000, totalToolDuration: 1000 },
  ];
  escribir(fSesion(), sesion.map(L).join("") + "{línea rota\n");
  escribir(join(home, ".claude", "factoria-alvaro", "ops_zz.jsonl"), L({ ts: t - 3000, sesion: "x", agente: "revisor", veredicto: "pasa", agent_id: "a1", resumen: MARCADOR }));
}

const pedir = (puerto, { metodo = "GET", ruta = "/datos.json", host } = {}) =>
  new Promise((ok, ko) => {
    const rq = request({ host: "127.0.0.1", port: puerto, method: metodo, path: ruta, headers: host ? { Host: host } : {} }, (res) => {
      let c = "";
      res.on("data", (d) => (c += d));
      res.on("end", () => ok({ estado: res.statusCode, cabeceras: res.headers, cuerpo: c }));
    });
    rq.on("error", ko);
    rq.end();
  });

describe("servidor y lectura real", () => {
  let srv;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "panel-"));
    montar();
  });
  afterEach(async () => {
    if (srv) await new Promise((r) => srv.close(r));
    srv = null;
    rmSync(dir, { recursive: true, force: true });
  });
  const arrancar = async (extra = {}) => {
    srv = crearServidor({ home, repoAlvaro: alvaro, dias: 7, ...extra });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    return srv.address().port;
  };

  it("lee las cifras y NO deja salir el contenido de los mensajes (marcador sembrado)", async () => {
    const p = await arrancar();
    const r = await pedir(p);
    expect(r.estado).toBe(200);
    const d = JSON.parse(r.cuerpo);
    expect(d.errores).toEqual([]);
    expect(d.estado).toMatchObject({ sesiones: 1, lineasRotas: 1, copia: { ok: true } });
    expect(d.tiempos[0]).toMatchObject({ totalMs: 9000, apiMs: 4000, herramientasMs: 1000, esperaMs: 4000, costeUSD: 1.5 });
    expect(d.ineficiencias.subagentes).toEqual([{ tipo: "revisor", n: 1 }]);
    expect(d.hooks.find((h) => h.nombre === "c.mjs")).toMatchObject({ veces: 1, bloqueos: 1, declarado: true });
    // El marcador solo habría podido colarse por el hookError o el blockingError, que se cortan a 80 caracteres.
    expect(r.cuerpo).not.toContain(MARCADOR);
    expect(r.cuerpo).not.toContain("hola");
  });

  it("el programa de verdad escucha solo en el bucle local (no en la red del PC) y sale con error si el puerto es inválido", async () => {
    const libre = await new Promise((ok) => {
      const t = createServer().listen(0, "127.0.0.1", () => {
        const p = t.address().port;
        t.close(() => ok(p));
      });
    });
    const env = { ...process.env, HOME: home, USERPROFILE: home, PANEL_PUERTO: String(libre) };
    const hijo = spawn(process.execPath, [SERVIR], { env, stdio: ["ignore", "pipe", "pipe"] });
    try {
      await new Promise((ok, ko) => {
        hijo.stdout.on("data", (d) => String(d).includes("http://127.0.0.1:" + libre) && ok());
        hijo.on("exit", (c) => ko(new Error("salió con " + c)));
        setTimeout(() => ko(new Error("no arrancó")), 8000);
      });
      expect((await pedir(libre)).estado).toBe(200);
      const externa = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);
      if (externa) {
        const codigo = await new Promise((ok) => {
          const c = connect({ host: externa.address, port: libre }, () => {
            c.destroy();
            ok("conectó");
          });
          c.on("error", (e) => ok(e.code));
        });
        expect(codigo).toBe("ECONNREFUSED");
      }
    } finally {
      hijo.removeAllListeners("exit");
      hijo.kill();
    }
    const malo = spawn(process.execPath, [SERVIR], { env: { ...env, PANEL_PUERTO: "70000" }, stdio: "ignore" });
    expect(await new Promise((ok) => malo.on("exit", ok))).toBe(1);
  });

  it("sirve la página en / y solo existen / y /datos.json", async () => {
    const p = await arrancar();
    const r = await pedir(p, { ruta: "/" });
    expect(r.estado).toBe(200);
    expect(r.cabeceras["content-type"]).toMatch(/text\/html/);
    expect(r.cuerpo).toMatch(/datos\.json/);
    expect((await pedir(p, { ruta: "/otra" })).estado).toBe(404);
  });

  it("escucha solo en 127.0.0.1 y solo acepta GET (POST, PUT y DELETE dan 405)", async () => {
    const p = await arrancar();
    expect(srv.address().address).toBe("127.0.0.1");
    for (const metodo of ["POST", "PUT", "DELETE"]) {
      const r = await pedir(p, { metodo });
      expect(r.estado).toBe(405);
      expect(r.cabeceras.allow).toBe("GET");
    }
  });

  it("rechaza un Host de fuera (defensa contra DNS rebinding)", async () => {
    const p = await arrancar();
    expect((await pedir(p, { host: "evil.example:" + p })).estado).toBe(403);
    expect((await pedir(p, { host: "localhost:" + p })).estado).toBe(200);
  });

  it("un fichero ilegible produce un error visible con su nombre y motivo, no un 0", async () => {
    const p = await arrancar({
      crearLector: (ruta, opc) => {
        if (ruta === fSesion()) throw Object.assign(new Error("EACCES: permiso denegado"), { code: "EACCES" });
        return createReadStream(ruta, opc);
      },
    });
    const d = JSON.parse((await pedir(p)).cuerpo);
    expect(d.errores).toEqual([expect.objectContaining({ fichero: expect.stringContaining("ses-aaaa1111.jsonl"), motivo: expect.stringContaining("EACCES") })]);
    expect(d.tiempos).toEqual([]);
  });

  it("settings.json roto o falta de la copia instalada se muestran como error y como bandera roja", async () => {
    escribir(join(home, ".claude", "settings.json"), "{roto");
    rmSync(join(home, ".claude", "factoria", "lib", "r.mjs"));
    const d = JSON.parse((await pedir(await arrancar())).cuerpo);
    expect(d.errores.some((e) => e.fichero.includes("settings.json"))).toBe(true);
    expect(d.estado.copia).toMatchObject({ ok: false, faltanInstalada: ["lib/r.mjs"] });
  });

  it("no relee lo que no cambió y solo lee lo nuevo de lo que creció", async () => {
    const lecturas = [];
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7, alLeer: (ruta, desde) => lecturas.push([ruta.split(/[\\/]/).pop(), desde]) });
    const d1 = await rec.recoger(Date.now());
    const n1 = lecturas.length;
    expect(n1).toBeGreaterThan(0);
    const d2 = await rec.recoger(Date.now());
    expect(lecturas.length).toBe(n1);
    expect(d2.estado.lineasRotas).toBe(d1.estado.lineasRotas);
    // crece: se lee desde donde se quedó y se suma, sin duplicar lo anterior
    appendFileSync(fSesion(), L({ type: "cost-state", sessionId: "ses-aaaa1111", totalCostUSD: 4, totalDuration: 20000, totalAPIDuration: 4000, totalToolDuration: 1000 }));
    const d3 = await rec.recoger(Date.now());
    const ultima = lecturas.at(-1);
    expect(ultima[0]).toBe("ses-aaaa1111.jsonl");
    expect(ultima[1]).toBeGreaterThan(0);
    expect(d3.tiempos[0].costeUSD).toBe(4);
    expect(d3.estado.lineasRotas).toBe(1);
  });

  it("solo mira ficheros modificados dentro de la ventana de días", async () => {
    const viejo = new Date(Date.now() - 30 * DIA);
    utimesSync(fSesion(), viejo, viejo);
    const d = JSON.parse((await pedir(await arrancar())).cuerpo);
    expect(d.estado.sesiones).toBe(0);
    expect(d.ficheros.total).toBe(0);
  });
});
