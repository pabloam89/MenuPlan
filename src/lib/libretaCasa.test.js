/**
 * La libreta en la app (trozo 14 de #1037): de sus filas al cargar, a api/operacion.js al guardar, y como antes
 * mientras la base no tenga la 0109.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("./supabase.js", () => ({ supabase: null }));

const { leerLibretaDeCasa, conLibretaLeida, sinLibretaLeida, enviarPreferencias, libretaDeCasa, guardarLibretaEnCola, MODO_LIBRETA, REF_LIBRETA, ACCION_LIBRETA } = await import("./libretaCasa.js");
const { PGRST_SIN_FUNCION } = await import("./postgrest.js");
const { RPC_LEER_PREFERENCIAS } = await import("./operaciones/tuberia.js");
const { poner, olvidar } = await import("./notepad.js");
const { FALLO_DATO } = await import("./vocabularios.js");
const { nuevaRegla, reglaDeInvitado } = await import("./reglas.js");
const { conInterruptor, leerPresupuesto, FORMA_PRESUPUESTO, PRESUPUESTO_DE_PARTIDA } = await import("./presupuestoCasa.js");

const CASA = "00000000-0000-4000-8000-0000000000ca";
// Una fila de preferencias_de_casa (lo que no lleva, null en la tabla).
const PESCADO = { id: "00000000-0000-4000-8000-0000000000f1", nivel: "semana", eje: "composicion", medida: "cuenta", operador: "como_mucho",
  valor: "pescado", cantidad: 2, fuerza: "obligatoria", origen: "dicho", canal: "app", confirmado_at: "2026-11-02T10:00:00Z", updated_at: "2026-11-02T10:00:00Z" };
const cliente = (respuesta) => ({ rpc: vi.fn(async () => respuesta) });
const FILAS = { modo: MODO_LIBRETA.FILAS, filas: [PESCADO] };

describe("leer la libreta", () => {
  it("de sus filas, con preferencias_de_casa", async () => {
    const c = cliente({ data: { v: 1, rev: 3, preferencias: [PESCADO], planes: [] }, error: null });
    expect(await leerLibretaDeCasa(CASA, c)).toEqual(FILAS);
    expect(c.rpc).toHaveBeenCalledWith(RPC_LEER_PREFERENCIAS, { p_casa: CASA });
  });

  it("sin la 0109 (la RPC no existe), del documento, como antes", async () => {
    expect(await leerLibretaDeCasa(CASA, cliente({ data: null, error: { code: PGRST_SIN_FUNCION } }))).toEqual({ modo: MODO_LIBRETA.DOCUMENTO });
  });

  it("sin poder leerla, o con otra forma, no es una casa sin preferencias: error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const r of [{ data: null, error: { code: "500" } }, { data: { v: 2, preferencias: [] }, error: null }, { data: { v: 1 }, error: null }]) {
      expect(await leerLibretaDeCasa(CASA, cliente(r)), JSON.stringify(r)).toEqual({ error: true });
    }
  });

  it("la de las filas manda sobre la del documento, con su proyección; al documento no va ninguna de las dos", () => {
    const doc = { members: [], groups: [], notepad: { v: 1, campos: { "freqs.carne": { valor: 1, origen: "texto" } } }, freqs: { carne: 1 } };
    const data = conLibretaLeida(doc, FILAS);
    expect(Object.keys(data.notepad.campos)).toEqual(["freqs.pescado"]);
    expect(data.freqs).toEqual({ pescado: 2 });
    expect(sinLibretaLeida(data, FILAS)).toEqual({ members: [], groups: [], reglas: [] });
    const enDocumento = { modo: MODO_LIBRETA.DOCUMENTO };
    expect(conLibretaLeida(doc, enDocumento)).toBe(doc);
    expect(sinLibretaLeida(doc, enDocumento)).toBe(doc);
  });
});

describe("guardar la libreta", () => {
  const enviada = () => {
    const llegan = [];
    return { llegan, enviar: vi.fn(async (p) => { llegan.push(p); return { ok: true, guardado: true, rev: 4 }; }) };
  };

  it("a api/operacion.js con la sesión, una clave nueva, la pantalla y las preferencias", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, text: async () => JSON.stringify({ guardado: true, estado: "hecha", rev: 4 }) }));
    const r = await enviarPreferencias({ casa: CASA, preferencias: [PESCADO] }, { token: async () => "tk", fetcher });
    expect(r).toMatchObject({ ok: true, rev: 4 });
    const cuerpo = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(cuerpo).toMatchObject({ casa: CASA, accion: ACCION_LIBRETA, ref_id: REF_LIBRETA, preferencias: [PESCADO] });
    expect(cuerpo.clave).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("solo lo que cambió, con el id de su fila; tras guardar se releen las filas; sin cambios, nada", async () => {
    const { llegan, enviar } = enviada();
    const releer = vi.fn(async () => FILAS);
    const libreta = conLibretaLeida({ groups: [] }, FILAS).notepad;
    const l = libretaDeCasa({ casa: CASA, carga: FILAS, conocida: { notepad: libreta }, enviar, releer });
    expect(await l.guardar({ groups: [], notepad: libreta })).toEqual({ ok: true, enviado: false });
    const otra = poner(libreta, "freqs.pescado", 3, { origen: "texto" });
    expect(await l.guardar({ groups: [], notepad: otra })).toMatchObject({ ok: true, enviado: true, rev: 4 });
    expect(llegan).toEqual([{ casa: CASA, preferencias: [expect.objectContaining({ id: PESCADO.id, cantidad: 3 })] }]);
    expect(releer).toHaveBeenCalledWith(CASA);
    expect(await l.guardar({ groups: [], notepad: otra })).toEqual({ ok: true, enviado: false });
  });

  it("guardada pero sin poder releer las filas: conflicto, para recargar la casa y no seguir con filas sin el id nuevo", async () => {
    const libreta = conLibretaLeida({ groups: [] }, FILAS).notepad;
    for (const leida of [{ error: true }, { modo: MODO_LIBRETA.DOCUMENTO }]) {
      const l = libretaDeCasa({ casa: CASA, carga: FILAS, conocida: { notepad: libreta }, enviar: async () => ({ ok: true, rev: 4 }), releer: async () => leida });
      const r = await l.guardar({ groups: [], notepad: poner(libreta, "favoritos.queso", true, { origen: "texto" }) });
      expect(r, JSON.stringify(leida)).toMatchObject({ ok: true, enviado: true, conflict: true });
    }
  });

  it("lo recién creado se borra con el id que trae la relectura", async () => {
    const { llegan, enviar } = enviada();
    const libreta = conLibretaLeida({ groups: [] }, FILAS).notepad;
    const conQueso = poner(libreta, "favoritos.queso", true, { origen: "texto" });
    const QUESO = { ...PESCADO, id: "00000000-0000-4000-8000-0000000000f2", nivel: "plato", eje: "subtipoIngrediente", medida: "valor", operador: "mas", valor: "queso", cantidad: null, fuerza: "medio", confirmado_at: null };
    const l = libretaDeCasa({ casa: CASA, carga: FILAS, conocida: { notepad: libreta }, enviar, releer: async () => ({ modo: MODO_LIBRETA.FILAS, filas: [PESCADO, QUESO] }) });
    await l.guardar({ groups: [], notepad: conQueso });
    await l.guardar({ groups: [], notepad: olvidar(conQueso, "favoritos.queso") });
    expect(llegan[1].preferencias).toEqual([{ id: QUESO.id, borrar: true }]);
  });

  it("lo que no entra se vuelve a mandar con el siguiente guardado", async () => {
    const enviar = vi.fn().mockResolvedValueOnce({ ok: false, fallo: FALLO_DATO.SIN_RED }).mockResolvedValue({ ok: true, rev: 5 });
    const libreta = conLibretaLeida({ groups: [] }, FILAS).notepad;
    const l = libretaDeCasa({ casa: CASA, carga: FILAS, conocida: { notepad: libreta }, enviar, releer: async () => FILAS });
    const otra = poner(libreta, "freqs.pescado", 3, { origen: "texto" });
    expect(await l.guardar({ groups: [], notepad: otra })).toMatchObject({ ok: false, enviado: true, fallo: FALLO_DATO.SIN_RED });
    expect(await l.guardar({ groups: [], notepad: otra })).toMatchObject({ ok: true, enviado: true });
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("las reglas de veto también: una nueva se manda como fila; un invitado (presente) no, que va al documento", async () => {
    const { llegan, enviar } = enviada();
    const leida = conLibretaLeida({ groups: [] }, FILAS);
    const l = libretaDeCasa({ casa: CASA, carga: FILAS, conocida: leida, enviar, releer: async () => FILAS });
    const invitado = reglaDeInvitado({ dia: "Mié", comida: "Cena", hoy: "2026-11-02" });
    expect(await l.guardar({ ...leida, reglas: [invitado] })).toEqual({ ok: true, enviado: false });
    const veto = nuevaRegla({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "grupo:carne" }, ambito: { dias: ["Lun"] }, hoy: "2026-11-02" });
    expect(await l.guardar({ ...leida, reglas: [invitado, veto] })).toMatchObject({ ok: true, enviado: true });
    expect(llegan[0].preferencias).toEqual([expect.objectContaining({ eje: "subtipoIngrediente", valor: "grupo:carne", operador: "no_es", dias: ["Lun"] })]);
    expect(await l.guardar({ ...leida, reglas: [invitado, veto] })).toEqual({ ok: true, enviado: false });
    expect(sinLibretaLeida({ ...leida, reglas: [invitado, veto] }, FILAS).reglas).toEqual([invitado]);
  });

  it("el presupuesto, de su fila: sin ella no hay (el par viejo del documento no cuenta); encenderlo la crea, apagarlo la borra", async () => {
    const { llegan, enviar } = enviada();
    const leida = conLibretaLeida({ groups: [], hasBudget: true, budget: 90 }, FILAS);
    expect(leerPresupuesto(leida)).toEqual({ estado: "sin", euros: null });
    const l = libretaDeCasa({ casa: CASA, carga: FILAS, conocida: leida, enviar, releer: async () => FILAS });
    expect(await l.guardar({ ...leida, presupuesto: "mucho" })).toMatchObject({ ok: false, enviado: false, error: expect.stringMatching(/cifra en euros/) });
    expect(await l.guardar(conInterruptor(leida, true))).toMatchObject({ ok: true, enviado: true });
    expect(llegan[0].preferencias).toEqual([{ ...FORMA_PRESUPUESTO, valor: null, cantidad: PRESUPUESTO_DE_PARTIDA, origen: "dicho" }]);
    expect(sinLibretaLeida(conInterruptor(leida, true), FILAS)).toEqual({ groups: [], hasBudget: true, budget: 90, reglas: [] });
    const FILA = { ...PESCADO, ...FORMA_PRESUPUESTO, id: "00000000-0000-4000-8000-0000000000f3", valor: null, cantidad: 60 };
    const conFila = { modo: MODO_LIBRETA.FILAS, filas: [PESCADO, FILA] };
    const conPresupuesto = conLibretaLeida({ groups: [] }, conFila);
    expect(leerPresupuesto(conPresupuesto)).toEqual({ estado: "activo", euros: 60 });
    const otra = libretaDeCasa({ casa: CASA, carga: conFila, conocida: conPresupuesto, enviar, releer: async () => FILAS });
    await otra.guardar(conInterruptor(conPresupuesto, false));
    expect(llegan[1].preferencias).toEqual([{ id: FILA.id, borrar: true }]);
  });

  it("un apunte que no cabe en una fila (un ámbito sin su grupo) no se manda y se dice", async () => {
    const { enviar } = enviada();
    const libreta = conLibretaLeida({ groups: [] }, FILAS).notepad;
    const l = libretaDeCasa({ casa: CASA, carga: FILAS, conocida: { notepad: libreta }, enviar, releer: async () => FILAS });
    const r = await l.guardar({ groups: [], notepad: poner(libreta, "freqs.carne.@ninos", 1, { origen: "texto" }) });
    expect(r).toMatchObject({ ok: false, enviado: false, error: expect.stringMatching(/grupo de ninos/) });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("en la cola de la casa: si deja la siguiente versión se apunta; si salta, conflicto; sin filas, nada", async () => {
    const libreta = conLibretaLeida({ groups: [] }, FILAS).notepad;
    const datos = { groups: [], notepad: poner(libreta, "freqs.pescado", 3, { origen: "texto" }) };
    const enCola = (version, tarea) => tarea(3);
    const con = (rev) => ({ guardada: libretaDeCasa({ casa: CASA, carga: FILAS, conocida: { notepad: libreta }, enviar: async () => ({ ok: true, rev }), releer: async () => FILAS }) });
    expect(await guardarLibretaEnCola({ version: {}, libreta: con(4), datos, enCola })).toMatchObject({ ok: true, botRev: 4 });
    expect(await guardarLibretaEnCola({ version: {}, libreta: con(6), datos, enCola })).toMatchObject({ conflict: true });
    expect(await guardarLibretaEnCola({ version: {}, libreta: null, datos, enCola })).toEqual({ ok: true, enviado: false });
  });

  it("App.jsx la lee al cargar, la quita del documento y la guarda en la cola de la casa", () => {
    const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
    expect(app).toMatch(/householdId \? leerLibretaDeCasa\(householdId\)/);
    expect(app).toMatch(/conLibretaLeida\(/);
    expect(app).toMatch(/sinLibretaLeida\(/);
    expect((app.match(/guardarLibretaEnCola\(/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
