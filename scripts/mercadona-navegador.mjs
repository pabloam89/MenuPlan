/**
 * Prototipo: un navegador real rellena una lista en TU cuenta de Mercadona.
 * Solo lista: no toca el carrito ni el pago, y no tiene ningún paso que pague.
 * Sin disfraces: si Mercadona lo bloquea, se para y lo cuenta.
 *
 *   node scripts/mercadona-navegador.mjs --entrar   abre Chrome; entras tú a mano, una vez
 *   node scripts/mercadona-navegador.mjs            ensayo: comprueba la sesión, no escribe
 *   node scripts/mercadona-navegador.mjs --si       crea la lista y comprueba qué entró
 *
 *   --lista fichero.json   { name, products: [{ merca_code, quantity }] }; sin ella, 3 de prueba
 *   --sin-ventana          sin ventana, como iría en un servidor
 *   --exportar fichero     guarda la sesión en un fichero (contiene el token: no se abre ni se sube al repo)
 *   --estado fichero       usa esa sesión en un Chromium suelto: la prueba desde un servidor, en una caja desechable
 *
 * La sesión vive en MERCADONA_PERFIL (por defecto ~/.menuplan/mercadona-perfil),
 * fuera del repo. El token no se imprime nunca.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { compararLista, erroresDeLista, leerGuardada } from "./lib/mercadonaLista.mjs";

const TIENDA = "https://tienda.mercadona.es/";
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

// Corre dentro de su página, y la sesión no sale nunca de ahí. Sin lista, solo
// dice si hay sesión; con lista, la crea y la relee.
const enPagina = async (lista) => {
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
      headless: (opcion("--sin-ventana") || Boolean(valor("--exportar"))) && !entrar,
      viewport: null,
    });
  }
  try {
    const pagina = contexto.pages()[0] ?? (await contexto.newPage());
    const respuesta = await pagina.goto(TIENDA, { waitUntil: "domcontentloaded", timeout: 60_000 });
    console.log(`portada: HTTP ${respuesta?.status()}`);
    if (respuesta && respuesta.status() >= 400) {
      console.log("resultado: bloqueado_portada");
      return;
    }

    if (entrar) {
      console.log("Entra con tu cuenta en la ventana de Chrome. Espero hasta 5 minutos.");
      await pagina.waitForFunction(enPagina, null, { timeout: ESPERA_LOGIN_MS, polling: 2000 });
      console.log("resultado: sesion_guardada");
      return;
    }

    await pagina.waitForTimeout(3000);
    if (!(await pagina.evaluate(enPagina, null))) {
      console.log("resultado: sin_sesion (lanza primero --entrar)");
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

    const r = await pagina.evaluate(enPagina, lista);
    if (r.paso !== "leer") {
      console.log(`resultado: fallo_${r.paso} (HTTP ${r.status})`);
      return;
    }
    console.log(`lista creada: ${TIENDA}shopping-lists/${r.id}`);
    if (!r.guardada) {
      console.log(`resultado: lista_sin_releer (HTTP ${r.status})`);
      return;
    }
    const { entraron, faltan } = compararLista(lista.products, leerGuardada(r.guardada));
    console.log(`entraron ${entraron} de ${lista.products.length} productos (las cantidades no se releen)`);
    for (const c of faltan) console.log(`  falta: ${c}`);
    console.log(faltan.length ? "resultado: faltan_productos" : "resultado: productos_completos");
  } finally {
    await contexto.close();
    await navegador?.close();
  }
}

main().catch((e) => {
  console.error(`resultado: error (${e.message})`);
  process.exitCode = 1;
});
