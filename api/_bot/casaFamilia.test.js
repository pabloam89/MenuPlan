// El corte del trozo 10 en Lola (#1037): la familia se lee de sus filas (personas_de_casa, 0108) y se escribe
// por la tubería (escribir_persona); el documento de la casa ya no lleva members ni groups. Sin la 0108 (plan B),
// la familia sigue en el documento, como antes; sin poder leerla por otra cosa, la casa no se lee.
// Y el del trozo 12: los datos de la casa con sobre (CAMPOS_CASA_CON_SOBRE) se leen de ficha_casa v2 y se escriben
// con escribirDato (aplicar_operacion); sin poder leerlos (sin la RPC, con la v1, sin alguno), la casa no se lee.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { conCasa, cargarCasa, olvidarCasa, separarFamilia } from "./casa.js";
import { conOperacion, ponerAutor, tomarAvisos } from "./operacion.js";
import { FamiliaSinLeer, TEXTO_AVISO_PERSONA, AVISOS_PERSONA, RPC_FAMILIA } from "../../src/lib/personas.js";
import { SUFIJO_CLAVE_PERSONA, RPC_OPERACION, RPC_PREFERENCIAS } from "../../src/lib/operaciones/tuberia.js";
import { RPC_FICHA, FICHA_SIN_TAREAS, fichaDePrueba, RPC_PREFERENCIAS_DE_CASA, preferenciasDeFilas } from "./familiaDePrueba.js";
import { PREGUNTAS_POR_ID } from "../../src/lib/wizardRegistry.js";
import { aplicarCompra, aplicarModoDespensa } from "./ajustes.js";
import { leerPresupuesto, FORMA_PRESUPUESTO } from "../../src/lib/presupuestoCasa.js";
import { nuevaRegla, reglaDeInvitado } from "../../src/lib/reglas.js";

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
const RUTA_FICHA = new RegExp(`rpc/${RPC_FICHA}`);
const RUTA_OPERACION = new RegExp(`rpc/${RPC_OPERACION}`);
/** ficha_casa v2 con estos datos y los demás con sobre sin decir (fichaDePrueba), como los da la base con la 0112 a la 0116. */
const fichaV2 = fichaDePrueba;
const dicho = (campo, valor) => ({
  campo, sujeto: { tipo: "casa", id: null }, estado: "dicho", valor, origen: "dicho", bloqueado: false, peso: null,
  confirmado_el: null, caduca_at: null, cambiado_at: null, dicho_por: null, canal: "app", operacion_id: null,
});
const porDefecto = (campo, valor) => ({ ...dicho(campo, valor), estado: "por_defecto", origen: null });
// Un bool de los datos con sobre (CAMPOS_CASA_CON_SOBRE, del registro).
const CAMPO = "wantsPriceEstimates";

let llamadas;
let respuestas;
const responde = (patron, r) => respuestas.unshift([patron, r]);
// Lo que escribe: personas_de_casa es una lectura aunque vaya por POST (las RPC van todas así).
const escrituras = () => llamadas.filter((l) => l.metodo !== "GET" && !(/bot_deshacer/.test(l.ruta) || l.ruta.endsWith(`/rpc/${RPC_PREFERENCIAS_DE_CASA}`) || RUTA_FAMILIA.test(l.ruta) || RUTA_FICHA.test(l.ruta)));
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("VITE_SUPABASE_URL", "https://base.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_falsa");
  llamadas = [];
  respuestas = [
    [/household_state/, { status: 200, cuerpo: [{ state: DOCUMENTO, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] }],
    [RUTA_FAMILIA, { status: 200, cuerpo: FAMILIA }],
    [RUTA_FICHA, { status: 200, cuerpo: fichaDePrueba() }],
    [new RegExp(`rpc/${RPC_PREFERENCIAS_DE_CASA}`), { status: 200, cuerpo: preferenciasDeFilas() }],
    [RUTA_OPERACION, { status: 200, cuerpo: HECHA }],
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

describe("los datos de la casa con sobre (trozo 12)", () => {
  // El documento aún guarda el valor de antes: con la 0112 no se lee (sin repoblar).
  const conDato = (valor) => responde(/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, [CAMPO]: valor } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] });
  const cambiarDato = (valor, mas = () => {}) => conCasa(CASA, async (casa) => {
    const data = structuredClone(casa.state.data);
    data[CAMPO] = valor;
    mas(data);
    return { state: { ...casa.state, data } };
  });

  it("con la 0112, se leen de ficha_casa v2: lo dicho de su sobre, o el defecto del registro, y no lo del documento", async () => {
    conDato(true);
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto(CAMPO, false)) });
    const casa = await cargarCasa(CASA);
    expect(casa.state.data[CAMPO]).toBe(false);
    expect(casa.conSobre[CAMPO]).toEqual({ valor: false, conSobre: false });
    olvidarCasa(CASA);
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(dicho(CAMPO, true)) });
    expect((await cargarCasa(CASA)).conSobre[CAMPO]).toEqual({ valor: true, conSobre: true });
  });

  it("lo que cambió va a escribirDato como dicho, desde el mensaje y por quien habla; el documento ya no lo lleva", async () => {
    conDato(false);
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto(CAMPO, false)) });
    const { r } = await enTurno(() => cambiarDato(true));
    const [doc, op] = escrituras();
    expect(doc.ruta).toBe("/rest/v1/rpc/bot_save_casa");
    expect(doc.cuerpo.p_state.data).toEqual({ reglas: [] });
    expect(op.ruta).toBe(`/rest/v1/rpc/${RPC_OPERACION}`);
    expect(op.cuerpo.p_operacion).toMatchObject({
      casa: CASA, canal: "telegram", ref_tipo: "mensaje", ref_id: "55", autor_user_id: "u1",
      datos: [{ campo: CAMPO, persona_id: null, valor: true, origen: "dicho" }],
    });
    // bot_save_casa deja la 8 y el dato la 9: la de Lola, con la que compara deshacer.
    expect(r).toMatchObject({ ok: true, botRev: 9 });
  });

  it("sin cambio del dato no se llama a escribirDato, y el documento deja de llevarlo", async () => {
    conDato(true);
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto(CAMPO, false)) });
    await enTurno(() => conCasa(CASA, async (casa) => ({ state: { ...casa.state, data: { ...casa.state.data, reglas: ["x"] } } })));
    expect(escrituras().map((l) => l.ruta)).toEqual(["/rest/v1/rpc/bot_save_casa"]);
    expect(escrituras()[0].cuerpo.p_state.data).toEqual({ reglas: ["x"] });
  });

  it("la familia y el dato en el mismo guardado: cada versión, la siguiente de la anterior", async () => {
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto(CAMPO, false)) });
    responde(RUTA_OPERACION, { status: 200, cuerpo: { ...HECHA, rev: 10 } });
    const { r } = await enTurno(() => cambiarDato(true, (d) => { d.members[0].name = "Anita"; }));
    expect(escrituras().map((l) => l.ruta)).toEqual(["/rest/v1/rpc/bot_save_casa", "/rest/v1/rpc/escribir_persona", `/rest/v1/rpc/${RPC_OPERACION}`]);
    expect(r).toMatchObject({ ok: true, botRev: 10 });
    olvidarCasa(CASA);
    // Otro escribió entre la familia y el dato: la versión que sigue siendo de Lola es la de la familia.
    responde(RUTA_OPERACION, { status: 200, cuerpo: { ...HECHA, rev: 12 } });
    const otra = await enTurno(() => cambiarDato(true, (d) => { d.members[0].name = "Ana María"; }));
    expect(otra.r).toMatchObject({ ok: true, botRev: 9 });
  });

  it("si escribirDato no guarda, vuelve el error con el campo y su fallo (no se calla)", async () => {
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto(CAMPO, false)) });
    responde(RUTA_OPERACION, { status: 500, cuerpo: { code: "XX000", message: "boom" } });
    const { r } = await enTurno(() => cambiarDato(true));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining(`${CAMPO}: servidor`) });
  });

  it("sin saber quién de la casa habla, no se escribe nada y se dice", async () => {
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto(CAMPO, false)) });
    const { r } = await enTurno(() => cambiarDato(true), null);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/qué persona de la casa/) });
    expect(escrituras()).toEqual([]);
  });

  it("menuModel (PR 4c): dos datos en un guardado, cada uno por la puerta de la tubería y con la versión siguiente", async () => {
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto(CAMPO, false), porDefecto("menuModel", "same")) });
    let rev = 8;
    responde(RUTA_OPERACION, { status: 200, get cuerpo() { rev += 1; return { ...HECHA, rev }; } });
    const { r } = await enTurno(() => cambiarDato(true, (d) => { d.menuModel = "separate"; }));
    const ops = escrituras().filter((l) => RUTA_OPERACION.test(l.ruta)).map((l) => l.cuerpo.p_operacion.datos[0]);
    // En el orden del registro (CAMPOS_CASA_CON_SOBRE): menuModel va antes.
    expect(ops).toEqual([
      { campo: "menuModel", persona_id: null, valor: "separate", origen: "dicho" },
      { campo: CAMPO, persona_id: null, valor: true, origen: "dicho" },
    ]);
    expect(r).toMatchObject({ ok: true, botRev: 10 });
  });

  it("el «same» que siembra generar.js, con el defecto del registro en su sobre, no se escribe: no lo dijo nadie", async () => {
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto("menuModel", "same")) });
    await enTurno(() => conCasa(CASA, async (casa) => {
      const d = casa.state.data;
      return { state: { ...casa.state, data: { ...d, activeMenuId: "m1", menuModel: d.menuModel ?? "same" } } };
    }));
    expect(escrituras().map((l) => l.ruta)).toEqual(["/rest/v1/rpc/bot_save_casa"]);
    expect(escrituras()[0].cuerpo.p_state.data).toEqual({ reglas: [], activeMenuId: "m1" });
  });

  it("los aparatos (PR 5c): sin decir se leen vacíos y no se escriben; «tenemos plancha» va como Otro y su nota, cada uno con sobre", async () => {
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto("kitchenTools", null), porDefecto("kitchenToolsNota", null)) });
    const casa = await cargarCasa(CASA);
    expect(casa.state.data).toMatchObject({ kitchenTools: [], kitchenToolsNota: null });
    await enTurno(() => conCasa(CASA, async (c) => ({ state: { ...c.state, data: { ...c.state.data, kitchenTools: [...(c.state.data.kitchenTools ?? [])] } } })));
    expect(escrituras().map((l) => l.ruta)).toEqual(["/rest/v1/rpc/bot_save_casa"]);
    olvidarCasa(CASA);
    llamadas.length = 0;
    let rev = 8;
    responde(RUTA_OPERACION, { status: 200, get cuerpo() { rev += 1; return { ...HECHA, rev }; } });
    const { r } = await enTurno(() => conCasa(CASA, async (c) => ({ state: { ...c.state, data: { ...c.state.data, kitchenTools: ["Otro"], kitchenToolsNota: "plancha" } } })));
    expect(escrituras().filter((l) => RUTA_OPERACION.test(l.ruta)).map((l) => l.cuerpo.p_operacion.datos[0])).toEqual([
      { campo: "kitchenTools", persona_id: null, valor: ["Otro"], origen: "dicho" },
      { campo: "kitchenToolsNota", persona_id: null, valor: "plancha", origen: "dicho" },
    ]);
    expect(escrituras()[0].cuerpo.p_state.data).not.toHaveProperty("kitchenTools");
    expect(r).toMatchObject({ ok: true, botRev: 10 });
  });

  it("el nivel de cocina (PR 6): sin decir, «normal» del registro y no el del documento; «esfuerzo» va como dicho, sin marca en el documento", async () => {
    respuestas.unshift([/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, cookLevel: "pro", cookLevelManual: true } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] }]);
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto("cookLevel", "normal")) });
    const casa = await cargarCasa(CASA);
    expect(casa.state.data.cookLevel).toBe("normal");
    olvidarCasa(CASA);
    const { r } = await enTurno(() => conCasa(CASA, async (c) => ({ state: { ...c.state, data: PREGUNTAS_POR_ID.esfuerzo.escribe(c.state.data, "basic") } })));
    const [doc, op] = escrituras();
    expect(doc.cuerpo.p_state.data).not.toHaveProperty("cookLevel");
    expect(op.cuerpo.p_operacion.datos).toEqual([{ campo: "cookLevel", persona_id: null, valor: "basic", origen: "dicho" }]);
    expect(r).toMatchObject({ ok: true, botRev: 9 });
  });

  it("los súper (PR 7): se leen del sobre y no del documento; «compramos en la frutería» suma «Otro» y su nota, cada uno con sobre", async () => {
    respuestas.unshift([/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, supermarkets: ["Dia"] } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] }]);
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(dicho("supermarkets", ["Mercadona"]), porDefecto("supermarketsNota", null)) });
    const casa = await cargarCasa(CASA);
    expect(casa.state.data).toMatchObject({ supermarkets: ["Mercadona"], supermarketsNota: null });
    olvidarCasa(CASA);
    let rev = 8;
    responde(RUTA_OPERACION, { status: 200, get cuerpo() { rev += 1; return { ...HECHA, rev }; } });
    const { r } = await enTurno(() => conCasa(CASA, async (c) => ({ state: { ...c.state, data: aplicarCompra(c.state.data, { supermercadoOtro: "Frutería Paco" }).data } })));
    expect(escrituras().filter((l) => RUTA_OPERACION.test(l.ruta)).map((l) => l.cuerpo.p_operacion.datos[0])).toEqual([
      { campo: "supermarkets", persona_id: null, valor: ["Mercadona", "Otro"], origen: "dicho" },
      { campo: "supermarketsNota", persona_id: null, valor: "Frutería Paco", origen: "dicho" },
    ]);
    expect(escrituras()[0].cuerpo.p_state.data).not.toHaveProperty("supermarkets");
    expect(r).toMatchObject({ ok: true, botRev: 10 });
  });

  it("el modo de la despensa (PR 9): con sobre, el «off» viejo del documento no cuenta; «deja de usar lo de casa» va como dicho y sin marca", async () => {
    respuestas.unshift([/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, pantryMode: "off", pantryModeSet: false } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] }]);
    responde(RUTA_FICHA, { status: 200, cuerpo: fichaV2(porDefecto("pantryMode", "only")) });
    const casa = await cargarCasa(CASA);
    expect(casa.state.data.pantryMode).toBe("only");
    olvidarCasa(CASA);
    const { r } = await enTurno(() => conCasa(CASA, async (c) => ({ state: { ...c.state, data: aplicarModoDespensa(c.state.data, "off").data } })));
    const [doc, op] = escrituras();
    expect(op.cuerpo.p_operacion.datos).toEqual([{ campo: "pantryMode", persona_id: null, valor: "off", origen: "dicho" }]);
    expect(doc.cuerpo.p_state.data).not.toHaveProperty("pantryMode");
    expect(doc.cuerpo.p_state.data).not.toHaveProperty("pantryModeSet", true);
    expect(r).toMatchObject({ ok: true, botRev: 9 });
  });

  it("una v2 sin la ficha Casa (registro_campo sin sus datos) no se lee del documento: la casa no se lee y nada se escribe", async () => {
    responde(RUTA_FICHA, { status: 200, cuerpo: { ...fichaV2(), fichas: { rutina: fichaV2().fichas.rutina } } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(cargarCasa(CASA)).rejects.toThrow(/ficha_casa no trae menuModel/);
    olvidarCasa(CASA);
    await expect(enTurno(() => cambiarDato(true))).rejects.toThrow(/ficha_casa no trae/);
    expect(escrituras()).toEqual([]);
    log.mockRestore();
  });

  it("con la v1 o sin la RPC, la casa no se lee (ni del documento) y nada se escribe; se dice en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [ficha, motivo] of [[{ status: 200, cuerpo: { ...FICHA_SIN_TAREAS, v: 1 } }, /la v1/], [SIN_RPC(RPC_FICHA), /./]]) {
      olvidarCasa(CASA);
      llamadas = [];
      conDato(true);
      responde(RUTA_FICHA, ficha);
      await expect(cargarCasa(CASA)).rejects.toThrow(motivo);
      olvidarCasa(CASA);
      await expect(enTurno(() => cambiarDato(false))).rejects.toThrow();
      expect(escrituras()).toEqual([]);
    }
    expect(log.mock.calls.flat().join(" ")).toMatch(/casa_sin_leer/);
    log.mockRestore();
  });

  it("sin poder leer la ficha por otra cosa, la casa no se lee y nada se escribe", async () => {
    responde(RUTA_FICHA, { status: 500, cuerpo: { code: "XX000", message: "boom" } });
    await expect(cargarCasa(CASA)).rejects.toThrow();
    olvidarCasa(CASA);
    await expect(enTurno(() => cambiarDato(true))).rejects.toThrow();
    responde(RUTA_FICHA, { status: 200, cuerpo: { v: 2 } });
    olvidarCasa(CASA);
    await expect(cargarCasa(CASA)).rejects.toThrow(/forma que no se conoce/);
    expect(escrituras()).toEqual([]);
  });
});

describe("los datos de la Rutina sin ámbito con sobre (trozo 13)", () => {
  // La v2 agrupa por ficha: con la 0113, los de la Rutina llegan en `fichas.rutina`, no en `fichas.casa`.
  const conRutina = (casa, rutina) => ({ status: 200, cuerpo: fichaV2(...casa, ...rutina) });
  const docCon = (data) => responde(/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, ...data } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] });
  const cambiar = (cambios) => conCasa(CASA, async (casa) => ({ state: { ...casa.state, data: { ...casa.state.data, ...cambios } } }));

  it("con la 0113, se leen de la ficha Rutina: lo dicho de su sobre y el defecto del registro, no lo del documento", async () => {
    docCon({ meals: ["Cena"], diaTanda: "Mié" });
    responde(RUTA_FICHA, conRutina([porDefecto(CAMPO, false)], [porDefecto("meals", ["Comida", "Cena"]), dicho("diaTanda", "Sáb")]));
    const casa = await cargarCasa(CASA);
    expect(casa.state.data).toMatchObject({ meals: ["Comida", "Cena"], diaTanda: "Sáb", [CAMPO]: false });
    expect(casa.conSobre).toMatchObject({ meals: { conSobre: false }, diaTanda: { valor: "Sáb", conSobre: true } });
  });

  it("lo que Lola cambia de la Rutina va a escribirDato, uno por dato, y el documento ya no lo lleva", async () => {
    responde(RUTA_FICHA, conRutina([], [porDefecto("meals", ["Comida", "Cena"]), porDefecto("tandaMinutos", null)]));
    let rev = 8;
    responde(RUTA_OPERACION, { status: 200, get cuerpo() { rev += 1; return { ...HECHA, rev }; } });
    const { r } = await enTurno(() => cambiar({ meals: ["Cena"], tandaMinutos: 90 }));
    const [doc, ...ops] = escrituras();
    expect(ops.map((l) => l.cuerpo.p_operacion.datos)).toEqual([
      [{ campo: "meals", persona_id: null, valor: ["Cena"], origen: "dicho" }],
      [{ campo: "tandaMinutos", persona_id: null, valor: 90, origen: "dicho" }],
    ]);
    expect(doc.cuerpo.p_state.data).not.toHaveProperty("meals");
    expect(doc.cuerpo.p_state.data).not.toHaveProperty("tandaMinutos");
    expect(r).toMatchObject({ ok: true, botRev: 10 });
  });

  it("una v2 con la Casa y sin la Rutina no se lee del documento: la casa no se lee", async () => {
    docCon({ meals: ["Cena"] });
    responde(RUTA_FICHA, { status: 200, cuerpo: { ...fichaV2(), fichas: { casa: fichaV2().fichas.casa } } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(cargarCasa(CASA)).rejects.toThrow(/ficha_casa no trae meals/);
    expect(escrituras()).toEqual([]);
    log.mockRestore();
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

describe("la Rutina con ámbito con sobre (trozo 13)", () => {
  const conRutina = (rutina) => ({ status: 200, cuerpo: fichaV2(...rutina) });
  const deA = { tipo: "persona", id: A };
  const base = (campo, sujeto = { tipo: "casa", id: null }) => ({ ...porDefecto(campo, null), sujeto, estado: "vacio", ambito: null });
  const hueco = (campo, ambito, valor, sujeto = { tipo: "casa", id: null }) => ({ ...dicho(campo, valor), sujeto, ambito });
  const docCon = (data) => responde(/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, ...data } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] });
  const cambiar = (cambios) => conCasa(CASA, async (casa) => ({ state: { ...casa.state, data: { ...casa.state.data, ...cambios(casa.state.data) } } }));
  const ops = () => escrituras().filter((l) => RUTA_OPERACION.test(l.ruta)).map((l) => l.cuerpo.p_operacion.datos);

  it("con la 0116, Lola lee el horario de sus sobres por hueco, no del documento", async () => {
    docCon({ schedule: { [`${A}|Mar|Cena`]: "cole" } });
    responde(RUTA_FICHA, conRutina([base("schedule", deA), hueco("schedule", { dia: "Lun", comida: "Comida" }, "fuera", deA)]));
    const casa = await cargarCasa(CASA);
    expect(casa.state.data.schedule).toEqual({ [`${A}|Lun|Comida`]: "fuera" });
    expect(casa.conSobre.schedule).toEqual({ valor: { [`${A}|Lun|Comida`]: "fuera" }, conSobre: true });
  });

  it("lo que Lola cambia del horario va en una sola operación, un dato por hueco, y el documento no lo lleva", async () => {
    responde(RUTA_FICHA, conRutina([base("schedule", deA), base("schedule", { tipo: "persona", id: B })]));
    const { r } = await enTurno(() => cambiar(() => ({ schedule: { [`${A}|Lun|Comida`]: "fuera", [`${B}|Lun|Cena`]: "tupper" } })));
    expect(ops()).toEqual([[
      { campo: "schedule", persona_id: A, dia: "Lun", comida: "Comida", valor: "fuera", origen: "dicho" },
      { campo: "schedule", persona_id: B, dia: "Lun", comida: "Cena", valor: "tupper", origen: "dicho" },
    ]]);
    expect(escrituras()[0].cuerpo.p_state.data).not.toHaveProperty("schedule");
    expect(r).toMatchObject({ ok: true });
  });

  it("quitar a una persona: sus huecos no se escriben (se fueron con ella), los de las demás sí", async () => {
    responde(RUTA_FICHA, conRutina([base("schedule", deA), hueco("schedule", { dia: "Lun", comida: "Comida" }, "fuera", deA), hueco("schedule", { dia: "Mar", comida: "Cena" }, "cole", { tipo: "persona", id: B })]));
    await enTurno(() => cambiar((d) => ({ members: d.members.filter((m) => m.id !== A), groups: [], schedule: { [`${B}|Mar|Cena`]: "fuera" } })));
    expect(ops()).toEqual([[{ campo: "schedule", persona_id: B, dia: "Mar", comida: "Cena", valor: "fuera", origen: "dicho" }]]);
  });

  it("un elemento sin ámbito (una ficha de antes de la 0116) no deja el horario en el documento: la casa no se lee", async () => {
    docCon({ schedule: { [`${A}|Mar|Cena`]: "cole" } });
    const { ambito: _fuera, ...antes } = base("schedule", deA);
    responde(RUTA_FICHA, conRutina([antes]));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(cargarCasa(CASA)).rejects.toThrow(/llega sin ámbito/);
    expect(escrituras()).toEqual([]);
    log.mockRestore();
  });
});

describe("la libreta en filas de preferencia (trozo 14)", () => {
  const RUTA_PREFS = new RegExp(`rpc/${RPC_PREFERENCIAS_DE_CASA}`);
  const RUTA_ESCRIBIR = new RegExp(`rpc/${RPC_PREFERENCIAS}`);
  const FILA = {
    id: "00000000-0000-4000-8000-0000000000f1", persona_id: null, grupo_id: null, plan_id: null, nivel: "semana", eje: "composicion",
    medida: "cuenta", operador: "como_mucho", valor: "pescado", cantidad: 2, nota: null, fuerza: "obligatoria", dias: null, comidas: null,
    semanas: null, salvo_dias: null, salvo_comidas: null, salvo_semanas: null, desde: null, hasta: null, frase: null, origen: "dicho",
    canal: "app", confirmado_at: "2026-11-02T10:00:00Z", rechazada_at: null, updated_at: "2026-11-02T10:00:00Z",
  };
  const conLibretaEnDocumento = () => responde(/household_state/, { status: 200, cuerpo: [{
    state: { data: { ...DOCUMENTO.data, notepad: { v: 1, campos: { "freqs.carne": { valor: 1, origen: "pregunta", confirmado: true } } }, freqs: { carne: 1 } } },
    bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] });
  const prefs = () => escrituras().filter((l) => RUTA_ESCRIBIR.test(l.ruta));
  const cambiarLibreta = (cambiar) => conCasa(CASA, async (casa) => {
    const data = structuredClone(casa.state.data);
    cambiar(data.notepad.campos);
    return { state: { ...casa.state, data } };
  });

  it("con la 0109, la libreta y lo que proyecta al motor salen de sus filas, no del documento", async () => {
    conLibretaEnDocumento();
    responde(RUTA_PREFS, { status: 200, cuerpo: { v: 1, rev: 7, preferencias: [FILA], planes: [] } });
    const casa = await cargarCasa(CASA);
    expect(Object.keys(casa.state.data.notepad.campos)).toEqual(["freqs.pescado"]);
    expect(casa.state.data.freqs).toEqual({ pescado: 2 });
  });

  it("lo que cambia de la libreta va a escribir_preferencias con el id de su fila, y el documento ya no la lleva", async () => {
    conLibretaEnDocumento();
    responde(RUTA_PREFS, { status: 200, cuerpo: { v: 1, rev: 7, preferencias: [FILA], planes: [] } });
    responde(RUTA_ESCRIBIR, { status: 200, cuerpo: { ...HECHA, rev: 9 } });
    const { r } = await enTurno(() => cambiarLibreta((c) => { c["freqs.pescado"] = { ...c["freqs.pescado"], valor: 3 }; }));
    expect(r).toMatchObject({ ok: true });
    const doc = escrituras().find((l) => /bot_save_casa/.test(l.ruta)).cuerpo.p_state.data;
    expect(doc).not.toHaveProperty("notepad");
    expect(doc).not.toHaveProperty("freqs");
    const op = prefs()[0].cuerpo.p_operacion;
    expect(op).toMatchObject({ casa: CASA, canal: "telegram", ref_id: "55", autor_user_id: "u1" });
    expect(op.preferencias).toEqual([expect.objectContaining({ id: FILA.id, valor: "pescado", cantidad: 3, operador: "como_mucho" })]);
  });

  it("sin la 0109, la libreta sigue en el documento y se guarda en él; escribir_preferencias no se llama", async () => {
    conLibretaEnDocumento();
    responde(RUTA_PREFS, SIN_RPC(RPC_PREFERENCIAS_DE_CASA));
    const { r } = await enTurno(() => cambiarLibreta((c) => { c["freqs.carne"] = { ...c["freqs.carne"], valor: 2 }; }));
    expect(r).toMatchObject({ ok: true });
    expect(escrituras().find((l) => /bot_save_casa/.test(l.ruta)).cuerpo.p_state.data.notepad.campos["freqs.carne"].valor).toBe(2);
    expect(prefs()).toEqual([]);
  });

  it("si escribir_preferencias no guarda, vuelve el error con su fallo (no se calla)", async () => {
    responde(RUTA_ESCRIBIR, SIN_RPC(RPC_PREFERENCIAS));
    const { r } = await enTurno(() => cambiarLibreta((c) => { c["freqs.pescado"] = { valor: 1, origen: "texto" }; }));
    expect(r).toMatchObject({ ok: false });
    expect(r.error).toMatch(/las preferencias: rpc_ausente/);
  });

  it("las reglas de veto salen de sus filas; una nueva va a escribir_preferencias y al documento solo vuelven las presente", async () => {
    const [invitado, vieja] = [reglaDeInvitado({ dia: "Mié", comida: "Cena", hoy: "2026-11-02" }), nuevaRegla({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "grupo:pollo" }, ambito: { dias: ["Mar"] }, hoy: "2026-11-02" })];
    responde(/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, reglas: [invitado, vieja] } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] });
    const VETO = { ...FILA, id: "00000000-0000-4000-8000-0000000000f2", nivel: "plato", eje: "subtipoIngrediente", medida: "valor", operador: "no_es", valor: "grupo:carne", cantidad: null, dias: ["Lun"] };
    responde(RUTA_PREFS, { status: 200, cuerpo: { v: 1, rev: 7, preferencias: [VETO], planes: [] } });
    responde(RUTA_ESCRIBIR, { status: 200, cuerpo: { ...HECHA, rev: 9 } });
    expect((await cargarCasa(CASA)).state.data.reglas.map((r) => [r.efecto.tipo, r.efecto.valor])).toEqual([["presente", "casa"], ["excluir", "grupo:carne"]]);
    const nueva = nuevaRegla({ sujeto: { tipo: "miembro", ref: B }, efecto: { tipo: "excluir", valor: "tecnica:sarten" }, ambito: { dias: ["Vie"] }, hoy: "2026-11-02" });
    expect((await enTurno(() => conCasa(CASA, async (casa) => ({ state: { ...casa.state, data: { ...casa.state.data, reglas: [...casa.state.data.reglas, nueva] } } })))).r).toMatchObject({ ok: true });
    expect(escrituras().find((l) => /bot_save_casa/.test(l.ruta)).cuerpo.p_state.data.reglas).toEqual([invitado]);
    expect(prefs()[0].cuerpo.p_operacion.preferencias).toEqual([expect.objectContaining({ persona_id: B, eje: "tecnica", valor: "sarten", operador: "no_es", dias: ["Vie"] })]);
  });

  it("el presupuesto, de su fila (sin ella no hay, aunque el documento traiga el par viejo); «nos ponemos 60 €» la crea y «sin presupuesto» la borra", async () => {
    responde(/household_state/, { status: 200, cuerpo: [{ state: { data: { ...DOCUMENTO.data, hasBudget: true, budget: 90 } }, bot_rev: 7, updated_at: "2026-11-01T10:00:00Z" }] });
    responde(RUTA_PREFS, { status: 200, cuerpo: { v: 1, rev: 7, preferencias: [], planes: [] } });
    responde(RUTA_ESCRIBIR, { status: 200, cuerpo: { ...HECHA, rev: 9 } });
    expect(leerPresupuesto((await cargarCasa(CASA)).state.data)).toEqual({ estado: "sin", euros: null });
    await enTurno(() => conCasa(CASA, async (c) => ({ state: { ...c.state, data: aplicarCompra(c.state.data, { presupuesto: 60 }).data } })));
    expect(prefs()[0].cuerpo.p_operacion.preferencias).toEqual([{ ...FORMA_PRESUPUESTO, valor: null, cantidad: 60, origen: "dicho" }]);
    for (const l of escrituras().filter((x) => /bot_save_casa/.test(x.ruta))) expect(l.cuerpo.p_state.data).not.toHaveProperty("presupuesto");
    olvidarCasa(CASA);
    llamadas = [];
    const FILA_P = { ...FILA, ...FORMA_PRESUPUESTO, id: "00000000-0000-4000-8000-0000000000f3", valor: null, cantidad: 60 };
    responde(RUTA_PREFS, { status: 200, cuerpo: { v: 1, rev: 9, preferencias: [FILA_P], planes: [] } });
    await enTurno(() => conCasa(CASA, async (c) => ({ state: { ...c.state, data: aplicarCompra(c.state.data, { sinPresupuesto: true }).data } })));
    expect(prefs()[0].cuerpo.p_operacion.preferencias).toEqual([{ id: FILA_P.id, borrar: true }]);
  });

  it("un apunte que no cabe en una fila (un ámbito sin su grupo en la casa) no guarda nada y se dice", async () => {
    const { r } = await enTurno(() => cambiarLibreta((c) => { c["freqs.pescado.@ninos"] = { valor: 1, origen: "texto" }; }));
    expect(r).toMatchObject({ ok: false });
    expect(r.error).toMatch(/grupo de ninos/);
    expect(escrituras()).toEqual([]);
  });
});
