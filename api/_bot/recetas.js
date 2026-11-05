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

import { seguirCon, fallaCon, SIN_LEER } from "./avisar.js";
import { select, insert, eq, config } from "./db.js";
import { deLaCharla } from "./chats.js";
import { cargarCasa, olvidarCasa } from "./casa.js";
import { motor, normal, prepararRecetas } from "./menu.js";
import { propiasDe, marcarFavorita, borrarRecetaDeCasa, carpetasDe, crearCarpeta, borrarCarpeta, enCarpeta, recuperarDescartada } from "./propias.js";
import { duenoDe, duenoDeEstricto, rastro, registrar } from "./embudo.js";
import { RASTRO, ORIGEN_RECETA } from "../../src/lib/rastro.js";
import { SYSTEM_PROMPTS } from "../_prompts.js";
import { buscarHibrido, pasaRasgos } from "./buscador.js";
import { rasgosDeFrase } from "../../src/lib/rasgosBusqueda.js";
import { paraEscribir } from "../../src/lib/vocabularios.js";
import { deshacerTambien, TIPO_OPERACION } from "./operacion.js";
import { resultado } from "./resultado.js";
import { seVeEn } from "./interprete.js";

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
 * Lo que encuentran las palabras, completado (o encabezado) por lo que encaja
 * por significado (buscador.js: rasgos + vectores, y Haiku de reserva). Una
 * consulta descriptiva («algo de cuchara para el frío», tres palabras o más)
 * o con rasgos o negación («pescado azul», «que no sea pescado») va primero
 * por significado: por palabras, «frío» encontraba el gazpacho y «sin
 * pescado» encontraba pescado. Una corta y sin rasgos («croquetas») va por
 * palabras, y el significado solo entra si no sale NADA.
 *
 * Lo que sale por palabras (y las recetas propias, que no tienen vector) pasa
 * por las mismas exclusiones: «sin pescado» no enseña una propia con pescado.
 */
export async function conSignificado(porPalabras, { consulta, categoria, maxMinutos, catalogo }, deps) {
  const palabras = normal(consulta).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !VACIAS.has(w));
  if (!palabras.length || categoria === "mias") return { halladas: porPalabras, aviso: "", via: "palabras" };
  const rasgos = rasgosDeFrase(consulta);
  const descriptiva = palabras.length >= 3 || rasgos.hayRasgos || rasgos.negacion;
  if (!descriptiva && porPalabras.length > 0) return { halladas: porPalabras, aviso: "", via: "palabras" };
  const h = await buscarHibrido(consulta, { catalogo, carpetaDe, categoria, maxMinutos, deps });
  const palabrasQuePasan = porPalabras.filter((r) => pasaRasgos(r, h));
  const juntas = descriptiva ? [...h.recetas, ...palabrasQuePasan] : [...palabrasQuePasan, ...h.recetas];
  return { halladas: [...new Map(juntas.map((r) => [r.id, r])).values()], aviso: h.aviso, via: h.via, parecido: h.parecidoMax ?? null };
}

/**
 * @param {{ fotos?: {url: string, pie: string}[] }} chat  las fotos de este turno
 */
export async function buscarRecetas(householdId, { consulta, categoria, maxMinutos, n = 6, conFotos = true }, chat = {}) {
  const casa = await cargarCasa(householdId);
  const m = await motor();
  if (casa) await prepararRecetas(casa);
  const propias = propiasDe(casa);
  // Del catálogo, solo el Recetario Estrella: el antiguo no se propone nunca
  // (lo que haya que rescatar de él se promueve a mano).
  const estrella = m.recipeCatalog.filter((r) => r.estrella);
  const todas = [...propias, ...estrella];
  const porPalabras = filtrarRecetas(todas, { consulta, categoria, maxMinutos });
  const { halladas, aviso: avisoBusqueda, via, parecido } = await conSignificado(porPalabras, { consulta, categoria, maxMinutos, catalogo: estrella });
  // Para la mejora semanal (scripts/bot-semanal.mjs): qué buscó, por dónde y
  // cuánto se parecía lo mejor. `texto` lo borra la retención a los 15 días.
  // Sin esperar: no retrasa la respuesta.
  duenoDe(householdId)
    .then((userId) => registrar("bot_busqueda", { userId, extra: { texto: String(consulta ?? "").slice(0, 200), via: via ?? "palabras", parecido: Number.isFinite(parecido) ? Math.round(parecido * 1000) / 1000 : null, n: halladas.length, categoria: categoria ?? null, esGrupo: Boolean(chat?.esGrupo) } }))
    // a propósito: es para la mejora semanal; no rompe la búsqueda
    .catch(seguirCon("recetas_busqueda"));
  if (!halladas.length) {
    return `No hay recetas de ${categoria ? CATEGORIAS[categoria] ?? categoria : "eso"}${consulta ? ` con «${consulta}»` : ""} en el recetario.`;
  }

  // Lo que la casa no puede comer se avisa, no se esconde: puede que busquen
  // justo para otra persona. Pero que se vea antes de elegir. Con las mismas
  // reglas que el motor (choquesDeReceta): alergias, «puede contener»,
  // intolerancias, dietas, embarazo o lactancia y etapa del bebé. Antes solo
  // miraba alérgenos, y comparaba la etiqueta guardada («Frutos de cáscara»)
  // con el id de la receta («frutos_cascara»), así que esa no avisaba nunca.
  const data = casa?.state?.data ?? {};
  const aviso = (r) => {
    const choques = m.choquesDeReceta(r, data);
    return choques.length ? ` ${choques.map(m.textoDeChoque).join("; ")}` : "";
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
    // Si se ha relajado lo pedido («al horno»), Lola tiene que saberlo para no venderlas como tal.
    avisoBusqueda ? `Ojo: ${avisoBusqueda}` : "",
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
async function ultimoApartado(householdId, chat, tipo) {
  const desde = encodeURIComponent(new Date(Date.now() - VALIDEZ_BORRADOR_H * 3600000).toISOString());
  const [fila] = await select(
    "bot_messages",
    `${deLaCharla(chat.channel, chat.chatId, householdId)}&content->>tipo=eq.${tipo}&created_at=gt.${desde}&order=created_at.desc&limit=1`,
    "content,created_at",
  );
  return fila?.content ? { ...fila.content, creadaEn: fila.created_at ?? null } : null;
}

/**
 * La foto apartada vale para la receta que se prepara ahora solo si se apartó
 * DESPUÉS del último borrador: una de antes era de otro plato (#958: sin foto
 * en el mensaje, usarFoto cogía la que se apartó para otra receta).
 */
function fotoDeEstaReceta(foto, borradorAnterior) {
  if (!foto?.url) return null;
  if (!borradorAnterior?.creadaEn || !foto.creadaEn) return foto.url;
  return Date.parse(foto.creadaEn) > Date.parse(borradorAnterior.creadaEn) ? foto.url : null;
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
  const url = await subirFoto(dueno, `bot_${Date.now().toString(36)}`, chat.adjunto).catch(fallaCon("recetas_subir_foto", null));
  if (!url) return "No he podido guardar la foto. Que la manden otra vez.";
  await insert("bot_messages", [{
    channel: paraEscribir("canales", chat.channel), chat_id: String(chat.chatId), household_id: householdId,
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
 *   unidad}], cuando (roles), paraNinos, preparacion, usarFoto
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
  const electro = m.KITCHEN_TOOL_IDS.includes(datos.electrodomestico) ? [datos.electrodomestico] : [];

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
    // a propósito: el porqué va al modelo, que pide repetir.
    console.warn("[recetas] borrador:", String(e?.message ?? e).slice(0, 200));
    return `No me ha salido bien la receta (${String(e?.message ?? e).slice(0, 160)}). Pide que lo intente otra vez.`;
  }

  // La foto del plato: la de este mismo mensaje o la que se apartó antes,
  // y esa solo si es de después del último borrador (fotoDeEstaReceta).
  let foto = null;
  if (datos.usarFoto) {
    if (chat.adjunto?.tipo === "image") {
      foto = await subirFoto(dueno, borrador.id, chat.adjunto).catch(fallaCon("recetas_subir_foto", null));
    } else {
      const [apartada, anterior] = await Promise.all([ultimoApartado(householdId, chat, TIPO_FOTO), ultimoApartado(householdId, chat, TIPO_BORRADOR)]);
      foto = fotoDeEstaReceta(apartada, anterior);
    }
  }
  // Siempre privada, como la que guarda la app (saveRecipe, RecipePlanner.jsx):
  // Gente está apagada (GENTE_ACTIVA, src/lib/frontalBot.js), y «publicada en
  // Gente» era publicar para cualquiera sin cuenta en un sitio que no se ve (#958).
  const receta = m.recetaParaGuardar(borrador, {
    mealRole: entrada.mealRole,
    requiredAppliances: electro,
    photo: foto,
    owner: { id: dueno },
    visibility: "private",
  });

  await insert("bot_messages", [{
    channel: paraEscribir("canales", chat.channel), chat_id: String(chat.chatId), household_id: householdId,
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
    `Foto: ${foto ? "sí" : datos.usarFoto ? "sin foto (no hay ninguna de este plato: que la manden)" : "sin foto"}; solo para la casa`,
  ].join("\n");
}

/**
 * Guarda el último borrador apartado en este chat. Solo con el «sí», y si es
 * la receta que han aprobado: si el último preparar_receta falló, el borrador
 * apartado es el de ANTES, y se guardaba otra receta (#958). El nombre
 * aprobado tiene que verse en el del borrador (seVeEn, el del cole).
 */
export async function guardarReceta(householdId, { confirmado, nombre = null }, chat) {
  if (confirmado !== true) return "Las recetas no se guardan sin su «sí». Enséñale el resumen y pregunta.";
  const receta = (await ultimoApartado(householdId, chat, TIPO_BORRADOR))?.receta;
  if (!receta) return "No tengo ninguna receta preparada en esta charla: prepárala primero con preparar_receta.";
  if (nombre && !seVeEn(nombre, receta.name)) {
    return resultado({ accion: "receta", sinHacer: [{ que: nombre, motivo: `la última preparada es «${receta.name}», no esa: hay que prepararla otra vez` }] });
  }
  const r = await guardarRecetaPropia(householdId, receta);
  // Sin dueño no llega ni al recetario: antes contestaba «Guardada en el
  // recetario, pero…» sin haber guardado nada.
  if (!r.enRecetario) return resultado({ accion: "receta", sinHacer: [{ que: receta.name, motivo: `no se ha podido guardar (${r.error}); sigue preparada: se puede volver a intentar` }] });
  await rastro(householdId, RASTRO.RECETA_GUARDADA, {
    recipeId: receta.id ?? null, baseDishId: receta.baseDishId ?? receta.linkedCatalogId ?? null,
    origen: receta.baseDishId || receta.linkedCatalogId ? ORIGEN_RECETA.VARIANTE : ORIGEN_RECETA.CREADA_BOT,
  });
  return resultado({ accion: "receta", hecho: [receta.name], nota: "Ya está en el recetario y puede salir en los menús." });
}

/**
 * Guarda una receta ya hecha como propia de la casa, en `user_recipes` (a
 * nombre del dueño de la casa): de ahí la leen la app y también Lola y su
 * motor (casa.js → propias.js, cada vez que carga la casa). Antes se copiaba
 * además en `data.userRecipes`, que la app quita en cada guardado: dos sitios
 * para un dato (#958). Ya no se escribe; se sigue leyendo de respaldo.
 *
 * La receta llega con la forma de la app (la de `recetaParaGuardar`). Quien
 * copia la de otra persona le pone antes id nuevo (`user_…`), `owner` y
 * `copiedFromRecipeId` / `copiedFromOwnerId`: aquí no se decide nada de eso.
 *
 * @returns {Promise<{ ok: boolean, enRecetario: boolean, error?: string }>}
 *   `enRecetario`: si llegó a `user_recipes`.
 */
export async function guardarRecetaPropia(householdId, receta) {
  const dueno = receta.owner?.id ?? (await duenoDe(householdId));
  if (!dueno) return { ok: false, enRecetario: false, error: "casa sin dueño" };
  const m = await motor();
  const lista = { ...receta, owner: receta.owner ?? { id: dueno }, source: "user" };
  // ¿Es nueva? Solo una nueva se borra al deshacer: una que ya estaba y se ha
  // sobrescrito no se puede devolver a como era desde aquí.
  const previa = lista.id
    ? await select("user_recipes", `id=${eq(lista.id)}&owner_id=${eq(dueno)}`, "id").catch(fallaCon("receta_ya_estaba", SIN_LEER))
    : [{ id: null }];
  await insert("user_recipes", [m.recipeToRow(lista, dueno)], { upsert: true });
  // «Deshaz» quita también esta fila (#958). Sin escritura en la casa, el
  // paso va en el apunte de la operación (agente.js → apuntarOperacion), que
  // casa.js deshace con quitarRecetaGuardada. Si no se pudo mirar si era
  // nueva, no se borra a ciegas: deshacer avisa de que sigue.
  if (previa === SIN_LEER) deshacerTambien({ tipo: TIPO_OPERACION.RECETA, id: lista.id, dueno, sinSaber: true });
  else if (!previa.length) deshacerTambien({ tipo: TIPO_OPERACION.RECETA, id: lista.id, dueno });
  // La casa recordada de hace unos segundos no la trae: que el siguiente
  // turno (o el generar de este) la lea de la tabla.
  olvidarCasa(householdId);
  return { ok: true, enRecetario: true };
}

/**
 * La receta (catálogo o propia de la casa) que nombra un texto, o null. Para
 * `compartir`, que recibe «la tortilla de calabacín» y necesita un id.
 */
export async function recetaPorNombre(householdId, texto) {
  const casa = await cargarCasa(householdId);
  const m = await motor();
  if (casa) await prepararRecetas(casa);
  const todas = [...propiasDe(casa), ...m.recipeCatalog];
  const q = normal(texto);
  return todas.find((r) => r.id === texto || normal(r.name) === q) ?? filtrarRecetas(todas, { consulta: texto })[0] ?? null;
}

/** Lo que hace receta_propia (agente.js, trozo 48): su `accion`, lista cerrada. */
export const ACCIONES_RECETA = Object.freeze(["favorita", "no_favorita", "borrar", "nueva_carpeta", "borrar_carpeta", "a_carpeta", "sacar_de_carpeta", "recuperar"]);
export const ACCION_RECETA = Object.freeze(Object.fromEntries(ACCIONES_RECETA.map((a) => [a.toUpperCase(), a])));

/**
 * La carpeta que nombran, entre las de la cuenta: la de nombre igual y, si no, la única en la que se ve lo dicho
 * (seVeEn). Con dos o más parecidas, ninguna: mejor preguntar que meter la receta en otra.
 */
export function carpetaPorNombre(carpetas, dicho) {
  const q = normal(dicho ?? "");
  const igual = carpetas.find((c) => normal(c.nombre) === q);
  if (igual) return igual;
  const parecidas = carpetas.filter((c) => seVeEn(dicho ?? "", c.nombre));
  return parecidas.length === 1 ? parecidas[0] : null;
}

const sinCarpeta = (que, motivo) => resultado({ accion: "recetas", sinHacer: [{ que, motivo }] });

/** Crear o borrar una carpeta de la cuenta de quien escribe (trozo 48, parte 2). Borrar pide su «sí» con el nombre. */
async function cambiarCarpeta({ accion, carpeta: dicho, confirmado }, userId, d) {
  if (!dicho) return sinCarpeta("carpeta", "falta el nombre de la carpeta");
  const carpetas = await d.carpetas(userId).catch(fallaCon("recetas_carpetas", SIN_LEER));
  if (carpetas === SIN_LEER) return sinCarpeta(dicho, "no he podido leer tus carpetas en la base: prueba en un rato");
  if (accion === ACCION_RECETA.NUEVA_CARPETA) {
    const ya = carpetas.find((c) => normal(c.nombre) === normal(dicho));
    if (ya) return sinCarpeta(dicho, `ya tienes una carpeta «${ya.nombre}»`);
    await d.crear(userId, dicho.trim());
    return resultado({ accion: "recetas", hecho: [`carpeta «${dicho.trim()}» creada`] });
  }
  const c = carpetaPorNombre(carpetas, dicho);
  if (!c) return sinCarpeta(dicho, "no encuentro esa carpeta entre las tuyas");
  if (c.fija) return sinCarpeta(c.nombre, "es una de las cuatro carpetas fijas: no se borra");
  if (confirmado !== true || !seVeEn(dicho, c.nombre)) return `Antes de borrarla, pregunta si seguro que quieren borrar la carpeta «${c.nombre}» (las recetas no se borran, solo salen de ella; no se puede deshacer), y bórrala solo con su «sí», llamando con ese nombre.`;
  await d.borrarLaCarpeta(userId, c.id);
  return resultado({ accion: "recetas", hecho: [`carpeta «${c.nombre}» borrada`] });
}

/**
 * Favoritas, carpetas y borrar una receta propia desde Lola, como en la app (trozo 48). Borrar no se deshace: pide
 * `confirmado` y que la receta encontrada sea la que se nombró; sin eso, contesta cuál ha encontrado para preguntar.
 * Favoritas y carpetas son de cada cuenta, como en la app: sin saber la de quien escribe, no se tocan.
 * @param {{ accion: string, receta?: string, carpeta?: string, confirmado?: boolean }} args
 * @param {{ userId?: string|null }} quien
 */
export async function cambiarRecetaPropia(householdId, { accion, receta: nombre, carpeta, confirmado = false }, quien = {}, deps = {}) {
  const { buscar = recetaPorNombre, favorita = marcarFavorita, borrarDeCasa = borrarRecetaDeCasa, dueno = duenoDeEstricto } = deps;
  const d = { carpetas: carpetasDe, crear: crearCarpeta, borrarLaCarpeta: borrarCarpeta, meter: enCarpeta, recuperar: recuperarDescartada, ...deps };
  const sinCuenta = (que) => sinCarpeta(que, "las favoritas y las carpetas son de cada cuenta y no sé cuál es la tuya: hazlo desde la app");
  if (accion === ACCION_RECETA.NUEVA_CARPETA || accion === ACCION_RECETA.BORRAR_CARPETA) {
    return quien.userId ? cambiarCarpeta({ accion, carpeta, confirmado }, quien.userId, d) : sinCuenta(carpeta ?? "carpeta");
  }
  if (!nombre) return sinCarpeta("receta", "falta el nombre de la receta");
  const receta = await buscar(householdId, nombre);
  if (!receta) return resultado({ accion: "recetas", sinHacer: [{ que: nombre, motivo: "no encuentro esa receta ni en las vuestras ni en el catálogo" }] });
  if (accion === ACCION_RECETA.RECUPERAR) {
    // Los descartes son de la casa, no de una cuenta (household_recipe_discards).
    const hecho = await d.recuperar(householdId, receta.id).catch(fallaCon("recetas_descartes", SIN_LEER));
    if (hecho === SIN_LEER) return sinCarpeta(receta.name, "no he podido leer los descartes en la base: prueba en un rato");
    if (!hecho) return sinCarpeta(receta.name, "no está entre vuestras descartadas");
    olvidarCasa(householdId);
    return resultado({ accion: "recetas", hecho: [`«${receta.name}» fuera de descartadas: ya puede volver a salir en los menús`] });
  }
  if (accion === ACCION_RECETA.BORRAR) {
    if (receta.source !== "user") return resultado({ accion: "recetas", sinHacer: [{ que: receta.name, motivo: "es del catálogo de HoMenu, no vuestra: no se puede borrar" }] });
    if (confirmado !== true || !seVeEn(nombre, receta.name)) return `Antes de borrarla, pregunta si seguro que quieren borrar «${receta.name}» de sus recetas (no se puede deshacer), y bórrala solo con su «sí», llamando con ese nombre.`;
    // Comprobar que es de la casa es el freno: si la base falla, se dice que no se pudo, no «no es de esta casa».
    const sinComprobar = resultado({ accion: "recetas", sinHacer: [{ que: receta.name, motivo: "no he podido comprobar en la base que sea vuestra, así que no he borrado nada: prueba en un rato" }] });
    const suyo = await dueno(householdId).catch(fallaCon("recetas_borrar_propia", SIN_LEER));
    if (suyo === SIN_LEER) return sinComprobar;
    if (!suyo) return resultado({ accion: "recetas", sinHacer: [{ que: receta.name, motivo: "no encuentro de quién es esta casa" }] });
    const hecho = await borrarDeCasa(householdId, suyo, receta.id).catch(fallaCon("recetas_borrar_propia", SIN_LEER));
    if (hecho === SIN_LEER) return sinComprobar;
    if (hecho) olvidarCasa(householdId);
    return hecho
      ? resultado({ accion: "recetas", hecho: [`«${receta.name}» borrada`] })
      : resultado({ accion: "recetas", sinHacer: [{ que: receta.name, motivo: "no es una receta de esta casa" }] });
  }
  if (!quien.userId) return sinCuenta(receta.name);
  if (accion === ACCION_RECETA.A_CARPETA || accion === ACCION_RECETA.SACAR_DE_CARPETA) {
    if (!carpeta) return sinCarpeta(receta.name, "falta el nombre de la carpeta");
    const carpetas = await d.carpetas(quien.userId).catch(fallaCon("recetas_carpetas", SIN_LEER));
    if (carpetas === SIN_LEER) return sinCarpeta(receta.name, "no he podido leer tus carpetas en la base: prueba en un rato");
    const c = carpetaPorNombre(carpetas, carpeta);
    if (!c) return sinCarpeta(receta.name, `no tienes ninguna carpeta «${carpeta}»: tus carpetas son ${carpetas.map((x) => `«${x.nombre}»`).join(", ")}; si quieren una nueva, créala antes`);
    const meter = accion === ACCION_RECETA.A_CARPETA;
    await d.meter(quien.userId, receta.id, c.id, meter);
    return resultado({ accion: "recetas", hecho: [meter ? `«${receta.name}» en la carpeta «${c.nombre}»` : `«${receta.name}» fuera de la carpeta «${c.nombre}»`] });
  }
  const marcar = accion === ACCION_RECETA.FAVORITA;
  await favorita(quien.userId, receta.id, marcar);
  return resultado({ accion: "recetas", hecho: [marcar ? `«${receta.name}» en favoritas` : `«${receta.name}» fuera de favoritas`] });
}
