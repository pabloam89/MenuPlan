import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { cors, isCrossOrigin, globalLimit, dailyBudget, topeDiario, topeDiarioAgotado, TOPE_DIARIO_POR_DEFECTO } from "./_guard.js";
import { MOTIVOS_TOPE_DIARIO } from "../src/lib/vocabularios.js";

// Tope diario de IA: desplegado falla CERRADO y nunca queda «sin tope» por
// falta de variable.
describe("dailyBudget", () => {
  const VERCEL = { VERCEL_ENV: "production" };
  const redisDe = (incr, expire = async () => 1) => ({ incr, expire });
  const callado = async (fn) => {
    const quieto = console.warn;
    const lineas = [];
    console.warn = (l) => lineas.push(l);
    try {
      return { r: await fn(), lineas: lineas.map((l) => JSON.parse(l)) };
    } finally {
      console.warn = quieto;
    }
  };

  it("sin variable válida usa el tope por defecto, no «sin tope»", () => {
    expect(topeDiario("generate", {})).toBe(TOPE_DIARIO_POR_DEFECTO.generate);
    for (const malo of ["abc", "0", "-3", "0.5", ""]) {
      expect(topeDiario("recipe-steps", { AI_DAILY_BUDGET_RECIPE_STEPS: malo }), malo).toBe(TOPE_DIARIO_POR_DEFECTO["recipe-steps"]);
    }
    expect(topeDiario("dish-photo", { AI_DAILY_BUDGET_DISH_PHOTO: "7.9" })).toBe(7);
  });

  it("cuenta por día, pone la caducidad en la primera y corta pasado el tope", async () => {
    let n = 0;
    const caducidades = [];
    const redis = redisDe(async () => ++n, async (clave, seg) => caducidades.push([clave, seg]));
    const { r } = await callado(async () => {
      const oks = [];
      for (let i = 0; i < 3; i++) oks.push((await dailyBudget("dish-photo", { redis, env: { ...VERCEL, AI_DAILY_BUDGET_DISH_PHOTO: "2" } })).ok);
      return oks;
    });
    expect(r).toEqual([true, true, false]);
    expect(caducidades).toHaveLength(1);
    expect(caducidades[0][0]).toMatch(/^budget:dish-photo:\d{4}-\d{2}-\d{2}$/);
    expect(caducidades[0][1]).toBeGreaterThanOrEqual(86400);
  });

  it("desplegado, sin Redis o con Redis fallando, no deja pasar y deja una línea contable", async () => {
    const sin = await callado(() => dailyBudget("generate", { redis: null, env: VERCEL }));
    expect(sin.r).toEqual({ ok: false, motivo: "sin_redis" });
    const roto = await callado(() => dailyBudget("generate", { redis: redisDe(async () => { throw new Error("caído"); }), env: VERCEL }));
    expect(roto.r).toEqual({ ok: false, motivo: "error_redis" });
    let n = TOPE_DIARIO_POR_DEFECTO.generate;
    const lleno = await callado(() => dailyBudget("generate", { redis: redisDe(async () => ++n), env: VERCEL }));
    expect(lleno.r).toEqual({ ok: false, motivo: "tope_alcanzado" });
    for (const { r, lineas } of [sin, roto, lleno]) {
      expect(MOTIVOS_TOPE_DIARIO).toContain(r.motivo);
      expect(lineas).toEqual([{ tag: "tope_diario", bucket: "generate", motivo: r.motivo, corta: true, ...(r.motivo === "error_redis" ? { detalle: "caído" } : {}) }]);
    }
  });

  it("en local (sin VERCEL_ENV) y sin Redis deja pasar, con su línea", async () => {
    const local = await callado(() => dailyBudget("generate", { redis: null, env: {} }));
    expect(local.r).toEqual({ ok: true, motivo: "sin_redis" });
    expect(local.lineas).toEqual([{ tag: "tope_diario", bucket: "generate", motivo: "sin_redis", corta: false }]);
  });

  it("un bucket sin tope por defecto y sin variable no se cuenta", async () => {
    expect(await dailyBudget("track", { redis: null, env: VERCEL })).toEqual({ ok: true });
  });

  it("topeDiarioAgotado contesta 503 cuando no hay cupo", async () => {
    const res = fakeRes();
    res.json = (b) => { res.body = b; return res; };
    const { r } = await callado(() => topeDiarioAgotado(res, "generate", { redis: null, env: VERCEL }));
    expect(r).toBe(true);
    expect(res.statusCode).toBe(503);
  });
});

// La clase, no el caso: todo fichero de api/ que llama a un modelo pasa por el
// tope diario, después de validar el cuerpo, o está aquí con su porqué.
const IA = /api\.anthropic\.com|@anthropic-ai\/sdk|generativelanguage|@google\/genai/;
const SIN_TOPE_DIARIO = {
  // El turno de Lola: solo con el secreto del webhook y una casa vinculada, y
  // con su propio tope mensual por casa (api/_bot/uso.js, BOT_LIMITE_MENSUAL).
  "_bot/agente.js": "turno de Lola, tope mensual por casa",
  "_bot/router.js": "turno de Lola, tope mensual por casa",
  "_bot/significado.js": "turno de Lola, tope mensual por casa",
  "_bot/traducir.js": "turno de Lola, tope mensual por casa",
  "_bot/recetas.js": "turno de Lola, tope mensual por casa",
  // Solo importa las clases de error del SDK, no llama al modelo.
  "_bot/avisar.js": "no llama al modelo",
};

function ficherosDeApi(dir = new URL("./", import.meta.url), prefijo = "") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__snapshots__") out.push(...ficherosDeApi(new URL(`${e.name}/`, dir), `${prefijo}${e.name}/`));
    } else if (e.name.endsWith(".js") && !e.name.endsWith(".test.js")) {
      out.push({ ruta: `${prefijo}${e.name}`, src: readFileSync(new URL(e.name, dir), "utf8") });
    }
  }
  return out;
}

describe("tope diario: todo lo que llama a la IA en api/", () => {
  const conIA = ficherosDeApi().filter((f) => IA.test(f.src));

  it("cada fichero con IA pasa por el tope o está en las excepciones", () => {
    for (const { ruta, src } of conIA) {
      if (SIN_TOPE_DIARIO[ruta]) continue;
      const m = src.match(/topeDiarioAgotado\(res, "([^"]+)"\)/);
      expect(m, `${ruta} llama a la IA sin topeDiarioAgotado() ni excepción`).not.toBe(null);
      expect(TOPE_DIARIO_POR_DEFECTO[m[1]], `${ruta} (${m[1]}) sin tope por defecto`).toBeGreaterThan(0);
    }
  });

  it("el tope va después del límite por IP, de la validación y de la caché", () => {
    for (const { ruta, src } of conIA) {
      if (SIN_TOPE_DIARIO[ruta]) continue;
      const tope = src.indexOf("topeDiarioAgotado(res");
      const antes = [src.indexOf("await blocked("), src.lastIndexOf(".status(400)"), src.lastIndexOf(".hget(")];
      for (const i of antes) expect(tope, `${ruta}: el tope va antes de algo que debe precederlo`).toBeGreaterThan(i);
    }
  });

  it("cada tope por defecto lo usa un fichero, y cada excepción existe y usa IA", () => {
    const usados = conIA.map((f) => f.src.match(/topeDiarioAgotado\(res, "([^"]+)"\)/)?.[1]).filter(Boolean);
    expect([...new Set(usados)].sort()).toEqual(Object.keys(TOPE_DIARIO_POR_DEFECTO).sort());
    const rutas = conIA.map((f) => f.ruta);
    for (const ruta of Object.keys(SIN_TOPE_DIARIO)) expect(rutas, `excepción sin uso: ${ruta}`).toContain(ruta);
  });
});

// Tope de gasto (el turno con modelo del canario, #267): falla CERRADO.
describe("globalLimit", () => {
  const opciones = { bucket: "prueba", limit: 2, windowSec: 60 };
  const redisDe = (incr) => ({ incr, expire: async () => 1 });

  it("cuenta para todos y corta pasado el límite", async () => {
    let n = 0;
    const redis = redisDe(async () => ++n);
    const r = [];
    for (let i = 0; i < 3; i++) r.push((await globalLimit(opciones, { redis })).ok);
    expect(r).toEqual([true, true, false]);
  });

  it("sin Redis, o con Redis fallando, no deja pasar", async () => {
    const quieto = console.warn;
    console.warn = () => {};
    try {
      expect(await globalLimit(opciones, { redis: null })).toEqual({ ok: false, motivo: "sin_redis" });
      expect(await globalLimit(opciones, { redis: redisDe(async () => { throw new Error("caído"); }) })).toEqual({ ok: false, motivo: "error_redis" });
    } finally {
      console.warn = quieto;
    }
  });
});

function fakeRes() {
  const res = { headers: {}, statusCode: null, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

const req = (origin, method = "POST", host = "homenu.vercel.app") => ({
  method,
  headers: { ...(origin ? { origin } : {}), host },
});

describe("cors", () => {
  it("no toca las peticiones de la web", () => {
    const res = fakeRes();
    expect(cors(req("https://homenu.vercel.app"), res)).toBe(false);
    expect(res.headers).toEqual({});
  });

  it("no da CORS a un origen ajeno, ni en el preflight", () => {
    const res = fakeRes();
    expect(cors(req("https://evil.example", "OPTIONS"), res)).toBe(false);
    expect(res.headers).toEqual({});
  });

  it("responde el preflight de la app iOS con 204", () => {
    const res = fakeRes();
    expect(cors(req("capacitor://localhost", "OPTIONS"), res)).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(res.headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  it("deja seguir el POST de la app iOS con la cabecera de origen", () => {
    const res = fakeRes();
    expect(cors(req("capacitor://localhost"), res)).toBe(false);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
  });
});

describe("isCrossOrigin", () => {
  it("permite el mismo dominio y la app iOS", () => {
    expect(isCrossOrigin(req("https://homenu.vercel.app"))).toBe(false);
    expect(isCrossOrigin(req("capacitor://localhost"))).toBe(false);
  });

  it("sigue bloqueando otros orígenes", () => {
    expect(isCrossOrigin(req("https://evil.example"))).toBe(true);
    expect(isCrossOrigin(req("capacitor://evil"))).toBe(true);
  });
});
