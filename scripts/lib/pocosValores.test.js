import { describe, it, expect } from "vitest";
import { MAX_DISTINTOS, MIN_FILAS, consultaDeColumna, esCandidata, lineaContable, partirColumna } from "./pocosValores.mjs";
import { motivoParaNoLeer } from "./consulta.mjs";

// Datos de mentira: el script de scripts/columnas-pocos-valores.mjs mide en producción; esto prueba su lógica sin red.
describe("pocos valores distintos (#585)", () => {
  it("candidata: pocos distintos y filas suficientes, en el borde exacto de cada umbral", () => {
    expect(esCandidata({ filas: MIN_FILAS, distintos: MAX_DISTINTOS })).toBe(true);
    expect(esCandidata({ filas: MIN_FILAS - 1, distintos: 2 })).toBe(false);
    expect(esCandidata({ filas: 1000, distintos: MAX_DISTINTOS + 1 })).toBe(false);
    expect(esCandidata({ filas: 0, distintos: 0 })).toBe(false);
  });

  it("la línea contable lleva todo lo que hace falta para contarla, también si no se pudo medir", () => {
    expect(lineaContable("persona.rol_hogar", { filas: 92, conValor: 92, distintos: 7 })).toBe("columna_pocos_valores: columna=persona.rol_hogar filas=92 con_valor=92 distintos=7 candidata=si");
    expect(lineaContable("user_events.event", { filas: 1155, conValor: 1155, distintos: 29 })).toMatch(/candidata=no$/);
    // Las filas sin valor no cuentan: 100 filas con solo 3 con valor no son candidata.
    expect(lineaContable("x.y", { filas: 100, conValor: 3, distintos: 2 })).toMatch(/candidata=no$/);
    expect(lineaContable("x.y", { error: 'relation "x" does not exist' })).toBe('columna_pocos_valores: columna=x.y medida=no motivo=relation_"x"_does_not_exist');
    expect(lineaContable("x.y", null)).toMatch(/medida=no motivo=sin_dato/);
  });

  it("parte «tabla.columna» y «esquema.tabla.columna», y rechaza nombres raros", () => {
    expect(partirColumna("persona.color")).toEqual({ esquema: "public", tabla: "persona", columna: "color" });
    expect(partirColumna("ops.eventos.tipo")).toEqual({ esquema: "ops", tabla: "eventos", columna: "tipo" });
    expect(() => partirColumna('persona.color"; drop table x; --')).toThrow(/no válido/);
    expect(() => partirColumna("solo")).toThrow(/no válido/);
  });

  it("el select que arma es de solo lectura (lo acepta el filtro de consulta.mjs) y cuenta elementos si es array", () => {
    for (const [c, t] of [["persona.color", "text"], ["user_recipes.allergens", "text[]"], ["ops.eventos.tipo", "text"]]) {
      const sql = consultaDeColumna(c, t);
      expect(motivoParaNoLeer(sql), sql).toBeNull();
    }
    expect(consultaDeColumna("a.b", "text")).toBe('select count(*) as filas, count("b") as con_valor, count(distinct "b") as distintos from "public"."a"');
    expect(consultaDeColumna("a.b", "text[]")).toMatch(/unnest\("b"\)/);
  });
});
