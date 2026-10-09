import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { recordatorioDeCasos, senalesDeFallo } from "./pendientes.mjs";

// El freno de los casos (#185): señales de fallo en la sesión y ningún caso registrado.
const uso = (id, name, input) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const res = (id, content, is_error = false) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });
const sesion = (...l) => l.join("\n");

describe("freno de los casos: señales de fallo", () => {
  it("informe de un agente bloqueado", () => {
    const r = senalesDeFallo(sesion(uso("a", "Agent", { prompt: "x" }), res("a", "## Informe\nESTADO: bloqueado\nRESUMEN: no pude")));
    expect(r.senales).toEqual(["informe de un agente con ESTADO: bloqueado"]);
    expect(r.registrado).toBe(false);
  });
  it("hallazgo bloqueante de un juez", () => {
    const r = senalesDeFallo(sesion(uso("a", "Agent", {}), res("a", "ESTADO: ok\nHALLAZGOS:\n- [bloqueante] a.js:3 — rompe")));
    expect(r.senales).toEqual(["informe de un agente con un hallazgo bloqueante"]);
  });
  it("el informe sano no es señal, ni la plantilla leída con Read", () => {
    expect(senalesDeFallo(sesion(uso("a", "Agent", {}), res("a", "ESTADO: ok\nHALLAZGOS:\n- ninguno"))).senales).toEqual([]);
    expect(senalesDeFallo(sesion(uso("a", "Read", { file_path: "x.md" }), res("a", "ESTADO: ok | bloqueado | fallo\n- [bloqueante|alto|medio|nit]"))).senales).toEqual([]);
  });

  it("vitest en rojo en un fichero que no tocaste", () => {
    const r = senalesDeFallo(sesion(uso("a", "Bash", { command: "npx vitest run src" }), res("a", " FAIL  src/lib/otro.test.js > algo\nTest Files  1 failed")));
    expect(r.senales[0]).toMatch(/vitest en rojo en otro\.test\.js/);
  });
  it("vitest en rojo en un test que escribiste tú (lo ves fallar a propósito): no es señal", () => {
    const t = sesion(
      uso("w", "Write", { file_path: "C:\\dev\\X\\src\\lib\\nuevo.test.js", content: "x" }),
      uso("a", "Bash", { command: "npx vitest run src/lib/nuevo.test.js" }),
      res("a", " FAIL  src/lib/nuevo.test.js > algo"),
    );
    expect(senalesDeFallo(t).senales).toEqual([]);
  });
  it("un FAIL en la salida de un comando que no es de tests no cuenta", () => {
    expect(senalesDeFallo(sesion(uso("a", "Bash", { command: "cat log" }), res("a", " FAIL  x.test.js"))).senales).toEqual([]);
  });

  it("la guardia te niega algo", () => {
    const r = senalesDeFallo(sesion(uso("a", "Bash", { command: "git add ." }), res("a", "[guardia] No se hace git add .", true)));
    expect(r.senales).toEqual(["la guardia te negó un comando"]);
  });
  it("las puertas de trámite (skills, «Casos:») no son un fallo", () => {
    const skill = res("a", "[guardia] Abre antes la skill `supabase` y reintenta", true);
    expect(senalesDeFallo(sesion(uso("a", "Bash", { command: "node scripts/apply-migration.mjs x" }), skill)).senales).toEqual([]);
    const casos = res("a", "[guardia] Falta la línea «Casos:» en el cuerpo del PR.", true);
    expect(senalesDeFallo(sesion(uso("a", "Bash", { command: "gh pr create" }), casos)).senales).toEqual([]);
  });
  it("leer un fichero que menciona [guardia] no es una denegación", () => {
    expect(senalesDeFallo(sesion(uso("a", "Read", { file_path: "g.mjs" }), res("a", "return `[guardia] ${r.motivo}`", true))).senales).toEqual([]);
  });
});

describe("freno de los casos: lo que cuenta como rastro", () => {
  it.each([
    'npm run issues -- --nuevo "x" --tipo caso --analisis abierto --area ops --cuerpo f.md',
    'npm run issues -- --nuevo "x" --area ops --tipo caso --cuerpo f.md',
    "npm run issues -- --colgar 301 185",
    "gh issue comment 301 --body x",
    'gh pr create --body "Casos: #301"',
    'gh pr edit 5 --body "Casos: ninguno — solo documentación, nada se ha roto"',
  ])("con rastro (%s), no frena", (command) => {
    const r = senalesDeFallo(sesion(uso("a", "Agent", {}), res("a", "ESTADO: bloqueado"), uso("b", "Bash", { command }), res("b", "ok")));
    expect(r.senales).toHaveLength(1);
    expect(r.registrado).toBe(true);
  });
  it("el rastro en un cuerpo de PR escrito con Write también cuenta", () => {
    expect(senalesDeFallo(sesion(uso("a", "Write", { file_path: "pr.md", content: "Closes #1\nCasos: #5" }))).registrado).toBe(true);
  });
  it("un issue de otro tipo (decisión) no es rastro de un caso", () => {
    expect(senalesDeFallo(sesion(uso("b", "Bash", { command: 'npm run issues -- --nuevo "x" --tipo decision --area ops' }))).registrado).toBe(false);
  });

  it("el mensaje lista las señales, dice qué hacer y trae la vía de salida", () => {
    const m = recordatorioDeCasos(["a", "b"]);
    expect(m).toMatch(/- a\n- b/);
    expect(m).toMatch(/--tipo caso/);
    expect(m).toMatch(/no vuelve a salir/);
  });
  it("transcript vacío o roto: sin señales, sin romperse", () => {
    expect(senalesDeFallo("")).toEqual({ senales: [], registrado: false });
    expect(senalesDeFallo("no es json\n{")).toEqual({ senales: [], registrado: false });
  });
});

describe("freno de los casos: de punta a punta, como lo lanza Claude Code", () => {
  const hook = join(dirname(fileURLToPath(import.meta.url)), "pendientes.mjs");
  const corre = (transcript, id, extra = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "freno-"));
    const f = join(dir, "t.jsonl");
    writeFileSync(f, transcript);
    const r = spawnSync("node", [hook], { input: JSON.stringify({ session_id: id, transcript_path: f, last_assistant_message: "Hecho.", ...extra }), encoding: "utf8" });
    return r.stdout ? JSON.parse(r.stdout) : null;
  };
  const mala = sesion(uso("a", "Agent", {}), res("a", "ESTADO: bloqueado"));
  const nuevoId = () => `prueba-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it("frena con señal y sin registro, UNA sola vez por sesión", () => {
    const id = nuevoId();
    const primera = corre(mala, id);
    expect(primera.decision).toBe("block");
    expect(primera.reason).toMatch(/\[casos\]/);
    expect(corre(mala, id)).toBeNull();
  });
  it("sin señales de fallo no frena, aunque no haya registrado nada", () => {
    expect(corre(sesion(uso("a", "Agent", {}), res("a", "ESTADO: ok\nHALLAZGOS:\n- ninguno")), nuevoId())).toBeNull();
    expect(corre("", nuevoId())).toBeNull();
  });
  it("no frena si ya hay rastro, ni si el Stop viene de un freno anterior", () => {
    expect(corre(sesion(mala, uso("b", "Bash", { command: 'gh pr create --body "Casos: #3"' })), nuevoId())).toBeNull();
    expect(corre(mala, nuevoId(), { stop_hook_active: true })).toBeNull();
  });
});
