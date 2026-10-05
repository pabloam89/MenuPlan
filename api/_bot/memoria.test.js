import { describe, it, expect } from "vitest";
import { montarMemoria, fechaLarga, ORDEN } from "./memoria.js";

// Como las devuelve bot_messages con ORDEN: de la más nueva a la más vieja, y
// dentro de un turno (misma hora) la respuesta (id mayor) antes que la pregunta.
const turno = (id, hora, pregunta, respuesta) => [
  { id: id + 1, role: "assistant", content: { texto: respuesta }, created_at: hora },
  { id, role: "user", content: { texto: pregunta }, created_at: hora },
];
const VIERNES = "2026-10-02T05:32:00Z";
const DOMINGO = "2026-10-04T13:24:00Z";

describe("ORDEN: la pregunta y la respuesta empatan en hora; el id desempata", () => {
  it("ordena por hora y luego por id, los dos descendentes", () => {
    expect(ORDEN).toBe("created_at.desc,id.desc");
  });
});

describe("montarMemoria", () => {
  it("cada pregunta va con SU respuesta, aunque compartan hora", () => {
    const filas = [...turno(3, DOMINGO, "¿qué comemos mañana?", "Mañana lunes: lentejas."), ...turno(1, DOMINGO, "hola", "¡Hola!")];
    const { historia } = montarMemoria(filas, "2026-10-04");
    expect(historia).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "¡Hola!" },
      { role: "user", content: "¿qué comemos mañana?" },
      { role: "assistant", content: "Mañana lunes: lentejas." },
    ]);
  });

  it("un mensaje de otro día lleva su fecha: el «mañana» del viernes no es el del domingo", () => {
    const filas = turno(1, VIERNES, "asume que mañana no comemos en casa, tenemos boda", "✅ Mañana sábado: nadie come en casa.");
    const { historia } = montarMemoria(filas, "2026-10-04");
    expect(historia[0].content).toBe("[Escrito el viernes 2 de octubre] asume que mañana no comemos en casa, tenemos boda");
    // A Lola no se le pone: la copiaría en sus respuestas.
    expect(historia[1].content).toBe("✅ Mañana sábado: nadie come en casa.");
  });

  it("lo de hoy va sin fecha", () => {
    const { historia } = montarMemoria(turno(1, DOMINGO, "hola", "¡Hola!"), "2026-10-04");
    expect(historia[0].content).toBe("hola");
  });

  it("el día es el de Madrid: las 23:30 del sábado en UTC ya es domingo en España", () => {
    const { historia } = montarMemoria(turno(1, "2026-10-03T22:30:00Z", "hola", "¡Hola!"), "2026-10-04");
    expect(historia[0].content).toBe("hola");
  });

  it("solo lo posterior a «empezar de nuevo», y las tareas de la última respuesta", () => {
    const filas = [
      ...turno(5, DOMINGO, "nuevo", "vale"),
      { id: 4, role: "assistant", content: { corte: true }, created_at: DOMINGO },
      ...turno(1, VIERNES, "viejo", "viejo"),
    ];
    filas[0].content.pendientes = [{ id: "P1" }];
    const { historia, pendientes } = montarMemoria(filas, "2026-10-04");
    expect(historia.map((t) => t.content)).toEqual(["nuevo", "vale"]);
    expect(pendientes).toEqual([{ id: "P1" }]);
  });
});

describe("fechaLarga", () => {
  it("día de la semana y mes en castellano", () => {
    expect(fechaLarga("2026-10-02")).toBe("viernes 2 de octubre");
    expect(fechaLarga("2026-10-04")).toBe("domingo 4 de octubre");
  });
});

import { recienPasadoPorDia } from "./ficha.js";

describe("recienPasadoPorDia: la ficha recuerda lo de los últimos días", () => {
  const regla = (fecha, sujeto, comidas) => ({ efecto: { valor: "fuera" }, sujeto, ambito: { comidas }, vigencia: { desde: fecha, hasta: fecha } });
  const data = {
    members: [{ id: "n1", name: "Nat" }],
    reglas: [
      regla("2026-10-03", { tipo: "casa" }, ["Comida"]),
      regla("2026-10-03", { tipo: "casa" }, ["Cena"]),
      regla("2026-10-03", { tipo: "miembro", ref: "n1" }, ["Cena"]),
      regla("2026-10-04", { tipo: "casa" }, ["Comida"]),
      regla("2026-09-20", { tipo: "casa" }, ["Comida"]),
      regla("2026-10-06", { tipo: "casa" }, ["Comida"]),
    ],
  };
  it("una línea por día, con quién y qué comida; ni lo viejo ni lo que viene", () => {
    expect(recienPasadoPorDia(data, "2026-10-05")).toEqual([
      "sáb 3 oct: fuera toda la casa (comida, cena); Nat (cena)",
      "dom 4 oct: fuera toda la casa (comida)",
    ]);
  });
  it("lo de hoy no es pasado", () => {
    expect(recienPasadoPorDia(data, "2026-10-04")).toEqual(["sáb 3 oct: fuera toda la casa (comida, cena); Nat (cena)"]);
  });
});

import { repeticionReciente } from "./menu.js";

describe("repeticionReciente: no se vuelve a guardar una orden vieja de la charla", () => {
  // Las reglas reales que guardó Lola el viernes 2.
  const guardadas = [
    { efecto: { valor: "fuera" }, sujeto: { tipo: "casa" }, ambito: { dias: ["Sáb"], comidas: ["Cena"] }, vigencia: { desde: "2026-10-03", hasta: "2026-10-03" }, creadaEn: "2026-10-02" },
    { efecto: { valor: "fuera" }, sujeto: { tipo: "casa" }, ambito: { dias: ["Dom"], comidas: ["Comida"] }, vigencia: { desde: "2026-10-04", hasta: "2026-10-04" }, creadaEn: "2026-10-02" },
  ];
  const nueva = (dia, fecha, comidas, sujeto = { tipo: "casa" }) => ({ efecto: { valor: "fuera" }, sujeto, ambito: { dias: [dia], comidas }, vigencia: { desde: fecha, hasta: fecha } });
  it("el lunes, «sábado: boda» otra vez → es la del sábado 3, no se escribe en el 10", () => {
    expect(repeticionReciente(guardadas, [nueva("Sáb", "2026-10-10", ["Comida", "Cena"])], "2026-10-05")).toEqual([{ antes: "2026-10-03", ahora: "2026-10-10" }]);
  });
  it("otro día, otra persona u otra comida no es repetición", () => {
    expect(repeticionReciente(guardadas, [nueva("Mar", "2026-10-06", ["Cena"])], "2026-10-05")).toEqual([]);
    expect(repeticionReciente(guardadas, [nueva("Sáb", "2026-10-10", ["Cena"], { tipo: "miembro", ref: "n1" })], "2026-10-05")).toEqual([]);
    expect(repeticionReciente(guardadas, [nueva("Dom", "2026-10-11", ["Cena"])], "2026-10-05")).toEqual([]);
  });
  it("pasados 3 días ya no frena: puede ser una costumbre nueva", () => {
    expect(repeticionReciente(guardadas, [nueva("Sáb", "2026-10-10", ["Cena"])], "2026-10-09")).toEqual([]);
  });
});
