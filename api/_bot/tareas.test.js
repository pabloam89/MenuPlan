import { describe, it, expect } from "vitest";
import { filtroDeLectura, bloqueDeTareas, validarNueva, caducidadDe, separarPorEstado, porReferencia, aPromover, textoDeTope, decidirTope, LIMITE_ABIERTAS, LIMITE_LECTURA, elegirParaLeer } from "./tareas.js";
import { preguntasPendientes } from "./ficha.js";

describe("preguntasPendientes: lo que no quieren decir no se vuelve a pedir", () => {
  const d = { members: [{ id: "c1", name: "Cova" }, { id: "i1", name: "Isa" }] };
  it("sin calladas, pide las de todos", () => {
    expect(preguntasPendientes(d).map((p) => p.clave)).toEqual(["alergias:c1", "alergias:i1"]);
  });
  it("una callada desaparece de la ficha", () => {
    expect(preguntasPendientes(d, new Set(["alergias:i1"])).map((p) => p.clave)).toEqual(["alergias:c1"]);
  });
});
import { tramitar } from "./pendientes.js";
import { claveDePregunta } from "./estadoCasa.js";

const CASA = "11111111-1111-1111-1111-111111111111";
const YO = "22222222-2222-2222-2222-222222222222";
const AHORA = new Date("2026-10-03T10:00:00Z");
const data = { members: [{ id: "p1", name: "Pablo", age: 37 }, { id: "i1", name: "Isa", age: 36 }, { id: "c1", name: "Cova", age: 0 }] };

describe("filtroDeLectura: qué tareas ve quien escribe", () => {
  it("en grupo, solo las de la casa", () => {
    const f = filtroDeLectura({ householdId: CASA, userId: YO, privado: false, ahora: AHORA });
    expect(f).toContain("scope=eq.casa");
    expect(f).not.toContain("owner_user_id");
  });
  it("en privado, también las personales de quien escribe", () => {
    expect(filtroDeLectura({ householdId: CASA, userId: YO, privado: true, ahora: AHORA })).toContain(`owner_user_id.eq.${YO}`);
  });
  it("acota a la casa, a lo abierto, a lo no caducado y a un tope", () => {
    const f = filtroDeLectura({ householdId: CASA, ahora: AHORA });
    expect(f).toContain(`household_id=eq.${CASA}`);
    expect(f).toContain("status=eq.abierta");
    expect(f).toContain("caduca_at=gt.");
    // La lectura trae de más (cota de seguridad); el recorte a 8 lo hace elegirParaLeer.
    expect(f).toContain(`limit=${LIMITE_LECTURA}`);
  });
  it("compara con la hora, no con el día", () => {
    expect(filtroDeLectura({ householdId: CASA, ahora: AHORA })).toContain(encodeURIComponent("2026-10-03T10:00:00"));
  });
});

describe("elegirParaLeer: lo caducado esta mañana ya no sale", () => {
  it("caducó a las 8, son las 10: fuera; caduca a las 12: dentro", () => {
    const t = [
      { id: "m", kind: "seguimiento", texto: "caducó", caduca_at: "2026-10-03T08:00:00Z", created_at: "2026-10-01" },
      { id: "t", kind: "seguimiento", texto: "sigue", caduca_at: "2026-10-03T12:00:00Z", created_at: "2026-10-01" },
    ];
    expect(elegirParaLeer(t, AHORA).map((x) => x.id)).toEqual(["t"]);
  });
});

describe("elegirParaLeer: la seguridad entra siempre, el resto hasta el límite", () => {
  const t = (i, kind, clave, dias = 0, vence = null) => ({
    id: `t${i}`, kind, clave, vence, created_at: new Date(AHORA.getTime() - dias * 86400000).toISOString(),
  });
  it("6 seguimientos y 3 alergias más nuevas: las 3 alergias están", () => {
    const seg = Array.from({ length: 6 }, (_, i) => t(i, "seguimiento", `seguimiento:casa:x${i}`, 10 - i));
    const ale = ["nat", "pablo", "isa"].map((p, i) => t(10 + i, "pregunta", `alergias:${p}`, 1));
    const otras = [t(20, "pregunta", null, 2), t(21, "pregunta", null, 3)];
    const leidas = elegirParaLeer([...seg, ...otras, ...ale], AHORA);
    expect(leidas.filter((x) => x.clave?.startsWith("alergias:"))).toHaveLength(3);
  });
  it("con 9 alergias por preguntar, entran las 9 aunque pasen del límite", () => {
    const ale = Array.from({ length: 9 }, (_, i) => t(i, "pregunta", `alergias:p${i}`, i));
    const seg = Array.from({ length: 8 }, (_, i) => t(20 + i, "seguimiento", `seguimiento:casa:y${i}`, i));
    const leidas = elegirParaLeer([...seg, ...ale], AHORA);
    expect(leidas.filter((x) => x.clave?.startsWith("alergias:"))).toHaveLength(9);
    expect(leidas.filter((x) => x.kind === "seguimiento")).toHaveLength(LIMITE_ABIERTAS);
  });
  it("fuera de la seguridad, lo que vence antes va primero", () => {
    const leidas = elegirParaLeer([t(1, "seguimiento", "s1", 5, "2026-12-01"), t(2, "seguimiento", "s2", 1, "2026-10-04")], AHORA);
    expect(leidas.map((x) => x.id)).toEqual(["t2", "t1"]);
  });
});

describe("validarNueva", () => {
  const seguir = (texto) => validarNueva({ texto, kind: "seguimiento", confirmado: true }, data, AHORA);
  it("solo comida: velas, pilas o una cita no se apuntan, en código", () => {
    for (const t of ["comprar velas para la tarta", "pilas del mando", "cita con la pediatra el jueves"]) expect(seguir(t).error, t).toMatch(/comida/);
    for (const t of ["comprar leche", "pan sin gluten para el sábado"]) expect(seguir(t).valor, t).toBeTruthy();
  });
  it("lo que nunca se pregunta (edad, colegio, sexo, custodia) no se abre aunque Lola lo intente", () => {
    for (const t of ["cuántos años tiene Cova", "a qué colegio va Leo", "si es chico o chica", "si tenéis custodia compartida"]) {
      expect(validarNueva({ texto: t, kind: "pregunta" }, data, AHORA).error, t).toMatch(/no se pregunta/);
    }
    expect(validarNueva({ texto: "cómo come Cova", kind: "pregunta" }, data, AHORA).valor).toBeTruthy();
  });
  it("un seguimiento sin el sí no se escribe", () => {
    expect(validarNueva({ texto: "comprar pan", kind: "seguimiento" }, data, AHORA).error).toMatch(/sí/);
  });
  it("una pregunta de Lola no pide permiso", () => {
    expect(validarNueva({ texto: "cómo come Cova", kind: "pregunta", sobre: "etapa_bebe", para: "Cova" }, data, AHORA).valor).toBeTruthy();
  });
  it("liga una pregunta de etapa al bebé con su clave de estado", () => {
    expect(validarNueva({ texto: "cómo come", kind: "pregunta", sobre: "etapa_bebe", para: "Cova" }, data, AHORA).valor.clave).toBe("etapa:c1");
  });
  it("resuelve para y encargado a ids de la casa", () => {
    const { valor } = validarNueva({ texto: "comprar pan", kind: "seguimiento", confirmado: true, para: "Cova", encargado: "Isa" }, data, AHORA);
    expect(valor).toMatchObject({ para_member: "c1", asignado_member: "i1" });
  });
  it("una persona que no está en la casa se pregunta", () => {
    expect(validarNueva({ texto: "x", kind: "seguimiento", confirmado: true, encargado: "Mario" }, data, AHORA).error).toMatch(/Mario/);
  });
  it("fechas: formato y no en el pasado", () => {
    expect(validarNueva({ texto: "pan", kind: "seguimiento", confirmado: true, vence: "viernes" }, data, AHORA).error).toMatch(/AAAA-MM-DD/);
    expect(validarNueva({ texto: "pan", kind: "seguimiento", confirmado: true, vence: "2026-09-01" }, data, AHORA).error).toMatch(/pasado/);
  });
  it("tipos y ámbitos fuera de lo previsto no pasan", () => {
    expect(validarNueva({ texto: "x", kind: "recordatorio", confirmado: true }, data, AHORA).error).toBeTruthy();
    expect(validarNueva({ texto: "x", kind: "seguimiento", confirmado: true, scope: "mundo" }, data, AHORA).error).toBeTruthy();
  });
});

describe("caducidadDe", () => {
  const dias = (d) => Math.round((d.getTime() - AHORA.getTime()) / 86400000);
  it("la etapa de un bebé dura menos que unas alergias", () => {
    expect(dias(caducidadDe({ kind: "pregunta", tema: "etapa_bebe" }, AHORA))).toBe(21);
    expect(dias(caducidadDe({ kind: "pregunta", tema: "alergias" }, AHORA))).toBe(30);
  });
  it("con fecha límite, caduca el día después", () => {
    expect(caducidadDe({ kind: "seguimiento", vence: "2026-10-10" }, AHORA).toISOString().slice(0, 10)).toBe("2026-10-11");
  });
  it("nunca más de 90 días", () => {
    expect(dias(caducidadDe({ kind: "seguimiento", vence: "2027-12-31" }, AHORA))).toBe(90);
  });
});

describe("separarPorEstado", () => {
  it("lo que el estado ya resolvió se separa para cerrarlo solo", () => {
    const tareas = [
      { id: "a", clave: "etapa:c1" },
      { id: "b", clave: "seguimiento:casa:pan" },
      { id: "c", clave: null },
    ];
    const { resueltas, siguen } = separarPorEstado(tareas, { ...data, etapaBebe: "mixto" });
    expect(resueltas.map((t) => t.id)).toEqual(["a"]);
    expect(siguen.map((t) => t.id)).toEqual(["b", "c"]);
  });
});

describe("porReferencia: cerrar sin equivocarse de tarea", () => {
  const abiertas = [{ id: "abcd1234-0000-0000-0000-000000000000" }, { id: "abce9999-0000-0000-0000-000000000000" }];
  it("con los 8 caracteres, la encuentra", () => {
    expect(porReferencia(abiertas, "abcd1234").id).toMatch(/^abcd1234/);
    expect(porReferencia(abiertas, "[abcd1234]").id).toMatch(/^abcd1234/);
  });
  it("una referencia que encaja con dos no cierra ninguna", () => {
    expect(porReferencia(abiertas, "abc")).toBe(null);
    expect(porReferencia(abiertas, "abcd")).not.toBe(null);
  });
  it("lo que no está entre las abiertas, no", () => {
    expect(porReferencia(abiertas, "ffffffff")).toBe(null);
  });
});

describe("aPromover: lo que falta saber de la casa no depende del modelo", () => {
  it("«luego te digo»: aunque el modelo no anote nada, la pregunta de etapa sube a la tabla", () => {
    const claveDe = (f) => claveDePregunta(f, data);
    const turno1 = tramitar("Para darte ideas para Cova necesito saber cómo come: ¿solo purés, ya algo de sólido, o un poco de todo?", [], "@homenuers_bot ¿qué le doy hoy a Cova?", { claveDe });
    const turno2 = tramitar("Vale, en cuanto lo sepas me dices 😊", turno1.pendientes, "uf no sé, luego te digo", { claveDe });
    const subir = aPromover(turno2.pendientes);
    expect(subir).toHaveLength(1);
    expect(subir[0]).toMatchObject({ clave: "etapa:c1", tema: "etapa_bebe" });
    expect(subir[0].texto).toBe("¿qué le doy hoy a Cova?");
  });
  it("lo que no es de estado se queda en el mensaje", () => {
    expect(aPromover([{ pedido: "apuntar leche", falta: "¿cuántos litros?", clave: null }])).toEqual([]);
    expect(aPromover([{ pedido: "pan", clave: "seguimiento:casa:pan" }])).toEqual([]);
  });
});

describe("textoDeTope: lleno no es olvidar en silencio", () => {
  it("con menos del máximo, cabe", () => {
    expect(textoDeTope([{ id: "a", texto: "x" }])).toBe(null);
  });
  it("lleno: no apunta, enseña la lista con referencias y manda preguntar cuál quitar", () => {
    const llenas = Array.from({ length: LIMITE_ABIERTAS }, (_, i) => ({ id: `0000000${i}-x`, texto: `cosa ${i}` }));
    const t = textoDeTope(llenas);
    expect(t).toMatch(/No lo he apuntado/);
    expect(t).toContain("[0000000");
    expect(t).toMatch(/reemplaza/);
  });
});

describe("tope lleno: lo personal de otro ni se enseña ni se quita", () => {
  const OTRO = "33333333-3333-3333-3333-333333333333";
  const casa = Array.from({ length: LIMITE_ABIERTAS - 1 }, (_, i) => ({ id: `aaaaaaa${i}-x`, texto: `casa ${i}`, scope: "casa" }));
  const ajena = { id: "bbbbbbbb-x", texto: "regalo sorpresa de Isa", scope: "personal", owner_user_id: OTRO };
  const llenas = [...casa, ajena];

  it("en grupo, el texto de una personal ajena no sale", () => {
    const t = textoDeTope(llenas, { userId: YO, privado: false });
    expect(t).not.toContain("regalo sorpresa");
    expect(t).toMatch(/otras 1 apuntadas que no puedo enseñarte/);
  });
  it("en privado, su dueño sí la ve", () => {
    expect(textoDeTope(llenas, { userId: OTRO, privado: true })).toContain("regalo sorpresa");
  });
  it("reemplazar la personal de otro se rechaza", () => {
    const d = decidirTope(llenas, "bbbbbbbb", { userId: YO, privado: true });
    expect(d.quitar).toBeUndefined();
    expect(d.texto).toMatch(/personal de otra persona/);
  });
  it("reemplazar una de la casa vale", () => {
    expect(decidirTope(llenas, "aaaaaaa0", { userId: YO, privado: false }).quitar?.id).toBe("aaaaaaa0-x");
  });
  it("un lector no quita una de la casa; la suya personal, en privado, sí", () => {
    const suya = { id: "ccccccc0-x", texto: "mis yogures", scope: "personal", owner_user_id: YO };
    const conSuya = [...casa.slice(0, LIMITE_ABIERTAS - 1), suya];
    expect(decidirTope(conSuya, "aaaaaaa0", { userId: YO, privado: true, papel: "viewer" }).texto).toMatch(/no quita cosas apuntadas para todos/);
    expect(decidirTope(conSuya, "ccccccc0", { userId: YO, privado: true, papel: "viewer" }).quitar?.id).toBe("ccccccc0-x");
    expect(decidirTope(conSuya, "aaaaaaa0", { userId: YO, privado: true, papel: "editor" }).quitar?.id).toBe("aaaaaaa0-x");
  });
  it("con sitio, cabe", () => {
    expect(decidirTope(casa, "aaaaaaa0", {}).cabe).toBe(true);
  });
});

describe("bloqueDeTareas", () => {
  it("sin tareas no añade nada", () => {
    expect(bloqueDeTareas([])).toBe("");
  });
  it("da referencia corta, para quién, quién, fecha y si viene de otro chat", () => {
    const b = bloqueDeTareas([{ id: "abcd1234-0000", kind: "seguimiento", texto: "comprar pan", para_member: "c1", asignado_member: "i1", vence: "2026-10-10", chat_id: "grupo" }], { data, chatId: "privado" });
    expect(b).toContain("[abcd1234] Seguimiento: comprar pan (para Cova; se encarga Isa; antes del 2026-10-10; se pidió en otro chat)");
    expect(b).toMatch(/pregunta cuál/);
  });
});
