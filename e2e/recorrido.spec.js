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
// La app sortea con Math.random al generar el menú (src/lib/aiPlanner.js).
// En la página se cambia por un generador con semilla (mulberry32), que la
// prueba vuelve a poner en la semilla justo antes de generar
// (`reiniciarAzar`). El cambio de plato no sortea: va por «Elegir a mano» y
// la primera sugerencia del hueco, que sale en el orden del catálogo.
const SEMILLA_AZAR = 37;
// La familia de mentira: [perfil que se toca, nombre que se escribe].
const FAMILIA = [["Papá", "Juan"], ["Mamá", "Ana"]];
// La única función de api/ que el recorrido llama sin cuenta: la analítica.
// Se le responde con un doble vacío; cualquier otra cuenta como escape.
const API_ANALITICA = "/api/track";
// Una tarjeta de plato en el menú lleva su franja escrita.
const TARJETA_PLATO = /\b(comida|cena)\b/i;
// La cabecera de una categoría de la compra: «Verduras 17».
const CATEGORIA_COMPRA = /^\p{Lu}[\p{L} ]+ \d+$/u;
// La entrada a la pizarra en la portada (src/screens/Dashboard.jsx); solo
// sale con la pizarra encendida.
const ENTRADA_PIZARRA = "Empieza en blanco";
const TITULO_COMPRA = "Tu compra";
// El botón de comprar lleva el total de lo que queda por comprar.
const ANCHOS_MOVIL = [360, 375, 420];
const BOTON_COMPRAR = /^Comprar · .*€$/;
// La tira de sugerencias del selector de platos (src/screens/CatalogBrowserSheet.jsx).
const SUGERENCIAS_HUECO = "Para este hueco";
const AVISO_COLOCADO = /Colocado «(.+)»/;

const boton = (page, name) => page.getByRole("button", { name, exact: true });
const reiniciarAzar = (page) => page.evaluate(() => window.__reiniciarAzar());

// Las peticiones que se han escapado en la prueba en curso (workers: 1).
let escapes = [];

test.beforeEach(async ({ page }) => {
  escapes = [];
  await page.clock.install({ time: LUNES });
  await page.addInitScript((semilla) => {
    let estado = semilla >>> 0;
    window.__reiniciarAzar = () => { estado = semilla >>> 0; };
    Math.random = () => {
      estado = (estado + 0x6d2b79f5) >>> 0;
      let t = estado;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, SEMILLA_AZAR);
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
  await reiniciarAzar(page);
  await boton(page, "Nada que evitar").click();
}

// Tras el alta la app ya no genera el menú: eso es de Lola (#1210). La
// portada no trae platos; se empieza en blanco (la entrada a la pizarra dice
// que las banderas salieron como en staging, playwright.config.js) y
// «Rellenar» pone platos del recetario en todos los huecos, sin el motor.
async function abrirMenu(page) {
  await expect(page.getByText(ENTRADA_PIZARRA)).toBeVisible();
  await expect(page.getByRole("button", { name: TARJETA_PLATO })).toHaveCount(0);
  await page.getByText(ENTRADA_PIZARRA).click();
  // La pizarra pregunta antes qué días pone: se deja lo que trae (esta semana).
  const dias = page.getByRole("dialog", { name: "¿Qué días pones?" });
  await expect(dias).toBeVisible();
  await dias.getByRole("button", { name: "Siguiente" }).click();
  // «¿Qué no puede faltar?»: el buscador encuentra un clásico de cualquier
  // pestaña y dice cuándo no hay ninguno. Sin clásicos elegidos, el botón
  // dice «Omitir».
  const buscador = dias.getByLabel("Buscar un clásico");
  await buscador.fill("lentejas");
  await expect(dias.getByRole("button", { name: /lentejas/i })).toHaveCount(2);
  await buscador.fill("xyz");
  await expect(dias.getByText("Ningún clásico se llama así.")).toBeVisible();
  await dias.getByRole("button", { name: "Limpiar búsqueda" }).click();
  await dias.getByRole("button", { name: "Omitir" }).click();
  await dias.getByRole("button", { name: "Empezar" }).click();
  await expect(dias).toBeHidden();
  // La baldosa lleva delante cuántos huecos quedan («14 Rellenar»).
  await page.getByRole("button", { name: /^\d+ Rellenar$/ }).click();
  await expect(page.getByRole("button", { name: TARJETA_PLATO }).first()).toBeVisible();
  for (const dia of NOMBRES_DIA) await expect(page.getByText(dia, { exact: true })).toBeVisible();
  const platos = page.getByRole("button", { name: TARJETA_PLATO });
  expect(await platos.count()).toBeGreaterThanOrEqual(NOMBRES_DIA.length);
  return platos;
}

const nombreDePlato = async (tarjeta) => (await tarjeta.innerText()).trim().split("\n").at(-1).trim();

// Los «…» del primer plato → «Cambiar» → «Elegir a mano» → la primera
// sugerencia del hueco. Devuelve el plato que había y el que lo sustituye.
// Todo menú se maneja con el tablero de la pizarra (src/lib/modoMenu.js), y
// allí la pulsación larga levanta el plato para moverlo: las acciones están
// en sus «…».
async function cambiarPrimerPlato(page, platos) {
  const tarjeta = platos.first();
  const antes = await nombreDePlato(tarjeta);
  await page.getByRole("button", { name: `Acciones de ${antes}`, exact: true }).first().click();
  await boton(page, "Cambiar").click();
  await boton(page, "Elegir a mano").click();
  const tira = page.locator("div", { has: page.getByText(SUGERENCIAS_HUECO, { exact: true }) }).last();
  await tira.getByRole("button").first().click();
  const aviso = page.getByRole("status").filter({ hasText: AVISO_COLOCADO });
  await expect(aviso).toBeVisible();
  const despues = AVISO_COLOCADO.exec(await aviso.innerText())[1];
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
  await expect(page.getByRole("button", { name: BOTON_COMPRAR })).toBeVisible();
  const texto = await page.locator("body").innerText();
  return texto.slice(texto.indexOf(TITULO_COMPRA), texto.lastIndexOf("Comprar"));
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

// Sin cuenta, la compra sigue al plato cambiado: la lista de después no es la
// de antes. Hasta #1068 enseñaba la copia archivada de la semana (#1063).
test("la compra sigue al plato cambiado (#1063)", async ({ page }) => {
  await darDeAlta(page);
  const platos = await abrirMenu(page);
  const compraAntes = await leerCompra(page);
  await boton(page, "Menú").click();
  await cambiarPrimerPlato(page, platos);
  expect(await leerCompra(page)).not.toBe(compraAntes);
});

// El total del botón baja al marcar una línea, y Comprar no vuelve a enseñar la
// lista: la hoja lleva solo el paso siguiente (HojaComprar).
test("el botón de comprar sigue a la lista", async ({ page }) => {
  await darDeAlta(page);
  await abrirMenu(page);
  await leerCompra(page);
  const comprar = page.getByRole("button", { name: BOTON_COMPRAR });
  await expect(comprar).toBeVisible();
  const antes = await comprar.getAttribute("aria-label");
  await page.getByRole("button", { name: CATEGORIA_COMPRA }).first().click();
  await page.getByRole("checkbox", { name: /: comprado$/ }).first().click();
  await expect(comprar).not.toHaveAttribute("aria-label", antes);
  for (const width of ANCHOS_MOVIL) {
    await page.setViewportSize({ width, height: 800 });
    // Las tres pastillas de cada fila, en una línea; nada se sale de la pantalla.
    const descuadradas = await page.$$eval(".fila-compra-pastillas", (filas) =>
      filas.filter((fila) => {
        const centros = [...fila.children].map((c) => c.getBoundingClientRect()).map((r) => r.top + r.height / 2);
        return Math.max(...centros) - Math.min(...centros) > 4;
      }).length);
    expect(descuadradas).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/lista-${width}.png` });
  }
  // Al final de la lista, la barra no tapa la última fila.
  await page.getByRole("checkbox", { name: /: comprado$/ }).last().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 100000);
  const ultima = page.getByRole("checkbox", { name: /: comprado$/ }).last();
  await expect(async () => {
    const fila = await ultima.boundingBox();
    const barra = await comprar.boundingBox();
    expect(fila.y + fila.height).toBeLessThanOrEqual(barra.y);
  }).toPass();
  await comprar.click();
  await expect(page.getByText("Comprar en Mercadona")).toBeVisible();
  await expect(page.locator('a[href*="tienda.mercadona.es/product/"]')).toHaveCount(0);
  if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/hoja-420.png` });
});
