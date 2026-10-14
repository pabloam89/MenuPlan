import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sinAplicar } from "../.claude/hooks/guardia.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Vive aquí y no en .claude/hooks/guardia.test.js porque lee ficheros de HoMenu (supabase/ESTADO.md y
// supabase/migrations/): los tests de la casa no leen el proyecto (#710, PR 6). La guardia es de la casa;
// el formato de ESTADO.md, del proyecto.
describe("ESTADO.md de verdad", () => {
  // Si alguien cambia el formato de la tabla de resumen, la guardia se queda
  // ciega y cierra todas las migraciones de staging. Esto lo dice antes.
  it("la guardia encuentra la lista de «sin aplicar» y cada una existe", () => {
    const libres = sinAplicar(readFileSync(join(RAIZ, "supabase", "ESTADO.md"), "utf8"));
    expect(libres).not.toBeNull();
    expect(libres.size).toBeGreaterThan(0);
    const sinFichero = [...libres].filter((n) => !existsSync(join(RAIZ, "supabase", "migrations", `${n}.sql`)));
    expect(sinFichero).toEqual([]);
  });
});
