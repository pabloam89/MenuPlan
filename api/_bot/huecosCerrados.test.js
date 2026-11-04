/**
 * Los huecos de la app que Lola ya cierra (trozos 48 a 53 del plan de fichas): lo que la app hacía y Lola no. Primero,
 * de las recetas propias, marcar favoritas y borrar una propia (trozo 48, parte 1).
 */
import { describe, it, expect, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { FICHAS } = await import("./agente.js");
const { CAPACIDADES, estadoDe } = await import("../../src/lib/capacidades.js");
const { cambiarRecetaPropia, ACCION_RECETA } = await import("./recetas.js");
const { RIESGO_HERRAMIENTA, DESHACE } = await import("../../src/lib/vocabularios.js");

const CERRADOS = ["favorita", "borrar_receta"];
const PROPIA = { id: "user_abc", name: "Lentejas de la abuela", source: "user" };
const DEL_CATALOGO = { id: "lentejas-estofadas", name: "Lentejas estofadas" };

/** cambiarRecetaPropia con la base de mentira: qué escribiría, sin escribir. */
function conDeps(receta) {
  const escrito = [];
  const deps = {
    buscar: async () => receta,
    favorita: async (userId, id, marcar) => { escrito.push(["favorita", userId, id, marcar]); },
    borrarDeCasa: async (casa, dueno, id) => { escrito.push(["borrar", casa, dueno, id]); return true; },
    dueno: async () => "u-dueno",
  };
  return { escrito, deps };
}

describe("los huecos de recetas propias que ya hace Lola", () => {
  it("favorita y borrar_receta están en los dos lados, con una herramienta de Lola", () => {
    for (const id of CERRADOS) {
      const cap = CAPACIDADES.find((c) => c.id === id);
      expect(estadoDe(cap), id).toBe("los_dos");
      expect(cap.lola, id).toContain("receta_propia");
    }
  });

  it("receta_propia no se deshace, y su riesgo lo dice (trozo 42)", () => {
    const f = FICHAS.get("receta_propia");
    expect(f.riesgo).toBe(RIESGO_HERRAMIENTA.ESCRIBE_IRREVERSIBLE);
    expect(f.deshace).toBe(DESHACE.NO);
    expect(f.lector).toBe(false);
  });
});

describe("receta_propia", () => {
  it("favorita y no_favorita, para la cuenta de quien escribe", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.FAVORITA, receta: "lentejas" }, { userId: "u-ana" }, deps);
    await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.NO_FAVORITA, receta: "lentejas" }, { userId: "u-ana" }, deps);
    expect(escrito).toEqual([["favorita", "u-ana", DEL_CATALOGO.id, true], ["favorita", "u-ana", DEL_CATALOGO.id, false]]);
  });

  it("sin saber la cuenta, no marca ninguna favorita y lo dice", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    const r = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.FAVORITA, receta: "lentejas" }, {}, deps);
    expect(escrito).toEqual([]);
    expect(r.sinHacer[0].motivo).toMatch(/no sé cuál es la tuya/);
  });

  it("borrar: sin su «sí» pregunta con el nombre encontrado y no borra; con él, borra la de la casa", async () => {
    const { escrito, deps } = conDeps(PROPIA);
    const pregunta = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.BORRAR, receta: "lentejas" }, {}, deps);
    expect(pregunta).toMatch(/«Lentejas de la abuela»/);
    expect(escrito).toEqual([]);
    const r = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.BORRAR, receta: "Lentejas de la abuela", confirmado: true }, {}, deps);
    expect(escrito).toEqual([["borrar", "casa", "u-dueno", PROPIA.id]]);
    expect(r.hecho).toEqual(["«Lentejas de la abuela» borrada"]);
  });

  it("borrar con «sí» pero otro nombre que el encontrado: pregunta otra vez, no borra", async () => {
    const { escrito, deps } = conDeps(PROPIA);
    const r = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.BORRAR, receta: "garbanzos", confirmado: true }, {}, deps);
    expect(typeof r).toBe("string");
    expect(escrito).toEqual([]);
  });

  it("una del catálogo no se borra, aunque digan que sí", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    const r = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.BORRAR, receta: "Lentejas estofadas", confirmado: true }, {}, deps);
    expect(escrito).toEqual([]);
    expect(r.sinHacer[0].motivo).toMatch(/catálogo/);
  });
});
