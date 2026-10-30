import { describe, it, expect } from "vitest";
import { DATOS_CASA, DATOS_PERSONA, FICHA_DEL_TEMA, TEMAS } from "./registroFicha.js";
import { VOCABULARIOS, FICHAS, ESCRITORES, ESCRITOR, CHOQUE, CHOQUES } from "./vocabularios.js";

/**
 * Las columnas del eje (plan fichas con estado, trozo 5): ficha, defecto,
 * mínimo para generar, escritor y choque. Se prueban las reglas, no los
 * valores uno a uno.
 */
const todos = [...Object.entries(DATOS_CASA).map(([k, d]) => [k, d]), ...Object.entries(DATOS_PERSONA).map(([k, d]) => [`members.${k}`, d])];

describe("las columnas del eje, en vocabulario cerrado", () => {
  it("todo dato activo tiene ficha, y toda ficha es de la lista", () => {
    for (const [k, d] of todos) {
      if (d.estado === "activo") expect(d.ficha, `${k}: un hecho de la casa sin ficha`).toBeTruthy();
      if (d.ficha !== null) expect(FICHAS, `${k}.ficha`).toContain(d.ficha);
    }
  });

  it("la ficha por defecto de un tema solo existe cuando el tema cae entero en una ficha", () => {
    for (const [tema, ficha] of Object.entries(FICHA_DEL_TEMA)) {
      expect(TEMAS).toContain(tema);
      expect(FICHAS).toContain(ficha);
    }
    // Los temas repartidos entre fichas no tienen defecto: cada dato lo declara.
    for (const tema of ["quien", "cocina", "cuenta"]) expect(FICHA_DEL_TEMA[tema]).toBeUndefined();
  });

  it("escritor y choque son de sus listas, y el mínimo para generar es sí o no", () => {
    for (const [k, d] of todos) {
      expect(ESCRITORES, `${k}.escribe`).toContain(d.escribe);
      expect(CHOQUES, `${k}.choque`).toContain(d.choque);
      expect(typeof d.minimo_para_generar, `${k}.minimo_para_generar`).toBe("boolean");
    }
  });

  it("un defecto es un valor de su vocabulario, y solo lo tiene lo que no es copia ni legado", () => {
    for (const [k, d] of todos) {
      if (d.defecto === null) continue;
      expect(["activo", "interfaz"], `${k}: una copia o un legado no tienen defecto propio`).toContain(d.estado);
      const lista = d.vocabulario && VOCABULARIOS[d.vocabulario];
      if (!lista) continue;
      for (const v of [].concat(d.defecto)) expect(lista, `${k}.defecto «${v}»`).toContain(v);
    }
  });
});

describe("salud: el choque es el más restrictivo y solo escribe la familia", () => {
  // La salud de la ficha Persona (alergias, intolerancias, estados, perfiles); los objetivos del menú (goals) son gustos.
  const listasDeSalud = todos.filter(([, d]) => d.tema === "salud" && d.ficha === "persona" && ["lista", "lista_enum"].includes(d.tipo) && d.estado !== "legado");

  it("hay listas de salud y en todas añadir gana a quitar", () => {
    expect(listasDeSalud.length).toBeGreaterThan(2);
    for (const [k, d] of listasDeSalud) {
      expect(d.choque, `${k}: añadir gana a quitar`).toBe(CHOQUE.MAS_RESTRICTIVO);
      expect(d.escribe, `${k}: las señales no escriben salud`).toBe(ESCRITOR.FAMILIA);
    }
  });
});

describe("mínimos para generar (decisión B: quién come, alergias dichas y días)", () => {
  it("son los tres, y son hechos activos que la familia escribe", () => {
    const minimos = todos.filter(([, d]) => d.minimo_para_generar);
    expect(minimos.map(([k]) => k).sort()).toEqual(["members", "members.allergies", "menuWeekDays"]);
    for (const [k, d] of minimos) {
      expect(d.estado, k).toBe("activo");
      expect(d.escribe, k).toBe(ESCRITOR.FAMILIA);
    }
  });
});
