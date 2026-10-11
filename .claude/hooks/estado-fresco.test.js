import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TEMAS_ESTADO as TEMAS_EVENTO } from "./eventos.mjs";
import { MOTIVOS_ESTADO, TEMAS_ESTADO, afirmaEstado, estadoSinLeer, filasDe, recordatorioDeEstado, temasAfirmados } from "./pendientes.mjs";

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

// ── Los temas nuevos (#579, C9): despliegue, base de datos y CI ────────────────
const mcp = (ts, name) => JSON.stringify({ type: "assistant", timestamp: ts, message: { content: [{ type: "tool_use", id: "m", name, input: {} }] } });
const frena = (jsonl, texto) => estadoSinLeer(jsonl, texto, AHORA);

describe("temasAfirmados: despliegue, base y CI", () => {
  it.each([
    ["despliegue", "Ya está en producción."],
    ["despliegue", "El cambio está desplegado en staging."],
    ["despliegue", "Ya está en staging, lo vi hace un rato."],
    ["despliegue", "El despliegue sigue en Blocked."],
    ["base", "La migración 0105 está aplicada."],
    ["base", "Ya está aplicada la 0104."],
    ["base", "La 0106 queda sin aplicar."],
    ["base", "La base tiene 12 casas."],
    ["base", "En producción hay 40 filas."],
    ["ci", "El CI está verde."],
    ["ci", "El CI del PR falla en el lint."],
    ["ci", "Los checks del PR pasan."],
    ["ci", "Verde el CI, listo para fusionar."],
  ])("%s: %s", (tema, t) => expect(temasAfirmados(t)).toContain(tema));

  it.each([
    "Para que quede desplegado hay que fusionar antes.",
    "Se desplegará cuando Pablo lo apruebe.",
    "El bug está en producción desde hace días.",
    "La migración se aplicará mañana.",
    "Aplicar la migración es cosa de Pablo.",
    "La base de datos es de Supabase.",
    "Espera a que el CI esté verde antes de fusionar.",
    "Cuando el CI pase, fusiono.",
    "Hasta que los checks pasen no se toca.",
    "El CI es el workflow tests.yml.",
    "Mira el despliegue en el panel de Vercel.",
    "> el CI está verde (cita)",
    "Escribe `el CI está verde` en el PR.",
    "```\nel CI está verde\nya está desplegado\n```",
    "Los tests pasan en local.",
  ])("no: %s", (t) => expect(temasAfirmados(t)).toEqual([]));

  it("un mensaje con varios temas los devuelve en el orden del vocabulario", () => {
    expect(temasAfirmados("El #299 está abierto, el CI está verde y ya está en producción.")).toEqual(["issues-pr", "despliegue", "ci"]);
  });
  it("afirmaEstado es cierto si hay algún tema", () => {
    expect(afirmaEstado("El CI está verde.")).toBe(true);
    expect(afirmaEstado("Hecho.")).toBe(false);
  });
});

describe("estadoSinLeer con los temas nuevos: cada afirmación pide SU lectura", () => {
  const ci = "El CI está verde.";
  const dep = "Ya está en producción.";
  const bd = "La migración 0105 está aplicada.";

  it("sin lectura frena y dice el tema", () => {
    expect(frena(sesion(usuario(hace(3))), ci)).toMatchObject({ frena: true, motivo: "sin-lectura", tema: "ci" });
    expect(frena(sesion(usuario(hace(3))), dep)).toMatchObject({ frena: true, tema: "despliegue" });
    expect(frena(sesion(usuario(hace(3))), bd)).toMatchObject({ frena: true, tema: "base" });
  });
  it.each([
    [ci, "gh pr checks 12"],
    [ci, "gh run list --workflow tests.yml --limit 3"],
    [ci, "gh run view 123 --log-failed"],
    [ci, "npm run espera-ci -- 12"],
    [ci, "npm run situacion"],
    [dep, "vercel ls"],
    [dep, "npx vercel inspect dpl_x"],
    [dep, "git fetch origin && git log origin/staging --oneline -3"],
    [dep, "git branch -r --contains abc123 | grep origin/staging"],
    [dep, "gh run list --limit 2"],
    [dep, "gh pr view 12 --json state"],
    [bd, "node scripts/verificar-estado.mjs --solo 0105"],
    [bd, 'npm run consulta -- "select count(*) from x"'],
    [bd, "node scripts/apply-migration.mjs 0105_x"],
  ])("lectura reciente que vale: %s con %s", (texto, cmd) => {
    expect(frena(sesion(usuario(hace(8)), bash(hace(5), cmd)), texto).frena).toBe(false);
  });
  it("una lectura de otro tema no vale: el CI leído no prueba la base ni el despliegue", () => {
    const leyoCi = sesion(usuario(hace(8)), bash(hace(5), "gh pr checks 12"));
    expect(frena(leyoCi, bd)).toMatchObject({ frena: true, tema: "base", motivo: "sin-lectura" });
    expect(frena(sesion(usuario(hace(8)), bash(hace(5), "node scripts/verificar-estado.mjs")), ci)).toMatchObject({ frena: true, tema: "ci" });
    expect(frena(sesion(usuario(hace(8)), bash(hace(5), "npm run situacion")), bd).tema).toBe("base");
  });
  it("las herramientas de lectura del conector de Vercel valen para el despliegue", () => {
    expect(frena(sesion(usuario(hace(8)), mcp(hace(5), "mcp__claude_ai_Vercel__get_deployment")), dep).frena).toBe(false);
    expect(frena(sesion(usuario(hace(8)), mcp(hace(5), "mcp__claude_ai_Vercel__list_deployments")), dep).frena).toBe(false);
    expect(frena(sesion(usuario(hace(8)), mcp(hace(5), "mcp__claude_ai_Vercel__request_rollback")), dep).frena).toBe(true);
    expect(frena(sesion(usuario(hace(8)), mcp(hace(5), "mcp__claude_ai_Vercel__get_deployment")), ci).frena).toBe(true);
  });
  it("una lectura de más de 15 minutos es lectura-vieja, del tema que toca", () => {
    expect(frena(sesion(usuario(hace(50)), bash(hace(30), "gh run list")), ci)).toMatchObject({ frena: true, motivo: "lectura-vieja", tema: "ci" });
    expect(frena(sesion(usuario(hace(50)), bash(hace(30), "gh run list")), bd)).toMatchObject({ motivo: "sin-lectura", tema: "base" });
  });
  it.each([
    "gh run rerun 123 --failed",
    "gh workflow run tests.yml --ref x",
    "gh api -X POST repos/x/y/dispatches",
    "git push origin rama",
    "vercel env add X production",
    "grep verificar-estado README.md",
    "echo gh run list",
    "node scripts/apply-migration.mjs.bak",
  ])("lo que escribe o solo nombra la fuente no es lectura (%s)", (cmd) => {
    expect(frena(sesion(usuario(hace(8)), bash(hace(5), cmd)), "El CI está verde y ya está en producción y la 0105 está aplicada.").frena).toBe(true);
  });
  it("con varios temas afirmados, frena por el primero sin lectura", () => {
    const texto = "El #299 está abierto, el CI está verde y la migración 0105 está aplicada.";
    const j = sesion(usuario(hace(8)), bash(hace(5), "gh issue view 299"));
    expect(frena(j, texto)).toMatchObject({ frena: true, tema: "base" }); // el orden del vocabulario: base va antes que ci
    const j2 = sesion(usuario(hace(8)), bash(hace(5), "gh issue view 299 && gh pr checks 3 && node scripts/verificar-estado.mjs"));
    expect(frena(j2, texto).frena).toBe(false);
  });
  it("lo que acaba de hacer la sesión, con una lectura reciente de su tema, no frena; el tema sin lectura sí", () => {
    const j = sesion(usuario(hace(8)), bash(hace(2), "gh pr checks 12"));
    expect(frena(j, "He mirado: el CI está verde.").frena).toBe(false);
    expect(frena(j, "He mirado: el CI está verde, y la 0105 está aplicada.").tema).toBe("base");
  });
  it("el aviso de cada tema nombra su lectura (el tema va en el evento, no en la línea contable)", () => {
    expect(recordatorioDeEstado("sin-lectura", "ci")).toMatch(/ejecuta `gh pr checks <n> \(o gh run list\)` y cita su hora/);
    expect(recordatorioDeEstado("lectura-vieja", "base")).toMatch(/verificar-estado/);
    expect(recordatorioDeEstado("sin-lectura", "despliegue")).toMatch(/^estado-fresco freno motivo: sin-lectura$/m);
    expect(recordatorioDeEstado("sin-lectura", "tema-raro")).toMatch(/npm run situacion/);
  });
});

describe("revisión del juez de #579", () => {
  const ci = "El CI está verde.";
  const dep = "Ya está en producción.";
  const bd = "La migración 0105 está aplicada.";
  const leyo = (cmd, texto) => frena(sesion(usuario(hace(8)), bash(hace(5), cmd)), texto).frena === false;

  it.each([
    [ci, "node scripts/token-sesion.mjs -- gh pr checks 12"],
    [ci, 'node "C:\\dev\\MenuPlan-x\\scripts\\token-sesion.mjs" -- gh run list --limit 3'],
    [ci, "node ./scripts/token-sesion.mjs -- gh api repos/pabloam89/MenuPlan/actions/runs"],
    [dep, "node scripts/token-sesion.mjs -- gh pr view 12 --json state"],
    ["El #299 está abierto.", "node scripts/token-sesion.mjs -- gh issue view 299"],
  ])("con el prefijo de token de sesión también es lectura: %s con %s", (texto, cmd) => {
    expect(leyo(cmd, texto)).toBe(true);
  });
  it.each([
    "node scripts/token-sesion.mjs -- gh pr merge 12 --merge",
    "node scripts/token-sesion.mjs -- gh pr create --title x",
    "node scripts/token-sesion.mjs -- gh run rerun 1",
    "node scripts/token-sesion.mjs -- gh api -X POST repos/x/y/issues",
    "node scripts/token-sesion.mjs -- echo gh pr checks 12",
  ])("con ese prefijo, lo que escribe no cuenta: %s", (cmd) => {
    expect(leyo(cmd, "El CI está verde y ya está en producción.")).toBe(false);
  });

  it.each([
    "node scripts/apply-migration.mjs 0105_x --si",
    "node scripts/apply-migration.mjs 0105_x --pablo",
    "node scripts/apply-migration.mjs 0105_x --si --pablo",
  ])("aplicar de verdad no es leer la base: %s", (cmd) => {
    expect(leyo(cmd, bd)).toBe(false);
  });
  it("el ensayo sí es lectura de la base", () => {
    expect(leyo("node scripts/apply-migration.mjs 0105_x", bd)).toBe(true);
  });

  it.each([
    "¿Está desplegado ya?",
    "¿El CI está verde?",
    "Está desplegado ya?",
    "Hay que comprobar que el CI esté verde antes.",
    "Hay que comprobar que el ci este verde antes.",
    "Quedó desplegado ayer a las 10.",
    "El ci pasó antes del merge.",
    "Ayer la migración 0105 estaba aplicada.",
    "Hay que ver si la migración 0105 está aplicada.",
  ])("no frena (pregunta, pretérito o condicional): %s", (t) => {
    expect(frena(sesion(usuario(hace(3))), t).frena).toBe(false);
  });
  it.each([
    "El CI está verde (ayer lo vi igual).",
    "Hay que avisar: el CI está rojo.",
    "El CI está verde; hay que esperar a Álvaro.",
    "Ya está desplegado en producción (ayer lo comprobé).",
    "La base de datos tiene 40 familias; hay que borrar 2.",
    "Si el CI está verde lo fusiono; ahora el CI está rojo.",
    "Ayer el CI estaba rojo, ahora el CI está verde.",
  ])("la cautela de una cláusula no tapa una afirmación real de otra: %s", (t) => {
    expect(frena(sesion(usuario(hace(3))), t).frena).toBe(true);
  });
  it.each([
    "Cuando el CI esté verde fusiono.",
    "Si el CI falla, lo arreglo.",
    "Espero a que el CI esté verde.",
    "Hay que comprobar que el CI pasa.",
    "Estoy esperando al CI, que está en curso.",
  ])("y la condicional pura sigue sin frenar: %s", (t) => {
    expect(frena(sesion(usuario(hace(3))), t).frena).toBe(false);
  });
  it("una orden con --si entre comillas tampoco es ensayo", () => {
    expect(leyo('node scripts/apply-migration.mjs 0105_x "--si"', bd)).toBe(false);
  });
  it("«El CI está verde» sin lectura sí frena", () => {
    expect(frena(sesion(usuario(hace(3))), "El CI está verde")).toMatchObject({ frena: true, tema: "ci" });
  });
});

describe("el vocabulario de temas", () => {
  it("son cuatro, y el de pendientes.mjs es el mismo que valida eventos.mjs", () => {
    expect(TEMAS_ESTADO).toEqual(["issues-pr", "despliegue", "base", "ci"]);
    expect(TEMAS_EVENTO).toEqual(TEMAS_ESTADO);
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

describe("el hook entero con un tema nuevo", () => {
  const hook = join(dirname(fileURLToPath(import.meta.url)), "pendientes.mjs");
  const fabrica = mkdtempSync(join(tmpdir(), "estado-tema-"));
  const tr = join(fabrica, "t.jsonl");
  writeFileSync(tr, usuario(new Date(Date.now() - 60_000).toISOString(), "turno-1"));
  const lanza = (texto, id) => spawnSync("node", [hook], {
    input: JSON.stringify({ session_id: id, transcript_path: tr, last_assistant_message: texto }),
    encoding: "utf8",
    env: { ...process.env, MENUPLAN_FABRICA_DIR: fabrica },
  });

  it("frena una vez por un CI sin leer y deja un evento con el tema", () => {
    const id = `eftema${Date.now()}`;
    const a = lanza("El CI está verde.", id);
    expect(JSON.parse(a.stdout).reason).toMatch(/gh pr checks/);
    expect(lanza("El CI está verde.", id).stdout).toBe("");
    const lineas = readFileSync(join(fabrica, "eventos.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ evento: "estado_sin_leer", nombre: "sin-lectura", tema: "ci", fuente: "pendientes" });
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
