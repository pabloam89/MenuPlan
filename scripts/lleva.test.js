import { describe, expect, it } from "vitest";

import {
  HORAS_PARADA, cruce, desmarcar, inventario, leerMarcas, leerWorktrees, lineasDeLleva, marcar, numeroDeRama, parecidosEnGit, sinNumero, textoDeRama,
} from "./lib/lleva.mjs";

const AHORA = new Date("2026-10-09T08:00:00Z");
const hace = (horas) => new Date(AHORA - horas * 3_600_000);

/**
 * Un GitHub de mentira: guarda los comentarios de un issue y contesta a las
 * mismas llamadas de `gh api` que hace lleva.mjs. Así se prueba el ciclo
 * marcar → retirar sin tocar los issues reales de nadie (no hay otra forma
 * de probarlo sin ensuciar GitHub).
 */
function githubFalso({ sinRed = false } = {}) {
  const comentarios = [{ id: 1, body: "un comentario cualquiera" }];
  let siguiente = 2;
  const llamadas = [];
  const gh = (...args) => {
    llamadas.push(args);
    if (sinRed) throw Object.assign(new Error("fallo"), { stderr: "error connecting to api.github.com\n" });
    const [, a, b, c, d] = args; // api [--paginate|-X] …
    if (a === "--paginate") return comentarios.map((x) => JSON.stringify(x)).join("\n");
    const cuerpo = args[args.indexOf("-f") + 1]?.replace(/^body=/, "");
    if (a === "-X" && b === "POST") {
      comentarios.push({ id: siguiente++, body: cuerpo });
      return "";
    }
    if (a === "-X" && b === "PATCH") {
      comentarios.find((x) => x.id === Number(c.split("/").pop())).body = cuerpo;
      return "";
    }
    if (a === "-X" && b === "DELETE") {
      comentarios.splice(comentarios.findIndex((x) => x.id === Number(c.split("/").pop())), 1);
      return "";
    }
    throw new Error(`llamada inesperada: ${args.join(" ")} ${d ?? ""}`);
  };
  return { gh, comentarios, llamadas };
}

describe("lleva: número de issue de una rama", () => {
  it.each([["ops/271-quien-lleva", 271], ["datos/233-rol-lectura", 233], ["lola/229-alergias-silencio", 229]])("%s → %i", (r, n) =>
    expect(numeroDeRama(r)).toBe(n));
  it.each(["ops/dependabot-auto", "fix/alergias-libres", "staging", "datos/0092-aplicada", "datos/traer-0081", null])("%s no lleva", (r) =>
    expect(numeroDeRama(r)).toBeNull());
});

describe("lleva: la marca en el issue (tarea la pone, retirar la quita)", () => {
  const datos = { rama: "ops/271-quien-lleva", carpeta: "MenuPlan-quien-lleva", desde: AHORA };

  it("tarea deja el issue marcado con su rama y su carpeta", () => {
    const { gh, comentarios } = githubFalso();
    expect(marcar(271, datos, gh).ok).toBe(true);
    expect(leerMarcas(comentarios)).toEqual([{ rama: "ops/271-quien-lleva", carpeta: "MenuPlan-quien-lleva", desde: AHORA }]);
  });

  it("es idempotente: repetirla edita la marca, no añade otra", () => {
    const { gh, comentarios } = githubFalso();
    marcar(271, datos, gh);
    marcar(271, { ...datos, desde: hace(-1) }, gh);
    expect(leerMarcas(comentarios)).toHaveLength(1);
    expect(comentarios).toHaveLength(2); // el comentario ajeno y la marca
  });

  it("dos ramas sobre el mismo issue dejan dos marcas: justo lo que hay que ver", () => {
    const { gh, comentarios } = githubFalso();
    marcar(271, datos, gh);
    marcar(271, { rama: "ops/271-otra", carpeta: "MenuPlan-otra" }, gh);
    expect(leerMarcas(comentarios).map((m) => m.rama)).toEqual(["ops/271-quien-lleva", "ops/271-otra"]);
  });

  it("retirar la quita y no toca lo demás", () => {
    const { gh, comentarios } = githubFalso();
    marcar(271, datos, gh);
    marcar(271, { rama: "ops/271-otra", carpeta: "MenuPlan-otra" }, gh);
    const r = desmarcar(271, "ops/271-quien-lleva", gh);
    expect(r).toMatchObject({ ok: true, quitadas: 1 });
    expect(leerMarcas(comentarios).map((m) => m.rama)).toEqual(["ops/271-otra"]);
    expect(comentarios.some((c) => c.body === "un comentario cualquiera")).toBe(true);
  });

  it("quitar una marca que no está no falla", () => {
    const { gh } = githubFalso();
    expect(desmarcar(271, "ops/271-quien-lleva", gh)).toMatchObject({ ok: true, quitadas: 0 });
  });

  it("sin red es un aviso que dice qué hacer, no un error", () => {
    const { gh } = githubFalso({ sinRed: true });
    const m = marcar(271, datos, gh);
    expect(m.ok).toBe(false);
    expect(m.aviso).toMatch(/ops\/271-quien-lleva/);
    expect(m.aviso).toMatch(/api\.github\.com/);
    const d = desmarcar(271, datos.rama, gh);
    expect(d.ok).toBe(false);
    expect(d.aviso).toMatch(/Bórrala a mano/);
  });
});

describe("lleva: el inventario de carpetas y ramas vivas", () => {
  const porcelana = [
    "worktree C:/dev/MenuPlan\nHEAD aaa\nbranch refs/heads/staging",
    "worktree C:/dev/MenuPlan-medios\nHEAD bbb\nbranch refs/heads/ops/medios",
    "worktree C:/tmp/wt-ccr\nHEAD ccc\ndetached",
  ].join("\n\n");

  it("lee las carpetas con rama y salta las sueltas", () => {
    expect(leerWorktrees(porcelana).map((w) => w.rama)).toEqual(["staging", "ops/medios"]);
  });

  it("junta carpeta y GitHub en una fila, con el commit más reciente, y deja fuera lo ajeno", () => {
    const inv = inventario({
      worktrees: [
        { ruta: "C:/dev/MenuPlan", rama: "staging" },
        { ruta: "C:/dev/MenuPlan-medios", rama: "ops/medios", ultimo: hace(18) },
        { ruta: "C:/dev/MenuPlan-q", rama: "ops/271-q", ultimo: hace(1) },
      ],
      principal: "C:/dev/MenuPlan",
      remotas: [
        { rama: "ops/medios", ultimo: hace(20) },
        { rama: "dependabot/npm_and_yarn/x", ultimo: hace(2) },
        { rama: "ccr-1", ultimo: hace(2) },
        { rama: "rescate/dislikes", ultimo: hace(300) },
        { rama: "datos/ids-uuid", ultimo: hace(30) },
      ],
    });
    expect(inv.map((r) => r.rama)).toEqual(["datos/ids-uuid", "ops/271-q", "ops/medios"]);
    const medios = inv.find((r) => r.rama === "ops/medios");
    expect(medios).toMatchObject({ carpeta: "MenuPlan-medios", remota: true });
    expect(medios.ultimo).toEqual(hace(18));
    expect(inv.find((r) => r.rama === "datos/ids-uuid").carpeta).toBeNull();
  });
});

describe("lleva: el cruce encargo → rama → antigüedad", () => {
  const encargo = (number, extra = {}) => ({ number, state: "OPEN", labels: [{ name: "tipo:encargo" }], marcas: [], ...extra });
  const rama = (r, carpeta, horas) => ({ rama: r, carpeta, remota: false, ultimo: hace(horas), numero: numeroDeRama(r) });

  it("un encargo con rama viva dice cuál, en qué carpeta y desde cuándo", () => {
    const [f] = cruce([encargo(271)], [rama("ops/271-q", "MenuPlan-q", 0.5)], AHORA);
    expect(f.number).toBe(271);
    expect(f.ramas[0]).toMatchObject({ rama: "ops/271-q", carpeta: "MenuPlan-q", parada: false });
    expect(textoDeRama(f.ramas[0])).toBe("ops/271-q en MenuPlan-q, último commit hace 30 min");
  });

  it("sin commits desde hace más de HORAS_PARADA sale «posiblemente parada»; justo en el límite, no", () => {
    const [f] = cruce([encargo(1), encargo(2)], [rama("ops/1-a", "MenuPlan-a", HORAS_PARADA + 0.5), rama("ops/2-b", "MenuPlan-b", HORAS_PARADA)], AHORA);
    expect(f.ramas[0].parada).toBe(true);
    expect(textoDeRama(f.ramas[0])).toMatch(/posiblemente parada/);
    expect(cruce([encargo(2)], [rama("ops/2-b", "MenuPlan-b", HORAS_PARADA)], AHORA)[0].ramas[0].parada).toBe(false);
  });

  it("un encargo cerrado o sin rama no sale; una rama sin issue abierto tampoco", () => {
    expect(cruce([encargo(5, { state: "CLOSED" }), encargo(6)], [rama("ops/5-x", "MenuPlan-x", 1), rama("ops/dependabot-auto", "MenuPlan-d", 1)], AHORA)).toEqual([]);
  });

  it("una marca sin rama que se vea aquí (carpeta de otro PC) sale, contada desde la marca", () => {
    const [f] = cruce([encargo(9, { marcas: [{ rama: "ops/9-lejos", carpeta: "MenuPlan-lejos", desde: hace(10) }] })], [], AHORA);
    expect(f.ramas[0]).toMatchObject({ rama: "ops/9-lejos", marcada: true, vista: false, parada: true });
    expect(textoDeRama(f.ramas[0])).toMatch(/sin rama que se vea aquí/);
  });

  it("rama y marca de la misma rama son una sola fila, con la fecha del último commit", () => {
    const [f] = cruce([encargo(3, { marcas: [{ rama: "ops/3-a", carpeta: "MenuPlan-a", desde: hace(50) }] })], [rama("ops/3-a", "MenuPlan-a", 1)], AHORA);
    expect(f.ramas).toHaveLength(1);
    expect(f.ramas[0]).toMatchObject({ marcada: true, parada: false });
  });

  it("las ramas sin número son la excepción, y salen aparte", () => {
    const ramas = [rama("ops/271-q", "MenuPlan-q", 1), rama("ops/dependabot-auto", "MenuPlan-d", 15), rama("datos/0092-aplicada", null, 5)];
    expect(sinNumero(ramas).map((r) => r.rama)).toEqual(["ops/dependabot-auto", "datos/0092-aplicada"]);
  });

  it("el arranque cuenta encargos con rama, paradas y ramas sin número", () => {
    const issues = [encargo(1), encargo(2), encargo(3)];
    const ramas = [rama("ops/1-a", "MenuPlan-a", 0.2), rama("ops/2-b", "MenuPlan-b", 15), rama("ops/medios", "MenuPlan-medios", 3)];
    const l = lineasDeLleva(issues, ramas, AHORA);
    expect(l[0]).toMatch(/2 de 3 encargos abiertos tienen rama viva/);
    expect(l[1]).toMatch(/Posiblemente paradas.*#2 \(MenuPlan-b, 15,0 h\)/);
    expect(l[2]).toMatch(/1 ramas sin número de issue: ops\/medios/);
    expect(l.join("\n")).not.toMatch(/#1 \(/);
  });
});

describe("lleva: ramas y carpetas parecidas al título (--nuevo y /orquestar)", () => {
  const ramas = [
    { rama: "ops/dependabot-auto", carpeta: "MenuPlan-dependabot-auto", ultimo: hace(15), numero: null },
    { rama: "ops/248-planos-medidos", carpeta: "MenuPlan-planos", ultimo: hace(1), numero: 248 },
    { rama: "fix/alergias-libres", carpeta: null, ultimo: hace(14), numero: null },
  ];

  it("encuentra la rama cuyo nombre está en el título", () => {
    expect(parecidosEnGit(ramas, "Dependabot: lo pequeño entra solo").map((p) => p.rama)).toEqual(["ops/dependabot-auto"]);
    expect(parecidosEnGit(ramas, "Los planos se miden solos").map((p) => p.rama)).toEqual(["ops/248-planos-medidos"]);
  });

  it("no suelta una rama por compartir una sola palabra de varias", () => {
    const largas = [{ rama: "ops/copias-base-cifradas", carpeta: null, ultimo: hace(1), numero: null }];
    expect(parecidosEnGit(largas, "Base de datos nueva para el panel")).toEqual([]);
    expect(parecidosEnGit(largas, "Copias de la base cifradas")).toHaveLength(1);
    expect(parecidosEnGit(ramas, "Retirar lo muerto del catálogo")).toEqual([]);
  });
});

describe("lleva: sin número de issue, la tarea lo dice claro", () => {
  it("el aviso nombra el problema y ofrece --nuevo y el comando con número", async () => {
    const { avisoSinIssue } = await import("./tarea.mjs");
    const a = avisoSinIssue("ops/medios");
    expect(a).toMatch(/no lleva número de issue/);
    expect(a).toMatch(/npm run issues -- --nuevo/);
    expect(a).toMatch(/npm run tarea -- ops\/medios <número>/);
  });

  it("/orquestar manda mirar carpetas y ramas vivas antes de empezar, y ramas con número", async () => {
    const { readFileSync } = await import("node:fs");
    const texto = readFileSync(new URL("../.claude/commands/orquestar.md", import.meta.url), "utf8");
    expect(texto).toMatch(/git worktree list/);
    expect(texto).toMatch(/git branch -r/);
    expect(texto).toMatch(/npm run tarea -- <area>\/<nombre> <n>/);
  });
});
