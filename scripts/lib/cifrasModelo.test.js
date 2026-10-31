import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CIFRAS, FUENTE, SENTIDO, ESTADO_CIFRA, medirCifras, tablaDeCifras, clavesData, ultimaConEspera, pendientesSinResultado,
} from "./cifrasModelo.js";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Un contexto de mentira: nada existe, la base no se abre, lo demás vale 5. */
const ctxDe = (cambios = {}) => ({
  existe: () => false,
  leer: () => 'data.a data.b data.a\nconst SIN_RESULTADO_TODAVIA = new Set(["x"]);',
  ficherosCon: async () => ["x.js", "y.js"],
  lineasCon: async () => 5,
  inventario: async () => new Proxy({}, { get: () => 5 }),
  capacidades: async () => ({ huecos: 5, sinPreguntaEnLola: 5, sinPantallaEnApp: 5 }),
  pasadas: async () => [],
  consultar: vi.fn(async () => { throw new Error("la base no se abre en el test"); }),
  ...cambios,
});

describe("las cifras del plan: vocabulario cerrado", () => {
  it("cada cifra dice de dónde sale, hacia dónde va y cómo se mide (o qué trozo le falta)", () => {
    expect(new Set(CIFRAS.map((c) => c.id)).size).toBe(CIFRAS.length);
    for (const c of CIFRAS) {
      expect(Object.values(FUENTE), c.id).toContain(c.fuente);
      expect(Object.values(SENTIDO), c.id).toContain(c.sentido);
      expect(Boolean(c.medir) !== Boolean(c.falta), `${c.id}: o medir o falta`).toBe(true);
      if (c.trozo != null) expect(c.trozo, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("una línea base lleva valor, fecha y origen; sin ella, una nota o su trozo pendiente", () => {
    for (const c of CIFRAS) {
      if (c.base) {
        expect(Number.isFinite(c.base.valor), c.id).toBe(true);
        expect(c.base.fecha, c.id).toMatch(FECHA);
        expect(c.base.origen, c.id).toBeTruthy();
      } else {
        expect(c.nota || c.falta || c.requiere, `${c.id}: sin base, dice por qué`).toBeTruthy();
      }
    }
  });
});

describe("medirCifras: lo que no se puede medir sale «sin medir», nunca 0", () => {
  it("con --sin-base, las de la base salen sin medir con su motivo y la base ni se toca", async () => {
    const ctx = ctxDe();
    const filas = await medirCifras(CIFRAS, ctx, { sinBase: true });
    const deBase = filas.filter((f) => f.fuente === FUENTE.base && !CIFRAS.find((c) => c.id === f.id).falta);
    expect(deBase.length).toBeGreaterThan(0);
    for (const f of deBase) expect(f).toMatchObject({ estado: ESTADO_CIFRA.sin_medir, valor: null, motivo: expect.stringMatching(/sin-base/) });
    expect(ctx.consultar).not.toHaveBeenCalled();
  });

  it("un trozo sin hacer sale sin medir; si su fichero aparece, falla en alto para que alguien la mida", async () => {
    const c = CIFRAS.find((x) => x.falta);
    const [fila] = await medirCifras([c], ctxDe(), { sinBase: true });
    expect(fila).toMatchObject({ estado: ESTADO_CIFRA.sin_medir, valor: null, motivo: expect.stringContaining(c.falta) });
    await expect(medirCifras([c], ctxDe({ existe: (r) => r === c.falta }))).rejects.toThrow(/ya existe/);
  });

  it("sin la tabla de su migración, sale sin medir y no se consulta la tabla", async () => {
    const c = CIFRAS.find((x) => x.requiere);
    const consultar = vi.fn(async () => [{ hay: false }]);
    const [fila] = await medirCifras([c], ctxDe({ consultar }));
    expect(fila).toMatchObject({ estado: ESTADO_CIFRA.sin_medir, valor: null, motivo: expect.stringContaining(c.requiere.migracion) });
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("sin pasada del banco, las del banco salen sin medir; con ella, de la última que midió", async () => {
    const delBanco = CIFRAS.filter((c) => c.fuente === FUENTE.banco);
    for (const f of await medirCifras(delBanco, ctxDe())) expect(f).toMatchObject({ estado: ESTADO_CIFRA.sin_medir, valor: null });
    const pasadas = async () => [{ pct_operacion_exacta: 70, coste_medio_usd: 0.03 }, { pct_operacion_exacta: null }];
    const [exacta] = await medirCifras(delBanco.slice(0, 1), ctxDe({ pasadas }));
    expect(exacta).toMatchObject({ estado: ESTADO_CIFRA.medida, valor: 30 });
  });

  it("una medida que no es un número falla en alto (no sale como 0)", async () => {
    const rota = { id: "rota", nombre: "rota", fuente: FUENTE.codigo, sentido: SENTIDO.baja, medir: async () => undefined };
    await expect(medirCifras([rota], ctxDe())).rejects.toThrow(/rota: la medida no es un número/);
  });

  it("todas las del código se miden con el contexto, y las proporciones llevan su total", async () => {
    const filas = await medirCifras(CIFRAS, ctxDe(), { sinBase: true });
    const delCodigo = filas.filter((f) => f.fuente === FUENTE.codigo && !CIFRAS.find((c) => c.id === f.id).falta);
    for (const f of delCodigo) expect(f.estado, f.id).toBe(ESTADO_CIFRA.medida);
    expect(filas.find((f) => f.id === "claves_data_motor").valor).toBe(2);
    expect(filas.find((f) => f.id === "ejes_sin_consumidor").de).toBeGreaterThan(0);
  });
});

describe("piezas", () => {
  it("clavesData cuenta claves distintas, como `grep -ohE | sort -u`", () => {
    expect(clavesData(["data.a, data.b", "x.data.a; metadata.c"])).toBe(2);
  });

  it("pendientesSinResultado cuenta los nombres de la lista, y sin la lista falla en alto", () => {
    expect(pendientesSinResultado('export const SIN_RESULTADO_TODAVIA = new Set([\n  "a", "b",\n  "c",\n]);')).toBe(3);
    expect(() => pendientesSinResultado("export const OTRA = new Set([]);")).toThrow(/SIN_RESULTADO_TODAVIA/);
  });

  it("ultimaConEspera se queda con la última pasada que midió operaciones", () => {
    expect(ultimaConEspera([{ pct_operacion_exacta: 1 }, { pct_operacion_exacta: 2 }, {}])).toEqual({ pct_operacion_exacta: 2 });
    expect(ultimaConEspera([])).toBeNull();
  });

  it("la tabla dice «sin medir» y el motivo donde no hay cifra", () => {
    const t = tablaDeCifras([{ nombre: "X", estado: ESTADO_CIFRA.sin_medir, motivo: "trozo 9 sin hacer", base: null, nota: "n", sentido: SENTIDO.baja, meta: 0, trozo: 9 }], { fecha: "hoy" });
    expect(t).toContain("| X | sin medir: trozo 9 sin hacer | sin base: n | → 0 | 9 |");
  });
});

describe("con el repo de verdad (corre en CI con npm test)", () => {
  it("ningún trozo pendiente ha llegado sin su medida, y las cifras que leen ficheros del repo se miden", async () => {
    const ctx = ctxDe({ existe: (r) => existsSync(join(raiz, r)), leer: (r) => readFileSync(join(raiz, r), "utf8") });
    const filas = await medirCifras(CIFRAS, ctx, { sinBase: true });
    expect(filas.find((f) => f.id === "herramientas_sin_resultado")).toMatchObject({ estado: ESTADO_CIFRA.medida });
  });
});
