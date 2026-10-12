import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTORES, EVITABLE, MOTIVOS_INTERVENCION } from "./eventos.mjs";
import { anotarBangs, bangsDe, clasificarBang } from "./intervenciones.mjs";

/**
 * Los `!` de Pablo como `intervencion_humana` (#652). Lo esencial: cada `!` deja UNA línea con solo
 * vocabulario cerrado, el texto del comando no llega nunca al registro, y un fallo del hook no rompe
 * nada. El formato del transcript (`<bash-input>`) se copió de uno real de este repo.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const SESION = "2b7c5e1a-1f0e-4d0a-9c36-0a1b2c3d4e5f";
const AHORA = new Date("2026-10-12T10:00:00.000Z");
const temporal = (p) => mkdtempSync(join(tmpdir(), p));
const git = () => "Pablo Artiñano pabloam89@gmail.com";

const bang = (comando, ts = "2026-10-12T09:59:00.000Z", extra = {}) =>
  JSON.stringify({ parentUuid: "x", isSidechain: false, type: "user", message: { role: "user", content: `<bash-input>${comando}</bash-input>` }, timestamp: ts, ...extra }) + "\n";
const texto = (t, ts = "2026-10-12T09:58:00.000Z") => JSON.stringify({ type: "user", message: { role: "user", content: t }, timestamp: ts }) + "\n";
const eventos = (dir) => {
  try {
    return readFileSync(join(dir, "eventos.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const hook = (transcript, dir, extra = {}) => ({ entrada: { session_id: SESION, cwd: RAIZ, transcript_path: transcript, ...extra }, opc: { dir, ahora: AHORA, usuarioGit: git } });
const anotar = (transcript, dir, extra) => {
  const { entrada, opc } = hook(transcript, dir, extra);
  return anotarBangs(entrada, opc);
};

describe("clasificarBang: qué intervención es un comando, sin guardarlo", () => {
  it("--pablo es producción y la norma de las migraciones de Pablo", () => {
    expect(clasificarBang("node scripts/apply-migration.mjs 0099_x --si --pablo")).toEqual({ motivo: "produccion", entidad_exigida: "migracion-pablo-solo-pablo", evitable: "no" });
  });
  it("MENUPLAN_OP_PABLO es un secreto y la norma de las claves de Pablo", () => {
    expect(clasificarBang('$env:MENUPLAN_OP_PABLO="1"; npm run op -- vault list')).toEqual({ motivo: "secreto", entidad_exigida: "claves-de-pablo-solo-pablo", evitable: "no" });
    expect(clasificarBang("MENUPLAN_OP_PABLO=1 npm run op -- vault list").motivo).toBe("secreto");
  });
  it("lo demás es «otro», sin norma", () => {
    expect(clasificarBang("npm run retirar -- x")).toEqual({ motivo: "otro", entidad_exigida: null, evitable: "no" });
    expect(clasificarBang("")).toMatchObject({ motivo: "otro" });
    expect(clasificarBang(undefined)).toMatchObject({ motivo: "otro" });
  });
  it("--pablo-algo o un nombre parecido no cuenta como la bandera", () => {
    expect(clasificarBang("git log --pablox").motivo).toBe("otro");
    expect(clasificarBang("echo MENUPLAN_OP_PABLOX").motivo).toBe("otro");
  });
  it("el resultado solo trae valores del vocabulario, y su norma existe en ops/normas.json", () => {
    const normas = JSON.parse(readFileSync(join(RAIZ, "ops", "normas.json"), "utf8"));
    const ids = (Array.isArray(normas) ? normas : normas.normas).map((n) => n.id);
    for (const c of ["x", "--pablo", "MENUPLAN_OP_PABLO"].map((x) => clasificarBang(` ${x} `))) {
      expect(MOTIVOS_INTERVENCION).toContain(c.motivo);
      expect(EVITABLE).toContain(c.evitable);
      if (c.entidad_exigida) expect(ids).toContain(c.entidad_exigida);
    }
  });
});

describe("bangsDe: leer los `!` de un transcript", () => {
  it("encuentra los `!` y salta lo demás: texto normal, subagentes, líneas rotas y otro tipo", () => {
    const t = texto("hola") + bang("npm test") + bang("no cuenta", "2026-10-12T09:00:00Z", { isSidechain: true }) + '{"roto":\n' + bang("ls", "2026-10-12T09:00:00Z", { type: "assistant" }) + texto("<bash-input>no entero") + bang("git status");
    expect(bangsDe(t).map((x) => x.comando)).toEqual(["npm test", "git status"]);
  });
  it("un `!` que dice <bash-input> dentro de otro texto no engaña", () => {
    expect(bangsDe(texto("mira esto: <bash-input>rm -rf</bash-input> y ya"))).toEqual([]);
  });
});

describe("anotarBangs: una línea por `!`, solo vocabulario", () => {
  it("un `!` ordinario y uno con --pablo dejan dos intervenciones con sus campos y la fuente", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    writeFileSync(f, texto("hola") + bang("npm run retirar -- x") + bang("node scripts/apply-migration.mjs 0099_x --si --pablo"));
    expect(anotar(f, dir)).toBe(2);
    const l = eventos(dir);
    expect(l.map((x) => [x.evento, x.fuente, x.nombre, x.motivo, x.entidad_exigida, x.evitable, x.quien])).toEqual([
      ["intervencion_humana", "intervenciones", "bang", "otro", null, "no", "pablo"],
      ["intervencion_humana", "intervenciones", "bang", "produccion", "migracion-pablo-solo-pablo", "no", "pablo"],
    ]);
    expect(l[0].ts).toBe("2026-10-12T09:59:00.000Z"); // la hora del `!`, no la del hook
    expect(ACTORES).toContain(l[0].actor);
  });

  it("el texto del comando NO llega al registro (ni un token ni una ruta)", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    const secreto = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    writeFileSync(f, bang(`gh auth login --with-token ${secreto} C:\\Users\\pablo\\secreto.txt --pablo`));
    anotar(f, dir);
    const crudo = readFileSync(join(dir, "eventos.jsonl"), "utf8");
    expect(crudo).not.toContain("ghp_");
    expect(crudo).not.toContain("secreto");
    expect(crudo).not.toContain("auth");
    expect(Object.keys(JSON.parse(crudo)).sort()).toEqual(["actor", "entidad_exigida", "evento", "evitable", "fuente", "id", "issue", "motivo", "nombre", "proyecto", "quien", "rama", "sesion", "ts"]);
  });

  it("no cuenta dos veces: Stop y SessionEnd ven el mismo transcript, y un `!` nuevo suma uno", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    writeFileSync(f, bang("ls"));
    expect(anotar(f, dir)).toBe(1);
    expect(anotar(f, dir)).toBe(0);
    appendFileSync(f, texto("sigo") + bang("git status"));
    expect(anotar(f, dir)).toBe(1);
    expect(eventos(dir)).toHaveLength(2);
  });

  it("una línea a medio escribir se queda para la vez siguiente", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    const entera = bang("ls");
    writeFileSync(f, entera.slice(0, 30));
    expect(anotar(f, dir)).toBe(0);
    appendFileSync(f, entera.slice(30));
    expect(anotar(f, dir)).toBe(1);
  });

  it("un `!` de hace más de seis horas (sesión retomada) no se anota", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    writeFileSync(f, bang("ls", "2026-10-11T08:00:00.000Z") + bang("pwd"));
    expect(anotar(f, dir)).toBe(1);
  });

  it("un subagente (agent_id), una sesión rara o un transcript que falta no anotan ni lanzan", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    writeFileSync(f, bang("ls"));
    expect(anotar(f, dir, { agent_id: "sub-1" })).toBe(0);
    expect(anotar(f, dir, { session_id: "../../x" })).toBe(0);
    expect(anotar(join(dir, "no-existe.jsonl"), dir)).toBe(0);
    expect(anotarBangs(null, {})).toBe(0);
    expect(anotarBangs({ session_id: SESION, transcript_path: 5 }, { dir })).toBe(0);
    expect(eventos(dir)).toEqual([]);
  });

  it("una línea gigante (más de 8 MB, sin salto de línea en la ventana) no atasca la marca: los `!` de después se anotan", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    writeFileSync(f, "x".repeat(9 * 1024 * 1024) + "\n" + bang("ls"));
    let total = 0;
    for (let i = 0; i < 4; i++) total += anotar(f, dir);
    expect(total).toBe(1);
    expect(eventos(dir)).toHaveLength(1);
  });

  it("la marca se escribe antes de anotar: tras la llamada ya apunta al final de lo leído", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    const t = bang("ls");
    writeFileSync(f, t);
    anotar(f, dir);
    expect(readFileSync(join(dir, "marcas", `${SESION}.bang`), "utf8")).toBe(String(Buffer.byteLength(t)));
  });

  it("si el transcript se acorta (rotó), se vuelve a leer desde el principio", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    writeFileSync(f, texto("x".repeat(500)) + bang("ls"));
    expect(anotar(f, dir)).toBe(1);
    writeFileSync(f, bang("pwd"));
    expect(anotar(f, dir)).toBe(1);
  });
});

describe("el hook entero, como lo lanza Claude Code (Stop y SessionEnd)", () => {
  const lanzar = (entrada, dir) =>
    spawnSync(process.execPath, [join(AQUI, "intervenciones.mjs")], { input: typeof entrada === "string" ? entrada : JSON.stringify(entrada), encoding: "utf8", timeout: 20000, env: { ...process.env, MENUPLAN_FABRICA_DIR: dir } });

  it("lee la entrada por stdin, anota el `!` y sale con 0 sin escribir nada en pantalla", () => {
    const dir = temporal("iv-bang-");
    const f = join(dir, "t.jsonl");
    writeFileSync(f, bang("echo hola", new Date().toISOString()));
    const r = lanzar({ session_id: SESION, cwd: RAIZ, transcript_path: f, hook_event_name: "Stop" }, dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(eventos(dir)).toHaveLength(1);
  });

  it("con una entrada rota sale con 0 y no escribe nada", () => {
    const dir = temporal("iv-bang-");
    const r = lanzar("esto no es json", dir);
    expect(r.status).toBe(0);
    expect(eventos(dir)).toEqual([]);
  });
});

describe("settings.json: el hook está registrado y no abre ningún permiso", () => {
  const ajustes = JSON.parse(readFileSync(join(RAIZ, ".claude", "settings.json"), "utf8"));
  const comandos = (evento) => (ajustes.hooks[evento] ?? []).flatMap((g) => g.hooks.map((h) => h.command));

  it("va en Stop y en SessionEnd, sin matcher", () => {
    for (const e of ["Stop", "SessionEnd"]) {
      expect(comandos(e).filter((c) => c.includes("intervenciones.mjs")), e).toHaveLength(1);
      expect((ajustes.hooks[e] ?? []).every((g) => g.matcher === undefined), e).toBe(true);
    }
  });

  it("ningún permiso nombra el hook (registrar un hook no es dar permiso)", () => {
    expect(JSON.stringify(ajustes.permissions)).not.toContain("intervenciones");
  });
});
