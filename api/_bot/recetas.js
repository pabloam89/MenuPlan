/**
 * Recetas desde el chat: buscarlas en el recetario y crear una propia.
 *
 * ── Buscar ───────────────────────────────────────────────────────────────
 * «Recetas de sólidos para el bebé», «algo con garbanzos», «postres fáciles»:
 * el recetario entero (el catálogo y las recetas propias de la casa), con las
 * mismas categorías que las carpetas de la app, para que «abrir en la app»
 * caiga en la misma carpeta que se ha visto aquí.
 *
 * ── Crear ────────────────────────────────────────────────────────────────
 * Lo mismo que el asistente de la app (RecipePlanner.jsx), sin formulario: se
 * manda al modelo lo que se ha contado con `payloadDeBorrador`, la respuesta
 * pasa por `borradorDesdeRespuesta` (normaliza, calcula la nutrición, valida)
 * y se guarda con `recetaParaGuardar` + `recipeToRow`. Una receta dictada por
 * Telegram es la misma que una hecha en la app: sale en el recetario y el
 * motor la puede poner en el menú.
 *
 * En dos tiempos, como las alergias: `prepararReceta` enseña el resultado y
 * lo deja apartado; solo `guardarReceta`, tras el «sí», lo guarda. El borrador
 * apartado va en bot_messages con texto vacío (memoria() lo ignora), así no
 * hace falta otra tabla ni volver a llamar al modelo al confirmar.
 */

import { select, insert, eq, config } from "./db.js";
import { cargarCasa, conCasa } from "./casa.js";
import { motor, normal, prepararRecetas } from "./menu.js";
import { duenoDe } from "./embudo.js";
import { SYSTEM_PROMPTS } from "../_prompts.js";

// Las carpetas del recetario de la app (CATEGORY_META en CatalogBrowserSheet).
// Los bebés van partidos por etapa, como allí.
export const CATEGORIAS = {
  legumbres: "Legumbres", carnes: "Carnes", pescados: "Pescados", huevos: "Huevos",
  pasta_arroces: "Pasta y arroz", sopas_cremas: "Sopas y cremas", ensaladas_verduras: "Ensaladas y verduras",
  platos_unicos: "Platos únicos", bebes_cremas: "Cremas de bebé", bebes_solidos: "Sólidos de bebé",
  desayunos: "Desayunos", meriendas: "Meriendas", postres: "Postres", guarniciones: "Guarniciones",
  salsas: "Salsas", mias: "Vuestras recetas",
};

/** La carpeta de una receta, con la misma regla que `catKeyOf` de la app. */
export function carpetaDe(r) {
  if (r?.category !== "bebes") return r?.category;
  return (r.etapaBebe ?? "cremas") === "solidos" ? "bebes_solidos" : "bebes_cremas";
}

// Palabras que no dicen qué receta se busca («recetas de…», «algo con…»).
const VACIAS = new Set(["receta", "recetas", "algo", "alguna", "algun", "para", "con", "que", "los", "las", "del", "una", "unos", "unas", "de", "el", "la", "y", "me", "dame", "ideas", "plato", "platos"]);
const escapar = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Las recetas que casan con la consulta y la carpeta, mejor las que lo dicen
 * en el nombre. Pura, para el test.
 */
export function filtrarRecetas(recetas, { consulta = "", categoria = null, maxMinutos = null } = {}) {
  const palabras = normal(consulta).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !VACIAS.has(w));
  const res = [];
  for (const r of recetas) {
    if (!r?.name) continue;
    if (categoria === "mias" ? r.source !== "user" : categoria && carpetaDe(r) !== categoria) continue;
    if (maxMinutos && r.time && r.time > maxMinutos) continue;
    let puntos = 0;
    if (palabras.length) {
      const nombre = normal(r.name);
      const resto = normal([r.description, ...(r.ingredients ?? []).map((i) => i?.name)].filter(Boolean).join(" "));
      for (const w of palabras) {
        // Con frontera: «pollo» no es «repollo».
        const re = new RegExp(`\\b${escapar(w)}`);
        if (re.test(nombre)) puntos += 3;
        else if (re.test(resto)) puntos += 1;
      }
      if (!puntos) continue;
    }
    res.push({ r, puntos });
  }
  return res.sort((a, b) => b.puntos - a.puntos || a.r.name.localeCompare(b.r.name, "es")).map((x) => x.r);
}

/**
 * @param {{ fotos?: {url: string, pie: string}[] }} chat  las fotos de este turno
 */
export async function buscarRecetas(householdId, { consulta, categoria, maxMinutos, n = 6, conFotos = true }, chat = {}) {
  const casa = await cargarCasa(householdId);
  const m = await motor();
  if (casa) await prepararRecetas(casa);
  const propias = casa?.state?.data?.userRecipes ?? [];
  const todas = [...propias, ...m.recipeCatalog];
  const halladas = filtrarRecetas(todas, { consulta, categoria, maxMinutos });
  if (!halladas.length) {
    return `No hay recetas de ${categoria ? CATEGORIAS[categoria] ?? categoria : "eso"}${consulta ? ` con «${consulta}»` : ""} en el recetario.`;
  }

  // Lo que la casa no puede comer se avisa, no se esconde: puede que busquen
  // justo para otra persona. Pero que se vea antes de elegir.
  const evitar = new Set((casa?.state?.data?.members ?? []).flatMap((p) => p.allergies ?? []).map((a) => normal(a)));
  const aviso = (r) => {
    const choca = (r.allergens ?? []).filter((a) => evitar.has(normal(a)));
    return choca.length ? ` ⚠️ lleva ${choca.join(", ")}` : "";
  };

  const mostrar = halladas.slice(0, Math.min(Math.max(n, 1), 10));
  if (conFotos && chat.fotos) {
    for (const [i, r] of mostrar.slice(0, 4).entries()) {
      const url = r.source === "user" ? (/^https?:/.test(r.photo ?? "") ? r.photo : null) : m.dishImageForRecipe(r);
      if (url && !chat.fotos.some((f) => f.url === url)) chat.fotos.push({ url, pie: `${i + 1}. ${r.name}` });
    }
  }
  return [
    `${halladas.length} receta(s)${categoria ? ` en ${CATEGORIAS[categoria] ?? categoria}` : ""}${consulta ? ` para «${consulta}»` : ""}. Las primeras ${mostrar.length}:`,
    ...mostrar.map((r, i) => `${i + 1}. ${r.name}${r.time ? ` (${r.time} min)` : ""}${r.source === "user" ? " [vuestra]" : ""}${aviso(r)}`),
    halladas.length > mostrar.length ? `Hay ${halladas.length - mostrar.length} más: se pueden pedir o verlas todas en la app.` : "",
  ].filter(Boolean).join("\n");
}

// ── Crear ───────────────────────────────────────────────────────────────────

// El SDK se carga solo al crear una receta: buscar no lo necesita.
let cliente = null;
async function anthropic() {
  if (!cliente) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    cliente = new Anthropic();
  }
  return cliente;
}

const TIPO_BORRADOR = "borrador_receta";
const TIPO_FOTO = "foto_receta";
const VALIDEZ_BORRADOR_H = 24;

/** La última fila apartada de un tipo en este chat (borrador o foto), si es de hoy. */
async function ultimoApartado(chat, tipo) {
  const desde = encodeURIComponent(new Date(Date.now() - VALIDEZ_BORRADOR_H * 3600000).toISOString());
  const [fila] = await select(
    "bot_messages",
    `channel=${eq(chat.channel)}&chat_id=${eq(String(chat.chatId))}&content->>tipo=eq.${tipo}&created_at=gt.${desde}&order=created_at.desc&limit=1`,
    "content",
  );
  return fila?.content ?? null;
}

/**
 * La foto del plato llega en SU mensaje y el resto de la receta en los
 * siguientes, pero la imagen solo existe en el turno en que llega. Se sube ya
 * y se aparta la URL para cuando se prepare la receta.
 */
export async function apartarFotoPlato(householdId, chat) {
  if (chat.adjunto?.tipo !== "image") return "En este mensaje no hay ninguna foto que guardar.";
  const dueno = await duenoDe(householdId);
  if (!dueno) return "No encuentro de quién es esta casa.";
  const url = await subirFoto(dueno, `bot_${Date.now().toString(36)}`, chat.adjunto).catch(() => null);
  if (!url) return "No he podido guardar la foto. Que la manden otra vez.";
  await insert("bot_messages", [{
    channel: chat.channel, chat_id: String(chat.chatId), household_id: householdId,
    role: "assistant", author_id: null, content: { texto: "", tipo: TIPO_FOTO, url },
  }]);
  return "Foto del plato apartada: irá con la receta cuando la prepares (usarFoto = true).";
}

/** El primer objeto JSON de una respuesta del modelo (puede venir con texto alrededor). */
function sacarJson(texto) {
  const a = texto.indexOf("{");
  const b = texto.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("La respuesta no trae JSON");
  return JSON.parse(texto.slice(a, b + 1));
}

/** Sube la foto del plato al mismo sitio que la app: recipe-photos/<dueño>/<receta>.<ext>. */
async function subirFoto(dueno, recetaId, adjunto) {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[adjunto.mediaType] ?? "jpg";
  const ruta = `${dueno}/${recetaId}.${ext}`;
  const { url, headers } = config();
  const res = await fetch(`${url}/storage/v1/object/recipe-photos/${ruta}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": adjunto.mediaType, "x-upsert": "true", "cache-control": "31536000" },
    body: Buffer.from(adjunto.base64, "base64"),
  });
  if (!res.ok) throw new Error(`foto → ${res.status}`);
  return `${url}/storage/v1/object/public/recipe-photos/${ruta}`;
}

/**
 * Estructura la receta y la deja apartada para confirmar. No guarda nada.
 *
 * @param {object} datos  lo que el asistente de la app pregunta: nombre,
 *   raciones, minutos, electrodomestico, ingredientes [{nombre, cantidad,
 *   unidad}], cuando (roles), paraNinos, preparacion, visibilidad, usarFoto
 * @param {{ channel: string, chatId: string, adjunto?: object }} chat
 */
export async function prepararReceta(householdId, datos, chat) {
  const m = await motor();
  const dueno = await duenoDe(householdId);
  if (!dueno) return "No encuentro de quién es esta casa; la receta se guarda en la cuenta de quien la creó.";

  const unidades = new Set(m.INGREDIENT_UNITS);
  const ingredientes = (datos.ingredientes ?? [])
    .filter((i) => i?.nombre)
    .map((i) => ({ name: String(i.nombre).trim(), amount: Number(i.cantidad) || 0, unit: unidades.has(i.unidad) ? i.unidad : "ud" }));
  if (!datos.nombre || !ingredientes.length) return "Faltan el nombre o los ingredientes: pídeselos antes de preparar la receta.";
  const electro = m.KITCHEN_TOOLS.includes(datos.electrodomestico) ? [datos.electrodomestico] : [];

  const entrada = {
    name: String(datos.nombre).trim(),
    baseServings: Number(datos.raciones) || 4,
    time: Number(datos.minutos) || 30,
    mealRole: datos.cuando ?? [],
    kidFriendly: typeof datos.paraNinos === "boolean" ? datos.paraNinos : null,
    ingredients: ingredientes,
    requiredAppliances: electro,
    preparationNotes: datos.preparacion ?? "",
  };
  const payload = m.payloadDeBorrador(entrada);
  const r = await (await anthropic()).messages.create({
    model: m.FAST_MODEL,
    max_tokens: 2600,
    system: SYSTEM_PROMPTS["structure-recipe"],
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });
  const texto = (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let borrador;
  try {
    borrador = m.borradorDesdeRespuesta(sacarJson(texto), payload);
  } catch (e) {
    return `No me ha salido bien la receta (${String(e?.message ?? e).slice(0, 160)}). Pide que lo intente otra vez.`;
  }

  // La foto del plato: la de este mismo mensaje o la que se apartó antes.
  let foto = null;
  if (datos.usarFoto) {
    foto = chat.adjunto?.tipo === "image"
      ? await subirFoto(dueno, borrador.id, chat.adjunto).catch(() => null)
      : (await ultimoApartado(chat, TIPO_FOTO))?.url ?? null;
  }
  const receta = m.recetaParaGuardar(borrador, {
    mealRole: entrada.mealRole,
    requiredAppliances: electro,
    photo: foto,
    owner: { id: dueno },
    visibility: datos.visibilidad === "publica" ? "public" : "private",
  });

  await insert("bot_messages", [{
    channel: chat.channel, chat_id: String(chat.chatId), household_id: householdId,
    role: "assistant", author_id: null, content: { texto: "", tipo: TIPO_BORRADOR, receta },
  }]);

  const papel = { primero: "primero", segundo: "segundo", plato_unico: "plato único", cena: "cena", merienda: "merienda", postre: "postre", guarnicion: "guarnición" };
  return [
    `Receta preparada, SIN guardar todavía. Enséñasela y pregunta si la guardo:`,
    `Nombre: ${receta.name}`,
    `Raciones: ${receta.baseServings}; tiempo: ${receta.time} min; dificultad: ${receta.difficulty}`,
    `Cuándo: ${(receta.mealRole ?? []).map((x) => papel[x] ?? x).join(", ") || "sin decir"}`,
    `Alérgenos: ${(receta.allergens ?? []).join(", ") || "ninguno detectado"}`,
    `Ingredientes: ${receta.ingredients.map((i) => `${i.name}${i.amount ? ` ${i.amount} ${i.unit}` : ""}`).join("; ")}`,
    `Pasos: ${(receta.steps ?? []).length}`,
    `Foto: ${foto ? "la del mensaje" : "sin foto"}; visibilidad: ${receta.visibility === "public" ? "publicada en Gente" : "solo para la casa"}`,
  ].join("\n");
}

/** Guarda el último borrador apartado en este chat. Solo con el «sí». */
export async function guardarReceta(householdId, { confirmado }, chat) {
  if (confirmado !== true) return "Las recetas no se guardan sin su «sí». Enséñale el resumen y pregunta.";
  const receta = (await ultimoApartado(chat, TIPO_BORRADOR))?.receta;
  if (!receta) return "No tengo ninguna receta preparada en esta charla: prepárala primero con preparar_receta.";
  const r = await guardarRecetaPropia(householdId, receta);
  if (!r.ok) return `Guardada en el recetario, pero no he podido apuntarla en la casa (${r.error}): saldrá en el menú cuando alguien abra la app.`;
  return `Guardada: «${receta.name}». Ya está en el recetario y puede salir en los menús.`;
}

/**
 * Guarda una receta ya hecha como propia de la casa: en `user_recipes` (donde
 * la lee la app, a nombre del dueño de la casa) y en `data.userRecipes` (para
 * que el motor ya pueda ponerla al generar desde el chat).
 *
 * La receta llega con la forma de la app (la de `recetaParaGuardar`). Quien
 * copia la de otra persona le pone antes id nuevo (`user_…`), `owner` y
 * `copiedFromRecipeId` / `copiedFromOwnerId`: aquí no se decide nada de eso.
 *
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function guardarRecetaPropia(householdId, receta) {
  const dueno = receta.owner?.id ?? (await duenoDe(householdId));
  if (!dueno) return { ok: false, error: "casa sin dueño" };
  const m = await motor();
  const lista = { ...receta, owner: receta.owner ?? { id: dueno }, source: "user" };
  await insert("user_recipes", [m.recipeToRow(lista, dueno)], { upsert: true });
  const r = await conCasa(householdId, (casa) => {
    const data = casa.state?.data ?? {};
    const otras = (data.userRecipes ?? []).filter((x) => x.id !== lista.id);
    return { state: { ...casa.state, data: { ...data, userRecipes: [...otras, lista] } } };
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * La receta (catálogo o propia de la casa) que nombra un texto, o null. Para
 * `compartir`, que recibe «la tortilla de calabacín» y necesita un id.
 */
export async function recetaPorNombre(householdId, texto) {
  const casa = await cargarCasa(householdId);
  const m = await motor();
  if (casa) await prepararRecetas(casa);
  const todas = [...(casa?.state?.data?.userRecipes ?? []), ...m.recipeCatalog];
  const q = normal(texto);
  return todas.find((r) => r.id === texto || normal(r.name) === q) ?? filtrarRecetas(todas, { consulta: texto })[0] ?? null;
}
