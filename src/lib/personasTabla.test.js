import { describe, it, expect } from "vitest";
import { filasDeCasa } from "./personasTabla.js";

const CASA = "11111111-1111-4111-8111-111111111111";

describe("filasDeCasa", () => {
  it("convierte un comensal con alergias, intolerancias y estado con fecha", () => {
    const state = {
      data: {
        members: [
          {
            id: "m1", name: "Nat", age: 34, homeRole: "Mamá", alergiasRevisadas: true,
            pesoKg: 62, alturaCm: 168,
            allergies: ["gluten", "gluten", "leche"],
            intolerances: ["lactosa_fina"],
            dietaryStates: ["lactancia"],
            dietaryStatesMeta: { lactancia: { hasta: "2026-12-01" } },
            dislikes: ["cilantro"],
          },
        ],
      },
    };
    const f = filasDeCasa(CASA, state);
    expect(f.personas).toEqual([
      expect.objectContaining({
        household_id: CASA, id: "m1", nombre: "Nat", edad: 34, rol_hogar: "Mamá",
        alergias_revisadas: true, peso_kg: 62, altura_cm: 168,
      }),
    ]);
    // Las alergias repetidas se guardan una vez (la PK lo exige).
    expect(f.alergias.map((a) => a.alergeno)).toEqual(["gluten", "leche"]);
    expect(f.intolerancias.map((i) => i.valor)).toEqual(["lactosa_fina"]);
    expect(f.estados).toEqual([{ household_id: CASA, persona_id: "m1", estado: "lactancia", hasta: "2026-12-01" }]);
    expect(f.avisos).toEqual([]);
  });

  it("lo que no tiene columna ni tabla propia va a resto, sin perder nada", () => {
    const f = filasDeCasa(CASA, {
      data: { members: [{ id: "m2", name: "Leo", age: 6, dislikes: ["pepino"], campoNuevo: 1 }] },
    });
    expect(f.personas[0].resto).toEqual({ dislikes: ["pepino"], campoNuevo: 1 });
    expect(f.personas[0].resto).not.toHaveProperty("name");
    expect(f.personas[0].resto).not.toHaveProperty("allergies");
  });

  it("presentación y etapa salen a columnas; el perfil antiguo se une a la lista nueva", () => {
    const f = filasDeCasa(CASA, {
      data: { members: [{
        id: "m4", name: "Ana", age: 40, useBirthDate: true, birthDate: "1986-03-02",
        stageDetail: "lactancia materna", notBaby: true, profileKey: "mama", avatarKey: "mama_1", color: "#d81b60",
        healthProfiles: ["glucemico", "anemia"], healthProfile: "reflux",
      }] },
    });
    expect(f.personas[0]).toEqual(expect.objectContaining({
      usa_fecha_nacimiento: true, fecha_nacimiento: "1986-03-02", detalle_etapa: "lactancia materna",
      no_es_bebe: true, clave_perfil: "mama", clave_avatar: "mama_1", color: "#d81b60",
    }));
    expect(f.personas[0].resto).toEqual({});
    expect(f.perfilesSalud.map((x) => x.perfil).sort()).toEqual(["anemia", "glucemico", "reflux"]);
  });

  it("una fecha de nacimiento mal escrita queda a null, no rompe la fila", () => {
    const f = filasDeCasa(CASA, { data: { members: [{ id: "m5", name: "Leo", birthDate: "ayer" }] } });
    expect(f.personas[0].fecha_nacimiento).toBeNull();
  });

  it("sin nombre se pone un marcador, y edad no numérica queda a null", () => {
    const f = filasDeCasa(CASA, { data: { members: [{ id: "m3", name: "  ", age: "seis" }] } });
    expect(f.personas[0]).toEqual(expect.objectContaining({ nombre: "(sin nombre)", edad: null }));
  });

  it("un comensal sin id se omite y se avisa", () => {
    const f = filasDeCasa(CASA, { data: { members: [{ name: "Fantasma" }] } });
    expect(f.personas).toEqual([]);
    expect(f.avisos).toEqual(["comensal sin id: se omite"]);
  });

  it("un id repetido se omite el segundo y se avisa", () => {
    const f = filasDeCasa(CASA, { data: { members: [{ id: "m1", name: "A" }, { id: "m1", name: "B" }] } });
    expect(f.personas.map((p) => p.nombre)).toEqual(["A"]);
    expect(f.avisos[0]).toMatch(/repetido/);
  });

  it("grupos: pertenencia solo a personas que existen, y orden por posición", () => {
    const state = {
      data: {
        members: [{ id: "a", name: "Pablo" }, { id: "n", name: "Leo" }],
        groups: [
          { id: "g1", label: "Adultos", memberIds: ["a", "fantasma"], color: "#2d5a3d" },
          { id: "g2", label: "Niños", memberIds: ["n"] },
        ],
      },
    };
    const f = filasDeCasa(CASA, state);
    expect(f.grupos).toEqual([
      { household_id: CASA, id: "g1", nombre: "Adultos", color: "#2d5a3d", orden: 0 },
      { household_id: CASA, id: "g2", nombre: "Niños", color: null, orden: 1 },
    ]);
    expect(f.grupoPersona).toEqual([
      { household_id: CASA, grupo_id: "g1", persona_id: "a" },
      { household_id: CASA, grupo_id: "g2", persona_id: "n" },
    ]);
    expect(f.avisos).toEqual(['grupo «g1» apunta a una persona que no existe («fantasma»): se omite']);
  });

  // Desde el 8 oct 2026 no hay varios rosters: solo cuenta la familia activa.
  // Los rosters aparcados (data.rosters) son datos viejos que no se copian.
  it("solo la familia activa: los rosters aparcados no se copian", () => {
    const f = filasDeCasa(CASA, {
      data: {
        members: [{ id: "a", name: "Pablo" }],
        groups: [{ id: "g1", label: "Todos", memberIds: ["a"] }],
        activeRosterId: "default",
        rosters: {
          other: { id: "other", snapshot: { members: [{ id: "x", name: "Suegra" }], groups: [{ id: "g9", label: "Otro", memberIds: ["x"] }] } },
        },
      },
    });
    expect(f.personas.map((p) => p.id)).toEqual(["a"]);
    expect(f.grupos.map((g) => g.id)).toEqual(["g1"]);
  });

  // Una PWA vieja aún puede cambiar a «Otro grupo»: entonces data.members es
  // ese grupo, no la familia, y copiarlo borraría a la familia de la tabla.
  it("con otro roster activo no copia nada (ni personas ni grupos)", () => {
    const f = filasDeCasa(CASA, {
      data: {
        activeRosterId: "other",
        members: [{ id: "x", name: "Suegra" }],
        groups: [{ id: "g9", label: "Otro", memberIds: ["x"] }],
      },
    });
    expect(f.personas).toEqual([]);
    expect(f.grupos).toEqual([]);
    expect(f.avisos[0]).toMatch(/roster/);
  });

  it("los invitados de las reglas no son personas de la casa", () => {
    const f = filasDeCasa(CASA, {
      data: {
        members: [
          { id: "a", name: "Pablo" },
          { id: "inv_reg_1", name: "Mi tío", invitado: true, reglaId: "reg_1" },
          { id: "otro", name: "Visita", invitado: true },
        ],
        groups: [{ id: "g1", label: "Todos", memberIds: ["a", "inv_reg_1", "otro"] }],
      },
    });
    expect(f.personas.map((p) => p.id)).toEqual(["a"]);
    expect(f.grupoPersona.map((x) => x.persona_id)).toEqual(["a"]);
  });

  it("valores fuera de los rangos de la tabla quedan a null (la tabla los rechazaría)", () => {
    const f = filasDeCasa(CASA, {
      data: { members: [{ id: "m", name: "X", age: 130, pesoKg: 1, alturaCm: 300 }] },
    });
    expect(f.personas[0]).toEqual(expect.objectContaining({ edad: null, peso_kg: null, altura_cm: null }));
  });

  it("fechas con forma buena pero imposibles quedan a null", () => {
    const f = filasDeCasa(CASA, {
      data: { members: [{
        id: "m", name: "X", birthDate: "2020-02-30",
        dietaryStates: ["embarazo"], dietaryStatesMeta: { embarazo: { hasta: "pronto" } },
      }] },
    });
    expect(f.personas[0].fecha_nacimiento).toBeNull();
    expect(f.estados[0].hasta).toBeNull();
  });

  it("casa vacía o sin estado: nada que copiar y ningún error", () => {
    expect(filasDeCasa(CASA, null)).toEqual({ personas: [], alergias: [], intolerancias: [], estados: [], perfilesSalud: [], grupos: [], grupoPersona: [], avisos: [] });
    expect(filasDeCasa(CASA, { data: {} }).personas).toEqual([]);
  });
});
