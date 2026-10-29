/**
 * La foto apartada es de ESTE plato solo si se apartó después del último
 * borrador (#958): sin foto en el mensaje, usarFoto cogía la que se apartó
 * para otra receta, y el resumen decía «Foto: la del mensaje».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let apartados = {};
const insertadas = [];

vi.mock("./db.js", () => ({
  select: vi.fn(async (_t, filtro) => {
    const tipo = /content->>tipo=eq\.([a-z_]+)/.exec(filtro)?.[1];
    return apartados[tipo] ? [apartados[tipo]] : [];
  }),
  insert: vi.fn(async (_t, filas) => { insertadas.push(...filas); return filas; }),
  eq: (v) => `eq.${v}`,
  config: vi.fn(),
}));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn(), olvidarCasa: vi.fn() }));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn(async () => "u1"), rastro: vi.fn(), registrar: vi.fn() }));
vi.mock("./menu.js", () => ({
  motor: vi.fn(async () => ({
    INGREDIENT_UNITS: ["g", "ud"],
    KITCHEN_TOOL_IDS: [],
    FAST_MODEL: "rapido",
    payloadDeBorrador: (e) => e,
    borradorDesdeRespuesta: (_json, p) => ({ id: "user_b", ...p }),
    recetaParaGuardar: (b, o) => ({ ...b, ...o, difficulty: "fácil", steps: [] }),
  })),
  prepararRecetas: vi.fn(),
  normal: (s) => String(s ?? "").toLowerCase().trim(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create: async () => ({ content: [{ type: "text", text: "{}" }] }) }; },
}));
process.env.ANTHROPIC_API_KEY ||= "sin-clave";

const { prepararReceta } = await import("./recetas.js");
const chat = { channel: "telegram", chatId: "1" };
const datos = { nombre: "Pisto de la casa", ingredientes: [{ nombre: "calabacín", cantidad: 2, unidad: "ud" }], usarFoto: true };
const borradorGuardado = () => insertadas.find((f) => f.content?.tipo === "borrador_receta")?.content.receta;

beforeEach(() => { apartados = {}; insertadas.length = 0; });

describe("preparar_receta con usarFoto y sin foto en el mensaje", () => {
  it("una foto apartada ANTES del último borrador era de otro plato: no va, y se dice", async () => {
    apartados = {
      foto_receta: { content: { url: "https://foto/otra.jpg" }, created_at: "2026-10-29T10:00:00Z" },
      borrador_receta: { content: { receta: { name: "Lentejas" } }, created_at: "2026-10-29T11:00:00Z" },
    };
    const texto = await prepararReceta("h", datos, chat);
    expect(borradorGuardado().photo).toBeNull();
    expect(texto).toMatch(/Foto: sin foto \(no hay ninguna de este plato: que la manden\)/);
  });

  it("una foto apartada después del último borrador es la de este plato", async () => {
    apartados = {
      foto_receta: { content: { url: "https://foto/pisto.jpg" }, created_at: "2026-10-29T12:00:00Z" },
      borrador_receta: { content: { receta: { name: "Lentejas" } }, created_at: "2026-10-29T11:00:00Z" },
    };
    const texto = await prepararReceta("h", datos, chat);
    expect(borradorGuardado().photo).toBe("https://foto/pisto.jpg");
    expect(texto).toMatch(/Foto: sí/);
  });
});
