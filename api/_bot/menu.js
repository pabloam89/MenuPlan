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
import { conCasa } from "./casa.js";

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
function grupos(casa) {
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
    casa.semana ? `Semana del menú activo: ${casa.semana.weekStart} a ${casa.semana.weekEnd}` : "No hay menú activo.",
    `Hoy es ${DIA_LARGO[hoy()]}.`,
  ].join("\n");
}

export async function describirMenu(casa, { dia } = {}) {
  if (!casa.semana?.plan) return "No hay ningún menú activo en esta casa.";
  const m = await prepararRecetas(casa);
  // Un menú de una semana que ya pasó no es «lo de hoy»: se dice.
  const hoyISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const aviso = casa.semana.weekEnd < hoyISO
    ? `Ojo: el menú activo es de la semana del ${casa.semana.weekStart} al ${casa.semana.weekEnd}, que ya pasó; no hay menú para esta semana todavía.\n\n`
    : "";
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
        const platos = [nombre(hueco.firstRecipeId), nombre(hueco.recipeId)].filter(Boolean).join(" · ") || "— vacío —";
        if (!porPlatos.has(platos)) porPlatos.set(platos, []);
        porPlatos.get(platos).push(g.label);
      }
      for (const [platos, quienes] of porPlatos) {
        const quien = porPlatos.size > 1 && conHueco > 1 ? ` (${quienes.join(" y ")})` : "";
        delDia.push(`  ${f}${quien}: ${platos}`);
      }
    }
    if (delDia.length) lineas.push(`${DIA_LARGO[d]}:\n${delDia.join("\n")}`);
  }
  return aviso + (lineas.length ? lineas.join("\n") : `No hay nada planificado${dia ? ` el ${DIA_LARGO[dia]}` : ""}.`);
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
  return [
    `${r.name}${r.time ? ` (${r.time} min)` : ""}${r.servings ? ` · ${r.servings} raciones` : ""}`,
    ing.length ? `Ingredientes:\n${ing.join("\n")}` : "",
    pasos.length ? `Pasos:\n${pasos.join("\n")}` : "Sin pasos guardados.",
  ].filter(Boolean).join("\n\n");
}

const activo = (it) => !it.have && !it.atHome && !it.fromPantry;

export function describirCompra(casa) {
  const items = casa.semana?.shopping?.items ?? [];
  if (!items.length) return "La lista de la compra está vacía (o no hay menú activo).";
  const porCategoria = new Map();
  for (const it of items.filter(activo)) {
    const c = it.category || "Otros";
    if (!porCategoria.has(c)) porCategoria.set(c, []);
    porCategoria.get(c).push(`• ${it.name}${it.displayQty ? ` — ${it.displayQty}` : it.qty ? ` — ${it.qty}${it.unit ? ` ${it.unit}` : ""}` : ""}`);
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
    const items = (casa.semana?.shopping?.items ?? []).map((it) => ({ ...it }));
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
    const shopping = { ...(casa.semana.shopping ?? {}), items };
    return { state: { ...casa.state, shopping }, semana: { shopping } };
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
    if (!casa.semana) return null;
    const items = [...(casa.semana.shopping?.items ?? [])];
    for (const p of productos) {
      const name = String(p).trim();
      if (!name) continue;
      items.push({
        id: `manual:${normal(name).replace(/\s+/g, "-")}:${Date.now().toString(36)}`,
        name, category: "Otros", unit: "", qty: null, displayQty: "",
        sources: [], have: false, atHome: false, manual: true, adapted: false,
      });
    }
    const shopping = { ...(casa.semana.shopping ?? {}), items };
    return { state: { ...casa.state, shopping }, semana: { shopping } };
  });
  if (!r.ok) return `No he podido guardar la lista: ${r.error}.`;
  if (r.sinCambios) return "No hay menú activo, así que no hay lista de la compra a la que añadir.";
  return `Añadido a la compra: ${productos.join(", ")}.`;
}

/**
 * Cambia el plato de un hueco con el mismo motor que la app
 * (`pickCatalogReplacement`), y rehace la compra conservando lo ya marcado.
 */
export async function cambiarPlato(householdId, { dia, franja, grupo, cual = "principal" }) {
  let texto = "";
  const r = await conCasa(householdId, async (casa) => {
    if (!casa.semana?.plan) { texto = "No hay menú activo."; return null; }
    const m = await prepararRecetas(casa);
    const data = casa.state?.data ?? {};
    const gs = grupos(casa);
    const g = grupo ? gs.find((x) => normal(x.label) === normal(grupo)) : gs.find((x) => casa.semana.plan[x.id]?.[`${dia}-${franja}`]);
    if (!g) { texto = `No encuentro ese hueco (${DIA_LARGO[dia]}, ${franja}${grupo ? `, ${grupo}` : ""}).`; return null; }
    const clave = `${dia}-${franja}`;
    const hueco = casa.semana.plan[g.id]?.[clave];
    if (!hueco) { texto = `El ${DIA_LARGO[dia]} no hay ${franja.toLowerCase()} planificada para ${g.label}.`; return null; }
    const course = cual === "primero" && hueco.firstRecipeId ? "first" : "main";

    const elegido = m.pickCatalogReplacement(data, casa.semana.plan, { groupId: g.id, day: dia, meal: franja, course });
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

    texto = `Cambiado (${DIA_LARGO[dia]}, ${franja}${gs.length > 1 ? `, ${g.label}` : ""}): ${antes ?? "—"} → ${elegido.frontendRecipe.name}.`;
    return { state: { ...casa.state, menuPlan: plan, shopping, aiRecipes }, semana: { plan, shopping } };
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
