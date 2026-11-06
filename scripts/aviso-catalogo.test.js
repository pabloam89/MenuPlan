import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PREFIJO_RAMA, textoDeAviso } from "./aviso-catalogo.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const pr = { number: 1, url: "https://github.com/x/y/pull/1" };
const base = { atascados: [], urlRun: "https://run" };

describe("textoDeAviso", () => {
  it.each(["failure", "cancelled"])("avisa si el cron acaba en %s, con el enlace", (resultado) => {
    expect(textoDeAviso({ ...base, resultado })).toContain("https://run");
  });

  it("el martes avisa de un PR que sigue abierto", () => {
    expect(textoDeAviso({ ...base, resultado: "skipped", atascados: [pr] })).toContain(pr.url);
  });

  it("calla si el cron va bien o el martes no queda nada", () => {
    expect(textoDeAviso({ ...base, resultado: "success" })).toBeNull();
    expect(textoDeAviso({ ...base, resultado: "skipped" })).toBeNull();
  });

  it("el lunes, recién abierto, un PR no es un atasco", () => {
    expect(textoDeAviso({ ...base, resultado: "success", atascados: [pr] })).toBeNull();
  });
});

describe("mercadona-sync.yml avisa", () => {
  const wf = readFileSync(join(RAIZ, ".github/workflows/mercadona-sync.yml"), "utf8");
  const martes = wf.match(/cron: "([^"]+)"\s*# martes/)?.[1];

  it("el job avisar corre pase lo que pase con sync, con las claves del vigía", () => {
    const job = wf.slice(wf.indexOf("  avisar:"));
    expect(job).toMatch(/needs: sync/);
    expect(job).toMatch(/if: always\(\)/);
    expect(job).toMatch(/environment: vigia/);
    expect(job).toMatch(/scripts\/aviso-catalogo\.mjs/);
  });

  it("busca los PR con el prefijo de rama que usa el cron", () => {
    expect(wf).toContain(`RAMA="${PREFIJO_RAMA}-`);
  });

  it("la pasada del martes no baja el catálogo", () => {
    expect(martes).toBeTruthy();
    expect(wf).toContain(`if: github.event.schedule != '${martes}'`);
  });
});
