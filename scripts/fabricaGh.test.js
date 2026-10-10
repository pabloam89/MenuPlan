// Lo que fabrica pide a GitHub (#424, fondo #326): dos consultas ligeras, caché y espera ante el límite.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESPERA_MAX_S, CONSULTA_FONDOS, CONSULTA_TODOS, conEsperaDeLimite, datosGithub, esLimite, paginas, fondosTruncados, segundosDeEspera, unirNodos } from "./lib/fabricaGh.mjs";
import { unirConGithub } from "./lib/fabrica.mjs";

const raiz = join(import.meta.dirname, "..");
const etq = (...n) => ({ nodes: n.map((name) => ({ name })) });

describe("las consultas de fabrica son ligeras", () => {
  it("no piden lo que fabrica no usa", () => {
    for (const q of [CONSULTA_TODOS, CONSULTA_FONDOS]) {
      expect(q).not.toMatch(/comments|closedByPullRequestsReferences|assignees|authorAssociation/);
    }
  });

  it("la lista de todos no baja a los hijos y la de fondos va en páginas pequeñas", () => {
    expect(CONSULTA_TODOS).not.toMatch(/subIssues/);
    // GitHub cobra por los `first:` pedidos: 100 fondos × 50 hijos costaba 52 puntos por página.
    const tam = Number(/issues\(first: (\d+)/.exec(CONSULTA_FONDOS)[1]);
    expect(tam).toBeLessThanOrEqual(10);
    expect(CONSULTA_FONDOS).toMatch(/labels: \["tipo:fondo"\]/);
  });

  it("fabrica.mjs usa esas consultas, cuenta sus llamadas y no la consulta entera de issues", () => {
    const src = readFileSync(join(raiz, "scripts", "fabrica.mjs"), "utf8");
    expect(src).not.toMatch(/\bCONSULTA\b/);
    expect(src).toMatch(/registrarGh\("fabrica"/);
    expect(src).toMatch(/conEsperaDeLimite/);
    expect(src).toMatch(/conCache\("fabrica-issues"/);
  });
});

describe("unirNodos", () => {
  const todos = [
    { number: 1, state: "CLOSED", labels: etq("tipo:fondo", "causa:entorno") },
    { number: 2, state: "OPEN", labels: etq("tipo:encargo") },
    { number: 3, state: "OPEN", labels: etq("tipo:caso", "analisis:no-aguanto-roto") },
  ];
  const fondos = [{
    number: 1, state: "CLOSED", body: "```fondo\nestado: cerrado-eficaz\nalcance: local\n```", labels: etq("tipo:fondo", "causa:entorno"),
    reaperturas: { totalCount: 1 }, subIssues: { totalCount: 2, nodes: [{ number: 2, state: "OPEN", labels: etq("tipo:encargo") }, { number: 3, state: "OPEN", labels: etq("tipo:caso", "analisis:no-aguanto-roto") }] },
  }];

  it("da la forma de leerIssue: padre en los hijos, hijos y reaperturas en el fondo", () => {
    const r = unirNodos(todos, fondos);
    const [fondo, encargo] = r;
    expect(fondo.hijos.map((h) => h.number)).toEqual([2, 3]);
    expect(fondo.reaperturas).toBe(1);
    expect(fondo.body).toContain("cerrado-eficaz");
    expect(encargo.padre.number).toBe(1);
    expect(r[2].padre.number).toBe(1);
  });

  it("alimenta a unirConGithub: el encargo cuelga de su fondo", () => {
    const cubo = (min) => ({ minutos: min, tokens: { total: 10, salida: 4 }, mensajes: 1, sin_precio: 0, coste_usd: 1, sesiones: 1, agentes: {}, subagentes: 0, modelos: {} });
    const u = unirConGithub(new Map([[1, cubo(5)], [2, cubo(3)]]), unirNodos(todos, fondos));
    expect(u.sinLocalizar).toEqual([]);
    expect(u.fondos).toHaveLength(1);
    expect(u.fondos[0]).toMatchObject({ issue: 1, alcance: "local", tipo_causa: "entorno", encargos: [2], encargos_total: 1, aguanto: "si", propio: true });
    expect(u.encargos).toMatchObject([{ issue: 2, fondo: 1, aguanto: "si" }]);
  });

  it("un fondo que la primera lectura no vio también entra", () => {
    const r = unirNodos([], fondos);
    expect(r.map((i) => i.number)).toEqual([1]);
  });

  it("avisa de un fondo con más hijos de los leídos", () => {
    expect(fondosTruncados(fondos)).toEqual([]);
    expect(fondosTruncados([{ number: 9, subIssues: { totalCount: 60, nodes: new Array(50).fill({}) } }])).toEqual([9]);
  });
});

describe("conEsperaDeLimite", () => {
  const limite = (m = "gh: API rate limit exceeded for user ID 1") => Object.assign(new Error(m), { stderr: m });

  it("reconoce el límite de cuota y el secundario, y no otros fallos", () => {
    expect(esLimite(limite())).toBe(true);
    expect(esLimite(limite("You have exceeded a secondary rate limit"))).toBe(true);
    expect(esLimite(new Error("TLS handshake timeout"))).toBe(false);
  });

  it("respeta retry-after, con tope", () => {
    expect(segundosDeEspera(limite("rate limit, retry-after: 42"))).toBe(42);
    expect(segundosDeEspera(limite("secondary rate limit. Please wait 7 seconds"))).toBe(7);
    expect(segundosDeEspera(limite())).toBeNull();
    const dormidos = [];
    let n = 0;
    conEsperaDeLimite(() => { if (++n < 2) throw limite("API rate limit exceeded, retry-after: 99999"); return "ok"; }, { dormir: (ms) => dormidos.push(ms) });
    expect(dormidos).toEqual([ESPERA_MAX_S * 1000]);
  });

  it("reintenta ante el límite y acaba si se levanta", () => {
    const dormidos = [];
    let n = 0;
    const r = conEsperaDeLimite(() => { if (++n < 3) throw limite(); return "ok"; }, { dormir: (ms) => dormidos.push(ms) });
    expect(r).toBe("ok");
    expect(dormidos).toEqual([30_000, 60_000]);
  });

  it("se rinde con el error original a la tercera", () => {
    let n = 0;
    expect(() => conEsperaDeLimite(() => { n++; throw limite(); }, { dormir: () => {} })).toThrow(/rate limit/);
    expect(n).toBe(3);
  });

  it("un fallo que no es de límite no se reintenta", () => {
    let n = 0;
    expect(() => conEsperaDeLimite(() => { n++; throw new Error("boom"); }, { dormir: () => { throw new Error("no debía dormir"); } })).toThrow("boom");
    expect(n).toBe(1);
  });
});

describe("paginas", () => {
  const pag = (nodos, fin) => JSON.stringify({ data: { repository: { issues: { nodes: nodos, pageInfo: { hasNextPage: !!fin, endCursor: fin ?? null } } } } });

  it("sigue el cursor, para al final y hace una pausa entre páginas", () => {
    const llamadas = [];
    const pausas = [];
    const gh = (...args) => {
      llamadas.push(args);
      return args.includes("cursor=C1") ? pag([{ number: 3 }]) : pag([{ number: 1 }, { number: 2 }], "C1");
    };
    const r = paginas("Q", gh, { dormir: (ms) => pausas.push(ms), pausaMs: 7 });
    expect(r.map((n) => n.number)).toEqual([1, 2, 3]);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0]).not.toContain("cursor=C1");
    expect(pausas).toEqual([7]);
  });
});

describe("datosGithub", () => {
  it("dice si el dato es fresco o de caché", () => {
    expect(datosGithub(null)).toBe("fresco");
    expect(datosGithub(42)).toBe("cache 42 min");
  });

  it("fabrica.mjs lo pone en el JSON y en la cabecera", () => {
    const src = readFileSync(join(raiz, "scripts", "fabrica.mjs"), "utf8");
    expect(src).toMatch(/datos_github: datos/);
    expect(src).toMatch(/datosGithub: datos/);
  });
});
