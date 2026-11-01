// Persona y salud desde sus filas (plan fichas con estado, trozo 10): leer lo de personas_de_casa (0108) como
// data.members/data.groups, y sacar de dos familias lo que hay que mandar a escribir_persona.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  membersDeFilas, filaDeMiembro, cambiosDePersonas, COLUMNA_DE_MIEMBRO, AVISOS_PERSONA, FamiliaSinLeer, FamiliaIncompleta, CAMPOS_CON_COLUMNA,
  RANGOS, conOrdenDeTodos, TEXTO_AVISO_PERSONA, textosDeAvisos,
} from "./personas.js";
import { CAMPOS_CON_COLUMNA as DE_LA_TABLA, RANGOS as RANGOS_TABLA } from "./personasTabla.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const G = "00000000-0000-4000-8000-00000000000c";

/** Lo que devuelve personas_de_casa para una familia de dos y un grupo. */
const FILAS = {
  v: 1, rev: 4,
  personas: [
    { id: A, nombre: "Ana", orden: 0, edad: 40, rol_hogar: "Mamá", alergias_revisadas: true, peso_kg: null, altura_cm: null,
      usa_fecha_nacimiento: false, fecha_nacimiento: null, detalle_etapa: null, no_es_bebe: false, clave_perfil: "mama",
      clave_avatar: "mama_1", color: "#fff", resto: { dislikes: ["ajo"] }, alergias: ["Gluten"], intolerancias: [],
      estados: [{ estado: "embarazo", hasta: "2027-01-01" }], perfiles_salud: [], origen_alergias: "dicho" },
    { id: B, nombre: "Bea", orden: 1, edad: 5, rol_hogar: "Hijo/a", alergias_revisadas: false, peso_kg: "20.5", altura_cm: null,
      usa_fecha_nacimiento: true, fecha_nacimiento: "2021-03-04", detalle_etapa: null, no_es_bebe: false, clave_perfil: null,
      clave_avatar: null, color: null, resto: {}, alergias: [], intolerancias: ["lactosa_fina"], estados: [],
      perfiles_salud: ["reflux"], origen_alergias: null },
  ],
  grupos: [{ id: G, nombre: "Familia", tipo: "familia", color: "#000", orden: 0, personas: [A, B] }],
};

describe("membersDeFilas: las filas en la forma de data.members", () => {
  const { members, groups } = membersDeFilas(FILAS);

  it("cada persona como comensal, con su salud y lo de resto", () => {
    expect(members[0]).toEqual({
      dislikes: ["ajo"], id: A, name: "Ana", age: 40, homeRole: "Mamá", alergiasRevisadas: true, useBirthDate: false,
      birthDate: "", stageDetail: "", profileKey: "mama", avatarKey: "mama_1", color: "#fff", allergies: ["Gluten"],
      intolerances: [], dietaryStates: ["embarazo"], dietaryStatesMeta: { embarazo: { hasta: "2027-01-01" } }, healthProfiles: [],
    });
    expect(members[1]).toMatchObject({ id: B, pesoKg: 20.5, birthDate: "2021-03-04", useBirthDate: true, healthProfiles: ["reflux"] });
  });

  it("los grupos con su tipo y quién está", () => {
    expect(groups).toEqual([{ id: G, label: "Familia", tipo: "familia", color: "#000", memberIds: [A, B] }]);
  });

  it("una lectura sin forma (fallida, null) no es una familia vacía: lanza", () => {
    expect(() => membersDeFilas(null)).toThrow(FamiliaSinLeer);
    expect(() => membersDeFilas({ personas: [] })).toThrow(FamiliaSinLeer);
    expect(membersDeFilas({ personas: [], grupos: [] })).toEqual({ members: [], groups: [] });
  });

  it("leer y volver a escribir sin tocar nada no manda nada (ida y vuelta sin pérdida)", () => {
    expect(cambiosDePersonas({ members, groups }, { members: structuredClone(members), groups: structuredClone(groups) }))
      .toEqual({ cambios: null, avisos: [] });
  });
});

describe("cambiosDePersonas: solo lo que cambió", () => {
  const antes = membersDeFilas(FILAS);
  const cambios = (ahora) => cambiosDePersonas(antes, ahora).cambios;

  it("un nombre cambiado viaja solo, con su id", () => {
    const ahora = structuredClone(antes);
    ahora.members[1].name = "Beatriz";
    expect(cambios(ahora)).toEqual({ personas: [{ id: B, nombre: "Beatriz" }] });
  });

  it("una alergia añadida manda la lista entera de esa persona", () => {
    const ahora = structuredClone(antes);
    ahora.members[1].allergies = ["Huevos"];
    ahora.members[1].alergiasRevisadas = true;
    expect(cambios(ahora)).toEqual({ personas: [{ id: B, alergias: ["Huevos"], alergias_revisadas: true }] });
  });

  it("quien ya no está se borra, y los grupos cambian con él", () => {
    const ahora = structuredClone(antes);
    ahora.members = ahora.members.filter((m) => m.id !== B);
    ahora.groups[0].memberIds = [A];
    const c = cambios(ahora);
    expect(c.personas).toEqual([{ id: B, borrar: true }]);
    expect(c.grupos).toEqual([{ id: G, nombre: "Familia", tipo: "familia", color: "#000", orden: 0, personas: [A] }]);
  });

  it("una persona nueva va entera y con su orden; sin nombre aún no va, lo avisa y no cuenta en los grupos", () => {
    const N = "00000000-0000-4000-8000-00000000000d";
    const ahora = structuredClone(antes);
    ahora.members.push({ id: N, name: "", age: 1, allergies: [], dislikes: [] });
    ahora.groups[0].memberIds = [A, B, N];
    expect(cambiosDePersonas(antes, ahora)).toEqual({ cambios: null, avisos: [{ aviso: AVISOS_PERSONA.SIN_NOMBRE, persona_id: N }] });
    ahora.members[2].name = "Nico";
    const c = cambios(ahora);
    expect(c.personas).toEqual([{ id: N, ...filaDeMiembro(ahora.members[2]), orden: 2 }]);
    expect(c.grupos[0].personas).toEqual([A, B, N]);
  });

  it("los invitados de las reglas no son personas (ni aviso)", () => {
    const ahora = structuredClone(antes);
    ahora.members.push({ id: "inv_1", name: "Abuela", invitado: true });
    expect(cambiosDePersonas(antes, ahora)).toEqual({ cambios: null, avisos: [] });
  });

  it("una familia sin su lista de personas o de grupos (un documento a medio cargar) lanza y no borra a nadie", () => {
    expect(() => cambiosDePersonas(antes, { groups: antes.groups })).toThrow(FamiliaIncompleta);
    expect(() => cambiosDePersonas(antes, { members: antes.members })).toThrow(FamiliaIncompleta);
    expect(() => cambiosDePersonas({ members: antes.members }, antes)).toThrow(FamiliaIncompleta);
    expect(() => cambiosDePersonas(null, antes)).toThrow(FamiliaIncompleta);
    // Las listas vacías sí son una familia: borrar a todos es entonces lo pedido.
    expect(cambios({ members: [], groups: [] })).toEqual({ personas: [{ id: A, borrar: true }, { id: B, borrar: true }], grupos: [] });
  });

  it("lo que no viaja tal cual se avisa: sin id, id repetido, fuera de rango, fecha que no existe", () => {
    const ahora = structuredClone(antes);
    ahora.members[1] = { ...ahora.members[1], age: 300, birthDate: "2020-02-30" };
    ahora.members.push({ name: "Sin id" }, { ...ahora.members[0] });
    const { cambios: c, avisos } = cambiosDePersonas(antes, ahora);
    expect(avisos).toEqual([
      { aviso: AVISOS_PERSONA.SIN_ID, persona_id: null },
      { aviso: AVISOS_PERSONA.ID_REPETIDO, persona_id: A },
      { aviso: AVISOS_PERSONA.FUERA_DE_RANGO, persona_id: B, campo: "age" },
      { aviso: AVISOS_PERSONA.FECHA_NO_VALE, persona_id: B, campo: "birthDate" },
    ]);
    // Van como null: la base abortaría la operación entera con el valor.
    expect(c.personas).toEqual([{ id: B, edad: null, fecha_nacimiento: null }]);
  });

  it("el fin de un estado que no existe va sin fin, y se avisa", () => {
    const ahora = structuredClone(antes);
    ahora.members[0].dietaryStatesMeta = { embarazo: { hasta: "2027-02-30" } };
    const { cambios: c, avisos } = cambiosDePersonas(antes, ahora);
    expect(avisos).toEqual([{ aviso: AVISOS_PERSONA.FECHA_NO_VALE, persona_id: A, campo: "dietaryStatesMeta.embarazo" }]);
    expect(c.personas).toEqual([{ id: A, estados: [{ estado: "embarazo", hasta: null }] }]);
  });

  it("lo que no viaja de la familia leída también se avisa, una vez aunque siga igual en la de ahora", () => {
    const leida = structuredClone(antes);
    leida.members.push({ name: "Sin id" });
    leida.groups.push({ label: "Sin id", memberIds: [] });
    const DE_LA_LEIDA = [{ aviso: AVISOS_PERSONA.SIN_ID, persona_id: null }, { aviso: AVISOS_PERSONA.GRUPO_SIN_ID, persona_id: null }];
    expect(cambiosDePersonas(leida, structuredClone(antes)).avisos).toEqual(DE_LA_LEIDA);
    expect(cambiosDePersonas(leida, structuredClone(leida)).avisos).toEqual(DE_LA_LEIDA);
  });
});

it("los grupos que no viajan tal cual se avisan: sin id, repetido, sin nombre, y quien no es persona", () => {
  const antes = membersDeFilas(FILAS);
  const ahora = structuredClone(antes);
  ahora.groups = [
    { ...ahora.groups[0], label: "", memberIds: [A, B, "fantasma"] },
    { label: "Sin id", memberIds: [A] },
    { ...ahora.groups[0] },
  ];
  const { cambios: c, avisos } = cambiosDePersonas(antes, ahora);
  expect(avisos).toEqual([
    { aviso: AVISOS_PERSONA.GRUPO_SIN_ID, persona_id: null },
    { aviso: AVISOS_PERSONA.GRUPO_REPETIDO, persona_id: null, grupo_id: G },
    { aviso: AVISOS_PERSONA.GRUPO_SIN_NOMBRE, persona_id: null, grupo_id: G },
    { aviso: AVISOS_PERSONA.NO_ES_PERSONA, persona_id: "fantasma", grupo_id: G },
  ]);
  expect(c.grupos).toEqual([{ id: G, nombre: "", tipo: "familia", color: "#000", orden: 0, personas: [A, B] }]);
});

describe("conOrdenDeTodos: el orden de toda la familia en cada guardado", () => {
  const antes = membersDeFilas(FILAS);

  it("cada persona que queda lleva su sitio, aunque solo cambiara otra; quien se va, sin orden", () => {
    const ahora = structuredClone(antes);
    ahora.members[1].name = "Beatriz";
    const { cambios } = cambiosDePersonas(antes, ahora);
    expect(conOrdenDeTodos(cambios, antes, ahora).personas).toEqual([{ id: B, nombre: "Beatriz", orden: 1 }, { id: A, orden: 0 }]);
    const sinBea = { ...structuredClone(antes), members: [antes.members[0]] };
    expect(conOrdenDeTodos(cambiosDePersonas(antes, sinBea).cambios, antes, sinBea).personas).toEqual([{ id: B, borrar: true }, { id: A, orden: 0 }]);
  });

  it("sin cambios no se escribe solo para ordenar; una nueva sin nombre no cuenta para el orden", () => {
    expect(conOrdenDeTodos(null, antes, antes)).toBeNull();
    const N = "00000000-0000-4000-8000-00000000000d";
    const ahora = structuredClone(antes);
    ahora.members.unshift({ id: N, name: "" });
    ahora.members[2].name = "Beatriz";
    expect(conOrdenDeTodos(cambiosDePersonas(antes, ahora).cambios, antes, ahora).personas).toEqual([{ id: A, orden: 0 }, { id: B, nombre: "Beatriz", orden: 1 }]);
  });
});

it("cada aviso tiene su frase para decirlo, y se dicen sin repetir", () => {
  for (const a of Object.values(AVISOS_PERSONA)) expect(TEXTO_AVISO_PERSONA[a], a).toBeTruthy();
  expect(textosDeAvisos([{ aviso: AVISOS_PERSONA.SIN_ID }, { aviso: AVISOS_PERSONA.SIN_ID }])).toEqual([TEXTO_AVISO_PERSONA[AVISOS_PERSONA.SIN_ID]]);
  expect(new FamiliaSinLeer("rpc_ausente").fallo).toBe("rpc_ausente");
});

/** Las columnas de `cols` que no salen en el SQL fuera de los comentarios (`--` y los de bloque). */
const columnasQueFaltan = (sql, cols) => {
  const codigo = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  return cols.filter((col) => !new RegExp(`\\b${col}\\b`).test(codigo));
};

it("cada columna que lee membersDeFilas es una columna de persona (0079 o 0108), fuera de los comentarios", () => {
  // El caso malo: una columna que solo sale en un comentario no cuenta.
  expect(columnasQueFaltan("-- edad\n/* peso_kg */ create table persona (nombre text);", ["nombre", "edad", "peso_kg"]))
    .toEqual(["edad", "peso_kg"]);
  const sql = ["0079_personas_y_grupos", "0108_persona_fuente"]
    .map((f) => readFileSync(new URL(`../../supabase/migrations/${f}.sql`, import.meta.url), "utf8")).join("\n");
  expect(columnasQueFaltan(sql, Object.values(COLUMNA_DE_MIEMBRO))).toEqual([]);
});

/** Un comensal con cada clave de COLUMNA_DE_MIEMBRO llena (y distinta de lo que se pone por defecto). */
const COMPLETO = {
  id: A, name: "Ana", age: 40, homeRole: "Mamá", alergiasRevisadas: true, pesoKg: 60, alturaCm: 170, useBirthDate: true,
  birthDate: "1986-01-02", stageDetail: "lactancia", notBaby: true, profileKey: "mama", avatarKey: "mama_1", color: "#fff",
};

it("filaDeMiembro y membersDeFilas cubren justo las claves de COLUMNA_DE_MIEMBRO, de ida y de vuelta", () => {
  expect(Object.keys(COMPLETO).filter((k) => k !== "id").sort()).toEqual(Object.keys(COLUMNA_DE_MIEMBRO).sort());
  const fila = filaDeMiembro(COMPLETO);
  const DE_SALUD_Y_RESTO = ["resto", "alergias", "intolerancias", "estados", "perfiles_salud"];
  expect(Object.keys(fila).sort()).toEqual([...Object.values(COLUMNA_DE_MIEMBRO), ...DE_SALUD_Y_RESTO].sort());
  for (const [k, col] of Object.entries(COLUMNA_DE_MIEMBRO)) expect(fila[col], col).toEqual(COMPLETO[k]);
  const { members: [vuelta] } = membersDeFilas({ personas: [{ id: A, ...fila }], grupos: [] });
  expect(vuelta).toMatchObject(COMPLETO);
});

it("personasTabla.js (hasta el trozo 11) usa las claves con columna y los topes de aquí, no una copia", () => {
  expect(DE_LA_TABLA).toBe(CAMPOS_CON_COLUMNA);
  expect(RANGOS_TABLA).toBe(RANGOS);
});
