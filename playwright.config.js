// Pruebas de punta a punta de la app (trozo 37 de specs/plan-fichas-con-estado.md).
//
// La app corre en modo sin cuenta, con datos de mentira y SIN tocar la base:
// la única base es producción. Por eso el servidor arranca sin ninguna clave
// real: cada clave que .env.local guarda como dirección de 1Password (op://)
// llega aquí con un valor que no sirve, y vite.config.js ya no la resuelve
// (no pisa lo que trae el entorno). Supabase apunta a un puerto muerto y la
// prueba, además, corta y cuenta cualquier petición que se escape.
//
// No está en el CI: meterla en un workflow toca .github/workflows/ y es otro
// trozo. Se corre con `npm run e2e` o `npx playwright test e2e/recorrido.spec.js`.
import { defineConfig, devices } from "@playwright/test";
import { esReferencia, leerFichero } from "./scripts/lib/env.mjs";

// Puerto propio: el 5176 es el de `npm run dev` y puede estar ocupado por
// otra sesión.
export const PUERTO_E2E = 5188;
export const URL_E2E = `http://localhost:${PUERTO_E2E}`;
// Un Supabase que no existe: el cliente se crea, pero nada llega a la base.
export const SUPABASE_MUERTO = "http://127.0.0.1:9";
const SIN_CLAVE = "e2e-sin-clave";
const RAMA_DESPLEGADA = "staging";

const sinClaves = Object.fromEntries(
  Object.entries(leerFichero())
    .filter(([, v]) => esReferencia(v))
    .map(([k]) => [k, SIN_CLAVE]),
);

export default defineConfig({
  testDir: "./e2e",
  // Generar un menú con el solver tarda unos segundos en un portátil.
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
      ...sinClaves,
      VITE_SUPABASE_URL: SUPABASE_MUERTO,
      VITE_SUPABASE_ANON_KEY: SIN_CLAVE,
      // Las mismas banderas que el despliegue de staging (vite.config.js las
      // saca de la rama): el motor `solver`, que asigna los platos sin llamar
      // al modelo, y la pizarra encendida.
      VERCEL_GIT_COMMIT_REF: RAMA_DESPLEGADA,
    },
  },
});
