/**
 * ¿Acierta más el enrutador con los ejemplos de Pablo? Examen cruzado: los
 * ejemplos se parten en dos mitades; con una mitad en las REGLAS se examina la
 * otra, y al revés. Nunca se examina una frase que el modelo tenga de ejemplo.
 * Se compara con las REGLAS sin ejemplos.
 *
 *   node --env-file=.env.local scripts/router-ejemplos-examen.mjs
 *
 * Coste: ~115 frases × 2 configuraciones, llamadas cortas a Haiku (~15 céntimos).
 */

const { clasificar, REGLAS } = await import("../api/_bot/router.js");
const { EJEMPLOS, FRONTERA, textoDeEjemplos } = await import("../api/_bot/routerEjemplos.js");

const base = REGLAS.split("\n\nEJEMPLOS reales")[0];
const contexto = {
  ahora: "miércoles, 30 de septiembre de 2026, 18:45",
  personas: ["Pablo (37)", "Isa (36)", "Leo (6)", "Cova (1)"],
  grupos: ["Familia", "Bebé"],
  hayMenu: true,
};

const todas = [
  ...Object.entries(EJEMPLOS).flatMap(([modo, fs]) => fs.map((f) => ({ frase: f, modo }))),
  ...FRONTERA.map(([f, modo, porque]) => ({ frase: f, modo, porque, frontera: true })),
];
const mitad = (i) => i % 2;

function reglasSin(cuales) {
  const fuera = new Set(cuales.map((c) => c.frase));
  const ej = Object.fromEntries(Object.entries(EJEMPLOS).map(([m, fs]) => [m, fs.filter((f) => !fuera.has(f))]));
  const fr = FRONTERA.filter(([f]) => !fuera.has(f));
  return `${base}\n\n${textoDeEjemplos(ej, fr)}`;
}

const res = { sin: { bien: 0, mal: [] }, con: { bien: 0, mal: [] } };
for (const m of [0, 1]) {
  const examen = todas.filter((_, i) => mitad(i) === m);
  const conEjemplos = reglasSin(examen);
  for (const c of examen) {
    for (const [k, reglas] of [["sin", base], ["con", conEjemplos]]) {
      const d = await clasificar({ texto: c.frase, contexto }, { reglas });
      // Lo que importa es la RUTA: un modo de vía rápida mal elegido es error;
      // mandar a Lola algo que era de vía rápida es solo lento.
      if (d.modo === c.modo) res[k].bien++;
      else res[k].mal.push(`«${c.frase}» ${c.modo} → ${d.modo} ${d.confianza.toFixed(2)}`);
    }
  }
}
for (const k of ["sin", "con"]) {
  console.log(`\n${k === "sin" ? "SIN ejemplos" : "CON ejemplos (de la otra mitad)"}: ${res[k].bien}/${todas.length}`);
  for (const x of res[k].mal) console.log(`  ${x}`);
}
