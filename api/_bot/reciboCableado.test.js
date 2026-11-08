/**
 * El recibo, cableado en las herramientas de verdad (herramientas() de
 * agente.js, #958): cuando una herramienta que escribe devuelve un RESULTADO,
 * el modelo lee el JSON con su orden y el turno se lo queda para pintar el
 * recibo. Se prueba con editar_tarea y tareas.js de mentira.
 */
import { describe, expect, it, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

vi.mock("./db.js", async (original) => ({ ...(await original()), insert: vi.fn(), update: vi.fn(), rpc: vi.fn(), select: vi.fn(async () => []) }));
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));
vi.mock("./tareas.js", async (original) => ({ ...(await original()), editarTarea: vi.fn() }));

const { herramientas } = await import("./agente.js");
const { editarTarea } = await import("./tareas.js");
const { resultado, ESTADO } = await import("./resultado.js");

const editar = async (chat, devuelve) => {
  editarTarea.mockImplementationOnce(async () => devuelve);
  const t = (await herramientas(chat)).find((x) => x.name === "editar_tarea");
  return t.run({ ref: "1", texto: "Llevar el coche" }, { toolUse: { id: `t-${Math.random()}` } });
};
const charla = (mas = {}) => ({ householdId: "casa", chatId: "1", channel: "telegram", fotos: [], papel: "owner", esGrupo: false, texto: "cámbiala", ...mas });

describe("una herramienta que devuelve un RESULTADO", () => {
  it("el modelo lee «RESULTADO {json}» con la orden de su estado, no el objeto", async () => {
    const r = await editar(charla({ resultados: [] }), resultado({ accion: "tarea", hecho: ["Llevar el coche"], sinHacer: [{ que: "para Ana", motivo: "no está en la casa" }] }));
    expect(typeof r).toBe("string");
    expect(r).toMatch(/^RESULTADO \{/);
    expect(JSON.parse(r.split("\n")[0].slice("RESULTADO ".length))).toMatchObject({ accion: "tarea", estado: ESTADO.PARCIAL, hecho: ["Llevar el coche"] });
    expect(r).toMatch(/no digas «todo»/);
  });

  it("el turno se queda el resultado para pintar el recibo", async () => {
    const chat = charla({ resultados: [] });
    const r = resultado({ accion: "tarea", hecho: ["Llevar el coche"] });
    await editar(chat, r);
    expect(chat.resultados).toEqual([r]);
  });

  it("un chat que llega sin lista de resultados no lo pierde: se la crea", async () => {
    const chat = charla();
    await editar(chat, resultado({ accion: "tarea", hecho: ["Llevar el coche"] }));
    expect(chat.resultados).toHaveLength(1);
  });

  it("lo que no es un RESULTADO pasa tal cual y no entra en el recibo", async () => {
    const chat = charla({ resultados: [] });
    expect(await editar(chat, "Tarea cambiada.")).toBe("Tarea cambiada.");
    expect(chat.resultados).toEqual([]);
  });
});
