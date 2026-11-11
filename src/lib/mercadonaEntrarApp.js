/**
 * Entrar en Mercadona desde la app (trozo 8 de specs/plan-comprar-mercadona.md; skill `mercadona`). Abre la página de
 * entrada de Mercadona dentro de HoMenu; la persona escribe su correo y su contraseña en esa página, y la app no lee
 * esas casillas. Cuando hay sesión, la app la lee (lo mismo que el marcador: `MO-user` y las cookies), cierra la
 * ventana, la sella con la clave pública del trabajador y la guarda. La contraseña no pasa nunca por aquí.
 *
 * La página se pide en versión de ordenador (decisión de Pablo, 8 nov 2026): en un móvil, la web de Mercadona manda a
 * descargar su app y no deja entrar. Solo para esta página, y sin esquivar nada más.
 */
import { InAppBrowser, ToolBarType } from "@capgo/capacitor-inappbrowser";
import { CLAVE_SESION_TIENDA, estadoDeMarcador, ORIGEN_TIENDA } from "./mercadonaConectar.js";
import { sellar } from "./mercadonaSello.js";
import { guardarSesion, leerEstado } from "./mercadonaApp.js";
import { NO_ENTRADO_MERCADONA as NO_ENTRADO } from "./vocabularios.js";

export const UA_ORDENADOR =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
/** Cuánto se espera a que la persona entre, y cada cuánto se mira si ya hay sesión. */
export const ESPERA_ENTRAR_MS = 5 * 60 * 1000;
export const CADA_MS = 2000;
/** Cuánto se espera a que la página cargue; hasta entonces la ventana no se ve (`isPresentAfterPageLoad`). */
export const ESPERA_CARGA_MS = 30 * 1000;

/**
 * Ancho, en píxeles CSS, al que se dibuja la página de ordenador. Solo con el disfraz, Mercadona servía su página
 * de ordenador metida en el ancho de un iPhone (~390 px): no cabía y una imagen se montaba encima de todo. Con este
 * ancho el iPhone la dibuja como un ordenador y la reduce para que quepa, como Safari con «Ver versión de ordenador».
 */
export const ANCHO_ORDENADOR = 1280;

// Corre en la página de Mercadona antes que su propio código: deja la etiqueta viewport en ANCHO_ORDENADOR, y la
// vuelve a dejar si la página la cambia o la crea después. No toca nada más.
export const FIJAR_ANCHO = `(() => {
  const ancho = "width=${ANCHO_ORDENADOR}";
  const fijar = () => {
    const metas = document.querySelectorAll('meta[name="viewport"]');
    if (!metas.length && document.head) {
      const m = document.createElement("meta");
      m.name = "viewport";
      m.content = ancho;
      document.head.appendChild(m);
      return;
    }
    metas.forEach((m) => { if (m.content !== ancho) m.content = ancho; });
  };
  new MutationObserver(fijar).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
  fijar();
})()`;

// Corre dentro de la página de Mercadona: si ya hay sesión, se la pasa a la app por el puente del complemento.
export const MIRAR_SESION = `(() => {
  const mo = localStorage.getItem(${JSON.stringify(CLAVE_SESION_TIENDA)});
  if (!mo) return;
  let s = null;
  try { s = JSON.parse(mo); } catch (e) { return; }
  if (s && s.token && s.uuid) window.mobileApp.postMessage({ detail: { mo } });
})()`;

/** Cómo se abre siempre la página de Mercadona en la app: la versión de ordenador, a su ancho. */
export const PAGINA_ORDENADOR = {
  title: "Mercadona",
  toolbarType: ToolBarType.COMPACT,
  customUserAgent: UA_ORDENADOR,
  // El disfraz cambia lo que pide el navegador, no el ancho al que dibuja: esto le da también el ancho.
  // El complemento solo acepta un script con `isPresentAfterPageLoad`: la ventana sale al acabar de cargar.
  preferredContentMode: "desktop",
  preShowScript: FIJAR_ANCHO,
  preShowScriptInjectionTime: "documentStart",
  isPresentAfterPageLoad: true,
};

/** Si hay una página de la tienda abierta (o abriéndose) con abrirEnMercadona. */
let abriendo = false;

/**
 * Abre una página de la tienda (la lista que ha hecho Lola) dentro de HoMenu, en la misma ventana en la que se entró:
 * el complemento guarda sus cookies entre aperturas (`persistWebViewData`, por defecto), así que la sesión sigue. Así
 * no hace falta la app de Mercadona ni pasar por Safari, donde no hay sesión. Si la página no carga en
 * ESPERA_CARGA_MS, se cierra (sin ventana no hay X). Fuera de la tienda no abre nada.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function abrirEnMercadona(url, { navegador = InAppBrowser, reloj = globalThis } = {}) {
  let destino = null;
  try {
    destino = new URL(url);
  } catch {
    return { ok: false };
  }
  if (destino.origin !== ORIGEN_TIENDA) return { ok: false };
  // Mientras carga no se ve nada: una segunda pulsación abriría otra ventana encima, y el cierre de una soltaría los
  // oyentes de las dos. Una sola a la vez.
  if (abriendo) return { ok: false };
  abriendo = true;
  const asas = [];
  let carga = null;
  const soltar = async () => {
    reloj.clearTimeout(carga);
    for (const asa of asas.splice(0)) await asa.remove();
    abriendo = false;
  };
  try {
    asas.push(await navegador.addListener("browserPageLoaded", () => reloj.clearTimeout(carga)));
    asas.push(await navegador.addListener("closeEvent", soltar));
    await navegador.openWebView({ ...PAGINA_ORDENADOR, url: destino.href });
    carga = reloj.setTimeout(async () => {
      await soltar();
      await navegador.close().catch((e) => console.error("[mercadona] no se ha podido cerrar la ventana:", String(e?.message ?? e)));
    }, ESPERA_CARGA_MS);
    return { ok: true };
  } catch (e) {
    console.error("[mercadona] no se ha podido abrir la lista:", String(e?.message ?? e));
    await soltar();
    return { ok: false };
  }
}

/** Las cookies como las da `document.cookie`, que es lo que entiende `estadoDeMarcador`. */
export const textoDeCookies = (cookies) =>
  Object.entries(cookies ?? {}).map(([nombre, valor]) => `${nombre}=${valor}`).join("; ");

/**
 * Abre Mercadona, espera a que la persona entre y guarda la sesión sellada de la casa.
 * @returns {Promise<{ ok: true } | { ok: false, motivo: string }>}
 */
export async function entrarEnMercadona(casa, { navegador = InAppBrowser, estado = leerEstado, guardar = guardarSesion, sellarCon = sellar, reloj = globalThis } = {}) {
  const r = await estado(casa);
  const clave = r?.ok ? r.clave_publica : null;
  if (!clave) return { ok: false, motivo: NO_ENTRADO.SIN_CLAVE };

  return new Promise((resolver) => {
    const asas = [];
    let mirar = null;
    let tope = null;
    let carga = null;
    let acabado = false;

    const acabar = async (resultado, { cerrar = true } = {}) => {
      if (acabado) return;
      acabado = true;
      reloj.clearInterval(mirar);
      reloj.clearTimeout(tope);
      reloj.clearTimeout(carga);
      for (const asa of asas) await asa.remove();
      if (cerrar) {
        try {
          await navegador.close();
        } catch (e) {
          // Cerrar una ventana que ya no está no cambia el resultado: se dice y se sigue.
          console.error("[mercadona] no se ha podido cerrar la ventana:", String(e?.message ?? e));
        }
      }
      resolver(resultado);
    };

    const conSesion = async ({ detail }) => {
      if (acabado || !detail?.mo) return;
      reloj.clearInterval(mirar);
      try {
        const cookies = await navegador.getCookies({ url: ORIGEN_TIENDA, includeHttpOnly: true });
        const sellada = await sellarCon(estadoDeMarcador({ mo: detail.mo, cookies: textoDeCookies(cookies) }), clave);
        const g = await guardar(casa, sellada);
        await acabar(g?.ok ? { ok: true } : { ok: false, motivo: NO_ENTRADO.NO_GUARDADA });
      } catch (e) {
        console.error("[mercadona] no se ha podido guardar la sesión:", String(e?.message ?? e));
        await acabar({ ok: false, motivo: NO_ENTRADO.NO_GUARDADA });
      }
    };

    (async () => {
      asas.push(await navegador.addListener("messageFromWebview", conSesion));
      asas.push(await navegador.addListener("closeEvent", () => acabar({ ok: false, motivo: NO_ENTRADO.CERRADA }, { cerrar: false })));
      asas.push(await navegador.addListener("browserPageLoaded", () => reloj.clearTimeout(carga)));
      await navegador.openWebView({
        ...PAGINA_ORDENADOR,
        url: ORIGEN_TIENDA,
        // El puente de la app, solo para la página de Mercadona.
        javascriptBridgeOrigins: [new URL(ORIGEN_TIENDA).origin],
      });
      mirar = reloj.setInterval(() => {
        navegador.executeScript({ code: MIRAR_SESION }).catch((e) => {
          // La página puede estar cargando: se vuelve a mirar en la siguiente vuelta.
          console.error("[mercadona] no se ha podido mirar la sesión:", String(e?.message ?? e));
        });
      }, CADA_MS);
      tope = reloj.setTimeout(() => acabar({ ok: false, motivo: NO_ENTRADO.TIEMPO }), ESPERA_ENTRAR_MS);
      // La ventana no se enseña hasta que la página carga, y sin ventana no hay X para cancelar: si no carga (sin
      // red, Mercadona caído), se deja de esperar pronto. `pageLoadError` no sirve: salta también en cada apertura.
      carga = reloj.setTimeout(() => acabar({ ok: false, motivo: NO_ENTRADO.TIEMPO }), ESPERA_CARGA_MS);
    })().catch(async (e) => {
      console.error("[mercadona] no se ha podido abrir Mercadona:", String(e?.message ?? e));
      await acabar({ ok: false, motivo: NO_ENTRADO.CERRADA });
    });
  });
}
