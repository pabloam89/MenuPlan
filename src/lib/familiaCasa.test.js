/**
 * La familia en la app (trozo 10 de #1037): de sus filas al cargar, a api/operacion.js al guardar, y como
 * antes mientras la base no tenga la 0108.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: null }));

const { leerFamiliaDeCasa, conFamiliaLeida, sinFamilia, enviarFamilia, familiaDeCasa, conVersionDeFamilia, MODO_FAMILIA, REF_FAMILIA } = await import("./familiaCasa.js");
const { FALLO_DATO } = await import("./vocabularios.js");
const { RPC_FAMILIA } = await import("./personas.js");

const CASA = "00000000-0000-4000-8000-0000000000ca";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const FILAS = {
  v: 1, rev: 1,
  personas: [{ id: A, nombre: "Ana", orden: 0, alergias: ["Gluten"], intolerancias: [], estados: [], perfiles_salud: [] }],
  grupos: [],
};
const cliente = (respuesta) => ({ rpc: vi.fn(async () => respuesta) });

describe("leer la familia", () => {
  it("de sus filas, con la RPC de la familia", async () => {
    const c = cliente({ data: FILAS, error: null });
    const r = await leerFamiliaDeCasa(CASA, c);
    expect(c.rpc).toHaveBeenCalledWith(RPC_FAMILIA, { p_casa: CASA });
    expect(r.modo).toBe(MODO_FAMILIA.FILAS);
    expect(r.familia.members.map((m) => [m.id, m.name, m.allergies])).toEqual([[A, "Ana", ["Gluten"]]]);
    expect(r.familia.groups).toEqual([]);
  });

  it("sin la 0108 (la RPC no existe), del documento, como antes", async () => {
    expect(await leerFamiliaDeCasa(CASA, cliente({ data: null, error: { code: "PGRST202", message: "x" } }))).toEqual({ modo: MODO_FAMILIA.DOCUMENTO });
  });

  it("sin poder leerla, o con otra forma, no es una casa sin nadie: error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await leerFamiliaDeCasa(CASA, cliente({ data: null, error: { code: "08006", message: "red" } }))).toEqual({ error: true });
    expect(await leerFamiliaDeCasa(CASA, cliente({ data: { v: 1 }, error: null }))).toEqual({ error: true });
    expect(await leerFamiliaDeCasa(CASA, null)).toEqual({ error: true });
  });
});

describe("la familia en los datos de la casa", () => {
  const familia = { members: [{ id: A, name: "Ana" }], groups: [] };

  it("la de las filas manda sobre la del documento", () => {
    const data = { meals: ["comida"], members: [{ id: B, name: "Vieja" }], groups: [{ id: "g" }] };
    expect(conFamiliaLeida(data, { modo: MODO_FAMILIA.FILAS, familia })).toEqual({ meals: ["comida"], ...familia });
    expect(conFamiliaLeida(undefined, { modo: MODO_FAMILIA.FILAS, familia })).toEqual(familia);
  });

  it("del documento, o sin nada que adoptar, no se toca", () => {
    const data = { members: [{ id: B }] };
    expect(conFamiliaLeida(data, { modo: MODO_FAMILIA.DOCUMENTO })).toBe(data);
    expect(conFamiliaLeida(undefined, { modo: MODO_FAMILIA.FILAS, familia: { members: [], groups: [] } })).toBeUndefined();
  });

  it("al documento no va la familia si vive en sus filas; si no, va como siempre", () => {
    const datos = { meals: ["comida"], members: [{ id: A }], groups: [] };
    expect(sinFamilia(datos, MODO_FAMILIA.FILAS)).toEqual({ meals: ["comida"] });
    expect(sinFamilia(datos, MODO_FAMILIA.DOCUMENTO)).toBe(datos);
    expect(sinFamilia(datos, undefined)).toBe(datos);
  });
});

describe("enviar un cambio a api/operacion.js", () => {
  const token = async () => "tok";
  const respuesta = (status, cuerpo) => vi.fn(async () => ({ ok: status < 300, status, json: async () => cuerpo }));

  it("con la sesión, una clave nueva y la pantalla; contesta lo de la tubería", async () => {
    const fetcher = respuesta(200, { guardado: true, operacion_id: "op" });
    const r = await enviarFamilia({ casa: CASA, personas: [{ id: A, nombre: "Ana" }] }, { token, fetcher });
    expect(r).toMatchObject({ ok: true, operacion_id: "op" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toMatch(/\/api\/operacion$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
    const cuerpo = JSON.parse(init.body);
    expect(cuerpo).toMatchObject({ casa: CASA, ref_id: REF_FAMILIA, personas: [{ id: A, nombre: "Ana" }] });
    expect(cuerpo.clave).toMatch(/^[0-9a-f-]{36}$/);
    expect("grupos" in cuerpo).toBe(false);
  });

  it("sin sesión, sin red, o con un fallo de la tubería: no guardado, y con su fallo", async () => {
    expect(await enviarFamilia({ casa: CASA, personas: [] }, { token: async () => null, fetcher: respuesta(200, {}) })).toEqual({ ok: false, fallo: FALLO_DATO.SIN_SESION });
    const sinRed = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await enviarFamilia({ casa: CASA, personas: [] }, { token, fetcher: sinRed })).toEqual({ ok: false, fallo: FALLO_DATO.SIN_RED });
    expect(await enviarFamilia({ casa: CASA, personas: [] }, { token, fetcher: respuesta(503, { fallo: FALLO_DATO.RPC_AUSENTE }) })).toEqual({ ok: false, fallo: FALLO_DATO.RPC_AUSENTE });
    expect((await enviarFamilia({ casa: CASA, personas: [] }, { token, fetcher: respuesta(200, { guardado: false, fallo: FALLO_DATO.SIN_PERMISO }) })).ok).toBe(false);
  });
});

describe("guardar la familia: solo lo que cambió, uno tras otro", () => {
  const leida = { members: [{ id: A, name: "Ana" }], groups: [] };

  it("sin cambios no se manda nada", async () => {
    const enviar = vi.fn();
    const f = familiaDeCasa({ casa: CASA, familia: leida, enviar });
    expect(await f.guardar({ ...leida, meals: [] })).toEqual({ ok: true, enviado: false, avisos: [] });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("lo que cambió, con el orden de todos; lo guardado pasa a ser lo conocido", async () => {
    const enviar = vi.fn(async () => ({ ok: true }));
    const f = familiaDeCasa({ casa: CASA, familia: leida, enviar });
    const ahora = { members: [{ id: A, name: "Ana" }, { id: B, name: "Bea" }], groups: [] };
    expect(await f.guardar(ahora)).toMatchObject({ ok: true, enviado: true });
    expect(enviar.mock.calls[0][0].casa).toBe(CASA);
    expect(enviar.mock.calls[0][0].personas).toEqual(expect.arrayContaining([expect.objectContaining({ id: B, nombre: "Bea", orden: 1 }), { id: A, orden: 0 }]));
    expect(f.conocida()).toEqual(ahora);
    await f.guardar(ahora);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("uno que falla se vuelve a mandar con el siguiente, y no rompe la cola", async () => {
    const enviar = vi.fn()
      .mockResolvedValueOnce({ ok: false, fallo: FALLO_DATO.SIN_RED })
      .mockRejectedValueOnce(new Error("roto"))
      .mockResolvedValue({ ok: true });
    const f = familiaDeCasa({ casa: CASA, familia: leida, enviar });
    const conBea = { members: [...leida.members, { id: B, name: "Bea" }], groups: [] };
    expect(await f.guardar(conBea)).toMatchObject({ ok: false, fallo: FALLO_DATO.SIN_RED });
    expect(f.conocida()).toEqual(leida);
    await expect(f.guardar(conBea)).rejects.toThrow("roto");
    expect(await f.guardar(conBea)).toMatchObject({ ok: true, enviado: true });
    expect(enviar.mock.calls.map((c) => c[0].personas.some((p) => p.id === B))).toEqual([true, true, true]);
  });

  it("dos guardados seguidos: el segundo se calcula sobre lo que dejó el primero", async () => {
    let soltar;
    const enviar = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { soltar = () => r({ ok: true }); }))
      .mockResolvedValue({ ok: true });
    const f = familiaDeCasa({ casa: CASA, familia: leida, enviar });
    const conBea = { members: [...leida.members, { id: B, name: "Bea" }], groups: [] };
    const renombrada = { members: [{ id: A, name: "Ana" }, { id: B, name: "Beatriz" }], groups: [] };
    const p1 = f.guardar(conBea);
    const p2 = f.guardar(renombrada);
    await Promise.resolve();
    soltar();
    await Promise.all([p1, p2]);
    expect(enviar.mock.calls[1][0].personas).toEqual([{ id: B, nombre: "Beatriz", orden: 1 }, { id: A, orden: 0 }]);
  });

  it("lo que no viaja tal cual se dice, en frases", async () => {
    const f = familiaDeCasa({ casa: CASA, familia: leida, enviar: async () => ({ ok: true }) });
    const r = await f.guardar({ members: [...leida.members, { id: B, name: "Bea", age: 999 }], groups: [] });
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/fuera de lo posible/);
  });
});

describe("la versión de la casa tras guardar la familia", () => {
  it("si deja la siguiente a la conocida, se apunta", async () => {
    expect(await conVersionDeFamilia(async () => ({ ok: true, enviado: true, rev: 8 }))(7)).toMatchObject({ ok: true, botRev: 8 });
  });

  it("si salta más de una, otro escribió entretanto: conflicto, para recargar", async () => {
    const r = await conVersionDeFamilia(async () => ({ ok: true, enviado: true, rev: 9 }))(7);
    expect(r).toMatchObject({ ok: true, conflict: true });
    expect(r.botRev).toBeUndefined();
    expect((await conVersionDeFamilia(async () => ({ ok: true, enviado: true, rev: null }))(7)).conflict).toBe(true);
  });

  it("sin nada enviado, o sin guardar, no se toca la versión", async () => {
    expect(await conVersionDeFamilia(async () => ({ ok: true, enviado: false, avisos: [] }))(7)).toEqual({ ok: true, enviado: false, avisos: [] });
    expect(await conVersionDeFamilia(async () => ({ ok: false, fallo: "sin_red" }))(7)).toEqual({ ok: false, fallo: "sin_red" });
  });
});
