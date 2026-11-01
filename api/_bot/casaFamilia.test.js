// El corte del trozo 10 en Lola (#1037): la familia se lee de sus filas (personas_de_casa, 0108) y se escribe
// por la tubería (escribir_persona); el documento de la casa ya no lleva members ni groups. Sin la 0108 (plan B),
// la familia sigue en el documento, como antes; sin poder leerla por otra cosa, la casa no se lee.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { conCasa, cargarCasa, olvidarCasa, separarFamilia } from "./casa.js";
import { conOperacion, ponerAutor, tomarAvisos } from "./operacion.js";
import { FamiliaSinLeer, TEXTO_AVISO_PERSONA, AVISOS_PERSONA, RPC_FAMILIA } from "../../src/lib/personas.js";
import { SUFIJO_CLAVE_PERSONA } from "../../src/lib/operaciones/tuberia.js";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const N = "00000000-0000-4000-8000-00000000000d";
const G = "00000000-0000-4000-8000-00000000000c";
const persona = (id, nombre, orden, extra = {}) => ({
  id, nombre, orden, edad: 40, rol_hogar: null, alergias_revisadas: true, peso_kg: null, altura_cm: null, usa_fecha_nacimiento: false,
  fecha_nacimiento: null, detalle_etapa: null, no_es_bebe: false, clave_perfil: null, clave_avatar: null, color: null, resto: {},
  alergias: [], intolerancias: [], estados: [], perfiles_salud: [], origen_alergias: "dicho", ...extra,
});
const FAMILIA = { v: 1, rev: 7, personas: [persona(A, "Ana", 0), persona(B, "Bea", 1)], grupos: [{ id: G, nombre: "Todos", tipo: null, color: null, orden: 0, personas: [A, B] }] };
// Lo que aún guarda el documento de antes del corte: no se lee.
const DOCUMENTO = { data: { members: [{ id: "viejo", name: "Del documento" }], groups: [], reglas: [] } };
const RUTA_FAMILIA = new RegExp(`rpc/${RPC_FAMILIA}`);
const SIN_RPC = (fn) => ({ status: 404, cuerpo: { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` } });
const HECHA = { operacion_id: "op1", estado: "hecha", repetida: false, hecho: [], sin_hacer: [], choques: [], rev: 9 };

let llamadas;
let respuestas;
const responde = (patron, r) => respuestas.unshift([patron, r]);
// Lo que escribe: personas_de_casa es una lectura aunque vaya por POST (las RPC van todas así).
const escrituras = () => llamadas.filter((l) => l.metodo !== "GET" && !(/bot_deshacer/.test(l.ruta) || RUTA_FAMILIA.test(l.ruta)));
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("VITE_SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_falsa");
  llamadas = [];
  respuestas = [
    [/household_state/, { status: 200, cuerpo: [{ state: DOCUMENTO, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] }],
    [RUTA_FAMILIA, { status: 200, cuerpo: FAMILIA }],
    [/rpc\/bot_save_casa/, { status: 200, cuerpo: { ok: true, bot_rev: 8 } }],
    [/rpc\/escribir_persona/, { status: 200, cuerpo: HECHA }],
  ];
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const ruta = String(url).replace("https://base.invalid", "");
    llamadas.push({ ruta, metodo: init.method ?? "GET", cuerpo: init.body ? JSON.parse(init.body) : null });
    const r = respuestas.find(([patron]) => patron.test(ruta))?.[1] ?? { status: 200, cuerpo: [] };
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { "content-type": "application/json" } });
  }));
  olvidarCasa(CASA);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Un turno de Lola: el mensaje 55 del chat 1, de una persona de la casa que la edita. */
const enTurno = (fn, autor = { userId: "u1", papel: "owner", canal: "telegram" }) =>
  conOperacion({ chat: "1", persona: "9", mid: "55" }, async () => {
    if (autor) ponerAutor(autor);
    const r = await fn();
    return { r, avisos: tomarAvisos() };
  });
const cambiarFamilia = (cambiar) => conCasa(CASA, async (casa) => {
  const data = structuredClone(casa.state.data);
  cambiar(data);
  return { state: { ...casa.state, data } };
});

describe("leer la casa: la familia, de sus filas", () => {
  it("members y groups salen de personas_de_casa, no del documento", async () => {
    const casa = await cargarCasa(CASA);
    expect(casa.state.data.members.map((m) => m.name)).toEqual(["Ana", "Bea"]);
    expect(casa.state.data.groups).toEqual([{ id: G, label: "Todos", memberIds: [A, B] }]);
    expect(casa.familia.members).toHaveLength(2);
  });

  it("sin la 0108, la familia sale del documento y se guarda en él, como antes; escribir_persona no se llama", async () => {
    responde(RUTA_FAMILIA, SIN_RPC(RPC_FAMILIA));
    const casa = await cargarCasa(CASA);
    expect(casa.familia).toBeNull();
    expect(casa.state.data.members.map((m) => m.name)).toEqual(["Del documento"]);
    olvidarCasa(CASA);
    const { r } = await enTurno(() => cambiarFamilia((d) => { d.members[0].name = "Otro"; }));
    expect(r).toMatchObject({ ok: true });
    expect(escrituras().map((l) => l.ruta)).toEqual(["/rest/v1/rpc/bot_save_casa"]);
    expect(escrituras()[0].cuerpo.p_state.data.members).toEqual([{ id: "viejo", name: "Otro" }]);
  });

  it("sin poder leerla por otra cosa, la casa no se lee: FamiliaSinLeer, y nada se escribe", async () => {
    responde(RUTA_FAMILIA, { status: 200, cuerpo: { v: 1 } });
    const err = await cargarCasa(CASA).catch((e) => e);
    expect(err).toBeInstanceOf(FamiliaSinLeer);
    olvidarCasa(CASA);
    await expect(enTurno(() => cambiarFamilia((d) => { d.reglas.push("x"); }))).rejects.toBeInstanceOf(FamiliaSinLeer);
    expect(escrituras()).toEqual([]);
  });
});

describe("guardar la casa: la familia por escribir_persona", () => {
  it("el documento va sin members ni groups; lo que cambió va a escribir_persona con el orden de todos", async () => {
    const { r } = await enTurno(() => cambiarFamilia((d) => { d.members[1].name = "Beatriz"; }));
    expect(r.ok).toBe(true);
    const [doc, fam] = escrituras();
    expect(doc.ruta).toBe("/rest/v1/rpc/bot_save_casa");
    expect(doc.cuerpo.p_state.data).toEqual({ reglas: [] });
    expect(fam.ruta).toBe("/rest/v1/rpc/escribir_persona");
    const op = fam.cuerpo.p_operacion;
    expect(op).toMatchObject({ casa: CASA, canal: "telegram", ref_tipo: "mensaje", ref_id: "55", autor_user_id: "u1" });
    expect(op.clave.endsWith(SUFIJO_CLAVE_PERSONA)).toBe(true);
    expect(op.personas).toEqual([{ id: B, nombre: "Beatriz", orden: 1 }, { id: A, orden: 0 }]);
    // La versión de después de la familia: con ella compara deshacer.
    expect(r.botRev).toBe(9);
  });

  it("una persona nueva va entera con su orden; quien se va, borrar", async () => {
    await enTurno(() => cambiarFamilia((d) => {
      d.members = [d.members[1], { id: N, name: "Nico", age: 3 }];
      d.groups[0].memberIds = [B, N];
    }));
    const op = escrituras().find((l) => /escribir_persona/.test(l.ruta)).cuerpo.p_operacion;
    expect(op.personas).toEqual(expect.arrayContaining([
      { id: B, orden: 0 }, expect.objectContaining({ id: N, nombre: "Nico", orden: 1 }), { id: A, borrar: true },
    ]));
    expect(op.grupos[0].personas).toEqual([B, N]);
  });

  it("sin cambios en la familia no se llama a escribir_persona", async () => {
    await enTurno(() => cambiarFamilia((d) => { d.reglas.push("x"); }));
    expect(escrituras().map((l) => l.ruta)).toEqual(["/rest/v1/rpc/bot_save_casa"]);
  });

  it("sin saber quién de la casa habla, no se escribe nada y se dice", async () => {
    const { r } = await enTurno(() => cambiarFamilia((d) => { d.members[0].name = "Anita"; }), null);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/qué persona de la casa/) });
    expect(escrituras()).toEqual([]);
  });

  it("si escribir_persona no está o falla, vuelve el error con su fallo (no se calla)", async () => {
    responde(/rpc\/escribir_persona/, SIN_RPC("escribir_persona"));
    const { r } = await enTurno(() => cambiarFamilia((d) => { d.members[0].name = "Anita"; }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/rpc_ausente/) });
  });

  it("la foto de deshacer lleva la versión tras la familia solo si es la siguiente; si otro escribió entremedias, la del documento", async () => {
    const foto = () => llamadas.filter((l) => /bot_deshacer/.test(l.ruta) && l.metodo === "POST").at(-1).cuerpo[0].bot_rev_despues;
    const { r } = await enTurno(() => cambiarFamilia((d) => { d.members[0].name = "Anita"; }));
    expect(r).toMatchObject({ ok: true, botRev: 9 });
    expect(foto()).toBe(9);
    olvidarCasa(CASA);
    responde(/rpc\/escribir_persona/, { status: 200, cuerpo: { ...HECHA, rev: 11 } });
    const otra = await enTurno(() => cambiarFamilia((d) => { d.members[0].name = "Ana María"; }));
    expect(otra.r).toMatchObject({ ok: true, botRev: 8 });
    expect(foto()).toBe(8);
  });

  it("lo que no viaja tal cual se dice en el chat", async () => {
    const { avisos } = await enTurno(() => cambiarFamilia((d) => { d.members[0].age = 300; }));
    expect(avisos).toEqual([TEXTO_AVISO_PERSONA[AVISOS_PERSONA.FUERA_DE_RANGO]]);
  });
});

describe("separarFamilia", () => {
  it("un estado sin members ni groups no toca la familia (no es «borrar a todos»)", () => {
    expect(separarFamilia({ data: { reglas: [] } }, { members: [], groups: [] })).toEqual({ documento: { data: { reglas: [] } }, familia: null });
    expect(separarFamilia(null, null)).toEqual({ documento: null, familia: null });
  });
  it("si trae una sola lista, la otra es la leída", () => {
    const leida = { members: [{ id: A }], groups: [{ id: G }] };
    expect(separarFamilia({ data: { members: [] } }, leida).familia).toEqual({ members: [], groups: leida.groups });
  });
});
