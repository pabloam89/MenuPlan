// Tras borrar a una persona por la tubería (escribir_persona), sus datos salen de las fotos para deshacer que ya no
// se pueden usar, y la del propio borrado se queda para «deshaz» (trozo 36 de #1037).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { escribirPersonas } from "./datos.js";
import { quitarDeLasFotos } from "./borrarPersona.js";
import { anonimizarFoto, borradasDe } from "../../src/lib/borrarPersona.js";
import { ESTADO_OPERACION, CANAL_DATO, REF_OPERACION } from "../../src/lib/vocabularios.js";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";
const ANA = "9178cde5-0054-4b5a-b8f4-d84884cabbf8";
const LUIS = "d1928b9c-47c5-45f6-89a4-ee4ece6d57bd";
const foto = (id, rev, members) => ({ id, bot_rev_despues: rev, antes: { state: { data: { members, otra: 1 } }, quien: { chat: "c" } } });
const PEDIDO = {
  casa: CASA, clave: "tg:1:familia", accion: "quitar_comensal", canal: CANAL_DATO.TELEGRAM,
  ref: { tipo: REF_OPERACION.MENSAJE, id: "1" }, autor: { user_id: "u1" }, personas: [{ id: ANA, borrar: true }],
};
const HECHA = { operacion_id: "op1", estado: ESTADO_OPERACION.HECHA, repetida: false, hecho: [{ persona_id: ANA, borrada: true }], sin_hacer: [], choques: [], rev: 9 };

let llamadas, respuestas;
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("VITE_SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_falsa");
  llamadas = [];
  respuestas = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const ruta = decodeURIComponent(String(url).replace("https://base.invalid", ""));
    llamadas.push({ ruta, metodo: init.method ?? "GET", cuerpo: init.body ? JSON.parse(init.body) : null });
    const r = respuestas.find(([p, m]) => p.test(ruta) && (!m || m === (init.method ?? "GET")))?.[2] ?? { status: 200, cuerpo: [] };
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const responde = (patron, metodo, r) => respuestas.push([patron, metodo, r]);
const parches = () => llamadas.filter((l) => l.metodo === "PATCH");

describe("anonimizarFoto y borradasDe (puras)", () => {
  it("la foto pierde a la persona en members y nada más; sin ella, null", () => {
    const f = foto("f1", 3, [{ id: ANA, name: "Ana", allergies: ["huevo"] }, { id: LUIS, name: "Luis" }]);
    expect(anonimizarFoto(f.antes, [ANA])).toEqual({ state: { data: { members: [{ id: LUIS, name: "Luis" }], otra: 1 } }, quien: { chat: "c" } });
    expect(anonimizarFoto(f.antes, ["otra"])).toBeNull();
    expect(anonimizarFoto({ tipo: "receta" }, [ANA])).toBeNull();
  });

  it("borradasDe: solo las que llevan borrar: true", () => {
    expect(borradasDe({ personas: [{ id: ANA, borrar: true }, { id: LUIS, nombre: "Luis" }, { borrar: true }] })).toEqual([ANA]);
    expect(borradasDe({})).toEqual([]);
  });
});

describe("escribirPersonas: tras borrar, las fotos viejas sin ella", () => {
  it("lee solo las fotos de antes del borrado (bot_rev_despues < rev) y reescribe las que la tienen", async () => {
    responde(/rpc\/escribir_persona/, "POST", { status: 200, cuerpo: HECHA });
    responde(/bot_deshacer\?select/, "GET", { status: 200, cuerpo: [foto("f1", 7, [{ id: ANA, name: "Ana" }, { id: LUIS }]), foto("f2", 8, [{ id: LUIS }])] });
    const r = await escribirPersonas(PEDIDO, { papel: "owner" });
    expect(r.guardado).toBe(true);
    const lectura = llamadas.find((l) => l.ruta.startsWith("/rest/v1/bot_deshacer?select"));
    expect(lectura.ruta).toContain(`household_id=eq.${CASA}`);
    expect(lectura.ruta).toContain("bot_rev_despues=lt.9");
    expect(parches()).toEqual([{ ruta: "/rest/v1/bot_deshacer?id=eq.f1", metodo: "PATCH", cuerpo: { antes: { state: { data: { members: [{ id: LUIS }], otra: 1 } }, quien: { chat: "c" } } } }]);
  });

  it("si no borra a nadie, o no se guardó, no toca las fotos", async () => {
    responde(/rpc\/escribir_persona/, "POST", { status: 200, cuerpo: HECHA });
    await escribirPersonas({ ...PEDIDO, personas: [{ id: LUIS, nombre: "Luis" }] }, { papel: "owner" });
    responde(/rpc\/escribir_persona/, "POST", { status: 200, cuerpo: { ...HECHA, estado: ESTADO_OPERACION.RECHAZADA } });
    respuestas.reverse();
    await escribirPersonas(PEDIDO, { papel: "owner" });
    expect(llamadas.filter((l) => l.ruta.includes("bot_deshacer"))).toEqual([]);
  });

  it("si la base falla al limpiar, el borrado sigue guardado y queda el aviso (borrar_persona_fotos)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    responde(/rpc\/escribir_persona/, "POST", { status: 200, cuerpo: HECHA });
    responde(/bot_deshacer\?select/, "GET", { status: 503, cuerpo: { message: "caída" } });
    const r = await escribirPersonas(PEDIDO, { papel: "owner" });
    expect(r.guardado).toBe(true);
    expect(error.mock.calls.map((a) => JSON.parse(a[0])).find((l) => l.evento === "bot_fallo")).toMatchObject({ donde: "borrar_persona_fotos", grave: true });
  });

  it("sin la versión de la casa no adivina qué fotos son viejas: no toca ninguna y avisa", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await quitarDeLasFotos(CASA, [ANA], Number(undefined))).toBeNull();
    expect(llamadas).toEqual([]);
    expect(error).toHaveBeenCalled();
  });
});
