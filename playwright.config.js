// Pruebas de punta a punta de la app (trozo 37 de specs/plan-fichas-con-estado.md).
//
// La app corre en modo sin cuenta, con datos de mentira y SIN tocar la base:
// la única base es producción. Por eso el servidor arranca sin ninguna clave
// real y sin nada del .env.local de quien la corre (ver `sinEnvLocal`), y con
// Supabase en un puerto muerto. La prueba, además, corta y cuenta cualquier
// petición que se escape.
//
// Corre en el CI: `npm test` la lanza al acabar los de vitest (`posttest` en
// package.json, que antes instala Chromium), y el job `tests` llama a
// `npm test`. A mano: `npm run e2e` o `npx playwright test e2e/recorrido.spec.js`.
import { defineConfig, devices } from "@playwright/test";
import { esReferencia, leerFichero } from "./scripts/lib/env.mjs";
import { RAMA_STAGING, banderas } from "./scripts/lib/banderas.mjs";

// Puerto propio y `strictPort`: el 5176 es el de `npm run dev`, y reutilizar
// un servidor de otra sesión traería sus claves y sus banderas.
const PUERTO_E2E = 5188;
const URL_E2E = `http://localhost:${PUERTO_E2E}`;
// Un Supabase que no existe: el cliente se crea, pero nada llega a la base.
export const SUPABASE_MUERTO = "http://127.0.0.1:9";
const SIN_CLAVE = "e2e-sin-clave";
// Las banderas del despliegue de staging, sacadas de la misma regla que usa
// el build (`banderas` en scripts/lib/banderas.mjs) sin leer el entorno: el motor
// `solver`, que asigna los platos sin llamar al modelo, la pizarra encendida
// y las guías apagadas. Van con valor, así que pisan al entorno y al
// .env.local de quien la corre.
const BANDERAS_STAGING = banderas(RAMA_STAGING);

// vite.config.js lee el .env.local siempre, y una dirección op:// la resuelve
// con 1Password: hay que anularlo aquí. Solo se leen los NOMBRES. Una op://
// pasa a una clave que no sirve (vacía, cargarEnv volvería al fichero y la
// resolvería); el resto, a vacío, que en loadEnv pisa al fichero. Sin
// .env.local (el CI) no hay nada que anular.
const sinEnvLocal = Object.fromEntries(
  Object.entries(leerFichero()).map(([k, v]) => [k, esReferencia(v) ? SIN_CLAVE : ""]),
);

export default defineConfig({
  testDir: "./e2e",
  // Topes holgados a propósito: en el CI cada recorrido tarda unos 8 s y
  // generar el menú, 2-3 s. 30 s por espera y 120 s por prueba dan margen a un
  // runner lento sin esconder un cuelgue: si algo no sale, falla en rojo.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: URL_E2E,
    ...devices["Pixel 7"],
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npx vite --port ${PUERTO_E2E} --strictPort`,
    url: URL_E2E,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...sinEnvLocal,
      ...BANDERAS_STAGING,
      VITE_SUPABASE_URL: SUPABASE_MUERTO,
      VITE_SUPABASE_ANON_KEY: SIN_CLAVE,
    },
  },
});
