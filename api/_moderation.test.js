import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signReport, verifyReportToken, TARGETS } from "./_moderation.js";

const ID = "3f2b1c9a-0000-4000-8000-abcdefabcdef";

describe("firma del enlace de retirada", () => {
  const original = process.env.MODERATION_SECRET;
  beforeEach(() => { process.env.MODERATION_SECRET = "secreto-de-prueba"; });
  afterEach(() => {
    if (original === undefined) delete process.env.MODERATION_SECRET;
    else process.env.MODERATION_SECRET = original;
  });

  it("acepta su propia firma", () => {
    expect(verifyReportToken(ID, signReport(ID))).toBe(true);
  });

  it("rechaza la firma de otro reporte", () => {
    const ajena = signReport("otro-id-distinto");
    expect(verifyReportToken(ID, ajena)).toBe(false);
  });

  // timingSafeEqual revienta si las longitudes no coinciden, asi que la
  // comparacion tiene que descartarlas antes de llegar ahi. Sin ese guard,
  // un token corto no es "no valido": es un 500.
  it("rechaza un token de otra longitud sin lanzar", () => {
    expect(() => verifyReportToken(ID, "corto")).not.toThrow();
    expect(verifyReportToken(ID, "corto")).toBe(false);
  });

  it("rechaza un token vacio", () => {
    expect(verifyReportToken(ID, "")).toBe(false);
    expect(verifyReportToken(ID, null)).toBe(false);
  });

  // Sin secreto no se firma NADA: mas vale un correo sin boton de retirar que
  // un enlace que cualquiera pueda reproducir.
  it("sin MODERATION_SECRET no firma ni valida", () => {
    delete process.env.MODERATION_SECRET;
    expect(signReport(ID)).toBeNull();
    expect(verifyReportToken(ID, "loquesea")).toBe(false);
  });
});

describe("mapa de contenido reportable", () => {
  it("cubre los cuatro tipos que puede reportar la app", () => {
    // Los mismos que REPORT_REASONS/targetType en src/components/ReportSheet.jsx.
    expect(Object.keys(TARGETS).sort()).toEqual(["comment", "menu", "profile", "recipe"]);
  });

  it("solo borra comentarios; el resto se oculta", () => {
    expect(TARGETS.comment.action).toBe("delete");
    for (const tipo of ["recipe", "menu", "profile"]) {
      expect(TARGETS[tipo].action).toBe("hide");
    }
  });
});
