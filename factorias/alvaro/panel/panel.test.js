// Tests del panel local de la factoría. Todo es SINTÉTICO: ninguna transcripción real, y un
// marcador secreto sembrado en el contenido de los mensajes que NUNCA debe salir por /datos.json.
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FUENTES, MAX_EVENTOS, MAX_MARCAS, MAX_RAMAS, RONDA_ABIERTA_MAX_MS, TIPOS_EVENTO, UMBRALES_HOOKS_VIVOS, VENTANA_DIRECTO_MS, agregar, compararCopias, inicioDiaMadrid, leerDeclarados, nombreCorto, normalizarComando, nuevoResumen, parsearRegistro, procesarLinea, unirBloqueos, validarPrecios } from "./lib/leer.mjs";
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
// Precios de PRUEBA (no son los reales): USD por millón de tokens. m-sin existe y no tiene precio (null) a propósito.
const PRECIOS = { fecha: "2026-01-01", fuente: "https://ejemplo.invalid/precios", modelos: { "m-a": { entrada: 3, salida: 15, lecturaCache: 0.3, escrituraCache5m: 3.75, escrituraCache1h: 6 }, "m-sin": null } };
const entradaBase = (extra = {}) => ({ ahora: AHORA, dias: 7, ficheros: [], subagentes: [], precios: PRECIOS, registros: [], declarados: [], copia: copiaOk, home: "/h", errores: [], ...extra });

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
    Object.assign(this, { tag, hijos: [], padre: null, className: "", dataset: {}, attrs: {}, scrollLeft: 0, reemplazos: 0, inserciones: 0, classList: { add() {}, remove() {} } });
  }
  adoptar(x) {
    if (!(x instanceof Nodo)) return String(x);
    x.remove();
    x.padre = this;
    return x;
  }
  append(...xs) { this.hijos.push(...xs.map((x) => this.adoptar(x))); }
  replaceChildren(...xs) { this.reemplazos++; this.hijos.forEach((h) => h instanceof Nodo && (h.padre = null)); this.hijos = []; this.append(...xs); }
  insertBefore(n, ref) {
    n.remove();
    n.padre = this;
    this.hijos.splice(ref ? this.hijos.indexOf(ref) : this.hijos.length, 0, n);
    this.inserciones++;
    return n;
  }
  remove() { if (this.padre) { this.padre.hijos.splice(this.padre.hijos.indexOf(this), 1); this.padre = null; } }
  get firstChild() { return this.hijos[0] ?? null; }
  get nextSibling() { return this.padre ? this.padre.hijos[this.padre.hijos.indexOf(this) + 1] ?? null : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getBoundingClientRect() { return { top: this.arriba ?? 0 }; }
  get offsetHeight() { return this.hijos.filter((h) => h instanceof Nodo && h.tag === "li").length * 30; } // cada fila mide 30
  set textContent(v) { this.hijos = [String(v)]; }
  contains() { return true; }
  focus() {}
  todos(f) { return this.hijos.flatMap((h) => (h instanceof Nodo ? [...(f(h) ? [h] : []), ...h.todos(f)] : [])); }
  querySelectorAll(sel) {
    const f = { ".tabla": (h) => h.className === "tabla", "[data-ts]": (h) => h.dataset.ts !== undefined, "[data-desde]": (h) => h.dataset.desde !== undefined }[sel];
    return this.todos(f);
  }
  get texto() { return this.hijos.map((h) => (h instanceof Nodo ? h.texto : h)).join(" "); }
}
function navegador(datos) {
  const app = new Nodo("div");
  const aviso = new Nodo("div");
  const vivo = new Nodo("span");
  const pend = [];
  const est = { datos, seleccion: false, tics: [], saltos: [] };
  const win = { scrollY: 0, scrollTo(x, y) { win.scrollY = y; est.saltos.push(y); }, getSelection: () => ({ isCollapsed: !est.seleccion, anchorNode: {} }) };
  const doc = { getElementById: (id) => ({ app, aviso, vivo })[id], createElement: (t) => new Nodo(t), hidden: false, addEventListener() {}, querySelectorAll: (s) => [...app.querySelectorAll(s), ...vivo.querySelectorAll(s)] };
  const fetchFalso = async () => {
    if (est.cae) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200, json: async () => est.datos };
  };
  const script = /<script>([\s\S]*)<\/script>/.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "panel.html"), "utf8"))[1];
  new Function("document", "window", "fetch", "setTimeout", "setInterval", "AbortSignal", script)(doc, win, fetchFalso, (f) => pend.push(f), (f) => est.tics.push(f), AbortSignal);
  const pausa = () => new Promise((r) => setImmediate(r));
  const ciclo = async (cambia = {}) => { Object.assign(est.datos, cambia); (pend.shift() ?? (() => {}))(); await pausa(); await pausa(); };
  // las zonas fijas de la página, de arriba abajo: semáforo, en directo, rondas, resto
  const zona = (i) => app.hijos[i];
  return { app, aviso, vivo, win, est, ciclo, zona, listo: pausa().then(pausa) };
}
// Entrada a propósito rica: un hook de Stop declarado sin huella, otro de PostToolUse, sesiones con foto de coste y sin ella,
// jueces relanzados, un subagente y bloqueos. Con errores de lectura (uno por fuente) sirve para todas las pruebas.
const entradaRica = (errores = []) =>
  entradaBase({
    errores,
    subagentes: [
      { ruta: "s1", agentId: "a1", sesionPadre: "sp", tipo: "revisor", resumen: resumenDe({ type: "assistant", uuid: "us1", timestamp: iso(AHORA - 3000), ...base({ sessionId: "sp" }), isSidechain: true, message: { id: "msub1", model: "m-a", usage: { input_tokens: 1000, output_tokens: 1000 }, content: [] } }) },
      { ruta: "s2", agentId: "c1", sesionPadre: "sp", tipo: "constructor", resumen: resumenDe({ type: "assistant", uuid: "us2", timestamp: iso(AHORA - 3 * DIA), ...base({ sessionId: "sp" }), isSidechain: true, message: { id: "msub2", model: "m-sin", usage: { input_tokens: 10, output_tokens: 10 }, content: [] } }) },
    ],
    declarados: [{ evento: "Stop", comando: "node c.mjs" }, { evento: "Stop", comando: "node mudo.mjs" }, { evento: "PostToolUse", comando: "node registro.mjs" }],
    registros: [{ rama: "r", rotas: 0, entradas: [e({ agent_id: "a1", veredicto: "lanzado", ts: AHORA - 9000 }), e({ agent_id: "a1" }), e({ agent_id: "a2" })] }],
    ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(...asist("sp"), foto("sp", 3), ...asist("sq"), ev("sh"), ev("sh", 3 * 3600e3), foto("sh", 1, { totalDuration: 7320000 }), cierre({ hookInfos: [{ command: "node c.mjs", durationMs: 7 }] }), { type: "attachment", uuid: "bq", timestamp: iso(AHORA), ...base(), attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: { command: "node c.mjs", blockingError: "falta qa" } } }, { type: "assistant", uuid: "ag", timestamp: iso(AHORA), ...base(), message: { id: "mag", model: "m", usage: { output_tokens: 1 }, content: [{ type: "tool_use", id: "tag", name: "Agent", input: { subagent_type: "revisor" } }, { type: "tool_use", id: "tag2", name: "Agent", input: { subagent_type: "constructor" } }] } }) }],
  });
const datosPagina = (errores = []) => ({ generado: iso(AHORA), dias: 7, lecturaMs: 5, proceso: { rssMB: 80, heapMB: 20 }, ...agregar(entradaRica(errores)) });
const falla = (...fuentes) => fuentes.map((fuente) => ({ fuente, fichero: "x", motivo: "EACCES" }));

// ---- LA PRUEBA QUE CIERRA LA CLASE «un cero que no es cero»: de qué fuente depende cada hoja del JSON ----
// Las propias del panel van con []. Una hoja sin clasificar hace fallar el test: un campo nuevo obliga a decidir (y a enmascarar).
// Cada fila es una lista CERRADA de hojas, anclada con $: un campo nuevo dentro de hooks[], tiempos[]… no hereda nada, falla.
const g = (ruta, campos) => new RegExp("^" + ruta.replace(/\./g, "\\.") + (campos ? "(\\[\\]\\.(" + campos + "))?" : "") + "$");
const DEP = [
  [/^\.(generado|dias|lecturaMs|directoMin)$|^\.proceso\.|^\.errores/, []],
  [/^\.hooks\[\]\.(declarado|sinHuella|rojo)$/, ["settings", "transcripciones"]],
  [g(".hooks", "evento|nombre|ruta|veces|ultima|mediaMs|maxMs|bloqueos"), ["transcripciones"]],
  [g(".tiempos", "sesion|rama|carpeta|ultimo|totalMs|apiMs|herramientasMs|hooksMs|costeUSD|fotoAtrasada|noCuadra"), ["transcripciones"]],
  [/^\.(ficheros\.total|estado\.(ultimoEvento|sesiones|lineasRotas)|ineficiencias\.mensajesSubagente)$/, ["transcripciones"]],
  [/^\.ineficiencias\.bloqueos(\[\]\.(evento|nombre|n|motivos(\[\]\.(texto|n))?))?$/, ["transcripciones"]],
  [/^\.ineficiencias\.costes(\.total|\.sesiones(\[\]\.(sesion|rama|carpeta|costeUSD|fotoAtrasada))?)?$/, ["transcripciones"]],
  [g(".ineficiencias.tokens", "modelo|mensajes|entrada|salida|cacheLeida|cacheCreada"), ["transcripciones"]],
  [g(".ineficiencias.subagentes", "tipo|n"), ["transcripciones"]],
  [/^\.estado\.copia(\.(ok|difieren|faltanInstalada|sobranInstalada)(\[\])?)?$/, ["copia"]],
  [/^\.estado\.registroAntiguo(\.(aviso|sinAgentId|noJueces|apuntes))?$/, ["registro"]],
  [g(".jueces.tiempos", "rama|agente|veredicto|ms|ts"), ["registro"]],
  [g(".ineficiencias.relanzados", "rama|agente|informes|sinAgentId"), ["registro"]],
  // v1: En directo mezcla transcripciones (agentes, bloqueos, cierres) y registro (jueces): cae si cae cualquiera de las dos
  [g(".eventos", "hora|tipo|agente|hook|veredicto|agentId|duracionMs|sesion"), ["transcripciones", "registro"]],
  // v1 coste: los tokens salen de las transcripciones; el coste, de las transcripciones y de los precios; por ronda, además, del registro
  [/^\.coste$/, ["transcripciones"]],
  [/^\.coste\.precios(\.(fecha|fuente))?$/, ["precios"]],
  [/^\.coste\.lineasRotas$/, ["transcripciones"]],
  [/^\.coste\.modelosSinPrecio(\[\])?$/, ["transcripciones", "precios"]],
  [/^\.coste\.repartoTokens(\.(jueces|otros|principal))?$/, ["transcripciones"]],
  [/^\.coste\.repartoCoste(\.(jueces|otros|principal))?$/, ["transcripciones", "precios"]],
  [/^\.coste\.(total|(porDia|porSesion|porRama)\[\])\.(jueces|otros|principal|total)\.tokens$/, ["transcripciones"]],
  [/^\.coste\.(total|(porDia|porSesion|porRama)\[\])\.(jueces|otros|principal|total)\.(costeUSD|tokensSinPrecio)$/, ["transcripciones", "precios"]],
  [/^\.coste\.(porSesion|porRama)\[\]\.pctJueces$/, ["transcripciones", "precios"]],
  [/^\.coste\.(porDia|porSesion|porRama)(\[\]\.(dia|sesion|rama|ultimo))?$/, ["transcripciones"]],
  [/^\.ramas\[\]\.(tokens|rondasConCoste)$|^\.ramas\[\]\.marcas\[\]\.tokens$/, ["registro", "transcripciones"]],
  [/^\.ramas\[\]\.(costeUSD|tokensSinPrecio)$|^\.ramas\[\]\.marcas\[\]\.(costeUSD|tokensSinPrecio)$/, ["registro", "transcripciones", "precios"]],
  [g(".ramas", "rama|rondas|tiempoMs|ultimo|masMarcas|marcas(\\[\\]\\.(agente|veredicto|ms|ts|abierta|fiable))?"), ["registro"]],
  [/^\.semaforo\.hooksVivos(\.(nivel|ultimo|copiaOk))?$/, ["transcripciones", "copia"]],
  [/^\.semaforo\.bloqueosHoy(\.(nivel|total|identificados))?$/, ["transcripciones"]],
  [/^\.semaforo\.rondasAbiertas(\.(nivel|n))?$/, ["registro"]],
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
    expect(hojas(sano).filter(([p]) => !deDe(p).length).map(([p]) => p)).toEqual([".directoMin", ".errores"]); // la lista blanca no se amplía en silencio
    expect(new Set(sano.eventos.map((x) => x.tipo))).toEqual(new Set(TIPOS_EVENTO)); // «En directo» con un suceso de cada tipo, para que el test de fuentes caídas mida algo
    expect([sano.coste.porDia.length > 1, sano.coste.porSesion.length > 0, sano.coste.porRama.length > 0, sano.coste.modelosSinPrecio.length > 0, sano.coste.repartoCoste !== null, sano.coste.total.jueces.costeUSD > 0, sano.ramas[0].marcas.some((m) => m.tokens !== null), sano.ramas[0].marcas.some((m) => m.tokens === null)]).toEqual(Array(8).fill(true)); // el coste del fixture trae de todo
    expect([sano.ramas.length > 0, sano.ramas[0].marcas.length > 0, sano.semaforo.hooksVivos !== null, sano.semaforo.bloqueosHoy.total > 0, sano.semaforo.rondasAbiertas !== null]).toEqual(Array(5).fill(true));
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
    const lectura = n.app.todos((h) => h.tag === "p").map((h) => h.texto).find((t) => t.startsWith("Lectura:"));
    expect(lectura).not.toMatch(/ficheros/); // sin total no hay «de 0 ficheros» ni «de null ficheros»
    const franjas = n.app.todos((h) => h.className.startsWith("franja ")).map((h) => [h.className, h.texto]);
    expect(franjas.filter(([c, t]) => c === "franja aviso" && t.includes("No se pudo comparar la copia"))).toHaveLength(1);
    expect(franjas.filter(([c, t]) => c === "franja ok" && t.includes("Copia"))).toEqual([]); // copia null no puede salir verde
    expect(n.app.texto).not.toContain("Sin datos en esta ventana");
  });

  it("con settings ilegible la Nota de los hooks no afirma nada falso, y los tiempos siguen", async () => {
    const n = navegador(datosPagina(falla("settings")));
    await n.listo;
    const celdas = n.app.todos((h) => h.tag === "td").map((h) => h.texto);
    expect(celdas.filter((t) => /Stop debería|no está en|sin huella/.test(t))).toEqual([]); // la Nota de ningún hook afirma nada
    expect(celdas).toContain("sin dato");
    expect(n.app.texto).toContain("No se puede saber qué hooks están declarados porque settings.json no se pudo leer");
    expect(cifras(n.app)).toContain("2 h 2 min");
  });

  it("la celda «total no fiable» sale con su explicación en el title", async () => {
    const datos = datosPagina();
    datos.tiempos[0].noCuadra = true;
    const n = navegador(datos);
    await n.listo;
    const celdas = n.app.todos((h) => h.tag === "span" && h.texto === "total no fiable");
    expect(celdas).toHaveLength(1);
    expect(celdas[0].title).toMatch(/vida observada/);
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
    expect(n.app.texto).not.toContain("No se puede saber qué hooks están declarados");
    await n.ciclo({ lecturaMs: 9, generado: iso(AHORA + 5000) }); // solo cambia lo volátil
    expect(n.zona(3).reemplazos).toBe(1);
    await n.ciclo({ estado: { ...n.est.datos.estado, sesiones: 99 } });
    expect(n.zona(3).reemplazos).toBe(2);
    n.est.tics[0](); // el contador «hace N s» sigue corriendo
    expect(n.app.querySelectorAll("[data-ts]")[0].texto).toMatch(/^hace \d+ (s|min|h|días)$/);
  });

  it("con texto seleccionado espera, pero tras 6 ciclos repinta igualmente", async () => {
    const n = navegador(datosPagina());
    await n.listo;
    n.est.seleccion = true;
    for (let i = 1; i <= 5; i++) await n.ciclo({ estado: { ...n.est.datos.estado, sesiones: 50 + i } });
    expect(n.zona(3).reemplazos).toBe(1);
    await n.ciclo({ estado: { ...n.est.datos.estado, sesiones: 60 } });
    expect(n.zona(3).reemplazos).toBe(2);
  });

  it("no usa recursos externos ni HTML en crudo, y respeta el tema oscuro", () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(html).toMatch(/prefers-color-scheme: dark/);
  });
});

// ---- v1: la página (semáforo, En directo, Rondas por tarea) con el navegador simulado ----
describe("la página v1 · semáforo, En directo y rondas", () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "panel.html"), "utf8");
  const T0 = Date.parse("2026-10-24T10:03:09Z"); // 12:03:09 en Madrid
  const evt = (extra) => ({ hora: iso(T0), tipo: "agente_lanzado", agente: "constructor", hook: null, veredicto: null, agentId: null, duracionMs: null, sesion: "ses-aaaa", ...extra });
  const conEventos = (eventos, extra = {}) => ({ ...datosPagina(), eventos, ...extra });
  const norm = (n) => n.texto.replace(/\s+/g, " ").trim();
  const filas = (n) => n.zona(1).todos((h) => h.tag === "li");
  const lamparas = (n) => n.zona(0).todos((h) => h.className.startsWith("lampara"));

  it("orden de arriba abajo: semáforo, en directo, rondas por tarea y, debajo, lo de la v0", async () => {
    const n = navegador(datosPagina());
    await n.listo;
    expect(n.app.hijos).toHaveLength(4);
    expect(n.zona(0).className).toContain("semaforo");
    expect(n.zona(1).texto).toContain("En directo");
    expect(n.zona(2).texto).toContain("Rondas por tarea");
    expect(n.zona(3).texto.indexOf("Estado")).toBeLessThan(n.zona(3).texto.indexOf("Qué se activa"));
  });

  it("semáforo: tres lámparas con texto, forma y color; el nivel viene del servidor", async () => {
    const d = conEventos([]);
    d.semaforo = { hooksVivos: { nivel: "ok", ultimo: iso(Date.now() - 3 * MIN), copiaOk: true }, bloqueosHoy: { nivel: "aviso", total: 4, identificados: 3 }, rondasAbiertas: { nivel: "aviso", n: 2 } };
    const n = navegador(d);
    await n.listo;
    const l = lamparas(n);
    expect(l.map((x) => x.className)).toEqual(["lampara ok", "lampara aviso", "lampara aviso"]);
    const textos = l.map(norm);
    expect(textos[0]).toMatch(/Hooks vivos.*bien.*último evento hace \d+ (s|min).*copia = repo/);
    expect(textos[1]).toMatch(/Bloqueos hoy.*atención.*4 bloqueos.*3 con hook identificado/);
    expect(textos[2]).toMatch(/Rondas abiertas.*atención.*2 jueces sin informe/);
    expect(new Set(l.map((x) => x.todos((h) => h.className === "forma")[0].texto.trim())).size).toBe(2); // la forma distingue los niveles, no solo el color
    // cero rondas abiertas: verde y lo dice
    const n2 = navegador({ ...d, semaforo: { ...d.semaforo, rondasAbiertas: { nivel: "ok", n: 0 } } });
    await n2.listo;
    expect(norm(lamparas(n2)[2])).toMatch(/bien.*ninguna/);
  });

  it("semáforo: copia distinta del repo se dice con letras; un nivel rojo tiene su forma", async () => {
    const d = conEventos([]);
    d.semaforo = { hooksVivos: { nivel: "mal", ultimo: iso(Date.now() - 3 * MIN), copiaOk: false }, bloqueosHoy: { nivel: "ok", total: 0, identificados: 0 }, rondasAbiertas: { nivel: "ok", n: 0 } };
    const n = navegador(d);
    await n.listo;
    expect(norm(lamparas(n)[0])).toMatch(/mal.*copia ≠ repo/);
    expect(norm(lamparas(n)[1])).toMatch(/0 bloqueos/);
  });

  it("semáforo: la lámpara de una fuente caída dice «sin dato» en gris, nunca verde, y las demás siguen", async () => {
    const cae = (fuente) => navegador(datosPagina(falla(fuente)));
    const pinta = async (fuente) => { const n = cae(fuente); await n.listo; return lamparas(n); };
    const t = await pinta("transcripciones");
    expect(t.map((x) => x.className)).toEqual(["lampara gris", "lampara gris", expect.stringMatching(/^lampara (ok|aviso)$/)]);
    expect(norm(t[0])).toContain("sin dato");
    const r = await pinta("registro");
    expect(r.map((x) => x.className)).toEqual([expect.stringMatching(/^lampara (ok|aviso|mal)$/), expect.stringMatching(/^lampara (ok|aviso)$/), "lampara gris"]);
    const c = await pinta("copia");
    expect(c[0].className).toBe("lampara gris");
    expect(c[1].className).not.toBe("lampara gris");
    expect((await pinta("settings")).some((x) => x.className === "lampara gris")).toBe(false); // settings no mueve el semáforo
    for (const x of [...t, ...r, ...c]) if (x.className === "lampara gris") expect(norm(x)).toMatch(/sin dato/);
  });

  it("En directo: la hora de Madrid, la forma y el texto del tipo, el detalle; lo más nuevo arriba", async () => {
    const n = navegador(conEventos([
      evt({ hora: iso(T0 + 4000), tipo: "hook_bloqueo", agente: null, hook: "cierre.mjs" }),
      evt({ hora: iso(T0 + 2000), tipo: "turno_terminado", agente: null, duracionMs: 1500 }),
      evt(),
    ]));
    await n.listo;
    const f = filas(n).map(norm);
    expect(f).toHaveLength(3);
    expect(f[0]).toMatch(/^12:03:13 ■ Hook bloqueó cierre\.mjs/);
    expect(f[1]).toMatch(/^12:03:11 ● Turno terminado .*1,5 s/);
    expect(f[2]).toMatch(/^12:03:09 ▶ Agente lanzado constructor/);
    expect(n.zona(1).texto).not.toContain("Sin actividad");
  });

  it("En directo: un hook sin identificar, un agente sin tipo y un turno sin duración no inventan nada", async () => {
    const n = navegador(conEventos([evt({ hora: iso(T0 + 3000), tipo: "hook_bloqueo", agente: null, hook: null }), evt({ hora: iso(T0 + 2000), agente: null }), evt({ hora: iso(T0 + 1000), tipo: "turno_terminado", agente: null })]));
    await n.listo;
    const f = filas(n).map(norm);
    expect(f[0]).toContain("hook sin identificar");
    expect(f[1]).toContain("tipo sin indicar");
    expect(f[2]).toContain("sin duración");
  });

  const lanzado = (extra) => evt({ tipo: "juez_lanzado", agente: "revisor", agentId: "a1", ...extra });
  const informo = (extra) => evt({ hora: iso(T0 + 60000), tipo: "juez_informo", agente: "revisor", agentId: "a1", veredicto: "no_pasa", duracionMs: 60000, ...extra });

  it("En directo: un juez en marcha enseña un temporizador que sigue contando cada segundo", async () => {
    const hace = Date.now() - 65000;
    const n = navegador(conEventos([lanzado({ hora: iso(hace) })]));
    await n.listo;
    const crono = n.zona(1).querySelectorAll("[data-desde]");
    expect(crono).toHaveLength(1);
    expect(crono[0].texto).toMatch(/^1 min 0\d s$/);
    expect(norm(filas(n)[0])).toContain("en marcha");
    crono[0].dataset.desde = iso(Date.now() - 130000); // pasa el tiempo
    n.est.tics[0]();
    expect(crono[0].texto).toMatch(/^2 min 1\d s$/);
  });

  it("En directo: el informe se enlaza con su lanzamiento (mismo agent_id): tardó N s, y el temporizador desaparece", async () => {
    const n = navegador(conEventos([informo(), lanzado()]));
    await n.listo;
    const [i, l] = filas(n).map(norm);
    expect(i).toMatch(/^12:04:09 ✖ Juez informó revisor.*no pasa.*tardó 1 min 00 s.*lanzado a las 12:03:09/);
    expect(l).toMatch(/^12:03:09 ◆ Juez lanzado revisor.*informó a las 12:04:09.*tardó 1 min 00 s/);
    expect(n.zona(1).querySelectorAll("[data-desde]")).toHaveLength(0);
    expect(filas(n).every((f) => f.className.includes("enlazada"))).toBe(true);
  });

  it("En directo: cada veredicto tiene su forma y su palabra (pasa, no pasa, no sé, ilegible)", async () => {
    const v = (veredicto, ms) => informo({ hora: iso(T0 + ms), veredicto, agentId: "z" + ms });
    const n = navegador(conEventos([v("pasa", 4000), v("no_pasa", 3000), v("no_se", 2000), v("sin_veredicto", 1000)]));
    await n.listo;
    const f = filas(n).map(norm);
    expect(f[0]).toMatch(/✔.*pasa/);
    expect(f[1]).toMatch(/✖.*no pasa/);
    expect(f[2]).toMatch(/\?.*no sé/);
    expect(f[3]).toMatch(/⚠.*ilegible/);
    expect(filas(n).map((x) => x.className)).toEqual(expect.arrayContaining([expect.stringContaining("ok"), expect.stringContaining("mal"), expect.stringContaining("aviso"), expect.stringContaining("gris")]));
  });

  it("En directo: un informe sin agent_id o sin su lanzamiento no afirma una duración", async () => {
    const n = navegador(conEventos([informo({ agentId: null, duracionMs: null }), informo({ agentId: "otro", duracionMs: null, hora: iso(T0 + 1000) })]));
    await n.listo;
    const f = filas(n).map(norm);
    expect(f[0]).toMatch(/sin agent_id/);
    expect(f[0]).not.toMatch(/tardó/);
    expect(f[1]).toMatch(/duración: sin dato/);
  });

  it("«Sin actividad en los últimos 30 min» (lista vacía) no es lo mismo que «sin dato en directo» (fuente caída)", async () => {
    const vacio = navegador(conEventos([]));
    await vacio.listo;
    expect(vacio.zona(1).texto).toContain("Sin actividad en los últimos 30 min");
    expect(vacio.zona(1).texto).not.toContain("sin dato");
    expect(filas(vacio)).toHaveLength(0);
    for (const fuente of ["transcripciones", "registro"]) {
      const roto = navegador(datosPagina(falla(fuente)));
      await roto.listo;
      expect(roto.zona(1).texto).toContain("Sin dato en directo");
      expect(roto.zona(1).texto).not.toContain("Sin actividad");
      expect(filas(roto)).toHaveLength(0);
    }
  });

  it("con settings o copia caídos, En directo sigue enseñando sus filas", async () => {
    for (const fuente of ["settings", "copia"]) {
      const n = navegador({ ...datosPagina(falla(fuente)), eventos: [evt()] });
      await n.listo;
      expect(filas(n)).toHaveLength(1);
    }
  });

  it("filas nuevas: entran por arriba SIN repintar lo demás (las filas viejas son las mismas, y las otras zonas no se tocan)", async () => {
    const n = navegador(conEventos([evt()]));
    await n.listo;
    const vieja = filas(n)[0];
    const antes = [n.zona(0).reemplazos, n.zona(2).reemplazos, n.zona(3).reemplazos];
    await n.ciclo({ eventos: [evt({ hora: iso(T0 + 5000), tipo: "turno_terminado", agente: null }), evt()] });
    const f = filas(n);
    expect(f).toHaveLength(2);
    expect(f[1]).toBe(vieja); // el mismo nodo: no se ha vuelto a crear
    expect(norm(f[0])).toContain("Turno terminado");
    expect([n.zona(0).reemplazos, n.zona(2).reemplazos, n.zona(3).reemplazos]).toEqual(antes);
    expect(n.zona(1).todos((h) => h.tag === "ul")[0].reemplazos).toBe(0);
    // y otra vez sin cambios: no se toca nada
    const ins = n.zona(1).todos((h) => h.tag === "ul")[0].inserciones;
    await n.ciclo({ generado: iso(T0 + 9999) });
    expect(n.zona(1).todos((h) => h.tag === "ul")[0].inserciones).toBe(ins);
  });

  it("las filas que salen de la ventana se quitan, y las demás se quedan", async () => {
    const a = evt({ hora: iso(T0 + 1000), agente: "a" });
    const b = evt({ hora: iso(T0), agente: "b" });
    const n = navegador(conEventos([a, b]));
    await n.listo;
    const fa = filas(n)[0];
    await n.ciclo({ eventos: [a] });
    expect(filas(n)).toHaveLength(1);
    expect(filas(n)[0]).toBe(fa);
  });

  it("una fila que cambia de contenido (el juez lanzado recibe su informe) se rehace sola, sin tocar las demás", async () => {
    const otra = evt({ hora: iso(T0 + 1000), agente: "otra" });
    const n = navegador(conEventos([otra, lanzado()]));
    await n.listo;
    expect(n.zona(1).querySelectorAll("[data-desde]")).toHaveLength(1);
    const fOtra = filas(n)[0];
    await n.ciclo({ eventos: [informo(), otra, lanzado()] });
    expect(n.zona(1).querySelectorAll("[data-desde]")).toHaveLength(0);
    expect(filas(n)).toHaveLength(3);
    expect(filas(n)[1]).toBe(fOtra);
  });

  it("si el usuario mira más abajo, una fila nueva no mueve lo que lee: el scroll se compensa con la altura que ganó la lista", async () => {
    const n = navegador(conEventos([evt()]));
    await n.listo;
    n.zona(1).todos((h) => h.tag === "ul")[0].arriba = -400; // el borde de arriba de la lista queda 400 px por encima de la ventana
    n.win.scrollY = 500; // y el usuario está más abajo
    n.est.saltos.length = 0;
    await n.ciclo({ eventos: [evt({ hora: iso(T0 + 5000), tipo: "turno_terminado", agente: null }), evt()] });
    expect(n.win.scrollY).toBe(530); // +30: lo que mide la fila nueva
    // arriba del todo no se toca el scroll
    const m = navegador(conEventos([evt()]));
    await m.listo;
    m.est.saltos.length = 0;
    await m.ciclo({ eventos: [evt({ hora: iso(T0 + 5000), tipo: "turno_terminado", agente: null }), evt()] });
    expect(m.win.scrollY).toBe(0);
  });

  const rama = (extra = {}) => ({ rama: "feat_ejemplo", rondas: 3, tiempoMs: 245000, ultimo: iso(T0), masMarcas: 0, marcas: [
    { agente: "revisor", veredicto: "pasa", ms: 100000, abierta: false, fiable: true, ts: iso(T0) },
    { agente: "qa", veredicto: "no_pasa", ms: 45000, abierta: false, fiable: true, ts: iso(T0 + 1000) },
    { agente: "evaluador", veredicto: "no_se", ms: null, abierta: false, fiable: false, ts: iso(T0 + 2000) },
    { agente: "revisor", veredicto: "sin_veredicto", ms: 100000, abierta: false, fiable: true, ts: iso(T0 + 3000) },
    { agente: "revisor", veredicto: "lanzado", ms: null, abierta: true, fiable: true, ts: iso(Date.now() - 20000) },
    { agente: "qa", veredicto: "lanzado", ms: null, abierta: false, fiable: true, ts: iso(T0 - 9 * 3600e3) },
  ], ...extra });
  const marcas = (n) => n.zona(2).todos((h) => h.className.startsWith("marca "));

  it("rondas por tarea: una fila por rama con una marca por informe (forma, juez y «tardó N s»), total de rondas y tiempo en jueces", async () => {
    const n = navegador({ ...datosPagina(), ramas: [rama()] });
    await n.listo;
    const z = norm(n.zona(2));
    expect(z).toContain("feat_ejemplo");
    expect(z).toMatch(/3 rondas/);
    expect(z).toMatch(/4 min 05 s/);
    expect(z).toContain("no sé a qué PR pertenece");
    const m = marcas(n);
    expect(m).toHaveLength(6);
    expect(m.map((x) => x.todos((h) => h.className === "forma")[0].texto.trim())).toEqual(["✔", "✖", "?", "⚠", "…", "…"]);
    expect(m[0].title).toMatch(/revisor.*pasa.*tardó 1 min 40 s/);
    expect(m[1].title).toMatch(/qa.*no pasa.*tardó 45,0 s/);
    expect(m[0].todos((h) => h.className === "sr")[0].texto).toMatch(/revisor.*pasa.*tardó 1 min 40 s/); // texto accesible, no solo el title
    expect(m.map((x) => x.className.split(" ")[1])).toEqual(["ok", "mal", "aviso", "gris", "aviso", "gris"]);
  });

  it("rondas: el lanzado sin informe cuenta con temporizador; si ya no corre, dice que no tiene informe y no cuenta", async () => {
    const n = navegador({ ...datosPagina(), ramas: [rama()] });
    await n.listo;
    const m = marcas(n);
    expect(n.zona(2).querySelectorAll("[data-desde]")).toHaveLength(1);
    expect(m[4].texto).toMatch(/\d+ s/);
    expect(m[5].title).toMatch(/sin informe/);
    expect(m[5].todos((h) => h.dataset.desde !== undefined)).toHaveLength(0);
  });

  it("rondas: los apuntes antiguos sin agent_id se marcan «dato antiguo, no fiable» y no afirman duración", async () => {
    const n = navegador({ ...datosPagina(), ramas: [rama()] });
    await n.listo;
    const m = marcas(n)[2];
    expect(m.title).toMatch(/dato antiguo, no fiable/);
    expect(m.title).not.toMatch(/tardó/);
    expect(m.className).toContain("antigua");
    expect(norm(n.zona(2))).toMatch(/1 marca de dato antiguo, no fiable/);
  });

  it("rondas: sin duración medible el tiempo dice «sin dato»; más marcas de las que caben se dice; sin ramas, lo dice; fuente caída, «No se pudo leer»", async () => {
    const a = navegador({ ...datosPagina(), ramas: [rama({ tiempoMs: null, masMarcas: 7 })] });
    await a.listo;
    expect(norm(a.zona(2))).toMatch(/sin dato/);
    expect(norm(a.zona(2))).toMatch(/7 marcas más antiguas/);
    const b = navegador({ ...datosPagina(), ramas: [] });
    await b.listo;
    expect(b.zona(2).texto).toMatch(/Sin rondas de jueces en los últimos 7 días/);
    const c = navegador(datosPagina(falla("registro")));
    await c.listo;
    expect(c.zona(2).texto).toContain("No se pudo leer");
    expect(marcas(c)).toHaveLength(0);
    expect(c.zona(2).texto).not.toMatch(/Sin rondas/);
  });

  it("legible a 375 px: lo nuevo son listas apiladas, sin tablas anchas", async () => {
    const n = navegador({ ...datosPagina(), ramas: [rama()], eventos: [evt()] });
    await n.listo;
    for (const i of [0, 1, 2]) expect(n.zona(i).todos((h) => h.tag === "table" || h.className === "tabla")).toHaveLength(0);
    expect(html).toMatch(/@media \(max-width: 480px\)/);
    expect(html).toMatch(/prefers-color-scheme: dark/);
  });

  it("indicador «en vivo · actualizado hace N s»; si el servidor cae pasa a «sin conexión» y los datos se quedan", async () => {
    const n = navegador({ ...datosPagina(), generado: iso(Date.now() - 2000) });
    await n.listo;
    expect(norm(n.vivo)).toMatch(/^● en vivo · actualizado hace \d+ s$/);
    expect(n.vivo.className).toContain("ok");
    n.est.cae = true;
    await n.ciclo();
    expect(norm(n.vivo)).toMatch(/^■ sin conexión · último dato hace/);
    expect(n.vivo.className).toContain("mal");
    expect(n.aviso.texto).toMatch(/No llega al panel local/);
    n.est.cae = false;
    await n.ciclo();
    expect(norm(n.vivo)).toMatch(/en vivo/);
    expect(n.vivo.className).not.toContain("mal");
  });

  it("el texto de los datos entra como texto: un nombre de agente con HTML no se interpreta", async () => {
    const n = navegador(conEventos([evt({ agente: "<img src=x onerror=1>" })]));
    await n.listo;
    expect(norm(filas(n)[0])).toContain("<img src=x onerror=1>");
    expect(filas(n)[0].todos((h) => h.tag === "img")).toHaveLength(0);
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

// ---- v1: «En directo», semáforo y rondas por tarea (todo sintético; el marcador va en description, prompt, mensajes y resultados) ----
const MIN = 60e3;
const lanza = (t, tipo, extra = {}) => ({ type: "assistant", uuid: "ag-" + ++contador, timestamp: iso(t), ...base(), message: { id: "mg-" + contador, model: "m", usage: {}, content: [{ type: "text", text: MARCADOR }, { type: "tool_use", id: "ta-" + contador, name: "Agent", input: { subagent_type: tipo, description: MARCADOR, prompt: MARCADOR } }, { type: "tool_result", content: MARCADOR }] }, ...extra });
const bloquea = (t, comando, extra = {}) => ({ type: "attachment", uuid: "bl-" + ++contador, timestamp: iso(t), ...base(), attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: { command: comando, blockingError: MARCADOR } }, ...extra });
const cierreN = (t, n, ms = [30]) => cierre({ timestamp: iso(t), hookInfos: ms.map((d) => ({ command: "node cierre.mjs", durationMs: d })), hookErrors: Array(n).fill(MARCADOR) });
const conFicheros = (...objs) => ({ ficheros: [{ ruta: "f", mtimeMs: AHORA, resumen: resumenDe(...objs) }] });
const filas = (d) => d.eventos.map((x) => [x.tipo, x.agente, x.hook, x.veredicto, x.duracionMs]);

describe("v1 · la hora de Madrid y los bloqueos sin contar dos veces", () => {
  it("inicioDiaMadrid: la medianoche de Madrid, también el día que cambia la hora", () => {
    expect(iso(inicioDiaMadrid(AHORA))).toBe("2026-10-23T22:00:00.000Z"); // 12:00 de Madrid (+2)
    expect(iso(inicioDiaMadrid(Date.parse("2026-12-10T12:00:00Z")))).toBe("2026-12-09T23:00:00.000Z"); // invierno (+1)
    expect(iso(inicioDiaMadrid(Date.parse("2026-10-25T12:00:00Z")))).toBe("2026-10-24T22:00:00.000Z"); // día de 25 h: la medianoche era aún +2
    expect(iso(inicioDiaMadrid(Date.parse("2026-03-29T12:00:00Z")))).toBe("2026-03-28T23:00:00.000Z"); // día de 23 h
    expect(iso(inicioDiaMadrid(Date.parse("2026-10-23T22:00:00Z")))).toBe("2026-10-23T22:00:00.000Z"); // justo en la medianoche
    expect(iso(inicioDiaMadrid(Date.parse("2026-10-23T21:59:59.999Z")))).toBe("2026-10-22T22:00:00.000Z");
  });

  const adj = (ts, comando, sesion = "s") => ({ ts, sesion, comando });
  const cie = (ts, errores, sesion = "s") => ({ ts, sesion, errores });
  it("un cierre con error y su adjunto (misma sesión, mismos segundos) son UN bloqueo", () => {
    expect(unirBloqueos([adj(1000, "a.mjs")], [cie(1000, 1)])).toEqual([adj(1000, "a.mjs")]);
    expect(unirBloqueos([adj(1000, "a.mjs"), adj(1000, "b.mjs")], [cie(1000, 1)])).toHaveLength(2); // dos hooks, un solo error en el cierre
  });
  it("los errores del cierre que ningún adjunto cubre salen como bloqueos sin hook identificado", () => {
    expect(unirBloqueos([adj(1000, "a.mjs")], [cie(1000, 3)])).toEqual([adj(1000, "a.mjs"), adj(1000, null), adj(1000, null)]);
    expect(unirBloqueos([], [cie(1000, 1)])).toEqual([adj(1000, null)]);
  });
  it("no se emparejan con un adjunto de otra sesión ni a más de 5 s, ni dos cierres con el mismo adjunto; un cierre sin errores no cuenta", () => {
    expect(unirBloqueos([adj(1000, "a.mjs", "otra")], [cie(1000, 1)])).toHaveLength(2);
    expect(unirBloqueos([adj(1000, "a.mjs")], [cie(1000 + 6000, 1)])).toHaveLength(2);
    expect(unirBloqueos([adj(1000, "a.mjs")], [cie(1000, 1), cie(2000, 1)])).toHaveLength(2);
    expect(unirBloqueos([adj(1000, "a.mjs")], [cie(1000, 0)])).toEqual([adj(1000, "a.mjs")]);
  });
  it("un bloqueo sin hora no se puede situar: se descarta", () => {
    expect(unirBloqueos([adj(null, "a.mjs")], [cie(null, 1)])).toEqual([]);
  });
});

describe("v1 · En directo: sucesos de las transcripciones", () => {
  it("agente lanzado: solo el tipo; description, prompt, mensajes y resultados no salen", () => {
    const d = agregar(entradaBase(conFicheros(lanza(AHORA - MIN, "constructor"))));
    expect(d.eventos).toEqual([{ hora: iso(AHORA - MIN), tipo: "agente_lanzado", agente: "constructor", hook: null, veredicto: null, agentId: null, duracionMs: null, sesion: "ses-aaaa" }]);
    expect(JSON.stringify(d)).not.toContain(MARCADOR);
  });
  it("un tipo de agente con caracteres raros sale limpio y de 40 como mucho; un agente sin tipo sale con agente null", () => {
    const d = agregar(entradaBase(conFicheros(lanza(AHORA - 2 * MIN, '<img src=x onerror="1">' + "m".repeat(60)), lanza(AHORA - MIN, undefined))));
    expect(d.eventos.every((x) => x.agente === null || /^[\w.:-]{1,40}$/.test(x.agente))).toBe(true);
    expect(d.eventos.map((x) => x.agente === null)).toEqual([true, false]);
  });
  it("los jueces lanzados NO salen como «agente lanzado» (salen del registro como «juez lanzado»)", () => {
    const d = agregar(entradaBase(conFicheros(lanza(AHORA - MIN, "revisor"), lanza(AHORA - MIN, "qa"), lanza(AHORA - MIN, "evaluador"), lanza(AHORA - MIN, "Explore"))));
    expect(filas(d)).toEqual([["agente_lanzado", "Explore", null, null, null]]);
  });
  it("hook bloqueó: el nombre del hook sin ruta; el cierre con error y el adjunto del mismo instante dan UNA fila, y ese cierre no es «turno terminado»", () => {
    const d = agregar(entradaBase(conFicheros(bloquea(AHORA - MIN, 'node "$HOME/.claude/factoria/hooks/cierre.mjs"'), cierreN(AHORA - MIN, 1))));
    expect(filas(d)).toEqual([["hook_bloqueo", null, "cierre.mjs", null, null]]);
    expect(JSON.stringify([d.eventos, d.semaforo])).not.toContain(MARCADOR); // los motivos de la tabla de la v0 salen cortados a 80 caracteres, por diseño: aquí no hay motivo
    expect(JSON.stringify(d.eventos)).not.toContain(".claude/factoria");
  });
  it("hook bloqueó sin adjunto: sale con hook null (no se sabe cuál)", () => {
    expect(filas(agregar(entradaBase(conFicheros(cierreN(AHORA - MIN, 2)))))).toEqual([["hook_bloqueo", null, null, null, null], ["hook_bloqueo", null, null, null, null]]);
  });
  it("turno terminado: un cierre sin errores, con la suma de la duración de sus hooks", () => {
    const d = agregar(entradaBase(conFicheros(cierreN(AHORA - MIN, 0, [30, 12, null]))));
    expect(filas(d)).toEqual([["turno_terminado", null, null, null, 42]]);
    expect(filas(agregar(entradaBase(conFicheros(cierre({ timestamp: iso(AHORA - MIN) })))))).toEqual([["turno_terminado", null, null, null, null]]); // sin duraciones no se inventa un 0
  });
  it("solo los últimos 30 minutos, el más nuevo primero, y el mismo suceso en dos ficheros (sesión reanudada) sale una vez", () => {
    expect(VENTANA_DIRECTO_MS).toBe(30 * MIN);
    const a = lanza(AHORA - 29 * MIN, "constructor");
    const b = lanza(AHORA - 31 * MIN, "viejo");
    const c = lanza(AHORA - 5 * MIN, "reciente");
    const d = agregar(entradaBase({ ficheros: [{ ruta: "1", mtimeMs: AHORA, resumen: resumenDe(a, b, c) }, { ruta: "2", mtimeMs: AHORA, resumen: resumenDe(a) }] }));
    expect(d.eventos.map((x) => x.agente)).toEqual(["reciente", "constructor"]);
    expect(d.directoMin).toBe(30);
  });
  it("la lista se corta en MAX_EVENTOS quedándose con los más nuevos", () => {
    const lineas = Array.from({ length: MAX_EVENTOS + 5 }, (_, i) => lanza(AHORA - 1000 - i * 10, "a" + i));
    const d = agregar(entradaBase(conFicheros(...lineas)));
    expect(d.eventos).toHaveLength(MAX_EVENTOS);
    expect(d.eventos[0].agente).toBe("a0");
  });
});

describe("v1 · En directo: sucesos del registro de jueces", () => {
  const reg = (...entradas) => entradaBase({ registros: [{ rama: "r", rotas: 0, entradas }] });
  it("juez lanzado y juez informó con su veredicto y lo que tardó (mismo agent_id); el resumen no sale", () => {
    const d = agregar(reg(e({ agente: "revisor", veredicto: "lanzado", agent_id: "a1", ts: AHORA - 100e3 }), e({ agent_id: "a1", ts: AHORA - 40e3, veredicto: "no_pasa" })));
    expect(d.eventos).toEqual([
      { hora: iso(AHORA - 40e3), tipo: "juez_informo", agente: "revisor", hook: null, veredicto: "no_pasa", agentId: "a1", duracionMs: 60e3, sesion: "x" },
      { hora: iso(AHORA - 100e3), tipo: "juez_lanzado", agente: "revisor", hook: null, veredicto: null, agentId: "a1", duracionMs: null, sesion: "x" },
    ]);
    expect(JSON.stringify(d)).not.toContain(MARCADOR);
  });
  it("el informe de un juez lanzado hace más de 30 min también da su duración", () => {
    const d = agregar(reg(e({ veredicto: "lanzado", agent_id: "a1", ts: AHORA - 40 * MIN }), e({ agent_id: "a1", ts: AHORA - 29 * MIN })));
    expect(filas(d)).toEqual([["juez_informo", "revisor", null, "pasa", 11 * MIN]]);
  });
  it("un veredicto fuera del vocabulario sale como «sin_veredicto»; los agentes que no son jueces y los apuntes viejos no salen", () => {
    const d = agregar(reg(e({ veredicto: "<b>inventado</b>", agent_id: "a3", ts: AHORA - 3e3 }), e({ agente: "constructor", ts: AHORA - 5e3 }), e({ ts: AHORA - 40 * MIN, agent_id: "viejo" }), e({ veredicto: "no_se", agent_id: "a5", ts: AHORA - 4e3 })));
    expect(filas(d)).toEqual([["juez_informo", "revisor", null, "sin_veredicto", null], ["juez_informo", "revisor", null, "no_se", null]]);
  });
  it("sin agent_id no hay enlace ni duración (dato antiguo)", () => {
    const d = agregar(reg(e({ veredicto: "lanzado", ts: AHORA - 9e3 }), e({ ts: AHORA - 3e3 })));
    expect(d.eventos.map((x) => [x.tipo, x.agentId, x.duracionMs])).toEqual([["juez_informo", null, null], ["juez_lanzado", null, null]]);
  });
  it("mezcla transcripciones y registro, ordenado por hora", () => {
    const d = agregar(entradaBase({ ...conFicheros(lanza(AHORA - 30e3, "constructor")), registros: [{ rama: "r", rotas: 0, entradas: [e({ veredicto: "lanzado", agent_id: "a1", ts: AHORA - 20e3 }), e({ agent_id: "a9", ts: AHORA - 45e3 })] }] }));
    expect(d.eventos.map((x) => x.tipo)).toEqual(["juez_lanzado", "agente_lanzado", "juez_informo"]);
  });
  it("la lista de tipos es cerrada y la entrada rica los trae todos", () => {
    const d = agregar(entradaRica());
    expect(d.eventos.length).toBeGreaterThan(0);
    expect(new Set(d.eventos.map((x) => x.tipo))).toEqual(new Set(TIPOS_EVENTO));
  });
});

describe("v1 · semáforo", () => {
  const conUltimo = (haceMs, extra = {}) => entradaBase({ ...conFicheros(ev("sx", haceMs)), ...extra });
  it("hooks vivos: verde < 10 min, ámbar < 60 min, rojo más; la copia distinta lo pone rojo", () => {
    expect(UMBRALES_HOOKS_VIVOS.okMs).toBe(10 * MIN);
    expect(UMBRALES_HOOKS_VIVOS.avisoMs).toBe(60 * MIN);
    const nivel = (ms, extra) => agregar(conUltimo(ms, extra)).semaforo.hooksVivos;
    expect(nivel(9 * MIN)).toEqual({ nivel: "ok", ultimo: iso(AHORA - 9 * MIN), copiaOk: true });
    expect(nivel(11 * MIN).nivel).toBe("aviso");
    expect(nivel(59 * MIN).nivel).toBe("aviso");
    expect(nivel(61 * MIN).nivel).toBe("mal");
    expect(nivel(1000, { copia: { ...copiaOk, ok: false } })).toMatchObject({ nivel: "mal", copiaOk: false });
    expect(agregar(entradaBase()).semaforo.hooksVivos).toEqual({ nivel: "mal", ultimo: null, copiaOk: true }); // ningún evento visto: rojo, no verde
  });
  it("bloqueos hoy: desde la medianoche de Madrid, con cuántos tienen hook identificado", () => {
    const medianoche = inicioDiaMadrid(AHORA);
    const d = agregar(entradaBase(conFicheros(bloquea(medianoche - 1000, "ayer.mjs"), bloquea(medianoche + 1000, "hoy.mjs"), bloquea(AHORA - 1000, null), cierreN(AHORA - 3 * MIN, 1), cierreN(AHORA - 4 * MIN, 0))));
    expect(d.semaforo.bloqueosHoy).toEqual({ nivel: "aviso", total: 3, identificados: 1 });
    expect(agregar(entradaBase(conFicheros(bloquea(medianoche - 1000, "ayer.mjs")))).semaforo.bloqueosHoy).toEqual({ nivel: "ok", total: 0, identificados: 0 });
  });
  it("bloqueos hoy cuenta una vez el bloqueo visto por el adjunto y por el cierre", () => {
    const d = agregar(entradaBase(conFicheros(bloquea(AHORA - MIN, "a.mjs"), cierreN(AHORA - MIN, 1))));
    expect(d.semaforo.bloqueosHoy).toMatchObject({ total: 1, identificados: 1 });
  });
  it("rondas abiertas: jueces lanzados sin informe (mismo agent_id); verde si 0", () => {
    const rondas = (...entradas) => agregar(entradaBase({ registros: [{ rama: "r", rotas: 0, entradas }] })).semaforo.rondasAbiertas;
    expect(rondas()).toEqual({ nivel: "ok", n: 0 });
    expect(rondas(e({ veredicto: "lanzado", agent_id: "a1", ts: AHORA - MIN }))).toEqual({ nivel: "aviso", n: 1 });
    expect(rondas(e({ veredicto: "lanzado", agent_id: "a1", ts: AHORA - MIN }), e({ agent_id: "a1" }))).toEqual({ nivel: "ok", n: 0 });
    expect(rondas(e({ veredicto: "lanzado", agent_id: "a1", ts: AHORA - MIN }), e({ agent_id: "otro" }))).toEqual({ nivel: "aviso", n: 1 }); // otro id: no lo cierra
    expect(rondas(e({ veredicto: "lanzado", agent_id: "a1", ts: AHORA - MIN }), e({ agent_id: "a1", veredicto: "sin_veredicto" }))).toEqual({ nivel: "ok", n: 0 }); // informó, aunque ilegible
    expect(rondas(e({ agente: "constructor", veredicto: "lanzado", agent_id: "c1", ts: AHORA - MIN }))).toEqual({ nivel: "ok", n: 0 }); // no es un juez
  });
  it("un lanzado sin informe de hace más de RONDA_ABIERTA_MAX_MS ya no cuenta como abierto", () => {
    const lanzado = (ts) => agregar(entradaBase({ registros: [{ rama: "r", rotas: 0, entradas: [e({ veredicto: "lanzado", agent_id: "a1", ts })] }] }));
    expect(lanzado(AHORA - RONDA_ABIERTA_MAX_MS + 1000).semaforo.rondasAbiertas.n).toBe(1);
    expect(lanzado(AHORA - RONDA_ABIERTA_MAX_MS - 1000).semaforo.rondasAbiertas.n).toBe(0);
  });
});

describe("v1 · rondas por tarea (agrupadas por rama)", () => {
  const rama = (nombre, entradas) => ({ rama: nombre, rotas: 0, entradas });
  const ronda = (id, lanzadoHace, informeHace, extra = {}, agente = "revisor") => [e({ agente, veredicto: "lanzado", agent_id: id, ts: AHORA - lanzadoHace }), e({ agente, agent_id: id, ts: AHORA - informeHace, ...extra })];
  const ramas = (...rs) => agregar(entradaBase({ registros: rs })).ramas;

  it("una marca por informe, en orden, con el juez, el veredicto y cuánto tardó; el total de rondas y el tiempo acumulado", () => {
    const [r] = ramas(rama("feat_a", [...ronda("a1", 900e3, 800e3), ...ronda("a2", 700e3, 600e3, { veredicto: "no_pasa" }, "qa"), ...ronda("a3", 500e3, 440e3, { veredicto: "no_se" }), e({ agent_id: "a4", veredicto: "sin_veredicto", ts: AHORA - 100e3 })]));
    expect(r).toMatchObject({ rama: "feat_a", rondas: 4, tiempoMs: 100e3 + 100e3 + 60e3, masMarcas: 0 });
    expect(r.marcas.map((m) => [m.agente, m.veredicto, m.ms, m.abierta, m.fiable])).toEqual([["revisor", "pasa", 100e3, false, true], ["qa", "no_pasa", 100e3, false, true], ["revisor", "no_se", 60e3, false, true], ["revisor", "sin_veredicto", null, false, true]]);
    expect(JSON.stringify(r)).not.toContain(MARCADOR);
  });
  it("un lanzado sin informe es una marca abierta (no cuenta como ronda); pasado el límite, abierta=false", () => {
    const [r] = ramas(rama("r", [...ronda("a1", 900e3, 800e3), e({ veredicto: "lanzado", agent_id: "a2", ts: AHORA - 30e3 }), e({ veredicto: "lanzado", agent_id: "a3", ts: AHORA - RONDA_ABIERTA_MAX_MS - 5000 })]));
    expect(r.rondas).toBe(1);
    expect(r.marcas.map((m) => [m.veredicto, m.abierta])).toEqual([["lanzado", false], ["pasa", false], ["lanzado", true]]);
  });
  it("apuntes antiguos sin agent_id: marca «no fiable» y sin duración; los agentes que no son jueces no son marcas", () => {
    const [r] = ramas(rama("r", [e({ ts: AHORA - 9e3 }), e({ agente: "constructor", ts: AHORA - 8e3, agent_id: "c1" }), ...ronda("a1", 7000, 6000)]));
    expect(r.marcas.map((m) => [m.fiable, m.ms])).toEqual([[false, null], [true, 1000]]);
    expect(r.rondas).toBe(2);
    expect(r.tiempoMs).toBe(1000);
  });
  it("sin ninguna duración medible el tiempo acumulado es null (no 0)", () => {
    expect(ramas(rama("r", [e()]))[0].tiempoMs).toBeNull();
  });
  it("un mismo agent_id con dos apuntes cuenta una ronda (manda el último)", () => {
    const [r] = ramas(rama("r", [...ronda("a1", 9000, 8000, { veredicto: "no_pasa" }), e({ agent_id: "a1", ts: AHORA - 7000 })]));
    expect(r.rondas).toBe(1);
    expect(r.marcas[0].veredicto).toBe("pasa");
  });
  it("las MAX_RAMAS más recientes, la más reciente primero; una rama solo de constructores no sale", () => {
    const lista = Array.from({ length: MAX_RAMAS + 3 }, (_, i) => rama("rama-" + i, ronda("id" + i, 900e3 + i * 1000, 800e3 + i * 1000)));
    lista.push(rama("solo-constructor", [e({ agente: "constructor", agent_id: "c1", ts: AHORA - 1000 })]));
    const rs = ramas(...lista);
    expect(rs).toHaveLength(MAX_RAMAS);
    expect(rs.map((r) => r.rama)).toEqual(Array.from({ length: MAX_RAMAS }, (_, i) => "rama-" + i));
  });
  it("muchas marcas: salen las MAX_MARCAS más nuevas, y las demás se cuentan en masMarcas; rondas y tiempo siguen siendo el total", () => {
    const n = MAX_MARCAS + 5;
    const todas = Array.from({ length: n }, (_, i) => ronda("i" + i, 100e3 + (n - i) * 1000, 90e3 + (n - i) * 1000)).flat();
    const [r] = ramas(rama("r", todas));
    expect(r.marcas).toHaveLength(MAX_MARCAS);
    expect([r.masMarcas, r.rondas, r.tiempoMs]).toEqual([5, n, n * 10e3]);
  });
  it("los jueces abiertos del semáforo cuentan en TODAS las ramas, no solo en las que se enseñan", () => {
    const lista = Array.from({ length: MAX_RAMAS + 3 }, (_, i) => rama("rama-" + i, [e({ veredicto: "lanzado", agent_id: "id" + i, ts: AHORA - 1000 - i })]));
    expect(agregar(entradaBase({ registros: lista })).semaforo.rondasAbiertas.n).toBe(MAX_RAMAS + 3);
  });
});

// ---- v1: tokens y coste ESTIMADO (a precio de API) por día, categoría, sesión, rama y ronda de juez ----
describe("v1 · coste estimado", () => {
  const padre = "ses-padre01";
  const lineaPadre = () => ({ type: "mode", timestamp: iso(AHORA - 1000), ...base({ sessionId: padre, gitBranch: "rama-padre" }) });
  const uso = (id, modelo, u, extra = {}) => ({ type: "assistant", uuid: "u-" + id, timestamp: iso(AHORA - 1000), ...base({ sessionId: padre, gitBranch: "rama-padre" }), isSidechain: true, message: { id, model: modelo, usage: u, content: [{ type: "text", text: MARCADOR }] }, ...extra });
  const subDe = (agentId, tipo, ...lineas) => ({ ruta: "s-" + agentId, agentId, sesionPadre: padre, tipo, resumen: resumenDe(...lineas) });
  const U = { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 10000, cache_creation_input_tokens: 4000, cache_creation: { ephemeral_5m_input_tokens: 3000, ephemeral_1h_input_tokens: 1000 } };
  const COSTE_U = (1000 * 3 + 2000 * 15 + 10000 * 0.3 + 3000 * 3.75 + 1000 * 6) / 1e6; // con los precios de prueba
  const TOK_U = 1000 + 2000 + 10000 + 4000;
  const coste = (extra) => agregar(entradaBase({ ...conFicheros(lineaPadre()), ...extra })).coste;

  it("el coste sale exacto: entrada, salida, lectura de caché y escritura de caché a 5 min y a 1 h, cada una a su tarifa", () => {
    const c = coste({ subagentes: [subDe("a1", "revisor", uso("m1", "m-a", U))] });
    expect(c.total.jueces).toEqual({ tokens: TOK_U, costeUSD: COSTE_U, tokensSinPrecio: 0 });
    expect(COSTE_U).toBeCloseTo(0.05325, 9);
  });

  it("si el uso no separa la escritura de caché, todo va a la tarifa de 5 min", () => {
    const sinSplit = { ...U, cache_creation: undefined };
    const c = coste({ subagentes: [subDe("a1", "revisor", uso("m1", "m-a", sinSplit))] });
    expect(c.total.jueces.costeUSD).toBeCloseTo((1000 * 3 + 2000 * 15 + 10000 * 0.3 + 4000 * 3.75) / 1e6, 9);
  });

  it("un mensaje repetido (misma message.id, en una línea repetida o en dos ficheros) cuenta una vez, con lo mayor de cada cifra", () => {
    const a = uso("m1", "m-a", { ...U, output_tokens: 10 });
    const b = uso("m1", "m-a", U);
    const c = coste({ subagentes: [subDe("a1", "revisor", a, b), subDe("a2", "revisor", b)] });
    expect(c.total.jueces.tokens).toBe(TOK_U);
  });

  it("el mismo mensaje en la transcripción principal y en la del subagente cuenta una vez (el del subagente, que sabe su tipo)", () => {
    const m = uso("m1", "m-a", U);
    const d = agregar(entradaBase({ ...conFicheros(lineaPadre(), m), subagentes: [subDe("a1", "revisor", m)] })).coste;
    expect(d.total.jueces.tokens).toBe(TOK_U);
    expect(d.total.principal.tokens).toBe(0);
  });

  it("categorías: jueces = revisor, qa, evaluador, seguridad, auditor-datos; el resto de subagentes, otros; las transcripciones principales, principal", () => {
    const una = (id, tipo) => subDe(id, tipo, uso("m-" + id, "m-a", U));
    const tipos = ["revisor", "qa", "evaluador", "seguridad", "auditor-datos", "constructor", "general-purpose", "Explore", null];
    const c = coste({ subagentes: tipos.map((t, i) => una("x" + i, t)), ...conFicheros(lineaPadre(), { ...uso("mp", "m-a", U), isSidechain: false }) });
    expect(c.total.jueces.tokens).toBe(5 * TOK_U);
    expect(c.total.otros.tokens).toBe(4 * TOK_U);
    expect(c.total.principal.tokens).toBe(TOK_U);
    expect(c.total.total.tokens).toBe(10 * TOK_U);
    expect(c.repartoTokens).toEqual({ jueces: 50, otros: 40, principal: 10 });
    expect(c.repartoCoste).toEqual({ jueces: 50, otros: 40, principal: 10 });
  });

  it("por día de Madrid: las 00:30 de Madrid son del día siguiente en UTC; y lo de fuera de la ventana de días no cuenta", () => {
    const en = (id, t) => uso(id, "m-a", U, { timestamp: iso(t) });
    const c = coste({ subagentes: [subDe("a1", "revisor", en("d1", Date.parse("2026-10-23T22:30:00Z")), en("d2", Date.parse("2026-10-23T21:30:00Z")), en("d3", AHORA - 8 * DIA))] });
    expect(c.porDia.map((x) => [x.dia, x.jueces.tokens])).toEqual([["2026-10-23", TOK_U], ["2026-10-24", TOK_U]]);
    expect(c.total.jueces.tokens).toBe(2 * TOK_U);
  });

  it("por sesión (id corto, con la rama de la sesión PADRE) y por rama, con el % de jueces; una fila por sesión aunque haya varios subagentes", () => {
    const c = coste({ subagentes: [subDe("a1", "revisor", uso("m1", "m-a", U)), subDe("a2", "constructor", uso("m2", "m-a", U), uso("m3", "m-a", U))] });
    expect(c.porSesion).toHaveLength(1);
    expect(c.porSesion[0]).toMatchObject({ sesion: "ses-padr", rama: "rama-padre", pctJueces: 33.3 });
    expect(c.porSesion[0].total.tokens).toBe(3 * TOK_U);
    expect(c.porRama).toEqual([expect.objectContaining({ rama: "rama-padre", pctJueces: 33.3 })]);
  });

  it("un modelo sin precio: los tokens salen, el coste de esa parte «sin precio» (null) y el total solo suma lo que tiene precio", () => {
    const sin = subDe("a1", "revisor", uso("m1", "m-sin", U));
    const c = coste({ subagentes: [sin] });
    expect(c.total.jueces).toEqual({ tokens: TOK_U, costeUSD: null, tokensSinPrecio: TOK_U });
    expect(c.modelosSinPrecio).toEqual(["m-sin"]);
    expect(c.repartoCoste).toBeNull();
    const mezcla = coste({ subagentes: [sin, subDe("a2", "revisor", uso("m2", "m-a", U)), subDe("a3", "revisor", uso("m3", "otro-modelo", U))] });
    expect(mezcla.total.jueces).toEqual({ tokens: 3 * TOK_U, costeUSD: COSTE_U, tokensSinPrecio: 2 * TOK_U });
    expect(mezcla.modelosSinPrecio).toEqual(["m-sin", "otro-modelo"]);
  });

  it("los modelos sintéticos no cuentan", () => {
    expect(coste({ subagentes: [subDe("a1", "revisor", uso("m1", "<synthetic>", U))] }).total.total.tokens).toBe(0);
  });

  it("precios: fecha y fuente salen con el coste; sin precios.json (null) todo es «sin precio»", () => {
    expect(coste({}).precios).toEqual({ fecha: PRECIOS.fecha, fuente: PRECIOS.fuente });
    const c = coste({ precios: null, subagentes: [subDe("a1", "revisor", uso("m1", "m-a", U))] });
    expect(c.total.jueces.costeUSD).toBeNull();
    expect(c.precios).toBeNull();
  });

  it("validarPrecios: forma esperada; un precio que falta o no es número es un error, no un cero", () => {
    expect(() => validarPrecios(PRECIOS)).not.toThrow();
    expect(() => validarPrecios({ ...PRECIOS, fecha: undefined })).toThrow(/fecha/);
    expect(() => validarPrecios({ ...PRECIOS, modelos: { x: { entrada: 1 } } })).toThrow(/x/);
    expect(() => validarPrecios({ ...PRECIOS, modelos: { x: { ...PRECIOS.modelos["m-a"], salida: "3" } } })).toThrow(/salida/);
    expect(() => validarPrecios({ ...PRECIOS, modelos: { x: null } })).not.toThrow(); // null = sin precio, a propósito
  });

  it("sin contenido: ni el texto de los mensajes ni nada salvo cifras y nombres cerrados", () => {
    const c = coste({ subagentes: [subDe("a1", "revisor", uso("m1", "m-a", U))] });
    expect(JSON.stringify(c)).not.toContain(MARCADOR);
  });
});

describe("v1 · coste por ronda de juez (unión por agent_id)", () => {
  const padre = "ses-padre01";
  const uso = (id, u, t = AHORA - 1000) => ({ type: "assistant", uuid: "u-" + id, timestamp: iso(t), ...base({ sessionId: padre }), isSidechain: true, message: { id, model: "m-a", usage: u, content: [] } });
  const sub = (agentId, ...lineas) => ({ ruta: "s-" + agentId, agentId, sesionPadre: padre, tipo: "revisor", resumen: resumenDe(...lineas) });
  const U1 = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const C1 = (1000 * 3 + 1000 * 15) / 1e6;
  const registro = (...entradas) => [{ rama: "r", rotas: 0, entradas }];
  const rondas = (subagentes, ...entradas) => agregar(entradaBase({ registros: registro(...entradas), subagentes })).ramas[0];

  it("cada informe lleva los tokens y el coste de SU juez (el del mismo agent_id); la rama suma", () => {
    const r = rondas([sub("a1", uso("m1", U1)), sub("a2", uso("m2", U1), uso("m3", U1))], e({ agent_id: "a1" }), e({ agent_id: "a2", ts: AHORA - 4000 }));
    expect(r.marcas.map((m) => [m.tokens, m.costeUSD, m.tokensSinPrecio])).toEqual([[2000, C1, 0], [4000, 2 * C1, 0]]);
    expect(r).toMatchObject({ tokens: 6000, costeUSD: 3 * C1, tokensSinPrecio: 0, rondasConCoste: 2 });
  });

  it("un juez sin transcripción, o un apunte sin agent_id (dato antiguo), es «sin dato» (null), nunca 0; la rama dice a cuántas rondas llega el coste", () => {
    const r = rondas([sub("a1", uso("m1", U1))], e({ agent_id: "a1", ts: AHORA - 5000 }), e({ agent_id: "huerfano", ts: AHORA - 4000 }), e({ ts: AHORA - 3000 }));
    expect(r.marcas.map((m) => m.tokens)).toEqual([2000, null, null]);
    expect(r.marcas.map((m) => m.costeUSD)).toEqual([C1, null, null]);
    expect(r).toMatchObject({ tokens: 2000, costeUSD: C1, rondasConCoste: 1, rondas: 3 });
    const nada = rondas([], e({ agent_id: "a1" }));
    expect(nada).toMatchObject({ tokens: null, costeUSD: null, tokensSinPrecio: null, rondasConCoste: 0 });
  });

  it("un juez con modelo sin precio da tokens y coste null en su marca", () => {
    const x = { ...sub("a1", uso("m1", U1)) };
    x.resumen.msgs.get("m1").modelo = "sin-precio";
    const r = rondas([x], e({ agent_id: "a1" }));
    expect(r.marcas[0]).toMatchObject({ tokens: 2000, costeUSD: null, tokensSinPrecio: 2000 });
    expect(r).toMatchObject({ tokens: 2000, costeUSD: null, tokensSinPrecio: 2000 });
  });

  it("un lanzado sin informe no lleva coste (aún no hay ronda)", () => {
    const r = rondas([sub("a1", uso("m1", U1))], e({ veredicto: "lanzado", agent_id: "a1", ts: AHORA - 5000 }));
    expect(r.marcas[0]).toMatchObject({ veredicto: "lanzado", tokens: null, costeUSD: null });
    expect(r.rondasConCoste).toBe(0);
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
  const carpetaSub = join(home, ".claude", "projects", "p1", "ses-aaaa1111", "subagents");
  const usoDe = (id) => L({ type: "assistant", uuid: "us-" + id, timestamp: iso(t - 2000), ...base(), isSidechain: true, message: { id: "ms-" + id, model: "m-a", usage: { input_tokens: 1000, output_tokens: 1000 }, content: [{ type: "text", text: MARCADOR }] } });
  escribir(join(carpetaSub, "agent-a1.jsonl"), usoDe("a1"));
  escribir(join(carpetaSub, "agent-a1.meta.json"), JSON.stringify({ agentType: "revisor", description: MARCADOR, prompt: MARCADOR }));
  escribir(join(carpetaSub, "agent-q1.jsonl"), usoDe("q1")); // sin meta: tipo desconocido
  escribir(join(dir, "precios.json"), JSON.stringify(PRECIOS));
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
    srv = crearServidor({ home, repoAlvaro: alvaro, dias: 7, rutaPrecios: join(dir, "precios.json"), ...extra });
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
    expect([...new Set(rutas(d))].sort()).toEqual([".coste.modelosSinPrecio[]", ".coste.porRama[].rama", ".coste.porSesion[].rama", ".eventos[].agente", ".ineficiencias.costes.sesiones[].carpeta", ".ineficiencias.costes.sesiones[].rama", ".ineficiencias.subagentes[].tipo", ".ineficiencias.tokens[].modelo", ".tiempos[].carpeta", ".tiempos[].rama"]);
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


  // ---- v1: «En directo» lee solo el tramo reciente de cada transcripción y, después, solo lo que se añade ----
  const evTipos = (d) => d.eventos.map((x) => x.tipo).sort();
  const propios = (lecturas) => lecturas.filter(([r]) => r === fSesion());
  const lineaAgente = (tipo, t = Date.now()) => L({ type: "assistant", uuid: "n-" + tipo, timestamp: iso(t), ...base(), message: { id: "mn-" + tipo, model: "m", usage: {}, content: [{ type: "tool_use", id: "tn-" + tipo, name: "Agent", input: { subagent_type: tipo, prompt: MARCADOR } }] } });

  it("En directo con ficheros reales: agente, UN bloqueo (adjunto y cierre del mismo instante), juez lanzado y dos informes; sin contenido", async () => {
    const r = await pedir(await arrancar());
    const d = JSON.parse(r.cuerpo);
    expect(d.errores).toEqual([]);
    expect(evTipos(d)).toEqual(["agente_lanzado", "hook_bloqueo", "juez_informo", "juez_informo", "juez_lanzado"]);
    expect(d.eventos.find((x) => x.tipo === "hook_bloqueo")).toMatchObject({ hook: "c.mjs", sesion: "ses-aaaa" });
    expect(d.eventos.find((x) => x.tipo === "juez_informo" && x.agentId === "a1")).toMatchObject({ duracionMs: 500, veredicto: "pasa" });
    expect(JSON.stringify(d.eventos)).not.toContain(MARCADOR);
    expect(d.semaforo.bloqueosHoy).toMatchObject({ total: 1, identificados: 1 });
  });

  it("En directo: la primera lectura de un fichero pequeño lo lee entero; sin cambios no lee nada; al crecer, solo lo añadido", async () => {
    const lecturas = [];
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7, alLeerDirecto: (ruta, bytes) => lecturas.push([ruta, bytes]) });
    const d1 = await rec.recoger(Date.now());
    expect(propios(lecturas)).toEqual([[fSesion(), statSync(fSesion()).size]]);
    await rec.recoger(Date.now());
    expect(propios(lecturas)).toHaveLength(1); // nada que leer
    const nueva = lineaAgente("reciente");
    appendFileSync(fSesion(), nueva);
    const d3 = await rec.recoger(Date.now());
    expect(propios(lecturas)[1][1]).toBe(Buffer.byteLength(nueva)); // solo la línea nueva
    expect(d3.eventos.filter((x) => x.agente === "reciente")).toHaveLength(1);
    expect(d3.eventos).toHaveLength(d1.eventos.length + 1); // y no se duplica lo anterior
  });

  it("En directo: una línea a medio escribir no se interpreta hasta que termina, y no rompe nada", async () => {
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7 });
    const d1 = await rec.recoger(Date.now());
    const linea = lineaAgente("partida");
    appendFileSync(fSesion(), linea.slice(0, 40));
    const d2 = await rec.recoger(Date.now());
    expect(d2.eventos).toHaveLength(d1.eventos.length);
    expect(d2.errores).toEqual([]);
    appendFileSync(fSesion(), linea.slice(40));
    const d3 = await rec.recoger(Date.now());
    expect(d3.eventos.filter((x) => x.agente === "partida")).toHaveLength(1);
  });

  it("En directo: de un fichero enorme lee solo el final (lo reciente), no todo", async () => {
    const t = Date.now();
    const viejo = (i) => L({ type: "mode", timestamp: iso(t - 3 * 3600e3 + i), ...base({ sessionId: "ses-grande1" }), relleno: "x".repeat(1000) });
    const f = join(home, ".claude", "projects", "p3", "ses-grande1.jsonl");
    escribir(f, Array.from({ length: 3000 }, (_, i) => viejo(i)).join("") + lineaAgente("grande", t - 1000).replace("ses-aaaa1111", "ses-grande1"));
    const lecturas = [];
    const d = await crearRecolector({ home, repoAlvaro: alvaro, dias: 7, alLeerDirecto: (ruta, bytes) => lecturas.push([ruta, bytes]) }).recoger(Date.now());
    const tam = statSync(f).size;
    expect(tam).toBeGreaterThan(3e6);
    const leido = lecturas.filter(([r]) => r === f).reduce((n, [, b]) => n + b, 0);
    expect(leido).toBeGreaterThan(0); // (que no sea un cero porque nadie leyó)
    expect(leido).toBeLessThan(tam / 5); // solo el final (el paso es de 256 KB), no los 3 MB
    expect(d.eventos.filter((x) => x.agente === "grande")).toHaveLength(1);
  });

  it("En directo: una transcripción sin tocar en 30 min no se mira (solo la lectura entera, con caché, de la v0)", async () => {
    const hace2h = new Date(Date.now() - 2 * 3600e3);
    utimesSync(fSesion(), hace2h, hace2h);
    const lecturas = [];
    const d = await crearRecolector({ home, repoAlvaro: alvaro, dias: 7, alLeerDirecto: (ruta, bytes) => lecturas.push([ruta, bytes]) }).recoger(Date.now());
    expect(propios(lecturas)).toEqual([]);
    expect(d.eventos.map((x) => x.agente)).not.toContain(PERMITIDO);
    expect(d.estado.sesiones).toBe(2); // y la v0 sigue viendo la sesión
  });

  it("En directo: con el paso del tiempo los sucesos salen de la ventana, y la lista vacía es [] (sin actividad), no null (sin dato)", async () => {
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7 });
    expect((await rec.recoger(Date.now())).eventos.length).toBeGreaterThan(0);
    const mas = await rec.recoger(Date.now() + 31 * 60e3);
    expect(mas.eventos).toEqual([]);
    expect(mas.errores).toEqual([]);
  });

  it("En directo: un fichero reescrito más corto se vuelve a leer desde el principio, sin duplicar", async () => {
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7 });
    await rec.recoger(Date.now());
    writeFileSync(fSesion(), lineaAgente("tras-reescribir"));
    const d = await rec.recoger(Date.now());
    expect(d.eventos.filter((x) => x.tipo === "agente_lanzado").map((x) => x.agente)).toEqual(["tras-reescribir"]);
  });

  it("En directo: si falla la lectura del tramo reciente, es un error de transcripciones y eventos sale null", async () => {
    const crearLector = (ruta, o) => {
      if (ruta === fSesion() && o?.start !== undefined) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      return createReadStream(ruta, o);
    };
    const d = await crearRecolector({ home, repoAlvaro: alvaro, dias: 7, crearLector }).recoger(Date.now());
    expect(d.errores.map((x) => x.fuente)).toEqual(["transcripciones"]);
    expect([d.eventos, d.hooks, d.semaforo.bloqueosHoy]).toEqual([null, null, null]);
  });

  // ---- v1: los subagentes (projects/<proyecto>/<sesion>/subagents/agent-<id>.jsonl + .meta.json) ----
  const rutaSub = (id) => join(home, ".claude", "projects", "p1", "ses-aaaa1111", "subagents", `agent-${id}.jsonl`);
  const metaSub = (id) => join(home, ".claude", "projects", "p1", "ses-aaaa1111", "subagents", `agent-${id}.meta.json`);
  const usoSub = (id, extra = {}) => L({ type: "assistant", uuid: "us-" + id, timestamp: iso(Date.now() - 2000), ...base(), isSidechain: true, message: { id: "ms-" + id, model: "m-a", usage: { input_tokens: 1000, output_tokens: 1000 }, content: [{ type: "text", text: MARCADOR }] }, ...extra });
  const TOK_SUB = 2000;
  const tokensDe = (d) => [d.coste.total.jueces.tokens, d.coste.total.otros.tokens, d.coste.total.principal.tokens];

  it("lee los subagentes: el tipo sale del meta (solo agentType: description y prompt no salen), sin meta es «otros», y une cada juez con su ronda por agent_id", async () => {
    const r = await pedir(await arrancar());
    const d = JSON.parse(r.cuerpo);
    expect(d.errores).toEqual([]);
    expect(tokensDe(d)).toEqual([TOK_SUB, TOK_SUB, 7 + 3]);
    expect(d.coste.total.jueces.costeUSD).toBeCloseTo((1000 * 3 + 1000 * 15) / 1e6, 9);
    expect(d.ramas[0].rama).toBe("ops_zz");
    expect(d.ramas[0].marcas.map((m) => m.tokens)).toEqual([TOK_SUB, null]); // a1 tiene transcripción; a2, no: sin dato
    expect(r.cuerpo).not.toContain(MARCADOR);
  });

  it("subagentes: caché por fecha y tamaño (no se relee lo que no cambió) y se relee entero lo que crece", async () => {
    const lecturas = [];
    const rec = crearRecolector({ home, repoAlvaro: alvaro, dias: 7, rutaPrecios: join(dir, "precios.json"), alLeer: (ruta) => lecturas.push(ruta) });
    await rec.recoger(Date.now());
    const propias = () => lecturas.filter((x) => x.includes("subagents")).length;
    expect(propias()).toBe(2);
    await rec.recoger(Date.now());
    expect(propias()).toBe(2);
    appendFileSync(rutaSub("a1"), usoSub("otra"));
    const d = await rec.recoger(Date.now());
    expect(propias()).toBe(3);
    expect(d.coste.total.jueces.tokens).toBe(2 * TOK_SUB);
  });

  it("subagentes: fuera de la ventana de días no se leen; las líneas rotas se cuentan y no tumban; lo que no es agent-*.jsonl se ignora", async () => {
    const viejo = new Date(Date.now() - 20 * DIA);
    utimesSync(rutaSub("q1"), viejo, viejo);
    appendFileSync(rutaSub("a1"), '{"usage": roto\n');
    escribir(join(home, ".claude", "projects", "p1", "ses-aaaa1111", "subagents", "otro.jsonl"), usoSub("ignorado"));
    const d = JSON.parse((await pedir(await arrancar())).cuerpo);
    expect(d.errores).toEqual([]);
    expect(tokensDe(d).slice(0, 2)).toEqual([TOK_SUB, 0]);
    expect(d.coste.lineasRotas).toBe(1);
  });

  it("subagentes: un meta ilegible es un error de transcripciones (coste null), sin enseñar su texto", async () => {
    escribir(metaSub("a1"), "{roto " + MARCADOR);
    const r = await pedir(await arrancar());
    const d = JSON.parse(r.cuerpo);
    expect(d.errores.map((x) => x.fuente)).toEqual(["transcripciones"]);
    expect(d.coste).toBeNull();
    expect(r.cuerpo).not.toContain(MARCADOR);
  });

  it("precios.json ilegible o ausente es un error de la fuente «precios»: los tokens siguen y el coste es null (sin precio), no 0", async () => {
    for (const rotura of [() => escribir(join(dir, "precios.json"), "{roto"), () => rmSync(join(dir, "precios.json")), () => escribir(join(dir, "precios.json"), JSON.stringify({ fecha: "x" }))]) {
      rotura();
      const d = await crearRecolector({ home, repoAlvaro: alvaro, dias: 7, rutaPrecios: join(dir, "precios.json") }).recoger(Date.now());
      expect(d.errores.map((x) => x.fuente)).toEqual(["precios"]);
      expect(d.coste.total.jueces.tokens).toBe(TOK_SUB);
      expect(d.coste.total.jueces.costeUSD).toBeNull();
      expect(d.coste.precios).toBeNull();
    }
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
    if (caidas.includes("precios")) escribir(join(dir, "precios.json"), "{roto");
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
