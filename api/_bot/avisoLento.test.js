/**
 * El aviso antes de lo lento (agente.js AVISO_LENTO, BOT_AVISO_LENTO): si
 * Lola llama a generar_menu sin haber escrito nada, la persona ve una frase
 * al momento en vez de «escribiendo…» durante segundos.
 */
import { describe, it, expect, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { ejecutar, AVISO_LENTO } = await import("./agente.js");

const generar = { name: "generar_menu", run: async () => "Menú nuevo generado." };
const verMenu = { name: "ver_menu", run: async () => "Lunes: lentejas." };

/** Una vuelta de mentira: escribe `antes` (si lo hay), llama a la herramienta y contesta. */
const vueltaQue = (nombre, antes = "") => async (x) => {
  if (antes) x.alEscribir?.(antes);
  await x.tools.find((t) => t.name === nombre).run({});
  x.alEscribir?.("¡Menú listo! Del 5 al 11 de octubre.");
  return { dicho: "¡Menú listo! Del 5 al 11 de octubre.", uso: {} };
};

afterEach(() => { delete process.env.BOT_AVISO_LENTO; });

describe("aviso antes de una herramienta lenta", () => {
  it("generar sin nada en pantalla: sale el aviso, marcado como aviso, y luego el texto de Lola", async () => {
    const escrito = [];
    const r = await ejecutar({ entrada: "hazme el menú", tools: [generar], modelos: ["m"], vuelta: vueltaQue("generar_menu"), alEscribir: (t, extra) => escrito.push([t, extra]) });
    expect(escrito[0]).toEqual([AVISO_LENTO.generar_menu, { aviso: true }]);
    expect(escrito.at(-1)[0]).toMatch(/^¡Menú listo!/);
    expect(r.avisos).toEqual(["generar_menu"]);
  });

  it("si Lola ya había escrito una frase, no se pisa", async () => {
    const escrito = [];
    await ejecutar({ entrada: "hazme el menú", tools: [generar], modelos: ["m"], vuelta: vueltaQue("generar_menu", "¡Vamos allá! Te preparo la semana con salmón"), alEscribir: (t) => escrito.push(t) });
    expect(escrito).not.toContain(AVISO_LENTO.generar_menu);
  });

  it("buscar recetas avisa, salvo con fotos (el álbum va antes que el texto)", async () => {
    const buscar = { name: "buscar_recetas", run: async () => "6 recetas." };
    const conArgs = (args) => async (x) => { await x.tools[0].run(args); return { dicho: "Mira estas.", uso: {} }; };
    const escrito = [];
    await ejecutar({ entrada: "recetas de cuchara", tools: [buscar], modelos: ["m"], vuelta: conArgs({ consulta: "cuchara" }), alEscribir: (t) => escrito.push(t) });
    expect(escrito).toEqual([AVISO_LENTO.buscar_recetas({})]);
    escrito.length = 0;
    await ejecutar({ entrada: "recetas de cuchara con fotos", tools: [buscar], modelos: ["m"], vuelta: conArgs({ consulta: "cuchara", conFotos: true }), alEscribir: (t) => escrito.push(t) });
    expect(escrito).toEqual([]);
  });

  it("una herramienta rápida no avisa; y con BOT_AVISO_LENTO=off, ninguna", async () => {
    const escrito = [];
    await ejecutar({ entrada: "¿qué hay el lunes?", tools: [verMenu], modelos: ["m"], vuelta: vueltaQue("ver_menu"), alEscribir: (t) => escrito.push(t) });
    process.env.BOT_AVISO_LENTO = "off";
    await ejecutar({ entrada: "hazme el menú", tools: [generar], modelos: ["m"], vuelta: vueltaQue("generar_menu"), alEscribir: (t) => escrito.push(t) });
    expect(escrito.some((t) => Object.values(AVISO_LENTO).includes(t))).toBe(false);
  });
});
