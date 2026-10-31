// La puerta de la tubería (plan fichas con estado, trozo 26): papel, quién habla y salud.
// Cada caso malo cambia una cosa de una operación buena y dispara exactamente su motivo.
import { describe, it, expect } from "vitest";
import { comprobar } from "./puerta.js";
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
