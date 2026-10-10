import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MOTIVOS_ESTADO, afirmaEstado, estadoSinLeer, filasDe, recordatorioDeEstado } from "./pendientes.mjs";

// El freno del estado fresco (#462, fondo #231): afirmar el estado de un issue o PR sin
// haberlo leído de la fuente hace poco. Semidura: lee texto (como #174).
const AHORA = new Date("2026-10-10T12:00:00.000Z");
const hace = (min) => new Date(AHORA.getTime() - min * 60_000).toISOString();
const usuario = (ts, uuid = "u1") => JSON.stringify({ type: "user", uuid, timestamp: ts, message: { content: "hola" } });
const bash = (ts, command) => JSON.stringify({ type: "assistant", timestamp: ts, message: { content: [{ type: "tool_use", id: "t", name: "Bash", input: { command } }] } });
const sesion = (...l) => l.join("\n");

describe("afirmaEstado: cuándo un mensaje cuenta el estado", () => {
  it.each([
    "El #299 está abierto.",
    "Ya está fusionado el #301 en staging.",
    "Queda pendiente el #94 hasta que Álvaro conteste.",
    "#455 lo lleva la sesión de datos.",
    "El #12 bloquea al #13.",
  ])("sí: %s", (t) => expect(afirmaEstado(t)).toBe(true));

  it.each([
    "Está abierto el asunto, pero sin número.",
    "Hecho. Mira el #299 cuando puedas.",
    "Hay cosas pendientes y abiertas.",
    "```\nel #299 está abierto\n```",
    "Es independiente: ver #5",
    "Color #123abc, pendiente de revisar",
    "Mira pendientes.mjs:#12",
    "| #299 | independiente |",
    "Los dependientes del #7 quedan aparte.",
  ])("no: %s", (t) => expect(afirmaEstado(t)).toBe(false));
});

describe("estadoSinLeer: la lectura de la fuente", () => {
  const dice = "El #299 está abierto.";

  it("afirma el estado sin ninguna lectura: frena", () => {
    expect(estadoSinLeer(sesion(usuario(hace(3))), dice, AHORA)).toMatchObject({ frena: true, motivo: "sin-lectura" });
  });
  it.each([
    "npm run situacion",
    "npm run issues",
    "gh issue view 299",
    "gh pr list --state open",
    "gh pr checks 12",
    "gh api repos/pabloam89/MenuPlan/issues/299",
    "cd /c/dev/X && npm run situacion -- --json",
  ])("con una lectura reciente (%s): no frena", (cmd) => {
    expect(estadoSinLeer(sesion(usuario(hace(8)), bash(hace(5), cmd)), dice, AHORA).frena).toBe(false);
  });
  it("una lectura de hace más de 15 minutos no vale: frena como lectura-vieja", () => {
    expect(estadoSinLeer(sesion(usuario(hace(40)), bash(hace(30), "npm run situacion")), dice, AHORA)).toMatchObject({ frena: true, motivo: "lectura-vieja" });
  });
  it.each([
    'gh issue create --title "x"',
    "gh issue comment 299 --body hola",
    "gh api -X POST repos/pabloam89/MenuPlan/issues",
    "gh api repos/x/y --method PATCH",
    "grep situacion README.md",
    "echo npm run situacion",
  ])("lo que escribe o solo nombra la fuente no es lectura (%s)", (cmd) => {
    expect(estadoSinLeer(sesion(usuario(hace(8)), bash(hace(5), cmd)), dice, AHORA).frena).toBe(true);
  });
  it("si el mensaje no cuenta ningún estado, no frena", () => {
    expect(estadoSinLeer(sesion(usuario(hace(3))), "Listo, he terminado.", AHORA).frena).toBe(false);
  });
  it("el turno es el del último mensaje del usuario (id para la marca)", () => {
    expect(estadoSinLeer(sesion(usuario(hace(9), "a"), usuario(hace(3), "b")), dice, AHORA).turno).toBe("b");
  });
  it("los mensajes que no escribió Pablo no avanzan el turno", () => {
    const ruido = [
      JSON.stringify({ type: "user", uuid: "m1", isMeta: true, message: { content: "caveat" } }),
      JSON.stringify({ type: "user", uuid: "m2", message: { content: "<task-notification>fin</task-notification>" } }),
      JSON.stringify({ type: "user", uuid: "m3", message: { content: [{ type: "text", text: "<system-reminder>x</system-reminder>" }] } }),
      JSON.stringify({ type: "user", uuid: "m4", message: { content: "<bash-input>ls</bash-input>" } }),
      JSON.stringify({ type: "user", uuid: "m5", message: { content: "<command-name>/x</command-name>" } }),
    ];
    expect(estadoSinLeer(sesion(usuario(hace(9), "pablo"), ...ruido), dice, AHORA).turno).toBe("pablo");
  });
  it("acepta el transcript ya parseado (una sola lectura)", () => {
    const j = sesion(usuario(hace(3), "b"));
    expect(estadoSinLeer(filasDe(j), dice, AHORA)).toEqual(estadoSinLeer(j, dice, AHORA));
  });
  it("el aviso manda ejecutar npm run situacion, citar su hora y lleva la línea contable", () => {
    const r = recordatorioDeEstado("sin-lectura");
    expect(r).toMatch(/antes de contar el estado, ejecuta `npm run situacion` y cita su hora/);
    expect(r).toMatch(/^estado-fresco freno motivo: sin-lectura$/m);
  });
});

describe("el vocabulario de motivos", () => {
  it("los dos motivos que emite estadoSinLeer están en MOTIVOS_ESTADO", () => {
    expect(MOTIVOS_ESTADO).toEqual(["sin-lectura", "lectura-vieja"]);
    const a = estadoSinLeer("", "El #299 está abierto.", AHORA).motivo;
    const b = estadoSinLeer(bash(hace(30), "npm run situacion"), "El #299 está abierto.", AHORA).motivo;
    expect([a, b].every((m) => MOTIVOS_ESTADO.includes(m))).toBe(true);
  });
});

describe("el hook entero (stdin → stdout)", () => {
  const hook = join(dirname(fileURLToPath(import.meta.url)), "pendientes.mjs");
  const fabrica = mkdtempSync(join(tmpdir(), "estado-fresco-"));
  const tr = join(fabrica, "t.jsonl");
  const ahora = new Date();
  writeFileSync(tr, usuario(new Date(ahora.getTime() - 60_000).toISOString(), "turno-1"));
  const lanza = (extra = {}, id = `ef${Date.now()}${Math.random().toString(36).slice(2, 8)}`) =>
    spawnSync("node", [hook], {
      input: JSON.stringify({ session_id: id, transcript_path: tr, last_assistant_message: "El #299 está abierto.", ...extra }),
      encoding: "utf8",
      env: { ...process.env, MENUPLAN_FABRICA_DIR: fabrica },
    });

  it("frena una vez, no repite en el mismo turno y deja un evento contable", () => {
    const id = `efuno${Date.now()}`;
    const a = lanza({}, id);
    expect(JSON.parse(a.stdout)).toMatchObject({ decision: "block" });
    expect(JSON.parse(a.stdout).reason).toMatch(/npm run situacion/);
    expect(lanza({}, id).stdout).toBe("");
    const lineas = readFileSync(join(fabrica, "eventos.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lineas.filter((l) => l.evento === "estado_sin_leer")).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ evento: "estado_sin_leer", nombre: "sin-lectura" });
  });
  it("tres notificaciones seguidas tras un freno no producen otro freno", () => {
    const id = `efnot${Date.now()}`;
    const t3 = join(fabrica, "t3.jsonl");
    const notif = (n) => JSON.stringify({ type: "user", uuid: `n${n}`, message: { content: `<task-notification>${n}</task-notification>` } });
    writeFileSync(t3, sesion(usuario(new Date(ahora.getTime() - 60_000).toISOString(), "turno-N"), notif(1)));
    expect(JSON.parse(lanza({ transcript_path: t3 }, id).stdout).decision).toBe("block");
    writeFileSync(t3, sesion(usuario(new Date(ahora.getTime() - 60_000).toISOString(), "turno-N"), notif(1), notif(2), notif(3)));
    expect(lanza({ transcript_path: t3 }, id).stdout).toBe("");
  });
  it("la marca del turno vive en la carpeta de la fábrica, no en tmp", () => {
    const id = `efmarca${Date.now()}`;
    lanza({}, id);
    expect(existsSync(join(fabrica, "marcas", `${id}.estado`))).toBe(true);
  });
  it("con stop_hook_active no frena (nunca en bucle)", () => {
    expect(lanza({ stop_hook_active: true }).stdout).toBe("");
  });
  it("un subagente no frena", () => {
    expect(lanza({ agent_id: "sub1" }).stdout).toBe("");
    expect(lanza({ agent_type: "revisor" }).stdout).toBe("");
  });
  it("con una lectura reciente en el transcript no frena", () => {
    const t2 = join(fabrica, "t2.jsonl");
    writeFileSync(t2, sesion(usuario(new Date(ahora.getTime() - 120_000).toISOString()), bash(new Date(ahora.getTime() - 60_000).toISOString(), "npm run situacion")));
    expect(lanza({ transcript_path: t2 }).stdout).toBe("");
    expect(existsSync(t2)).toBe(true);
  });
});
