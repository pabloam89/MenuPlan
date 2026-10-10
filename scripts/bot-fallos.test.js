// npm run fallos (scripts/bot-fallos.mjs): cuenta las líneas bot_fallo de un
// export de logs de Vercel por motivo y por sitio (#211).
import { describe, it, expect } from "vitest";
import { fallosDe, contar, informe, paginar } from "./bot-fallos.mjs";

const linea = (f) => JSON.stringify({ evento: "bot_fallo", ...f });
// Como sale de `vercel logs --json`: una petición por línea, sus logs dentro.
const peticion = (mensajes) => JSON.stringify({
  id: "x", timestamp: 1791480300188, level: "error", message: mensajes[0] ?? "", source: "serverless",
  requestPath: "/api/bot/telegram", environment: "production", logs: mensajes.map((m) => ({ message: m, level: "error" })),
});

const EXPORT = [
  peticion([
    linea({ donde: "agente_casa", motivo: "tiempo", codigo: "57014", grave: true }),
    linea({ donde: "agente_dueno", motivo: "tiempo", codigo: "57014", grave: false }),
  ]),
  peticion([linea({ donde: "agente_casa", motivo: "red", codigo: null, grave: true })]),
  peticion(["[otro] algo sin marca"]),
  peticion([linea({ donde: "reconocer", motivo: "otro", codigo: null, grave: true, texto: "raro {con llaves}" })]),
  // Una línea suelta (texto plano copiado de la consola de Vercel).
  `2026-10-08T10:00:00Z error ${linea({ donde: "papel", motivo: "servidor", codigo: "PGRST002", grave: true })}`,
].join("\n");

describe("npm run fallos", () => {
  it("lee las líneas de un export de Vercel sin contar dos veces el mensaje y sus logs", () => {
    const f = fallosDe(EXPORT);
    expect(f).toHaveLength(5);
    expect(f.ilegibles).toBe(0);
  });

  it("cuenta por motivo y por sitio", () => {
    const c = contar(fallosDe(EXPORT));
    expect(c.total).toBe(5);
    expect(c.graves).toBe(4);
    expect(c.porMotivo).toEqual({ tiempo: 2, red: 1, otro: 1, servidor: 1 });
    expect(c.porSitio.agente_casa).toEqual({ total: 2, motivos: { tiempo: 1, red: 1 } });
    expect(c.otros).toEqual({ "raro {con llaves}": 1 });
    expect(c.fuera).toEqual({ motivos: [], sitios: [] });
  });

  it("también un array JSON entero", () => {
    const arr = JSON.stringify([{ message: linea({ donde: "lola", motivo: "modelo", codigo: "529", grave: true }) }]);
    expect(contar(fallosDe(arr)).porMotivo).toEqual({ modelo: 1 });
  });

  it("avisa de lo que no está en el vocabulario", () => {
    const c = contar(fallosDe(linea({ donde: "me_lo_invento", motivo: "marciano", grave: true })));
    expect(c.fuera).toEqual({ motivos: ["marciano"], sitios: ["me_lo_invento"] });
    expect(informe(c)).toContain("Fuera de la lista");
  });

  it("pagina hacia atrás con --until hasta cubrir el rango (la CLI da 50 por tanda)", () => {
    // 120 peticiones, una por minuto, de la más nueva a la más vieja, como las da Vercel.
    const AHORA = Date.UTC(2026, 9, 8, 12);
    const todas = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, timestamp: AHORA - i * 60000, logs: [{ message: linea({ donde: "agente_casa", motivo: "tiempo", grave: true }) }] }));
    const pedidas = [];
    const tanda = ({ desde, hasta }) => {
      pedidas.push(hasta);
      return todas.filter((p) => p.timestamp >= desde && p.timestamp <= hasta).slice(0, 50).map((p) => JSON.stringify(p)).join("\n");
    };
    const r = paginar(tanda, { desde: AHORA - 200 * 60000, hasta: AHORA, tanda: 50 });
    expect(contar(fallosDe(r.contenido)).total).toBe(120);
    expect(pedidas.length).toBeGreaterThanOrEqual(3);
    expect(r.completo).toBe(true);
    expect(r.peticiones).toBe(120);
  });

  it("si se queda en el tope de tandas, lo dice y dice hasta dónde llegó", () => {
    const tanda = ({ hasta }) => Array.from({ length: 50 }, (_, i) => JSON.stringify({ id: `${hasta}-${i}`, timestamp: hasta - i, logs: [] })).join("\n");
    const r = paginar(tanda, { desde: 0, hasta: 1_000_000, tanda: 50, maxTandas: 2 });
    expect(r.completo).toBe(false);
    expect(r.cubreDesde).toBeGreaterThan(0);
  });

  it("el informe pone primero lo que más falla", () => {
    const texto = informe(contar(fallosDe(EXPORT)));
    expect(texto.indexOf("agente_casa")).toBeLessThan(texto.indexOf("reconocer"));
    expect(texto).toContain("Fallos del bot: 5 (4 graves)");
  });
});
