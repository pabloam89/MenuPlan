// Recorrido de punta a punta de la app en modo sin cuenta (trozo 37 de
// specs/plan-fichas-con-estado.md): alta → generar el menú → cambiar un plato
// → ver la compra, comprobando lo que la app enseña en cada paso.
//
// Sin tocar la base: playwright.config.js arranca Vite sin claves y con
// Supabase en un puerto muerto, y aquí se corta y se cuenta cualquier petición
// que se escape a Supabase o a una función de api/ que no sea la analítica.
// Si alguna se escapa, la prueba falla.
import { expect, test } from "@playwright/test";
import { SUPABASE_MUERTO } from "../playwright.config.js";
import { NOMBRES_DIA } from "../src/lib/dias.js";

// Un lunes por la mañana en Madrid: la semana entera por delante, siempre la
// misma, para que el menú no dependa del día en que se corre. El reloj de la
// página arranca ahí y sigue andando (la generación del menú usa
// temporizadores); lo que cuenta es el día, que en los ~20 s de la prueba no
// cambia. Solo se adelanta a mano en la pulsación larga.
const LUNES = new Date("2026-11-02T10:00:00+01:00");
// La familia de mentira: [perfil que se toca, nombre que se escribe].
const FAMILIA = [["Papá", "Juan"], ["Mamá", "Ana"]];
// La única función de api/ que el recorrido llama sin cuenta: la analítica.
// Se le responde con un doble vacío; cualquier otra cuenta como escape.
const API_ANALITICA = "/api/track";
// Lo que se adelanta el reloj de la página con el dedo abajo para que salte
// la pulsación larga (useLongPress en src/screens/Menu.jsx espera 420 ms).
// Con el reloj de Playwright, y no en tiempo real: así no depende de lo
// cargada que vaya la máquina.
const PULSACION_LARGA_MS = 700;
// Una tarjeta de plato en el menú lleva su franja escrita.
const TARJETA_PLATO = /\b(comida|cena)\b/i;
// La cabecera de una categoría de la compra: «Verduras 17».
const CATEGORIA_COMPRA = /^\p{Lu}[\p{L} ]+ \d+$/u;
const TITULO_COMPRA = "Tu compra";
const PIE_COMPRA = "¿Falta algo?";
const AVISO_CAMBIO = /Sustituido por «(.+)»/;

const boton = (page, name) => page.getByRole("button", { name, exact: true });

// Las peticiones que se han escapado en la prueba en curso (workers: 1).
let escapes = [];

test.beforeEach(async ({ page }) => {
  escapes = [];
  await page.clock.install({ time: LUNES });
  await page.route(`${SUPABASE_MUERTO}/**`, (ruta) => {
    escapes.push(`supabase ${ruta.request().method()} ${ruta.request().url()}`);
    return ruta.abort();
  });
  await page.route("**/api/**", (ruta) => {
    const { pathname } = new URL(ruta.request().url());
    if (pathname !== API_ANALITICA) escapes.push(`api ${ruta.request().method()} ${pathname}`);
    return ruta.fulfill({ status: 204, body: "" });
  });
});

test.afterEach(() => {
  expect(escapes, "peticiones que debían quedarse en local").toEqual([]);
});

async function darDeAlta(page) {
  await page.goto("/");
  await boton(page, "Entrar sin cuenta").click();
  await expect(page.getByText("¿Quién come en casa?")).toBeVisible();
  for (const [perfil, nombre] of FAMILIA) {
    await boton(page, perfil).click();
    await page.getByPlaceholder("Nombre").fill(nombre);
    await page.keyboard.press("Enter");
    await expect(boton(page, nombre)).toBeVisible();
  }
  await boton(page, "Continuar").click();
  await expect(page.getByText("¿Qué evitamos?")).toBeVisible();
  for (const [, nombre] of FAMILIA) await expect(boton(page, nombre)).toBeVisible();
  await boton(page, "Nada que evitar").click();
}

// Tras el alta la app genera el menú sola; se espera a que la portada enseñe
// el de hoy y se abre la semana.
async function abrirMenu(page) {
  await expect(page.getByText("Hoy toca")).toBeVisible();
  await expect(page.getByRole("button", { name: TARJETA_PLATO }).first()).toBeVisible();
  await boton(page, "Menú").click();
  await expect(page.getByText("Tu menú")).toBeVisible();
  for (const dia of NOMBRES_DIA) await expect(page.getByText(dia, { exact: true })).toBeVisible();
  const platos = page.getByRole("button", { name: TARJETA_PLATO });
  expect(await platos.count()).toBeGreaterThanOrEqual(NOMBRES_DIA.length);
  return platos;
}

const nombreDePlato = async (tarjeta) => (await tarjeta.innerText()).trim().split("\n").at(-1).trim();

// Pulsación larga en el primer plato → «Cambiar» → «Del mismo tipo».
// Devuelve el plato que había y el que lo sustituye.
async function cambiarPrimerPlato(page, platos) {
  const tarjeta = platos.first();
  const antes = await nombreDePlato(tarjeta);
  const caja = await tarjeta.boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.clock.runFor(PULSACION_LARGA_MS);
  await page.mouse.up();
  await boton(page, "Cambiar").click();
  await boton(page, "Del mismo tipo").click();
  const aviso = page.getByRole("status").filter({ hasText: AVISO_CAMBIO });
  await expect(aviso).toBeVisible();
  const despues = AVISO_CAMBIO.exec(await aviso.innerText())[1];
  return { antes, despues };
}

// Abre la compra y devuelve el texto de la lista: lo que va entre el título y
// el pie, sin los avisos que flotan encima.
async function leerCompra(page) {
  await boton(page, "Compra").click();
  await expect(page.getByText(TITULO_COMPRA)).toBeVisible();
  await expect(boton(page, "Por comprar")).toBeVisible();
  const categorias = page.getByRole("button", { name: CATEGORIA_COMPRA });
  await expect(categorias.first()).toBeVisible();
  await expect(page.getByText(PIE_COMPRA)).toBeVisible();
  const texto = await page.locator("body").innerText();
  return texto.slice(texto.indexOf(TITULO_COMPRA), texto.indexOf(PIE_COMPRA));
}

test("alta, menú de la semana, cambiar un plato y ver la compra", async ({ page }) => {
  await darDeAlta(page);
  const platos = await abrirMenu(page);
  const { antes, despues } = await cambiarPrimerPlato(page, platos);
  expect(despues).not.toBe(antes);
  await expect(platos.first()).toContainText(despues);
  await expect(page.getByText(antes, { exact: true })).toHaveCount(0);
  await leerCompra(page);
});

// Fallo conocido de la app (#1063), apuntado para que no se pierda: sin cuenta, la
// compra no sigue al plato cambiado. Enseña la copia archivada de la semana,
// porque `data.menuWeek` queda vacío tras el alta (src/screens/Shopping.jsx
// lee la lista viva solo para la semana activa). Esta prueba fija el fallo tal
// cual: el día que se arregle se pone en rojo, y quien lo arregle cambia
// `toBe` por `not.toBe`. No es `test.fail`, que también daría verde si se
// rompe un selector por el camino.
test("fallo conocido #1063: la compra no sigue al plato cambiado", async ({ page }) => {
  await darDeAlta(page);
  const platos = await abrirMenu(page);
  const compraAntes = await leerCompra(page);
  await boton(page, "Menú").click();
  await cambiarPrimerPlato(page, platos);
  expect(await leerCompra(page)).toBe(compraAntes);
});
