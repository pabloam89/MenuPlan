import { describe, expect, it } from "vitest";
import { JUECES, MIN_POR_NORMA, PASADAS_SEGUIDAS, UMBRAL_MALOS, cifra, cumpleUmbralA, esFicheroDeJuez, faltasDeFichero, faltasDeHistoria, faltasDePasadas, hashDeCasos, juezDeRuta, leerFichero, leerPasadas, lineaDeCifra, medir, motivoFicheroSinNorma, motivoSinUmbral, normasSinPasada, promptCaso, registroDeMotivos, sinClaves, RUTA_ULTIMA_PASADA } from "./lib/testDelJuez.mjs";
import { leerRegistro, motivoTestDelJuezMalo } from "./lib/normas.mjs";
import { RAIZ } from "./lib/skills.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const registro = leerRegistro(RAIZ);
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
    const f = fichero([bueno, { ...bueno, id: "b2" }, malo, { ...malo, id: "m2" }]);
    expect(motivoFicheroSinNorma(f, bueno.norma)).toBeNull();
    // Un caso mínimo no vale (#698): ni 1+1, ni 3+1 (faltan malos), ni dos casos de cada tipo repartidos en otra norma.
    expect(motivoFicheroSinNorma(fichero([bueno, malo]), bueno.norma)).toMatch(/2 casos buenos y 2 malos .*(hay 1 y 1)/);
    expect(motivoFicheroSinNorma(fichero([bueno, { ...bueno, id: "b2" }, { ...bueno, id: "b3" }, malo]), bueno.norma)).toMatch(/hay 3 y 1/);
    expect(MIN_POR_NORMA).toBeGreaterThanOrEqual(4);
    expect(motivoFicheroSinNorma(fichero([bueno]), bueno.norma)).toMatch(/2 casos buenos y 2 malos .*(hay 1 y 0)/);
    expect(motivoFicheroSinNorma(f, "otra-norma")).toMatch(/hay 0 y 0/);
    const n = { ...deJuez[0], id: "test-visto-fallar", test_del_juez: "ops/test-del-juez/revisor.json" };
    expect(motivoTestDelJuezMalo(n, RAIZ)).toBeNull();
    expect(motivoTestDelJuezMalo({ ...n, id: "norma-sin-casos-zzz" }, RAIZ)).toMatch(/necesita al menos/);
  });

  it("cada norma que apunta tiene 4 o más casos suyos, con 2 o más de cada tipo (umbral A, #698)", () => {
    for (const n of apuntan) {
      const cs = leerFichero(juezDeRuta(n.test_del_juez), RAIZ).casos.filter((c) => c.norma === n.id);
      expect(cs.length, n.id).toBeGreaterThanOrEqual(MIN_POR_NORMA);
      expect(cs.filter((c) => c.tipo === "bueno").length, `${n.id} buenos`).toBeGreaterThanOrEqual(2);
      expect(cs.filter((c) => c.tipo === "malo").length, `${n.id} malos`).toBeGreaterThanOrEqual(2);
    }
  });

  it("el fichero de otro juez no vale como test de la norma, aunque tenga casos de ella", () => {
    const dir = mkdtempSync(join(tmpdir(), "juez-"));
    try {
      mkdirSync(join(dir, "ops/test-del-juez"), { recursive: true });
      const casos = ["b1", "b2"].map((id) => ({ ...bueno, id })).concat(["m1", "m2"].map((id) => ({ ...malo, id })));
      writeFileSync(join(dir, "ops/test-del-juez/qa.json"), JSON.stringify({ juez: "revisor", version: 1, casos }));
      const n = { ...deJuez[0], id: idsDeJuez[0], test_del_juez: "ops/test-del-juez/qa.json" };
      expect(motivoTestDelJuezMalo(n, dir)).toMatch(/fichero de qa pero dice ser de «revisor»/);
      writeFileSync(join(dir, "ops/test-del-juez/qa.json"), JSON.stringify({ juez: "qa", version: 1, casos }));
      expect(motivoTestDelJuezMalo(n, dir)).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("el test del juez: el umbral A y las pasadas de pago (#698)", () => {
  const buena = { juez: "revisor", fecha: "2026-10-14", casos: 24, buenos: 12, buenos_ok: 12, malos: 12, malos_ok: 10, sin_correr: 0, coste_usd: 0.2, casos_hash: "abcdef012345" };

  it("el umbral es el que decidió Pablo: 80 % de los malos, todos los buenos, dos pasadas seguidas", () => {
    expect([UMBRAL_MALOS, PASADAS_SEGUIDAS]).toEqual([0.8, 2]);
  });

  it("una pasada cumple con todos los buenos y 80 % de los malos; con datos rotos, no (visto fallar)", () => {
    expect(cumpleUmbralA(buena)).toBe(true);
    expect(cumpleUmbralA({ ...buena, malos_ok: 9 })).toBe(false); // 75 %
    expect(cumpleUmbralA({ ...buena, buenos_ok: 11 })).toBe(false); // un bueno señalado de más
    expect(cumpleUmbralA({ ...buena, sin_correr: 1 })).toBe(false); // se paró por el tope
    expect(cumpleUmbralA({ ...buena, malos: 0, malos_ok: 0 })).toBe(false); // sin malos no mide nada
    expect(cumpleUmbralA({ ...buena, buenos: 0, buenos_ok: 0 })).toBe(false);
    expect(cumpleUmbralA({ ...buena, malos_ok: "10" })).toBe(false);
    expect(cumpleUmbralA({ ...buena, malos_ok: undefined })).toBe(false);
    expect(cumpleUmbralA(null)).toBe(false);
  });

  it("el juez solo cumple con dos pasadas seguidas buenas y sobre los casos de hoy", () => {
    const sinUmbral = (j, ps, n, h = buena.casos_hash) => motivoSinUmbral(j, ps, n, h);
    const mala = { ...buena, malos_ok: 5 };
    expect(sinUmbral("revisor", [], 24)).toMatch(/ninguna pasada de pago registrada/);
    expect(sinUmbral("revisor", [buena], 24)).toMatch(/solo 1 pasada/);
    expect(sinUmbral("revisor", [buena, buena], 24)).toBeNull();
    expect(sinUmbral("revisor", [mala, buena], 24)).toMatch(/no cumplen el umbral/);
    expect(sinUmbral("revisor", [buena, mala, buena], 24)).toMatch(/no cumplen el umbral/); // no son seguidas
    expect(sinUmbral("revisor", [mala, buena, buena], 24)).toBeNull(); // una mala vieja no cuenta
    expect(sinUmbral("revisor", [buena, buena], 30)).toMatch(/otros casos/); // se ampliaron: hay que volver a medir
    expect(sinUmbral("qa", [buena, buena], 24)).toMatch(/ninguna pasada de pago registrada de qa/); // las de otro juez no valen
    // Editar un caso sin cambiar cuántos hay invalida las pasadas (M2): el hash de los casos cambia.
    expect(sinUmbral("revisor", [buena, buena], 24, "ffffffffffff")).toMatch(/versión anterior de sus casos/);
    expect(sinUmbral("revisor", [{ ...buena, casos_hash: undefined }, { ...buena, casos_hash: undefined }], 24)).toMatch(/versión anterior/);
  });

  it("el registro de pasadas tiene forma", () => {
    expect(faltasDePasadas(leerPasadas(RAIZ))).toEqual([]);
    expect(faltasDePasadas(null).join()).toMatch(/lista/);
    expect(faltasDePasadas({ pasadas: [{ ...buena, fecha: "ayer" }] }).join()).toMatch(/fecha/);
    expect(faltasDePasadas({ pasadas: [{ ...buena, juez: "otro" }] }).join()).toMatch(/juez/);
    expect(faltasDePasadas({ pasadas: [{ ...buena, coste_usd: undefined }] }).join()).toMatch(/coste_usd/);
    expect(faltasDePasadas({ pasadas: [{ ...buena, buenos: 1.5 }] }).join()).toMatch(/buenos/);
  });

  it("un registro forjado o incoherente falla (M1, visto fallar)", () => {
    const f = (...ps) => faltasDePasadas({ pasadas: ps }).join(" | ");
    expect(f({ ...buena }, { ...buena, fecha: "2026-10-15" })).toBe("");
    // El forjado del revisor: casos 24, coste 0, repetido dos veces.
    const forjada = { juez: "revisor", fecha: "2026-10-14", casos: 24, buenos: 12, buenos_ok: 12, malos: 12, malos_ok: 12, sin_correr: 0, coste_usd: 0, casos_hash: "abcdef012345" };
    expect(f(forjada, forjada)).toMatch(/coste_usd/);
    expect(f(forjada, forjada)).toMatch(/idéntica/);
    expect(f({ ...buena }, { ...buena })).toMatch(/idéntica a pasadas\[0\]/);
    expect(f({ ...buena, casos: 25 })).toMatch(/no es buenos \+ malos/);
    expect(f({ ...buena, buenos_ok: 13 })).toMatch(/buenos_ok .* pasa de buenos/);
    expect(f({ ...buena, malos_ok: 13 })).toMatch(/malos_ok .* pasa de malos/);
    expect(f({ ...buena, coste_usd: -1 })).toMatch(/coste_usd/);
    expect(f({ ...buena, casos_hash: undefined })).toMatch(/casos_hash/);
  });

  it("el registro solo crece por el final (M1): lo subido a staging no se edita ni se borra", () => {
    const [a, b] = [{ ...buena }, { ...buena, fecha: "2026-10-15" }];
    expect(faltasDeHistoria({ pasadas: [a] }, { pasadas: [a, b] })).toEqual([]);
    expect(faltasDeHistoria({ pasadas: [] }, { pasadas: [a] })).toEqual([]);
    expect(faltasDeHistoria({ pasadas: [a, b] }, { pasadas: [a] }).join()).toMatch(/solo se puede añadir al final/);
    expect(faltasDeHistoria({ pasadas: [a] }, { pasadas: [{ ...a, malos_ok: 12 }, b] }).join()).toMatch(/pasadas\[0\]: distinta/);
    expect(faltasDeHistoria({ pasadas: [a, b] }, { pasadas: [b, a] }).join()).toMatch(/distinta/);
  });

  it("el registro de este PR continúa el de origin/staging (si la referencia existe)", () => {
    let previo;
    try { previo = JSON.parse(execFileSync("git", ["show", "origin/staging:ops/test-del-juez/pasadas.json"], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { return; }
    expect(faltasDeHistoria(previo, leerPasadas(RAIZ))).toEqual([]);
  });

  it("una norma no cuenta como comprobada hasta que su juez tenga las pasadas registradas; el techo solo baja", () => {
    const sin = normasSinPasada(registro.normas, RAIZ);
    const techo = JSON.parse(readFileSync(join(RAIZ, "ops/normas-techos.json"), "utf8")).juez_sin_pasada_de_pago;
    expect(sin.length, "Un juez con casos nuevos y sin pasada de pago aumenta la lista: que otra sesión lance `npm run test-del-juez -- <juez> --si`").toBeLessThanOrEqual(techo);
    // Con pasadas que cumplen sobre los casos de hoy, el revisor deja de estar en la lista (recorrido entero con un directorio de mentira).
    const dir = mkdtempSync(join(tmpdir(), "juez-"));
    try {
      mkdirSync(join(dir, "ops/test-del-juez"), { recursive: true });
      const real = leerFichero("revisor", RAIZ);
      writeFileSync(join(dir, "ops/test-del-juez/revisor.json"), JSON.stringify(real));
      const n = deJuez.filter((x) => x.test_del_juez === "ops/test-del-juez/revisor.json");
      expect(normasSinPasada(n, dir).length).toBe(n.length);
      const p = { ...buena, casos: real.casos.length, casos_hash: hashDeCasos("revisor", dir) };
      writeFileSync(join(dir, "ops/test-del-juez/pasadas.json"), JSON.stringify({ pasadas: [p, p] }));
      expect(normasSinPasada(n, dir)).toEqual([]);
      writeFileSync(join(dir, "ops/test-del-juez/pasadas.json"), JSON.stringify({ pasadas: [p, { ...p, malos_ok: 3 }] }));
      expect(normasSinPasada(n, dir).length).toBe(n.length);
      // Editar un caso (mismo número de casos) invalida las pasadas anteriores (M2).
      writeFileSync(join(dir, "ops/test-del-juez/pasadas.json"), JSON.stringify({ pasadas: [p, p] }));
      real.casos[0].diff += " ";
      writeFileSync(join(dir, "ops/test-del-juez/revisor.json"), JSON.stringify(real));
      expect(normasSinPasada(n, dir).length).toBe(n.length);
    } finally { rmSync(dir, { recursive: true, force: true }); }
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

  it("si el corrector se queda sin tope tras señalar, el caso queda sin correr y la medida sigue (hallazgo del revisor, #697)", async () => {
    const perfecto = (c) => (c.tipo === "bueno" ? { veredicto: "aprueba" } : { veredicto: "senala", hallazgos: ["ok"] });
    const filas = await medir(casos, { juzgar: async (c) => perfecto(c), corregir: async () => { throw new Error("tope: sin cupo"); } });
    expect(cifra(filas)).toMatchObject({ aciertos: 2, total: 2, sin_correr: 2, acierto: 1 });
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

describe("los motivos del juez por caso (#698)", () => {
  const casos = [{ ...bueno, id: "b1" }, { ...malo, id: "m1" }];
  const CLAVE = "sk-ant-api03-SECRETO1234567890";

  it("la fila de cada caso guarda el veredicto, los hallazgos y la respuesta del juez", async () => {
    const filas = await medir(casos, {
      juzgar: async () => ({ veredicto: "senala", hallazgos: ["falta el plan B"], texto: '{"veredicto":"senala"}' }),
      corregir: async () => true,
    });
    expect(filas[0]).toMatchObject({ id: "b1", estado: "falla", veredicto: "senala", hallazgos: ["falta el plan B"], respuesta: '{"veredicto":"senala"}' });
  });

  it("el registro nunca lleva la clave, ni la dada ni la que tiene forma de clave", () => {
    const filas = [{ id: "b1", norma: "n", tipo: "bueno", estado: "falla", veredicto: "senala", hallazgos: [`usa ${CLAVE} aquí`, "otra sk-ant-zzzzzzzzzzzz"], respuesta: `eco ${CLAVE}`, motivo: "tope" }];
    const texto = JSON.stringify(registroDeMotivos("revisor", "2026-10-14", filas, [CLAVE, "claveliteral123"]));
    expect(texto).not.toContain("SECRETO1234567890");
    expect(texto).not.toMatch(/sk-ant-/);
    expect(sinClaves("x claveliteral123 y", ["claveliteral123"])).toBe("x [clave] y");
    expect(JSON.parse(texto).casos[0]).toMatchObject({ id: "b1", veredicto: "senala", motivo: "tope" });
  });

  it("el fichero de la última pasada lo ignora git y el script lo escribe sin pasar la clave", () => {
    expect(execFileSync("git", ["check-ignore", RUTA_ULTIMA_PASADA], { cwd: RAIZ }).toString().trim()).toBe(RUTA_ULTIMA_PASADA);
    const src = readFileSync(join(RAIZ, "scripts/test-del-juez.mjs"), "utf8");
    expect(src).toMatch(/registroDeMotivos([^)]*[API_KEY])/);
  });
});
