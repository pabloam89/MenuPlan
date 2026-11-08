import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ficherosDeGit } from "./ficherosGit.js";

/**
 * ficherosDeGit lista lo que git ve, pero no lo que ya no está en disco:
 * un fichero renombrado o borrado sin commitear sigue en el índice, y contarlo
 * daría un falso verde en «lo que cita existe».
 */
describe("ficherosDeGit", () => {
  it("no lista lo renombrado o borrado sin commitear, ni lo ignorado, y sí lo nuevo", () => {
    const dir = mkdtempSync(join(tmpdir(), "ficheros-git-"));
    try {
      const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
      git("init", "-q");
      git("config", "user.email", "t@t.t");
      git("config", "user.name", "t");
      writeFileSync(join(dir, "a.js"), "1");
      writeFileSync(join(dir, "b.js"), "2");
      writeFileSync(join(dir, ".gitignore"), "generado.js\n");
      git("add", ".");
      git("commit", "-q", "-m", "x");
      renameSync(join(dir, "a.js"), join(dir, "c.js"));
      rmSync(join(dir, "b.js"));
      writeFileSync(join(dir, "generado.js"), "3");
      writeFileSync(join(dir, "nuevo.js"), "4");
      expect(ficherosDeGit(dir).sort()).toEqual([".gitignore", "c.js", "nuevo.js"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
