import { describe, it, expect } from "vitest";
import { DATOS_CASA, DATOS_PERSONA, FICHA_DEL_TEMA, TEMAS, ESTADOS, POLITICAS, APLICA, TIPOS, TIPOS_CAMPO, SIN_TABULAR, datoDe } from "./registroFicha.js";
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { VOCABULARIOS, FICHAS, ESCRITORES, ESCRITOR, CHOQUE, CHOQUES, CLASES_DATO, CLASE } from "./vocabularios.js";

/**
 * Las columnas del eje (plan fichas con estado, trozo 5): ficha, defecto,
 * suposición, mínimo para generar, caducidad, peso, escritor y choque; y la
 * clase del dato (trozo 6). Se prueban las reglas, no los valores uno a uno.
 */
const todos = [...Object.entries(DATOS_CASA).map(([k, d]) => [k, d]), ...Object.entries(DATOS_PERSONA).map(([k, d]) => [`members.${k}`, d])];

describe("la clase de cada dato (plan, «Las cuatro clases de dato»)", () => {
  it("todo dato tiene clase de la lista, y las cuatro clases tienen datos", () => {
    for (const [k, d] of todos) expect(CLASES_DATO, `${k}.clase`).toContain(d.clase);
    for (const clase of CLASES_DATO) expect(todos.some(([, d]) => d.clase === clase), `ningún dato es ${clase}`).toBe(true);
  });

  it("un derivado dice de qué hecho sale (de) y con qué función (fichero:nombre)", () => {
    const derivados = todos.filter(([, d]) => d.clase === CLASE.DERIVADO);
    expect(derivados.length).toBeGreaterThan(0);
    for (const [k, d] of derivados) {
      expect(d.de, `${k}: un derivado dice de qué`).toBeTruthy();
      // Sin función es deuda que el inventario cuenta (sin_declarar), no un valor inventado.
      if (d.funcion !== null) expect(d.funcion, `${k}: la función es «src/…/fichero.js:nombre»`).toMatch(/^src\/.+\.js:\w+$/);
    }
    for (const [k, d] of todos) if (d.clase !== CLASE.DERIVADO) expect(d.funcion, `${k}: solo un derivado tiene función`).toBe(null);
  });

  it("la copia sale de la clase: derivado en data ⇔ estado copia, y el estado ya no distingue marcas", () => {
    for (const [k, d] of todos) {
      expect(ESTADOS, `${k}.estado`).toContain(d.estado);
      expect(d.estado === "copia", `${k}: copia es derivado que vive en data`).toBe(d.clase === CLASE.DERIVADO && d.vive === "data");
    }
    // Una idea, un sitio: el estado (deuda de dónde vive) no repite ninguna palabra de la clase (qué es).
    for (const e of ESTADOS) expect(CLASES_DATO, `estado «${e}»`).not.toContain(e);
  });

  it("una marca que acompaña a otro dato («lo tocó la familia») lo nombra en `de`, y la escribe el sistema", () => {
    const marcas = todos.filter(([, d]) => d.clase === CLASE.MARCA);
    expect(marcas.length).toBeGreaterThan(0);
    expect(marcas.some(([, d]) => d.de), "ninguna marca acompaña a un dato").toBe(true);
    for (const [k, d] of marcas) {
      if (d.de) expect(datoDe(d.de), `${k}.de`).not.toBe(null);
      expect(d.escribe, `${k}: una marca no la dice la familia`).toBe(ESCRITOR.SISTEMA);
    }
  });

  it("un historial crece: es lista o mapa, y hay historiales de menús, despensa y compra", () => {
    const historiales = todos.filter(([, d]) => d.clase === CLASE.HISTORIAL);
    for (const [k, d] of historiales) expect(SIN_TABULAR, `${k}: un historial solo se añade`).toContain(d.tipo);
    expect(new Set(historiales.map(([, d]) => d.tema))).toEqual(new Set(["menus", "despensa", "compra"]));
  });

  it("las fichas provisionales del trozo 5 están resueltas: calorías con los objetivos, variedad con el modelo de menú, foto con la casa", () => {
    expect(DATOS_CASA.kcal.ficha).toBe(DATOS_CASA.goals.ficha);
    expect(DATOS_CASA.kcalByGroup.ficha).toBe(DATOS_CASA.goalsByGroup.ficha);
    expect(DATOS_CASA.menuVarietyPref.ficha).toBe(DATOS_CASA.menuModel.ficha);
    expect(DATOS_CASA.profilePhoto.ficha).toBe(DATOS_CASA.accountMemberIdByUser.ficha);
    // Avatar y color son hechos de la persona, como su nombre.
    for (const k of ["avatarKey", "color"]) expect(DATOS_PERSONA[k].clase, k).toBe(DATOS_PERSONA.name.clase);
  });
});

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

  it("escritor, choque, política y aplica son de sus listas", () => {
    for (const [k, d] of todos) {
      expect(ESCRITORES, `${k}.escribe`).toContain(d.escribe);
      expect(CHOQUES, `${k}.choque`).toContain(d.choque);
      if (d.politica !== null) expect(POLITICAS, `${k}.politica`).toContain(d.politica);
      expect(APLICA, `${k}.aplica`).toContain(d.aplica);
      expect(typeof d.suposicion, `${k}.suposicion`).toBe("boolean");
      expect(typeof d.minimo_para_generar, `${k}.minimo_para_generar`).toBe("boolean");
      expect(typeof d.seguridad, `${k}.seguridad`).toBe("boolean");
    }
  });

  it("los tipos de campo (los de registro_campo) más los tres sin tabular son TIPOS", () => {
    expect(TIPOS).toEqual([...TIPOS_CAMPO, ...SIN_TABULAR]);
    for (const t of SIN_TABULAR) expect(TIPOS_CAMPO).not.toContain(t);
  });

  it("un defecto es un valor de su vocabulario, y solo lo tiene lo que no es copia ni legado", () => {
    for (const [k, d] of todos) {
      if (d.defecto === null) continue;
      expect(d.estado, `${k}: una copia o un legado no tienen defecto propio`).toBe("activo");
      const lista = d.vocabulario && VOCABULARIOS[d.vocabulario];
      if (!lista) continue;
      for (const v of [].concat(d.defecto)) expect(lista, `${k}.defecto «${v}»`).toContain(v);
    }
  });

  it("peso, caducidad y rango son números con sentido cuando están", () => {
    for (const [k, d] of todos) {
      if (d.peso_menu !== null) expect(d.peso_menu, `${k}.peso_menu`).toBeGreaterThan(0);
      if (d.caduca_dias !== null) expect(d.caduca_dias, `${k}.caduca_dias`).toBeGreaterThan(0);
      if (d.minimo !== null && d.maximo !== null) expect(d.minimo, k).toBeLessThanOrEqual(d.maximo);
      if (d.minimo !== null || d.maximo !== null) expect(["int", "decimal"], `${k}: rango sin ser numérico`).toContain(d.tipo);
    }
  });
});

describe("salud: nunca se supone y el choque es el más restrictivo", () => {
  // La salud de la ficha Persona (alergias, intolerancias, estados, perfiles); los objetivos del menú (goals) son gustos.
  const listasDeSalud = todos.filter(([, d]) => d.tema === "salud" && d.ficha === "persona" && ["lista", "lista_enum"].includes(d.tipo) && d.estado !== "legado");

  it("hay listas de salud y ninguna se supone", () => {
    expect(listasDeSalud.length).toBeGreaterThan(2);
    for (const [k, d] of listasDeSalud) {
      expect(d.suposicion, `${k}: una alergia inferida no se da por buena`).toBe(false);
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

describe("datoDe: la clave de un dato, de la casa o de la persona (members.x)", () => {
  it("resuelve las dos formas y no inventa nada", () => {
    expect(datoDe("members.allergies")).toBe(DATOS_PERSONA.allergies);
    expect(datoDe("cookTime")).toBe(DATOS_CASA.cookTime);
    expect(datoDe("members.noExiste")).toBe(null);
    expect(datoDe("noExiste")).toBe(null);
    expect(datoDe("allergies")).toBe(null);
  });
});

describe("registroCampos es una proyección del registro", () => {
  it("cada campo de registro_campo sale de exactamente un dato, con su clave `campo`", () => {
    for (const id of Object.keys(REGISTRO_CAMPOS)) {
      const duenos = todos.filter(([, d]) => d.campo === id);
      expect(duenos.map(([k]) => k), `${id}: un campo, un dato`).toHaveLength(1);
    }
  });

  it("y el dato lleva lo que la tabla dice de él", () => {
    for (const [id, c] of Object.entries(REGISTRO_CAMPOS)) {
      const [, d] = todos.find(([, x]) => x.campo === id);
      for (const col of ["tipo", "vocabulario", "minimo", "maximo", "politica", "seguridad", "aplica", "columna", "caduca_dias"]) {
        expect(d[col], `${id}.${col}`).toEqual(c[col]);
      }
      expect(c.por).toBe(d.entidad);
    }
  });
});
