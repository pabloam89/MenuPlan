import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

import { CUPOS, IDENTIDADES_CUPO, MOTIVOS_CUPO, TTL_CUPOS_MIN, UMBRAL_CUPO, avisoDeCupos, contarCupos, identidadDelEntorno, lineaDeCupos, motivoDeFallo, parsearGh, parsearOp, porcentaje } from "./lib/cupos.mjs";

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
const arranque = (gh, op, extra = {}) => avisoDeCupos({ gh, op, ghApp: async () => { throw Object.assign(new Error("sin-token"), { motivoCupo: "sin-token" }); }, identidad: "pablo", dir: dirNuevo(), ahora: AHORA, registrar: () => {}, ...extra });

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

describe("motivo sin-token y el hijo de op", () => {
  it("la falta de token de la service account (texto de entornoOp o código SIN_TOKEN) es sin-token, no sin-respuesta", () => {
    const e = new Error("Command failed: op\nno hay token de la service account (ni el entorno ni el llavero)");
    expect(motivoDeFallo(e, "1password")).toBe("sin-token");
    expect(motivoDeFallo({ code: "SIN_TOKEN", message: "x" }, "1password")).toBe("sin-token");
    expect(motivoDeFallo(new Error("otra cosa"), "1password")).toBe("sin-respuesta");
  });

  it("op se lanza directo (no por op.mjs ni con stdio), para que el tope mate a op mismo", () => {
    const src = readFileSync(fileURLToPath(new URL("./lib/cupos.mjs", import.meta.url)), "utf8");
    expect(src).toMatch(/lanzar\("op", \["service-account", "ratelimit"\]/);
    expect(src).not.toContain('op.mjs"');
    expect(src).not.toMatch(/stdio:/);
  });
});

describe("la identidad de gh no se mezcla", () => {
  it("sin GH_TOKEN es pablo; con él, app; y las dos están en el vocabulario", () => {
    expect(identidadDelEntorno({})).toBe("pablo");
    expect(identidadDelEntorno({ GH_TOKEN: "x" })).toBe("app");
    expect(IDENTIDADES_CUPO).toEqual(["pablo", "app"]);
  });

  it("la caché de Pablo y la de la App son ficheros distintos: una no responde por la otra", async () => {
    const dir = dirNuevo();
    const ghApp = vi.fn(async () => jsonGh(10, 100));
    const base = { op: async () => tablaOp(1, 1), ghApp, dir, ahora: AHORA, registrar: () => {} };
    // un arranque con la App en el entorno deja su lectura (baja) en la caché de la App
    expect(await avisoDeCupos({ ...base, gh: async () => jsonGh(10, 100), identidad: "app" })).toBeNull();
    // otro arranque, como Pablo, con GraphQL alto: la caché de la App no responde por él
    const ghPablo = vi.fn(async () => jsonGh(10, 4900));
    expect(await avisoDeCupos({ ...base, ahora: AHORA + MIN, gh: ghPablo, identidad: "pablo" })).toMatch(/identidad: pablo uso: 98 %/);
    expect(ghPablo).toHaveBeenCalledTimes(1);
  });

  it("la línea dice de qué identidad es el cupo; sin token de la App guardado, no dice nada de ella", async () => {
    const l = await arranque(async () => jsonGh(10, 4500), async () => tablaOp(1, 1));
    expect(l).toContain("cupo: github-graphql identidad: pablo uso: 90 %");
    expect(l).not.toContain("github-app");
    expect(l).not.toContain("sin ver");
  });

  it("espera a la identidad del arranque antes de mirar el token de la App, con tope", async () => {
    const orden = [];
    let suelta;
    const despuesDe = new Promise((ok) => (suelta = ok));
    const ghApp = async () => { orden.push("app"); return jsonGh(0, 4500); };
    const base = { gh: async () => jsonGh(0, 0), ghApp, op: async () => tablaOp(0, 0), identidad: "pablo", ahora: AHORA, registrar: () => {} };
    const p = avisoDeCupos({ ...base, dir: dirNuevo(), despuesDe });
    await new Promise((r) => setTimeout(r, 30));
    expect(orden).toEqual([]);
    orden.push("identidad");
    suelta();
    expect(await p).toMatch(/identidad: app/);
    expect(orden).toEqual(["identidad", "app"]);
    // y si la identidad no acaba, se mide igual pasado el tope de espera
    expect(await avisoDeCupos({ ...base, dir: dirNuevo(), despuesDe: new Promise(() => {}), esperaApp: 40 })).toMatch(/identidad: app/);
  });
});

describe("cupos.log tiene lector (npm run cuota)", () => {
  it("cuenta avisos por cupo e identidad y cupos sin ver por fuente y motivo", () => {
    const t = [
      "2026-10-11T10:00:00Z Cupos al 80 % o más (x) — cupo: github-graphql identidad: pablo uso: 88 % reinicio: 14:05 (en 30 min); cupo: 1password-cuenta uso: 95 % reinicio: 15:00 (en 2 h).",
      "2026-10-11T10:10:00Z Cupos al 80 % o más (x) — cupo: github-graphql identidad: pablo uso: 90 % reinicio: 14:05 (en 20 min); cupo sin ver: 1password motivo: sin-token.",
      "2026-10-11T10:20:00Z cupo sin ver: github motivo: sin-respuesta.",
    ].join("\n");
    expect(contarCupos(t)).toEqual({
      "aviso github-graphql/pablo": 2,
      "aviso 1password-cuenta": 1,
      "sin-ver 1password/sin-token": 1,
      "sin-ver github/sin-respuesta": 1,
    });
  });

  it("npm run cuota existe y lo imprime", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
    expect(pkg.scripts.cuota).toBe("node scripts/cuota.mjs");
    const dir = dirNuevo();
    writeFileSync(join(dir, "cupos.log"), "x cupo: github-rest identidad: app uso: 99 % reinicio: 1\n");
    const salida = execFileSync(process.execPath, [fileURLToPath(new URL("./cuota.mjs", import.meta.url))], { encoding: "utf8", env: { ...process.env, MENUPLAN_CUOTA_DIR: dir } });
    expect(salida).toContain("aviso github-rest/app: 1");
    expect(salida).toContain("gh.log (caller/api): sin líneas");
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
    expect(l).toMatch(/cupo: github-graphql identidad: pablo uso: 90 %/);
    expect(l).not.toContain("1password");
  });

  it("la cuenta de 1Password al 84 % avisa con su reinicio", async () => {
    const l = await arranque(async () => jsonGh(10, 100), async () => tablaOp(50, 840));
    expect(l).toMatch(/cupo: 1password-cuenta uso: 84 % reinicio: \d\d:\d\d \(en 120 min\)|\(en 2 h\)/);
  });

  it("si no se puede leer un cupo, no falla: lo dice con un motivo y sigue con el otro", async () => {
    const l = await arranque(async () => jsonGh(10, 4600), async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); });
    expect(l).toContain("cupo: github-graphql identidad: pablo uso: 92 %");
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
    // tiempo: margen 30x medido 2026-10-11 (suelto ~65 ms, tope 2000 ms)
    expect(Date.now() - t).toBeLessThan(2000);
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
    expect(src).toContain("const cupos = avisoDeCupos({ despuesDe: identidad })");
    expect(src).toContain("await cupos");
    expect(src.indexOf("const cupos = avisoDeCupos({ despuesDe: identidad })")).toBeLessThan(src.indexOf('git("fetch"'));
  });
});
