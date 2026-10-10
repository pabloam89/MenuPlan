import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `op` de mentira: responde a `op inject` con «VALOR-de-<dirección>» y apunta
// cada llamada, para ver cuántas se hacen y con qué token.
const llamadas = [];
vi.mock("node:child_process", () => ({
  execFileSync: (cmd, args, opts) => {
    llamadas.push({ cmd, args, token: opts?.env?.OP_SERVICE_ACCOUNT_TOKEN, input: opts?.input });
    if (cmd !== "op") throw new Error(`no se esperaba ${cmd}`);
    if (!opts?.input) {
      // Una llamada sin plantilla (opPorLaApp): apunta y devuelve o falla a voluntad.
      if (globalThis.__sinOp) throw Object.assign(new Error("spawn op ENOENT"), { code: "ENOENT" });
      if (globalThis.__falloApp) throw Object.assign(new Error("Command failed"), { status: 1, stdout: "", stderr: "[ERROR] no autorizado\nsegunda linea" });
      return `salida de op ${args.join(" ")}`;
    }
    if (globalThis.__sinOp) throw Object.assign(new Error("spawn op ENOENT"), { code: "ENOENT" });
    // Como `op inject`: basta una dirección que no existe para que falle entera.
    const mala = [...globalThis.__noExisten].find((ref) => opts.input.includes(`{{ ${ref} }}`));
    if (mala) throw Object.assign(new Error("Command failed: op inject"), { status: 1, stderr: `[ERROR] could not resolve item UUID for ${mala}\n` });
    return opts.input.split("\n").map((l) => l.replace(/\{\{ (op:\/\/[^}]+) \}\}/, (_, ref) => `VALOR-de-${ref.trim()}`)).join("\n");
  },
}));

const { cargarEnv, enOtraBoveda, esReferencia, leerEnv, leerFichero, opPorLaApp } = await import("./env.mjs");

const NOMBRES = ["PRUEBA_A", "PRUEBA_B", "PRUEBA_C", "PRUEBA_LLANA", "PRUEBA_D", "PRUEBA_E", "PRUEBA_F", "PRUEBA_G"];
beforeEach(() => {
  llamadas.length = 0;
  globalThis.__sinOp = false;
  globalThis.__noExisten = new Set();
  process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_de_prueba";
});
afterEach(() => {
  for (const k of NOMBRES) delete process.env[k];
  delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
});

describe("leerFichero", () => {
  it("quita comillas, ignora comentarios y líneas sin valor", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"));
    const ruta = join(dir, ".env.local");
    writeFileSync(ruta, '# comentario\nA="con comillas"\nB=op://HoMenu/Item/B\r\nSOLO_NOMBRE\nVACIA=\nC=\'simples\'\n');
    expect(leerFichero(ruta)).toEqual({ A: "con comillas", B: "op://HoMenu/Item/B", C: "simples" });
  });

  it("sin fichero, vacío (el CI no tiene .env.local)", () => {
    expect(leerFichero(join(tmpdir(), "no-existe", ".env.local"))).toEqual({});
  });
});

describe("leerEnv", () => {
  it("un valor en claro del entorno sale tal cual, sin llamar a op", () => {
    process.env.PRUEBA_LLANA = "clave-en-claro";
    expect(leerEnv("PRUEBA_LLANA")).toBe("clave-en-claro");
    expect(llamadas).toEqual([]);
  });

  it("una dirección op:// se pide a 1Password con el token de la service account", () => {
    process.env.PRUEBA_A = "op://HoMenu/Uno/PRUEBA_A";
    expect(leerEnv("PRUEBA_A")).toBe("VALOR-de-op://HoMenu/Uno/PRUEBA_A");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].token).toBe("ops_de_prueba");
  });

  it("sin el comando op, el error lo dice en llano", () => {
    globalThis.__sinOp = true;
    process.env.PRUEBA_B = "op://HoMenu/Otro/PRUEBA_B";
    expect(() => leerEnv("PRUEBA_B")).toThrow(/no encuentro el comando `op`/);
  });

  it("obligatoria y ausente, lanza", () => {
    expect(() => leerEnv("PRUEBA_NO_EXISTE_NUNCA", { obligatoria: true })).toThrow(/Falta PRUEBA_NO_EXISTE_NUNCA/);
  });
});

describe("cargarEnv", () => {
  it("resuelve varias direcciones en UNA sola llamada y deja lo llano como está", () => {
    process.env.PRUEBA_A = "op://HoMenu/Varias/PRUEBA_A";
    process.env.PRUEBA_C = "op://HoMenu/Varias/PRUEBA_C";
    process.env.PRUEBA_LLANA = "llana";
    cargarEnv(["PRUEBA_A", "PRUEBA_C", "PRUEBA_LLANA"]);
    expect(llamadas).toHaveLength(1);
    expect(process.env.PRUEBA_A).toBe("VALOR-de-op://HoMenu/Varias/PRUEBA_A");
    expect(process.env.PRUEBA_C).toBe("VALOR-de-op://HoMenu/Varias/PRUEBA_C");
    expect(process.env.PRUEBA_LLANA).toBe("llana");
    expect(Object.values(process.env).some(esReferencia)).toBe(false);
  });
});

describe("plan B entre bóvedas (#299): HoMenu-sesiones y HoMenu", () => {
  it("enOtraBoveda cambia solo entre las dos bóvedas de MenuPlan", () => {
    expect(enOtraBoveda("op://HoMenu-sesiones/Groq/GROQ_API_KEY")).toBe("op://HoMenu/Groq/GROQ_API_KEY");
    expect(enOtraBoveda("op://HoMenu/Groq/GROQ_API_KEY")).toBe("op://HoMenu-sesiones/Groq/GROQ_API_KEY");
    expect(enOtraBoveda("op://Panel HoMenu/Postgres del panel/password")).toBeNull();
    expect(enOtraBoveda("op://Private/Hetzner/password")).toBeNull();
  });

  it("una dirección de HoMenu-sesiones que aún no existe se lee de HoMenu y lo avisa en una línea", () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.__noExisten.add("op://HoMenu-sesiones/Nueva/PRUEBA_D");
    process.env.PRUEBA_D = "op://HoMenu-sesiones/Nueva/PRUEBA_D";
    process.env.PRUEBA_E = "op://HoMenu-sesiones/Ya/PRUEBA_E";
    cargarEnv(["PRUEBA_D", "PRUEBA_E"]);
    expect(process.env.PRUEBA_D).toBe("VALOR-de-op://HoMenu/Nueva/PRUEBA_D");
    expect(process.env.PRUEBA_E).toBe("VALOR-de-op://HoMenu-sesiones/Ya/PRUEBA_E");
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0][0]).toBe("env-boveda clave: PRUEBA_D de: HoMenu-sesiones a: HoMenu motivo: respaldo");
    // Nunca el valor en el aviso.
    expect(aviso.mock.calls[0][0]).not.toMatch(/VALOR/);
    aviso.mockRestore();
  });

  it("un .env.local viejo (HoMenu) sigue leyendo cuando la clave ya se movió a HoMenu-sesiones", () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.__noExisten.add("op://HoMenu/Movida/PRUEBA_F");
    process.env.PRUEBA_F = "op://HoMenu/Movida/PRUEBA_F";
    expect(leerEnv("PRUEBA_F")).toBe("VALOR-de-op://HoMenu-sesiones/Movida/PRUEBA_F");
    aviso.mockRestore();
  });

  it("si no está en ninguna de las dos, falla con su nombre y no avisa de ningún respaldo", () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.__noExisten.add("op://HoMenu-sesiones/Nada/PRUEBA_G");
    globalThis.__noExisten.add("op://HoMenu/Nada/PRUEBA_G");
    process.env.PRUEBA_G = "op://HoMenu-sesiones/Nada/PRUEBA_G";
    expect(() => leerEnv("PRUEBA_G")).toThrow(/No pude leer de 1Password PRUEBA_G: \[ERROR\] could not resolve/);
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("tolerante (Vite): la que no se puede leer queda vacía, con aviso y sin la dirección; las demás se leen", () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.__noExisten.add("op://HoMenu/Admin/PRUEBA_B");
    globalThis.__noExisten.add("op://HoMenu-sesiones/Admin/PRUEBA_B");
    process.env.PRUEBA_B = "op://HoMenu/Admin/PRUEBA_B";
    process.env.PRUEBA_C = "op://HoMenu-sesiones/Tolerante/PRUEBA_C";
    cargarEnv(["PRUEBA_B", "PRUEBA_C"], { tolerante: true });
    expect(process.env.PRUEBA_B).toBe("");
    expect(process.env.PRUEBA_C).toBe("VALOR-de-op://HoMenu-sesiones/Tolerante/PRUEBA_C");
    expect(aviso.mock.calls.map((c) => c[0])).toEqual(["env-boveda clave: PRUEBA_B motivo: sin-acceso"]);
    aviso.mockRestore();
  });

  it("sin tolerante, la misma clave para el script con su nombre", () => {
    globalThis.__noExisten.add("op://HoMenu/Admin2/PRUEBA_B");
    globalThis.__noExisten.add("op://HoMenu-sesiones/Admin2/PRUEBA_B");
    process.env.PRUEBA_B = "op://HoMenu/Admin2/PRUEBA_B";
    expect(() => cargarEnv(["PRUEBA_B"])).toThrow(/No pude leer de 1Password PRUEBA_B/);
  });

  it("con MENUPLAN_OP_PABLO=1, op va sin la service account (app de escritorio, aprobación de Pablo)", () => {
    process.env.MENUPLAN_OP_PABLO = "1";
    try {
      process.env.PRUEBA_A = "op://HoMenu/Pablo/PRUEBA_A";
      leerEnv("PRUEBA_A");
      expect(llamadas.at(-1).token).toBeUndefined();
    } finally {
      delete process.env.MENUPLAN_OP_PABLO;
    }
    process.env.PRUEBA_C = "op://HoMenu/Pablo/PRUEBA_C";
    leerEnv("PRUEBA_C");
    expect(llamadas.at(-1).token).toBe("ops_de_prueba");
  });

  it("de cualquier otra bóveda no hay respaldo", () => {
    globalThis.__noExisten.add("op://Panel HoMenu/X/PRUEBA_A");
    process.env.PRUEBA_A = "op://Panel HoMenu/X/PRUEBA_A";
    expect(() => leerEnv("PRUEBA_A")).toThrow(/PRUEBA_A/);
    expect(llamadas.some((l) => l.input.includes("HoMenu-sesiones"))).toBe(false);
  });
});

describe("sin token, falla cerrado (#328)", () => {
  it("sin token ni MENUPLAN_OP_PABLO no llama a op (ni cae a la app de escritorio); con la variable, sí y sin token", async () => {
    delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
    vi.resetModules();
    const fresco = await import("./env.mjs");
    process.env.PRUEBA_A = "op://HoMenu-sesiones/X/PRUEBA_A";
    expect(() => fresco.leerEnv("PRUEBA_A")).toThrow(/No pude leer de 1Password PRUEBA_A: no hay token de la service account/);
    expect(() => fresco.cargarEnv(["PRUEBA_A"], { tolerante: true })).toThrow(/no hay token/);
    expect(() => fresco.entornoOp()).toThrow(/MENUPLAN_OP_PABLO=1/);
    expect(llamadas.filter((l) => l.cmd === "op")).toEqual([]);
    process.env.MENUPLAN_OP_PABLO = "1";
    try {
      expect(fresco.leerEnv("PRUEBA_A")).toBe("VALOR-de-op://HoMenu-sesiones/X/PRUEBA_A");
      expect(llamadas.filter((l) => l.cmd === "op").at(-1).token).toBeUndefined();
    } finally {
      delete process.env.MENUPLAN_OP_PABLO;
    }
  });
});

describe("opPorLaApp: el único camino a la app de escritorio (#328)", () => {
  it("sin MENUPLAN_OP_PABLO=1 no llama a op: la app solo es de Pablo", () => {
    const r = opPorLaApp(["vault", "list"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/MENUPLAN_OP_PABLO=1/);
    expect(llamadas).toEqual([]);
  });

  it("con la variable, llama a op sin token aunque lo haya, y devuelve estado, salida y error", () => {
    process.env.MENUPLAN_OP_PABLO = "1";
    try {
      const bien = opPorLaApp(["vault", "list"]);
      expect(bien).toMatchObject({ status: 0, stdout: "salida de op vault list" });
      expect(llamadas.at(-1).token).toBeUndefined();
      globalThis.__falloApp = true;
      expect(opPorLaApp(["read", "op://x/y/z"])).toMatchObject({ status: 1, stderr: expect.stringContaining("no autorizado") });
      globalThis.__sinOp = true;
      expect(opPorLaApp(["whoami"]).error?.code).toBe("ENOENT");
    } finally {
      delete process.env.MENUPLAN_OP_PABLO;
      globalThis.__falloApp = false;
    }
  });

  it("no queda ningún otro camino a la app en los scripts: nadie borra el token a mano", () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const sueltos = [];
    for (const f of ["..", "."].flatMap((d) => readdirSync(join(aqui, d)).filter((x) => x.endsWith(".mjs")).map((x) => join(aqui, d, x)))) {
      if (f.endsWith("env.mjs")) continue;
      if (/delete\s+\w+\.OP_SERVICE_ACCOUNT_TOKEN|OP_SERVICE_ACCOUNT_TOKEN:\s*_/.test(readFileSync(f, "utf8"))) sueltos.push(f);
    }
    expect(sueltos).toEqual([]);
  });
});
