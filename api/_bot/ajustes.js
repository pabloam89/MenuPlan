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

import { COMIDAS_PLANIFICABLES, COMIDAS_PRINCIPALES } from "../../src/lib/comidas.js";
import { conCasa } from "./casa.js";
import { motor, normal, diaDe, DIAS, DIA_LARGO } from "./menu.js";
import { registrar, EMBUDO, duenoDe, cimientosCompletos } from "./embudo.js";
import { cerrarPorEstado, abrirPreguntaDeEstado } from "./tareas.js";
import * as ids from "../../src/lib/ids.js";
import { etapaDe, esMenor } from "../../src/lib/stages.js";
import { indiceDeFechaUTC, isoDeCasa } from "../../src/lib/dias.js";
import { ETAPA_BEBE } from "../../src/lib/vocabularios.js";

const hoyISO = () => isoDeCasa();
// Del catálogo de comidas (src/lib/comidas.js).
const COMIDAS = COMIDAS_PLANIFICABLES;

function lunesDe(cual) {
  const hoy = new Date(`${hoyISO()}T12:00:00Z`);
  const dia = indiceDeFechaUTC(hoy);
  hoy.setUTCDate(hoy.getUTCDate() - dia + (cual === "siguiente" ? 7 : 0));
  return hoy.toISOString().slice(0, 10);
}

// Lo que puede resolver una tarea de estado: quién hay, sus alergias y la etapa del bebé.
const huellaDeEstado = (d = {}) => JSON.stringify([d.etapaBebe ?? null, d.allergiesReviewed ?? null,
  (d.members ?? []).map((m) => [m.id, m.alergiasRevisadas ?? null, m.allergies ?? [], m.age ?? null, m.notBaby ?? null,
    m.homeRole ?? null, m.useBirthDate ?? null, m.birthDate ?? null])]);

/**
 * Guarda un `data` nuevo en la casa. `cambiar` recibe el data actual y el motor.
 * Si toca algo de estado, cierra en ese momento las tareas que ya resuelve, y
 * abre las preguntas que devuelva `cambiar` (`preguntas`, con `ctx` del chat).
 * Va dentro de la herramienta, así que también dentro de la fila de escrituras
 * del turno. Si cerrar o abrir falla, el dato queda guardado: el turno
 * siguiente lo recoge (separarPorEstado y promoverPreguntas en agente.js).
 */
export async function conData(householdId, cambiar, ctx = null) {
  let texto = "";
  let guardado = null;
  let antes = null;
  let preguntas = [];
  const r = await conCasa(householdId, async (casa) => {
    const m = await motor();
    antes = casa.state?.data ?? {};
    const res = await cambiar(antes, m, casa);
    texto = res.texto;
    guardado = res.data ?? null;
    preguntas = res.preguntas ?? [];
    if (!res.data) return null;
    return { state: { ...casa.state, data: res.data } };
  });
  if (!r.ok) return `No he podido guardarlo: ${r.error}.`;
  if (guardado && cimientosCompletos(guardado)) {
    await registrar(EMBUDO.CIMIENTOS, { userId: await duenoDe(householdId), unaVez: true });
  }
  if (guardado && huellaDeEstado(antes) !== huellaDeEstado(guardado)) {
    await cerrarPorEstado(householdId, guardado, { userId: ctx?.userId ?? null }).catch((e) => console.error("[ajustes] cerrar por estado", e?.message));
  }
  for (const p of guardado ? preguntas : []) {
    await abrirPreguntaDeEstado({ householdId, ...ctx }, p).catch((e) => console.error("[ajustes] abrir pregunta", e?.message));
  }
  return texto;
}

/**
 * La persona por su nombre: exacto, luego primer nombre exacto, luego prefijo
 * ÚNICO. Con varias candidatas no elige: devuelve las candidatas, porque
 * escribir alergias o borrar a la persona equivocada es peor que preguntar.
 */
export function buscarPersona(data, nombre) {
  const q = normal(nombre);
  // Sin nombre no hay nadie: un startsWith("") casaría con el primero de la casa.
  if (!q) return { persona: null, candidatas: [] };
  const miembros = data.members ?? [];
  const unica = (lista) => (lista.length === 1 ? { persona: lista[0], candidatas: [] } : lista.length > 1 ? { persona: null, candidatas: lista } : null);
  return unica(miembros.filter((p) => normal(p.name) === q))
    ?? unica(miembros.filter((p) => normal(p.name).split(/\s+/)[0] === q))
    ?? unica(miembros.filter((p) => normal(p.name).startsWith(q)))
    ?? { persona: null, candidatas: [] };
}

export const personaPorNombre = (data, nombre) => buscarPersona(data, nombre).persona;

/** Qué decir cuando `personaPorNombre` no da a nadie: no está, o hay varias. */
export function noEncuentro(data, nombre) {
  const { candidatas } = buscarPersona(data, nombre);
  if (candidatas.length > 1) {
    const nombres = candidatas.map((p) => p.name);
    return `¿Te refieres a ${nombres.slice(0, -1).join(", ")} o a ${nombres.at(-1)}? No he cambiado nada: dime cuál.`;
  }
  return `No encuentro a ${nombre} en la casa.`;
}

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

/**
 * @param {{ dicho?: boolean, desde?: string, hasta?: string }} [matiz]
 *   dicho=false: Lola lo supone (lo dijeron de pasada, o lo deduce). Entra en
 *   la libreta como «supuesto»: solo sesga el menú, nunca excluye, caduca a
 *   los 90 días y no pisa nada de lo que la familia haya dicho (notepad.js).
 *   desde/hasta (AAAA-MM-DD): «este mes», «a partir del lunes».
 */
export async function ajustarGustos(householdId, ajustes, frase, { dicho = true, desde, hasta, dias, salvoDias } = {}) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if ((desde && !fecha.test(desde)) || (hasta && !fecha.test(hasta))) return "Las fechas van como AAAA-MM-DD.";
  if (desde && hasta && hasta < desde) return "La fecha de fin va antes que la de inicio: revísalas.";
  if (dias?.length || salvoDias?.length) return gustosPorDias(householdId, ajustes, frase, { dicho, desde, hasta, dias, salvoDias });
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
    const fuente = dicho ? "dicho" : "supuesto";
    const { libreta: nueva } = m.aplicarAjustes(data, libreta, validos, { frase, fecha: hoyISO(), fuente, desde, hasta });
    // Lo que no ha entrado porque ya había algo DICHO encima: Lola no puede
    // suponer en contra de lo que dijo la familia.
    const tapados = validos.filter((a) => {
      const path = m.rutaDe(a.campo, a.valor, a.ambito, a.servicio);
      return nueva.campos[path] === libreta.campos[path] && libreta.campos[path];
    });
    const ventana = desde || hasta ? ` (${desde ? `desde el ${desde}` : ""}${desde && hasta ? " " : ""}${hasta ? `hasta el ${hasta}` : ""})` : "";
    return {
      data: m.dataConLibreta(data, nueva),
      texto: [
        `Anotado${dicho ? "" : " como suposición (solo inclina el menú, no quita nada)"}: ${validos.filter((a) => !tapados.includes(a)).map((a) => `${a.op ?? "mas"} ${a.valor}${a.n != null ? ` (${a.n}/semana)` : ""}`).join(", ") || "nada"}${ventana}.`,
        tapados.length ? ` No lo he cambiado porque la familia ya dijo otra cosa: ${tapados.map((a) => a.valor).join(", ")}.` : "",
        rechazados.length ? ` No reconocido: ${rechazados.join(", ")}.` : "",
        " Se notará al generar el próximo menú.",
      ].join(""),
    };
  });
}

// Las familias de la libreta que tienen grupo con el que quitarlas por hueco
// (src/lib/excluirHueco.js). La verdura no: no hay plato «sin verdura».
const GRUPOS_DE_FAMILIA = { carne: ["carne"], pescado: ["pescado"], legumbres: ["legumbre"], huevos: ["huevo"], pasta_arroz: ["pasta", "arroz"] };

/** Lo que quita un ajuste, como cosas de excluirHueco («grupo:carne»…), o null si no quita nada. */
function quitaDe(a) {
  const quita = a.op === "nunca" || (a.campo === "freqs" && a.n === 0);
  if (!quita) return null;
  if (a.campo === "excluidos") return [String(a.valor).toLowerCase()];
  if (a.campo === "tecnica") return [`tecnica:${a.valor}`];
  if (a.campo === "freqs") return (GRUPOS_DE_FAMILIA[a.valor] ?? []).map((g) => `grupo:${g}`);
  return null;
}

/**
 * Gustos que valen solo ciertos días: «los lunes, sin carne», «entre semana,
 * nada de fritos», «sin pescado en la cena salvo los viernes». No van a la
 * libreta (no tiene días): son reglas de la casa (src/lib/reglas.js), que al
 * generar se proyectan por hueco y el motor comprueba en cada uno.
 *
 * Por días solo se sabe QUITAR, y solo como norma dicha: inclinar un día
 * («más pescado los viernes») o suponerlo no tiene todavía dónde vivir.
 */
function gustosPorDias(householdId, ajustes, frase, { dicho, desde, hasta, dias, salvoDias }) {
  if (!dicho) return "Por días solo apunto normas dichas claras («los lunes, sin carne»), no suposiciones.";
  const aDias = (lista) => [...new Set((lista ?? []).map(diaDe).filter(Boolean))];
  const enDias = aDias(dias);
  const salvo = aDias(salvoDias);
  if (dias?.length && !enDias.length) return `No entiendo esos días (${dias.join(", ")}): usa Lun, Mar, Mié, Jue, Vie, Sáb, Dom.`;
  return conData(householdId, (data, m) => {
    const nuevas = [];
    const noSe = [];
    for (const a of ajustes ?? []) {
      const items = quitaDe(a)?.filter(m.itemValido);
      if (!items?.length || (a.ambito && a.ambito !== "todos")) {
        noSe.push(`${a.op ?? ""} ${a.valor}`.trim());
        continue;
      }
      // «comida»/«cena» → «Comida»/«Cena», el nombre de la comida en `data`.
      const comidas = a.servicio && a.servicio !== "ambos" ? [a.servicio[0].toUpperCase() + a.servicio.slice(1)] : undefined;
      for (const valor of items) {
        const regla = m.nuevaRegla({
          sujeto: { tipo: "casa" },
          efecto: { tipo: "excluir", valor },
          ambito: { ...(enDias.length ? { dias: enDias } : {}), ...(comidas ? { comidas } : {}) },
          ...(salvo.length ? { salvedad: { dias: salvo } } : {}),
          vigencia: { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) },
          origen: "texto",
          frase: frase ? String(frase).slice(0, 500) : undefined,
          hoy: hoyISO(),
        });
        // null = no valida (p. ej. la ventana al revés): se dice, no se guarda a medias.
        if (regla) nuevas.push(regla);
        else noSe.push(`${a.op ?? ""} ${a.valor}`.trim());
      }
    }
    if (!nuevas.length) return { texto: `Por días solo sé quitar cosas (un ingrediente, carne, pescado, legumbres, huevos, pasta o arroz, o una técnica como los fritos) para toda la casa. No he apuntado: ${noSe.join(", ") || "nada"}.` };
    const { reglas } = m.podarReglasVencidas([...(data.reglas ?? []), ...nuevas], hoyISO());
    return {
      data: { ...data, reglas },
      texto: `Anotado: ${nuevas.map((r) => m.describirRegla(r, data)).join("; ")}.${noSe.length ? ` Esto no lo sé hacer por días: ${noSe.join(", ")}.` : ""} Se notará al generar el próximo menú.`,
    };
  });
}

/**
 * «No, eso no es así»: la familia desmiente algo que Lola supuso. Deja de
 * valer y no se vuelve a suponer (notepad.js `rechazar`). Lo que la familia
 * DIJO no se rechaza por aquí: se cambia con ajustar_gustos.
 */
export async function descartarSupuesto(householdId, { campo, valor, ambito = "todos", servicio = "ambos" }) {
  return conData(householdId, (data, m) => {
    const path = m.rutaDe(campo, valor, ambito, servicio);
    const libreta = m.normalizarLibreta(data.notepad);
    const { libreta: nueva, rechazado } = m.rechazar(libreta, path, { fecha: hoyISO() });
    if (!rechazado) {
      return { texto: libreta.campos[path]?.valor !== undefined ? `«${valor}» lo dijo la familia, no es una suposición: si ha cambiado, cámbialo con ajustar_gustos.` : `No tengo nada supuesto sobre «${valor}».` };
    }
    return { data: m.dataConLibreta(data, nueva), texto: `Descartado: no vuelvo a suponer «${valor}».` };
  });
}

// ── Cocina: el `escribe` del registro del wizard ─────────────────────────────

// Qué come el bebé de la casa: solo cremas, de todo o ya sólidos. Es
// `data.etapaBebe`, la misma que elige la app (lib/babyStage.js) y la que usa
// el motor para su menú; sin ella, «ya come sólidos» no cambiaba nada y le
// seguían saliendo purés.
const ETAPAS_BEBE = ETAPA_BEBE;

export async function ajustarCocina(householdId, { estructura, esfuerzo, tiempo, tanda, trastos, comidas, etapaBebe }) {
  return conData(householdId, (data, m) => {
    const R = m.PREGUNTAS_POR_ID;
    let d = data;
    const hechos = [];
    // Qué comidas se planifican (la fila «comidas» del registro solo lee: se
    // escribe `data.meals` directamente, con el mismo vocabulario).
    if (Array.isArray(comidas)) {
      const meals = COMIDAS_PRINCIPALES.filter((c) => comidas.includes(c));
      if (meals.length) { d = { ...d, meals }; hechos.push(`comidas: ${meals.join(" y ")}`); }
    }
    if (estructura) { d = R.estructura.escribe(d, estructura); hechos.push(`estructura: ${estructura}`); }
    if (esfuerzo) { d = R.esfuerzo.escribe(d, esfuerzo); hechos.push(`nivel: ${esfuerzo}`); }
    if (tiempo || tanda) { d = R.tiempo.escribe(d, { ...(tiempo ? { nivel: tiempo } : {}), ...(tanda ? { tanda } : {}) }); hechos.push(`tiempo: ${[tiempo, tanda].filter(Boolean).join(", ")}`); }
    if (Array.isArray(trastos)) { d = R.trastos.escribe(d, trastos); hechos.push(`trastos: ${trastos.join(", ") || "ninguno"}`); }
    if (ETAPAS_BEBE.includes(etapaBebe)) { d = { ...d, etapaBebe }; hechos.push(`bebé: ${{ cremas: "cremas y purés", mixto: "de todo", solidos: "ya sólidos" }[etapaBebe]}`); }
    if (!hechos.length) return { texto: "No había nada que cambiar." };
    return { data: d, texto: `Guardado (${hechos.join("; ")}). Se aplicará al generar el próximo menú.` };
  });
}

// ── Horario: quién come dónde ───────────────────────────────────────────────

/**
 * «Los niños» / «los adultos» de la casa, con etapaDe (la definición de la
 * app): niños son los menores (bebé, niño, adolescente); adultos, el resto,
 * también quien no tiene edad ni papel que lo diga. Nadie cae en los dos: antes
 * un «Hijo/a» sin edad era niño y adulto a la vez. Pura, para el test.
 */
export function personasDeEdad(miembros, cuales) {
  return (miembros ?? []).filter((x) => esMenor(x) === (cuales === "ninos"));
}

export async function ajustarHorario(householdId, { personas, dias, comidas, donde }) {
  return conData(householdId, (data, m) => {
    if (!m.SLOT_VALUES.includes(donde)) return { texto: `«${donde}» no vale: casa, tupper, fuera, cole u off.` };
    const miembros = data.members ?? [];
    const sel = new Set();
    const noEncontradas = [];
    for (const p of personas ?? ["todos"]) {
      const q = normal(p);
      if (q === "todos") miembros.forEach((x) => sel.add(x.id));
      else if (/^(ninos|hijos|peques)$/.test(q)) personasDeEdad(miembros, "ninos").forEach((x) => sel.add(x.id));
      else if (/^(adultos|padres|mayores)$/.test(q)) personasDeEdad(miembros, "adultos").forEach((x) => sel.add(x.id));
      else { const x = personaPorNombre(data, p); x ? sel.add(x.id) : noEncontradas.push(p); }
    }
    // Al cole solo van los menores. «Todos» + cole dejaba también a los adultos
    // sin comida entre semana: el motor no les planificaba nada a mediodía
    // (staging, 2 oct 2026: un adulto de 36 años con «cole» de lunes a viernes).
    // Adulto por edad, o sin edad por su papel (Papá, Mamá…). Sin edad ni papel
    // que lo diga no se sabe: se deja pasar, como hasta ahora.
    const adultosAlCole = donde === "cole" ? miembros.filter((x) => sel.has(x.id) && etapaDe(x).etapa === "adulto") : [];
    for (const x of adultosAlCole) sel.delete(x.id);
    const avisoCole = adultosAlCole.length
      ? ` ${adultosAlCole.map((x) => x.name).join(", ")} no ${adultosAlCole.length > 1 ? "van" : "va"} al cole: no se ha tocado su horario. Si a mediodía no ${adultosAlCole.length > 1 ? "comen" : "come"} en casa, pregunta si es fuera o con táper.`
      : "";
    if (adultosAlCole.length && !sel.size) return { texto: `No he cambiado nada.${avisoCole}` };
    const ds = (dias?.length ? dias : DIAS).map((d) => (/^(entre ?semana|laborables)$/.test(normal(d)) ? DIAS.slice(0, 5) : /^(finde|fin de semana)$/.test(normal(d)) ? DIAS.slice(5) : [diaDe(d)])).flat().filter(Boolean);
    const cs = (comidas?.length ? comidas : COMIDAS_PRINCIPALES).map((c) => COMIDAS.find((x) => normal(x) === normal(c))).filter(Boolean);
    if (!sel.size || !ds.length || !cs.length) return { texto: `No sé a quién o cuándo aplicarlo${noEncontradas.length ? ` (no conozco a ${noEncontradas.join(", ")})` : ""}.` };
    const schedule = { ...(data.schedule ?? {}) };
    for (const id of sel) for (const d of ds) for (const c of cs) {
      const k = m.slotKey(id, d, c);
      if (donde === "casa") delete schedule[k]; else schedule[k] = donde;
    }
    const nombres = miembros.filter((x) => sel.has(x.id)).map((x) => x.name).join(", ");
    return {
      data: { ...data, schedule },
      texto: `Horario guardado: ${nombres} → ${donde} (${ds.map((d) => DIA_LARGO[d]).join(", ")}; ${cs.join(", ")}).${noEncontradas.length ? ` No conozco a ${noEncontradas.join(", ")}.` : ""}${avisoCole}`,
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
    const { reglas } = m.podarReglasVencidas([...(data.reglas ?? []), { ...regla, origen: "texto" }], hoyISO());
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

/**
 * Cómo comen los peques respecto a los mayores, lo mismo que decidía la
 * pantalla de los niños del onboarding (OnboardingKidsDinner), para todos los
 * niños a la vez:
 *   igual            comen lo mismo que la familia (lo de siempre)
 *   aparte           la cena es suya (sin repetir el comedor)
 *   lo_del_mediodia  los días de cole cenan lo que la familia comió a mediodía
 * Deriva el modelo de menú y los grupos como la app. Cuenta al generar.
 */
/**
 * La tanda (batch cooking) desde el chat, con la MISMA escritura que la
 * pantalla de bases de la app (`conTandaPedida`): bases que se dejan hechas
 * (sofrito, arroz, legumbre cocida…) y platos que se dejan hechos o a medias
 * (croquetas, cremas…), cuántas veces por semana; el rato que hay (minutos de
 * manos) y el día en que se cocina.
 *
 * Antes Lola solo podía decir «tanda» en ajustar_cocina, que escribía un
 * `cookTime.tanda` que nadie lee: alargaba el finde y no pedía ninguna base.
 */
export async function pedirTanda(householdId, { bases = [], platos = [], minutos, dia, ninguna = false }) {
  return conData(householdId, (data, m) => {
    const campo = (id) => m.CAMPOS.find((c) => c.id === id);
    const cTanda = campo("tanda");
    const cPlatos = campo("tandaPlatos");
    let d = data;
    const hechos = [];
    const malos = [];
    const pedir = (c, prefijo, clave, veces) => {
      if (!c.dominio.includes(clave)) { malos.push(clave); return; }
      const [min, max] = c.rango;
      const n = Number(veces) <= 0 ? 0 : Math.min(max, Math.max(min, Math.round(Number(veces) || min)));
      d = m.conTandaPedida(d, `${prefijo}.${clave}`, n);
      hechos.push(n ? `${clave} ${n}/semana` : `sin ${clave}`);
    };
    if (ninguna) {
      // Todo lo pedido a cero: la casa deja de cocinar en tanda.
      for (const k of Object.keys(d.tanda ?? {})) if (d.tanda[k] > 0) pedir(cTanda, "tanda", k, 0);
      for (const k of Object.keys(d.tandaPlatos ?? {})) if (d.tandaPlatos[k] > 0) pedir(cPlatos, "tandaPlatos", k, 0);
    }
    for (const b of bases) pedir(cTanda, "tanda", String(b.base ?? "").toLowerCase(), b.veces ?? cTanda.rango[0]);
    for (const p of platos) pedir(cPlatos, "tandaPlatos", String(p.familia ?? "").toLowerCase(), p.veces ?? cPlatos.rango[0]);
    if (minutos != null) {
      // El rato de la sesión, en minutos de MANOS, de media en media hora.
      const n = Math.min(m.TANDA_MAX, Math.max(m.TANDA_MIN, Math.round(Number(minutos) / m.TANDA_PASO) * m.TANDA_PASO));
      d = { ...d, tandaMinutos: n };
      hechos.push(`${n} min de manos`);
    }
    if (dia) {
      const dd = diaDe(dia);
      if (!dd) malos.push(`día «${dia}»`);
      else { d = { ...d, diaTanda: dd }; hechos.push(`se cocina el ${DIA_LARGO[dd] ?? dd}`); }
    }
    if (!hechos.length) {
      return { texto: `No he pedido nada.${malos.length ? ` No reconozco: ${malos.join(", ")}. Bases válidas: ${cTanda.dominio.join(", ")}. Platos: ${cPlatos.dominio.join(", ")}.` : ""}` };
    }
    return {
      data: d,
      texto: `Batch cooking: ${hechos.join(", ")}.${malos.length ? ` No reconozco: ${malos.join(", ")} (bases válidas: ${cTanda.dominio.join(", ")}; platos: ${cPlatos.dominio.join(", ")}).` : ""} El próximo menú pondrá platos que las aprovechen.`,
    };
  });
}

export async function ajustarMenuPeques(householdId, { cena }) {
  return conData(householdId, (data, m) => {
    const kids = m.kidMembers(data.members ?? []);
    if (!kids.length) return { texto: "En esta casa no hay niños: todos comen lo mismo." };
    if (!["igual", "aparte", "lo_del_mediodia"].includes(cena)) return { texto: "cena tiene que ser igual, aparte o lo_del_mediodia." };
    const cfg = m.normalizeKidDinnerConfig(data.kidDinnerConfig);
    const byMember = { ...cfg.byMember };
    for (const k of kids) {
      const base = byMember[k.id] ?? { ...m.KID_DINNER_DEFAULTS, safeFoods: [], avoid: { ...m.KID_DINNER_AVOID_DEFAULTS } };
      byMember[k.id] = {
        ...base, weekdayLunch: "together", weekend: "together",
        dinner: cena === "aparte" ? "different" : "sameDinner",
        reuseColeDinner: cena === "lo_del_mediodia",
      };
    }
    const next = { ...data, kidDinnerConfig: { byMember } };
    const modelo = m.deriveKidsMenuModel(next) ?? "same";
    const members = next.members ?? [];
    next.menuModel = modelo;
    // Mismo modelo que ya había: los grupos no se tocan (rehacerlos perdería
    // un reparto hecho a mano).
    if (modelo !== (data.menuModel ?? "same") || !(data.groups ?? []).length) {
      // Y si cambia, cada grupo nuevo hereda el id del viejo que hace su papel
      // (Familia ↔ Adultos, Bebé ↔ Bebé: conservarIds, lib/groups.js, lo mismo
      // que la app): el menú en curso sigue siendo suyo.
      const viejos = data.groups ?? [];
      next.groups = m.migrateGroupsForBabies(members, m.groupsFromModel(members, modelo, viejos), modelo);
    }
    const dicho = { igual: "los peques comen lo mismo que vosotros", aparte: "los peques cenan aparte, sin repetir lo del cole", lo_del_mediodia: "los días de cole, los peques cenan lo que comisteis a mediodía" }[cena];
    return { data: next, texto: `Apuntado: ${dicho}. Cuenta en el próximo menú (este no se rehace solo).` };
  });
}

export async function anadirComensal(householdId, { nombre, edad }, ctx = null) {
  return conData(householdId, (data, m) => {
    if (!nombre) return { texto: "¿Cómo se llama?" };
    if ((data.members ?? []).some((p) => normal(p.name) === normal(nombre))) return { texto: `${nombre} ya está en la casa.` };
    const age = Number.isFinite(edad) ? edad : null;
    const nuevo = {
      id: ids.persona.nuevo(),
      name: nombre, age, useBirthDate: false, birthDate: "",
      homeRole: m.suggestHomeRole(age ?? 30), stageDetail: "", allergies: [], dislikes: [],
    };
    // La casa deja de estar revisada hasta que alguien diga si el nuevo tiene alergias.
    const conNuevo = m.conMiembroNuevo(data, nuevo);
    return {
      data: conGrupos(m, conNuevo, conNuevo.members),
      texto: `Añadido a la casa: ${nombre}${age != null ? ` (${age} años)` : ""}. ¿Tiene alguna alergia o intolerancia?`,
      // Política «una vez, en el alta»: la pregunta queda apuntada por código.
      preguntas: [{ campo: "alergias", personaId: nuevo.id, texto: `¿${nombre} tiene alguna alergia o intolerancia?` }],
    };
  }, ctx);
}

/**
 * Peso y altura de una persona (opcionales): con los dos, su ración deja de
 * ser «1 adulto» y sale de su gasto estimado (src/lib/raciones.js). Se
 * guardan en el miembro como pesoKg y alturaCm; la app los conserva.
 */
export async function ajustarPersona(householdId, { nombre, nuevoNombre, pesoKg, alturaCm, borrar = false }) {
  return conData(householdId, (data, m) => {
    const x = personaPorNombre(data, nombre);
    if (!x) return { texto: noEncuentro(data, nombre) };
    // Un nombre mal oído en un audio («Iquer» → «Iker»): todo va por id, así
    // que basta con cambiar el nombre.
    const nuevo = String(nuevoNombre ?? "").trim();
    if (nuevo) {
      if (nuevo.length > 40) return { texto: "Ese nombre es muy largo." };
      const otro = (data.members ?? []).find((p) => p.id !== x.id && normal(p.name ?? "") === normal(nuevo));
      if (otro) return { texto: `Ya hay alguien llamado ${otro.name} en la casa.` };
      if (pesoKg == null && alturaCm == null && !borrar) {
        const members = (data.members ?? []).map((p) => (p.id === x.id ? { ...p, name: nuevo } : p));
        return { data: { ...data, members }, texto: `Corregido: ahora es ${nuevo}.` };
      }
    }
    const peso = Number(pesoKg);
    const altura = Number(alturaCm);
    if (!borrar && pesoKg != null && !(peso >= 2 && peso <= 300)) return { texto: "Ese peso no me cuadra: dímelo en kilos." };
    if (!borrar && alturaCm != null && !(altura >= 40 && altura <= 230)) return { texto: "Esa altura no me cuadra: dímela en centímetros." };
    const cambiado = borrar
      ? { ...x, pesoKg: null, alturaCm: null }
      : { ...x, ...(pesoKg != null ? { pesoKg: peso } : {}), ...(alturaCm != null ? { alturaCm: altura } : {}) };
    if (nuevo) cambiado.name = nuevo;
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
    if (!x) return { texto: noEncuentro(data, nombre) };
    const members = (data.members ?? []).filter((p) => p.id !== x.id);
    if (!members.length) return { texto: "No puedo dejar la casa sin nadie." };
    const schedule = Object.fromEntries(Object.entries(data.schedule ?? {}).filter(([k]) => !k.startsWith(`${x.id}|`)));
    return { data: { ...conGrupos(m, data, members), schedule }, texto: `Quitado de la casa: ${x.name}.` };
  });
}

// ── Alergias: nunca sin confirmar ───────────────────────────────────────────

const TODA_LA_CASA = /^(todos|todo el mundo|toda la familia|familia|la casa|toda la casa)$/;

export async function ajustarAlergias(householdId, { persona, alergenos, quitar = false, ninguna = false, confirmado }) {
  if (confirmado !== true) {
    return "Las alergias no se guardan sin confirmación explícita. Repite lo que vas a guardar y pregúntale si es correcto; solo con su «sí» llama otra vez con confirmado=true.";
  }
  // La revisión es por persona: si queda alguien sin preguntar, se le dice a
  // Lola por su nombre para que pregunte por él y no dé la casa por cerrada.
  const faltan = (m, data) => {
    const p = m.pendientesDeAlergias(data).map((x) => x.name);
    return p.length ? ` Falta por saber si ${p.join(" y ")} tiene${p.length > 1 ? "n" : ""} alguna alergia: pregúntalo.` : "";
  };
  // «No tiene alergias»: no se escribe ningún alérgeno, pero esa persona (o
  // toda la casa) queda revisada, que es lo que la app pide para los cimientos.
  if (ninguna) {
    return conData(householdId, (data, m) => {
      // Sin decir de quién, con varios sin revisar, no se da la casa entera por
      // revisada: «Nat no tiene» cerraría también las alergias de Pablo.
      if (!persona && m.pendientesDeAlergias(data).length > 1) {
        return { texto: "¿De quién? Dime la persona, o «toda la casa» si nadie tiene. No he guardado nada." };
      }
      const uno = persona && !TODA_LA_CASA.test(normal(persona));
      const x = uno ? personaPorNombre(data, persona) : null;
      if (uno && !x) return { texto: noEncuentro(data, persona) };
      const nuevo = m.marcarRevisadas(data, x ? [x.id] : null);
      const conAlguna = (data.members ?? []).some((p) => (p.allergies ?? []).length);
      return {
        data: nuevo,
        texto: x
          ? `Anotado: ${x.name} no tiene alergias.${faltan(m, nuevo)}`
          : conAlguna ? "Anotado: nadie más en casa tiene alergias." : "Anotado: nadie en casa tiene alergias ni intolerancias.",
      };
    });
  }
  return conData(householdId, (data, m) => {
    // La regla es la de la app (src/lib/alergias.js): ids con sus alias
    // («frutos secos»), y se escribe la ETIQUETA, que es lo que guarda la app.
    const toda = TODA_LA_CASA.test(normal(persona));
    const x = toda ? null : personaPorNombre(data, persona);
    if (!toda && !x) return { texto: noEncuentro(data, persona) };
    const r = m.aplicarAlergias(data, { memberId: toda ? m.FAMILIA : x.id, ids: alergenos, quitar, confirmado: true });
    if (!r.escrito) {
      return { texto: `No reconozco ninguno como uno de los 14 alérgenos oficiales (${r.ignorados.join(", ") || "vacío"}). Los válidos: ${m.EU_ALLERGEN_IDS.join(", ")}.` };
    }
    return {
      data: r.data,
      texto: `${quitar ? "Quitadas" : "Guardadas"} para ${toda ? "toda la casa" : x.name}: ${r.aplicados.join(", ")}.${r.ignorados.length ? ` No reconocidas: ${r.ignorados.join(", ")}.` : ""}${faltan(m, r.data)}`,
    };
  });
}

// Lo que no es uno de los 14 alérgenos pero quita recetas igual: las
// intolerancias y los estados (src/lib/intolerances.js). Se guardan donde los
// guarda la app (member.intolerances, member.dietaryStates) y el motor ya los lee.
export const INTOLERANCIAS = ["lactosa_fina", "fructosa", "sorbitol"];
export const ESTADOS = ["embarazo", "lactancia"];
const ETIQUETA_SALUD = { lactosa_fina: "intolerancia a la lactosa", fructosa: "intolerancia a la fructosa", sorbitol: "intolerancia al sorbitol", embarazo: "embarazo", lactancia: "lactancia" };

/**
 * Intolerancias y estados de una persona, como las alergias: con confirmado y
 * eco; quitar pasa además por el supervisor. `hasta` (AAAA-MM-DD), solo para
 * los estados: la ficha lo enseña y Lola pregunta al pasar la fecha. Mientras
 * nadie lo quite, el estado sigue aplicando (de más es el lado seguro).
 */
export async function ajustarSalud(householdId, { persona, intolerancias = [], estados = [], quitar = false, hasta, confirmado }) {
  if (confirmado !== true) {
    return "No se guarda sin confirmación explícita. Repite lo que vas a guardar y pregúntale si es correcto; solo con su «sí» llama otra vez con confirmado=true.";
  }
  const ints = (intolerancias ?? []).filter((x) => INTOLERANCIAS.includes(x));
  const ests = (estados ?? []).filter((x) => ESTADOS.includes(x));
  if (!ints.length && !ests.length) return `No reconozco nada de eso. Intolerancias: ${INTOLERANCIAS.join(", ")}; estados: ${ESTADOS.join(", ")}. El gluten, la leche y el resto de alérgenos van con ajustar_alergias.`;
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return "La fecha «hasta» va en AAAA-MM-DD (la de hoy está en la primera línea del día de la ficha).";
  return conData(householdId, (data) => {
    const x = personaPorNombre(data, persona);
    if (!x) return { texto: noEncuentro(data, persona) };
    const sin = (lista, quitar_) => (lista ?? []).filter((id) => !quitar_.includes(id));
    const meta = { ...(x.dietaryStatesMeta ?? {}) };
    for (const id of ests) {
      if (quitar || !hasta) delete meta[id];
      else meta[id] = { hasta };
    }
    const cambiado = {
      ...x,
      intolerances: quitar ? sin(x.intolerances, ints) : [...new Set([...(x.intolerances ?? []), ...ints])],
      dietaryStates: quitar ? sin(x.dietaryStates, ests) : [...new Set([...(x.dietaryStates ?? []), ...ests])],
      dietaryStatesMeta: meta,
    };
    if (!Object.keys(meta).length) delete cambiado.dietaryStatesMeta;
    const members = (data.members ?? []).map((p) => (p.id === x.id ? cambiado : p));
    const que = [...ints, ...ests].map((id) => ETIQUETA_SALUD[id]).join(", ");
    return {
      data: { ...data, members },
      texto: `${quitar ? "Quitado" : "Guardado"} para ${x.name}: ${que}${!quitar && hasta && ests.length ? ` (hasta el ${hasta})` : ""}. Cuenta en el próximo menú que generes.`,
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
        // Toda la casa come lo mismo (el bebé, aparte mientras lo sea): lo
        // que quieren casi todas las familias. Sin esto el motor partía por
        // edades (Adultos / Niños) y salían dos cenas cada noche.
        menuModel: data.menuModel ?? "same",
        meals: data.meals ?? COMIDAS_PRINCIPALES,
        schedule: data.schedule ?? {},
      },
      texto: "",
    };
  });
}

/** Para las descripciones de las herramientas: los dominios reales del panel. */
// Calculados en el build (scripts/build-bot-core.mjs). Si no está el fichero
// (pruebas sin build), se calculan con el motor, como antes.
let dominiosHechos = null;
export async function dominiosDeGustos() {
  if (dominiosHechos) return dominiosHechos;
  try {
    const { readFileSync } = await import("node:fs");
    dominiosHechos = JSON.parse(readFileSync(new URL("./dominiosGustos.json", import.meta.url), "utf8")).dominios;
    if (dominiosHechos) return dominiosHechos;
  } catch (e) {
    // a propósito: sin build (en local y en los tests) no hay fichero; con el motor.
    console.warn("[ajustes] sin dominiosGustos.json, con el motor:", e?.message);
  }
  const m = await motor();
  return m.CAMPOS.filter((c) => c.panel !== false).map((c) =>
    `${c.id} (${c.etiqueta})${Array.isArray(c.dominio) ? `: ${c.dominio.join("/")}` : ": texto libre"}`).join("; ");
}
