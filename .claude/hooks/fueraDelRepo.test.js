import { describe, expect, it } from "vitest";

import { decidir } from "./guardia-minima.mjs";
import { ajenasEnOrden, carpetaAjena, fueraDelRepo } from "./fueraDelRepo.mjs";

/**
 * Una sesión de MenuPlan no escribe fuera de C:\dev\MenuPlan y C:\dev\MenuPlan-* (Pablo, 19 oct
 * 2026, tras #878). Las hermanas se pasan a mano para que el test no dependa del disco.
 */
const HERMANAS = ["fabrica", "fabrica-glossary", "homenu-panel", "privado"];
const CWD = "C:\\dev\\MenuPlan-tarea";
const bash = (command, cwd = CWD) => ({ tool_name: "Bash", tool_input: { command }, cwd });
const ps = (command, cwd = CWD) => ({ tool_name: "PowerShell", tool_input: { command }, cwd });
const niega = (e) => fueraDelRepo(e, { hermanas: HERMANAS });

describe("carpetaAjena", () => {
  it("distingue lo propio de lo ajeno en todas las formas de ruta", () => {
    expect(carpetaAjena("C:\\dev\\fabrica\\scripts\\x.mjs")).toBe("fabrica");
    expect(carpetaAjena("C:/dev/homenu-panel")).toBe("homenu-panel");
    expect(carpetaAjena("/c/dev/fabrica-glossary/a")).toBe("fabrica-glossary");
    expect(carpetaAjena("c:\\DEV\\Fabrica")).toBe("fabrica");
    expect(carpetaAjena("C:\\dev\\MenuPlan\\src\\a.js")).toBeNull();
    expect(carpetaAjena("C:\\dev\\MenuPlan-tarea\\CLAUDE.md")).toBeNull();
    expect(carpetaAjena("C:\\Users\\pablo\\AppData\\Local\\Temp\\x")).toBeNull();
    expect(carpetaAjena("src/a.js")).toBeNull();
  });
});

describe("Edit, Write y NotebookEdit", () => {
  it("niega escribir un fichero de otra carpeta de C:\\dev", () => {
    expect(niega({ tool_name: "Write", tool_input: { file_path: "C:\\dev\\fabrica\\CLAUDE.md" } })).toBe("fabrica");
    expect(niega({ tool_name: "Edit", tool_input: { file_path: "C:/dev/homenu-panel/a.js" } })).toBe("homenu-panel");
    expect(niega({ tool_name: "NotebookEdit", tool_input: { notebook_path: "C:\\dev\\privado\\n.ipynb" } })).toBe("privado");
  });
  it("deja escribir en MenuPlan, en sus carpetas de tarea y en el scratchpad", () => {
    expect(niega({ tool_name: "Write", tool_input: { file_path: "C:\\dev\\MenuPlan-tarea\\a.js" } })).toBeNull();
    expect(niega({ tool_name: "Edit", tool_input: { file_path: "C:\\dev\\MenuPlan\\CLAUDE.md" } })).toBeNull();
    expect(niega({ tool_name: "Write", tool_input: { file_path: "C:\\Users\\pablo\\AppData\\Local\\Temp\\claude\\x.md" } })).toBeNull();
  });
});

describe("Bash y PowerShell", () => {
  it.each([
    ["rm -rf /c/dev/fabrica", "fabrica"],
    ["rm -rf C:/dev/fabrica/scripts", "fabrica"],
    ['cd "C:\\dev\\fabrica" && ls', "fabrica"],
    ["cd /c/dev/fabrica", "fabrica"],
    ["cd ../fabrica", "fabrica"],
    ["git -C /c/dev/fabrica commit -am x", "fabrica"],
    ["git -C C:/dev/fabrica reset --hard", "fabrica"],
    ["mv /c/dev/MenuPlan-tarea/a.js /c/dev/fabrica/a.js", "fabrica"],
    ["echo hola > /c/dev/fabrica/nota.md", "fabrica"],
    ["echo hola >> ../fabrica/nota.md", "fabrica"],
    ["npm --prefix C:/dev/homenu-panel run deploy", "homenu-panel"],
    ["node C:/dev/fabrica/scripts/admin/aplicar.mjs", "fabrica"],
    ["sed -i s/a/b/ /c/dev/fabrica/x.md", "fabrica"],
    ["cp src/a.js ../../dev/privado/", "privado"],
  ])("Bash: niega «%s»", (cmd, carpeta) => {
    expect(niega(bash(cmd))).toBe(carpeta);
  });

  it.each([
    ["Remove-Item -Recurse -Force C:\\dev\\fabrica", "fabrica"],
    ["Set-Location C:\\dev\\fabrica", "fabrica"],
    ["Set-Content -Path C:\\dev\\fabrica\\a.txt -Value x", "fabrica"],
    ["[System.IO.Directory]::Delete('C:\\dev\\fabrica', $true)", "fabrica"],
    ["\"x\" | Out-File C:\\dev\\homenu-panel\\a.txt", "homenu-panel"],
  ])("PowerShell: niega «%s»", (cmd, carpeta) => {
    expect(niega(ps(cmd))).toBe(carpeta);
  });

  it("dentro ya de una carpeta ajena, niega lo que escribe aunque no nombre la ruta", () => {
    expect(niega(bash("rm -rf scripts", "C:\\dev\\fabrica"))).toBe("fabrica");
    expect(niega(bash("npm run tarea -- x", "C:/dev/fabrica"))).toBe("fabrica");
    expect(niega(bash("ls scripts", "C:\\dev\\fabrica"))).toBeNull();
  });

  it.each([
    "ls /c/dev/fabrica",
    "cat C:/dev/fabrica/CLAUDE.md",
    "head -40 /c/dev/fabrica/CLAUDE.md",
    "git -C /c/dev/fabrica log -3 --oneline",
    "git -C /c/dev/fabrica status --short",
    "grep -rn menuplan C:/dev/fabrica/standards",
    "ls ../fabrica",
    "git status --short",
    "rm -rf node_modules/.vite",
    "cd ../MenuPlan && git log -1",
    "cd /c/dev/MenuPlan-otra && npx vitest run a.test.js",
    "npm run dev 2>&1 > /dev/null",
    "cp src/a.js ../b.js",
    "cd ..",
  ])("deja «%s» (leer, o escribir en lo propio)", (cmd) => {
    expect(niega(bash(cmd))).toBeNull();
  });

  it("una ruta relativa que sube solo cuenta si es una hermana conocida", () => {
    expect(ajenasEnOrden("cp a ../fabrica/b", HERMANAS)).toEqual(["fabrica"]);
    expect(ajenasEnOrden("cp a ../scripts/b", HERMANAS)).toEqual([]);
  });
});

describe("enchufada en guardia-minima", () => {
  it("decidir niega con la familia fuera-del-repo, también para Write", () => {
    const r = decidir({ tool_name: "Write", tool_input: { file_path: "C:\\dev\\fabrica\\x.md" } }, { hermanas: HERMANAS });
    expect(r).toMatchObject({ decision: "deny", familia: "fuera-del-repo" });
    expect(r.motivo).toMatch(/fabrica/);
    const b = decidir(bash("rm -rf /c/dev/fabrica"), { hermanas: HERMANAS });
    expect(b).toMatchObject({ decision: "deny", familia: "fuera-del-repo" });
  });
  it("lo propio sigue pasando, y las credenciales se siguen frenando", () => {
    expect(decidir({ tool_name: "Edit", tool_input: { file_path: "C:\\dev\\MenuPlan-tarea\\a.js" } }, { hermanas: HERMANAS })).toBeNull();
    expect(decidir(bash("unset GH_TOKEN"), { hermanas: HERMANAS })).toMatchObject({ decision: "deny" });
  });
});
