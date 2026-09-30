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

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { select, insert, eq } from "./db.js";
import { cargarCasa, deshacer } from "./casa.js";
import {
  describirCasa, verMenu, describirReceta, describirCompra,
  marcarCompra, anadirCompra, cambiarPlato, proponerPlatos, diaDe, franjaDe,
} from "./menu.js";
import { generarMenu } from "./generar.js";
import { registrar, EMBUDO, duenoDe } from "./embudo.js";
import {
  describirAjustes, ajustarGustos, ajustarCocina, ajustarHorario, anadirInvitado,
  anadirComensal, quitarComensal, ajustarAlergias, dominiosDeGustos, ajustarPersona,
} from "./ajustes.js";
import {
  crearRecordatorio, verRecordatorios, cancelarRecordatorio, ahoraEnMadrid,
} from "./recordatorios.js";
import { fueraDeLimite, contarUso, avisoDeLimite } from "./uso.js";
import { verDespensa, anadirDespensa } from "./despensa.js";
import { guardarMenuCole, verMenuCole } from "./cole.js";
import { buscarRecetas, prepararReceta, guardarReceta, apartarFotoPlato, recetaPorNombre, CATEGORIAS } from "./recetas.js";

const MODELO = "claude-sonnet-5";
const TURNOS_DE_MEMORIA = 16;
const DIAS_DE_MEMORIA = 3;

const REGLAS = `
Qué haces: consultar y cambiar el menú de la semana, enseñar recetas e ingredientes, llevar la lista de la compra y responder dudas de cocina de la casa. Para TODO lo que toque datos de la casa usa las herramientas: nunca te inventes platos, recetas, cantidades ni lo que hay en el menú. Si una herramienta no puede hacer algo, dilo con naturalidad y, si tiene sentido, sugiere hacerlo en la app de HoMenu.

Reglas:
- Ante cualquier pregunta sobre el menú, una receta, la compra o la familia, llama PRIMERO a la herramienta que corresponda, aunque creas saber la respuesta o ya lo hayas consultado antes en la charla: los datos cambian (otra persona puede haber tocado la app). Nunca digas que no tienes acceso a algo sin haberlo consultado.
- El menú activo puede ser de una semana que ya pasó. Si te preguntan por él, enséñalo igualmente y avisa de las fechas.
- Las recetas salen SIEMPRE del catálogo de HoMenu (tienen foto, ingredientes y encajan en la compra y las alergias), nunca de tu cosecha. Pero recomendar sí: si piden ideas, «¿qué me recomiendas?», «¿qué recetas me das?» o cambiar un plato sin decir por cuál, llama a proponer_platos y ofrece 3 opciones con un botón cada una, más [[Elige tú]] (4 botones en total). Al elegir una, cambiar_plato con receta = su nombre. Si dicen «cámbialo, me da igual» o pulsan «Elige tú», cambiar_plato sin receta. Nunca contestes que no puedes recomendar.
- Alergias e intolerancias: tómalas muy en serio. Nunca des por hecho que alguien puede comer algo que choque con ellas.
- Cuando cambies algo, confírmalo en una frase diciendo qué ha cambiado. En un grupo, di también quién lo pidió.
- Si te falta un dato para actuar (qué día, qué comida), pregúntalo en corto antes de hacer nada.

Configurar la casa (esto sustituye al antiguo asistente de la app, y puede ir más lejos):
- Tú eres el panel de la casa. La gente te cuenta cómo vive («los niños comen en el cole de lunes a jueves», «el miércoles viene mi hermano a cenar», «queremos más pescado y nada de fritos», «tenemos airfryer», «voy siempre con prisa») y tú lo traduces con las herramientas de ajuste. Usa ver_ajustes para saber qué hay antes de proponer.
- Lo que te digan claro, aplícalo y confírmalo. Lo que DEDUZCAS (no dicho literalmente), propónlo en una frase y aplícalo solo si te dicen que sí.
- Alergias e intolerancias: siempre repite lo que vas a guardar y pide confirmación antes de llamar a ajustar_alergias con confirmado=true.
- No interrogues: nada es obligatorio salvo quién come, qué comidas se hacen y las alergias. Lo demás tiene un valor por defecto razonable. Si ves un hueco importante, sugiérelo una vez, sin agobiar.
- Tras cambiar ajustes, ofrece generar el menú de nuevo para que se note. Generar un menú crea uno nuevo y lo deja activo (el anterior queda en el historial de la app): con generar_menu.
- Las notas de voz te llegan ya transcritas (Whisper): puede haber errores de oído en nombres; si algo no cuadra, pregunta antes de cambiar nada. Las fotos y PDFs te llegan tal cual: un ticket o la nevera → propone la lista para la despensa; el menú del comedor → resúmelo y guárdalo con guardar_menu_cole. En ambos casos, enseña lo que has leído y guarda solo con su sí. Si la foto no se lee bien, dilo y pide otra.
`;

// Quién es, qué sabe hacer, modos, botones y formato: en un fichero aparte para
// que se pueda editar sin tocar código (lo leen también los socios). Va en las
// instrucciones con caché, así que crecer no encarece cada mensaje.
const CONOCIMIENTO = fs.readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
const SISTEMA = `${CONOCIMIENTO}

# Reglas de trabajo

${REGLAS}`;

let cliente = null;
const anthropic = () => (cliente ??= new Anthropic());

// Tras estas, el botón «↩️ Deshacer» sale solo. Son las que cambian lo que se
// va a comer o comprar, donde un «uy, no» es habitual. No van las que se
// confirman antes (alergias, menú del cole) ni las del alta (apuntar a alguien):
// ahí el botón sería ruido. Se pueden deshacer igual, pidiéndolo.
const CON_BOTON_DESHACER = new Set([
  "marcar_compra", "anadir_compra", "cambiar_plato", "generar_menu",
  "ajustar_gustos", "ajustar_horario", "anadir_invitado", "quitar_comensal",
]);

// Fallos de conversación, para medirlos (user_events, como el embudo).
const FALLO_HERRAMIENTA = "bot_tool_error";
const FALLO_NO_ENTIENDE = "bot_not_understood";

// Qué pantalla de la app enseña lo que se acaba de ver o cambiar, en el
// formato de ?ir= de la app (App.jsx): hoy, semana, dia:Jue, compra.
function pantallaDe(herramienta, args = {}) {
  if (herramienta === "ver_menu") {
    if (!args.dia) return "semana";
    if (/^hoy$/i.test(String(args.dia).trim())) return "hoy";
    const d = diaDe(args.dia);
    return d ? `dia:${d}` : null;
  }
  if (herramienta === "cambiar_plato" && args.dia) {
    const d = diaDe(args.dia);
    return d ? `dia:${d}` : null;
  }
  if (["ver_compra", "marcar_compra", "anadir_compra"].includes(herramienta)) return "compra";
  if (herramienta === "generar_menu") return "semana";
  // El recetario de la app, en la misma carpeta que se ha buscado aquí.
  if (herramienta === "buscar_recetas") return args.categoria && args.categoria !== "mias" ? `recetas:${args.categoria}` : "recetas";
  if (herramienta === "guardar_receta") return "recetas:mias";
  return null;
}

/**
 * @param {{ householdId: string, chatId?: string, channel?: string, autor?: string,
 *   fotos?: {url: string, pie: string}[], escrito?: boolean }} chat
 *   `fotos` y `escrito` los rellenan las herramientas en este turno: las fotos
 *   de los platos que se han enseñado, y si se cambió algo que se puede deshacer.
 */
export async function herramientas(chat) {
  const gustos = await dominiosDeGustos();
  const todas = [
    ...herramientasDeMenu(chat.householdId, chat.fotos),
    ...herramientasDeAjustes(chat.householdId, gustos),
    ...herramientasDeRecordatorios(chat),
    ...herramientasDeFotos(chat.householdId),
    ...herramientasDeRecetas(chat),
  ];
  return todas.map((t) => ({
    ...t,
    run: async (args) => {
      try {
        const r = await t.run(args);
        if (CON_BOTON_DESHACER.has(t.name)) chat.escrito = true;
        const ir = pantallaDe(t.name, args);
        if (ir) chat.ir = ir;
        if (t.name === "deshacer") chat.escrito = false;
        return r;
      } catch (e) {
        await registrar(FALLO_HERRAMIENTA, { userId: await duenoDe(chat.householdId).catch(() => null), extra: { herramienta: t.name, error: String(e?.message ?? e).slice(0, 300) } });
        throw e;
      }
    },
  }));
}

// El recetario: buscar lo que se quiera ver y crear recetas propias, con lo
// mismo que pregunta el asistente de la app (api/_bot/recetas.js).
function herramientasDeRecetas(chat) {
  const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
  const { householdId } = chat;
  return [
    betaTool({
      name: "buscar_recetas",
      description: `Busca en el recetario (catálogo de HoMenu y recetas propias de la casa) para VER recetas de lo que pidan: «sólidos de bebé», «algo con garbanzos», «postres». Nada se cambia. categoria (opcional) es una carpeta del recetario: ${Object.entries(CATEGORIAS).map(([k, v]) => `${k} = ${v}`).join("; ")}. consulta: palabras clave (ingrediente, nombre). conFotos: manda la foto de las primeras.`,
      inputSchema: obj({
        consulta: { type: "string" },
        categoria: { type: "string", enum: Object.keys(CATEGORIAS) },
        maxMinutos: { type: "integer", minimum: 5, maximum: 240 },
        n: { type: "integer", minimum: 1, maximum: 10, description: "Cuántas enseñar; por defecto 6." },
        conFotos: { type: "boolean" },
      }),
      run: (args) => buscarRecetas(householdId, args, chat),
    }),
    betaTool({
      name: "apartar_foto_plato",
      description: "Guarda la foto de ESTE mensaje como foto del plato de una receta que se está creando (el plato ya hecho, no una receta escrita ni un ticket). Después, preparar_receta con usarFoto = true.",
      inputSchema: obj({}),
      run: () => apartarFotoPlato(householdId, chat),
    }),
    betaTool({
      name: "preparar_receta",
      description: "Estructura una receta propia (como el asistente de la app) y la deja lista SIN guardar, para enseñarla. Solo cuando ya tengas nombre e ingredientes con cantidades; lo demás tiene valor por defecto. cuando: en qué comidas se sirve (primero, segundo, plato_unico, cena, merienda, postre). paraNinos: si es apta para niños (omitir si no lo saben). visibilidad: privada (solo la casa) o publica (sale en Gente).",
      inputSchema: obj({
        nombre: { type: "string" },
        raciones: { type: "integer", minimum: 1, maximum: 20 },
        minutos: { type: "integer", minimum: 1, maximum: 600 },
        electrodomestico: { type: "string", enum: ["Airfryer", "Horno", "Microondas", "Olla rápida", "Thermomix", "Vaporera"] },
        ingredientes: {
          type: "array", minItems: 1, maxItems: 30,
          items: obj({
            nombre: { type: "string" },
            cantidad: { type: "number" },
            unidad: { type: "string", enum: ["g", "kg", "ml", "l", "ud", "cucharada", "cucharadita", "taza", "diente", "pizca", "al gusto", "c/n"] },
          }, ["nombre"]),
        },
        cuando: { type: "array", items: { type: "string", enum: ["primero", "segundo", "plato_unico", "cena", "merienda", "postre"] } },
        paraNinos: { type: "boolean" },
        preparacion: { type: "string", description: "Cómo se hace, con sus palabras (el modelo redacta los pasos a partir de aquí)." },
        visibilidad: { type: "string", enum: ["privada", "publica"] },
        usarFoto: { type: "boolean", description: "true si hay foto del plato (en este mensaje o apartada con apartar_foto_plato)." },
      }, ["nombre", "ingredientes"]),
      run: (datos) => prepararReceta(householdId, datos, chat),
    }),
    betaTool({
      name: "compartir",
      description: "Pone los botones para mandar a otra persona (por WhatsApp o Telegram) una receta o la semana. que: receta o semana. receta: su nombre o id (solo si que = receta).",
      inputSchema: obj({
        que: { type: "string", enum: ["receta", "semana"] },
        receta: { type: "string" },
      }, ["que"]),
      run: async ({ que, receta }) => {
        if (que === "semana") {
          chat.compartir = { tipo: "semana" };
          return "Te pongo los botones para mandarlo.";
        }
        const r = receta ? await recetaPorNombre(householdId, receta) : null;
        if (!r) return `No encuentro la receta «${receta ?? ""}». Pregunta cuál es.`;
        chat.compartir = { tipo: "receta", recetaId: r.id };
        return `Te pongo los botones para mandar «${r.name}».`;
      },
    }),
    betaTool({
      name: "guardar_receta",
      description: "Guarda la última receta preparada con preparar_receta en esta charla (la herramienta la tiene apartada: no hace falta volver a pedir ningún dato), en el recetario de la casa, y el motor ya puede ponerla en menús. Llámala en cuanto digan «Guardar» o «sí» al resumen, con confirmado = true.",
      inputSchema: obj({ confirmado: { type: "boolean" } }, ["confirmado"]),
      run: ({ confirmado }) => guardarReceta(householdId, { confirmado }, chat),
    }),
  ];
}

// Despensa y menú del cole: se alimentan sobre todo de fotos (el ticket, la
// nevera, el PDF del cole), que el modelo lee directamente.
function herramientasDeFotos(householdId) {
  const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
  const platos = obj({ primero: { type: "string" }, segundo: { type: "string" }, postre: { type: "string" }, sinClase: { type: "boolean" } });
  return [
    betaTool({
      name: "ver_despensa",
      description: "Lo que hay apuntado en la despensa de la casa (nevera, despensa, congelador).",
      inputSchema: obj({}),
      run: () => verDespensa(householdId),
    }),
    betaTool({
      name: "anadir_despensa",
      description: "Apunta alimentos en la despensa (suma si ya estaban). Solo comida: nada de droguería ni bolsas. Nombres de alimento simples en español («pechuga de pollo», «tomate triturado»), sin marcas. Si viene de una foto, solo tras enseñar la lista y que digan que sí.",
      inputSchema: obj({
        items: {
          type: "array", minItems: 1, maxItems: 40,
          items: obj({
            nombre: { type: "string" },
            cantidad: { type: "number" },
            unidad: { type: "string", enum: ["ud", "g", "kg", "ml", "l"] },
            congelado: { type: "boolean" },
          }, ["nombre"]),
        },
        origen: { type: "string", enum: ["foto", "texto"] },
      }, ["items", "origen"]),
      run: ({ items, origen }) => anadirDespensa(householdId, items, origen),
    }),
    betaTool({
      name: "guardar_menu_cole",
      description: "Guarda el menú del comedor escolar (leído de una foto o PDF, o dictado). Por días de lunes a viernes con primero, segundo y postre; sinClase=true si ese día no hay cole. Varias semanas si el cole rota, empezando por la que toca la semana que se planifica. para: «todos» o el nombre de un niño si es solo suyo. Solo tras enseñar el resumen y que digan que sí.",
      inputSchema: obj({
        semanas: {
          type: "array", minItems: 1, maxItems: 6,
          items: obj({ dias: obj({ lunes: platos, martes: platos, miercoles: platos, jueves: platos, viernes: platos }) }, ["dias"]),
        },
        para: { type: "string" },
      }, ["semanas"]),
      run: (args) => guardarMenuCole(householdId, args),
    }),
    betaTool({
      name: "ver_menu_cole",
      description: "El menú del cole guardado (lo que comen los niños en el comedor).",
      inputSchema: obj({}),
      run: () => verMenuCole(householdId),
    }),
  ];
}

function herramientasDeRecordatorios(chat) {
  const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
  return [
    betaTool({
      name: "empezar_de_nuevo",
      description: "Olvida lo hablado hasta ahora en este chat y empieza una charla nueva, cuando lo pidan («olvida lo que hemos hablado», «empecemos de nuevo»). NO borra la casa, el menú ni la compra: díselo así.",
      inputSchema: obj({}),
      run: async () => {
        await cortarCharla(chat.channel ?? "telegram", chat.chatId, chat.householdId);
        return "Hecho: a partir de ahora no recuerdas lo hablado antes. La casa, el menú y la compra siguen igual.";
      },
    }),
    betaTool({
      name: "crear_recordatorio",
      description: "Programa un recordatorio en ESTE chat. Solo si el usuario lo ha pedido o ha dicho que sí a tu oferta. cuando: fecha y hora en hora de España, AAAA-MM-DDTHH:MM. repite: diario o semanal (opcional).",
      inputSchema: obj({
        texto: { type: "string", description: "Lo que hay que recordar, en corto y en segunda persona: «Sacar el pollo del congelador»." },
        cuando: { type: "string" },
        repite: { type: "string", enum: ["diario", "semanal"] },
      }, ["texto", "cuando"]),
      run: (args) => crearRecordatorio(chat, args),
    }),
    betaTool({
      name: "ver_recordatorios",
      description: "Los recordatorios pendientes de este chat, con su id.",
      inputSchema: obj({}),
      run: () => verRecordatorios(chat.chatId),
    }),
    betaTool({
      name: "cancelar_recordatorio",
      description: "Cancela un recordatorio pendiente por su id (míralo antes con ver_recordatorios).",
      inputSchema: obj({ id: { type: "string" } }, ["id"]),
      run: ({ id }) => cancelarRecordatorio(chat.chatId, id),
    }),
  ];
}

function herramientasDeAjustes(householdId, gustos) {
  const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
  return [
    betaTool({
      name: "ver_ajustes",
      description: "Cómo está configurada la casa: estructura de comidas, nivel de cocina, trastos, gustos anotados (con su estado: fijado/inferido/delegado), quién come fuera y reglas/invitados.",
      inputSchema: obj({}),
      run: async () => {
        const casa = await cargarCasa(householdId);
        return casa ? describirAjustes(casa) : "Sin datos de la casa en la nube.";
      },
    }),
    betaTool({
      name: "ajustar_gustos",
      description: `Gustos de la casa, como el panel de la app. Cada ajuste: campo, valor, op (mas|menos|nunca), n opcional (veces/semana, 0-7, solo freqs), ambito (todos|ninos|adultos|bebes), servicio (ambos|comida|cena). Campos y valores válidos: ${gustos}. «Nada de X» es favoritos/excluidos con op=nunca.`,
      inputSchema: obj({
        ajustes: {
          type: "array", minItems: 1, maxItems: 8,
          items: obj({
            campo: { type: "string" }, valor: { type: "string" },
            op: { type: "string", enum: ["mas", "menos", "nunca"] },
            n: { type: "integer", minimum: 0, maximum: 7 },
            ambito: { type: "string", enum: ["todos", "ninos", "adultos", "bebes"] },
            servicio: { type: "string", enum: ["ambos", "comida", "cena"] },
          }, ["campo", "valor", "op"]),
        },
        frase: { type: "string", description: "Lo que dijo el usuario, literal: queda como procedencia." },
      }, ["ajustes", "frase"]),
      run: ({ ajustes, frase }) => ajustarGustos(householdId, ajustes, frase),
    }),
    betaTool({
      name: "ajustar_cocina",
      description: "Cómo se cocina en casa: estructura de la comida (primero_segundo = primero y segundo; 1_plato = plato único), esfuerzo (basic/normal/pro), tiempo por día (con_prisa/normal/con_tiempo/depende), tanda (tanda = cocinar para varios días; cada_dia) y trastos (lista completa de lo que hay: Airfryer, Horno, Microondas, Thermomix, Olla rápida, Vaporera).",
      inputSchema: obj({
        estructura: { type: "string", enum: ["primero_segundo", "1_plato"] },
        esfuerzo: { type: "string", enum: ["basic", "normal", "pro"] },
        tiempo: { type: "string", enum: ["con_prisa", "normal", "con_tiempo", "depende"] },
        tanda: { type: "string", enum: ["tanda", "cada_dia"] },
        trastos: { type: "array", items: { type: "string", enum: ["Airfryer", "Horno", "Microondas", "Thermomix", "Olla rápida", "Vaporera"] } },
        comidas: { type: "array", items: { type: "string", enum: ["Comida", "Cena"] }, description: "Qué comidas se planifican." },
      }),
      run: (args) => ajustarCocina(householdId, args),
    }),
    betaTool({
      name: "ajustar_horario",
      description: "Quién come dónde. personas: nombres, o «todos», «niños», «adultos». dias: lunes…domingo, «entre semana» o «finde» (vacío = todos). comidas: Desayuno/Comida/Merienda/Cena/Postre (vacío = Comida y Cena). donde: casa | tupper (se lleva comida de casa) | fuera | cole | off (esa comida no se hace).",
      inputSchema: obj({
        personas: { type: "array", items: { type: "string" }, minItems: 1 },
        dias: { type: "array", items: { type: "string" } },
        comidas: { type: "array", items: { type: "string" } },
        donde: { type: "string", enum: ["casa", "tupper", "fuera", "cole", "off"] },
      }, ["personas", "donde"]),
      run: (args) => ajustarHorario(householdId, args),
    }),
    betaTool({
      name: "anadir_invitado",
      description: "Alguien de fuera viene a comer o cenar un día concreto (se suma a las raciones y a la compra de esa semana, y caduca solo).",
      inputSchema: obj({
        dia: { type: "string" }, comida: { type: "string", enum: ["Desayuno", "Comida", "Merienda", "Cena", "Postre"] },
        n: { type: "integer", minimum: 1, maximum: 20 }, nombre: { type: "string" },
        semana: { type: "string", enum: ["esta", "siguiente"] },
      }, ["dia", "comida"]),
      run: (args) => anadirInvitado(householdId, args),
    }),
    betaTool({
      name: "anadir_comensal",
      description: "Añade a alguien que vive y come en casa (no un invitado puntual).",
      inputSchema: obj({ nombre: { type: "string" }, edad: { type: "integer", minimum: 0, maximum: 120 } }, ["nombre"]),
      run: (args) => anadirComensal(householdId, args),
    }),
    betaTool({
      name: "ajustar_persona",
      description: "Peso (kg) y altura (cm) de una persona de la casa, opcionales: con los dos, el motor ajusta su ración (cantidades de la compra y de las recetas). borrar=true los quita.",
      inputSchema: obj({
        nombre: { type: "string" },
        pesoKg: { type: "number" },
        alturaCm: { type: "number" },
        borrar: { type: "boolean" },
      }, ["nombre"]),
      run: (args) => ajustarPersona(householdId, args),
    }),
    betaTool({
      name: "quitar_comensal",
      description: "Quita a alguien de la casa (ya no come aquí). Confirma antes con el usuario.",
      inputSchema: obj({ nombre: { type: "string" } }, ["nombre"]),
      run: (args) => quitarComensal(householdId, args),
    }),
    betaTool({
      name: "ajustar_alergias",
      description: "Alergias o intolerancias de una persona o de «toda la casa» (los 14 alérgenos oficiales: gluten, crustaceos, huevos, pescado, cacahuetes, soja, leche, frutos_cascara, apio, mostaza, sesamo, sulfitos, altramuces, moluscos). ninguna=true si confirman que nadie tiene. Solo con confirmado=true tras el «sí» explícito del usuario.",
      inputSchema: obj({
        persona: { type: "string" }, alergenos: { type: "array", items: { type: "string" } },
        ninguna: { type: "boolean" }, quitar: { type: "boolean" }, confirmado: { type: "boolean" },
      }, ["confirmado"]),
      run: (args) => ajustarAlergias(householdId, args),
    }),
    betaTool({
      name: "deshacer",
      description: "Deshace TU último cambio en la casa (un plato cambiado, la compra, un ajuste o un menú generado: vuelve el anterior). Un solo nivel. No deshace lo que otra persona haya hecho en la app.",
      inputSchema: obj({}),
      run: () => deshacer(householdId),
    }),
    betaTool({
      name: "generar_menu",
      description: "Genera un menú NUEVO con el motor de HoMenu (respeta toda la configuración) y lo deja activo: «esta» semana desde hoy o la «siguiente» entera. Tarda unos segundos.",
      inputSchema: obj({ semana: { type: "string", enum: ["esta", "siguiente"] } }, ["semana"]),
      run: ({ semana }) => generarMenu(householdId, semana),
    }),
  ];
}

function herramientasDeMenu(householdId, fotos = null) {
  const conCasa = async (f) => {
    const casa = await cargarCasa(householdId);
    if (!casa) return "Esta casa todavía no tiene datos en la nube. Que entren una vez en la app de HoMenu.";
    return f(casa);
  };
  const semana = { type: "string", enum: ["esta", "siguiente"], description: "Opcional: «esta» semana o la «siguiente», si lo dicen. Sin ella, el próximo día con ese nombre que tenga menú." };

  return [
    betaTool({
      name: "ver_casa",
      description: "Quién vive en la casa (nombres, edades, alergias, intolerancias, lo que no les gusta), los grupos de menú, qué comidas se planifican y qué día es hoy.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: () => conCasa((casa) => describirCasa(casa)),
    }),
    betaTool({
      name: "ver_menu",
      description: "El menú activo (puede tener varias semanas): una semana entera, o solo un día. Úsalo para «qué comemos hoy», «qué hay el jueves», «pásame el menú de la semana que viene».",
      inputSchema: {
        type: "object",
        properties: {
          dia: { type: "string", description: "Opcional: lunes…domingo, «hoy» o «mañana». Sin él, la semana entera." },
          semana,
        },
        additionalProperties: false,
      },
      run: ({ dia, semana: cual }) => conCasa((casa) => verMenu(casa, { dia, semana: cual, fotos })),
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
      name: "proponer_platos",
      description: "Recetas del catálogo que encajan en un hueco del menú (respetan alergias, gustos, tiempo y lo que ya hay en la semana), SIN cambiar nada. Para recomendar o dar a elegir; con parecido_a, las más parecidas a un plato que piden por su nombre. En la comida hay primero y segundo; «cual» dice cuál.",
      inputSchema: {
        type: "object",
        properties: {
          dia: { type: "string", description: "lunes…domingo, «hoy» o «mañana»." },
          semana,
          comida: { type: "string", enum: ["Desayuno", "Comida", "Merienda", "Cena", "Postre"] },
          grupo: { type: "string", description: "Opcional: el grupo de menú (p. ej. «Bebé») si hay varios." },
          cual: { type: "string", enum: ["principal", "primero"], description: "Por defecto el principal (el segundo en la comida)." },
          n: { type: "integer", minimum: 2, maximum: 6, description: "Cuántas opciones; por defecto 3 (caben 3 botones más «Elige tú»)." },
          parecido_a: { type: "string", description: "Opcional: el plato que piden («salmón al horno con ensalada de mango»)." },
        },
        required: ["dia", "comida"],
        additionalProperties: false,
      },
      run: ({ dia, semana: cual_semana, comida, grupo, cual, n, parecido_a }) => {
        const f = franjaDe(comida);
        if (!f) return `No entiendo qué comida es («${comida}»).`;
        return proponerPlatos(householdId, { dia, semana: cual_semana, franja: f, grupo, cual, n: n ?? 3, parecidoA: parecido_a || null }, fotos);
      },
    }),
    betaTool({
      name: "cambiar_plato",
      description: "Cambia el plato de un hueco del menú y rehace la compra. Con «receta» pone esa o, si no está tal cual en el catálogo, la más parecida que encaje en el hueco (la respuesta dice si es aproximada); sin ella, el motor elige otra respetando alergias y preferencias. En la comida hay primero y segundo; «cual» dice cuál cambiar.",
      inputSchema: {
        type: "object",
        properties: {
          dia: { type: "string", description: "lunes…domingo, «hoy» o «mañana»." },
          semana,
          comida: { type: "string", enum: ["Desayuno", "Comida", "Merienda", "Cena", "Postre"] },
          grupo: { type: "string", description: "Opcional: el grupo de menú (p. ej. «Bebé») si hay varios." },
          cual: { type: "string", enum: ["principal", "primero"], description: "Por defecto el principal (el segundo en la comida)." },
          receta: { type: "string", description: "Opcional: el nombre de la receta elegida." },
        },
        required: ["dia", "comida"],
        additionalProperties: false,
      },
      run: ({ dia, semana: cual_semana, comida, grupo, cual, receta }) => {
        const f = franjaDe(comida);
        if (!f) return `No entiendo qué comida es («${comida}»).`;
        return cambiarPlato(householdId, { dia, semana: cual_semana, franja: f, grupo, cual, receta: receta || null }, fotos);
      },
    }),
  ];
}

/**
 * «Empezar una charla nueva»: una fila marcador en bot_messages. memoria() no
 * mira más atrás del último corte. No se borra nada (sirve para depurar) y no
 * toca la casa, el menú ni la compra: solo lo que Lola recuerda de la charla.
 */
export async function cortarCharla(channel, chatId, householdId) {
  await insert("bot_messages", [{
    channel, chat_id: String(chatId), household_id: householdId, role: "user", author_id: null,
    content: { texto: "", corte: true },
  }]);
}

async function memoria(channel, chatId) {
  const desde = encodeURIComponent(new Date(Date.now() - DIAS_DE_MEMORIA * 86400000).toISOString());
  const filas = await select(
    "bot_messages",
    `channel=${eq(channel)}&chat_id=${eq(chatId)}&created_at=gt.${desde}&order=created_at.desc&limit=${TURNOS_DE_MEMORIA}`,
    "role,content",
  );
  // Solo lo posterior al último «empezar de nuevo» (vienen de más nuevo a más viejo).
  const corte = filas.findIndex((f) => f.content?.corte);
  if (corte !== -1) filas.length = corte;
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
 * @param {{ tipo: "image" | "document", mediaType: string, base64: string }} [adjunto]
 *   una foto o un PDF del mensaje: solo va en este turno; a la memoria pasa
 *   como texto («[foto]»), que guardarla entera no merece la pena.
 * @returns {Promise<{ texto: string, fotos: {url: string, pie: string}[], deshacible: boolean, ir: string|null }>}
 *   el texto para el chat (HTML de Telegram), las fotos de los platos que se
 *   han enseñado y si se cambió algo que se puede deshacer.
 */
export async function responder({ channel = "telegram", chatId, householdId, texto, autor, esGrupo, adjunto = null }) {
  const tope = await fueraDeLimite(householdId);
  if (tope) return { texto: tope, fotos: [], deshacible: false, ir: null };

  const historia = await memoria(channel, chatId);
  const entrada = esGrupo && autor ? `[${autor}]: ${texto}` : texto;
  // `adjunto` va también a las herramientas: la foto del plato de una receta
  // solo existe en el turno en que llega (apartar_foto_plato, preparar_receta).
  const chat = { channel, chatId: String(chatId), householdId, autor, adjunto, fotos: [], escrito: false, ir: null, compartir: null };
  const tools = await herramientas(chat);
  const { dicho, uso } = await ejecutar({ historia, entrada, tools, adjunto });
  if (/no (te )?(he )?entend|no s[eé] a qu[eé] te refieres/i.test(dicho)) {
    await registrar(FALLO_NO_ENTIENDE, { userId: await duenoDe(householdId).catch(() => null), extra: { texto: String(texto).slice(0, 200) } });
  }

  const llevados = await contarUso(householdId, uso).catch((e) => { console.error("[agente] uso", e?.message); return 0; });
  const respuesta = dicho + avisoDeLimite(householdId, llevados);

  await insert("bot_messages", [
    { channel, chat_id: String(chatId), household_id: householdId, role: "user", author_id: autor ?? null, content: { texto: adjunto ? `[${adjunto.tipo === "document" ? "PDF" : "foto"}] ${entrada}` : entrada } },
    { channel, chat_id: String(chatId), household_id: householdId, role: "assistant", author_id: null, content: { texto: respuesta } },
  ]).catch((e) => console.error("[agente] memoria", e?.message));
  await segundaSemana(householdId).catch(() => {});

  return { texto: respuesta, fotos: chat.fotos, deshacible: chat.escrito, ir: chat.ir, compartir: chat.compartir };
}

/**
 * Una vuelta del agente: el modelo con sus herramientas hasta que contesta.
 * Separado de responder() para que las pruebas (scripts/bot-evals.mjs) lo
 * muevan con herramientas de mentira, sin casa ni base de datos.
 */
export async function ejecutar({ historia = [], entrada, tools, adjunto = null }) {
  const contenido = adjunto
    ? [{ type: adjunto.tipo, source: { type: "base64", media_type: adjunto.mediaType, data: adjunto.base64 } }, { type: "text", text: entrada }]
    : entrada;
  const runner = anthropic().beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 4000,
    max_iterations: 8,
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
      // Fuera de la caché: cambia en cada mensaje.
      { type: "text", text: `Ahora mismo en España: ${ahoraEnMadrid()}.` },
    ],
    tools,
    messages: [...historia, { role: "user", content: contenido }],
  });
  // Cada vuelta del runner es una llamada al modelo: el coste es la suma.
  const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let final = null;
  for await (const mensaje of runner) {
    final = mensaje;
    for (const k of Object.keys(uso)) uso[k] += mensaje.usage?.[k] ?? 0;
  }

  const dicho = (final?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
    || "Hecho.";
  return { dicho, uso };
}

/** Vuelve a usarlo una semana o más después de enlazar: la señal de que se queda. */
async function segundaSemana(householdId) {
  const dueno = await duenoDe(householdId);
  if (!dueno) return;
  const [enlace] = await select("user_events", `user_id=${eq(dueno)}&event=eq.${EMBUDO.ENLACE}&order=created_at.asc&limit=1`, "created_at");
  if (enlace && Date.now() - Date.parse(enlace.created_at) >= 7 * 86400000) {
    await registrar(EMBUDO.SEGUNDA_SEMANA, { userId: dueno, unaVez: true });
  }
}
