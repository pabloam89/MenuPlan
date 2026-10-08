/**
 * El menú, la compra y las recetas de una casa, leídos y cambiados desde el
 * servidor EXACTAMENTE como los guarda la app (mapa de datos del 30 sep 2026):
 *
 *   · plan: `{ _warnings, [groupId]: { "Lun-Comida": hueco, … } }`. En la
 *     comida, `firstRecipeId` es el primero y `recipeId` el segundo; en una
 *     cena de plato único solo `recipeId`.
 *   · los ids de receta pueden llevar el prefijo `${groupId}__`; el nombre se
 *     resuelve con RECIPES_BY_ID, que hay que rellenar con las recetas de la
 *     casa (`state.aiRecipes` + la foto de `user_menu_recipes`).
 *   · compra: `{ items }` con `have` (comprado), `atHome` (ya en casa),
 *     `fromPantry` (lo cubre la despensa) y `manual` (añadido a mano).
 *
 * El motor (solver, compra) viene empaquetado en ./core.mjs y se carga la
 * primera vez que hace falta: son 10 MB y la mayoría de mensajes no lo usan.
 */

import { select, insert, eq } from "./db.js";
import { conCasa, cargarCasa, hoyISO } from "./casa.js";
import { propiasDe } from "./propias.js";
import { rastro } from "./embudo.js";
import { IDS_COMIDAS, COMIDAS_PRINCIPALES, COMIDAS, comidaDe } from "../../src/lib/comidas.js";
import { RASTRO, MOTIVO_CAMBIO, idBase } from "../../src/lib/rastro.js";
import { restriccionesDeFuera, conQuienViene, describirDeFuera } from "./deFuera.js";
import { EJE_POR_ID, puedeResponder } from "../../src/data/axisRegistry.js";
import { EJES } from "./esquemas.js";
import { PERFILES, ordenarPorPerfil } from "../../src/lib/derive/perfiles.js";
import { etapaDe } from "../../src/lib/stages.js";
import { vetosDePersona } from "../../src/lib/vetos.js";

let motorCargado = null;
// Las recetas que trae el motor de serie (antes de registrar ninguna casa).
let recetasDeSerie = null;
export const motor = async () => {
  if (!motorCargado) {
    const m = await import("./core.mjs");
    recetasDeSerie ??= new Set(Object.keys(m.RECIPES_BY_ID));
    motorCargado = m;
  }
  return motorCargado;
};
/** Las recetas de serie del motor ya cargado (vacío si aún no se cargó). */
export const deSerieDelMotor = () => recetasDeSerie ?? new Set();
// Los tests pasan src/server/botCore.js: en CI no existe core.mjs.
export function usarMotor(m) {
  recetasDeSerie ??= new Set(Object.keys(m.RECIPES_BY_ID ?? {}));
  motorCargado = m;
}

/**
 * El motor con un RECIPES_BY_ID que solo enseña lo de esta casa: sus recetas
 * registradas, las de serie y las del catálogo común. El registro del motor es
 * de toda la instancia, y Vercel reutiliza instancias entre casas: sin esto, al
 * buscar una receta por nombre salía la receta propia de otra casa.
 * `registerRecipes` sigue escribiendo en el registro global y suma a lo visible.
 */
export function recetasDeCasa(m, deSerie, propias) {
  const visible = (id) => typeof id === "string"
    && (propias.has(id) || deSerie.has(id) || Boolean(m.recipeCatalogById?.[idBase(id)]));
  const vista = new Proxy(m.RECIPES_BY_ID, {
    get: (t, id) => (visible(id) ? t[id] : undefined),
    has: (t, id) => visible(id) && id in t,
    ownKeys: (t) => Reflect.ownKeys(t).filter(visible),
    getOwnPropertyDescriptor: (t, id) => (visible(id) ? Reflect.getOwnPropertyDescriptor(t, id) : undefined),
  });
  return Object.create(m, {
    RECIPES_BY_ID: { value: vista },
    registerRecipes: {
      value: (extra) => {
        m.registerRecipes(extra);
        for (const r of Array.isArray(extra) ? extra : []) if (r?.id) propias.add(r.id);
      },
    },
  });
}

// El lector de nutrientes y los derivados salen del bundle: src/lib/nutricionPlato.js
// arrastra el catálogo, que no se carga en Node a secas.
let nutricion = null;
// Los tests lo pasan directamente: en CI no existe core.mjs (sale del build).
export function usarNutricion(n) { nutricion = n; }
export async function prepararNutricion() {
  if (!nutricion) {
    const m = await motor();
    nutricion = { nutrienteDe: m.nutrienteDe, crudoDe: m.crudoDe, completitudDe: m.completitudDe, densidadDe: m.densidadDe, cargaDe: m.cargaDe };
  }
  return nutricion;
}

// Las comidas salen del catálogo (src/lib/comidas.js): una sola lista.
const FRANJAS = IDS_COMIDAS;
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_LARGO = { Lun: "lunes", Mar: "martes", "Mié": "miércoles", Jue: "jueves", Vie: "viernes", "Sáb": "sábado", Dom: "domingo" };

/** Sin tildes ni mayúsculas, para comparar lo que escribe la gente. */
export const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Lo que escribe la gente, literal dentro de un regex. */
const escapar = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** «martes», «mar», «Mar» → "Mar". */
export function diaDe(texto) {
  // «el jueves», «jueves 8», «mié.»: sin artículo ni punto final.
  const t = normal(texto).replace(/^el\s+/, "").replace(/\.$/, "");
  if (!t) return null;
  // La abreviatura entera («mar») o el nombre como palabra («martes», «martes 6»);
  // antes bastaban las tres primeras letras, y «marzo» era martes.
  for (const d of DIAS) if (normal(d) === t || new RegExp(`^${normal(DIA_LARGO[d])}(\\s|$)`).test(t)) return d;
  if (t === "hoy") return hoy();
  if (t === "manana") return DIAS[(DIAS.indexOf(hoy()) + 1) % 7];
  return null;
}

/** El día de hoy en España, con las claves de la app. */
export function hoy() {
  const n = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Madrid" }).format(new Date());
  return { Mon: "Lun", Tue: "Mar", Wed: "Mié", Thu: "Jue", Fri: "Vie", Sat: "Sáb", Sun: "Dom" }[n];
}

// ── Fechas ──────────────────────────────────────────────────────────────────
// El plan se guarda por día de la semana («Mié-Cena»), pero un menú puede
// tener varias semanas y la activa puede no ser la de hoy. Así que «hoy» o
// «el jueves» se resuelven a una FECHA, y la fecha a la semana que la tiene.

const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaDeFecha = (iso) => DIAS[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];
const lunesDe = (iso) => sumarDias(iso, -DIAS.indexOf(diaDeFecha(iso)));
const semanaConFecha = (casa, iso) => (casa.semanas ?? []).find((w) => w.weekStart <= iso && iso <= w.weekEnd) ?? null;
const fechaCorta = (iso) => `${DIA_LARGO[diaDeFecha(iso)]} ${Number(iso.slice(8, 10))}`;

export function rangosDelMenu(casa) {
  const ss = casa.semanas ?? [];
  if (!ss.length) return "No hay ningún menú activo.";
  return `El menú activo tiene: ${ss.map((w) => `del ${fechaCorta(w.weekStart)} al ${fechaCorta(w.weekEnd)}`).join(" y ")}.`;
}

/**
 * «hoy», «mañana», «jueves» (+ «esta»/«siguiente» si lo dicen) → la fecha y
 * la casa apuntando a la semana del menú que la contiene. Un día suelto sin
 * semana es el próximo que cae (hoy incluido) que tenga menú; si ninguno
 * tiene, el de esta semana.
 * @returns {{ dia: string, fecha: string, casa: object } | { error: string }}
 */
export function resolverDia(casa, texto, semana = null) {
  const t = normal(texto);
  const hoy = hoyISO();
  let fecha = null;
  if (t === "hoy" || t === "esta noche") fecha = hoy;
  else if (t === "manana") fecha = sumarDias(hoy, 1);
  else if (t === "pasado manana") fecha = sumarDias(hoy, 2);
  else {
    const d = diaDe(texto);
    if (!d) return { error: `No entiendo el día «${texto}».` };
    const deEsta = sumarDias(lunesDe(hoy), DIAS.indexOf(d));
    if (semana === "siguiente") fecha = sumarDias(deEsta, 7);
    else if (semana === "esta") fecha = deEsta;
    else {
      const proxima = deEsta >= hoy ? deEsta : sumarDias(deEsta, 7);
      fecha = [proxima, deEsta].find((f) => semanaConFecha(casa, f)) ?? proxima;
    }
  }
  const s = semanaConFecha(casa, fecha);
  if (!s) {
    return { error: `No hay menú para el ${fechaCorta(fecha)} (${fecha}). ${rangosDelMenu(casa)} Si lo quieren, generar_menu para esa semana: las otras semanas del menú se conservan.` };
  }
  return { dia: diaDeFecha(fecha), fecha, casa: { ...casa, semana: s } };
}

/** «esta» / «siguiente» → la casa apuntando a esa semana, o un error. */
function casaDeSemana(casa, semana) {
  if (!semana) return { casa };
  const lunes = sumarDias(lunesDe(hoyISO()), semana === "siguiente" ? 7 : 0);
  const s = (casa.semanas ?? []).find((w) => w.weekEnd >= lunes && w.weekStart <= sumarDias(lunes, 6));
  if (!s) return { error: `No hay menú para ${semana === "siguiente" ? "la semana que viene" : "esta semana"}. ${rangosDelMenu(casa)}` };
  return { casa: { ...casa, semana: s } };
}

export function franjaDe(texto) {
  const t = normal(texto);
  // Con sus sinónimos del catálogo: «almuerzo» es la comida, «picoteo» el aperitivo.
  return comidaDe(t);
}

/** Registra en el motor las recetas de la casa para poder resolver ids. */
export async function prepararRecetas(casa) {
  const global = await motor();
  // Lo que es de esta casa: lo que registra ahora, lo que sale en sus menús y sus recetas propias.
  const propias = new Set();
  for (const s of [casa.semana, ...(casa.semanas ?? [])]) {
    for (const [gid, huecos] of Object.entries(s?.plan ?? {})) {
      if (gid.startsWith("_")) continue;
      for (const h of Object.values(huecos ?? {})) for (const id of [h?.firstRecipeId, h?.recipeId]) if (id) propias.add(id).add(idBase(id));
    }
  }
  for (const r of propiasDe(casa)) if (r?.id) propias.add(r.id);
  const m = recetasDeCasa(global, recetasDeSerie ?? new Set(), propias);
  if (Array.isArray(casa.state?.aiRecipes) && casa.state.aiRecipes.length) m.registerRecipes(casa.state.aiRecipes);
  if (casa.menu) {
    const filas = await select(
      "user_menu_recipes",
      `household_id=${eq(casa.householdId)}&menu_id=${eq(casa.menu.id)}`,
      "recipe_snapshot",
    );
    const fotos = filas.map((f) => f.recipe_snapshot).filter(Boolean);
    if (fotos.length) m.registerRecipes(fotos);
  }
  repararGrupos(m, casa);
  return m;
}

/**
 * Las casas creadas desde el chat no guardaban sus grupos: generar los sacaba
 * del modelo (groupsFromModel) para el plan y no los escribía en la casa. El
 * plan tenía grupos que `data.groups` no conocía, y el motor, al buscar el
 * grupo de un hueco, no encontraba nada: proponer y cambiar un plato salían
 * vacíos («no hay otras recetas que encajen»), y el menú enseñaba «grupo 1».
 *
 * generar.js ya los guarda (30 sep 2026). Para las casas de antes se rehacen
 * aquí, en memoria: los mismos grupos del modelo, con los ids del plan por
 * orden (el plan los crea en ese mismo orden). Solo si cuadran en número.
 *
 * Desde oct 2026 los grupos conservan su id al rehacerse (conservarIds,
 * lib/groups.js), así que esto ya no hace falta para lo nuevo: solo para los
 * menús guardados antes. Quitarlo cuando no quede ninguna semana viva generada
 * antes del 30 sep 2026 con grupos que la casa no conoce.
 */
function repararGrupos(m, casa) {
  const data = casa.state?.data;
  const plan = casa.semana?.plan;
  if (!data || !plan || !(data.members ?? []).length) return;
  const ids = Object.keys(plan).filter((k) => !k.startsWith("_"));
  const conocidos = new Set((data.groups ?? []).map((g) => g?.id));
  if (!ids.length || ids.every((id) => conocidos.has(id))) return;
  const modelo = m.groupsFromModel(data.members, m.resolveModeData(data).menuModel);
  if (modelo.length !== ids.length) return;
  casa.state.data = { ...data, groups: ids.map((id, i) => ({ ...modelo[i], id })) };
}

/**
 * Los grupos QUE TIENE EL MENÚ, no los de la casa: si la familia cambió después
 * de generar (pasó en la casa de Pablo: menú con tres grupos, casa con dos y
 * otros ids), los de la casa no casan con las claves del plan. El nombre se
 * toma de la casa cuando coincide; si no, se deduce de quién come.
 */
export function grupos(casa) {
  const plan = casa.semana?.plan;
  const deLaCasa = (casa.state?.data?.groups ?? []).filter((g) => g?.id);
  if (!plan) return deLaCasa;
  const ids = Object.keys(plan).filter((k) => !k.startsWith("_"));
  return ids.map((id, i) => {
    const g = deLaCasa.find((x) => x.id === id);
    if (g) return g;
    // Sin nombre en la casa: se deduce de lo que come. Los ids de receta del
    // grupo del bebé vienen del catálogo de bebés (`…__bebes_…`).
    const huecos = Object.values(plan[id] ?? {});
    const deBebe = huecos.some((h) => /(^|__)bebes_/.test(h?.recipeId ?? ""));
    const comensales = huecos.map((h) => h?.eaters).find((n) => n != null);
    return { id, label: deBebe ? "el bebé" : comensales > 1 ? "los mayores" : `grupo ${i + 1}` };
  });
}

// ── Leer ────────────────────────────────────────────────────────────────────

export function describirCasa(casa) {
  const d = casa.state?.data ?? {};
  const miembros = (d.members ?? []).map((p) => {
    const alergias = [...(p.allergies ?? []), ...(p.intolerances ?? [])].filter(Boolean);
    const cuerpo = p.pesoKg && p.alturaCm ? `, ${p.pesoKg} kg y ${p.alturaCm} cm` : "";
    const noLeGusta = vetosDePersona(p);
    return `• ${p.name ?? "(sin nombre)"}${p.age != null ? `, ${p.age} años` : ""}${cuerpo}${alergias.length ? ` — alergias/intolerancias: ${alergias.join(", ")}` : ""}${noLeGusta.length ? ` — no le gusta: ${noLeGusta.join(", ")}` : ""}`;
  });
  return [
    `Miembros:\n${miembros.join("\n") || "(ninguno todavía)"}`,
    // Por personas: Lola no debe nombrar los grupos internos («Niños», «Bebé»).
    `Quién come junto (cada línea, un menú): ${(d.groups ?? []).map((g) => quienesDe(g, d.members ?? [])).filter(Boolean).join("; ") || "(sin repartir)"}`,
    `Comidas que se planifican: ${(d.meals ?? []).join(", ") || "Comida, Cena"}`,
    rangosDelMenu(casa),
    `Hoy es ${fechaCorta(hoyISO())} (${hoyISO()}).`,
  ].join("\n");
}

/**
 * Añade a `fotos` (si se pasa) la foto de catálogo de una receta, para que el
 * webhook la mande junto al texto. Sin foto (receta propia, fruta…), nada.
 */
function apuntarFoto(m, fotos, receta, pie) {
  if (!fotos || !receta) return;
  // Por id o con la receta a mano. RECIPES_BY_ID solo tiene las registradas
  // (las del menú); las del catálogo que se proponen no están, pero la foto
  // sale igual de su id.
  const r = typeof receta === "string"
    ? m.RECIPES_BY_ID[receta] ?? m.RECIPES_BY_ID[receta.split("__").pop()] ?? { id: receta }
    : receta;
  const url = m.dishImageForRecipe(r);
  if (url && !fotos.some((f) => f.url === url)) fotos.push({ url, pie: pie ?? r.name ?? "" });
}

/** @param {{ dia?: string, fecha?: string, fotos?: any[] }} [opts] `dia` ya resuelto (resolverDia) */
export async function describirMenu(casa, { dia, fecha, fotos = null } = {}) {
  if (!casa.semana?.plan) return "No hay ningún menú activo en esta casa.";
  const m = await prepararRecetas(casa);
  // Un menú de una semana que ya pasó no es «lo de hoy»: se dice.
  const aviso = casa.semana.weekEnd < hoyISO()
    ? `Ojo: el menú activo es de la semana del ${casa.semana.weekStart} al ${casa.semana.weekEnd}, que ya pasó; no hay menú para esta semana todavía.\n\n`
    : `Semana del ${fechaCorta(casa.semana.weekStart)} al ${fechaCorta(casa.semana.weekEnd)}.${(casa.semanas ?? []).length > 1 ? ` ${rangosDelMenu(casa)}` : ""}\n\n`;
  const nombre = (id) => {
    if (!id) return null;
    const r = m.RECIPES_BY_ID[id] ?? m.RECIPES_BY_ID[id.split("__").pop()];
    if (!r) return id;
    const c = cambiosDe(r);
    return c ? `${r.name} (${c}; dilo al enseñarlo)` : r.name;
  };
  const plan = casa.semana.plan;
  // Solo los días activos de la semana, como la app: el motor genera la semana
  // entera, pero si empezó un miércoles, el lunes y el martes no cuentan.
  const activos = casa.semana.activeDays?.length ? casa.semana.activeDays : DIAS.slice(casa.semana.startDayIdx ?? 0);
  const dias = dia ? [dia] : activos;
  const lineas = [];
  for (const d of dias) {
    const delDia = [];
    for (const f of FRANJAS) {
      // Los grupos que comen lo mismo, juntos: si todos comen igual, una sola
      // línea sin nombres.
      const porPlatos = new Map();
      let conHueco = 0;
      for (const g of grupos(casa)) {
        const hueco = plan[g.id]?.[`${d}-${f}`];
        if (!hueco) continue;
        conHueco++;
        const primero = nombre(hueco.firstRecipeId);
        const principal = nombre(hueco.recipeId);
        // Fotos solo cuando se pregunta por UN día: la semana entera serían
        // catorce fotos de golpe.
        if (dia) {
          apuntarFoto(m, fotos, hueco.firstRecipeId);
          apuntarFoto(m, fotos, hueco.recipeId);
        }
        const platos = primero && principal ? `primero ${primero}; segundo ${principal}` : primero || principal || "(vacío)";
        if (!porPlatos.has(platos)) porPlatos.set(platos, []);
        porPlatos.get(platos).push(quienesDe(g, casa.state?.data?.members ?? []) ?? g.label);
      }
      for (const [platos, quienes] of porPlatos) {
        const quien = porPlatos.size > 1 && conHueco > 1 ? ` (${quienes.join(" y ")})` : "";
        delDia.push(`  ${f}${quien}: ${platos}`);
      }
    }
    // Con su fecha también en la semana: Lola pone el día con fecha («Jueves 1
    // de octubre») y sin ella se la inventaba.
    const suFecha = dia && fecha ? fecha : sumarDias(lunesDe(casa.semana.weekStart), DIAS.indexOf(d));
    if (delDia.length) lineas.push(`${fechaCorta(suFecha)} (${suFecha}):\n${delDia.join("\n")}`);
  }
  return aviso + (lineas.length ? lineas.join("\n") : `No hay nada planificado${dia ? ` el ${DIA_LARGO[dia]}` : ""}.`);
}

/** ver_menu: un día (por su fecha real) o una semana del menú activo. */
export async function verMenu(casa, { dia, semana, fotos = null } = {}) {
  if (dia) {
    const rd = resolverDia(casa, dia, semana);
    if (rd.error) return rd.error;
    return describirMenu(rd.casa, { dia: rd.dia, fecha: rd.fecha, fotos });
  }
  const cs = casaDeSemana(casa, semana);
  return cs.error ?? describirMenu(cs.casa);
}

export async function describirReceta(casa, consulta) {
  const m = await prepararRecetas(casa);
  const q = normal(consulta);
  const idsDelPlan = new Set();
  for (const [gid, huecos] of Object.entries(casa.semana?.plan ?? {})) {
    if (gid.startsWith("_")) continue;
    for (const h of Object.values(huecos ?? {})) for (const id of [h?.firstRecipeId, h?.recipeId]) if (id) idsDelPlan.add(id);
  }
  // Primero las del menú (son de las que se suele preguntar), luego el resto.
  const candidatas = [...idsDelPlan].map((id) => m.RECIPES_BY_ID[id]).filter(Boolean);
  const todas = [...candidatas, ...Object.values(m.RECIPES_BY_ID)];
  const palabras = q.split(/\s+/).filter((w) => w.length > 2);
  const r = todas.find((x) => normal(x?.name) === q)
    ?? todas.find((x) => palabras.length && palabras.every((w) => new RegExp(`\\b${escapar(w)}`).test(normal(x?.name))));
  if (!r) return `No encuentro ninguna receta que se llame así («${consulta}»).`;
  const ing = (r.ingredients ?? []).map((i) => `• ${i.name}${i.qty ? ` — ${i.qty}${i.unit ? ` ${i.unit}` : ""}` : ""}`);
  const pasos = (r.steps ?? []).map((p, i) => `${i + 1}. ${typeof p === "string" ? p : p?.text ?? ""}`);
  const datos = [r.time ? `${r.time} min` : "", r.servings ? `${r.servings} raciones` : ""].filter(Boolean).join(", ");
  return [
    `${r.name}${datos ? ` (${datos})` : ""}`,
    ing.length ? `Ingredientes:\n${ing.join("\n")}` : "",
    pasos.length ? `Pasos:\n${pasos.join("\n")}` : "Sin pasos guardados.",
  ].filter(Boolean).join("\n\n");
}

const activo = (it) => !it.have && !it.atHome && !it.fromPantry;

/**
 * La lista de la compra con la que se trabaja: la de la semana del menú o,
 * si no hay menú, la de la casa (`state.shopping`, la que enseña la app).
 * Sin esto, «apunta leche y pan» sin menú pedía generar una semana entera.
 */
function listaDe(casa) {
  return casa.semana?.shopping ?? casa.state?.shopping ?? { items: [] };
}

/** Lo que devuelve un cambio de `conCasa` para guardar la lista donde vive. */
function guardarLista(casa, shopping) {
  return casa.semana
    ? { state: { ...casa.state, shopping }, semana: { shopping } }
    : { state: { ...casa.state, shopping } };
}

export function describirCompra(casa) {
  const items = listaDe(casa).items ?? [];
  if (!items.length) return "La lista de la compra está vacía.";
  const porCategoria = new Map();
  for (const it of items.filter(activo)) {
    const c = it.category || "Otros";
    if (!porCategoria.has(c)) porCategoria.set(c, []);
    porCategoria.get(c).push(`• ${it.name}${it.displayQty ? `, ${it.displayQty}` : it.qty ? `, ${it.qty}${it.unit ? ` ${it.unit}` : ""}` : ""}`);
  }
  const hechas = items.filter((it) => it.have).length;
  const enCasa = items.filter((it) => it.atHome || it.fromPantry).length;
  const bloques = [...porCategoria].map(([c, l]) => `${c}:\n${l.join("\n")}`);
  return `${bloques.join("\n\n") || "No queda nada por comprar."}\n\n(${hechas} comprados, ${enCasa} ya en casa)`;
}

// ── Cambiar ─────────────────────────────────────────────────────────────────

/** Coincidencia por palabras enteras (\b), nunca por trozos: «pan» no es «panceta». */
function buscarItems(items, texto) {
  const q = normal(texto);
  const exacto = items.filter((it) => normal(it.name) === q);
  if (exacto.length) return exacto;
  const palabras = q.split(/\s+/).filter(Boolean);
  return items.filter((it) => palabras.every((w) => new RegExp(`\\b${escapar(w)}\\b`).test(normal(it.name))));
}

// `out` (opcional, en marcarCompra, anadirCompra, proponerPlatos, ideasSinMenu
// y cambiarPlato): se rellena con los DATOS de lo hecho, para las vías rápidas
// del enrutador (api/_bot/turno.js), que pintan la respuesta con plantillas
// sin pasar por Lola. El texto que devuelven, para Lola, no cambia.

// `soloSiClaro`: si algo es dudoso no se toca nada. La vía rápida lo usa:
// con dudas le pasa el turno a Lola, y no debe dejar escrito medio mensaje
// que Lola va a volver a hacer.
export async function marcarCompra(householdId, productos, estado, out = null, { soloSiClaro = false } = {}) {
  const resultado = { hechos: [], noEncontrados: [], dudosos: [] };
  const r = await conCasa(householdId, (casa) => {
    Object.assign(resultado, { hechos: [], noEncontrados: [], dudosos: [] });
    const items = (listaDe(casa).items ?? []).map((it) => ({ ...it }));
    if (!items.length) return null;
    for (const p of productos) {
      const encontrados = buscarItems(items, p);
      if (!encontrados.length) resultado.noEncontrados.push(p);
      else if (encontrados.length > 1) resultado.dudosos.push(`${p}: ${encontrados.map((x) => x.name).join(", ")}`);
      else {
        encontrados[0].have = estado === "comprado";
        resultado.hechos.push(encontrados[0].name);
      }
    }
    if (!resultado.hechos.length || (soloSiClaro && resultado.dudosos.length)) return null;
    return guardarLista(casa, { ...listaDe(casa), items });
  });
  if (out) Object.assign(out, { ok: r.ok, ...resultado });
  if (!r.ok) return `No he podido guardar la lista: ${r.error}.`;
  if (resultado.hechos.length) await rastro(householdId, RASTRO.COMPRA_MARCADA, { n: resultado.hechos.length, estado });
  return [
    resultado.hechos.length ? `Marcados como ${estado}: ${resultado.hechos.join(", ")}.` : "",
    resultado.noEncontrados.length ? `No están en la lista: ${resultado.noEncontrados.join(", ")}.` : "",
    resultado.dudosos.length ? `Hay varios parecidos, dime cuál: ${resultado.dudosos.join("; ")}.` : "",
  ].filter(Boolean).join("\n") || "No había lista de la compra.";
}

export async function anadirCompra(householdId, productos, out = null) {
  const r = await conCasa(householdId, (casa) => {
    const items = [...(listaDe(casa).items ?? [])];
    for (const p of productos) {
      const name = String(p).trim();
      if (!name) continue;
      items.push({
        id: `manual:${normal(name).replace(/\s+/g, "-")}:${Date.now().toString(36)}`,
        name, category: "Otros", unit: "", qty: null, displayQty: "",
        sources: [], have: false, atHome: false, manual: true, adapted: false,
      });
    }
    return guardarLista(casa, { ...listaDe(casa), items });
  });
  if (out) Object.assign(out, { ok: r.ok, anadidos: productos.map((p) => String(p).trim()).filter(Boolean) });
  if (!r.ok) return `No he podido guardar la lista: ${r.error}.`;
  return `Añadido a la compra: ${productos.join(", ")}.`;
}

/** El grupo y el hueco de un día y franja del menú activo, o por qué no hay. */
export function huecoDe(casa, { dia, franja, grupo, cual }) {
  if (!casa.semana?.plan) return { error: "No hay menú activo." };
  const gs = grupos(casa);
  const members = casa.state?.data?.members ?? [];
  // Sin decir para quién, el hueco de la familia: el grupo con más gente que
  // tenga esa comida, y el del bebé solo si no hay otro. Antes era el primero
  // que salía, y «cambia la cena del viernes» se la cambiaba solo a los niños.
  const conHueco = gs.filter((x) => casa.semana.plan[x.id]?.[`${dia}-${franja}`]);
  const porGente = (x) => (tipoDeGrupo(x, members) === "bebe" ? -1 : (x.memberIds ?? []).length);
  const g = grupo
    ? gs.find((x) => normal(x.label) === normal(grupo)) ?? grupoPara(gs, members, grupo)
    : [...conHueco].sort((a, b) => porGente(b) - porGente(a))[0];
  if (!g) return { error: `No encuentro ese hueco (${DIA_LARGO[dia]}, ${franja}${grupo ? `, ${grupo}` : ""}).` };
  const clave = `${dia}-${franja}`;
  const hueco = casa.semana.plan[g.id]?.[clave];
  if (!hueco) return { error: `El ${DIA_LARGO[dia]} no hay ${franja.toLowerCase()} planificada para ${quienesDe(g, members) ?? "ellos"}.` };
  // Un primero (entrante) que no estaba se AÑADE; nunca se cambia el principal
  // en su lugar. Antes, sin primero en el hueco, caía en silencio al principal:
  // «un entrante para la cena» → «Vamos con lomo» sustituyó la cena entera
  // (staging, 2 oct 2026).
  if (cual === "primero" && !(COMIDAS.find((c) => c.id === franja)?.platos ?? []).includes("primero")) {
    return { error: `${franja} no lleva primero: no cambio el plato que hay. Si quieren otro, que lo digan.` };
  }
  const course = cual === "primero" ? "first" : "main";
  return { gs, g, clave, hueco, course, anadir: course === "first" && !hueco.firstRecipeId };
}

// Cuántas candidatas se miran al buscar la que alguien ha elegido por su
// nombre: más que las que se enseñan, porque el botón puede ser de una lista
// anterior y el pool se reordena con cada cambio del menú.
const POOL_PARA_ELEGIR = 60;

/**
 * La receta de `candidatas` que nombra `texto`: exacta, o la que tenga todas
 * sus palabras (con frontera: «pollo» no es «repollo»). Así un botón corto
 * («Merluza salsa verde») encuentra «Merluza en salsa verde con almejas».
 */
export function candidataPorNombre(candidatas, texto) {
  const q = normal(texto);
  const exacta = candidatas.find((r) => normal(r.name) === q);
  if (exacta) return exacta;
  const palabras = q.split(/\s+/).filter((w) => w.length > 1);
  if (!palabras.length) return null;
  const todas = candidatas.filter((r) => palabras.every((w) => new RegExp(`\\b${escapar(w)}\\b`).test(normal(r.name))));
  return todas.length === 1 ? todas[0] : todas.find((r) => normal(r.name).startsWith(q)) ?? todas[0] ?? null;
}

// Palabras que no dicen qué plato es.
const VACIAS = new Set(["con", "del", "las", "los", "para", "una", "uno", "unos", "unas", "tipo", "algo", "plato", "receta", "rico", "rica", "facil", "rapido", "rapida"]);
// Por palabras enteras (se parte por lo que no es letra: sin trozos, «pollo»
// no es «repollo») y sin la -s del plural: «tortillas francesas» es
// «tortilla francesa».
const palabrasDe = (s) => normal(s).split(/[^a-z0-9]+/)
  .filter((w) => w.length > 2 && !VACIAS.has(w))
  .map((w) => (w.length > 4 ? w.replace(/s$/, "") : w));

/**
 * La receta de `candidatas` MÁS PARECIDA a lo que piden, aunque no se llame
 * así: cada palabra pedida suma 2 si está en el nombre y 1 si es un
 * ingrediente. La primera («salmón» en «salmón al horno con ensalada de
 * mango») dice qué plato es: tiene que estar, en el nombre o de ingrediente,
 * y cuenta el triple. Sin eso, una ensalada de lentejas ganaba por «ensalada».
 */
export function masParecida(candidatas, texto) {
  const pedidas = [...new Set(palabrasDe(texto))];
  if (!pedidas.length) return null;
  const [cabeza] = pedidas;
  // Lo de antes del «con» es el plato («salmón al horno»); lo de después, el
  // acompañamiento: pesa el doble lo primero.
  const delPlato = new Set(palabrasDe(normal(texto).split(/\bcon\b/)[0]));
  let mejor = null;
  for (const r of candidatas) {
    const enNombre = new Set(palabrasDe(r.name));
    const enIngredientes = new Set((r.ingredients ?? []).flatMap((i) => palabrasDe(i?.name ?? i?.ingredient)));
    if (!enNombre.has(cabeza) && !enIngredientes.has(cabeza)) continue;
    const peso = (w) => (w === cabeza ? 3 : delPlato.has(w) ? 2 : 1);
    const puntos = pedidas.reduce((s, w) => s + peso(w) * (enNombre.has(w) ? 2 : enIngredientes.has(w) ? 1 : 0), 0);
    // A igualdad, el nombre con menos cosas que no se han pedido.
    if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && enNombre.size < mejor.tam)) mejor = { r, puntos, tam: enNombre.size };
  }
  return mejor?.r ?? null;
}

// Lo que se mira para aproximar un plato pedido por su nombre: todo lo que el
// motor da por bueno en el hueco, no solo las primeras.
const POOL_PARA_APROXIMAR = 400;

/**
 * Las opciones que el motor da por buenas para un hueco, SIN cambiar nada: el
 * mismo pool que usa la app para las sugerencias del recetario (rol del hueco,
 * tope de tiempo, alergias, lo ya puesto en la semana, el cole y los gustos).
 */
/**
 * @param {{ dia: string, semana?: "esta"|"siguiente", franja: string, grupo?: string,
 *   cual?: string, n?: number, parecidoA?: string }} hueco
 *   `dia` tal cual lo dicen («hoy», «jueves»); `parecidoA`, un plato que
 *   piden por su nombre: las opciones salen ordenadas por parecido.
 */
export async function proponerPlatos(householdId, { dia: diaDicho = null, semana, franja: franjaDicha = null, grupo: grupoDicho = null, para = null, cual = "principal", n = 3, parecidoA = null, estilo = null, rasgos = null, ejes = null, perfil = null, deFuera = null }, fotos = null, out = null) {
  const cargada = await cargarCasa(householdId);
  // Lo que no pueden comer los invitados: lo filtra el motor (api/_bot/deFuera.js).
  const rf = restriccionesDeFuera(deFuera);
  const filtradoPara = rf ? ` Filtrado también para quien viene: ${describirDeFuera(rf)}.` : "";
  if (!cargada) return "Esta casa todavía no tiene datos en la nube.";
  // Nada obligatorio: sin día ni comida, la próxima que toca; «para los
  // mayores» → su grupo (el de la casa o el del plan, que pueden no coincidir).
  const { dia: diaPedido, franja } = cuandoPorDefecto({ dia: diaDicho, franja: franjaDicha }, horaMadrid());
  const miembros = cargada.state?.data?.members ?? [];
  const grupo = grupoDicho
    ?? grupoPara(grupos(cargada), miembros, para)?.label
    ?? grupoPara(cargada.state?.data?.groups ?? [], miembros, para)?.label
    ?? null;
  const rd = resolverDia(cargada, diaPedido, semana);
  // Sin menú para ese día, ideas igualmente: recomendar una cena no puede
  // obligar a generar la semana entera (pasó: «¿te genero el menú?» para una
  // cena de hoy).
  if (rd.error) return ideasSinMenu(cargada, { diaPedido, franja, grupo: grupoDicho, para, cual, n, estilo, rasgos, ejes, perfil }, fotos, out);
  const { casa, dia, fecha } = rd;
  const h = huecoDe(casa, { dia, franja, grupo, cual });
  if (h.error) return ideasSinMenu(cargada, { diaPedido, franja, grupo: grupoDicho, para, cual, n, estilo, rasgos, ejes, perfil }, fotos, out);
  const m = await prepararRecetas(casa);
  const res = m.pickCatalogReplacement(conQuienViene(casa.state?.data ?? {}, [h.g.id], rf), casa.semana.plan, {
    hoy: hoyISO(), groupId: h.g.id, day: dia, meal: franja, course: h.course, candidatos: parecidoA ? POOL_PARA_APROXIMAR : POOL_PARA_VARIAR, pedido: !!parecidoA,
  });
  // Rasgos, ejes y perfil filtran ANTES de ordenar y variar: variadas() elige
  // entre lo que ya cumple, no al revés.
  const actual = m.RECIPES_BY_ID[h.course === "first" ? h.hueco.firstRecipeId : h.hueco.recipeId];
  const nut = await prepararNutricion();
  const filtro = filtrarCandidatas(res?.candidatos ?? [], { rasgos, ejes, perfil, cual: h.course === "first" ? "primero" : "principal" }, baseDelHueco(m, h.hueco, h.course, nut), nut);
  const aviso = filtro.aviso;
  let lista = parecidoA ? res?.candidatos ?? [] : variadas(ordenParaVariar(filtro.lista, { ordenado: filtro.ordenado, estilo, n }), n);
  if (parecidoA) {
    // Las más parecidas primero; si ninguna se parece, las de siempre.
    const ordenadas = [];
    let resto = lista;
    while (ordenadas.length < n) {
      const r = masParecida(resto, parecidoA);
      if (!r) break;
      ordenadas.push(r);
      resto = resto.filter((x) => x !== r);
    }
    lista = ordenadas.length ? ordenadas : lista.slice(0, n);
  }
  if (!lista.length) {
    if (out) Object.assign(out, { conMenu: true, bloques: [], fecha, dia, franja });
    return `No hay otras recetas que encajen en ese hueco con vuestras alergias, gustos y tiempo.${filtradoPara}`;
  }
  if (out) {
    Object.assign(out, {
      conMenu: true, fecha, dia, franja, cual: h.course === "first" ? "primero" : "principal",
      // `grupo` es el interno (para volver a encontrar el hueco); `quienes`, para enseñar.
      grupo: h.gs.length > 1 ? h.g.label : null, quienes: h.gs.length > 1 ? quienesDe(h.g, casa.state?.data?.members ?? []) : null,
      actual: actual?.name ?? null, estilo, aviso,
      bloques: [{ grupo: h.gs.length > 1 ? h.g.label : null, quienes: h.gs.length > 1 ? quienesDe(h.g, casa.state?.data?.members ?? []) : null, opciones: lista }],
    });
  }
  const ahora = actual?.name ? `${actual.name}${detalleDe(actual, estilo) ? ` (${detalleDe(actual, estilo)})` : ""}` : null;
  const detalle = (r) => detalleDe(r, estilo);
  lista.forEach((r, i) => apuntarFoto(m, fotos, r, `${i + 1}. ${r.name}`));
  return [
    `Opciones para el ${fechaCorta(fecha)}, ${franja.toLowerCase()}${h.course === "first" ? " (primero)" : ""}${h.gs.length > 1 ? `, para ${quienesDe(h.g, casa.state?.data?.members ?? [])}` : ""}. Ahora mismo: ${ahora ?? "nada"}.${parecidoA ? ` Ordenadas por parecido a «${parecidoA}» (ninguna es exactamente eso salvo que se llame igual).` : ""}${estilo ? ` Las más ${estilo === "ligero" ? "ligeras" : "rápidas"} que encajan, variadas.` : ""}${aviso ? ` ${aviso}` : ""}${filtradoPara}`,
    ...lista.map((r, i) => `${i + 1}. ${r.name}${detalle(r) ? ` (${detalle(r)})` : ""}`),
    "Nada está cambiado aún: para poner una, cambiar_plato con receta = su nombre.",
  ].join("\n");
}

// Cuántas candidatas se piden para escoger `n` variadas.
const POOL_PARA_VARIAR = 40;

/** La hora en España, 0-23. */
function horaMadrid(ahora = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(ahora));
}

/**
 * Día y comida de una recomendación cuando no los dicen: la próxima comida que
 * toca. Sin esto proponer_platos los exigía y Lola preguntaba «¿para qué día?»
 * a quien solo quería ideas, y con la pregunta en medio perdía el hilo. Pura.
 */
export function cuandoPorDefecto({ dia = null, franja = null } = {}, hora) {
  // Para OTRO día que no es hoy, la hora de ahora no dice nada: «ideas para el
  // jueves» a las 12:00 no es la comida del jueves. Lo normal es la cena
  // (Pablo, 1 oct 2026: la cena es la comida familiar; a mediodía los niños
  // suelen estar en el cole).
  const otroDia = dia != null && !/^(hoy|esta noche)$/i.test(String(dia).trim());
  const [COMIDA, CENA] = COMIDAS_PRINCIPALES;
  const f = franja ?? (otroDia || hora >= 16 ? CENA : COMIDA);
  const pasada = (f === "Comida" && hora >= 16) || (f === "Cena" && hora >= 22);
  return { dia: dia ?? (pasada ? "mañana" : "hoy"), franja: f };
}

// Bebé, niño o mayor con la misma definición que la app (etapaDe): antes el bot
// cortaba el bebé en < 2 años (la app en ≤ 2) e ignoraba «ya come como un niño».
// Sin edad ni papel que lo diga, con los mayores.
export const esBebe = (p) => etapaDe(p).etapa === "bebe";
export const esMayor = (p) => ["adulto", "desconocida"].includes(etapaDe(p).etapa);

/**
 * Lo que se ha cambiado en un plato para que lo pueda comer quien tiene una
 * alergia o intolerancia («pan sin gluten», «leche sin lactosa»), para decirlo
 * al enseñarlo: «Tosta de sobrasada (con pan sin gluten)». "" si nada. Pura.
 */
export function cambiosDe(r) {
  const tos = [...new Set((r?.adaptations ?? []).map((a) => a?.to).filter(Boolean))];
  if (!tos.length) return "";
  const cosas = tos.map((t) => t[0].toLowerCase() + t.slice(1));
  return `con ${cosas.length === 1 ? cosas[0] : `${cosas.slice(0, -1).join(", ")} y ${cosas.at(-1)}`}`;
}

/**
 * Un grupo dicho con sus personas, que es como habla la gente: «Leo y Lucía»,
 * «Cova». Nunca el nombre interno («Niños», «Bebé», «grupo 2»): solo si no se
 * sabe quién hay, «los mayores», «los peques» o «el bebé». Pura, para el test.
 */
export function quienesDe(g, members = []) {
  if (!g) return null;
  const nombres = (g.memberIds ?? []).map((id) => members.find((p) => p.id === id)?.name).filter(Boolean);
  if (nombres.length && nombres.length <= 3) return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return { bebe: "el bebé", ninos: "los peques", mayores: "los mayores" }[tipoDeGrupo(g, members)];
}

/**
 * Qué come cada grupo: el del bebé (solo bebés), el de los mayores (hay algún
 * adulto: «Familia» come con ellos) o el de los niños. Sin miembros a la vista
 * (grupos deducidos del plan), por su nombre.
 */
function tipoDeGrupo(g, members = []) {
  const suyos = (g?.memberIds ?? []).map((id) => members.find((p) => p.id === id)).filter(Boolean);
  if (!suyos.length) return /beb/i.test(g?.label ?? "") ? "bebe" : /niñ|nin|peque/i.test(normal(g?.label)) ? "ninos" : "mayores";
  if (suyos.every(esBebe)) return "bebe";
  return suyos.some(esMayor) ? "mayores" : "ninos";
}

/**
 * El grupo al que se refiere «para los mayores / los niños / el bebé». «Con mi
 * mujer», «para nosotros» son los mayores: una cena de pareja no puede traer
 * purés. Null si la casa no tiene ese grupo. Pura.
 */
const SINONIMOS = [
  [/^(el |la |los |las )?(bebes?|bebe|peque(ñ|n)?[oa]? de la casa)$/, "bebe"],
  [/^(el |la |los |las )?(nin[oa]s?|peques|crios|hijos|chavales)$/, "ninos"],
  [/^(el |la |los |las )?(mayores|adultos|padres|nosotros|mi mujer|mi marido|mi pareja)$/, "mayores"],
];
export function grupoPara(gs, members, para) {
  if (!para) return null;
  const sinonimo = SINONIMOS.find(([re]) => re.test(normal(para)))?.[1];
  if (sinonimo) para = sinonimo;
  if (["mayores", "ninos", "bebe"].includes(para)) {
    // Con un solo menú para la familia, «los niños» comen en el de los
    // mayores: su menú es ese (el grupo donde come alguno), no ninguno.
    const conAlguno = (g) => (g.memberIds ?? []).some((id) => {
      const p = members.find((x) => x.id === id);
      return p && (para === "ninos" ? !esBebe(p) && !esMayor(p) : para === "bebe" ? esBebe(p) : esMayor(p));
    });
    return gs.find((g) => tipoDeGrupo(g, members) === para) ?? gs.find(conAlguno) ?? null;
  }
  // Una persona por su nombre («para Cova», «lo de Leo»): el grupo en el que
  // come. Si no está en ninguno, el de su tipo, con el mismo criterio de arriba.
  const quien = normal(para);
  const p = members.find((x) => normal(x.name) === quien) ?? members.find((x) => normal(x.name).split(/\s+/)[0] === quien.split(/\s+/)[0]);
  if (!p) return null;
  return gs.find((g) => (g.memberIds ?? []).includes(p.id))
    ?? gs.find((g) => tipoDeGrupo(g, members) === (esBebe(p) ? "bebe" : esMayor(p) ? "mayores" : "ninos"))
    ?? null;
}

/**
 * «Algo ligero», «algo rápido»: el pool del hueco ordenado por lo que piden,
 * antes de escoger las variadas. Sin esto la herramienta no sabía qué era
 * ligero, y Lola contestaba «no hay nada más ligero que lo que tenéis».
 * Las que no traen el dato van al final, no fuera. Pura, para el test.
 */
// «Ligero» por la etiqueta del catálogo (caloriasNivel, src/lib/caloriasNivel.js),
// que ya mide cada plato en su escala (un primero no es un segundo), y dentro
// de cada nivel por kcal. Ordena, no filtra: si no hay bastantes ligeras para
// n, siguen las medias, y nunca vuelve el «no hay nada».
const RANGO_CALORIAS = { ligero: 0, medio: 1, contundente: 2 };
export function segunEstilo(lista, estilo) {
  if (estilo === "ligero") {
    const rango = (r) => RANGO_CALORIAS[r.caloriasNivel] ?? 1;
    const kcal = (r) => (Number.isFinite(r.kcal) ? r.kcal : Infinity);
    return [...lista].sort((a, b) => rango(a) - rango(b) || kcal(a) - kcal(b));
  }
  const clave = estilo === "rapido" ? (r) => r.time : null;
  if (!clave) return lista;
  const con = lista.filter((r) => Number.isFinite(clave(r)));
  const sin = lista.filter((r) => !Number.isFinite(clave(r)));
  return [...con.sort((a, b) => clave(a) - clave(b)), ...sin];
}

/**
 * Tiempo y dificultad de una opción; con «ligero», también sus kcal para poder
 * explicarlo. Sin precio por ración: nadie lo pide al cambiar un plato y
 * ensuciaba la lista (Pablo, 7 oct 2026). «Algo barato» ya filtra por coste.
 */
const detalleDe = (r, estilo) => [cambiosDe(r), r.time ? `${r.time} min` : "", estilo === "ligero" && r.kcal ? `${Math.round(r.kcal)} kcal${r.caloriasNivel ? `, ${r.caloriasNivel}` : ""}` : "", r.difficulty ?? ""].filter(Boolean).join(", ");

/**
 * Rasgos que piden en voz alta: «algo reconfortante», «de cuchara», «que no
 * pique», «algo barato». Salen de los atributos del Recetario Estrella
 * (connotacion, textura, picante, sabor: scripts/recetas-atributos-blandos.mjs;
 * costeNivel: derive/coste.js; caloriasNivel). Una receta sin el dato NO pasa
 * el filtro: decir «barata» de una que no sabemos sería mentir.
 *
 * Si ninguna cumple, se devuelven las de siempre con un aviso para que Lola lo
 * diga, en vez de un «no hay nada».
 * @param {{ connotacion?: string, textura?: string, picante?: "sin"|"con", sabor?: string, coste?: string, calorias?: string }} [rasgos]
 */
export function conRasgos(lista, rasgos) {
  const r = rasgos ?? {};
  const pruebas = [
    r.connotacion && ((x) => (x.connotacion ?? []).includes(r.connotacion)),
    r.textura && ((x) => x.textura === r.textura),
    r.picante === "sin" && ((x) => x.picante === "no"),
    r.picante === "con" && ((x) => x.picante === "suave" || x.picante === "picante"),
    r.sabor && ((x) => (x.sabor ?? []).includes(r.sabor)),
    r.coste && ((x) => x.costeNivel === r.coste),
    r.calorias && ((x) => x.caloriasNivel === r.calorias),
  ].filter(Boolean);
  if (!pruebas.length) return { lista, aviso: null };
  const cumplen = lista.filter((x) => pruebas.every((p) => p(x)));
  if (cumplen.length) return { lista: cumplen, aviso: null };
  const pedido = Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ");
  return { lista, aviso: `(Ninguna que encaje cumple «${pedido}»: estas son las que hay. Dilo así.)` };
}

/** El valor de un eje (esquemas.js `EJES`) en un plato, o null. Los derivados, sobre la receta base. */
function valorDeEje(def, plato, nut) {
  if (def.campo) return nut.nutrienteDe(plato, def.campo).valor;
  const base = nut.crudoDe(plato);
  if (def.derivado === "densidad") return nut.densidadDe(base)?.valor?.kcal100g ?? null;
  const v = nut.cargaDe(base)?.valor;
  if (v?.proteinaPor100kcal == null || v?.fibraPor100kcal == null) return null;
  return v.proteinaPor100kcal + v.fibraPor100kcal;
}

/**
 * Los ejes como llegan del modelo, a una lista válida. A veces llegan como
 * cadena JSON o como un objeto suelto en vez de array. `invalidos` dice que
 * pidieron algo y no se entendió: no es lo mismo que no pedir nada.
 */
export function normalizarEjes(ejes) {
  if (ejes == null || ejes === "") return { pedidos: [], invalidos: false };
  let x = ejes;
  if (typeof x === "string") {
    try { x = JSON.parse(x); } catch { return { pedidos: [], invalidos: true }; }
  }
  if (x && typeof x === "object" && !Array.isArray(x)) x = [x];
  if (!Array.isArray(x)) return { pedidos: [], invalidos: true };
  const pedidos = x
    .filter((e) => e && typeof e === "object" && typeof e.cual === "string" && e.cual && (e.direccion === "mas" || e.direccion === "menos"))
    .map((e) => ({ cual: e.cual, direccion: e.direccion }))
    .slice(0, 3);
  return { pedidos, invalidos: x.length > 0 && !pedidos.length };
}

/**
 * «Más carbos», «menos sal y más proteína»: cada eje compara la candidata con
 * el plato que ya está en el hueco (`actual`, su receta BASE: sin la guarnición
 * fundida, como las candidatas). Todos a la vez.
 *
 * Sin `actual` (ideas sin menú) no hay con qué comparar: se ordena por el
 * número en la dirección pedida. Si `actual` no tiene el dato, igual, y se
 * avisa: devolver la lista sin filtrar fue lo que dio tres platos de pasta a
 * quien pedía proteína. Una candidata sin el dato nunca cumple.
 *
 * `exacto` dice si la lista cumple de verdad lo pedido: cambiar_plato solo
 * cambia si es así. `ordenado` dice que el orden ES la respuesta (las primeras
 * son las que más tienen), no solo un filtro.
 * @param {{ cual: string, direccion: "mas"|"menos" }[]} [ejes]
 */
export function conEjes(lista, ejes, actual, nut = nutricion) {
  const { pedidos, invalidos } = normalizarEjes(ejes);
  if (invalidos) return { lista, aviso: "(No he entendido qué nutriente comparar: pídelo otra vez con «más» o «menos» de algo. Dilo así.)", exacto: false, ordenado: false };
  if (!pedidos.length) return { lista, aviso: null, exacto: true, ordenado: false };
  const avisos = [];
  let exacto = true;
  const comparar = [];
  const ordenar = [];
  for (const e of pedidos) {
    const def = EJES[e.cual];
    if (!def) { avisos.push(`(No tengo un dato de «${e.cual}». Dilo con naturalidad, no como un fallo.)`); exacto = false; continue; }
    if (def.registro) {
      const { puede, porque } = puedeResponder(def.registro);
      if (!puede) { avisos.push(`(${EJE_POR_ID.get(def.registro)?.nombre}: ${porque}. Dilo con naturalidad, no como un fallo.)`); exacto = false; continue; }
    }
    const x = { def, mas: e.direccion !== "menos" };
    if (actual == null) { ordenar.push(x); continue; }
    x.base = valorDeEje(def, actual, nut);
    if (x.base == null) {
      avisos.push(`(No sé ${def.etiqueta} del plato de ahora: las ordeno por ${def.etiqueta}, ${x.mas ? "de más a menos" : "de menos a más"}. Dilo así, no como un fallo.)`);
      exacto = false;
      ordenar.push(x);
    } else comparar.push(x);
  }
  const v = new Map(lista.map((r) => [r, new Map([...comparar, ...ordenar].map((x) => [x.def, valorDeEje(x.def, r, nut)]))]));
  let base = lista;
  if (comparar.length) {
    const cumplen = lista.filter((r) => comparar.every((x) => {
      const n = v.get(r).get(x.def);
      return n != null && (x.mas ? n > x.base : n < x.base);
    }));
    if (cumplen.length) base = cumplen;
    else {
      exacto = false;
      avisos.push(`(Ninguna tiene ${comparar.map((x) => `${x.mas ? "más" : "menos"} ${x.def.etiqueta}`).join(" y ")} que lo de hoy: estas son las que más se acercan. Dilo así.)`);
      ordenar.unshift(...comparar);
    }
  }
  if (ordenar.length) {
    const clave = (r) => ordenar.map((x) => v.get(r).get(x.def));
    const conDato = base.filter((r) => clave(r).every((n) => n != null));
    conDato.sort((a, b) => {
      const ka = clave(a);
      const kb = clave(b);
      for (let i = 0; i < ordenar.length; i++) if (ka[i] !== kb[i]) return ordenar[i].mas ? kb[i] - ka[i] : ka[i] - kb[i];
      return 0;
    });
    base = [...conDato, ...base.filter((r) => !conDato.includes(r))];
  }
  return { lista: base, aviso: avisos.join(" ") || null, exacto, ordenado: ordenar.length > 0 };
}

/**
 * Un perfil del plato entero («equilibrado», «para después de entrenar»…,
 * src/lib/derive/perfiles.js). Solo para el plato principal: un primero no
 * tiene por qué ser una comida completa.
 */
// Si alguna cumple, todas las que cumplen empatan (0 puntos) y el orden no es la
// respuesta: ahí manda el estilo. Si ninguna, el orden por cercanía sí lo es.
export function conPerfil(lista, perfil, actual, cual = "principal", nut = nutricion) {
  if (!perfil) return { lista, aviso: null, exacto: true, ordenado: false };
  if (!PERFILES[perfil]) return { lista, aviso: `(No tengo un perfil «${perfil}». Dilo con naturalidad, no como un fallo.)`, exacto: false, ordenado: false };
  if (cual === "primero") return { lista, aviso: `(«${PERFILES[perfil].etiqueta}» es para el plato principal: en el primero no lo aplico. Dilo así.)`, exacto: false, ordenado: false };
  const leer = (p, campo) => nut.nutrienteDe(p, campo).valor;
  const r = ordenarPorPerfil(lista, perfil, {
    leer,
    completitud: (p) => nut.completitudDe(nut.crudoDe(p)),
    kcalActual: actual ? leer(actual, "kcal") : null,
  });
  return { lista: r.lista, aviso: r.aviso, exacto: !r.aviso, ordenado: Boolean(r.aviso) };
}

/**
 * Rasgos → ejes → perfil, en ese orden, sobre las candidatas del motor (que
 * llegan en la forma del catálogo). `actual` es la receta BASE del hueco
 * (`crudoDe`), o null sin hueco. Pura: el lector llega en `nut`.
 */
export function filtrarCandidatas(lista, { rasgos = null, ejes = null, perfil = null, cual = "principal" } = {}, actual = null, nut = nutricion) {
  const r = conRasgos(lista, rasgos);
  const e = conEjes(r.lista, ejes, actual, nut);
  const p = conPerfil(e.lista, perfil, actual, cual, nut);
  return {
    lista: p.lista,
    aviso: [r.aviso, e.aviso, p.aviso].filter(Boolean).join(" ") || null,
    exacto: !r.aviso && e.exacto && p.exacto,
    ordenado: e.ordenado || p.ordenado,
  };
}

/**
 * Lo que decide qué cumple son rasgos, ejes y perfil; dentro de eso ordena el
 * estilo, como antes. Si el orden ya es la respuesta (`ordenado`), se varía
 * solo entre las primeras, o variadas() sacaría una lejana por no repetir
 * proteína, y el estilo ordena dentro de esa ventana.
 */
export function ordenParaVariar(lista, { ordenado = false, estilo = null, n = 3 } = {}) {
  return segunEstilo(ordenado ? lista.slice(0, Math.max(3 * n, 9)) : lista, estilo);
}

/** Entre cuáles elige cambiar_plato: entre las mejores si el orden importa o hay perfil; si no, entre todas las que cumplen. */
export function candidatasParaCambiar(filtro, { perfil = null } = {}) {
  return perfil || filtro.ordenado ? filtro.lista.slice(0, 3) : filtro.lista;
}

/**
 * La receta base del plato que ocupa el hueco, para comparar con las candidatas.
 * Si su foto no está registrada (casa sin `menu`, foto perdida), la del catálogo
 * por su id: sin ella no habría con qué comparar y se elegiría a ciegas.
 */
export function baseDelHueco(m, hueco, course, nut) {
  const id = course === "first" ? hueco.firstRecipeId : hueco.recipeId;
  if (!id) return null;
  return nut.crudoDe(m.RECIPES_BY_ID[id] ?? { id });
}

/**
 * `n` recetas de `lista` que no se parezcan entre sí: primero distinta
 * proteína y categoría, luego lo que quede en su orden. El motor devuelve las
 * mejor puntuadas, y juntas suelen ser la misma idea tres veces (salieron tres
 * platos de garbanzos para una cena). Pura, para el test.
 */
export function variadas(lista, n) {
  const elegidas = [];
  const usadas = new Set();
  const claveDe = (r) => `${r.mainProtein ?? "?"}|${r.category ?? "?"}`;
  for (const r of lista) {
    if (elegidas.length >= n) break;
    const prot = `p:${r.mainProtein ?? "?"}`;
    const cat = `c:${r.category ?? "?"}`;
    if (usadas.has(prot) || usadas.has(cat)) continue;
    elegidas.push(r);
    usadas.add(prot);
    usadas.add(cat);
  }
  // Si no hay tanta variedad, al menos que no se repita la misma combinación.
  const combos = new Set(elegidas.map(claveDe));
  for (const r of lista) {
    if (elegidas.length >= n) break;
    if (elegidas.includes(r) || combos.has(claveDe(r))) continue;
    elegidas.push(r);
    combos.add(claveDe(r));
  }
  for (const r of lista) {
    if (elegidas.length >= n) break;
    if (!elegidas.includes(r)) elegidas.push(r);
  }
  return elegidas;
}

/**
 * Ideas para una comida cuando no hay menú en ese día. Se monta en memoria un
 * hueco vacío por grupo y se le piden candidatas al MISMO motor, así que valen
 * las mismas reglas que con menú: alergias, el grupo del bebé con su etapa, el
 * tope de tiempo del día y el tipo de plato de la franja. No se guarda nada.
 *
 * Sin `grupo`, una tanda por grupo que come (los mayores y el bebé no comen lo
 * mismo): pie de foto «1. …» numerado seguido entre grupos, como la lista.
 */
export async function ideasSinMenu(casa, { diaPedido, franja, grupo, para = null, cual, n, estilo = null, rasgos = null, ejes = null, perfil = null, deFuera: deFueraDicho = null }, fotos, out = null) {
  const deFuera = restriccionesDeFuera(deFueraDicho);
  const m = await prepararRecetas(casa);
  // `schedule` puede faltar en una casa recién creada desde el chat, y el motor
  // lo lee sin mirar: sin horario apuntado, todos comen en casa.
  const data = { schedule: {}, ...(casa.state?.data ?? {}) };
  const conGente = (data.groups ?? []).filter((g) => m.membersOfGroup(g, data.members ?? []).length > 0);
  const porPara = para ? grupoPara(conGente, data.members ?? [], para) : null;
  const elegidos = grupo ? conGente.filter((g) => normal(g.label) === normal(grupo)) : porPara ? [porPara] : conGente;
  if (!elegidos.length) return grupo ? `No encuentro el grupo «${grupo}» en la casa.` : "La casa todavía no tiene a nadie apuntado.";
  const dia = diaDe(diaPedido) ?? hoy();
  const clave = `${dia}-${franja}`;
  // Con primero y segundo, el hueco de la comida pide un segundo; sin él, plato único.
  const conPrimero = franja === "Comida" && (cual === "primero" || data.mealStructure !== "1_plato");
  const detalle = (r) => detalleDe(r, estilo);
  const bloques = [];
  let num = 0;
  for (const g of elegidos) {
    const plan = { [g.id]: { [clave]: { recipeId: null, firstRecipeId: conPrimero ? "_" : null, eaters: m.membersOfGroup(g, data.members ?? []).length || 2 } } };
    const res = m.pickCatalogReplacement(conQuienViene(data, [g.id], deFuera), plan, { hoy: hoyISO(), groupId: g.id, day: dia, meal: franja, course: cual === "primero" ? "first" : "main", candidatos: POOL_PARA_VARIAR });
    const nut = await prepararNutricion();
    const filtro = filtrarCandidatas(res?.candidatos ?? [], { rasgos, ejes, perfil, cual }, null, nut);
    if (filtro.aviso) bloques.push(filtro.aviso);
    const lista = variadas(ordenParaVariar(filtro.lista, { ordenado: filtro.ordenado, estilo, n }), n);
    if (!lista.length) continue;
    const quien = m.membersOfGroup(g, data.members ?? []).map((p) => p.name).filter(Boolean).join(", ");
    bloques.push(`Para ${quienesDe(g, data.members ?? []) ?? quien}:`);
    if (out) (out.bloques ??= []).push({ grupo: elegidos.length > 1 ? g.label : null, quienes: elegidos.length > 1 ? quienesDe(g, data.members ?? []) : null, tipo: tipoDeGrupo(g, data.members ?? []), opciones: lista, aviso: filtro.aviso });
    for (const r of lista) {
      num += 1;
      apuntarFoto(m, fotos, r, `${num}. ${r.name}`);
      bloques.push(`${num}. ${r.name}${detalle(r) ? ` (${detalle(r)})` : ""}`);
    }
  }
  if (out) Object.assign(out, { conMenu: false, dia, franja, estilo, bloques: out.bloques ?? [] });
  const filtradoPara = deFuera ? ` Filtrado también para quien viene: ${describirDeFuera(deFuera)}.` : "";
  if (!bloques.length) return `No hay recetas que encajen con vuestras alergias y gustos para esa comida.${filtradoPara}`;
  return [
    `No hay menú para ese día, así que son ideas del recetario para la ${franja.toLowerCase()}, sin tocar nada:${filtradoPara}`,
    ...bloques,
    "Si eligen una: ver_receta para enseñarla. Para ponerla en un menú hace falta generarlo antes; ofrécelo solo si lo piden.",
  ].join("\n");
}

/**
 * Cambia el plato de un hueco con el mismo motor que la app
 * (`pickCatalogReplacement`), y rehace la compra conservando lo ya marcado.
 *
 * Con `receta`, pone ESA en vez de sortear, pero solo si está entre las que el
 * motor da por buenas para el hueco: elegir no se salta las alergias, el
 * tiempo ni lo repetido.
 */
// `motivo` (MOTIVO_CAMBIO, interno: no está en el esquema de la herramienta)
// lo pone quien sabe por qué se cambia: la elección de una opción, «elige tú».
export async function cambiarPlato(householdId, { dia: diaPedido, semana, franja, grupo, cual = "principal", receta = null, motivo = null, rasgos = null, ejes = null, perfil = null, deFuera = null }, fotos = null, out = null) {
  let texto = "";
  const rf = restriccionesDeFuera(deFuera);
  // Lo que se ha cambiado, para el rastro (src/lib/rastro.js), una fila por grupo.
  const cambios = [];
  const r = await conCasa(householdId, async (cargada) => {
    const rd = resolverDia(cargada, diaPedido, semana);
    if (rd.error) { texto = rd.error; return null; }
    const { casa, dia, fecha } = rd;
    const h = huecoDe(casa, { dia, franja, grupo, cual });
    if (h.error) { texto = h.error; return null; }
    const { gs, g, clave, hueco, course, anadir } = h;
    const m = await prepararRecetas(casa);
    const data = casa.state?.data ?? {};
    // Para ELEGIR plato, con quien viene de fuera sentado en todos los grupos
    // de esa comida; la compra y lo guardado, con la casa tal cual.
    const paraElegir = conQuienViene(data, gs.map((x) => x.id), rf);

    let forcedRecipe = null;
    let aproximada = false;
    let notaEjes = "";
    if (receta) {
      const pool = m.pickCatalogReplacement(paraElegir, casa.semana.plan, { hoy: hoyISO(), groupId: g.id, day: dia, meal: franja, course, candidatos: POOL_PARA_ELEGIR });
      forcedRecipe = candidataPorNombre(pool?.candidatos ?? [], receta);
      if (!forcedRecipe) {
        // No está tal cual: la más parecida de todo lo que encaja en el hueco.
        const grande = m.pickCatalogReplacement(paraElegir, casa.semana.plan, { hoy: hoyISO(), groupId: g.id, day: dia, meal: franja, course, candidatos: POOL_PARA_APROXIMAR, pedido: true });
        forcedRecipe = masParecida(grande?.candidatos ?? [], receta);
        aproximada = !!forcedRecipe;
      }
      if (!forcedRecipe) { texto = `No hay nada parecido a «${receta}» que encaje en ese hueco (por alergias, tiempo o porque ya está en la semana). Pide opciones con proponer_platos.`; return null; }
    }
    const pideEjes = normalizarEjes(ejes);
    if (!receta && (rasgos || pideEjes.pedidos.length || pideEjes.invalidos || perfil)) {
      const pool = m.pickCatalogReplacement(paraElegir, casa.semana.plan, { hoy: hoyISO(), groupId: g.id, day: dia, meal: franja, course, candidatos: POOL_PARA_ELEGIR });
      const nut = await prepararNutricion();
      const base = baseDelHueco(m, hueco, course, nut);
      const filtro = filtrarCandidatas(pool?.candidatos ?? [], { rasgos, ejes, perfil, cual: course === "first" ? "primero" : "principal" }, base, nut);
      // Un cambio solo se hace si lo pedido se cumple de verdad: si no, el aviso tal cual.
      if (!filtro.exacto || !filtro.lista.length) { texto = `${filtro.aviso ?? "(Ninguna cumple lo que pides.)"} No he cambiado nada: ofrece opciones con proponer_platos.`; return null; }
      const entre = candidatasParaCambiar(filtro, { perfil });
      forcedRecipe = entre[Math.floor(Math.random() * entre.length)];
      if (pideEjes.pedidos.length && !base) notaEjes = " No había plato en ese hueco con el que comparar: he puesto una de las que más se ajustan a lo pedido. Dilo así.";
    }
    const elegido = m.pickCatalogReplacement(paraElegir, casa.semana.plan, { hoy: hoyISO(), groupId: g.id, day: dia, meal: franja, course, forcedRecipe });
    if (!elegido?.recipeId) { texto = "No he encontrado otro plato que encaje en ese hueco con vuestras preferencias."; return null; }
    const antes = m.RECIPES_BY_ID[course === "first" ? hueco.firstRecipeId : hueco.recipeId]?.name;
    m.registerRecipes([elegido.frontendRecipe]);

    const plan = structuredClone(casa.semana.plan);
    plan[g.id][clave] = { ...hueco, [course === "first" ? "firstRecipeId" : "recipeId"]: elegido.recipeId, warnings: [] };
    cambios.length = 0;
    cambios.push({ day: dia, meal: franja, course, groupId: g.id, oldRecipeId: idBase(course === "first" ? hueco.firstRecipeId : hueco.recipeId), newRecipeId: idBase(elegido.recipeId) });

    // Sin decir para quién, el cambio es de toda la familia (el bebé tiene su
    // propio menú y no entra). A cada grupo se le pone solo si ese plato está
    // entre lo que puede comer: el plato elegido a mano se salta los filtros,
    // y aquí no se puede saltar una alergia. Si no, se queda con lo suyo y se dice.
    const tambien = [];
    const sinCambiar = [];
    // Solo si la casa come lo mismo: si eligieron que los peques cenen aparte,
    // un cambio en la cena de los mayores no se lo pisa a ellos.
    if (!grupo && (data.menuModel ?? "same") === "same") {
      const base = (id) => String(id ?? "").split("__").pop();
      for (const x of gs) {
        if (x.id === g.id || tipoDeGrupo(x, data.members ?? []) === "bebe") continue;
        const suyo = plan[x.id]?.[clave];
        if (!suyo) continue;
        // El mismo plato que se pide: un entrante se añade también a los demás,
        // nunca se les cambia el principal.
        const curso = course;
        const permitidas = m.pickCatalogReplacement(paraElegir, plan, { hoy: hoyISO(), groupId: x.id, day: dia, meal: franja, course: curso, candidatos: POOL_PARA_APROXIMAR, pedido: true })?.candidatos ?? [];
        if (!permitidas.some((r) => base(r.id) === base(elegido.recipeId))) { sinCambiar.push(x.label); continue; }
        const suyoElegido = m.pickCatalogReplacement(paraElegir, plan, { hoy: hoyISO(), groupId: x.id, day: dia, meal: franja, course: curso, forcedRecipe: elegido.frontendRecipe });
        if (!suyoElegido?.recipeId) { sinCambiar.push(x.label); continue; }
        m.registerRecipes([suyoElegido.frontendRecipe]);
        plan[x.id][clave] = { ...suyo, [curso === "first" ? "firstRecipeId" : "recipeId"]: suyoElegido.recipeId, warnings: [] };
        cambios.push({ day: dia, meal: franja, course: curso, groupId: x.id, oldRecipeId: idBase(curso === "first" ? suyo.firstRecipeId : suyo.recipeId), newRecipeId: idBase(suyoElegido.recipeId) });
        tambien.push(x.label);
      }
    }

    const aiRecipes = [...(casa.state?.aiRecipes ?? []).filter((x) => x?.id !== elegido.frontendRecipe.id), elegido.frontendRecipe];
    const shopping = rehacerCompra(m, plan, data, gs, casa.semana.shopping, await leerDespensa(m, casa.householdId));

    // La foto de la receta, como la guarda la app al generar: sin ella, otro
    // dispositivo que cargue el menú no sabría resolver el id nuevo.
    await insert("user_menu_recipes", [{
      user_id: casa.menu.userId,
      household_id: casa.householdId,
      menu_id: casa.menu.id,
      recipe_id: elegido.recipeId,
      recipe_snapshot: elegido.frontendRecipe,
    }], { upsert: true }).catch(() => {});

    apuntarFoto(m, fotos, elegido.frontendRecipe);
    // El día tal como queda, en la propia respuesta: el modelo iba a ver_menu
    // tras cada cambio para comprobarlo, y cada vuelta son 4-8 s en el chat.
    const dePintado = await describirMenu({ ...casa, menu: null, semanas: null, semana: { ...casa.semana, plan } }, { dia, fecha }).catch(() => "");
    // Para quién ha sido, en personas y no en nombres de grupo.
    const para = grupo || sinCambiar.length ? quienesDe(g, data.members ?? []) : null;
    const sinCambiarQuienes = sinCambiar.map((l) => quienesDe(gs.find((x) => x.label === l), data.members ?? [])).filter(Boolean);
    if (out) Object.assign(out, { cambiado: true, anadido: Boolean(anadir), fecha, dia, franja, grupo: para, sinCambiar: sinCambiarQuienes, antes: antes ?? null, despues: elegido.frontendRecipe.name, adaptado: cambiosDe(elegido.frontendRecipe), recetaId: elegido.recipeId, aproximada, pedida: receta });
    const dondeQuien = `${fechaCorta(fecha)}, ${fecha}, ${franja}${para ? `, para ${para}` : tambien.length ? ", para toda la familia" : ""}`;
    const principal = m.RECIPES_BY_ID[hueco.recipeId]?.name;
    texto = (anadir
      ? `Añadido de primero (${dondeQuien}): ${elegido.frontendRecipe.name}. El principal${principal ? ` (${principal})` : ""} se queda igual: dilo así, no digas que has cambiado la ${franja.toLowerCase()}.`
      : `Cambiado (${dondeQuien}): ${antes ?? "—"} → ${elegido.frontendRecipe.name}.`)
      + (sinCambiarQuienes.length ? ` ${sinCambiarQuienes.join(" y ")} se quedan con lo suyo: ese plato no encaja con sus alergias o su etapa. Dilo así.` : "")
      + (aproximada ? ` No había «${receta}» tal cual: es lo más parecido que encaja. Díselo así.` : "")
      + notaEjes
      + (rf ? ` Elegido también para quien viene: ${describirDeFuera(rf)}.` : "")
      + (dePintado ? `\n\nAsí queda ese día (es lo guardado, y SALE PINTADO debajo de tu mensaje con el plato nuevo destacado: no lo escribas ni llames a ver_menu; di solo qué has cambiado):\n${dePintado}` : "");
    // `state.menuPlan` y `state.shopping` son la semana que pinta la app (la de
    // hoy): si el cambio es en otra, solo se toca esa semana.
    const viva = casa.semana.weekStart === cargada.semanaViva;
    return { casa, state: viva ? { ...casa.state, menuPlan: plan, shopping, aiRecipes } : { ...casa.state, aiRecipes }, semana: { plan, shopping } };
  });
  // Si no se ha guardado, no ha cambiado nada (y no se pinta como cambiado).
  if (out && !r.ok) out.cambiado = false;
  if (out && !out.cambiado) out.error = r.ok ? texto : `No he podido guardar el cambio: ${r.error}.`;
  if (!r.ok) return `No he podido guardar el cambio: ${r.error}.`;
  const porque = motivo ?? (receta ? MOTIVO_CAMBIO.PEDIDO : MOTIVO_CAMBIO.OTRO);
  for (const c of cambios) await rastro(householdId, RASTRO.PLATO_CAMBIADO, { ...c, motivo: porque });
  return texto;
}

/**
 * «Hoy cenamos fuera», «Nat no come el finde ni cena hoy»: ausencias de días
 * concretos, no un horario (ajustar_horario es para lo que se repite cada
 * semana). Varios días y comidas van en UNA llamada: con cinco llamadas en
 * paralelo, las escrituras chocaban sobre la misma casa y las últimas se
 * perdían («conflicto persistente», 2 oct 2026).
 *
 * Dos cosas a la vez:
 *   · reglas de la casa `presente: fuera` acotadas a cada día (vigencia
 *     desde/hasta = esa fecha), que el motor respeta al generar y que caducan
 *     solas (src/lib/reglas.js); todas en una sola escritura;
 *   · en el menú que YA está hecho, si todos los de un grupo están fuera, ese
 *     hueco se vacía y la compra se rehace (una escritura más por cada semana
 *     del menú que se toque, aparte de la primera). Si solo falta alguien, el
 *     plato se queda para los demás.
 *
 * @param {{ dia?: string, dias?: string[], comida?: string, comidas?: string[], quienes?: string[] | null, autor?: string | null }} x
 *   dias: hoy, mañana, pasado mañana, un día de la semana o «finde»; quienes:
 *   nombres de la casa (sin ellos, toda la casa).
 * @returns {Promise<{ texto: string, pintar: object | null, error?: string }>}
 */
/**
 * Pura. Las ausencias nuevas que copian una guardada en los últimos 3 días
 * (misma persona, mismo día de la semana, alguna comida en común) para un día
 * que ya pasó: { antes, ahora } por cada una.
 */
export function repeticionReciente(existentes = [], nuevas = [], hoy) {
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
  const mismoSujeto = (a, b) => a?.tipo === b?.tipo && (a?.ref ?? null) === (b?.ref ?? null);
  const salida = [];
  for (const n of nuevas) {
    const viejas = existentes.filter((r) =>
      r?.efecto?.valor === "fuera" && (r.creadaEn ?? "") >= desde && r?.vigencia?.hasta && r.vigencia.hasta < hoy
      && mismoSujeto(r.sujeto, n.sujeto) && r.ambito?.dias?.[0] === n.ambito?.dias?.[0]
      && (r.ambito?.comidas ?? []).some((c) => (n.ambito?.comidas ?? []).includes(c)));
    for (const v of viejas) salida.push({ antes: v.vigencia.hasta, ahora: n.vigencia.desde });
  }
  return salida;
}

export async function apuntarAusencia(householdId, { dia, dias, comida, comidas, quienes = null, autor = null, deNuevo = false }) {
  const pedidas = comidas?.length ? comidas : [comida];
  const lasComidas = [...new Set(pedidas.map((x) => comidaDe(x ?? "")))];
  if (!lasComidas.length || lasComidas.some((c) => !c)) return { texto: `¿Qué comida? («${pedidas.join(", ")}»)`, pintar: null, error: "comida" };
  const hoy = hoyISO();
  const fechaDe = (texto) => {
    const t = normal(texto ?? "");
    if (!t || t === "hoy" || t === "esta noche") return hoy;
    if (t === "manana") return sumarDias(hoy, 1);
    if (t === "pasado manana") return sumarDias(hoy, 2);
    const d = diaDe(texto);
    if (!d) return null;
    const deEsta = sumarDias(lunesDe(hoy), DIAS.indexOf(d));
    return deEsta >= hoy ? deEsta : sumarDias(deEsta, 7);
  };
  // «el finde» son el sábado y el domingo que vienen (o este, si ya es finde).
  const losDias = (dias?.length ? dias : [dia]).flatMap((x) => (/^(el )?(finde|fin de semana)$/.test(normal(x ?? "")) ? ["sábado", "domingo"] : [x]));
  const fechas = losDias.map(fechaDe);
  const malo = losDias.find((_, i) => !fechas[i]);
  if (malo !== undefined) return { texto: `No entiendo el día «${malo}».`, pintar: null, error: "dia" };
  const huecos = [...new Set(fechas)].sort().flatMap((fecha) => lasComidas.map((c) => ({ fecha, d: diaDeFecha(fecha), c })));
  const enSemana = (w) => huecos.some((h) => w.weekStart <= h.fecha && h.fecha <= w.weekEnd);

  let fallo = null;
  let quien = "";
  let fuera = [];
  let hayMenu = false;
  let semanasPorTocar = [];
  const vaciadas = new Set();
  // Vacía los huecos de una semana del menú; los cambios para conCasa, o null si no toca nada.
  const vaciarEn = async (cargada, s, data = cargada.state?.data ?? {}) => {
    const casa = { ...cargada, semana: s };
    const gs = grupos(casa);
    const idsFuera = new Set(fuera.map((p) => p.id));
    const plan = structuredClone(s.plan);
    let algo = false;
    for (const h of huecos.filter((x) => s.weekStart <= x.fecha && x.fecha <= s.weekEnd)) {
      for (const g of gs) {
        if (!plan[g.id]?.[`${h.d}-${h.c}`]) continue;
        if ((g.memberIds ?? []).length && g.memberIds.every((id) => idsFuera.has(id))) {
          delete plan[g.id][`${h.d}-${h.c}`];
          algo = true;
          vaciadas.add(h.fecha);
        }
      }
    }
    if (!algo) return null;
    const mc = await prepararRecetas(casa);
    const shopping = rehacerCompra(mc, plan, data, gs, s.shopping, await leerDespensa(mc, casa.householdId));
    const viva = s.weekStart === cargada.semanaViva;
    return {
      casa,
      state: viva ? { ...cargada.state, data, menuPlan: plan, shopping } : { ...cargada.state, data },
      semana: { plan, shopping },
    };
  };

  // 1. Las reglas de todos los días y la primera semana del menú que se toque, en una escritura.
  const r = await conCasa(householdId, async (cargada) => {
    const data = cargada.state?.data ?? {};
    const miembros = data.members ?? [];
    fuera = miembros;
    if (quienes?.length) {
      const busca = (n) => miembros.find((p) => normal(p.name) === normal(n)) ?? miembros.find((p) => normal(p.name).startsWith(normal(n)));
      const encontrados = quienes.map(busca);
      const falta = quienes.filter((_, i) => !encontrados[i]);
      if (falta.length) { quien = `No encuentro a ${falta.join(" ni a ")} en la casa.`; fallo = "quien"; return null; }
      fuera = [...new Set(encontrados)];
    }
    const todos = fuera.length === miembros.length;
    quien = todos ? "toda la casa" : fuera.map((p) => p.name).join(" y ");
    const m = await motor();
    const sujetos = todos ? [{ tipo: "casa" }] : fuera.map((p) => ({ tipo: "miembro", ref: p.id }));
    // Una regla por persona y día, con las comidas de ese día.
    const reglasNuevas = [...new Set(huecos.map((h) => h.fecha))].flatMap((fecha) => sujetos.map((sujeto) => m.nuevaRegla({
      sujeto,
      ambito: { dias: [diaDeFecha(fecha)], comidas: huecos.filter((h) => h.fecha === fecha).map((h) => h.c) },
      vigencia: { desde: fecha, hasta: fecha },
      efecto: { tipo: "presente", valor: "fuera" },
      origen: "texto",
      frase: `${todos ? "Toda la casa" : fuera.map((p) => p.name).join(" y ")} fuera el ${fecha}${autor ? `, lo dijo ${autor}` : ""}`,
      hoy,
    })));
    // Lo mismo que se guardó hace nada para un día que ya pasó: es el modelo
    // releyendo una orden vieja de la charla, no una nueva. No se escribe.
    const repetidas = deNuevo ? [] : repeticionReciente(data.reglas ?? [], reglasNuevas, hoy);
    if (repetidas.length) {
      const antes = [...new Set(repetidas.map((x) => x.antes))].map((f) => `el ${DIA_LARGO[diaDeFecha(f)]} ${Number(f.slice(8, 10))}`).join(" y ");
      const ahora = [...new Set(repetidas.map((x) => x.ahora))].map((f) => `el ${DIA_LARGO[diaDeFecha(f)]} ${Number(f.slice(8, 10))}`).join(" y ");
      quien = `No he guardado nada: eso ya se apuntó para ${antes}, que ya pasó. Lo que lees en la charla es de otro día. Solo si la persona pide AHORA lo mismo para ${ahora}, confírmalo con ella y vuelve a llamar con de_nuevo = true.`;
      fallo = "repetido";
      return null;
    }
    // Devuelve { reglas, vencidas }, no la lista.
    const { reglas } = m.podarReglasVencidas([...(data.reglas ?? []), ...reglasNuevas], hoy);
    const dataNueva = { ...data, reglas };
    const semanas = (cargada.semanas ?? []).filter((w) => w.plan && enSemana(w));
    hayMenu = semanas.length > 0;
    semanasPorTocar = semanas.slice(1).map((w) => w.weekStart);
    const conPrimera = semanas[0] ? await vaciarEn(cargada, semanas[0], dataNueva) : null;
    return conPrimera ?? { state: { ...cargada.state, data: dataNueva } };
  });
  if (fallo) return { texto: quien, pintar: null, error: fallo };
  if (!r.ok) return { texto: `No he podido guardarlo: ${r.error}.`, pintar: null, error: "guardar" };

  // 2. Las demás semanas del menú, una escritura cada una (raro: un «hasta el martes» que cruza el domingo).
  let aMedias = false;
  for (const lunes of semanasPorTocar) {
    const r2 = await conCasa(householdId, async (cargada) => {
      const s = (cargada.semanas ?? []).find((w) => w.weekStart === lunes);
      return s?.plan ? vaciarEn(cargada, s) : null;
    });
    if (!r2.ok) aMedias = true;
  }

  const porFecha = [...new Set(huecos.map((h) => h.fecha))].map((fecha) => {
    const cs = huecos.filter((h) => h.fecha === fecha).map((h) => h.c.toLowerCase());
    const nombre = fecha === hoy ? "hoy" : `el ${DIA_LARGO[diaDeFecha(fecha)]} ${Number(fecha.slice(8, 10))}`;
    return `${nombre} (${cs.length > 1 ? `${cs.slice(0, -1).join(", ")} y ${cs.at(-1)}` : cs[0]})`;
  });
  const cuando = porFecha.length > 1 ? `${porFecha.slice(0, -1).join(", ")} y ${porFecha.at(-1)}` : porFecha[0];
  const menu = vaciadas.size
    ? " He quitado esos platos del menú y de la compra."
    : hayMenu ? ` El plato de ${porFecha.length > 1 ? "esos días" : "ese día"} se queda para los demás.` : ` Cuenta al generar el menú de ${porFecha.length > 1 ? "esos días" : "ese día"}.`;
  const texto = `Apuntado: ${quien} fuera ${cuando}.${menu}${aMedias ? " En alguna semana del menú no he podido quitar el plato: míralo en la app." : ""}`;
  return { texto, pintar: vaciadas.size ? { dias: [...vaciadas].sort() } : null };
}

/** La despensa de la casa como la lee generar; null si no se ha podido leer. */
export async function leerDespensa(m, householdId) {
  try {
    const filas = await select("user_pantry", `household_id=${eq(householdId)}&order=created_at.asc`, m.COLUMNAS_DESPENSA);
    return filas.map(m.filaDeDespensa);
  } catch (e) {
    console.error("[menu] despensa", e?.message);
    return null;
  }
}

/**
 * La compra de un plan, conservando lo marcado (comprado, ya en casa) y lo
 * añadido a mano. Con la despensa, como al generar: sin ella, la compra volvía
 * a pedir lo que había en casa. Si no se pudo leer (`null`), lo que antes
 * cubría la despensa sigue cubierto.
 */
export function rehacerCompra(m, plan, data, gs, anterior, despensa) {
  const lista = m.buildShoppingList(plan, gs, m.getDayMeals(data), despensa ?? []);
  const nuevos = [...lista.byCategory.flatMap((c) => c.items), ...(lista.pantryItems ?? [])];
  const previos = new Map((anterior?.items ?? []).map((it) => [it.id, it]));
  const items = nuevos.map((it) => {
    const p = previos.get(it.id);
    const conMarcas = p ? { ...it, have: !!p.have, atHome: !!p.atHome } : it;
    return despensa == null && p?.fromPantry ? { ...conMarcas, fromPantry: true } : conMarcas;
  });
  for (const it of anterior?.items ?? []) if (it.manual) items.push(it);
  return { ...(anterior ?? {}), items };
}

export { DIAS, FRANJAS, DIA_LARGO };
