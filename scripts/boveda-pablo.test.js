import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ejecutar, enSesionDeClaude, sinTokens, PASOS } from "./boveda-pablo.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUENTE = readFileSync(join(AQUI, "boveda-pablo.mjs"), "utf8");
const TOKEN = `ops_${"Z".repeat(60)}`;

/** Efectos de mentira: apuntan qué se llamó, en qué orden, y todo lo que se imprimió. */
function mundo(sobre = {}) {
  const llamadas = [];
  const salida = [];
  const fx = {
    env: {},
    log: (t) => salida.push(t),
    opApp: (args) => {
      llamadas.push(`opApp ${args.slice(0, 2).join(" ")}`);
      if (args[0] === "vault") return { status: 0, stdout: JSON.stringify([{ name: "HoMenu" }, { name: "HoMenu-sesiones" }]), stderr: "" };
      if (args[0] === "service-account") return { status: 0, stdout: `${TOKEN}\n`, stderr: "" };
      return { status: 1, stdout: "", stderr: "?" };
    },
    opServicio: () => ({ status: 0, stdout: JSON.stringify([{ name: "HoMenu" }]), stderr: "" }),
    hayTokenEnLlavero: () => true,
    hijo: (script, args, o) => {
      llamadas.push(`hijo ${script} ${args.join(" ")} pablo=${o.conVarPablo}`);
      return { status: 0, salida: args[0] === "--si" ? "copiada «Groq» (GROQ_API_KEY): COINCIDEN\nsalto  «fal»: ya existe en HoMenu-sesiones" : "BIEN  algo\nTodo bien" };
    },
    guardarEnLlavero: (t) => {
      llamadas.push("llavero");
      llamadas.tokenRecibido = t;
      return { status: 0, salida: 'llavero recurso: "x" usuario: y resultado: COINCIDEN' };
    },
    ...sobre,
  };
  return { fx, llamadas, salida };
}
const todo = (salida) => salida.join("\n");

describe("boveda-pablo: se niega dentro de una sesión de Claude Code", () => {
  it("detecta las marcas de Claude Code en el entorno", () => {
    expect(enSesionDeClaude({ CLAUDECODE: "1" })).toEqual(["CLAUDECODE"]);
    expect(enSesionDeClaude({ CLAUDE_CODE_ENTRYPOINT: "cli" })).toEqual(["CLAUDE_CODE_ENTRYPOINT"]);
    expect(enSesionDeClaude({ PATH: "x" })).toEqual([]);
  });

  it("con la marca no llama a nada y sale con 2", () => {
    const { fx, llamadas, salida } = mundo({ env: { CLAUDECODE: "1" } });
    expect(ejecutar(fx)).toBe(2);
    expect([...llamadas]).toEqual([]);
    expect(todo(salida)).toMatch(/Me niego/);
  });

  it("el script de verdad se niega sin tocar 1Password (proceso real con la marca puesta)", () => {
    const r = spawnSync(process.execPath, [join(AQUI, "boveda-pablo.mjs")], { env: { ...process.env, CLAUDECODE: "1" }, encoding: "utf8", timeout: 20000 });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/Me niego/);
  });

  it("la detección no se debilita: las cinco marcas siguen", () => {
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT", "CLAUDE_PROJECT_DIR", "AI_AGENT"]) {
      expect(enSesionDeClaude({ [k]: "x" })).toEqual([k]);
    }
  });
});

describe("boveda-pablo: orden y camino feliz", () => {
  it("1 bóveda, 2 copiar (con la variable), 3 cuenta → llavero, 4 comprobar (sin la variable)", () => {
    const { fx, llamadas, salida } = mundo({ opServicio: () => ({ status: 0, stdout: JSON.stringify([{ name: "HoMenu" }]), stderr: "" }) });
    expect(ejecutar(fx)).toBe(0);
    expect([...llamadas]).toEqual([
      "opApp vault list",
      "hijo boveda-sesiones.mjs --si pablo=true",
      "opApp service-account create",
      "llavero",
      "hijo boveda-sesiones.mjs --comprobar pablo=false",
    ]);
    expect(todo(salida)).toMatch(/anular «MenuPlan PC Pablo»/);
    expect(todo(salida)).toMatch(/Integrar con 1Password CLI/);
  });

  it("la lista de pasos está en el orden pedido", () => {
    expect(PASOS.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it("el token llega al llavero por la función de stdin, entero", () => {
    const { fx, llamadas } = mundo();
    ejecutar(fx);
    expect(llamadas.tokenRecibido).toBe(TOKEN);
  });
});

describe("boveda-pablo: idempotencia", () => {
  it("si el llavero ya tiene la cuenta de sesiones, no crea otra y lo dice", () => {
    const { fx, llamadas, salida } = mundo({ opServicio: () => ({ status: 0, stdout: JSON.stringify([{ name: "HoMenu-sesiones" }]), stderr: "" }) });
    expect(ejecutar(fx)).toBe(0);
    expect(llamadas.some((l) => l.startsWith("opApp service-account"))).toBe(false);
    expect(llamadas).not.toContain("llavero");
    expect(todo(salida)).toMatch(/YA ESTABA: el llavero ya tiene/);
  });

  it("si la copia solo salta fichas, lo marca como ya estaba", () => {
    const { fx, salida } = mundo({ hijo: (s, a) => ({ status: 0, salida: a[0] === "--si" ? "salto  «fal»: ya existe" : "Todo bien" }) });
    ejecutar(fx);
    expect(todo(salida)).toMatch(/YA ESTABA: fichas copiadas: 0, ya estaban: 1/);
  });
});

describe("boveda-pablo: nunca imprime el token", () => {
  it("ni en el camino feliz ni cuando el llavero devuelve el token en su mensaje", () => {
    for (const sobre of [{}, { guardarEnLlavero: () => ({ status: 1, salida: sinTokens(`fallo ${TOKEN}`) }) }, { opApp: (a) => a[0] === "vault" ? { status: 0, stdout: '[{"name":"HoMenu-sesiones"}]', stderr: "" } : { status: 1, stdout: "", stderr: `error ${TOKEN}` } }]) {
      const { fx, salida } = mundo({ opServicio: () => ({ status: 0, stdout: "[]", stderr: "" }), ...sobre });
      ejecutar(fx);
      expect(todo(salida)).not.toContain(TOKEN);
      expect(todo(salida)).not.toMatch(/ops_Z/);
    }
  });

  it("sinTokens tapa cualquier ops_…", () => {
    expect(sinTokens(`x ${TOKEN} y`)).toBe("x ops_… y");
  });

  it("el código no escribe el token en disco, entorno ni pantalla", () => {
    expect(FUENTE).not.toMatch(/writeFileSync|appendFileSync|setx|OP_SERVICE_ACCOUNT_TOKEN\s*=|process\.env\.OP_SERVICE_ACCOUNT_TOKEN/);
    expect(FUENTE).not.toMatch(/(?:console\.log|fx\.log|log)\(\s*[^)]*\btoken\b/);
    expect(FUENTE).not.toMatch(/--reveal/);
  });

  it("MENUPLAN_OP_PABLO se restaura tras la llamada a la app y no se asigna a ciegas", () => {
    expect(FUENTE).toMatch(/finally\s*{[^}]*delete process\.env\[VAR_OP_PABLO\]/);
    expect(FUENTE).not.toMatch(/process\.env\.MENUPLAN_OP_PABLO\s*=/);
  });
});

describe("boveda-pablo: cada paso falla cerrado", () => {
  const casos = [
    ["paso 1: 1Password no contesta", { opApp: () => ({ status: 1, stdout: "", stderr: "connecting to desktop app timed out" }) }, 1, ["opApp"]],
    ["paso 1: no hay op", { opApp: () => ({ status: 1, stdout: "", stderr: "", error: { code: "ENOENT" } }) }, 1, ["opApp"]],
    ["paso 1: no existe la bóveda", { opApp: () => ({ status: 0, stdout: '[{"name":"HoMenu"}]', stderr: "" }) }, 1, ["opApp"]],
    ["paso 2: la copia falla", { hijo: () => ({ status: 1, salida: "FALLA «Groq»" }) }, 1, ["opApp vault list", "hijo boveda-sesiones.mjs --si"]],
  ];
  for (const [nombre, sobre, codigo] of casos) {
    it(`${nombre}: sale ${codigo}, no sigue y no crea cuenta`, () => {
      const { fx, llamadas, salida } = mundo(sobre);
      const hechas = [];
      const base = fx.hijo;
      fx.hijo = (...a) => { hechas.push(a[0]); return base(...a); };
      expect(ejecutar(fx)).toBe(codigo);
      expect(llamadas.some((l) => l.startsWith("opApp service-account"))).toBe(false);
      expect(llamadas).not.toContain("llavero");
      expect(hechas.filter((h) => h === "boveda-sesiones.mjs").length).toBeLessThanOrEqual(1);
      expect(todo(salida)).toMatch(/MAL/);
      expect(todo(salida)).toMatch(/SIN HACER/);
    });
  }

  it("paso 3: si op no devuelve un token, no guarda nada ni comprueba", () => {
    const { fx, llamadas } = mundo({
      opServicio: () => ({ status: 0, stdout: "[]", stderr: "" }),
      opApp: (a) => a[0] === "vault" ? { status: 0, stdout: '[{"name":"HoMenu-sesiones"}]', stderr: "" } : { status: 0, stdout: "[ERROR] timed out", stderr: "" },
    });
    expect(ejecutar(fx)).toBe(1);
    expect(llamadas).not.toContain("llavero");
    expect(llamadas.some((l) => l.includes("--comprobar"))).toBe(false);
  });

  it("paso 3: si el llavero no da COINCIDEN, falla y no comprueba", () => {
    const { fx, llamadas } = mundo({ opServicio: () => ({ status: 0, stdout: "[]", stderr: "" }), guardarEnLlavero: () => ({ status: 0, salida: "resultado: NO COINCIDEN" }) });
    expect(ejecutar(fx)).toBe(1);
    expect(llamadas.some((l) => l.includes("--comprobar"))).toBe(false);
  });

  it("paso 4: la comprobación en MAL da fallo y avisa de no anular la vieja", () => {
    const { fx, salida } = mundo({ hijo: (s, a) => ({ status: a[0] === "--comprobar" ? 1 : 0, salida: "MAL  x" }) });
    expect(ejecutar(fx)).toBe(1);
    expect(todo(salida)).toMatch(/No anules todavía/);
    expect(todo(salida)).not.toMatch(/Todo ha salido BIEN/);
  });

  it("un error inesperado en un paso también para", () => {
    const { fx } = mundo({ hijo: () => { throw new Error("boom"); } });
    expect(ejecutar(fx)).toBe(1);
  });
});
