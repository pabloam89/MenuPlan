/**
 * Los huecos de la app que Lola ya cierra (trozos 48 a 53 del plan de fichas): lo que la app hacía y Lola no. Primero,
 * de las recetas propias: favoritas y borrar una propia (trozo 48, parte 1) y las carpetas (parte 2).
 */
import { describe, it, expect, vi } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
vi.mock("./ajustes.js", async (original) => ({ ...(await original()), dominiosDeGustos: async () => "DOMINIOS" }));

const { FICHAS } = await import("./agente.js");
const { CAPACIDADES, estadoDe } = await import("../../src/lib/capacidades.js");
const { cambiarRecetaPropia, ACCION_RECETA } = await import("./recetas.js");
const { RIESGO_HERRAMIENTA, DESHACE } = await import("../../src/lib/vocabularios.js");

const CERRADOS = ["favorita", "borrar_receta", "carpetas", "en_carpeta"];
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
    carpetas: async () => CARPETAS,
    crear: async (userId, nombre) => { escrito.push(["crear", userId, nombre]); return "fld_nueva"; },
    borrarLaCarpeta: async (userId, id) => { escrito.push(["borrar_carpeta", userId, id]); },
    meter: async (userId, recetaId, carpetaId, meter) => { escrito.push(["carpeta", userId, recetaId, carpetaId, meter]); },
  };
  return { escrito, deps };
}

const CARPETAS = [
  { id: "dia_a_dia", nombre: "Día a día", fija: true },
  { id: "fld_navidad", nombre: "Navidad", fija: false },
  { id: "fld_tuppers", nombre: "Tuppers del lunes", fija: false },
];

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

  it("borrar con la base caída: dice que no pudo comprobarlo y no borra, en vez de «no es de esta casa»", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const caida of ["dueno", "borrarDeCasa"]) {
        const { escrito, deps } = conDeps(PROPIA);
        deps[caida] = async () => { throw new Error("base caída"); };
        const r = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.BORRAR, receta: "Lentejas de la abuela", confirmado: true }, {}, deps);
        expect(escrito, caida).toEqual([]);
        expect(r.sinHacer[0].motivo, caida).toMatch(/no he podido comprobar/);
      }
      expect(err).toHaveBeenCalledTimes(2);
    } finally {
      err.mockRestore();
    }
  });

  it("una del catálogo no se borra, aunque digan que sí", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    const r = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.BORRAR, receta: "Lentejas estofadas", confirmado: true }, {}, deps);
    expect(escrito).toEqual([]);
    expect(r.sinHacer[0].motivo).toMatch(/catálogo/);
  });
});

describe("receta_propia: carpetas", () => {
  const quien = { userId: "u-ana" };
  const llamar = (args, deps) => cambiarRecetaPropia("casa", args, quien, deps);

  it("crear una carpeta, para la cuenta de quien escribe; con el nombre de una que ya hay, no la repite", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    const r = await llamar({ accion: ACCION_RECETA.NUEVA_CARPETA, carpeta: " Cumpleaños " }, deps);
    expect(escrito).toEqual([["crear", "u-ana", "Cumpleaños"]]);
    expect(r.hecho).toEqual(["carpeta «Cumpleaños» creada"]);
    const otra = await llamar({ accion: ACCION_RECETA.NUEVA_CARPETA, carpeta: "navidad" }, deps);
    expect(otra.sinHacer[0].motivo).toMatch(/ya tienes una carpeta «Navidad»/);
    expect(escrito).toHaveLength(1);
  });

  it("meter y sacar una receta de una carpeta, por su nombre como lo dicen", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    await llamar({ accion: ACCION_RECETA.A_CARPETA, receta: "lentejas", carpeta: "los tuppers" }, deps);
    await llamar({ accion: ACCION_RECETA.SACAR_DE_CARPETA, receta: "lentejas", carpeta: "día a día" }, deps);
    expect(escrito).toEqual([
      ["carpeta", "u-ana", DEL_CATALOGO.id, "fld_tuppers", true],
      ["carpeta", "u-ana", DEL_CATALOGO.id, "dia_a_dia", false],
    ]);
  });

  it("una carpeta que no hay no se inventa: dice cuáles hay y no escribe", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    const r = await llamar({ accion: ACCION_RECETA.A_CARPETA, receta: "lentejas", carpeta: "verano" }, deps);
    expect(escrito).toEqual([]);
    expect(r.sinHacer[0].motivo).toMatch(/«Navidad»/);
  });

  it("borrar una carpeta: pide su «sí» con el nombre; las fijas no se borran", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    expect(await llamar({ accion: ACCION_RECETA.BORRAR_CARPETA, carpeta: "navidad" }, deps)).toMatch(/«Navidad»/);
    expect(escrito).toEqual([]);
    const fija = await llamar({ accion: ACCION_RECETA.BORRAR_CARPETA, carpeta: "día a día", confirmado: true }, deps);
    expect(fija.sinHacer[0].motivo).toMatch(/fijas/);
    const r = await llamar({ accion: ACCION_RECETA.BORRAR_CARPETA, carpeta: "Navidad", confirmado: true }, deps);
    expect(escrito).toEqual([["borrar_carpeta", "u-ana", "fld_navidad"]]);
    expect(r.hecho).toEqual(["carpeta «Navidad» borrada"]);
  });

  it("sin saber la cuenta, ni crea ni mete en carpetas", async () => {
    const { escrito, deps } = conDeps(DEL_CATALOGO);
    const a = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.NUEVA_CARPETA, carpeta: "Cumpleaños" }, {}, deps);
    const b = await cambiarRecetaPropia("casa", { accion: ACCION_RECETA.A_CARPETA, receta: "lentejas", carpeta: "Navidad" }, {}, deps);
    expect(escrito).toEqual([]);
    for (const r of [a, b]) expect(r.sinHacer[0].motivo).toMatch(/no sé cuál es la tuya/);
  });

  it("si no puede leer las carpetas, lo dice y no escribe", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { escrito, deps } = conDeps(DEL_CATALOGO);
      deps.carpetas = async () => { throw new Error("base caída"); };
      const r = await llamar({ accion: ACCION_RECETA.A_CARPETA, receta: "lentejas", carpeta: "Navidad" }, deps);
      expect(escrito).toEqual([]);
      expect(r.sinHacer[0].motivo).toMatch(/no he podido leer tus carpetas/);
    } finally {
      err.mockRestore();
    }
  });
});
