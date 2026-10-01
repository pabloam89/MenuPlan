/**
 * La ficha de la casa: lo que es verdad de esta casa AHORA, en texto corto,
 * delante de Lola en cada mensaje (specs/ficha-de-la-casa.md §2).
 *
 * Sin ella, para saber quién come o quién es alérgico Lola tenía que llamar a
 * ver_casa o ver_ajustes: una vuelta más del modelo (2-4 s), y si no se
 * acordaba de mirar, no sabía que Cova es alérgica. Con ella lo sabe siempre.
 *
 * ── Cómo se monta ─────────────────────────────────────────────────────────
 * Del JSON de la casa (household_state, ya cargado en el turno: casa.js lo
 * recuerda unos segundos) y SIN el motor: cargarlo son ~2 s en frío. Por eso
 * solo importa módulos sin dependencias (stages, intolerances, notepad,
 * reglasTexto) y las etiquetas de los gustos salen del build
 * (dominiosGustos.json). Se monta en cada mensaje, en milisegundos, y así
 * nunca está desfasada: el spec pedía guardarla ya montada para no cargar el
 * motor; sin motor no hace falta guardarla, y una ficha vieja con las
 * alergias de ayer es justo lo que no puede pasar.
 *
 * Dos bloques: ESTABLE (casi no cambia: aprovecha la caché del modelo) y DEL
 * DÍA. Tope duro ~450 tokens; SEGURIDAD nunca se recorta.
 *
 * La leyenda de las marcas («Supuesto:», «hasta dd/mm», «SIN PREGUNTAR») va en
 * conocimiento.md, en caché, no aquí.
 */

import fs from "node:fs";
import { resolveMemberAge, stageForAge } from "../../src/lib/stages.js";
import { INTOLERANCE_RULES } from "../../src/lib/intolerances.js";
import { estadoDe } from "../../src/lib/notepad.js";
import { describirRegla } from "../../src/lib/reglasTexto.js";
import { select, eq } from "./db.js";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_CORTO = { Lun: "lun", Mar: "mar", "Mié": "mié", Jue: "jue", Vie: "vie", "Sáb": "sáb", Dom: "dom" };
const LETRA = { Lun: "L", Mar: "M", "Mié": "X", Jue: "J", Vie: "V", "Sáb": "S", Dom: "D" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ALERGENOS = {
  gluten: "gluten", crustaceos: "crustáceos", huevos: "huevo", pescado: "pescado", cacahuetes: "cacahuete",
  soja: "soja", leche: "leche", frutos_cascara: "frutos de cáscara", apio: "apio", mostaza: "mostaza",
  sesamo: "sésamo", sulfitos: "sulfitos", altramuces: "altramuces", moluscos: "moluscos",
};
const TOPE_TOKENS = 450;
const tokens = (t) => Math.ceil(String(t).length / 3.6);

// Las etiquetas de los gustos, del build (scripts/build-bot-core.mjs).
let etiquetas = null;
function etiquetaDe(campo) {
  if (!etiquetas) {
    try { etiquetas = JSON.parse(fs.readFileSync(new URL("./dominiosGustos.json", import.meta.url), "utf8")).etiquetas ?? {}; } catch { etiquetas = {}; }
  }
  return etiquetas[campo] ?? campo;
}

const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaDeFecha = (iso) => DIAS[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];
const fechaCorta = (iso) => `${DIA_CORTO[diaDeFecha(iso)]} ${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

// Lo mismo que alergiasRevisadas() de src/lib/alergias.js (que no se puede
// importar aquí: arrastra el catálogo). Una prueba vigila que digan lo mismo.
export const alergiasRevisadas = (data, m) => m?.alergiasRevisadas ?? data?.allergiesReviewed === true;

// Solo la edad que se sabe: resolveMemberAge pone 30 a quien no la tiene, y en
// la ficha eso sería afirmar algo que nadie ha dicho.
function edadDe(m) {
  const sabida = (m.useBirthDate && m.birthDate) || Number.isFinite(m.age) || Number.isFinite(parseInt(m.age, 10));
  return sabida ? resolveMemberAge(m) : null;
}
const esBebe = (m) => !m?.notBaby && stageForAge(resolveMemberAge(m))?.id === "baby";

/** «Pablo 37», «Vega 1», «Leo» */
function personaCorta(m) {
  const e = edadDe(m);
  return e != null ? `${m.name} ${e}` : m.name;
}

/** De un id de plan al nombre del plato (lo hidratado del menú lleva el nombre). */
function nombrador(state) {
  const porId = new Map();
  for (const r of [...(state?.aiRecipes ?? []), ...(state?.data?.userRecipes ?? [])]) {
    if (!r?.id || !r?.name) continue;
    porId.set(r.id, r.name);
    porId.set(String(r.id).split("__").pop(), r.name);
  }
  return (id) => (id ? porId.get(id) ?? porId.get(String(id).split("__").pop()) ?? null : null);
}

// ── SEGURIDAD ───────────────────────────────────────────────────────────────

function seguridad(data) {
  const miembros = data.members ?? [];
  const grupos = data.groups ?? [];
  const lineas = [];
  // Alergias agrupadas por alérgeno: «Lucas: frutos de cáscara. Pablo, Marta: ninguna.»
  const porAlergia = new Map();
  const ninguna = [];
  const sinPreguntar = [];
  for (const m of miembros) {
    const als = (m.allergies ?? []).map((a) => ALERGENOS[String(a).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, "_")] ?? String(a).toLowerCase());
    if (als.length) {
      const clave = als.sort().join(", ");
      porAlergia.set(clave, [...(porAlergia.get(clave) ?? []), m.name]);
    } else if (alergiasRevisadas(data, m)) ninguna.push(m.name);
    else sinPreguntar.push(m.name);
  }
  const partes = [...porAlergia].map(([als, quienes]) => `${lista(quienes)}: alergia a ${als}`);
  if (ninguna.length) partes.push(`${lista(ninguna)}: ninguna`);
  if (sinPreguntar.length) partes.push(`${lista(sinPreguntar)}: SIN PREGUNTAR`);
  if (partes.length) lineas.push(`- ${partes.join(". ")}.`);
  // Comparte menú con alguien alérgico: lo suyo vale para todo el grupo.
  for (const g of grupos) {
    const suyos = miembros.filter((m) => (g.memberIds ?? []).includes(m.id));
    const alergicos = suyos.filter((m) => (m.allergies ?? []).length);
    if (alergicos.length && suyos.length > 1) lineas.push(`- Lo de ${lista(alergicos.map((m) => m.name))} aplica a todo «${g.label}».`);
  }
  // Intolerancias, dietas y estados (embarazo, lactancia), con «hasta» si hay fecha.
  for (const m of miembros) {
    const cosas = [
      ...(m.intolerances ?? []).map((id) => INTOLERANCE_RULES[id]?.label ?? id),
      ...(m.dietaryStates ?? []).map((id) => {
        const hasta = m.dietaryStatesMeta?.[id]?.hasta;
        return `${(INTOLERANCE_RULES[id]?.label ?? id).toLowerCase()}${hasta ? ` hasta ${ddmm(hasta)}` : ", sin fecha"}`;
      }),
      ...(m.healthProfiles ?? []).map((p) => (typeof p === "string" ? p : p?.label ?? p?.id)).filter(Boolean),
    ];
    if (cosas.length) lineas.push(`- ${m.name}: ${cosas.join("; ")}.`);
  }
  // El bebé y su etapa.
  for (const m of miembros.filter(esBebe)) {
    const etapa = { cremas: "solo cremas y purés", mixto: "cremas y algo de sólido", solidos: "ya come sólidos" }[data.etapaBebe];
    const meses = Number.isFinite(resolveMemberAge(m)) ? Math.round(resolveMemberAge(m) * 12) : null;
    lineas.push(`- ${m.name}${meses != null && meses < 24 ? ` (${meses} m)` : ""}: bebé${etapa ? `, ${etapa}` : ""}.`);
  }
  return lineas;
}

// ── CASA ────────────────────────────────────────────────────────────────────

/** El horario resumido: «Lucas: cole L–V a mediodía». Como mucho 3 patrones. */
function horario(data) {
  const porPatron = new Map();
  for (const [k, v] of Object.entries(data.schedule ?? {})) {
    if (!v || v === "casa") continue;
    const [id, dia, comida] = k.split("|");
    const clave = `${id}|${v}|${comida}`;
    porPatron.set(clave, [...(porPatron.get(clave) ?? []), dia]);
  }
  const nombre = (id) => (data.members ?? []).find((p) => p.id === id)?.name ?? null;
  const textos = [];
  for (const [clave, dias] of porPatron) {
    const [id, estado, comida] = clave.split("|");
    if (!nombre(id)) continue;
    const ordenados = DIAS.filter((d) => dias.includes(d));
    const rango = ordenados.length === 5 && ordenados.join() === "Lun,Mar,Mié,Jue,Vie" ? "L–V" : ordenados.map((d) => LETRA[d]).join("");
    textos.push(`${nombre(id)}: ${estado} ${rango} ${comida === "Comida" ? "a mediodía" : `en ${String(comida).toLowerCase()}`}`);
  }
  return textos;
}

function casaBloque(data) {
  const miembros = data.members ?? [];
  const lineas = [];
  let dislikesPuestos = 0;
  const personas = miembros.map((m) => {
    const no = (m.dislikes ?? []).slice(0, Math.min(3, 8 - dislikesPuestos));
    dislikesPuestos += no.length;
    return `${personaCorta(m)}${no.length ? ` (no le gusta: ${no.join(", ")})` : ""}`;
  });
  if (personas.length) lineas.push(`- ${personas.join(" · ")}.`);
  const grupos = (data.groups ?? []).filter((g) => (g.memberIds ?? []).length);
  if (grupos.length > 1) {
    const nom = (id) => miembros.find((m) => m.id === id)?.name;
    lineas.push(`- Menús: ${grupos.map((g) => `«${g.label}» (${lista((g.memberIds ?? []).map(nom).filter(Boolean))})`).join(" y ")}.`);
  } else if (grupos.length === 1) {
    lineas.push("- Todos comen lo mismo (un solo menú).");
  }
  const h = horario(data);
  if (h.length) lineas.push(`- ${h.slice(0, 3).join(". ")}${h.length > 3 ? `. +${h.length - 3} (ver_ajustes)` : ""}.`);
  return lineas;
}

// ── COCINA ──────────────────────────────────────────────────────────────────

function cocinaBloque(data) {
  const lineas = [];
  const comidas = data.meals ?? ["Comida", "Cena"];
  const estructura = { primero_segundo: "primero y segundo", plato_unico: "plato único", unico: "plato único", "1_plato": "plato único" };
  const est = [
    comidas.includes("Comida") && data.mealStructure ? `Comida: ${estructura[data.mealStructure] ?? data.mealStructure}` : "",
    comidas.includes("Cena") && data.mealStructureCena ? `Cena: ${estructura[data.mealStructureCena] ?? data.mealStructureCena}` : "",
  ].filter(Boolean);
  lineas.push(`- Se planifican: ${comidas.join(" y ").toLowerCase()}${est.length ? `. ${est.join(". ")}` : ""}.`);
  const ct = data.cookTime;
  if (ct?.weekday) {
    const ent = Math.max(ct.weekday.Comida ?? 0, ct.weekday.Cena ?? 0);
    const fin = Math.max(ct.weekend?.Comida ?? 0, ct.weekend?.Cena ?? 0);
    lineas.push(`- Tiempo: entre semana ~${ent} min; finde ~${fin}.${data.cookLevel && data.cookLevel !== "normal" ? ` Nivel: ${data.cookLevel}.` : ""}`);
  }
  const trastos = [...(data.kitchenTools ?? []), ...(data.customKitchenTools ?? [])];
  if (trastos.length) lineas.push(`- Aparatos: ${trastos.join(", ")}.`);
  if ((data.menuModel ?? "same") === "separate") lineas.push("- Los peques cenan aparte (ajustar_menu_peques).");
  // La libreta: lo dicho y lo supuesto, separados (3 y 2 como mucho).
  const campos = Object.entries(data.notepad?.campos ?? {});
  const texto = ([ruta, c]) => {
    const [id, ...resto] = ruta.split(".");
    const detalle = resto.map((x) => x.replace(/^#/, "")).filter((x) => x && x !== "todos" && x !== "ambos").join(" ");
    // «Lo que os gusta mucho: pollo al horno» (sin «: true»); el número, entre
    // paréntesis, solo si dice algo («Cuánto de cada cosa: pescado (3)»).
    const v = Array.isArray(c.valor) ? c.valor.join("/") : c.valor;
    const valor = v === true || v === 1 || v === "1" ? "" : ` (${v})`;
    return `${etiquetaDe(id)}: ${detalle || ""}${valor}`.replace(/: \(/, ": (");
  };
  const dicho = campos.filter(([r]) => estadoDe(data.notepad, r) === "fijado");
  const supuesto = campos.filter(([r]) => estadoDe(data.notepad, r) === "inferido");
  if (dicho.length) lineas.push(`- Dicho: ${dicho.slice(0, 3).map(texto).join("; ")}${dicho.length > 3 ? `; +${dicho.length - 3} (ver_ajustes)` : ""}.`);
  if (supuesto.length) lineas.push(`- Supuesto: ${supuesto.slice(0, 2).map(texto).join("; ")}${supuesto.length > 2 ? `; +${supuesto.length - 2} (ver_ajustes)` : ""}.`);
  const nunca = [...(data.dislikes ?? []), ...(data.excluidos ?? [])];
  if (nunca.length) lineas.push(`- Nunca: ${nunca.slice(0, 6).join(", ")}${nunca.length > 6 ? `, +${nunca.length - 6}` : ""}.`);
  const fijos = (data.fixedDishes ?? []).map((f) => f?.name ?? f?.nombre ?? f?.recipeName).filter(Boolean);
  if (fijos.length) lineas.push(`- Fijos: ${fijos.slice(0, 4).join(", ")}.`);
  if (data.hasBudget && data.budget) lineas.push(`- Presupuesto: ${data.budget} €/semana.`);
  return lineas;
}

// ── RECETARIO ───────────────────────────────────────────────────────────────

function recetarioBloque(data) {
  const propias = data.userRecipes ?? [];
  if (!propias.length) return [];
  const copiadas = propias.filter((r) => r.copiedFromRecipeId).length;
  const variantes = propias.filter((r) => !r.copiedFromRecipeId && (r.baseDishId || r.linkedCatalogId)).length;
  const vuestras = propias.length - copiadas - variantes;
  const tipos = [vuestras && `${vuestras} vuestras`, copiadas && `${copiadas} copiadas o recibidas`, variantes && `${variantes} variantes del catálogo`].filter(Boolean);
  const nombres = propias.slice(-3).map((r) => r.name).filter(Boolean);
  return [`- ${propias.length} recetas propias (${tipos.join(", ")}). Las últimas: ${nombres.join(", ")}.`];
}

// ── DEL DÍA ─────────────────────────────────────────────────────────────────

function platosDelDia(casa, dia, nombre) {
  const plan = casa.semana?.plan ?? {};
  const grupos = (casa.state?.data?.groups ?? []).filter((g) => plan[g.id]);
  const porFranja = [];
  for (const franja of ["Desayuno", "Comida", "Merienda", "Cena"]) {
    const porGrupo = grupos.map((g) => {
      const h = plan[g.id]?.[`${dia}-${franja}`];
      const platos = h ? [nombre(h.firstRecipeId), nombre(h.recipeId)].filter(Boolean) : [];
      return { g, platos: platos.join(" + ") };
    }).filter((x) => x.platos);
    if (!porGrupo.length) continue;
    const iguales = new Set(porGrupo.map((x) => x.platos)).size === 1;
    porFranja.push(iguales
      ? `${franja.toLowerCase()} ${porGrupo[0].platos}`
      : `${franja.toLowerCase()} ${porGrupo.map((x) => `«${x.g.label}»: ${x.platos}`).join("; ")}`);
  }
  return porFranja.join("; ");
}

function delDiaBloque(casa, extras, hoy) {
  const data = casa.state?.data ?? {};
  const lineas = [fechaCorta(hoy)];
  // AHORA: reglas vigentes (invitados, temporales) e invitados.
  const vigentes = (data.reglas ?? []).filter((r) => !r?.vigencia?.hasta || r.vigencia.hasta >= hoy);
  if (vigentes.length) lineas.push("AHORA", ...vigentes.slice(0, 3).map((r) => `- ${describirRegla(r, data)}.`));
  // MENÚ: rangos, hoy y mañana, nevera.
  const semanas = casa.semanas ?? [];
  const vivas = semanas.filter((w) => w.weekEnd >= hoy);
  if (!vivas.length) {
    lineas.push(semanas.length ? `MENÚ: el último (${ddmm(semanas.at(-1).weekStart)}–${ddmm(semanas.at(-1).weekEnd)}) ya pasó; no hay menú para esta semana.` : "MENÚ: todavía no hay ninguno.");
  } else {
    const nombre = nombrador(casa.state);
    lineas.push(`MENÚ ${vivas.map((w) => `${ddmm(w.weekStart)}–${ddmm(w.weekEnd)}`).join(" y ")}${vivas.length === 1 ? " (no hay semana siguiente)" : ""}`);
    const manana = sumarDias(hoy, 1);
    const enHoy = casa.semana && casa.semana.weekStart <= hoy && hoy <= casa.semana.weekEnd ? platosDelDia(casa, diaDeFecha(hoy), nombre) : "";
    const casaManana = { ...casa, semana: semanas.find((w) => w.weekStart <= manana && manana <= w.weekEnd) ?? null };
    const enManana = casaManana.semana ? platosDelDia(casaManana, diaDeFecha(manana), nombre) : "";
    if (enHoy) lineas.push(`- Hoy: ${enHoy}.`);
    if (enManana) lineas.push(`- Mañana: ${enManana}.`);
  }
  if (extras.nevera?.length) lineas.push(`- Hecho y guardado: ${extras.nevera.slice(0, 3).join("; ")}.`);
  if (extras.avisos?.length) lineas.push("AVISOS", ...extras.avisos.slice(0, 2).map((a) => `- ${a}`));
  // PENDIENTE: primero, lo de seguridad.
  const sinPreguntar = (data.members ?? []).filter((m) => !alergiasRevisadas(data, m) && !(m.allergies ?? []).length);
  if (sinPreguntar.length) lineas.push("PENDIENTE", `- ¿${lista(sinPreguntar.map((m) => m.name))} ${sinPreguntar.length > 1 ? "tienen" : "tiene"} alguna alergia o intolerancia?`);
  return lineas;
}

// ── Montaje y recorte ───────────────────────────────────────────────────────

/**
 * @param {object} casa  lo que devuelve cargarCasa
 * @param {{ nevera?: string[], avisos?: string[] }} [extras]
 * @param {string} [hoy] ISO, para las pruebas
 * @returns {{ estable: string, delDia: string }}
 */
export function montarFicha(casa, extras = {}, hoy = hoyMadrid()) {
  const data = casa?.state?.data ?? {};
  if (!(data.members ?? []).length) {
    return { estable: "SEGURIDAD: SIN REVISAR · PARA EMPEZAR FALTA: quién come · alergias · comidas", delDia: fechaCorta(hoy) };
  }
  // Las secciones en el orden en que se recortan si no cabe (la última, nunca).
  const secciones = {
    seguridad: seguridad(data),
    casa: casaBloque(data),
    cocina: cocinaBloque(data),
    recetario: recetarioBloque(data),
  };
  let delDia = delDiaBloque(casa, extras, hoy);
  const pintar = () => {
    const estable = [
      ["SEGURIDAD", secciones.seguridad], ["CASA", secciones.casa], ["COCINA", secciones.cocina], ["RECETARIO", secciones.recetario],
    ].filter(([, l]) => l.length).map(([t, l]) => `${t}\n${l.join("\n")}`).join("\n");
    return { estable, delDia: delDia.join("\n") };
  };
  let f = pintar();
  // Recorte: «no le gusta», MENÚ, COCINA, CASA, RECETARIO, AHORA. SEGURIDAD nunca.
  const pasos = [
    () => { secciones.casa = secciones.casa.map((l) => l.replace(/ \(no le gusta: [^)]*\)/g, "")); },
    () => { delDia = delDia.filter((l) => !/^- (Hoy|Mañana|Hecho)/.test(l)); },
    () => { secciones.cocina = secciones.cocina.slice(0, 2).concat(["- +más (ver_ajustes)"]); },
    () => { secciones.casa = secciones.casa.slice(0, 2); },
    () => { secciones.recetario = []; },
  ];
  for (const paso of pasos) {
    if (tokens(f.estable) + tokens(f.delDia) <= TOPE_TOKENS) break;
    paso();
    f = pintar();
  }
  return f;
}

const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

/**
 * Lo que la ficha necesita y no está en el JSON de la casa: lo cocinado que
 * espera en la nevera o el congelador, y los avisos programados del chat. Dos
 * consultas pequeñas, en paralelo con el resto del turno.
 */
export async function extrasDeFicha(householdId, chatId) {
  const [nevera, avisos] = await Promise.all([
    select("user_pantry", `household_id=${eq(householdId)}&item_type=eq.cooked_dish&order=cooked_at.desc&limit=5`, "name,portions,frozen")
      .then((fs) => fs.map((p) => `${p.portions ?? 1} raciones de ${p.name} (${p.frozen ? "congelador" : "nevera"})`))
      .catch(() => []),
    chatId != null
      ? select("bot_reminders", `chat_id=${eq(String(chatId))}&status=eq.pending&order=due_at.asc&limit=3`, "text,due_at,repite")
        .then((fs) => fs.map((r) => `${r.text}${r.repite ? ` (${r.repite})` : ""}`))
        .catch(() => [])
      : [],
  ]);
  return { nevera, avisos };
}
