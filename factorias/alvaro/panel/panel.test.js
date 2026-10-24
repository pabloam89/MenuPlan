// Tests del panel local de la factoría. Todo es SINTÉTICO: ninguna transcripción real, y un
// marcador secreto sembrado en el contenido de los mensajes que NUNCA debe salir por /datos.json.
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FUENTES, agregar, compararCopias, leerDeclarados, nombreCorto, normalizarComando, nuevoResumen, parsearRegistro, procesarLinea } from "./lib/leer.mjs";
import { crearRecolector, crearServidor } from "./servir.mjs";

const SERVIR = join(dirname(fileURLToPath(import.meta.url)), "servir.mjs");
const MARCADOR = "SECRETO-PANEL-7f3a9c"; // contenido de mensajes: no puede salir nunca
const PERMITIDO = "PERMITIDO-PANEL-51d2e8"; // en cwd, rama, modelo y tipo de subagente: sale solo por esos campos, declarados en el README
const DIA = 864e5;
const AHORA = Date.parse("2026-10-24T10:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const L = (o) => JSON.stringify(o) + "\n";
const base = (extra = {}) => ({ sessionId: "ses-aaaa1111", cwd: "/zz/" + PERMITIDO, gitBranch: "ops/" + PERMITIDO, isSidechain: false, ...extra });
const resumenDe = (...objs) => {
  const r = nuevoResumen();
  for (const o of objs) procesarLinea(r, typeof o === "string" ? o : JSON.stringify(o));
  return r;
};

let contador = 0;
const cierre = (extra) => ({ type: "system", subtype: "stop_hook_summary", uuid: "u-" + ++contador, timestamp: iso(AHORA - 1000), ...base(), ...extra });
const ev = (s, ms = 1000) => ({ type: "mode", timestamp: iso(AHORA - ms), ...base({ sessionId: s }) });
const asist = (s, n = 1) => Array.from({ length: n }, (_, i) => ({ type: "assistant", uuid: s + i + Math.random(), timestamp: iso(AHORA - 1000), ...base({ sessionId: s }), message: { id: s + Math.random(), model: "m", usage: {}, content: [] } }));
const foto = (s, c, extra = {}) => ({ type: "cost-state", sessionId: s, totalCostUSD: c, totalDuration: 10000, totalAPIDuration: 3000, totalToolDuration: 2000, ...extra });
const e = (extra) => ({ ts: AHORA - 5000, sesion: "x", agente: "revisor", veredicto: "pasa", resumen: MARCADOR, ...extra });
const copiaOk = { ok: true, difieren: [], faltanInstalada: [], sobranInstalada: [] };
const entradaBase = (extra = {}) => ({ ahora: AHORA, dias: 7, ficheros: [], registros: [], declarados: [], copia: copiaOk, home: "/h", errores: [], ...extra });

describe("parseo de líneas de transcripción", () => {
  it("un resumen de cierre cuenta una activación por hook, con su duración", () => {
    const r = resumenDe(cierre({ hookInfos: [{ command: 'node "$HOME/.claude/factoria/hooks/cierre.mjs"', durationMs: 120 }, { command: "callback", durationMs: 5 }] }));
    expect([...r.hooks.values()].map((h) => [h.evento, h.ms])).toEqual([["Stop", 120], ["Stop", 5]]);
  });

  it("hook_success de otro evento cuenta; el de Stop no (ya está en el resumen: no se cuenta dos veces)", () => {
    const att = (hookEvent) => ({ type: "attachment", uuid: "a-" + hookEvent, timestamp: iso(AHORA), ...base(), attachment: { type: "hook_success", hookEvent, hookName: hookEvent, command: "node x.mjs", durationMs: 40 } });
    const r = resumenDe(att("PostToolUse"), att("Stop"));
    expect([...r.hooks.values()].map((h) => h.evento)).toEqual(["PostToolUse"]);
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

  it("el modelo y el tipo de subagente salen recortados a 40 caracteres admitidos; los modelos sintéticos no salen", () => {
    const largo = '<img src=x onerror="1">' + "m".repeat(60);
    const a = (id, model, tipo) => ({ type: "assistant", uuid: id, timestamp: iso(AHORA), ...base(), message: { id, model, usage: { output_tokens: 1 }, content: [{ type: "tool_use", id: "t" + id, name: "Agent", input: { subagent_type: tipo } }, { type: "tool_use", id: "x" + id, name: "Bash", input: { subagent_type: "no-cuenta" } }] } });
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(a("1", largo, largo), a("2", "<synthetic>", "revisor"), a("3", "m", "constructor"), a("4", "m", undefined)) }] }));
    const modelos = d.ineficiencias.tokens.map((t) => t.modelo);
    expect(modelos).toHaveLength(2); // el sintético no sale
    expect(modelos.every((m) => /^[\w.:-]{1,40}$/.test(m))).toBe(true);
    // «constructor» no rompe la cuenta, el sin tipo es null y solo cuenta la herramienta Agent
    expect(d.ineficiencias.subagentes).toEqual(expect.arrayContaining([{ tipo: "constructor", n: 1 }, { tipo: "revisor", n: 1 }, { tipo: null, n: 1 }]));
    expect(d.ineficiencias.subagentes.every((t) => t.tipo === null || /^[\w.:-]{1,40}$/.test(t.tipo))).toBe(true);
  });

  it("una línea rota o que no es un objeto se salta y se cuenta; una vacía ni cuenta", () => {
    const r = resumenDe("{no es json", "[1,2]", "42", "", JSON.stringify({ type: "mode", ...base() }));
    expect(r.rotas).toBe(3);
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

  it("un hook declarado sin activaciones sale «sin huella»; en rojo solo si es de Stop (los demás eventos casi no dejan huella)", () => {
    const r = resumenDe(hookEn(AHORA, 'node "$HOME/.claude/factoria/hooks/cierre.mjs"'), hookEn(AHORA, 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/otro.mjs"'));
    const declarados = [
      { evento: "Stop", comando: 'node "$HOME/.claude/factoria/hooks/cierre.mjs"' },
      { evento: "PostToolUse", comando: 'node "$HOME/.claude/factoria/hooks/registro.mjs"' },
      { evento: "Stop", comando: 'node "$HOME/.claude/factoria/hooks/mudo.mjs"' },
    ];
    const d = agregar(entradaBase({ declarados, ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: r }] }));
    const fila = (n) => d.hooks.find((h) => h.nombre === n);
    expect(fila("cierre.mjs")).toMatchObject({ declarado: true, veces: 1, sinHuella: false, rojo: false });
    expect(fila("registro.mjs")).toMatchObject({ declarado: true, veces: 0, sinHuella: true, rojo: false });
    expect(fila("mudo.mjs")).toMatchObject({ declarado: true, veces: 0, sinHuella: true, rojo: true });
    expect(fila("otro.mjs")).toMatchObject({ declarado: false, veces: 1, sinHuella: false, rojo: false });
  });

  it("normaliza $HOME, ${CLAUDE_PROJECT_DIR} y barras para comparar", () => {
    expect(normalizarComando('node "${HOME}/.claude/x.mjs"', "C:\\Users\\yo")).toBe(normalizarComando('node "C:/Users/yo/.claude/x.mjs"', "C:\\Users\\yo"));
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

// Navegador simulado: lo justo para ejecutar el script de la página y mirar lo que pinta.
class Nodo {
  constructor(tag) {
    Object.assign(this, { tag, hijos: [], className: "", dataset: {}, scrollLeft: 0, reemplazos: 0, classList: { add() {}, remove() {} } });
  }
  append(...xs) { this.hijos.push(...xs.map((x) => (x instanceof Nodo ? x : String(x)))); }
  replaceChildren(...xs) { this.reemplazos++; this.hijos = []; this.append(...xs); }
  set textContent(v) { this.hijos = [String(v)]; }
  contains() { return true; }
  focus() {}
  todos(f) { return this.hijos.flatMap((h) => (h instanceof Nodo ? [...(f(h) ? [h] : []), ...h.todos(f)] : [])); }
  querySelectorAll(sel) { return this.todos((h) => (sel === ".tabla" ? h.className === "tabla" : h.dataset.ts !== undefined)); }
  get texto() { return this.hijos.map((h) => (h instanceof Nodo ? h.texto : h)).join(" "); }
}
function navegador(datos) {
  const app = new Nodo("div");
  const aviso = new Nodo("div");
  const pend = [];
  const est = { datos, seleccion: false, tics: [] };
  const win = { scrollY: 0, scrollTo() {}, getSelection: () => ({ isCollapsed: !est.seleccion, anchorNode: {} }) };
  const doc = { getElementById: (id) => (id === "app" ? app : aviso), createElement: (t) => new Nodo(t), hidden: false, addEventListener() {}, querySelectorAll: (s) => app.querySelectorAll(s) };
  const fetchFalso = async () => {
    if (est.cae) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200, json: async () => est.datos };
  };
  const script = /<script>([\s\S]*)<\/script>/.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "panel.html"), "utf8"))[1];
  new Function("document", "window", "fetch", "setTimeout", "setInterval", "AbortSignal", script)(doc, win, fetchFalso, (f) => pend.push(f), (f) => est.tics.push(f), AbortSignal);
  const pausa = () => new Promise((r) => setImmediate(r));
  const ciclo = async (cambia = {}) => { Object.assign(est.datos, cambia); (pend.shift() ?? (() => {}))(); await pausa(); await pausa(); };
  return { app, aviso, est, ciclo, listo: pausa().then(pausa) };
}
// Entrada a propósito rica: un hook de Stop declarado sin huella, otro de PostToolUse, sesiones con foto de coste y sin ella,
// jueces relanzados, un subagente y bloqueos. Con errores de lectura (uno por fuente) sirve para todas las pruebas.
const entradaRica = (errores = []) =>
  entradaBase({
    errores,
    declarados: [{ evento: "Stop", comando: "node c.mjs" }, { evento: "Stop", comando: "node mudo.mjs" }, { evento: "PostToolUse", comando: "node registro.mjs" }],
    registros: [{ rama: "r", rotas: 0, entradas: [e({ agent_id: "a1", veredicto: "lanzado", ts: AHORA - 9000 }), e({ agent_id: "a1" }), e({ agent_id: "a2" })] }],
    ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(...asist("sp"), foto("sp", 3), ...asist("sq"), ev("sh"), ev("sh", 3 * 3600e3), foto("sh", 1, { totalDuration: 7320000 }), cierre({ hookInfos: [{ command: "node c.mjs", durationMs: 7 }] }), { type: "attachment", uuid: "bq", timestamp: iso(AHORA), ...base(), attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: { command: "node c.mjs", blockingError: "falta qa" } } }, { type: "assistant", uuid: "ag", timestamp: iso(AHORA), ...base(), message: { id: "mag", model: "m", usage: { output_tokens: 1 }, content: [{ type: "tool_use", id: "tag", name: "Agent", input: { subagent_type: "revisor" } }] } }) }],
  });
const datosPagina = (errores = []) => ({ generado: iso(AHORA), dias: 7, lecturaMs: 5, proceso: { rssMB: 80, heapMB: 20 }, ...agregar(entradaRica(errores)) });
const falla = (...fuentes) => fuentes.map((fuente) => ({ fuente, fichero: "x", motivo: "EACCES" }));

// ---- LA PRUEBA QUE CIERRA LA CLASE «un cero que no es cero»: de qué fuente depende cada hoja del JSON ----
// Las propias del panel van con []. Una hoja sin clasificar hace fallar el test: un campo nuevo obliga a decidir (y a enmascarar).
const DEP = [
  [/^\.(generado|dias|lecturaMs)$|^\.proceso\.|^\.errores/, []],
  [/^\.hooks\[\]\.(declarado|sinHuella|rojo)$/, ["settings", "transcripciones"]],
  [/^\.(ficheros|hooks|tiempos)|^\.estado\.(ultimoEvento|sesiones|lineasRotas)$|^\.ineficiencias\.(bloqueos|costes|tokens|subagentes|mensajesSubagente)/, ["transcripciones"]],
  [/^\.estado\.copia/, ["copia"]],
  [/^\.(estado\.registroAntiguo|jueces|ineficiencias\.relanzados)/, ["registro"]],
];
const hojas = (v, p = "") => (v === null || typeof v !== "object" || !Object.keys(v).length ? [[p, v]] : Object.entries(v).flatMap(([k, x]) => hojas(x, p + (Array.isArray(v) ? "[]" : "." + k))));
const deDe = (p) => {
  const fila = DEP.find(([re]) => re.test(p));
  if (!fila) throw new Error("hoja sin clasificar en DEP: " + p);
  return fila[1];
};
const ESCENARIOS = [...FUENTES.map((f) => [[f]]), [FUENTES]]; // cada fuente por separado y todas a la vez
const comprobar = (datos, caidas) => {
  for (const [p, v] of hojas(datos)) if (deDe(p).some((f) => caidas.includes(f))) expect([p, v]).toEqual([p, null]);
  if (!caidas.includes("settings") && !caidas.includes("transcripciones")) expect(datos.hooks.some((h) => h.rojo === true)).toBe(true);
  if (caidas.length === 1 && caidas[0] === "settings") expect([datos.tiempos, datos.ineficiencias.costes]).not.toContain(null); // un fallo de settings no mata costes ni tiempos
};

describe("errores por fuente: lo derivado de una fuente caída sale null (en los datos, no en la página)", () => {
  const sano = agregar(entradaRica());
  it("el fixture es rico y toda hoja está clasificada", () => {
    comprobar(sano, []);
    const h = sano.hooks;
    expect([h.some((x) => x.rojo === true), h.some((x) => x.sinHuella === true && x.rojo === false), sano.tiempos.some((t) => t.costeUSD === null), sano.tiempos.some((t) => t.costeUSD !== null), sano.ineficiencias.relanzados.length > 0, sano.ineficiencias.subagentes.length > 0, sano.ineficiencias.bloqueos.length > 0, sano.jueces.tiempos.length > 0, sano.estado.copia.ok === true, sano.estado.registroAntiguo.apuntes > 0]).toEqual(Array(10).fill(true));
  });
  it.each(ESCENARIOS)("función pura, fuentes caídas %j", (caidas) => comprobar(agregar(entradaRica(falla(...caidas))), caidas));
});

describe("la página", () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "panel.html"), "utf8");
  const cifras = (app) => app.todos((h) => h.tag === "b" || (h.tag === "td" && h.className.split(" ").includes("n"))).map((h) => h.texto.trim());

  it("la página solo pinta lo que le dan: con todas las fuentes caídas todo sale «sin dato» (también las frases) y las tablas lo dicen", async () => {
    const n = navegador(datosPagina(falla(...FUENTES)));
    await n.listo;
    expect(new Set(cifras(n.app))).toEqual(new Set(["sin dato"]));
    const frases = n.app.todos((h) => h.tag === "p").map((h) => h.texto).filter((t) => /Bloqueos con hook|Coste mínimo|sidechain/.test(t));
    expect(frases).toHaveLength(3);
    for (const f of frases) expect(f).toContain("sin dato");
    expect(n.app.texto).toContain("No se pudo leer (ver franja roja)");
    expect(n.app.texto).not.toContain("Sin datos en esta ventana");
  });

  it("con settings ilegible la Nota de los hooks no afirma nada falso, y los tiempos siguen", async () => {
    const n = navegador(datosPagina(falla("settings")));
    await n.listo;
    const celdas = n.app.todos((h) => h.tag === "td").map((h) => h.texto);
    expect(celdas.filter((t) => /Stop debería|no está en|sin huella/.test(t))).toEqual([]); // la Nota de ningún hook afirma nada
    expect(celdas).toContain("sin dato");
    expect(cifras(n.app)).toContain("2 h 2 min");
  });

  it("si el servidor cae, la franja lo dice en castellano y los datos viejos se quedan", async () => {
    const n = navegador(datosPagina());
    await n.listo;
    n.est.cae = true;
    await n.ciclo();
    expect(n.aviso.texto).toMatch(/No llega al panel local.*el navegador no pudo conectar/);
    expect(n.aviso.texto).not.toContain("Failed to fetch");
    expect(n.app.texto).toContain("2 h 2 min");
  });

  it("sin errores salen las cifras (las horas como «2 h 2 min») y no se repinta si no cambió nada", async () => {
    const n = navegador(datosPagina());
    await n.listo;
    expect(cifras(n.app)).toContain("2 h 2 min");
    expect(n.app.texto).not.toContain("sin dato (");
    await n.ciclo({ lecturaMs: 9, generado: iso(AHORA + 5000) }); // solo cambia lo volátil
    expect(n.app.reemplazos).toBe(1);
    await n.ciclo({ estado: { ...n.est.datos.estado, sesiones: 99 } });
    expect(n.app.reemplazos).toBe(2);
    n.est.tics[0](); // el contador «hace N s» sigue corriendo
    expect(n.app.querySelectorAll("[data-ts]")[0].texto).toMatch(/^hace \d+ (s|min|h|días)$/);
  });

  it("con texto seleccionado espera, pero tras 6 ciclos repinta igualmente", async () => {
    const n = navegador(datosPagina());
    await n.listo;
    n.est.seleccion = true;
    for (let i = 1; i <= 5; i++) await n.ciclo({ estado: { ...n.est.datos.estado, sesiones: 50 + i } });
    expect(n.app.reemplazos).toBe(1);
    await n.ciclo({ estado: { ...n.est.datos.estado, sesiones: 60 } });
    expect(n.app.reemplazos).toBe(2);
  });

  it("no usa recursos externos ni HTML en crudo, y respeta el tema oscuro", () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(html).toMatch(/prefers-color-scheme: dark/);
  });
});

describe("copia instalada contra el repo", () => {
  const h = (s) => createHash("sha256").update(s).digest("hex");
  it("igual, distinto, falta en la instalada o sobra", () => {
    const a = { "hooks/a.mjs": h("1") };
    expect(compararCopias(a, a)).toMatchObject({ ok: true, difieren: [] });
    expect(compararCopias(a, { "hooks/a.mjs": h("2") })).toMatchObject({ ok: false, difieren: ["hooks/a.mjs"] });
    expect(compararCopias(a, { ...a, "lib/b.mjs": h("2") })).toMatchObject({ ok: false, faltanInstalada: ["lib/b.mjs"] });
    expect(compararCopias({ "x.mjs": h("1") }, {})).toMatchObject({ ok: false, sobranInstalada: ["x.mjs"] });
  });
});

describe("tiempos", () => {
  it("una sesión sin cost-state da null, no 0", () => {
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(ev("s3")) }] }));
    expect(d.tiempos[0]).toMatchObject({ totalMs: null, apiMs: null, costeUSD: null, hooksMs: null });
  });

  it("coste 0 con mensajes es «sin dato», nunca $0; y se marca la sesión con mensajes posteriores a su foto", () => {
    const r = resumenDe(...asist("s5"), foto("s5", 0), ev("s6"), foto("s6", 0), ...asist("s7"), foto("s7", 1), ...asist("s7", 2), ...asist("s8"), foto("s8", 1));
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: r }] }));
    const t = (x) => d.tiempos.find((f) => f.sesion === x);
    expect(t("s5")).toMatchObject({ costeUSD: null, totalMs: null });
    expect(t("s6").costeUSD).toBe(0); // sin mensajes del asistente no hay contradicción: se deja
    expect([t("s7").fotoAtrasada, t("s8").fotoAtrasada]).toEqual([true, false]);
    expect(d.ineficiencias.costes.sesiones.map((c) => [c.sesion, c.fotoAtrasada]).filter(([x]) => x === "s7" || x === "s5")).toEqual([["s7", true]]);
  });

  const dosFicheros = (a, b) => [{ ruta: "1", mtimeMs: AHORA - 1000, resumen: resumenDe(...a) }, { ruta: "2", mtimeMs: AHORA, resumen: resumenDe(...b) }];

  it("la foto atrasada también cuenta los mensajes de otros ficheros de la misma sesión", () => {
    const d = agregar(entradaBase({ ficheros: dosFicheros([...asist("sc"), foto("sc", 5)], asist("sc", 100)) }));
    expect(d.tiempos[0]).toMatchObject({ costeUSD: 5, fotoAtrasada: true });
  });

  it("entre varios ficheros de una sesión manda el mayor coste, no el del fichero más reciente", () => {
    const d = agregar(entradaBase({ ficheros: dosFicheros([...asist("sd"), foto("sd", 5)], [...asist("sd"), foto("sd", 1)]) }));
    expect(d.tiempos[0].costeUSD).toBe(5);
  });

  it("una foto más larga que la vida observada anula SOLO el total («total no fiable»); coste, API y herramientas se quedan", () => {
    const d = agregar(entradaBase({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(ev("se"), ev("se", 328000), foto("se", 9, { totalDuration: 3 * 3600e3 }), ev("sf"), ev("sf", 328000), foto("sf", 2, { totalDuration: 400000 })) }] }));
    expect(d.tiempos.find((t) => t.sesion === "se")).toMatchObject({ costeUSD: 9, totalMs: null, apiMs: 3000, herramientasMs: 2000, noCuadra: true });
    expect(d.tiempos.find((t) => t.sesion === "sf")).toMatchObject({ costeUSD: 2, totalMs: 400000, noCuadra: false });
    expect(d.ineficiencias.costes.sesiones.map((c) => c.sesion)).toEqual(["se", "sf"]);
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
  for (const b of [alvaro, join(home, ".claude", "factoria")]) for (const f of ["hooks/c.mjs", "lib/r.mjs"]) escribir(join(b, f), "x = 1\n");
  escribir(join(home, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: [MARCADOR] }, hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "$HOME/.claude/factoria/hooks/c.mjs"' }, { type: "command", command: 'node "$HOME/.claude/factoria/hooks/mudo.mjs"' }] }], PostToolUse: [{ hooks: [{ type: "command", command: 'node "$HOME/.claude/factoria/hooks/registro.mjs"' }] }] } }));
  const t = Date.now();
  const sesion = [
    { type: "user", uuid: "u1", timestamp: iso(t - 5000), ...base(), message: { role: "user", content: "hola " + MARCADOR } },
    { type: "assistant", uuid: "u2", timestamp: iso(t - 4000), ...base(), message: { id: "m1", model: PERMITIDO, usage: { input_tokens: 7, output_tokens: 3 }, content: [{ type: "text", text: MARCADOR }, { type: "thinking", thinking: MARCADOR }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "echo " + MARCADOR } }, { type: "tool_use", id: "t2", name: "Agent", input: { subagent_type: PERMITIDO, prompt: MARCADOR } }] } },
    { type: "ai-title", aiTitle: MARCADOR, sessionId: "ses-aaaa1111" },
    { type: "attachment", uuid: "u3", timestamp: iso(t - 3000), ...base(), attachment: { type: "hook_success", hookEvent: "SessionStart", command: "node arranque.mjs", durationMs: 12, stdout: MARCADOR, content: MARCADOR } },
    { type: "attachment", uuid: "u4", timestamp: iso(t - 2000), ...base(), attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: { command: 'node "$HOME/.claude/factoria/hooks/c.mjs"', blockingError: "x".repeat(80) + MARCADOR } } },
    cierre({ hookInfos: [{ command: 'node "$HOME/.claude/factoria/hooks/c.mjs"', durationMs: 90 }], hookErrors: [MARCADOR], timestamp: iso(t - 1500) }),
    { type: "cost-state", sessionId: "ses-aaaa1111", totalCostUSD: 1.5, totalDuration: 9000, totalAPIDuration: 4000, totalToolDuration: 1000 },
  ];
  escribir(fSesion(), sesion.map(L).join("") + "{línea rota\n");
  escribir(join(home, ".claude", "projects", "p1", "ses-bbbb2222.jsonl"), L({ type: "assistant", uuid: "b1", timestamp: iso(t - 60000), ...base({ sessionId: "ses-bbbb2222" }), message: { id: "mb", model: "m", usage: {}, content: [] } })); // sin foto de coste
  escribir(join(home, ".claude", "factoria-alvaro", "ops_zz.jsonl"), [e({ ts: t - 3500, agent_id: "a1", veredicto: "lanzado" }), e({ ts: t - 3000, agent_id: "a1" }), e({ ts: t - 2500, agent_id: "a2" })].map(L).join(""));
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
    for (const h of hijos.splice(0)) h.kill();
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
    expect(d.estado).toMatchObject({ sesiones: 2, lineasRotas: 1, copia: { ok: true } });
    expect(d.tiempos[0]).toMatchObject({ totalMs: 9000, apiMs: 4000, herramientasMs: 1000, costeUSD: 1.5 });
    expect(d.ineficiencias.subagentes).toEqual([{ tipo: PERMITIDO, n: 1 }]);
    expect(d.hooks.find((h) => h.nombre === "c.mjs")).toMatchObject({ veces: 1, bloqueos: 1, declarado: true });
    // El marcador solo habría podido colarse por el hookError o el blockingError, que se cortan a 80 caracteres.
    expect(r.cuerpo).not.toContain(MARCADOR);
    expect(r.cuerpo).not.toContain("hola");
    // el otro marcador sale, pero solo por los campos permitidos y declarados
    const rutas = (v, p = "") => (typeof v === "string" ? (v.includes(PERMITIDO) ? [p] : []) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => rutas(x, p + (/^\d+$/.test(k) ? "[]" : "." + k))) : []);
    expect([...new Set(rutas(d))].sort()).toEqual([".ineficiencias.costes.sesiones[].carpeta", ".ineficiencias.costes.sesiones[].rama", ".ineficiencias.subagentes[].tipo", ".ineficiencias.tokens[].modelo", ".tiempos[].carpeta", ".tiempos[].rama"]);
  });


  it("el texto de un error de lectura no repite el código (ENOENT: ENOENT: …)", async () => {
    rmSync(join(home, ".claude", "projects"), { recursive: true });
    const d = JSON.parse((await pedir(await arrancar())).cuerpo);
    expect(d.errores).toHaveLength(1);
    expect(d.errores[0].motivo).toMatch(/^ENOENT: /);
    expect(d.errores[0].motivo).not.toMatch(/ENOENT: ENOENT/);
  });

  const hijos = [];
  const lanzar = async (extra = {}) => {
    const puerto = await new Promise((ok) => {
      const t = createServer().listen(0, "127.0.0.1", () => {
        const p = t.address().port;
        t.close(() => ok(p));
      });
    });
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.PANEL_DIAS;
    Object.assign(env, { PANEL_PUERTO: String(puerto) }, extra);
    const hijo = spawn(process.execPath, [SERVIR], { env, stdio: ["ignore", "pipe", "ignore"] });
    hijos.push(hijo);
    const salida = new Promise((ok) => hijo.on("exit", ok));
    const esperar = () =>
      new Promise((ok, ko) => {
        hijo.stdout.on("data", (d) => String(d).includes(":" + puerto) && ok());
        salida.then((c) => ko(new Error("salió con " + c)));
        setTimeout(() => ko(new Error("no arrancó")), 8000);
      });
    return { puerto, hijo, salida, esperar };
  };

  // Sin IPv4 externa no hay nada que probar: se ve como «omitido» (no pasa en silencio).
  const externa = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);
  it.skipIf(!externa)("el programa escucha solo en el bucle local: por la IP de la red del PC la conexión se rechaza", async () => {
    const h = await lanzar();
    await h.esperar();
    expect((await pedir(h.puerto)).estado).toBe(200);
    const codigo = await new Promise((ok) => {
      const c = connect({ host: externa.address, port: h.puerto }, () => {
        c.destroy();
        ok("conectó");
      });
      c.on("error", (e) => ok(e.code));
    });
    expect(codigo).toBe("ECONNREFUSED");
  });

  it.each([["PANEL_PUERTO", "70000"], ["PANEL_DIAS", "0"], ["PANEL_DIAS", "abc"]])("sale con error (código 1) si %s=%s no vale", async (k, v) => {
    expect(await (await lanzar({ [k]: v })).salida).toBe(1);
  });

  it("la ventana es de 7 días por defecto y PANEL_DIAS la cambia", async () => {
    for (const [n, dias] of [["tres.jsonl", 3], ["diez.jsonl", 10]]) {
      const f = join(home, ".claude", "projects", "p2", n);
      escribir(f, L({ type: "mode", ...base({ sessionId: n }), timestamp: iso(Date.now() - dias * DIA) }));
      utimesSync(f, new Date(Date.now() - dias * DIA), new Date(Date.now() - dias * DIA));
    }
    for (const [extra, dias, total] of [[{}, 7, 3], [{ PANEL_DIAS: "1" }, 1, 2], [{ PANEL_DIAS: "20" }, 20, 4]]) {
      const h = await lanzar(extra);
      await h.esperar();
      const d = JSON.parse((await pedir(h.puerto)).cuerpo);
      expect([d.dias, d.ficheros.total]).toEqual([dias, total]);
    }
  });

  it("peticiones raras (GET //, URL rota) no tumban el servidor", async () => {
    const h = await lanzar();
    await h.esperar();
    for (const linea of ["GET // HTTP/1.1", "GET http://[ HTTP/1.1", "GET /%zz HTTP/1.1"]) {
      await new Promise((ok) => {
        const c = connect({ host: "127.0.0.1", port: h.puerto }, () => c.write(`${linea}\r\nHost: 127.0.0.1:${h.puerto}\r\nConnection: close\r\n\r\n`));
        c.on("data", () => {});
        c.on("close", ok);
        c.on("error", ok);
      });
    }
    expect((await pedir(h.puerto)).estado).toBe(200);
    expect(h.hijo.exitCode).toBeNull();
  });

  it("sirve la página y /datos.json con cabeceras de seguridad; solo GET (405), solo Host local (403), nada más (404)", async () => {
    const p = await arrancar();
    const r = await pedir(p, { ruta: "/" });
    expect(r.estado).toBe(200);
    expect(r.cabeceras["content-type"]).toMatch(/text\/html/);
    expect(r.cuerpo).toMatch(/datos\.json/);
    for (const h of [r.cabeceras, (await pedir(p)).cabeceras]) {
      expect(h["content-security-policy"]).toMatch(/default-src 'none'.*connect-src 'self'/);
      expect([h["x-content-type-options"], h["cache-control"]]).toEqual(["nosniff", "no-store"]);
    }
    expect((await pedir(p, { ruta: "/otra" })).estado).toBe(404);
    for (const metodo of ["POST", "PUT", "DELETE"]) {
      const m = await pedir(p, { metodo });
      expect([m.estado, m.cabeceras.allow]).toEqual([405, "GET"]);
    }
    expect((await pedir(p, { host: "evil.example:" + p })).estado).toBe(403); // DNS rebinding
    expect((await pedir(p, { host: "localhost:" + p })).estado).toBe(200);
  });


  // Los mismos escenarios con /datos.json del servidor real y un HOME sintético con cada fuente rota de verdad.
  const romper = (caidas) => {
    const extra = {};
    if (caidas.includes("transcripciones")) {
      extra.crearLector = (ruta, o) => {
        if (ruta === fSesion()) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
        return createReadStream(ruta, o);
      };
    }
    if (caidas.includes("settings")) escribir(join(home, ".claude", "settings.json"), "{roto");
    if (caidas.includes("copia")) rmSync(join(alvaro, "hooks"), { recursive: true });
    if (caidas.includes("registro")) {
      rmSync(join(home, ".claude", "factoria-alvaro"), { recursive: true });
      escribir(join(home, ".claude", "factoria-alvaro"), "esto no es una carpeta");
    }
    return extra;
  };
  it("el servidor real sano: todas las hojas clasificadas y con datos", async () => {
    comprobar(JSON.parse((await pedir(await arrancar())).cuerpo), []);
  });
  it.each(ESCENARIOS)("servidor real, fuentes caídas %j", async (caidas) => {
    const d = JSON.parse((await pedir(await arrancar(romper(caidas)))).cuerpo);
    expect(d.errores.map((x) => x.fuente).sort()).toEqual([...caidas].sort()); // cada error lleva su fuente (vocabulario cerrado)
    expect(d.errores.every((x) => x.fichero && x.motivo)).toBe(true); // y se ve qué fichero y por qué
    if (caidas.includes("transcripciones")) expect([d.errores[0].fichero, d.errores[0].motivo]).toEqual([expect.stringContaining("ses-aaaa1111.jsonl"), expect.stringContaining("EACCES")]);
    comprobar(d, caidas);
  });

  it("settings.json roto o falta de la copia instalada se muestran como error y como bandera roja", async () => {
    escribir(join(home, ".claude", "settings.json"), '{"k": ' + MARCADOR + " roto");
    rmSync(join(home, ".claude", "factoria", "lib", "r.mjs"));
    const r = await pedir(await arrancar());
    const d = JSON.parse(r.cuerpo);
    expect(d.errores.find((e) => e.fichero.includes("settings.json")).motivo).toMatch(/^JSON roto( cerca de la posición \d+)?$/);
    expect(r.cuerpo).not.toContain(MARCADOR); // el texto de un settings roto puede traer secretos: ni una letra
    expect(d.estado.copia).toMatchObject({ ok: false, faltanInstalada: ["lib/r.mjs"] });
  });

  it("relee el fichero entero cuando cambia y no toca lo que no cambió", async () => {
    const lecturas = [];
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7, alLeer: (ruta) => lecturas.push(ruta) });
    const d1 = await rec.recoger(Date.now());
    const n1 = lecturas.length;
    expect(n1).toBeGreaterThan(0);
    const d2 = await rec.recoger(Date.now());
    expect(lecturas.length).toBe(n1);
    expect(d2.estado.lineasRotas).toBe(d1.estado.lineasRotas);
    appendFileSync(fSesion(), L({ type: "cost-state", sessionId: "ses-aaaa1111", totalCostUSD: 4, totalDuration: 20000, totalAPIDuration: 4000, totalToolDuration: 1000 }));
    const d3 = await rec.recoger(Date.now());
    expect(lecturas.length).toBe(n1 + 1);
    expect(d3.tiempos[0].costeUSD).toBe(4);
    expect(d3.estado.lineasRotas).toBe(1); // sin duplicar lo ya leído
  });

  it("la caché olvida un fichero que sale de la ventana: si vuelve igual, se relee", async () => {
    const lecturas = [];
    const fijo = new Date(Math.floor(Date.now() / 1000) * 1000 - 3600e3); // segundos enteros: la misma fecha exacta al volver
    utimesSync(fSesion(), fijo, fijo);
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7, alLeer: (ruta) => lecturas.push(ruta) });
    await rec.recoger(Date.now());
    const n1 = lecturas.length;
    utimesSync(fSesion(), new Date(Date.now() - 30 * DIA), new Date(Date.now() - 30 * DIA));
    expect((await rec.recoger(Date.now())).ficheros.total).toBe(1); // queda el otro fichero
    utimesSync(fSesion(), fijo, fijo);
    await rec.recoger(Date.now());
    expect(lecturas.length).toBe(n1 + 1);
  });
});
