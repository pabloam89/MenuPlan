import { describe, it, expect, vi } from "vitest";
import { CAMPOS_TRATO, TRATO_POR_DEFECTO, tratoDeFicha, lineaDelTrato, datosDelTrato, guardarTrato, personaDeLaCuenta } from "./trato.js";
import { REGISTRO_CAMPOS } from "../../src/lib/registroCampos.js";
import { RITMOS_TRATO, PROFUNDIDADES_TRATO, LARGOS_TRATO } from "../../src/lib/vocabularios.js";
import { esResultado, ESTADO } from "./resultado.js";
import { FICHAS } from "./agente.js";
import { PREGUNTA_DE_CAMPO } from "../../src/lib/siguientePregunta.js";

// Un elemento de la ficha «trato» de ficha_casa v2 (0116): el de una persona y un campo.
const el = (campo, persona, valor, estado = "dicho") => ({ campo, sujeto: { tipo: "persona", id: persona }, ambito: null, estado, valor });

describe("la ficha Trato sale del registro (trozo 16)", () => {
  it("cuatro campos por persona, sin ámbito ni pregunta, con los defectos del plan", () => {
    expect(CAMPOS_TRATO).toEqual(["tratoRitmo", "tratoProfundidad", "tratoFotos", "tratoLargo"]);
    for (const c of CAMPOS_TRATO) {
      expect(REGISTRO_CAMPOS[c], c).toMatchObject({ por: "persona", ficha: "trato", politica: "nunca", ambito: [] });
    }
    expect(TRATO_POR_DEFECTO).toEqual({ ritmo: "guiado", profundidad: "preguntar", fotos: true, largo: "corto" });
    expect(RITMOS_TRATO).toContain(TRATO_POR_DEFECTO.ritmo);
    expect(PROFUNDIDADES_TRATO).toContain(TRATO_POR_DEFECTO.profundidad);
    expect(LARGOS_TRATO).toContain(TRATO_POR_DEFECTO.largo);
  });
});

describe("tratoDeFicha: lo que dijo la persona de la cuenta, y el defecto en lo demás", () => {
  const ficha = { v: 2, fichas: { trato: [
    el("tratoRitmo", "p1", "directo"),
    el("tratoLargo", "p1", "corto", "por_defecto"),
    el("tratoFotos", "p1", false),
    el("tratoRitmo", "p2", "guiado"),
    el("tratoProfundidad", "p1", null, "vacio"),
  ] } };

  it("solo los de su persona, y solo lo vigente cuenta como dicho", () => {
    expect(tratoDeFicha(ficha, "p1")).toEqual({ ritmo: "directo", profundidad: "preguntar", fotos: false, largo: "corto", dicho: ["ritmo", "fotos"] });
    expect(tratoDeFicha(ficha, "p2")).toEqual({ ...TRATO_POR_DEFECTO, dicho: ["ritmo"] });
  });

  it("plan B: sin ficha, sin la ficha «trato» (sin la 0119) o sin persona de la cuenta, todo por defecto", () => {
    const defecto = { ...TRATO_POR_DEFECTO, dicho: [] };
    expect(tratoDeFicha(null, "p1")).toEqual(defecto);
    expect(tratoDeFicha({ v: 2, fichas: { casa: [] } }, "p1")).toEqual(defecto);
    expect(tratoDeFicha({ v: 1 }, "p1")).toEqual(defecto);
    expect(tratoDeFicha(ficha, null)).toEqual(defecto);
  });
});

describe("lineaDelTrato: cómo hablarle, en la ficha del turno", () => {
  it("por defecto: guiado, pregunta si afinar, corto; sin «(lo dijo)» y con la seguridad siempre", () => {
    const l = lineaDelTrato({ ...TRATO_POR_DEFECTO, dicho: [] });
    expect(l).toMatch(/^TRATO CON QUIEN ESCRIBE/);
    expect(l).toMatch(/guiado/);
    expect(l).toMatch(/lo preparas ya o lo afináis juntos/);
    expect(l).toMatch(/cortos/);
    expect(l).not.toMatch(/lo dijo/);
    expect(l).not.toMatch(/fotos/);
    expect(l).toMatch(/seguridad .* se pregunta siempre/);
  });

  it("lo dicho se marca, y sin fotos se dice", () => {
    const l = lineaDelTrato({ ritmo: "directo", profundidad: "nada", fotos: false, largo: "largo", dicho: ["ritmo", "fotos"] });
    expect(l).toMatch(/directo: decide tú .*\(lo dijo\)/);
    expect(l).toMatch(/hazlo ya/);
    expect(l).toMatch(/no quiere fotos de los platos \(lo dijo\)/);
    expect(l).toMatch(/explicar más/);
  });

  it("un valor que no conoce cae en el defecto, no en «undefined»", () => {
    expect(lineaDelTrato({ ritmo: "raro", profundidad: "x", largo: "y", fotos: true, dicho: [] })).not.toMatch(/undefined/);
    expect(lineaDelTrato(null)).toMatch(/guiado/);
  });
});

describe("guardarTrato (ajustar_trato): un dato por campo pedido, de la persona de la cuenta, y su recibo", () => {
  const ctx = (escribir) => ({ householdId: "casa-1", personaId: "p1", autor: { user_id: "u1", papel: "titular", canal: "telegram" }, op: { herramienta: "ajustar_trato", mid: "m1" }, escribir, clave: "k1" });

  it("datosDelTrato: solo lo pedido, dicho, con la persona", () => {
    expect(datosDelTrato({ ritmo: "directo", fotos: false }, "p1")).toEqual([
      { campo: "tratoRitmo", persona_id: "p1", valor: "directo", origen: "dicho" },
      { campo: "tratoFotos", persona_id: "p1", valor: false, origen: "dicho" },
    ]);
    expect(datosDelTrato({}, "p1")).toEqual([]);
  });

  it("guardado: la operación lleva casa, canal, mensaje, autor con su persona y los datos; el recibo dice lo hecho", async () => {
    const escribir = vi.fn(async () => ({ guardado: true, estado: "hecha", hecho: [{ campo: "tratoRitmo", persona_id: "p1" }, { campo: "tratoLargo", persona_id: "p1" }], sin_hacer: [] }));
    const r = await guardarTrato({ ritmo: "directo", largo: "largo" }, ctx(escribir));
    const [pedido, { papel }] = escribir.mock.calls[0];
    expect(papel).toBe("titular");
    expect(pedido).toMatchObject({ casa: "casa-1", clave: "k1", accion: "ajustar_trato", canal: "telegram", ref: { tipo: "mensaje", id: "m1" }, autor: { user_id: "u1", persona_id: "p1" } });
    expect(pedido.datos.map((d) => d.campo)).toEqual(["tratoRitmo", "tratoLargo"]);
    expect(esResultado(r)).toBe(true);
    expect(r.estado).toBe(ESTADO.HECHO);
    expect(r.hecho).toEqual(["ritmo directo", "largo de los mensajes largo"]);
  });

  it("plan B: sin la 0119 la base lo rechaza y el recibo dice «sin hacer» con el porqué, no «hecho»", async () => {
    const escribir = vi.fn(async () => ({ guardado: false, fallo: "invalido", error: "FK" }));
    const r = await guardarTrato({ fotos: false }, ctx(escribir));
    expect(r.estado).toBe(ESTADO.NADA);
    expect(r.sinHacer).toEqual([{ que: "fotos no", motivo: "invalido" }]);
  });

  it("parcial: lo que la base no hizo va con su motivo", async () => {
    const escribir = vi.fn(async () => ({ guardado: false, estado: "parcial", hecho: [{ campo: "tratoRitmo" }], sin_hacer: [{ campo: "tratoProfundidad", motivo: "no_es_de_la_casa" }] }));
    const r = await guardarTrato({ ritmo: "guiado", profundidad: "mucho" }, ctx(escribir));
    expect(r.estado).toBe(ESTADO.PARCIAL);
    expect(r.sinHacer).toEqual([{ que: "cuánto afinar mucho", motivo: "no_es_de_la_casa" }]);
  });

  it("sin persona de la cuenta no escribe nada y lo dice", async () => {
    const escribir = vi.fn();
    const r = await guardarTrato({ ritmo: "directo" }, { ...ctx(escribir), personaId: null });
    expect(escribir).not.toHaveBeenCalled();
    expect(r.estado).toBe(ESTADO.NADA);
    expect(r.sinHacer[0].motivo).toMatch(/quién de la casa eres/);
  });

  it("la ficha de ajustar_trato escribe justo los cuatro datos del trato", () => {
    expect(FICHAS.get("ajustar_trato").escribe).toEqual(CAMPOS_TRATO.map((c) => `members.${c}`));
  });
});

describe("personaDeLaCuenta: de quién es el trato", () => {
  const data = { accountMemberId: "titular", accountMemberIdByUser: { u1: "p1" } };

  it("la cuenta con su entrada, su persona", () => {
    expect(personaDeLaCuenta(data, "u1", "editor")).toBe("p1");
  });

  it("el titular sin entrada cae en el respaldo compartido; la pareja (editor) no: no sabe quién es", () => {
    expect(personaDeLaCuenta(data, "u2", "owner")).toBe("titular");
    expect(personaDeLaCuenta(data, "u2", "editor")).toBeNull();
    expect(personaDeLaCuenta(data, "u2", "viewer")).toBeNull();
  });
});

describe("siguientePregunta.js: cada respuesta se guarda con una herramienta de Lola que escribe ese dato", () => {
  it("guarda es el nombre de una herramienta, y su ficha escribe el campo", () => {
    for (const [campo, { guarda }] of Object.entries(PREGUNTA_DE_CAMPO)) {
      expect(FICHAS.has(guarda), `${campo} → ${guarda}`).toBe(true);
      expect(FICHAS.get(guarda).escribe, `${campo} → ${guarda}`).toContain(campo);
    }
  });
});
