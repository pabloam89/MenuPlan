/**
 * Lo que un navegador hace en la web de Mercadona: la misma para el prototipo a mano (scripts/mercadona-navegador.mjs)
 * y para el trabajador (scripts/mercadona-trabajador.mjs). Solo lista: no toca el carrito ni el pago.
 * Sin disfraces: si Mercadona bloquea, se para y se cuenta.
 */
import { compararLista, leerGuardada } from "./mercadonaLista.mjs";

export const TIENDA = "https://tienda.mercadona.es/";
const ESPERA_CARGA_MS = 3000;

// Corre dentro de su página, y la sesión no sale nunca de ahí. Sin lista, solo
// dice si hay sesión; con lista, la crea y la relee.
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

/** Abre la tienda y mira si hay sesión: `{ resultado, status }`, con `resultado` null si se puede seguir. */
export async function entrarEnTienda(pagina) {
  const respuesta = await pagina.goto(TIENDA, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const status = respuesta?.status();
  if (respuesta && status >= 400) return { resultado: "bloqueado_portada", status };
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
