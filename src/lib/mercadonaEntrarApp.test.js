// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@capgo/capacitor-inappbrowser", () => ({ InAppBrowser: {}, ToolBarType: { COMPACT: "compact" } }));
const { ANCHO_ORDENADOR, PAGINA_ORDENADOR, abrirEnMercadona, CADA_MS, ESPERA_CARGA_MS, ESPERA_ENTRAR_MS, FIJAR_ANCHO, MIRAR_SESION, UA_ORDENADOR, entrarEnMercadona, textoDeCookies } = await import("./mercadonaEntrarApp.js");
const { NO_ENTRADO_MERCADONA: NO_ENTRADO } = await import("./vocabularios.js");
const { ORIGEN_TIENDA } = await import("./mercadonaConectar.js");

const MO = JSON.stringify({ token: "t", uuid: "u" });

/** Un navegador del complemento, de mentira: guarda lo que se le pide y deja lanzar sus eventos. */
function navegadorFalso({ cookies = { a: "1", sesion: "2" }, abrir = async () => ({ id: "w" }) } = {}) {
  const oyentes = {};
  return {
    oyentes,
    abierto: null,
    scripts: 0,
    cerrado: 0,
    async addListener(evento, f) {
      oyentes[evento] = f;
      return { remove: async () => { delete oyentes[evento]; } };
    },
    async openWebView(o) { this.abierto = o; return abrir(o); },
    async executeScript() { this.scripts += 1; },
    getCookies: vi.fn(async () => cookies),
    async close() { this.cerrado += 1; },
  };
}

/** Un reloj a mano: los temporizadores solo corren cuando el test lo dice. */
function relojFalso() {
  let siguiente = 1;
  const intervalos = new Map();
  const tiempos = new Map();
  return {
    setInterval: (f) => { intervalos.set(siguiente, f); return siguiente++; },
    clearInterval: (id) => intervalos.delete(id),
    setTimeout: (f, ms) => { tiempos.set(siguiente, { f, ms }); return siguiente++; },
    clearTimeout: (id) => tiempos.delete(id),
    vuelta: () => [...intervalos.values()].forEach((f) => f()),
    agotar: () => [...tiempos.values()].forEach(({ f }) => f()),
    /** Los temporizadores que siguen en marcha, por su espera. */
    pendientes: () => [...tiempos.values()].map(({ ms }) => ms).sort((a, b) => a - b),
    agotarEl: (ms) => [...tiempos.values()].filter((t) => t.ms === ms).forEach(({ f }) => f()),
  };
}

const ESTADO = async () => ({ ok: true, clave_publica: "clave" });
const esperar = () => new Promise((r) => setTimeout(r, 0));

async function empezar(opciones = {}) {
  const navegador = opciones.navegador ?? navegadorFalso();
  const reloj = relojFalso();
  const guardar = opciones.guardar ?? vi.fn(async () => ({ ok: true }));
  const sellarCon = vi.fn(async (texto) => `sellado:${texto.length}`);
  const promesa = entrarEnMercadona("casa-1", { navegador, reloj, guardar, sellarCon, estado: opciones.estado ?? ESTADO });
  await esperar();
  return { navegador, reloj, guardar, sellarCon, promesa };
}

describe("entrar en Mercadona desde la app (trozo 8)", () => {
  it("abre la página de Mercadona en versión de ordenador, con el puente solo para Mercadona", async () => {
    const { navegador } = await empezar();
    expect(navegador.abierto.url).toBe(ORIGEN_TIENDA);
    expect(navegador.abierto.customUserAgent).toBe(UA_ORDENADOR);
    expect(navegador.abierto.javascriptBridgeOrigins).toEqual(["https://tienda.mercadona.es"]);
  });

  it("dibuja la página de ordenador a su ancho, y no en el de un móvil", async () => {
    const { navegador } = await empezar();
    expect(navegador.abierto.preferredContentMode).toBe("desktop");
    expect(navegador.abierto.preShowScript).toBe(FIJAR_ANCHO);
    expect(navegador.abierto.preShowScriptInjectionTime).toBe("documentStart");
    // Sin esto el complemento rechaza el script y no abre la ventana.
    expect(navegador.abierto.isPresentAfterPageLoad).toBe(true);
  });

  it("el script del ancho pone la etiqueta viewport y la vuelve a poner si la página la cambia", async () => {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    new Function(FIJAR_ANCHO)();
    const meta = document.querySelector('meta[name="viewport"]');
    expect(meta.content).toBe(`width=${ANCHO_ORDENADOR}`);
    meta.content = "width=device-width";
    await esperar();
    expect(meta.content).toBe(`width=${ANCHO_ORDENADOR}`);
    expect(FIJAR_ANCHO).not.toMatch(/input|password|localStorage|cookie/i);
  });

  it("el script del ancho, como corre de verdad: antes de que la página ponga su viewport", async () => {
    // En documentStart todavía no hay <head>: lo pone luego la página, con su viewport de móvil.
    document.head.remove();
    new Function(FIJAR_ANCHO)();
    const head = document.createElement("head");
    head.innerHTML = '<meta name="viewport" content="width=device-width">';
    document.documentElement.prepend(head);
    await esperar();
    const metas = [...document.querySelectorAll('meta[name="viewport"]')];
    expect(metas).toHaveLength(1);
    expect(metas.every((m) => m.content === `width=${ANCHO_ORDENADOR}`)).toBe(true);
  });

  it("el script del ancho pone la etiqueta viewport si la página no trae ninguna", async () => {
    document.head.remove();
    new Function(FIJAR_ANCHO)();
    const head = document.createElement("head");
    head.innerHTML = "<title>Mercadona</title>";
    document.documentElement.prepend(head);
    await esperar();
    const metas = document.querySelectorAll('meta[name="viewport"]');
    expect(metas).toHaveLength(1);
    expect(metas[0].content).toBe(`width=${ANCHO_ORDENADOR}`);
  });

  it("si la página no carga, no deja esperando 5 minutos sin ventana", async () => {
    const { navegador, reloj, promesa } = await empezar();
    expect(reloj.pendientes()).toEqual([ESPERA_CARGA_MS, ESPERA_ENTRAR_MS]);
    reloj.agotarEl(ESPERA_CARGA_MS);
    await expect(promesa).resolves.toEqual({ ok: false, motivo: NO_ENTRADO.TIEMPO });
    expect(navegador.cerrado).toBe(1);
    expect(ESPERA_CARGA_MS).toBeLessThan(ESPERA_ENTRAR_MS);
  });

  it("cuando la página carga, deja de vigilar la carga y sigue el tope de 5 minutos", async () => {
    const { navegador, reloj } = await empezar();
    navegador.oyentes.browserPageLoaded({});
    expect(reloj.pendientes()).toEqual([ESPERA_ENTRAR_MS]);
  });

  it("mira la sesión en cada vuelta, y el script solo lee MO-user, no las casillas", async () => {
    const { navegador, reloj } = await empezar();
    reloj.vuelta();
    reloj.vuelta();
    expect(navegador.scripts).toBe(2);
    expect(MIRAR_SESION).toContain('localStorage.getItem("MO-user")');
    expect(MIRAR_SESION).not.toMatch(/input|password|querySelector/i);
  });

  it("con sesión: lee las cookies (también httpOnly), sella, guarda la casa y cierra", async () => {
    const { navegador, guardar, sellarCon, promesa } = await empezar();
    await navegador.oyentes.messageFromWebview({ detail: { mo: MO } });
    await expect(promesa).resolves.toEqual({ ok: true });
    expect(navegador.getCookies).toHaveBeenCalledWith({ url: ORIGEN_TIENDA, includeHttpOnly: true });
    const estadoSellado = JSON.parse(sellarCon.mock.calls[0][0]);
    expect(estadoSellado.origins[0].localStorage).toEqual([{ name: "MO-user", value: MO }]);
    expect(estadoSellado.cookies.map((c) => c.name)).toEqual(["a", "sesion"]);
    expect(sellarCon.mock.calls[0][1]).toBe("clave");
    expect(guardar).toHaveBeenCalledWith("casa-1", expect.stringMatching(/^sellado:/));
    expect(navegador.cerrado).toBe(1);
  });

  it("si no se puede guardar, lo dice y cierra", async () => {
    const { navegador, promesa } = await empezar({ guardar: vi.fn(async () => ({ ok: false })) });
    await navegador.oyentes.messageFromWebview({ detail: { mo: MO } });
    await expect(promesa).resolves.toEqual({ ok: false, motivo: NO_ENTRADO.NO_GUARDADA });
    expect(navegador.cerrado).toBe(1);
  });

  it("si la persona cierra la ventana, no guarda nada", async () => {
    const { navegador, guardar, promesa } = await empezar();
    await navegador.oyentes.closeEvent({ url: ORIGEN_TIENDA });
    await expect(promesa).resolves.toEqual({ ok: false, motivo: NO_ENTRADO.CERRADA });
    expect(guardar).not.toHaveBeenCalled();
    expect(navegador.cerrado).toBe(0);
  });

  it("pasado el tope, cierra y lo dice", async () => {
    const { navegador, reloj, promesa } = await empezar();
    reloj.agotar();
    await expect(promesa).resolves.toEqual({ ok: false, motivo: NO_ENTRADO.TIEMPO });
    expect(navegador.cerrado).toBe(1);
    expect(ESPERA_ENTRAR_MS).toBeGreaterThan(CADA_MS);
  });

  it("sin la clave pública del servicio no abre nada", async () => {
    const navegador = navegadorFalso();
    const r = await entrarEnMercadona("casa-1", { navegador, reloj: relojFalso(), estado: async () => ({ ok: true, clave_publica: null }) });
    expect(r).toEqual({ ok: false, motivo: NO_ENTRADO.SIN_CLAVE });
    expect(navegador.abierto).toBeNull();
  });

  it("un mensaje sin sesión no hace nada", async () => {
    const { navegador, guardar } = await empezar();
    await navegador.oyentes.messageFromWebview({ detail: {} });
    expect(guardar).not.toHaveBeenCalled();
    expect(navegador.cerrado).toBe(0);
  });

  it("las cookies salen como las da document.cookie", () => {
    expect(textoDeCookies({ a: "1", b: "x=y" })).toBe("a=1; b=x=y");
    expect(textoDeCookies(null)).toBe("");
  });
});

describe("abrir la lista de Lola en la app", () => {
  const LISTA = "https://tienda.mercadona.es/shopping-lists/7";

  it("la abre dentro de HoMenu, como la de entrar: versión de ordenador y a su ancho", async () => {
    const navegador = navegadorFalso();
    await expect(abrirEnMercadona(LISTA, { navegador, reloj: relojFalso() })).resolves.toEqual({ ok: true });
    expect(navegador.abierto).toEqual({ ...PAGINA_ORDENADOR, url: LISTA });
    // Sin puente: aquí no se lee nada de la página.
    expect(navegador.abierto.javascriptBridgeOrigins).toBeUndefined();
  });

  it("fuera de la tienda de Mercadona no abre nada", async () => {
    const navegador = navegadorFalso();
    await expect(abrirEnMercadona("https://otra.example/x", { navegador, reloj: relojFalso() })).resolves.toEqual({ ok: false });
    await expect(abrirEnMercadona("no es una dirección", { navegador, reloj: relojFalso() })).resolves.toEqual({ ok: false });
    expect(navegador.abierto).toBeNull();
  });

  it("si la página no carga, la cierra y suelta los oyentes", async () => {
    const navegador = navegadorFalso();
    const reloj = relojFalso();
    await abrirEnMercadona(LISTA, { navegador, reloj });
    expect(reloj.pendientes()).toEqual([ESPERA_CARGA_MS]);
    reloj.agotarEl(ESPERA_CARGA_MS);
    await esperar();
    expect(navegador.cerrado).toBe(1);
    expect(Object.keys(navegador.oyentes)).toEqual([]);
  });

  it("si carga, deja de vigilar; al cerrarla la persona, suelta los oyentes", async () => {
    const navegador = navegadorFalso();
    const reloj = relojFalso();
    await abrirEnMercadona(LISTA, { navegador, reloj });
    navegador.oyentes.browserPageLoaded({});
    expect(reloj.pendientes()).toEqual([]);
    await navegador.oyentes.closeEvent({});
    expect(Object.keys(navegador.oyentes)).toEqual([]);
    expect(navegador.cerrado).toBe(0);
  });

  it("si el complemento falla al abrir, lo dice y no deja oyentes", async () => {
    const navegador = navegadorFalso({ abrir: async () => { throw new Error("sin ventana"); } });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(abrirEnMercadona(LISTA, { navegador, reloj: relojFalso() })).resolves.toEqual({ ok: false });
    expect(Object.keys(navegador.oyentes)).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
