/**
 * La Mini App de Telegram: la semana y la compra, dentro del chat.
 *
 * ── Por qué no es la app entera ──────────────────────────────────────────
 * La app abre sesión con Google o con email, y ninguna de las dos funciona
 * dentro de Telegram: Google no deja iniciar sesión en navegadores embebidos,
 * y `?entrar=` solo abre cuentas nacidas en Telegram. Una madre que ya usa la
 * app con Google se quedaría en la puerta. Así que la Mini App no inicia
 * sesión: enseña lo mismo que el bot, con el mismo permiso que el bot.
 *
 * ── El permiso ───────────────────────────────────────────────────────────
 * Telegram firma los datos con que abre la Mini App (`initData`) con el token
 * del bot. Si la firma cuadra, el usuario es quien dice ser, y su chat privado
 * con el bot (chat_id = su id de Telegram) está enlazado a una casa en
 * bot_chats. Es exactamente lo que ya le deja al bot leer y tachar la compra:
 * no se abre ninguna puerta que no estuviera abierta.
 */

import crypto from "node:crypto";
import { select, eq } from "./db.js";
import { cargarCasa, conCasa } from "./casa.js";
import { prepararRecetas, grupos, DIAS, FRANJAS } from "./menu.js";
// Los pasillos de la app (Shopping.jsx agrupa con itemsByAisle). Se importa
// ingredientCategories.js y no shoppingListUtils.js: este último arrastra el
// catálogo entero (JSON, Supabase, import.meta.env) y no carga en Node a pelo.
import { SHOPPING_AISLES, guessShoppingAisle } from "../../src/lib/ingredientCategories.js";

// Lo que dura una apertura: Telegram manda `auth_date` y un initData viejo no
// debe servir de llave para siempre.
const CADUCIDAD_S = 24 * 3600;

/**
 * Comprueba la firma de `initData` (https://core.telegram.org/bots/webapps).
 * @returns {{ id: number, first_name?: string } | null} el usuario, o null si no vale
 */
export function validarInitData(initData, token, ahora = Date.now()) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const datos = [...params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secreto = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calculado = crypto.createHmac("sha256", secreto).update(datos).digest("hex");
  const a = Buffer.from(calculado, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const cuando = Number(params.get("auth_date"));
  if (!Number.isFinite(cuando) || ahora / 1000 - cuando > CADUCIDAD_S) return null;
  try {
    const usuario = JSON.parse(params.get("user") ?? "null");
    return usuario?.id ? usuario : null;
  } catch {
    return null;
  }
}

/** La casa enlazada al chat privado de ese usuario de Telegram. */
export async function casaDeUsuario(telegramId) {
  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(String(telegramId))}`, "household_id");
  return chat?.household_id ?? null;
}

const DIA_LARGO = { Lun: "Lunes", Mar: "Martes", "Mié": "Miércoles", Jue: "Jueves", Vie: "Viernes", "Sáb": "Sábado", Dom: "Domingo" };

/** La semana activa y la compra, en la forma que pinta la Mini App. */
export async function semanaYCompra(householdId) {
  const casa = await cargarCasa(householdId);
  if (!casa?.semana?.plan) return { semana: null, compra: [] };
  const m = await prepararRecetas(casa);
  const receta = (id) => {
    if (!id) return null;
    const r = m.RECIPES_BY_ID[id] ?? m.RECIPES_BY_ID[id.split("__").pop()];
    // El id base (sin prefijo de grupo) es el que resuelve la foto en el cliente.
    return r ? { id: id.split("__").pop(), nombre: r.name, minutos: r.time ?? null } : null;
  };
  const plan = casa.semana.plan;
  const gs = grupos(casa);
  const activos = casa.semana.activeDays?.length ? casa.semana.activeDays : DIAS.slice(casa.semana.startDayIdx ?? 0);
  const dias = activos.map((d) => ({
    clave: d,
    nombre: DIA_LARGO[d],
    comidas: FRANJAS.flatMap((f) => {
      // Los grupos que comen lo mismo, juntos, como en el chat.
      const porPlatos = new Map();
      for (const g of gs) {
        const h = plan[g.id]?.[`${d}-${f}`];
        if (!h) continue;
        const platos = [receta(h.firstRecipeId), receta(h.recipeId)].filter(Boolean);
        if (!platos.length) continue;
        const k = platos.map((p) => p.id).join("+");
        if (!porPlatos.has(k)) porPlatos.set(k, { franja: f, grupos: [], platos });
        porPlatos.get(k).grupos.push(g.label);
      }
      const bloques = [...porPlatos.values()];
      return bloques.map((b) => ({ ...b, grupos: bloques.length > 1 ? b.grupos : [] }));
    }),
  })).filter((d) => d.comidas.length);

  const compra = porPasillo((casa.semana.shopping?.items ?? []).filter((it) => !it.atHome && !it.fromPantry))
    .map((it) => ({
      id: it.id,
      nombre: it.name,
      seccion: it.pasillo,
      cantidad: it.displayQty || (it.qty ? `${it.qty}${it.unit ? ` ${it.unit}` : ""}` : ""),
      comprado: !!it.have,
    }));

  return { semana: { desde: casa.semana.weekStart, hasta: casa.semana.weekEnd, dias }, compra };
}

/**
 * Los productos en el orden de la lista de la app: por pasillo (el de
 * `guessShoppingAisle`, en el orden de SHOPPING_AISLES) y, dentro, por nombre.
 * Es lo que hace `itemsByAisle` (src/lib/shoppingListUtils.js), aplanado.
 */
export function porPasillo(items) {
  const orden = new Map(SHOPPING_AISLES.map((a, i) => [a, i]));
  return items
    .map((it) => ({ ...it, pasillo: guessShoppingAisle(it.name ?? "") }))
    .sort((a, b) => (orden.get(a.pasillo) ?? orden.size) - (orden.get(b.pasillo) ?? orden.size)
      || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Tacha (o destacha) un producto de la compra por su id, como el bot. */
export async function marcarPorId(householdId, id, comprado) {
  let hecho = false;
  const r = await conCasa(householdId, (casa) => {
    const items = (casa.semana?.shopping?.items ?? []).map((it) => ({ ...it }));
    const it = items.find((x) => x.id === id);
    if (!it) return null;
    it.have = !!comprado;
    hecho = true;
    const shopping = { ...(casa.semana.shopping ?? {}), items };
    // Sin foto para «deshaz»: si no, cada tachón taparía el último cambio de Lola.
    return { state: { ...casa.state, shopping }, semana: { shopping }, sinDeshacer: true };
  });
  return r.ok && hecho;
}
