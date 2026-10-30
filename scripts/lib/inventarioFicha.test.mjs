import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FALLOS, ERRORES, DEUDA, inventario, clavesEscritas } from "./inventarioFicha.mjs";
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

  it("un dato activo sin ficha es un error del registro, no deuda", () => {
    expect(ERRORES).toContain("sin_ficha");
    expect(DEUDA).not.toContain("sin_ficha");
  });

  // Una pasada del inventario lee todo src/ y api/: con la máquina cargada tarda; por eso los dos casos malos van en una.
  it("dispara sin_ficha y defecto_distinto con un dato mal declarado (y no con los demás)", async () => {
    const casa = {
      ...DATOS_CASA,
      // Sin ficha y con un defecto que no es el que siembra INITIAL_DATA ("same").
      menuModel: { ...DATOS_CASA.menuModel, ficha: null, defecto: "separate" },
      // Una lista también se compara entera.
      meals: { ...DATOS_CASA.meals, defecto: ["Comida"] },
      // Una copia sin ficha no cuenta: solo los hechos activos.
      menuWeek: { ...DATOS_CASA.menuWeek, ficha: null },
    };
    const r = await inventario(raiz, { registro: { casa, persona: DATOS_PERSONA } });
    expect(r.fallos.sin_ficha).toEqual(["casa.menuModel"]);
    expect(r.fallos.defecto_distinto).toEqual([
      'casa.menuModel: registro "separate" ≠ INITIAL_DATA "same"',
      'casa.meals: registro ["Comida"] ≠ INITIAL_DATA ["Comida","Cena"]',
    ]);
  }, 120_000);

  it("una columna cerrada fuera de su lista no se inventaría en silencio", async () => {
    const casa = { ...DATOS_CASA, kcal: { ...DATOS_CASA.kcal, choque: "el_mas_alto" } };
    await expect(inventario(raiz, { registro: { casa, persona: DATOS_PERSONA } })).rejects.toThrow(/casa\.kcal: choque «el_mas_alto»/);
  }, 120_000);

  it("las filas llevan las columnas del eje", () => {
    for (const col of ["ficha", "defecto", "minimo_para_generar", "escribe", "choque"]) {
      expect(inv.filas.every((f) => col in f), col).toBe(true);
    }
  });

  it("un defecto que no cuadra con la forma de una casa nueva (INITIAL_DATA) es un error", () => {
    expect(ERRORES).toContain("defecto_distinto");
    expect(inv.fallos.defecto_distinto).toEqual([]);
  });

  it("detecta una clave nueva sin registrar", async () => {
    const r = await inventario(raiz, { guardadas: { casa: new Set(["claveInventada"]), persona: new Set() } });
    expect(r.fallos.sin_registro).toEqual(["casa.claveInventada"]);
  });

  it("lee las claves que Lola escribe con un spread de data (#958, diaTanda)", () => {
    const texto = "const d = { ...data, diaTanda: dia, tanda: { ...data.tanda, x: 1 } };\nreturn { ...casa.state.data, otra };";
    expect([...clavesEscritas(texto)].sort()).toEqual(["diaTanda", "otra", "tanda"]);
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
