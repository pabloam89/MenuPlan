// La tubería de operaciones (plan fichas con estado, trozo 26): entender, comprobar,
// aplicar, apuntar y contar, con una base falsa (rpc) que apunta lo que le llega.
import { describe, it, expect, vi, afterEach } from "vitest";
import { operar, RPC_OPERACION } from "./tuberia.js";
import { CANAL_DATO, REF_OPERACION, ESTADO_OPERACION, FALLO_DATO, MOTIVO_PUERTA, SEXO } from "../vocabularios.js";

const CASA = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";
const PEDIDO = {
  casa: CASA, clave: "tg:7:sexo", accion: "ver_ajustes", canal: CANAL_DATO.TELEGRAM,
  ref: { tipo: REF_OPERACION.MENSAJE, id: "7" }, autor: { user_id: "u1" },
  dato: { campo: "sexo", persona_id: "p1", valor: SEXO[0], origen: "dicho" },
};
const HECHA = { operacion_id: "op1", estado: ESTADO_OPERACION.HECHA, repetida: false, hecho: [{ campo: "sexo", persona_id: "p1", sobre_id: "s1" }], sin_hacer: [], choques: [], rev: 3 };

function base(responder = () => HECHA) {
  const llegan = [];
  const rpc = vi.fn(async (funcion, args) => {
    llegan.push({ funcion, op: args.p_operacion });
    return responder(args.p_operacion);
  });
  return { llegan, servidor: (papel) => ({ papel, rpc, falloDeError: () => ({ fallo: FALLO_DATO.RPC_AUSENTE, motivo: "no_existe" }) }) };
}
const silenciar = () => vi.spyOn(console, "error").mockImplementation(() => {});
const lineas = (espia) => espia.mock.calls.map((a) => JSON.parse(a[0]));

afterEach(() => vi.restoreAllMocks());

describe("tubería: lo que pasa la puerta", () => {
  it("se aplica con una sola llamada a aplicar_operacion y se cuenta sin pedido ni inversa", async () => {
    const { llegan, servidor } = base(() => ({ ...HECHA, pedido: { datos: [] }, inversa: {} }));
    const r = await operar(PEDIDO, servidor("editor"));
    expect(llegan).toHaveLength(1);
    expect(llegan[0]).toMatchObject({ funcion: RPC_OPERACION, op: { casa: CASA, clave: "tg:7:sexo", canal: "telegram", autor_user_id: "u1" } });
    expect(llegan[0].op).not.toHaveProperty("estado");
    expect(r).toEqual({ guardado: true, ...HECHA });
  });

  it("sin la RPC (0106 sin aplicar): no se guarda, vuelve rpc_ausente y queda en el log", async () => {
    const log = silenciar();
    const { servidor } = base(() => { throw new Error("PGRST202"); });
    expect(await operar(PEDIDO, servidor("owner"))).toEqual({ guardado: false, fallo: FALLO_DATO.RPC_AUSENTE });
    expect(lineas(log)).toEqual([{ evento: "dato_sin_guardar", fallo: "rpc_ausente", motivo: "no_existe", canal: "telegram", campo: "sexo" }]);
  });
});

describe("tubería: lo que no entiende o para la puerta no llega como dato", () => {
  it("un dato que no cuadra con el registro no sale hacia la base", async () => {
    silenciar();
    const { llegan, servidor } = base();
    const r = await operar({ ...PEDIDO, dato: { ...PEDIDO.dato, valor: "otro_valor" } }, servidor("owner"));
    expect(r).toMatchObject({ guardado: false, fallo: FALLO_DATO.INVALIDO });
    expect(llegan).toEqual([]);
  });

  it("un lector: se apunta como rechazada, con el motivo y sin el valor, y se dice sin_permiso", async () => {
    const log = silenciar();
    const { llegan, servidor } = base((op) => ({ operacion_id: "op9", estado: op.estado, hecho: [], sin_hacer: op.sin_hacer }));
    const r = await operar(PEDIDO, servidor("viewer"));
    expect(r).toEqual({ guardado: false, fallo: FALLO_DATO.SIN_PERMISO, error: MOTIVO_PUERTA.SIN_PERMISO, operacion_id: "op9" });
    expect(llegan).toHaveLength(1);
    expect(llegan[0].op).toMatchObject({ estado: ESTADO_OPERACION.RECHAZADA, sin_hacer: [{ motivo: MOTIVO_PUERTA.SIN_PERMISO }] });
    expect(llegan[0].op.pedido.datos).toEqual([{ campo: "sexo", persona_id: "p1", origen: "dicho" }]);
    expect(lineas(log)).toEqual([{ evento: "dato_sin_guardar", fallo: "sin_permiso", motivo: "sin_permiso", canal: "telegram", campo: "sexo" }]);
  });

  it("alguien de fuera de la casa: ni dato ni apunte (la base no acepta autores de fuera)", async () => {
    silenciar();
    const { llegan, servidor } = base();
    expect(await operar(PEDIDO, servidor(null))).toMatchObject({ guardado: false, fallo: FALLO_DATO.SIN_PERMISO, operacion_id: null });
    expect(llegan).toEqual([]);
  });

  it("una alergia que supone el motor solo llega a la base como rechazada", async () => {
    silenciar();
    const { llegan, servidor } = base((op) => ({ operacion_id: "op5", estado: op.estado }));
    const pedido = { ...PEDIDO, canal: CANAL_DATO.SISTEMA, ref: { tipo: REF_OPERACION.MOTOR, id: "m" }, autor: {},
      dato: { campo: "alergias", persona_id: "p1", valor: [], origen: "supuesto" } };
    expect(await operar(pedido, servidor(null))).toMatchObject({ guardado: false, fallo: FALLO_DATO.INVALIDO, error: MOTIVO_PUERTA.SALUD_SIN_FAMILIA });
    expect(llegan.map((l) => l.op.estado)).toEqual([ESTADO_OPERACION.RECHAZADA]);
  });

  it("si apuntar el rechazo falla, se dice el motivo de la puerta igual", async () => {
    silenciar();
    const { servidor } = base(() => { throw new Error("caída"); });
    expect(await operar(PEDIDO, servidor("viewer"))).toEqual({ guardado: false, fallo: FALLO_DATO.SIN_PERMISO, error: MOTIVO_PUERTA.SIN_PERMISO, operacion_id: null });
  });
});
