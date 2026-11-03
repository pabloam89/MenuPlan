/**
 * Los recordatorios son tareas de tipo «recordatorio» (0122, trozo 34 de #1037), pero no son algo que Lola tenga
 * que preguntar: las dos lecturas de tareas (la de la tabla y la de ficha_casa) los dejan fuera.
 */
import { describe, it, expect } from "vitest";
import { filtroDeLectura } from "./tareas.js";
import { tareasDeFicha } from "./fichaRpc.js";
import { TIPO_TAREA } from "../../src/lib/vocabularios.js";

const AHORA = new Date("2026-11-03T10:00:00Z");
const tarea = (id, tipo) => ({ id, tipo, scope: "casa", texto: id, created_at: "2026-11-03T09:00:00Z", caduca_at: "2026-11-10T00:00:00Z" });

describe("las tareas que lee Lola no traen los recordatorios", () => {
  it("tareasDeFicha (ficha_casa) quita los de tipo recordatorio y deja las demás, también las de tipo null", () => {
    const ficha = { tareas: [tarea("t-espera", "espera"), tarea("t-rec", TIPO_TAREA.RECORDATORIO), tarea("t-vieja", null)] };
    expect(tareasDeFicha(ficha, { ahora: AHORA }).map((t) => t.id).sort()).toEqual(["t-espera", "t-vieja"]);
  });

  it("filtroDeLectura (bot_tareas) deja fuera los recordatorios sin perder las de tipo null", () => {
    const filtro = filtroDeLectura({ householdId: "h1", ahora: AHORA });
    // Un neq a secas dejaría fuera también las filas con tipo null (las del bot de antes).
    expect(filtro).toContain(`and=(or(tipo.is.null,tipo.neq.${TIPO_TAREA.RECORDATORIO}))`);
  });
});
