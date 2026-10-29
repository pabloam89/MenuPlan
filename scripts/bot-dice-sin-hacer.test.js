import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { contar, leerDias, MODOS_QUE_ESCRIBEN, DIAS_GUARDADOS, VENTANA } from "./bot-dice-sin-hacer.mjs";

// Los días que de verdad borra el cron de retención: la última migración que
// programa «bot-retencion» (0065_bot_retencion, de momento). El SQL no puede
// importar el JS, así que este test los compara (#958).
const MIGRACIONES = new URL("../supabase/migrations/", import.meta.url);
const diasDelCron = () => {
  const vistos = readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort()
    .flatMap((f) => [...readFileSync(new URL(f, MIGRACIONES), "utf8").matchAll(/cron\.schedule\('bot-retencion',[^)]*bot_purgar\((\d+)\)/g)].map((m) => Number(m[1])));
  return vistos.at(-1);
};

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";
const { diceQueGuardo } = await import("../api/_bot/agente.js");

const SOLO = { soloLectura: new Set(["ver_menu", "ver_compra"]), dice: diceQueGuardo };
const m = (chat, en, texto) => ({ chat, en, texto });
const r = (chat, en, o = {}) => ({ chat, en, rapida: false, modo: "lola", herramientas: [], guardados: null, recibo: null, ...o });

describe("bot-dice-sin-hacer: lo dicho contra lo hecho en el turno (#958)", () => {
  it("cuenta lo que dice que hizo sin haber guardado nada", () => {
    const c = contar(
      [m("1", 0, "✅ Apuntado: leche."), m("2", 0, "✅ Cambiada la cena."), m("3", 0, "Esta noche, tortilla."), m("4", 0, "✅ Hecho.")],
      [r("1", 500, { herramientas: [["ver_menu", 10]] }), r("2", 500, { guardados: 1 }), r("3", 500), r("4", 500, { rapida: true, modo: "compra_anadir" })],
      SOLO,
    );
    expect(c).toEqual({ respuestas: 4, conTurno: 4, dicen: 3, diceSinHecho: 1, diceConAlgoSinHacer: 0, sinTurno: 0 });
  });

  it("lola.guardados manda sobre las herramientas: una que escribe pero no guardó nada cuenta como sin hecho", () => {
    const c = contar([m("1", 0, "✅ Apuntado.")], [r("1", 100, { herramientas: [["anadir_despensa", 10]], guardados: 0 })], SOLO);
    expect(c).toMatchObject({ dicen: 1, diceSinHecho: 1 });
  });

  it("con recibo, lo que lo dice y dejó algo sin hacer se cuenta aparte", () => {
    const c = contar([m("1", 0, "✅ Todo apuntado.")], [r("1", 100, { guardados: 1, recibo: [["despensa", 38, 28]] })], SOLO);
    expect(c).toMatchObject({ dicen: 1, diceSinHecho: 0, diceConAlgoSinHacer: 1 });
  });

  it("cruza con el turno dentro de la ventana, y el más cercano", () => {
    const dentro = contar([m("1", 0, "✅ Apuntado.")], [r("1", -VENTANA.antesMs, { guardados: 0 }), r("1", VENTANA.despuesMs + 1, { guardados: 1 })], SOLO);
    expect(dentro).toMatchObject({ conTurno: 1, diceSinHecho: 1 });
    expect(contar([m("1", 0, "✅ Apuntado.")], [r("1", VENTANA.despuesMs + 1)], SOLO)).toMatchObject({ sinTurno: 1, diceSinHecho: 0 });
    expect(contar([m("1", 0, "✅ Apuntado.")], [r("2", 100)], SOLO)).toMatchObject({ sinTurno: 1 });
  });

  it("los modos que escriben salen de la tabla del enrutador", () => {
    expect(MODOS_QUE_ESCRIBEN).toEqual(expect.arrayContaining(["compra_anadir", "compra_marcar", "cambiar", "generar", "deshacer"]));
    expect(MODOS_QUE_ESCRIBEN).not.toContain("consulta");
  });
});

describe("--dias", () => {
  it("DIAS_GUARDADOS es lo que borra el cron de retención de bot_messages", () => {
    expect(diasDelCron()).toBeGreaterThan(0);
    expect(DIAS_GUARDADOS).toBe(diasDelCron());
  });

  it("sin --dias, lo que guarda bot_messages", () => {
    expect(leerDias(["node", "x"])).toBe(DIAS_GUARDADOS);
    expect(leerDias(["node", "x", "--dias", "7"])).toBe(7);
  });

  it.each(["abc", "0", "-3", "2.5", String(DIAS_GUARDADOS + 1)])("«--dias %s» es un error, no el valor por defecto en silencio", (v) => {
    expect(() => leerDias(["node", "x", "--dias", v])).toThrow(new RegExp(`entero de 1 a ${DIAS_GUARDADOS}`));
  });

  it("«--dias» sin número es un error", () => {
    expect(() => leerDias(["node", "x", "--dias"])).toThrow(/llegó «»/);
  });
});
