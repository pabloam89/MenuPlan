import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Telegram de mentira: se apunta cada llamada.
const llamadas = [];
beforeEach(() => {
  llamadas.length = 0;
  process.env.TELEGRAM_BOT_TOKEN = "prueba";
  vi.stubGlobal("fetch", async (url, opts) => {
    const metodo = String(url).split("/").pop();
    llamadas.push({ metodo, cuerpo: JSON.parse(opts?.body ?? "{}") });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }));
  });
});
afterEach(() => vi.unstubAllGlobals());

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// Se importa fuera de las pruebas: arrastra el motor entero y, con la batería
// completa corriendo en paralelo, la importación sola se comía los 5 s de
// plazo de la prueba.
process.env.TELEGRAM_BOT_TOKEN = "prueba";
const { mensajeVivo } = await import("./telegram.js");

describe("mensajeVivo: el mensaje que se va escribiendo", () => {
  it("sale en cuanto hay una frase, sin formato ni [[botones]] a medias, y se reescribe sin saturar", async () => {
    const vivo = mensajeVivo("123", {});
    vivo.escribir("Hola");                                        // demasiado corto: nada
    await dormir(50);
    expect(llamadas.filter((l) => l.metodo === "sendMessage")).toHaveLength(0);
    vivo.escribir("Te propongo tres cenas <b>ligeras</b> para el jueves");
    await dormir(50);
    const envios = llamadas.filter((l) => l.metodo === "sendMessage");
    expect(envios).toHaveLength(1);
    expect(envios[0].cuerpo.parse_mode).toBeUndefined();
    expect(envios[0].cuerpo.text).not.toMatch(/<b>/);
    for (let i = 0; i < 10; i++) vivo.escribir(`Te propongo tres cenas ligeras para el jueves, opción ${i} [[Crema de cal`);
    await dormir(1500);
    await vivo.parar();
    const ediciones = llamadas.filter((l) => l.metodo === "editMessageText");
    expect(ediciones.length).toBeGreaterThanOrEqual(1);
    expect(ediciones.length).toBeLessThanOrEqual(2);               // diez trozos, una o dos ediciones
    expect(ediciones.at(-1).cuerpo.text).not.toContain("[[");
    expect(vivo.id()).toBe(77);
  });
  it("un aviso de espera lo sustituye lo que escribe Lola, en el mismo mensaje", async () => {
    const vivo = mensajeVivo("123", {});
    vivo.escribir("Voy, te preparo el menú, dame unos segundos", { aviso: true });
    await dormir(50);
    expect(vivo.provisional()).toBe(true);
    vivo.escribir("¡Menú listo! Te he puesto el salmón el jueves");
    await dormir(1300);
    await vivo.parar();
    expect(llamadas.map((l) => l.metodo)).toEqual(["sendMessage", "editMessageText"]);
    expect(llamadas[1].cuerpo.text).toMatch(/^¡Menú listo!/);
    expect(vivo.provisional()).toBe(false);
  });
  it("si tras el aviso llegan fotos, el aviso se borra y el álbum sale antes del texto", async () => {
    const vivo = mensajeVivo("123", {});
    vivo.escribir("Un momento, que te busco unas recetas", { aviso: true });
    await dormir(50);
    const fotos = [{ url: "https://x/1.jpg", pie: "1. Crema" }, { url: "https://x/2.jpg", pie: "2. Sopa" }];
    vivo.escribir("Mira, tres ideas de cuchara para la cena", { fotos });
    await dormir(1300);
    await vivo.parar();
    expect(llamadas.map((l) => l.metodo)).toEqual(["sendMessage", "deleteMessage", "sendMediaGroup", "sendMessage"]);
    expect(llamadas[3].cuerpo.text).toMatch(/^Mira, tres ideas/);
  });
  it("tras parar, no escribe más", async () => {
    const vivo = mensajeVivo("123", {});
    await vivo.parar();
    vivo.escribir("Esto ya no debería salir porque el turno ha terminado del todo");
    await dormir(50);
    expect(llamadas).toHaveLength(0);
  });
});
