/**
 * El agente que conversa en Telegram (fase 1, specs/plan-bot-mensajeria.md).
 *
 * UN agente (Claude Sonnet 5) con herramientas sobre la casa enlazada al chat.
 * Principio que no se toca: el modelo traduce lo que dices a herramientas y el
 * MOTOR decide los platos (`pickCatalogReplacement`, el solver). El modelo no
 * inventa recetas ni escribe datos por su cuenta: solo hace lo que pasa por una
 * herramienta, y cada herramienta valida y guarda como la app (./menu.js).
 *
 * Memoria: lo último de la charla (bot_messages, pocos días) para el contexto;
 * lo que importa se guarda en la casa, no en la charla.
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { select, insert, eq } from "./db.js";
import { cargarCasa } from "./casa.js";
import {
  describirCasa, describirMenu, describirReceta, describirCompra,
  marcarCompra, anadirCompra, cambiarPlato, diaDe, franjaDe,
} from "./menu.js";

const MODELO = "claude-sonnet-5";
const TURNOS_DE_MEMORIA = 16;
const DIAS_DE_MEMORIA = 3;

const SISTEMA = `Eres HoMenu, el asistente de una app española de menús familiares. Hablas con una familia por Telegram: a veces una persona en privado, a veces varias en un grupo.

Qué haces: consultar y cambiar el menú de la semana, enseñar recetas e ingredientes, llevar la lista de la compra y responder dudas de cocina de la casa. Para TODO lo que toque datos de la casa usa las herramientas: nunca te inventes platos, recetas, cantidades ni lo que hay en el menú. Si una herramienta no puede hacer algo, dilo con naturalidad y, si tiene sentido, sugiere hacerlo en la app de HoMenu.

Reglas:
- Ante cualquier pregunta sobre el menú, una receta, la compra o la familia, llama PRIMERO a la herramienta que corresponda, aunque creas saber la respuesta o ya lo hayas consultado antes en la charla: los datos cambian (otra persona puede haber tocado la app). Nunca digas que no tienes acceso a algo sin haberlo consultado.
- El menú activo puede ser de una semana que ya pasó. Si te preguntan por él, enséñalo igualmente y avisa de las fechas.
- Los platos los elige el motor de HoMenu, no tú. Para cambiar un plato usa cambiar_plato; no propongas recetas de tu cosecha como si fueran del menú.
- Alergias e intolerancias: tómalas muy en serio. Nunca des por hecho que alguien puede comer algo que choque con ellas.
- Cuando cambies algo, confírmalo en una frase diciendo qué ha cambiado. En un grupo, di también quién lo pidió.
- Si te falta un dato para actuar (qué día, qué comida), pregúntalo en corto antes de hacer nada.
- Generar un menú nuevo desde el chat aún no está disponible: si lo piden, dilo y que lo hagan desde la app de momento.
- Aún no entiendes notas de voz ni fotos: si llegan, dilo amablemente.

Estilo: cercano, breve y útil, como un amigo que cocina. Contesta en el idioma en que te escriban (los nombres de los platos, tal cual). Formato de Telegram en HTML: <b>negrita</b> e <i>cursiva</i>; nada de Markdown (ni asteriscos ni almohadillas). Listas con «•». Emojis con moderación. Para el menú de la semana, un bloque por día con el día en negrita.`;

let cliente = null;
const anthropic = () => (cliente ??= new Anthropic());

function herramientas(householdId) {
  const conCasa = async (f) => {
    const casa = await cargarCasa(householdId);
    if (!casa) return "Esta casa todavía no tiene datos en la nube. Que entren una vez en la app de HoMenu.";
    return f(casa);
  };
  const diaValido = (d) => diaDe(d) ?? null;

  return [
    betaTool({
      name: "ver_casa",
      description: "Quién vive en la casa (nombres, edades, alergias, intolerancias, lo que no les gusta), los grupos de menú, qué comidas se planifican y qué día es hoy.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: () => conCasa((casa) => describirCasa(casa)),
    }),
    betaTool({
      name: "ver_menu",
      description: "El menú de la semana activa: todo, o solo un día. Úsalo para «qué comemos hoy», «qué hay el jueves», «pásame el menú».",
      inputSchema: {
        type: "object",
        properties: { dia: { type: "string", description: "Opcional: lunes…domingo, «hoy» o «mañana». Sin él, la semana entera." } },
        additionalProperties: false,
      },
      run: ({ dia }) => conCasa((casa) => {
        const d = dia ? diaValido(dia) : null;
        if (dia && !d) return `No entiendo el día «${dia}».`;
        return describirMenu(casa, { dia: d });
      }),
    }),
    betaTool({
      name: "ver_receta",
      description: "Ingredientes y pasos de una receta, por su nombre (normalmente uno de los platos del menú).",
      inputSchema: {
        type: "object",
        properties: { nombre: { type: "string", description: "Nombre del plato, aunque sea aproximado." } },
        required: ["nombre"],
        additionalProperties: false,
      },
      run: ({ nombre }) => conCasa((casa) => describirReceta(casa, nombre)),
    }),
    betaTool({
      name: "ver_compra",
      description: "La lista de la compra de la semana activa: lo que falta por comprar, por secciones.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: () => conCasa((casa) => describirCompra(casa)),
    }),
    betaTool({
      name: "marcar_compra",
      description: "Marca productos de la lista como comprados (o los devuelve a pendientes). Usa los nombres como aparecen en la lista.",
      inputSchema: {
        type: "object",
        properties: {
          productos: { type: "array", items: { type: "string" }, minItems: 1 },
          estado: { type: "string", enum: ["comprado", "pendiente"] },
        },
        required: ["productos", "estado"],
        additionalProperties: false,
      },
      run: ({ productos, estado }) => marcarCompra(householdId, productos, estado),
    }),
    betaTool({
      name: "anadir_compra",
      description: "Añade a la lista de la compra cosas que no salen del menú («añade leche», «apunta pilas»).",
      inputSchema: {
        type: "object",
        properties: { productos: { type: "array", items: { type: "string" }, minItems: 1 } },
        required: ["productos"],
        additionalProperties: false,
      },
      run: ({ productos }) => anadirCompra(householdId, productos),
    }),
    betaTool({
      name: "cambiar_plato",
      description: "Cambia el plato de un hueco del menú por otro que elige el motor de HoMenu respetando alergias y preferencias. En la comida hay primero y segundo; «cual» dice cuál cambiar.",
      inputSchema: {
        type: "object",
        properties: {
          dia: { type: "string", description: "lunes…domingo, «hoy» o «mañana»." },
          comida: { type: "string", enum: ["Desayuno", "Comida", "Merienda", "Cena", "Postre"] },
          grupo: { type: "string", description: "Opcional: el grupo de menú (p. ej. «Bebé») si hay varios." },
          cual: { type: "string", enum: ["principal", "primero"], description: "Por defecto el principal (el segundo en la comida)." },
        },
        required: ["dia", "comida"],
        additionalProperties: false,
      },
      run: ({ dia, comida, grupo, cual }) => {
        const d = diaValido(dia);
        const f = franjaDe(comida);
        if (!d || !f) return `No entiendo qué hueco es («${dia}», «${comida}»).`;
        return cambiarPlato(householdId, { dia: d, franja: f, grupo, cual });
      },
    }),
  ];
}

async function memoria(channel, chatId) {
  const desde = encodeURIComponent(new Date(Date.now() - DIAS_DE_MEMORIA * 86400000).toISOString());
  const filas = await select(
    "bot_messages",
    `channel=${eq(channel)}&chat_id=${eq(chatId)}&created_at=gt.${desde}&order=created_at.desc&limit=${TURNOS_DE_MEMORIA}`,
    "role,content",
  );
  // Alternar user/assistant empezando por user, como pide la API.
  const turnos = filas.reverse().map((f) => ({ role: f.role, content: String(f.content?.texto ?? "") })).filter((t) => t.content);
  while (turnos.length && turnos[0].role !== "user") turnos.shift();
  const limpios = [];
  for (const t of turnos) {
    if (limpios.length && limpios[limpios.length - 1].role === t.role) limpios[limpios.length - 1].content += `\n${t.content}`;
    else limpios.push(t);
  }
  if (limpios.length && limpios[limpios.length - 1].role === "user") limpios.pop();
  return limpios;
}

/**
 * @returns {Promise<string>} el texto a mandar al chat (HTML de Telegram)
 */
export async function responder({ channel = "telegram", chatId, householdId, texto, autor, esGrupo }) {
  const historia = await memoria(channel, chatId);
  const entrada = esGrupo && autor ? `[${autor}]: ${texto}` : texto;

  const final = await anthropic().beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 4000,
    max_iterations: 8,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
    tools: herramientas(householdId),
    messages: [...historia, { role: "user", content: entrada }],
  });

  const respuesta = (final.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
    || "Hecho.";

  await insert("bot_messages", [
    { channel, chat_id: String(chatId), household_id: householdId, role: "user", author_id: autor ?? null, content: { texto: entrada } },
    { channel, chat_id: String(chatId), household_id: householdId, role: "assistant", author_id: null, content: { texto: respuesta } },
  ]).catch((e) => console.error("[agente] memoria", e?.message));
  await contarUso(householdId, final.usage).catch(() => {});

  return respuesta;
}

async function contarUso(householdId, usage) {
  const mes = new Date().toISOString().slice(0, 7) + "-01";
  const [fila] = await select("bot_usage", `household_id=${eq(householdId)}&month=eq.${mes}`, "*");
  await insert("bot_usage", [{
    household_id: householdId,
    month: mes,
    messages: (fila?.messages ?? 0) + 1,
    input_tokens: Number(fila?.input_tokens ?? 0) + (usage?.input_tokens ?? 0),
    output_tokens: Number(fila?.output_tokens ?? 0) + (usage?.output_tokens ?? 0),
    cache_read_tokens: Number(fila?.cache_read_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
  }], { upsert: true });
}
