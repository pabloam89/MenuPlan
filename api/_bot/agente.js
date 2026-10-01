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
import { cargarCasa, deshacer, escribioDesde } from "./casa.js";
import {
  describirCasa, verMenu, describirReceta, describirCompra,
  marcarCompra, anadirCompra, cambiarPlato, proponerPlatos, diaDe, franjaDe,
} from "./menu.js";
import { generarMenu } from "./generar.js";
import { registrar, EMBUDO, duenoDe } from "./embudo.js";
import {
  describirAjustes, ajustarGustos, ajustarCocina, ajustarHorario, anadirInvitado,
  anadirComensal, quitarComensal, ajustarAlergias, dominiosDeGustos, ajustarPersona, ajustarMenuPeques,
} from "./ajustes.js";
import {
  crearRecordatorio, verRecordatorios, cancelarRecordatorio, ahoraEnMadrid,
} from "./recordatorios.js";
import { fueraDeLimite, contarUso, avisoDeLimite } from "./uso.js";
import { supervisar } from "./supervisor.js";
import { montarFicha, extrasDeFicha } from "./ficha.js";
import { verDespensa, anadirDespensa } from "./despensa.js";
import { guardarMenuCole, verMenuCole } from "./cole.js";
import { buscarRecetas, prepararReceta, guardarReceta, apartarFotoPlato, recetaPorNombre, CATEGORIAS } from "./recetas.js";

// Modelo y esfuerzo, configurables para medir velocidad contra calidad con
// scripts/bot-evals.mjs (BOT_MODELO, BOT_EFFORT) sin tocar código.
export const MODELO = process.env.BOT_MODELO || "claude-sonnet-5";
const EFFORT = ["low", "medium", "high"].includes(process.env.BOT_EFFORT) ? process.env.BOT_EFFORT : "medium";
// Plan B: si el modelo de Lola no contesta (saturado, caído o colgado), el
// turno se repite con este otro, de otra familia (cuando uno va saturado el
// otro no suele ir). Opus y no Haiku, medido con scripts/bot-evals.mjs
// --reserva el 30 sep 2026: Opus 5.5 43/44 (mediana 7,3 s), Haiku 4.5 34/44
// (se dejaba a medias proponer platos, crear recetas y la despensa). Solo
// contesta cuando Sonnet no está, así que lo que cuesta de más apenas pesa.
export const MODELO_RESERVA = process.env.BOT_MODELO_RESERVA || "claude-opus-5-5";
// El tiempo que tiene cada modelo para el turno ENTERO (todas sus vueltas con
// herramientas). El timeout del SDK solo cubre hasta que llegan las cabeceras:
// un stream que se queda colgado a mitad no lo cortaba nadie, y Vercel mata la
// función a los 120 s (vercel.json) dejando el «…» en el chat. Los dos juntos
// caben de sobra.
const PLAZO_MS = { principal: 55000, reserva: 50000 };
const TURNOS_DE_MEMORIA = 16;
const DIAS_DE_MEMORIA = 3;

// Quién es, qué sabe hacer, modos, botones y formato: en un fichero aparte para
// que se pueda editar sin tocar código (lo leen también los socios). Va en las
// instrucciones con caché, así que crecer no encarece cada mensaje.
const CONOCIMIENTO = fs.readFileSync(new URL("./conocimiento.md", import.meta.url), "utf8");
// Antes había aquí unas REGLAS aparte; desde el 1 oct 2026 todo vive en
// conocimiento.md, con lo que manda arriba (una sola fuente, sin contradicciones).
const SISTEMA = CONOCIMIENTO;

let cliente = null;
const anthropic = () => (cliente ??= new Anthropic());

// Tras estas, el botón «↩️ Deshacer» sale solo. Son las que cambian lo que se
// va a comer o comprar, donde un «uy, no» es habitual. No van las que se
// confirman antes (alergias, menú del cole) ni las del alta (apuntar a alguien):
// ahí el botón sería ruido. Se pueden deshacer igual, pidiéndolo.
const CON_BOTON_DESHACER = new Set([
  "marcar_compra", "anadir_compra", "cambiar_plato", "generar_menu",
  "ajustar_gustos", "ajustar_horario", "anadir_invitado", "quitar_comensal",
  // Las alergias se guardan al momento (con eco) y se deshacen con un toque.
  "ajustar_alergias", "ajustar_menu_peques",
]);

// Fallos de conversación, para medirlos (user_events, como el embudo).
const FALLO_HERRAMIENTA = "bot_tool_error";
const FALLO_NO_ENTIENDE = "bot_not_understood";
const FALLO_A_MEDIAS = "bot_error";
const FRENO_SUPERVISOR = "bot_supervisor";

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
// Las que no cambian nada: pueden correr antes de saber de quién es el turno.
const SOLO_LECTURA = new Set([
  "ver_casa", "ver_menu", "ver_receta", "ver_compra", "ver_ajustes", "ver_despensa", "ver_menu_cole",
  "ver_recordatorios", "proponer_platos", "buscar_recetas", "compartir",
]);

export async function herramientas(chat) {
  const gustos = await dominiosDeGustos();
  const todas = [
    ...herramientasDeMenu(chat.householdId, chat.fotos),
    ...herramientasDeAjustes(chat.householdId, gustos),
    ...herramientasDeRecordatorios(chat),
    ...herramientasDeFotos(chat.householdId),
    ...herramientasDeRecetas(chat),
  ];
  // Lo que ya se ha escrito del menú en este turno. Tras generar o cambiar, el
  // modelo volvía a ver_menu dos y tres veces para repasarlo (cada vuelta, 4-8
  // s en el chat), aunque generar y cambiar ya devuelven lo guardado.
  const tocado = { semanas: new Set(), dias: new Set() };
  const yaLoTiene = (args = {}) => {
    const dia = args.dia ? diaDe(args.dia) ?? String(args.dia).toLowerCase() : null;
    // La semana recién generada, entera o por días; o un día recién cambiado.
    if (tocado.semanas.has(args.semana ?? "esta")) return true;
    return Boolean(dia && tocado.dias.has(dia));
  };
  return todas.map((t) => ({
    ...t,
    run: async (args) => {
      // Turno especulativo (api/bot/telegram.js): Lola arranca a la vez que el
      // enrutador. Lo que escribe en la casa espera a saber si el turno es
      // suyo; si se lo queda la vía rápida, no escribe nada.
      if (chat.puerta && !SOLO_LECTURA.has(t.name)) {
        const seguir = await chat.puerta;
        if (!seguir) throw new Error("turno de la vía rápida");
      }
      // Lo que quita protección (una alergia, a alguien de la casa) se contrasta
      // con lo que ha escrito la persona, no solo con el «confirmado» del modelo.
      const freno = supervisar(t.name, args, chat.texto);
      if (freno) {
        await registrar(FRENO_SUPERVISOR, { userId: await duenoDe(chat.householdId).catch(() => null), extra: { herramienta: t.name, texto: String(chat.texto ?? "").slice(0, 200) } });
        return freno;
      }
      if (t.name === "ver_menu" && yaLoTiene(args)) {
        return "Eso ya lo tienes: es lo que te devolvieron generar_menu o cambiar_plato en este turno, y es lo guardado. No lo repitas entero: resume en 3-4 líneas; la semana la ven con el botón que sale solo.";
      }
      try {
        const desde = Date.now();
        const r = await t.run(args);
        if (t.name === "generar_menu") tocado.semanas.add(args.semana ?? "esta");
        if (t.name === "cambiar_plato" && args.dia) tocado.dias.add(diaDe(args.dia) ?? String(args.dia).toLowerCase());
        if (CON_BOTON_DESHACER.has(t.name) && escribioDesde(chat.householdId, desde)) chat.escrito = true;
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
      description: `Busca en el recetario (catálogo de HoMenu y recetas propias de la casa) para VER recetas de lo que pidan: «sólidos de bebé», «algo con garbanzos», «postres». Nada se cambia. categoria (opcional) es una carpeta del recetario: ${Object.entries(CATEGORIAS).map(([k, v]) => `${k} = ${v}`).join("; ")}. consulta: palabras clave (ingrediente, nombre) o lo que quieren tal cual lo dicen («algo de cuchara para el frío», «una cena que parezca de restaurante»): se busca también por significado. conFotos: manda la foto de las primeras.`,
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
        etapaBebe: { type: "string", enum: ["cremas", "mixto", "solidos"], description: "Qué come el bebé: cremas (solo purés), mixto (de todo) o solidos (ya come sólidos). Apúntalo en cuanto lo digan («ya come sólidos»), antes de proponerle nada." },
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
      name: "ajustar_menu_peques",
      description: "Si los peques comen lo mismo que los mayores o no. Por defecto, toda la casa come lo mismo (el bebé, aparte): úsala solo si lo dicen. igual = lo mismo que la familia; aparte = cenan algo suyo (sin repetir lo del cole); lo_del_mediodia = los días de cole cenan lo que la familia comió a mediodía. Cuenta en el próximo menú.",
      inputSchema: obj({ cena: { type: "string", enum: ["igual", "aparte", "lo_del_mediodia"] } }, ["cena"]),
      run: (args) => ajustarMenuPeques(householdId, args),
    }),
    betaTool({
      name: "quitar_comensal",
      description: "Quita a alguien de la casa (ya no come aquí). Confirma antes con el usuario.",
      inputSchema: obj({ nombre: { type: "string" } }, ["nombre"]),
      run: (args) => quitarComensal(householdId, args),
    }),
    betaTool({
      name: "ajustar_alergias",
      description: "Alergias o intolerancias de una persona o de «toda la casa» (los 14 alérgenos oficiales: gluten, crustaceos, huevos, pescado, cacahuetes, soja, leche, frutos_cascara, apio, mostaza, sesamo, sulfitos, altramuces, moluscos). ninguna=true si dicen que nadie tiene. confirmado=true en cuanto la persona lo ha dicho claro (quién y qué): se guarda al momento y se cuenta en una línea con [[No es así]] para deshacer. Si lo dijo a medias (sin decir quién, o «creo que…»), pregunta antes. Quitar una alergia o «nadie tiene» se comprueban además contra lo que ha escrito.",
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
      description: "Genera un menú NUEVO con el motor de HoMenu (respeta toda la configuración) y lo deja activo: «esta» semana desde hoy o la «siguiente» entera. Tarda unos segundos. fijos: los platos que piden por su nombre para esa semana («un día salmón al horno», «otro pollo con patatas»); se ponen al generar, una vez cada uno, con la receta exacta o la más parecida. Con fijos NO hace falta cambiar_plato después.",
      inputSchema: obj({
        semana: { type: "string", enum: ["esta", "siguiente"] },
        fijos: {
          type: "array", maxItems: 7,
          items: obj({
            nombre: { type: "string", description: "El plato como lo han dicho." },
            comida: { type: "string", enum: ["Comida", "Cena"], description: "Solo si lo dicen; si no, se deduce del plato." },
          }, ["nombre"]),
        },
      }, ["semana"]),
      run: ({ semana, fijos }) => generarMenu(householdId, semana, fijos ?? []),
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
          dia: { type: "string", description: "Opcional: lunes…domingo, «hoy» o «mañana». Sin él, la próxima comida que toca: NO lo preguntes para recomendar («entre semana» sin más = hoy)." },
          semana,
          comida: { type: "string", enum: ["Desayuno", "Comida", "Merienda", "Cena", "Postre"], description: "Opcional: sin ella, la próxima que toca por la hora." },
          grupo: { type: "string", description: "Opcional: para quién, si no es para toda la familia: el nombre de una persona («Leo») o «los peques», «los mayores», «el bebé». Sin esto, es para toda la familia (el bebé tiene su menú)." },
          cual: { type: "string", enum: ["principal", "primero"], description: "Por defecto el principal (el segundo en la comida)." },
          n: { type: "integer", minimum: 2, maximum: 6, description: "Cuántas opciones; por defecto 3 (caben 3 botones más «Elige tú»)." },
          parecido_a: { type: "string", description: "Opcional: el plato que piden («salmón al horno con ensalada de mango»)." },
          estilo: { type: "string", enum: ["ligero", "rapido"], description: "Opcional: si piden algo ligero (ordena por calorías y las enseña) o rápido (por tiempo)." },
          para: { type: "string", enum: ["mayores", "ninos", "bebe"], description: "Opcional: para quién. «Con mi mujer/marido», «para nosotros» = mayores. El bebé solo si lo nombran." },
          rasgos: {
            type: "object",
            description: "Opcional: lo que piden del plato, tal cual lo dicen. «Reconfortante», «de cuchara», «que no pique», «barato», «fresquito»… Solo los que digan.",
            properties: {
              connotacion: { type: "string", enum: ["reconfortante", "fresco", "casero", "festivo"] },
              textura: { type: "string", enum: ["cuchara", "tenedor", "mano"], description: "cuchara = sopas, cremas, guisos; mano = para picar o bocadillo." },
              picante: { type: "string", enum: ["sin", "con"], description: "sin = que no pique; con = que pique." },
              sabor: { type: "string", enum: ["suave", "intenso", "especiado", "dulce", "acido", "ahumado"] },
              coste: { type: "string", enum: ["economico", "medio", "caro"], description: "economico = barato (menos de 1 € por ración)." },
              calorias: { type: "string", enum: ["ligero", "medio", "contundente"], description: "Para «algo contundente»; para «ligero» usa estilo." },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      run: ({ dia, semana: cual_semana, comida, grupo, cual, n, parecido_a, estilo, para, rasgos }) => {
        const f = comida ? franjaDe(comida) : null;
        if (comida && !f) return `No entiendo qué comida es («${comida}»).`;
        return proponerPlatos(householdId, { dia: dia || null, semana: cual_semana, franja: f, grupo, para: para || null, cual, n: n ?? 3, parecidoA: parecido_a || null, estilo: estilo || null, rasgos: rasgos || null }, fotos);
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
          grupo: { type: "string", description: "Opcional: para quién, si no es para toda la familia: el nombre de una persona («Leo») o «los peques», «los mayores», «el bebé». Sin esto, es para toda la familia (el bebé tiene su menú)." },
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
/**
 * @param {Promise<boolean>} [puerta]  turno especulativo: las herramientas de
 *   escritura esperan a que resuelva; false = el turno es de la vía rápida.
 * @param {AbortSignal} [signal]  para cancelar a Lola si el turno no es suyo.
 */
export async function responder({ channel = "telegram", chatId, householdId, texto, autor, esGrupo, adjunto = null, alEscribir = null, puerta = null, signal = null }) {
  const entrada = esGrupo && autor ? `[${autor}]: ${texto}` : texto;
  // `adjunto` va también a las herramientas: la foto del plato de una receta
  // solo existe en el turno en que llega (apartar_foto_plato, preparar_receta).
  const chat = { channel, chatId: String(chatId), householdId, autor, adjunto, texto, fotos: [], escrito: false, ir: null, compartir: null, puerta };
  // Todo a la vez: no depende entre sí, y en serie eran varias idas a la base.
  // La casa ya la leyó el enrutador (casa.js la recuerda unos segundos).
  const [tope, historia, tools, casa, extras] = await Promise.all([
    fueraDeLimite(householdId), memoria(channel, chatId), herramientas(chat),
    cargarCasa(householdId).catch(() => null), extrasDeFicha(householdId, chatId),
  ]);
  if (tope) return { texto: tope, fotos: [], deshacible: false, ir: null };
  // La ficha de la casa (api/_bot/ficha.js): lo que Lola ya sabe sin preguntar.
  const ficha = casa ? montarFicha(casa, extras) : null;
  let dicho, uso;
  try {
    ({ dicho, uso } = await ejecutar({
      historia, entrada, tools, adjunto, signal, ficha,
      alEscribir: alEscribir ? (parcial) => alEscribir(parcial, { fotos: chat.fotos }) : null,
      // Lo que juntó el modelo que se cayó no es de esta respuesta.
      alReintentar: () => { chat.fotos.length = 0; chat.ir = null; chat.compartir = null; },
    }));
  } catch (err) {
    // Ya había cambiado algo en la casa cuando el modelo se cayó: repetir el
    // turno lo haría dos veces. Se dice que está hecho y dónde verlo.
    if (!err?.aMedias) throw err;
    console.error("[agente] a medias", err?.message);
    await registrar(FALLO_A_MEDIAS, { userId: await duenoDe(householdId).catch(() => null), extra: { error: `a medias: ${String(err?.message ?? err).slice(0, 250)}` } });
    return {
      texto: "😵‍💫 Me he quedado a medias: puede que ya haya cambiado algo y no te lo he podido contar.\n\nMíralo en la app con el botón antes de pedírmelo otra vez, así no se hace dos veces.",
      fotos: chat.fotos, deshacible: chat.escrito, ir: chat.ir ?? "semana", compartir: null,
    };
  }
  if (/no (te )?(he )?entend|no s[eé] a qu[eé] te refieres/i.test(dicho)) {
    await registrar(FALLO_NO_ENTIENDE, { userId: await duenoDe(householdId).catch(() => null), extra: { texto: String(texto).slice(0, 200) } });
  }

  const llevados = await contarUso(householdId, uso).catch((e) => { console.error("[agente] uso", e?.message); return 0; });
  const respuesta = dicho + avisoDeLimite(householdId, llevados);

  // Guardar la charla no tiene por qué retrasar la respuesta: va en
  // `guardado`, y quien entrega lo espera DESPUÉS de enviar y antes de soltar
  // el turno (si no, el mensaje siguiente no vería este en la memoria).
  const guardado = Promise.all([
    insert("bot_messages", [
      { channel, chat_id: String(chatId), household_id: householdId, role: "user", author_id: autor ?? null, content: { texto: adjunto ? `[${adjunto.tipo === "document" ? "PDF" : "foto"}] ${entrada}` : entrada } },
      { channel, chat_id: String(chatId), household_id: householdId, role: "assistant", author_id: null, content: { texto: respuesta } },
    ]).catch((e) => console.error("[agente] memoria", e?.message)),
    segundaSemana(householdId).catch(() => {}),
  ]);

  return { texto: respuesta, fotos: chat.fotos, deshacible: chat.escrito, ir: chat.ir, compartir: chat.compartir, guardado };
}

/**
 * Una vuelta del agente: el modelo con sus herramientas hasta que contesta.
 * Separado de responder() para que las pruebas (scripts/bot-evals.mjs) lo
 * muevan con herramientas de mentira, sin casa ni base de datos.
 */
/**
 * @param {(parcial: string) => void} [alEscribir]  si se pasa, la respuesta
 *   llega en vivo: se llama con lo escrito hasta ahora en cada vuelta del
 *   modelo (desde cero en cada vuelta), para ir enseñándolo mientras piensa.
 *   El resultado final no cambia.
 */
/**
 * @param {{ estable: string, delDia: string } | null} [ficha]  la ficha de la
 *   casa (api/_bot/ficha.js); las pruebas pueden pasar una de mentira.
 */
export async function ejecutar({ historia = [], entrada, tools, adjunto = null, alEscribir = null, signal = null, modelos = [MODELO, MODELO_RESERVA], alReintentar = null, ficha = null }) {
  // Si ha INTENTADO escribir en la casa este turno y el modelo se cae después,
  // no se repite con el de reserva: lo haría dos veces. Cuenta el intento, no
  // el éxito: una escritura que falló a medias puede haber guardado algo.
  let escrituras = 0;
  const vigiladas = tools.map((t) => ({
    ...t,
    run: async (...a) => {
      if (!SOLO_LECTURA.has(t.name)) escrituras++;
      return t.run(...a);
    },
  }));
  let ultimoError = null;
  for (const [i, modelo] of modelos.entries()) {
    const plazo = AbortSignal.timeout(i === 0 ? PLAZO_MS.principal : PLAZO_MS.reserva);
    try {
      if (i > 0) alReintentar?.();
      const r = await unaVuelta({
        historia, entrada, tools: vigiladas, adjunto, alEscribir, modelo, ficha,
        signal: signal ? AbortSignal.any([signal, plazo]) : plazo,
        // El principal sin reintentos: si falla, reintentar ES el de reserva.
        maxRetries: i === 0 && modelos.length > 1 ? 0 : 1,
      });
      if (i > 0) console.warn(`[agente] plan B: contestó ${modelo}`);
      return { ...r, modelo };
    } catch (err) {
      ultimoError = err;
      // Cancelado desde fuera (el turno era de la vía rápida): nada que hacer.
      if (signal?.aborted) throw err;
      const agotado = plazo.aborted;
      if (!agotado && !esCaida(err)) throw err;
      console.error(`[agente] ${modelo} no contesta (${agotado ? "plazo agotado" : err?.status ?? err?.constructor?.name}): ${String(err?.message).slice(0, 120)}`);
      if (escrituras > 0) throw Object.assign(err, { aMedias: true, caida: true });
      Object.assign(err, { caida: true });
    }
  }
  throw ultimoError;
}

/**
 * ¿Es que el modelo no está (saturado, caído, colgado), y otro podría
 * contestar? Un error nuestro (400: la petición está mal) no se arregla
 * cambiando de modelo, así que no cuenta. Pura, para el test.
 */
export function esCaida(err) {
  if (!err) return false;
  if (err.caida) return true;
  // Por clase y no por err.name: las del SDK no lo ponen (todas dicen «Error»).
  // La de tiempo agotado es hija de la de conexión.
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.RateLimitError) return true;
  if ([408, 409, 429, 500, 502, 503, 504, 529].includes(err.status)) return true;
  // Un error que llega a mitad del stream no trae status: viene en el cuerpo.
  const tipo = err.error?.error?.type ?? err.error?.type;
  if (["overloaded_error", "api_error", "rate_limit_error", "timeout_error"].includes(tipo)) return true;
  return /overloaded|timed? ?out|ECONNRESET|socket hang up|fetch failed|Connection error/i.test(String(err.message ?? ""));
}

async function unaVuelta({ historia, entrada, tools, adjunto, alEscribir, signal, modelo, maxRetries, ficha = null }) {
  // Con cache_control en el último bloque: la segunda vuelta del turno (tras
  // una herramienta) y las siguientes leen de caché todo lo anterior —
  // instrucciones, historia y el mensaje— en vez de volver a procesarlo.
  const contenido = adjunto
    ? [{ type: adjunto.tipo, source: { type: "base64", media_type: adjunto.mediaType, data: adjunto.base64 } }, { type: "text", text: entrada, cache_control: { type: "ephemeral" } }]
    : [{ type: "text", text: entrada, cache_control: { type: "ephemeral" } }];
  const opciones = { maxRetries, signal };
  const runner = anthropic().beta.messages.toolRunner({
    model: modelo,
    max_tokens: 4000,
    max_iterations: 8,
    // Haiku no tiene «effort» (si se pone de reserva con BOT_MODELO_RESERVA): va sin él.
    ...(/haiku/.test(modelo) ? {} : { output_config: { effort: EFFORT } }),
    system: [
      { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
      // La ficha, en dos bloques con su caché: el estable casi no cambia y el
      // del día cambia una vez al día (o al cambiar el menú). Son 3 de los 4
      // puntos de caché que deja la API; el cuarto, el mensaje.
      ...(ficha?.estable ? [{ type: "text", text: `FICHA DE LA CASA (datos para ti, no un formato: tú contesta siempre en HTML de Telegram, nunca con ** ni guiones. Es lo guardado ahora y manda sobre lo dicho en charlas de otros días)\n${ficha.estable}`, cache_control: { type: "ephemeral" } }] : []),
      ...(ficha?.delDia ? [{ type: "text", text: ficha.delDia, cache_control: { type: "ephemeral" } }] : []),
      // Fuera de la caché: cambia en cada mensaje.
      { type: "text", text: `Ahora mismo en España: ${ahoraEnMadrid()}.` },
    ],
    tools,
    messages: [...historia, { role: "user", content: contenido }],
    ...(alEscribir ? { stream: true } : {}),
  }, opciones);
  // Cada vuelta del runner es una llamada al modelo: el coste es la suma.
  const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let final = null;
  for await (const vuelta of runner) {
    let mensaje = vuelta;
    if (alEscribir) {
      // En vivo: la vuelta es un stream; se va pasando lo escrito y al acabar
      // se toma el mensaje entero, igual que sin stream.
      let escrito = "";
      vuelta.on("text", (trozo) => {
        escrito += trozo;
        try { alEscribir(escrito); } catch { /* enseñar a medias nunca rompe la respuesta */ }
      });
      mensaje = await vuelta.finalMessage();
    }
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
