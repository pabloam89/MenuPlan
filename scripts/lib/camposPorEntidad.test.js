import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORDEN_TIPOS, TIPOS_CAMPO, cabeceraMd, camposDeRegistros, cuentaPorTipo, registrosDe, sumaCuentas, textoCuenta, textoFrecuencias, tipoDeCampo, tipoDeColumna,
} from "./camposPorEntidad.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Un registro de mentira: `estado` se repite una y otra vez con 30 valores distintos (más que el
// umbral de cerrado), `nota` es único, `activo` booleano… Si el script no cuenta `estado` como
// texto_repetido, el recuento de #711 no sirve para ver bajar la fila al cerrar un campo.
const mentira = Array.from({ length: 60 }, (_, i) => ({
  id: `r${i}`,
  estado: `situacion-numero-${i % 30}`,
  nota: `Una nota distinta para el registro ${i}, escrita a mano`,
  activo: i % 2 === 0,
  veces: i,
  alta: "2026-10-13",
  etiquetas: ["a", "b"],
  extra: { x: i },
  tipo: i % 3 === 0 ? "uno" : "otro",
}));

describe("tipoDeCampo / camposDeRegistros (#711)", () => {
  const campos = camposDeRegistros(mentira);
  const tipo = (k) => campos.get(k).tipo;

  it("cuenta como texto_repetido un texto que se repite sin ser cerrado", () => {
    expect(tipo("estado")).toBe("texto_repetido");
    expect(campos.get("estado").distintos).toBe(30);
    expect(campos.get("estado").frecuencias[0][1]).toBe(2);
  });

  it("reparte el resto de campos en los otros tipos", () => {
    expect(tipo("nota")).toBe("texto_unico");
    expect(tipo("activo")).toBe("booleano");
    expect(tipo("veces")).toBe("numero");
    expect(tipo("alta")).toBe("fecha");
    expect(tipo("etiquetas")).toBe("lista");
    expect(tipo("extra")).toBe("objeto");
    expect(tipo("tipo")).toBe("cerrado");
    expect(tipo("id")).toBe("identificador");
  });

  it("al cerrar el campo (pocos valores), la fila de texto_repetido baja", () => {
    const antes = cuentaPorTipo([...camposDeRegistros(mentira).values()].map((c) => c.tipo));
    const cerrado = mentira.map((r) => ({ ...r, estado: ["a", "b", "c"][Number(r.id.slice(1)) % 3] }));
    const despues = cuentaPorTipo([...camposDeRegistros(cerrado).values()].map((c) => c.tipo));
    expect(antes.texto_repetido).toBe(1);
    expect(despues.texto_repetido).toBe(0);
    expect(despues.cerrado).toBe(antes.cerrado + 1);
  });

  it("un texto todo distinto y con espacios es único; todo distinto y sin ellos, un id", () => {
    expect(tipoDeCampo("n", ["uno dos", "tres cuatro"]).tipo).toBe("texto_unico");
    expect(tipoDeCampo("n", ["uno-dos", "tres-cuatro"]).tipo).toBe("identificador");
  });

  it("un campo sin ningún valor no tiene tipo (no cuenta)", () => {
    expect(tipoDeCampo("n", [null, undefined]).tipo).toBeNull();
  });

  it("los nueve tipos están definidos y en orden", () => {
    expect(ORDEN_TIPOS).toEqual(["cerrado", "booleano", "numero", "fecha", "lista", "identificador", "texto_unico", "texto_repetido", "objeto"]);
    for (const t of ORDEN_TIPOS) expect(TIPOS_CAMPO[t].length).toBeGreaterThan(8);
  });
});

describe("tipoDeColumna (base)", () => {
  it("clasifica por tipo SQL y por la clase de ops/columnas-texto.json", () => {
    const t = (sql, clase, medida) => tipoDeColumna({ sql: { tipo: sql }, clase, medida });
    expect(t("boolean")).toBe("booleano");
    expect(t("integer")).toBe("numero");
    expect(t("timestamp with time zone")).toBe("fecha");
    expect(t("uuid")).toBe("identificador");
    expect(t("jsonb")).toBe("objeto");
    expect(t("ARRAY")).toBe("lista");
    expect(t("text")).toBe("cerrado");
    expect(t("USER-DEFINED")).toBe("cerrado");
    expect(t("text", "identifier")).toBe("identificador");
    expect(t("text", "excluded")).toBe("excluido");
  });

  it("un texto libre se repite si la mitad de sus valores son copias; la clase gana al array", () => {
    const t = (medida, sql = "text") => tipoDeColumna({ sql: { tipo: sql }, clase: "free_text", medida });
    expect(t({ conValor: 35, distintos: 1 })).toBe("texto_repetido");
    expect(t({ conValor: 16, distintos: 10 })).toBe("texto_unico");
    expect(t({ conValor: 0, distintos: 0 })).toBe("texto_unico");
    expect(t({ conValor: 10, distintos: 2 }, "ARRAY")).toBe("texto_repetido");
  });
});

describe("lectores", () => {
  it("registrosDe sigue caminos con * y falla si el camino no existe", () => {
    const j = { a: { x: { tareas: [{ id: 1 }, { id: 2 }] }, y: { tareas: [{ id: 3 }] } }, t: { u: { k: 1 }, v: { k: 2 } } };
    expect(registrosDe(j, "a.*.tareas").map((r) => r.id)).toEqual([1, 2, 3]);
    expect(registrosDe(j, "t").map((r) => r.k)).toEqual([1, 2]);
    expect(() => registrosDe(j, "a.*.nada")).toThrow(/no existe/);
  });

  it("cabeceraMd sube las claves de un bloque sangrado y tipa true, números y listas", () => {
    const h = cabeceraMd("---\nname: x\ntools: Read, Grep\ntraspasa_a: [a, b]\nmetadata:\n  tipo: servicio\n  opera: true\n  n: 3\n---\ncuerpo\n");
    expect(h).toEqual({ name: "x", tools: "Read, Grep", traspasa_a: ["a", "b"], tipo: "servicio", opera: true, n: 3 });
    expect(cabeceraMd("sin cabecera")).toBeNull();
  });

  it("la suma y el texto de la cuenta salen con los nueve tipos y el total", () => {
    const s = sumaCuentas([cuentaPorTipo(["cerrado", "lista"]), cuentaPorTipo(["lista", "excluido"])]);
    expect(s.lista).toBe(2);
    expect(textoCuenta(s)).toMatch(/^cerrado=1 booleano=0 .* objeto=0 excluido=1 total=4$/);
  });
});

describe("npm run campos-por-entidad", () => {
  const corre = (...a) => spawnSync(process.execPath, [join(RAIZ, "scripts", "campos-por-entidad.mjs"), ...a], { encoding: "utf8", windowsHide: true });

  it("por defecto cuenta solo las horizontales, sin tocar la base, y lo dice", () => {
    const r = corre();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^campos_por_entidad: alcance=horizontal entidades_medidas=\d+ de=\d+ horizontal=\d+ vertical=\d+$/m);
    expect(r.stdout).toMatch(/^campos_por_entidad_nota: solo scope=horizontal;/m);
    expect(r.stdout).not.toMatch(/alcance=vertical/);
    expect(r.stdout).not.toMatch(/origen=base/);
    expect(r.stdout).toMatch(/^total_ficheros: cerrado=\d+ booleano=\d+ .* objeto=\d+ total=\d+$/m);
  });

  it("una entidad desconocida es un error", () => {
    const r = corre("--entidad", "no-existe");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/No existe la entidad no-existe/);
  });

  it("--entidad con una entidad vertical la cuenta (gana al alcance por defecto)", () => {
    const r = corre("--entidad", "ingredient");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^entidad_campos: entidad=ingredient alcance=vertical origen=ficheros /m);
  });
});

describe("textoFrecuencias", () => {
  it("un valor con «:» o «,» no rompe el reparto en pares valor:veces", () => {
    const t = textoFrecuencias([["a:b,c d=e", 3], ["x", 1]]);
    expect(t).toBe("a_b_c_d_e:3,x:1");
    expect(t.split(",").map((p) => p.split(":"))).toEqual([["a_b_c_d_e", "3"], ["x", "1"]]);
  });
});
