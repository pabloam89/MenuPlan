import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { leerFichero } from "./lib/env.mjs";
import { BOVEDA_PABLO, BOVEDA_SESIONES, COPIAR, SOLO_PABLO, fichaCopia, pareceToken } from "./boveda-sesiones.mjs";

// #328: lo que leen las sesiones vive en HoMenu-sesiones; lo de producción,
// solo en HoMenu. Este test ata la lista del script a la plantilla de
// .env.local para que no sean dos fuentes que se separan.

const plantilla = leerFichero(join(import.meta.dirname, "..", "ops", "env.1password"));
const direcciones = Object.values(plantilla).filter((v) => v.startsWith("op://"));
const copiadas = COPIAR.flatMap(({ ficha, campos }) => campos.map((c) => `op://${BOVEDA_SESIONES}/${ficha}/${c}`));

describe("ops/env.1password", () => {
  it("solo apunta a HoMenu-sesiones: una dirección ilegible rompe el op inject entero (vite.config.js)", () => {
    expect(direcciones.length).toBeGreaterThan(0);
    for (const d of direcciones) expect(d.startsWith(`op://${BOVEDA_SESIONES}/`), d).toBe(true);
  });

  it("cada dirección es una ficha y un campo que el script copia, y al revés", () => {
    expect([...direcciones].sort()).toEqual([...copiadas].sort());
  });

  it("lo de producción no está activo en la plantilla (solo comentado)", () => {
    const texto = readFileSync(join(import.meta.dirname, "..", "ops", "env.1password"), "utf8");
    for (const { campo } of SOLO_PABLO) {
      expect(plantilla[campo], campo).toBeUndefined();
      expect(texto).toMatch(new RegExp(`^# ${campo}=op://${BOVEDA_PABLO}/`, "m"));
    }
  });
});

describe("COPIAR", () => {
  it("no copia nada de lo que se queda con Pablo", () => {
    const prohibidos = new Set(SOLO_PABLO.map(({ ficha, campo }) => `${ficha}/${campo}`));
    for (const { ficha, campos } of COPIAR) for (const c of campos) expect(prohibidos.has(`${ficha}/${c}`), `${ficha}/${c}`).toBe(false);
  });
});

describe("fichaCopia", () => {
  const origen = {
    id: "abc", title: "Supabase", category: "API_CREDENTIAL", vault: { id: "v", name: "HoMenu" },
    fields: [
      { id: "credential", type: "CONCEALED", label: "VITE_SUPABASE_ANON_KEY", value: "x", reference: "op://HoMenu/Supabase/VITE_SUPABASE_ANON_KEY", section: { id: "s" } },
      { id: "f2", type: "CONCEALED", label: "SUPABASE_DB_URL", value: "admin", reference: "op://HoMenu/Supabase/SUPABASE_DB_URL" },
      { id: "f3", type: "STRING", label: "VITE_SUPABASE_URL", value: "https://x" },
    ],
  };

  it("se queda solo con los campos pedidos, sin ids de la bóveda ni referencias", () => {
    const f = fichaCopia(origen, ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
    expect(f).toEqual({
      title: "Supabase", category: "API_CREDENTIAL",
      fields: [
        { id: "credential", type: "CONCEALED", label: "VITE_SUPABASE_ANON_KEY", value: "x" },
        { id: "f3", type: "STRING", label: "VITE_SUPABASE_URL", value: "https://x" },
      ],
    });
    expect(JSON.stringify(f)).not.toContain("admin");
  });

  it("falla si falta un campo o está vacío, sin enseñar ningún valor", () => {
    expect(() => fichaCopia(origen, ["NO_EXISTE"])).toThrow(/NO_EXISTE/);
    const vacio = { ...origen, fields: [{ id: "a", type: "STRING", label: "VACIO", value: "" }] };
    expect(() => fichaCopia(vacio, ["VACIO"])).toThrow(/VACIO/);
  });
});

describe("pareceToken", () => {
  it("solo acepta un token de service account (ops_…), sin espacios", () => {
    expect(pareceToken("ops_eyJhbGciOi")).toBe(true);
    expect(pareceToken("")).toBe(false);
    expect(pareceToken("[ERROR] 2026/10/09 no autorizado")).toBe(false);
    expect(pareceToken("ops_ con espacio")).toBe(false);
  });
});
