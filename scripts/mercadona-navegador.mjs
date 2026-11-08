/**
 * Prototipo: un navegador real rellena una lista en TU cuenta de Mercadona.
 * Solo lista: no toca el carrito ni el pago, y no tiene ningún paso que pague.
 * Sin disfraces: si Mercadona lo bloquea, se para y lo cuenta.
 *
 *   node scripts/mercadona-navegador.mjs --entrar   abre Chrome; entras tú a mano, una vez
 *   node scripts/mercadona-navegador.mjs            ensayo: comprueba la sesión, no escribe
 *   node scripts/mercadona-navegador.mjs --si       crea la lista y comprueba qué entró
 *   node scripts/mercadona-navegador.mjs --grabar   abre Chrome con tu sesión y graba, sin datos tuyos, las llamadas
 *                                                   a su /api/ mientras TÚ haces carro → Tramitar → dirección →
 *                                                   días de entrega; para antes de pagar y cierra la ventana
 *                                                   (trozo 13 de #1407). El script no pulsa nada.
 *
 *   --lista fichero.json   { name, products: [{ merca_code, quantity }] }; sin ella, 3 de prueba
 *   --sin-ventana          sin ventana, como iría en un servidor
 *   --exportar fichero     guarda la sesión en un fichero (contiene el token: no se abre ni se sube al repo)
 *   --estado fichero       usa esa sesión en un Chromium suelto: la prueba desde un servidor, en una caja desechable
 *   --salida fichero       con --grabar, dónde se guarda (por defecto, junto al perfil, fuera del repo)
 *
 * La sesión vive en MERCADONA_PERFIL (por defecto ~/.menuplan/mercadona-perfil),
 * fuera del repo. El token no se imprime nunca.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { erroresDeLista } from "../src/lib/mercadonaLista.js";
import { abrirPortada, crearLista, enPagina, entrarEnTienda, TIENDA } from "./lib/mercadonaPagina.mjs";
import { esApi, llamadaLimpia } from "./lib/mercadonaGrabacion.mjs";

const ESPERA_LOGIN_MS = 5 * 60 * 1000;
const args = process.argv.slice(2);
const opcion = (n) => args.includes(n);
const valor = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const perfil = process.env.MERCADONA_PERFIL ?? path.join(os.homedir(), ".menuplan", "mercadona-perfil");

function listaDePrueba() {
  const { products } = JSON.parse(fs.readFileSync("public/store/mercadona.json", "utf8"));
  const baratos = products.filter((p) => Number(p.price) > 0 && Number(p.price) < 3).slice(0, 3);
  return { name: "Prueba Lola", products: baratos.map((p) => ({ merca_code: p.id, quantity: 1 })) };
}

/**
 * Graba hasta que se cierra la ventana: solo las llamadas a su /api/, ya limpias
 * (mercadonaGrabacion.mjs). El script no pulsa nada: lo hace la persona. Antes de
 * guardar espera a las respuestas que se estaban leyendo; la que no se pudo leer
 * va con su motivo (`sinRespuesta`) y se cuenta en pantalla.
 */
async function grabar(contexto, pagina) {
  const llamadas = [];
  const leyendo = [];
  contexto.on("response", (respuesta) => {
    const peticion = respuesta.request();
    if (!esApi(peticion.url())) return;
    const base = { metodo: peticion.method(), url: peticion.url(), status: respuesta.status(), pide: peticion.postData() };
    leyendo.push(
      respuesta.text().then(
        (responde) => llamadaLimpia({ ...base, responde }),
        (e) => llamadaLimpia({ ...base, fallo: e.message }),
      ).then((l) => {
        llamadas.push(l);
        console.log(`  ${l.metodo} ${l.ruta} → ${l.status}${l.sinRespuesta ? ` (sin respuesta: ${l.sinRespuesta})` : ""}`);
      }),
    );
  });
  const portada = await abrirPortada(pagina);
  console.log(`portada: HTTP ${portada.status}`);
  if (portada.resultado) return { resultado: portada.resultado, llamadas };
  console.log("Grabando. En la ventana: carro → Ver carro → Tramitar pedido → dirección → Días de entrega.");
  console.log("Para ANTES de pagar y cierra la ventana de Chrome para terminar.");
  await new Promise((fin) => contexto.on("close", fin));
  await Promise.all(leyendo);
  const sinLeer = llamadas.filter((l) => l.sinRespuesta).length;
  if (sinLeer) console.log(`${sinLeer} llamadas sin respuesta leída: van en el fichero con su motivo`);
  return { resultado: "grabacion_guardada", llamadas };
}

async function main() {
  const entrar = opcion("--entrar");
  const lista = valor("--lista") ? JSON.parse(fs.readFileSync(valor("--lista"), "utf8")) : listaDePrueba();
  const errores = erroresDeLista(lista);
  if (errores.length) throw new Error(`lista no válida: ${errores.join("; ")}`);

  const estado = valor("--estado");
  let navegador = null;
  let contexto;
  if (estado) {
    navegador = await chromium.launch({ headless: true, chromiumSandbox: false });
    contexto = await navegador.newContext({ storageState: estado });
  } else {
    fs.mkdirSync(perfil, { recursive: true });
    contexto = await chromium.launchPersistentContext(perfil, {
      channel: "chrome",
      chromiumSandbox: true,
      headless: (opcion("--sin-ventana") || Boolean(valor("--exportar"))) && !entrar && !opcion("--grabar"),
      viewport: null,
    });
  }
  try {
    const pagina = contexto.pages()[0] ?? (await contexto.newPage());
    if (opcion("--grabar")) {
      const salida = valor("--salida") ?? path.join(path.dirname(perfil), `mercadona-grabacion-${Date.now()}.json`);
      const { resultado, llamadas } = await grabar(contexto, pagina);
      fs.writeFileSync(salida, JSON.stringify(llamadas, null, 2));
      console.log(`${llamadas.length} llamadas en ${salida}`);
      console.log(`resultado: ${resultado}`);
      return;
    }
    if (entrar) {
      const portada = await abrirPortada(pagina);
      console.log(`portada: HTTP ${portada.status}`);
      if (portada.resultado) {
        console.log(`resultado: ${portada.resultado}`);
        return;
      }
      console.log("Entra con tu cuenta en la ventana de Chrome. Espero hasta 5 minutos.");
      await pagina.waitForFunction(enPagina, null, { timeout: ESPERA_LOGIN_MS, polling: 2000 });
      console.log("resultado: sesion_guardada");
      return;
    }

    const portada = await entrarEnTienda(pagina);
    console.log(`portada: HTTP ${portada.status}`);
    if (portada.resultado) {
      console.log(`resultado: ${portada.resultado}${portada.resultado === "sin_sesion" ? " (lanza primero --entrar)" : ""}`);
      return;
    }
    if (valor("--exportar")) {
      await contexto.storageState({ path: valor("--exportar") });
      fs.chmodSync(valor("--exportar"), 0o600);
      console.log("resultado: sesion_exportada");
      return;
    }
    console.log(`sesión: sí · lista «${lista.name}»: ${lista.products.length} productos`);
    if (!opcion("--si")) {
      console.log("resultado: ensayo_ok (no se ha escrito nada; repite con --si)");
      return;
    }

    const r = await crearLista(pagina, lista);
    if (r.id) console.log(`lista creada: ${TIENDA}shopping-lists/${r.id}`);
    if (r.entraron !== undefined) console.log(`entraron ${r.entraron} de ${lista.products.length} productos (las cantidades no se releen)`);
    for (const c of r.faltan ?? []) console.log(`  falta: ${c}`);
    console.log(`resultado: ${r.resultado}${r.status === undefined ? "" : ` (HTTP ${r.status})`}`);
  } finally {
    await contexto.close();
    await navegador?.close();
  }
}

main().catch((e) => {
  console.error(`resultado: error (${e.message})`);
  process.exitCode = 1;
});
