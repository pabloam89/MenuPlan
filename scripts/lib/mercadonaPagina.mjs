/**
 * Lo que un navegador hace en la web de Mercadona: la misma para el prototipo a mano (scripts/mercadona-navegador.mjs)
 * y para el trabajador (scripts/mercadona-trabajador.mjs). La lista, mirar si la cuenta tiene dirección y medio de pago
 * (referencias/pedido.md de la skill) y, si la casa lo ha encendido, el carro (trozo 19 de #1407): nunca el pago.
 * Sin disfraces: si Mercadona bloquea, se para y se cuenta.
 */
import { compararLista, leerGuardada } from "../../src/lib/mercadonaLista.js";
import { faltanEnCarro, sumarAlCarro, totalDelCarro } from "./mercadonaCarro.mjs";
import { esRevision } from "../../src/lib/mercadonaLlegaHasta.js";

export const TIENDA = "https://tienda.mercadona.es/";
const ESPERA_CARGA_MS = 3000;

// Corre dentro de su página, y la sesión no sale nunca de ahí. Sin orden, solo
// dice si hay sesión; con `{ carro: null }` lee el carro y con `{ carro }` lo
// escribe entero; con una lista, la crea y la relee.
export const enPagina = async (lista) => {
  const leer = (k) => {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      return v?.token && v?.uuid ? v : null;
    } catch {
      return null;
    }
  };
  let u = leer("MO-user");
  for (let i = 0; !u && i < localStorage.length; i++) u = leer(localStorage.key(i));
  if (!lista) return Boolean(u);
  if (!u) return { paso: "sesion", status: 0 };
  const cabeceras = { "content-type": "application/json", authorization: `Bearer ${u.token}` };
  if ("carro" in lista) {
    const url = `/api/customers/${u.uuid}/cart/?lang=es`;
    const r = lista.carro ? await fetch(url, { method: "PUT", headers: cabeceras, body: JSON.stringify(lista.carro) }) : await fetch(url, { headers: cabeceras });
    return { paso: lista.carro ? "escribir_carro" : "leer_carro", status: r.status, carro: r.ok ? await r.json() : null };
  }
  const base = `/api/customers/${u.uuid}/shopping-lists/`;
  const r = await fetch(`${base}create-with-products/?lang=es`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ name: lista.name, products: lista.products }),
  });
  if (!r.ok) return { paso: "crear", status: r.status };
  const { id } = await r.json();
  const g = await fetch(`${base}${id}/?lang=es`, { headers: cabeceras });
  return { paso: "leer", status: g.status, id, guardada: g.ok ? await g.json() : null };
};

// Corre dentro de su página: si la cuenta tiene dirección (`count` de sus direcciones) y medio de pago
// (`has_active_billing` del perfil). Solo vuelven dos booleanos, o el paso que falló: ni la dirección ni la tarjeta salen.
export const enPaginaRevisar = async () => {
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem("MO-user"));
  } catch {
    return { paso: "sesion" };
  }
  if (!u?.token || !u?.uuid) return { paso: "sesion" };
  const cabeceras = { authorization: `Bearer ${u.token}` };
  const base = `/api/customers/${u.uuid}/`;
  const d = await fetch(`${base}addresses/?lang=es`, { headers: cabeceras });
  if (!d.ok) return { paso: "direcciones", status: d.status };
  const p = await fetch(`${base}?lang=es`, { headers: cabeceras });
  if (!p.ok) return { paso: "perfil", status: p.status };
  const { count } = await d.json();
  const { has_active_billing } = await p.json();
  return { tiene_direccion: Number(count) > 0, tiene_pago: has_active_billing === true };
};

/**
 * Pura. Lo que vuelve de la página: la revisión (`{ tiene_direccion, tiene_pago }`, la forma de `esRevision`) o null si
 * no se pudo mirar. Cualquier otra cosa que traiga se queda fuera.
 */
export const revisionDe = (r) => {
  const revision = r ? { tiene_direccion: r.tiene_direccion, tiene_pago: r.tiene_pago } : null;
  return esRevision(revision) ? revision : null;
};

/**
 * Mira la cuenta: la revisión, o `{ fallo: paso, status }` si una llamada no contestó bien. Si la página lanza (sin red,
 * una respuesta que no es JSON), `{ fallo: "lanzo", status: 0, error }` con el nombre del error: no saber si hay
 * dirección no tumba el encargo, y quien llama lo escribe en el log.
 */
export async function revisarCuenta(pagina) {
  let r;
  try {
    r = await pagina.evaluate(enPaginaRevisar);
  } catch (e) {
    return { fallo: "lanzo", status: 0, error: e?.name ?? "Error" };
  }
  return revisionDe(r) ?? { fallo: r?.paso ?? "desconocido", status: r?.status ?? 0 };
}

/** Abre la tienda: `{ resultado, status }`, con `resultado` null si no ha bloqueado. */
export async function abrirPortada(pagina) {
  const respuesta = await pagina.goto(TIENDA, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const status = respuesta?.status();
  return { resultado: respuesta && status >= 400 ? "bloqueado_portada" : null, status };
}

/** Abre la tienda y mira si hay sesión: `{ resultado, status }`, con `resultado` null si se puede seguir. */
export async function entrarEnTienda(pagina) {
  const portada = await abrirPortada(pagina);
  if (portada.resultado) return portada;
  const { status } = portada;
  await pagina.waitForTimeout(ESPERA_CARGA_MS);
  if (!(await pagina.evaluate(enPagina, null))) return { resultado: "sin_sesion", status };
  return { resultado: null, status };
}

/**
 * Crea la lista y comprueba qué quedó: `{ resultado, id?, status?, entraron?, faltan? }`, con `resultado`
 * `productos_completos`, `faltan_productos`, `lista_sin_releer`, `fallo_crear` o `fallo_sesion`.
 */
export async function crearLista(pagina, lista) {
  const r = await pagina.evaluate(enPagina, lista);
  if (r.paso === "sesion") return { resultado: "fallo_sesion", status: r.status };
  if (r.paso === "crear") return { resultado: "fallo_crear", status: r.status };
  if (!r.guardada) return { resultado: "lista_sin_releer", id: r.id, status: r.status };
  const { entraron, faltan } = compararLista(lista.products, leerGuardada(r.guardada));
  return { resultado: faltan.length ? "faltan_productos" : "productos_completos", id: r.id, entraron, faltan };
}

/**
 * Suma la lista al carro: lo lee, le suma la lista (mercadonaCarro.mjs) y lo escribe una vez con la `version` leída.
 * `{ resultado, total?, faltan?, carro?, status? }`: `carro_lleno` (con el total que dice Mercadona, null si no se lee,
 * los productos que no quedaron como se mandaron y el carro escrito, para crear el pedido), `fallo_carro` o `fallo_sesion`. Una sola pasada: si el carro cambió
 * entre leer y escribir, Mercadona lo rechaza y se cuenta, sin reintentar.
 */
export async function llenarCarro(pagina, lista) {
  const leido = await pagina.evaluate(enPagina, { carro: null });
  if (leido.paso === "sesion") return { resultado: "fallo_sesion", status: leido.status };
  if (!leido.carro) return { resultado: "fallo_carro", status: leido.status };
  const nuevo = sumarAlCarro(leido.carro, lista.products);
  const escrito = await pagina.evaluate(enPagina, { carro: nuevo });
  if (escrito.paso === "sesion") return { resultado: "fallo_sesion", status: escrito.status };
  if (!escrito.carro) return { resultado: "fallo_carro", status: escrito.status };
  return { resultado: "carro_lleno", total: totalDelCarro(escrito.carro), faltan: faltanEnCarro(nuevo, escrito.carro), carro: escrito.carro };
}
