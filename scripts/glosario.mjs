#!/usr/bin/env node
/**
 * npm run glosario                 → todos los términos con su definición y sus excepciones
 * npm run glosario -- <término>    → uno (o los que empiezan así), con sinónimos, ref y excepciones
 * npm run glosario -- --medir      → lo que hay hoy en el repo frente a ops/glosario-excepciones.json,
 *                                    con fichero y línea de cada sinónimo nuevo
 * npm run glosario -- --vocabularios [--escribir]
 *                                  → el ciclo de vida de los vocabularios de proceso (#481):
 *                                    lo anclado en ops/vocabularios-vida.json frente al código;
 *                                    con --escribir, ancla lo de hoy
 * npm run glosario -- --candidatos → la revisión periódica (#481): las palabras y pares de proceso
 *                                    que se repiten y no están en el glosario, una línea
 *                                    «candidato: x apariciones: n ficheros: k» por cada uno, para
 *                                    que un agente los juzgue (skill higiene-de-skills,
 *                                    referencias/glosario.md); --json, lo mismo en JSON
 *
 * Solo lee, salvo --vocabularios --escribir. El dato es ops/glosario.json (#469); lo vigila ops/glosario.test.js.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cifrasDeForma, comparar, excepcionesPorTermino, plano, excepcionesPorZona, ficherosDe, leerExcepciones, leerGlosario, medir, pares, textoTermino, total,
} from "./lib/glosario.mjs";
import { RUTA_JUICIOS, aJuzgar, candidatos, leerJuicios, lineaCandidato, pendientesDeJuicios, prosaDeZonas } from "./lib/glosarioCandidatos.mjs";
import { RUTA_VOCABULARIOS, anclar, leerRegistro, problemasDeRetiros, problemasLocales, valoresActuales } from "./lib/vocabulariosVida.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const g = leerGlosario(RAIZ);
const exc = leerExcepciones(RAIZ);
const args = process.argv.slice(2);

if (args.includes("--vocabularios")) {
  const actuales = valoresActuales();
  if (args.includes("--escribir")) {
    writeFileSync(join(RAIZ, RUTA_VOCABULARIOS), `${JSON.stringify(anclar(leerRegistro(RAIZ), actuales), null, 2)}\n`);
    console.log(`Anclado ${RUTA_VOCABULARIOS}. Si un valor desapareció del código, retíralo en «retirados» con su pasa_a.`);
  }
  const reg = leerRegistro(RAIZ);
  const problemas = [...problemasLocales(reg, actuales), ...problemasDeRetiros(reg, actuales)];
  const valores = Object.values(actuales).reduce((n, x) => n + x.length, 0);
  console.log(`vocabularios vigilados: ${Object.keys(actuales).length} valores: ${valores} retirados: ${(reg.retirados ?? []).length} problemas: ${problemas.length}`);
  for (const x of problemas) console.log(`  ${x}`);
  process.exit(problemas.length ? 1 : 0);
}

if (args.includes("--candidatos")) {
  const juicios = leerJuicios(RAIZ);
  const todos = candidatos(prosaDeZonas(RAIZ, g), g, { juicios });
  const lista = aJuzgar(todos);
  const { sinTermino, reglas } = pendientesDeJuicios(juicios, g);
  const n = (tipo) => todos.filter((c) => c.tipo === tipo).length;
  const { medida } = medir(RAIZ, g);
  const { bajadas } = comparar(medida, exc);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ candidatos: lista, total: { palabra: n("palabra"), par: n("par") }, juzgados: juicios.length, termino_nuevo_sin_termino: sinTermino, reglas_propuestas: reglas, excepciones: total(exc), excepciones_por_bajar: bajadas.length }, null, 2));
    process.exit(0);
  }
  console.log(`glosario candidatos palabras: ${n("palabra")} pares: ${n("par")} a_juzgar: ${lista.length} juzgados: ${juicios.length} termino_nuevo_sin_termino: ${sinTermino.length} reglas_propuestas: ${reglas.length} excepciones: ${total(exc)} excepciones_por_bajar: ${bajadas.length}`);
  for (const c of lista) console.log(lineaCandidato(c));
  for (const t of sinTermino) console.log(`termino_nuevo sin término en el glosario: ${t}`);
  for (const r of reglas) console.log(`regla propuesta: ${r.juicio_y_motivo} (${r.candidatos.length} juicios: ${r.candidatos.join(", ")})`);
  console.log(`Juicio de cada uno (termino_nuevo | sinonimo de X | nada) y su motivo, en ${RUTA_JUICIOS}. Método: .claude/skills/higiene-de-skills/referencias/glosario.md`);
  process.exit(0);
}

if (args.includes("--medir")) {
  const { medida, detalle } = medir(RAIZ, g);
  const { nuevas, bajadas } = comparar(medida, exc);
  console.log(`glosario medida: ${total(medida)} excepciones_admitidas: ${total(exc)} nuevas: ${nuevas.length} bajadas: ${bajadas.length}`);
  for (const n of nuevas) {
    const donde = detalle.filter((d) => d.ruta === n.ruta && d.sinonimo === n.sinonimo).map((d) => d.donde).join(", ");
    console.log(`  NUEVO ${n.ruta}: «${n.sinonimo}» ${n.hay} (admitidas ${n.admitidas}) → di «${detalle.find((d) => d.sinonimo === n.sinonimo)?.canonico}» (línea ${donde})`);
  }
  for (const b of bajadas) console.log(`  BAJA ${b.ruta}: «${b.sinonimo}» ${b.hay} de ${b.admitidas} → baja la cifra en ops/glosario-excepciones.json`);
  process.exit(nuevas.length ? 1 : 0);
}

const pedido = args.find((a) => !a.startsWith("--"));
const terminos = pedido ? g.terminos.filter((t) => plano(t.termino).startsWith(plano(pedido))) : g.terminos;
if (pedido && terminos.length === 0) {
  // ¿Es un sinónimo prohibido?
  const t = g.terminos.find((x) => x.sinonimos_prohibidos.some((s) => plano(s) === plano(pedido)));
  console.log(t ? `«${pedido}» no se dice: es «${t.termino}».\n\n${textoTermino(t, g, exc)}` : `No hay ningún término «${pedido}» en ops/glosario.json.`);
  process.exit(t ? 0 : 1);
}
for (const t of terminos) console.log(`${textoTermino(t, g, exc)}\n`);
if (!pedido) {
  const porZona = excepcionesPorZona(g, exc, { ficheros: (p) => ficherosDe(RAIZ, p) });
  const conExc = Object.entries(excepcionesPorTermino(g, exc)).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const sinonimos = g.terminos.reduce((a, t) => a + t.sinonimos_prohibidos.length, 0);
  const forma = cifrasDeForma(g);
  console.log(`glosario terminos: ${g.terminos.length} sinonimos_prohibidos: ${sinonimos} excepciones: ${total(exc)} pares: ${pares(exc)} con_relaciones: ${forma.con_relaciones} sin_forma: ${forma.sin_forma} excepciones_forma: ${forma.excepciones_forma}`);
  console.log(`  por término: ${conExc.map(([t, n]) => `${t} ${n}`).join(", ") || "ninguna"}`);
  console.log(`  por zona: ${Object.entries(porZona).map(([z, n]) => `${z} ${n}`).join(", ") || "ninguna"}`);
}
