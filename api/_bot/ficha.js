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
import { etapaDe, esEtapaBebe } from "../../src/lib/stages.js";
import { INTOLERANCE_RULES } from "../../src/lib/intolerances.js";
import { matizDe, vigente, rechazadosDe } from "../../src/lib/notepad.js";
import { describirRegla } from "../../src/lib/reglasTexto.js";
import { hayTandasPedidas, minutosDeTanda, enHoras } from "../../src/lib/cookTime.js";
import { SEMI, COCINADO } from "../../src/lib/tandaFamiliasDefs.js";
import { comidasDeLaCasa, comida as comidaDelCatalogo } from "../../src/lib/comidas.js";
import { claveDeTarea } from "../../src/lib/registroTareas.js";
import { vetosConAmbito, textoDeVeto, vetosDePersona } from "../../src/lib/vetos.js";
import { DIAS, DIA_LARGO_MINUSCULAS, DIA_LETRA, diaDeISO, isoDeCasa } from "../../src/lib/dias.js";
import { select, eq } from "./db.js";
import { propiasDe } from "./propias.js";
import { alergiasPorSilencio } from "../../src/lib/alergiasBase.js";

const DIA_CORTO = Object.fromEntries(DIAS.map((d) => [d, d.toLowerCase()]));
const DIA_LARGO = DIA_LARGO_MINUSCULAS;

// Los platos de tanda por su nombre («Croquetas»); las bases por su clave, que
// ya se lee («sofrito», «salsa_tomate»). Sin bases.js: trae el JSON del catálogo.
const ETIQUETA_TANDA = new Map([...SEMI, ...COCINADO].map((f) => [f.id, f.etiqueta.toLowerCase()]));

/**
 * El batch cooking pedido: { que: «sofrito ×3, arroz ×2», dia: "Dom" | null,
 * manos: «1 h» }, o null si no hay. A la familia se le dice «batch cooking» o
 * «día de tuppers», nunca «tanda» (Pablo, 1 oct 2026: «tanda» no lo usa nadie).
 * Lo usan la ficha y el aviso de la víspera (vispera.js).
 */
export function batchCooking(data) {
  if (!hayTandasPedidas(data)) return null;
  const que = [...Object.entries(data.tanda ?? {}), ...Object.entries(data.tandaPlatos ?? {})]
    .filter(([, n]) => Number(n) > 0)
    .map(([id, n]) => `${ETIQUETA_TANDA.get(id) ?? id.replace(/_/g, " ")} ×${n}`)
    .join(", ");
  return { que, dia: DIA_LARGO[data.diaTanda] ? data.diaTanda : null, manos: enHoras(minutosDeTanda(data)) };
}

/** «Batch cooking: sofrito ×3, arroz ×2 · el domingo · 1 h de manos», o null si no hay. */
function tandaPedida(data) {
  const b = batchCooking(data);
  if (!b) return null;
  return [`Batch cooking: ${b.que}`, b.dia ? `el ${DIA_LARGO[b.dia]}` : null, `${b.manos} de manos`].filter(Boolean).join(" · ");
}
const LETRA = DIA_LETRA;
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
    try { etiquetas = JSON.parse(fs.readFileSync(new URL("./dominiosGustos.json", import.meta.url), "utf8")).etiquetas ?? {}; } catch (e) {
      // a propósito: sin build (en local y en los tests) no hay fichero; el campo, sin etiqueta.
      console.warn("[ficha] sin dominiosGustos.json:", e?.message);
      etiquetas = {};
    }
  }
  return etiquetas[campo] ?? campo;
}

const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaDeFecha = diaDeISO;
const fechaCorta = (iso) => `${DIA_CORTO[diaDeFecha(iso)]} ${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
// La primera línea del día lleva también la fecha ISO: ajustar_gustos pide
// desde/hasta en AAAA-MM-DD, y sin el año Lola dudaba («hasta el 31»).
const cabeceraDia = (iso) => `${fechaCorta(iso)} (${iso})`;
// «hasta 31/10», «desde 6/10»: la ventana de un apunte de la libreta.
const diaMes = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

// Lo mismo que alergiasRevisadas() de src/lib/alergias.js (que no se puede
// importar aquí: arrastra el catálogo). Una prueba vigila que digan lo mismo.
export const alergiasRevisadas = (data, m) => m?.alergiasRevisadas ?? data?.allergiesReviewed === true;

/**
 * Lo que Lola aún debe preguntar por seguridad, con una clave estable. La ficha
 * lo muestra como PENDIENTE y las tareas abiertas (pendientes.js) se cierran
 * solas cuando la clave deja de estar aquí: una sola fuente, que es el estado.
 */
export function preguntasPendientes(data = {}, calladas = new Set()) {
  return (data.members ?? [])
    .filter((m) => !alergiasRevisadas(data, m) && !(m.allergies ?? []).length)
    .map((m) => ({ clave: claveDeTarea({ tipo: "falta_saber", campo: "alergias", personaId: m.id ?? m.name }), nombre: m.name }))
    // «No quiero decirlo» (bot_tareas rechazada), o «ahora te digo» aún sin
    // vencer (aplazada, con BOT_TAREAS_V2): no se vuelve a pedir.
    .filter((p) => !calladas.has(p.clave));
}

// Solo la edad que se sabe (etapaDe da null sin ella): poner 30 a quien no la
// tiene sería afirmar en la ficha algo que nadie ha dicho.
const edadDe = (m) => etapaDe(m).edad;
/**
 * Las reglas de un solo día que acabaron en los últimos 3 días (lo que la
 * charla aún recuerda), en una línea por día: «sáb 3: fuera toda la casa
 * (comida, cena); Nat (cena)». Las demás reglas con fecha se cuentan enteras.
 */
export function recienPasadoPorDia(data = {}, hoy) {
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
  const pasadas = (data.reglas ?? []).filter((r) => r?.vigencia?.hasta && r.vigencia.hasta < hoy && r.vigencia.hasta >= desde);
  const nombre = (r) => (r.sujeto?.tipo === "casa" ? "toda la casa" : (data.members ?? []).find((m) => m.id === r.sujeto?.ref)?.name ?? "alguien");
  const porDia = new Map();
  const otras = [];
  for (const r of pasadas) {
    const unDia = r.vigencia.desde === r.vigencia.hasta && r.efecto?.valor === "fuera";
    if (!unDia) { otras.push(describirRegla(r, data)); continue; }
    const quien = nombre(r);
    const dia = porDia.get(r.vigencia.hasta) ?? new Map();
    dia.set(quien, [...(dia.get(quien) ?? []), ...(r.ambito?.comidas ?? []).map((c) => String(c).toLowerCase())]);
    porDia.set(r.vigencia.hasta, dia);
  }
  const lineas = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, quienes]) =>
    `${fechaCorta(fecha)}: fuera ${[...quienes.entries()].map(([q, cs]) => `${q} (${[...new Set(cs)].join(", ")})`).join("; ")}`);
  return [...lineas, ...otras].slice(-4);
}

// La misma definición que la app (etapaDe en src/lib/stages.js): bebé hasta
// cumplir 3, o sin edad con papel «Bebé»; «ya come como un niño» lo saca.
export const esBebe = (m) => esEtapaBebe(m);

/** «Pablo 37», «Vega 1», «Leo» */
function personaCorta(m) {
  const e = edadDe(m);
  return e != null ? `${m.name} ${e}` : m.name;
}

/** De un id de plan al nombre del plato (lo hidratado del menú lleva el nombre). */
function nombrador(casa) {
  const porId = new Map();
  for (const r of [...(casa?.state?.aiRecipes ?? []), ...propiasDe(casa)]) {
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
  // «Ninguna» por silencio (#229): vale para el menú, pero no está confirmado.
  const porSilencio = [];
  const sinPreguntar = [];
  for (const m of miembros) {
    const als = (m.allergies ?? []).map((a) => ALERGENOS[String(a).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, "_")] ?? String(a).toLowerCase());
    if (als.length) {
      const clave = als.sort().join(", ");
      porAlergia.set(clave, [...(porAlergia.get(clave) ?? []), m.name]);
    } else if (alergiasPorSilencio(data, m)) porSilencio.push(m.name);
    else if (alergiasRevisadas(data, m)) ninguna.push(m.name);
    else sinPreguntar.push(m.name);
  }
  const partes = [...porAlergia].map(([als, quienes]) => `${lista(quienes)}: alergia a ${als}`);
  if (ninguna.length) partes.push(`${lista(ninguna)}: ninguna`);
  if (porSilencio.length) partes.push(`${lista(porSilencio)}: ninguna (por silencio)`);
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
    const edad = edadDe(m);
    const meses = edad != null ? Math.round(edad * 12) : null;
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
    const no = vetosDePersona(m).slice(0, Math.min(3, 8 - dislikesPuestos));
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

function cocinaBloque(data, hoy) {
  const lineas = [];
  const comidas = comidasDeLaCasa(data).map((id) => comidaDelCatalogo(id)?.nombre ?? id);
  const estructura = { primero_segundo: "primero y segundo", plato_unico: "plato único", unico: "plato único", "1_plato": "plato único" };
  const est = [
    comidasDeLaCasa(data).includes("Comida") && data.mealStructure ? `Comida: ${estructura[data.mealStructure] ?? data.mealStructure}` : "",
    comidasDeLaCasa(data).includes("Cena") && data.mealStructureCena ? `Cena: ${estructura[data.mealStructureCena] ?? data.mealStructureCena}` : "",
  ].filter(Boolean);
  lineas.push(`- Se planifican: ${lista(comidas)}${est.length ? `. ${est.join(". ")}` : ""}.`);
  const ct = data.cookTime;
  if (ct?.weekday) {
    const ent = Math.max(ct.weekday.Comida ?? 0, ct.weekday.Cena ?? 0);
    const fin = Math.max(ct.weekend?.Comida ?? 0, ct.weekend?.Cena ?? 0);
    lineas.push(`- Tiempo: entre semana ~${ent} min; finde ~${fin}.${data.cookLevel && data.cookLevel !== "normal" ? ` Nivel: ${data.cookLevel}.` : ""}`);
  }
  const trastos = [...(data.kitchenTools ?? []), ...(data.customKitchenTools ?? [])];
  if (trastos.length) lineas.push(`- Aparatos: ${trastos.join(", ")}.`);
  const tanda = tandaPedida(data);
  if (tanda) lineas.push(`- ${tanda}.`);
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
    const ventana = c.desde && c.desde > hoy ? ` (desde ${diaMes(c.desde)})` : c.hasta ? ` (hasta ${diaMes(c.hasta)})` : "";
    return `${etiquetaDe(id)}: ${detalle || ""}${valor}${ventana}`.replace(/: \(/, ": (");
  };
  // Por matiz (notepad.js): lo que la familia escribió en el panel no lleva
  // fuente y es dicho. Lo visto y lo supuesto van juntos: Lola no los da por
  // hechos. Fuera queda lo caducado; lo que empieza más adelante sí entra,
  // con su «desde», para que Lola lo sepa.
  // Los rechazados («no, eso no es así») quedan con valor undefined: no son nada.
  const cuenta = ([, c]) => c.valor !== undefined && (vigente(c, hoy) || (c.desde && c.desde > hoy && (!c.hasta || c.hasta >= hoy)));
  const vivos = campos.filter(cuenta);
  const dicho = vivos.filter(([, c]) => matizDe(c) === "dicho");
  const supuesto = vivos.filter(([, c]) => matizDe(c) === "visto" || matizDe(c) === "supuesto");
  if (dicho.length) lineas.push(`- Dicho: ${dicho.slice(0, 3).map(texto).join("; ")}${dicho.length > 3 ? `; +${dicho.length - 3} (ver_ajustes)` : ""}.`);
  if (supuesto.length) lineas.push(`- Supuesto: ${supuesto.slice(0, 2).map(texto).join("; ")}${supuesto.length > 2 ? `; +${supuesto.length - 2} (ver_ajustes)` : ""}.`);
  // Lo que ya le dijeron que no: los dos últimos, para no volver a suponerlo.
  const rechazados = rechazadosDe(data.notepad).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).slice(-2);
  if (rechazados.length) lineas.push(`- No volver a suponer: ${rechazados.map((r) => texto([r.path, { valor: r.valor }])).join("; ")}.`);
  // Las reglas de siempre («En casa sin carne los Lun»); las que caducan van en AHORA.
  const fijas = (data.reglas ?? []).filter((r) => !r?.vigencia?.hasta);
  if (fijas.length) lineas.push(`- Reglas: ${fijas.slice(0, 3).map((r) => describirRegla(r, data)).join("; ")}${fijas.length > 3 ? `; +${fijas.length - 3} (ver_ajustes)` : ""}.`);
  // Los de la casa, de la libreta, con la fecha de hoy y con su ámbito
  // («cebolla (niños)», lib/vetos.js); los de cada persona ya salen en CASA.
  const nunca = vetosConAmbito(data, { hoy }).map(textoDeVeto);
  if (nunca.length) lineas.push(`- Nunca: ${nunca.slice(0, 6).join(", ")}${nunca.length > 6 ? `, +${nunca.length - 6}` : ""}.`);
  const fijos = (data.fixedDishes ?? []).map((f) => f?.name ?? f?.nombre ?? f?.recipeName).filter(Boolean);
  if (fijos.length) lineas.push(`- Fijos: ${fijos.slice(0, 4).join(", ")}.`);
  if (data.hasBudget && data.budget) lineas.push(`- Presupuesto: ${data.budget} €/semana.`);
  return lineas;
}

// ── RECETARIO ───────────────────────────────────────────────────────────────

function recetarioBloque(propias) {
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
  for (const franja of comidasDeLaCasa(casa.state?.data ?? {})) {
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
  const lineas = [cabeceraDia(hoy)];
  // AHORA: las reglas que caducan (invitados, temporales) y siguen vivas. Las
  // de siempre van en COCINA, que no cambia cada día.
  const vigentes = (data.reglas ?? []).filter((r) => r?.vigencia?.hasta && r.vigencia.hasta >= hoy);
  if (vigentes.length) lineas.push("AHORA", ...vigentes.slice(0, 3).map((r) => `- ${describirRegla(r, data)}.`));
  // YA PASÓ: lo de los últimos días que la charla todavía recuerda (memoria de
  // 3 días). Sin esto, Lola leía «✅ apuntado» en la charla, no lo veía aquí y
  // lo volvía a guardar, en el sábado de la semana siguiente.
  const pasadas = recienPasadoPorDia(data, hoy);
  if (pasadas.length) lineas.push("YA PASÓ (guardado y hecho; no lo repitas)", ...pasadas.map((l) => `- ${l}.`));
  // MENÚ: rangos, hoy y mañana, nevera.
  const semanas = casa.semanas ?? [];
  const vivas = semanas.filter((w) => w.weekEnd >= hoy);
  if (!vivas.length) {
    lineas.push(semanas.length ? `MENÚ: el último (${ddmm(semanas.at(-1).weekStart)}–${ddmm(semanas.at(-1).weekEnd)}) ya pasó; no hay menú para esta semana.` : "MENÚ: todavía no hay ninguno.");
  } else {
    const nombre = nombrador(casa);
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
  // PENDIENTE: primero, lo de seguridad. Con BOT_FICHA_RPC llega ya calculado
  // de «faltan» (fichaRpc.js, conLaFicha); sin ella, del JSON.
  const sinPreguntar = extras.pendientes ?? preguntasPendientes(data, extras.calladas ?? new Set());
  if (sinPreguntar.length) lineas.push("PENDIENTE", `- ¿${lista(sinPreguntar.map((p) => p.nombre))} ${sinPreguntar.length > 1 ? "tienen" : "tiene"} alguna alergia o intolerancia?`);
  return lineas;
}

// ── Montaje y recorte ───────────────────────────────────────────────────────

/**
 * @param {object} casa  lo que devuelve cargarCasa
 * @param {{ nevera?: string[], avisos?: string[], calladas?: Set<string>, pendientes?: { clave: string, nombre: string }[] }} [extras]
 * @param {string} [hoy] ISO, para las pruebas
 * @returns {{ estable: string, delDia: string }}
 */
export function montarFicha(casa, extras = {}, hoy = hoyMadrid()) {
  const data = casa?.state?.data ?? {};
  if (!(data.members ?? []).length) {
    return { estable: "SEGURIDAD: SIN REVISAR · PARA EMPEZAR FALTA: quién come · alergias · comidas", delDia: cabeceraDia(hoy) };
  }
  // Las secciones en el orden en que se recortan si no cabe (la última, nunca).
  const secciones = {
    seguridad: seguridad(data),
    casa: casaBloque(data),
    cocina: cocinaBloque(data, hoy),
    recetario: recetarioBloque(propiasDe(casa)),
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

const hoyMadrid = () => isoDeCasa();

/**
 * Lo que la ficha necesita y no está en el JSON de la casa: lo cocinado que
 * espera en la nevera o el congelador, y los avisos programados del chat. Dos
 * consultas pequeñas, en paralelo con el resto del turno.
 */
export async function extrasDeFicha(householdId, chatId) {
  const [nevera, avisos] = await Promise.all([
    select("user_pantry", `household_id=${eq(householdId)}&item_type=eq.cooked_dish&order=cooked_at.desc&limit=5`, "ingredient_name,portions,frozen")
      .then((fs) => fs.map((p) => `${p.portions ?? 1} raciones de ${p.ingredient_name} (${p.frozen ? "congelador" : "nevera"})`))
      // Sin nevera la ficha sigue valiendo, pero que se vea en el log: pedir
      // una columna que no existe (`name` en vez de `ingredient_name`) la dejó
      // en blanco desde el primer día sin que nadie se enterase.
      .catch((e) => { console.error("[ficha] nevera", e?.message); return []; }),
    chatId != null
      ? select("bot_reminders", `chat_id=${eq(String(chatId))}&status=eq.pending&order=due_at.asc&limit=3`, "text,due_at,repite")
        .then((fs) => fs.map((r) => `${r.text}${r.repite ? ` (${r.repite})` : ""}`))
        .catch((e) => { console.error("[ficha] avisos", e?.message); return []; })
      : [],
  ]);
  return { nevera, avisos };
}
