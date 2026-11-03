/**
 * La app y lo cocinado de su casa (trozo 22 de #1037): lee una semana y marca o desmarca un plato por
 * api/operacion.js (la tabla `cocinado` es solo del servidor). Nunca lanza por la red ni por la sesión: devuelve
 * `{ ok: false, fallo }` y quien llama lo dice (y deshace lo que pintó).
 */
import { enviarAlServidor, falloDeEnvio, jsonDeTexto } from "./escribirDato.js";
import { tokenDeSesion, urlOperacion } from "./familiaCasa.js";
import { clavesDeCocinados, filaDeCocinado } from "./cocinados.js";
import { FALLO_DATO } from "./vocabularios.js";

/** Las claves cocinadas de la semana `semana` (su lunes) en `casa`: `{ ok: true, claves }` o `{ ok: false, fallo }`. */
export async function leerCocinados(casa, semana, { token = tokenDeSesion, fetcher = fetch } = {}) {
  let res;
  let texto;
  try {
    const t = await token();
    if (!t) return { ok: false, fallo: FALLO_DATO.SIN_SESION };
    res = await fetcher(`${urlOperacion()}?casa=${encodeURIComponent(casa)}&cocinados=${encodeURIComponent(semana)}`, { headers: { Authorization: `Bearer ${t}` } });
    texto = await res.text();
  } catch (e) {
    console.error("[cocinados] sin leer:", String(e?.message ?? e));
    return { ok: false, fallo: FALLO_DATO.SIN_RED };
  }
  const cuerpo = jsonDeTexto(texto);
  // Un GET no lleva `guardado`: con 200 vale; si no, el fallo de siempre (falloDeEnvio).
  const fallo = res.status === 200 ? null : falloDeEnvio({ status: res.status, cuerpo });
  if (fallo || !Array.isArray(cuerpo?.cocinados)) {
    console.error("[cocinados] respuesta sin cocinados", res.status, cuerpo?.fallo ?? null);
    return { ok: false, fallo: fallo ?? FALLO_DATO.SERVIDOR };
  }
  return { ok: true, claves: clavesDeCocinados(cuerpo.cocinados) };
}

/** Marca (`hecho`) o desmarca un plato cocinado: `{ ok: true }` o `{ ok: false, fallo }`. */
export async function mandarCocinado(casa, fila, hecho, { token = tokenDeSesion, fetcher = fetch } = {}) {
  const cocinado = { ...filaDeCocinado(fila), hecho };
  let r;
  try {
    r = await enviarAlServidor({ token, url: urlOperacion(), fetchFn: fetcher })({ casa, cocinado });
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    return { ok: false, fallo: FALLO_DATO.SIN_RED };
  }
  const fallo = falloDeEnvio(r);
  if (fallo || r.cuerpo?.hecho !== hecho) {
    console.error("[cocinados] sin apuntar", r.status, r.cuerpo?.fallo ?? null);
    return { ok: false, fallo: fallo ?? FALLO_DATO.SERVIDOR };
  }
  return { ok: true };
}
