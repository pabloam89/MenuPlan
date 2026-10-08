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

// Fase T2: una sola forma de escribir cada cosa (etapaBebe) y una sola función para la clave.
describe("una sola ortografía y una sola clave", async () => {
  const { SOBRE_A_CAMPO, sobreDeCampo, claveDeTarea, personaDeClave, campoDeClave, caducaDias, KIND_DE_TIPO, TIPO_DE_KIND } = await import("./registroTareas.js");
  const { CAMPOS_PREGUNTABLES } = await import("./registroCampos.js");

  it("anotar_tarea.sobre pasa por SOBRE_A_CAMPO a un campo preguntable, ida y vuelta", () => {
    expect(ENUMS["anotar_tarea.sobre"]).toEqual(Object.keys(SOBRE_A_CAMPO));
    const campos = Object.values(SOBRE_A_CAMPO).filter(Boolean);
    expect([...campos].sort()).toEqual([...CAMPOS_PREGUNTABLES].sort());
    for (const c of campos) expect(SOBRE_A_CAMPO[sobreDeCampo(c)]).toBe(c);
    expect(sobreDeCampo(null)).toBe(null);
  });

  it("la clave de un campo y la de lo libre salen de la misma función, y se deshacen igual", () => {
    expect(claveDeTarea({ tipo: "falta_saber", campo: "alergias", personaId: "nat" })).toBe("alergias:nat");
    expect(claveDeTarea({ tipo: "falta_saber", campo: "etapaBebe", personaId: "cova" })).toBe("etapa:cova");
    expect(claveDeTarea({ tipo: "falta_saber", campo: "alergias" })).toBe(null);
    expect(claveDeTarea({ tipo: "seguimiento", personaId: "isa", palabras: ["pan", "sabado"] })).toBe("seguimiento:isa:pan-sabado");
    expect(claveDeTarea({ tipo: "falta_saber", palabras: ["abuela"] })).toBe("pregunta:casa:abuela");
    expect(claveDeTarea({ tipo: "espera", palabras: ["x"] })).toBe(null);
    for (const [clave, campo, persona] of [["alergias:nat", "alergias", "nat"], ["etapa:cova", "etapaBebe", "cova"], ["seguimiento:isa:pan", null, "isa"], ["pregunta:casa:pan", null, null]]) {
      expect(campoDeClave(clave)).toBe(campo);
      expect(personaDeClave(clave)).toBe(persona);
    }
    expect(KIND_DE_TIPO).toEqual({ falta_saber: "pregunta", seguimiento: "seguimiento" });
    for (const [kind, tipo] of Object.entries(TIPO_DE_KIND)) expect(KIND_DE_TIPO[tipo]).toBe(kind);
  });

  it("la caducidad sale del registro de campos, no de una copia", () => {
    expect(caducaDias({ tipo: "falta_saber", campo: "alergias" })).toBe(CAMPOS.alergias.caduca_dias);
    expect(caducaDias({ tipo: "falta_saber", campo: "etapaBebe" })).toBe(CAMPOS.etapaBebe.caduca_dias);
    expect(caducaDias({ tipo: "falta_saber" })).toBe(14);
    expect(caducaDias({ tipo: "seguimiento" })).toBe(10);
  });

  it("cerrar_tarea con v2 solo añade «aplazada», y la base la admite", () => {
    expect(ENUMS["cerrar_tarea.estado_v2"]).toEqual([...ENUMS["cerrar_tarea.estado"], "aplazada"]);
    for (const e of ENUMS["cerrar_tarea.estado_v2"]) expect(ENUMS["bot_tareas.status"]).toContain(e);
  });

  it("el bot no lleva otra tabla de caducidad ni otra ortografía de la etapa", () => {
    for (const f of ["tareas.js", "estadoCasa.js", "ficha.js", "ajustes.js"]) {
      const fuente = readFileSync(new URL(`../../api/_bot/${f}`, import.meta.url), "utf8");
      expect(fuente, f).not.toMatch(/CADUCIDAD_DIAS/);
      expect(fuente, f).not.toMatch(/["'`]etapa_bebe["'`]/);
      // Las claves de estado no se escriben a mano: salen de claveDeTarea.
      expect(fuente, f).not.toMatch(/`(alergias|etapa):\$\{/);
    }
  });
});
