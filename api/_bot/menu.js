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

let motorCargado = null;
export const motor = async () => (motorCargado ??= await import("./core.mjs"));

const FRANJAS = ["Desayuno", "Comida", "Merienda", "Cena", "Postre"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIA_LARGO = { Lun: "lunes", Mar: "martes", "Mié": "miércoles", Jue: "jueves", Vie: "viernes", "Sáb": "sábado", Dom: "domingo" };

/** Sin tildes ni mayúsculas, para comparar lo que escribe la gente. */
export const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Lo que escribe la gente, literal dentro de un regex. */
const escapar = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** «martes», «mar», «Mar» → "Mar". */
export function diaDe(texto) {
  const t = normal(texto);
  if (!t) return null;
  for (const d of DIAS) if (normal(d) === t.slice(0, 3) || normal(DIA_LARGO[d]) === t) return d;
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

function rangosDelMenu(casa) {
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
  return FRANJAS.find((f) => normal(f) === t || (t === "almuerzo" && f === "Comida")) ?? null;
}

/** Registra en el motor las recetas de la casa para poder resolver ids. */
export async function prepararRecetas(casa) {
  const m = await motor();
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
  return m;
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
    return `• ${p.name ?? "(sin nombre)"}${p.age != null ? `, ${p.age} años` : ""}${cuerpo}${alergias.length ? ` — alergias/intolerancias: ${alergias.join(", ")}` : ""}${(p.dislikes ?? []).length ? ` — no le gusta: ${p.dislikes.join(", ")}` : ""}`;
  });
  return [
    `Miembros:\n${miembros.join("\n") || "(ninguno todavía)"}`,
    `Grupos de menú de la casa: ${(d.groups ?? []).map((g) => g.label).join(", ") || "(ninguno)"}`,
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
  const nombre = (id) => (id ? m.RECIPES_BY_ID[id]?.name ?? m.RECIPES_BY_ID[id.split("__").pop()]?.name ?? id : null);
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
        porPlatos.get(platos).push(g.label);
      }
      for (const [platos, quienes] of porPlatos) {
        const quien = porPlatos.size > 1 && conHueco > 1 ? ` (${quienes.join(" y ")})` : "";
        delDia.push(`  ${f}${quien}: ${platos}`);
      }
    }
    if (delDia.length) lineas.push(`${dia && fecha ? `${fechaCorta(fecha)} (${fecha})` : DIA_LARGO[d]}:\n${delDia.join("\n")}`);
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

export async function marcarCompra(householdId, productos, estado) {
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
    if (!resultado.hechos.length) return null;
    return guardarLista(casa, { ...listaDe(casa), items });
  });
  if (!r.ok) return `No he podido guardar la lista: ${r.error}.`;
  return [
    resultado.hechos.length ? `Marcados como ${estado}: ${resultado.hechos.join(", ")}.` : "",
    resultado.noEncontrados.length ? `No están en la lista: ${resultado.noEncontrados.join(", ")}.` : "",
    resultado.dudosos.length ? `Hay varios parecidos, dime cuál: ${resultado.dudosos.join("; ")}.` : "",
  ].filter(Boolean).join("\n") || "No había lista de la compra.";
}

export async function anadirCompra(householdId, productos) {
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
  if (!r.ok) return `No he podido guardar la lista: ${r.error}.`;
  return `Añadido a la compra: ${productos.join(", ")}.`;
}

/** El grupo y el hueco de un día y franja del menú activo, o por qué no hay. */
function huecoDe(casa, { dia, franja, grupo, cual }) {
  if (!casa.semana?.plan) return { error: "No hay menú activo." };
  const gs = grupos(casa);
  const g = grupo ? gs.find((x) => normal(x.label) === normal(grupo)) : gs.find((x) => casa.semana.plan[x.id]?.[`${dia}-${franja}`]);
  if (!g) return { error: `No encuentro ese hueco (${DIA_LARGO[dia]}, ${franja}${grupo ? `, ${grupo}` : ""}).` };
  const clave = `${dia}-${franja}`;
  const hueco = casa.semana.plan[g.id]?.[clave];
  if (!hueco) return { error: `El ${DIA_LARGO[dia]} no hay ${franja.toLowerCase()} planificada para ${g.label}.` };
  const course = cual === "primero" && hueco.firstRecipeId ? "first" : "main";
  return { gs, g, clave, hueco, course };
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
export async function proponerPlatos(householdId, { dia: diaDicho = null, semana, franja: franjaDicha = null, grupo: grupoDicho = null, para = null, cual = "principal", n = 3, parecidoA = null, estilo = null, rasgos = null }, fotos = null) {
  const cargada = await cargarCasa(householdId);
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
  if (rd.error) return ideasSinMenu(cargada, { diaPedido, franja, grupo: grupoDicho, para, cual, n, estilo, rasgos }, fotos);
  const { casa, dia, fecha } = rd;
  const h = huecoDe(casa, { dia, franja, grupo, cual });
  if (h.error) return ideasSinMenu(cargada, { diaPedido, franja, grupo: grupoDicho, para, cual, n, estilo, rasgos }, fotos);
  const m = await prepararRecetas(casa);
  const res = m.pickCatalogReplacement(casa.state?.data ?? {}, casa.semana.plan, {
    groupId: h.g.id, day: dia, meal: franja, course: h.course, candidatos: parecidoA ? POOL_PARA_APROXIMAR : POOL_PARA_VARIAR, pedido: !!parecidoA,
  });
  // Los rasgos filtran ANTES de ordenar y variar: variadas() elige entre lo
  // que ya cumple, no al revés.
  const filtro = conRasgos(res?.candidatos ?? [], rasgos);
  let lista = parecidoA ? res?.candidatos ?? [] : variadas(segunEstilo(filtro.lista, estilo), n);
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
  if (!lista.length) return "No hay otras recetas que encajen en ese hueco con vuestras alergias, gustos y tiempo.";
  const actual = m.RECIPES_BY_ID[h.course === "first" ? h.hueco.firstRecipeId : h.hueco.recipeId];
  const ahora = actual?.name ? `${actual.name}${detalleDe(actual, estilo) ? ` (${detalleDe(actual, estilo)})` : ""}` : null;
  const detalle = (r) => detalleDe(r, estilo);
  lista.forEach((r, i) => apuntarFoto(m, fotos, r, `${i + 1}. ${r.name}`));
  return [
    `Opciones para el ${fechaCorta(fecha)}, ${franja.toLowerCase()}${h.course === "first" ? " (primero)" : ""}${h.gs.length > 1 ? `, ${h.g.label}` : ""}. Ahora mismo: ${ahora ?? "nada"}.${parecidoA ? ` Ordenadas por parecido a «${parecidoA}» (ninguna es exactamente eso salvo que se llame igual).` : ""}${estilo ? ` Las más ${estilo === "ligero" ? "ligeras" : "rápidas"} que encajan, variadas.` : ""}${filtro.aviso ? ` ${filtro.aviso}` : ""}`,
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
  const f = franja ?? (hora < 16 ? "Comida" : "Cena");
  const pasada = (f === "Comida" && hora >= 16) || (f === "Cena" && hora >= 22);
  return { dia: dia ?? (pasada ? "mañana" : "hoy"), franja: f };
}

const esBebe = (p) => (p?.age != null && p.age < 2) || /beb/i.test(p?.homeRole ?? "");
const esMayor = (p) => !esBebe(p) && (p?.age == null || p.age >= 18);

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
export function grupoPara(gs, members, para) {
  if (!para) return null;
  return gs.find((g) => tipoDeGrupo(g, members) === para) ?? null;
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

/** Tiempo y dificultad de una opción; con «ligero», también sus kcal para poder explicarlo. */
const detalleDe = (r, estilo) => [r.time ? `${r.time} min` : "", estilo === "ligero" && r.kcal ? `${Math.round(r.kcal)} kcal${r.caloriasNivel ? `, ${r.caloriasNivel}` : ""}` : "", r.costeRacion != null ? `unos ${r.costeRacion.toFixed(2).replace(".", ",")} € por ración` : "", r.difficulty ?? ""].filter(Boolean).join(", ");

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
export async function ideasSinMenu(casa, { diaPedido, franja, grupo, para = null, cual, n, estilo = null, rasgos = null }, fotos) {
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
    const res = m.pickCatalogReplacement(data, plan, { groupId: g.id, day: dia, meal: franja, course: cual === "primero" ? "first" : "main", candidatos: POOL_PARA_VARIAR });
    const filtro = conRasgos(res?.candidatos ?? [], rasgos);
    if (filtro.aviso) bloques.push(filtro.aviso);
    const lista = variadas(segunEstilo(filtro.lista, estilo), n);
    if (!lista.length) continue;
    const quien = m.membersOfGroup(g, data.members ?? []).map((p) => p.name).filter(Boolean).join(", ");
    bloques.push(`Para ${g.label}${quien ? ` (${quien})` : ""}:`);
    for (const r of lista) {
      num += 1;
      apuntarFoto(m, fotos, r, `${num}. ${r.name}`);
      bloques.push(`${num}. ${r.name}${detalle(r) ? ` (${detalle(r)})` : ""}`);
    }
  }
  if (!bloques.length) return "No hay recetas que encajen con vuestras alergias y gustos para esa comida.";
  return [
    `No hay menú para ese día, así que son ideas del recetario para la ${franja.toLowerCase()}, sin tocar nada:`,
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
export async function cambiarPlato(householdId, { dia: diaPedido, semana, franja, grupo, cual = "principal", receta = null }, fotos = null) {
  let texto = "";
  const r = await conCasa(householdId, async (cargada) => {
    const rd = resolverDia(cargada, diaPedido, semana);
    if (rd.error) { texto = rd.error; return null; }
    const { casa, dia, fecha } = rd;
    const h = huecoDe(casa, { dia, franja, grupo, cual });
    if (h.error) { texto = h.error; return null; }
    const { gs, g, clave, hueco, course } = h;
    const m = await prepararRecetas(casa);
    const data = casa.state?.data ?? {};

    let forcedRecipe = null;
    let aproximada = false;
    if (receta) {
      const pool = m.pickCatalogReplacement(data, casa.semana.plan, { groupId: g.id, day: dia, meal: franja, course, candidatos: POOL_PARA_ELEGIR });
      forcedRecipe = candidataPorNombre(pool?.candidatos ?? [], receta);
      if (!forcedRecipe) {
        // No está tal cual: la más parecida de todo lo que encaja en el hueco.
        const grande = m.pickCatalogReplacement(data, casa.semana.plan, { groupId: g.id, day: dia, meal: franja, course, candidatos: POOL_PARA_APROXIMAR, pedido: true });
        forcedRecipe = masParecida(grande?.candidatos ?? [], receta);
        aproximada = !!forcedRecipe;
      }
      if (!forcedRecipe) { texto = `No hay nada parecido a «${receta}» que encaje en ese hueco (por alergias, tiempo o porque ya está en la semana). Pide opciones con proponer_platos.`; return null; }
    }
    const elegido = m.pickCatalogReplacement(data, casa.semana.plan, { groupId: g.id, day: dia, meal: franja, course, forcedRecipe });
    if (!elegido?.recipeId) { texto = "No he encontrado otro plato que encaje en ese hueco con vuestras preferencias."; return null; }
    const antes = m.RECIPES_BY_ID[course === "first" ? hueco.firstRecipeId : hueco.recipeId]?.name;
    m.registerRecipes([elegido.frontendRecipe]);

    const plan = structuredClone(casa.semana.plan);
    plan[g.id][clave] = { ...hueco, [course === "first" ? "firstRecipeId" : "recipeId"]: elegido.recipeId, warnings: [] };

    const aiRecipes = [...(casa.state?.aiRecipes ?? []).filter((x) => x?.id !== elegido.frontendRecipe.id), elegido.frontendRecipe];
    const shopping = rehacerCompra(m, plan, data, gs, casa.semana.shopping);

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
    texto = `Cambiado (${fechaCorta(fecha)}, ${fecha}, ${franja}${gs.length > 1 ? `, ${g.label}` : ""}): ${antes ?? "—"} → ${elegido.frontendRecipe.name}.`
      + (aproximada ? ` No había «${receta}» tal cual: es lo más parecido que encaja. Díselo así.` : "")
      + (dePintado ? `\n\nAsí queda ese día (es lo guardado, no hace falta ver_menu; en el chat di solo qué has cambiado y dónde):\n${dePintado}` : "");
    // `state.menuPlan` y `state.shopping` son la semana que pinta la app (la de
    // hoy): si el cambio es en otra, solo se toca esa semana.
    const viva = casa.semana.weekStart === cargada.semanaViva;
    return { casa, state: viva ? { ...casa.state, menuPlan: plan, shopping, aiRecipes } : { ...casa.state, aiRecipes }, semana: { plan, shopping } };
  });
  if (!r.ok) return `No he podido guardar el cambio: ${r.error}.`;
  return texto;
}

/** La compra de un plan, conservando lo marcado (comprado, ya en casa) y lo añadido a mano. */
function rehacerCompra(m, plan, data, gs, anterior) {
  const lista = m.buildShoppingList(plan, gs, m.getDayMeals(data), []);
  const nuevos = [...lista.byCategory.flatMap((c) => c.items), ...(lista.pantryItems ?? [])];
  const previos = new Map((anterior?.items ?? []).map((it) => [it.id, it]));
  const items = nuevos.map((it) => {
    const p = previos.get(it.id);
    return p ? { ...it, have: !!p.have, atHome: !!p.atHome } : it;
  });
  for (const it of anterior?.items ?? []) if (it.manual) items.push(it);
  return { ...(anterior ?? {}), items };
}

export { DIAS, FRANJAS, DIA_LARGO };
