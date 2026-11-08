// El registro de ensayos de la vuelta atrás (ops/ensayos-rollback.json, #589, norma `rollback-ensayado`).
// Vigila la forma del registro y dice, sin fallar, cuántos ensayos hay: el ensayo en sí lo hace una
// persona en el panel de Vercel y nada lo puede obligar (por eso la norma es blanda y el aviso es el issue).
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diasDesde, faltasDeEnsayos, leerEnsayos, ultimoEnsayoBueno } from "../scripts/lib/ensayosRollback.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const bueno = { fecha: "2026-10-20", quien: "pablo", metodo: "panel", entorno: "produccion", resultado: "ok", minutos: 3, comprobado: ["pagina", "funcion", "canario"], issue: 589 };
const con = (...es) => ({ version: 1, ensayos: es });

describe("el registro de ensayos de vuelta atrás", () => {
  it("el del repo está bien formado (hoy puede estar vacío)", () => {
    const datos = leerEnsayos(RAIZ);
    expect(faltasDeEnsayos(datos)).toEqual([]);
  });

  it("un ensayo completo no tiene faltas", () => {
    expect(faltasDeEnsayos(con(bueno), { hoy: "2026-10-21" })).toEqual([]);
    expect(faltasDeEnsayos(con({ ...bueno, resultado: "fallo", comprobado: ["pagina"] }))).toEqual([]);
  });

  it("cada falta de forma se ve (visto fallar con registros rotos)", () => {
    const rotos = {
      "versión": { version: 2, ensayos: [] },
      "sin lista": { version: 1, ensayos: {} },
      "campo de más": con({ ...bueno, enlace: "https://x" }),
      "falta un campo": con((({ quien: _q, ...r }) => r)(bueno)),
      "fecha mala": con({ ...bueno, fecha: "20-10-2026" }),
      "fecha imposible": con({ ...bueno, fecha: "2026-02-31" }),
      "fecha futura": con({ ...bueno, fecha: "2026-12-01" }),
      "quien": con({ ...bueno, quien: "manu" }),
      "método": con({ ...bueno, metodo: "cli" }),
      "entorno": con({ ...bueno, entorno: "preview" }),
      "resultado": con({ ...bueno, resultado: "casi" }),
      "minutos": con({ ...bueno, minutos: -1 }),
      "issue": con({ ...bueno, issue: "589" }),
      "comprobado repetido": con({ ...bueno, comprobado: ["pagina", "pagina", "funcion"] }),
      "comprobado fuera": con({ ...bueno, comprobado: ["pagina", "funcion", "otra"] }),
      "ok sin función": con({ ...bueno, comprobado: ["pagina"] }),
    };
    for (const [caso, datos] of Object.entries(rotos)) {
      expect(faltasDeEnsayos(datos, { hoy: "2026-10-21" }).length, caso).toBeGreaterThan(0);
    }
  });

  it("el último ensayo bueno y los días desde él", () => {
    const datos = con({ ...bueno, fecha: "2026-10-01" }, { ...bueno, fecha: "2026-10-20" }, { ...bueno, fecha: "2026-10-25", resultado: "fallo" });
    expect(ultimoEnsayoBueno(datos).fecha).toBe("2026-10-20");
    expect(diasDesde(datos, "2026-10-30")).toBe(10);
    expect(diasDesde(con(), "2026-10-30")).toBeNull();
    expect(ultimoEnsayoBueno(con({ ...bueno, resultado: "fallo", comprobado: [] }))).toBeNull();
  });
});
