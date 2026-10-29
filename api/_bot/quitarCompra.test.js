/**
 * Quitar de la lista de la compra (#958). No había herramienta: «quita el pan
 * de la lista» acababa marcado como comprado, o Lola decía que lo había
 * quitado sin quitarlo. Se prueba por la herramienta de verdad
 * (herramientas() de agente.js), con la casa en memoria.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({ ...(await original()), select: vi.fn(async () => []), insert: vi.fn(), update: vi.fn(), rpc: vi.fn() }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
let items = [];
let escrito = null;
vi.mock("./casa.js", async (original) => ({
  ...(await original()),
  conCasa: vi.fn(async (_h, cambiar) => {
    const casa = { householdId: "h1", botRev: 1, semana: null, state: { shopping: { items: structuredClone(items) } } };
    escrito = await cambiar(casa);
    return { ok: true, casa };
  }),
}));

const { herramientas } = await import("./agente.js");
const quitar = async (args) => {
  const t = (await herramientas({ householdId: "h1", chatId: "1", channel: "telegram", fotos: [], papel: "owner", resultados: [] })).find((x) => x.name === "quitar_compra");
  return t.run(args, { toolUse: { id: `t-${Math.random()}` } });
};
const datos = (r) => JSON.parse(r.split("\n")[0].slice("RESULTADO ".length));
const quedan = () => escrito?.state?.shopping?.items?.map((i) => i.name) ?? null;

beforeEach(() => { escrito = null; });

describe("quitar_compra", () => {
  it("«quita el pan»: lo quita de la lista, no lo marca como comprado", async () => {
    items = [{ id: "a", name: "Pan", have: false }, { id: "b", name: "Leche", have: false }];
    const r = await quitar({ productos: ["pan"] });
    expect(quedan()).toEqual(["Leche"]);
    expect(datos(r)).toMatchObject({ accion: "compra_quitar", estado: "hecho", hecho: ["Pan"] });
  });

  it("lo que no está en la lista no se quita y se dice", async () => {
    items = [{ id: "a", name: "Pan" }];
    const r = await quitar({ productos: ["yogures"] });
    expect(escrito).toBeNull();
    expect(datos(r)).toMatchObject({ estado: "nada", sin_hacer: [{ que: "yogures", motivo: "no está en la lista" }] });
  });

  it("dos parecidos distintos no se quitan: se pregunta cuál", async () => {
    items = [{ id: "a", name: "Leche entera" }, { id: "b", name: "Leche semidesnatada" }];
    const r = await quitar({ productos: ["leche"] });
    expect(escrito).toBeNull();
    expect(datos(r).sin_hacer[0].motivo).toMatch(/varios parecidos/);
  });

  it("«borra lo que añadí»: quita solo lo añadido a mano", async () => {
    items = [{ id: "a", name: "Pan", manual: true }, { id: "b", name: "Lentejas" }, { id: "c", name: "Velas", manual: true }];
    const r = await quitar({ manuales: true });
    expect(quedan()).toEqual(["Lentejas"]);
    expect(datos(r).hecho).toEqual(["Pan", "Velas"]);
  });
});
