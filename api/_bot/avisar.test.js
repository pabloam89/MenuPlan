// Los fallos del bot con motivo y sitio de un vocabulario cerrado (#211).
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { motivoDe, avisarFallo, fallaCon, seguirCon, contesto, SIN_LEER } from "./avisar.js";
import { MOTIVOS_FALLO, SITIOS_FALLO } from "../../src/lib/vocabularios.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Un error como los que lanza db.js con lo que contesta PostgREST. */
const deLaBase = (status, cuerpo) => Object.assign(new Error(`GET /rest/v1/x → ${status} ${cuerpo.code ?? ""} ${cuerpo.message ?? ""}`), { status, codigo: cuerpo.code ?? null });
const deRed = (code) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

describe("motivoDe: un motivo de la lista para cada error", () => {
  const casos = {
    red: [deRed("ECONNRESET"), deRed("ENOTFOUND"), new TypeError("fetch failed")],
    tiempo: [Object.assign(new Error("This operation was aborted"), { name: "AbortError" }), deRed("UND_ERR_CONNECT_TIMEOUT"), deLaBase(500, { code: "57014", message: "canceling statement due to statement timeout" })],
    sin_sesion: [deLaBase(401, { message: "Invalid API key" }), deLaBase(401, { code: "PGRST301", message: "JWT expired" })],
    permiso: [deLaBase(403, { message: "forbidden" }), deLaBase(401, { code: "42501", message: "permission denied for table x" })],
    no_existe: [deLaBase(404, { code: "42P01", message: "relation does not exist" }), deLaBase(406, { code: "PGRST116", message: "0 rows" }), deLaBase(404, { message: "" })],
    conflicto: [deLaBase(409, { code: "23505", message: "duplicate key" }), deLaBase(409, { message: "" })],
    datos_invalidos: [deLaBase(400, { code: "23502", message: "null value" }), deLaBase(400, { code: "23514", message: "check" }), deLaBase(400, { code: "22P02", message: "invalid input syntax" }), deLaBase(400, { code: "P0001", message: "Invite expired" }), new SyntaxError("Unexpected token < in JSON")],
    limite: [deLaBase(429, { message: "Too Many Requests" })],
    servidor: [deLaBase(503, { code: "PGRST002", message: "Could not query the database for the schema cache" }), deLaBase(500, { message: "" })],
    telegram: [Object.assign(new Error("Telegram sendMessage: Bad Request: chat not found"), { servicio: "telegram", status: 400 }), new Error("Telegram editMessageText: Too Many Requests")],
    modelo: [new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error" } }, "rate", new Headers()), new Anthropic.InternalServerError(529, {}, "overloaded", new Headers()), new Anthropic.APIConnectionError({ message: "Connection error." })],
    otro: [new Error("algo raro"), null, "una cadena", undefined],
  };

  it("cada motivo de la lista tiene su ejemplo, y nada más", () => {
    expect(Object.keys(casos).sort()).toEqual([...MOTIVOS_FALLO].sort());
  });

  for (const [motivo, errores] of Object.entries(casos)) {
    it(`${motivo}`, () => {
      for (const e of errores) expect(motivoDe(e), String(e?.message ?? e)).toBe(motivo);
    });
  }

  it("sin campos en el error, se lee el mensaje de db.js", () => {
    expect(motivoDe(new Error("POST /rest/v1/rpc/x → 409 23505 duplicate key value"))).toBe("conflicto");
    expect(motivoDe(new Error("GET /rest/v1/x → 503 upstream down"))).toBe("servidor");
  });

  it("contesto(): solo cuando la base dijo que no, no cuando no se pudo preguntar", () => {
    expect(["no_existe", "conflicto", "datos_invalidos"].every(contesto)).toBe(true);
    expect(["red", "tiempo", "servidor", "sin_sesion", "permiso", "limite", "otro"].some(contesto)).toBe(false);
  });
});

describe("la línea de log", () => {
  afterEach(() => vi.restoreAllMocks());

  it("una línea JSON con sitio, motivo y código, sin el texto del error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = deLaBase(500, { code: "57014", message: "canceling statement for household Ana López" });
    expect(fallaCon("agente_casa", SIN_LEER)(e)).toBe(SIN_LEER);
    expect(err).toHaveBeenCalledTimes(1);
    const linea = JSON.parse(err.mock.calls[0][0]);
    expect(linea).toEqual({ evento: "bot_fallo", donde: "agente_casa", motivo: "tiempo", codigo: "57014", grave: true });
    expect(err.mock.calls[0][0]).not.toMatch(/Ana/);
  });

  it("seguirCon avisa con warn y grave: false; el texto solo va si el motivo es otro", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(seguirCon("escribiendo", 7)(new Error("algo raro que no sé clasificar"))).toBe(7);
    const linea = JSON.parse(warn.mock.calls[0][0]);
    expect(linea).toMatchObject({ evento: "bot_fallo", donde: "escribiendo", motivo: "otro", grave: false, texto: "algo raro que no sé clasificar" });
  });

  it("un sitio fuera de la lista sale como sin_sitio (y el test de abajo no lo deja pasar)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    avisarFallo("me lo invento", new Error("x"));
    expect(JSON.parse(err.mock.calls[0][0])).toMatchObject({ donde: "sin_sitio", sitio: "me lo invento" });
  });
});

// ── El sitio, cerrado: cada seguirCon, fallaCon y avisarFallo del bot lleva un
// sitio de SITIOS_FALLO escrito tal cual (una cadena, no una variable).
const LLAMADA = /\b(seguirCon|fallaCon|avisarFallo)\(\s*([^,)]*)/g;

/** Los sitios de `src` que no están en la lista: [{ fn, sitio }]. */
function sitiosMalos(src) {
  const malos = [];
  for (const [, fn, arg] of src.matchAll(LLAMADA)) {
    const m = arg.trim().match(/^"([^"]*)"$/);
    if (!m || !SITIOS_FALLO.includes(m[1])) malos.push({ fn, sitio: arg.trim() });
  }
  return malos;
}
const sitiosUsados = (src) => [...src.matchAll(LLAMADA)].map(([, , arg]) => arg.trim().replace(/^"|"$/g, ""));

function ficherosDelBot() {
  const out = [];
  for (const dir of ["api/_bot", "api/bot"]) {
    for (const f of fs.readdirSync(path.join(RAIZ, dir))) {
      if (f.endsWith(".js") && !f.endsWith(".test.js") && f !== "avisar.js") out.push(path.join(dir, f));
    }
  }
  return out;
}

describe("el sitio de cada aviso, de la lista", () => {
  it("el detector caza un sitio inventado, uno con variable y uno viejo con barra", () => {
    expect(sitiosMalos('p.catch(fallaCon("me lo invento", null));')).toHaveLength(1);
    expect(sitiosMalos("p.catch(seguirCon(donde));")).toHaveLength(1);
    expect(sitiosMalos('p.catch(fallaCon("agente/casa", null));')).toHaveLength(1);
    expect(sitiosMalos('p.catch(fallaCon("agente_casa", null));')).toEqual([]);
  });

  it("todo el bot usa sitios de SITIOS_FALLO", () => {
    const malos = ficherosDelBot().flatMap((f) => sitiosMalos(fs.readFileSync(path.join(RAIZ, f), "utf8")).map((m) => `${f}: ${m.fn}(${m.sitio})`));
    expect(malos).toEqual([]);
  });

  it("y la lista no lleva sitios que ya nadie usa", () => {
    const usados = new Set(ficherosDelBot().flatMap((f) => sitiosUsados(fs.readFileSync(path.join(RAIZ, f), "utf8"))));
    expect(SITIOS_FALLO.filter((s) => !usados.has(s))).toEqual([]);
  });
});
