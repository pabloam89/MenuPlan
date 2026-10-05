/**
 * Compartir desde el chat: una receta o la semana, por WhatsApp o Telegram.
 *
 * Dos enlaces por cosa:
 *   · web  → /r/<id>?t=<llave> o /m/<id>?t=<llave>: lo que ya usa la app. En
 *     WhatsApp sale con foto (api/share-recipe, api/share-menu) y abre la app.
 *   · bot  → t.me/<bot>?start=…: abre a Lola con esa receta o esa semana, y
 *     desde ahí la amiga se la guarda o la pone en su menú (api/bot/telegram.js).
 *
 * Las llaves son las mismas de la app (0055 recipe_share_links, 0056
 * menu_share_links), creadas aquí con la clave de servicio en nombre del dueño
 * de la casa: las funciones SQL de la app piden auth.uid() y el bot no tiene
 * sesión. Mandar el enlace ES el consentimiento, como en la app.
 *
 * El parámetro de /start (máx. 64, [A-Za-z0-9_-]):
 *   rc_<id>      receta del catálogo (no necesita llave)
 *   ru_<llave>   receta propia de alguien (la llave dice cuál)
 *   m_<llave>    una semana compartida
 */

import { COMIDAS_PRINCIPALES } from "../../src/lib/comidas.js";
import crypto from "node:crypto";
import { select, insert, update, eq } from "./db.js";
import { cargarCasa, conCasa } from "./casa.js";
import { motor, prepararRecetas, grupos, DIAS, recetasDeCasa, deSerieDelMotor } from "./menu.js";
import { duenoDe, rastro } from "./embudo.js";
import { RASTRO, ORIGEN_RECETA } from "../../src/lib/rastro.js";
import { nombreDelBot } from "./telegram.js";

const nuevaLlave = () => crypto.randomBytes(16).toString("hex");

/**
 * Una receta del catálogo común o de serie, con la forma de la app. Nunca una
 * receta propia: el registro del motor es de toda la instancia y puede tener
 * las recetas privadas que registró otra casa (rc_ es para el catálogo).
 */
export function recetaComun(m, deSerie, id) {
  const vista = recetasDeCasa(m, deSerie, new Set()).RECIPES_BY_ID;
  if (vista[id]) return vista[id];
  const c = m.recipeCatalogById?.[id];
  return c ? m.catalogToFrontendRecipe(c, c.baseServings ?? 2) : null;
}

/** Una receta del catálogo con la forma de la app (ingredientes y pasos). */
async function recetaDelCatalogo(id) {
  const m = await motor();
  return recetaComun(m, deSerieDelMotor(), id);
}
const idBase = (id) => String(id ?? "").split("__").pop();

/** Los enlaces de una receta (del catálogo o propia de esta casa). */
export async function enlacesReceta(householdId, recetaId, base) {
  const id = idBase(recetaId);
  if (!id) return null;
  const bot = await nombreDelBot();
  if (!id.startsWith("user_")) {
    const r = await recetaDelCatalogo(id);
    if (!r) return null;
    return { nombre: r.name, web: `${base}/r/${encodeURIComponent(id)}`, bot: `https://t.me/${bot}?start=rc_${id}` };
  }
  // Propia: solo la del dueño de esta casa, y solo si está en la nube.
  const dueno = await duenoDe(householdId);
  const [fila] = await select("user_recipes", `id=${eq(id)}&owner_id=${eq(dueno)}`, "id,name");
  if (!fila) return null;
  let [llave] = await select("recipe_share_links", `recipe_id=${eq(id)}`, "token");
  if (!llave) {
    await insert("recipe_share_links", [{ recipe_id: id, owner_id: dueno, token: nuevaLlave() }], { upsert: true }).catch(() => {});
    [llave] = await select("recipe_share_links", `recipe_id=${eq(id)}`, "token");
  }
  if (!llave?.token) return null;
  return {
    nombre: fila.name,
    web: `${base}/r/${encodeURIComponent(id)}?t=${llave.token}`,
    bot: `https://t.me/${bot}?start=ru_${llave.token}`,
  };
}

/**
 * Los enlaces de la semana activa. Se guarda una «foto» en shared_menus como
 * hace la app (buildSharedMenuPayload: platos y avatares, nada de nombres ni
 * compra); si ese menú ya estaba publicado, solo se refresca la foto y se
 * respeta su visibilidad.
 */
export async function enlacesSemana(householdId, base) {
  const casa = await cargarCasa(householdId);
  const data = casa?.state?.data ?? {};
  const menuId = data.activeMenuId ?? casa?.menu?.id;
  if (!casa?.semana?.plan || !menuId) return null;
  const dueno = await duenoDe(householdId);
  const m = await prepararRecetas(casa);
  const nombre = (id) => m.RECIPES_BY_ID[id]?.name ?? null;
  const payload = m.buildSharedMenuPayload({
    menuPlan: casa.semana.plan,
    groups: grupos(casa),
    members: data.members ?? [],
    meals: COMIDAS_PRINCIPALES,
    weekStart: casa.semana.weekStart ?? null,
    // Solo los días del menú: uno que empezó el miércoles no enseña el lunes.
    onlyDays: (casa.semana.activeDays?.length ? casa.semana.activeDays : DIAS)
      .filter((d) => DIAS.indexOf(d) >= (casa.semana.startDayIdx ?? 0)),
    dishName: nombre,
    // Las recetas propias no se abren desde una semana compartida (solo su
    // nombre); las del catálogo, sí.
    isReadable: (id) => !String(id).startsWith("user_"),
  });
  const campos = { payload, title: "Nuestro menú de la semana", week_start: casa.semana.weekStart ?? null, week_end: casa.semana.weekEnd ?? null };
  let [compartido] = await select("shared_menus", `owner_id=${eq(dueno)}&menu_id=${eq(menuId)}`, "id");
  if (compartido) await update("shared_menus", `id=${eq(compartido.id)}`, { ...campos, updated_at: new Date().toISOString() });
  else [compartido] = await insert("shared_menus", [{ owner_id: dueno, menu_id: menuId, visibility: "private", ...campos }]);
  if (!compartido?.id) return null;
  let [llave] = await select("menu_share_links", `shared_menu_id=${eq(compartido.id)}`, "token");
  if (!llave) {
    await insert("menu_share_links", [{ shared_menu_id: compartido.id, owner_id: dueno, token: nuevaLlave() }], { upsert: true }).catch(() => {});
    [llave] = await select("menu_share_links", `shared_menu_id=${eq(compartido.id)}`, "token");
  }
  if (!llave?.token) return null;
  const bot = await nombreDelBot();
  return {
    nombre: "nuestro menú de la semana",
    web: `${base}/m/${compartido.id}?t=${llave.token}`,
    bot: `https://t.me/${bot}?start=m_${llave.token}`,
  };
}

/** Botones para mandarlo: WhatsApp con el enlace web (sale con foto) y Telegram con el de Lola. */
export function botonesCompartir(enlaces, tipo = "receta") {
  const texto = tipo === "semana"
    ? `Mira lo que comemos esta semana 👉 ${enlaces.web}`
    : `Mira esta receta: ${enlaces.nombre} 👉 ${enlaces.web}`;
  const pie = tipo === "semana" ? "Mira lo que comemos esta semana" : `Mira esta receta: ${enlaces.nombre}`;
  return [[
    { texto: "💬 Por WhatsApp", url: `https://wa.me/?text=${encodeURIComponent(texto)}` },
    { texto: "✈️ Por Telegram", url: `https://t.me/share/url?url=${encodeURIComponent(enlaces.bot)}&text=${encodeURIComponent(pie)}` },
  ]];
}

/**
 * Lo que hay detrás de un /start de compartir, o null si no es de compartir o
 * la llave ya no vale.
 * @returns {Promise<null | { tipo: "receta", receta: object, deQuien: string|null, propia: boolean }
 *   | { tipo: "semana", payload: object, deQuien: string|null }>}
 */
export async function resolverInvitacion(param) {
  const p = String(param ?? "");
  if (p.startsWith("rc_")) {
    const r = await recetaDelCatalogo(p.slice(3));
    return r ? { tipo: "receta", receta: r, deQuien: null, propia: false } : null;
  }
  if (p.startsWith("ru_")) {
    const [llave] = await select("recipe_share_links", `token=${eq(p.slice(3))}`, "recipe_id,owner_id");
    if (!llave) return null;
    const [fila] = await select("user_recipes", `id=${eq(llave.recipe_id)}`, "*");
    if (!fila) return null;
    return { tipo: "receta", receta: fila, deQuien: fila.owner_snapshot?.name ?? null, propia: true };
  }
  if (p.startsWith("m_")) {
    const [llave] = await select("menu_share_links", `token=${eq(p.slice(2))}`, "shared_menu_id");
    if (!llave) return null;
    const [menu] = await select("shared_menus", `id=${eq(llave.shared_menu_id)}`, "payload,title,owner_id");
    return menu ? { tipo: "semana", payload: menu.payload, deQuien: null } : null;
  }
  return null;
}

/**
 * «Guardar en mi recetario» una receta propia de otra persona: una copia a
 * nombre de quien la recibe, privada y firmada «de …» (copied_from_*, 0027),
 * en user_recipes (de donde la carga la app) y en la casa (de donde la usa el
 * motor al generar desde el chat).
 */
export async function copiarReceta(householdId, fila) {
  const dueno = await duenoDe(householdId);
  if (!dueno) return { error: "No encuentro quién gestiona tu casa." };
  if (fila.owner_id === dueno) return { ya: true, nombre: fila.name };
  const [ya] = await select("user_recipes", `owner_id=${eq(dueno)}&copied_from_recipe_id=${eq(fila.id)}`, "id,name");
  if (ya) return { ya: true, nombre: ya.name };
  const copia = {
    ...fila,
    id: `user_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    owner_id: dueno,
    visibility: "private",
    copied_from_recipe_id: fila.id,
    copied_from_owner_id: fila.owner_id,
    owner_snapshot: null,
    created_at: undefined,
    updated_at: undefined,
  };
  for (const k of Object.keys(copia)) if (copia[k] === undefined) delete copia[k];
  await insert("user_recipes", [copia]);
  const m = await motor();
  const receta = m.rowToRecipe(copia);
  const r = await conCasa(householdId, (casa) => {
    const data = casa.state?.data ?? {};
    const propias = (data.userRecipes ?? []).filter((x) => x.id !== receta.id);
    return { state: { ...casa.state, data: { ...data, userRecipes: [...propias, receta] } } };
  });
  if (!r.ok) console.error("[compartir] copiar en la casa", r.error);
  await rastro(householdId, RASTRO.RECETA_GUARDADA, { recipeId: copia.id, origen: ORIGEN_RECETA.RECIBIDA_ENLACE, baseDishId: null, copiadaDe: fila.id });
  return { ok: true, nombre: copia.name };
}

/** Una receta (del catálogo o fila de user_recipes) en HTML de Telegram. */
export function recetaEnTexto(r) {
  const tiempo = r.time ?? r.time_minutes;
  const ingredientes = (r.ingredients ?? []).map((i) => {
    const cant = [i.amount ?? i.qty, i.unit].filter((x) => x != null && x !== "").join(" ");
    return `• ${i.name}${cant ? `, ${cant}` : ""}`;
  });
  const pasos = (r.steps ?? []).map((s, n) => `${n + 1}. ${typeof s === "string" ? s : s?.text ?? ""}`);
  return [
    `<b>${esc(r.name)}</b>`,
    tiempo ? `⏱️ ${tiempo} min` : "",
    ingredientes.length ? `\n<b>Ingredientes</b>\n${esc(ingredientes.join("\n"))}` : "",
    pasos.length ? `\n<b>Pasos</b>\n${esc(pasos.join("\n"))}` : "",
  ].filter(Boolean).join("\n");
}

/** Una semana compartida (payload de buildSharedMenuPayload) en HTML de Telegram. */
export function semanaEnTexto(payload) {
  const DIA = { Lun: "Lunes", Mar: "Martes", "Mié": "Miércoles", Jue: "Jueves", Vie: "Viernes", "Sáb": "Sábado", Dom: "Domingo" };
  const dias = payload?.weeks?.[0]?.days ?? [];
  return dias.map((d) => {
    const comidas = d.meals.map((e) => `${e.slot === "Cena" ? "🌙" : "🍽️"} ${esc(e.dishes.map((x) => x.name).join(", "))}`);
    return `<b>${DIA[d.day] ?? d.day}</b>\n${comidas.join("\n")}`;
  }).join("\n\n");
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
