import { describe, expect, it } from "vitest";

import alimentos from "./alimentos.json";
import alimentoPorIngrediente from "./alimentoPorIngrediente.json";
import ingredientes from "./ingredients.json";
import { FAMILIAS } from "../lib/notepadFields.js";
import { FRAGMENTOS } from "../../scripts/lib/bedcaDimensiones.mjs";
import {
  CAMPOS_CONTABLES,
  DIMENSIONES,
  FAMILIAS_ALIMENTO,
  FAMILIA_DIMENSIONES,
  GRUPO_POR_FAMILIA,
  validateAlimentos,
} from "./alimentoSchema.js";

/**
 * Lo que estos tests protegen NO es que la tabla esté llena — está casi vacía a
 * propósito, porque A1 solo ingiere lo ingerible. Protegen que lo que dice sea
 * verdad: que el libro de cuentas no contradiga a la fila, que la FK cierre por
 * los dos lados, y que las cuatro tablas de vocabulario no se desincronicen
 * entre sí, que es como se descuadran las taxonomías copiadas.
 */
describe("la tabla de alimentos", () => {
  it("valida entera", () => {
    expect(validateAlimentos(alimentos)).toEqual([]);
  });

  it("la FK cierra por los dos lados", () => {
    const ids = new Set(alimentos.map((a) => a.id));
    const sinMapa = ingredientes.filter((i) => !alimentoPorIngrediente[i.id]).map((i) => i.id);
    expect(sinMapa).toEqual([]);

    const apuntanANada = Object.entries(alimentoPorIngrediente)
      .filter(([, alimentoId]) => !ids.has(alimentoId))
      .map(([ingId]) => ingId);
    expect(apuntanANada).toEqual([]);

    // Y ninguna fila huérfana: un alimento que no apunta ningún ingrediente es
    // una fila que nadie va a leer nunca.
    const apuntados = new Set(Object.values(alimentoPorIngrediente));
    expect(alimentos.filter((a) => !apuntados.has(a.id)).map((a) => a.id)).toEqual([]);
  });

  it("un número sin procedencia se declara heredado, nunca trazado", () => {
    // El defecto que esta tabla existe para cerrar es exactamente este: que un
    // valor parezca respaldado cuando no lo está.
    const mintiendo = alimentos.filter(
      (a) => a.nutricion && !a.fuenteId && a.fuente !== "heredado",
    );
    expect(mintiendo.map((a) => a.id)).toEqual([]);

    const heredadosSinAnotar = alimentos.filter(
      (a) => a.fuente === "heredado" && a.huecos.procedencia === "relleno",
    );
    expect(heredadosSinAnotar.map((a) => a.id)).toEqual([]);
  });

  it("el libro de cuentas habla de todos los campos y de ninguno más", () => {
    for (const a of alimentos) {
      expect(Object.keys(a.huecos).sort()).toEqual([...CAMPOS_CONTABLES].sort());
    }
  });
});

describe("los vocabularios no se desincronizan", () => {
  it("cada familia de alimento pliega sobre el vocabulario de familias que ya existe", () => {
    const sinGrupo = FAMILIAS_ALIMENTO.filter((f) => !(f in GRUPO_POR_FAMILIA));
    expect(sinGrupo).toEqual([]);

    // `null` es legítimo (el aceite no es una "vez por semana"); lo que no vale
    // es inventarse un destino que el resto del repo no conoce.
    const destinosInventados = Object.entries(GRUPO_POR_FAMILIA)
      .filter(([, grupo]) => grupo !== null && !FAMILIAS.includes(grupo))
      .map(([familia, grupo]) => `${familia} → ${grupo}`);
    expect(destinosInventados).toEqual([]);

    const sobran = Object.keys(GRUPO_POR_FAMILIA).filter((f) => !FAMILIAS_ALIMENTO.includes(f));
    expect(sobran).toEqual([]);
  });

  it("cada familia declara qué dimensiones le aplican", () => {
    const sinDeclarar = FAMILIAS_ALIMENTO.filter((f) => !FAMILIA_DIMENSIONES[f]);
    expect(sinDeclarar).toEqual([]);

    const dimsValidas = new Set(Object.keys(DIMENSIONES));
    const inventadas = Object.entries(FAMILIA_DIMENSIONES).flatMap(([f, dims]) =>
      dims.filter((d) => !dimsValidas.has(d)).map((d) => `${f}: ${d}`),
    );
    expect(inventadas).toEqual([]);
  });

  it("el parser solo produce valores que el schema acepta", () => {
    // Este es el test que de verdad importa de los tres: la tabla de 109
    // fragmentos y los seis enums viven en ficheros distintos, y si alguien
    // añade "en salmuera" al parser sin añadir "salmuera" a MEDIOS, el
    // constructor escribiría una fila que no valida — pero solo si ese
    // fragmento aparece en algún nombre real. Aquí salta siempre.
    const malos = [];
    for (const [fragmento, valor] of Object.entries(FRAGMENTOS)) {
      for (const item of Array.isArray(valor) ? valor : [valor]) {
        if (item.tipo !== "dimension") continue;
        if (!DIMENSIONES[item.dim]) { malos.push(`${fragmento}: dimensión "${item.dim}"`); continue; }
        if (!DIMENSIONES[item.dim].includes(item.valor)) {
          malos.push(`${fragmento}: ${item.dim} = "${item.valor}"`);
        }
      }
    }
    expect(malos).toEqual([]);
  });
});
