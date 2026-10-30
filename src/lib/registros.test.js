import { describe, it, expect } from "vitest";
import { DATOS_CASA, DATOS_PERSONA, DATOS_PREFERENCIA, ENTIDADES, datoDe } from "./registroFicha.js";
import { VOCABULARIOS_PENDIENTES } from "./registroCampos.js";
import { CAMPOS as CAMPOS_LIBRETA } from "./notepadFields.js";
import { ENUMS, SOBRE_A_CAMPO } from "./registroTareas.js";
import { CAPACIDADES, SOBRE } from "./capacidades.js";
import * as V from "./vocabularios.js";
import { VOCABULARIOS, FICHAS, FICHA, AGREGABLES, UNIDADES_EJE, SOBRES_TAREA } from "./vocabularios.js";
import { EJES, EJE_POR_ID } from "../data/axisRegistry.js";
import { NUTRIENTES } from "../data/nutrientes.js";

/**
 * Las cuatro listas del registro (specs/arquitectura-objetivo.md, [1]; plan fichas con estado,
 * trozo 24), cruzadas: Datos (registroFicha.js, con la libreta), Ejes (axisRegistry.js),
 * Valores (vocabularios.js) y Acciones (capacidades.js). Todo id que una nombra existe en la
 * suya, y ninguna lista de valores se declara dos veces.
 */
const datos = [
  ...Object.entries(DATOS_CASA),
  ...Object.entries(DATOS_PERSONA).map(([k, d]) => [`members.${k}`, d]),
  ...Object.entries(DATOS_PREFERENCIA).map(([k, d]) => [`notepad.${k}`, d]),
];
/** Lo que Acciones nombra como «sobre» y no es una entidad: la conversación con Lola. */
/** Todas las listas de Valores: las del mapa VOCABULARIOS y las de las tareas, que aún no tienen ciclo de vida. */
const VALORES = Object.entries(V).filter(([, l]) => Array.isArray(l));
const SOBRE_SIN_ENTIDAD = SOBRE.filter((s) => !ENTIDADES[s]);

describe("Datos → Valores, Ejes y la libreta", () => {
  it("todo vocabulario, ficha y entidad que nombra un dato existe en su lista", () => {
    for (const [k, d] of datos) {
      if (d.vocabulario) expect(Boolean(VOCABULARIOS[d.vocabulario]) || VOCABULARIOS_PENDIENTES.includes(d.vocabulario), `${k}.vocabulario`).toBe(true);
      if (d.ficha !== null) expect(FICHAS, `${k}.ficha`).toContain(d.ficha);
      expect(ENTIDADES[d.entidad], `${k}.entidad`).toBeTruthy();
      if (d.libreta) expect(CAMPOS_LIBRETA.map((c) => c.id), `${k}.libreta`).toContain(d.libreta);
      if (d.eje !== null) expect(EJE_POR_ID.has(d.eje), `${k}.eje «${d.eje}»`).toBe(true);
    }
  });

  it("cada campo de la libreta es un dato de la ficha Preferencia, con su eje o con por qué no lo tiene", () => {
    expect(Object.keys(DATOS_PREFERENCIA)).toEqual(CAMPOS_LIBRETA.map((c) => c.id));
    for (const c of CAMPOS_LIBRETA) {
      expect(DATOS_PREFERENCIA[c.id].ficha, c.id).toBe(FICHA.PREFERENCIA);
      expect(DATOS_PREFERENCIA[c.id].eje, c.id).toBe(c.eje);
      // Sin eje solo con su motivo; con eje, el motivo sobra.
      expect(c.eje === null, `${c.id}: eje null ⇔ sinEje`).toBe(Boolean(c.sinEje));
    }
    expect(CAMPOS_LIBRETA.some((c) => c.eje !== null), "ningún campo de la libreta apunta a un eje").toBe(true);
  });
});

describe("Ejes → Valores", () => {
  it("todo eje dice cómo se junta y en qué unidad, de sus listas", () => {
    for (const e of EJES) {
      expect(AGREGABLES, `${e.id}.agregable`).toContain(e.agregable);
      if (e.unidad !== null) expect(UNIDADES_EJE, `${e.id}.unidad`).toContain(e.unidad);
    }
  });

  it("las unidades de los nutrientes son de la lista, y cada nutriente es un eje que se suma con la suya", () => {
    for (const nu of Object.values(NUTRIENTES)) {
      expect(UNIDADES_EJE, nu.porRacion).toContain(nu.unidad);
      expect(EJE_POR_ID.get(nu.porRacion)?.unidad, nu.porRacion).toBe(nu.unidad);
    }
  });
});

describe("Acciones → Datos y entidades", () => {
  it("toda capacidad habla de una entidad del registro (o de la charla) y de datos que existen", () => {
    expect(SOBRE_SIN_ENTIDAD.length, "lo que no es entidad es solo la charla").toBeLessThanOrEqual(1);
    for (const c of CAPACIDADES) {
      expect(SOBRE, `${c.id}.sobre`).toContain(c.sobre);
      for (const clave of c.datos ?? []) expect(datoDe(clave), `${c.id}: ${clave}`).not.toBe(null);
    }
  });
});

describe("Valores: cada lista, una vez", () => {
  it("los enum de las tareas son listas de vocabularios.js (o la proyección de los datos preguntables)", () => {
    const listas = new Set(VALORES.map(([, l]) => l));
    const todos = new Set(VALORES.flatMap(([, l]) => l));
    for (const [k, lista] of Object.entries(ENUMS)) {
      if (listas.has(lista)) continue;
      // Compuestas (cerrar con aplazar) o proyectadas del registro (bot_tareas.campo): sus valores, de alguna lista o dato.
      for (const v of lista) expect(todos.has(v) || Boolean(datos.find(([, d]) => d.campo === v)), `${k}: «${v}»`).toBe(true);
    }
    expect(Object.keys(SOBRE_A_CAMPO)).toEqual(SOBRES_TAREA);
  });

  it("ningún conjunto de valores se declara en dos listas distintas: se importa de su dueño", () => {
    const listas = [
      ...VALORES.map(([k, l]) => [`vocabularios.${k}`, l]),
      ...EJES.filter((e) => Array.isArray(e.vocabulario)).map((e) => [`ejes.${e.id}`, e.vocabulario]),
      ...CAMPOS_LIBRETA.filter((c) => c.dominio).map((c) => [`libreta.${c.id}`, c.dominio]),
      ...Object.entries(ENUMS).map(([k, l]) => [`tareas.${k}`, l]),
    ];
    const porValores = new Map();
    for (const [nombre, l] of listas) {
      const clave = [...l].map(String).sort().join("|");
      porValores.set(clave, [...(porValores.get(clave) ?? []), [nombre, l]]);
    }
    const copias = [...porValores.values()].filter((g) => new Set(g.map(([, l]) => l)).size > 1).map((g) => g.map(([n]) => n).join(" = "));
    expect(copias).toEqual([]);
  });
});
