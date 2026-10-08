import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decidir, sinAplicar } from "./guardia.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ESTADO_REAL = readFileSync(join(RAIZ, "supabase", "ESTADO.md"), "utf8");

const ESTADO = "| **Sin aplicar** | **2** — `0080_bot_tareas_v2`, `0086_vocabulario_de_la_app` |";
const ctx = (extra = {}) => ({
  enStaging: (n) => ["0079_personas_y_grupos", "0080_bot_tareas_v2"].includes(n),
  estadoMd: ESTADO,
  baseDelPr: () => "staging",
  atrasoLocal: () => 0,
  atrasoDelPr: () => 0,
  ...extra,
});
const bash = (command, c = ctx()) => decidir({ tool_name: "Bash", tool_input: { command } }, c)?.decision ?? null;
const edita = (file_path, c = ctx()) => decidir({ tool_name: "Edit", tool_input: { file_path } }, c)?.decision ?? null;

describe("main es producción", () => {
  it.each([
    "git push origin main",
    "git push origin HEAD:main",
    "git push origin staging:main",
    "git push -u origin main",
    "git push origin +main",
    "git fetch && git push origin main",
    "git push origin refs/heads/main",
  ])("deniega %s", (c) => expect(bash(c)).toBe("deny"));

  it.each([
    "git push origin ops/claude-md",
    "git push -u origin datos/main-fix",
    "git push origin bot/mainboard",
    "git log origin/main",
  ])("deja pasar %s", (c) => expect(bash(c)).toBe(null));
});

describe("a staging solo por PR", () => {
  it.each(["git push origin staging", "git push origin HEAD:staging", "git push --force origin staging", "git push origin datos/x:staging"])(
    "deniega %s",
    (c) => expect(bash(c)).toBe("deny"),
  );
  it.each(["git push -u origin ops/staging-limpio", "git fetch origin staging", "git merge origin/staging"])(
    "deja pasar %s",
    (c) => expect(bash(c)).toBe(null),
  );
});

describe("push forzado", () => {
  it("a una rama de trabajo, pregunta", () => expect(bash("git push -f origin ops/x")).toBe("ask"));
});

describe("hábitos que ya rompieron cosas", () => {
  it.each(["git stash", "git stash -u", "git stash pop"])("deniega %s", (c) => expect(bash(c)).toBe("deny"));
  it.each(["git add .", "git add -A", "git add --all", "git commit -am 'x'", "git commit -a -m x"])(
    "deniega %s",
    (c) => expect(bash(c)).toBe("deny"),
  );
  it.each(["git add src/App.jsx .claude/hooks/guardia.mjs", "git commit -m 'añade a la lista'", "git commit --amend --no-edit"])(
    "deja pasar %s",
    (c) => expect(bash(c)).toBe(null),
  );
  it.each(["npx vite build", "vite build --mode staging"])("deniega %s", (c) => expect(bash(c)).toBe("deny"));
  it("npm run build sí", () => expect(bash("npm run build")).toBe(null));
  it("Set-Content sobre el repo, no", () =>
    expect(decidir({ tool_name: "PowerShell", tool_input: { command: "Get-Content a.jsx | Set-Content a.jsx -Encoding utf8" } }, ctx()).decision).toBe("deny"));
  it("Out-File a temp, sí", () =>
    expect(decidir({ tool_name: "PowerShell", tool_input: { command: "dir | Out-File $env:TEMP\\x.txt" } }, ctx())).toBe(null));
});

describe("la base es producción", () => {
  it("el ensayo de una migración pasa", () => expect(bash("node scripts/apply-migration.mjs 0086_vocabulario_de_la_app")).toBe(null));
  it("aplicarla con --si pasa: la protege el script (staging, ensayo, juez)", () =>
    expect(bash("node scripts/apply-migration.mjs 0086_vocabulario_de_la_app --si")).toBe(null));
  it("--pablo, nunca desde una sesión: lo destructivo y la RLS los lanza Pablo con !", () => {
    expect(bash("node scripts/apply-migration.mjs 0090_x --si --pablo")).toBe("deny");
    expect(bash("cd C:/dev/MenuPlan-x && node scripts/apply-migration.mjs 0090_x --pablo --si")).toBe("deny");
  });
  it.each([
    'node scripts/apply-migration.mjs 0090_x --si "--pablo"',
    "node scripts/apply-migration.mjs 0090_x --si '--pablo'",
    "node scripts/apply-migration.mjs 0090_x --si --pablo=1",
    "X=--pablo; node scripts/apply-migration.mjs 0090_x --si $X",
  ])("--pablo disfrazado también se niega: %s", (c) => expect(bash(c)).toBe("deny"));
  it("un commit cuyo mensaje nombra apply-migration y --si no es aplicar", () =>
    expect(bash("git commit -m \"docs: node scripts/apply-migration.mjs 0090_x --si lo lanza la sesión\"")).toBe(null));
  it.each([
    'psql "$SUPABASE_DB_URL" -c "drop table public.bot_cola"',
    'psql $SUPABASE_DB_URL -c "delete from user_pantry"',
    "node -e \"new pg.Client(process.env.SUPABASE_DB_URL); q('update households set name=1')\"",
    'psql "$OPS_DB_URL" -c "grant select on x to anon"',
  ])("SQL que escribe, negado: %s", (c) => expect(bash(c)).toBe("deny"));
  it("una lectura pasa", () => expect(bash('psql "$SUPABASE_DB_URL" -c "select count(*) from households"')).toBe(null));
});

describe("migraciones aplicadas no se editan", () => {
  it("aplicada y en staging: deniega", () => expect(edita("C:\\dev\\MenuPlan\\supabase\\migrations\\0079_personas_y_grupos.sql")).toBe("deny"));
  it("en staging pero sin aplicar: libre", () => expect(edita("C:/dev/x/supabase/migrations/0080_bot_tareas_v2.sql")).toBe(null));
  it("nueva en la rama: libre", () => expect(edita("C:/dev/x/supabase/migrations/0090_nueva.sql")).toBe(null));
  it("nueva pero con un número que staging ya usa: deniega", () =>
    expect(edita("C:/dev/x/supabase/migrations/0086_otra_cosa.sql", ctx({ numeroEnStaging: (n) => (n === "0086" ? "0086_vocabulario_de_la_app" : null) }))).toBe("deny"));
  it("sin ESTADO.md legible: deniega con explicación", () =>
    expect(edita("supabase/migrations/0080_bot_tareas_v2.sql", ctx({ estadoMd: null }))).toBe("deny"));
  it("por shell tampoco", () => expect(bash("sed -i 's/a/b/' supabase/migrations/0079_personas_y_grupos.sql")).toBe("deny"));
  it("leerla por shell sí", () => expect(bash("cat supabase/migrations/0079_personas_y_grupos.sql")).toBe(null));
  it.each([
    "awk 'NR>=251 && NR<=386' supabase/migrations/0079_personas_y_grupos.sql",
    'grep -n "x" supabase/migrations/0079_personas_y_grupos.sql > /tmp/salida.txt',
    "cat supabase/migrations/0079_personas_y_grupos.sql | tee /tmp/copia.sql",
  ])("un > que no apunta a la migración es una lectura: %s", (c) => expect(bash(c)).toBe(null));
  it.each([
    "echo x > supabase/migrations/0079_personas_y_grupos.sql",
    'cat a >> "supabase/migrations/0079_personas_y_grupos.sql"',
    "echo x | tee -a supabase/migrations/0079_personas_y_grupos.sql",
    "mv /tmp/x.sql supabase/migrations/0079_personas_y_grupos.sql",
  ])("escribirla por shell, negado: %s", (c) => expect(bash(c)).toBe("deny"));
  it.each([
    "echo a > supabase/migrations/0090_nueva.sql && echo b >> supabase/migrations/0079_personas_y_grupos.sql",
    "sed --in-place 's/a/b/' supabase/migrations/0079_personas_y_grupos.sql",
    "git checkout -- supabase/migrations/0079_personas_y_grupos.sql",
    "git restore supabase/migrations/0079_personas_y_grupos.sql",
    `node -e "require('fs').writeFileSync('supabase/migrations/0079_personas_y_grupos.sql', 'x'); console.log(1)"`,
    "git rm supabase/migrations/0079_personas_y_grupos.sql",
  ])("también negado: %s", (c) => expect(bash(c)).toBe("deny"));
  it("copiarla a otro sitio es leerla", () =>
    expect(bash("cp supabase/migrations/0079_personas_y_grupos.sql /tmp/x.sql")).toBe(null));

  // Salir de un choque de número: d7 renombraba su 0087 a 0088 porque otra rama
  // ya usaba la 0087, y la guardia miraba el origen y se lo negaba.
  const choque = ctx({ numeroEnStaging: (n) => (n === "0087" ? "0087_menu_activo_y_casa_propia" : null) });
  it("mover la propia al siguiente libre pasa: cuenta el destino", () =>
    expect(bash("git mv supabase/migrations/0087_bot_entradas.sql supabase/migrations/0088_bot_entradas.sql", choque)).toBe(null));
  it("mover a un número ocupado, negado", () =>
    expect(bash("git mv supabase/migrations/0090_x.sql supabase/migrations/0087_y.sql", choque)).toBe("deny"));
  it("borrar la vieja, que no está en staging, pasa", () =>
    expect(bash("git rm supabase/migrations/0087_bot_entradas.sql", choque)).toBe(null));
});

describe("lo que lee Lola, por shell", () => {
  it.each([
    "sed -i 's/a/b/' api/_bot/conocimiento.md",
    "echo x >> api/_bot/conocimiento.md",
    "cat nuevo.js > api/_bot/agente.js",
    "echo x | tee api/_bot/conocimiento.md",
    "perl -pi -e 's/a/b/' api/_bot/agente.js",
    "cp /tmp/c.md api/_bot/conocimiento.md",
    "mv /tmp/h.js api/_bot/herramientas.js",
  ])("escribir pregunta: %s", (c) => expect(bash(c)).toBe("ask"));
  it.each([
    "cat api/_bot/conocimiento.md",
    'grep -n "alergia" api/_bot/agente.js',
    "sed -n '1,40p' api/_bot/conocimiento.md",
    "wc -l api/_bot/conocimiento.md > /tmp/n.txt",
  ])("leer no: %s", (c) => expect(bash(c)).toBe(null));
  it("con Edit no pregunta: ahí ya salta la regla", () => expect(edita("C:/dev/x/api/_bot/conocimiento.md")).toBe(null));
});

describe("gh pr merge", () => {
  it("a staging pasa", () => expect(bash("gh pr merge 90 --squash")).toBe(null));
  it("a main, no", () => expect(bash("gh pr merge 90", ctx({ baseDelPr: () => "main" }))).toBe("deny"));
  it("sin poder leer la base, pregunta", () => expect(bash("gh pr merge", ctx({ baseDelPr: () => null }))).toBe("ask"));
  it("con la rama atrasada, no", () => expect(bash("gh pr merge 90 --squash", ctx({ atrasoDelPr: () => 3 }))).toBe("deny"));
  it("sin poder saber el atraso, pregunta", () => expect(bash("gh pr merge 90", ctx({ atrasoDelPr: () => null }))).toBe("ask"));
  it("a main ni se mira el atraso", () => {
    let mirado = false;
    expect(bash("gh pr merge 90", ctx({ baseDelPr: () => "main", atrasoDelPr: () => ((mirado = true), 0) }))).toBe("deny");
    expect(mirado).toBe(false);
  });
});

describe("gh pr create con la rama al día", () => {
  it("al día pasa", () => expect(bash('gh pr create --base staging --title "x" --body "y"')).toBe(null));
  it("atrasada, no", () => expect(bash("git push -u origin ops/x && gh pr create --base staging", ctx({ atrasoLocal: () => 2 }))).toBe("deny"));
  it("sin poder saberlo, pregunta", () => expect(bash("gh pr create", ctx({ atrasoLocal: () => null }))).toBe("ask"));
  it("otros gh pr no lo miran", () => expect(bash("gh pr view 90", ctx({ atrasoLocal: () => 5, atrasoDelPr: () => 5 }))).toBe(null));
});

it("cambiar permisos o hooks compartidos pregunta", () => {
  expect(edita("C:\\dev\\MenuPlan\\.claude\\settings.json")).toBe("ask");
  expect(edita("C:/dev/MenuPlan/.claude/hooks/guardia.mjs")).toBe("ask");
  expect(edita("C:/dev/MenuPlan/.claude/settings.local.json")).toBe(null);
});

describe("ESTADO.md de verdad", () => {
  // Si alguien cambia el formato de la tabla de resumen, la guardia se queda
  // ciega y cierra todas las migraciones de staging. Esto lo dice antes.
  it("la guardia encuentra la lista de «sin aplicar» y cada una existe", () => {
    const libres = sinAplicar(ESTADO_REAL);
    expect(libres).not.toBeNull();
    expect(libres.size).toBeGreaterThan(0);
    const sinFichero = [...libres].filter((n) => !existsSync(join(RAIZ, "supabase", "migrations", `${n}.sql`)));
    expect(sinFichero).toEqual([]);
  });
});
