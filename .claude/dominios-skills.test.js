import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarMapa, skillsDeComando, skillsDeFicheros } from "./hooks/dominios.mjs";

/**
 * El mapa de dominios con skill (.claude/dominios-skills.json) lo leen la
 * puerta de lectura de la guardia y la comprobación «Runbook:» del CI. Si se
 * separa de las skills reales, la puerta pediría abrir una que no existe o
 * dejaría sin puerta a una que sí. Este test lo cruza con .claude/skills/.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR = join(AQUI, "skills");
const skills = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const mapa = cargarMapa(join(AQUI, ".."));

describe("mapa de dominios", () => {
  it("se carga", () => expect(mapa).not.toBeNull());

  it("cada skill del mapa existe", () => {
    for (const nombre of Object.keys(mapa.skills)) expect(existsSync(join(DIR, nombre, "SKILL.md")), nombre).toBe(true);
  });

  it("cada skill existente está en el mapa o declarada exenta (con motivo)", () => {
    for (const nombre of skills) {
      const enMapa = nombre in mapa.skills;
      const exenta = Boolean(mapa.exentas?.[nombre]);
      expect(enMapa || exenta, `${nombre}: añádela a .claude/dominios-skills.json (skills o exentas)`).toBe(true);
      expect(enMapa && exenta, `${nombre}: no puede estar en las dos`).toBe(false);
    }
  });

  it("las exentas existen y llevan motivo", () => {
    for (const [nombre, motivo] of Object.entries(mapa.exentas ?? {})) {
      expect(skills, nombre).toContain(nombre);
      expect(String(motivo).length, nombre).toBeGreaterThan(10);
    }
  });

  it("los patrones compilan y ninguno es vacío (uno vacío casaría con todo)", () => {
    for (const [nombre, d] of Object.entries(mapa.skills)) {
      expect(d.comandos.length + d.rutas.length, nombre).toBeGreaterThan(0);
      for (const p of [...d.comandos, ...d.rutas]) {
        expect(typeof p, nombre).toBe("string");
        expect(() => new RegExp(p), `${nombre}: ${p}`).not.toThrow();
        expect(new RegExp(p, "i").test(""), `${nombre}: «${p}» casa con la cadena vacía`).toBe(false);
      }
    }
  });
});

describe("qué comandos tienen puerta", () => {
  const casos = {
    supabase: [
      "node scripts/apply-migration.mjs 0090_x",
      "node scripts/apply-migration.mjs 0090_x --si",
      "node scripts/bot-cron.mjs --quitar",
      'node -e "console.log(process.env.SUPABASE_DB_URL)"',
      "node --env-file=.env.local x.mjs OPS_DB_URL",
      "node scripts/backfill-personas.mjs",
      "node scripts/backfill-pantry-ingredient-ids.mjs --si",
      "node scripts/run-seed.mjs",
      "node scripts/mercadona-sync.mjs",
      "supabase db push",
      "npx supabase migration repair --status applied 0090",
      "supabase db reset",
    ],
    hetzner: [
      "ssh root@100.73.252.32 'ufw status'",
      "C:\\Windows\\System32\\OpenSSH\\ssh.exe root@188.245.14.194 hostname",
      "scp x.sh root@100.73.252.32:/root/",
      "ufw allow 22",
      "docker compose exec -T db psql -U panel -c 'select 1'",
    ],
    telegram: [
      "node scripts/telegram-webhook.mjs set https://x.vercel.app/api/bot/telegram",
      "node scripts/telegram-webhook.mjs delete",
      "node scripts/telegram-perfil.mjs aplicar",
    ],
    vercel: ["vercel env add FOO", "npx vercel deploy --prod", "node scripts/upload-to-blob.mjs", "node scripts/build-vectores.mjs"],
    "1password": ["op item create --vault HoMenu -", "env -u OP_SERVICE_ACCOUNT_TOKEN op vault list", "op service-account create x", "npm run op -- item get x", "op read op://HoMenu/Supabase/X", "op inject -i ops/env.1password", "npm run op -- read op://HoMenu/X/Y"],
    tailscale: ['"C:\\Program Files\\Tailscale\\tailscale.exe" up', "tailscale set --ssh", "tailscale serve 3000"],
    github: ["gh api -X POST repos/o/r/issues", "gh api repos/o/r/labels --method=PATCH", "gh api repos/o/r/x -f a=b", "gh workflow run tests.yml --ref x", "gh secret set X", "gh repo edit --visibility private"],
  };

  for (const [skill, lista] of Object.entries(casos)) {
    it.each(lista)(`${skill}: %s`, (c) => expect(skillsDeComando(c, mapa)).toContain(skill));
  }

  it.each([
    "node scripts/verificar-estado.mjs",
    "node scripts/verificar-estado.mjs --solo 0090",
    "git status --short",
    "git push -u origin ops/x",
    "gh pr view 12",
    "gh pr create --title x --body y",
    "gh pr checks 12 --watch",
    "gh run list --workflow tests.yml --limit 5",
    "gh api repos/pabloam89/MenuPlan -q .security_and_analysis",
    "gh api repos/{owner}/{repo}/compare/a...b -q .behind_by",
    "node scripts/telegram-webhook.mjs info",
    "node scripts/telegram-perfil.mjs",
    "op run --env-file=.env.local -- node x.mjs",
    "npm run op -- run --env-file=.env.local -- npm run build",
    '"C:\\Program Files\\Tailscale\\tailscale.exe" status',
    "npm test",
    "npx vitest run .claude",
    "node scripts/tarea.mjs ops/x",
    // scripts/lib/env.mjs llama a «op inject» por dentro: la puerta mira el comando
    // de la sesión, así que lo de cada día que lee claves no se entera.
    "node scripts/bot-evals.mjs",
    "node scripts/build-catalog.mjs",
    "npm run build",
    "node scripts/verificar-estado.mjs --detalle",
    "supabase --version",
    "supabase db diff",
  ])("sin puerta: %s", (c) => expect(skillsDeComando(c, mapa)).toEqual([]));
});

describe("qué ficheros piden la línea del PR", () => {
  it.each([
    ["scripts/telegram-webhook.mjs", "telegram"],
    ["scripts/telegram-perfil.mjs", "telegram"],
    ["supabase/migrations/0090_x.sql", "supabase"],
    ["supabase/ESTADO.md", "supabase"],
    ["scripts/apply-migration.mjs", "supabase"],
    [".github/workflows/tests.yml", "github"],
    [".github/pull_request_template.md", "github"],
    ["vercel.json", "vercel"],
    ["scripts/upload-to-blob.mjs", "vercel"],
    ["ops/env.1password", "1password"],
  ])("%s -> %s", (f, skill) => expect(skillsDeFicheros([f], mapa)).toContain(skill));

  it.each([["src/App.jsx"], ["api/bot/telegram-extra.js"], ["package.json"], ["ops/INVENTARIO.md"], ["src/data/recipes.json"], ["docs/supabase/x.md"]])(
    "%s no pide nada",
    (f) => expect(skillsDeFicheros([f], mapa)).toEqual([]),
  );

  it("normaliza barras de Windows", () => expect(skillsDeFicheros(["scripts\\telegram-webhook.mjs"], mapa)).toContain("telegram"));
});

// Lo que avisa de más. Es el compromiso «ante la duda, niega»: cuesta un
// reintento, una vez por skill y sesión. Se fija aquí para que cambiarlo sea una
// decisión y no un accidente (documentado en la skill github).
describe("conocido: avisa de más", () => {
  it.each([
    ["un mensaje de commit que nombra el script", 'git commit -m "arregla apply-migration"', "supabase"],
    ["gh workflow run tests.yml, que es rutina", "gh workflow run tests.yml --ref ops/x", "github"],
    ["gh api graphql con -f, que es una lectura", "gh api graphql -f query='{ viewer { login } }'", "github"],
    ["un docker local con el usuario panel", "docker compose exec -T db psql -U panel -c 'select 1'", "hetzner"],
    ["una ssh cualquiera junto a la IP del panel", "grep 100.73.252.32 ops/INVENTARIO.md | ssh-keygen -l", "hetzner"],
  ])("%s", (_, cmd, skill) => expect(skillsDeComando(cmd, mapa)).toContain(skill));
});

describe("el coste de evaluar los patrones", () => {
  // Un [\s\S]* sin tope sobre una entrada grande y repetida es cuadrático y
  // cuelga el hook (timeout de 20 s). Con tope, milisegundos.
  const enormes = {
    ssh: "ssh ".repeat(25000),
    ip: "100.73.252.32 ".repeat(7200),
    gh: "gh api ".repeat(14300),
    docker: "docker ".repeat(14300),
    mezcla: "ssh gh api docker 100.73.252.32 ".repeat(3200),
    sinSalto: "a".repeat(100000),
  };
  it.each(Object.entries(enormes))("100 KB de %s se evalúan en menos de 300 ms", (_, cmd) => {
    expect(cmd.length).toBeGreaterThanOrEqual(99000);
    let mejor = Infinity; // la mejor de tres: con la suite entera en paralelo hay ruido
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      skillsDeComando(cmd, mapa);
      mejor = Math.min(mejor, performance.now() - t0);
    }
    expect(mejor).toBeLessThan(300);
  });
});
