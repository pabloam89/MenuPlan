/**
 * Operaciones con identidad y autor (#958, raíz 4): «deshaz» deshace lo
 * último de QUIEN lo pide, se niega con la verdad cuando eso no es de la casa,
 * deshace también la fila de una receta guardada y desactiva el primer menú.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const llamadas = { select: [], insert: [], update: [], borrar: [], rpc: [] };
let fotos = [];
let casaActiva = null;

vi.mock("./db.js", () => ({
  select: vi.fn(async (tabla, filtro) => {
    llamadas.select.push([tabla, filtro]);
    if (tabla === "bot_deshacer") return fotos.slice(0, 1).map((f) => ({ ...f, created_at: new Date().toISOString() }));
    if (tabla === "household_state") return [{ state: { data: { members: [] } }, bot_rev: 7, updated_at: new Date().toISOString() }];
    if (tabla === "user_menus") return casaActiva ? [{ id: casaActiva, user_id: "u", is_active: true, updated_at: "2026-10-01" }] : [];
    return [];
  }),
  insert: vi.fn(async (tabla, filas) => { llamadas.insert.push([tabla, filas]); return []; }),
  update: vi.fn(async (tabla, filtro, cambios) => { llamadas.update.push([tabla, filtro, cambios]); return [{}]; }),
  borrar: vi.fn(async (tabla, filtro) => { llamadas.borrar.push([tabla, filtro]); return []; }),
  rpc: vi.fn(async (f) => { llamadas.rpc.push(f); return { ok: true, bot_rev: 8 }; }),
  eq: (x) => `eq.${encodeURIComponent(x)}`,
  config: () => ({ url: "https://x.invalid", headers: {} }),
}));

const { deshacer, guardarCasa, filtroDeQuien, apuntarOperacion, SIN_VERSION } = await import("./casa.js");
const { conOperacion, TIPO_OPERACION, TIPO_DE_HERRAMIENTA, QUE_FUE, tipoDeHerramienta, claveDeEscritura, huella } = await import("./operacion.js");
const { FICHAS, SOLO_LECTURA } = await import("./agente.js");

const ANA = { chat: "100", persona: "100" };

beforeEach(() => {
  for (const k of Object.keys(llamadas)) llamadas[k] = [];
  fotos = [];
  casaActiva = null;
});

describe("el vocabulario de las operaciones", () => {
  it("cada herramienta apuntada existe, escribe y tiene un tipo del vocabulario", () => {
    const tipos = new Set(Object.values(TIPO_OPERACION));
    for (const [nombre, tipo] of Object.entries(TIPO_DE_HERRAMIENTA)) {
      expect(FICHAS.has(nombre), nombre).toBe(true);
      expect(SOLO_LECTURA.has(nombre), nombre).toBe(false);
      expect(tipos.has(tipo), nombre).toBe(true);
    }
  });

  it("todo tipo que no es la casa tiene su frase para negarse", () => {
    for (const t of Object.values(TIPO_OPERACION)) if (t !== TIPO_OPERACION.CASA) expect(QUE_FUE[t], t).toBeTruthy();
  });

  it("una herramienta desconocida es «otro», que no se deshace solo", () => {
    expect(tipoDeHerramienta("algo_nuevo")).toBe(TIPO_OPERACION.OTRO);
  });

  it("la clave de una escritura es la de su mensaje, su herramienta y sus argumentos", () => {
    expect(claveDeEscritura("anadir_compra", { productos: ["leche"] })).toBe(null); // fuera de un turno
    conOperacion({ chat: 1, persona: 1, mid: 55 }, () => {
      const a = claveDeEscritura("anadir_compra", { productos: ["leche"], b: 1 });
      expect(a).toMatch(/^escritura:1:55:anadir_compra:/);
      expect(claveDeEscritura("anadir_compra", { b: 1, productos: ["leche"] })).toBe(a);
      expect(claveDeEscritura("anadir_compra", { productos: ["pan"] })).not.toBe(a);
    });
    expect(huella({ a: 1, b: [2] })).toBe(huella({ b: [2], a: 1 }));
  });
});

describe("cada foto lleva su autor", () => {
  it("guardarCasa apunta quién escribe y con qué herramienta", async () => {
    const casa = { householdId: "h", botRev: 7, state: { data: {} }, menu: null, semana: null };
    await conOperacion(ANA, async () => {
      const { operacion } = await import("./operacion.js");
      operacion().herramienta = "ajustar_gustos";
      await guardarCasa(casa, { state: { data: { x: 1 } } });
    });
    const [, [fila]] = llamadas.insert.find(([t]) => t === "bot_deshacer");
    expect(fila.antes.quien).toEqual(ANA);
    expect(fila.antes.herramienta).toBe("ajustar_gustos");
    expect(fila.antes.tipo).toBe(TIPO_OPERACION.CASA);
  });

  it("una operación fuera de la casa se apunta sin versión: un deshacer viejo se niega", async () => {
    await conOperacion(ANA, () => apuntarOperacion("h", TIPO_OPERACION.DESPENSA));
    const [, [fila]] = llamadas.insert.find(([t]) => t === "bot_deshacer");
    expect(fila.bot_rev_despues).toBe(SIN_VERSION);
    expect(fila.antes.tipo).toBe(TIPO_OPERACION.DESPENSA);
    expect(fila.antes.state).toBeUndefined();
  });
});

describe("deshacer es de quien lo pide", () => {
  it("busca solo lo de su chat y su persona", async () => {
    await conOperacion(ANA, () => deshacer("h"));
    const [, filtro] = llamadas.select.find(([t]) => t === "bot_deshacer");
    expect(filtro).toContain("antes->quien->>chat=eq.100");
    expect(filtro).toContain("antes->quien->>persona=eq.100");
    expect(filtroDeQuien({ chat: "-5", persona: null })).toBe("&antes->quien->>chat=eq.-5");
    expect(filtroDeQuien(null)).toBe("");
  });

  it("sin nada suyo, lo dice y no toca la casa", async () => {
    const r = await conOperacion(ANA, () => deshacer("h"));
    expect(r).toMatch(/tuyo/);
    expect(llamadas.rpc).toEqual([]);
  });

  it("si lo último suyo fue la despensa, se niega: no restaura una foto más vieja", async () => {
    fotos = [{ id: 9, bot_rev_despues: SIN_VERSION, antes: { tipo: TIPO_OPERACION.DESPENSA, quien: ANA } }];
    const r = await conOperacion(ANA, () => deshacer("h"));
    expect(r).toMatch(/despensa/);
    expect(r).toMatch(/NO he deshecho/);
    expect(llamadas.rpc).toEqual([]);
  });

  it("una receta guardada sin foto de la casa se deshace borrando su fila, con lápida", async () => {
    fotos = [{ id: 9, bot_rev_despues: SIN_VERSION, antes: { tipo: TIPO_OPERACION.RECETA, quien: ANA, tambien: [{ tipo: TIPO_OPERACION.RECETA, id: "user_abc", dueno: "u1" }] } }];
    const r = await conOperacion(ANA, () => deshacer("h"));
    expect(r).toMatch(/^Deshecho/);
    expect(llamadas.insert.find(([t]) => t === "user_recipe_deletions")[1]).toEqual([{ owner_id: "u1", recipe_id: "user_abc" }]);
    expect(llamadas.borrar.find(([t]) => t === "user_recipes")[1]).toContain("user_abc");
  });

  it("deshacer el cambio de la casa de guardar_receta quita también la fila de la receta", async () => {
    fotos = [{ id: 9, bot_rev_despues: 7, antes: { tipo: TIPO_OPERACION.CASA, quien: ANA, state: { data: { members: [] } }, menuActivo: null, tambien: [{ tipo: TIPO_OPERACION.RECETA, id: "user_abc", dueno: "u1" }] } }];
    const r = await conOperacion(ANA, () => deshacer("h"));
    expect(r).toMatch(/^Deshecho/);
    expect(llamadas.rpc).toContain("bot_save_casa");
    expect(llamadas.borrar.find(([t]) => t === "user_recipes")).toBeTruthy();
  });

  it("deshacer el primer menú lo desactiva (antes seguía activo)", async () => {
    casaActiva = "menu_nuevo";
    fotos = [{ id: 9, bot_rev_despues: 7, antes: { tipo: TIPO_OPERACION.CASA, quien: ANA, state: { data: { members: [] } }, menuActivo: null, semana: null } }];
    const r = await conOperacion(ANA, () => deshacer("h"));
    expect(r).toMatch(/ya no está activo/);
    const desactivar = llamadas.update.find(([t]) => t === "user_menus");
    expect(desactivar[1]).toContain("menu_nuevo");
    expect(desactivar[2]).toEqual({ is_active: false });
  });
});
