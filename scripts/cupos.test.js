import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

import { CUPOS, MOTIVOS_CUPO, TTL_CUPOS_MIN, UMBRAL_CUPO, avisoDeCupos, lineaDeCupos, motivoDeFallo, parsearGh, parsearOp, porcentaje } from "./lib/cupos.mjs";

const AHORA = Date.now();
const MIN = 60_000;

const tablaOp = (usadoToken, usadoCuenta) => `TYPE       ACTION        LIMIT    USED    REMAINING    RESET
token      write         100      0       100          N/A
token      read          1000     ${usadoToken}      ${1000 - usadoToken}          22 minutes from now
account    read_write    1000     ${usadoCuenta}     ${1000 - usadoCuenta}          2 hours from now
`;
const jsonGh = (core, graphql) => JSON.stringify({ resources: { core: { limit: 5000, used: core, remaining: 5000 - core, reset: (AHORA + 30 * MIN) / 1000 }, graphql: { limit: 5000, used: graphql, remaining: 5000 - graphql, reset: (AHORA + 30 * MIN) / 1000 } } });

const dirs = [];
const dirNuevo = () => {
  const d = mkdtempSync(join(tmpdir(), "cupos-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Un arranque con las dos consultas de mentira. */
const arranque = (gh, op, extra = {}) => avisoDeCupos({ gh, op, dir: dirNuevo(), ahora: AHORA, registrar: () => {}, ...extra });

describe("leer las dos fuentes", () => {
  it("la tabla de 1Password real da el cupo del token (lectura) y el de la cuenta, con el reinicio absoluto; la escritura no cuenta", () => {
    const c = parsearOp(tablaOp(89, 225), AHORA);
    expect(c.map((x) => x.cupo)).toEqual(["1password-token", "1password-cuenta"]);
    expect(c[0]).toMatchObject({ limit: 1000, used: 89, resetMs: AHORA + 22 * MIN });
    expect(c[1]).toMatchObject({ limit: 1000, used: 225, resetMs: AHORA + 120 * MIN });
  });

  it("GitHub trae REST y GraphQL en una sola respuesta", () => {
    const c = parsearGh(jsonGh(10, 4100));
    expect(c.map((x) => x.cupo).sort()).toEqual(["github-graphql", "github-rest"]);
    expect(c.find((x) => x.cupo === "github-graphql")).toMatchObject({ used: 4100, limit: 5000, resetMs: AHORA + 30 * MIN });
  });

  it("una salida que no es la esperada es formato-raro, en las dos", () => {
    expect(() => parsearGh("<html>")).toThrow(/formato-raro/);
    expect(() => parsearOp("nada que ver")).toThrow(/formato-raro/);
  });

  it("todo cupo y todo motivo que puede salir está en el vocabulario cerrado", () => {
    for (const c of [...parsearOp(tablaOp(1, 1), AHORA), ...parsearGh(jsonGh(1, 1))]) expect(CUPOS).toContain(c.cupo);
    const e = (x) => motivoDeFallo(x, "github");
    for (const m of [e({ code: "ENOENT" }), e({ stderr: "Too many requests" }), e({ stderr: "gh auth login" }), e({ killed: true }), e({ motivoCupo: "formato-raro" }), motivoDeFallo({ code: "ENOENT" }, "1password")]) expect(MOTIVOS_CUPO).toContain(m);
    expect(motivoDeFallo({ code: "ENOENT" }, "1password")).toBe("sin-op");
    expect(e({ code: "ENOENT" })).toBe("sin-gh");
  });
});

describe("el umbral del 80 %", () => {
  const lec = (usado) => [{ fuente: "github", cupos: [{ cupo: "github-graphql", limit: 5000, used: usado, resetMs: AHORA + 30 * MIN }] }];

  it("79 % calla, 80 % avisa", () => {
    expect(UMBRAL_CUPO).toBe(80);
    expect(lineaDeCupos(lec(3950), AHORA)).toBeNull();
    expect(porcentaje({ used: 4000, limit: 5000 })).toBe(80);
    expect(lineaDeCupos(lec(4000), AHORA)).not.toBeNull();
  });

  it("es UNA línea con el cupo, el porcentaje y cuándo se reinicia", () => {
    const l = lineaDeCupos(lec(4400), AHORA);
    expect(l.split("\n")).toHaveLength(1);
    expect(l).toMatch(/cupo: github-graphql uso: 88 % reinicio: \d\d:\d\d \(en 30 min\)/);
  });

  it("dos cupos altos salen en la misma línea", () => {
    const l = lineaDeCupos([...lec(4500), { fuente: "1password", cupos: [{ cupo: "1password-cuenta", limit: 1000, used: 950, resetMs: AHORA + 300 * MIN }] }], AHORA);
    expect(l.split("\n")).toHaveLength(1);
    expect(l).toContain("github-graphql");
    expect(l).toMatch(/1password-cuenta uso: 95 % .*en 5 h/);
  });

  it("un cupo cuyo reinicio ya pasó no avisa (la lectura guardada está vieja)", () => {
    expect(lineaDeCupos([{ fuente: "github", cupos: [{ cupo: "github-rest", limit: 5000, used: 5000, resetMs: AHORA - MIN }] }], AHORA)).toBeNull();
  });

  it("sin datos personales: ni tokens, ni logins, ni correos en la línea", () => {
    const l = lineaDeCupos(lec(4900), AHORA);
    expect(l).not.toMatch(/ghs_|ops_|@|pabloam89|op:\/\//);
  });
});

describe("avisoDeCupos", () => {
  it("todo por debajo del 80 %: no dice nada", async () => {
    expect(await arranque(async () => jsonGh(10, 100), async () => tablaOp(50, 100))).toBeNull();
  });

  it("GraphQL al 90 %: avisa aunque 1Password vaya bien", async () => {
    const l = await arranque(async () => jsonGh(10, 4500), async () => tablaOp(50, 100));
    expect(l).toMatch(/Cupos al 80 %/);
    expect(l).toMatch(/cupo: github-graphql uso: 90 %/);
    expect(l).not.toContain("1password");
  });

  it("la cuenta de 1Password al 84 % avisa con su reinicio", async () => {
    const l = await arranque(async () => jsonGh(10, 100), async () => tablaOp(50, 840));
    expect(l).toMatch(/cupo: 1password-cuenta uso: 84 % reinicio: \d\d:\d\d \(en 120 min\)|\(en 2 h\)/);
  });

  it("si no se puede leer un cupo, no falla: lo dice con un motivo y sigue con el otro", async () => {
    const l = await arranque(async () => jsonGh(10, 4600), async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); });
    expect(l).toContain("cupo: github-graphql uso: 92 %");
    expect(l).toContain("cupo sin ver: 1password motivo: sin-op");
  });

  it("si no se puede leer ninguno y nada está alto, solo dice «cupo sin ver» (no lanza)", async () => {
    const l = await arranque(async () => { throw new Error("red"); }, async () => "basura");
    expect(l).toBe("cupo sin ver: github motivo: sin-respuesta; cupo sin ver: 1password motivo: formato-raro.");
  });

  it("si todo se cuelga, pasado el tope calla y no espera", async () => {
    const t = Date.now();
    const l = await arranque(() => new Promise(() => {}), () => new Promise(() => {}), { tope: 60 });
    expect(l).toBeNull();
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("hace UNA llamada por fuente y la caché sirve al siguiente arranque", async () => {
    const dir = dirNuevo();
    const gh = vi.fn(async () => jsonGh(10, 4500));
    const op = vi.fn(async () => tablaOp(50, 100));
    const uno = await avisoDeCupos({ gh, op, dir, ahora: AHORA, registrar: () => {} });
    const dos = await avisoDeCupos({ gh, op, dir, ahora: AHORA + MIN, registrar: () => {} });
    expect(gh).toHaveBeenCalledTimes(1);
    expect(op).toHaveBeenCalledTimes(1);
    expect(dos).toBe(uno.replace("en 30 min", "en 29 min"));
  });

  it(`pasados ${TTL_CUPOS_MIN} min se vuelve a preguntar`, async () => {
    const dir = dirNuevo();
    const gh = vi.fn(async () => jsonGh(10, 100));
    const op = vi.fn(async () => tablaOp(50, 100));
    await avisoDeCupos({ gh, op, dir, ahora: Date.now(), registrar: () => {} });
    // la caché se fecha por el reloj del disco: se simula envejecida pidiendo con TTL ya vencido
    await avisoDeCupos({ gh, op, dir, ahora: Date.now() + (TTL_CUPOS_MIN + 1) * MIN, registrar: () => {} });
    expect(gh).toHaveBeenCalledTimes(2);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("un fallo no se guarda en la caché: el siguiente arranque lo intenta otra vez", async () => {
    const dir = dirNuevo();
    const gh = vi.fn(async () => { throw new Error("red"); });
    const op = vi.fn(async () => tablaOp(1, 1));
    await avisoDeCupos({ gh, op, dir, ahora: AHORA, registrar: () => {} });
    await avisoDeCupos({ gh, op, dir, ahora: AHORA + MIN, registrar: () => {} });
    expect(gh).toHaveBeenCalledTimes(2);
  });

  it("la línea se anota para poder contarla", async () => {
    const anotadas = [];
    const l = await avisoDeCupos({ gh: async () => jsonGh(0, 4800), op: async () => tablaOp(0, 0), dir: dirNuevo(), ahora: AHORA, registrar: (x) => anotadas.push(x) });
    expect(anotadas).toEqual([l]);
  });
});

describe("el arranque", () => {
  it("sigue siendo JavaScript válido, lanza los cupos a la vez que lo demás y los espera al final", () => {
    const ruta = fileURLToPath(new URL("../.claude/hooks/arranque.mjs", import.meta.url));
    execFileSync(process.execPath, ["--check", ruta]);
    const src = readFileSync(ruta, "utf8");
    expect(src).toContain("const cupos = avisoDeCupos()");
    expect(src).toContain("await cupos");
    expect(src.indexOf("const cupos = avisoDeCupos()")).toBeLessThan(src.indexOf('git("fetch"'));
  });
});
