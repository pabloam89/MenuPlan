import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FALLOS, ERRORES, DEUDA, inventario, clavesEscritas } from "./inventarioFicha.mjs";
import { ENTIDADES, TEMAS, ESTADOS, TIPOS, MODULOS, MODULO_DEL_TEMA, moduloDe, DATOS_CASA, DATOS_PERSONA } from "../../src/lib/registroFicha.js";
import { REGISTRO_CAMPOS } from "../../src/lib/registroCampos.js";
import { CAMPOS } from "../../src/lib/notepadFields.js";
import { CLASES_DATO, CLASE, FICHAS } from "../../src/lib/vocabularios.js";

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

  it("un derivado dice de qué sale y con qué función; un legado, qué lo sustituye o por qué sigue", () => {
    for (const [k, d] of todos) {
      if (d.clase === CLASE.DERIVADO) expect(d.de && d.funcion, `${k}: un derivado dice de qué y con qué función`).toBeTruthy();
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

  it("un dato sin ficha o con la función rota es un error del registro, no deuda", () => {
    for (const f of ["sin_ficha", "funcion_rota"]) {
      expect(ERRORES).toContain(f);
      expect(DEUDA).not.toContain(f);
    }
  });

  it("cuenta los datos por clase y por ficha, y las cuentas suman todos los datos", () => {
    expect(Object.keys(inv.porClase)).toEqual(CLASES_DATO);
    expect(Object.keys(inv.porFicha)).toEqual(FICHAS);
    const suma = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(suma(inv.porClase)).toBe(inv.filas.length);
    expect(suma(inv.porFicha)).toBe(inv.filas.length);
    for (const clase of CLASES_DATO) expect(inv.porClase[clase], `ningún dato es ${clase}`).toBeGreaterThan(0);
  });

  it("lola_no_lo_ve y app_no_lo_ve solo cuentan hechos: una marca o un historial no tienen por qué verse en los dos lados", () => {
    const clase = Object.fromEntries(inv.filas.map((f) => [f.id, f.clase]));
    for (const f of ["lola_no_lo_ve", "app_no_lo_ve"]) {
      expect(inv.fallos[f].length).toBeGreaterThan(0);
      for (const id of inv.fallos[f]) expect(clase[id], `${f}: ${id}`).toBe(CLASE.HECHO);
    }
  });

  // Una pasada del inventario lee todo src/ y api/ (tarda con la máquina cargada): los casos malos van en una.
  it("dispara sin_ficha y defecto_distinto con un dato mal declarado (y no con los demás)", async () => {
    const casa = {
      ...DATOS_CASA,
      menuModel: { ...DATOS_CASA.menuModel, ficha: null, defecto: "separate" }, // INITIAL_DATA siembra "same"
      meals: { ...DATOS_CASA.meals, defecto: ["Comida"] }, // una lista se compara entera
      menuWeek: { ...DATOS_CASA.menuWeek, ficha: null }, // una copia sin ficha también cuenta: todo dato tiene ficha (trozo 6)
    };
    const r = await inventario(raiz, { registro: { casa, persona: DATOS_PERSONA } });
    expect(r.fallos.sin_ficha).toEqual(["casa.menuModel", "casa.menuWeek"]);
    expect(r.fallos.defecto_distinto).toEqual([
      'casa.menuModel: registro "separate" ≠ INITIAL_DATA "same"',
      'casa.meals: registro ["Comida"] ≠ INITIAL_DATA ["Comida","Cena"]',
    ]);
  }, 120_000);

  it("una columna cerrada fuera de su lista no se inventaría en silencio", async () => {
    const casa = { ...DATOS_CASA, kcal: { ...DATOS_CASA.kcal, choque: "el_mas_alto" } };
    await expect(inventario(raiz, { registro: { casa, persona: DATOS_PERSONA } })).rejects.toThrow(/casa\.kcal: choque «el_mas_alto»/);
  }, 120_000);

  it("una clase fuera de su lista tampoco, ni un derivado en data declarado activo (la copia sale de la clase)", async () => {
    const conClase = { ...DATOS_CASA, kcal: { ...DATOS_CASA.kcal, clase: "opinion" } };
    await expect(inventario(raiz, { registro: { casa: conClase, persona: DATOS_PERSONA } })).rejects.toThrow(/casa\.kcal: clase «opinion»/);
    const incoherente = { ...DATOS_CASA, menuWeek: { ...DATOS_CASA.menuWeek, estado: "activo" } };
    await expect(inventario(raiz, { registro: { casa: incoherente, persona: DATOS_PERSONA } })).rejects.toThrow(/casa\.menuWeek: derivado en data con estado «activo»/);
  }, 240_000);

  it("dispara sin_declarar (hecho con defecto sin sembrar, derivado sin función), funcion_rota y en_resto con datos mal declarados", async () => {
    const casa = {
      ...DATOS_CASA,
      tandaMinutos: { ...DATOS_CASA.tandaMinutos, defecto: 20 }, // un hecho con defecto que INITIAL_DATA no trae
      useHomeStock: { ...DATOS_CASA.useHomeStock, funcion: null },
      menuWeek: { ...DATOS_CASA.menuWeek, funcion: "src/lib/semanaDias.js:noExiste" },
      cookedDishes: { ...DATOS_CASA.cookedDishes, funcion: "src/lib/noExiste.js:f" }, // fichero que no está
    };
    const persona = { ...DATOS_PERSONA, apodo: { ...DATOS_PERSONA.name } }; // una clave de la persona sin columna
    const r = await inventario(raiz, { registro: { casa, persona } });
    // etapaBebe, hecho sin defecto fuera de INITIAL_DATA, nace cuando se dice: no cuenta.
    expect(r.fallos.sin_declarar).toEqual(["casa.tandaMinutos: defecto 20 que INITIAL_DATA no siembra", "casa.useHomeStock: derivado sin función"]);
    expect(r.fallos.funcion_rota).toEqual(["casa.menuWeek → src/lib/semanaDias.js:noExiste", "casa.cookedDishes → src/lib/noExiste.js:f"]);
    expect(r.fallos.en_resto).toEqual(["persona.dislikes", "persona.apodo"]);
  }, 120_000);

  it("las filas llevan las columnas del eje", () => {
    for (const col of ["clase", "funcion", "ficha", "defecto", "suposicion", "minimo_para_generar", "caduca_dias", "peso_menu", "escribe", "choque"]) {
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
