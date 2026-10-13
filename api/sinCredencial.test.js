// Contrato de api/: toda función que no empieza por «_» rechaza con 401 o 403
// una petición SIN credencial, salvo las de la lista de públicos de
// ops/api-sin-credencial.json (cada una con su motivo y con lo que la protege
// en su lugar). Encargo #582.
//
// Cómo se prueba: se importa cada handler y se le manda un método y un cuerpo
// válidos, sin Authorization, sin cookie y sin secreto, de modo que el único
// motivo posible de rechazo sea la credencial. Nada sale a la red: `fetch` es
// un registro que contesta vacío, y se exige que un endpoint que rechaza lo
// haga SIN haber llamado antes a ningún servicio.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const RAIZ = join(import.meta.dirname, "..");
const DATOS = JSON.parse(readFileSync(join(RAIZ, "ops", "api-sin-credencial.json"), "utf8"));

// Tope de la lista de pendientes de caso: solo puede bajar. Al arreglar un
// endpoint se quita su entrada y se baja esta cifra.
const MAX_PENDING_CASES = 2;

const UUID = "3f2b8c1e-7a4d-4e0b-9c5a-1d2e3f4a5b6c";

// La petición válida de cada endpoint, sin ninguna credencial.
const PETICIONES = {
  "api/delete-account.js": { method: "POST", body: {} },
  "api/generate-dish-photo.js": { method: "POST", body: { dishName: "Lentejas" } },
  "api/generate.js": { method: "POST", body: { messages: [{ role: "user", content: "hola" }] } },
  "api/moderate-takedown.js": { method: "GET", query: { r: UUID } },
  "api/moderate.js": { method: "POST", body: { text: "hola" } },
  "api/recipe-steps.js": { method: "POST", body: { recipeId: "r1", appliance: "horno" } },
  "api/report-alert.js": { method: "POST", body: { id: UUID } },
  "api/share-menu.js": { method: "GET", query: { id: UUID }, headers: { "user-agent": "facebookexternalhit/1.1" } },
  "api/share-recipe.js": { method: "GET", query: { id: UUID }, headers: { "user-agent": "facebookexternalhit/1.1" } },
  "api/track.js": { method: "POST", body: { anonId: UUID, events: [{ event: "dish_viewed" }] } },
  "api/bot/canario.js": { method: "GET" },
  "api/bot/entrar.js": { method: "POST", body: {} },
  "api/bot/link.js": { method: "POST", body: {} },
  "api/bot/recordatorios.js": { method: "GET" },
  "api/bot/telegram.js": { method: "POST", body: { update_id: 1, message: { chat: { id: 1 }, text: "hola" } } },
};

/**
 * Los endpoints de api/, en cualquier carpeta (Vercel sirve todas): los .js, .mjs, .cjs y .ts
 * que no son tests y que ni ellos ni su carpeta empiezan por «_».
 */
export function endpointsDeApi(raiz = RAIZ, dir = "api") {
  const salida = [];
  for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
    if (e.name.startsWith("_")) continue;
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...endpointsDeApi(raiz, ruta));
    else if (e.isFile() && /\.(?:js|mjs|cjs|ts)$/.test(e.name) && !/\.test\.\w+$/.test(e.name)) salida.push(ruta);
  }
  return salida.sort();
}

function resFalso() {
  const res = { codigo: null, headers: {}, body: undefined, terminada: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; return res; };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.status = (c) => { res.codigo = c; return res; };
  res.json = (b) => { res.body = b; res.terminada = true; return res; };
  res.send = (b) => { res.body = b; res.terminada = true; return res; };
  res.end = () => { res.terminada = true; return res; };
  res.redirect = (c) => { res.codigo = c; res.terminada = true; return res; };
  res.writeHead = (c) => { res.codigo = c; return res; };
  return res;
}

// Todo secreto de servidor puesto, para que el rechazo no pueda deberse a que
// el entorno está sin configurar: la petición no lleva credencial y el
// servidor sí tiene con qué compararla.
const ENTORNO = {
  VITE_SUPABASE_URL: "https://base.invalid",
  SUPABASE_URL: "https://base.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_falsa",
  ANTHROPIC_API_KEY: "clave-falsa",
  GEMINI_AI_STUDIO_KEY: "clave-falsa",
  TELEGRAM_BOT_TOKEN: "123:falso",
  TELEGRAM_WEBHOOK_SECRET: "secreto-falso-del-webhook",
  BOT_CRON_SECRET: "secreto-falso-del-cron",
  CRON_SECRET: "secreto-falso-del-cron",
  CANARIO_SECRET: "secreto-falso-del-canario",
  MODERATION_SECRET: "secreto-falso-de-moderacion",
};
// Sin Redis ni VERCEL_ENV: el límite por IP deja pasar, como en local.
const SIN_REDIS = [
  "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_KV_REST_API_URL", "UPSTASH_REDIS_KV_REST_API_TOKEN",
  "UPSTASH_REDIS_KV_KV_REST_API_URL", "UPSTASH_REDIS_KV_KV_REST_API_TOKEN", "VERCEL_ENV",
];

async function sinCredencial(archivo) {
  const p = PETICIONES[archivo];
  const req = {
    method: p.method,
    headers: { host: "prueba.invalid", ...(p.headers ?? {}) },
    query: p.query ?? {},
    body: p.body,
    socket: { remoteAddress: "203.0.113.7" },
  };
  const res = resFalso();
  const llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    llamadas.push(String(url));
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }));
  const { default: handler } = await import(/* @vite-ignore */ join(RAIZ, archivo).replaceAll("\\", "/"));
  await handler(req, res);
  return { status: res.codigo ?? 200, llamadas };
}

describe("api/: sin credencial se rechaza", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v);
    for (const k of SIN_REDIS) vi.stubEnv(k, "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const endpoints = endpointsDeApi();
  const publicos = new Map(DATOS.public_endpoints.map((e) => [e.file, e]));
  const pendientes = new Map(DATOS.pending_cases.map((e) => [e.file, e]));

  it("cada endpoint de api/ tiene su petición de prueba (uno nuevo sin ella falla aquí)", () => {
    expect(Object.keys(PETICIONES).sort()).toEqual(endpoints);
  });

  for (const archivo of endpoints) {
    it(`${archivo}: ${publicos.has(archivo) ? "público a propósito" : "rechaza con 401 o 403"}`, async () => {
      const { status, llamadas } = await sinCredencial(archivo);
      if (publicos.has(archivo)) return; // su contrato es la lista: motivo y protección
      if (pendientes.has(archivo)) {
        expect([401, 403], `${archivo} ya rechaza: quítalo de pending_cases y baja MAX_PENDING_CASES`).not.toContain(status);
        expect(status, `${archivo} contesta otra cosa que lo apuntado: pon al día status_without_credential`).toBe(pendientes.get(archivo).status_without_credential);
        return;
      }
      expect([401, 403], `${archivo} contestó ${status} sin credencial y no está en public_endpoints ni en pending_cases`).toContain(status);
      expect(llamadas, `${archivo} llamó a la red antes de rechazar`).toEqual([]);
    });
  }
});

describe("api/: las listas de ops/api-sin-credencial.json", () => {
  const todos = endpointsDeApi();

  it("cada público existe, tiene motivo y dice qué lo protege en su lugar", () => {
    for (const e of DATOS.public_endpoints) {
      expect(existsSync(join(RAIZ, e.file)), `${e.file} ya no existe: quítalo de public_endpoints`).toBe(true);
      expect(todos, `${e.file} no es un endpoint de api/`).toContain(e.file);
      expect(String(e.reason ?? "").length, `${e.file} sin reason`).toBeGreaterThan(15);
      expect(String(e.protected_by ?? "").length, `${e.file} sin protected_by`).toBeGreaterThan(15);
    }
  });

  it("los pendientes de caso existen, llevan motivo y solo pueden bajar", () => {
    for (const e of DATOS.pending_cases) {
      expect(todos, `${e.file} ya no existe: quítalo de pending_cases`).toContain(e.file);
      expect(String(e.reason ?? "").length, `${e.file} sin reason`).toBeGreaterThan(15);
      expect(DATOS.public_endpoints.map((p) => p.file), `${e.file} está en las dos listas`).not.toContain(e.file);
    }
    expect(DATOS.pending_cases.length).toBeLessThanOrEqual(MAX_PENDING_CASES);
  });

  it("sin duplicados dentro de cada lista", () => {
    for (const lista of [DATOS.public_endpoints, DATOS.pending_cases]) {
      const f = lista.map((e) => e.file);
      expect(new Set(f).size).toBe(f.length);
    }
  });
});
