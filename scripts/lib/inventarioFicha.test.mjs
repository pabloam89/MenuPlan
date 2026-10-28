import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FALLOS, ERRORES, DEUDA, inventario } from "./inventarioFicha.mjs";
import { ENTIDADES, TEMAS, ESTADOS, TIPOS, MODULOS, MODULO_DEL_TEMA, moduloDe, DATOS_CASA, DATOS_PERSONA } from "../../src/lib/registroFicha.js";
import { REGISTRO_CAMPOS } from "../../src/lib/registroCampos.js";
import { CAMPOS } from "../../src/lib/notepadFields.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");
// Los campos que pide la forja a una entidad (Fábrica, scripts/lib/entities.mjs).
const CAMPOS_DE_LA_FORJA = ["id", "name", "scope", "term", "source_of_truth", "readers"];

describe("registro de la ficha (#939, fase 4)", () => {
  const todos = [...Object.entries(DATOS_CASA), ...Object.entries(DATOS_PERSONA)];

  it("cada columna cerrada tiene un valor de su lista", () => {
    for (const [k, d] of todos) {
      expect(ENTIDADES[d.entidad], `${k}.entidad`).toBeTruthy();
      expect(TEMAS, `${k}.tema`).toContain(d.tema);
      expect(ESTADOS, `${k}.estado`).toContain(d.estado);
      expect(TIPOS, `${k}.tipo`).toContain(d.tipo);
    }
  });

  it("cada dato es de una parte encendida del producto, y cada tema tiene la suya", () => {
    expect(Object.keys(MODULO_DEL_TEMA).sort()).toEqual([...TEMAS].sort());
    for (const [k, d] of todos) expect(MODULOS, `${k}.modulo`).toContain(moduloDe(d));
  });

  it("copia y legado dicen de dónde vienen o por qué siguen", () => {
    for (const [k, d] of todos) {
      if (d.estado === "copia") expect(d.de, `${k}: una copia dice de qué`).toBeTruthy();
      if (d.estado === "legado") expect(d.de || d.motivo, `${k}: un legado dice qué lo sustituye o por qué sigue`).toBeTruthy();
    }
  });

  it("los campos y la libreta que nombra existen", () => {
    for (const [k, d] of todos) {
      if (d.campo) expect(REGISTRO_CAMPOS[d.campo], `${k}.campo`).toBeTruthy();
      if (d.libreta) expect(CAMPOS.some((c) => c.id === d.libreta), `${k}.libreta`).toBe(true);
    }
  });

  it("las entidades cumplen la forja: sus campos, vertical y rutas que existen", () => {
    for (const [id, e] of Object.entries(ENTIDADES)) {
      for (const c of CAMPOS_DE_LA_FORJA) expect(e[c], `${id}.${c}`).toBeDefined();
      expect(e.scope).toBe("vertical");
      for (const p of [e.source_of_truth, ...e.readers]) expect(existsSync(join(raiz, p)), `${id}: ${p}`).toBe(true);
    }
  });
});

describe("inventario de la ficha", async () => {
  const inv = await inventario(raiz);

  it("vocabulario cerrado de fallos, repartido en errores y deuda", () => {
    expect([...ERRORES, ...DEUDA]).toEqual(FALLOS);
  });

  it("errores del registro a 0", () => {
    // Si falla: npm run ficha:inventario dice cuál.
    for (const f of ERRORES) expect(inv.fallos[f], f).toEqual([]);
  });

  it("detecta una clave nueva sin registrar", async () => {
    const r = await inventario(raiz, { guardadas: { casa: new Set(["claveInventada"]), persona: new Set() } });
    expect(r.fallos.sin_registro).toEqual(["casa.claveInventada"]);
  });

  it("la deuda del modelo solo baja", () => {
    const base = JSON.parse(readFileSync(join(aqui, "inventarioFicha.base.json"), "utf8"));
    for (const f of DEUDA) {
      // Si falla al subir: npm run ficha:inventario dice cuál es nuevo.
      expect(inv.cifras[f], `${f} ha subido`).toBeLessThanOrEqual(base[f]);
      // Si falla al bajar: bien hecho; baja la cifra en inventarioFicha.base.json.
      expect(inv.cifras[f], `${f} ha bajado: actualiza la base`).toBe(base[f]);
    }
  });
});
