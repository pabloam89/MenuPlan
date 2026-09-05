/**
 * El parser del panel: de una frase en español a ajustes de la libreta.
 *
 * ── El modelo no elige platos ─────────────────────────────────────────────
 * Traduce, y nada más. Emite ids del registro de campos (notepadFields.js) y
 * el motor determinista de siempre recoloca el menú. Si el modelo eligiera
 * platos se saltaría las 16 reglas de validateMenu, y volverían exactamente
 * los fallos que costó semanas cerrar: doble ensalada, hummus dos días
 * seguidos, cigalas un martes.
 *
 * ── Dos canales, y solo uno ejecuta ───────────────────────────────────────
 * La respuesta trae prosa (`reply`) Y ajustes tipados (`ajustes`). El modelo
 * puede DECIR lo que quiera; solo puede HACER lo que pase por `valorValido`.
 * Un valor inventado se cae aquí y no llega a la pantalla.
 *
 * ── Las alergias no pasan por aquí ────────────────────────────────────────
 * `pareceAlergia` se ejecuta ANTES de llamar al modelo, y es determinista. Una
 * frase con forma de alergia no se parsea: se corta y se manda a la tarjeta de
 * alérgenos. Porque el fallo peligroso no es que el panel no entienda "soy
 * alérgico a los frutos secos" — es que lo entienda, conteste "vale, se los
 * quito", toque una preferencia, y esa persona se quede creyendo que está
 * cubierta mientras el filtro de alérgenos de verdad no se ha enterado.
 */

import { z } from "zod";
import { VERBOS, AMBITOS, SERVICIOS, CAMPOS_POR_ID, valorValido, rutaDe } from "./notepadFields.js";
import { poner, valorDe } from "./notepad.js";

/** Los tres desenlaces posibles de una frase. */
export const TIPOS = ["propuestas", "limites", "no_entendido"];

/** Nunca más de cuatro tarjetas: a partir de ahí es un menú, no una respuesta. */
export const MAX_OPCIONES = 4;

const AjusteSchema = z.object({
  campo: z.string(),
  valor: z.string(),
  op: z.enum(["mas", "menos", "nunca"]),
  // Solo para `freqs`: el número OBJETIVO, no el delta. La tarjeta dice "tres
  // veces" y el usuario tiene que poder fiarse de ese número.
  n: z.number().int().min(0).max(7).optional(),
  ambito: z.enum(["todos", "ninos", "adultos", "bebes"]).default("todos"),
  servicio: z.enum(["ambos", "comida", "cena"]).default("ambos"),
});

const OpcionSchema = z.object({
  etiqueta: z.string().min(1).max(60),
  detalle: z.string().max(120).optional(),
  ajustes: z.array(AjusteSchema).min(1).max(5),
});

export const RespuestaSchema = z.object({
  // Corta a propósito: es una frase, no un párrafo. Y el tope la mantiene
  // lejos de convertirse en un canal de consejo.
  reply: z.string().min(1).max(300),
  kind: z.enum(["propuestas", "limites", "no_entendido"]),
  // El cubo del medio: lo que entendió pero no sabe hacer. Enseñarlo convierte
  // un fallo silencioso en una expectativa bien puesta.
  pendiente: z.array(z.string().max(120)).max(3).default([]),
  // "una": las opciones son ALTERNATIVAS y marcar una desmarca las demás
  // (¿tres veces o cuatro?). "varias": son cambios independientes que se
  // pueden marcar a la vez ("menos pescado" Y "más mexicana"). Sin esta
  // distinción, una petición compuesta obligaba a elegir entre dos cosas que
  // no se excluyen, y la otra mitad se perdía sin que nadie lo dijera.
  modo: z.enum(["una", "varias"]).default("una"),
  opciones: z.array(OpcionSchema).max(MAX_OPCIONES).default([]),
});

// ── Guardas deterministas, antes del modelo ────────────────────────────────

// Se compara SIN tildes. La primera versión no lo hacía y se le escapaban
// "soy alérgico" y "mi hija es celíaca" — o sea, las dos formas en que
// cualquier español escribe esto. Un guarda de seguridad que no aguanta la
// ortografía del idioma en que se le habla no es un guarda.
const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Alergias e intolerancias declaradas. Deliberadamente ancha: un falso
// positivo manda al usuario a la pantalla correcta, que es donde debería ir de
// todas formas. Un falso negativo le deja creer que está protegido.
const ALERGIA_RE = /\b(alergi|alergic|intoleran|celiac|celiaqu|anafilax|sin gluten|sin lactosa|sin huevo|sin frutos secos|no puede tomar|le sienta mal|me sienta mal)/;

// Verbos destructivos: fuera del pool por construcción, no por prompt.
const DESTRUCTIVO_RE = /\b(borra|borrar|elimina|eliminar|resetea|resetear)\b.{0,20}\b(cuenta|todo|menu|menus|datos|perfil)\b/;

/** ¿Esta frase habla de una alergia o intolerancia? Se corta antes del modelo. */
export function pareceAlergia(texto) {
  return ALERGIA_RE.test(sinTildes(texto));
}

/** ¿Pide borrar algo? El panel no ejecuta destrucciones, ni con confirmación. */
export function pareceDestructivo(texto) {
  return DESTRUCTIVO_RE.test(sinTildes(texto));
}

/**
 * La respuesta fija para una frase que no debe llegar al modelo. Es texto
 * escrito a mano, no generado: aquí no queremos improvisación.
 */
export function respuestaDeGuarda(texto) {
  if (pareceAlergia(texto)) {
    return {
      reply: "Las alergias e intolerancias no las toco desde aquí — se ponen en la ficha de cada persona, para que el aviso salga en todos los platos y también en los menús que compartes.",
      kind: "limites",
      pendiente: [],
      opciones: [],
      llevarA: "alergenos",
    };
  }
  if (pareceDestructivo(texto)) {
    return {
      reply: "Eso no lo hago yo. Borrar datos se hace desde tu perfil, con su confirmación.",
      kind: "limites",
      pendiente: [],
      opciones: [],
      llevarA: "perfil",
    };
  }
  return null;
}

// ── Validación de lo que devuelve el modelo ────────────────────────────────

/**
 * Limpia y valida la respuesta cruda del modelo.
 *
 * Nunca lanza: una respuesta ilegible es un "no te he entendido", no un error
 * en pantalla. El usuario escribió bien; el que falló fue el modelo.
 */
export function validarRespuesta(raw) {
  const parsed = RespuestaSchema.safeParse(raw);
  if (!parsed.success) return noEntendido();

  const r = parsed.data;

  // Cada ajuste pasa por el registro. El modelo puede inventarse "cocina
  // marciana"; aquí se cae y no llega a la pantalla.
  const opciones = [];
  for (const opcion of r.opciones) {
    const ajustes = opcion.ajustes.filter((a) => valorValido(a.campo, a.valor));
    // Una opción sin ningún ajuste válido no es una opción: es un botón que no
    // hace nada, que es peor que no ofrecerlo.
    if (ajustes.length === 0) continue;
    opciones.push({ ...opcion, ajustes });
  }

  if (r.kind === "propuestas" && opciones.length === 0) {
    // Dijo que proponía y no propuso nada válido. Mejor admitirlo que enseñar
    // una respuesta vacía con cara de haber funcionado.
    return { ...noEntendido(), pendiente: r.pendiente };
  }

  return { ...r, opciones: opciones.slice(0, MAX_OPCIONES) };
}

function noEntendido() {
  return {
    reply: "No te he pillado. Prueba con algo como «menos pescado» o «más comida mexicana».",
    kind: "no_entendido",
    pendiente: [],
    opciones: [],
  };
}

// ── Aplicar a la libreta ───────────────────────────────────────────────────

/**
 * Convierte un ajuste en una escritura de la libreta.
 *
 * `origen: "texto"` siempre: lo dedujimos de una frase, así que entra como
 * INFERIDO y se pinta para que el usuario lo confirme. Nunca como si lo
 * hubiera dicho campo por campo.
 */
export function aplicarAjuste(notepad, ajuste, { frase, fecha }) {
  const campo = CAMPOS_POR_ID[ajuste.campo];
  if (!campo || !valorValido(ajuste.campo, ajuste.valor)) return notepad;

  const path = rutaDe(ajuste.campo, ajuste.valor, ajuste.ambito, ajuste.servicio);

  let valor;
  if (campo.proyecta === "freqs") {
    // El objetivo lo manda el modelo porque la tarjeta lo enseña; si no viene,
    // se calcula del actual. El tope no es cosmético: `freqs` alimenta cuotas
    // semanales y un 9 dejaría al planner sin solución.
    const actual = valorDe(notepad, path, 0);
    const propuesto = ajuste.n ?? (ajuste.op === "mas" ? actual + 1 : ajuste.op === "menos" ? actual - 1 : 0);
    valor = Math.max(0, Math.min(7, propuesto));
  } else if (campo.proyecta === "excluidos") {
    valor = ajuste.op === "nunca";
  } else if (campo.proyecta === "favoritos") {
    valor = ajuste.op !== "nunca";
  } else {
    valor = ajuste.op === "mas" ? 1 : ajuste.op === "menos" ? -1 : 0;
  }

  return poner(notepad, path, valor, { origen: "texto", frase, fecha });
}

/** Aplica todos los ajustes de una opción, en orden. */
export function aplicarOpcion(notepad, opcion, ctx) {
  return (opcion?.ajustes ?? []).reduce((n, a) => aplicarAjuste(n, a, ctx), notepad);
}

/**
 * Lo que la tarjeta enseña en pequeño: el cambio concreto, no una etiqueta.
 * «Menos pescado» es una etiqueta; «Pescado: 2 → 1» es un recibo, y es lo que
 * deja al usuario pulsar sabiendo qué va a pasar.
 */
export function resumirAjuste(notepad, ajuste) {
  const campo = CAMPOS_POR_ID[ajuste.campo];
  if (!campo) return null;
  const path = rutaDe(ajuste.campo, ajuste.valor, ajuste.ambito, ajuste.servicio);
  const etiqueta = ajuste.valor.replace(/_/g, " ");
  if (campo.proyecta === "freqs") {
    const antes = valorDe(notepad, path, 0);
    const despues = aplicarAjuste(notepad, ajuste, {}).campos[path]?.valor;
    return `${cap(etiqueta)}: ${antes} → ${despues} por semana`;
  }
  if (campo.proyecta === "excluidos") return `Fuera ${etiqueta}`;
  if (campo.proyecta === "favoritos") return `Más ${etiqueta}`;
  return ajuste.op === "nunca" ? `Nunca ${etiqueta}` : `${ajuste.op === "mas" ? "Más" : "Menos"} ${etiqueta}`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Las ilustraciones por familia y por eje, para pintar el cambio en vez de
// contarlo. Mismas rutas que panelSuggestions: son los unicos recortes con alfa.
const ARTE = {
  "freqs.carne": "/categories/cut/carne.png",
  "freqs.pescado": "/categories/cut/pescado.png",
  "freqs.verdura": "/categories/cut/verduras.png",
  "freqs.legumbres": "/categories/cut/legumbres.png",
  "freqs.pasta_arroz": "/categories/cut/pasta_arroz.png",
  "freqs.huevos": "/categories/cut/huevos.png",
  "tecnica.horno": "/categories/cut/tecnica/horno.png",
  "tecnica.plancha": "/categories/cut/tecnica/plancha.png",
  "tecnica.sarten": "/categories/cut/tecnica/sarten.png",
  "tecnica.olla": "/categories/cut/tecnica/olla.png",
  "tecnica.crudo": "/categories/cut/tecnica/crudo.png",
  "salsa.si": "/categories/cut/salsa.png",
};

/**
 * El cambio en datos, para pintarlo: ilustracion, direccion y numeros.
 *
 * "Carne 4 -> 3" contado con palabras se lee; contado con el dibujo de la carne
 * y una flecha hacia abajo se VE, que es lo que pedia la pantalla 2. Devuelve
 * null cuando no hay ilustracion para ese eje: entonces la UI cae al texto.
 */
export function pintarAjuste(notepad, ajuste) {
  const campo = CAMPOS_POR_ID[ajuste.campo];
  if (!campo) return null;
  const clave = `${ajuste.campo}.${ajuste.valor}`;
  const path = rutaDe(ajuste.campo, ajuste.valor, ajuste.ambito, ajuste.servicio);
  const arte = ARTE[clave] ?? (ajuste.campo === "cocina" ? `/categories/cut/cocinas/${ajuste.valor}.png` : null);
  if (!arte) return null;

  const etiqueta = cap(ajuste.valor.replace(/_/g, " o "));
  if (campo.proyecta === "freqs") {
    const antes = valorDe(notepad, path, 0);
    const despues = aplicarAjuste(notepad, ajuste, {}).campos[path]?.valor ?? antes;
    return { arte, etiqueta, antes, despues, sube: despues > antes };
  }
  return { arte, etiqueta, sube: ajuste.op === "mas" };
}

export { VERBOS, AMBITOS, SERVICIOS };
