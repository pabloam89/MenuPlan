import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JUECES, cifra, esFicheroDeJuez, faltasDeFichero, leerFichero, lineaDeCifra, medir, motivoFicheroSinNorma, promptCaso } from "./lib/testDelJuez.mjs";
import { motivoTestDelJuezMalo } from "./lib/normas.mjs";
import { RAIZ } from "./lib/skills.mjs";

const registro = JSON.parse(readFileSync(join(RAIZ, "ops/normas.json"), "utf8"));
const deJuez = registro.normas.filter((n) => n.control_procesador === "juez");
const idsDeJuez = deJuez.map((n) => n.id);

const bueno = { id: "b", norma: idsDeJuez[0], tipo: "bueno", titulo: "t", diff: "+x", origen: "o", marcado_por: "sesion" };
const malo = { id: "m", norma: idsDeJuez[0], tipo: "malo", titulo: "t", diff: "+y", origen: "o", marcado_por: "sesion", debe_senalar: "algo" };
const fichero = (casos, juez = "revisor") => ({ juez, version: 1, casos });

describe("el test del juez: la forma de los casos", () => {
  it("el fichero del revisor vale y cada caso ejercita una norma de juez del registro", () => {
    const f = leerFichero("revisor", RAIZ);
    expect(faltasDeFichero(f, "revisor", idsDeJuez)).toEqual([]);
    expect(f.casos.filter((c) => c.tipo === "bueno").length).toBe(f.casos.filter((c) => c.tipo === "malo").length);
  });

  it("niega cada defecto de forma (visto fallar sin cada regla)", () => {
    const j = (casos) => faltasDeFichero(fichero(casos), "revisor", idsDeJuez).join(" | ");
    expect(j([bueno, malo])).toBe("");
    expect(j([bueno, { ...bueno }])).toMatch(/id repetido/);
    expect(j([{ ...bueno, norma: "norma-que-no-existe" }])).toMatch(/no es una norma de juez/);
    expect(j([{ ...bueno, tipo: "regular" }])).toMatch(/tipo/);
    expect(j([{ ...bueno, diff: "" }])).toMatch(/falta «diff»/);
    expect(j([{ ...bueno, diff: "x".repeat(2000) }])).toMatch(/pasa de/);
    expect(j([{ ...malo, debe_senalar: undefined }])).toMatch(/qué debe señalar/);
    expect(j([{ ...bueno, debe_senalar: "algo" }])).toMatch(/no lleva «debe_senalar»/);
    expect(j([{ ...bueno, marcado_por: "revisor" }])).toMatch(/no se califica a sí mismo/);
    expect(faltasDeFichero(fichero([]), "revisor", idsDeJuez).join()).toMatch(/sin casos/);
    expect(faltasDeFichero(fichero([bueno], "qa"), "revisor", idsDeJuez).join()).toMatch(/«juez» dice/);
  });

  it("los jueces del vocabulario son los de la casa", () => {
    expect(JUECES).toEqual(["revisor", "qa", "evaluador", "seguridad", "auditor-datos"]);
    expect(esFicheroDeJuez("ops/test-del-juez/revisor.json")).toBe(true);
    expect(esFicheroDeJuez("ops/test-del-juez/otro.json")).toBe(false);
    expect(esFicheroDeJuez("package.json")).toBe(false);
  });
});

describe("el test del juez: la norma apunta a su fichero y el fichero tiene casos de ella", () => {
  const apuntan = deJuez.filter((n) => esFicheroDeJuez(String(n.test_del_juez)));

  it("hay normas que apuntan y todas tienen casos buenos y malos suyos", () => {
    expect(apuntan.length).toBeGreaterThan(0);
    for (const n of apuntan) expect(motivoTestDelJuezMalo(n, RAIZ), n.id).toBeNull();
  });

  it("todo caso del fichero es de una norma que apunta a ese fichero", () => {
    for (const juez of JUECES) {
      const f = leerFichero(juez, RAIZ);
      if (!f) continue;
      for (const c of f.casos) {
        const n = registro.normas.find((x) => x.id === c.norma);
        expect(n.test_del_juez, `${juez}/${c.id}: la norma ${c.norma} no apunta a su fichero`).toBe(`ops/test-del-juez/${juez}.json`);
      }
    }
  });

  it("una norma sin casos buenos y malos suyos no cuenta, aunque el fichero exista", () => {
    const f = fichero([bueno, malo]);
    expect(motivoFicheroSinNorma(f, bueno.norma)).toBeNull();
    expect(motivoFicheroSinNorma(fichero([bueno]), bueno.norma)).toMatch(/1 caso bueno y 1 malo .*(hay 1 y 0)/);
    expect(motivoFicheroSinNorma(f, "otra-norma")).toMatch(/hay 0 y 0/);
    const n = { ...deJuez[0], id: "test-visto-fallar", test_del_juez: "ops/test-del-juez/revisor.json" };
    expect(motivoTestDelJuezMalo(n, RAIZ)).toBeNull();
    expect(motivoTestDelJuezMalo({ ...n, id: "norma-sin-casos-zzz" }, RAIZ)).toMatch(/necesita al menos/);
  });
});

describe("el test del juez: la cifra de acierto (con un juez de mentira)", () => {
  const casos = [
    { ...bueno, id: "b1" }, { ...bueno, id: "b2" },
    { ...malo, id: "m1" }, { ...malo, id: "m2" },
  ];

  it("un juez que aprueba todo acierta los buenos y falla los malos", async () => {
    const filas = await medir(casos, { juzgar: async () => ({ veredicto: "aprueba" }), corregir: async () => true });
    const c = cifra(filas);
    expect(c).toMatchObject({ aciertos: 2, total: 4, buenos_ok: 2, buenos: 2, malos_ok: 0, malos: 2, acierto: 0.5 });
  });

  it("un juez que señala todo acierta los malos solo si dice lo esperado", async () => {
    const filas = await medir(casos, {
      juzgar: async () => ({ veredicto: "senala", hallazgos: ["x"] }),
      corregir: async (c) => c.id === "m1",
    });
    expect(cifra(filas)).toMatchObject({ aciertos: 1, total: 4, buenos_ok: 0, malos_ok: 1, acierto: 0.25 });
  });

  it("un juez perfecto da 1; lo que no corre no cuenta como acierto ni como fallo", async () => {
    const perfecto = (c) => (c.tipo === "bueno" ? { veredicto: "aprueba" } : { veredicto: "senala", hallazgos: ["ok"] });
    expect(cifra(await medir(casos, { juzgar: async (c) => perfecto(c), corregir: async () => true })).acierto).toBe(1);
    const filas = await medir(casos, { juzgar: async (c) => { if (c.id === "m2") throw new Error("tope"); return perfecto(c); }, corregir: async () => true });
    const c = cifra(filas);
    expect(c).toMatchObject({ aciertos: 3, total: 3, sin_correr: 1, acierto: 1 });
    expect(lineaDeCifra("revisor", c)).toBe("test-del-juez juez: revisor aciertos: 3/3 buenos: 2/2 malos: 1/1 sin_correr: 1 acierto: 1");
  });

  it("un veredicto ilegible es un fallo, no un acierto", async () => {
    const filas = await medir(casos, { juzgar: async () => ({ veredicto: "quizá" }), corregir: async () => true });
    expect(cifra(filas).aciertos).toBe(0);
  });

  it("el juez no ve el tipo del caso en lo que se le pregunta", () => {
    const t = promptCaso({ ...malo, debe_senalar: "pista-secreta-zzz" }, { nombre: "N", sujeto: "codigo", fuerza: "no_debe", exigencia: "hacer algo" });
    expect(t).not.toMatch(/malo|bueno|debe_senalar|algo\b.*esperado/);
    expect(t).toContain("<diff>");
  });
});
