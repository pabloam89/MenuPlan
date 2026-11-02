// La puerta de la tubería (plan fichas con estado, trozo 26): papel, quién habla y salud.
// Cada caso malo cambia una cosa de una operación buena y dispara exactamente su motivo.
import { describe, it, expect } from "vitest";
import { comprobar, choquesAlGuardar, seContradicen, trasLosChoques } from "./puerta.js";
import { REGISTRO_CAMPOS } from "../registroCampos.js";
import { PAPELES, puede } from "../papeles.js";
import { CANALES_DATO, CANAL_DATO, ORIGEN_DATO, ORIGENES_DE_LA_FAMILIA, MOTIVOS_PUERTA, MOTIVO_PUERTA, SEXO } from "../vocabularios.js";

const dato = (d = {}) => ({ campo: "sexo", persona_id: "p1", valor: SEXO[0], origen: "dicho", ...d });
const op = (o = {}) => ({ canal: CANAL_DATO.TELEGRAM, autor_user_id: "u1", datos: [dato()], ...o });
const EDITA = { papel: "editor" };
const motivo = (o, quien = EDITA) => comprobar(op(o), quien)?.motivo ?? null;

describe("puerta: quién puede", () => {
  it("una persona de la casa que la edita, diciendo un dato, pasa", () => {
    expect(comprobar(op(), EDITA)).toBeNull();
    expect(comprobar(op(), { papel: "owner" })).toBeNull();
  });

  it("un lector, alguien sin cuenta del grupo (ajeno) o alguien de fuera no escriben", () => {
    for (const papel of ["viewer", "ajeno", null]) expect(motivo({}, { papel }), String(papel)).toBe(MOTIVO_PUERTA.SIN_PERMISO);
  });

  it("Lola o la app sin autor no escriben: siempre hablan por alguien", () => {
    expect(motivo({ autor_user_id: null })).toBe(MOTIVO_PUERTA.SIN_PERMISO);
    expect(motivo({ canal: CANAL_DATO.APP, autor_user_id: null })).toBe(MOTIVO_PUERTA.SIN_PERMISO);
  });

  it("el sistema (cron, motor) sin autor puede suponer", () => {
    expect(comprobar(op({ canal: CANAL_DATO.SISTEMA, autor_user_id: null, datos: [dato({ origen: "supuesto" })] }), { papel: null })).toBeNull();
  });
});

describe("puerta: quién habla", () => {
  it("el sistema no firma lo que dice la familia", () => {
    expect(motivo({ canal: CANAL_DATO.SISTEMA, autor_user_id: null }, { papel: null })).toBe(MOTIVO_PUERTA.ORIGEN_NO_VALE);
  });

  it("desde una pantalla no se supone", () => {
    expect(motivo({ canal: CANAL_DATO.APP, datos: [dato({ origen: "supuesto" })] })).toBe(MOTIVO_PUERTA.ORIGEN_NO_VALE);
    expect(motivo({ canal: CANAL_DATO.APP })).toBeNull();
  });

  it("el motivo dice qué dato lo disparó", () => {
    const c = comprobar(op({ canal: CANAL_DATO.APP, datos: [dato(), dato({ campo: "colegio", origen: "visto" })] }), EDITA);
    expect(c).toEqual({ motivo: MOTIVO_PUERTA.ORIGEN_NO_VALE, campo: "colegio", persona_id: "p1" });
  });
});

describe("puerta: salud", () => {
  const SALUD = Object.keys(REGISTRO_CAMPOS).filter((c) => REGISTRO_CAMPOS[c].seguridad);

  it("hay campos de salud en el registro (si no, lo de abajo no mide nada)", () => {
    expect(SALUD.length).toBeGreaterThan(0);
  });

  it("una alergia supuesta por Lola no pasa; dicha por quien edita, sí", () => {
    const alergia = (origen) => [dato({ campo: "alergias", valor: [], origen })];
    expect(motivo({ datos: alergia("supuesto") })).toBe(MOTIVO_PUERTA.SALUD_SIN_FAMILIA);
    expect(motivo({ datos: alergia("dicho") })).toBeNull();
  });

  it("sin agujeros: de todas las combinaciones, un dato de salud solo pasa dicho por una persona de la casa que la edita", () => {
    const pasan = [];
    for (const campo of SALUD) for (const origen of ORIGEN_DATO) for (const canal of CANALES_DATO)
      for (const autor of ["u1", null]) for (const papel of [...PAPELES, "ajeno", null]) {
        const c = comprobar({ canal, autor_user_id: autor, datos: [dato({ campo, origen })] }, { papel });
        if (!c) pasan.push({ origen, autor, papel });
      }
    expect(pasan.length).toBeGreaterThan(0);
    for (const p of pasan) {
      expect(ORIGENES_DE_LA_FAMILIA).toContain(p.origen);
      expect(p.autor).not.toBeNull();
      expect(puede(p.papel, "editar_casa")).toBe(true);
    }
  });
});

it("cada motivo de MOTIVOS_PUERTA lo dispara algún caso", () => {
  const vistos = new Set([
    motivo({}, { papel: "viewer" }),
    motivo({ canal: CANAL_DATO.APP, datos: [dato({ origen: "supuesto" })] }),
    motivo({ datos: [dato({ campo: "alergias", valor: [], origen: "supuesto" })] }),
  ]);
  expect([...vistos].sort()).toEqual([...MOTIVOS_PUERTA].sort());
});

// Choques al guardar (método de choques, trozo 33): una preferencia nueva contra las que ya tiene la casa.
describe("puerta: choques al guardar", () => {
  const AT = "2026-11-02T10:00:00Z";
  const fila = (p = {}) => ({ nivel: "plato", eje: "tecnica", medida: "valor", operador: "mas", valor: "horno", fuerza: "medio", origen: "dicho", ...p });
  const guardada = (p = {}) => fila({ id: "g1", dicho_by: "u1", updated_at: "2026-10-01T10:00:00Z", ...p });
  const choques = (nuevas, guardadas, quien = {}) => choquesAlGuardar(nuevas, guardadas, { autor: "u1", papel: "owner", at: AT, ...quien });

  it("se contradicen «más» y «menos», «es» y «no es», y «al menos» y «como mucho» solo si no caben", () => {
    expect(seContradicen(fila(), fila({ operador: "menos" }))).toBe(true);
    expect(seContradicen(fila({ operador: "es" }), fila({ operador: "no_es" }))).toBe(true);
    expect(seContradicen(fila(), fila())).toBe(false);
    expect(seContradicen(fila(), fila({ operador: "menos", valor: "plancha" }))).toBe(false);
    const tope = (operador, cantidad) => fila({ nivel: "semana", medida: "cuenta", operador, cantidad });
    expect(seContradicen(tope("al_menos", 3), tope("como_mucho", 2))).toBe(true);
    expect(seContradicen(tope("como_mucho", 2), tope("al_menos", 3))).toBe(true);
    expect(seContradicen(tope("al_menos", 2), tope("como_mucho", 3))).toBe(false);
  });

  it("dos personas o dos grupos distintos no chocan; la casa entera choca con todos; días que no se cruzan, tampoco", () => {
    expect(seContradicen(fila({ persona_id: "p1" }), fila({ operador: "menos", persona_id: "p2" }))).toBe(false);
    expect(seContradicen(fila({ grupo_id: "g1" }), fila({ operador: "menos" }))).toBe(true);
    expect(seContradicen(fila({ dias: ["Lun"] }), fila({ operador: "menos", dias: ["Mar"] }))).toBe(false);
    expect(seContradicen(fila({ dias: ["Lun", "Mar"] }), fila({ operador: "menos", dias: ["Mar"] }))).toBe(true);
  });

  it("la misma persona cambia de idea: gana lo nuevo por tiempo y se avisa", () => {
    expect(choques([fila({ operador: "menos" })], [guardada()])).toEqual([
      { momento: "al_guardar", nueva: 0, guardada: "g1", clases: ["deseo", "deseo"], gana: "a", criterio: "tiempo", respuesta: "aplicar_y_avisar" },
    ]);
  });

  it("otra persona dijo lo contrario: el orden no decide y es de la casa, así que tarea de decisión", () => {
    expect(choques([fila({ operador: "menos" })], [guardada({ dicho_by: "u2" })])).toMatchObject([{ gana: null, respuesta: "tarea_de_decision" }]);
  });

  it("lo que Lola vio no pisa lo dicho (gana lo guardado por clase), y lo dicho gana a lo visto", () => {
    expect(choques([fila({ operador: "menos", origen: "visto", fuerza: "bajo" })], [guardada()], { autor: null, papel: null }))
      .toMatchObject([{ clases: ["aprendido", "deseo"], gana: "b", criterio: "clase" }]);
    expect(choques([fila({ operador: "menos" })], [guardada({ origen: "visto", fuerza: "bajo", dicho_by: null })]))
      .toMatchObject([{ clases: ["deseo", "aprendido"], gana: "a", criterio: "clase", respuesta: "aplicar_y_avisar" }]);
  });

  it("lo de una persona sobre lo de la casa: gana por alcance (lo más concreto)", () => {
    expect(choques([fila({ operador: "menos", persona_id: "p1" })], [guardada()])).toMatchObject([{ gana: "a", criterio: "alcance" }]);
  });

  it("cambiar a su contraria la fila que dijo otra persona choca (tarea de decisión); la propia, no se aparta; en una pantalla, no choca", () => {
    expect(choques([fila({ id: "g1", operador: "menos" })], [guardada({ dicho_by: "u2" })])).toMatchObject([{ guardada: "g1", respuesta: "tarea_de_decision" }]);
    const propia = choques([fila({ id: "g1", operador: "menos" })], [guardada()]);
    expect(propia).toMatchObject([{ criterio: "tiempo", respuesta: "aplicar_y_avisar" }]);
    expect(trasLosChoques([fila({ id: "g1", operador: "menos" })], propia)).toEqual({ preferencias: [fila({ id: "g1", operador: "menos" })], apartadas: [] });
    expect(choques([fila({ id: "g1", operador: "menos" })], [guardada({ dicho_by: "u2" })], { delante: true })).toEqual([]);
  });

  it("lo que la misma operación borra, y lo ya rechazado, no chocan", () => {
    expect(choques([{ id: "g1", borrar: true }, fila({ operador: "menos" })], [guardada()])).toEqual([]);
    expect(choques([fila({ operador: "menos" })], [guardada({ rechazada_at: "2026-10-02T10:00:00Z" })])).toEqual([]);
  });
});
