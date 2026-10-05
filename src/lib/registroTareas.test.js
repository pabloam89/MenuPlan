/**
 * Sin deriva: el registro de tareas manda, y las migraciones y las herramientas
 * de Lola tienen que decir lo mismo. En CI no hay Postgres: los CHECK se leen
 * del texto SQL, y vale el último que redefine cada columna.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ENUMS, CAMPOS, CLAVE_A_CAMPO, esDeSeguridad, noEsComida, preguntaProhibida } from "./registroTareas.js";

const DIR = new URL("../../supabase/migrations/", import.meta.url);
const migraciones = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

/** Los valores del último `check (columna in (...))` de bot_tareas en las migraciones. */
function checkDe(columna) {
  let ultimo = null;
  for (const f of migraciones) {
    const sql = readFileSync(new URL(f, DIR), "utf8");
    if (!/bot_tareas/.test(sql)) continue;
    for (const m of sql.matchAll(new RegExp(`check\\s*\\(\\s*${columna}\\s+in\\s*\\(([^)]*)\\)\\s*\\)`, "gi"))) {
      ultimo = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
  }
  return ultimo;
}

describe("registroTareas = migraciones", () => {
  for (const col of ["kind", "scope", "status"]) {
    it(`bot_tareas.${col}`, () => {
      const enBase = checkDe(col);
      expect(enBase, `no encuentro el CHECK de ${col}`).toBeTruthy();
      expect([...enBase].sort()).toEqual([...ENUMS[`bot_tareas.${col}`]].sort());
    });
  }
  it("cerrar_tarea solo cierra a estados que admite la base", () => {
    for (const e of ENUMS["cerrar_tarea.estado"]) expect(ENUMS["bot_tareas.status"]).toContain(e);
  });
});

describe("registroTareas = herramientas de Lola", () => {
  const fuente = readFileSync(new URL("../../api/_bot/agente.js", import.meta.url), "utf8");
  it("las herramientas de tareas no escriben sus enums a mano", () => {
    const bloque = fuente.slice(fuente.indexOf('name: "anotar_tarea"'), fuente.indexOf('name: "editar_tarea"'));
    expect(bloque).not.toMatch(/enum:\s*\[/);
    for (const k of ["bot_tareas.kind", "anotar_tarea.sobre", "bot_tareas.scope", "cerrar_tarea.estado"]) expect(bloque).toContain(`ENUMS_TAREAS["${k}"]`);
  });
});

describe("reglas", () => {
  it("las claves de estado de hoy apuntan a campos del registro", () => {
    for (const campo of Object.values(CLAVE_A_CAMPO)) expect(CAMPOS[campo]).toBeTruthy();
  });
  it("seguridad: alergias y etapa del bebé, sí; lo libre, no", () => {
    expect(esDeSeguridad("alergias:nat")).toBe(true);
    expect(esDeSeguridad("etapa:cova")).toBe(true);
    expect(esDeSeguridad("seguimiento:casa:pan")).toBe(false);
    expect(esDeSeguridad(null)).toBe(false);
  });
  it("solo comida, con frontera de palabra", () => {
    expect(noEsComida("comprar velas para la tarta")).toBe("velas");
    expect(noEsComida("pilas del mando")).toBe("pilas");
    expect(noEsComida("cita con la pediatra")).toBeTruthy();
    expect(noEsComida("leche")).toBe(null);
    expect(noEsComida("pan sin gluten")).toBe(null);
    expect(noEsComida("ir a pilates")).toBe(null);
  });
  it("lo de política «nunca» no se pregunta", () => {
    expect(preguntaProhibida("¿Cuántos años tiene Cova?")).toBe("edad");
    expect(preguntaProhibida("¿A qué colegio va Leo?")).toBe("colegio");
    expect(preguntaProhibida("¿Es chico o chica?")).toBe("sexo");
    expect(preguntaProhibida("¿Tenéis custodia compartida?")).toBe("patronSemanas");
    expect(preguntaProhibida("¿Me pasas el menú del cole?")).toBe(null);
    expect(preguntaProhibida("¿Cova come purés o trozos?")).toBe(null);
    for (const campo of ["edad", "nacimiento", "sexo", "colegio", "patronSemanas"]) expect(CAMPOS[campo].politica).toBe("nunca");
  });
});
