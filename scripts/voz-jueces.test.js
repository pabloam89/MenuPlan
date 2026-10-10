import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { lineaDe, leerCola, medir, resumir, respuestasConDia, respuestasFinales } from "./lib/voz.mjs";
import { carpetaPropia, escrituraSegura, recortarLog } from "../.claude/hooks/buscar-antes.mjs";

/**
 * Ronda de los jueces (revisor y seguridad) sobre el vigilante de la voz (#453):
 * cada arreglo con el caso que lo cierra. Las reglas de fondo (25 palabras, número con
 * nombre, jerga estricta) no cambian; el medidor no sabe si Pablo pidió detalle, y esas
 * respuestas cuentan como falta.
 */
const faltas = (t) => medir(t).faltas;

describe("ideas_de_mas cuenta ideas, no líneas", () => {
  const opciones = "A (recomendada): el servidor.\nB: un servicio aparte.\nC: tu ordenador.\nRespóndeme con la letra.";
  it("raíz + 4 viñetas + cabecera + A/B/C + «Respóndeme» no falla", () => {
    const m = "**Dos cosas.**\n- uno\n- dos\n- tres\n- cuatro\nNecesito que decidas: dónde guardar las copias.\n" + opciones;
    expect(medir(m).faltas).not.toContain("ideas_de_mas");
    expect(medir(m).ideas).toBe(4);
  });
  it("5 viñetas sí falla", () => {
    expect(faltas("**Dos cosas.**\n- uno\n- dos\n- tres\n- cuatro\n- cinco")).toContain("ideas_de_mas");
  });
  it.each(["Lo que me toca a mí: nada.", "Lo único que te toca a ti: decidir.", "Lo que necesito de ti: un sí.", "Necesito que me digas el formato."])(
    "cuatro viñetas + cierre «%s» no falla", (cierre) => {
      expect(faltas("**Estado.**\n- a\n- b\n- c\n- d\n" + cierre)).not.toContain("ideas_de_mas");
    });
  it("el cierre solo se descuenta si es la última línea", () => {
    expect(faltas("**Estado.**\n- a\n- b\n- c\n- d\nLo que me toca a mí: nada.\n- e")).toContain("ideas_de_mas");
  });
});

describe("jerga", () => {
  it("lo que va entre comillas invertidas no cuenta", () => {
    expect(faltas("**Se llama `rama` en el comando.**")).not.toContain("jerga");
  });
  it("basta con que una aparición lleve su explicación", () => {
    expect(faltas("**Abrí un PR y luego el PR (la petición de pasar cambios a lo principal) quedó listo.**")).not.toContain("jerga");
  });
  it("sigue siendo estricta: PR, CI, rama, issue y skill sin explicar fallan", () => {
    for (const t of ["PR", "CI", "rama", "issue", "skill"]) expect(faltas(`**Falta el ${t}.**`), t).toContain("jerga");
  });
});

describe("emoji", () => {
  it("©, ™, ® y ↔ son texto normal", () => {
    expect(faltas("**Marca ™ y © y ® con ↔ flechas.**")).not.toContain("emoji");
  });
  it("🎉 ✅ ✔ y ⚠ sí son emoji", () => {
    for (const e of ["🎉", "✅", "✔", "⚠"]) expect(faltas(`**Listo ${e}**`), e).toContain("emoji");
  });
});

describe("ruta_o_comando_en_prosa no marca nombres de producto", () => {
  it.each(["Node.js", "Next.js", "Vue.js", "Chart.js"])("%s no es un fichero", (n) => {
    expect(faltas(`**Usa ${n} para eso.**`)).not.toContain("ruta_o_comando_en_prosa");
  });
  it("un fichero .js de verdad sí", () => {
    expect(faltas("**Mira app.js ahora.**")).toContain("ruta_o_comando_en_prosa");
  });
});

describe("preambulo", () => {
  it("«Vale la pena» no es un preámbulo; «Vale, hecho» sí", () => {
    expect(faltas("**Vale la pena mirarlo.**")).not.toContain("preambulo");
    expect(faltas("Vale, hecho.")).toContain("preambulo");
    expect(faltas("**Vale.**")).toContain("preambulo");
  });
});

describe("rendimiento: un mensaje enorme no cuelga el medidor", () => {
  it("60.000 «#1» dentro de un paréntesis abierto tardan menos de un segundo", () => {
    const t0 = Date.now();
    medir("**Hola.**\n(" + "#1 ".repeat(60000));
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("solo se mide hasta 64 KB", () => {
    const largo = "**Hola.**\n" + "palabra ".repeat(100000);
    expect(medir(largo).palabras).toBeLessThan(10000);
  });
});

describe("respuestasFinales", () => {
  const a = (t, extra = {}) => JSON.stringify({ type: "assistant", timestamp: "2026-10-10T10:00:00Z", message: { content: [{ type: "text", text: t }] }, ...extra });
  const u = (t) => JSON.stringify({ type: "user", message: { content: t } });
  it("ignora las filas de subagentes (isSidechain)", () => {
    const jsonl = [u("hola"), a("**Principal.**"), a("texto de un subagente", { isSidechain: true })].join("\n");
    expect(respuestasFinales(jsonl)).toEqual(["**Principal.**"]);
  });
  it("respuestasConDia da el día de Madrid de cada respuesta", () => {
    expect(respuestasConDia([u("hola"), a("**x**")].join("\n"))).toEqual([{ texto: "**x**", dia: "2026-10-10" }]);
  });
  it("leerCola lee solo el final y salta la línea cortada", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const f = join(dir, "t.jsonl");
    writeFileSync(f, "AAAAAAAAAA\nBBBB\nCCCC\n");
    expect(leerCola(f, 10)).toBe("CCCC\n");
    expect(leerCola(f, 1000)).toBe("AAAAAAAAAA\nBBBB\nCCCC\n");
  });
});

describe("resumir con --desde", () => {
  it("las respuestas anteriores al día fijo no cuentan", () => {
    const l = (dia, t) => lineaDe(medir(t), dia);
    const r = resumir([l("2026-10-01", "mal"), l("2026-10-10", "**Bien.**")], { hoy: "2026-10-10", dias: 3650, desde: "2026-10-10" });
    expect(r.medidas).toBe(1);
    expect(r.cumplen).toBe(1);
  });
});

describe("recortarLog parametrizado y escritura segura", () => {
  it("recorta a las últimas `lineas` solo si pasa de `maxBytes`", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const f = join(dir, "l.log");
    const filas = Array.from({ length: 10 }, (_, i) => `fila${i}`).join("\n") + "\n";
    writeFileSync(f, filas);
    recortarLog(f, { maxBytes: 1000, lineas: 3 });
    expect(readFileSync(f, "utf8")).toBe(filas);
    recortarLog(f, { maxBytes: 10, lineas: 3 });
    expect(readFileSync(f, "utf8")).toBe("fila7\nfila8\nfila9\n");
  });
  it("carpetaPropia y escrituraSegura niegan lo que es de otro usuario", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const original = process.getuid;
    process.getuid = () => 987654321;
    try {
      expect(carpetaPropia(dir)).toBe(false);
      expect(escrituraSegura(join(dir, "voz.log"), dir)).toBe(false);
    } finally {
      if (original) process.getuid = original; else delete process.getuid;
    }
  });
});

describe("el hook, casos difíciles", () => {
  const hook = join(process.cwd(), ".claude/hooks/voz.mjs");
  const correr = (entrada, dir, extra = []) => spawnSync(process.execPath, [...extra, hook], { input: JSON.stringify(entrada), encoding: "utf8", env: { ...process.env, MENUPLAN_BUSCAR_DIR: dir }, timeout: 15000 });
  const leerLog = (dir) => { try { return readFileSync(join(dir, "voz.log"), "utf8"); } catch { return ""; } };
  const a = (t) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: t }] } });

  it("no escribe si la carpeta o el log son de otro usuario", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const pre = join(dir, "pre.mjs");
    writeFileSync(pre, "process.getuid = () => 987654321;\n");
    const r = correr({ session_id: "s", last_assistant_message: "**Hola.**" }, dir, ["--import", pathToFileURL(pre).href]);
    expect(r.status).toBe(0);
    expect(leerLog(dir)).toBe("");
  });
  it("transcript de respaldo con una línea corrupta: mide la última respuesta buena", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const t = join(dir, "t.jsonl");
    writeFileSync(t, [a("Claro, antes."), "{esto no es json", a("**Hecho.**")].join("\n") + "\n");
    correr({ session_id: "s", transcript_path: t }, dir);
    expect(leerLog(dir)).toContain("faltas=ninguna cumple=sí");
  });
  it("transcript inexistente: sale con 0 y no anota nada", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const r = correr({ session_id: "s", transcript_path: join(dir, "no-existe.jsonl") }, dir);
    expect(r.status).toBe(0);
    expect(leerLog(dir)).toBe("");
  });
  it("un mensaje que cita ejemplos y código no cuenta como falta", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const m = "**Así no se escribe.**\n> Claro, voy a contarte el PR #12 🎉\n```\nnpm run voz #12 scripts/a.mjs\n```";
    correr({ session_id: "s", last_assistant_message: m }, dir);
    expect(leerLog(dir)).toContain("faltas=ninguna cumple=sí");
  });
  it("un mensaje de 5 MB se mide sin colgar el hook", () => {
    const dir = mkdtempSync(join(tmpdir(), "voz-"));
    const r = correr({ session_id: "s", last_assistant_message: "**Hola.**\n" + "(#1 ".repeat(1_200_000) }, dir);
    expect(r.status).toBe(0);
    expect(leerLog(dir)).toMatch(/^voz: dia=/);
  });
});

describe("tercera ronda", () => {
  it("el cierre solo se descuenta si es la última línea (discrimina la posición)", () => {
    expect(faltas("**E.**\n- a\n- b\n- c\nLo que me toca a mí: nada.\n- d")).toContain("ideas_de_mas");
  });
  it("«Opción A:» y «Opción A (recomendada):» no cuentan como ideas", () => {
    const m = "**Necesito que decidas: algo.**\n- a\n- b\nOpción A (recomendada): sí.\nOpción B: no.\nOpción C: luego.\nRespóndeme con la letra.";
    expect(medir(m).ideas).toBe(2);
    expect(faltas(m)).not.toContain("ideas_de_mas");
  });
  describe("hook con un módulo propio roto", () => {
    const montar = () => {
      const raiz = mkdtempSync(join(tmpdir(), "voz-roto-"));
      mkdirSync(join(raiz, ".claude", "hooks"), { recursive: true });
      const h = join(raiz, ".claude", "hooks", "voz.mjs");
      copyFileSync(join(process.cwd(), ".claude/hooks/voz.mjs"), h); // sin ../../scripts/lib: los imports fallan
      return { dir: mkdtempSync(join(tmpdir(), "voz-")), h };
    };
    const leerLog = (dir) => { try { return readFileSync(join(dir, "voz.log"), "utf8"); } catch { return ""; } };
    it("deja voz: error=otro y sale con 0", () => {
      const { dir, h } = montar();
      const r = spawnSync(process.execPath, [h], { input: JSON.stringify({ last_assistant_message: "**Hola.**" }), encoding: "utf8", env: { ...process.env, MENUPLAN_BUSCAR_DIR: dir }, timeout: 15000 });
      expect(r.status).toBe(0);
      expect(leerLog(dir)).toBe("voz: error=otro\n");
    });
    it("si salta el reloj con el módulo sin cargar, registra tiempo y no otro", async () => {
      const { dir, h } = montar();
      const hijo = spawn(process.execPath, [h], { env: { ...process.env, MENUPLAN_BUSCAR_DIR: dir }, stdio: ["pipe", "ignore", "ignore"] }); // stdin sin cerrar
      const codigo = await new Promise((ok) => hijo.on("exit", ok));
      expect(codigo).toBe(0);
      expect(leerLog(dir)).toBe("voz: error=tiempo\n");
    }, 15000);
  });
});
