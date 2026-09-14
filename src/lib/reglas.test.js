import { describe, it, expect } from "vitest";
import {
  proyectarReglas,
  aplicarReglas,
  normalizarRegla,
  normalizarReglas,
  nuevaRegla,
  reglaDeInvitado,
  reglaVigente,
  reglaTocaLaVentana,
  podarReglasVencidas,
  hastaEnDias,
  lunesDe,
  necesitaMenuPropio,
  describirRegla,
  CLASE_DE_AVISO,
  PANEL_EMITE_REGLAS,
  EFECTOS,
} from "./reglas.js";
import { slotKey, DAYS, modeForGroupSlot } from "./planner.js";
import { eatersForSlot } from "./slotEaters.js";
import { computeWeekRange, explicitDaysForOffset } from "./menuArchive.js";

// Una casa de manual: dos adultos, dos niñas, dos menús. Es el reparto con el
// que se miden los seis casos que esta capa existe para desbloquear.
const CASA = () => ({
  meals: ["Comida", "Cena"],
  members: [
    { id: "p1", name: "Pablo", age: 37, homeRole: "Papá", allergies: [], dislikes: [] },
    { id: "p2", name: "Ana", age: 36, homeRole: "Mamá", allergies: [], dislikes: [] },
    { id: "h1", name: "Lucía", age: 9, homeRole: "Hijo/a", allergies: [], dislikes: [] },
    { id: "h2", name: "Mateo", age: 7, homeRole: "Hijo/a", allergies: [], dislikes: [] },
  ],
  groups: [
    { id: "g_ad", label: "Adultos", memberIds: ["p1", "p2"], color: "#2d5a3d" },
    { id: "g_ni", label: "Niños", memberIds: ["h1", "h2"], color: "#c67030" },
  ],
  schedule: {},
  excluidos: [],
  sesgos: {},
  cocinas: {},
});

const HOY = "2026-09-11";           // un viernes
const LUNES = lunesDe(HOY);         // "2026-09-07"
const DOMINGO = "2026-09-13";
// Una ventana completa, como la que trae `weekMeta[w]` en la generación real.
const ctx = (extra = {}) => ({
  hoy: HOY,
  semana: { inicioISO: LUNES, finISO: DOMINGO, dias: [...DAYS] },
  ...extra,
});
// La forma vieja, sin `finISO`: el camino de compatibilidad que cae a "hoy".
const ctxSinVentana = (extra = {}) => ({ hoy: HOY, semana: { inicioISO: LUNES }, ...extra });

/** Hoy de verdad, para los tests que usan el calendario real. */
const hoyReal = () => hastaEnDias(0);

/** Congela un objeto entero, para probar que la proyección no lo toca. */
function congelar(x) {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) congelar(v);
  }
  return x;
}

// ═══ Caso 1 — «Mi hija no come pescado» ══════════════════════════════════════

describe("caso 1: mi hija no come pescado", () => {
  const regla = nuevaRegla({
    sujeto: { tipo: "miembro", ref: "h1" },
    efecto: { tipo: "excluir", valor: "pescado" },
    origen: "panel",
    frase: "mi hija no come pescado",
    hoy: HOY,
  });

  it("escribe el dislike en ELLA, no en la casa", () => {
    const { delta } = proyectarReglas([regla], CASA(), ctx());
    expect(delta.members.find((m) => m.id === "h1").dislikes).toEqual(["pescado"]);
    expect(delta.excluidos).toBeUndefined();
  });

  it("no toca a nadie más de la casa", () => {
    const { delta } = proyectarReglas([regla], CASA(), ctx());
    for (const otro of ["p1", "p2", "h2"]) {
      expect(delta.members.find((m) => m.id === otro).dislikes).toEqual([]);
    }
  });

  it("no muta el `data` que recibe", () => {
    const data = CASA();
    proyectarReglas([regla], data, ctx());
    expect(data.members.find((m) => m.id === "h1").dislikes).toEqual([]);
  });

  // T14 — lo que esta v1 NO puede, dicho en voz alta: aiPlanner agrega los
  // dislikes por GRUPO, así que Mateo se queda sin pescado también.
  it("T14 — avisa nombrando a quién arrastra, y aun así aplica la regla", () => {
    const { avisos, aplicadas } = proyectarReglas([regla], CASA(), ctx());
    expect(aplicadas).toEqual([regla.id]);
    const arrastre = avisos.find((a) => a.motivo === "ambito_ignorado");
    expect(arrastre.detalle).toContain("Mateo");
    expect(arrastre.clase).toBe("de_mas");
  });

  it("necesitaMenuPropio identifica el arrastre", () => {
    const arrastre = necesitaMenuPropio(regla, CASA());
    expect(arrastre.miembro.name).toBe("Lucía");
    expect(arrastre.grupo.label).toBe("Niños");
    expect(arrastre.arrastra.map((m) => m.name)).toEqual(["Mateo"]);
  });

  it("no avisa cuando ella ya come sola", () => {
    const data = CASA();
    data.groups = [
      { id: "g_ad", label: "Adultos", memberIds: ["p1", "p2", "h2"] },
      { id: "g_lu", label: "Dieta blanda", memberIds: ["h1"], adHoc: true },
    ];
    expect(necesitaMenuPropio(regla, data)).toBeNull();
    expect(proyectarReglas([regla], data, ctx()).avisos).toEqual([]);
  });
});

// ═══ Caso 2 — «Los miércoles come mi tío en casa» ════════════════════════════

describe("caso 2: los miércoles come mi tío en casa", () => {
  const regla = nuevaRegla({
    sujeto: { tipo: "invitado", nombre: "Mi tío" },
    ambito: { dias: ["Mié"], comidas: ["Comida"] },
    efecto: { tipo: "presente", valor: "casa" },
    origen: "panel",
    hoy: HOY,
  });

  it("lo materializa como una persona marcada invitado", () => {
    const { delta } = proyectarReglas([regla], CASA(), ctx());
    const tio = delta.members.find((m) => m.invitado);
    expect(tio.name).toBe("Mi tío");
    expect(tio.reglaId).toBe(regla.id);
    expect(tio.allergies).toEqual([]);
  });

  it("lo sienta en el menú de los adultos, no en el de los niños", () => {
    const { delta } = proyectarReglas([regla], CASA(), ctx());
    expect(delta.groups.find((g) => g.label === "Adultos").memberIds).toContain(regla.sujeto.ref);
    expect(delta.groups.find((g) => g.label === "Niños").memberIds).not.toContain(regla.sujeto.ref);
  });

  it("está en casa el miércoles a comer y fuera en los otros 13 huecos", () => {
    const { delta } = proyectarReglas([regla], CASA(), ctx());
    const id = regla.sujeto.ref;
    expect(delta.schedule[slotKey(id, "Mié", "Comida")]).toBe("casa");
    expect(delta.schedule[slotKey(id, "Mié", "Cena")]).toBe("fuera");
    for (const dia of DAYS.filter((d) => d !== "Mié")) {
      expect(delta.schedule[slotKey(id, dia, "Comida")]).toBe("fuera");
    }
  });

  // La prueba que justifica la decisión de diseño: al ser un miembro más con
  // horario, el contador de comensales que ya existe lo cuenta solo.
  it("el contador de comensales de siempre lo cuenta sin cambios", () => {
    const { data } = aplicarReglas({ ...CASA(), reglas: [regla] }, ctx());
    const adultos = data.groups.find((g) => g.label === "Adultos");
    expect(eatersForSlot(adultos, data.members, data.schedule, "Mié", "Comida").length).toBe(3);
    expect(eatersForSlot(adultos, data.members, data.schedule, "Jue", "Comida").length).toBe(2);
  });

  it("T8 — proyectar dos veces no crea dos tíos", () => {
    const una = aplicarReglas({ ...CASA(), reglas: [regla] }, ctx());
    const dos = aplicarReglas({ ...una.data, reglas: [regla] }, ctx());
    expect(dos.data.members.filter((m) => m.invitado).length).toBe(1);
    expect(dos.data.members.length).toBe(una.data.members.length);
    expect(dos.data.groups.find((g) => g.label === "Adultos").memberIds)
      .toEqual(una.data.groups.find((g) => g.label === "Adultos").memberIds);
  });

  // Sin `hasta`, una regla de día se repite por construcción.
  it("sigue valiendo la semana que viene sin decir nada de recurrencia", () => {
    const { delta } = proyectarReglas([regla], CASA(), {
      hoy: "2026-09-16",
      semana: { inicioISO: "2026-09-14", finISO: "2026-09-20", dias: [...DAYS] },
    });
    expect(delta.schedule[slotKey(regla.sujeto.ref, "Mié", "Comida")]).toBe("casa");
  });

  // T6 — el blanqueo va sobre TODAS las comidas que se renderizan, no solo las
  // que se planifican. Una clave que falta la lee el motor como "casa".
  it("T6 — una visita no fuerza a cocinar el desayuno de un día en que no hay nadie", () => {
    const data = CASA();
    data.extraMeals = { desayuno: "variado" };
    // El jueves la casa entera desayuna fuera.
    for (const m of data.members) data.schedule[slotKey(m.id, "Jue", "Desayuno")] = "fuera";
    const { data: conReglas } = aplicarReglas({ ...data, reglas: [regla] }, ctx());
    const adultos = conReglas.groups.find((g) => g.label === "Adultos");
    const modo = modeForGroupSlot(adultos, conReglas.members, conReglas.schedule, "Jue", "Desayuno");
    expect(modo.cook).toBe(false);
  });

  // T12 — ámbito vacío significa TODO, también en el eje de las comidas.
  it("T12 — `dias` sin `comidas` escribe el día entero", () => {
    const sabado = nuevaRegla({
      sujeto: { tipo: "invitado", nombre: "Mi hermano" },
      ambito: { dias: ["Sáb"] },
      efecto: { tipo: "presente", valor: "casa" },
      hoy: HOY,
    });
    const { delta } = proyectarReglas([sabado], CASA(), ctx());
    const id = sabado.sujeto.ref;
    expect(delta.schedule[slotKey(id, "Sáb", "Comida")]).toBe("casa");
    expect(delta.schedule[slotKey(id, "Sáb", "Cena")]).toBe("casa");
  });

  // T10 — las dos pasadas: el orden del array deja de importar.
  it("T10 — una exclusión sobre el invitado funciona aunque vaya ANTES que su presencia", () => {
    const presencia = normalizarRegla({
      id: "rB",
      sujeto: { tipo: "invitado", nombre: "Mi tío" },
      ambito: { dias: ["Mié"] },
      efecto: { tipo: "presente", valor: "casa" },
    });
    const exclusion = normalizarRegla({
      id: "rA",
      sujeto: { tipo: "invitado", ref: "inv_rB" },
      efecto: { tipo: "excluir", valor: "marisco" },
    });
    const { delta, aplicadas } = proyectarReglas([exclusion, presencia], CASA(), ctx());
    expect(aplicadas).toContain("rA");
    expect(delta.members.find((m) => m.id === "inv_rB").dislikes).toEqual(["marisco"]);
  });
});

// ═══ Caso 3 — «Esta semana somos dos más el sábado» ══════════════════════════

describe("caso 3: esta semana somos dos más el sábado", () => {
  const regla = nuevaRegla({
    sujeto: { tipo: "invitado", n: 2 },
    ambito: { dias: ["Sáb"], semanas: [LUNES] },
    efecto: { tipo: "presente", valor: "casa" },
    hoy: HOY,
  });

  it("añade dos personas, no un número suelto", () => {
    const { data } = aplicarReglas({ ...CASA(), reglas: [regla] }, ctx());
    expect(data.members.filter((m) => m.invitado).map((m) => m.name))
      .toEqual(["Invitado 1", "Invitado 2"]);
  });

  it("sube los comensales del sábado a cuatro y deja el viernes en dos", () => {
    const { data } = aplicarReglas({ ...CASA(), reglas: [regla] }, ctx());
    const adultos = data.groups.find((g) => g.label === "Adultos");
    expect(eatersForSlot(adultos, data.members, data.schedule, "Sáb", "Comida").length).toBe(4);
    expect(eatersForSlot(adultos, data.members, data.schedule, "Vie", "Comida").length).toBe(2);
  });

  it("no aparece en otra semana, y ahí no avisa de nada", () => {
    const { delta, avisos, aplicadas } = proyectarReglas([regla], CASA(), {
      hoy: "2026-09-16",
      semana: { inicioISO: "2026-09-14", finISO: "2026-09-20", dias: [...DAYS] },
    });
    expect(aplicadas).toEqual([]);
    expect(avisos).toEqual([]);
    expect(delta.members).toBeUndefined();
  });

  it("si no se sabe qué semana es, no se aplica — y eso SÍ se avisa", () => {
    const { avisos, aplicadas } = proyectarReglas([regla], CASA(), { hoy: HOY });
    expect(aplicadas).toEqual([]);
    expect(avisos[0].motivo).toBe("no_soportado");
    expect(avisos[0].clase).toBe("no_hecho");
  });

  // ── T1/T2: el `startISO` de verdad NO es el lunes ──────────────────────────
  it("T1 — una semana que empieza en jueves se reconoce a sí misma", () => {
    // computeWeekRange de verdad, con startDayIdx=3: el primer día activo es
    // el jueves, así que startISO NO es el lunes. Antes de normalizar con
    // lunesDe(), la regla no se aplicaba nunca fuera del lunes.
    const { startISO, endISO, activeDays } = computeWeekRange(0, 3);
    expect(activeDays[0]).toBe("Jue");
    expect(startISO).not.toBe(lunesDe(startISO));

    const estaSemana = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { semanas: [lunesDe(hoyReal())] },
      efecto: { tipo: "sesgo", valor: { campo: "tecnica", valor: "horno", peso: 1 } },
      hoy: hoyReal(),
    });
    const { aplicadas } = proyectarReglas([estaSemana], CASA(), {
      hoy: hoyReal(),
      semana: { inicioISO: startISO, finISO: endISO, dias: activeDays },
    });
    expect(aplicadas).toEqual([estaSemana.id]);
  });

  it("T2 — y también una selección manual de días sueltos no contiguos", () => {
    const data = { ...CASA(), menuWeekDays: { 0: ["Mar", "Jue"] } };
    const dias = explicitDaysForOffset(data, 0);
    const { startISO, endISO, activeDays } = computeWeekRange(0, 0, dias);
    expect(activeDays).toEqual(["Mar", "Jue"]);

    const estaSemana = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { semanas: [lunesDe(hoyReal())] },
      efecto: { tipo: "sesgo", valor: { campo: "tecnica", valor: "horno", peso: 1 } },
      hoy: hoyReal(),
    });
    const { aplicadas } = proyectarReglas([estaSemana], data, {
      hoy: hoyReal(),
      semana: { inicioISO: startISO, finISO: endISO, dias: activeDays },
    });
    expect(aplicadas).toEqual([estaSemana.id]);
  });
});

// ═══ Caso 4 — «Hasta que acabe el tratamiento, sin picante» ══════════════════

describe("caso 4: hasta que acabe el tratamiento, sin picante", () => {
  const regla = nuevaRegla({
    sujeto: { tipo: "casa" },
    efecto: { tipo: "excluir", valor: "picante" },
    vigencia: { hasta: "2026-09-30" },
    origen: "panel",
    frase: "hasta que acabe el tratamiento, sin picante",
    hoy: HOY,
  });

  it("mientras vale, entra por el mismo sitio que la libreta", () => {
    const { delta } = proyectarReglas([regla], CASA(), ctx());
    expect(delta.excluidos).toEqual(["picante"]);
  });

  it("no se duplica sobre lo que ya excluía la libreta", () => {
    const data = { ...CASA(), excluidos: ["picante", "cilantro"] };
    expect(proyectarReglas([regla], data, ctx()).delta.excluidos).toBeUndefined();
  });

  it("pasado el día no se aplica, sin avisar de nada", () => {
    const { delta, avisos } = proyectarReglas([regla], CASA(), {
      hoy: "2026-10-05",
      semana: { inicioISO: "2026-10-05", finISO: "2026-10-11", dias: [...DAYS] },
    });
    expect(delta.excluidos).toBeUndefined();
    expect(avisos).toEqual([]);
  });

  it("y se puede purgar, como los menús individuales", () => {
    expect(podarReglasVencidas([regla], HOY).vencidas).toEqual([]);
    const muerta = podarReglasVencidas([regla], "2026-10-01");
    expect(muerta.reglas).toEqual([]);
    expect(muerta.vencidas).toEqual([regla]);
  });

  it("una regla que aún no ha empezado espera, no se purga", () => {
    const futura = nuevaRegla({
      sujeto: { tipo: "casa" },
      efecto: { tipo: "excluir", valor: "marisco" },
      vigencia: { desde: "2026-12-24", hasta: "2026-12-26" },
      hoy: HOY,
    });
    expect(reglaVigente(futura, HOY)).toBe(false);
    expect(podarReglasVencidas([futura], HOY).reglas).toEqual([futura]);
  });

  it("T11 — el último día cuenta; el siguiente no", () => {
    expect(reglaVigente(regla, "2026-09-30")).toBe(true);
    expect(reglaVigente(regla, "2026-10-01")).toBe(false);
    const ultimo = { inicioISO: "2026-09-28", finISO: "2026-10-04" };
    expect(reglaTocaLaVentana(regla, ultimo, HOY)).toBe("parcial");
    const siguiente = { inicioISO: "2026-10-01", finISO: "2026-10-07" };
    expect(reglaTocaLaVentana(regla, siguiente, HOY)).toBe("no");
  });

  it("hastaEnDias cuenta días sin librería de fechas", () => {
    expect(hastaEnDias(3, "2026-09-29")).toBe("2026-10-02");
    expect(hastaEnDias(1, "2026-12-31")).toBe("2027-01-01");
  });

  it("T15 — una vigencia al revés no llega a existir", () => {
    expect(normalizarRegla({
      id: "x",
      sujeto: { tipo: "casa" },
      efecto: { tipo: "excluir", valor: "picante" },
      vigencia: { desde: "2026-09-30", hasta: "2026-09-03" },
    })).toBeNull();
    // La misma ventana, del derecho, sí vale.
    expect(normalizarRegla({
      id: "x",
      sujeto: { tipo: "casa" },
      efecto: { tipo: "excluir", valor: "picante" },
      vigencia: { desde: "2026-09-03", hasta: "2026-09-30" },
    })).not.toBeNull();
  });
});

// ═══ La vigencia se mide contra la SEMANA, no contra "hoy" ═══════════════════

describe("cuatro semanas de golpe, cada una con su propia ventana", () => {
  // El fallo que esto arregla: `menuWeekOffsets` genera hasta cuatro semanas y
  // todas se evaluaban contra el MISMO "hoy". Una regla "hasta el viernes" se
  // aplicaba a las cuatro; una "desde Navidad", a ninguna. Las dos en silencio.
  const cuatroSemanas = () =>
    [0, 1, 2, 3].map((offset) => {
      const { startISO, endISO, activeDays } = computeWeekRange(offset, 0);
      return { inicioISO: startISO, finISO: endISO, dias: activeDays };
    });

  const sesgoCasa = (vigencia) =>
    nuevaRegla({
      sujeto: { tipo: "casa" },
      vigencia,
      efecto: { tipo: "sesgo", valor: { campo: "tecnica", valor: "horno", peso: 1 } },
      hoy: hoyReal(),
    });

  it("T3 — un `hasta` dentro de la primera semana solo alcanza a la primera", () => {
    const semanas = cuatroSemanas();
    const regla = sesgoCasa({ hasta: semanas[0].finISO });
    const aplicada = semanas.map(
      (semana) => proyectarReglas([regla], CASA(), { hoy: hoyReal(), semana }).aplicadas.length,
    );
    expect(aplicada).toEqual([1, 0, 0, 0]);
  });

  it("T4 — un `desde` dentro de la tercera solo alcanza de la tercera en adelante", () => {
    const semanas = cuatroSemanas();
    const regla = sesgoCasa({ desde: semanas[2].inicioISO });
    const aplicada = semanas.map(
      (semana) => proyectarReglas([regla], CASA(), { hoy: hoyReal(), semana }).aplicadas.length,
    );
    expect(aplicada).toEqual([0, 0, 1, 1]);
  });

  it("un solape parcial aplica el sesgo entero y lo dice", () => {
    const semanas = cuatroSemanas();
    // Acaba a mitad de la primera semana: el eje `sesgos` no sabe de días.
    const regla = sesgoCasa({ hasta: hastaEnDias(3, semanas[0].inicioISO) });
    const { aplicadas, avisos } = proyectarReglas([regla], CASA(), {
      hoy: hoyReal(),
      semana: semanas[0],
    });
    expect(aplicadas).toEqual([regla.id]);
    expect(avisos.some((a) => a.detalle?.includes("parte de la semana"))).toBe(true);
  });

  it("T5 — una presencia con solape parcial SÍ se recorta por día", () => {
    const { startISO, endISO, activeDays } = computeWeekRange(1, 0);
    const miercoles = hastaEnDias(2, startISO);
    const regla = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "p1" },
      ambito: { comidas: ["Comida"] },
      vigencia: { desde: miercoles },
      efecto: { tipo: "presente", valor: "fuera" },
      hoy: hoyReal(),
    });
    const { delta, avisos } = proyectarReglas([regla], CASA(), {
      hoy: hoyReal(),
      semana: { inicioISO: startISO, finISO: endISO, dias: activeDays },
    });
    // Lunes y martes caen fuera de la vigencia: no se escriben.
    expect(delta.schedule[slotKey("p1", "Lun", "Comida")]).toBeUndefined();
    expect(delta.schedule[slotKey("p1", "Mar", "Comida")]).toBeUndefined();
    for (const dia of ["Mié", "Jue", "Vie", "Sáb", "Dom"]) {
      expect(delta.schedule[slotKey("p1", dia, "Comida")]).toBe("fuera");
    }
    // Y no hay aviso: aquí no se ha aplicado nada de más.
    expect(avisos).toEqual([]);
  });

  it("sin ventana, cae a la vigencia de hoy (compatibilidad)", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      efecto: { tipo: "excluir", valor: "picante" },
      vigencia: { hasta: HOY },
      hoy: HOY,
    });
    expect(proyectarReglas([regla], CASA(), ctxSinVentana()).aplicadas).toEqual([regla.id]);
    expect(reglaTocaLaVentana(regla, {}, "2026-09-12")).toBe("no");
  });
});

// ═══ Caso 5 — «Nada de fritos, salvo los viernes» ════════════════════════════

describe("caso 5: nada de fritos, salvo los viernes", () => {
  const regla = nuevaRegla({
    sujeto: { tipo: "casa" },
    efecto: { tipo: "sesgo", valor: { campo: "tecnica", valor: "sarten", peso: -1 } },
    salvedad: { dias: ["Vie"] },
    hoy: HOY,
  });

  it("se aplica a la semana entera: es más estricto, nunca menos", () => {
    expect(proyectarReglas([regla], CASA(), ctx()).delta.sesgos.tecnica.sarten).toBe(-1);
  });

  it("y dice que la excepción del viernes se ha perdido", () => {
    const { avisos } = proyectarReglas([regla], CASA(), ctx());
    expect(avisos).toEqual([{
      reglaId: regla.id,
      motivo: "salvedad_ignorada",
      clase: "de_mas",
      detalle: "se aplica también en la excepción",
    }]);
  });

  it("un sesgo por persona no se aplica a toda la casa: no se aplica y punto", () => {
    const porPersona = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "h1" },
      efecto: { tipo: "sesgo", valor: { campo: "tecnica", valor: "horno", peso: 1 } },
      hoy: HOY,
    });
    const { delta, avisos, aplicadas } = proyectarReglas([porPersona], CASA(), ctx());
    expect(aplicadas).toEqual([]);
    expect(delta.sesgos).toBeUndefined();
    expect(avisos[0].motivo).toBe("no_soportado");
  });

  it("una cocina pasa además por la puerta de data.cocinas", () => {
    const mex = nuevaRegla({
      sujeto: { tipo: "casa" },
      efecto: { tipo: "sesgo", valor: { campo: "cocina", valor: "mexicana", peso: 2 } },
      hoy: HOY,
    });
    const { delta } = proyectarReglas([mex], CASA(), ctx());
    expect(delta.cocinas.mexicana).toBe(2);
    expect(delta.sesgos.cocina.mexicana).toBe(2);
  });
});

// ═══ Caso 6 — «Batch cooking solo esta semana» ═══════════════════════════════

describe("caso 6: batch cooking solo esta semana", () => {
  const regla = nuevaRegla({
    sujeto: { tipo: "casa" },
    ambito: { semanas: [LUNES] },
    efecto: { tipo: "sesgo", valor: { campo: "esfuerzo", valor: "elaborado", peso: 1 } },
    hoy: HOY,
  });

  it("solo escribe en la semana que se pidió", () => {
    expect(proyectarReglas([regla], CASA(), ctx()).delta.sesgos.esfuerzo.elaborado).toBe(1);
    const otra = proyectarReglas([regla], CASA(), {
      hoy: HOY,
      semana: { inicioISO: "2026-09-14", finISO: "2026-09-20", dias: [...DAYS] },
    });
    expect(otra.delta.sesgos).toBeUndefined();
  });

  it("acotar por semanas no cuenta como recortar el ámbito: no avisa de más", () => {
    expect(proyectarReglas([regla], CASA(), ctx()).avisos).toEqual([]);
  });
});

// ═══ Las barreras ════════════════════════════════════════════════════════════

describe("una regla no puede degradarse a «toda la casa»", () => {
  it("sin sujeto no es una regla", () => {
    expect(normalizarRegla({ id: "x", efecto: { tipo: "excluir", valor: "pescado" } })).toBeNull();
  });

  it("un sujeto miembro sin ref no es un sujeto", () => {
    expect(normalizarRegla({
      id: "x",
      sujeto: { tipo: "miembro" },
      efecto: { tipo: "excluir", valor: "pescado" },
    })).toBeNull();
  });

  it("un miembro que ya no existe avisa; no cae a la casa", () => {
    const fantasma = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "borrado" },
      efecto: { tipo: "excluir", valor: "pescado" },
      hoy: HOY,
    });
    const { delta, avisos, aplicadas } = proyectarReglas([fantasma], CASA(), ctx());
    expect(aplicadas).toEqual([]);
    expect(delta.excluidos).toBeUndefined();
    expect(delta.members).toBeUndefined();
    expect(avisos[0].motivo).toBe("sujeto_desconocido");
    expect(avisos[0].clase).toBe("no_hecho");
  });

  it("T13 — una presencia sobre un menú sin nadie no cuenta como aplicada", () => {
    const data = CASA();
    data.groups.push({ id: "g_vacio", label: "Vacío", memberIds: [] });
    const regla = nuevaRegla({
      sujeto: { tipo: "grupo", ref: "g_vacio" },
      efecto: { tipo: "presente", valor: "fuera" },
      hoy: HOY,
    });
    const { delta, avisos, aplicadas } = proyectarReglas([regla], data, ctx());
    expect(aplicadas).toEqual([]);
    expect(delta.schedule).toBeUndefined();
    expect(avisos[0].motivo).toBe("sujeto_desconocido");
  });

  it("una regla rota se tira entera, no se arregla a medias", () => {
    expect(normalizarReglas([
      { id: "a", sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "" } },
      { id: "b", sujeto: { tipo: "casa" }, efecto: { tipo: "presente", valor: "teletransporte" } },
      { id: "c", sujeto: { tipo: "casa" }, efecto: { tipo: "sesgo", valor: { campo: "freqs", valor: "carne", peso: 1 } } },
      { id: "d", sujeto: { tipo: "casa" }, efecto: { tipo: "sesgo", valor: { campo: "cocina", valor: "marciana", peso: 1 } } },
    ])).toEqual([]);
  });

  it("no existe un efecto que toque alergias", () => {
    expect(EFECTOS).toEqual(["excluir", "presente", "sesgo"]);
    expect(normalizarRegla({
      id: "x",
      sujeto: { tipo: "miembro", ref: "h1" },
      efecto: { tipo: "alergia", valor: "gluten" },
    })).toBeNull();
  });

  it("invariante 6: ninguna regla escribe en member.allergies", () => {
    const reglas = [
      nuevaRegla({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "picante" }, hoy: HOY }),
      nuevaRegla({ sujeto: { tipo: "miembro", ref: "h1" }, efecto: { tipo: "excluir", valor: "pescado" }, hoy: HOY }),
      nuevaRegla({ sujeto: { tipo: "invitado", nombre: "Tía" }, efecto: { tipo: "presente", valor: "casa" }, hoy: HOY }),
    ];
    const { delta } = proyectarReglas(reglas, CASA(), ctx());
    for (const m of delta.members) expect(m.allergies).toEqual([]);
  });

  it("el panel todavía no emite reglas, y la bandera lo dice", () => {
    expect(PANEL_EMITE_REGLAS).toBe(false);
  });

  it("todo motivo de aviso tiene su clase", () => {
    expect(Object.values(CLASE_DE_AVISO).every((c) => c === "de_mas" || c === "no_hecho")).toBe(true);
  });
});

// ═══ Las invariantes de la proyección ════════════════════════════════════════

describe("la proyección es un delta, no una reescritura", () => {
  it("T9 — invariante 1: pura, incluso con data y reglas congelados", () => {
    const data = congelar({ ...CASA(), extraMeals: { desayuno: "variado" } });
    const reglas = congelar([
      nuevaRegla({ sujeto: { tipo: "invitado", nombre: "Tía", n: 2 }, ambito: { dias: ["Sáb"] }, efecto: { tipo: "presente", valor: "casa" }, hoy: HOY }),
      nuevaRegla({ sujeto: { tipo: "miembro", ref: "h1" }, efecto: { tipo: "excluir", valor: "pescado" }, hoy: HOY }),
      nuevaRegla({ sujeto: { tipo: "casa" }, efecto: { tipo: "sesgo", valor: { campo: "salsa", valor: "si", peso: 1 } }, hoy: HOY }),
    ]);
    const contexto = congelar(ctx());
    expect(() => proyectarReglas(reglas, data, contexto)).not.toThrow();
    const { delta } = proyectarReglas(reglas, data, contexto);
    expect(delta.members.length).toBe(6);
    expect(data.members.length).toBe(4);
    expect(data.schedule).toEqual({});
  });

  it("invariante 4: no se escribe ni un hueco fuera de ctx.semana.dias", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "invitado", nombre: "Tía" },
      efecto: { tipo: "presente", valor: "casa" },
      hoy: HOY,
    });
    const { delta } = proyectarReglas([regla], CASA(), {
      hoy: HOY,
      semana: { inicioISO: LUNES, finISO: "2026-09-08", dias: ["Lun", "Mar"] },
    });
    const diasEscritos = new Set(Object.keys(delta.schedule).map((k) => k.split("|")[1]));
    expect([...diasEscritos].sort()).toEqual(["Lun", "Mar"]);
  });

  it("invariante 7: el invitado solo existe en el delta, marcado", () => {
    const data = CASA();
    const regla = nuevaRegla({
      sujeto: { tipo: "invitado", nombre: "Tía" },
      efecto: { tipo: "presente", valor: "casa" },
      hoy: HOY,
    });
    const { delta } = proyectarReglas([regla], data, ctx());
    expect(data.members.some((m) => m.invitado)).toBe(false);
    const invitada = delta.members.find((m) => m.invitado);
    expect(invitada.reglaId).toBe(regla.id);
  });

  it("sin reglas no devuelve nada que escribir", () => {
    const { delta, avisos, aplicadas } = proyectarReglas([], CASA(), ctx());
    expect(delta).toEqual({});
    expect(avisos).toEqual([]);
    expect(aplicadas).toEqual([]);
  });

  it("aplicarReglas deja intacto todo lo que ninguna regla toca", () => {
    const casa = { ...CASA(), reglas: [], freqs: { carne: 3 } };
    const { data } = aplicarReglas(casa, ctx());
    expect(data.freqs).toEqual({ carne: 3 });
    expect(data.schedule).toBe(casa.schedule);
  });

  // T7 — la composición real de App.jsx: el delta se aplica sobre el weekData
  // (con su override de horario), no sobre el `data` global.
  it("T7 — sobre un weekData con override de semana, el override sobrevive", () => {
    const working = {
      ...CASA(),
      schedule: { [slotKey("p1", "Lun", "Comida")]: "casa" },
      menuWeekOverrides: {
        1: { [slotKey("p1", "Lun", "Comida")]: "fuera", [slotKey("p2", "Lun", "Comida")]: "tupper" },
      },
    };
    const groups = working.groups.map((g) => ({ ...g }));
    const weekSchedule = working.menuWeekOverrides[1];
    const weekData = { ...working, groups, schedule: weekSchedule };

    const regla = nuevaRegla({
      sujeto: { tipo: "invitado", nombre: "Mi tío" },
      ambito: { dias: ["Mié"] },
      efecto: { tipo: "presente", valor: "casa" },
      hoy: HOY,
    });
    const { delta } = proyectarReglas([regla], weekData, ctx());
    const conReglas = { ...weekData, ...delta };

    // El override de ESA semana sigue ahí, no el schedule global.
    expect(conReglas.schedule[slotKey("p1", "Lun", "Comida")]).toBe("fuera");
    expect(conReglas.schedule[slotKey("p2", "Lun", "Comida")]).toBe("tupper");
    // Y el invitado sale en el delta de grupos, no perdido sin menú.
    expect(delta.groups.find((g) => g.label === "Adultos").memberIds).toContain(regla.sujeto.ref);
    expect(eatersForSlot(
      conReglas.groups.find((g) => g.label === "Adultos"),
      conReglas.members, conReglas.schedule, "Mié", "Comida",
    ).length).toBe(3);
  });

  it("lunesDe nombra la semana por su lunes", () => {
    expect(lunesDe("2026-09-07")).toBe("2026-09-07"); // lunes
    expect(lunesDe("2026-09-13")).toBe("2026-09-07"); // domingo
    expect(lunesDe("2026-09-14")).toBe("2026-09-14"); // lunes siguiente
  });
});

describe("el recibo que lee el usuario", () => {
  it("nombra a la persona por su ficha, no por un texto guardado", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "h1" },
      efecto: { tipo: "excluir", valor: "pescado" },
      hoy: HOY,
    });
    const data = CASA();
    expect(describirRegla(regla, data)).toBe("Lucía sin pescado");
    data.members[2].name = "Lucía Mª";
    expect(describirRegla(regla, data)).toBe("Lucía Mª sin pescado");
  });

  it("dice el día, la excepción y la caducidad", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { dias: ["Lun", "Mar"] },
      salvedad: { dias: ["Vie"] },
      vigencia: { hasta: "2026-09-30" },
      efecto: { tipo: "excluir", valor: "fritos" },
      hoy: HOY,
    });
    expect(describirRegla(regla, CASA())).toBe(
      "En casa sin fritos los Lun, Mar salvo los Vie hasta el 2026-09-30",
    );
  });
});

describe("el ámbito por día se aplica de más, y lo dice", () => {
  it("una exclusión con días avisa de que alcanza toda la semana", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { dias: ["Lun"] },
      efecto: { tipo: "excluir", valor: "fritos" },
      hoy: HOY,
    });
    const { delta, avisos } = proyectarReglas([regla], CASA(), ctx());
    expect(delta.excluidos).toEqual(["fritos"]);
    expect(avisos[0].motivo).toBe("ambito_ignorado");
    expect(avisos[0].clase).toBe("de_mas");
  });

  it("pero la presencia SÍ sabe de días: ahí no hay aviso", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "p1" },
      ambito: { dias: ["Jue"], comidas: ["Comida"] },
      efecto: { tipo: "presente", valor: "fuera" },
      hoy: HOY,
    });
    const { delta, avisos } = proyectarReglas([regla], CASA(), ctx());
    expect(avisos).toEqual([]);
    expect(delta.schedule[slotKey("p1", "Jue", "Comida")]).toBe("fuera");
    expect(delta.schedule[slotKey("p1", "Jue", "Cena")]).toBeUndefined();
  });

  it("y la salvedad de una presencia se resta de verdad", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "p1" },
      ambito: { comidas: ["Comida"] },
      salvedad: { dias: ["Vie"] },
      efecto: { tipo: "presente", valor: "tupper" },
      hoy: HOY,
    });
    const { delta, avisos } = proyectarReglas([regla], CASA(), ctx());
    expect(avisos).toEqual([]);
    expect(delta.schedule[slotKey("p1", "Jue", "Comida")]).toBe("tupper");
    expect(delta.schedule[slotKey("p1", "Vie", "Comida")]).toBeUndefined();
  });
});

// ═══ Anotaciones del cierre del paso 4 ═══════════════════════════════════════

describe("N1 — el contrato de `ctx.semana` tiene un solo nombre", () => {
  // Antes se aceptaban los dos juegos de claves con `??`. Un alias así es un
  // contrato que se calla: quien pasara `weekMeta[w]` crudo creyendo pasar
  // otra cosa vería que "funciona" y nadie se enteraría nunca.
  it("traducido se aplica; crudo no se aplica, y además lo dice", () => {
    const { startISO, endISO, activeDays } = computeWeekRange(1, 0);
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { semanas: [lunesDe(startISO)] },
      efecto: { tipo: "sesgo", valor: { campo: "tecnica", valor: "horno", peso: 1 } },
      hoy: hoyReal(),
    });

    const traducido = proyectarReglas([regla], CASA(), {
      hoy: hoyReal(),
      semana: { inicioISO: startISO, finISO: endISO, dias: activeDays },
    });
    expect(traducido.aplicadas).toEqual([regla.id]);

    const crudo = proyectarReglas([regla], CASA(), {
      hoy: hoyReal(),
      semana: { startISO, endISO, activeDays },
    });
    expect(crudo.aplicadas).toEqual([]);
    expect(crudo.avisos[0].motivo).toBe("no_soportado");
  });

  it("y `reglaTocaLaVentana` con las claves de weekMeta cae a «hoy», no a la semana", () => {
    const { startISO, endISO } = computeWeekRange(2, 0);
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      efecto: { tipo: "excluir", valor: "picante" },
      vigencia: { hasta: hoyReal() },
      hoy: hoyReal(),
    });
    // Con los nombres buenos: dentro de dos semanas ya no vale.
    expect(reglaTocaLaVentana(regla, { inicioISO: startISO, finISO: endISO }, hoyReal())).toBe("no");
    // Con los de weekMeta: no hay ventana que valga, así que cae a hoy — y hoy
    // sí vale. Ese "total" silencioso es justo lo que el alias escondía.
    expect(reglaTocaLaVentana(regla, { startISO, endISO }, hoyReal())).toBe("total");
  });
});

describe("N2 — una regla vencida todavía cubre los días pasados de la semana en curso", () => {
  // Correcto por diseño. `podarReglasVencidas` contesta "¿sigue puesta?" y
  // `reglaTocaLaVentana` contesta "¿cubre algún día de los que planifico?".
  // Cortar además por hoy haría que el menú dependiera del día en que se
  // pulsa el botón, que es un fallo que no se puede ni explicar ni reproducir.
  const SEMANA = { inicioISO: "2026-09-07", finISO: "2026-09-13", dias: [...DAYS] };
  const regla = nuevaRegla({
    sujeto: { tipo: "casa" },
    efecto: { tipo: "excluir", valor: "picante" },
    vigencia: { hasta: "2026-09-09" },
    hoy: "2026-09-07",
  });

  it("la poda dice que ya no está puesta", () => {
    expect(reglaVigente(regla, "2026-09-11")).toBe(false);
    expect(podarReglasVencidas([regla], "2026-09-11").vencidas).toEqual([regla]);
  });

  it("y aun así se aplica a esa semana, se regenere el lunes o el viernes", () => {
    expect(reglaTocaLaVentana(regla, SEMANA, "2026-09-11")).toBe("parcial");
    const viernes = proyectarReglas([regla], CASA(), { hoy: "2026-09-11", semana: SEMANA });
    const lunes = proyectarReglas([regla], CASA(), { hoy: "2026-09-07", semana: SEMANA });
    expect(viernes.aplicadas).toEqual([regla.id]);
    expect(lunes.aplicadas).toEqual(viernes.aplicadas);
    expect(lunes.delta.excluidos).toEqual(viernes.delta.excluidos);
  });

  it("en la semana en curso generada desde hoy la rareza ni aparece", () => {
    // `startDayIdx > 0`: el primer día activo ES hoy, así que un `hasta` de
    // ayer da "no" él solo, sin necesidad de mirar el reloj.
    const desdeHoy = { inicioISO: "2026-09-11", finISO: "2026-09-13", dias: ["Vie", "Sáb", "Dom"] };
    const ayer = nuevaRegla({
      sujeto: { tipo: "casa" },
      efecto: { tipo: "excluir", valor: "picante" },
      vigencia: { hasta: "2026-09-10" },
      hoy: "2026-09-01",
    });
    expect(reglaTocaLaVentana(ayer, desdeHoy, "2026-09-11")).toBe("no");
  });
});

describe("N3 — el ámbito de comidas se mide contra un destino distinto según el efecto", () => {
  // `planExtraMealsForGroup` mete `data.excluidos` y `m.dislikes` en los
  // dislikes del desayuno/merienda/postre (aiPlanner.js:1472), pero llama a
  // `filterOffMenuRecipes` SIN sesgos ni cocinas. O sea: una exclusión llega a
  // cinco comidas y un sesgo solo a dos.
  const CON_DESAYUNO = () => ({ ...CASA(), extraMeals: { desayuno: "variado" } });

  it("«comida y cena» en una casa con desayuno: la exclusión avisa…", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { comidas: ["Comida", "Cena"] },
      efecto: { tipo: "excluir", valor: "picante" },
      hoy: HOY,
    });
    const { avisos, aplicadas } = proyectarReglas([regla], CON_DESAYUNO(), ctx());
    expect(aplicadas).toEqual([regla.id]);
    expect(avisos.map((a) => a.motivo)).toEqual(["ambito_ignorado"]);
  });

  it("…y el sesgo no, porque el desayuno nunca iba a mirarlo", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { comidas: ["Comida", "Cena"] },
      efecto: { tipo: "sesgo", valor: { campo: "tecnica", valor: "horno", peso: 1 } },
      hoy: HOY,
    });
    const { avisos, aplicadas } = proyectarReglas([regla], CON_DESAYUNO(), ctx());
    expect(aplicadas).toEqual([regla.id]);
    expect(avisos).toEqual([]);
  });

  it("sin comidas extra las dos callan: no hay nada que se aplique de más", () => {
    const regla = nuevaRegla({
      sujeto: { tipo: "casa" },
      ambito: { comidas: ["Comida", "Cena"] },
      efecto: { tipo: "excluir", valor: "picante" },
      hoy: HOY,
    });
    expect(proyectarReglas([regla], CASA(), ctx()).avisos).toEqual([]);
  });
});

describe("N4 — «la casa» no incluye a quien viene de visita", () => {
  const visita = nuevaRegla({
    sujeto: { tipo: "invitado", nombre: "Mi tío" },
    ambito: { dias: ["Mié"], comidas: ["Comida"] },
    efecto: { tipo: "presente", valor: "casa" },
    hoy: HOY,
  });
  const todos = nuevaRegla({
    sujeto: { tipo: "casa" },
    ambito: { dias: ["Sáb"] },
    efecto: { tipo: "presente", valor: "casa" },
    hoy: HOY,
  });

  it("el sábado se sienta la familia, no el tío del miércoles", () => {
    const { delta } = proyectarReglas([visita, todos], CASA(), ctx());
    expect(delta.schedule[slotKey("p1", "Sáb", "Comida")]).toBe("casa");
    expect(delta.schedule[slotKey(visita.sujeto.ref, "Sáb", "Comida")]).toBe("fuera");
  });

  it("y por tanto no infla los comensales de ese sábado", () => {
    const { data } = aplicarReglas({ ...CASA(), reglas: [visita, todos] }, ctx());
    const adultos = data.groups.find((g) => g.label === "Adultos");
    expect(eatersForSlot(adultos, data.members, data.schedule, "Sáb", "Comida").length).toBe(2);
    expect(eatersForSlot(adultos, data.members, data.schedule, "Mié", "Comida").length).toBe(3);
  });
});

describe("N5 — quedarse sin huecos significa dos cosas distintas", () => {
  it("días que esta semana no se planifican: se calla", () => {
    const semana = { inicioISO: LUNES, finISO: "2026-09-11", dias: ["Lun", "Mar", "Mié", "Jue", "Vie"] };
    const regla = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "p1" },
      ambito: { dias: ["Dom"] },
      efecto: { tipo: "presente", valor: "fuera" },
      hoy: HOY,
    });
    const { delta, avisos, aplicadas } = proyectarReglas([regla], CASA(), { hoy: HOY, semana });
    expect(aplicadas).toEqual([]);
    expect(avisos).toEqual([]);
    expect(delta.schedule).toBeUndefined();
  });

  it("la vigencia se come los huecos que sí había: se dice", () => {
    const semana = { inicioISO: LUNES, finISO: DOMINGO, dias: [...DAYS] };
    const regla = nuevaRegla({
      sujeto: { tipo: "miembro", ref: "p1" },
      ambito: { dias: ["Lun"] },
      vigencia: { desde: "2026-09-10" },
      efecto: { tipo: "presente", valor: "fuera" },
      hoy: HOY,
    });
    const { delta, avisos, aplicadas } = proyectarReglas([regla], CASA(), { hoy: HOY, semana });
    expect(aplicadas).toEqual([]);
    expect(delta.schedule).toBeUndefined();
    expect(avisos[0].motivo).toBe("no_soportado");
    expect(avisos[0].detalle).toContain("vigencia");
  });
});

describe("reglaDeInvitado: el \"+\" de la tarjeta de un plato", () => {
  it("un invitado en un hueco suma un comensal SOLO en ese hueco", () => {
    const data = CASA();
    const regla = reglaDeInvitado({ dia: "Mié", comida: "Cena", semanaISO: LUNES, hoy: HOY });
    const { delta } = proyectarReglas([regla], data, ctx());
    const grupos = delta.groups ?? data.groups;
    const miembros = delta.members ?? data.members;
    const schedule = delta.schedule ?? data.schedule;
    const adultos = grupos.find((g) => g.id === "g_ad");

    // El miércoles a cenar son tres; el resto de la semana siguen siendo dos.
    expect(eatersForSlot(adultos, miembros, schedule, "Mié", "Cena").length).toBe(3);
    expect(eatersForSlot(adultos, miembros, schedule, "Mié", "Comida").length).toBe(2);
    expect(eatersForSlot(adultos, miembros, schedule, "Jue", "Cena").length).toBe(2);
  });

  it("se sienta con los adultos, nunca en el menú de los niños", () => {
    const data = CASA();
    const { delta } = proyectarReglas(
      [reglaDeInvitado({ dia: "Sáb", comida: "Comida", n: 2, semanaISO: LUNES, hoy: HOY })],
      data, ctx(),
    );
    const ninos = (delta.groups ?? data.groups).find((g) => g.id === "g_ni");
    const miembros = delta.members ?? data.members;
    const schedule = delta.schedule ?? data.schedule;
    expect(eatersForSlot(ninos, miembros, schedule, "Sáb", "Comida").length).toBe(2);
    // Y los dos invitados sí están, con los adultos.
    const adultos = (delta.groups ?? data.groups).find((g) => g.id === "g_ad");
    expect(eatersForSlot(adultos, miembros, schedule, "Sáb", "Comida").length).toBe(4);
  });

  it("con nombre, el invitado se llama por su nombre", () => {
    const data = CASA();
    const regla = reglaDeInvitado({ dia: "Vie", comida: "Cena", nombre: "mi hermano", semanaISO: LUNES, hoy: HOY });
    expect(regla.frase).toContain("mi hermano");
    const { delta } = proyectarReglas([regla], data, ctx());
    expect((delta.members ?? []).some((m) => m.name === "mi hermano" && m.invitado)).toBe(true);
  });

  it("acotada a UNA semana: la siguiente no trae invitado", () => {
    const data = CASA();
    const regla = reglaDeInvitado({ dia: "Mié", comida: "Cena", semanaISO: LUNES, hoy: HOY });
    // La misma regla, mirada desde la semana siguiente.
    const otraSemana = ctx({ semana: { inicioISO: "2026-09-14", finISO: "2026-09-20", dias: [...DAYS] } });
    const { delta } = proyectarReglas([regla], data, otraSemana);
    const miembros = delta.members ?? data.members;
    const adultos = (delta.groups ?? data.groups).find((g) => g.id === "g_ad");
    expect(eatersForSlot(adultos, miembros, delta.schedule ?? data.schedule, "Mié", "Cena").length).toBe(2);
  });

  it("proyectar dos veces da la MISMA persona, no dos", () => {
    const data = CASA();
    const regla = reglaDeInvitado({ dia: "Mié", comida: "Cena", semanaISO: LUNES, hoy: HOY });
    const a = proyectarReglas([regla], data, ctx());
    const b = proyectarReglas([regla], data, ctx());
    const ids = (d) => (d.delta.members ?? []).filter((m) => m.invitado).map((m) => m.id);
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a).length).toBe(1);
  });
});
