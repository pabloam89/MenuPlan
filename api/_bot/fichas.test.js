/**
 * Lo que Lola ve de sus herramientas (nombre, descripción, esquema y orden),
 * exactamente como sale hacia la API. Si esta foto cambia, cambia lo que lee
 * el modelo: eso pide pasar bot-evals antes de mergear. Una reorganización
 * del código no puede moverla ni un carácter.
 */
import { describe, it, expect, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
// dominiosGustos.json no está en git (lo genera build-bot-core): sin esto la
// foto dependería de la máquina.
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { herramientas, FICHAS, SOLO_LECTURA, AVISO_LENTO, pantallaDe } = await import("./agente.js");
const charla = { householdId: "x", chatId: "1", channel: "telegram", fotos: [] };

describe("lo que Lola ve de sus herramientas", () => {
  it("no cambia sin querer", async () => {
    const tools = await herramientas(charla);
    expect(JSON.stringify(tools, null, 1)).toMatchSnapshot();
  });

  it("la ficha no viaja a la API", async () => {
    expect(JSON.stringify(await herramientas(charla))).not.toMatch(/"(soloLectura|pantalla|avisoLento)":/);
  });
});

describe("una ficha por herramienta", () => {
  it("todas las que ve Lola tienen la suya, completa", async () => {
    const nombres = (await herramientas(charla)).map((t) => t.name);
    expect(nombres.filter((n) => !FICHAS.has(n))).toEqual([]);
    expect(FICHAS.size).toBe(nombres.length);
    for (const [n, f] of FICHAS) {
      expect(typeof f.soloLectura, n).toBe("boolean");
      expect(Object.hasOwn(f, "pantalla"), n).toBe(true);
    }
  });

  it("las de solo leer son las de antes, una a una (cambiarlo es a propósito: es la puerta de pista.js)", () => {
    expect([...SOLO_LECTURA].sort()).toEqual([
      "buscar_recetas", "compartir", "proponer_platos", "ver_ajustes", "ver_casa", "ver_compra",
      "ver_despensa", "ver_menu", "ver_menu_cole", "ver_receta", "ver_recordatorios",
    ]);
  });

  it("los avisos de lo que tarda, los de antes", () => {
    expect(Object.keys(AVISO_LENTO).sort()).toEqual(["buscar_recetas", "generar_menu", "preparar_receta"]);
    expect(AVISO_LENTO.buscar_recetas({ conFotos: true })).toBeNull();
  });

  it("la pantalla de la app de cada una, como antes", () => {
    expect(pantallaDe("ver_menu", {})).toBe("semana");
    expect(pantallaDe("ver_menu", { cuando: "hoy" })).toBe("hoy");
    expect(pantallaDe("ver_menu", { dia: "hoy" })).toBe("hoy");
    expect(pantallaDe("ver_menu", { dia: "jueves" })).toBe("dia:Jue");
    expect(pantallaDe("ver_menu", { cuando: "manana" })).toMatch(/^dia:/);
    expect(pantallaDe("cambiar_plato", { dia: "lunes" })).toBe("dia:Lun");
    expect(pantallaDe("cambiar_plato", {})).toBeNull();
    expect(pantallaDe("buscar_recetas", { categoria: "legumbres" })).toBe("recetas:legumbres");
    expect(pantallaDe("buscar_recetas", { categoria: "mias" })).toBe("recetas");
    expect(pantallaDe("buscar_recetas")).toBe("recetas");
    expect(pantallaDe("guardar_receta")).toBe("recetas:mias");
    for (const n of ["ver_compra", "marcar_compra", "anadir_compra"]) expect(pantallaDe(n)).toBe("compra");
    for (const n of ["generar_menu", "fuera_de_casa"]) expect(pantallaDe(n)).toBe("semana");
    const conPantalla = new Set(["ver_menu", "cambiar_plato", "buscar_recetas", "guardar_receta", "ver_compra", "marcar_compra", "anadir_compra", "generar_menu", "fuera_de_casa"]);
    for (const n of FICHAS.keys()) if (!conPantalla.has(n)) expect(pantallaDe(n, {}), n).toBeNull();
    expect(pantallaDe("no_existe")).toBeNull();
  });
});
