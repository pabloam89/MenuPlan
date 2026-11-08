/**
 * La app lee y apunta sus menús generados por api/operacion.js (`menu_generado`, 0125; trozo 22 de #1037). Nunca
 * lanza por la red ni por la sesión: devuelve `{ ok: false, fallo }` y quien llama lo dice.
 */
import { enviarAlServidor, falloDeEnvio, jsonDeTexto } from "./escribirDato.js";
import { tokenDeSesion, urlOperacion } from "./familiaCasa.js";
import { FALLO_DATO } from "./vocabularios.js";
import { menusDeFechas } from "./menusGenerados.js";

/** Los menús de `casa`: `{ ok: true, menus: [{ at }] }` o `{ ok: false, fallo }`. */
export async function leerMenusGenerados(casa, { token = tokenDeSesion, fetcher = fetch } = {}) {
  let res;
  let texto;
  try {
    const t = await token();
    if (!t) return { ok: false, fallo: FALLO_DATO.SIN_SESION };
    res = await fetcher(`${urlOperacion()}?casa=${encodeURIComponent(casa)}&menus=1`, { headers: { Authorization: `Bearer ${t}` } });
    texto = await res.text();
  } catch (e) {
    console.error("[menus] sin leer:", String(e?.message ?? e));
    return { ok: false, fallo: FALLO_DATO.SIN_RED };
  }
  const cuerpo = jsonDeTexto(texto);
  const fallo = res.status === 200 ? null : falloDeEnvio({ status: res.status, cuerpo });
  if (fallo || !Array.isArray(cuerpo?.menus)) {
    console.error("[menus] respuesta sin menús", res.status, cuerpo?.fallo ?? null);
    return { ok: false, fallo: fallo ?? FALLO_DATO.SERVIDOR };
  }
  return { ok: true, menus: menusDeFechas(cuerpo.menus) };
}

/** Apunta en `casa` un menú generado ahora: `{ ok: true }` o `{ ok: false, fallo }`. */
export async function mandarMenuGenerado(casa, { token = tokenDeSesion, fetcher = fetch } = {}) {
  let r;
  try {
    r = await enviarAlServidor({ token, url: urlOperacion(), fetchFn: fetcher })({ casa, menu_generado: true });
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    return { ok: false, fallo: FALLO_DATO.SIN_RED };
  }
  const fallo = falloDeEnvio(r);
  if (fallo || r.cuerpo?.guardado !== true) {
    console.error("[menus] sin apuntar", r.status, r.cuerpo?.fallo ?? null);
    return { ok: false, fallo: fallo ?? FALLO_DATO.SERVIDOR };
  }
  return { ok: true };
}
