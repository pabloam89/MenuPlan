/**
 * Ajustes de la casa desde el chat: los ejes del wizard, sin wizard.
 *
 * Cada cambio pasa por la MISMA pieza que usa la app, nunca por una copia:
 *   · gustos (familias, cocinas, técnicas, favoritos, excluidos…) → la libreta,
 *     con `aplicarAjustes` + `dataConLibreta` (src/lib/libretaEnData.js), que
 *     es lo que hace el panel de la app;
 *   · estructura, esfuerzo, tiempo, trastos → el `escribe` del registro del
 *     wizard (src/lib/wizardRegistry.js);
 *   · invitados puntuales → `reglaDeInvitado` (src/lib/reglas.js);
 *   · horario → `data.schedule["miembro|día|comida"]`, el vocabulario de la app;
 *   · comensales → la forma de miembro del alta, y grupos reconciliados con
 *     `reconcileGroupsWithMembers` + `migrateGroupsForBabies`.
 *
 * Lo que el agente INFIERE queda en la libreta como inferido (origen "texto"),
 * igual que el panel; las alergias solo se escriben con confirmación explícita.
 */

import { conCasa } from "./casa.js";
import { motor, normal, diaDe, DIAS, DIA_LARGO } from "./menu.js";
import { registrar, EMBUDO, duenoDe, cimientosCompletos } from "./embudo.js";

const hoyISO = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
const COMIDAS = ["Desayuno", "Comida", "Merienda", "Cena", "Postre"];

function lunesDe(cual) {
  const hoy = new Date(`${hoyISO()}T12:00:00Z`);
  const dia = (hoy.getUTCDay() + 6) % 7;
  hoy.setUTCDate(hoy.getUTCDate() - dia + (cual === "siguiente" ? 7 : 0));
  return hoy.toISOString().slice(0, 10);
}

/** Guarda un `data` nuevo en la casa. `cambiar` recibe el data actual y el motor. */
export async function conData(householdId, cambiar) {
  let texto = "";
  let guardado = null;
  const r = await conCasa(householdId, async (casa) => {
    const m = await motor();
    const res = await cambiar(casa.state?.data ?? {}, m, casa);
    texto = res.texto;
    guardado = res.data ?? null;
    if (!res.data) return null;
    return { state: { ...casa.state, data: res.data } };
  });
  if (!r.ok) return `No he podido guardarlo: ${r.error}.`;
  if (guardado && cimientosCompletos(guardado)) {
    await registrar(EMBUDO.CIMIENTOS, { userId: await duenoDe(householdId), unaVez: true });
  }
  return texto;
}

export const personaPorNombre = (data, nombre) => {
  const q = normal(nombre);
  // Sin nombre no hay nadie: un startsWith("") casaría con el primero de la casa.
  if (!q) return null;
  return (data.members ?? []).find((p) => normal(p.name) === q)
    ?? (data.members ?? []).find((p) => normal(p.name).startsWith(q));
};

// ── Leer ────────────────────────────────────────────────────────────────────

export async function describirAjustes(casa) {
  const m = await motor();
  const d = casa.state?.data ?? {};
  const libreta = m.normalizarLibreta(d.notepad);
  const gustos = Object.entries(libreta.campos ?? {}).map(([ruta, c]) => {
    const estado = m.estadoDe(libreta, ruta);
    return `• ${ruta} = ${JSON.stringify(c.valor)} (${estado}${c.procedencia?.frase ? `, por «${c.procedencia.frase}»` : ""})`;
  });
  const fuera = Object.entries(d.schedule ?? {}).filter(([, v]) => v && v !== "casa");
  const nombre = (id) => (d.members ?? []).find((p) => p.id === id)?.name ?? id;
  const horario = fuera.slice(0, 40).map(([k, v]) => { const [id, dia, comida] = k.split("|"); return `• ${nombre(id)}: ${DIA_LARGO[dia] ?? dia} ${comida} → ${v}`; });
  const reglas = (d.reglas ?? []).map((r) => `• ${m.describirRegla(r, d)}`);
  return [
    `Estructura de la comida: ${d.mealStructure ?? "(por defecto)"}\nNivel de cocina: ${d.cookLevel ?? "normal"}\nTrastos: ${(d.kitchenTools ?? []).join(", ") || "(sin decir)"}`,
    `Gustos en la libreta:\n${gustos.join("\n") || "(nada todavía: todo por defecto, menú equilibrado)"}`,
    `Quién NO come en casa (el resto, en casa):\n${horario.join("\n") || "(todos comen en casa siempre)"}${fuera.length > 40 ? `\n… y ${fuera.length - 40} más` : ""}`,
    `Reglas e invitados:\n${reglas.join("\n") || "(ninguna)"}`,
  ].join("\n\n");
}

// ── Gustos: la libreta, como el panel de la app ─────────────────────────────

export async function ajustarGustos(householdId, ajustes, frase) {
  return conData(householdId, (data, m) => {
    const validos = [];
    const rechazados = [];
    for (const a of ajustes ?? []) {
      const ajuste = { ambito: "todos", servicio: "ambos", ...a };
      const campo = m.CAMPOS.find((c) => c.id === ajuste.campo);
      if (!campo || campo.panel === false || !m.valorValido(ajuste.campo, ajuste.valor)) rechazados.push(`${a.campo}:${a.valor}`);
      else validos.push(ajuste);
    }
    if (!validos.length) return { texto: `No he podido aplicar nada: ${rechazados.join(", ") || "sin ajustes"}.` };
    const libreta = m.normalizarLibreta(data.notepad);
    const { libreta: nueva } = m.aplicarAjustes(data, libreta, validos, { frase, fecha: hoyISO() });
    return {
      data: m.dataConLibreta(data, nueva),
      texto: `Anotado: ${validos.map((a) => `${a.op ?? "mas"} ${a.valor}${a.n != null ? ` (${a.n}/semana)` : ""}`).join(", ")}.${rechazados.length ? ` No reconocido: ${rechazados.join(", ")}.` : ""} Se notará al generar el próximo menú.`,
    };
  });
}

// ── Cocina: el `escribe` del registro del wizard ─────────────────────────────

export async function ajustarCocina(householdId, { estructura, esfuerzo, tiempo, tanda, trastos, comidas }) {
  return conData(householdId, (data, m) => {
    const R = m.PREGUNTAS_POR_ID;
    let d = data;
    const hechos = [];
    // Qué comidas se planifican (la fila «comidas» del registro solo lee: se
    // escribe `data.meals` directamente, con el mismo vocabulario).
    if (Array.isArray(comidas)) {
      const meals = ["Comida", "Cena"].filter((c) => comidas.includes(c));
      if (meals.length) { d = { ...d, meals }; hechos.push(`comidas: ${meals.join(" y ")}`); }
    }
    if (estructura) { d = R.estructura.escribe(d, estructura); hechos.push(`estructura: ${estructura}`); }
    if (esfuerzo) { d = R.esfuerzo.escribe(d, esfuerzo); hechos.push(`nivel: ${esfuerzo}`); }
    if (tiempo || tanda) { d = R.tiempo.escribe(d, { ...(tiempo ? { nivel: tiempo } : {}), ...(tanda ? { tanda } : {}) }); hechos.push(`tiempo: ${[tiempo, tanda].filter(Boolean).join(", ")}`); }
    if (Array.isArray(trastos)) { d = R.trastos.escribe(d, trastos); hechos.push(`trastos: ${trastos.join(", ") || "ninguno"}`); }
    if (!hechos.length) return { texto: "No había nada que cambiar." };
    return { data: d, texto: `Guardado (${hechos.join("; ")}). Se aplicará al generar el próximo menú.` };
  });
}

// ── Horario: quién come dónde ───────────────────────────────────────────────

export async function ajustarHorario(householdId, { personas, dias, comidas, donde }) {
  return conData(householdId, (data, m) => {
    if (!m.SLOT_VALUES.includes(donde)) return { texto: `«${donde}» no vale: casa, tupper, fuera, cole u off.` };
    const miembros = data.members ?? [];
    const sel = new Set();
    const noEncontradas = [];
    for (const p of personas ?? ["todos"]) {
      const q = normal(p);
      if (q === "todos") miembros.forEach((x) => sel.add(x.id));
      else if (/^(ninos|hijos|peques)$/.test(q)) miembros.filter((x) => /nino|hijo|hija|nina/.test(normal(x.homeRole)) || (x.age != null && x.age < 18)).forEach((x) => sel.add(x.id));
      else if (/^(adultos|padres|mayores)$/.test(q)) miembros.filter((x) => x.age == null || x.age >= 18).forEach((x) => sel.add(x.id));
      else { const x = personaPorNombre(data, p); x ? sel.add(x.id) : noEncontradas.push(p); }
    }
    const ds = (dias?.length ? dias : DIAS).map((d) => (/^(entre ?semana|laborables)$/.test(normal(d)) ? DIAS.slice(0, 5) : /^(finde|fin de semana)$/.test(normal(d)) ? DIAS.slice(5) : [diaDe(d)])).flat().filter(Boolean);
    const cs = (comidas?.length ? comidas : ["Comida", "Cena"]).map((c) => COMIDAS.find((x) => normal(x) === normal(c))).filter(Boolean);
    if (!sel.size || !ds.length || !cs.length) return { texto: `No sé a quién o cuándo aplicarlo${noEncontradas.length ? ` (no conozco a ${noEncontradas.join(", ")})` : ""}.` };
    const schedule = { ...(data.schedule ?? {}) };
    for (const id of sel) for (const d of ds) for (const c of cs) {
      const k = m.slotKey(id, d, c);
      if (donde === "casa") delete schedule[k]; else schedule[k] = donde;
    }
    const nombres = miembros.filter((x) => sel.has(x.id)).map((x) => x.name).join(", ");
    return {
      data: { ...data, schedule },
      texto: `Horario guardado: ${nombres} → ${donde} (${ds.map((d) => DIA_LARGO[d]).join(", ")}; ${cs.join(", ")}).${noEncontradas.length ? ` No conozco a ${noEncontradas.join(", ")}.` : ""}`,
    };
  });
}

// ── Invitados puntuales: una regla que caduca sola ──────────────────────────

export async function anadirInvitado(householdId, { dia, comida, n = 1, nombre, semana = "esta" }) {
  return conData(householdId, (data, m) => {
    const d = diaDe(dia);
    const c = COMIDAS.find((x) => normal(x) === normal(comida));
    if (!d || !c) return { texto: `No entiendo cuándo («${dia}», «${comida}»).` };
    const regla = m.reglaDeInvitado({ dia: d, comida: c, n, nombre, semanaISO: lunesDe(semana), hoy: hoyISO() });
    if (!regla) return { texto: "No he podido apuntar al invitado." };
    const reglas = m.podarReglasVencidas([...(data.reglas ?? []), { ...regla, origen: "texto" }], hoyISO());
    return {
      data: { ...data, reglas },
      texto: `Apuntado: ${m.describirRegla(regla, data)}. Cuenta al generar el menú de esa semana (y caduca solo).`,
    };
  });
}

// ── Comensales ──────────────────────────────────────────────────────────────

function conGrupos(m, data, members) {
  const groups = m.migrateGroupsForBabies(members, m.reconcileGroupsWithMembers(members, data.groups ?? []), data.menuModel);
  return { ...data, members, groups };
}

export async function anadirComensal(householdId, { nombre, edad }) {
  return conData(householdId, (data, m) => {
    if (!nombre) return { texto: "¿Cómo se llama?" };
    if (personaPorNombre(data, nombre)) return { texto: `${nombre} ya está en la casa.` };
    const age = Number.isFinite(edad) ? edad : null;
    const nuevo = {
      id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: nombre, age, useBirthDate: false, birthDate: "",
      homeRole: m.suggestHomeRole(age ?? 30), stageDetail: "", allergies: [], dislikes: [],
    };
    return {
      data: conGrupos(m, data, [...(data.members ?? []), nuevo]),
      texto: `Añadido a la casa: ${nombre}${age != null ? ` (${age} años)` : ""}. ¿Tiene alguna alergia o intolerancia?`,
    };
  });
}

/**
 * Peso y altura de una persona (opcionales): con los dos, su ración deja de
 * ser «1 adulto» y sale de su gasto estimado (src/lib/raciones.js). Se
 * guardan en el miembro como pesoKg y alturaCm; la app los conserva.
 */
export async function ajustarPersona(householdId, { nombre, pesoKg, alturaCm, borrar = false }) {
  return conData(householdId, (data, m) => {
    const x = personaPorNombre(data, nombre);
    if (!x) return { texto: `No encuentro a ${nombre} en la casa.` };
    const peso = Number(pesoKg);
    const altura = Number(alturaCm);
    if (!borrar && pesoKg != null && !(peso >= 2 && peso <= 300)) return { texto: "Ese peso no me cuadra: dímelo en kilos." };
    if (!borrar && alturaCm != null && !(altura >= 40 && altura <= 230)) return { texto: "Esa altura no me cuadra: dímela en centímetros." };
    const cambiado = borrar
      ? { ...x, pesoKg: null, alturaCm: null }
      : { ...x, ...(pesoKg != null ? { pesoKg: peso } : {}), ...(alturaCm != null ? { alturaCm: altura } : {}) };
    const members = (data.members ?? []).map((p) => (p.id === x.id ? cambiado : p));
    const factor = m.factorRacion(cambiado, m.resolveMemberAge(cambiado));
    const racion = cambiado.pesoKg && cambiado.alturaCm
      ? ` Su ración: ${String(factor).replace(".", ",")} de adulto de referencia.`
      : borrar ? "" : " Con peso y altura calculo su ración; falta uno de los dos.";
    return {
      data: { ...data, members },
      texto: borrar ? `Borrados el peso y la altura de ${x.name}: vuelve a contar como una ración normal.` : `Anotado para ${x.name}.${racion} Se nota en el próximo menú que generes.`,
    };
  });
}

export async function quitarComensal(householdId, { nombre }) {
  return conData(householdId, (data, m) => {
    const x = personaPorNombre(data, nombre);
    if (!x) return { texto: `No encuentro a ${nombre} en la casa.` };
    const members = (data.members ?? []).filter((p) => p.id !== x.id);
    if (!members.length) return { texto: "No puedo dejar la casa sin nadie." };
    const schedule = Object.fromEntries(Object.entries(data.schedule ?? {}).filter(([k]) => !k.startsWith(`${x.id}|`)));
    return { data: { ...conGrupos(m, data, members), schedule }, texto: `Quitado de la casa: ${x.name}.` };
  });
}

// ── Alergias: nunca sin confirmar ───────────────────────────────────────────

export async function ajustarAlergias(householdId, { persona, alergenos, quitar = false, ninguna = false, confirmado }) {
  if (confirmado !== true) {
    return "Las alergias no se guardan sin confirmación explícita. Repite lo que vas a guardar y pregúntale si es correcto; solo con su «sí» llama otra vez con confirmado=true.";
  }
  // «Nadie tiene alergias»: no se escribe ningún alérgeno, pero la casa queda
  // revisada, que es lo que la app pide para dar los cimientos por hechos.
  if (ninguna) {
    return conData(householdId, (data) => ({ data: { ...data, allergiesReviewed: true }, texto: "Anotado: nadie en casa tiene alergias ni intolerancias." }));
  }
  return conData(householdId, (data, m) => {
    // La regla es la de la app (src/lib/alergias.js): ids con sus alias
    // («frutos secos»), y se escribe la ETIQUETA, que es lo que guarda la app.
    const toda = /^(todos|toda la familia|familia|la casa)$/.test(normal(persona));
    const x = toda ? null : personaPorNombre(data, persona);
    if (!toda && !x) return { texto: `No encuentro a ${persona} en la casa.` };
    const r = m.aplicarAlergias(data, { memberId: toda ? m.FAMILIA : x.id, ids: alergenos, quitar, confirmado: true });
    if (!r.escrito) {
      return { texto: `No reconozco ninguno como uno de los 14 alérgenos oficiales (${r.ignorados.join(", ") || "vacío"}). Los válidos: ${m.EU_ALLERGEN_IDS.join(", ")}.` };
    }
    return {
      data: r.data,
      texto: `${quitar ? "Quitadas" : "Guardadas"} para ${toda ? "toda la casa" : x.name}: ${r.aplicados.join(", ")}.${r.ignorados.length ? ` No reconocidas: ${r.ignorados.join(", ")}.` : ""}`,
    };
  });
}

/**
 * Una casa creada desde el bot nace vacía (`household_state.state = {}`). Se
 * siembran los mínimos que la app tendría por defecto, para que el agente y el
 * motor trabajen desde el primer mensaje. No pisa nada que ya exista.
 */
export async function sembrarCasa(householdId) {
  return conData(householdId, (data) => {
    if (Array.isArray(data.meals) && Array.isArray(data.members)) return { texto: "" };
    return {
      data: {
        ...data,
        members: data.members ?? [],
        groups: data.groups ?? [],
        meals: data.meals ?? ["Comida", "Cena"],
        schedule: data.schedule ?? {},
      },
      texto: "",
    };
  });
}

/** Para las descripciones de las herramientas: los dominios reales del panel. */
export async function dominiosDeGustos() {
  const m = await motor();
  return m.CAMPOS.filter((c) => c.panel !== false).map((c) =>
    `${c.id} (${c.etiqueta})${Array.isArray(c.dominio) ? `: ${c.dominio.join("/")}` : ": texto libre"}`).join("; ");
}
