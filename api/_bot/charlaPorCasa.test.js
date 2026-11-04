/**
 * La charla se lee por chat Y por casa (#1238): un chat privado puede cambiar de casa, y lo dicho en la otra casa
 * (nombres, gustos, un borrador de receta) no es de esta familia. Dos comprobaciones: el filtro lleva la casa, y toda
 * lectura de bot_messages en el código del bot pasa por él.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

vi.mock("./db.js", () => ({ eq: (v) => `eq.${encodeURIComponent(v)}`, select: vi.fn(), update: vi.fn(), borrar: vi.fn() }));
const { deLaCharla } = await import("./chats.js");

const RAIZ = resolve(import.meta.dirname, "..");
const fuentes = () => ["_bot", "bot"].flatMap((d) => readdirSync(join(RAIZ, d))
  .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))
  .map((f) => ({ ruta: `api/${d}/${f}`, texto: readFileSync(join(RAIZ, d, f), "utf8") })));

describe("la charla se lee por chat y por casa", () => {
  it("el filtro lleva el chat y la casa; sin casa, falla en alto", () => {
    const f = deLaCharla("telegram", 42, "casa-1");
    expect(f).toContain("chat_id=eq.42");
    expect(f).toContain("household_id=eq.casa-1");
    expect(() => deLaCharla("telegram", 42, null)).toThrow(/sin casa/);
  });

  it("toda lectura de bot_messages en api/_bot y api/bot usa deLaCharla", () => {
    const lecturas = [];
    for (const { ruta, texto } of fuentes()) {
      for (const m of texto.matchAll(/select\(\s*"bot_messages",([\s\S]{0,200})/g)) {
        lecturas.push({ ruta, porCasa: m[1].includes("deLaCharla(") });
      }
    }
    expect(lecturas.length).toBeGreaterThan(0);
    expect(lecturas.filter((l) => !l.porCasa).map((l) => l.ruta)).toEqual([]);
  });
});
