import { describe, expect, it } from "vitest";

import { hashDe, motivosParaNoAplicar, VIGENCIA_MS } from "./permisoAplicar.mjs";

const SQL = "set lock_timeout = '5s';\ncreate table public.x (id int);\n";
const ahora = Date.parse("2026-10-08T12:00:00Z");
const hace = (ms) => new Date(ahora - ms).toISOString();
const base = { nombre: "0088_x", local: SQL, enStaging: SQL, ensayo: { hash: hashDe(SQL), at: hace(60_000) }, ahora };

describe("cuándo se puede aplicar en producción", () => {
  it("en staging, idéntica y ensayada hace un minuto: sí", () => {
    expect(motivosParaNoAplicar(base)).toEqual([]);
  });

  it("los saltos de línea de Windows no la hacen distinta", () => {
    expect(motivosParaNoAplicar({ ...base, local: SQL.replace(/\n/g, "\r\n") })).toEqual([]);
  });

  it("si no está en staging, no", () => {
    expect(motivosParaNoAplicar({ ...base, enStaging: null })[0]).toMatch(/no está en origin\/staging/);
  });

  it("si la local difiere de la de staging, no", () => {
    expect(motivosParaNoAplicar({ ...base, local: `${SQL}drop table public.y;` }).join()).toMatch(/no es igual que en origin\/staging/);
  });

  it("sin ensayo, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: null })[0]).toMatch(/No hay ensayo/);
  });

  it("si cambió después del ensayo, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: { hash: hashDe("otra cosa"), at: hace(60_000) } })[0]).toMatch(/cambió después/);
  });

  it("con el ensayo de hace más de una hora, no", () => {
    expect(motivosParaNoAplicar({ ...base, ensayo: { hash: hashDe(SQL), at: hace(VIGENCIA_MS + 1) } })[0]).toMatch(/más de una hora/);
  });
});
