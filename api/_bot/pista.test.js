/**
 * La pista del enrutador (pista.js, BOT_PISTA): qué se adelanta, cómo se le
 * dice a Lola y cuándo se corta su primera llamada para dársela.
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { planDeAdelanto, textoPista, conPista } = await import("./pista.js");
const { ejecutar, SOLO_LECTURA } = await import("./agente.js");
const { MODOS } = await import("./router.js");

const dec = (modo, datos = {}, confianza = 0.75) => ({ modo, confianza, datos: { varias: false, ...datos }, ms: 900 });

describe("planDeAdelanto: qué se puede leer antes", () => {
  it("ideas para un hueco → proponer_platos, con «para» o «grupo» según sea", () => {
    expect(planDeAdelanto(dec("recomendar", { dia: "hoy", comida: "Cena", estilo: "rapido" }))).toEqual({
      herramienta: "proponer_platos", args: { dia: "hoy", comida: "Cena", estilo: "rapido", n: 3 },
    });
    expect(planDeAdelanto(dec("recomendar", { para: "ninos" })).args.para).toBe("ninos");
    expect(planDeAdelanto(dec("recomendar", { para: "Leo" })).args).toEqual({ grupo: "Leo", n: 3 });
  });

  it("consulta del finde → ver_menu; hoy y mañana no (ya están en la ficha)", () => {
    expect(planDeAdelanto(dec("consulta", { que: "menu", cuando: "finde", comidas: ["Cena"] }))).toEqual({
      herramienta: "ver_menu", args: { cuando: "finde", comidas: ["Cena"] },
    });
    expect(planDeAdelanto(dec("consulta", { que: "menu", cuando: "hoy" }))).toBeNull();
    expect(planDeAdelanto(dec("consulta", { que: "menu", cuando: "dia", dia: "mañana" }))).toBeNull();
    expect(planDeAdelanto(dec("consulta", { que: "menu", cuando: "dia" }))).toBeNull();
    expect(planDeAdelanto(dec("consulta", { que: "compra" })).herramienta).toBe("ver_compra");
  });

  it("varias cosas: solo si la lectura sirve para lo demás («qué me falta… y apúntalo»)", () => {
    expect(planDeAdelanto(dec("falta", { plato: "cocido", varias: true }))).toEqual({ plantilla: "falta", datos: { plato: "cocido", varias: true } });
    expect(planDeAdelanto(dec("consulta", { que: "menu", cuando: "finde", varias: true }))).toBeNull();
  });

  it("receta por nombre → ver_receta; por su hueco → la plantilla", () => {
    expect(planDeAdelanto(dec("receta", { plato: "tortilla" }))).toEqual({ herramienta: "ver_receta", args: { nombre: "tortilla" } });
    expect(planDeAdelanto(dec("receta", { dia: "viernes" })).plantilla).toBe("receta");
    expect(planDeAdelanto(dec("receta", {}))).toBeNull();
  });

  it("dudosa, con error del enrutador o «lola»: nada", () => {
    expect(planDeAdelanto(dec("recomendar", {}, 0.5))).toBeNull();
    expect(planDeAdelanto({ ...dec("recomendar"), error: "Request timed out." })).toBeNull();
    expect(planDeAdelanto(dec("lola"))).toBeNull();
    expect(planDeAdelanto(null)).toBeNull();
  });

  it("nunca una escritura: todo lo que adelanta es de solo lectura", () => {
    const datos = { que: "menu", cuando: "finde", dia: "viernes", comida: "Cena", plato: "x", productos: ["leche"], semana: "esta", receta: "y" };
    for (const modo of MODOS) {
      const p = planDeAdelanto(dec(modo, datos, 0.99));
      if (p?.herramienta) expect(SOLO_LECTURA.has(p.herramienta), modo).toBe(true);
      if (["cambiar", "generar", "compra_anadir", "compra_marcar", "deshacer", "ausencia"].includes(modo)) expect(p, modo).toBeNull();
    }
  });
});

describe("textoPista: dicha como lo que es", () => {
  it("deducida, que puede fallar, que manda lo escrito, y con lo leído", () => {
    const t = textoPista(dec("falta", { plato: "cocido" }), { fuente: "lo que falta del plato según la despensa", texto: "Te falta: garbanzos, chorizo." });
    expect(t).toMatch(/NO lo ha escrito la persona/);
    expect(t).toMatch(/puede equivocarse/);
    expect(t).toMatch(/manda lo que ha escrito/);
    expect(t).toMatch(/plato: cocido/);
    expect(t).toMatch(/Te falta: garbanzos, chorizo\./);
  });
});

/** Un turno de Lola de mentira: tarda `ms` y se corta si se aborta. */
function lanzadorDe(ms = 60) {
  const llamadas = [];
  const lanzar = (decision, signal, o) => {
    llamadas.push({ decision, reinicio: o.reinicio });
    return new Promise((ok, mal) => {
      const t = setTimeout(() => ok({ dicho: `hecho ${llamadas.length}` }), ms);
      signal?.addEventListener("abort", () => { clearTimeout(t); mal(new Error("cortada")); });
    });
  };
  return { lanzar, llamadas };
}
const tras = (ms, valor) => new Promise((r) => setTimeout(() => r(valor), ms));
const quieta = () => ({ vueltas: 0, herramientas: 0, texto: false });

describe("conPista: Lola no espera al enrutador", () => {
  it("sin pista, una sola vez y sin decisión", async () => {
    const { lanzar, llamadas } = lanzadorDe(5);
    expect(await conPista({ pista: null, lanzar, progreso: quieta() })).toEqual({ dicho: "hecho 1" });
    expect(llamadas).toEqual([{ decision: null, reinicio: false }]);
  });

  it("si llega una lectura y aún no ha hecho nada, se corta y vuelve a salir con ella", async () => {
    const { lanzar, llamadas } = lanzadorDe(60);
    const d = dec("recomendar", { dia: "hoy" });
    const r = await conPista({ pista: tras(10, d), lanzar, progreso: quieta() });
    expect(llamadas).toEqual([{ decision: null, reinicio: false }, { decision: d, reinicio: true }]);
    expect(r).toEqual({ dicho: "hecho 2" });
  });

  it("si ya ha avanzado (una vuelta, una herramienta o texto), sigue sin cortar", async () => {
    for (const avance of [{ vueltas: 1 }, { herramientas: 1 }, { texto: true }]) {
      const { lanzar, llamadas } = lanzadorDe(40);
      await conPista({ pista: tras(10, dec("recomendar")), lanzar, progreso: { ...quieta(), ...avance } });
      expect(llamadas, JSON.stringify(avance)).toHaveLength(1);
    }
  });

  it("si la decisión no trae nada que adelantar, no se corta", async () => {
    const { lanzar, llamadas } = lanzadorDe(40);
    await conPista({ pista: tras(10, dec("lola")), lanzar, progreso: quieta() });
    expect(llamadas).toHaveLength(1);
  });

  it("si ya había llegado, sale con ella desde la primera llamada", async () => {
    const { lanzar, llamadas } = lanzadorDe(5);
    const d = dec("recomendar");
    await conPista({ pista: Promise.resolve(d), lanzar, progreso: quieta() });
    expect(llamadas).toEqual([{ decision: d, reinicio: false }]);
  });

  it("cancelada desde fuera (era de la vía rápida): no se relanza", async () => {
    const { lanzar, llamadas } = lanzadorDe(60);
    const fuera = new AbortController();
    setTimeout(() => fuera.abort(), 5);
    await expect(conPista({ pista: tras(30, dec("recomendar")), lanzar, progreso: quieta(), signal: fuera.signal })).rejects.toThrow("cortada");
    expect(llamadas).toHaveLength(1);
  });

  it("cancelada desde fuera justo cuando llega la pista: tampoco", async () => {
    const { lanzar, llamadas } = lanzadorDe(60);
    const fuera = new AbortController();
    const pista = tras(10, dec("recomendar"));
    const turno = conPista({ pista, lanzar, progreso: quieta(), signal: fuera.signal });
    // Justo detrás de la pista (mismo instante): el turno era de la vía rápida.
    pista.then(() => fuera.abort());
    await expect(turno).rejects.toThrow("cortada");
    expect(llamadas).toHaveLength(1);
  });
});

describe("ejecutar: la pista y el progreso", () => {
  it("la pista va a la primera vuelta, no a la de corrección; y se cuentan herramientas", async () => {
    const vistas = [];
    const verMenu = { name: "ver_menu", run: async () => "Lunes: lentejas." };
    const vuelta = async (x) => {
      vistas.push(x);
      if (vistas.length === 1) await x.tools[0].run({});
      return { dicho: vistas.length === 1 ? "✅ Apuntado." : "Vale.", uso: { input_tokens: 1 } };
    };
    const progreso = quieta();
    await ejecutar({ entrada: "hola", tools: [verMenu], modelos: ["m"], vuelta, pista: "[Pista] x", progreso });
    expect(vistas[0].pista).toBe("[Pista] x");
    expect(vistas[1].pista).toBeUndefined();
    expect(progreso.herramientas).toBe(1);
  });
});
