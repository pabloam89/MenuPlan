import { beforeEach, describe, expect, it, vi } from "vitest";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";

vi.mock("./_guard.js", () => ({ cors: () => false, blocked: async () => false }));
vi.mock("./_bot/db.js", () => ({ usuarioDeToken: vi.fn(async (t) => (t === "buena" ? { id: "u1" } : null)) }));
vi.mock("./_bot/papel.js", () => ({ papelDeUsuario: vi.fn(async () => "editor") }));
vi.mock("./_bot/mercadonaEncargos.js", () => ({
  contarFallo: vi.fn(),
  PeticionMala: class extends Error {},
  casaPermitida: vi.fn(() => true),
  cerrar: vi.fn(async () => true),
  conectar: vi.fn(async () => ({ conectada: true })),
  desconectar: vi.fn(async () => ({ conectada: false })),
  cambiarLlegaHasta: vi.fn(async ({ llega_hasta }) => ({ llega_hasta })),
  guardarTelefono: vi.fn(async () => ({ guardado: true })),
  encargar: vi.fn(async () => ({ encargo: { id: "e1" } })),
  estadoDeCasa: vi.fn(async () => ({ disponible: true, cuenta: "conectada", encargo: null })),
  tomar: vi.fn(async () => null),
}));

const { default: handler } = await import("./mercadona.js");
const { papelDeUsuario } = await import("./_bot/papel.js");
const e = await import("./_bot/mercadonaEncargos.js");

function llamar({ method = "POST", token, body, query = {} }) {
  const res = {
    statusCode: 0,
    json(d) {
      this.datos = d;
      return this;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    setHeader() {},
  };
  return handler({ method, body, query, headers: token ? { authorization: `Bearer ${token}` } : {} }, res).then(() => res);
}
const trabajador = (body, token = "secreto-trabajador") => llamar({ token, body, query: { trabajador: "1" } });

beforeEach(() => {
  vi.clearAllMocks();
  papelDeUsuario.mockResolvedValue("editor");
  process.env.MERCADONA_TRABAJADOR_TOKEN = "secreto-trabajador";
  process.env.MERCADONA_CLAVE_PUBLICA = "clave";
});

describe("la app", () => {
  it("sin sesión, 401", async () => {
    expect((await llamar({ body: { casa: CASA } })).statusCode).toBe(401);
    expect((await llamar({ token: "mala", body: { casa: CASA } })).statusCode).toBe(401);
  });

  it("quien no es de la casa, 403, y no ve nada", async () => {
    papelDeUsuario.mockResolvedValue(null);
    const r = await llamar({ method: "GET", token: "buena", query: { casa: CASA } });
    expect(r.statusCode).toBe(403);
    expect(e.estadoDeCasa).not.toHaveBeenCalled();
  });

  it("quien solo ve la casa la lee, pero no encarga ni conecta", async () => {
    papelDeUsuario.mockResolvedValue("viewer");
    expect((await llamar({ method: "GET", token: "buena", query: { casa: CASA } })).statusCode).toBe(200);
    expect((await llamar({ token: "buena", body: { casa: CASA, encargar: { lista: {} } } })).statusCode).toBe(403);
    expect((await llamar({ token: "buena", body: { casa: CASA, conectar: { sesion_cifrada: "x" } } })).statusCode).toBe(403);
    expect(e.encargar).not.toHaveBeenCalled();
  });

  it("una casa sin permiso para el servicio no conecta ni encarga", async () => {
    e.casaPermitida.mockReturnValueOnce(false);
    expect((await llamar({ token: "buena", body: { casa: CASA, conectar: { sesion_cifrada: "x" } } })).statusCode).toBe(403);
    expect(e.conectar).not.toHaveBeenCalled();
  });

  it("una casa sin permiso sí puede borrar su sesión", async () => {
    e.casaPermitida.mockReturnValueOnce(false);
    expect((await llamar({ token: "buena", body: { casa: CASA, desconectar: true } })).statusCode).toBe(200);
  });

  it("GET da el estado y la clave pública", async () => {
    const r = await llamar({ method: "GET", token: "buena", query: { casa: CASA } });
    expect(r.datos).toMatchObject({ cuenta: "conectada", clave_publica: "clave" });
  });

  it("quién encarga sale del token, nunca del cuerpo", async () => {
    await llamar({ token: "buena", body: { casa: CASA, por: "otro", encargar: { lista: { name: "x" } } } });
    expect(e.encargar.mock.calls[0][0]).toMatchObject({ por: "u1", canal: "app" });
  });

  it("cambia hasta dónde llega el bot y guarda el teléfono sellado, con las funciones que usa Lola (trozo 17)", async () => {
    const r = await llamar({ token: "buena", body: { casa: CASA, llega_hasta: "reservar" } });
    expect(r.datos).toEqual({ llega_hasta: "reservar" });
    expect(e.cambiarLlegaHasta).toHaveBeenCalledWith({ casa: CASA, llega_hasta: "reservar" });
    await llamar({ token: "buena", body: { casa: CASA, telefono: { telefono_sellado: "sello" } } });
    expect(e.guardarTelefono).toHaveBeenCalledWith({ casa: CASA, telefono_sellado: "sello" });
  });

  it("quien solo ve la casa no cambia hasta dónde llega ni el teléfono", async () => {
    papelDeUsuario.mockResolvedValue("viewer");
    expect((await llamar({ token: "buena", body: { casa: CASA, llega_hasta: "pagar" } })).statusCode).toBe(403);
    expect((await llamar({ token: "buena", body: { casa: CASA, telefono: { telefono_sellado: "s" } } })).statusCode).toBe(403);
    expect(e.cambiarLlegaHasta).not.toHaveBeenCalled();
    expect(e.guardarTelefono).not.toHaveBeenCalled();
  });

  it("una casa mal formada, 400", async () => {
    expect((await llamar({ token: "buena", body: { casa: "x" } })).statusCode).toBe(400);
  });

  it("una petición sin nada que hacer, 400", async () => {
    expect((await llamar({ token: "buena", body: { casa: CASA } })).statusCode).toBe(400);
  });

  it("una lista mala es 400; un fallo nuestro, 500 sin detalle", async () => {
    e.encargar.mockRejectedValueOnce(new e.PeticionMala("lista no válida: vacía"));
    expect((await llamar({ token: "buena", body: { casa: CASA, encargar: { lista: {} } } })).statusCode).toBe(400);
    e.encargar.mockRejectedValueOnce(new Error("clave de la base"));
    const r = await llamar({ token: "buena", body: { casa: CASA, encargar: { lista: {} } } });
    expect(r.statusCode).toBe(500);
    expect(JSON.stringify(r.datos)).not.toContain("clave de la base");
  });
});

describe("el trabajador", () => {
  it("sin el token, o con el de una persona, 401", async () => {
    expect((await trabajador({ accion: "tomar" }, "buena")).statusCode).toBe(401);
    expect((await llamar({ body: { accion: "tomar" }, query: { trabajador: "1" } })).statusCode).toBe(401);
    expect(e.tomar).not.toHaveBeenCalled();
  });

  it("sin token configurado no entra nadie", async () => {
    delete process.env.MERCADONA_TRABAJADOR_TOKEN;
    expect((await llamar({ body: { accion: "tomar" }, query: { trabajador: "1" } })).statusCode).toBe(401);
  });

  it("toma el siguiente", async () => {
    e.tomar.mockResolvedValueOnce({ encargo: { id: "e1" }, sesion_cifrada: "s" });
    expect((await trabajador({ accion: "tomar" })).datos.siguiente.encargo.id).toBe("e1");
  });

  it("cierra", async () => {
    const r = await trabajador({ accion: "cerrar", id: CASA, resultado: { lista_xid: "1", entraron: 2, faltan: [] } });
    expect(r.statusCode).toBe(200);
    expect(r.datos).toEqual({ cerrado: true });
  });

  it("cierra con la revisión de la cuenta, también si el encargo falló", async () => {
    const revision = { tiene_direccion: false, tiene_pago: true };
    expect((await trabajador({ accion: "cerrar", id: CASA, resultado: { lista_xid: "1", entraron: 2, faltan: [], revision } })).statusCode).toBe(200);
    expect((await trabajador({ accion: "cerrar", id: CASA, resultado: { fallo: "error", revision } })).statusCode).toBe(200);
    // Una revisión con otra forma (un texto, o con algo más que los dos booleanos) no se acepta.
    expect((await trabajador({ accion: "cerrar", id: CASA, resultado: { fallo: "error", revision: { tiene_direccion: "si", tiene_pago: true } } })).statusCode).toBe(400);
    expect((await trabajador({ accion: "cerrar", id: CASA, resultado: { fallo: "error", revision: { ...revision, calle: "x" } } })).statusCode).toBe(400);
  });

  it("una lista que no se pudo releer se cierra sin cifras", async () => {
    const r = await trabajador({ accion: "cerrar", id: CASA, resultado: { lista_xid: "1", entraron: null, faltan: null } });
    expect(r.statusCode).toBe(200);
  });

  it.each([
    [{ fallo: "raro" }],
    [{ lista_xid: "1", entraron: null, faltan: [] }],
    [{ lista_xid: "", entraron: 1, faltan: [] }],
    [{ lista_xid: "1", entraron: -1, faltan: [] }],
    [{ lista_xid: "1", entraron: 1 }],
    [null],
    [{ lista_xid: "1", entraron: 1, faltan: [], revision: { tiene_direccion: "sí", tiene_pago: true } }],
    [{ lista_xid: "1", entraron: 1, faltan: [], revision: { tiene_direccion: true, tiene_pago: true, direccion: "Calle Mayor 1" } }],
  ])("un resultado mal formado no se cierra: %j", async (resultado) => {
    expect((await trabajador({ accion: "cerrar", id: CASA, resultado })).statusCode).toBe(400);
    expect(e.cerrar).not.toHaveBeenCalled();
  });
});
