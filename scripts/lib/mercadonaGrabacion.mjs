/**
 * Grabar cómo se tramita un pedido en la web de Mercadona (trozo 13 de #1407):
 * qué llamadas hace su propia web a su /api/ mientras la persona, a mano, pasa
 * por carro → Tramitar → dirección → días de entrega. Se guarda la forma de
 * cada llamada, no los datos de la persona: sin cabeceras (ni Authorization ni
 * cookies) y con los textos que pueden ser personales cambiados por su tipo.
 */

/** Lo que se graba: solo la API de la tienda. */
export const ES_API = /^https:\/\/tienda\.mercadona\.es\/api\//;

/** Llamadas del catálogo: muchas y grandes, y no dicen nada del pedido. Se apuntan sin cuerpo. */
const CATALOGO = /\/api\/(categories|products|home|search|postal-codes\/actions)/;

// Claves cuyo valor puede ser de la persona, aunque sea un número: se cambia siempre.
const CLAVE_PERSONAL = /token|password|contrase|email|mail|phone|tel[eé]fono|mobile|name|nombre|apellido|surname|address|direcci|street|calle|door|puerta|floor|piso|postal|zip|city|ciudad|town|province|provincia|comments|lat|lon|card|tarjeta|iban|pan|cvv|holder|titular|nif|dni|document|birth|customer|uuid/i;
// Textos que dejan ver lo que son: fechas y horas (las franjas), y palabras cortas de vocabulario.
const FECHA = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const VOCABULARIO = /^[a-z_]{1,30}$/;
const MAX_ELEMENTOS = 5;

/**
 * El valor sin nada de la persona: los objetos y listas conservan su forma (de
 * las listas, los primeros MAX_ELEMENTOS y cuántos había), los números y
 * booleanos se quedan, y los textos solo si son una fecha o una palabra de
 * vocabulario y no van en una clave personal.
 */
export function limpiarValor(v, clave = "") {
  if (Array.isArray(v)) {
    const r = v.slice(0, MAX_ELEMENTOS).map((x) => limpiarValor(x, clave));
    return v.length > MAX_ELEMENTOS ? [...r, `«${v.length - MAX_ELEMENTOS} más»`] : r;
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiarValor(x, k)]));
  if (CLAVE_PERSONAL.test(clave) && v !== null && typeof v !== "boolean") return `«${typeof v}»`;
  if (typeof v === "string" && !FECHA.test(v) && !VOCABULARIO.test(v)) return "«texto»";
  return v;
}

/** La ruta sin lo que identifica a la persona: los uuid y los números largos pasan a «:id». */
export function limpiarRuta(url) {
  const u = new URL(url);
  const ruta = u.pathname
    .split("/")
    .map((t) => (/^[0-9a-f-]{20,}$/i.test(t) || /^\d{4,}$/.test(t) ? ":id" : t))
    .join("/");
  const claves = [...u.searchParams.keys()];
  return claves.length ? `${ruta}?${claves.map((k) => `${k}=…`).join("&")}` : ruta;
}

const cuerpo = (texto) => {
  if (!texto) return null;
  try {
    return limpiarValor(JSON.parse(texto));
  } catch {
    return "«no es JSON»";
  }
};

/**
 * Una llamada grabada, ya limpia: `{ metodo, ruta, status, pide, responde }`.
 * `pide` y `responde` son los cuerpos sin datos de la persona; del catálogo, null.
 */
export function llamadaLimpia({ metodo, url, status, pide, responde }) {
  const catalogo = CATALOGO.test(url);
  return {
    metodo,
    ruta: limpiarRuta(url),
    status,
    pide: catalogo ? null : cuerpo(pide),
    responde: catalogo ? null : cuerpo(responde),
  };
}
