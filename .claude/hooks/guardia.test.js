import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { carpetaDe, contextoReal, decidir, sinAplicar } from "./guardia.mjs";
import { cargarMapa } from "./dominios.mjs";
import { AVISOS_CREDENCIALES, credencialDeComando, sinTextos } from "./credenciales.mjs";
import { familiaDeGuardia } from "./eventos.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// El registro de eventos (#340) escribe en ~/.claude/menuplan-fabrica: un test que lanza la guardia no toca la carpeta real del usuario.
process.env.MENUPLAN_FABRICA_DIR = mkdtempSync(join(tmpdir(), "guardia-eventos-"));
// El aviso de lo ya apuntado (#384) anota señales y marcas: ningún test toca el `senales.log` real.
process.env.MENUPLAN_BUSCAR_DIR = mkdtempSync(join(tmpdir(), "guardia-buscar-"));
const ESTADO_REAL = readFileSync(join(RAIZ, "supabase", "ESTADO.md"), "utf8");

const ESTADO = "| **Sin aplicar** | **2** — `0080_bot_tareas_v2`, `0086_vocabulario_de_la_app` |";
const ctx = (extra = {}) => ({
  enStaging: (n) => ["0079_personas_y_grupos", "0080_bot_tareas_v2"].includes(n),
  estadoMd: ESTADO,
  baseDelPr: () => "staging",
  atrasoLocal: () => 0,
  choquesDelPr: () => [],
  esPrincipal: () => false,
  rutaEnPrincipal: () => false,
  ramaDe: () => "ops/x",
  leer: () => null,
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
  // #332: con la sesión de Pablo en la CLI, una sesión se llevaba las claves de producción.
  it.each([
    "vercel env pull --environment=production .env.prod",
    "npx vercel env pull x --environment production",
    "vercel env ls production",
    "vercel env pull .env.p --environment=prod",
    "vercel pull --environment=production --yes",
    "npx vercel@latest env pull --environment=Production",
    "npx -y vercel env pull --environment=production",
    "vercel --scope menuplan env pull --environment=production",
    "vercel env run -e production -- node -e \"console.log(process.env)\"",
    "vercel.cmd env pull -e production",
    "node C:/Users/x/AppData/Roaming/npm/node_modules/vercel/dist/index.js env pull --environment=production",
    "pnpm dlx vercel env pull --environment=production",
    "cmd /c vercel env pull --environment=production",
    "vercel api /v10/projects/homenu/env?decrypt=true",
    "vercel api /v1/projects/homenu/env/env_abc123",
  ])("deniega %s", (c) => expect(bash(c)).toBe("deny"));
  it.each([
    "vercel env pull .env.local",
    "vercel env ls preview",
    "vercel whoami",
    "git commit -m 'vercel env pull --environment=production'",
    "vercel env pull .env.production-backup --environment=preview",
    "vercel deploy --prod",
    "vercel logs homenu --environment production",
    "grep -rn \"vercel env pull --environment=production\" docs",
  ])(
    "deja pasar %s",
    (c) => expect(bash(c)).toBe(null),
  );
  it("Set-Content sobre el repo, no", () =>
    expect(decidir({ tool_name: "PowerShell", tool_input: { command: "Get-Content a.jsx | Set-Content a.jsx -Encoding utf8" } }, ctx()).decision).toBe("deny"));
  it("Out-File a temp, sí", () =>
    expect(decidir({ tool_name: "PowerShell", tool_input: { command: "dir | Out-File $env:TEMP\\x.txt" } }, ctx())).toBe(null));
});

describe("1Password: las sesiones solo leen HoMenu-sesiones (#328)", () => {
  // Con la cuenta de servicio de sesiones, lo de HoMenu solo se lee por la app
  // de escritorio. Si una sesión la pide, a Pablo le sale una ventana igual que
  // las suyas: la puerta es que la sesión no pueda ni pedirla.
  it.each([
    "MENUPLAN_OP_PABLO=1 node scripts/consulta.mjs",
    "export MENUPLAN_OP_PABLO=1",
    "cd C:/dev/MenuPlan-x && MENUPLAN_OP_PABLO=1 npm run dev",
    "OP_SIN_SERVICIO=1 node scripts/bot-coste.mjs",
    "npm run op -- read \"op://HoMenu/Supabase/SUPABASE_DB_URL\"",
    "op read op://HoMenu/Telegram/TELEGRAM_BOT_TOKEN",
    "op read 'op://homenu/Supabase/SUPABASE_DB_URL'",
    "SUPABASE_DB_URL=op://HoMenu/Supabase/SUPABASE_DB_URL node scripts/verificar-estado.mjs",
    "op inject -i plantilla.txt && echo op://HoMenu/Supabase/SUPABASE_DB_URL | op inject",
    "env -u OP_SERVICE_ACCOUNT_TOKEN op item get Supabase --vault HoMenu",
    "env --unset=OP_SERVICE_ACCOUNT_TOKEN op vault list",
    "unset OP_SERVICE_ACCOUNT_TOKEN; op vault list",
    "OP_SERVICE_ACCOUNT_TOKEN= op vault list",
  ])("deniega %s", (c) => expect(bash(c)).toBe("deny"));

  // Ronda 3 (seguridad): sin token, `op` va por la app de escritorio y a Pablo
  // le sale una ventana igual que las suyas. La vía es `npm run op --`, que pasa
  // por entornoOp y falla cerrado. Es un filtro de buena fe: quien parta el texto
  // adrede se lo salta; la barrera de fondo es la integración de la CLI apagada.
  it.each([
    "op read op://HoMenu-sesiones/Groq/GROQ_API_KEY",
    "op vault list",
    "op.exe item list",
    "OP.EXE signin",
    "\"C:\\Program Files\\1Password CLI\\op.exe\" vault list",
    "C:/Users/pablo/AppData/Local/Microsoft/WinGet/Links/op.exe whoami",
    "FOO=1 op whoami",
    "env FOO=1 op whoami",
    "cd C:/dev/MenuPlan-x && op whoami",
    "echo hola | op inject",
    "npm run op -- item get Supabase --vault HoMenu",
    "npm run op -- item list --vault=homenu",
    "npm run op -- item get 5amxx4ygtowjgfadvnlecifc2e --vault x",
    "npm run op -- read op://c64ol4a3oewjeue3szoafrrr6q/Copias/clave",
    "npm run op -- read \"op://HoMenu\"/Supabase/SUPABASE_DB_URL",
    "bash -c 'op whoami'",
    "powershell -Command \"op whoami\"",
    "git log $(op read op://HoMenu-sesiones/x/y)",
    "git commit -m \"$(op whoami)\"",
    "git -c alias.x='!op whoami' x",
    "gh alias set x '!op whoami'",
    "echo `op whoami`",
    // Ronda 3 bis: `op` detrás de un envoltorio o dentro de una cadena.
    "timeout 10 op vault list",
    "node -e \"require('child_process').execSync('op whoami')\"",
    "if op whoami; then echo ok; fi",
    "iex \"op whoami\"",
    "(op whoami)",
    "{ op whoami; }",
    "xargs op read",
    "sleep 1 & op whoami",
    "exec op whoami",
    "command op whoami",
    "nohup op whoami",
    "time op vault list",
  ])("deniega el op directo: %s", (c) => expect(bash(c)).toBe("deny"));
  it("en PowerShell, `& op` y `&op` también", () => {
    for (const command of ["& op whoami", "&op whoami", "& 'C:\\x\\op.exe' whoami", "$x = 1; & op whoami"]) {
      expect(decidir({ tool_name: "PowerShell", tool_input: { command } }, ctx())?.decision, command).toBe("deny");
    }
  });
  it("en PowerShell, también", () =>
    expect(decidir({ tool_name: "PowerShell", tool_input: { command: "$env:MENUPLAN_OP_PABLO='1'; node scripts/consulta.mjs" } }, ctx()).decision).toBe("deny"));
  it.each([
    "npm run op -- read \"op://HoMenu-sesiones/Groq/GROQ_API_KEY\"",
    "node scripts/boveda-sesiones.mjs --comprobar",
    "git commit -m 'ops: MENUPLAN_OP_PABLO y op://HoMenu/ solo para Pablo'",
    "grep -rn \"op://HoMenu/\" ops scripts",
    "gh issue comment 328 --body 'env -u OP_SERVICE_ACCOUNT_TOKEN, de Pablo'",
    "npx vitest run scripts/lib/env.test.js",
    "npm run --silent op -- read \"op://HoMenu-sesiones/Groq/GROQ_API_KEY\"",
    "npm run op -- vault list --format json",
    "node scripts/op.mjs whoami",
    "git commit -m 'ops: op read y op.exe solo por npm run op'",
    "git commit -F C:/tmp/msg.txt",
    "grep -rn \"op vault list\" .claude",
    "gh pr view 12 --json title",
    "open README.md",
    "node scripts/copias.mjs --operaciones",
  ])("deja pasar %s", (c) => expect(bash(c)).toBe(null));
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

  // El Postgres del panel (Hetzner) corre en un contenedor y no es producción:
  // la regla lo confundía por ver `psql` y `create table` (8 oct 2026).
  describe("un Postgres propio dentro de un contenedor no es producción", () => {
    it.each([
      `ssh root@100.73.252.32 'cd /opt/panel && docker compose exec -T db psql -U panel -d panel -c "create table prueba(id int)"'`,
      `docker compose exec -T db psql -U panel -d panel -c "insert into prueba values (1)"`,
      `docker exec panel-db-1 psql -U panel -d panel -c "drop table prueba"`,
      // con -f, y con la orden partida en líneas
      `docker compose -f /opt/panel/compose.yaml exec -T db psql -U panel -d panel -c "create table prueba(id int)"`,
      "docker compose exec -T db \\\n  psql -U panel -d panel -c \"insert into prueba values (1)\"",
      // un ; dentro del SQL no parte nada que importe
      `docker compose exec -T db psql -U panel -d panel -c "select 1; drop table prueba"`,
    ])("pasa: %s", (c) => expect(bash(c)).toBe(null));

    it.each([
      // con una URL o un host de por medio ya no es el contenedor
      `docker compose exec -T db psql postgresql://u:p@db.x.supabase.co/postgres -c "drop table t"`,
      `docker exec db psql -h db.abc.supabase.co -U postgres -c "delete from t"`,
      // el contenedor no tapa lo que va pegado detrás
      `docker compose exec db true && psql "$SUPABASE_DB_URL" -c "drop table x"`,
      `docker compose exec -T db psql -U panel -c "select 1"; psql -c "drop table x"`,
      `docker exec db sh -c 'psql "$SUPABASE_DB_URL" -c "drop table x"'`,
      // sin contenedor, como siempre
      `psql -U panel -d panel -c "create table prueba(id int)"`,
      `PSQL -U panel -c "drop table t"`,
      // (juez de seguridad, 8 oct) el host o la URL caen en otra línea
      "docker compose exec -T db psql -U panel \\\n  -h db.abc.supabase.co -c \"drop table t\"",
      "docker compose exec -T db psql -U panel \\\n  \"postgresql://u@db.abc.supabase.co/postgres\" -c \"drop table t\"",
      // … o detrás de un ; que va dentro de las comillas del SQL
      `docker compose exec -T db psql -U panel -c "select 1; drop table t" -h db.abc.supabase.co`,
      `docker compose exec -T db psql -U panel -c "select 1;" -h db.abc.supabase.co -c "drop table t"`,
      // el destino sale de otro sitio: otra variable, host=, -h pegado, PGHOST, PGSERVICE
      `docker compose exec -T db psql -U panel "$DATABASE_URL" -c "drop table t"`,
      `docker compose exec -T db psql -U panel -d "host=10.1.2.3 user=postgres" -c "drop table t"`,
      `docker compose exec -T db psql -U panel -h10.1.2.3 -c "drop table t"`,
      `docker compose exec -e PGHOST=10.1.2.3 -T db psql -U panel -c "drop table t"`,
      `docker compose exec -e PGSERVICE=prod -T db psql -U panel -c "delete from t"`,
      // otro contenedor (uno que ya esté conectado a Supabase), no el de la base del panel
      `docker exec panel-app-1 psql -U panel -c "delete from households"`,
      // desde la base del panel a otra: dblink y sustituciones de comando
      `docker compose exec -T db psql -U panel -c "select dblink_exec('host=x','drop table t')"`,
      `docker compose exec -T db psql -U panel -c "drop table t" -d $(cat /root/destino)`,
    ])("sigue negado: %s", (c) => expect(bash(c)).toBe("deny"));
  });
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

describe("gh pr merge, las formas que se colaban (juez de seguridad del PR #223)", () => {
  const aMain = ctx({ baseDelPr: (n) => (n === "230" || n === "231" ? "main" : "staging") });
  it("con el número detrás de otras opciones", () => expect(bash("gh pr merge --squash 230", aMain)).toBe("deny"));
  it("con la URL", () => expect(bash("gh pr merge https://github.com/pabloam89/MenuPlan/pull/230", aMain)).toBe("deny"));
  it("cambiando antes la base a main", () => expect(bash("gh pr edit 231 --base main && gh pr merge 231")).toBe("deny"));
  it("con -B=main", () => expect(bash("gh pr edit 231 -B=main")).toBe("deny"));
  it("la base a staging sí se puede cambiar", () => expect(bash("gh pr edit 231 --base staging")).toBe(null));
  it("--auto, nunca", () => expect(bash("gh pr merge 90 --auto --squash")).toBe("deny"));
  // Re-juicio: la guardia miraba un PR y gh fusionaba otro.
  it.each([
    'gh pr merge --squash --subject "arregla 200 cosas" 231',
    'gh pr merge --squash --body "va con el 12" 231',
    "gh pr merge '#231' --squash",
    "gh pr merge ops/rama-a-main --squash",
    "gh pr merge --squash",
    "gh pr merge https://github.com/otro/repo/pull/90",
  ])("niega %s", (c) => expect(bash(c, aMain)).toBe("deny"));
  it.each(["gh pr merge 90 --squash", "gh pr merge '#90' --squash", "gh pr merge https://github.com/pabloam89/MenuPlan/pull/90 --squash"])(
    "deja %s si va a staging", (c) => expect(bash(c, aMain)).toBe(null));
  it("con #231 mira el 231", () => expect(bash("gh pr merge '#231' --squash --subject x", aMain)).toBe("deny"));
  it("-Bmain, con el valor pegado", () => expect(bash("gh pr edit 5 -Bmain")).toBe("deny"));
  it.each([
    "gh api -X PUT repos/pabloam89/MenuPlan/pulls/231/merge",
    "gh api repos/pabloam89/MenuPlan/pulls/231 -X PATCH -f base=main",
    "gh api graphql -f query='mutation { mergePullRequest(input:{pullRequestId:\"x\"}) { clientMutationId } }'",
    "gh api --method DELETE repos/pabloam89/MenuPlan/git/refs/heads/x",
  ])("gh api: niega %s", (c) => expect(bash(c)).toBe("deny"));
  it("gh api de lectura, sí", () => expect(bash("gh api repos/pabloam89/MenuPlan/pulls/231 -q .base.ref")).toBe(null));
  it("-R, nunca", () => expect(bash("gh -R pabloam89/MenuPlan pr merge 90")).toBe("deny"));
  it("borrar issues o etiquetas, nunca", () => {
    expect(bash("gh issue delete 12 --yes")).toBe("deny");
    expect(bash("gh issue transfer 12 otro/repo")).toBe("deny");
    expect(bash("gh label delete tipo:caso --yes")).toBe("deny");
    expect(bash("gh issue close 12")).toBe(null);
  });
});

describe("gh pr merge", () => {
  it("a staging pasa", () => expect(bash("gh pr merge 90 --squash")).toBe(null));
  it("a main, no", () => expect(bash("gh pr merge 90", ctx({ baseDelPr: () => "main" }))).toBe("deny"));
  it("sin poder leer la base, pregunta", () => expect(bash("gh pr merge 90", ctx({ baseDelPr: () => null }))).toBe("ask"));
  it("si staging ha tocado sus mismos ficheros, no", () =>
    expect(bash("gh pr merge 90 --squash", ctx({ choquesDelPr: () => ["src/App.jsx"] }))).toBe("deny"));
  it("atrasada pero sin pisarse (choques vacíos), pasa", () =>
    expect(bash("gh pr merge 90 --squash", ctx({ choquesDelPr: () => [] }))).toBe(null));
  it("sin poder saberlo, pregunta", () => expect(bash("gh pr merge 90", ctx({ choquesDelPr: () => null }))).toBe("ask"));
  it("a main ni se mira", () => {
    let mirado = false;
    expect(bash("gh pr merge 90", ctx({ baseDelPr: () => "main", choquesDelPr: () => ((mirado = true), []) }))).toBe("deny");
    expect(mirado).toBe(false);
  });
});

describe("los issues se crean buscando antes (#204)", () => {
  it.each([
    'gh issue create --title "x" --label tipo:caso',
    "cd /c/dev/MenuPlan-x && gh issue create -t x -F f.md",
    "gh -R pabloam89/MenuPlan issue create -t x",
    "GH_REPO=pabloam89/MenuPlan gh issue create -t x",
    "gh.exe issue create -t x",
  ])("niega %s", (c) =>
    expect(bash(c)).toBe("deny"));
  it.each(['npm run issues -- --nuevo "x" --tipo caso --area ops --cuerpo f.md', "gh issue comment 94 --body x", "gh issue list"])("deja %s", (c) =>
    expect(bash(c)).toBe(null));
});

// La línea «Casos:» (#185): todo PR nuevo la lleva. Aquí, la mínima válida.
const CASOS = "Casos: ninguno — solo prueba la guardia, no ha habido ningún fallo";

describe("PR de una rama con issue: lleva su Closes (#206)", () => {
  const conIssue = (extra = {}) => ctx({ ramaDe: () => "ops/193-dependabot", ...extra });
  it("sin Closes, no", () => expect(bash(`gh pr create --base staging --body "hecho. ${CASOS}"`, conIssue())).toBe("deny"));
  it("con Closes en el cuerpo, sí", () =>
    expect(bash(`gh pr create --base staging --body "$(cat <<'EOF'\nCloses #193\n${CASOS}\nEOF\n)"`, conIssue())).toBe(null));
  it("con Closes en el --body-file, sí", () =>
    expect(bash("gh pr create --base staging --body-file pr.md", conIssue({ leer: () => `Fixes #193\nAgente: gobierno\n${CASOS}` }))).toBe(null));
  // Las formas que vio el juez (8 oct): `-F`, `--body-file=`, rutas de Git Bash y `Closes:`.
  it.each(["gh pr create -F pr.md", "gh pr create --body-file=pr.md", 'gh pr create --body-file "pr.md"'])("lee el cuerpo de %s", (c) =>
    expect(bash(c, conIssue({ leer: () => `Closes #193\n${CASOS}` }))).toBe(null));
  it("traduce las rutas de Git Bash antes de leer", () => {
    let leida;
    bash("gh pr create --body-file /c/Users/x/pr.md", conIssue({ leer: (f) => ((leida = f), `Closes #193\n${CASOS}`) }));
    expect(leida).toBe("c:/Users/x/pr.md");
  });
  it("acepta «Closes: #193»", () => expect(bash(`gh pr create --body "Closes: #193. ${CASOS}"`, conIssue())).toBe(null));
  it("--head dueño:rama y entre comillas también cuentan", () => {
    expect(bash('gh pr create --head pabloam89:ops/193-x --body "x"', ctx())).toBe("deny");
    expect(bash('gh pr create --head "ops/193-x" --body "x"', ctx())).toBe("deny");
  });
  it("otro número no vale", () => expect(bash('gh pr create --body "Closes #19"', conIssue())).toBe("deny"));
  it("--head manda sobre la rama de la carpeta", () =>
    expect(bash('gh pr create --head ops/7-x --body "Closes #193"', conIssue())).toBe("deny"));
  it("rama sin issue: no se pide", () => expect(bash(`gh pr create --body "x. ${CASOS}"`)).toBe(null));
});

describe("gh pr create lleva la línea «Casos:» (#185)", () => {
  it.each([
    'gh pr create --base staging --body "hecho"',
    "gh pr create --base staging",
    "gh pr create --fill",
    'gh pr create --body "Casos:"',
    'gh pr create --body "Casos: ninguno"',
    'gh pr create --body "Casos: ninguno — n/a"',
    'gh pr create --body "Casos: varios fallos"',
  ])("sin ella o rota, no: %s", (c) => {
    const r = decidir({ tool_name: "Bash", tool_input: { command: c } }, ctx());
    expect(r?.decision).toBe("deny");
    expect(r.motivo).toMatch(/Casos/);
  });
  it("el mensaje dice qué escribir", () => {
    const r = decidir({ tool_name: "Bash", tool_input: { command: "gh pr create" } }, ctx());
    expect(r.motivo).toMatch(/Casos: #n, #m/);
    expect(r.motivo).toMatch(/ninguno — /);
  });
  it.each(['gh pr create --body "Casos: #301, #305"', `gh pr create --body "${CASOS}"`])("con ella, pasa: %s", (c) => expect(bash(c)).toBe(null));
  it("admite texto tras la lista (mismo criterio que el CI) pero no 21 números", () => {
    expect(bash('gh pr create --body "Casos: #12 (el test rojo)"')).toBe(null);
    const lista = Array.from({ length: 21 }, (_, i) => `#${i + 1}`).join(", ");
    expect(bash(`gh pr create --body "Casos: ${lista}"`)).toBe("deny");
  });
  it("la lee del --body-file", () => {
    expect(bash("gh pr create --body-file pr.md", ctx({ leer: () => "Closes #1\nCasos: #301" }))).toBe(null);
    expect(bash("gh pr create --body-file pr.md", ctx({ leer: () => "Closes #1" }))).toBe("deny");
    expect(bash("gh pr create --body-file pr.md", ctx({ leer: () => null }))).toBe("deny");
  });
  it("va antes que el atraso: el PR sin línea se niega aunque la rama esté atrasada", () => {
    expect(bash("gh pr create", ctx({ atrasoLocal: () => 3 }))).toBe("deny");
  });
  it("otros gh pr no la piden", () => {
    for (const c of ["gh pr view 3", "gh pr edit 3 --body x", "gh pr checks 3"]) expect(bash(c)).toBe(null);
  });
});

describe("gh pr create con la rama al día", () => {
  it("al día pasa", () => expect(bash(`gh pr create --base staging --title "x" --body "y. ${CASOS}"`)).toBe(null));
  it("atrasada, no", () => expect(bash(`git push -u origin ops/x && gh pr create --base staging --body "${CASOS}"`, ctx({ atrasoLocal: () => 2 }))).toBe("deny"));
  it("sin poder saberlo, pregunta", () => expect(bash(`gh pr create --body "${CASOS}"`, ctx({ atrasoLocal: () => null }))).toBe("ask"));
  it("otros gh pr no lo miran", () => expect(bash("gh pr view 90", ctx({ atrasoLocal: () => 5, choquesDelPr: () => ["a"] }))).toBe(null));
  it("mira la carpeta del `cd`, no la de la sesión", () => {
    let mirada;
    bash(`cd "C:/dev/MenuPlan-x" && gh pr create --body "${CASOS}"`, ctx({ atrasoLocal: (d) => ((mirada = d), 0) }));
    expect(mirada).toBe("C:/dev/MenuPlan-x");
  });
});

describe("una sesión, una carpeta: en la principal no se trabaja", () => {
  const principal = (d) => /MenuPlan$/.test(d);
  const enPrincipal = (command, cwd = "C:/dev/MenuPlan") =>
    decidir({ tool_name: "Bash", tool_input: { command }, cwd }, ctx({ esPrincipal: principal }))?.decision ?? null;

  it.each([
    "git commit -m x",
    "git add src/App.jsx",
    "git checkout -b ops/x",
    "git switch ops/x",
    "git merge origin/staging",
    "git reset --hard HEAD~1",
    "git -C C:/dev/MenuPlan commit -m x",
  ])("niega %s", (c) => expect(enPrincipal(c)).toBe("deny"));

  it.each([
    "git status --short",
    "git log --oneline -5",
    "git pull",
    "git fetch origin",
    "git merge --ff-only origin/staging",
    "git checkout staging",
    "git worktree list",
    "npm run tarea -- ops/x",
  ])("deja %s", (c) => expect(enPrincipal(c)).toBe(null));

  it("en su carpeta, sí", () => expect(enPrincipal("git commit -m x", "C:/dev/MenuPlan-x")).toBe(null));
  it("con `cd` a su carpeta desde la principal, sí", () =>
    expect(enPrincipal('cd /c/dev/MenuPlan-x && git add a.js && git commit -m x')).toBe(null));
  it("con `git -C` a su carpeta, sí", () => expect(enPrincipal("git -C C:/dev/MenuPlan-x commit -m x")).toBe(null));
  it("editar un fichero de la principal, no", () =>
    expect(edita("C:/dev/MenuPlan/src/App.jsx", ctx({ rutaEnPrincipal: () => true }))).toBe("deny"));
});

describe("carpetaDe", () => {
  it("sin cd, la de la sesión", () => expect(carpetaDe("git status", "git status", "C:/s")).toBe("C:/s"));
  it("ruta de bash a Windows", () => expect(carpetaDe("cd /c/dev/X && git add a", "git add a", "C:/s")).toBe("c:/dev/X"));
  it("el último cd anterior a la orden", () =>
    expect(carpetaDe('cd A && git add a && cd "B C" && git commit', "git add a", "C:/s")).toBe("A"));
  it("git -C manda", () => expect(carpetaDe("cd A && git -C 'D' commit", "git -C 'D' commit", "C:/s")).toBe("D"));
});

it("editar los permisos o los hooks ya no pregunta: va por PR con juez y CI", () => {
  expect(edita("C:\\dev\\MenuPlan-x\\.claude\\settings.json")).toBe(null);
  expect(edita("C:/dev/MenuPlan-x/.claude/hooks/guardia.mjs")).toBe(null);
  expect(edita("C:/dev/MenuPlan-x/.claude/hooks/sesiones.mjs")).toBe(null);
  expect(edita("C:/dev/MenuPlan-x/.claude/hooks/arranque.mjs")).toBe(null);
  expect(edita("C:/dev/MenuPlan-x/.claude/settings.local.json")).toBe(null);
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

// ── La puerta de lectura de las skills ─────────────────────────────────────

describe("puerta de lectura: abre la skill antes del primer comando de riesgo", () => {
  const mapa = cargarMapa(RAIZ);
  /** Un contexto con estado, como el registro real: lo abierto y lo avisado. */
  const sesion = ({ abiertas = [], marcaOk = true, extra = {} } = {}) => {
    const vistas = new Set(abiertas);
    return ctx({
      dominios: mapa,
      skillAbierta: (s) => vistas.has(s),
      marcarSkill: (s) => {
        if (!marcaOk) return false;
        vistas.add(s);
        return true;
      },
      ...extra,
    });
  };

  it("la primera vez niega y dice qué skill abrir; el reintento pasa", () => {
    const c = sesion();
    const r = decidir({ tool_name: "Bash", tool_input: { command: "node scripts/telegram-webhook.mjs set https://x.app/api/bot/telegram" } }, c);
    expect(r.decision).toBe("deny");
    expect(r.motivo).toMatch(/skill `telegram`/);
    expect(r.motivo).toMatch(/reintenta/i);
    expect(bash("node scripts/telegram-webhook.mjs set https://x.app/api/bot/telegram", c)).toBe(null);
  });

  it("si ya la abrió, pasa a la primera", () =>
    expect(bash("node scripts/telegram-webhook.mjs delete", sesion({ abiertas: ["telegram"] }))).toBe(null));

  it("la puerta es por skill: abrir una no abre las demás", () => {
    const c = sesion({ abiertas: ["telegram"] });
    expect(bash("vercel env add FOO", c)).toBe("deny");
    expect(bash("vercel env add FOO", c)).toBe(null);
  });

  it("si el comando toca dos dominios, pide las dos de una vez", () => {
    const r = decidir({ tool_name: "Bash", tool_input: { command: "ssh root@100.73.252.32 'tailscale up'" } }, sesion());
    expect(r.decision).toBe("deny");
    expect(r.motivo).toMatch(/`hetzner`/);
    expect(r.motivo).toMatch(/`tailscale`/);
  });

  it("PowerShell también", () =>
    expect(decidir({ tool_name: "PowerShell", tool_input: { command: "node scripts/telegram-perfil.mjs aplicar" } }, sesion())?.decision).toBe("deny"));

  it("falla abierta: si no puede anotar que avisó, no bloquea (atascaría la sesión)", () =>
    expect(bash("node scripts/telegram-webhook.mjs delete", sesion({ marcaOk: false }))).toBe(null));

  it("sin mapa o sin registro, no hay puerta", () => {
    expect(bash("node scripts/telegram-webhook.mjs delete")).toBe(null);
    expect(bash("node scripts/telegram-webhook.mjs delete", ctx({ dominios: mapa }))).toBe(null);
  });

  it("las lecturas y lo de cada día no tienen puerta", () => {
    const c = sesion();
    for (const cmd of ["node scripts/verificar-estado.mjs", "git status --short", "gh pr view 3", "gh pr checks 3", "node scripts/telegram-webhook.mjs info", "npm test"]) {
      expect(bash(cmd, c), cmd).toBe(null);
    }
  });

  it("una regla que ya niega gana y no gasta la puerta", () => {
    const c = sesion();
    expect(bash("node scripts/apply-migration.mjs 0090_x --pablo", c)).toBe("deny");
    const r = decidir({ tool_name: "Bash", tool_input: { command: "node scripts/apply-migration.mjs 0090_x" } }, c);
    expect(r.motivo).toMatch(/skill `supabase`/);
  });

  // Lo que dejó colar la guardia dos veces: mirar un tramo y no el comando. La
  // puerta mira el comando ENTERO; todo esto sigue pidiendo la skill.
  describe.each([
    ["tras un &&", "git fetch && node scripts/telegram-webhook.mjs delete"],
    ["tras un ;", "echo hola; node scripts/telegram-webhook.mjs delete"],
    ["tras un pipe", "echo y | node scripts/telegram-webhook.mjs delete"],
    ["en otra línea", "git fetch\nnode scripts/telegram-webhook.mjs delete"],
    ["con continuación de línea", "node scripts/telegram-webhook.mjs \\\n  delete"],
    ["con continuación de PowerShell", "node scripts/telegram-webhook.mjs `\r\n  delete"],
    ["dentro de bash -c", `bash -c "cd x; node scripts/telegram-webhook.mjs delete"`],
    ["tras un ; dentro de comillas", `echo "a;b" && node scripts/telegram-webhook.mjs delete`],
    ["en mayúsculas", "NODE SCRIPTS/TELEGRAM-WEBHOOK.MJS DELETE"],
    ["con barras de Windows", "node scripts\\telegram-webhook.mjs delete"],
    ["con la ruta absoluta", "node C:/dev/MenuPlan-x/scripts/telegram-webhook.mjs   set   https://x"],
    ["en una variable", "X=delete; node scripts/telegram-webhook.mjs $X"],
  ])("sigue negado %s", (_, cmd) => {
    it(cmd.replace(/\s+/g, " "), () => expect(bash(cmd, sesion())).toBe("deny"));
  });

  it("gh api con método que escribe niega, y con -q de lectura no", () => {
    expect(bash("gh api -X DELETE repos/o/r/branches/x", sesion())).toBe("deny");
    expect(bash("gh api repos/o/r --method PATCH -f a=b", sesion())).toBe("deny");
    expect(bash("gh api repos/pabloam89/MenuPlan -q .security_and_analysis", sesion())).toBe(null);
  });

  describe("skills precargadas de un agente", () => {
    const delAgente = (agent_type) =>
      decidir(
        { tool_name: "Bash", agent_type, tool_input: { command: "ssh root@100.73.252.32 hostname" } },
        sesion({ extra: { skillsDelAgente: (t) => (t === "gobierno" ? ["github", "hetzner", "tailscale"] : []) } }),
      )?.decision ?? null;
    it("gobierno ya trae hetzner: pasa", () => expect(delAgente("gobierno")).toBe(null));
    it("otro agente, o sin saber cuál, paga un reintento", () => {
      expect(delAgente("lola")).toBe("deny");
      expect(delAgente(undefined)).toBe("deny");
    });
  });
});

// El cableado de verdad: contextoReal con un repo git temporal, el registro de
// sesiones en su .git y un agente con skills en su frontmatter. Los tests de
// arriba simulan el registro con sesion(); estos prueban que lo real encaja.
describe("puerta de lectura: el cableado real", () => {
  const repo = mkdtempSync(join(tmpdir(), "guardia-cableado-"));
  execFileSync("git", ["init", "-q", repo]);
  mkdirSync(join(repo, ".claude", "agents"), { recursive: true });
  copyFileSync(join(RAIZ, ".claude", "dominios-skills.json"), join(repo, ".claude", "dominios-skills.json"));
  writeFileSync(join(repo, ".claude", "agents", "probando.md"), "---\nname: probando\nskills: [hetzner, tailscale]\nmodel: inherit\n---\ncuerpo\n");
  const entrada = (command, extra = {}) => ({ session_id: "cableado-sesion-1", cwd: repo, tool_name: "Bash", tool_input: { command }, ...extra });
  // Como el hook: un proceso (un contexto) nuevo por acción.
  const lanza = (command, extra) => {
    const e = entrada(command, extra);
    return decidir(e, contextoReal(repo, e))?.decision ?? null;
  };

  it("skillAbierta / marcarSkill escriben y leen el registro de la sesión", () => {
    const c = contextoReal(repo, entrada("x"));
    expect(c.skillAbierta("github")).toBe(false);
    expect(c.marcarSkill("github")).toBe(true);
    expect(contextoReal(repo, entrada("x")).skillAbierta("github")).toBe(true);
    expect(contextoReal(repo, entrada("x", { session_id: "otra-sesion-99" })).skillAbierta("github")).toBe(false);
    expect(existsSync(join(repo, ".git", "claude-sesiones", "skills", "cableado-sesion-1__github.json"))).toBe(true);
  });

  it("skillsDelAgente lee el frontmatter del agente, y solo de un nombre válido", () => {
    const c = contextoReal(repo, entrada("x"));
    expect(c.skillsDelAgente("probando")).toEqual(["hetzner", "tailscale"]);
    expect(c.skillsDelAgente("no-existe")).toEqual([]);
    expect(c.skillsDelAgente("../probando")).toEqual([]);
    expect(c.skillsDelAgente(undefined)).toEqual([]);
  });

  it("de punta a punta: niega a la primera, pasa al reintento, y un agente con la skill pasa", () => {
    const cmd = "node scripts/telegram-webhook.mjs delete";
    expect(lanza(cmd)).toBe("deny");
    expect(lanza(cmd)).toBe(null);
    expect(lanza("ssh root@100.73.252.32 hostname", { agent_type: "probando" })).toBe(null);
    expect(lanza("vercel env ls", { agent_type: "probando" })).toBe("deny");
  });

  it("sin id de sesión no puede anotar el aviso, así que no bloquea", () => {
    expect(lanza("node scripts/telegram-perfil.mjs aplicar", { session_id: undefined })).toBe(null);
  });
});

describe("entrada ilegible (#209)", () => {
  // Si la guardia no puede leer lo que le llega, pregunta: ni deja pasar en
  // silencio (antes salía con 0 y no vigilaba nada) ni niega (un fallo tonto
  // no debe dejar parada una sesión). Decidido por Pablo el 8 oct.
  const GUARDIA = join(RAIZ, ".claude", "hooks", "guardia.mjs");
  const lanza = (entrada) => {
    const r = spawnSync(process.execPath, [GUARDIA], { input: entrada, encoding: "utf8", timeout: 20000 });
    return { codigo: r.status, salida: r.stdout };
  };

  it.each([
    ["JSON inválido", "{esto no es json"],
    ["entrada vacía", ""],
    ["JSON que no es un objeto", "null"],
  ])("%s: pregunta", (_, entrada) => {
    const { codigo, salida } = lanza(entrada);
    expect(codigo).toBe(0);
    const out = JSON.parse(salida).hookSpecificOutput;
    expect(out.hookEventName).toBe("PreToolUse");
    expect(out.permissionDecision).toBe("ask");
    expect(out.permissionDecisionReason).toMatch(/no ha podido leer/);
  });
});

// La puerta de lectura no afloja nada: lo que ya se negaba se sigue negando igual
// con la puerta puesta, en el primer intento y en el reintento.
describe("la puerta no afloja las reglas duras", () => {
  const mapa = cargarMapa(RAIZ);
  const conPuerta = () => {
    const vistas = new Set();
    return ctx({ dominios: mapa, skillAbierta: (s) => vistas.has(s), marcarSkill: (s) => (vistas.add(s), true) });
  };
  const peligrosos = [
    "node scripts/apply-migration.mjs 0090_x --pablo",
    "git push origin main",
    "git stash",
    'psql "$SUPABASE_DB_URL" -c "drop table x"',
  ];
  const motivo = (cmd, c) => decidir({ tool_name: "Bash", tool_input: { command: cmd } }, c)?.motivo;
  it.each(peligrosos)("%s: deny sin puerta, y con puerta en el 1er intento y en el reintento", (cmd) => {
    expect(bash(cmd)).toBe("deny");
    const c = conPuerta();
    const sin = motivo(cmd, ctx());
    expect(motivo(cmd, c)).toBe(sin);
    expect(motivo(cmd, c)).toBe(sin);
  });
  it("y la carpeta principal sigue mandando sobre la puerta", () => {
    const c = ctx({ esPrincipal: () => true, dominios: mapa, skillAbierta: () => false, marcarSkill: () => true });
    const r = decidir({ tool_name: "Bash", cwd: "C:/dev/MenuPlan", tool_input: { command: "git commit -m 'toca apply-migration'" } }, c);
    expect(r.decision).toBe("deny");
    expect(r.motivo).toMatch(/carpeta principal/);
  });
});

// ── La puerta de las skills también al editar (#397) ───────────────────────

describe("puerta de lectura al editar: abre la skill antes de tocar su dominio (#397)", () => {
  const mapa = cargarMapa(RAIZ);
  const sesion = ({ abiertas = [], marcaOk = true, extra = {} } = {}) => {
    const vistas = new Set(abiertas);
    return ctx({
      dominios: mapa,
      skillAbierta: (s) => vistas.has(s),
      marcarSkill: (s) => {
        if (!marcaOk) return false;
        vistas.add(s);
        return true;
      },
      rutaDelRepo: (r) => (r.startsWith("C:/w/") ? r.slice(5) : r.startsWith("C:\\w\\") ? r.slice(5).replace(/\\/g, "/") : null),
      ...extra,
    });
  };
  const toca = (tool_name, file_path, c, extra = {}) => decidir({ tool_name, tool_input: { file_path }, ...extra }, c);

  it("Edit de un fichero del dominio: niega a la primera con la skill, y la misma edición pasa al reintento", () => {
    const c = sesion();
    const r = toca("Edit", "C:/w/vercel.json", c);
    expect(r?.decision).toBe("deny");
    expect(r.motivo).toMatch(/skill `vercel`/);
    expect(r.motivo).toMatch(/la misma edición/);
    expect(toca("Edit", "C:/w/vercel.json", c)).toBe(null);
  });

  it.each([
    ["Write", "C:/w/supabase/migrations/0150_nueva.sql", "supabase"],
    ["MultiEdit", "C:/w/scripts/telegram-webhook.mjs", "telegram"],
    ["Edit", "C:/w/.github/workflows/tests.yml", "github"],
    ["Edit", "C:\\w\\ops\\copias\\copia-base.sh", "hetzner"],
    ["Write", "C:/w/scripts/lib/issues.mjs", "issues"],
  ])("%s %s pide la skill %s", (herramienta, ruta, skill) => {
    const r = toca(herramienta, ruta, sesion());
    expect(r?.decision).toBe("deny");
    expect(r.motivo).toContain(`\`${skill}\``);
  });

  it("si la sesión ya abrió la skill, o el agente la trae precargada, pasa a la primera", () => {
    expect(toca("Edit", "C:/w/vercel.json", sesion({ abiertas: ["vercel"] }))).toBe(null);
    const conAgente = sesion({ extra: { skillsDelAgente: (t) => (t === "datos" ? ["supabase"] : []) } });
    expect(toca("Write", "C:/w/supabase/migrations/0150_x.sql", conAgente, { agent_type: "datos" })).toBe(null);
  });

  it("el aviso es uno por skill y sesión: el de un comando vale para la edición", () => {
    const c = sesion();
    expect(bash("vercel env add FOO", c)).toBe("deny");
    expect(toca("Edit", "C:/w/vercel.json", c)).toBe(null);
  });

  it("lo que no es de ningún dominio, o cae fuera de la carpeta, no tiene puerta", () => {
    const c = sesion();
    for (const ruta of ["C:/w/src/App.jsx", "C:/w/api/_bot/agente.js", "C:/w/docs/vercel.json", "D:/otro/vercel.json"]) {
      expect(toca("Edit", ruta, c)?.decision ?? null, ruta).toBe(null);
    }
  });

  it("falla abierta: sin mapa, sin registro, sin rutaDelRepo o sin poder anotar, no bloquea", () => {
    expect(toca("Edit", "C:/w/vercel.json", ctx())).toBe(null);
    expect(toca("Edit", "C:/w/vercel.json", sesion({ marcaOk: false }))).toBe(null);
    expect(toca("Edit", "C:/w/vercel.json", sesion({ extra: { rutaDelRepo: undefined } }))).toBe(null);
  });

  it("las reglas duras ganan y no gastan el aviso", () => {
    const c = sesion({ extra: { enStaging: () => true } });
    const r = toca("Edit", "C:/w/supabase/migrations/0079_personas_y_grupos.sql", c);
    expect(r?.decision).toBe("deny");
    expect(r.motivo).not.toMatch(/skill `supabase`/);
    const p = sesion({ extra: { rutaEnPrincipal: () => true } });
    expect(toca("Edit", "C:/w/vercel.json", p).motivo).toMatch(/carpeta principal/);
    expect(toca("Edit", "C:/w/vercel.json", sesion()).motivo).toMatch(/skill `vercel`/);
  });
});

describe("puerta de lectura al editar: el cableado real (#397)", () => {
  // Una carpeta de trabajo (worktree), no la principal: en la principal ya
  // niega otra regla antes de llegar a la puerta.
  const base = mkdtempSync(join(tmpdir(), "guardia-editar-"));
  execFileSync("git", ["init", "-q", base]);
  execFileSync("git", ["-C", base, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "base"]);
  const repo = join(base, "trabajo");
  execFileSync("git", ["-C", base, "worktree", "add", "-q", repo]);
  mkdirSync(join(repo, ".claude"), { recursive: true });
  copyFileSync(join(RAIZ, ".claude", "dominios-skills.json"), join(repo, ".claude", "dominios-skills.json"));
  const lanza = (file_path, session_id = "editar-sesion-1") => {
    const e = { session_id, cwd: repo, tool_name: "Edit", tool_input: { file_path } };
    return decidir(e, contextoReal(repo, e))?.decision ?? null;
  };

  it("rutaDelRepo da la ruta del repo con barras normales, y null fuera", () => {
    const c = contextoReal(repo, { cwd: repo });
    expect(c.rutaDelRepo(join(repo, "supabase", "migrations", "0150_x.sql"))).toBe("supabase/migrations/0150_x.sql");
    expect(c.rutaDelRepo(join(tmpdir(), "fuera.json"))).toBe(null);
    expect(c.rutaDelRepo("")).toBe(null);
  });

  it("con la sesión en la carpeta principal y el fichero en una carpeta de trabajo, la ruta sale de la del fichero (#397)", () => {
    // Lo normal: sesión en C:\dev\MenuPlan editando C:\dev\MenuPlan-<tarea>\vercel.json.
    const desdeLaPrincipal = contextoReal(base, { cwd: base });
    expect(desdeLaPrincipal.rutaDelRepo(join(repo, "vercel.json"))).toBe("vercel.json");
    mkdirSync(join(base, ".claude"), { recursive: true }); // la principal también tiene su mapa
    copyFileSync(join(RAIZ, ".claude", "dominios-skills.json"), join(base, ".claude", "dominios-skills.json"));
    const e = { session_id: "editar-desde-principal", cwd: base, tool_name: "Edit", tool_input: { file_path: join(repo, "vercel.json") } };
    expect(decidir(e, contextoReal(base, e))?.decision).toBe("deny");
    // Otro repo no lleva puerta.
    const otro = mkdtempSync(join(tmpdir(), "guardia-otro-"));
    execFileSync("git", ["init", "-q", otro]);
    expect(desdeLaPrincipal.rutaDelRepo(join(otro, "vercel.json"))).toBe(null);
  });

  it("de punta a punta: niega la primera edición, pasa la segunda, y otra sesión vuelve a pagar", () => {
    const ruta = join(repo, "vercel.json");
    const e = { session_id: "editar-sesion-0", cwd: repo, tool_name: "Edit", tool_input: { file_path: ruta } };
    expect(decidir(e, contextoReal(repo, e))?.motivo).toMatch(/skill `vercel`/);
    expect(lanza(ruta)).toBe("deny");
    expect(lanza(ruta)).toBe(null);
    expect(lanza(ruta, "editar-sesion-2")).toBe("deny");
    expect(lanza(join(repo, "src", "App.jsx"))).toBe(null);
  });
});

describe("credenciales de la sesión: no volver a las de Pablo ni cambiar las reglas del repo (#447)", () => {
  it.each([
    "env -u GH_TOKEN gh pr list",
    "env -uGH_TOKEN gh pr list",
    "env --unset=GITHUB_TOKEN git push",
    "env -u FOO -u GH_TOKEN gh api user",
    "env -i gh pr list",
    "unset GH_TOKEN",
    "unset GH_TOKEN && gh pr list",
    "unset -v GITHUB_TOKEN; git push -u origin ops/x",
    "(unset GH_TOKEN; gh pr list)",
    'bash -c "unset GH_TOKEN; gh pr list"',
    "GH_TOKEN= gh pr list",
    'GH_TOKEN="" gh pr list',
    "GITHUB_TOKEN='' git push",
    "export GH_TOKEN=",
    "export GH_TOKEN= && gh pr list",
    "env GH_TOKEN= gh pr list",
    "export -n GH_TOKEN",
    "Remove-Item Env:GH_TOKEN",
    "Remove-Item Env:\\GITHUB_TOKEN; gh pr list",
    '$env:GH_TOKEN = ""',
    "$env:GH_TOKEN=$null; gh pr list",
    "[Environment]::SetEnvironmentVariable('GH_TOKEN', $null)",
    "git -c credential.helper= push",
    "git -c credential.helper=manager push origin ops/x",
    'git -c "credential.https://github.com.helper=" push',
    "git -ccredential.helper= push",
    "git config --global credential.helper manager",
    "GIT_CONFIG_COUNT=0 git push",
    "GIT_AUTHOR_NAME=Pablo git commit -m x",
    "export GIT_COMMITTER_EMAIL=pablo@example.com",
    "unset GIT_CONFIG_COUNT",
    "env -u GIT_AUTHOR_NAME git commit -m x",
    "$env:GIT_AUTHOR_NAME = 'Pablo'",
    "node scripts/rulesets.mjs --escribir",
    "node scripts/rulesets.mjs --escribir --ruleset staging",
    "gh api -X PUT repos/pabloam89/MenuPlan/rulesets/24770007",
    "gh api repos/pabloam89/MenuPlan/rulesets --method POST --input r.json",
    "gh api -XPATCH repos/pabloam89/MenuPlan/rulesets/1",
    "gh api repos/pabloam89/MenuPlan/rulesets/1 -X DELETE",
    "gh api -X PUT repos/pabloam89/MenuPlan/branches/main/protection --input p.json",
    "gh api -X PUT repos/pabloam89/MenuPlan/collaborators/algbarc -f permission=admin",
    "gh api -X PUT repos/pabloam89/MenuPlan/actions/secrets/X -f encrypted_value=a",
    "gh api -X POST repos/pabloam89/MenuPlan/actions/variables -f name=A -f value=b",
    "gh api -X PUT repos/pabloam89/MenuPlan/environments/prod",
    "gh api -X POST repos/pabloam89/MenuPlan/hooks -f url=http://x",
    "gh api -X POST repos/pabloam89/MenuPlan/keys -f key=ssh-rsa",
    // sin -X pero con campos: gh api pasa a POST solo
    "gh api repos/pabloam89/MenuPlan/rulesets -f name=x",
    "gh api repos/pabloam89/MenuPlan/collaborators/algbarc -F permission=admin",
    'gh api graphql -f query=\'mutation { updateRepository(input:{repositoryId:"x"}) { clientMutationId } }\'',
    "gh api graphql -f query='mutation { createBranchProtectionRule(input:{}) { clientMutationId } }'",
    'gh api graphql -f query=\'mutation { addPullRequestReview(input:{pullRequestId:"x", event: APPROVE}) { clientMutationId } }\'',
    "gh api -X POST repos/pabloam89/MenuPlan/pulls/12/reviews -f event=APPROVE",
    "gh pr review 12 --approve",
    "gh pr review 12 -a",
    "gh pr review --approve 12 --body ok",
    "gh -R pabloam89/MenuPlan pr review 12 --approve",
    "echo ok && gh pr review 12 --approve",
    'bash -c "gh pr review 12 --approve"',
    "echo $GH_TOKEN",
    'echo "token: ${GH_TOKEN}"',
    "printenv",
    "printenv GH_TOKEN",
    "printenv | grep TOKEN",
    "env",
    "Get-ChildItem Env:",
    'node -e "console.log(process.env.GH_TOKEN)"',
  ])("deniega %s", (c) => expect(bash(c)).toBe("deny"));

  it.each([
    // el remedio documentado y lo normal con GH_TOKEN puesto
    "node scripts/token-sesion.mjs -- gh pr list",
    "node scripts/token-sesion.mjs -- git push -u origin ops/x",
    "node scripts/token-sesion.mjs --comprobar",
    "gh pr list",
    "gh pr checks 12",
    "gh pr view 12 --json body -q .body",
    "gh pr review 12 --comment --body 'Mira esto'",
    "gh pr review 12 --request-changes --body 'Falta el test'",
    "git push -u origin ops/447-guardia-credenciales",
    "git fetch origin staging",
    "git config --get credential.helper",
    "git config --list",
    "git -C /c/dev/MenuPlan-x status",
    "git -c core.autocrlf=false diff",
    "export GH_TOKEN=ghs_valor_de_la_app",
    'GH_TOKEN="$(node scripts/token-sesion.mjs --comprobar)" gh pr list',
    "export GIT_PAGER=cat",
    "printenv PATH",
    "echo hola",
    "echo $HOME",
    // lecturas por la API, aunque sean rutas de reglas
    "gh api repos/pabloam89/MenuPlan/rules/branches/staging",
    "gh api repos/pabloam89/MenuPlan/rulesets",
    "gh api repos/pabloam89/MenuPlan/rulesets/24770007 -q .name",
    "gh api repos/pabloam89/MenuPlan/environments/mercadona-sync/deployment-branch-policies -q '.branch_policies[].name'",
    "gh api -X GET repos/pabloam89/MenuPlan/rulesets -f per_page=5",
    "gh api repos/pabloam89/MenuPlan/branches/staging/protection",
    "gh api repos/pabloam89/MenuPlan/collaborators",
    // escribir en otras rutas de la API no es cambiar reglas
    "gh api -X POST repos/pabloam89/MenuPlan/issues/447/comments -f body=hola",
    "gh api -X PATCH repos/pabloam89/MenuPlan/issues/447 -f state=closed",
    "gh api repos/pabloam89/MenuPlan/contents/.claude/hooks/guardia.mjs",
    "gh api -X POST repos/pabloam89/MenuPlan/pulls/12/reviews -f event=COMMENT -f body=ok",
    "gh api graphql -f query='query { viewer { login } }'",
    "node scripts/rulesets.mjs",
    "node scripts/rulesets.mjs --comprobar",
    "grep -rn 'rulesets.mjs --escribir' scripts",
    "rg 'env -u GH_TOKEN' .claude",
    'echo "unset GH_TOKEN"',
    "cat .claude/hooks/guardia.mjs",
  ])("deja pasar %s", (c) => expect(bash(c)).toBe(null));

  // El texto de un commit, un PR, un issue o un heredoc que NOMBRA estas cosas no es una orden.
  it.each([
    'git commit -m "guardia: niega env -u GH_TOKEN, unset GH_TOKEN; y GH_TOKEN= vacío"',
    "git commit -m 'guardia: git -c credential.helper= y node scripts/rulesets.mjs --escribir'",
    'git commit --message="niega gh pr review --approve; unset GH_TOKEN"',
    'git commit -m "una" -m "otra: GIT_AUTHOR_NAME=x; export GH_TOKEN="',
    'gh issue comment 447 --body "no hacer env -u GH_TOKEN ni printenv; echo $GH_TOKEN"',
    'gh pr edit 480 --title "niega unset GH_TOKEN" --body "gh api -X PUT repos/o/r/rulesets/1"',
    'npm run issues -- --nuevo "Una sesión hace env -u GH_TOKEN" --tipo caso --area ops --cuerpo f.md',
    "git commit -F - <<'EOF'\nguardia: unset GH_TOKEN\nenv -u GH_TOKEN gh pr list\ngit -c credential.helper= push\nEOF",
    'git commit -m "$(cat <<\'EOF\'\nniega GH_TOKEN= vacío y gh pr review --approve\nunset GH_TOKEN\nEOF\n)"',
  ])("deja pasar el texto: %s", (c) => expect(bash(c)).toBe(null));

  it("un heredoc que alimenta a un shell sí cuenta", () => {
    expect(bash("bash <<'EOF'\nunset GH_TOKEN\ngh pr list\nEOF")).toBe("deny");
  });

  it("también en PowerShell", () => {
    const ps = (command) => decidir({ tool_name: "PowerShell", tool_input: { command } }, ctx())?.decision ?? null;
    expect(ps("Remove-Item Env:GH_TOKEN")).toBe("deny");
    expect(ps('$env:GH_TOKEN = ""')).toBe("deny");
    // La herramienta PowerShell no lleva el token de la sesión: gh y git de red irían como Pablo.
    expect(ps("gh pr list")).toBe("deny");
    expect(ps("node scripts/token-sesion.mjs -- gh pr list")).toBe(null);
    expect(ps("git status --short")).toBe(null);
  });

  it("cada aviso explica qué hacer en vez y tiene su familia contable", () => {
    for (const [clave, texto] of Object.entries(AVISOS_CREDENCIALES)) {
      expect(texto, clave).toMatch(/#447/);
      expect(familiaDeGuardia(texto), clave).not.toBe("otra");
    }
    expect(AVISOS_CREDENCIALES.token).toMatch(/token-sesion\.mjs -- /);
    expect(AVISOS_CREDENCIALES.identidad).toMatch(/token-sesion\.mjs -- /);
    expect(AVISOS_CREDENCIALES.reglas).toMatch(/Pablo/);
    const familias = Object.values(AVISOS_CREDENCIALES).map(familiaDeGuardia);
    expect(new Set(familias).size).toBe(familias.length);
  });
});

describe("credenciales de la sesión: ronda de jueces (#447)", () => {
  const ps = (command) => decidir({ tool_name: "PowerShell", tool_input: { command } }, ctx())?.decision ?? null;

  // 1. Sacar las credenciales guardadas
  it.each([
    "gh auth token",
    "gh auth token --user pabloam89",
    "gh auth token -u pabloam89",
    "gh auth status -t",
    "gh auth status --show-token",
    "gh auth status -h github.com --show-token",
    "gh auth switch",
    "gh auth login",
    "gh auth refresh -s admin:repo_hook",
    "gh auth setup-git",
    "gh auth logout",
    "git credential fill",
    "git credential-manager get",
    "git-credential-manager erase",
    "git -C /c/dev/x credential reject",
    "cmdkey /list",
    'GH_TOKEN="$(gh auth token)" node scripts/dependabot-auto.mjs',
    "export GH_TOKEN=$(gh auth token) && gh api user",
  ])("deniega las credenciales guardadas: %s", (c) => expect(bash(c)).toBe("deny"));

  it.each(["gh auth status", "gh auth status -h github.com", "git config --get user.name", "git commit -m 'sin credential aquí'"])(
    "deja pasar %s",
    (c) => expect(bash(c)).toBe(null),
  );

  // 2. PowerShell no lleva el token de la sesión
  it.each([
    "gh pr list",
    "gh.exe pr view 3",
    "& gh pr checks 3",
    "(gh pr list)",
    "git push -u origin ops/x",
    "git -C C:\\dev\\x push",
    "git pull --ff-only",
    "git fetch origin staging",
    "git clone https://github.com/pabloam89/MenuPlan",
    "git ls-remote origin",
  ])("en PowerShell se niega %s sin el envoltorio", (c) => expect(ps(c)).toBe("deny"));

  it.each([
    "node scripts/token-sesion.mjs -- gh pr list",
    "node scripts/token-sesion.mjs -- git push -u origin ops/x",
    "git status --short",
    "git log --oneline -5",
    "git commit -m 'gh pr list'",
    "npm run lint:base",
  ])("en PowerShell deja pasar %s", (c) => expect(ps(c)).toBe(null));

  it("en Bash, gh y git push siguen como siempre (llevan el token de la sesión)", () => {
    expect(bash("gh pr list")).toBe(null);
    expect(bash("git push -u origin ops/x")).toBe(null);
  });

  // 2b. Más ajustes del repo
  it.each([
    "gh secret set X --env prod",
    "gh secret delete X",
    "gh variable set A --body b",
    "gh variable delete A",
    "gh repo edit --visibility private",
    "gh repo edit --default-branch main",
    "gh repo deploy-key add key.pub",
    "gh repo deploy-key delete 5",
    "gh repo delete pabloam89/MenuPlan --yes",
    "gh repo archive pabloam89/MenuPlan",
    "gh repo rename otro",
    "gh pr merge 12 --merge --admin",
    "gh api -X PATCH repos/pabloam89/MenuPlan -f private=true",
    "gh api -X DELETE repos/pabloam89/MenuPlan",
    "gh api -X POST repos/pabloam89/MenuPlan/transfer -f new_owner=x",
    "gh api -X PUT repos/pabloam89/MenuPlan/dependabot/secrets/X",
    "gh api -X PUT repos/pabloam89/MenuPlan/codespaces/secrets/X",
    "gh api -X PUT repos/pabloam89/MenuPlan/actions/permissions -F enabled=true",
    "gh api -X POST orgs/algo/rulesets --input r.json",
    "gh api -X PUT repos/pabloam89/MenuPlan//rulesets/1",
    "gh api -X PUT /repos/pabloam89/MenuPlan/rulesets/1",
    "gh api graphql --input q.json",
    "gh api graphql -F query=@mutacion.graphql",
    "gh api -X POST repos/pabloam89/MenuPlan/pulls/12/reviews --input r.json",
    "gh pr review 12 -ab",
    "gh pr review 12 -ca",
  ])("deniega %s", (c) => expect(bash(c)).toBe("deny"));

  it.each([
    "gh secret list",
    "gh variable list",
    "gh repo view",
    "gh repo clone pabloam89/MenuPlan",
    "gh pr merge 12 --merge",
    "gh api repos/pabloam89/MenuPlan",
    "gh api -X GET repos/pabloam89/MenuPlan/rulesets",
    "gh api graphql -f query='mutation { addPullRequestReview(input:{pullRequestId:\"x\", event: COMMENT}) { clientMutationId } }'",
  ])("deja pasar %s", (c) => expect(bash(c)).toBe(null));

  // 3. Un & suelto separa órdenes
  it.each([
    "echo x & unset GH_TOKEN",
    "echo x & env -u GH_TOKEN gh pr list",
    "ls &  gh pr review 3 --approve",
  ])("el & suelto no esconde la segunda orden: %s", (c) => expect(bash(c)).toBe("deny"));

  it.each([
    "npm test 2>&1",
    "npm test &> /tmp/salida.txt",
    "git fetch origin staging >/dev/null 2>&1",
    "gh api 'repos/pabloam89/MenuPlan/pulls?state=open&per_page=5'",
    "git status && git log -1",
  ])("el & de una redirección o una URL no rompe %s", (c) => expect(bash(c)).toBe(null));

  // 4. Un valor entre comillas dobles con $( ) o acentos graves se ejecuta
  it.each([
    'git commit -m "$(env -u GH_TOKEN gh api user)"',
    'git commit -m "`unset GH_TOKEN`"',
    'gh issue comment 447 --body "$(gh auth token)"',
  ])("el texto que se ejecuta cuenta: %s", (c) => expect(bash(c)).toBe("deny"));

  // 5. El heredoc que va a un shell por una tubería
  it("cat <<EOF | bash cuenta", () => {
    expect(bash("cat <<'EOF' | bash\nunset GH_TOKEN\nEOF")).toBe("deny");
    expect(bash("cat <<'EOF' | xargs -I{} sh -c {}\nunset GH_TOKEN\nEOF")).toBe("deny");
  });

  // 6. Normalizar antes de mirar
  it.each([
    'un""set GH_TOKEN',
    "u'n'set GH_TOKEN",
    "un\\set GH_TOKEN",
    "unset 'GH_TOKEN'",
    'env -u "GH_TOKEN" gh pr list',
    "unset \\\nGH_TOKEN",
    "GH_TOKEN='' gh pr list",
    "Remove-Item Env:GH_*",
    "Remove-Item Env:*TOKEN",
    "Remove-Item -Path Env:GH_TOKEN",
    "ri Env:GITHUB_TOKEN",
    "Remove-Variable env:GH_TOKEN",
    "Clear-Item Env:GH_TOKEN",
    "${env:GH_TOKEN} = $null",
    "$env:GH_TOKEN=''",
    "Start-Process pwsh -UseNewEnvironment",
    "gci Env:GH_* | Remove-Item",
  ])("normaliza antes de mirar: %s", (c) => expect(bash(c)).toBe("deny"));

  // 7. Los mensajes cuentan como texto aunque vayan con banderas juntas o sin espacio
  it.each([
    'git commit -sm "niega unset GH_TOKEN"',
    'git commit -m"niega unset GH_TOKEN; env -u GH_TOKEN gh x"',
    'gh api -X POST repos/pabloam89/MenuPlan/issues/447/comments -f body="unset GH_TOKEN y repos/o/r/rulesets y gh pr review --approve"',
    'gh api repos/pabloam89/MenuPlan/issues/447/comments -F body="env -u GH_TOKEN"',
    "gh api -X PATCH repos/pabloam89/MenuPlan/issues/447 --raw-field body='gh api -X PUT repos/o/r/rulesets/1'",
    "gh api -X POST repos/pabloam89/MenuPlan/issues/447/comments -f 'body=PUT repos/o/r/rulesets/1'",
  ])("deja pasar el texto: %s", (c) => expect(bash(c)).toBe(null));

  it("-am también limpia su mensaje (la regla de add a ciegas lo niega aparte)", () => {
    expect(sinTextos('git commit -am "niega env -u GH_TOKEN; unset GH_TOKEN"')).not.toMatch(/GH_TOKEN/);
  });

  // 8. awk y sed ejecutan
  it.each(["awk 'BEGIN{system(\"unset GH_TOKEN\")}'", "sed -n '1e unset GH_TOKEN' f"])(
    "awk y sed no son solo texto: %s",
    (c) => expect(bash(c)).toBe("deny"),
  );

  // 9. Una orden enorme no cuelga la guardia (se mide esta parte; el resto de reglas de decidir tiene las suyas)
  it("una orden de 80 KB se decide en poco tiempo", () => {
    const enormes = [
      `env ${"a ".repeat(40000)}`,
      `git ${"-c x ".repeat(16000)}`,
      `unset ${"X ".repeat(40000)}`,
      `echo ${"env ".repeat(20000)}`,
      `gh api ${"-f a=b ".repeat(11000)}`,
      `Remove-Item ${"Env: ".repeat(16000)}`,
      "x <<EOF\n" + "a\n".repeat(40000),
      "x <<EOF\n".repeat(30000),
      "a\n".repeat(40000),
    ];
    for (const c of enormes) {
      const t0 = Date.now();
      credencialDeComando(c);
      expect(Date.now() - t0, c.slice(0, 20)).toBeLessThan(250);
    }
  });

  // 10. GIT_ID: solo lo que cambia credenciales o autoría
  it.each([
    "GIT_AUTHOR_NAME=x git commit -m a",
    "GIT_COMMITTER_EMAIL=x git commit -m a",
    "GIT_CONFIG_COUNT=1 git push",
    "GIT_CONFIG_KEY_0=credential.helper git push",
    "GIT_CONFIG_VALUE_0= git push",
    "GIT_CONFIG_GLOBAL=/tmp/x git push",
    "GIT_CONFIG_PARAMETERS=x git push",
    "GIT_CONFIG_SYSTEM=/tmp/x git push",
  ])("deniega %s", (c) => expect(bash(c)).toBe("deny"));
  it.each([
    "GIT_COMMITTER_DATE=2026-10-10T10:00:00 git commit -m a",
    "GIT_AUTHOR_DATE=2026-10-10T10:00:00 git commit --amend --no-edit",
    "GIT_CONFIG_NOSYSTEM=1 git status",
    "export GIT_PAGER=cat",
  ])("deja pasar %s", (c) => expect(bash(c)).toBe(null));

  // 11. Aprobar por GraphQL solo con APPROVE: ya cubierto arriba con COMMENT; aquí el APPROVE
  it("addPullRequestReview con APPROVE se niega, con COMMENT pasa", () => {
    const q = (e) => `gh api graphql -f query='mutation { addPullRequestReview(input:{pullRequestId:"x", event: ${e}}) { clientMutationId } }'`;
    expect(bash(q("APPROVE"))).toBe("deny");
    expect(bash(q("COMMENT"))).toBe(null);
  });

  // 12. Imprimir el token, más formas
  it.each([
    "$env:GH_TOKEN",
    "Get-Item Env:GH_TOKEN",
    "gci Env:GH_TOKEN",
    "[Environment]::GetEnvironmentVariable('GH_TOKEN')",
    "node -p process.env.GH_TOKEN",
    "node -e \"console.log(process.env.GITHUB_TOKEN)\"",
    "declare -p",
    "declare -x",
    "cat /proc/self/environ",
    "env | sort",
    "printenv | grep -i token",
    "env | grep GH_",
    "Write-Host $env:GH_TOKEN",
  ])("no imprimir el token: %s", (c) => expect(bash(c)).toBe("deny"));
  it.each([
    "env | grep -i path",
    "printenv | grep -i node",
    "env | wc -l",
    "printenv HOME",
    "Get-ChildItem Env:PATH",
  ])("deja pasar %s", (c) => expect(bash(c)).toBe(null));

  it("los avisos nuevos tienen familia propia", () => {
    expect(familiaDeGuardia(AVISOS_CREDENCIALES.guardadas)).toBe("credenciales-guardadas");
    expect(familiaDeGuardia(AVISOS_CREDENCIALES.powershell)).toBe("powershell-sin-token");
    expect(AVISOS_CREDENCIALES.powershell).toMatch(/token-sesion\.mjs -- /);
    expect(AVISOS_CREDENCIALES.guardadas).toMatch(/token-sesion\.mjs -- /);
  });
});
