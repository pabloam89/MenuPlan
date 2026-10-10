import { describe, expect, it } from "vitest";

import { CAMPOS_ENCARGO, ESCALONES_AUTOMATICOS, MAX_ENCARGOS_POR_FONDO, plantillaEncargo } from "./lib/issues.mjs";
import { CATALOGO as MECANISMOS } from "./lib/mecanismos.mjs";
import { TIPOS_CAMPO_ENCARGO, fondoDeRest, hijoDeRest, leerEncargo, validarEncargos, validarFicha } from "./lib/fondos.mjs";

/**
 * El bloque `encargo` y las reglas del plan (#396; P06.2 y P06.4 de ops/flujo.json):
 * como mucho tres encargos, y uno preventivo con un mecanismo de escalón
 * automático. Las claves salen de CAMPOS_ENCARGO y los escalones de
 * ops/mecanismos.json: aquí no se copian.
 */

const AUTOMATICO = MECANISMOS.mecanismos.find((m) => ESCALONES_AUTOMATICOS.includes(m.escalon)).id;
const BLANDO = MECANISMOS.mecanismos.find((m) => !ESCALONES_AUTOMATICOS.includes(m.escalon)).id;
const POR = { por_que_no_mas_alto: "no se puede" };

const CERCA = "```";
const bloque = (c) => `Qué.\n\n${CERCA}encargo\n${Object.entries(c).map(([k, v]) => `${k}: ${v}`).join("\n")}\n${CERCA}\n`;
const BUENO = {
  fondo: "#50", tipo_accion: "preventivo", mecanismo: AUTOMATICO, clase: "toda X que Y", depende_de: "ninguno",
  constructor: "gobierno", juez: "revisor", verificacion: "scripts/fondos.test.js", hecho_cuando: "falla sin la regla",
};
const enc = (number, extra = {}, quitar = []) => {
  const c = { ...BUENO, ...extra };
  for (const q of quitar) delete c[q];
  return { number, body: bloque(c), labels: [{ name: "tipo:encargo" }], tipo: "encargo" };
};
const reglas = (r) => r.map((x) => x.regla);

describe("leerEncargo", () => {
  it("lee un bloque bueno con el mismo lector que la ficha", () => {
    const r = leerEncargo(bloque(BUENO));
    expect(r.presente).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.ficha.depende_de).toEqual([]);
    expect(r.ficha.fondo).toEqual([50]);
  });
  it("sin bloque: no presente; un bloque `fondo` no vale como encargo", () => {
    expect(leerEncargo("nada").presente).toBe(false);
    expect(leerEncargo(`${CERCA}fondo\nestado: abierto\n${CERCA}`).presente).toBe(false);
  });
  it("una clave inventada, un valor fuera de vocabulario y un bloque abierto son errores del encargo", () => {
    expect(reglas(leerEncargo(bloque({ ...BUENO, inventada: "x" })).errores)).toEqual(["encargo-bloque"]);
    expect(reglas(leerEncargo(bloque({ ...BUENO, tipo_accion: "raro" })).errores)).toEqual(["encargo-vocabulario"]);
    expect(reglas(leerEncargo(bloque({ ...BUENO, mecanismo: "inventado" })).errores)).toEqual(["encargo-vocabulario"]);
    expect(reglas(leerEncargo(`${CERCA}encargo\nfondo: #1\n`).errores)).toEqual(["encargo-bloque"]);
  });
  it("`fondo` es un solo #n", () => {
    expect(reglas(leerEncargo(bloque({ ...BUENO, fondo: "#1, #2" })).errores)).toEqual(["encargo-vocabulario"]);
  });
  it("todas las claves del formato tienen tipo, y no sobra ninguna", () => {
    expect(Object.keys(TIPOS_CAMPO_ENCARGO).sort()).toEqual(CAMPOS_ENCARGO.map((c) => c.clave).sort());
    expect(plantillaEncargo()).toContain(`${CERCA}encargo`);
  });
});

describe("validarEncargos", () => {
  it("un plan bueno de un encargo preventivo automático no da nada", () => {
    expect(validarEncargos([enc(1)], "plan")).toEqual([]);
  });
  it(`más de ${MAX_ENCARGOS_POR_FONDO} encargos: plan-grande, también antes del plan`, () => {
    const cuatro = [1, 2, 3, 4].map((n) => enc(n));
    expect(reglas(validarEncargos(cuatro, "plan"))).toEqual(["plan-grande"]);
    expect(reglas(validarEncargos(cuatro, "abierto"))).toEqual(["plan-grande"]);
    expect(validarEncargos(cuatro.slice(0, 3), "plan")).toEqual([]);
  });
  it("un encargo sin bloque, desde el plan", () => {
    const sin = { number: 9, body: "solo texto", labels: [], tipo: "encargo" };
    expect(reglas(validarEncargos([enc(1), sin], "plan"))).toEqual(["encargo-sin-bloque"]);
    expect(validarEncargos([sin], "diagnosticado")).toEqual([]);
  });
  it("un encargo al que le falta un campo obligatorio", () => {
    const r = validarEncargos([enc(1, {}, ["juez", "hecho_cuando"])], "plan");
    expect(reglas(r)).toEqual(["encargo-incompleto"]);
    expect(r[0].mensaje).toMatch(/juez, hecho_cuando/);
  });
  it("fuera del primer escalón pide por_que_no_mas_alto; en el primero no", () => {
    expect(reglas(validarEncargos([enc(2), enc(1, { tipo_accion: "detectivo", mecanismo: BLANDO })], "plan"))).toEqual(["encargo-incompleto"]);
    expect(validarEncargos([enc(2), enc(1, { tipo_accion: "detectivo", mecanismo: BLANDO, ...POR })], "plan")).toEqual([]);
  });
  it("quien construye no juzga", () => {
    expect(reglas(validarEncargos([enc(1, { juez: "gobierno" })], "plan"))).toEqual(["encargo-juez"]);
  });
  it("sin preventivo automático: todo detectivo, o preventivo con un mecanismo blando", () => {
    expect(reglas(validarEncargos([enc(1, { tipo_accion: "detectivo", ...POR })], "plan"))).toEqual(["sin-preventivo-automatico"]);
    expect(reglas(validarEncargos([enc(1, { mecanismo: BLANDO, ...POR })], "plan"))).toEqual(["sin-preventivo-automatico"]);
    // Uno solo preventivo automático entre otros basta.
    expect(validarEncargos([enc(1, { tipo_accion: "correctivo", mecanismo: BLANDO, ...POR }), enc(2)], "plan")).toEqual([]);
  });
  it("sin preventivo automático no se exige antes del plan ni sin encargos", () => {
    expect(validarEncargos([enc(1, { tipo_accion: "detectivo" })], "diagnosticado")).toEqual([]);
    expect(validarEncargos([], "plan")).toEqual([]);
  });
  it("si un bloque no se lee, no se añade además «sin preventivo» (un motivo cada vez)", () => {
    expect(reglas(validarEncargos([enc(1, { tipo_accion: "raro" })], "plan"))).toEqual(["encargo-vocabulario"]);
  });
  it("los mensajes no copian texto del autor", () => {
    const r = validarEncargos([enc(1, { clase: "<script>@pablo</script>", tipo_accion: "http://x.y" })], "plan");
    expect(JSON.stringify(r)).not.toMatch(/script|@pablo|http:/);
  });
});

describe("validarFicha con encargos", () => {
  const ficha = (estado) => `${CERCA}fondo\nestado: ${estado}\ntipo_causa: vigilante-hueco\nalcance: modulo\nseveridad: medio\nmecanismo: m\ncausa_escape: c\n${CERCA}\n### Arreglo general`;
  const fondo = (estado, hijos, createdAt = "2026-10-12T10:00:00Z") => fondoDeRest({
    number: 50, title: "[fondo] x", state: "open", created_at: createdAt, body: ficha(estado),
    labels: [{ name: "tipo:fondo" }, { name: "causa:vigilante-hueco" }, { name: "area:ops" }],
  }, hijos.map((h) => ({ ...h, state: "open" })));
  const CTX = { hoy: "2026-10-20", existeEnStaging: () => true };
  const errores = (r) => r.hallazgos.filter((h) => h.gravedad === "error").map((h) => h.regla);
  const detectivo = () => enc(1, { tipo_accion: "detectivo", ...POR });

  it("hijoDeRest conserva el cuerpo del encargo (sin él nada se podría leer)", () => {
    expect(hijoDeRest({ number: 1, state: "open", labels: ["tipo:encargo"], body: "hola" }).body).toBe("hola");
  });
  it("un fondo nuevo en plan sin preventivo automático falla", () => {
    expect(errores(validarFicha(fondo("plan", [detectivo()]), CTX))).toContain("sin-preventivo-automatico");
  });
  it("uno bueno, no", () => {
    expect(errores(validarFicha(fondo("plan", [enc(1)]), CTX))).not.toContain("sin-preventivo-automatico");
  });
  it("un fondo de antes de la ficha solo avisa (falla abierto)", () => {
    const r = validarFicha(fondo("plan", [detectivo()], "2026-10-01T10:00:00Z"), CTX);
    expect(errores(r)).not.toContain("sin-preventivo-automatico");
    expect(r.hallazgos.filter((h) => h.gravedad === "aviso").map((h) => h.regla)).toContain("sin-preventivo-automatico");
  });
});

describe("ronda 2 de #396: constructor heredado, autores de fuera y plan vigente", () => {
  const cerrado = (n, extra = {}, razon = "COMPLETED") => ({ ...enc(n, extra), state: "CLOSED", stateReason: razon });
  const POR2 = { por_que_no_mas_alto: "no se puede" };

  it("un bloque con todo menos «constructor» es incompleto (no lo hereda de Object)", () => {
    const r = validarEncargos([enc(1, {}, ["constructor"])], "plan");
    expect(reglas(r)).toEqual(["encargo-incompleto"]);
    expect(r[0].mensaje).toMatch(/constructor/);
  });
  it("y encargo-juez sigue funcionando con «constructor» puesto", () => {
    expect(reglas(validarEncargos([enc(1, { constructor: "revisor" })], "plan"))).toEqual(["encargo-juez"]);
  });
  it("un encargo de fuera de la casa no cuenta y avisa", () => {
    const fuera = { ...enc(9), asociacion: "NONE" };
    const cuatro = [enc(1), enc(2), enc(3), fuera];
    const r = validarEncargos(cuatro, "plan");
    expect(reglas(r)).toEqual(["encargo-de-fuera"]);
    expect(r[0].gravedad).toBe("aviso");
    expect(validarEncargos([{ ...enc(1), asociacion: "OWNER" }], "plan")).toEqual([]);
  });
  it("hijoDeRest guarda la asociación del autor", () => {
    expect(hijoDeRest({ number: 1, state: "open", labels: [], author_association: "NONE" }).asociacion).toBe("NONE");
  });
  it("el plan vigente: 3 completados y 1 de corrección abierto no es un plan grande", () => {
    const hechos = [cerrado(1), cerrado(2, { tipo_accion: "correctivo", mecanismo: BLANDO, ...POR2 }), cerrado(3, { tipo_accion: "detectivo", mecanismo: BLANDO, ...POR2 })];
    expect(reglas(validarEncargos([...hechos, enc(4, { tipo_accion: "correctivo", mecanismo: BLANDO, ...POR2 })], "plan"))).toEqual([]);
  });
  it("cuentan los abiertos y los preventivos automáticos hechos; los cancelados y duplicados no", () => {
    const abiertos = [enc(1, { tipo_accion: "correctivo", mecanismo: BLANDO, ...POR2 }), enc(2, { tipo_accion: "correctivo", mecanismo: BLANDO, ...POR2 }), enc(3, { tipo_accion: "correctivo", mecanismo: BLANDO, ...POR2 })];
    // Un cuarto: el preventivo automático ya hecho cuenta.
    expect(reglas(validarEncargos([...abiertos, cerrado(4)], "plan"))).toEqual(["plan-grande"]);
    expect(reglas(validarEncargos([...abiertos, cerrado(4, {}, "NOT_PLANNED")], "plan"))).not.toContain("plan-grande");
    expect(reglas(validarEncargos([...abiertos, cerrado(4, {}, "DUPLICATE")], "plan"))).not.toContain("plan-grande");
  });
  it("un cancelado no aporta el «preventivo automático»", () => {
    expect(reglas(validarEncargos([enc(1, { tipo_accion: "detectivo", ...POR2 }), cerrado(2, {}, "NOT_PLANNED")], "plan"))).toEqual(["sin-preventivo-automatico"]);
  });
});
