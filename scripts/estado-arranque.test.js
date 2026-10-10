import { describe, expect, it } from "vitest";

import { avisoDeArranque, leerIssue } from "./lib/issues.mjs";

/**
 * La clase (#461, fondo #231): toda fuente de estado que no distingue lo
 * contestado de lo pendiente. El arranque no puede decir «esperando a Pablo»
 * de una decisión con comentarios: las sesiones comentan con la cuenta de
 * Pablo (#326) y el autor no dice quién contestó.
 */
const nodo = (number, comentarios, extra = {}) => ({
  id: `i${number}`, number, title: `[decisión] ejemplo ${number}`, state: "OPEN", createdAt: "2026-10-01T00:00:00Z",
  closedAt: null, body: "Pregunta", labels: { nodes: ["tipo:decision", "area:ops"].map((name) => ({ name })) },
  assignees: { nodes: [{ login: "pabloam89" }] }, reaperturas: { totalCount: 0 }, closedByPullRequestsReferences: { nodes: [] },
  comments: { totalCount: comentarios.length, nodes: comentarios.map(([createdAt, body = "ok", authorAssociation = "OWNER"]) => ({ createdAt, body, authorAssociation })) },
  parent: null, subIssues: { nodes: [] }, ...extra,
});

const lineaDeDecisiones = (issues) => avisoDeArranque(issues.map(leerIssue)).filter((l) => /ecisiones/.test(l)).join("\n");
const SIN_CONTESTAR = /sin contestar[^;.]*/i;

describe("el arranque separa las decisiones sin contestar de las que tienen respuesta", () => {
  it("una decisión sin comentarios sale como sin contestar, con su fecha de alta", () => {
    const l = lineaDeDecisiones([nodo(10, [])]);
    expect(l).toMatch(/1 sin contestar/);
    expect(l).toContain("#10");
    expect(l).toContain("2026-10-01");
  });

  it("una decisión con comentarios nunca sale como sin contestar ni «esperando a Pablo»", () => {
    const l = lineaDeDecisiones([nodo(11, [["2026-10-05T10:00:00Z"]]), nodo(12, [["2026-10-06T10:00:00Z"], ["2026-10-07T09:30:00Z"]])]);
    expect(l).not.toMatch(/esperando a Pablo/);
    expect(l).not.toMatch(/\b[1-9]\d* sin contestar/);
    expect(l).toMatch(/2 con respuesta/);
    expect(l).toMatch(/comprueba si ya está decidida/);
    expect(l).toContain("#11 (último comentario 2026-10-05)");
    expect(l).toContain("#12 (último comentario 2026-10-07)");
  });

  it("con la forma real de #299 (abierta, comentarios de la cuenta de Pablo, ya decidida) sale en «con respuesta»", () => {
    const real = nodo(299, [["2026-10-08T18:20:00Z", "Opciones A, B y C"], ["2026-10-09T07:45:00Z", "Decidido: A. Queda en el PR #330"]], { title: "[decisión] identidades separadas de las sesiones", createdAt: "2026-10-07T00:00:00Z" });
    const l = lineaDeDecisiones([real, nodo(300, [])]);
    expect(l).toMatch(/1 con respuesta[^.]*#299 \(último comentario 2026-10-09\)/);
    expect(l.split("con respuesta")[0]).not.toContain("#299");
    expect(l.match(SIN_CONTESTAR)?.[0] ?? "").not.toContain("#299");
  });

  it("los comentarios automáticos (marcas del bot) no cuentan como respuesta", () => {
    const l = lineaDeDecisiones([nodo(13, [["2026-10-05T10:00:00Z", "<!-- menuplan:lleva rama=x carpeta=y desde=z -->"]])]);
    expect(l).toMatch(/1 sin contestar/);
  });

  it("el recuento de decisiones sale en una sola línea", () => {
    const lineas = avisoDeArranque([nodo(14, []), nodo(15, [["2026-10-05T10:00:00Z"]])].map(leerIssue));
    expect(lineas.filter((l) => /decisiones/i.test(l)).length).toBe(1);
  });
});

describe("ronda 2 (#461)", () => {
  const marca = (i) => [`2026-10-0${(i % 9) + 1}T10:00:00Z`, "<!-- menuplan:lleva rama=x carpeta=y desde=z -->"];

  it("con más comentarios de los leídos y ninguno humano entre ellos, sale con respuesta de fecha desconocida", () => {
    const n = nodo(20, Array.from({ length: 10 }, (_, i) => marca(i)));
    n.comments.totalCount = 12;
    const l = lineaDeDecisiones([n]);
    expect(l).not.toMatch(/\b[1-9]\d* sin contestar/);
    expect(l).toContain("#20 (último comentario sin fecha)");
  });

  it("un comentario humano que cita una marca sigue contando como respuesta", () => {
    const l = lineaDeDecisiones([nodo(21, [["2026-10-05T10:00:00Z", "Decidido, ver <!-- menuplan:lleva rama=x -->"]])]);
    expect(l).toMatch(/1 con respuesta/);
  });

  it("el día es el de Madrid, no el de UTC", () => {
    const l = lineaDeDecisiones([nodo(22, [["2026-10-05T23:30:00Z"]])]);
    expect(l).toContain("#22 (último comentario 2026-10-06)");
  });

  it("las con respuesta van de la más reciente a la más antigua, con un máximo de 6 y «y N más»", () => {
    const ns = Array.from({ length: 8 }, (_, i) => nodo(30 + i, [[`2026-10-0${i + 1}T12:00:00Z`]]));
    const l = lineaDeDecisiones(ns);
    expect(l.indexOf("#37")).toBeLessThan(l.indexOf("#36"));
    expect(l).toContain("#32 ");
    expect(l).not.toContain("#31 ");
    expect(l).toContain("y 2 más");
  });
});
